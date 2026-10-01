import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export function pilotCommands() {
  return [
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check the DevLoot development bot'),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check if the bot can reach DevLoot'),
    new SlashCommandBuilder()
      .setName('connect')
      .setDescription('Start linking your Discord account to DevLoot'),
    new SlashCommandBuilder()
      .setName('disconnect')
      .setDescription('Disconnect your Discord account from DevLoot'),
    new SlashCommandBuilder()
      .setName('notifications')
      .setDescription('View or change your bounty claim post setting')
      .addBooleanOption((option) => option
        .setName('bounty_claims')
        .setDescription('Announce your first bounty claim in #bounty-claims')),
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('View a DevLoot builder profile')
      .addUserOption((option) =>
        option
          .setName('member')
          .setDescription('Member to view (default: you)'),
      ),
    new SlashCommandBuilder()
      .setName('achievements')
      .setDescription('View earned DevLoot achievements')
      .addUserOption((option) =>
        option
          .setName('member')
          .setDescription('Member to view (default: you)'),
      ),
    new SlashCommandBuilder()
      .setName('bounties')
      .setDescription('Find bounties on DevLoot')
      .addIntegerOption((option) =>
        option
          .setName('page')
          .setDescription('Results page (3 bounties per page)')
          .setMinValue(1)
          .setMaxValue(100),
      )
      .addStringOption((option) =>
        option
          .setName('repository')
          .setDescription('Filter by GitHub owner/repository'),
      )
      .addStringOption((option) =>
        option
          .setName('language')
          .setDescription('Repository language (requires repository filter)'),
      )
      .addStringOption((option) =>
        option
          .setName('status')
          .setDescription('Bounty state (default: open)')
          .addChoices(
            { name: 'Open', value: 'OPEN' },
            { name: 'In review', value: 'IN_REVIEW' },
            { name: 'Ready for claim', value: 'READY_FOR_CLAIM' },
          ),
      ),
    new SlashCommandBuilder()
      .setName('issue')
      .setDescription('View a GitHub issue and discuss it here')
      .addStringOption((option) =>
        option
          .setName('url')
          .setDescription('Full GitHub issue URL')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('setup-server')
      .setDescription('Preview or create DevLoot test channels and roles')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addBooleanOption((option) =>
        option
          .setName('apply')
          .setDescription(
            'Create missing channels and roles (default: preview only)',
          ),
      ),
  ].map((command) => command.toJSON());
}
