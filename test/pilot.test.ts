import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import 'reflect-metadata';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ChannelType,
  Client,
  Collection,
  Guild,
  Interaction,
  PermissionFlagsBits,
} from 'discord.js';
import {
  PilotConfig,
  readPilotConfig,
  TEST_GUILD_ID,
} from '../src/config/pilot.config';
import { DiscordGateway } from '../src/discord/discord.gateway';
import { DiscordSetupService } from '../src/discord/handlers/discord-setup.service';
import { CoreApiClient, CoreApiError } from '../src/core/core-api.client';
import { pilotCommands } from '../src/discord/command-definitions';

const env = {
  DISCORD_GUILD_ID: TEST_GUILD_ID,
  DISCORD_ALLOWED_GUILD_IDS: TEST_GUILD_ID,
  DISCORD_COMMAND_SCOPE: 'guild',
  DISCORD_CLIENT_ID: '1494925337811751999',
  DISCORD_BOT_TOKEN: 'fixture-only',
  CORE_API_URL: 'http://127.0.0.1:3000',
  CORE_WEB_URL: 'http://localhost:5173',
};
function config(directory = '.discord'): PilotConfig {
  return Object.assign(Object.create(PilotConfig.prototype), {
    value: readPilotConfig({ ...env, DISCORD_STATE_DIRECTORY: directory }),
  });
}

test('pilot config fails closed for missing allowlist, other guilds, global commands and unsafe endpoints', () => {
  assert.equal(config().allowsGuild(TEST_GUILD_ID), true);
  for (const changes of [
    { DISCORD_ALLOWED_GUILD_IDS: '' },
    { DISCORD_ALLOWED_GUILD_IDS: `${TEST_GUILD_ID},123` },
    { DISCORD_GUILD_ID: '123' },
    { DISCORD_COMMAND_SCOPE: 'global' },
    { CORE_API_URL: 'http://production.example.com' },
    { CORE_API_URL: 'https://user:secret@example.com' },
    { CORE_REQUEST_TIMEOUT_MS: 'NaN' },
    { CORE_WEB_URL: 'invalid' },
  ])
    assert.throws(() => readPilotConfig({ ...env, ...changes }));
  assert.equal(config().allowsGuild(null), false);
});

test('pilot command catalog excludes legacy reward writers and restricts setup to admins', () => {
  const commands = pilotCommands();
  assert.deepEqual(
    commands.map((c) => c.name),
    ['ping', 'status', 'setup-server'],
  );
  assert.equal(
    commands[2].default_member_permissions,
    PermissionFlagsBits.Administrator.toString(),
  );
});

function interaction(guildId: string | null, commandName = 'ping') {
  const calls: string[] = [];
  const value = {
    id: 'request-1',
    guildId,
    commandName,
    deferred: false,
    replied: false,
    isRepliable: () => true,
    isChatInputCommand: () => true,
    reply: mock.fn(async () => {
      calls.push('reply');
      value.replied = true;
    }),
    deferReply: mock.fn(async () => {
      calls.push('defer');
      value.deferred = true;
    }),
    editReply: mock.fn(async () => {
      calls.push('edit');
    }),
    followUp: mock.fn(async () => {}),
  };
  return { value, calls, asInteraction: value as unknown as Interaction };
}

test('foreign guild and DM interactions cannot reach setup or Core', async () => {
  const setup = { handleSetupServer: mock.fn(async () => {}) };
  const core = { isHealthy: mock.fn(async () => true) };
  const gateway = new DiscordGateway(
    {} as Client,
    config(),
    setup as unknown as DiscordSetupService,
    core as unknown as CoreApiClient,
  );
  for (const id of [null, 'another-guild']) {
    const input = interaction(id, 'setup-server');
    await gateway.handleInteraction(input.asInteraction);
    assert.equal(input.value.reply.mock.callCount(), 1);
  }
  assert.equal(setup.handleSetupServer.mock.callCount(), 0);
  assert.equal(core.isHealthy.mock.callCount(), 0);
});

test('slow Core operations acknowledge first; failures can still produce a private reply', async () => {
  const input = interaction(TEST_GUILD_ID, 'status');
  const core = {
    isHealthy: async () => {
      assert.deepEqual(input.calls, ['defer']);
      throw new Error('secret-token');
    },
  };
  const gateway = new DiscordGateway(
    {} as Client,
    config(),
    {} as DiscordSetupService,
    core as unknown as CoreApiClient,
  );
  await gateway.handleInteraction(input.asInteraction);
  assert.deepEqual(input.calls, ['defer', 'edit']);
});

