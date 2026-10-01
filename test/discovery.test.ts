import 'reflect-metadata';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ButtonInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  Collection,
} from 'discord.js';
import {
  PilotConfig,
  readPilotConfig,
  TEST_GUILD_ID,
} from '../src/config/pilot.config';
import { CoreApiClient } from '../src/core/core-api.client';
import {
  makeComponentId,
  PilotComponentRouter,
} from '../src/discord/component-router';
import {
  DiscoveryService,
  issueExcerpt,
  parseIssueUrl,
} from '../src/discord/discovery.service';
import { DiscordSetupService } from '../src/discord/handlers/discord-setup.service';

const bounty = {
  id: 26,
  repoOwner: 'p2arthur',
  repoName: 'team-agent-bond',
  issueNumber: 2,
  issueTitle: 'Fix issue',
  issueDescription: 'Useful context',
  amount: 5_000_000,
  status: 'OPEN',
};
const issue = {
  owner: 'p2arthur',
  repo: 'team-agent-bond',
  number: 2,
  title: 'Fix issue',
  body: 'Useful context',
  state: 'open',
};
function config(directory: string): PilotConfig {
  return Object.assign(Object.create(PilotConfig.prototype) as PilotConfig, {
    value: readPilotConfig({
      DISCORD_GUILD_ID: TEST_GUILD_ID,
      DISCORD_ALLOWED_GUILD_IDS: TEST_GUILD_ID,
      DISCORD_COMMAND_SCOPE: 'guild',
      DISCORD_CLIENT_ID: '1494925337811751999',
      DISCORD_BOT_TOKEN: 'fixture-only',
      DISCORD_SERVICE_KEY: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
      CORE_API_URL: 'http://localhost:3012',
      CORE_WEB_URL: 'http://localhost:5173',
      DISCORD_STATE_DIRECTORY: directory,
    }),
  });
}
function fakeInteraction(options: Record<string, string> = {}) {
  const value = {
    id: 'request-1',
    guildId: TEST_GUILD_ID,
    options: {
      getString: (key: string) => options[key] ?? null,
      getInteger: (key: string) => (options[key] ? Number(options[key]) : null),
    },
    deferReply: mock.fn(() => Promise.resolve()),
    editReply: mock.fn((value: unknown) => {
      void value;
      return Promise.resolve();
    }),
    followUp: mock.fn((value: unknown) => {
      void value;
      return Promise.resolve();
    }),
  };
  return value;
}

void test('GitHub issue URL parsing rejects lookalike hosts, PRs, query strings and malformed references', () => {
  assert.deepEqual(
    parseIssueUrl('https://github.com/p2arthur/team-agent-bond/issues/2'),
    { owner: 'p2arthur', repo: 'team-agent-bond', number: 2 },
  );
  for (const url of [
    'https://github.com.evil.test/p2arthur/repo/issues/2',
    'http://github.com/p2arthur/repo/issues/2',
    'https://github.com/p2arthur/repo/pull/2',
    'https://github.com/p2arthur/repo/issues/2?token=x',
    'https://github.com/p2arthur/repo/issues/0',
  ])
    assert.equal(parseIssueUrl(url), null);
});

