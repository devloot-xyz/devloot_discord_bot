import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export function pilotCommands() {
  return [
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check the DevLoot development bot'),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription('Check Discord and Core connectivity'),
    new SlashCommandBuilder()
      .setName('setup-server')
      .setDescription('Preview or apply the development server setup')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addBooleanOption((option) =>
        option
          .setName('apply')
          .setDescription(
            'Create missing pilot channels and roles (default: preview)',
          ),
      ),
  ].map((command) => command.toJSON());
}
