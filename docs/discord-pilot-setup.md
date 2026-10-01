# Discord development pilot

Implementation started 2026-09-23. The local development pilot has account linking, profile and bounty discovery, and the P07 notification delivery path. The [P08 first-claim milestone](discord-p08-milestone.md) completed its live demo on 2026-09-30: one claim, one base XP award, one entitlement, one delivered announcement, and replay/restart invariance. After the original omnichannel Core worktree was deleted, the P05-P08 implementation was recovered into ../devloot-core-omnichannel-recover3; both LaunchAgents point there.

- Bot branch: `codex/discord-omnichannel-pilot`.
- Core branch: `codex/discord-omnichannel-engine`, in the sibling `devloot-core-omnichannel` worktree.
- Core combines `066d18f` (current profile/Dream Team work) with `origin/feat/data-engine` through `8c13a82` in integration commit `8825ef2`.
- Only guild `1494925337811751002` is accepted. Configuration, gateway input, setup and command deployment enforce this.
- Live development setup is complete: the dedicated bot identity and sole test-guild membership were verified, and channels/role provisioned. Credentials are stored only in the ignored local `.env`. The bot runs locally on port 3011 against the integrated Core API on port 3012 and web client on port 5173.
- On this Mac, `~/Library/LaunchAgents/com.devloot.omnichannel-core-api.plist` keeps the integrated Core API on port 3012 running after terminal sessions close. It uses the integration checkout's ignored `server/.env` and compiled `dist/src/main.js`. After rebuilding Core, run `launchctl kickstart -k gui/$(id -u)/com.devloot.omnichannel-core-api` to load the new build. Logs are in `~/Library/Logs/devloot-omnichannel-core-api*.log`. The separate Docker Core container on port 3000 does not provide the Discord integration endpoints; do not point this bot at it.

## What runs now

The pilot registers `/ping`, `/status`, `/connect`, `/disconnect`, `/notifications`, `/profile [member]`, `/achievements [member]` and administrator-only `/setup-server`. Commands reply privately; a profile is posted publicly only after its owner presses **Share profile**. `/status` checks the integrated Core branch's `GET /health` API liveness endpoint. The bot's `GET /health` is process liveness; `GET /health/ready` requires a ready Discord connection, test-guild membership and the integrated Core API. It does not claim database or worker health. The [local linking guide](discord-linking-local.md) gives command-by-command expectations.

P07 first-bounty-claim announcements are opt-in. `/notifications` shows the current setting, and `/notifications bounty_claims:true` enables an announcement of the member's first verified bounty claim in the development `#bounty-claims` channel. Core's ignored local `.env` needs `DISCORD_MILESTONE_CHANNEL_ID` set to that channel's ID. No direct messages are enabled. The P08 rule is active for future confirmed claims; opting in alone does not post a message.

Process startup verifies the bot identity and test-only guild membership, connects with just the Guilds intent and installs interaction handlers. It does not register commands, create channels, post onboarding, start legacy jobs or access a database. The Docker startup no longer runs migrations. Core owns business migrations.

Legacy command/service source is retained but is not wired into this test application. Production should continue using its existing branch/deployment. Legacy reward writes, feeds, missions and moderation are not enabled. Versioned `dl:v1:<feature>:<action>:<entityId>` buttons enter a registry of explicitly installed handlers; legacy, malformed, and unregistered buttons receive a private stale-action response. The Core client uses signed, short-lived, actor-bound assertions for linking, profiles and unlink; requests have a timeout and redirects disabled.

## Local configuration

Use Node 22 or newer and a dedicated Discord application installed only in the test guild. No privileged intents are needed for this slice. Give its bot Manage Channels, Manage Roles, View Channels, Send Messages, Read Message History and Embed Links. Keep its role above the roles it manages. Do not reuse the production application/token.

```sh
npm ci
cp .env.example .env
# Populate DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID locally.
# Set CORE_API_URL and CORE_WEB_URL to the test environment.
# Generate compile-time types for retained legacy source; this does not connect to a DB.
DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/unused npx prisma generate
npm run build
npm test
```

No database URL is required at runtime. Secrets remain in ignored `.env` files. `DOTENV_CONFIG_PATH` can select an existing local secret file instead of copying credentials. Do not pass the token on a command line or paste it in a chat.

## Provision and verify the guild

```sh
npm run server:invite       # prints a test-guild installation URL
npm run server:inventory    # read-only: IDs, channels, roles and overwrites
npm run server:preview      # read-only proposed additions
npm run server:setup        # explicit apply, prints preview first
npm run commands:deploy:test
npm run start:prod
```

Setup creates only these missing items:

- DevLoot Test Moderator role, with no server-wide permissions.
- `#onboarding` for commands, `#opportunities`, `#bounty-claims`, `#missions`.
- Private `#moderator-review`, visible to the bot, configured moderator role and server administrators.

Setup does not post messages, assign roles, delete channels, edit existing channels or reorganize the server. Existing suitable channels can be reused by explicitly mapping their IDs after inventory. Same-name collisions stop setup before writes; names alone never establish ownership. Mapped destinations are fetched from the allowed guild and checked for type, bot access and moderator privacy.

Mappings are persisted after each created item in `.discord/1494925337811751002.json` (or `DISCORD_STATE_DIRECTORY`). Persist this directory on the host and run one gateway instance. An exclusive file lock prevents concurrent CLI/slash setup on the same volume. A process crash can leave a lock; verify no setup process is running before removing it. If role creation succeeded but saving its ID failed, inventory and bind the existing role instead of creating a duplicate. Channel topic markers allow recovery after a channel was created before its ID was saved.

