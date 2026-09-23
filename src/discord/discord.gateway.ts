import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { Client, Events, Interaction, MessageFlags } from 'discord.js';
import { PilotConfig } from '../config/pilot.config';
import { CoreApiClient } from '../core/core-api.client';
import { DiscordSetupService } from './handlers/discord-setup.service';
import { PilotComponentRouter } from './component-router';
import { verifyPilotIdentity } from './verify-pilot-identity';

@Injectable()
export class DiscordGateway implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DiscordGateway.name);
  constructor(
    @Inject('DISCORD_CLIENT') private readonly client: Client,
    private readonly config: PilotConfig,
    private readonly setup: DiscordSetupService,
    private readonly core: CoreApiClient,
    private readonly components: PilotComponentRouter,
  ) {}

  async onModuleInit() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.handleInteraction(interaction);
    });
    this.client.on(Events.Error, () =>
      this.logger.error({ event: 'discord_client_error' }),
    );
    this.client.once(Events.ClientReady, () =>
      this.logger.log({
        event: 'discord_ready',
        guildId: this.config.value.guildId,
      }),
    );
    // Read identity before opening the gateway; token/client mismatch must fail closed.
    this.client.rest.setToken(this.config.value.token);
    try {
      await verifyPilotIdentity(this.client.rest, this.config);
      await this.client.login(this.config.value.token);
    } catch {
      await this.client.destroy();
      throw new Error(
        'Discord pilot startup failed: verify application identity, test-only guild membership and credentials',
      );
    }
  }

  async onApplicationShutdown() {
    await this.client.destroy();
  }

  async handleInteraction(interaction: Interaction) {
    if (!interaction.isRepliable()) return;
    try {
      if (!this.config.allowsGuild(interaction.guildId)) {
        await interaction.reply({
          content: 'This bot is only available in the development server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case 'ping':
            await interaction.reply({
              content: 'Pong! DevLoot development bot is online.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          case 'status': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const core = await this.core.probe(interaction.id);
            await interaction.editReply(
              `Discord: connected\nCore API: ${core === 'unavailable' ? 'unavailable' : 'reachable'}${core === 'existing' ? ' (running Core container)' : ''}\n${core === 'existing' ? 'Omnichannel Core changes are not active in this container.\n' : ''}Account linking: ${core === 'integrated' ? 'available via /connect' : 'unavailable'}\nRewards: not enabled yet.`,
            );
            return;
          }
          case 'connect': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (
              await this.core.isDiscordLinked(
                interaction.user.id,
                interaction.guildId!,
                interaction.id,
              )
            ) {
              await interaction.editReply(
                'Your Discord account is already linked to DevLoot. You do not need to run /connect again.',
              );
              return;
            }
            const url = await this.core.startDiscordLink(
              interaction.user.id,
              interaction.guildId!,
              interaction.id,
            );
            await interaction.editReply(
              `Continue linking your Discord account in DevLoot: ${url}\nThis link expires in 10 minutes.`,
            );
            return;
          }
          case 'setup-server':
            await this.setup.handleSetupServer(interaction);
            return;
          default:
            await interaction.reply({
              content: 'This command is not enabled in the development pilot.',
              flags: MessageFlags.Ephemeral,
            });
            return;
        }
      }
      if (interaction.isButton()) {
        await this.components.dispatch(interaction);
        return;
      }
      await interaction.reply({
        content:
          'This action is no longer available. Run a current slash command.',
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      this.logger.error({
        event: 'interaction_failed',
        requestId: interaction.id,
        guildId: interaction.guildId,
      });
      try {
        const content = `Could not complete the request. Please try again. Reference: ${interaction.id}`;
        if (interaction.deferred) await interaction.editReply({ content });
        else if (!interaction.replied)
          await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        else
          await interaction.followUp({
            content,
            flags: MessageFlags.Ephemeral,
          });
      } catch {
        this.logger.warn({
          event: 'interaction_reply_failed',
          requestId: interaction.id,
        });
      }
    }
  }
}
