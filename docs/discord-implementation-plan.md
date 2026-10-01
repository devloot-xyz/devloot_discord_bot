# Discord omnichannel implementation plan

2026-09-23 · Test guild: **`1494925337811751002`** · Status: ready to implement, no deployment performed.

Builds on the [product/architecture plan](discord-omnichannel-plan.md) and [committed Core/data-engine review](discord-data-engine-review.md). Reviewed baselines: bot pilot `6c01905`, Core integration checkout `b85f67a` (containing engine `4f890b3`), and updated `origin/feat/data-engine` `8c13a82`. The integration checkout does **not** yet contain the new event bridge or backfill commits. Refresh these refs before implementation and incorporate upstream fixes rather than reimplementing them.

## Outcome and release boundaries

**Pilot A:** a new member links Discord to DevLoot, views their builder profile and achievements, discovers an issue, and continues in the web application. The bot reads Core through authenticated adapters and uses the supplied test guild only.

**Pilot B:** a confirmed bounty contribution updates a shared engine metric, evaluates one configured milestone, records rewards once, and delivers an in-app/Discord update. The same result appears regardless of which channel started the journey. Replayed jobs and Discord retries cannot duplicate XP.

**Pilot C:** contribution quests, relevant digests, and server-persisted Dream Team missions support repeat participation. JEV moderation runs as a parallel shadow/review track.

Production rollout follows these pilots and their exit checks. This plan does not provision channels, send messages, merge branches or deploy services by itself. The guild ID identifies the intended test destination; bot membership, permissions, channel IDs and credentials must still be verified during setup.

## Implementation decisions

- Keep the existing NestJS/discord.js bot as a separate gateway process. Core remains the owner of identity, business state and authorization.
- Adopt the cofounder's `engine` module for metrics and configurable rules. Reuse its new catalog, self-seeding event bridge and seven backfill sources; do not build another generic rule engine in the bot.
- Use PostgreSQL and the existing `JobQueue`/pg-boss integration. Persist new durable work intents transactionally; the existing in-process event bus is not the delivery guarantee.
- Keep interactive Discord replies in the bot. Core workers own scheduled feeds, reward-related announcements and tier-role synchronization. Coordinate shared-token REST limits.
- Use canonical Core `User.id` for new user metrics. Preserve/version existing wallet-keyed engine mappings until migrated explicitly.
- Reuse existing public profile data first. AI generation, wallet claims and complex editing continue through existing web flows until their channel-independent authorization is implemented.
- Preserve legacy XP amounts, tiers and daily cooldown semantics during migration. New reward policies are separate, versioned configurations.
- Keep JEV recommendations separate from moderation execution, XP policy and developer matching.
- Ship small vertical slices with their endpoints, adapters, storage and meaningful tests together. Each feature uses exported ports for cross-module calls.

## Test environment: the first work package

Use a dedicated test Discord application/bot if one already exists; otherwise create one during setup. A test guild alone does not isolate a production bot token or database. Keep test Core API, worker, database and GitHub test repository separate from production; use chain test environments only for any later claim/funding verification.

Proposed configuration contract:

| Setting | Pilot value / purpose |
|---|---|
| `DISCORD_GUILD_ID` | `1494925337811751002`, string, on both bot and Core outbound adapter |
| `DISCORD_COMMAND_SCOPE` | New setting: `guild`; fail validation if pilot config would register global commands |
| `DISCORD_ALLOWED_GUILD_IDS` | New setting: exactly the test guild for the pilot; reject commands/events/deliveries outside it |
| `DISCORD_CLIENT_ID`, `DISCORD_BOT_TOKEN` | Test application's own values from secret storage; never committed |
| `CORE_API_URL`, `CORE_WEB_URL` | New explicit bot settings pointing to the test environment |
| Bot service credentials | New separate credential with a fixed service subject, short-lived requests and allowlisted operations |
| Channel/role mapping | Discover or provision and persist actual IDs; do not reuse hardcoded production IDs or infer ownership from a name |
| Feature flags | Independently enable profiles, discovery, linking, engine rewards, digests, missions, moderation assessment and moderation actions |

