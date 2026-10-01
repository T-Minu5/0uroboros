# Strategic evaluation addendum

The user's strategic-evaluation instruction now authorizes a provisional market. Both-player purchases, per-player Chaos limits, independent End Draft, real Duration storage/expiry, movement to open Nodes, probability transfer, shared Trash/recovery and mandatory choices are implemented for that pack. `EVALUATION_MARKET.md` defines its exact scope; `STRATEGIC_EVALUATION.md` records integrated evidence. Existing evaluation Locations, Circuit claims, randomized openings, lethal Collapse and local inactivity handling also supersede the older missing-feature notes below. No claim is made of online authority, complete production content or all possible content interactions.

# Evaluation pack addendum

The user explicitly approved the historical five Locations and three Circuit Rewards for evaluation. USER_DECISIONS.md records exact values and scope; src/content.ts is the implemented fixture. 52 deterministic tests pass, including earned VP, tied claims, visibility, Signal tower Crypto draws, no-revive Primary restoration, lethal Collapse, and repeated evaluation Cycles. Earlier source-required observations below describe the pre-approval state, not a current blocker for this pack. Full nonstarter market definitions remain pending.

# Runtime rules audit

Audit date: 2026-09-22. Scope: `src/game.ts`, `src/runtime.ts`, and their deterministic tests. Reviewer: the Systems/Rules specialist who implemented these files. This is an author self-review with additional adversarial tests, not an independent-agent certification or a completed product checkpoint.

## Authority

The V3.1 clean-start package is the canonical source. Relevant documents are `02_CANONICAL_GAME_RULES.md`, `03_STARTER_DECK_AND_CARD_SEMANTICS.md`, `04_RUNTIME_REVEAL_PROBABILITY_COLLAPSE.md`, and `05_DRAFT_REWARDS_ZONES_ENDGAME.md`.

Mel's current explicit decision permits unused Actions to carry between Runtime turns. The session accepts an explicit carryover configuration; the user-facing session must use `true`. Actions and pending reveal Actions do not carry between Cycles.

Mel has now explicitly approved higher ControlledWeight receiving next reveal priority. Equal ControlledWeight retains current priority. The engine keeps a required policy parameter for deterministic tests; the user-facing session must use `higher`. This current decision resolves the clean-start package's omitted priority direction.

Mel has now explicitly approved Vault Encryption scoring VP = 2, separate from its Power 2. Live total VP counts Vault Encryption in active owned Draw, Hand, Discard and Node zones, plus Server destruction awards. Destroyed cards are excluded. Final scoring selects the higher total or reports a tie, including after Server destruction.

## Verified implemented behavior

- Exact ten-card 5 Character / 3 Crypto / 2 VP starter roster and printed values.
- One mirrored opening shuffle, five-card hands, mirrored remaining deck order, distinct ownership IDs.
- Draw through deck exhaustion, independent later reshuffles, no fabricated replacement hand each Cycle.
- Runtime opening of Nodes 1–3, then Node 4, then Node 5; persistent access to opened Nodes.
- Character costs one Action, VP costs zero, Crypto cannot deploy, four-card capacity per player per Node.
- Face-down deployment and player-specific visible Power after reveal.
- Global priority alternating each player's chronological eligible cards; one reveal followed by its ordered effects before the next reveal.
- Starter draw, delayed Actions, Crypto, Drain and Restore effects.
- Generic Drain targets available Primary then Backup, clamps at zero, does not spill over, awards 8 or 12 VP once.
- Restore uses available Primary then Backup, clamps at maximum, cannot resurrect a destroyed Server.
- Higher numeric Power controls even when negative; ties split ControlledWeight.
- Probability transfer preserves total and source floor, half-percent increments; selection chooses one Node and excludes zero-weight Nodes.
- Collapse event order: each Node's Location stage, card stage, Power/winner stage, Location Reward stage; Effect Bank stage; separate probabilistic Circuit selection.
- Tied selected Node grants eligibility to both players without fabricating reward content.
- End-of-Cycle starter deployment and non-Crypto hand cleanup precedes individual Draft Crypto resolution.
- Pending turn-three Actions expire; new Cycle starts with two Actions, zero Wallet, and a real five-card draw.
- Purchase transaction checks phase, deadline, stock, wallet and per-pile cooldown before mutation; acquisition enters Discard and persists.
- Normal Cycle 16 includes final Draft before the game-end state. Purchases in that final Draft contribute to final scoring.
- Input APIs reject deployment and turn advancement while reveal/Collapse events remain queued. Draft is exposed only by the final queued transition.

## Visibility review

The presentation adapter masks both draw-pile orders, the opponent hand, and opponent face-down Node cards. Hidden cards contain only an opaque presentation ID and a hidden marker; no name, art, Power, cost or effect. Snapshots are detached copies, so UI edits cannot mutate authority through a snapshot.

Revealed source identities and public effect amounts are visible. Draw events announce the source and count, not the drawn identities. Own face-down cards remain inspectable because their identity is already known to their owner.

This is a local single-process prototype, not secure network isolation. Authoritative state remains accessible to application code and browser developer tools. The UI must consume `.view()` rather than render raw opponent state.

## Explicit limitations and unavailable content

