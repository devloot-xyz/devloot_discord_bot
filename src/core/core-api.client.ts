import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { PilotConfig } from '../config/pilot.config';

export class CoreApiError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'http' | 'invalid-response',
    readonly status?: number,
  ) {
    super(`Core request failed: ${kind}`);
  }
}

/** Public reads plus a signed, actor-bound Discord link request. */
@Injectable()
export class CoreApiClient {
  constructor(private readonly config: PilotConfig) {}

  async get<T>(
    path: string,
    parse: (body: unknown) => T,
    requestId: string,
  ): Promise<T> {
    if (!/^\/[a-zA-Z0-9/_-]*$/.test(path) || path.includes('..')) {
      throw new Error('Core path must be a local API path');
    }
    try {
      const response = await fetch(`${this.config.value.coreApiUrl}${path}`, {
        signal: AbortSignal.timeout(this.config.value.timeoutMs),
        redirect: 'error',
        headers: { accept: 'application/json', 'x-request-id': requestId },
      });
      if (!response.ok) throw new CoreApiError('http', response.status);
      try {
        return parse(await response.json());
      } catch {
        throw new CoreApiError('invalid-response');
      }
    } catch (error) {
      if (error instanceof CoreApiError) throw error;
      throw new CoreApiError('unavailable');
    }
  }

  async probe(
    requestId: string,
  ): Promise<'integrated' | 'existing' | 'unavailable'> {
    try {
      const healthy = await this.get(
        '/health',
        (body) => {
          if (!body || typeof body !== 'object' || !('status' in body))
            return false;
          return body.status === 'ok';
        },
        requestId,
      );
      return healthy ? 'integrated' : 'unavailable';
    } catch (error) {
      if (
        !(error instanceof CoreApiError) ||
        error.kind !== 'http' ||
        error.status !== 404
      )
        return 'unavailable';
    }

    // The current local Core container predates /health. Its known root response
    // establishes API liveness without claiming that omnichannel changes are active.
    try {
      const response = await fetch(`${this.config.value.coreApiUrl}/`, {
        signal: AbortSignal.timeout(this.config.value.timeoutMs),
        redirect: 'error',
        headers: { accept: 'text/plain', 'x-request-id': requestId },
      });
      return response.ok && (await response.text()).trim() === 'Hello World!'
        ? 'existing'
        : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  async isHealthy(requestId: string): Promise<boolean> {
    return (await this.probe(requestId)) !== 'unavailable';
  }

  async startDiscordLink(
    discordId: string,
    guildId: string,
    requestId: string,
  ): Promise<string> {
    if (!/^\d{17,20}$/.test(discordId))
      throw new Error('Invalid Discord actor');
    this.config.assertGuild(guildId);
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'devloot-discord-pilot',
        aud: 'devloot-core-discord-link',
        sub: this.config.value.clientId,
        discordId,
        guildId,
        iat: now,
        exp: now + 30,
        jti: randomBytes(24).toString('base64url'),
      }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    const signature = createHmac(
      'sha256',
      Buffer.from(this.config.value.serviceKey, 'base64'),
    )
      .update(body)
      .digest('base64url');
    try {
      const response = await fetch(
        `${this.config.value.coreApiUrl}/api/discord/link-requests`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.value.timeoutMs),
          headers: {
            authorization: `Bearer ${body}.${signature}`,
            'x-request-id': requestId,
          },
        },
      );
      if (!response.ok) throw new CoreApiError('http', response.status);
      const result: unknown = await response.json();
      const value =
        result && typeof result === 'object' && 'url' in result
          ? result.url
          : null;
      if (typeof value !== 'string') throw new CoreApiError('invalid-response');
      const url = new URL(value);
      const web = new URL(this.config.value.coreWebUrl);
      if (
        url.origin !== web.origin ||
        url.pathname !== '/connect' ||
        !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('discord_link') ?? '')
      )
        throw new CoreApiError('invalid-response');
      return url.toString();
    } catch (error) {
      if (error instanceof CoreApiError) throw error;
      throw new CoreApiError('unavailable');
    }
  }
}
