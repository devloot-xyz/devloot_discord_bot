import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { createHmac, randomBytes } from 'node:crypto';

const devlootOrigin = 'https://devloot.xyz';

@Injectable()
export class DiscordConnectService {
  get enabled(): boolean {
    return (
      process.env.DISCORD_CONNECT_ENABLED === 'true' &&
      /^[A-Za-z0-9+/]{43}=$/.test(process.env.DISCORD_SERVICE_KEY ?? '') &&
      /^\d{17,20}$/.test(process.env.DISCORD_CLIENT_ID ?? '') &&
      /^\d{17,20}$/.test(process.env.DISCORD_GUILD_ID ?? '')
    );
  }

  async start(interaction: ButtonInteraction): Promise<void> {
    const result = await this.request(interaction, 'link-requests');
    if (typeof result.url !== 'string')
      throw new Error('Invalid DevLoot link response');
    const url = new URL(result.url);
    if (
      url.origin !== devlootOrigin ||
      url.pathname !== '/connect' ||
      url.username ||
      url.password ||
      url.hash ||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('discord_link') ?? '')
    ) {
      throw new Error('Invalid DevLoot link destination');
    }
    await interaction.editReply({
      content:
        'Sign in to DevLoot with GitHub and authorize Discord. This private link expires in 10 minutes. Then return here and click **Verify**.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setLabel('Open DevLoot')
            .setStyle(ButtonStyle.Link)
            .setURL(url.toString()),
        ),
      ],
    });
  }

  async grantAccess(interaction: ButtonInteraction): Promise<boolean> {
    const result = await this.request(interaction, 'access');
    if (typeof result.granted !== 'boolean')
      throw new Error('Invalid DevLoot verification response');
    return result.granted;
  }

  private async request(
    interaction: ButtonInteraction,
    path: 'link-requests' | 'access',
  ): Promise<Record<string, unknown>> {
    const guildId = interaction.guildId;
    const discordId = interaction.user.id;
    if (
      !this.enabled ||
      guildId !== process.env.DISCORD_GUILD_ID ||
      !/^\d{17,20}$/.test(discordId)
    ) {
      throw new Error('Discord linking is unavailable for this interaction');
    }
    const issuedAt = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'devloot-discord-pilot',
        aud: 'devloot-core-discord-link',
        sub: process.env.DISCORD_CLIENT_ID,
        guildId,
        discordId,
        iat: issuedAt,
        exp: issuedAt + 30,
        jti: randomBytes(24).toString('base64url'),
      }),
    ).toString('base64url');
    const body = `${header}.${payload}`;
    const signature = createHmac(
      'sha256',
      Buffer.from(process.env.DISCORD_SERVICE_KEY!, 'base64'),
    )
      .update(body)
      .digest('base64url');
    const response = await fetch(`${devlootOrigin}/api/discord/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${body}.${signature}`,
        accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) throw new Error('DevLoot Discord linking request failed');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error('Invalid DevLoot response');
    return result as Record<string, unknown>;
  }
}
