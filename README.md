# DevLoot Discord Bot

**Bring GitHub issue discovery, bounty proposals, and contributor progress into Discord.**

The DevLoot bot gives an open-source community a shared place to suggest work, vote on proposals, discuss bounties, and recognize participation. It connects Discord events and slash commands to DevLoot's PostgreSQL data through a NestJS service.

Part of [DevLoot](https://devloot.xyz). This repository contains the community bot, including command handling, XP and streaks, role automation, scheduled tasks, and proposal summaries.

## What members can do

| Command | Purpose |
| --- | --- |
| `/onboarding` | Open the GitHub linking and verification flow |
| `/propose` | Suggest a GitHub issue with a pitch and proposed USDC bounty amount |
| `/proposals` | Browse recent proposals |
| `/daily` | Claim daily XP and maintain a streak |
| `/quests` | View daily community quests |
| `/rank` | Inspect XP, tier, streaks, and proposal statistics |
| `/leaderboard` | See the community's leading contributors |

Onboarded members can propose issues and vote with reactions. Discussion threads keep proposals and bounty announcements together. XP and role services recognize activity, including bounty-related participation.

A proposed amount is a community suggestion. Funding, escrow, and payout belong to DevLoot's bounty system; submitting `/propose` does not itself fund a bounty.

Administrators also have `/setup-server`, `/sync-points`, and `/check-chef`. Server setup creates channels, categories, and roles, while synchronization and scheduled evaluations update contributor progress. See the actual [command registration](src/discord/discord.gateway.ts) and [dispatch service](src/discord/services/command-dispatcher.service.ts) for access checks.

## How it fits together

```text
Discord interactions and Gateway events
                  |
          DiscordGateway
                  |
    Commands and domain services
       PostgreSQL / Prisma
       GitHub API / OpenRouter
```

| Path | Responsibility |
| --- | --- |
| [`src/discord/commands/`](src/discord/commands/) | Member-facing command handlers |
| [`src/discord/services/`](src/discord/services/) | Voting, XP, roles, notifications, moderation, and scheduling |
| [`src/discord/handlers/`](src/discord/handlers/) | Server setup and verification interactions |
| [`src/discord/discord.gateway.ts`](src/discord/discord.gateway.ts) | Client lifecycle, command registration, and event routing |
| [`src/ai/ai.service.ts`](src/ai/ai.service.ts) | OpenRouter-backed issue summaries and analysis |
| [`prisma/schema.prisma`](prisma/schema.prisma) | DevLoot data model used by the bot |

## Development setup

Use Node.js 22 and npm, a development Discord application and guild, and access to a compatible development DevLoot PostgreSQL database. This service shares domain data with DevLoot; an arbitrary empty database is not a complete demo environment.

```sh
git clone https://github.com/devloot-xyz/devloot_discord_bot.git
cd devloot_discord_bot
npm ci
```

Configure a local `.env` or inject these values through your existing secret manager:

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by Prisma |
| `DISCORD_BOT_TOKEN` | Development bot credential |
| `DISCORD_CLIENT_ID` | Discord application ID |
| `DISCORD_GUILD_ID` | Development server ID; required by the current startup guard |
| `GITHUB_TOKEN` | GitHub API access for issue validation in `/propose` |
| `OPENROUTER_API_KEY` | AI proposal summaries and analysis |
| `CLIENT_URL` | Frontend base URL for DevLoot links |
| `BOT_PORT` | HTTP listener port; defaults to `3001` |

Configure the Gateway intents and server permissions required by the features you exercise. Start with a dedicated development guild: startup registers slash commands and connects the bot to Discord.

```sh
npm run start:dev
```

This generates Prisma Client and starts NestJS in watch mode. Database migration is a separate operation; coordinate schema changes with the DevLoot application that shares the database.

## Current integration boundaries

GitHub linking depends on the verified Core OAuth flow. Account linking remains paused where that flow has not been deployed; the bot repository alone cannot complete that integration. Existing verified-member workflows and new account linking are separate states.

The current Gateway startup requires all three Discord settings, including `DISCORD_GUILD_ID`, even though the registration helper contains a global-command path. AI summaries send issue text to OpenRouter using the model configured in [`AiService`](src/ai/ai.service.ts).

## Build and contribute

`npm run build` compiles the service. `npm run start:prod` runs the compiled output. `npm run lint` and `npm run format` modify files, so review their diffs before committing.

For a focused contribution, start with a command handler or domain service and its callers. [BOUNTIES.md](BOUNTIES.md) provides additional project context. The repository currently declares `UNLICENSED` in `package.json`.
