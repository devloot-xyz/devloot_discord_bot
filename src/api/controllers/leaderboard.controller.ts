import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getUserTier } from '../common/tier.util';

@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getLeaderboard() {
    const topUsers = await this.prisma.user.findMany({
      where: { xp: { gt: 0 } },
      orderBy: [{ xp: 'desc' }, { createdAt: 'asc' }],
      take: 10,
      select: {
        discordId: true,
        username: true,
        xp: true,
        createdAt: true,
      },
    });

    return topUsers.map((user, index) => ({
      rank: index + 1,
      discordId: user.discordId,
      username: user.username,
      xp: user.xp,
      tier: getUserTier(user.xp),
    }));
  }
}
