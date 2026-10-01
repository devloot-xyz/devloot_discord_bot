import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageFlags,
  escapeMarkdown,
} from 'discord.js';
import { PilotConfig } from '../config/pilot.config';
import { CoreApiClient, CoreApiError } from '../core/core-api.client';
import { makeComponentId, PilotComponentRouter } from './component-router';
import { DiscordSetupService } from './handlers/discord-setup.service';

type BountyStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'READY_FOR_CLAIM'
  | 'DISPUTED'
  | 'CLAIMED'
  | 'PAID'
  | 'CANCELLED'
  | 'REFUNDABLE'
  | 'REFUNDED';
interface Bounty {
  id: number;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  issueTitle: string | null;
  issueDescription: string | null;
  amount: number;
  status: BountyStatus;
}
interface IssueRef {
  owner: string;
  repo: string;
  number: number;
}
interface Issue extends IssueRef {
  title: string;
  body: string | null;
  state: 'open' | 'closed';
}
interface DiscoveryState {
  version: 1;
  guildId: string;
  clientId: string;
  coreApiUrl: string;
  issues: Record<string, IssueRef>;
  threads: Record<string, string>;
}

const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const FUNDED = new Set<BountyStatus>([
  'OPEN',
  'IN_REVIEW',
  'READY_FOR_CLAIM',
  'DISPUTED',
]);

export function parseIssueUrl(input: string): IssueRef | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (
    parts.length !== 4 ||
    parts[2] !== 'issues' ||
    !OWNER.test(parts[0]) ||
    !REPO.test(parts[1])
  )
    return null;
  const number = Number(parts[3]);
  return Number.isSafeInteger(number) &&
    number > 0 &&
    String(number) === parts[3]
    ? { owner: parts[0], repo: parts[1], number }
    : null;
}

function parseBounty(value: unknown): Bounty {
  if (!value || typeof value !== 'object') throw new Error('Invalid bounty');
  const b = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(b.id) ||
    Number(b.id) < 1 ||
    typeof b.repoOwner !== 'string' ||
    !OWNER.test(b.repoOwner) ||
    typeof b.repoName !== 'string' ||
    !REPO.test(b.repoName) ||
    !Number.isSafeInteger(b.issueNumber) ||
    Number(b.issueNumber) < 1 ||
    typeof b.amount !== 'number' ||
    !Number.isSafeInteger(b.amount) ||
    b.amount < 0 ||
    typeof b.status !== 'string'
  )
    throw new Error('Invalid bounty');
  if (b.issueTitle != null && typeof b.issueTitle !== 'string')
    throw new Error('Invalid bounty title');
  if (b.issueDescription != null && typeof b.issueDescription !== 'string')
    throw new Error('Invalid bounty description');
  return b as unknown as Bounty;
}

function parseIssue(value: unknown): Issue {
  if (!value || typeof value !== 'object') throw new Error('Invalid issue');
  const i = value as Record<string, unknown>;
  if (
    typeof i.owner !== 'string' ||
    !OWNER.test(i.owner) ||
    typeof i.repo !== 'string' ||
    !REPO.test(i.repo) ||
    !Number.isSafeInteger(i.number) ||
    Number(i.number) < 1 ||
    typeof i.title !== 'string' ||
    (i.body !== null && typeof i.body !== 'string') ||
    !['open', 'closed'].includes(String(i.state))
  )
    throw new Error('Invalid issue');
  return i as unknown as Issue;
}

function issueKey(ref: IssueRef): string {
  return `i_${createHash('sha256').update(`${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`).digest('hex').slice(0, 24)}`;
}
function bountyKey(id: number): string {
  return `b_${id}`;
}
function compact(value: string | null, max = 200): string {
  return value
    ? escapeMarkdown(value.replace(/\s+/g, ' ').trim().slice(0, max))
    : '';
}

/** GitHub issue bodies are Markdown documents, not Discord card copy. */
export function issueExcerpt(value: string | null, max = 140): string {
  if (!value) return '';
  const plain = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/[^\s)>\]]+/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#>~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  const clipped =
    plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
  return escapeMarkdown(clipped);
}

