# DevLoot Discord Bot

The community engine for **DevLoot**, an open-source bounty marketplace on Algorand.

The bot handles member onboarding, bounty proposals and reaction voting, XP and gamification, and live bounty notifications inside a Discord server. It is a NestJS application built on `discord.js` v14, backed by Prisma and PostgreSQL.

---

## What It Does

| Area | Behaviour |
|---|---|
| **Onboarding** | Welcomes new server members and provides a verification button. Seven commands stay locked until onboarding is completed (see [Onboarding Gate](#onboarding-gate)). |
| **Bounty Proposals** | Members suggest a GitHub issue with a desired bounty amount via `/propose`. Proposals are saved to the database, published to the suggestions channel, and voted on via emoji reactions. |
| **XP & Gamification** | Members earn XP through daily claims and quest completions, progress across tiers (`Newcomer`, `Builder`, `Hunter`, `Legend`), maintain daily streaks, and rank on a global leaderboard. |
| **Quests** | Single quest currently active: propose a bounty in the proposals channel (awards 25 XP automatically upon posting). |
| **Bounty Feed** | Publishes rich embed announcements to a designated feed channel whenever bounties are created or updated. |
| **Open Source Chef** | A scheduled weekly check (7-day window) assigns or revokes a special Chef role based on whether the member created or claimed bounties in the past week. |
| **Moderation & Threads** | Automated channel moderation and automated thread creation support for structured discussion. |

---

## Slash Commands

Commands are registered at startup via `src/discord/discord.gateway.ts`, either globally or scoped to a specific guild when `DISCORD_GUILD_ID` is configured.

| Command | Purpose | Required Arguments | Access Restrictions |
|---|---|---|---|
| `/propose` | Suggest a GitHub issue for a bounty | `message` (string)<br>`issue_url` (string)<br>`bounty_amount` (number, min 1) | Onboarding required |
| `/daily` | Claim your daily XP reward and extend streak | — | Onboarding required |
| `/rank` | View your current XP, level, and tier | — | Onboarding required |
| `/quests` | Display available server quests | — | Onboarding required |
| `/proposals` | List recent bounty proposals | — | Onboarding required |
| `/onboarding` | Trigger the interactive onboarding workflow | — | Everyone |
| `/leaderboard` | View top server members ranked by XP | — | Onboarding required |
| `/sync-points` | Reconcile and sync XP from bounty activity | — | **Administrator** (runtime permission guard) |
| `/setup-server` | Configure required server channels and roles | — | **Administrator** (registration default permission + runtime guard) |
| `/check-chef` | Manually run the Open Source Chef role check | — | **Administrator** (registration default permission + runtime guard) |

### Onboarding Gate

`src/discord/services/command-dispatcher.service.ts` enforces an onboarding prerequisite for the following seven commands:
* `propose`
* `daily`
* `rank`
* `quests`
* `proposals`
* `leaderboard`
* `sync-points`

Non-onboarded users invoking these commands receive an ephemeral prompt directing them to complete `/onboarding` first. `/onboarding`, `/setup-server`, and `/check-chef` are exempt from the onboarding gate.

### Administrator Enforcement

All three admin commands enforce strict administrator authorization, with layered checks:
1. **Runtime Guards:** All three commands check `Administrator` permissions at invocation time:
   - `/setup-server`: checked in `src/discord/handlers/discord-setup.service.ts` (`!interaction.memberPermissions?.has('Administrator')`).
   - `/check-chef`: checked in `src/discord/services/command-dispatcher.service.ts` (`!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)`).
   - `/sync-points`: checked in `src/discord/services/command-dispatcher.service.ts` (`!interaction.memberPermissions?.has('Administrator')`).
2. **Registration Defaults:** In `src/discord/discord.gateway.ts`, `/setup-server` and `/check-chef` also call `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`. This hints the Discord UI to hide the commands from non-admin users in the slash command autocomplete menu. `/sync-points` relies solely on the runtime check.

---

## Repository Map

```
src/
├── main.ts                           Bootstrap file; binds HTTP server to BOT_PORT (default 3001)
├── app.module.ts                     Root NestJS module wiring Discord, Prisma, and AI modules
├── discord/
│   ├── discord.module.ts             Discord client provider with configured Gateway intents
│   ├── discord.gateway.ts            Slash command registration, client events, and routing
│   ├── commands/                     Slash command definitions and interaction handlers
│   │   ├── onboarding.ts             /onboarding
│   │   ├── propose.ts                /propose
│   │   ├── daily.ts                  /daily
│   │   ├── rank.ts                   /rank
│   │   ├── quest.ts                  /quests
│   │   ├── proposals.ts              /proposals
│   │   └── leaderboard.ts            /leaderboard
│   ├── handlers/                     Interaction handlers
│   │   ├── discord-setup.service.ts  Server setup execution (/setup-server)
│   │   └── welcome.service.ts        Member join & verification button handler
│   └── services/                     Domain services (see table below)
├── ai/
│   ├── ai.module.ts                  AI module provider
│   └── ai.service.ts                 OpenRouter model integrations
└── prisma/
    ├── prisma.module.ts              Prisma module provider
    └── prisma.service.ts             Prisma database client lifecycle
prisma/
├── schema.prisma                     Data models, relations, and enums
└── migrations/                       Database migration history
```

### Services

| Service | File | Responsibility |
|---|---|---|
| Command Dispatcher | `src/discord/services/command-dispatcher.service.ts` | Routes interactions, validates onboarding gate and admin privileges |
| Discord XP | `src/discord/services/discord-xp.service.ts` | Calculates XP rewards, tier promotions, and daily streaks |
| XP Sync | `src/discord/services/xp-sync.service.ts` | Reconciles off-chain XP based on Algorand bounty activity |
| Discord Role | `src/discord/services/discord-role.service.ts` | Manages Discord role grants (tiers, newcomer, and weekly Chef role) |
| Proposal Vote | `src/discord/services/proposal-vote.service.ts` | Manages reaction-based voting and threshold tallying on proposals |
| Discord Notification | `src/discord/services/discord-notification.service.ts` | Dispatches rich embeds to the bounty feed channel |
| Chef Scheduler | `src/discord/services/chef-scheduler.service.ts` | Cron scheduler running weekly Open Source Chef audits |
| Channel Moderation | `src/discord/services/channel-moderation.service.ts` | Enforces message rules and cleans unauthorized messages |
| Auto Threading | `src/discord/services/auto-threading.service.ts` | Creates discussion threads on new bounty announcements |
| Discord Guild | `src/discord/services/discord-guild.service.ts` | Guild, channel, and role resolution helpers |

### Data Model

Defined in [`prisma/schema.prisma`](prisma/schema.prisma).

#### Complete Model Inventory
* `Project`: Tracked development projects.
* `Repository`: GitHub repositories linked to projects.
* `ProjectRepository`: Association mapping between projects and repositories.
* `UserRepository`: Association mapping between contributors and repositories.
* `Bounty`: Registered bounties with monetary reward, status, and metadata.
* `User`: Discord users, wallet addresses, XP totals, and streak counters.
* `Notification`: In-app and Discord notification events.
* `BountyMessage`: Chat messages and audit history tied to bounties.
* `Transaction`: Financial and point transaction ledger.
* `Proposal`: Community-submitted bounty proposals.
* `ProposalVote`: Upvote/downvote reaction records on proposals.
* `QuestCompletion`: Records of completed quests by user.
* `DailyStreak`: Daily activity timestamps and current streak lengths.

#### Enums
* `BountyStatus`: Lifecycle state of a bounty (`OPEN`, `IN_PROGRESS`, `SUBMITTED`, `COMPLETED`, `CANCELLED`).
* `BountyMessageType`: Context type for bounty messages (`GENERAL`, `SUBMISSION`, `REVIEW`).
* `TransactionType`: Ledger categories for transactions.

---

## Getting Started

### Prerequisites

* Node.js (v18+) and npm
* PostgreSQL database instance accessible via connection URI
* Discord Application & Bot Token created in the [Discord Developer Portal](https://discord.com/developers/applications)

#### Privileged Gateway Intents
The bot configures five gateway intents in `src/discord/discord.module.ts`:
* `GatewayIntentBits.Guilds`
* `GatewayIntentBits.GuildMembers` *(Privileged)*
* `GatewayIntentBits.GuildMessages`
* `GatewayIntentBits.MessageContent` *(Privileged)*
* `GatewayIntentBits.GuildMessageReactions`

> [!IMPORTANT]
> You **must** enable `GuildMembers` and `MessageContent` under the **Privileged Gateway Intents** section of your bot's settings in the Discord Developer Portal, otherwise the bot will fail to start or crash upon receiving guild events.

### Environment Variables

Configure the following variables in a `.env` file at the repository root:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string consumed directly by Prisma |
| `DISCORD_BOT_TOKEN` | Discord bot secret token |
| `DISCORD_CLIENT_ID` | Discord application client ID (for registering slash commands) |
| `DISCORD_GUILD_ID` | Optional guild ID; if set, registers slash commands instantly to this guild instead of global propagation |
| `DISCORD_BOUNTY_FEED_CHANNEL` | Channel ID for bounty feed embed announcements |
| `DISCORD_BOUNTY_SUGGESTIONS_CHANNEL_ID` | Channel ID where `/propose` suggestions are posted |
| `DISCORD_SCOUT_ROLE_ID` | Role ID assigned to community scouts |
| `ROLE_NEWCOMER` | Role ID granted upon completing onboarding |
| `ROLE_BUILDER` | Tier 1 role awarded at 500 XP |
| `ROLE_HUNTER` | Tier 2 role awarded at 2,000 XP |
| `ROLE_LEGEND` | Tier 3 role awarded at 5,000 XP |
| `GITHUB_TOKEN` | Personal access token for GitHub API issue lookups in `/propose` and feed notifications |
| `OPENROUTER_API_KEY` | API key for OpenRouter models in `src/ai/ai.service.ts` |
| `CLIENT_URL` | Public web app URL (defaults to `https://devloot.app`) |
| `BOT_PORT` | HTTP server port (defaults to `3001`) |

### Development & Build Scripts

These scripts are defined in [`package.json`](package.json). They cover local compilation, development watchers, and code formatting only (this repository does not include containerization or hosting configurations):

| Script | Command | Purpose |
|---|---|---|
| `npm run build` | `nest build` | Compiles TypeScript source to JavaScript into `dist/` |
| `npm run start` | `nest start` | Runs the compiled bot |
| `npm run start:dev` | `prisma generate && nest start --watch` | Runs Prisma code generator and starts Nest in watch mode |
| `npm run start:debug` | `nest start --debug --watch` | Starts Nest in debug mode with inspector attached |
| `npm run start:prod` | `node dist/src/main` | Runs the compiled production bundle (requires `npm run build` first) |
| `npm run lint` | `eslint "{src,apps,libs,test}/**/*.ts" --fix` | Runs ESLint and applies automated fixes |
| `npm run format` | `prettier --write "src/**/*.ts" "test/**/*.ts"` | Formats code with Prettier |

### Standard Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma Client
npx prisma generate

# 3. Apply database migrations
npx prisma migrate dev

# 4. Start the bot in development mode
npm run start:dev
```

---

## Contributing

Open bounties and contribution guidelines are maintained in [`BOUNTIES.md`](BOUNTIES.md).

## License

`UNLICENSED` (private commercial software per [`package.json`](package.json)).
