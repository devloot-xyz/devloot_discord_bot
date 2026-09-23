# Committed Core and data engine: implications for Discord

2026-09-23 · companion to the [omnichannel plan](discord-omnichannel-plan.md).

Next: [implementation plan and test-guild rollout](discord-implementation-plan.md).

## Update: engine branch at `8c13a82` (2026-09-23)

The cofounder's branch advanced from `4f890b3` to `8c13a82` in 12 commits. This is source review of the fetched branch, not a claim that the updated engine is deployed or already merged into the isolated Core integration checkout (`b85f67a`).

| New capability | What it enables for Discord | Remaining gate |
|---|---|---|
| Event bridge with 11 catalog mappings and startup seeding | Bounty created/claimed/review/refund signals and XP snapshots can feed shared cards and milestone rules without inventing a new catalog. `bounty.claimed.count` is the first pilot signal. | The bridge listens to in-process events and logs record failures; it has no durable source event ID or replay guarantee. |
| Catalog/custom split in the admin screen and server-side edit guard | Operators can see which trackables have a coded producer; key, entity type and aggregation are fixed for catalog entries. | A catalog entry is only a producer mapping, not proof of complete history or reward safety. |
| Seven ground-truth backfill queries, queue job and guarded admin endpoint | Existing created/claimed/revoked/refunded/resolved/disputed/XP totals can be reconstructed in a test environment. The UI defaults retroactive rule triggering to off. | Snapshot replacement can race live events; jobs lack a source watermark, per-row transaction boundary and detailed progress. Four mapped bounty signals have no backfill source. |
| `lastBackfilledAt` and PostgreSQL source tests | Operators can see a completed timestamp and the source queries have fixture coverage. | A timestamp does not report partial failure, historical rules executed, or whether live events were overwritten. |

The mappings still use wallet strings for user metrics. In particular, the claimed-bounty backfill joins winners to wallets and excludes a GitHub-only winner without one. This is incompatible with the planned walletless Discord onboarding until new canonical-user metrics or explicit identity resolution are added. `user.xp.total` is an observation signal; do not let a rule that awards XP trigger itself through that signal. The new retroactive-rules toggle must stay disabled for the pilot until P06 supplies once-only execution and idempotent XP/action keys.

**Plan change:** P00 now refreshes the existing integration checkout with these commits. P05 reuses and hardens the bridge/backfill instead of building those from scratch; P06 explicitly gates retroactive rule execution; P08 reuses `bounty.claimed.count` only after durable acceptance and canonical recipient resolution. Pilot A's read-only profile/discovery order is unchanged.

