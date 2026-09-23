import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Client } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { CoreApiClient } from '../core/core-api.client';
import { PilotConfig } from '../config/pilot.config';

@Controller('health')
export class HealthController {
  constructor(
    @Inject('DISCORD_CLIENT') private readonly client: Client,
    private readonly core: CoreApiClient,
    private readonly config: PilotConfig,
  ) {}
  @Get() live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    const discord =
      this.client.isReady() &&
      this.client.guilds.cache.has(this.config.value.guildId);
    const core = await this.core.isHealthy(randomUUID());
    const status = { discord, core };
    if (!discord || !core) throw new ServiceUnavailableException(status);
    return status;
  }
}
