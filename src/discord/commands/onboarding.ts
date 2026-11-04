import { Injectable } from '@nestjs/common';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';

@Injectable()
export class OnboardingCommand {
  buildOnboardingMessage() {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Welcome to DevLoot')
      .setDescription(
        'New GitHub links are temporarily unavailable. If you’ve already linked your GitHub account to Discord through DevLoot, click **Verify** to restore access.',
      )
      .setFooter({ text: 'Open source bounties on Algorand' });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