/** Public discovery; only a deliberate Discuss click can create a guild thread. */
export class DiscoveryService {
  constructor(
    private readonly client: Client,
    private readonly config: PilotConfig,
    private readonly core: CoreApiClient,
    private readonly setup: DiscordSetupService,
    router: PilotComponentRouter,
  ) {
    for (const action of ['view', 'discuss'] as const) {
      router.register('work', action, (interaction, key) =>
        this.handleButton(interaction, key, action),
      );
    }
  }

  private get statePath() {
    return join(
      this.config.value.stateDirectory,
      `${this.config.value.guildId}.discovery.json`,
    );
  }
  private freshState(): DiscoveryState {
    return {
      version: 1,
      guildId: this.config.value.guildId,
      clientId: this.config.value.clientId,
      coreApiUrl: this.config.value.coreApiUrl,
      issues: {},
      threads: {},
    };
  }
  private async readState(): Promise<DiscoveryState> {
    let state: DiscoveryState;
    try {
      state = JSON.parse(
        await readFile(this.statePath, 'utf8'),
      ) as DiscoveryState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return this.freshState();
      throw new Error('Invalid discovery mapping');
    }
    if (
      state.version !== 1 ||
      state.guildId !== this.config.value.guildId ||
      state.clientId !== this.config.value.clientId ||
      state.coreApiUrl !== this.config.value.coreApiUrl ||
      !state.issues ||
      !state.threads ||
      typeof state.issues !== 'object' ||
      typeof state.threads !== 'object'
    )
      throw new Error('Invalid discovery mapping');
    return state;
  }
  private async saveState(state: DiscoveryState): Promise<void> {
    const temp = `${this.statePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2) + '\n', {
      mode: 0o600,
    });
    await rename(temp, this.statePath);
  }
  private async locked<T>(
    action: (state: DiscoveryState) => Promise<T>,
  ): Promise<T> {
    await mkdir(this.config.value.stateDirectory, {
      recursive: true,
      mode: 0o700,
    });
    const lockPath = `${this.statePath}.lock`;
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        lock = await open(lockPath, 'wx', 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const age = await stat(lockPath)
          .then((file) => Date.now() - file.mtimeMs)
          .catch(() => 0);
        if (age > 30_000) {
          await rm(lockPath, { force: true });
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!lock) throw new Error('Discovery is busy; retry shortly');
    try {
      return await action(await this.readState());
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }

  private async listBounties(
    query: { status: string; repository?: string; page: number },
    requestId: string,
  ): Promise<{ data: Bounty[]; total: number }> {
    let owner: string | undefined;
    let repo: string | undefined;
    if (query.repository) {
      const parts = query.repository.split('/');
      if (parts.length !== 2 || !OWNER.test(parts[0]) || !REPO.test(parts[1]))
        throw new Error('Repository must be owner/repository.');
      [owner, repo] = parts;
    }
    return this.core.getQuery(
      '/api/bounties',
      {
        status: query.status,
        repoOwner: owner,
        repoName: repo,
        page: query.page,
        limit: 3,
      },
      (body) => {
        if (!body || typeof body !== 'object') throw new Error('Invalid list');
        const result = body as Record<string, unknown>;
        if (!Array.isArray(result.data) || !Number.isSafeInteger(result.total))
          throw new Error('Invalid list');
        return {
          data: result.data.map(parseBounty),
          total: Number(result.total),
        };
      },
      requestId,
    );
  }
  private bounty(id: number, requestId: string): Promise<Bounty> {
    return this.core.get(`/api/bounties/${id}`, parseBounty, requestId);
  }
  private issue(ref: IssueRef, requestId: string): Promise<Issue> {
    return this.core.get(
      `/api/issues/${ref.owner}/${ref.repo}/${ref.number}`,
      parseIssue,
      requestId,
    );
  }
  private async issueBounty(
    ref: IssueRef,
    requestId: string,
  ): Promise<Bounty | null> {
    const result = await this.core.getQuery(
      '/api/bounties',
      {
        repoOwner: ref.owner,
        repoName: ref.repo,
        issueNumber: ref.number,
        limit: 1,
      },
      (body) => {
        if (
          !body ||
          typeof body !== 'object' ||
          !Array.isArray((body as Record<string, unknown>).data)
        )
          throw new Error('Invalid list');
        return (body as { data: unknown[] }).data.map(parseBounty);
      },
      requestId,
    );
    return (
      result.find(
        (b) =>
          b.repoOwner.toLowerCase() === ref.owner.toLowerCase() &&
          b.repoName.toLowerCase() === ref.repo.toLowerCase() &&
          b.issueNumber === ref.number,
      ) ?? null
    );
  }
  private async repositoryHasLanguage(
    owner: string,
    repo: string,
    language: string,
    requestId: string,
  ): Promise<boolean> {
    const languages = await this.core.get(
      `/api/github/languages/${owner}/${repo}`,
      (body) => {
        if (
          !body ||
          typeof body !== 'object' ||
          !Array.isArray((body as Record<string, unknown>).languages)
        )
          throw new Error('Invalid repository languages');
        return (body as { languages: unknown[] }).languages.map((value) => {
          if (
            !value ||
            typeof value !== 'object' ||
            typeof (value as Record<string, unknown>).name !== 'string'
          )
            throw new Error('Invalid repository language');
          return (value as { name: string }).name;
        });
      },
      requestId,
    );
    return languages.some(
      (name) => name.toLowerCase() === language.toLowerCase(),
    );
  }
  private journeyUrl(path: string): string {
    const url = new URL(path, this.config.value.coreWebUrl);
    url.searchParams.set(
      'discord_journey',
      randomBytes(12).toString('base64url'),
    );
    return url.toString();
  }
  private webUrl(key: string, bounty: Bounty | null, ref: IssueRef): string {
    return bounty && key.startsWith('b_')
      ? this.journeyUrl(`/bounty/${bounty.id}`)
      : this.journeyUrl(
          `/project/issue/${ref.owner}/${ref.repo}/${ref.number}`,
        );
  }
  private buttons(key: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          makeComponentId({ feature: 'work', action: 'view', entityId: key }),
        )
        .setLabel('Open in DevLoot')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(
          makeComponentId({
            feature: 'work',
            action: 'discuss',
            entityId: key,
          }),
        )
        .setLabel('Discuss here')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  private card(
    ref: IssueRef,
    title: string | null,
    state: string,
    body: string | null,
    bounty: Bounty | null,
    withMascot: boolean,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(
        issueExcerpt(title || `${ref.owner}/${ref.repo}#${ref.number}`, 90),
      )
      .setDescription(
        issueExcerpt(body) || 'Open the issue in DevLoot for details.',
      )
      .setColor(state === 'OPEN' || state === 'open' ? 0x20bd6c : 0x7591aa)
      .addFields(
        {
          name: 'Repository · issue',
          value: `${compact(`${ref.owner}/${ref.repo}`, 100)} · #${ref.number}`,
          inline: false,
        },
        {
          name: 'Status',
          value: state.replaceAll('_', ' ').toLowerCase(),
          inline: true,
        },
      );
    if (withMascot) embed.setThumbnail('attachment://devloot-bounties.png');
    if (bounty && FUNDED.has(bounty.status) && bounty.amount > 0) {
      embed.addFields({
        name: 'Funded reward',
        value: `$${(bounty.amount / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC`,
        inline: true,
      });
    }
    return embed;
  }

  private async mascot(): Promise<Buffer | null> {
    return readFile(
      join(process.cwd(), 'assets', 'devloot-bounties.png'),
    ).catch(() => null);
  }

  private mascotFile(buffer: Buffer): AttachmentBuilder {
    return new AttachmentBuilder(buffer, {
      name: 'devloot-bounties.png',
    }).setDescription('DevLoot bird mascot funding a bounty on a phone');
  }

  async handleBounties(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const repository =
      interaction.options.getString('repository')?.trim() || undefined;
    if (
      repository &&
      (repository.split('/').length !== 2 ||
        !OWNER.test(repository.split('/')[0]) ||
        !REPO.test(repository.split('/')[1]))
    ) {
      await interaction.editReply(
        'Enter a repository as `owner/repository`, for example `algorandfoundation/algokit-cli`.',
      );
      return;
    }
    const language = interaction.options.getString('language')?.trim();
    if (language) {
      if (!repository) {
        await interaction.editReply(
          'Choose a repository before filtering by language. For example: `repository:owner/repo language:TypeScript`.',
        );
        return;
      }
      if (language.length > 40 || !/^[A-Za-z0-9 +#.-]+$/.test(language)) {
        await interaction.editReply(
          'Enter a language name, such as `TypeScript`, `Python`, or `C++`.',
        );
        return;
      }
      const [owner, repo] = repository.split('/');
      if (
        !(await this.repositoryHasLanguage(
          owner,
          repo,
          language,
          interaction.id,
        ))
      ) {
        await interaction.editReply(
          `**${escapeMarkdown(repository)}** does not list **${escapeMarkdown(language)}** as a language. Try another language or remove that filter.`,
        );
        return;
      }
    }
    const status = interaction.options.getString('status') || 'OPEN';
    const page = interaction.options.getInteger('page') || 1;
    const result = await this.listBounties(
      { status, repository, page },
      interaction.id,
    );
    if (!result.data.length) {
      await interaction.editReply(
        'No bounties match your filters. Try a different status or repository.',
      );
      return;
    }
    const mascot = await this.mascot();
    const details = await Promise.all(
      result.data.map(async (b) => {
        const ref = {
          owner: b.repoOwner,
          repo: b.repoName,
          number: b.issueNumber,
        };
        const issue = await this.issue(ref, interaction.id).catch(() => null);
        return this.card(
          ref,
          issue?.title ?? b.issueTitle,
          b.status,
          issue?.body ?? b.issueDescription,
          b,
          mascot !== null,
        );
      }),
    );
    for (const [index, bounty] of result.data.entries()) {
      const response = {
        content:
          index === 0
            ? `Page ${page} · showing ${result.data.length} of ${result.total} ${status.toLowerCase().replaceAll('_', ' ')} bounties. Open a bounty in DevLoot or discuss it here.`
            : `Bounty ${index + 1} of ${result.data.length} on this page`,
        embeds: [details[index]],
        components: [this.buttons(bountyKey(bounty.id))],
        files: mascot ? [this.mascotFile(mascot)] : [],
      };
      if (index === 0) await interaction.editReply(response);
      else
        await interaction.followUp({
          ...response,
          flags: MessageFlags.Ephemeral,
        });
    }
  }

  async handleIssue(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ref = parseIssueUrl(interaction.options.getString('url', true));
    if (!ref) {
      await interaction.editReply(
        'Enter a GitHub issue link, such as `https://github.com/owner/repo/issues/123`.',
      );
      return;
    }
    let issue: Issue;
    try {
      issue = await this.issue(ref, interaction.id);
    } catch (error) {
      if (error instanceof CoreApiError && error.status === 404) {
        await interaction.editReply(
          'We could not find that GitHub issue. Check the link and try again.',
        );
        return;
      }
      throw error;
    }
    const bounty = await this.issueBounty(ref, interaction.id);
    const key = issueKey(ref);
    await this.locked(async (state) => {
      state.issues[key] = ref;
      await this.saveState(state);
    });
    const mascot = await this.mascot();
    await interaction.editReply({
      content:
        'Here is the issue. Open it in DevLoot for details, or start a discussion here.',
      embeds: [
        this.card(
          ref,
          issue.title,
          issue.state,
          issue.body,
          bounty,
          mascot !== null,
        ),
      ],
      components: [this.buttons(key)],
      files: mascot ? [this.mascotFile(mascot)] : [],
    });
  }

  private async resolve(
    key: string,
    requestId: string,
  ): Promise<{
    ref: IssueRef;
    bounty: Bounty | null;
    title: string;
    state: string;
  } | null> {
    if (/^b_[1-9]\d*$/.test(key)) {
      let bounty: Bounty;
      try {
        bounty = await this.bounty(Number(key.slice(2)), requestId);
      } catch (error) {
        if (error instanceof CoreApiError && error.status === 404) return null;
        throw error;
      }
      return {
        ref: {
          owner: bounty.repoOwner,
          repo: bounty.repoName,
          number: bounty.issueNumber,
        },
        bounty,
        title:
          bounty.issueTitle ||
          `${bounty.repoOwner}/${bounty.repoName}#${bounty.issueNumber}`,
        state: bounty.status,
      };
    }
    if (!/^i_[a-f0-9]{24}$/.test(key)) return null;
    const ref = (await this.readState()).issues[key];
    if (!ref || issueKey(ref) !== key) return null;
    let issue: Issue;
    try {
      issue = await this.issue(ref, requestId);
    } catch (error) {
      if (error instanceof CoreApiError && error.status === 404) return null;
      throw error;
    }
    const bounty = await this.issueBounty(ref, requestId);
    return { ref, bounty, title: issue.title, state: issue.state };
  }

  private async handleButton(
    interaction: ButtonInteraction,
    key: string,
    action: 'view' | 'discuss',
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const current = await this.resolve(key, interaction.id);
    if (!current) {
      await interaction.editReply(
        'This issue or bounty is no longer available. Run /bounties or /issue to find a current one.',
      );
      return;
    }
    if (action === 'view') {
      await interaction.editReply(
        `Status: **${current.state.toLowerCase().replaceAll('_', ' ')}**. Open in DevLoot: ${this.webUrl(key, current.bounty, current.ref)}`,
      );
      return;
    }
    if (current.state !== 'OPEN' && current.state !== 'open') {
      await interaction.editReply(
        `This ${current.bounty ? 'bounty' : 'issue'} is **${current.state.toLowerCase().replaceAll('_', ' ')}**, so a new discussion was not opened. View it in DevLoot: ${this.webUrl(key, current.bounty, current.ref)}`,
      );
      return;
    }
    const threadId = await this.discussionThread(
      issueKey(current.ref),
      current,
    );
    await interaction.editReply(
      `Discussion ready: <#${threadId}>\nView the issue in DevLoot: ${this.webUrl(key, current.bounty, current.ref)}`,
    );
  }

  private async discussionThread(
    key: string,
    current: { ref: IssueRef; title: string; bounty: Bounty | null },
  ): Promise<string> {
    const guild = await this.client.guilds.fetch(this.config.value.guildId);
    const parentId = await this.setup.managedChannelId('opportunities');
    if (!parentId)
      throw new Error('Run /setup-server before creating discussions');
    const parent = await guild.channels.fetch(parentId);
    if (!parent || parent.type !== ChannelType.GuildText)
      throw new Error('Managed opportunities channel is unavailable');
    const marker = `[DL:${key}]`;
    return this.locked(async (state) => {
      const storedId = state.threads[key];
      if (storedId) {
        const existing = await guild.channels.fetch(storedId).catch(() => null);
        if (existing?.isThread() && existing.parentId === parent.id)
          return existing.id;
        delete state.threads[key];
      }
      const active = await parent.threads.fetchActive();
      let existing = active.threads.find((thread) =>
        thread.name.includes(marker),
      );
      if (!existing) {
        const archived = await parent.threads.fetchArchived({
          type: 'public',
          limit: 100,
        });
        existing = archived.threads.find((thread) =>
          thread.name.includes(marker),
        );
      }
      const thread =
        existing ??
        (await parent.threads.create({
          name: `${`${current.ref.repo}#${current.ref.number} · ${current.title.replace(/\s+/g, ' ').slice(0, 40)}`.slice(0, 99 - marker.length)} ${marker}`,
          autoArchiveDuration: 1440,
          reason: `DevLoot development discussion ${key}`,
        }));
      state.threads[key] = thread.id;
      await this.saveState(state);
      if (!existing) {
        await thread
          .send({
            content: `**${compact(current.title, 160)}** · ${current.ref.owner}/${current.ref.repo}#${current.ref.number}\nView in DevLoot: ${this.webUrl(current.bounty ? bountyKey(current.bounty.id) : key, current.bounty, current.ref)}`,
            allowedMentions: { parse: [] },
          })
          .catch(() => undefined);
      }
      return thread.id;
    });
  }
}
