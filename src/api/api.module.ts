import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserController } from './controllers/user.controller';
import { LeaderboardController } from './controllers/leaderboard.controller';
import { ProposalController } from './controllers/proposal.controller';
import { StatsController } from './controllers/stats.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    UserController,
    LeaderboardController,
    ProposalController,
    StatsController,
  ],
})
export class ApiModule {}
