import { Injectable, Logger } from '@nestjs/common';
import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  ChannelType,
  TextChannel,
  MessageFlags,
} from 'discord.js';
import { DiscordXpService } from '../services/discord-xp.service';

@Injectable()
export class LfsCommand {
  private readonly logger = new Logger(LfsCommand.name);

  constructor(private readonly xpService: DiscordXpService) {}

  async handle(
    interaction: ChatInputCommandInteraction,
    roleNeeded: string,
    description: string,
  ): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Locate the #looking-for-squad channel
    let targetChannel = guild.channels.cache.find(
      (c) =>
        c &&
        c.type === ChannelType.GuildText &&
        c.name.toLowerCase().includes('looking-for-squad'),
    ) as TextChannel | undefined;

    // Fallback search across fetch if not cached
    if (!targetChannel) {
      try {
        const fetchedChannels = await guild.channels.fetch();
        targetChannel = fetchedChannels.find(
          (c) =>
            c &&
            c.type === ChannelType.GuildText &&
            c.name.toLowerCase().includes('looking-for-squad'),
        ) as TextChannel | undefined;
      } catch (err) {
        this.logger.warn(
          `Failed to fetch channels for #looking-for-squad: ${err}`,
        );
      }
    }

    if (!targetChannel) {
      await interaction.reply({
        content:
          'The `#looking-for-squad` channel does not exist yet. Please ask an admin to run `/setup-server`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('🔍 Looking for Squad')
      .setDescription(
        `<@${interaction.user.id}> is looking for: **${roleNeeded}**\n\n> "${description}"\n\nReact with 🤝 to express interest!`,
      )
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    try {
      const message = await targetChannel.send({ embeds: [embed] });
      await message.react('🤝');

      // Auto-create thread for discussion
      const threadTitle =
        `Squad — ${roleNeeded} (${interaction.user.username})`.slice(0, 80);
      try {
        await message.startThread({
          name: threadTitle,
          autoArchiveDuration: 60,
        });
      } catch (threadErr) {
        this.logger.warn(
          `Failed to create thread on squad message: ${threadErr}`,
        );
      }

      // Award +10 XP for posting
      await this.xpService.addXp(interaction.user.id, 10);

      await interaction.reply({
        content: `Your squad post has been shared in <#${targetChannel.id}>! You earned **+10 XP**.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      this.logger.error(`Failed to post squad request: ${err}`);
      await interaction.reply({
        content:
          'Failed to post your squad request. Please check channel permissions.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
