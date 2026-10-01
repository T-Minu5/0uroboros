# Canonical Game Rules

## Game format
- Two-player competitive strategic deck-building game.
- Current target: **Runtime Mode**.
- Runtime Mode uses three deployment turns per Cycle.
- Short-Circuit Mode, where all five Nodes open together, is deferred unless Mel reauthorizes it.

## Core Cycle
`Runtime Circuit -> Wave Collapse -> End of Cycle -> Draft -> End of Draft -> New Cycle`

Start of a new Cycle:
`End Draft -> New Cycle -> Wallet reset to 0 -> Location setup -> Start-of-Cycle effects -> draw hand`

## Starting deck and draw
Each player starts with the same 10-card deck: 5 Character, 3 Crypto, 2 VP. Exact cards are in `03_STARTER_DECK_AND_CARD_SEMANTICS.md`.

Opening:
- server-authoritative identical shuffle for both players
- same first five cards for Cycle 1
- same remaining opening deck order

After the mirrored opening, future reshuffles are independent and normal draw/discard rules apply.

General draw:
- default hand draw 5
- no maximum hand size
- when Draw pile cannot satisfy a draw, reshuffle Discard as required
- End-of-Cycle cards remaining in hand go to Discard
- drafted cards normally enter Discard unless text overrides

## Card categories
### Character
- deployable at Nodes
- default deployment cost 1 Action

### VP
- deployable at Nodes
- default deployment cost 0 Actions

### Crypto
- not deployable at Nodes
- contributes to Draft Wallet
- auto-resolves entering Draft according to approved text
- then goes to Discard unless text overrides

## Runtime turns and Actions
Turn 1: Nodes 1-3 open; +2 Actions.
Turn 2: Node 4 opens; +1 Action.
Turn 3: Node 5 opens; +1 Action.

Rules:
- no maximum Actions
- Character normally costs 1 Action
- VP costs 0 Actions
- Crypto cannot deploy
- OnReveal Actions are available on the next Runtime turn
- Actions do not carry between Cycles
- Runtime-turn Action carryover is configurable; the V1 default is TBD unless Mel sets it elsewhere

## Node capacity / state
- max 4 cards per player per Node
- cards deploy face down
- open Nodes remain playable until Collapse
- cards at unopened Nodes stay unrevealed until Node opens
- chronological play order is preserved
- move to full Node fails
- revealed moved cards remain revealed
- unrevealed cards moved to unopened Nodes remain unrevealed

## Power and control
Track one total Power per player at each Node. There is no third shared Node-Power value.

- higher current Power controls the Node
- highest Power wins even when both totals are negative
- empty side = 0, so 0 beats negative Power
- equal totals tie
- empty 0 vs 0 ties

## Rewards
Location Rewards and Circuit Rewards are separate.

Location Reward: resolved at each Node during deterministic Wave Collapse.

Circuit Reward: after deterministic Node resolution, exactly one Node is selected using final weights. Winner of selected Node receives access to that Circuit's unique reward; if tied, both players receive eligibility according to the approved reward rule.

## Wallet / Crypto
- Wallet resets to 0 each Cycle
- Crypto gained during Cycle is available for that Cycle's Draft
- unspent Crypto is lost after Draft
- Crypto entering Draft auto-resolves according to text

## Zones
Draw, Hand, Discard, Nodes, Effect Bank, Trash, Destroyed.

Trash is shared and recoverable by effects when text allows. Destroyed is permanent removal.

## Victory / endgame
Servers: Primary 2000, Backup 1500.

Destruction awards: Primary +8 VP, Backup +12 VP.

Game ends when both Servers of one player are destroyed, or after Cycle 16 normal flow.

Normal Cycle 16 includes the final Draft before final VP scoring.

If game-ending Server destruction occurs during Wave Collapse: finish the current Node including awards, stop later Nodes, skip Draft, proceed to game end.

Winner is total VP. Equal VP is a tie.

VP is displayed live by default, with an optional hide setting allowed as presentation configuration.

## Choices
Choices may be optional, mandatory, or random.

Mandatory-choice timeout: server selects a random legal option.

General player-choice timer duration is TBD unless defined by content/config.

If no legal target exists, communicate it clearly and resolve with no target/no effect as appropriate.
