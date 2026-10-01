import { Injectable } from '@nestjs/common';
import {
  ChannelType,
  Guild,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PilotConfig } from '../../config/pilot.config';

export const PILOT_CHANNELS = [
  {
    key: 'onboarding',
    name: 'onboarding',
    description: 'Development bot commands. Start with /ping and /status.',
  },
  {
    key: 'opportunities',
    name: 'opportunities',
    description: 'Test issue and bounty discovery.',
  },
  {
    // Keep the saved mapping key and topic marker so existing pilot channels retain their IDs.
    key: 'shipped',
    name: 'bounty-claims',
    description: 'Verified DevLoot bounty claim announcements.',
  },
  {
    key: 'missions',
    name: 'missions',
    description: 'Development mission discussions.',
  },
  {
    key: 'moderatorReview',
    name: 'moderator-review',
    description: 'Private moderator review. No automated moderation enabled.',
  },
] as const;
type ChannelKey = (typeof PILOT_CHANNELS)[number]['key'];
interface SetupState {
  version: 1;
  guildId: string;
  clientId: string;
  moderatorRoleId?: string;
  channels: Partial<Record<ChannelKey, string>>;
}

@Injectable()
export class DiscordSetupService {
  constructor(private readonly config: PilotConfig) {}

  async managedChannelId(key: ChannelKey): Promise<string | null> {
    return (await this.readState()).channels[key] ?? null;
  }
  private get statePath() {
    return join(
      this.config.value.stateDirectory,
      `${this.config.value.guildId}.json`,
    );
  }

