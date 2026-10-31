# DevLoot Discord Bot

The official Discord bot for the **DevLoot** ecosystem. DevLoot connects open-source developers with bounties and community rewards. This bot powers community engagement, XP tracking, daily claim streaks, GitHub verification onboarding, and bounty proposal voting directly within Discord servers.

Built with [NestJS](https://nestjs.com/), [Discord.js](https://discord.js.org/) v14, [Prisma ORM](https://www.prisma.io/), and PostgreSQL.

---

## Features

- **Gamification & XP Tracking**: Members earn XP for engagement, participating in community quests, and submitting bounty proposals.
- **Daily Rewards & Streaks**: `/daily` claim system rewarding daily streaks with progressive XP bonuses.
- **Leaderboards & Ranks**: Visual tier-based user rankings (`Newcomer`, `Builder`, `Hunter`, `Legend`) with real-time leaderboards.
- **Bounty Proposals & Voting**: Submit public GitHub issues for community voting with automatic AI summaries and thread creation.
- **Onboarding & GitHub Verification**: Guided flow to link Discord accounts with GitHub profiles.
- **Automated Moderation & Threading**: Automatically creates dedicated discussion threads for proposal issues and manages channel roles.

---

## Registered Slash Commands

| Command | Arguments | Access Restrictions | Description |
| :--- | :--- | :--- | :--- |
| `/daily` | *None* | All members | Claims daily XP bonus (10 base XP + streak bonus up to 30 XP). Has a 24-hour cooldown. |
| `/leaderboard` | *None* | All members | Displays the top 10 community members ordered by total XP with tier badges. |
| `/rank` | *None* | All members | Shows your current XP, tier progress bar, next rank threshold, and current daily streak. |
| `/propose` | `issue_url` *(String, required)* | All members | Submits a GitHub issue URL for bounty review, triggering AI analysis, voting buttons, and an auto-thread. |
| `/proposals` | *None* | All members | Displays the top 10 most upvoted community bounty proposals submitted within the last 7 days. |
| `/quest` | *None* | All members | Shows available community engagement quests and the XP rewards for completing them. |
| `/onboarding` | *None* | All members | Sends an interactive onboarding embed with buttons to link your GitHub account. |

*Verified from command handlers in [`src/discord/commands/`](./src/discord/commands/).*

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
│   │   ├── discord.gateway.ts        # Discord.js client gateway (ready, interactionCreate, messageCreate)
│   │   ├── commands/                 # Slash command implementations
│   │   │   ├── daily.ts              # /daily handler
│   │   │   ├── leaderboard.ts        # /leaderboard handler
│   │   │   ├── onboarding.ts         # /onboarding handler
│   │   │   ├── proposals.ts          # /proposals handler
│   │   │   ├── propose.ts            # /propose handler
│   │   │   ├── quest.ts              # /quest handler
│   │   │   └── rank.ts               # /rank handler
│   │   ├── services/                 # Core business and Discord helper services
│   │   │   ├── auto-threading.service.ts       # Automatic thread creation on proposals
│   │   │   ├── channel-moderation.service.ts   # Message filtering and channel rules
│   │   │   ├── chef-scheduler.service.ts       # Scheduled tasks and periodic sync jobs
│   │   │   ├── command-dispatcher.service.ts   # Interaction routing to command classes
│   │   │   ├── discord-guild.service.ts        # Guild management helpers
│   │   │   ├── discord-notification.service.ts # Sending DM/channel alerts
│   │   │   ├── discord-role.service.ts         # Role assignment based on tiers
│   │   │   ├── discord-xp.service.ts           # XP calculations, grant logic, level-ups
│   │   │   ├── proposal-vote.service.ts        # Vote button handling (upvote/downvote)
│   │   │   ├── welcome.service.ts              # Member join welcoming logic
│   │   │   └── xp-sync.service.ts              # Database to Discord state synchronization
│   │   └── handlers/
│   │       ├── discord-setup.service.ts        # Initial guild command registration
│   │       └── discord-verify.service.ts       # Role verification flow
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

> **Note on Deployment vs. Development**: The scripts above cover compilation and local runtime. Running in production requires setting up a PostgreSQL instance, running database migrations (`npx prisma migrate deploy`), and supplying valid environment variables (`DISCORD_BOT_TOKEN`, `DATABASE_URL`, `CLIENT_URL`).

---

## Contributing

1. Fork the repository and create your feature branch: `git checkout -b feature/my-feature`.
2. Ensure Prisma schema is generated: `npx prisma generate`.
3. Verify your changes compile cleanly: `npm run build`.
4. Ensure code passes linting and formatting: `npm run lint` and `npm run format`.
5. Open a Pull Request referencing the corresponding issue.
