# DevLoot Discord Bot

The community engine for **DevLoot**, an open-source bounty marketplace on Algorand.

The bot handles member onboarding, bounty proposals and voting, XP and gamification, and live
bounty notifications inside a Discord server. It is a NestJS application built on `discord.js`
v14, with Prisma as the data layer.

---

## What it does

| Area | Behaviour |
|---|---|
| **Onboarding** | New members get a welcome flow and a verification button. Seven commands stay locked until onboarding is completed (see [Onboarding gate](#onboarding-gate)). |
| **Bounty proposals** | Members pitch a GitHub issue with a suggested USDC amount via `/propose`. Proposals are stored, posted to a suggestions channel, and can be voted on with reactions. |
| **XP and gamification** | Members earn XP from a daily claim and from quests, climb tiers, and appear on a leaderboard. A daily streak is tracked per user. |
| **Quests** | One quest is currently defined: propose a bounty in the proposals channel, worth 25 XP, completing automatically when the member posts there. |
| **Bounty feed** | New and updated bounties are pushed to a configured feed channel as embed notifications. |
| **Open Source Chef** | A weekly scheduled check awards or removes a role based on whether the member created a bounty or had a bounty claimed in the previous seven days. |
| **Moderation and threads** | Incoming messages pass through channel moderation; auto-threading is available as a service. |

---

## Slash commands

Registered on startup, either globally or to a single guild when `DISCORD_GUILD_ID` is set.

| Command | Purpose | Required arguments | Access |
|---|---|---|---|
| `/propose` | Suggest a GitHub issue for a bounty | `message` (string), `issue_url` (string), `bounty_amount` (number, min 1) | Onboarding required |
| `/daily` | Claim the daily XP reward | — | Onboarding required |
| `/rank` | Check your current XP and tier | — | Onboarding required |
| `/quests` | View available quests | — | Onboarding required |
| `/proposals` | View recent bounty proposals | — | Onboarding required |
| `/onboarding` | Start the onboarding flow | — | Everyone |
| `/leaderboard` | View top users by XP | — | Onboarding required |
| `/sync-points` | Sync XP from bounty activity | — | **Administrator**, checked in the handler at runtime |
| `/setup-server` | Set up server channels and roles | — | **Administrator**, set as the command's default member permission |
| `/check-chef` | Manually trigger the Open Source Chef check | — | **Administrator**, set as the command's default member permission |

`bounty_amount` rejects values below 1.

### Onboarding gate

`src/discord/services/command-dispatcher.service.ts` defines the list of commands that require a
completed onboarding: `propose`, `daily`, `rank`, `quests`, `proposals`, `leaderboard`,
`sync-points`. `/onboarding`, `/setup-server` and `/check-chef` are not in that list.

### How the three admin commands differ

`/setup-server` and `/check-chef` declare `PermissionFlagsBits.Administrator` with
`setDefaultMemberPermissions`, so Discord itself hides them from non-admins. `/sync-points` does
not declare the permission; it enforces the check inside the handler instead.

---

## Repository map

```
src/
├── main.ts                           Bootstrap; reads BOT_PORT (default 3001)
├── app.module.ts                     Root module wiring
├── discord/
│   ├── discord.module.ts             Client construction with the five gateway intents
│   ├── discord.gateway.ts            Client setup, slash-command registration, event handlers
│   ├── commands/                     One file per slash command (propose, daily, rank,
│   │                                 quest, proposals, onboarding, leaderboard)
│   ├── handlers/                     Verification and server-setup handlers
│   └── services/                     Behaviour layer, see below
├── ai/ai.service.ts                  Model calls via OpenRouter
└── prisma/                           PrismaService and module
prisma/
├── schema.prisma                     Data models and enums
└── migrations/                       Migration history
```

### Services

| File | Responsibility |
|---|---|
| `command-dispatcher.service.ts` | Routes each interaction, applies the onboarding gate and admin checks |
| `discord-xp.service.ts` | XP awards, tier calculation, daily streaks |
| `xp-sync.service.ts` | Reconciles XP from bounty activity |
| `discord-role.service.ts` | Role assignment, including the weekly Open Source Chef check |
| `proposal-vote.service.ts` | Reaction-based voting on proposals |
| `discord-notification.service.ts` | Bounty embed notifications to the feed channel |
| `chef-scheduler.service.ts` | Weekly cron that calls the Open Source Chef check |
| `welcome.service.ts` | New-member welcome flow and verification channel |
| `channel-moderation.service.ts` | Message moderation |
| `auto-threading.service.ts` | Thread creation for messages |
| `discord-guild.service.ts` | Guild and client lookup helpers |

### Data model

Defined in [`prisma/schema.prisma`](prisma/schema.prisma).

Models: `User`, `Bounty`, `BountyMessage`, `Proposal`, `ProposalVote`, `Transaction`,
`QuestCompletion`, `DailyStreak`, `Notification`.

Enums: `BountyStatus`, `BountyMessageType`, `TransactionType`.

---

## Getting started

### Prerequisites

- Node.js and npm
- A Discord application with a bot token
- A PostgreSQL database reachable through `DATABASE_URL`

The client requests five gateway intents in `src/discord/discord.module.ts`: `Guilds`,
`GuildMembers`, `GuildMessages`, `MessageContent`, and `GuildMessageReactions`. **`GuildMembers`
and `MessageContent` are privileged** — enable both in the Discord developer portal for your
application, or the bot will fail to receive member and message events.

### Environment variables

The code reads these; values are not committed.

| Variable | Used for |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot login and REST calls |
| `DISCORD_CLIENT_ID` | Slash-command registration |
| `DISCORD_GUILD_ID` | Registering commands to one guild instead of globally; also used by the Chef check |
| `DISCORD_BOUNTY_FEED_CHANNEL` | Channel that receives bounty notifications |
| `DISCORD_BOUNTY_SUGGESTIONS_CHANNEL_ID` | Channel that receives proposals |
| `DISCORD_SCOUT_ROLE_ID` | Role used by the role service |
| `ROLE_NEWCOMER` | Role granted on onboarding |
| `ROLE_BUILDER`, `ROLE_HUNTER`, `ROLE_LEGEND` | Tier roles, awarded at 500, 2,000 and 5,000 XP |
| `GITHUB_TOKEN` | GitHub lookups for bounty issues, in `propose.ts` and the notification service |
| `OPENROUTER_API_KEY` | Model access in `ai.service.ts` |
| `CLIENT_URL` | Base URL for outbound links; defaults to `https://devloot.app` |
| `BOT_PORT` | HTTP port, defaults to `3001` |

`DATABASE_URL` is consumed by Prisma rather than by application code.

### Scripts

These are the scripts defined in [`package.json`](package.json). They are build and local
development commands only — this repository does not include a deployment guide, process manager
configuration, container image, or infrastructure setup.

| Script | Runs |
|---|---|
| `npm run build` | `nest build` |
| `npm run start` | `nest start` |
| `npm run start:dev` | `prisma generate && nest start --watch` |
| `npm run start:debug` | `nest start --debug --watch` |
| `npm run start:prod` | `node dist/src/main` |
| `npm run lint` | `eslint "{src,apps,libs,test}/**/*.ts" --fix` |
| `npm run format` | `prettier --write "src/**/*.ts" "test/**/*.ts"` |

`start:dev` is the only script that runs `prisma generate` for you. After changing
`prisma/schema.prisma`, run `npx prisma generate` before `build` or `start`.

`start:prod` expects `npm run build` to have produced `dist/src/main` first.

### Typical local run

```bash
npm install
npx prisma generate
npx prisma migrate deploy      # or: npx prisma migrate dev
npm run start:dev
```

---

## Contributing

Open bounties on this repository are listed in [`BOUNTIES.md`](BOUNTIES.md). Each entry describes
a scoped piece of work and the expectations for submitting it.

---

## Project background

See [`BOUNTIES.md`](BOUNTIES.md) for the project's own description of its goals and the current
state of the bot.

## License

`package.json` declares `UNLICENSED` and `private: true`. This repository is not open-source
licensed.
