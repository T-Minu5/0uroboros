# 0uroboros Game Contract v1.1

## Ownership
Systems/Rules defines semantic meaning. Lead Engineering owns the concrete schema and versioning. UX and LookDev consume it.

## Principles
- `CONTRACT-001` Outcome-affecting values come from authoritative state.
- `CONTRACT-002` Presentation may own hover, animation progress, interpolation, camera, shader intensity, and temporary emphasis.
- `CONTRACT-003` Client presentation never becomes a second rules engine.
- `CONTRACT-004` Missing authoritative information requires `CONTRACT_REQUEST`.
- `CONTRACT-005` UX/LookDev may use a separately marked `PROVISIONAL_MOCK` while a request is pending.
- `CONTRACT-006` Provisional mocks never gain canonical authority by usage.
- `CONTRACT-007` Contract versions are explicit and fixtures declare which version they target.
- `CONTRACT-008` Node Power is an alias for Node P1 Power and Node P2 Power. Do not add a redundant `node_power` field for UI convenience.

## Required authoritative domains

### Match
Expose:
- matchId
- contractVersion
- canonicalConfigVersion
- cycle
- phase/subphase
- serverTime/deadlines
- current mode, Runtime only for V1
- match status/result
- P1/P2 connection/AFK/concession/forfeit state

### Runtime
Expose:
- turn 1–3
- opened Nodes
- priority
- Actions
- Action carryover setting
- per-player ended status
- legal-action summaries sufficient for UX
- active deadline

### Nodes
Expose:
- Node ID/status
- Location definition/reference
- Location silence/state modifiers
- probability
- P1/P2 Power. `CONTRACT-008` Node Power is a presentation alias for those two values, not a third authoritative field.
- priority when relevant
- P1/P2 public card slots
- capacity and remaining slots
- public legality/restriction indicators

### Cards
Expose card-instance concepts:
- stable instance ID
- definition ID when visible to recipient
- owner
- controller
- zone
- reveal state
- chronological play-order key
- current Power/public modifiers as allowed
- zero/one Mod
- Duration/Effect Bank state where applicable

### Player resources
Expose:
- VP
- Actions
- Wallet during Draft
- Data Centers
- Effect Bank
- public Trash
- recipient-appropriate private hand information
- allowed inspection views

### Data Centers
Expose:
- Primary max/current/destroyed
- Backup max/current/destroyed

### Effect Bank
Expose:
- 4 ordered slots
- card instance references
- Duration remaining / infinity
- public protection/removal state where relevant

### Draft
Expose:
- Draft phase status
- server start/deadline
- P1/P2 Wallets
- Base/VP/Crypto persistent market piles and remaining shared supply
- Chaos offerings and per-player remaining availability
- Circuit Reward slot and per-player eligibility/claim state
- same-pile cooldown state per player/card
- P1/P2 End Draft state
- pending mandatory choice state
- public confirmed purchase feed

### Zones and visibility
Contract serialization must support:
- public view
- owner-private view
- server-private view
- temporary effect-granted inspection views

## Commands

Critical commands include explicit request IDs/idempotency keys.

Minimum concepts:
- DeployCard
- EndTurn
- UndoEndDraft
- EndDraft
- DraftPurchase
- ResolveChoice
- Concede
- Reconnect/auth resume handshake

### DraftPurchase request
Must include at least:
- requestId / idempotencyKey
- matchId
- playerId
- marketEntryId / card definition target
- clientObservedDraftVersion or equivalent optimistic-concurrency marker if used
- clientTime only for diagnostics, never authority

### DraftPurchase acknowledgement
Must include:
- requestId
- accepted/rejected
- rejection reason if any
- authoritative resulting Wallet
- authoritative remaining supply / per-player availability
- granted card instance ID if successful
- authoritative event sequence number(s)

## Authoritative Game Events

At minimum:
- MATCH_STARTED
- CYCLE_STARTED
- LOCATION_SETUP_COMPLETED
- START_CYCLE_EFFECT_RESOLVED
- HAND_DRAWN
- TURN_STARTED
- NODE_OPENED
- ACTION_CHANGED
- CARD_DEPLOYED
- CARD_REVEALED
- CARD_EFFECT_RESOLVED
- CARD_MOVED
- CARD_TRASHED
- CARD_DESTROYED
- POWER_CHANGED
- PROBABILITY_CHANGED
- DRAIN_APPLIED
- RESTORE_APPLIED
- DATA_CENTER_DESTROYED
- VP_CHANGED
- NODE_WINNER_DETERMINED
- LOCATION_REWARD_GRANTED
- EFFECT_BANK_CARD_ENTERED
- EFFECT_BANK_CARD_EXITED
- EFFECT_BANK_EFFECT_RESOLVED
- COLLAPSE_STARTED
- NODE_COLLAPSE_STARTED
- NODE_COLLAPSE_COMPLETED
- EFFECT_BANK_COLLAPSE_STARTED
- EFFECT_BANK_COLLAPSE_COMPLETED
- PROBABILITY_SELECTION_STARTED
- CIRCUIT_NODE_SELECTED
- CIRCUIT_REWARD_GRANTED
- POST_COLLAPSE_CLEANUP_COMPLETED
- DRAFT_STARTED
- CRYPTO_CARD_PLAYED
- DRAFT_PURCHASE_CONFIRMED
- DRAFT_PURCHASE_REJECTED
- DRAFT_ENDED
- PLAYER_DISCONNECTED
- PLAYER_RECONNECTED
- PLAYER_CONCEDED
- PLAYER_FORFEITED
- MATCH_ENDED

Every authoritative event includes:
- eventId
- sequence
- serverTime
- type
- payload
- related rule/tech IDs when practical
- causation/correlation ID where relevant
- RNG provenance reference if randomness affected the outcome

## Presentation Events
Presentation events are derived client-side and may include reveal animations, Power pulses, Drain/Restore FX, probability transitions, Collapse theatrics, and phase announcements.

## Wave Collapse event stream
The server emits the complete authoritative sequence. The client renders it over a presentation timeline. A server-owned presentation barrier prevents the next interactive phase from starting early, but client acknowledgement does not gate server progression indefinitely.

## CONTRACT_REQUEST
Required fields:
- request ID
- requester
- missing field/event
- use case
- authoritative/presentation classification
- related canonical IDs
- suggested shape
- fallback if denied
- canonical version requested against

## PROVISIONAL_MOCK
Required fields:
- mock ID
- contractRequestId
- requester
- provisional schema/data
- fields explicitly marked provisional
- assumptions
- fallback
- expires/reconcile-on contract version