  private async readState(): Promise<SetupState> {
    let value: SetupState;
    try {
      value = JSON.parse(await readFile(this.statePath, 'utf8')) as SetupState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Invalid pilot setup mapping');
      return {
        version: 1,
        guildId: this.config.value.guildId,
        clientId: this.config.value.clientId,
        channels: {},
      };
    }
    if (
      value.version !== 1 ||
      value.guildId !== this.config.value.guildId ||
      value.clientId !== this.config.value.clientId ||
      !value.channels ||
      typeof value.channels !== 'object'
    ) {
      throw new Error(
        'Pilot mapping belongs to another guild/application or is invalid',
      );
    }
    const ids = [
      value.moderatorRoleId,
      ...Object.values(value.channels),
    ].filter((x) => x !== undefined);
    if (ids.some((id) => typeof id !== 'string' || !/^\d{17,20}$/.test(id)))
      throw new Error('Invalid pilot mapping IDs');
    if (
      new Set(Object.values(value.channels)).size !==
      Object.values(value.channels).length
    )
      throw new Error('Pilot channel mappings must be unique');
    return value;
  }
  private async save(state: SetupState) {
    const temp = `${this.statePath}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2) + '\n', {
      mode: 0o600,
    });
    await rename(temp, this.statePath);
  }
  private async inspect(guild: Guild) {
    this.config.assertGuild(guild.id);
    if (guild.client.user.id !== this.config.value.clientId)
      throw new Error('Discord application identity mismatch');
    const state = await this.readState();
    const [channels, roles, me] = await Promise.all([
      guild.channels.fetch(),
      guild.roles.fetch(),
      guild.members.fetchMe(),
    ]);
    const permissions = PermissionFlagsBits;
    if (
      !me.permissions.has([permissions.ManageChannels, permissions.ManageRoles])
    )
      throw new Error('Bot needs Manage Channels and Manage Roles for setup');
    if (state.moderatorRoleId) {
      const role = roles.get(state.moderatorRoleId);
      if (!role || role.id === guild.id || role.managed)
        throw new Error('Mapped moderator role is missing or unsuitable');
    } else if (roles.some((role) => role.name === 'DevLoot Test Moderator')) {
      throw new Error(
        'Existing moderator role requires an explicit moderatorRoleId mapping',
      );
    }
    for (const definition of PILOT_CHANNELS) {
      const id = state.channels[definition.key];
      const marker = this.marker(definition.key);
      const marked = channels.filter(
        (c) => c?.type === ChannelType.GuildText && c.topic?.includes(marker),
      );
      if (!id && marked.size === 1)
        state.channels[definition.key] = marked.first()!.id;
      if (!id && marked.size > 1)
        throw new Error(`Multiple managed channels for ${definition.key}`);
      const mappedId = state.channels[definition.key];
      if (mappedId) {
        const channel = channels.get(mappedId);
        if (!channel || channel.type !== ChannelType.GuildText)
          throw new Error(
            `Mapped ${definition.key} is missing or not a text channel`,
          );
        if (
          !channel
            .permissionsFor(me)
            ?.has([
              permissions.ViewChannel,
              permissions.SendMessages,
              permissions.ReadMessageHistory,
            ])
        ) {
          throw new Error(`Bot cannot use mapped ${definition.key}`);
        }
        if (definition.key === 'moderatorReview') {
          // Explicit member/role allows could override @everyone's deny; refuse ambiguous privacy.
          const overwrites = channel.permissionOverwrites.cache;
          if (
            !overwrites.get(guild.id)?.deny.has(permissions.ViewChannel) ||
            overwrites.some(
              (o) =>
                o.id !== guild.id &&
                o.id !== me.id &&
                o.id !== state.moderatorRoleId &&
                o.allow.has(permissions.ViewChannel),
            )
          ) {
            throw new Error(
              'Mapped moderator-review channel is not restricted to the configured moderators and bot',
            );
          }
          if (
            !state.moderatorRoleId ||
            !channel
              .permissionsFor(state.moderatorRoleId)
              ?.has([
                permissions.ViewChannel,
                permissions.SendMessages,
                permissions.ReadMessageHistory,
              ])
          ) {
            throw new Error(
              'Configured moderators cannot use moderator-review',
            );
          }
        }
      } else if (channels.some((c) => c?.name === definition.name)) {
        throw new Error(
          `Existing #${definition.name} requires an explicit channel ID mapping; no channel was changed`,
        );
      }
    }
    return { state, me };
  }
  private marker(key: ChannelKey) {
    return `[devloot-pilot:${this.config.value.clientId}:${key}]`;
  }

  async preview(guild: Guild): Promise<string[]> {
    const { state } = await this.inspect(guild);
    return [
      `${state.moderatorRoleId ? 'Already set up' : 'Will create'}: DevLoot Test Moderator role`,
      ...PILOT_CHANNELS.map(
        (c) =>
          `${state.channels[c.key] ? 'Already set up' : 'Will create'}: #${c.name}${c.key === 'moderatorReview' ? ' (private)' : ''}`,
      ),
    ];
  }

  async apply(guild: Guild): Promise<string[]> {
    this.config.assertGuild(guild.id);
    await mkdir(this.config.value.stateDirectory, {
      recursive: true,
      mode: 0o700,
    });
    const lockPath = `${this.statePath}.lock`;
    // Exclusive lock also protects against a simultaneous CLI + slash-command setup.
    let lock: Awaited<ReturnType<typeof open>>;
    try {
      lock = await open(lockPath, 'wx', 0o600);
    } catch {
      throw new Error(
        'Setup is already running; inspect the setup lock if a previous process crashed',
      );
    }
    try {
      const { state, me } = await this.inspect(guild);
      const results: string[] = [];
      if (!state.moderatorRoleId) {
        const role = await guild.roles.create({
          name: 'DevLoot Test Moderator',
          permissions: [],
          reason: 'DevLoot development pilot setup',
        });
        state.moderatorRoleId = role.id;
        await this.save(state);
        results.push(`Created moderator role ${role.id}`);
      } else {
        results.push('Already set up: DevLoot Test Moderator role');
      }
      for (const definition of PILOT_CHANNELS) {
        if (state.channels[definition.key]) {
          results.push(`Already set up: #${definition.name}`);
          continue;
        }
        const privateChannel = definition.key === 'moderatorReview';
        const access = [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ];
        const channel = await guild.channels.create({
          name: definition.name,
          type: ChannelType.GuildText,
          topic: `${definition.description} ${this.marker(definition.key)}`,
          permissionOverwrites: [
            {
              id: guild.id,
              ...(privateChannel
                ? { deny: [PermissionFlagsBits.ViewChannel] }
                : { allow: access }),
            },
            { id: me.id, allow: access },
            ...(privateChannel
              ? [{ id: state.moderatorRoleId, allow: access }]
              : []),
          ],
          reason: 'DevLoot development pilot setup',
        });
        state.channels[definition.key] = channel.id;
        await this.save(state);
        results.push(`Created #${definition.name} (${channel.id})`);
      }
      await this.save(state);
      return results;
    } finally {
      await lock.close();
      await rm(lockPath);
    }
  }

  async handleSetupServer(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    this.config.assertGuild(interaction.guildId);
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content: 'Only server admins can run this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.guild) throw new Error('Guild not available');
    const apply = interaction.options.getBoolean('apply') === true;
    const results = await (apply
      ? this.apply(interaction.guild)
      : this.preview(interaction.guild));
    await interaction.editReply(
      `${apply ? 'Setup finished.' : 'Preview only. Nothing changed. Use `/setup-server apply:true` to create anything missing.'}\n${results.join('\n')}`,
    );
  }
}
