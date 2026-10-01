# Product and Technical Requirements

- `TECH-SCOPE-001` V1 is Runtime only.
- `TECH-CONFIG-001` Playtest values are data-driven/configurable, including timers, Cycle limit, Action carryover, probabilities, capacities, market counts/supplies, cooldowns, reconnect grace.
- `TECH-SCALE-001` Card classifications, effects, Locations, Mods, rewards, and pools are extensible.

## Stack
- `TECH-STACK-001` React Three Fiber required for 3D table/card meshes.
- `TECH-STACK-002` Three.js is underlying 3D/effects reference layer.
- `TECH-STACK-003` boardgame.io is primary game-state candidate but must be validated against simultaneous timers, Draft concurrency, reconnect, ordered resolution, and event-stream requirements. Do not force-fit.
- `TECH-STACK-004` React 19 + TypeScript preferred considerations. Redux Toolkit, Babylon.js, Playroom, spring physics may be evaluated but do not override R3F.

## Server authority
- `TECH-SERVER-001` Server authoritative for legality, Actions, placement, reveals, effects, capacity, Power, probability, RNG, Draft, Wallet, supply, VP, Data Centers, timers, disconnects, endgame, Collapse.
- `TECH-SERVER-002` Gameplay RNG server-side and auditable/reproducible where practical.
- `TECH-SERVER-003` Draft purchases atomic. Optimistic UI only with safe reconciliation.
- `TECH-SERVER-004` Canonical events have stable IDs/sequence numbers.

## Game Contract
- `TECH-CONTRACT-001` Systems defines semantics. Lead Engineering owns schema implementation.
- `TECH-CONTRACT-002` UX/LookDev consume contract and cannot invent gameplay state.
- `TECH-CONTRACT-003` Missing authoritative needs use `CONTRACT_REQUEST`.
- `TECH-CONTRACT-004` Contract is versioned. Breaking changes include migration notes.

## Events
- `TECH-EVENT-001` Game Events describe authoritative transitions, not visuals.
- `TECH-EVENT-002` Presentation Events are client derivations.
- `TECH-EVENT-003` No gameplay rules in shaders/UI/animation controllers.

## Wave Collapse
- `TECH-COLLAPSE-001` Server resolves ordered Collapse sequence.
- `TECH-COLLAPSE-002` Client visually interpolates authoritative results. Presentation timing cannot alter outcomes.
- `TECH-COLLAPSE-003` Expose sufficient event granularity for Node, Location/Card effects, Power, winner, rewards, Effect Bank, probability selection, Circuit Reward, Data Center/VP/end changes.

## Card model
- `TECH-CARD-001` Separate card definition from card instance.
- `TECH-CARD-002` Stable unique card instance ID.
- `TECH-CARD-003` Instance supports zero/one Mod.
- `TECH-CARD-004` Track owner and controller separately.
- `TECH-CARD-005` Track canonical zone and ordering metadata.

## Networking and reliability
- `TECH-NET-001` Implement approved reconnect behavior while preserving authoritative state.
- `TECH-NET-002` Server-authoritative deadlines/timestamps.
- `TECH-NET-003` Critical commands are idempotent or duplicate-protected.

## Logs
- `TECH-LOG-001` Logs derive from authoritative events.
- `TECH-LOG-002` Deterministic concise P1/P2 formatter.

## Accounts / future monetization
- `TECH-ACCOUNT-001` Landing: Sign in or Join Game. Join Game accepts game code.
- `TECH-ACCOUNT-002` Architecture supports Gmail and email login for MVP.
- `TECH-MEMBER-001` Free authenticated players may play but cannot view persistent stats or create/access private games until Membership.
- `TECH-MEMBER-002` Private games are configurable and stats are separate from matchmaking.
- `TECH-MEMBER-003` Membership/payment execution is later, but architecture should avoid rewrite.

## Testing
- `TECH-TEST-001` Core rules automated independently of rendering.
- `TECH-TEST-002` Seeded Collapse fixtures test order, early termination, ties, probability, rewards, RNG.
- `TECH-TEST-003` Draft concurrency tests include races, cooldowns, depletion, deadlines, reconnect, duplicate requests.
- `TECH-TEST-004` Contract tests validate UX/LookDev fixtures.


## Internal implementation authority

- `TECH-INT-001` Lead Engineering may make modular structural implementation decisions without a bespoke rule ID when the decision introduces zero new gameplay semantics, changes no approved rule, changes no externally consumed Game Contract semantics, and remains consistent with existing TECH requirements.
- `TECH-INT-002` If an internal choice changes externally consumed contract semantics, gameplay legality, timing semantics, or player-visible outcome, it is not covered by TECH-INT-001 and must follow the normal contract/rule process.

## Engine feasibility gate

- `TECH-SPIKE-001` Before substantive implementation commits to boardgame.io, Lead Engineering must run a focused feasibility spike against actual 0uroboros requirements.
- `TECH-SPIKE-002` The spike must include at minimum:
  - simultaneous face-down Runtime deployment
  - simultaneous Draft purchase race against shared limited supply
  - independent authoritative timers
  - first-disconnect pause and reconnect
  - second-disconnect no-pause behavior
  - ordered Wave Collapse event playback
  - presentation barrier before Draft activation
