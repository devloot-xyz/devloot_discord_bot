# DevLoot Discord Bot

DevLoot is an open-source bounty platform on Algorand. This repository contains its Discord bot, which helps community members connect GitHub accounts, discover and suggest bounty issues, and earn XP for participation. The bot also supports proposal voting, community roles, auto-threading, and bounty-related notifications.

## Features

- **GitHub Onboarding & Verification**: Guides members through linking their GitHub account and verifying via Discord interaction to earn initial XP and the `Verified` role.
- **Bounty Proposals & Community Signals**: Enables onboarded members to propose open GitHub issues for USDC bounties and browse top proposals from the past week. Members can vote with `👍` or `👎`, or use `💵` to signal interest in topping up a bounty.
- **Auto-Threading**: Automatically generates dedicated discussion threads for new proposals and bounty announcements to keep channels organized.
- **XP & Gamification**: Tracks user XP, daily claims with streak bonuses, daily quests, progression tiers (`Newcomer`, `Builder`, `Hunter`, `Legend`), and a community leaderboard.
- **Server Setup & Moderation**: Provides an administrator command to initialize standard server channels and roles, and moderates designated bot channels by cleaning non-command messages.
- **Bounty Sync & Role Automation**: Synchronizes XP earned from bounty activities (creators and claimers) and automatically tracks weekly qualification for the `Open Source Chef` role.

## Slash Commands

| Command         | Purpose                                                 | Required Arguments                                                                           | Access Restrictions                                                         |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/onboarding`   | Start GitHub linking and server verification.           | None                                                                                         | Any member                                                                  |
| `/propose`      | Suggest an open GitHub issue for a USDC bounty.         | `message` (short pitch)<br>`issue_url` (GitHub issue URL)<br>`bounty_amount` (number, min 1) | Onboarded members (10 per rolling 24 hours per user; 10 per UTC calendar day across the database) |
| `/daily`        | Claim daily XP reward and maintain streak.              | None                                                                                         | Onboarded members (24h cooldown)                                            |
| `/rank`         | View your XP, tier, streaks, and proposal stats.        | None                                                                                         | Onboarded members                                                           |
| `/quests`       | View today's available quests and completion status.    | None                                                                                         | Onboarded members                                                           |
| `/proposals`    | Browse top 10 proposals from the past 7 days.           | None                                                                                         | Onboarded members                                                           |
| `/leaderboard`  | View the top 10 members by XP and your rank.            | None                                                                                         | Onboarded members                                                           |
| `/sync-points`  | Synchronize XP from bounty activity.                    | None                                                                                         | Onboarded Discord administrators (checked at runtime)                       |
| `/setup-server` | Create required server channels, categories, and roles. | None                                                                                         | Discord administrators (`Administrator` permission default + runtime check) |
| `/check-chef`   | Trigger weekly Open Source Chef role evaluation.        | None                                                                                         | Discord administrators (`Administrator` permission default + runtime check) |

> **Note**: Slash commands are registered globally by default, or registered specifically to a single server when `DISCORD_GUILD_ID` is set. Commands requiring onboarding are blocked until the member has linked GitHub and completed verification.

## Repository Map

| Path                                                               | Description                                                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/discord/commands/`](src/discord/commands/)                   | Slash command handlers (`daily.ts`, `leaderboard.ts`, `onboarding.ts`, `proposals.ts`, `propose.ts`, `quest.ts`, `rank.ts`).                    |
| [`src/discord/services/`](src/discord/services/)                   | Domain services (command dispatching, auto-threading, moderation, voting, XP, roles, and scheduled tasks).                                      |
| [`src/discord/handlers/`](src/discord/handlers/)                   | Setup and interactive handlers (`discord-setup.service.ts` for server scaffolding, `discord-verify.service.ts` for verification button clicks). |
| [`src/discord/discord.gateway.ts`](src/discord/discord.gateway.ts) | Discord client lifecycle, Gateway event listeners, and slash command registration.                                                              |
| [`src/ai/`](src/ai/)                                               | OpenRouter AI service for summarizing and analyzing proposed GitHub issues.                                                                     |
| [`prisma/schema.prisma`](prisma/schema.prisma)                     | PostgreSQL database schema (Bounties, Proposals, Users, Quests, Streaks).                                                                       |
| [`src/`](src/)                                                     | NestJS root module (`app.module.ts`) and application entry point (`main.ts`).                                                                   |

## Development & Build Scripts

### Prerequisites

- Node.js and npm
- PostgreSQL database

### Environment Configuration

Configure the required environment variables in your local environment or `.env` file:

- `DISCORD_BOT_TOKEN`: Discord bot authentication token.
- `DISCORD_CLIENT_ID`: Discord application client ID.
- `DATABASE_URL`: PostgreSQL connection string for Prisma.
- `DISCORD_GUILD_ID` _(optional)_: Server ID for instant guild-scoped command registration during development.
- `GITHUB_TOKEN` _(required for `/propose`)_: GitHub personal access token used to verify issue metadata with the GitHub API.
- `OPENROUTER_API_KEY` _(optional)_: API key for AI proposal analysis.
- `CLIENT_URL` _(optional)_: Frontend base URL for bounty links. Set production to `https://devloot.xyz`. Discord account linking stays paused until the verified Core OAuth flow is deployed.

### Available Scripts

| Script                | Command                                         | Purpose                                                          |
| --------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `npm run build`       | `nest build`                                    | Compiles the NestJS application into `dist/`.                    |
| `npm start`           | `nest start`                                    | Starts the application.                                          |
| `npm run start:dev`   | `prisma generate && nest start --watch`         | Generates the Prisma client and runs the app with hot reloading. |
| `npm run start:debug` | `nest start --debug --watch`                    | Runs the app in debug mode with hot reloading.                   |
| `npm run start:prod`  | `node dist/src/main`                            | Runs the compiled production build from `dist/`.                 |
| `npm run lint`        | `eslint "{src,apps,libs,test}/**/*.ts" --fix`   | Runs ESLint across TypeScript files with auto-fixing.            |
| `npm run format`      | `prettier --write "src/**/*.ts" "test/**/*.ts"` | Formats TypeScript files using Prettier.                         |

> **Development vs. Production Deployment**:
> The scripts listed above are intended for local development, testing, and building. They do not constitute a complete production deployment guide. A production environment requires configuring secure credentials, running database migrations (`npx prisma migrate deploy`), deploying the containerized service (e.g., via the root [`Dockerfile`](Dockerfile)), configuring Discord bot Gateway intents and permissions, and setting up persistent process management.