Prepare a small channel set: onboarding/commands, opportunities, shipped, one mission discussion area, and a private moderator-review channel. First inventory the existing test guild; reuse suitable channels. `/setup-server` becomes an explicit idempotent admin action with a preview of additions and no deletion/reorganization of unrelated channels.

Register commands explicitly during deployment against `Routes.applicationGuildCommands(clientId, '1494925337811751002')`. Remove automatic registration and public onboarding writes from ordinary process startup. Initial commands need Guilds intent; add member/message/reaction intents only for enabled legacy, welcome or moderation features. Permission checks cover Core outbound destinations as well as gateway input.

## Work packages and dependencies

Each row is a PR-sized target where practical; schema/behavior changes may need an additive migration PR before their consumer PR. Estimates are engineering days including focused tests, not calendar commitments. Suggested ownership labels assign responsibility without assigning work to a specific person.

| ID | Deliverable | Repository / suggested owner | Depends on | Estimate |
|---|---|---|---|---|
| P00 | Refresh combined Core baseline through engine `8c13a82` and settle contracts | Core / integration + engine owner | — | 1–3 |
| P01 | Test-guild configuration, gateway lifecycle and test harness | Bot / Discord owner | — | 1–3 |
| P02 | Verified Discord identity linking and channel authentication | Core + client + bot / identity owner | P01; reconcile with P00 | 3–5 |
| P03 | Builder profile and achievement cards | Core + bot / Discord owner | P02 | 2–3 |
| P04 | Issue/bounty discovery with contextual handoff | Core + bot / Discord owner | P01; P02 for personal actions | 2–3 |
| P05 | Harden the new event bridge, ingestion, replay and backfill | Core / engine owner | P00 | 3–5 |
| P06 | Idempotent rule actions, XP and earned rewards | Core / engine + users owners | P05 | 3–5 |
| P07 | Notification requests and reliable Discord delivery | Core + bot / notifications owner | P01, P02, P05 | 3–5 |
| P08 | First complete contribution milestone and controlled cutover | Core + bot / integration owner | P03, P04, P06, P07 | 2–3 |
| P09 | Correct scheduled rules, follow preferences and weekly digest | Core + bot / engine + notifications owners | P08 | 3–5 |
| P10 | Legacy progression, proposals and contribution quests | Core + bot / engagement owner | P06, P08 | 4–6 |
| P11 | Server-persisted Dream Team missions and Discord previews | Core + client + bot / Dream Team owner | P02, P03, P05 | 4–6 |
| P12 | Real squad availability, invitations and accepted participation | Core + client + bot / Dream Team owner | P07, P11 | 4–6 |
| P13 | JEV moderation intake, evaluation and shadow mode | Core + bot / moderation owner | P01, P02, P05 | 3–5 plus observation |
| P14 | Moderator-reviewed actions, appeals and audit results | Core + bot / moderation owner | P13 evaluation gate, P07 | 2–4 |

Parallel work means separate owners/checkouts, not concurrent edits to shared files. Resolve ownership of Prisma migrations and API/module composition first. Pilot A is P01–P04; P00/P05–P07 can progress alongside it. Pilot B is P08. P09–P12 form Pilot C; moderation need not block any engagement release.

### P00 — Integrate the reviewed Core work

- Refresh the existing isolated `codex/discord-omnichannel-engine` integration checkout with the new `4b0f359..8c13a82` engine commits after checking for overlapping work. Do not modify the cofounder's feature branch or overwrite unrelated working changes.
- Reconcile Prisma schema/migrations, API and worker module imports, issue DTOs, GitHub adapters and frontend API services. Regenerate the client in the integration checkout and test clean plus existing-database migration paths.
- Replace cross-feature application imports with exported ports where required by current architecture enforcement, including engine snapshot reads and achievement integration.
- Preserve the catalog-sourced/custom trackable distinction and guarded admin controls. Record three contracts: canonical actor/entity IDs, versioned accepted-fact envelope, and execution/action/delivery idempotency keys. Keep engine control endpoints admin-only.
- **Done:** combined branch builds; relevant baseline tests and `architecture:verify` pass; any pre-existing failures are documented separately; no producer/XP owner ambiguity for the pilot event.

