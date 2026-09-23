import { Module } from '@nestjs/common';
import { Client, GatewayIntentBits } from 'discord.js';
import { PilotConfig } from '../config/pilot.config';
import { CoreApiClient } from '../core/core-api.client';
import { DiscordGateway } from './discord.gateway';
import { DiscordSetupService } from './handlers/discord-setup.service';
import { HealthController } from './health.controller';

@Module({
  providers: [
    PilotConfig,
    CoreApiClient,
    DiscordGateway,
    DiscordSetupService,
    {
      provide: 'DISCORD_CLIENT',
      useFactory: () =>
        new Client({
          intents: [GatewayIntentBits.Guilds],
          allowedMentions: { parse: [], repliedUser: false },
        }),
    },
  ],
  controllers: [HealthController],
})
export class DiscordModule {}
