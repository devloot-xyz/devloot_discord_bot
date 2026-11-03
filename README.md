# DevLoot Discord Bot

The official Discord bot for the **DevLoot** ecosystem. DevLoot connects open-source developers with bounties and community rewards. This bot powers community engagement, XP tracking, daily claim streaks, GitHub verification onboarding, and bounty proposal voting directly within Discord servers.

Built with [NestJS](https://nestjs.com/), [Discord.js](https://discord.js.org/) v14, [Prisma ORM](https://www.prisma.io/), and PostgreSQL.

---

## Features

- **Gamification & XP Tracking**: Members earn XP for engagement, participating in community quests, and submitting bounty proposals.
- **Daily Rewards & Streaks**: `/daily` claim system rewarding daily streaks with progressive XP bonuses.
- **Leaderboards & Ranks**: Visual tier-based user rankings (`Newcomer`, `Builder`, `Hunter`, `Legend`) with real-time leaderboards.
- **Bounty Proposals & Community Voting**: Submit public GitHub issues for community voting with automatic AI summaries and thread creation. Voting is conducted via native emoji reactions (`👍`, `👎`, `💵`).
- **Onboarding & GitHub Verification**: Guided flow to link Discord accounts with GitHub profiles.
- **Automated Moderation & Threading**: Automatically creates dedicated discussion threads for proposal issues and manages channel roles.
- **Administrative Automation**: Setup server channels, sync XP points from bounty activity, and trigger weekly Open Source Chef tier checks.

---

## Registered Slash Commands

The bot registers exactly **ten (10)** slash commands. Commands and permissions are defined in [`src/discord/discord.gateway.ts`](./src/discord/discord.gateway.ts) and dispatched through [`src/discord/services/command-dispatcher.service.ts`](./src/discord/services/command-dispatcher.service.ts).

| Command | Arguments | Access Restrictions | Description | Source Verification |
| :--- | :--- | :--- | :--- | :--- |
| `/propose` | • `message` *(String, required)*: Pitch explaining why this issue matters<br>• `issue_url` *(String, required)*: Public GitHub issue URL<br>• `bounty_amount` *(Number, required, min: 1)*: Suggested bounty in USDC | **Requires Onboarding** | Submits a GitHub issue for bounty review. Generates an AI summary, spawns an auto-thread, and initializes reaction-based voting (`👍`, `👎`, `💵`). Auto-completes the `bounty_proposal` quest. | [`discord.gateway.ts:85`](./src/discord/discord.gateway.ts), [`propose.ts`](./src/discord/commands/propose.ts) |
| `/daily` | *None* | **Requires Onboarding** | Claims daily XP bonus (10 base XP + progressive streak bonus up to 30 XP). Enforces a 24-hour cooldown. | [`discord.gateway.ts:110`](./src/discord/discord.gateway.ts), [`daily.ts`](./src/discord/commands/daily.ts) |
| `/rank` | *None* | **Requires Onboarding** | Displays your current XP total, tier badge, progress towards the next tier, and active daily claim streak. | [`discord.gateway.ts:114`](./src/discord/discord.gateway.ts), [`rank.ts`](./src/discord/commands/rank.ts) |
| `/quests` | *None* | **Requires Onboarding** | Displays active community engagement quests, completion status, and available XP rewards. | [`discord.gateway.ts:117`](./src/discord/discord.gateway.ts), [`quest.ts`](./src/discord/commands/quest.ts) |
| `/proposals` | *None* | **Requires Onboarding** | Lists the top 10 most upvoted community bounty proposals submitted within the last 7 days. | [`discord.gateway.ts:120`](./src/discord/discord.gateway.ts), [`proposals.ts`](./src/discord/commands/proposals.ts) |
| `/onboarding` | *None* | **All Members** *(Exempt from onboarding check)* | Sends an ephemeral interactive onboarding card with buttons to link your GitHub profile and complete verification. | [`discord.gateway.ts:123`](./src/discord/discord.gateway.ts), [`onboarding.ts`](./src/discord/commands/onboarding.ts) |
| `/leaderboard` | *None* | **Requires Onboarding** | Shows the server leaderboard with the top 10 members sorted by total XP and tier badges. | [`discord.gateway.ts:126`](./src/discord/discord.gateway.ts), [`leaderboard.ts`](./src/discord/commands/leaderboard.ts) |
| `/sync-points` | *None* | **Administrator Only** + **Requires Onboarding**<br>*(Runtime guard: `memberPermissions.has(Administrator)`)* | Triggers a manual synchronization of XP earned from external bounty activity into the Discord database. | [`discord.gateway.ts:129`](./src/discord/discord.gateway.ts), [`command-dispatcher.service.ts:109`](./src/discord/services/command-dispatcher.service.ts) |
| `/setup-server` | *None* | **Administrator Only**<br>*(Registration default: `PermissionFlagsBits.Administrator` + runtime permission check)* | Automatically provisions necessary DevLoot server channels, permission overrides, and role hierarchies. | [`discord.gateway.ts:132`](./src/discord/discord.gateway.ts), [`discord-setup.service.ts`](./src/discord/handlers/discord-setup.service.ts) |
| `/check-chef` | *None* | **Administrator Only**<br>*(Registration default: `PermissionFlagsBits.Administrator` + runtime guard)* | Manually executes the Open Source Chef role evaluation for active contributors based on 7-day bounty history. | [`discord.gateway.ts:136`](./src/discord/discord.gateway.ts), [`command-dispatcher.service.ts:128`](./src/discord/services/command-dispatcher.service.ts) |

---

### Access & Permission Enforcement Architecture

1. **Onboarding Guard**:
   In [`src/discord/services/command-dispatcher.service.ts`](./src/discord/services/command-dispatcher.service.ts), `COMMANDS_REQUIRING_ONBOARDING` guards `propose`, `daily`, `rank`, `quests`, `proposals`, `leaderboard`, and `sync-points`. Non-onboarded members receive an ephemeral prompt instructing them to run `/onboarding` first.
2. **Administrator Permissions**:
   - Both `/setup-server` and `/check-chef` set `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)` during slash command registration.
   - All three administrative commands (`/setup-server`, `/check-chef`, and `/sync-points`) enforce server-side runtime checks verifying `interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)` before execution.
3. **Proposal Voting Mechanism**:
   Proposal voting is **reaction-based**, not button-based. Handled in [`src/discord/services/proposal-vote.service.ts`](./src/discord/services/proposal-vote.service.ts) via Discord client `messageReactionAdd`:
   - `👍`: Upvote (increases proposal score)
   - `👎`: Downvote
   - `💵`: Expresses community budget interest

---

## Repository Map

```text
devloot_discord_bot/
├── prisma/
│   └── schema.prisma                 # Database models (User, Bounty, Proposal, DailyStreak, QuestCompletion)
├── src/
│   ├── main.ts                       # Application entry point (NestJS bootstrap)
│   ├── app.module.ts                 # Root NestJS application module
│   ├── ai/
│   │   ├── ai.module.ts              # Module managing OpenAI/AI integrations
│   │   └── ai.service.ts             # Service generating summaries for proposed bounties
│   ├── discord/
│   │   ├── discord.module.ts         # Main Discord module orchestrating services and commands
│   │   ├── discord.gateway.ts        # Discord.js client gateway & 10 slash command registrations
│   │   ├── commands/                 # Slash command implementations
│   │   │   ├── daily.ts              # /daily handler
│   │   │   ├── leaderboard.ts        # /leaderboard handler
│   │   │   ├── onboarding.ts         # /onboarding handler
│   │   │   ├── proposals.ts          # /proposals handler
│   │   │   ├── propose.ts            # /propose handler (message, issue_url, bounty_amount)
│   │   │   ├── quest.ts              # /quests handler
│   │   │   └── rank.ts               # /rank handler
│   │   ├── services/                 # Core business and Discord helper services
│   │   │   ├── auto-threading.service.ts       # Automatic thread creation on proposals
│   │   │   ├── channel-moderation.service.ts   # Message filtering and channel rules
│   │   │   ├── chef-scheduler.service.ts       # Scheduled tasks and periodic sync jobs
│   │   │   ├── command-dispatcher.service.ts   # Command routing, onboarding guard & admin checks
│   │   │   ├── discord-guild.service.ts        # Guild management helpers
│   │   │   ├── discord-notification.service.ts # Sending DM/channel alerts
│   │   │   ├── discord-role.service.ts         # Role assignment based on tiers & Open Source Chef
│   │   │   ├── discord-xp.service.ts           # XP calculations, grant logic, level-ups
│   │   │   ├── proposal-vote.service.ts        # Reaction-based voting logic (👍, 👎, 💵)
│   │   │   ├── welcome.service.ts              # Member join welcoming logic
│   │   │   └── xp-sync.service.ts              # External bounty XP sync logic (/sync-points)
│   │   └── handlers/
│   │       ├── discord-setup.service.ts        # Server provisioning handler (/setup-server)
│   │       └── discord-verify.service.ts       # Account verification status checker
│   └── prisma/
│       ├── prisma.module.ts          # Prisma NestJS module
│       └── prisma.service.ts         # PrismaClient lifecycle and connection provider
├── package.json                      # NPM dependencies and development scripts
└── tsconfig.json                     # TypeScript compiler configuration
```

---

## Development & Build Scripts

These scripts are defined in [`package.json`](./package.json) for local development, code formatting, and compilation:

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **Prisma Client Generation** | `npx prisma generate` | Compiles Prisma schema into the typed `@prisma/client` library. |
| **Development Server** | `npm run start:dev` | Generates Prisma client and runs the bot with automatic file watch & reload. |
| **Build** | `npm run build` | Compiles TypeScript source files into the `dist/` output folder via Nest CLI. |
| **Production Run** | `npm run start:prod` | Runs the compiled application from `dist/src/main`. |
| **Code Formatting** | `npm run format` | Formats all source and test files using Prettier. |
| **Linting** | `npm run lint` | Runs ESLint and automatically applies available fixes. |

> **Note on Deployment vs. Development**: Running in production requires setting up a PostgreSQL instance, running database migrations (`npx prisma migrate deploy`), and supplying valid environment variables (`DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DATABASE_URL`, `CLIENT_URL`).

---

## Contributing

1. Fork the repository and create your feature branch: `git checkout -b feature/my-feature`.
2. Ensure Prisma schema is generated: `npx prisma generate`.
3. Verify your changes compile cleanly: `npm run build`.
4. Ensure code passes linting and formatting: `npm run lint` and `npm run format`.
5. Open a Pull Request referencing the corresponding issue.
