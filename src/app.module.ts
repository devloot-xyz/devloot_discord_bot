import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { DiscordModule } from './discord/discord.module';
import { ApiModule } from './api/api.module';

@Module({
  imports: [PrismaModule, DiscordModule, ApiModule],
})
export class AppModule {}