test('ordinary startup registers no commands, performs no setup and destroys gateway on shutdown', async () => {
  const client = Object.assign(new EventEmitter(), {
    rest: {
      setToken: mock.fn(),
      get: mock.fn(async (path: string) =>
        path === '/users/%40me'
          ? { id: env.DISCORD_CLIENT_ID, bot: true }
          : [{ id: TEST_GUILD_ID }],
      ),
      put: mock.fn(),
    },
    login: mock.fn(async () => {}),
    destroy: mock.fn(async () => {}),
  });
  const setup = { apply: mock.fn(), preview: mock.fn() };
  const gateway = new DiscordGateway(
    client as unknown as Client,
    config(),
    setup as unknown as DiscordSetupService,
    {} as CoreApiClient,
  );
  await gateway.onModuleInit();
  assert.equal(client.login.mock.callCount(), 1);
  assert.equal(client.rest.put.mock.callCount(), 0);
  assert.equal(setup.apply.mock.callCount(), 0);
  await gateway.onApplicationShutdown();
  assert.equal(client.destroy.mock.callCount(), 1);
});

test('application identity mismatch never logs in', async () => {
  const client = Object.assign(new EventEmitter(), {
    rest: { setToken() {}, get: async () => ({ id: 'wrong', bot: true }) },
    login: mock.fn(),
    destroy: mock.fn(async () => {}),
  });
  const gateway = new DiscordGateway(
    client as unknown as Client,
    config(),
    {} as DiscordSetupService,
    {} as CoreApiClient,
  );
  await assert.rejects(gateway.onModuleInit(), /verify application identity/);
  assert.equal(client.login.mock.callCount(), 0);
});

function fakeGuild() {
  let next = 1494925337811752000n;
  const channels = new Collection<string, any>();
  const roles = new Collection<string, any>();
  const me = { id: env.DISCORD_CLIENT_ID, permissions: { has: () => true } };
  const guild = {
    id: TEST_GUILD_ID,
    client: { user: { id: env.DISCORD_CLIENT_ID } },
    members: { fetchMe: async () => me },
    roles: {
      fetch: async () => roles,
      create: mock.fn(async (data: any) => {
        const role = { ...data, id: String(next++) };
        roles.set(role.id, role);
        return role;
      }),
    },
    channels: {
      fetch: async () => channels,
      create: mock.fn(async (data: any) => {
        const channel = {
          ...data,
          id: String(next++),
          permissionsFor: () => ({ has: () => true }),
          permissionOverwrites: {
            cache: new Collection(
              data.permissionOverwrites.map((o: any) => [
                o.id,
                {
                  ...o,
                  deny: { has: (p: bigint) => (o.deny ?? []).includes(p) },
                  allow: { has: (p: bigint) => (o.allow ?? []).includes(p) },
                },
              ]),
            ),
          },
        };
        channels.set(channel.id, channel);
        return channel;
      }),
    },
  };
  return { guild: guild as unknown as Guild, raw: guild, channels, roles };
}

