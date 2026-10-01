# Approved Rules: Runtime V1

## Match
- `RULE-MATCH-001` Cycle order: Runtime Circuit → Wave Collapse → End-of-Cycle → Draft → End of Draft → New Cycle.
- `RULE-MATCH-002` New Cycle: End of Draft → New Cycle → Wallet reset → Location setup → Start-of-Cycle effects → Draw hand.
- `RULE-MATCH-003` End game: both Data Centers destroyed, or Cycle 16 ends. Cycle limit is configurable.
- `RULE-MATCH-004` Destruction during Collapse: finish the current Node, then stop. Do not continue to later Nodes. No Draft.
- `RULE-MATCH-005` Cycle-limit ending: final Draft occurs, then final VP is tallied.
- `RULE-MATCH-006` Highest VP wins. Equal VP is a tie.
- `RULE-MATCH-007` Players may concede. Concessions and forfeits are separate stats. Match Abandoned / Server Error counts in neither.

## Starting deck and draw
- `RULE-DECK-001` Both players start with 10 cards: 5 Character, 3 Crypto, 2 VP.
- `RULE-DECK-002` Cycle 1 uses the same shuffle/hand for both players. Later shuffles are independently random.
- `RULE-DECK-003` Cycle 1 draws first 5. Cycle 2 draws remaining 5. If more cards are needed and Draw is empty, reshuffle Discard including acquired cards.
- `RULE-DECK-004` All cards remaining in hand go to Discard at End of Cycle.
- `RULE-DECK-005` `+N Cards` means Draw N. Gaining a card must name the gained card.

## Card taxonomy
- `RULE-CARD-001` Functional families: Character, VP, Crypto.
- `RULE-CARD-002` Base and Chaos are current Character classifications. Schema must support future classifications.
- `RULE-CARD-003` Character cards require 1 Action to deploy unless an approved effect changes it.
- `RULE-CARD-004` VP cards are playable at Nodes and require no Action.
- `RULE-CARD-005` Crypto cards are not playable at Nodes. Entering Draft auto-plays Crypto in hand, resolves text, then discards unless text says otherwise.
- `RULE-CARD-006` Played Character and VP cards normally go to Discard after relevant resolution unless text says otherwise.

## Starter cards
- `RULE-STARTER-001` Slash-Dot: Power 3. `+3 Cards.` Cost 4.
- `RULE-STARTER-002` Dash-Dot: Power 2. `+1 Card. +1 Action.` Cost 3.
- `RULE-STARTER-003` Dotkrawler: Power 1. `+1 Card. +1 Action. +1 Crypto.` Cost 3.
- `RULE-STARTER-004` Rezz-Razor: Power 4. `Drain 75. +1 Card. +1 Action.` Cost 3.
- `RULE-STARTER-005` Rezz-Blade: Power 3. `Drain 100. +1 Card. +2 Actions.` Cost 4.
- `RULE-STARTER-006` Vault Encryption x2: VP. Power 2. `Restore 100.` Cost 3.
- `RULE-STARTER-007` Byte-Coin x2: Crypto. `+2 Crypto.` Cost 3.
- `RULE-STARTER-008` Kilo-Coin x1: Crypto. `+3 Crypto.` Cost 6.

## Actions and Runtime
- `RULE-ACTION-001` Turn 1 grants +2 Actions, Turn 2 +1, Turn 3 +1.
- `RULE-ACTION-002` No maximum Action capacity.
- `RULE-ACTION-003` Action carryover between Runtime turns is configurable. Actions never carry between Cycles.
- `RULE-ACTION-004` OnReveal happens after deployment ends. Actions gained on reveal are usable on the next Runtime turn.

## Runtime Node opening
- `RULE-RUNTIME-001` V1 uses Runtime Mode only.
- `RULE-RUNTIME-002` Turn 1 opens Nodes 1–3. Turn 2 opens Node 4. Turn 3 opens Node 5.
- `RULE-RUNTIME-003` Runtime timers are configurable.
- `RULE-RUNTIME-004` Once open, Nodes remain legally playable until Collapse unless an approved restriction applies.
- `RULE-RUNTIME-005` Max 4 cards per player per Node unless amended by effect.
- `RULE-RUNTIME-006` Cards deploy face down. Commitments remain hidden until deployment ends.
- `RULE-RUNTIME-007` Cards at unopened Nodes remain unrevealed and ineligible until that Node opens. Original play-order information is preserved while they wait. A card played at an already-open Node is eligible for that turn's post-deployment reveal sequence.
- `RULE-RUNTIME-008` During a reveal sequence, the priority player reveals their first eligible card, then the other player reveals their first eligible card. Continue alternating while both players have eligible cards. If one player has no remaining eligible cards, the other player's remaining eligible cards reveal in their own play order. Example when Player A has reveal priority: A1 → B1 → A2 → B2 → A3 → A4.
- `RULE-RUNTIME-009` When a Node opens, unrevealed cards already there become eligible and reveal before deployment for that newly opened turn begins. That opening reveal uses original play order and the current player reveal priority / alternation.
- `RULE-RUNTIME-010` Each player's internal card order is the chronological order in which that player played their cards. Play order matters. Do not reorder a player's cards by Node number.
- `RULE-RUNTIME-011` If no legal plays remain, communicate that state and allow/require End Turn.
- `RULE-RUNTIME-012` Initial reveal priority is randomly assigned.
- `RULE-RUNTIME-013` Reveal priority is set once per Runtime turn and is not recalculated between individual reveals in that turn's sequence.
- `RULE-RUNTIME-014` After a Runtime turn's reveal window closes, calculate each player's controlled probability weight under `RULE-PROB-007`. The player with greater controlled probability weight receives reveal priority for the next Runtime turn. If equal, the current priority player retains it.

