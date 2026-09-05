# 0uroboros

> The circuit and the serpent

> Agent specification v0.1, September 4, 2026


# 5. Circuit Phase

## Node states

Nodes progress through: Closed / unopened → Open → Collapsed.

- Nodes begin closed
- Once opened, a Node cannot be closed again
- An open Node remains legal for deployment while capacity and effects permit
- Each player may have a maximum of 4 cards at a Node
- Nodes resolve only during Wave Collapse; card reveals during Circuit are not Node resolution
## Runtime Mode

- Five timed turns, one corresponding to each Node
- Default turn timer is 60 seconds and must be configurable
- Locations reveal/open sequentially from Node 1 through Node 5
- At the start of a numbered turn, that Node opens and any previously committed unrevealed cards there reveal before the new deployment window
- After the opening reveal sequence, both players deploy simultaneously and secretly during the timed window
- Players may deploy any number of legal cards from hand during the window
- Players may deploy to any legal Node, including previously opened Nodes and future unopened Nodes
- A player may End Turn early; the window ends when both players end or the timer expires
### Runtime reveal eligibility and order

After the deployment window, commitments become visible face down. Newly played cards at already-open Nodes are eligible to reveal. Cards at unopened Nodes remain face down until their Node opens.

Reveal priority is set once per turn. The priority player reveals their first eligible card, then the opponent reveals their first eligible card, then players alternate while preserving each player's exact chronological play order. If one player has no remaining eligible cards, the other player's remaining eligible cards reveal in order.

Example on Turn 3, when Nodes 1–3 are open: a player plays N3 first, N1 second, N4 third, N2 fourth. Eligible reveal order preserves play order: N3 → N1 → skip N4 because it is unopened → N2. The N4 card reveals when Node 4 opens.

- If only one player has eligible cards, reveal them sequentially in that player's play order
- Revealed cards stay revealed if moved
- An unrevealed card moved to an unopened Node remains unrevealed until that Node opens
- Original play order persists after movement
- If movement would exceed the 4-card-per-player Node capacity, the move fails
- Effects with no legal target fail cleanly and the UI must communicate No valid target
## Short-Circuit Mode

- All five Locations are revealed at once
- Both players receive one 2-minute simultaneous deployment window by default; timer must be configurable
- After deployment, resolve reveals using the same core reveal engine and priority rules as Runtime Mode
- Use the same underlying rules engine wherever practical so mode differences are configuration/state-flow differences rather than separate game implementations
## Reveal priority and controlled probability

Turn 1 reveal priority is random. For later turns, compare each player's currently controlled probability. A player receives the full weight of Nodes they are winning and half the weight of tied Nodes. Empty Nodes are 0 Power vs. 0 Power and therefore tied.

ControlledWeight(A) = Σ weights of Nodes A is winning + ½ Σ weights of tied Nodes

- The player with greater controlled weight gets reveal priority for the next turn
- If controlled weight is tied, the player who previously had reveal priority retains it
- Priority is not recalculated after every card reveal
- The UI should update visible card Power and running Node Power totals as each card reveals
## Power

- Cards have numeric Power; base printed values will likely be roughly 0–20 but are not capped
- Effects may increase or decrease Power
- Power may become negative
- Highest numerical total wins, even when both totals are negative
- A player with no cards at a Node has 0 Power; 0 beats a negative total
- Equal totals are tied
- Reaching 0 or negative Power does not automatically remove a card


# 6. Wave Collapse

After Circuit deployment/reveals are complete, Wave Collapse resolves Nodes deterministically from 1 through 5, then performs one probabilistic Node selection using the final normalized probability distribution.

## Per-Node onCollapse order

1. Resolve the Location's onCollapse text effects
1. Resolve Card text at that Node with onCollapse timing, preserving applicable play/order rules
1. Recalculate Power and probability weight
1. Determine Node winner by highest total Power
1. Grant applicable Location rewards to the winner; if tied, reward both players
1. Move to the next Node
Game text may reference a player as winning, losing, or tied at a Node. Location onCollapse effects may redistribute probability and may grant Crypto, cards, VP, or other defined benefits.