### P01 — Make the bot safe and observable in the test guild

Primary files: bot `src/discord/discord.gateway.ts`, `discord.module.ts`, `services/command-dispatcher.service.ts`, `handlers/discord-setup.service.ts`, `services/welcome.service.ts`, `src/main.ts`, `package.json` and deployment config.

- Add typed configuration and guild/destination checks. Separate command definitions from registration; add proposed `commands:deploy:test` and `test`/`test:unit` scripts (these do not exist today).
- Acknowledge long interactions before I/O; use request IDs and structured, redacted error logs. Handle shutdown, restart and failed Core calls without losing the ability to reply gracefully.
- Add a versioned button router. Persist domain workflow state in Core; do not depend on process-local collectors for long-lived mission/feed buttons. Modal paths respond with the modal first, then authorize/validate submitted input.
- Add health/readiness for gateway and Core connectivity; no automatic channel setup on restart.
- Introduce a bounded Core API client with timeouts and typed error/result contracts. Retry only safe reads or writes carrying an accepted idempotency key.
- **Done:** a test command works in guild `1494925337811751002`; an interaction from any other guild is rejected; restarting changes no channel setup; commands are not registered globally; slow operations acknowledge within Discord's interaction deadline.

### P02 — Link accounts and authenticate channel actions

Core owns `StartDiscordLink`, `CompleteDiscordLink`, `ResolveDiscordActor` and unlink/relink use cases in `users`; auth guards verify bot service credentials. Provider transport belongs under `platform/discord`. The client adds a link-completion screen using the existing authenticated community identity.

Chosen linking flow:

1. `/connect` obtains an opaque, short-lived request bound to the verified gateway user's Discord ID and guild; the response contains a link to the test web application.
2. The browser authenticates the existing Core/GitHub user and completes Discord OAuth `identify` with server-stored state, expiry and replay protection.
3. Core verifies the returned Discord identity equals the expected account, shows the association, and atomically consumes the request and sets the unique link. A forwarded URL or editable `discord_id` query is insufficient proof.
4. Conflicting existing links produce a recovery flow, not an automatic account merge. Unlink revokes channel access and queues managed-role reconciliation.

The bot authenticates as a fixed service over TLS using short-lived audience-scoped signed requests/JWTs verified by existing security infrastructure. It supplies an attested Discord actor; it cannot supply an arbitrary Core `userId` or wallet as the principal. Core resolves the account, checks the allowed guild/capability and rechecks resource permissions for every write. Browser cookies and provider access tokens stay in Core. Record service key rotation and replay behavior in the contract.

- Existing linked users are reconciled with the new proof model; never merge identity stubs by display name. New community accounts may remain walletless.
- The first-link reward stays disabled in the new flow until P06 provides durable award identity; display no reward promise until then.
- **Done:** fresh, existing, walletless, expired, replayed, wrong-Discord-account, duplicate-link and unlink cases pass; the bot cannot act for an arbitrary Core user; no provider token/prefix appears in logs.

### P03 — Port profile identity, not the full profile page

- Add a public-safe channel profile projection through users' exported ports, aggregating existing profile data, XP/tier, stored AI profile information and available achievement reads. Avoid joining domain tables from the bot.
- Implement `/profile [member]`, `/achievements [member]` and an explicit Share button. Default responses are private; share only public fields. Distinguish no linked account, no generated profile, no wallet and no achievements.
- Label stored AI assessment and freshness. Link to existing profile generation on web; do not trigger expensive analysis on every view.
- **Done:** member lookup resolves the correct Core identity; bot and web show matching persisted facts; walletless profiles render useful content; no secrets, private repository data or moderation records leak into the card.

### P04 — Make work discoverable

- Implement `/bounties` and `/issue <GitHub URL>` using existing list/detail capabilities. Support a small set of existing-backed project/language/status filters; do not promise an AI recommendation system in this slice.
- Render reward only for funded work, current state, concise context and View/Discuss actions. Persist an entity-to-thread mapping when discussion is created; reuse it on repeat clicks.
- Use existing route shapes for web handoff and attach a non-authorizing journey ID for attribution. Allow public read-only discovery before account linking.
- **Done:** cards reflect current Core state, stale buttons revalidate the entity, duplicate Discuss requests do not create multiple managed threads, and web links open the intended issue/bounty.