- Complete approved Base, VP, Crypto and Chaos market data has not been provided to this engine. The optional practice market is an explicitly supplied starter-card development fixture, with fixture stock. It is not the canonical 9/3/3 market, Chaos selection or privileged Circuit offering.
- Location labels can be supplied, but there is no approved executable Location or Location Reward content. Location stages announce unresolved content and award nothing. This is an incomplete scaffold, not a decision that Locations have no effect.
- Circuit eligibility is computed; Circuit Reward mechanics are unavailable and are not replaced with Crypto, VP or arbitrary rewards.
- Duration cards, Effect Bank occupancy/expiry and Duration onCollapse are not implemented. The starter deck has none. The empty Effect Bank stage is not coverage of Duration rules.
- Movement, unopened-Node placement by effects, Trash recovery, Mods, choices and nonstarter effect combinations are not supported by the current session. The pure reveal ordering primitive filters unopened Nodes, but session-level opening-window effects need implementation when relevant content exists.
- Game-ending destruction during Collapse must finish the current Node, including awards, and stop later Nodes. Starter cards have no onCollapse attacks, so this path cannot occur through supported content and is not yet implemented or certified.
- The Draft deadline blocks late purchases. Automatic timer-driven ending requires UI/session scheduling; the engine currently exposes explicit End Draft and Next Cycle calls. The practice opponent ends without purchasing.
- No networking, simultaneous remote purchase race handling, disconnect handling, inactivity concession or persistent statistics is claimed.
- Runtime retains the current priority through Cycle transitions. The package does not separately specify a per-Cycle priority re-roll.
- Probability resets to the initial distribution each Cycle in this scaffold. Content capable of changing weights across Cycle boundaries needs an explicit persistence rule before integration.
- Live scoring is complete for supported starter cards and destruction awards. No assertion of nonstarter scoring, content completeness or final product acceptance is made.

## Deterministic evidence

`npm test`: 32 tests pass across two files at this audit.

Coverage includes three repeated Cycles and the normal sixteen-Cycle end sequence; purchase persistence; mirrored opening; exact cleanup ordering; delayed/expired Actions; clamped source-target effect data; destroyed-center awards; no fabricated empty-market offerings; and 12 seeded three-Cycle play runs with legal deployments by both players.

After every queued event in those seeded runs, tests verify ownership count, unique card instances, four-card capacity, nonnegative Actions, bounded Server integrity and hidden-information shape. Snapshot isolation is tested separately.

Additional approved-scoring tests cover active zones versus Destroyed, final-Draft Vault acquisition, tied totals, and a lethal attack where the player whose centers were destroyed still wins on VP.

These tests do not substitute for current-browser interaction, visual comparison, source approvals, full-content tests or the human direction checkpoint. Parent integration must run the complete build after frontend changes and perform actual multi-Cycle browser play.

## Location-count and historic-card runtime revision — 2026-09-24

Current user decisions supersede the earlier weighted Circuit evaluation: Circuit eligibility compares the number of Locations won after all Node closures. Equal win counts grant both players eligibility, including a 2–2 split with one tied Node. Reveal priority goes to the player controlling more Locations and stays unchanged on a tie. Active eligibility, priority, and opponent placement scoring do not use probability weights. Legacy probability card effects map 5/10/15 to 1/2/3 own Power transferred between the played Node and a linear neighbor. Modifiers preserve their sum, cannot take opponent Power, and reset each Cycle. Later removal of donor cards may leave negative effective Power, which is permitted.

The canonical unopened-Node rule is implemented from `04_RUNTIME_REVEAL_PROBABILITY_COLLAPSE.md:16`: unopened Nodes accept placements, preserve order and hidden opponent identity, and reveal their prior placements in a separate opening window before new planning. Actions from that opening window remain next-turn Actions. Undo restores every local planning placement, exact hand order, Actions and deployment ordering without consuming or rewinding randomness. It ends permanently when End Turn starts resolution.

Historic cards have explicit Runtime-turn schedules, including start/end timing. Age 1 is deployment; age 2 is the next Runtime turn, including across a Cycle boundary after refill. Scheduled start-of-turn Actions are usable that turn. Normal OnReveal Actions remain deferred. Finite Runtime storage expires at the next Runtime boundary after its final scheduled turn; Cycle-duration evaluation cards retain the existing Cycle lifecycle. Four Bank slots remain enforced; a new Duration rejected by a full Bank enters Discard and stops scheduling. Permanent storage has no automatic expiry. No new displacement rule is inferred.

New implemented primitives: optional exact discard payments; mandatory hand discard/trash; scoped opposing-hand choices; optional inspection/discard of the available top cards; named Coin gains to deck top; own Backup destruction without opponent destruction VP; random listed branches; and own Power transfers. Each choice and scheduled effect uses the same presentation/input barrier. Evaluation-only catalog injection uses unique instances and is unavailable after planning starts.

Targeted Server effects now obey existing no-revival and one-time destruction-award rules. Self-destruction of the final surviving center ends Runtime; Collapse still completes its current Node before stopping.

Verification at this revision: 185 tests pass. Every one of the 74 active definitions executes through four Cycles with legal choices, finite resources, unique instances, complete ownership conservation including generated Coins, Bank capacity, and finite timer expiry checked. Additional tests assert exact delayed Mega-Cache timing, permanent healing, optional-payment completion, scoped hand privacy, trash VP removal, scry order, cross-Cycle scheduled Actions/draws, unopened reveal sequencing, undo fidelity, and Circuit/priority ties. These fixtures validate the local engine; they do not claim multiplayer authority or final card balance.
