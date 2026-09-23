# Discord development pilot

Implementation started 2026-09-23. This is the first P00/P01 slice of the omnichannel plan, not a complete Pilot A rollout.

- Bot branch: `codex/discord-omnichannel-pilot`.
- Core branch: `codex/discord-omnichannel-engine`, in the sibling `devloot-core-omnichannel` worktree.
- Core combines `066d18f` (current profile/Dream Team work) with `origin/feat/data-engine` at `4f890b3`.
- Only guild `1494925337811751002` is accepted. Configuration, gateway input, setup and command deployment enforce this.
- No live guild changes or command deployment have been performed. Test bot credentials are not available in this checkout; the available Developer Portal browser session is signed out.

## What runs now

The pilot registers `/ping`, `/status` and administrator-only `/setup-server`. All responses are private. `/status` checks the integrated Core branch's new `GET /health` API liveness endpoint. The bot's `GET /health` is process liveness; `GET /health/ready` requires a ready Discord connection, test-guild membership and a reachable Core API. It does not claim database or worker health.

Process startup verifies the bot identity and test-only guild membership, connects with just the Guilds intent and installs interaction handlers. It does not register commands, create channels, post onboarding, start legacy jobs or access a database. The Docker startup no longer runs migrations. Core owns business migrations.

Legacy command/service source is retained but is not wired into this test application. Production should continue using its existing branch/deployment. Linking, profiles, discovery, engine rewards, feeds, missions and moderation are not yet enabled. Old buttons/commands fail closed instead of reaching legacy writers. The Core client currently permits public reads only, with a timeout and redirects disabled; P02 must implement service authentication before any channel mutation.

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
- `#onboarding` for commands, `#opportunities`, `#shipped`, `#missions`.
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

After setup: run `/ping`, `/status`, `/setup-server` (preview) and `/setup-server apply:true` (should reuse everything), restart the bot, and verify no new public content or duplicate channels. Assign the test moderator role explicitly to intended testers and check its private-channel visibility. These live checks are pending credentials.

## Validation performed

- Bot build, TypeScript check and 12 tests pass. Tests cover configuration, identity mismatch/shared bots, guild/DM rejection, deferred replies, lifecycle, setup restart/idempotency, private review permissions, collision handling, Core failure handling and complete Nest health/readiness behavior without Prisma.
- Core server build and `architecture:verify` pass. Prisma is removed from engine domain/port contracts; issue snapshot reads and achievement claims cross module boundaries through exported ports.
- Core: 47 focused suites / 265 tests; API/worker composition: 2 suites / 7 tests; PostgreSQL engine/vote/comment integration: 3 suites / 11 tests. All pass.
- Web: TypeScript check and 3 relevant suites / 8 tests pass, including engine admin tabs and bounty-board navigation.
- All 46 combined migrations applied successfully to an empty disposable PostgreSQL database. Separately, the original Core migrations were applied, a user with 137 XP inserted, and the combined migrations applied; the user retained 137 XP and migration status was current.

The upstream engine's passing tests do not establish replay/concurrency-safe awards. No new reward rules have been activated, no shared database was migrated, and no services were deployed. Next: finish the live P01 checks, then P02 secure Discord linking/service authentication; P05/P06 reliability work remains required before enabling engine rewards.

Discord's [guild command documentation](https://docs.discord.com/developers/docs/interactions/slash-commands) describes the application/guild command route used by the explicit deploy script.