### P05 — Harden the new bridge and make replay safe

Primary Core owners: `modules/engine/{ports,application,infrastructure}`, producer domains, `shared/database`, existing queue adapter and worker composition.

- Retain the new `ENGINE_EVENT_MAPPINGS`, self-seeding `EngineEventBridgeService`, queue-backed backfill endpoint and seven source queries. Start the pilot with the existing `bounty.claimed.count` mapping; add a new mapping only for a real authoritative producer.
- Add a stable source-event ID and version to ingestion; unique acceptance per `(projection/trackable, eventId)`. The bridge currently subscribes to in-process `EventEmitter2`, catches failures and logs them; replace that handoff for reward-bearing facts with transactionally persisted domain event/work intent and a worker that drains it through pg-boss. Duplicate enqueue/delivery is expected and handled by the consumer.
- Atomically accept a metric event and update its snapshot. Make LATEST reject stale versions; validate distinct membership inputs before appending. Fix issue-vote concurrency by atomically determining/persisting its transition and durable delta event.
- Audit catalog field extraction and recipient mapping against actual event payloads. Catalog-backed trackables should remain immutable except label/active; missing producer/configuration must be visible in diagnostics.
- Version wallet-keyed versus canonical-user-keyed metrics. Current bounty and XP catalog entries use wallets and omit walletless winners; extend resolvers explicitly for GitHub-only/Discord-linked members without silently reinterpreting historical entity IDs.
- Harden the existing backfill: capture a source watermark or pause the producer, reconcile events after that point, and prevent older snapshots from overwriting newer live values. Give jobs progress/failure status and restart-safe chunking. Keep the admin `triggerRules` toggle disabled for pilot migrations until P06 makes actions idempotent; its current unchecked default is useful but not a safety guarantee. The seven available sources are created, claimed, revoked, refunded, resolved, disputed and XP total; other catalog facts are live-only until a valid historical source exists.
- **Done:** duplicate/reordered input, failure between writes, concurrent vote changes, restart/replay and backfill/live races pass against isolated PostgreSQL; engine totals agree with authoritative source facts and walletless participants are handled explicitly.

### P06 — Guarantee rewards and action retries

- Reserve a rule execution atomically before effects. Use immutable run identity and per-action status; once-only business milestones keep a stable milestone key across cosmetic rule edits. Repeatable rules use a defined occurrence or period key.
- Add an idempotent users XP ledger: unique `(userId, awardKey)` with atomic ledger insertion/total increment. Give the first migrated bounty-award producer a deterministic source key. Snapshot legacy XP as an opening balance instead of replaying historical rewards.
- Persist pending/succeeded/retryable-failed/permanent-failed action outcomes, bounded retry and operator-visible recovery. Do not record failed actions as completed or rerun successful siblings.
- Backfill with retroactive rules may execute XP/achievement actions today. Keep that option disabled and server-gated until the XP ledger, action keys and one-time execution reservation are in place; then test one-time and repeatable policies against replayed historical rows.
- Validate registered action types, parameter schemas, positive finite award amounts and reward limits. Prevent XP-total → XP-award feedback cycles.
- Separate achievement entitlement from delivery/claim. Preserve an earned reward while the member completes wallet/asset opt-in in the existing web flow; keep current eligibility checks.
- **Done:** concurrent rule evaluations award once; a crash after XP commits but before action acknowledgment safely retries; failed achievements remain actionable; unrelated action failures do not duplicate rewards; legacy XP remains unchanged at cutover.

### P07 — Deliver through notification policy