- `TECH-SPIKE-003` Engineering must publish an ADR with one verdict: `ADOPT`, `ADOPT_WITH_EXTENSION_LAYER`, or `REJECT`, with concrete reasons and migration implications.
- `TECH-SPIKE-004` Broad production implementation must not assume boardgame.io is final until the ADR is accepted.

## Deterministic RNG and replay

- `TECH-RNG-001` All gameplay-relevant RNG is deterministic, server-authoritative, seedable, and replayable for V1.
- `TECH-RNG-002` This includes initial mirrored shuffle, later independent shuffles, Location selection, Chaos selection, timeout random choices, random deck placement, and probabilistic Circuit Reward Node selection.
- `TECH-RNG-003` Match/event records must retain enough RNG provenance to reconstruct authoritative outcomes for automated tests, debugging, and dispute analysis.
- `TECH-RNG-004` No production gameplay RNG may rely on an untracked client random source.

## Presentation barrier

- `TECH-PRESENT-001` The server computes authoritative phase outcomes independently of visual duration.
- `TECH-PRESENT-002` For theatrical sequences such as Wave Collapse, the server emits the ordered event stream plus an authoritative presentation barrier/deadline.
- `TECH-PRESENT-003` The next interactive phase, such as Draft, does not become active and its actionable timer does not begin until the server-owned presentation barrier is reached.
- `TECH-PRESENT-004` Clients may send presentation-complete acknowledgements for telemetry/synchronization, but client acknowledgement is never required to unblock authoritative server progression.
- `TECH-PRESENT-005` A slow, disconnected, or malicious client cannot hold the match hostage by withholding an animation-complete acknowledgement.

## Provisional contract mocks

- `TECH-CONTRACT-005` UX/LookDev may continue work after submitting a CONTRACT_REQUEST by creating a `PROVISIONAL_MOCK` outside the canonical Game Contract.
- `TECH-CONTRACT-006` Every provisional mock must cite its Contract Request ID, mark all unapproved fields as provisional, and state the fallback behavior if Engineering rejects or changes the request.
- `TECH-CONTRACT-007` Provisional mocks never become authoritative merely because components were built against them.
- `TECH-CONTRACT-008` When the canonical contract resolves the request, dependent mocks/fixtures must be reconciled or invalidated before implementation is considered complete.

## Observability and replay

- `TECH-OBS-001` Maintain an append-only authoritative match event log with stable event IDs, sequence numbers, server timestamps, actor, command/request correlation where relevant, and rule/requirement references where practical.
- `TECH-OBS-002` Support deterministic match replay/debug reconstruction from initial state + canonical config + authoritative commands/events + RNG provenance.
- `TECH-OBS-003` Presentation logs and gameplay logs are derived views and are not substitutes for the authoritative event record.

## Command idempotency

- `TECH-CMD-001` Critical client commands use explicit request IDs/idempotency keys.
- `TECH-CMD-002` Duplicate delivery of the same command must not duplicate gameplay effects.
- `TECH-CMD-003` Draft purchase commands must return an authoritative acknowledgement referencing the request ID and resulting Wallet/supply state.


## OpenAI agent runtime requirements

- `TECH-AGENT-001` Use the current OpenAI Agents SDK for TypeScript, not the deprecated experimental OpenAI Swarm project.
- `TECH-AGENT-002` Core planning uses manager-style orchestration. Astra remains the conversation owner and invokes specialists as agent tools where appropriate.
- `TECH-AGENT-003` Specialists cannot recursively spawn arbitrary specialists.
- `TECH-AGENT-004` Deterministic workflow transitions belong in application code when judgment is unnecessary.
- `TECH-AGENT-005` Planning agents receive no production filesystem mutation, shell, deployment, Git commit/push, billing, or destructive tools.
- `TECH-AGENT-006` Execution agents may receive sandbox-scoped tools only through approved WorkPackages.
- `TECH-AGENT-007` Structured outputs use Zod or another SDK-supported schema and are revalidated by application code at authority boundaries.
- `TECH-AGENT-008` Built-in SDK tracing remains enabled by default unless explicitly disabled for an operational/privacy reason.
- `TECH-AGENT-009` Local run manifests record only usage metrics actually exposed by the SDK. Never fabricate per-agent token attribution.
- `TECH-AGENT-010` SDK `maxTurns` and application-level RunBudget are both required.
- `TECH-AGENT-011` SDK approval/interruption mechanisms should be used for approval-gated tools where appropriate, while application governance determines whether approval is required.
- `TECH-AGENT-012` Sandbox Agents are gated execution infrastructure, not default planning infrastructure.
- `TECH-AGENT-013` Model IDs and optional model settings are centralized and environment-overridable.
- `TECH-AGENT-014` Astra fallback is explicit and logged. Never silently replace Astra.
- `TECH-AGENT-015` Canonical context is retrieved by relevant IDs/slices rather than injected wholesale into every specialist call.
