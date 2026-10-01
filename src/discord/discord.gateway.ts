import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  Interaction,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { PilotConfig } from '../config/pilot.config';
import { CoreApiClient, CoreApiError, DiscordProfile } from '../core/core-api.client';
import { DiscordSetupService } from './handlers/discord-setup.service';
import { makeComponentId, PilotComponentRouter } from './component-router';
import { verifyPilotIdentity } from './verify-pilot-identity';
import { renderProfileSections } from './profile-sections-image';
import { DiscoveryService } from './discovery.service';

@Injectable()
export class DiscordGateway implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DiscordGateway.name);
  private readonly discovery: DiscoveryService;
  constructor(
    @Inject('DISCORD_CLIENT') private readonly client: Client,
    private readonly config: PilotConfig,
    private readonly setup: DiscordSetupService,
    private readonly core: CoreApiClient,
    private readonly components: PilotComponentRouter,
  ) {
    this.discovery = new DiscoveryService(client, config, core, setup, components);
    this.components.register('link', 'check', (interaction, discordId) =>
      this.checkConnection(interaction, discordId),
    );
    this.components.register('profile', 'share', (interaction, discordId) =>
      this.shareProfile(interaction, discordId),
    );
  }

  async onModuleInit() {
    this.client.on(Events.InteractionCreate, (interaction) => {
      void this.handleInteraction(interaction);
    });
    this.client.on(Events.Error, () =>
      this.logger.error({ event: 'discord_client_error' }),
    );
    this.client.once(Events.ClientReady, () =>
      this.logger.log({
        event: 'discord_ready',
        guildId: this.config.value.guildId,
      }),
    );
    // Read identity before opening the gateway; token/client mismatch must fail closed.
    this.client.rest.setToken(this.config.value.token);
    try {
      await verifyPilotIdentity(this.client.rest, this.config);
      await this.client.login(this.config.value.token);
    } catch {
      await this.client.destroy();
      throw new Error(
        'Discord pilot startup failed: verify application identity, test-only guild membership and credentials',
      );
    }
  }

  async onApplicationShutdown() {
    await this.client.destroy();
  }

  async handleInteraction(interaction: Interaction) {
    if (!interaction.isRepliable()) return;
    try {
      if (!this.config.allowsGuild(interaction.guildId)) {
        await interaction.reply({
          content: 'Use this bot in the DevLoot development server.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case 'ping':
            await interaction.reply({
              content: 'DevLoot bot is online.',
              flags: MessageFlags.Ephemeral,
            });
            return;
          case 'status': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const core = await this.core.probe(interaction.id);
            await interaction.editReply(core === 'integrated'
              ? 'Bot: online. DevLoot: connected.\nUse /connect to link your account or /bounties to browse. Claim rewards on the DevLoot website.'
              : core === 'existing'
                ? 'Bot: online. DevLoot: running an older server version.\nAccount linking and profiles need the updated local DevLoot server.'
                : 'Bot: online. DevLoot: unavailable right now.\nAccount and bounty commands may fail. Try again shortly.');
            return;
          }
          case 'connect': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (
              await this.core.isDiscordLinked(
                interaction.user.id,
                interaction.guildId!,
                interaction.id,
              )
            ) {
              const profile = await this.core.discordProfile(
                interaction.user.id,
                interaction.guildId!,
                interaction.id,
              );
              await interaction.editReply(
                this.connectedMessage(profile),
              );
              return;
            }
            const url = await this.core.startDiscordLink(
              interaction.user.id,
              interaction.guildId!,
              interaction.id,
            );
            await interaction.editReply({
              content: `Open this link to connect your Discord account: ${url}\nThe link expires in 10 minutes. When you finish on DevLoot, press **Check connection** below.`,
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(makeComponentId({ feature: 'link', action: 'check', entityId: interaction.user.id }))
                    .setLabel('Check connection')
                    .setStyle(ButtonStyle.Primary),
                ),
              ],
            });
            return;
          }
          case 'disconnect': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const unlinked = await this.core.disconnectDiscord(
              interaction.user.id,
              interaction.guildId!,
              interaction.id,
            );
            await interaction.editReply(
              unlinked
                ? 'Disconnected. Your Discord badge will no longer appear on your DevLoot profile. Use /connect to link again.'
                : 'This Discord account is already disconnected. Use /connect to link it.',
            );
            return;
          }
          case 'notifications': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (!await this.core.isDiscordLinked(interaction.user.id, interaction.guildId!, interaction.id)) {
              await interaction.editReply('Connect your Discord account first with /connect. Then run /notifications again.');
              return;
            }
            const enabled = interaction.options.getBoolean('bounty_claims');
            const preference = enabled === null
              ? await this.core.discordNotificationPreferences(interaction.user.id, interaction.guildId!, interaction.id)
              : await this.core.setDiscordNotificationPreferences(interaction.user.id, interaction.guildId!, enabled, interaction.id);
            const on = preference.guildMilestonesEnabled;
            await interaction.editReply(enabled === null
              ? on
                ? 'Bounty claim posts: On. Your first confirmed claim can appear in #bounty-claims when announcements launch.'
                : 'Bounty claim posts: Off. To turn them on, use `/notifications bounty_claims:true`.'
              : on
                ? 'Saved. Bounty claim posts are on. This command does not post a message; announcements are not live yet.'
                : 'Saved. Bounty claim posts are off. Your claims will not be posted in #bounty-claims.');
            return;
          }
          case 'profile': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const targetId = interaction.options.getUser('member')?.id ?? interaction.user.id;
            const profile = await this.core.discordProfile(targetId, interaction.guildId!, interaction.id);
            if (!profile) {
              await interaction.editReply(
                targetId === interaction.user.id
                  ? 'Connect your Discord account first with /connect. Then run /profile again.'
                  : 'This member has not connected a DevLoot account.',
              );
              return;
            }
            await interaction.editReply({
              ...await this.profileCard(profile),
              components: targetId === interaction.user.id ? [this.shareRow(targetId)] : [],
            });
            return;
          }
          case 'achievements': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const targetId = interaction.options.getUser('member')?.id ?? interaction.user.id;
            const profile = await this.core.discordProfile(targetId, interaction.guildId!, interaction.id);
            await interaction.editReply(
              !profile
                ? targetId === interaction.user.id
                  ? 'Connect your Discord account first with /connect. Then run /achievements again.'
                  : 'This member has not connected a DevLoot account.'
                : this.achievementsMessage(profile),
            );
            return;
          }
          case 'bounties':
            await this.discovery.handleBounties(interaction);
            return;
          case 'issue':
            await this.discovery.handleIssue(interaction);
            return;
          case 'setup-server':
            await this.setup.handleSetupServer(interaction);
            return;
          default:
            await interaction.reply({
              content: 'This command is not available in the DevLoot development server.',
              flags: MessageFlags.Ephemeral,
            });
            return;
        }
      }
      if (interaction.isButton()) {
        await this.components.dispatch(interaction);
        return;
      }
      await interaction.reply({
        content: 'This action has expired. Run the command again to get a new button.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      this.logger.error({
        event: 'interaction_failed',
        requestId: interaction.id,
        guildId: interaction.guildId,
        failure: error instanceof CoreApiError ? error.kind : 'internal',
        ...(error instanceof CoreApiError && error.status ? { coreStatus: error.status } : {}),
      });
      try {
        const reason = error instanceof CoreApiError && error.kind === 'unavailable'
          ? 'DevLoot did not respond.'
          : error instanceof CoreApiError && error.status === 401
            ? 'DevLoot could not verify this request.'
            : 'Something went wrong.';
        const content = `${reason} Try again in a moment. If it keeps happening, share this reference: ${interaction.id}`;
        if (interaction.deferred) await interaction.editReply({ content });
        else if (!interaction.replied)
          await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        else
          await interaction.followUp({
            content,
            flags: MessageFlags.Ephemeral,
          });
      } catch {
        this.logger.warn({
          event: 'interaction_reply_failed',
          requestId: interaction.id,
        });
      }
    }
  }

  private profileUrl(profile: DiscordProfile): string | null {
    if (!profile.username) return null;
    const url = new URL(`/profile/@${encodeURIComponent(profile.username)}`, this.config.value.coreWebUrl);
    return url.toString();
  }

  private connectedMessage(profile: DiscordProfile | null): string {
    const url = profile && this.profileUrl(profile);
    return `Connected to DevLoot${profile?.username ? ` as @${escapeMarkdown(profile.username)}` : ''}. ${url ? `Your profile: ${url}` : 'Use /profile to see your builder card.'}`;
  }

  private shareRow(discordId: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(makeComponentId({ feature: 'profile', action: 'share', entityId: discordId }))
        .setLabel('Share profile')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  private profileEmbed(profile: DiscordProfile): EmbedBuilder {
    const name = profile.username ? `@${escapeMarkdown(profile.username.slice(0, 60))}` : 'DevLoot member';
    const embed = new EmbedBuilder()
      .setTitle(`${name} · builder profile`)
      .setColor(0x20bd6c);
    const url = this.profileUrl(profile);
    if (url) embed.setURL(url);
    embed.addFields(
        { name: 'DevLoot tier', value: profile.tier, inline: true },
        { name: 'XP', value: String(profile.xp), inline: true },
        { name: 'Bounties won', value: String(profile.bountiesWon), inline: true },
        { name: 'Bounties claimed', value: String(profile.bountiesClaimed), inline: true },
        { name: 'Bounties created', value: String(profile.bountiesCreated), inline: true },
        { name: 'Projects', value: String(profile.projectsOwned), inline: true },
        { name: 'Achievements earned', value: String(profile.achievementsEarned), inline: true },
      );
    if (profile.github) embed.addFields(
      { name: 'GitHub repos', value: String(profile.github.publicRepos), inline: true },
      { name: 'GitHub stars', value: String(profile.github.totalStars), inline: true },
      { name: 'Followers', value: String(profile.github.followers), inline: true },
    );
    embed.setFooter({ text: `Joined ${profile.joinedAt.slice(0, 10)}${profile.github ? ` · GitHub snapshot ${profile.github.updatedAt.slice(0, 10)}` : ''}` });
    return embed;
  }

  private async profileCard(profile: DiscordProfile) {
    const embed = this.profileEmbed(profile);
    let image: Buffer | null;
    try {
      image = await renderProfileSections(profile);
    } catch {
      this.logger.warn({ event: 'profile_sections_render_failed' });
      return { embeds: [embed], files: [] as AttachmentBuilder[] };
    }
    if (!image) return { embeds: [embed], files: [] as AttachmentBuilder[] };
    embed.setImage('attachment://devloot-profile-sections.png');
    const alt = [
      `First bounty claim: ${profile.bountiesClaimed > 0 ? 'complete' : 'not yet claimed'}.`,
      profile.assessment?.stack.length ? `Tech stack: ${profile.assessment.stack.slice(0, 6).join(', ')}.` : '',
      profile.achievements.length ? `Recent achievements: ${profile.achievements.slice(0, 3).map((item) => item.name).join(', ')}.` : '',
    ].join(' ').slice(0, 900);
    const file = new AttachmentBuilder(image, { name: 'devloot-profile-sections.png' })
      .setDescription(alt);
    return { embeds: [embed], files: [file] };
  }

  private achievementsMessage(profile: DiscordProfile): string {
    const name = profile.username ? `@${escapeMarkdown(profile.username.slice(0, 60))}` : 'This member';
    const url = this.profileUrl(profile);
    if (!profile.achievements.length)
      return `${name} has no achievements on DevLoot yet.${url ? `\nProfile: ${url}` : ''}`;
    const lines = profile.achievements.map(
      (item) => `• **${escapeMarkdown(item.name.slice(0, 80))}**${item.project ? ` · ${escapeMarkdown(item.project.slice(0, 60))}` : ''} · ${item.points} points`,
    );
    const heading = profile.achievements.length === profile.achievementsEarned
      ? `${name}'s achievements:`
      : `${name}'s latest ${profile.achievements.length} of ${profile.achievementsEarned} achievements:`;
    return `${heading}\n${lines.join('\n')}${url ? `\nProfile: ${url}` : ''}`;
  }

  private async checkConnection(interaction: ButtonInteraction, discordId: string) {
    if (interaction.user.id !== discordId) {
      await interaction.reply({ content: 'Only the person who started this link can check it.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    const profile = await this.core.discordProfile(discordId, interaction.guildId!, interaction.id);
    if (profile) await interaction.editReply({ content: this.connectedMessage(profile), components: [] });
    else await interaction.editReply({ content: 'Not connected yet. Finish the steps on the DevLoot website, then press Check connection again.' });
  }

  private async shareProfile(interaction: ButtonInteraction, discordId: string) {
    if (interaction.user.id !== discordId) {
      await interaction.reply({ content: 'Only the profile owner can share this card.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    const profile = await this.core.discordProfile(discordId, interaction.guildId!, interaction.id);
    if (!profile) {
      await interaction.editReply('This Discord account is disconnected. Use /connect to link it again.');
      return;
    }
    await interaction.editReply({ ...await this.profileCard(profile), allowedMentions: { parse: [] } });
  }
}