- Add engine `REQUEST_NOTIFICATION` action through a notifications-owned port. Requests reference an approved template/entity and explicit audience; no arbitrary Discord API execution from rule configuration.
- Add durable Discord delivery records with unique event/action destination keys, state, attempt count, scheduling and acknowledged message/thread IDs. Keep existing push-device outbox behavior intact.
- Resolve preferences at send time. Guild routing and user opt-in are separate; map every destination to the allowed test guild. Do not turn public-feed preferences into permission to DM.
- Persist bot-message mappings for edits; suppress untrusted mass mentions. Honor rate-limit responses; distinguish retryable failures from revoked permissions or deleted destinations.
- Specify the uncertain-send case: Discord may accept a message before the database records its ID. Reconcile where possible and surface unresolved attempts instead of claiming exactly-once external sends. Domain rewards remain unaffected by delivery retries.
- **Done:** preferences/unlink apply before sending; guild restrictions hold; retry cannot repeat XP; updates target the original message; permission failures are visible and recoverable.

### P08 — Demonstrate one complete omnichannel milestone

Use **first bounty claimed** as the first authoritative milestone because Core already provides that outcome. Do not label a paid claim as a generic PR merge; broader non-bounty contribution signals come later.

Read-only pilot slice (2026-09-24): Core's Discord profile read now exposes `bountiesClaimed` from the versioned user-keyed engine snapshot, and `/profile` renders first-claim progress/completion with that count. This gives linked members a visible P05-backed milestone without activating a rule or sending a new message. The once-only rule, base-XP migration, entitlement, notification delivery, and replay/restart demo remain P06–P08 work.

- Map the confirmed outcome to a canonical user's claim count. Seed one reviewed once-only milestone rule in the test environment.
- Reuse the newly cataloged `bounty.claimed.count` signal after P05 has durable acceptance and a canonical recipient. Do not treat the current wallet-keyed mapping as sufficient for walletless linked users.
- Preserve existing base claim XP exactly once through the migrated P06 award path. The milestone initially adds recognition/earned entitlement and notifications; extra milestone XP remains off until its policy is explicitly configured. Do not duplicate the existing base award in an engine rule.
- Trigger a test outcome through a domain integration fixture or dedicated test-repository/test-network flow. Fixtures must be environment-guarded and unavailable in production.
- Check the result in Core and Discord, replay the event and retry delivery, restart workers, and repeat the checks.
- **Done:** one canonical outcome, one intended base award, one milestone execution, recoverable channel deliveries, and consistent web/Discord progress. Record this as the first end-to-end pilot demo.

P08 complete (2026-09-30): The live demo passed. A dedicated, environment-guarded test bounty was claimed through the domain reconciliation path by the verified, opted-in member; the persistent worker awarded exactly one 200 XP base award, granted the entitlement, and delivered one milestone announcement (recorded message ID). Replaying the accepted fact and restarting the worker left every count and the message ID unchanged, and web/Discord progress both read 1 — the first end-to-end Pilot B demo. The original Core worktree had been deleted with the P05–P08 changes uncommitted; the implementation was recovered from session transcripts into `../devloot-core-omnichannel-recover3` (both LaunchAgents repointed) and remains uncommitted — see the [P08 milestone record](discord-p08-milestone.md) before further worktree operations.

### P09 — Scheduled engagement and digests

- Honor rule cron/timezone and active flags, claim due occurrences once, and implement or reject unsupported window/aggregation combinations. Define UTC calendar-week boundaries for the pilot and deterministic ties.
- Implement project/topic follow preferences and `/notifications`; choose immediate versus digest delivery. Default to no unsolicited DMs or mass mentions.
- Add opportunities, shipped activity and one weekly recap from verified data. Skip empty recaps; cap public output using test-guild configuration. New activity categories require real producers, not fabricated feed entries.
- **Done:** a weekly rule runs once for the intended week, clock/restart behavior is tested, unsubscribe is respected, and missed periods use a documented catch-up policy without flooding the server.

### P10 — Consolidate existing bot engagement

- Move `/daily` claim/streak state and `/rank`/`leaderboard` reads to Core; keep current rolling cooldown and tier behavior. Make claim state and award identity atomic.
- Move valid proposal creation and voting rules to their Core owners. Complete quests from successful persisted outcomes; rejected proposals and arbitrary channel messages earn nothing.
- Distinguish proposal votes from canonical issue votes. Expose issue voting through the existing `issues` use case and P05's atomic tracking; Discord and web must update one record per principal/issue.
- Reconcile old reaction-message behavior, then prefer buttons for new cards. Migrate Chef recurrence and all managed roles to workers. Replace `/sync-points` with ledger-aware reconciliation.
- Add the first contribution quests as domain-validated producers plus engine rules; no XP for repeated messages or changing votes back and forth.
- **Done:** feature-by-feature writer cutover is complete, valid legacy behavior still works, abuse/replay cases do not award, and the bot no longer writes migrated business tables. Remove Prisma migrations/database access from the bot only after its final domain writer is retired.