void test('bounty cards keep GitHub Markdown compact and pair each mascot card with its actions', async () => {
  const records = [
    bounty,
    { ...bounty, id: 25, issueNumber: 462 },
    { ...bounty, id: 24, issueNumber: 695 },
  ];
  const noisyBody =
    '## Action required from ARC authors - Advisory online finding: [asset](https://testnet.explorer.example/asset/740315456/) **Urgent**\n```shell\nvery long code\n```';
  const core = {
    getQuery: (
      _path: string,
      _query: unknown,
      parse: (body: unknown) => unknown,
    ) => Promise.resolve(parse({ data: records, total: 22 })),
    get: (_path: string, parse: (body: unknown) => unknown) =>
      Promise.resolve(
        parse({
          ...issue,
          title: 'Monthly ARC maintenance report 2026-08',
          body: noisyBody,
        }),
      ),
  } as unknown as CoreApiClient;
  const service = new DiscoveryService(
    {} as Client,
    config('.discord'),
    core,
    {} as DiscordSetupService,
    new PilotComponentRouter(),
  );
  const interaction = fakeInteraction();
  await service.handleBounties(
    interaction as unknown as ChatInputCommandInteraction,
  );
  const responses = [
    interaction.editReply.mock.calls[0].arguments[0],
    ...interaction.followUp.mock.calls.map((call) => call.arguments[0]),
  ] as Array<{
    embeds: Array<{
      data: {
        title?: string;
        description?: string;
        thumbnail?: { url: string };
      };
    }>;
    components: unknown[];
    files: Array<{ name: string }>;
  }>;
  assert.equal(responses.length, 3);
  for (const response of responses) {
    assert.equal(response.embeds.length, 1);
    assert.equal(response.components.length, 1);
    assert.equal(response.files[0].name, 'devloot-bounties.png');
    assert.equal(
      response.embeds[0].data.thumbnail?.url,
      'attachment://devloot-bounties.png',
    );
    assert.ok((response.embeds[0].data.description?.length ?? 0) <= 150);
    assert.doesNotMatch(
      response.embeds[0].data.description ?? '',
      /https?:\/\/|##|\*\*/,
    );
  }
  assert.doesNotMatch(issueExcerpt(noisyBody), /https?:\/\/|##|\*\*/);
});

void test('public discovery uses Core reads, hides stale rewards and revalidates buttons', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devloot-discovery-'));
  try {
    let currentBounty = { ...bounty };
    const calls: string[] = [];
    const core = {
      getQuery: mock.fn(
        (
          path: string,
          query: Record<string, unknown>,
          parse: (body: unknown) => unknown,
        ) => {
          calls.push(`${path}?${String(query.status ?? query.issueNumber)}`);
          return Promise.resolve(parse({ data: [currentBounty], total: 1 }));
        },
      ),
      get: mock.fn((path: string, parse: (body: unknown) => unknown) => {
        calls.push(path);
        return Promise.resolve(
          parse(
            path.startsWith('/api/bounties/')
              ? currentBounty
              : path.startsWith('/api/github/languages/')
                ? { languages: [{ name: 'TypeScript', bytes: 123 }] }
                : issue,
          ),
        );
      }),
    };
    const router = new PilotComponentRouter();
    const service = new DiscoveryService(
      {} as Client,
      config(directory),
      core as unknown as CoreApiClient,
      {} as DiscordSetupService,
      router,
    );
    const list = fakeInteraction({
      repository: 'p2arthur/team-agent-bond',
      status: 'OPEN',
    });
    await service.handleBounties(
      list as unknown as ChatInputCommandInteraction,
    );
    assert.equal(list.deferReply.mock.callCount(), 1);
    const output = list.editReply.mock.calls[0].arguments[0] as {
      embeds: Array<{
        data: { fields: Array<{ name: string; value: string }> };
      }>;
      components: unknown[];
    };
    assert.equal(
      output.embeds[0].data.fields.find((f) => f.name === 'Funded reward')
        ?.value,
      '$5 USDC',
    );
    assert.equal(output.components.length, 1);
    const missingRepository = fakeInteraction({ language: 'TypeScript' });
    await service.handleBounties(
      missingRepository as unknown as ChatInputCommandInteraction,
    );
    assert.match(
      String(missingRepository.editReply.mock.calls[0].arguments[0]),
      /Choose a repository before filtering by language/,
    );
    const matchingLanguage = fakeInteraction({
      repository: 'p2arthur/team-agent-bond',
      language: 'TypeScript',
    });
    await service.handleBounties(
      matchingLanguage as unknown as ChatInputCommandInteraction,
    );
    assert.ok(calls.includes('/api/github/languages/p2arthur/team-agent-bond'));
    const button = {
      customId: makeComponentId({
        feature: 'work',
        action: 'view',
        entityId: 'b_26',
      }),
      id: 'button-1',
      deferReply: mock.fn(() => Promise.resolve()),
      editReply: mock.fn((value: unknown) => {
        void value;
        return Promise.resolve();
      }),
    };
    currentBounty = { ...currentBounty, status: 'CLAIMED' };
    await router.dispatch(button as unknown as ButtonInteraction);
    assert.match(
      String(button.editReply.mock.calls[0].arguments[0]),
      /claimed/,
    );
    assert.match(
      String(button.editReply.mock.calls[0].arguments[0]),
      /\/bounty\/26\?discord_journey=/,
    );
    assert.ok(calls.includes('/api/bounties/26'));
    const issueInput = fakeInteraction({
      url: 'https://github.com/p2arthur/team-agent-bond/issues/2',
    });
    await service.handleIssue(
      issueInput as unknown as ChatInputCommandInteraction,
    );
    const issueOutput = issueInput.editReply.mock.calls[0].arguments[0] as {
      embeds: Array<{ data: { fields: Array<{ name: string }> } }>;
      components: Array<{
        toJSON: () => { components: Array<{ custom_id?: string }> };
      }>;
      files: Array<{ name: string }>;
    };
    assert.equal(
      issueOutput.embeds[0].data.fields.some((f) => f.name === 'Funded reward'),
      false,
    );
    assert.match(
      issueOutput.components[0].toJSON().components[0].custom_id ?? '',
      /^dl:v1:work:view:i_[a-f0-9]{24}$/,
    );
    assert.equal(issueOutput.files[0].name, 'devloot-bounties.png');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('repeat Discuss clicks and a restarted service reuse the persisted managed thread', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devloot-discussion-'));
  try {
    const thread = {
      id: '1494925337811759876',
      name: 'team-agent-bond#2 [DL:i_123456789012345678901234]',
      parentId: '1494925337811755555',
      isThread: () => true,
      send: mock.fn(() => Promise.resolve()),
    };
    const create = mock.fn(() => Promise.resolve(thread));
    const parent = {
      id: thread.parentId,
      type: ChannelType.GuildText,
      threads: {
        fetchActive: mock.fn(() =>
          Promise.resolve({ threads: new Collection() }),
        ),
        fetchArchived: mock.fn(() =>
          Promise.resolve({ threads: new Collection() }),
        ),
        create,
      },
    };
    const guild = {
      channels: {
        fetch: mock.fn((id: string) =>
          Promise.resolve(id === thread.id ? thread : parent),
        ),
      },
    };
    const client = {
      guilds: { fetch: mock.fn(() => Promise.resolve(guild)) },
    } as unknown as Client;
    const setup = {
      managedChannelId: mock.fn(() => Promise.resolve(parent.id)),
    } as unknown as DiscordSetupService;
    const core = {
      get: mock.fn((path: string, parse: (body: unknown) => unknown) => {
        return Promise.resolve(
          parse(path.startsWith('/api/issues/') ? issue : bounty),
        );
      }),
      getQuery: mock.fn(
        (path: string, query: unknown, parse: (body: unknown) => unknown) => {
          void path;
          void query;
          return Promise.resolve(parse({ data: [bounty], total: 1 }));
        },
      ),
    } as unknown as CoreApiClient;
    for (let attempt = 0; attempt < 2; attempt++) {
      const router = new PilotComponentRouter();
      const service = new DiscoveryService(
        client,
        config(directory),
        core,
        setup,
        router,
      );
      const button = {
        customId: makeComponentId({
          feature: 'work',
          action: 'discuss',
          entityId: 'b_26',
        }),
        id: `button-${attempt}`,
        deferReply: mock.fn(() => Promise.resolve()),
        editReply: mock.fn((value: unknown) => {
          void value;
          return Promise.resolve();
        }),
      };
      await router.dispatch(button as unknown as ButtonInteraction);
      assert.match(
        String(button.editReply.mock.calls[0].arguments[0]),
        new RegExp(thread.id),
      );
      if (attempt === 1) {
        const issueInput = fakeInteraction({
          url: 'https://github.com/p2arthur/team-agent-bond/issues/2',
        });
        await service.handleIssue(
          issueInput as unknown as ChatInputCommandInteraction,
        );
        const issueOutput = issueInput.editReply.mock.calls[0].arguments[0] as {
          components: Array<{
            toJSON: () => { components: Array<{ custom_id?: string }> };
          }>;
        };
        button.customId =
          issueOutput.components[0].toJSON().components[1].custom_id ?? '';
        await router.dispatch(button as unknown as ButtonInteraction);
      }
    }
    assert.equal(create.mock.callCount(), 1);
    assert.equal(thread.send.mock.callCount(), 1);
    const saved = JSON.parse(
      await readFile(
        join(directory, `${TEST_GUILD_ID}.discovery.json`),
        'utf8',
      ),
    ) as { threads: Record<string, string> };
    assert.equal(Object.values(saved.threads).length, 1);
    assert.equal(Object.values(saved.threads)[0], thread.id);
    assert.match(Object.keys(saved.threads)[0], /^i_[a-f0-9]{24}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