Example mapping shape (replace placeholders with actual inventory IDs):

```json
{
  "version": 1,
  "guildId": "1494925337811751002",
  "clientId": "YOUR_TEST_APPLICATION_ID",
  "moderatorRoleId": "ROLE_ID",
  "channels": {
    "onboarding": "CHANNEL_ID",
    "opportunities": "CHANNEL_ID",
    "shipped": "CHANNEL_ID",
    "missions": "CHANNEL_ID",
    "moderatorReview": "CHANNEL_ID"
  }
}
```

After setup: run `/ping`, `/status`, `/setup-server` (preview) and `/setup-server apply:true` (should reuse everything), restart the bot, and verify no new public content or duplicate channels. Assign the test moderator role explicitly to intended testers and check its private-channel visibility. Live CLI preview/apply, command registration, `/ping`, `/status` and gateway restart checks are complete. Moderator role assignment to individual testers and admin slash-command testing remain pending; the role was deliberately created without assigning members.

## Initial P00/P01 validation (historical)

- Bot build, TypeScript check and 13 tests pass. Tests cover configuration, identity mismatch/shared bots, guild/DM rejection, versioned button routing, deferred replies, lifecycle, setup restart/idempotency, private review permissions, collision handling, Core failure handling and complete Nest health/readiness behavior without Prisma.
- Core server build and `architecture:verify` pass. Prisma is removed from engine domain/port contracts; issue snapshot reads and achievement claims cross module boundaries through exported ports.
- Core: 47 focused suites / 265 tests; API/worker composition: 2 suites / 7 tests; PostgreSQL engine/vote/comment integration: 3 suites / 11 tests. All pass.
- Web: TypeScript check and 3 relevant suites / 8 tests pass, including engine admin tabs and bounty-board navigation.
- All 47 combined migrations applied successfully to an empty disposable PostgreSQL database. The prior 46-migration database upgraded with the new backfill migration; the test user retained 137 XP and migration status was current. The refreshed engine's 28 suites / 116 tests and updated admin trackables 7 tests pass.

The upstream engine's passing tests do not establish replay/concurrency-safe awards. No new reward rules have been activated and no shared database was migrated. The bot is running locally; no hosted deployment was made. The integrated Core runtime and P02/P03 slices were completed afterward; P05/P06 reliability work remains required before enabling engine rewards.

Discord's [guild command documentation](https://docs.discord.com/developers/docs/interactions/slash-commands) describes the application/guild command route used by the explicit deploy script.

## Safari inventory (2026-09-23)

The authenticated Developer Portal shows `devloot_developer-bot#8528`, application ID `1494937185101545472`, with approximately one server installation. Discord confirms it is a member of `devloot - dev_server` (`1494925337811751002`) and was offline during initial inspection. A separate `devloot bot` is online in that guild. Both have historical onboarding posts; none was edited or deleted.

| Existing channel | ID | Pilot mapping |
| --- | --- | --- |
| 🔓-verify | 1494963935420612709 | onboarding |
| ⚖️-rules | 1494963936393564209 | retain |
| 📢-announcement | 1494963937408712765 | retain |
| ⚡-general | 1494963938662551616 | retain; private |
| 💡-proposals | 1494963940076294214 | retain; private |
| 💰-feed | 1494963941103767622 | opportunities |

The ignored local `.env` now contains the application ID, and `.discord/1494925337811751002.json` maps onboarding and opportunities to these existing IDs. The initial browser inspection performed no writes. The later authenticated bot inventory and successful setup verified the permissions needed to create the remaining channels and moderator role.

The portal has Public Bot and all three privileged intents enabled. These were left unchanged; the new gateway requests only Guilds. Existing-token retrieval is unavailable: Discord offers only Reset Token. Supply an existing saved token via the local environment file, or have the application owner regenerate it and save it as `DISCORD_BOT_TOKEN`. Credential reset is a user-performed browser handoff. Never paste the token in chat.

## Initial live setup (2026-09-23; historical)

- Authenticated bot ID: `1494937185101545472`; guild inventory confirmed this bot is installed only in `1494925337811751002`.
- Reused the verify channel for onboarding and bounty-feed channel for opportunities.
- Created `DevLoot Test Moderator`: `1552403885195264090`. No individual member assignments were made.
- Created `#shipped` (later renamed `#bounty-claims`): `1552403886067679282`; `#missions`: `1552403886986235924`; private `#moderator-review`: `1552403888047390891`.
- Registered `/ping`, `/status`, `/setup-server` against this application and guild only. Existing commands belonging to the other bot were not changed.
- Repeated setup preview reports reuse for every item; the private-review permissions were fetched and validated.
- Started the compiled gateway locally on port **3011** because 3001 belongs to the JEV project and 3002 is also occupied. PID is in ignored `.discord/gateway.pid`; logs are in `.discord/gateway.log`. This is a local background process, not a hosted service or reboot-persistent installation.
- Safari `/ping` returned the private response `Pong! DevLoot development bot is online.`
- Restarted this gateway and verified that channel IDs and public last-message IDs remained unchanged; the Discord connection recovered. Safari `/status` worked after restart.
- `GET http://127.0.0.1:3011/health` returns 200. Readiness returns 503 with `discord: true, core: false`. The existing `devloot_api` container at port 3000 returns 404 for `/health`; its running image has not been replaced with the integration branch. `/status` explicitly reports Core unavailable. This does not prevent `/ping` or guild administration.

Remaining: run the integrated Core test API/worker environment, then secure linking and profile/discovery slices. No Core container or database was changed during guild provisioning.
