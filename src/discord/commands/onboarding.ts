import { Injectable } from '@nestjs/common';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';

import { DiscordConnectService } from '../services/discord-connect.service';

@Injectable()
export class OnboardingCommand {
  constructor(private readonly connect: DiscordConnectService) {}

  buildOnboardingMessage() {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Welcome to DevLoot')
      .setDescription(
        this.connect.enabled
          ? 'Click **Link GitHub** to sign in to DevLoot and connect your Discord account. Then come back and click **Verify** to unlock the server. Already linked? Click **Verify**.'
          : 'New GitHub links are temporarily unavailable. If you’ve already linked your GitHub account to Discord through DevLoot, click **Verify** to restore access.',
      )
      .setFooter({ text: 'Open source bounties on Algorand' });

    const buttons = new ActionRowBuilder<ButtonBuilder>();
    if (this.connect.enabled)
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('onboarding-link')
          .setLabel('Link GitHub')
          .setStyle(ButtonStyle.Primary),
      );
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId('onboarding-verify')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success),
    );

    return { embeds: [embed], components: [buttons] };
  }

  async handle(interaction: ChatInputCommandInteraction) {
    const message = this.buildOnboardingMessage();
    await interaction.reply({ ...message, flags: MessageFlags.Ephemeral });
  }
}
