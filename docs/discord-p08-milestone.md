# P08 first-claim milestone pilot

2026-09-25 · Development guild `1494925337811751002` · Local Core database `omnichannel_integrated_core`.

## Live demo complete (2026-09-30)

The live first-claim demo passed, closing P08's test-guild acceptance gate. A dedicated test bounty (id 31, `bounty.claimed:31`) was claimed through the bounty domain reconciliation path by verified, opted-in member `@p2arthur` (Core user 1). The persistent pilot worker drained the fact, evaluated the reviewed rule, and delivered the milestone announcement to the development guild's milestone channel once (`messageId 1555276127231021258`, status `SENT`). Evidence recorded from the live database immediately after the claim:

- one rule execution for rule `cmugyl7dh0002vqrzly9fdjl9` / entity `1`, status `SUCCEEDED`
- one XP ledger row: `bounty.claimed:31`, 200 XP (base award; user total 1500)
- one earned entitlement for achievement `cmugyl7dc0000vqrzvq2g3ehi`
- one notification request (`engine.rule:cmuptzdlk0001vqf7cq714i4a:1`) and one delivery with the message ID above
- Discord profile and `GET /api/users/github/p2arthur/claim-progress` both read `bountiesClaimed: 1`

Replaying the accepted fact changed nothing (still 1 run, 1 ledger row, 1 request, unchanged XP total), and a full pilot-worker restart kept every count and the message ID identical. The replay/restart checks ran through `server/scripts/live-first-claim-pilot.ts`, an environment-guarded script that refuses any database except the local integration database and reuses the same domain path as the isolated spec.

## Worktree loss and recovery (2026-09-30)

The original `devloot-core-omnichannel` worktree was deleted with the P05–P08 Core changes uncommitted; only the P02 linking commits existed on `codex/discord-omnichannel-engine`. The implementation was recovered by replaying 215 recorded patch operations from Codex session transcripts onto a fresh checkout of `74dcecb9`, repairing double-applied patches, restoring four migration files (two from git history, two from the surviving `devloot-core` checkout), and rebuilding `server/.env` from the bot `.env`, the surviving Core `.env`, and transcript-recorded pilot values. The recovered worktree now lives at `../devloot-core-omnichannel-recover3` and both LaunchAgents point there. The recovered server builds clean, passes the focused engine/notifications/users suites at or above the pristine-branch baseline, and `prisma migrate status` reports the live database up to date across all 58 migrations. The work remains uncommitted — commit it before any further worktree operations.

## Current state

- The reviewed rule is active on `bounty.claimed.user.count.v1`: `GTE 1`, event driven, once per canonical user. It creates one earned milestone entitlement and one approved `FIRST_BOUNTY_CLAIM` guild notification request. It adds **zero milestone XP**; the domain claim path still awards the existing 200 base XP once under `bounty.claimed:<id>`.
- The local pilot achievement is deliberately nonclaimable (`claimEnabled: false`) while no TestNet asset/issuer has been provisioned. The entitlement is durable recognition; it is not yet an on-chain collectible.
- Core's Discord profile and the public web `GET /api/users/github/:username/claim-progress` read the same user-keyed snapshot. The web profile displays the verified count and first-claim milestone progress for walletless as well as wallet-linked users.
- A narrow local LaunchAgent, `com.devloot.omnichannel-p08-worker`, drains claim facts, recovers unfinished rule actions, and delivers Discord notifications. It does not run unrelated Core jobs. The Core API LaunchAgent was restarted after the web endpoint build.
- The live test-guild claim and post have now occurred and were verified end to end, including replay and worker-restart invariance.

## Isolated replay evidence

`server/test/first-claim-pilot.e2e-spec.ts` uses a disposable local `*_test` PostgreSQL database. It creates an OPEN bounty and canonical walletless user, confirms the claim through the bounty domain reconciliation path (which atomically appends the fact), runs the claim worker and rule, then retries a simulated Discord rate limit. It reconstructs worker services, replays the fact and dispatches again. The passing assertions establish one source fact projection, one 200 XP award, one rule execution, one earned entitlement, one notification request and one acknowledged message ID. Both web and Discord projections read count 1. No second Discord send occurs on replay.

On 2026-09-25, all 55 Core migrations applied to fresh `omnichannel_p08_test`, and that test passed. Core build, architecture verification, focused users tests and client TypeScript check passed. The local Core health endpoint returned 200; `GET /api/users/github/p2arthur/claim-progress` returned `{"bountiesClaimed":0}`. The P08 rule seed was run twice: first `seeded`, then `already-seeded` with the same rule and achievement IDs. Both API and narrow worker LaunchAgents are running.

## Reproduce and operate

From the Core worktree's `server/` directory, `bun scripts/seed-first-claim-pilot.ts` previews the rule. `bun scripts/seed-first-claim-pilot.ts --apply` seeds it idempotently. The script refuses anything except the specified local database and development guild/channel. It does not backfill historical claims or grant rewards for old snapshots.

After a Core rebuild, restart the local API and worker with:

```sh
launchctl kickstart -k gui/$(id -u)/com.devloot.omnichannel-core-api
launchctl kickstart -k gui/$(id -u)/com.devloot.omnichannel-p08-worker
```

Worker logs are `~/Library/Logs/devloot-omnichannel-p08-worker*.log`. `launchctl list | rg 'com.devloot.omnichannel-(core-api|p08-worker)'` shows both jobs. The narrow worker entry refuses the wrong database/guild and production mode.

For the live finish, link a test account through Discord OAuth, run `/notifications bounty_claims:true`, and claim a real test bounty through the domain flow. Record the bounty ID and `bounty.claimed:<id>` event ID. Verify one accepted claim-count event, one 200 XP ledger row, one successful rule run with two successful actions, one entitlement, one `SENT` delivery with a message ID, matching web/Discord progress, and the single post in the milestone channel. Replay the accepted fact and restart the worker; those counts and message ID must stay unchanged. Resolve any `UNCERTAIN` delivery through the P07 diagnostics flow before retrying. Do not backfill with rule actions enabled.

All of the above was executed and recorded on 2026-09-30 (see "Live demo complete"); P08's test-guild demo gate is closed.