test('setup previews without writes, persists IDs, protects moderator review and is idempotent across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'discord-pilot-test-'));
  try {
    const { guild, raw, channels } = fakeGuild();
    const setup = new DiscordSetupService(config(dir));
    assert.equal((await setup.preview(guild)).length, 6);
    assert.equal(raw.channels.create.mock.callCount(), 0);
    await setup.apply(guild);
    assert.equal(raw.roles.create.mock.callCount(), 1);
    assert.equal(raw.channels.create.mock.callCount(), 5);
    const state = JSON.parse(
      await readFile(join(dir, `${TEST_GUILD_ID}.json`), 'utf8'),
    );
    const review = channels.get(state.channels.moderatorReview);
    assert.equal(
      review.permissionOverwrites.cache
        .get(TEST_GUILD_ID)
        .deny.has(PermissionFlagsBits.ViewChannel),
      true,
    );
    await new DiscordSetupService(config(dir)).apply(guild);
    assert.equal(raw.channels.create.mock.callCount(), 5);
    assert.equal(raw.roles.create.mock.callCount(), 1);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('setup refuses an unrelated same-name channel, wrong guild and public moderator channel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'discord-pilot-test-'));
  try {
    const { guild, channels, raw } = fakeGuild();
    const setup = new DiscordSetupService(config(dir));
    channels.set('existing', {
      id: 'existing',
      name: 'onboarding',
      type: ChannelType.GuildText,
      topic: null,
    });
    await assert.rejects(setup.apply(guild), /explicit channel ID/);
    assert.equal(raw.roles.create.mock.callCount(), 0);
    await assert.rejects(setup.apply({ id: 'wrong' } as Guild), /outside/);
    channels.clear();
    await setup.apply(guild);
    const state = JSON.parse(
      await readFile(join(dir, `${TEST_GUILD_ID}.json`), 'utf8'),
    );
    channels
      .get(state.channels.moderatorReview)
      .permissionOverwrites.cache.clear();
    await assert.rejects(setup.preview(guild), /not restricted/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('setup requires admin and defers before guild API access', async () => {
  const input = interaction(TEST_GUILD_ID, 'setup-server');
  Object.assign(input.value, { memberPermissions: { has: () => false } });
  await new DiscordSetupService(config()).handleSetupServer(input.value as any);
  assert.deepEqual(input.calls, ['reply']);
});

test('Core client enforces bounded reads, no redirects or writes and redacts failures', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = mock.fn(async (_url: any, init: any) => {
      assert.ok(init.signal);
      assert.equal(init.redirect, 'error');
      assert.equal(init.method, undefined);
      assert.equal(init.headers['x-request-id'], 'test-request');
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }) as typeof fetch;
    const core = new CoreApiClient(config());
    assert.equal(await core.isHealthy('test-request'), true);
    await assert.rejects(
      core.get('https://outside.example', (x) => x, 'test-request'),
    );
    globalThis.fetch = async () => {
      throw new Error('secret upstream response');
    };
    await assert.rejects(
      core.get('/health', (x) => x, 'test-request'),
      (error: CoreApiError) =>
        error.kind === 'unavailable' && !error.message.includes('secret'),
    );
    globalThis.fetch = async () => new Response('oops', { status: 200 });
    assert.equal(await core.isHealthy('test-request'), false);
  } finally {
    globalThis.fetch = original;
  }
});

test('shared production/test bot is rejected before opening the gateway', async () => {
  const client = Object.assign(new EventEmitter(), {
    rest: {
      setToken() {},
      get: async (path: string) =>
        path === '/users/%40me'
          ? { id: env.DISCORD_CLIENT_ID, bot: true }
          : [{ id: TEST_GUILD_ID }, { id: 'production' }],
    },
    login: mock.fn(),
    destroy: mock.fn(async () => {}),
  });
  const gateway = new DiscordGateway(
    client as unknown as Client,
    config(),
    {} as DiscordSetupService,
    {} as CoreApiClient,
  );
  await assert.rejects(gateway.onModuleInit(), /test-only guild membership/);
  assert.equal(client.login.mock.callCount(), 0);
  assert.equal(client.destroy.mock.callCount(), 1);
});

test('complete Nest pilot boots without Prisma and exposes gateway/Core readiness', async () => {
  let coreHealthy = false;
  const client = Object.assign(new EventEmitter(), {
    rest: {
      setToken() {},
      get: async (path: string) =>
        path === '/users/%40me'
          ? { id: env.DISCORD_CLIENT_ID, bot: true }
          : [{ id: TEST_GUILD_ID }],
    },
    login: async () => {},
    destroy: async () => {},
    isReady: () => true,
    guilds: { cache: new Map([[TEST_GUILD_ID, {}]]) },
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PilotConfig)
    .useValue(config())
    .overrideProvider('DISCORD_CLIENT')
    .useValue(client)
    .overrideProvider(CoreApiClient)
    .useValue({ isHealthy: async () => coreHealthy })
    .compile();
  const app = module.createNestApplication();
  app.useLogger(false);
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await fetch(`${url}/health/ready`)).status, 503);
    coreHealthy = true;
    assert.equal((await fetch(`${url}/health/ready`)).status, 200);
    client.guilds.cache.clear();
    assert.equal((await fetch(`${url}/health/ready`)).status, 503);
  } finally {
    await app.close();
  }
});
