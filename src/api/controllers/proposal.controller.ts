import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/proposals')
export class ProposalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getRecentProposals(@Query('limit') limitQuery?: string) {
    const limit = Math.min(
      Math.max(parseInt(limitQuery ?? '20', 10) || 20, 1),
      100,
    );

    const proposals = await this.prisma.proposal.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        votes: true,
      },
    });

    const guildId = process.env.DISCORD_GUILD_ID;
    const suggestionsChannelId = process.env.DISCORD_SUGGESTIONS_CHANNEL;

    return proposals.map((proposal) => {
      const upvotes = proposal.votes.filter((v) => v.value > 0).length;
      const downvotes = proposal.votes.filter((v) => v.value < 0).length;

      const threadUrl =
        proposal.messageId && suggestionsChannelId && guildId
          ? `https://discord.com/channels/${guildId}/${suggestionsChannelId}/${proposal.messageId}`
          : null;

      return {
        id: proposal.id,
        issueUrl: proposal.issueUrl,
        owner: proposal.owner,
        repo: proposal.repo,
        issueNumber: proposal.issueNumber,
        title: proposal.title,
        description: proposal.description,
        status: proposal.status,
        proposerId: proposal.proposerId,
        upvotes: proposal.upvotes,
        votes: {
          up: upvotes,
          down: downvotes,
          total: proposal.votes.length,
        },
        aiSummary: proposal.aiAnalysis,
        threadCreated: proposal.threadCreated,
        threadUrl,
        messageId: proposal.messageId,
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
      };
    });
  }
}
