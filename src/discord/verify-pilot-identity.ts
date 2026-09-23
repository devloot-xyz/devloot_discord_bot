import { REST, Routes } from 'discord.js';
import { PilotConfig } from '../config/pilot.config';

/** Refuse production/shared bots even if they are also installed in the test guild. */
export async function verifyPilotIdentity(
  rest: REST,
  config: PilotConfig,
): Promise<void> {
  const identity = (await rest.get(Routes.user('@me'))) as {
    id: string;
    bot?: boolean;
  };
  if (identity.id !== config.value.clientId || !identity.bot)
    throw new Error('Discord application identity mismatch');
  const guilds = (await rest.get(Routes.userGuilds())) as { id: string }[];
  if (guilds.length !== 1 || guilds[0].id !== config.value.guildId) {
    throw new Error(
      'Use a dedicated application installed only in the test guild',
    );
  }
}
