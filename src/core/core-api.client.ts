import { Injectable } from '@nestjs/common';
import { PilotConfig } from '../config/pilot.config';

export class CoreApiError extends Error {
  constructor(
    readonly kind: 'unavailable' | 'http' | 'invalid-response',
    readonly status?: number,
  ) {
    super(`Core request failed: ${kind}`);
  }
}

/** Public reads only until P02 supplies the authenticated channel contract. */
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

  async isHealthy(requestId: string): Promise<boolean> {
    try {
      return await this.get(
        '/health',
        (body) => {
          if (!body || typeof body !== 'object' || !('status' in body))
            return false;
          return body.status === 'ok';
        },
        requestId,
      );
    } catch {
      return false;
    }
  }
}
