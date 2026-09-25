# Runtime Implementation Priorities

Astra chooses architecture and sequencing. These are required outcomes.

## Preserve correct engine work

For each subsystem:
1. compare implementation to canonical evidence
2. keep correct tested behavior
3. repair mismatches
4. add missing deterministic tests

Do not rewrite correct rules logic merely because presentation is being rebuilt.

## Multi-cycle runtime is a hard baseline

The client must support:

`Cycle 1 Runtime -> Collapse -> Draft -> Cycle 2 -> Collapse -> Draft -> Cycle 3 ...`

Presentation may lag resolved gameplay for comprehension, but it must never produce:
- Draft before unpresented Collapse
- skipped Collapse
- stuck Continue state
- duplicate Collapse
- inability to leave Draft
- failure to initialize the next Cycle

## Presentation is not game authority

Authoritative gameplay and theatrical presentation are separate.

Presentation may not:
- change outcomes
- reorder canonical resolution
- show a future phase before required prior presentation completes
- trap the client permanently

## Resolution data

The UI/effects layer needs structured source/consequence information where useful:
- source
- source Node/position
- effect
- target
- magnitude
- before state
- after state
- order
- Node
- winner/tie
- reward
- Cycle/phase identity

Do not build a second rules engine in the client.

## Effect families

The implementation should support approved families including:
- Power
- Draw
- Actions
- Crypto
- Drain
- Restore
- VP
- movement
- probability redistribution
- Trash
- Destroy
- Duration / Effect Bank
- acquisition
- approved Mods/targets/timing

## Card physicality

Card deployment should perceptually preserve one object moving:

`hand -> lift -> target preview -> flight -> landing -> settle`

Avoid obvious teleportation.

Illegal release returns naturally.

## Card information

Board scale:
- identity/art cue
- ownership
- Power
- important status/effect family
- Duration if relevant

Focus:
- clearer identity and effect summary

Click/tap inspect:
- full details

Dragging suppresses full inspect.

Face-down cards must not leak hidden information.

## Nodes

A Node must read as one spatial region.

The drop target, cards, Power, Location, probability, and resolution state must feel perceptually connected.

During drag:
- candidate Node responds as a region
- legality is explicit
- target slot is explicit
- future card position is previewed where useful

## Local spatial causality

Meaningful local effects should attach to actual source and target positions.

Examples:
- Drain: card/Location -> opponent Data Center
- Restore: source -> Data Center
- probability transfer: source Node -> destination Node
- Action gain: source -> Action resource
- reward: Node/Location -> recipient/resource

## Wave Collapse

Required comprehension:

1. global Collapse begins
2. Node 1 becomes active figure
3. Location resolves locally
4. cards resolve locally in order
5. Power visibly recalculates
6. winner/tie is obvious from unobstructed values
7. Location Reward resolves
8. move to next Node
9. repeat through Node 5
10. resolve Effect Bank as approved
11. show final probability state
12. perform global weighted selection
13. reveal selected Node and Circuit Reward eligibility
14. transition to Draft only after presentation releases

Local resolution should be quieter than the final global selection.

## Draft

Draft must clearly communicate:
- Wallet
- market categories
- costs
- availability
- special Circuit Reward
- purchase confirmation
- timer
- End Draft

Theming may be immersive, but usability dominates.

## Data Centers

Require:
- current integrity
- Primary/Backup distinction
- local reaction to Drain/Restore
- destroyed state
- major destruction presentation

## Performance

Prefer architecture capable of quality scaling:
- bounded particles
- reusable materials/geometries
- cached assets
- isolated post-processing
- sensible DPR
- real-play performance observation
