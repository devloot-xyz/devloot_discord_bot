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

export interface DiscordProfile {
  username: string | null;
  xp: number;
  tier: 'legend' | 'hunter' | 'builder' | 'newcomer';
  bountiesWon: number;
  bountiesClaimed: number;
  bountiesCreated: number;
  projectsOwned: number;
  joinedAt: string;
  github: {
    followers: number;
    totalStars: number;
    publicRepos: number;
    updatedAt: string;
  } | null;
  achievementsEarned: number;
  assessment: {
    stack: string[];
    specialties: string[];
    experience: string | null;
    updatedAt: string;
  } | null;
  achievements: {
    id: string;
    name: string;
    description: string;
    points: number;
    project: string | null;
    deliveredAt: string;
  }[];
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
    return this.getQuery(path, {}, parse, requestId);
  }

  async getQuery<T>(
    path: string,
    query: Record<string, string | number | undefined>,
    parse: (body: unknown) => T,
    requestId: string,
  ): Promise<T> {
    if (!/^\/[a-zA-Z0-9/_.-]*$/.test(path) || path.includes('..')) {
      throw new Error('Core path must be a local API path');
    }
    const url = new URL(`${this.config.value.coreApiUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    try {
      const response = await fetch(url.toString(), {
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
    return (await this.probe(requestId)) === 'integrated';
  }

  async startDiscordLink(
    discordId: string,
    guildId: string,
    requestId: string,
  ): Promise<string> {
    const assertion = this.serviceAssertion(discordId, guildId);
    try {
      const response = await fetch(
        `${this.config.value.coreApiUrl}/api/discord/link-requests`,
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.value.timeoutMs),
          headers: {
            authorization: `Bearer ${assertion}`,
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

  async isDiscordLinked(
    discordId: string,
    guildId: string,
    requestId: string,
  ): Promise<boolean> {
    const assertion = this.serviceAssertion(discordId, guildId);
    try {
      const response = await fetch(
        `${this.config.value.coreApiUrl}/api/discord/actor`,
        {
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.value.timeoutMs),
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${assertion}`,
            'x-request-id': requestId,
          },
        },
      );
      if (!response.ok) throw new CoreApiError('http', response.status);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('user' in result))
        throw new CoreApiError('invalid-response');
      if (result.user === null) return false;
      if (
        typeof result.user !== 'object' ||
        !result.user ||
        !('id' in result.user) ||
        typeof result.user.id !== 'number' ||
        !Number.isInteger(result.user.id) ||
        !('username' in result.user) ||
        typeof result.user.username !== 'string'
      )
        throw new CoreApiError('invalid-response');
      return true;
    } catch (error) {
      if (error instanceof CoreApiError) throw error;
      throw new CoreApiError('unavailable');
    }
  }

  async discordProfile(
    discordId: string,
    guildId: string,
    requestId: string,
  ): Promise<DiscordProfile | null> {
    const assertion = this.serviceAssertion(discordId, guildId);
    try {
      const response = await fetch(
        `${this.config.value.coreApiUrl}/api/discord/profile`,
        {
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.value.timeoutMs),
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${assertion}`,
            'x-request-id': requestId,
          },
        },
      );
      if (!response.ok) throw new CoreApiError('http', response.status);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('profile' in result))
        throw new CoreApiError('invalid-response');
      if (result.profile === null) return null;
      if (!isDiscordProfile(result.profile))
        throw new CoreApiError('invalid-response');
      return result.profile;
    } catch (error) {
      if (error instanceof CoreApiError) throw error;
      throw new CoreApiError('unavailable');
    }
  }

  async discordNotificationPreferences(discordId: string, guildId: string, requestId: string): Promise<{ guildMilestonesEnabled: boolean }> {
    return this.notificationPreferences(discordId, guildId, requestId);
  }

  async setDiscordNotificationPreferences(discordId: string, guildId: string, enabled: boolean, requestId: string): Promise<{ guildMilestonesEnabled: boolean }> {
    return this.notificationPreferences(discordId, guildId, requestId, enabled);
  }

  private async notificationPreferences(discordId: string, guildId: string, requestId: string, enabled?: boolean): Promise<{ guildMilestonesEnabled: boolean }> {
    const assertion = this.serviceAssertion(discordId, guildId);
    try {
      const response = await fetch(`${this.config.value.coreApiUrl}/api/discord/notification-preferences`, {
        method: enabled === undefined ? 'GET' : 'PUT',
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.value.timeoutMs),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${assertion}`,
          'x-request-id': requestId,
          ...(enabled === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(enabled === undefined ? {} : { body: JSON.stringify({ guildMilestonesEnabled: enabled }) }),
      });
      if (!response.ok) throw new CoreApiError('http', response.status);
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('guildMilestonesEnabled' in body) || typeof body.guildMilestonesEnabled !== 'boolean')
        throw new CoreApiError('invalid-response');
      return { guildMilestonesEnabled: body.guildMilestonesEnabled };
    } catch (error) {
      if (error instanceof CoreApiError) throw error;
      throw new CoreApiError('unavailable');
    }
  }

  async disconnectDiscord(
    discordId: string,
    guildId: string,
    requestId: string,
  ): Promise<boolean> {
    const assertion = this.serviceAssertion(discordId, guildId);
    try {
      const response = await fetch(
        `${this.config.value.coreApiUrl}/api/discord/actor`,
        {
          method: 'DELETE',
          redirect: 'error',
          signal: AbortSignal.timeout(this.config.value.timeoutMs),
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${assertion}`,
            'x-request-id': requestId,
          },
        },
      );
      if (!response.ok) throw new CoreApiError('http', response.status);
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('unlinked' in result) || typeof result.unlinked !== 'boolean')
        throw new CoreApiError('invalid-response');
      return result.unlinked;
    } catch (error) {
      if (error instanceof CoreApiError) throw error;
      throw new CoreApiError('unavailable');
    }
  }

  private serviceAssertion(discordId: string, guildId: string): string {
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
    return `${body}.${signature}`;
  }
}

function isDiscordProfile(value: unknown): value is DiscordProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  const assessment = profile.assessment as Record<string, unknown> | null;
  const isTextList = (items: unknown) => Array.isArray(items) && items.every((item) => typeof item === 'string');
  return (
    (profile.username === null || typeof profile.username === 'string') &&
    Number.isSafeInteger(profile.xp) &&
    ['legend', 'hunter', 'builder', 'newcomer'].includes(String(profile.tier)) &&
    Number.isSafeInteger(profile.bountiesWon) &&
    typeof profile.bountiesClaimed === 'number' &&
    Number.isSafeInteger(profile.bountiesClaimed) && profile.bountiesClaimed >= 0 &&
    Number.isSafeInteger(profile.bountiesCreated) &&
    Number.isSafeInteger(profile.projectsOwned) &&
    Number.isSafeInteger(profile.achievementsEarned) &&
    typeof profile.joinedAt === 'string' &&
    (profile.github === null ||
      (typeof profile.github === 'object' &&
        profile.github !== null &&
        Number.isSafeInteger((profile.github as Record<string, unknown>).followers) &&
        Number.isSafeInteger((profile.github as Record<string, unknown>).totalStars) &&
        Number.isSafeInteger((profile.github as Record<string, unknown>).publicRepos) &&
        typeof (profile.github as Record<string, unknown>).updatedAt === 'string')) &&
    (assessment === null ||
      (typeof assessment === 'object' &&
        isTextList(assessment.stack) &&
        isTextList(assessment.specialties) &&
        (assessment.experience === null || typeof assessment.experience === 'string') &&
        typeof assessment.updatedAt === 'string')) &&
    Array.isArray(profile.achievements) &&
    profile.achievements.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const award = item as Record<string, unknown>;
      return typeof award.id === 'string' && typeof award.name === 'string' &&
        typeof award.description === 'string' && Number.isSafeInteger(award.points) &&
        (award.project === null || typeof award.project === 'string') &&
        typeof award.deliveredAt === 'string';
    })
  );
}