### P11 — Make Dream Team resumable across channels

- Persist a server-owned mission with ID, owner/project, version, draft, task references and current stage. Add authorization and optimistic concurrency; retain sensitive context only as needed.
- Reuse existing draft/judge/subtask/team use cases through exported capabilities. Replace browser-only persistence with server reads/writes; offer explicit import of the user's local draft instead of silently uploading every cached draft.
- Add `/dreamteam plan <issue>` and `/mission <id>` with compact summaries and a Continue on web button. Long generation requests get durable status IDs and bounded AI budgets.
- Use existing real developer profiles; remove simulated pool choices from the real workflow and correct misleading API descriptions.
- **Done:** start on web, resume in Discord and vice versa; concurrent edits conflict clearly; another user cannot read/edit a private draft; restart does not lose progress. GitHub writes remain separately reviewed/authorized.

### P12 — Turn matches into consenting squads

- Add explicit availability, interests and invitation preferences to the real candidate pool. Match explanations are advisory, not public scores of a member's worth.
- Persist invitation, accepted/declined/expired status, membership and role. Rate-limit outreach; invitation suggestions do not send automatically.
- Connect accepted participants to the mission's thread. Shared progress comes from confirmed task outcomes, not chat activity.
- Enable the currently disabled assignment route only with equivalent Core maintainer/entitlement checks, explicit participant consent and idempotent write handling. Website and Discord call the same authorized capability.
- **Done:** nobody is enrolled or assigned by matching alone; revoked permissions and stale invitations fail safely; status remains consistent across channels.

### P13/P14 — Add JEV moderation as a separate track

- P13 introduces report/context-menu intake, bounded evidence, guild-scoped cases, a feature-specific judgment port backed by `TypeSafeClient`, rubric/model versioning and validated typed outputs with abstention.
- Evaluate technical arguments, code, quoted abuse, scams, Portuguese/English, newcomer mistakes and prompt injection. Run in shadow mode on selected disclosed channels; sample unflagged content to measure misses.
- P14 adds private moderator review cards, current permission checks, explicit action decisions, a queued Discord action adapter, audit outcomes and appeals. A content edit invalidates a stale proposed action. Deleted Discord messages cannot be restored as original messages.
- Start with human-reviewed enforcement. Promotion to narrow automation is a separate feature flag and requires category-specific evaluation thresholds and moderator acceptance; bans stay manual initially.
- **Done:** model timeout/invalid output never causes a sanction; unprivileged/stale button clicks are rejected; evidence access/retention is bounded; moderation state never affects public XP or matching.

## Contract sketches to finalize in P00/P02

These are proposed contracts, not existing API promises. Implement endpoint controllers inside the owning feature, with a narrow channel adapter and exported ports; avoid a new all-purpose omnichannel service.

| Contract | Required behavior |
|---|---|
| `POST /api/channels/discord/link-requests` | Bot-service-only; expected Discord actor/guild, expiring opaque request; idempotent request ID |
| Discord OAuth start/callback in users auth | Authenticated Core browser principal, state binding, provider identity proof, atomic consume/link |
| `GET /api/channels/discord/me` | Resolve authenticated adapter's Discord actor to a minimal channel-safe identity |
| Profile read capability | Core identity → explicitly public profile projection; viewing another member grants no acting authority |
| Domain command adapter | Verified actor/context → owning use case; never an arbitrary client-supplied trackable/value writer |
| `AcceptedFactV1` | Stable event ID/type/version/time, actor/subject/recipient distinction, source and causation; no provider credentials/raw moderation text |
| Engine action request | Stable execution/action key, domain-specific validated params and explicit recipient; persisted action outcome |
| Notification request | Stable business key, approved template/entity, audience, preference category, and delivery destination mapping |
| Mission operations | Stable mission ID, expected version, permission-checked read/update; no dependence on browser cache |

