# Draft, Rewards, Zones, Duration, and Endgame

## Draft
Default timer 90 seconds, configurable. Draft is simultaneous, server-authoritative, and real-time.

## Wallet
Entering Draft, Crypto auto-resolves according to text. Wallet represents Crypto generated during the Cycle and is Draft-only. Unused Wallet expires.

## Market
Base: 9 piles, shared supply, 8 each, persistent.

VP: 3 piles, shared supply, 8 each.

Crypto: 3 piles, shared supply, 16 each.

Chaos: 3 selected per Draft; each player may buy up to 2 copies of each independently; refresh each Draft; repeats across Drafts currently allowed.

Circuit Reward: separate privileged offering, unique to the Circuit, visible to eligible winner(s), not a normal market pile.

## Purchases
- printed cost fixed unless modifiers apply
- effective cost floor 0
- unlimited legal affordable buys
- same exact card/pile/player approximately 2-second configurable anti-spam cooldown
- different legal purchases can proceed immediately
- purchases are server-authoritative and atomic
- first confirmed purchase wins shared-supply race
- acquisition normally enters Discard unless text overrides
- generated cards do not consume market supply
- Draft acquisition may gain Crypto/cards/destination changes as approved
- Draft effects do not attack unless future rule explicitly allows it

Confirmed purchases update Wallet immediately and produce concise feedback/log.

## End Draft
Both players may End Draft early. If both end, Draft ends. If one ends, that player may undo while time remains and the other has not ended, subject to authoritative state.

Request received before deadline may complete; after deadline fails. Mandatory choice started before timeout may complete afterward according to approved handling.

Cycle 16 includes final Draft before normal scoring, except game-ending Data Center destruction during Collapse skips Draft.

## Effect Bank
4 slots per player.

Duration cards deploy at Nodes, then after Collapse move to Effect Bank if eligible and space exists; otherwise Discard unless text overrides. Play order controls entry ties.

Duration:
- measured in full Cycles
- finite values intended >=2
- deployment Cycle counts as 1
- leave at end of final Duration Cycle
- Duration 99 displays infinity and never naturally expires
- expiry goes to Discard unless text overrides
- some permanent Duration cards may be unattackable when text explicitly says so

Effect Bank `onCollapse`: after Node 5, oldest to newest.

## VP-bearing cards
Count according to approved card/state rules while in active player-owned zones. Trash and Destroyed are not active player-owned scoring zones. VP may be negative/state-dependent when explicit card text allows it.