Sources: [catalog mappings](https://github.com/devloot-xyz/devloot-core/blob/8c13a826a8f7809a0fc27df8c437e4f4c6a8f991/server/src/modules/engine/infrastructure/event-bridge/event-mappings.ts), [bridge](https://github.com/devloot-xyz/devloot-core/blob/8c13a826a8f7809a0fc27df8c437e4f4c6a8f991/server/src/modules/engine/infrastructure/event-bridge/engine-event-bridge.service.ts), [backfill executor](https://github.com/devloot-xyz/devloot-core/blob/8c13a826a8f7809a0fc27df8c437e4f4c6a8f991/server/src/modules/engine/application/backfill-executor.service.ts), [backfill sources](https://github.com/devloot-xyz/devloot-core/blob/8c13a826a8f7809a0fc27df8c437e4f4c6a8f991/server/src/modules/engine/infrastructure/event-bridge/backfill-sources.ts), [admin backfill UI](https://github.com/devloot-xyz/devloot-core/blob/8c13a826a8f7809a0fc27df8c437e4f4c6a8f991/client/src/pages/admin/EngineTrackablesTab.tsx).

## Decision

**Use the cofounder's engine as DevLoot's shared engagement metrics and configurable reward-rule layer.** Discord supplies an interface to the same business workflows used by the website. Domain modules authorize and persist actions; the engine tracks the resulting facts and evaluates rules; notifications deliver the outcomes through selected channels.

This replaces the earlier proposal to build substantial new engagement-rule machinery. It does not replace identity linking, durable delivery, domain authorization, or the squad/moderation workflows themselves.

## What was reviewed

- Current committed Core: `066d18f63bc2e592e91446d9fea880e646d25e1a`, “connect Dreamteam to developer profiles and refine platform experience.”
- Freshly fetched `origin/feat/data-engine`: `4f890b34dd091ba4e50739909893c491d12b7b1b`.
- Their common ancestor is `a7691ad`. The engine branch and current profile/Dream Team branch are separate lines of development; neither represents the combined target yet.
- Reviewed committed files using `git show`, without switching or merging the working checkout. Production deployment and database state were not inspected. The engine design document calls it live; this review confirms source implementation, not that deployment claim.

### Corrections to the first assessment

1. **Profile judgments and contributor matching are committed now.** The earlier “uncommitted work” qualification is obsolete for these features.
2. **Dream Team now recommends real stored developer profiles.** `SuggestDevlootDreamteamTeamUseCase` obtains candidates through `PROFILE_RANKING`, batches them for JEV, and returns `poolSource: 'developer-leaderboard'`. My earlier blanket description of its team picker as simulated was inaccurate for this implementation. The old pool endpoint and some API descriptions remain simulation-oriented.
3. **Assignment has two different states:** the use case now resolves a real leaderboard username and rejects old fictional IDs; the HTTP assignment endpoint still always throws. A passing assignment unit test does not mean users can assign through the API.
4. **Persistent workspace currently means browser IndexedDB.** A server-owned mission/draft with access control and versioning is still needed for web → Discord continuation. The existing work-breakdown and team-generation use cases can be reused.

Sources: [real-profile team suggestions](https://github.com/devloot-xyz/devloot-core/blob/066d18f63bc2e592e91446d9fea880e646d25e1a/server/src/modules/devloot-dreamteam/application/suggest-devloot-dreamteam-team.usecase.ts), [assignment use case](https://github.com/devloot-xyz/devloot-core/blob/066d18f63bc2e592e91446d9fea880e646d25e1a/server/src/modules/devloot-dreamteam/application/assign-devloot-dreamteam-contributor.usecase.ts), [controller](https://github.com/devloot-xyz/devloot-core/blob/066d18f63bc2e592e91446d9fea880e646d25e1a/server/src/modules/devloot-dreamteam/http/devloot-dreamteam.controller.ts), [workspace persistence](https://github.com/devloot-xyz/devloot-core/blob/066d18f63bc2e592e91446d9fea880e646d25e1a/client/src/lib/devloot-dreamteam-db.ts).

## The engine's actual scope

| Capability | Status at `4f890b3` | Omnichannel use |
|---|---|---|
| Trackable definitions, event ledger and snapshots | Implemented, including COUNT/SUM/LATEST/DISTINCT_COUNT paths | Shared progress signals from authoritative actions across channels |
| Reactive thresholds and scheduled evaluation | Implemented with once/repeatable modes and cooldown checks | Milestones, activity reminders and rankings after correctness work below |
| XP action | Implemented through users' `AWARD_XP` port | One reward owner across web and Discord |
| Achievement action | Implemented by calling the existing achievement claim use case | Reuse reward integration, but separate eligibility from wallet claim readiness |
| Trackables/rules admin UI and guarded endpoints | Implemented | Configure thresholds and rewards without adding bot command code each time |
| Issue-vote producer | Implemented; the only production `trackingEngine.record()` caller found | A shared issue score that Discord buttons could read/change through the issues use case |
| Issue comments, ownership, upvotes and timeline reads | Implemented in the same branch | Issue cards and contextual discussion; not yet a persisted, cross-channel feed |
| Domain-event mapping catalog, bridge, self-seeding and backfill | Design and implementation-plan documents only | Planned integration point to coordinate with the engine owner |
| Notification/Discord delivery action | Not registered; only XP and achievement executors are registered | Add a notification-request executor that calls the notifications port |
| Quests, squads, Discord identity, moderation judgments | Not supplied by the engine | Domain workflows/producers built alongside it |

A trackable created in the admin UI does not automatically collect data. A trusted producer must record its metric. Similarly, adding a new action name requires an implemented executor; the admin UI is not an arbitrary workflow executor.

The current rules compare **one metric** to a threshold/ranking/age condition. They do not implement arbitrary multi-step journeys or compound eligibility. A domain use case should emit a validated fact such as “contribution accepted” after checking its prerequisites; the engine can count that fact.

Sources: [module and registered actions](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/engine.module.ts), [tracking service](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/application/tracking-engine.service.ts), [issue-vote producer](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/issues/application/vote-issue.usecase.ts), [event-bridge design](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/docs/superpowers/specs/2026-09-23-engine-event-bridge-design.md).

## How this makes Discord more useful

These are proposed product rules, not already-configured features. XP amounts should be tuned from the existing economy; none are prescribed here.

| Experience | Authoritative signal | Engine role | Additional work |
|---|---|---|---|
| First ship celebration | First verified contribution/bounty outcome | COUNT ≥ 1; one milestone | Contribution event mapping, idempotent award and opt-in celebration |
| Community shipping goal | Accepted contributions for a project/campaign | COUNT reaches configured target | Campaign attribution and public progress card |
| Weekly builders | Contributions in a defined weekly period | Ranking/window evaluation | Correct schedule/period semantics, tie policy and recap delivery |
| Help wanted | Last meaningful activity for an issue | LATEST age condition | Activity producer, closed-issue checks and followed-project notifications |
| Community-selected issue | Canonical issue score | SUM threshold | Shared vote command, abuse controls and editorial/maintainer review |
| Squad milestone | Accepted work toward a mission | Track task/mission progress | Persistent squad, consent, membership, task completion policy |
| Helpful contributor | Maintainer-confirmed useful help/review | Count validated help events | Confirmation workflow; raw message volume is not evidence |

An example journey: a developer discovers an issue in Discord, votes through the same Core vote use case as the website, joins a mission, and submits work on GitHub. Core confirms the contribution. The engine evaluates a milestone, the users module awards XP once, and notifications update the Discord card and in-app view. Discord retrying a message cannot award the XP again.

Some useful signals lack a producer today: ordinary PR merges beyond the bounty lifecycle, accepted mentoring/help, squad participation and project-level campaign attribution. Naming these trackables is only the schema/configuration step.

## Contract to agree with the engine owner

Adopt one small versioned business-event envelope for the bridge: `eventId`, `type`, `schemaVersion`, `occurredAt`, `actorUserId`, `subject`, `sourceChannel`, `correlationId`, `causationId`, and explicitly permitted payload fields. Distinguish the person acting, the entity being tracked, and the person being rewarded.

- **Core user ID is canonical.** The current `UserEntityResolver` treats `entityId` as a wallet. Add explicit user-ID resolution before feeding it Discord identities or GitHub-only accounts. Keep wallet-scoped legacy mappings versioned during migration; do not reinterpret their existing IDs silently.
- **The producer proves the fact.** Discord calls a domain command; the domain emits a successful outcome. Do not expose unrestricted `record(trackableKey, value)` ingestion to ordinary bot users or accept XP claims from clients.
- **The engine owns measurements and rules.** Preserve its ports, tables and admin UI; add stable event/action identity and durable execution there.
- **Notifications owns delivery.** Add `REQUEST_NOTIFICATION` behind its port with an entity/template reference, audience and delivery idempotency key. Templates and preferences determine channel content; a rule should not send arbitrary Discord payloads directly.
- **JEV owns no enforcement authority.** The moderation module requests JEV assessment and authorizes decisions. The engine can track confirmed outcomes for operations, but raw model confidence should not trigger an XP penalty, ban or cross-channel restriction.

Keep new cross-feature calls behind ports. The branch currently imports engine application use cases directly from `issues`, and its achievement executor imports an achievements application class. Those are seams to align with Core's existing cross-feature dependency rules during integration.

## Reliability prerequisites for shared rewards

These are concrete source findings with consequences for the proposed rollout, not claims that production incidents have occurred.

**1. Make event acceptance idempotent and atomic.** `TrackInput` has no source-event ID, and recording history and updating a snapshot are separate writes. Replays can increment counters twice; partial failures can leave them inconsistent. Issue voting also reads the prior vote, changes it, and records the delta separately. Add source-event uniqueness per projection and an atomic vote/delta or durable event transaction. Compare event version/time for LATEST so delayed events cannot replace newer state. [Tracking implementation](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/application/tracking-engine.service.ts#L26).

**2. Persist action outcomes and reserve executions before effects.** The dispatcher catches action failures; the evaluator then records the rule as fired. A one-time reward can be lost. Concurrent evaluators can both see “not fired” and award before either records completion. Reserve a unique rule/version/entity/period execution atomically, persist each action's pending/succeeded/failed state, and use its stable ID in the XP ledger and notification request. Retrying one failed action must not rerun successful siblings. [Evaluator](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/application/rule-evaluation.service.ts#L36), [dispatcher](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/application/rule-action-dispatcher.service.ts#L17).

**3. Honor schedules and aggregation semantics.** The recurring worker ticks every five minutes, and the scheduler does not check saved `rule.cron`; it also does not skip an inactive trackable. Window aggregation always sums event values, which is unsuitable for LATEST and distinct membership semantics. Implement due-occurrence/timezone handling and period keys, check active flags, and reject unsupported aggregation/window combinations until implemented. Calendar-week recognition needs more than a rolling window and cooldown. [Scheduler](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/application/engine-rule-scheduler.service.ts#L21), [ledger](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/infrastructure/prisma-engine-ledger.adapter.ts#L65).

**4. Resolve the intended recipient and separate earning from claiming.** The issue resolver rewards the linked bounty's funder, not necessarily the issue author, voter or contributor; unfunded issues resolve to nobody. Keep this only for explicitly sponsor-focused rules. The achievement executor attempts the existing claim flow, which requires wallet readiness/asset opt-in. Persist an earned entitlement that survives an incomplete claim and offer the web claim flow later. Also validate action type and parameters, finite positive XP amounts and explicit budgets before saving/enabling rules. [Issue resolver](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/infrastructure/resolvers/issue-entity-resolver.ts), [achievement executor](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/server/src/modules/engine/infrastructure/actions/grant-achievement-action-executor.ts).

**5. Finish the bridge with durable delivery and controlled replay.** The planned bridge reads in-process events and logs failures; it is a good mapping catalog but cannot recover a process crash after the business commit. Persist business events/work intent transactionally, consume them through pg-boss, and replay idempotently. Historical backfill needs a watermark/cutover strategy so replacement snapshots cannot overwrite concurrent live updates; default to no retroactive rewards. Guard reward feedback loops: the planned XP-total mapping plus an XP-awarding rule can otherwise cause new XP events to trigger further awards. [Bridge/backfill proposal](https://github.com/devloot-xyz/devloot-core/blob/4f890b34dd091ba4e50739909893c491d12b7b1b/docs/superpowers/specs/2026-09-23-engine-event-bridge-design.md).

## Revised delivery sequence

1. **Integrate the two Core branches and agree contracts.** Reconcile schema/module/API changes first. Fifteen file paths changed on both sides since the common ancestor, including Prisma schema, API composition, issue DTOs, GitHub adapters and frontend API services. This is overlap, not a claim that all fifteen produce merge conflicts. Validate migrations and generated clients on the combined branch.
2. **Ship read-only Discord value in parallel:** secure linking, builder cards, existing achievements, issue/bounty discovery and contextual links. This does not need all engine features to be finished.
3. **Harden the existing engine and complete the event bridge.** Start with a single confirmed contribution outcome and explicit recipient, with replay, concurrency and failed-action coverage. Preserve existing base bounty XP while disabling any equivalent engine award until its old writer is deliberately migrated.
4. **Run one complete omnichannel milestone.** Confirmed outcome → engine metric/rule → one XP award → in-app/Discord notification. Add delivery preferences and message mapping. Validate failure and retry at each boundary.
5. **Add rule templates and admin preview.** First contribution, community goal and idle-issue reminder first; scheduled weekly recognition after schedule semantics are fixed. Show sample qualifying entities and expected actions before activation; trackable creation alone should not imply a working producer.
6. **Add server-persisted Dream Team missions and opt-in squads.** Reuse real matching immediately, but carry draft IDs, members, acceptance and versioned progress across web and Discord. Keep assignment gated until its HTTP authorization/consent flow is complete.
7. **JEV moderation track:** case/report intake and shadow evaluation can proceed independently. Add moderator-reviewed enforcement only after the evaluation supports it; engine metrics can help monitor review volume and time saved.

This changes the division of work more than it guarantees a shorter timeline. The engine supplies existing data models, rule configuration and integration seams; reliability, identity and channel delivery still require implementation. Re-estimate the earlier calendar ranges with the engine owner after the combined branch and event contract are agreed.

## Verification

- Committed Dream Team matching and assignment use-case tests: **2 suites, 5 tests passed** on the current Core checkout.
- Engine tracking, rule evaluation, scheduler, action dispatcher and validation tests: **5 suites, 30 tests passed** against an isolated source snapshot of `4f890b3`, using the existing local dependencies. No dependency installation or database migration was run.
- These tests confirm the currently encoded unit behavior, including log-and-continue action failure handling. They do not demonstrate concurrency safety, delivery guarantees, live Discord behavior, PostgreSQL integration, or correctness of a combined branch.
- Application source was not changed. The main plan was updated to incorporate this review.