Authentication failure, permission failure, stale state, duplicate request and dependency unavailability must have distinct typed responses so Discord can offer the appropriate next step.

## Validation and deployment sequence

1. **Local/fake adapters:** run focused unit/contract tests as slices land. Use Core's existing `bun run architecture:verify` and `bun run build`; add the bot test scripts in P01 and run its `npm run build`. Avoid using the current fix-mode lint script as a read-only check.
2. **Isolated PostgreSQL:** test additive migrations, transaction/concurrency behavior, worker retries and outbox repair on disposable test data. Explicitly select the test DB; do not point integration tests at a shared live database.
3. **Guild `1494925337811751002`:** install/verify the test bot, discover permissions/channels, deploy guild commands, enable only the current slice, execute the scenario matrix below and record evidence.
4. **Pilot observation:** observe useful actions, API/interaction errors, delivery lag, duplicates, opt-outs and moderator feedback. Pilot A need not wait for engine rewards. Before Pilot B promotion, every replay/concurrency acceptance check must pass.
5. **Production candidate:** deploy additive Core changes before the bot that consumes them. Cut over each producer/XP owner once; never dual-write. Copy reviewed configuration with production IDs explicitly, not by changing one guild variable on a test database. Roll out to the chosen guild with flags initially off, then enable the verified slices.

| Test-guild scenario | Required result |
|---|---|
| Fresh GitHub user without wallet links Discord | One verified Core identity; useful profile; wallet-only sections omitted |
| Wrong account, reused/expired link or second guild | No unauthorized link/action/delivery |
| Missing AI profile or unavailable Core | Clear fallback/retry response; no invented profile data |
| Repeated Discuss/share/mission button after restart | Authorized behavior, canonical state and no duplicate managed workflow |
| Same contribution arrives twice or concurrently | One intended metric increment/reward per business event |
| XP succeeds, announcement fails | XP stays awarded once; only delivery retries |
| Worker stops between commit and enqueue | Durable intent is drained on restart |
| Member opts out before queued delivery | Personal notification is suppressed |
| Two edits/votes occur at once | Correct final state and tracked transition; stale updates rejected as applicable |
| Weekly rule, replayed tick and disabled trackable | One due occurrence; disabled tracking/rules do not act |
| JEV uncertainty/failure or outdated moderation card | No automatic sanction; case remains reviewable |
| Feature rollback | Disable command/rule/delivery family without removing historical data or re-awarding XP |

Observability uses request/journey, business-event, engine execution/action and delivery IDs. Track meaningful contribution counts and return cohorts separately from clicks/check-ins. Alert on terminal action failures and reward inconsistencies; avoid logging account tokens or raw moderation messages.

## Cutover and rollback rules

- Maintain a per-capability writer map: legacy bot, existing Core subscriber, or engine-triggered Core use case. Exactly one produces each business reward during cutover.
- Backfill opening balances and metrics without firing historical rewards by default. Snapshot replacement must have a watermark or paused-producer boundary.
- Rollback a feature by disabling its commands/rules/deliveries and keeping the newer storage contract readable. Do not restore an old XP writer after ledger activity without reconciliation.
- Preserve existing unrelated bot functionality until each migration slice is accepted. Remove direct database access and startup migration execution after the last dependent feature moves.
- Review production configuration separately from test configuration. Production launch and any server changes are implementation actions, not effects of writing this plan.

## Immediate starting order

**Start P00 and P01, then P02–P04 for Pilot A while P05–P07 prepare Pilot B.** The first demo is a linked developer's real profile and an actionable issue card inside guild `1494925337811751002`. The second demo proves a contribution and its recognition survive retries across Core and Discord. Dream Team and moderation build on those same identities, contracts and delivery paths.

Preflight items to resolve during setup, not reasons to delay coding: test application identity/token, bot membership and exact permissions in the supplied guild, test Core/web URLs, test database and GitHub repository, OAuth callback configuration, and a moderator for later evaluation. Store credentials in the existing secret-management mechanism rather than task messages or committed files.