## Effect Bank onCollapse timing

After Node 5, Effect Bank onCollapse effects trigger last, as if the Effect Bank were a sixth Location. Within an Effect Bank, resolve cards from oldest arrival to newest.

## Location Reward vs. Circuit Reward

- Location Rewards come from Location text and are granted during each Node's onCollapse resolution
- If a Location reward applies to a tied Node, both players receive it
- Circuit Reward is a separate Circuit-level reward
- After all normal Collapse processing completes, one Node is selected using the final probability weights
- The final winner of the selected Node receives the Circuit Reward
- If the selected Node is tied, both players receive their own instance/opportunity for the Circuit Reward
- Circuit Reward becomes a privileged Draft offering in the upcoming Draft
## Game-ending destruction during Collapse

If the Data Center-destruction end condition occurs while a Node is being resolved, finish the entire current Node. Resolve all remaining ordered onCollapse card effects at that Node, determine its winner, grant applicable Location rewards and VP, and award Data Center-destruction VP. Then stop Wave Collapse. Do not proceed to later Nodes, do not perform the Circuit Reward selection, and do not enter Draft.

## Unrevealed cards at Collapse

Any card still unrevealed when Wave Collapse occurs is Destroyed.


# 7. Effect Bank and Duration

- Each player has 4 visible Effect Bank slots
- Duration cards are played at Nodes during the Circuit
- After Collapse and awards, eligible Duration cards attempt to enter the Effect Bank in original play order
- If all 4 slots are occupied, a new Duration card cannot enter and goes to Discard unless text says otherwise
- The deployment Cycle counts as Duration 1
- Normal Duration values are 2 or greater
- A Duration 2 card deployed in Cycle 4 is active during Cycles 4 and 5, then leaves at End of Cycle 5 so the slot is free for Cycle 6
- When Duration ends, the card goes to Discard unless text overrides
- Duration 99 is displayed as ∞ and does not naturally expire
- Some Duration cards may be immune to attack/removal if text specifies it
- Effect Bank effects resolve oldest to newest when multiple effects share timing
- Effect Bank Start-of-Cycle effects resolve during the Start-of-Cycle effects step


# 8. Data Centers and damage

- Primary Data Center maximum health: 2,000
- Backup Data Center maximum health: 1,500
- Generic Data Center damage targets Primary until Primary is destroyed, then targets Backup
- Text may explicitly target Backup or both Data Centers
- If an explicitly targeted Data Center is already destroyed, the effect has no valid target and does not redirect
- Damage does not spill over between Data Centers
- Example: Primary at 50 takes 300 damage; Primary is destroyed and the remaining 250 damage disappears
- Destroyed Data Centers cannot be healed or restored
- Healing cannot exceed each Data Center's maximum health
- Destroying the opponent's Primary awards 8 VP
- Destroying the opponent's Backup awards 12 VP


# 9. Victory Points and endgame

- VP is maintained in real time
- VP may come from cards in active game zones, Location/Wave effects, Draft acquisitions, and Data Center destruction
- VP cards may have negative values
- Trashed and Destroyed cards do not contribute VP
- State-dependent VP values recalculate live
- If a VP-bearing card is trashed or destroyed, the displayed score updates immediately
- Game ends when both Data Centers for a player are destroyed, or after the final Draft of Cycle 16 by default
- Cycle limit 16 is a configurable placeholder
- If the game ends due to Data Center destruction, there is no Draft
- If the game reaches Cycle 16 normally, the final Draft occurs and can affect final VP
- After Cycle 16 Draft, immediately compare final VP; do not start another Cycle
- Highest final VP wins
- Equal final VP is a tie; there is no tiebreaker


# 10. Post-Collapse cleanup

1. Finish Wave Collapse and applicable awards unless an endgame rule stops the Collapse
1. Move normal Node cards to their appropriate Discard piles
1. Move eligible Duration cards into Effect Banks in play order; overflow goes to Discard unless text overrides
1. Resolve applicable End-of-Cycle effects and Duration expiration under defined timing
1. Discard all cards remaining in hand
1. Proceed to Draft
