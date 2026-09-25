# Runtime, Reveal, Probability, and Wave Collapse

## Node opening
Turn 1 opens Nodes 1-3. Turn 2 opens Node 4. Turn 3 opens Node 5. Open Nodes remain playable until Collapse.

## Reveal priority
Initial priority is random. Priority is set once per Runtime reveal window and is global, not per Node.

Within each player, reveal follows chronological play order.

Eligible cards alternate priority player then other player. If one player runs out, the other continues in chronological order.

Example A priority: `A1 -> B1 -> A2 -> B2 -> A3 -> A4`.

## Unopened Nodes
Cards placed before a Node opens remain face down and preserve play order. When the Node opens, prior unrevealed cards there reveal before that turn's deployment using current priority.

## ControlledWeight
For A:
`ControlledWeight(A) = sum(weights of Nodes A is winning) + 1/2 * sum(weights of tied Nodes)`

Empty 0 vs 0 is tied. Tied weight splits equally.

Next reveal priority derives from ControlledWeight according to canonical priority logic. If ControlledWeight is tied, retain current priority.

## Probability
Initial weights: 30 / 25 / 20 / 15 / 10.

- total = 100%
- probability transfer normally comes from another Node
- floor 0%
- if request exceeds source, transfer all available source
- 0% and 100% legal
- increment 0.5%

## Wave Collapse — deterministic
Resolve Nodes 1 through 5.

At each Node:
1. Location `onCollapse`
2. Card `onCollapse`
3. recalculate Power
4. determine winner/tie
5. apply Location Reward

After Node 5, Effect Bank `onCollapse` resolves as sixth location, oldest to newest.

## Wave Collapse — probabilistic
After deterministic resolution, use final normalized weights to select exactly one Node. Selected Node winner gets Circuit Reward eligibility; tied selected Node grants eligibility to both players according to the approved rule.

## Unrevealed cards at Collapse
Cards still unrevealed when final Collapse handling requires it are Destroyed according to the approved rule.

## Presentation / authority separation
Authoritative resolution may finish before theatrical presentation. Presentation may lag for comprehension, but may never change outcomes, reorder canonical resolution, show Draft before required Collapse presentation completes, skip Collapse because authority already advanced, or permanently block Draft/next Cycle.

Player-facing Collapse should make this sequence visible:
`Location -> card effects -> Power update -> winner/tie -> Location Reward`
then proceed to the next Node. Final probabilistic selection is a separate global/cinematic event.
