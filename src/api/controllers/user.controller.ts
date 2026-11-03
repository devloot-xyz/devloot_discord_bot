import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getUserTier } from '../common/tier.util';
import { QUEST_POOL } from '../../discord/commands/quest';

@Controller('api/user')
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':discordId')
  async getUserProfile(@Param('discordId') discordId: string) {
    const user = await this.prisma.user.findUnique({
      where: { discordId },
      include: {
        preferences: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with Discord ID ${discordId} not found`,
      );
    }

    const [streak, proposalsCount] = await Promise.all([
      this.prisma.dailyStreak.findUnique({
        where: { userId: discordId },
      }),
      this.prisma.proposal.count({
        where: { proposerId: discordId },
      }),
    ]);

    return {
      discordId: user.discordId,
      username: user.username,
      xp: user.xp,
      tier: getUserTier(user.xp),
      onboarded: user.onboarded,
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      lastClaimDate: streak?.lastClaimDate ?? null,
      proposalsCount,
      preferences: {
        intent: user.preferences?.intent ?? null,
        stacks: user.preferences?.stacks ?? [],
      },
      createdAt: user.createdAt,
    };
  }

  @Get(':discordId/quests')
  async getUserQuests(@Param('discordId') discordId: string) {
    const user = await this.prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) {
      throw new NotFoundException(
        `User with Discord ID ${discordId} not found`,
      );
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const completed = await this.prisma.questCompletion.findMany({
      where: { userId: discordId, date: { gte: today } },
    });

    const completedTypes = completed.map((c) => c.questType);

    const quests = QUEST_POOL.map((quest) => ({
      id: quest.id,
      name: quest.name,
      xp: quest.xp,
      type: quest.type,
      channelId: quest.channelId,
      completed: completedTypes.includes(quest.id),
    }));

    return {
      discordId,
      date: today.toISOString(),
      quests,
      allCompleted: completedTypes.length >= QUEST_POOL.length,
    };
  }
}