## Power and probability
- `RULE-POWER-001` Current Node control is represented by current total Power. Final winner is determined during Collapse.
- `RULE-POWER-002` Highest value wins even if negative.
- `RULE-POWER-003` Empty side counts as 0 Power.
- `RULE-POWER-004` Ties split Node weight evenly. If neither player has cards, weight is also split evenly.
- `RULE-POWER-005` Node Power is not a third gameplay value. It names the current Power totals of the two players at that Node: Node P1 Power and Node P2 Power. The Node winner at Collapse is determined by comparing those player totals after applicable effects and recalculation.
- `RULE-PROB-001` Current initial weights: 30%, 25%, 20%, 15%, 10%, configurable.
- `RULE-PROB-002` Distribution totals 100%.
- `RULE-PROB-003` Redistribution must come from another Node. Probability cannot go below 0%.
- `RULE-PROB-004` If transfer exceeds source amount, transfer all remaining source probability.
- `RULE-PROB-005` Nodes may reach 0% or 100%.
- `RULE-PROB-006` Support 0.5% increments.
- `RULE-PROB-007` Controlled probability weight is the sum of current Node probability weights a player controls. A player receives the full current weight of each Node they are winning and half the current weight of each tied Node. Empty Nodes are 0 Power vs 0 Power and therefore tied. ControlledWeight(A) = Σ(weights of Nodes A is winning) + ½ Σ(weights of tied Nodes). The same applies independently to the other player. This is not raw card Power and not the Wave Collapse random selection. It determines next-turn reveal priority under `RULE-RUNTIME-014`.

## Wave Collapse
- `RULE-COLLAPSE-001` Resolve Nodes 1→5 unless a game-ending condition stops the sequence.
- `RULE-COLLAPSE-002` Per Node: Location onCollapse → Card onCollapse → recalculate Power → determine winner/tie → grant Location rewards.
- `RULE-COLLAPSE-003` Effect Bank Collapse triggers resolve after Node 5, as if a sixth Location.
- `RULE-COLLAPSE-004` If total Data Center destruction occurs, finish the current Node including relevant current-Node effects/awards, then stop.
- `RULE-COLLAPSE-005` After Nodes and Effect Bank, server RNG selects one Node using final probabilities.
- `RULE-COLLAPSE-006` Winner of selected Node receives Circuit Reward. Tie rewards both players independently.
- `RULE-COLLAPSE-007` Location rewards and Circuit Reward are separate systems.
- `RULE-COLLAPSE-008` Any cards still unrevealed in Collapse are destroyed.

## Drain, Restore, Data Centers
- `RULE-DATA-001` Primary 2,000. Backup 1,500.
- `RULE-DATA-002` Generic `Drain N` targets Primary first, then Backup. Text may specify Backup or Both.
- `RULE-DATA-003` Excess kill-shot damage is lost, no spill.
- `RULE-DATA-004` A missing specifically named target causes no effect and no redirect.
- `RULE-DATA-005` Generic `Restore N` targets Primary first, then Backup. Text may specify Backup or Both.
- `RULE-DATA-006` Cannot overheal. Excess Restore is lost and does not spill.
- `RULE-DATA-007` Destroyed Data Centers cannot be restored.
- `RULE-DATA-008` Destroy Primary: +8 VP. Destroy Backup: +12 VP.

## VP
- `RULE-VP-001` VP maintained in real time and displayed by default, hideable by user setting.
- `RULE-VP-002` VP-bearing cards count in active player-owned zones including deck/draw/hand/Discard/Effect Bank/Nodes. Trash/Destroyed do not.
- `RULE-VP-003` VP may be negative or state-dependent.

## Trash / Destroyed
- `RULE-ZONE-001` Trash is shared and inspectable. Trashed cards may return through effects.
- `RULE-ZONE-002` Destroyed cards are permanently removed.
- `RULE-ZONE-003` Any resolving text may Trash or Destroy.

