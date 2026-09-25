# UX Product Contract

## Node relationship
Each Node must clearly communicate:

`Opponent cards`

`Opponent Power / priority`

`Location`

`Local Power / priority`

`Local cards / deployment region`

Exact spacing, materials, perspective, geometry, and animation may evolve. The perceptual relationship may not be lost.

## Power
- local/opponent values remain visible
- associated with correct player side
- effect and Collapse presentation do not obstruct them
- higher value should make winner obvious before explanatory text
- ties remain legible

## Location
- structurally belongs to Node
- distinct from normal cards
- readable identity/rule/reward as applicable
- resolves locally
- does not block Power comparison

## Probability
Weight belongs perceptually to the Node. A global summary may exist, but players should not have to mentally remap detached values. Probability movement should make source/destination apparent.

## Hand / interaction
Hand should feel physical, preserve first-party art, support lightweight hover, deliberate inspect, and clear deployment.

Hover: lightweight emphasis only; never full inspect.

Click/tap: full card inspect.

Drag: deployment. During drag full inspect is suppressed, card lifts, legal Nodes respond, target Node is unmistakable, intended landing position is visible, illegal reason is clear, legal release lands smoothly, illegal release returns naturally.

## Node targeting
Drop target must feel part of the Node. Use common region/proximity/connected geometry/ghost placement where useful.

## Gestalt
Apply common region, proximity, continuity, common fate, figure/ground, similarity, and Prägnanz/simplicity.

## Macro vs local narration
**Global events announce globally. Local events resolve locally.**

Center/global UI: Cycle, phase, Runtime turn, Wave Collapse start, Draft start, major global selection.

Not primary narrator for individual card effects, Locations, Drain/Restore, probability movement, local Power, or local rewards.

## Effect comprehension
Meaningful local effects communicate:
`source -> activation -> path/target -> reaction -> result`

The log is persistent history, not the only way to understand events.

## Timing
Transient effect/location/Collapse communication must remain human-readable. Default timing should not be optimized for developer speed. Normal plus developer/Fast presentation mode is acceptable. Player advance may occur only after a sensible minimum readability interval.

## Card information levels
Board scale: identity/art, ownership, Power, compact effect/status, Duration where relevant.

Focus: more effect detail.

Inspect: full card information.

Face-down cards must not leak hidden information.

## Wave Collapse UX
Player should be able to follow active Node, Location resolution, card resolution, targets, Power changes, winner/tie, reward, movement to next Node, final probability, and selected Circuit Node without a center-screen narration wall.

## Draft UX
Show Wallet, market categories, costs, availability, supply where relevant, purchase confirmation, Circuit Reward privilege, timer, and End Draft. Draft must never appear before required Collapse presentation completes.
