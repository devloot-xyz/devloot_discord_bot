import { Injectable } from '@nestjs/common';

export const TEST_GUILD_ID = '1494925337811751002';

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function endpoint(env: NodeJS.ProcessEnv, key: string): string {
  let url: URL;
  try {
    url = new URL(required(env, key));
  } catch {
    throw new Error(`Invalid ${key}`);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error(
      `${key} must use HTTPS, or HTTP on localhost, without credentials or query parameters`,
    );
  }
  return url.href.replace(/\/$/, '');
}

export function readPilotConfig(env: NodeJS.ProcessEnv) {
  const guildId = required(env, 'DISCORD_GUILD_ID');
  const allowed = required(env, 'DISCORD_ALLOWED_GUILD_IDS')
    .split(',')
    .map((x) => x.trim());
  if (
    guildId !== TEST_GUILD_ID ||
    allowed.length !== 1 ||
    allowed[0] !== guildId
  ) {
    throw new Error(`This pilot only permits guild ${TEST_GUILD_ID}`);
  }
  if (env.DISCORD_COMMAND_SCOPE !== 'guild')
    throw new Error('DISCORD_COMMAND_SCOPE must be guild');
  const clientId = required(env, 'DISCORD_CLIENT_ID');
  if (!/^\d{17,20}$/.test(clientId))
    throw new Error('Invalid DISCORD_CLIENT_ID');
  const serviceKey = required(env, 'DISCORD_SERVICE_KEY');
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(serviceKey) ||
    Buffer.from(serviceKey, 'base64').length !== 32
  ) {
    throw new Error('DISCORD_SERVICE_KEY must be a base64-encoded 32-byte key');
  }
  const timeoutMs = Number(env.CORE_REQUEST_TIMEOUT_MS ?? 3000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) {
    throw new Error('CORE_REQUEST_TIMEOUT_MS must be between 100 and 10000');
  }
  return Object.freeze({
    token: required(env, 'DISCORD_BOT_TOKEN'),
    clientId,
    serviceKey,
    guildId,
    coreApiUrl: endpoint(env, 'CORE_API_URL'),
    coreWebUrl: endpoint(env, 'CORE_WEB_URL'),
    timeoutMs,
    stateDirectory: env.DISCORD_STATE_DIRECTORY ?? '.discord',
  });
}

@Injectable()
export class PilotConfig {
  readonly value = readPilotConfig(process.env);
  allowsGuild(id: string | null | undefined): boolean {
    return id === this.value.guildId;
  }
  assertGuild(id: string | null | undefined): void {
    if (!this.allowsGuild(id))
      throw new Error('Guild is outside the configured pilot');
  }
}