## Effect Bank
- `RULE-BANK-001` 4 slots per player.
- `RULE-BANK-002` Duration cards deploy at Nodes and enter Bank after Collapse if space exists. Otherwise Discard.
- `RULE-BANK-003` Limited-space entry uses original play order.
- `RULE-BANK-004` Duration measured in Cycles. Deployment Cycle counts as 1. Finite Durations are 2+.
- `RULE-BANK-005` Finite card leaves at end of its final active Cycle, normally to Discard.
- `RULE-BANK-006` Duration 99 displays as infinity and does not expire naturally.
- `RULE-BANK-007` Bank cards may be attacked/removed if effects permit. Some may be protected.
- `RULE-BANK-008` Ordered Bank resolution is oldest to newest.

## Movement / targeting / silence
- `RULE-TARGET-001` Revealed card stays revealed when moved. Unrevealed card moved to unopened Node stays unrevealed until opening.
- `RULE-TARGET-002` Move into full Node fails.
- `RULE-TARGET-003` Effects may have no valid target. Communicate failure clearly.
- `RULE-TARGET-004` Silencing removes Location text from future applicability, not already-resolved effects.

## Choices
- `RULE-CHOICE-001` Effects may be optional, mandatory-choice, or random-choice.
- `RULE-CHOICE-002` Mandatory timeout selects a random legal option server-side.

## Draft
- `RULE-DRAFT-001` Simultaneous real-time Draft. Current target 90 seconds, configurable.
- `RULE-DRAFT-002` Wallet resets to 0 each Cycle. Non-material Crypto accumulates for Draft and expires at End of Draft.
- `RULE-DRAFT-003` Crypto cards are material deck cards and auto-play into Wallet at Draft transition.
- `RULE-DRAFT-004` 9 Base piles selected at setup, shared supply 8 each, persistent.
- `RULE-DRAFT-005` 3 VP piles selected at setup, shared supply 8 each.
- `RULE-DRAFT-006` 3 Crypto piles selected at setup, shared supply 16 each.
- `RULE-DRAFT-007` 3 Chaos cards selected each Draft. Each player independently may buy up to 2 copies of each. Unbought availability disappears. Repeats currently allowed.
- `RULE-DRAFT-008` Circuit Reward uses a unique visible privileged slot. Eligible winner(s) have the Draft window to claim it. Logged. One per eligible winner.
- `RULE-DRAFT-009` Buy any number of legal affordable cards.
- `RULE-DRAFT-010` Printed costs are fixed, though approved effects may modify effective Draft cost. Floor 0.
- `RULE-DRAFT-011` Same exact pile has a configurable current target 2-second repurchase cooldown per player. Different pile may be bought immediately.
- `RULE-DRAFT-012` Purchases are atomic and server-authoritative.
- `RULE-DRAFT-013` Both players see confirmed purchases, supply, and opponent Wallet changes.
- `RULE-DRAFT-014` Concise inspectable Draft Log uses P1/P2.
- `RULE-DRAFT-015` Acquired cards move immediately to Discard unless specified otherwise.
- `RULE-DRAFT-016` Acquisition may trigger non-attack effects. No attacks during Draft.
- `RULE-DRAFT-017` Generated cards do not consume market supply unless specified.
- `RULE-DRAFT-018` Both may End Draft early. If one ends, they wait and may undo while opponent has not ended, time remains, and a legal purchase remains.
- `RULE-DRAFT-019` Server-received-before-deadline transactions may complete. Later requests fail.
- `RULE-DRAFT-020` Outstanding mandatory choices resolve before Draft completes even if Draft timer reaches zero.

## Visibility
- `RULE-VIS-001` Public: revealed cards, Node Power, probabilities, Wallets during Draft, Effect Banks, VP, market supply, confirmed Draft purchases.
- `RULE-VIS-002` Private: hand, face-down identity, draw order.
- `RULE-VIS-003` Trash inspectable by both.
- `RULE-VIS-004` Discard/draw are not normally inspectable unless effect permits.
- `RULE-VIS-005` Revealed modified card displays inspectable Mod icon/effect.

## Mods
- `RULE-MOD-001` Maximum one Mod per card instance.
- `RULE-MOD-002` Mod belongs to card instance, not only definition.
- `RULE-MOD-003` Detailed Mod acquisition/effect catalog remains exploratory.

## Disconnect / AFK
- `RULE-NET-001` First disconnect pauses affected timer up to 20 seconds. Opponent sees `Waiting for opponent...`. Failure to reconnect forfeits.
- `RULE-NET-002` Second disconnect does not pause timer.
- `RULE-NET-003` Third disconnect automatically forfeits.
- `RULE-NET-004` If a player's turn timer expires with no player input/end-turn behavior, that player's NEXT TURN COUNTDOWN runs 25% faster than normal, equivalent to a 1.25x countdown rate, until any player input is detected. On first detected input during that turn, the remaining countdown is restored/normalized to the appropriate standard timer basis. Animations, effect playback, and server simulation speed are not accelerated.
- `RULE-NET-005` Two turns with no user input automatically concedes.

## Logs
- `RULE-LOG-001` Concise inspectable Game Log.
- `RULE-LOG-002` Use P1/P2.
- `RULE-LOG-003` Factual, not verbose.
