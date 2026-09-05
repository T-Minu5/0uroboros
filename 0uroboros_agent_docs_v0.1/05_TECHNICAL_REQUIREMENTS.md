# 0uroboros

> The circuit and the serpent

> Agent specification v0.1, September 4, 2026


# 18. Technical architecture requirements

- Server-authoritative game state for competitive outcomes
- Server-authoritative RNG for Location selection, Chaos selection, initial reveal priority, random legal choices, Wave Collapse selection, random deck placement, and future competitive randomness
- Server-authoritative Draft Wallets, shared supply, and atomic purchase transactions
- Clients render responsive state but do not decide authoritative outcomes
- Persist exact chronological card play order as first-class game state
- Persist card reveal state, Owner, Controller, zone, Node, Power modifiers, Duration, and effect timing
- Model game as explicit phases/states so Runtime and Short-Circuit can share the same resolution engine
- Support reconnectable matches and authoritative timers
- Maintain a server event/action log sufficient to reconstruct Draft transactions and critical match state changes
- Keep content definitions data-driven so cards, Locations, rewards, costs, supplies, and effect parameters can expand without core-engine rewrites
## Configurable playtest values

| Parameter | Current default |
| --- | --- |
| Runtime turn timer | 60 seconds |
| Short-Circuit deployment timer | 120 seconds |
| Draft timer | 90 seconds |
| Cycle limit | 16 |
| Base market slots | 9 |
| Base shared supply | 8 each |
| Chaos slots | 3 |
| Chaos per-player supply | 2 each |
| VP market slots | 3 |
| VP shared supply | 8 each |
| Crypto market slots | 3 |
| Crypto shared supply | 16 each |
| Effect Bank slots | 4 |
| Repeat same-card purchase cooldown | ~2 seconds |
| Reconnect grace | 20 seconds |
| AFK timer speed | 1.25× |
| AFK auto-concede threshold | 2 turns |
| Probability increment | 0.5% |
| Primary Data Center health | 2,000 |
| Backup Data Center health | 1,500 |
| Primary destruction VP | 8 |
| Backup destruction VP | 12 |


# 19. Suggested implementation state machine

The coding agent should implement explicit authoritative states and transitions rather than infer state from UI. A suggested first-pass state machine is below. Names are implementation suggestions, not required user-facing copy.

1. AUTH / LANDING
1. TITLE
1. MATCHMAKING
1. MATCH_FOUND
1. MATCH_SETUP
1. NEW_CYCLE
1. LOCATION_SETUP
1. START_CYCLE_EFFECTS
1. DRAW_HAND
1. CIRCUIT_RUNTIME_NODE_OPEN / CIRCUIT_RUNTIME_DEPLOY / CIRCUIT_RUNTIME_REVEAL, or CIRCUIT_SHORT_DEPLOY / CIRCUIT_SHORT_REVEAL
1. WAVE_COLLAPSE_NODE_1 ... NODE_5
1. EFFECT_BANK_COLLAPSE
1. PROBABILISTIC_COLLAPSE_SELECTION
1. POST_COLLAPSE_CLEANUP
1. END_CYCLE_EFFECTS
1. DRAFT_SETUP
1. DRAFT_ACTIVE
1. DRAFT_RESOLVE_PENDING
1. END_DRAFT
1. ENDGAME_SCORING
1. MATCH_COMPLETE


# 20. Acceptance criteria for first playable build

- Two authenticated players can enter the same online match through matchmaking
- Runtime Mode can complete a full five-turn Circuit with hidden deployment, correct Node opening, persistent play order, alternating reveals, Power totals, and reveal priority
- Short-Circuit Mode can use the shared reveal/resolution engine with its alternate deployment configuration
- Five Nodes begin with 30/25/20/15/10 probability and support legal redistribution in 0.5% increments
- Wave Collapse resolves Nodes 1→5 in the defined order, then performs a server-authoritative weighted Node selection
- Location rewards and Circuit Reward remain separate
- Data Center damage, healing caps, destruction VP, no-spillover, and endgame interruption behave as specified
- Effect Bank supports 4 slots, Duration, ∞ cards, ordering, overflow, and expiration
- Draft supports configurable market setup, shared persistent supplies, per-player Chaos availability, public Wallets, simultaneous purchases, atomic server authority, same-card cooldown, Draft Log, and early End Draft
- Deck/discard/reshuffle flow supports starting 10-card decks, 5-card hands, acquired cards, generated cards, Trash, and Destroyed states
- Reconnect, AFK, concession, and forfeit rules function
- Public/private information boundaries are enforced
- All major phase transitions expose announcement hooks. Each phase or Circuit beat plays a mini-animated title. Wave Collapse uses a multi-beat presentation sequence before Draft.
- All current balance/timing counts are configurable without core-engine changes


# 21. Deferred content and open design work

- Full card catalog and card taxonomy beyond current starting categories
- Location catalog and exact Location effects
- Circuit Reward pool and exact reward behavior
- Chaos, VP, Crypto, Base, Glitch, and generated-card definitions
- Exact card-effect grammar/keyword system
- Visual design, motion language, sound, and animation timing
- Final Membership pricing and purchase flow
- Long-term Chaos no-repeat policy
- Balance tuning from playtests
- Additional private-match configuration options


# 22. Implementation principle

Build the rules engine as a configurable, server-authoritative state machine with data-driven content. Do not encode today's balance values, market sizes, timers, or content pool sizes as structural assumptions. The MVP should be playable with the current defaults while remaining easy to tune and expand.
