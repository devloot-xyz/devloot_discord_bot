import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  PermissionFlagsBits,
} from 'discord.js';
import { PilotConfig } from '../src/config/pilot.config';
import { pilotCommands } from '../src/discord/command-definitions';
import { DiscordSetupService } from '../src/discord/handlers/discord-setup.service';
import { verifyPilotIdentity } from '../src/discord/verify-pilot-identity';

async function main() {
  const config = new PilotConfig();
  const operation = process.argv[2];
  if (
    !['inventory', 'preview', 'apply', 'commands', 'invite'].includes(operation)
  )
    throw new Error('Unknown pilot operation');
  if (operation === 'invite') {
    const permissions = [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks,
    ].reduce((a, b) => a | b, 0n);
    console.log(
      `https://discord.com/oauth2/authorize?client_id=${config.value.clientId}&scope=bot%20applications.commands&permissions=${permissions}&guild_id=${config.value.guildId}&disable_guild_select=true`,
    );
    return;
  }
  const rest = new REST().setToken(config.value.token);
  await verifyPilotIdentity(rest, config);
  if (operation === 'commands') {
    const body = pilotCommands();
    await rest.put(
      Routes.applicationGuildCommands(
        config.value.clientId,
        config.value.guildId,
      ),
      { body },
    );
    console.log(
      `Deployed ${body.length} guild commands to ${config.value.guildId}`,
    );
    return;
  }
  if (operation === 'inventory') {
    const [channels, roles] = await Promise.all([
      rest.get(Routes.guildChannels(config.value.guildId)),
      rest.get(Routes.guildRoles(config.value.guildId)),
    ]);
    console.log(
      JSON.stringify(
        {
          bot: config.value.clientId,
          guild: config.value.guildId,
          channels,
          roles,
        },
        null,
        2,
      ),
    );
    return;
  }
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });
  try {
    const ready = new Promise<void>((resolve) =>
      client.once(Events.ClientReady, () => resolve()),
    );
    await client.login(config.value.token);
    await ready;
    const guild = await client.guilds.fetch(config.value.guildId);
    const setup = new DiscordSetupService(config);
    console.log((await setup.preview(guild)).join('\n'));
    if (operation === 'apply')
      console.log((await setup.apply(guild)).join('\n'));
  } finally {
    await client.destroy();
  }
}

void main().catch((error) => {
  // Never print Discord request bodies, headers, token-bearing error objects or stacks.
  const message =
    error instanceof Error && error.constructor === Error
      ? error.message
      : 'Discord operation failed; check credentials, membership and permissions';
  console.error(message);
  process.exitCode = 1;
});
