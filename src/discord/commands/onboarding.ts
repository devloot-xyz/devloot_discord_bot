import { Injectable, Logger } from '@nestjs/common';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  MessageFlags,
  ChatInputCommandInteraction,
} from 'discord.js';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscordXpService } from '../services/discord-xp.service';

@Injectable()
export class OnboardingCommand {
  private readonly logger = new Logger(OnboardingCommand.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly xpService: DiscordXpService,
  ) {}

  buildStep1IntentMessage(discordId: string) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Welcome to DevLoot')
      .setDescription(
        '**Step 1: Intent**\n\n' +
          'What brings you to DevLoot? Select an option below to tailor your experience:\n\n' +
          '🛡️ **Hunter** — I want to find and solve bounties\n' +
          '💰 **Funder** — I want to fund open-source work\n' +
          '👀 **Explorer** — Just checking things out\n\n' +
          '**Progress Checklist:**\n' +
          '`[ ]` Step 1: Select Intent\n' +
          '`[ ]` Step 2: Select Tech Stack\n' +
          '`[ ]` Step 3: Link GitHub & Verify (+100 XP)',
      )
      .setFooter({ text: 'DevLoot Community Onboarding • 1 of 3' });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`onboarding-intent:${discordId}`)
      .setPlaceholder('Choose what brings you to DevLoot...')
      .addOptions([
        {
          label: 'Hunter',
          value: 'hunter',
          description: 'I want to find and solve bounties',
          emoji: '🛡️',
        },
        {
          label: 'Funder',
          value: 'funder',
          description: 'I want to fund open-source work',
          emoji: '💰',
        },
        {
          label: 'Explorer',
          value: 'explorer',
          description: "I'm just checking things out",
          emoji: '👀',
        },
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select,
    );
    return { embeds: [embed], components: [row] };
  }

  buildStep2StackMessage(discordId: string, intent: string) {
    const intentLabel =
      intent === 'hunter'
        ? 'Hunter 🛡️'
        : intent === 'funder'
          ? 'Funder 💰'
          : 'Explorer 👀';

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('DevLoot Onboarding — Step 2: Tech Stack')
      .setDescription(
        '**What is your primary stack?** (Select all that apply)\n\n' +
          'Selecting your technologies unlocks role pings for new bounty alerts.\n\n' +
          '**Progress Checklist:**\n' +
          `\`[✓]\` Intent selected: **${intentLabel}**\n` +
          '`[ ]` Step 2: Select Tech Stack\n' +
          '`[ ]` Step 3: Link GitHub & Verify (+100 XP)',
      )
      .setFooter({ text: 'DevLoot Community Onboarding • 2 of 3' });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`onboarding-stack:${discordId}`)
      .setPlaceholder('Select your primary stack(s)...')
      .setMinValues(1)
      .setMaxValues(8)
      .addOptions([
        {
          label: 'Rust',
          value: 'Rust',
          description: 'Rust & systems engineering',
        },
        {
          label: 'TypeScript / JavaScript',
          value: 'TypeScript',
          description: 'Node.js, React, full-stack JS',
        },
        {
          label: 'Python',
          value: 'Python',
          description: 'Backend, AI/ML, automation scripts',
        },
        {
          label: 'Solidity / Smart Contracts',
          value: 'Solidity',
          description: 'EVM smart contracts & protocols',
        },
        {
          label: 'Algorand',
          value: 'Algorand',
          description: 'PyTeal, TEAL, AlgoKit contracts',
        },
        {
          label: 'Solana',
          value: 'Solana',
          description: 'Rust Anchor programs & web3',
        },
        {
          label: 'Go',
          value: 'Go',
          description: 'Go backend microservices & tools',
        },
        {
          label: 'Other',
          value: 'Other',
          description: 'Other programming languages & stacks',
        },
      ]);

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select,
    );
    return { embeds: [embed], components: [row] };
  }

  buildStep3VerifyMessage(discordId: string, intent: string, stacks: string[]) {
    const frontendUrl = process.env.CLIENT_URL || 'https://devloot.app';
    const connectUrl = `${frontendUrl}/connect?discord_id=${discordId}`;
    const intentLabel = intent.charAt(0).toUpperCase() + intent.slice(1);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('DevLoot Onboarding — Step 3: Verify & Unlock')
      .setDescription(
        '🎉 **Profile Completion Bonus: +50 XP Awarded!**\n\n' +
          'Now connect your GitHub to unlock the server and claim your **+100 XP** welcome bonus.\n\n' +
          '**Progress Checklist:**\n' +
          `\`[✓]\` Intent selected: **${intentLabel}**\n` +
          `\`[✓]\` Stack selected: **${stacks.join(', ')}**\n` +
          '`[ ]` GitHub linked\n`[ ]` Verified',
      )
      .setFooter({ text: 'DevLoot Community Onboarding • 3 of 3' });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Link GitHub')
        .setStyle(ButtonStyle.Link)
        .setURL(connectUrl),
      new ButtonBuilder()
        .setCustomId('onboarding-verify')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success),
    );

    return { embeds: [embed], components: [buttons] };
  }

  buildOnboardingMessage(discordId?: string) {
    return this.buildStep1IntentMessage(discordId || 'default');
  }

  async handle(interaction: ChatInputCommandInteraction) {
    const message = this.buildStep1IntentMessage(interaction.user.id);
    await interaction.reply({ ...message, flags: MessageFlags.Ephemeral });
  }

  async handleIntentSelect(interaction: StringSelectMenuInteraction) {
    const discordId = interaction.user.id;
    const intent = interaction.values[0];

    this.logger.log(
      `[onboarding] User ${discordId} selected intent: ${intent}`,
    );

    let user = await this.prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          discordId,
          githubId: -(Date.now() % 1_000_000_000),
          xp: 0,
        },
      });
    }

    await this.prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, intent },
      update: { intent },
    });

    const nextMessage = this.buildStep2StackMessage(discordId, intent);
    await interaction.update(nextMessage);
  }

  async handleStackSelect(interaction: StringSelectMenuInteraction) {
    const discordId = interaction.user.id;
    const stacks = interaction.values;

    this.logger.log(
      `[onboarding] User ${discordId} selected stacks: ${stacks.join(', ')}`,
    );

    let user = await this.prisma.user.findUnique({ where: { discordId } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          discordId,
          githubId: -(Date.now() % 1_000_000_000),
          xp: 0,
        },
      });
    }

    const prefs = await this.prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, stacks },
      update: { stacks },
    });

    // Award +50 XP Profile Completion Bonus
    await this.xpService.addProfileCompletionXp(discordId);

    const nextMessage = this.buildStep3VerifyMessage(
      discordId,
      prefs.intent || 'hunter',
      stacks,
    );
    await interaction.update(nextMessage);
  }
}
