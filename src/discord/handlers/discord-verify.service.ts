import { Injectable, Logger } from '@nestjs/common';
import {
  EmbedBuilder,
  Colors,
  MessageFlags,
  ButtonInteraction,
} from 'discord.js';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscordRoleService } from '../services/discord-role.service';
import { DiscordGuildService } from '../services/discord-guild.service';

@Injectable()
export class DiscordVerifyService {
  private readonly logger = new Logger(DiscordVerifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roleService: DiscordRoleService,
    private readonly guildService: DiscordGuildService,
  ) {}

  async checkOnboarded(discordId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { discordId } });
    return !!(user?.onboarded && user?.githubId);
  }

  async handleVerify(interaction: ButtonInteraction): Promise<void> {
    const discordId = interaction.user.id;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const existing = await this.prisma.user.findUnique({
      where: { discordId },
      select: { onboarded: true, githubId: true, xp: true },
    });

    if (!existing?.githubId) {
      await interaction.editReply(
        'New GitHub links are temporarily unavailable. There is no linked GitHub account for this Discord user.',
      );
      return;
    }

    if (existing?.onboarded) {
      this.logger.log(
        `[verify] ${discordId} already onboarded — syncing roles anyway`,
      );

      await this.roleService.syncTierRole(discordId, existing.xp);

      const verifiedRoleId =
        await this.roleService.fetchRoleIdByName('Verified');
      if (verifiedRoleId && interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(discordId);
          if (!member.roles.cache.has(verifiedRoleId)) {
            await member.roles.add(verifiedRoleId);
            this.logger.log(
              `[verify] Re-assigned missing Verified role ${verifiedRoleId} to ${discordId}`,
            );
          }
        } catch (err) {
          this.logger.warn(`[verify] Failed to sync Verified role: ${err}`);
        }
      }

      await interaction.editReply('You are already verified! Roles synced.');
      return;
    }

    this.logger.log(`[verify] Marking ${discordId} as onboarded`);
    const isFirstVerify = !existing?.onboarded;

    const updatedUser = await this.prisma.user.update({
      where: { discordId },
      data: {
        onboarded: true,
        ...(isFirstVerify ? { xp: { increment: 100 } } : {}),
      },
    });

    if (isFirstVerify) {
      this.logger.log(
        `[verify] Awarded 100 XP bonus to ${discordId} — total ${updatedUser.xp} XP`,
      );
    }

    const verifiedRoleId = await this.roleService.fetchRoleIdByName('Verified');
    if (verifiedRoleId && interaction.guild) {
      try {
        const member = await interaction.guild.members.fetch(discordId);
        await member.roles.add(verifiedRoleId);
        this.logger.log(
          `[verify] Assigned Verified role ${verifiedRoleId} to ${discordId}`,
        );
      } catch (err) {
        this.logger.warn(`[verify] Failed to assign Verified role: ${err}`);
      }
    }

    this.logger.log(
      `[verify] Syncing tier role for ${discordId} (XP: ${updatedUser.xp})`,
    );
    await this.roleService.syncTierRole(discordId, updatedUser.xp);

    try {
      const generalChannelId =
        await this.guildService.fetchChannelIdByName('⚡-general');
      if (generalChannelId) {
        const channel =
          await interaction.guild?.channels.fetch(generalChannelId);
        if (channel && 'send' in channel) {
          await channel.send(`Welcome <@${discordId}> to DevLoot! 🎉`);
          this.logger.log(
            `[verify] Posted welcome in general for ${discordId}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`[verify] Failed to post welcome in general: ${err}`);
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle("You're in.")
      .setDescription(
        "Here's what you can do:\n\n" +
          '- `/daily` — Claim your daily XP (streak bonus up to +40)\n' +
          '- `/rank` — Check your XP, tier, and streak\n' +
          "- `/quests` — View today's quests\n" +
          "- `/leaderboard` — See who's on top\n" +
          '- `/propose` — Suggest an open source issue for a bounty\n' +
          '- `#💰-feed` — Browse active bounties' +
          (isFirstVerify ? '\n\n**+100 XP** welcome bonus applied!' : ''),
      )
      .addFields({
        name: 'Tier Progression',
        value:
          '🔨 **Builder** (500 XP) — `/propose` unlocked\n' +
          '🎯 **Hunter** (2,000 XP) — Hunter perks\n' +
          '⭐ **Legend** (5,000 XP) — Legend perks\n' +
          '🍳 **Open Source Chef** — Create or claim a bounty this week',
        inline: false,
      });

    await interaction.editReply({ embeds: [embed] });
    this.logger.log(`[verify] ${discordId} verified successfully`);
  }
}
