import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/stats')
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getCommunityStats() {
    const [totalUsers, xpAggregate, totalProposals, activeStreaks] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.aggregate({
          _sum: { xp: true },
        }),
        this.prisma.proposal.count(),
        this.prisma.dailyStreak.count({
          where: { currentStreak: { gt: 0 } },
        }),
      ]);

    return {
      totalUsers,
      totalXpAwarded: xpAggregate._sum.xp ?? 0,
      totalProposals,
      activeStreaks,
    };
  }
}
