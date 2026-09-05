# 0uroboros

> The circuit and the serpent

> Agent specification v0.1, September 4, 2026


# 11. Draft Phase

## Draft market

| Offering | Default slots | Selection timing | Supply |
| --- | --- | --- | --- |
| Circuit Reward | 1 | Changes each Circuit | 1 opportunity per eligible winner |
| Base (working title) | 9 | Selected once at match setup | 8 copies each, shared |
| Chaos | 3 | Randomly refreshes every Draft | 2 copies of each per player |
| VP | 3 | Selected once at match setup | 8 copies each, shared |
| Crypto | 3 | Selected once at match setup | 16 copies each, shared |

All counts and supplies are configuration values. Current numbers are defaults for playtesting and must be easy to change without code restructuring.

## Draft timing and visibility

- Default Draft timer: 90 seconds, configurable
- Both players draft simultaneously in real time
- All available Crypto has already been processed into each player's Wallet when Draft begins
- Crypto cards in hand auto-play at Draft transition, resolve applicable effects, then follow normal destination rules
- Opponent purchases and Wallet value are public in real time
- Remaining shared supply is public
- Players may acquire any number of cards they can legally afford and obtain
- Players may intentionally leave Crypto unspent
- Unspent non-material Wallet Crypto disappears at End of Draft
- Crypto Cards are material cards and remain in normal deck flow
## Costs and acquisition

- Cards have fixed printed Crypto costs
- Effects may modify effective cost
- Effective cost cannot go below 0; 0-cost cards are free
- Confirmed acquisitions enter Discard immediately unless text specifies another destination such as deck_top, deck_bottom, or deck_random
- Generated/directly granted cards do not consume market supply
- Draft acquisition effects may grant Crypto, cards, or alternate placement
- No attacks or damage occur during Draft
## Shared supply and server authority

- Base, VP, and Crypto supplies persist for the entire match and never replenish by default
- When a persistent pile reaches 0, its market slot remains empty
- Chaos availability refreshes every Draft and is independent per player
- Chaos may repeat in consecutive Drafts during early development; repeat policy must be configurable for future no-repeat behavior
- The server is authoritative for Wallets, purchases, and shared supply
- If both players attempt the final shared copy, the first valid purchase transaction committed by the server succeeds
- The losing request spends no Crypto
- Purchase validation must be atomic: validate Wallet + validate supply + deduct Crypto + decrement supply + grant card, or do none
- Do not use client timestamps or ping to decide purchase priority
## Repeat-purchase cooldown

A configurable anti-spam cooldown, default approximately 2 seconds, applies only when the same player attempts to buy the exact same card again. The player may immediately purchase a different card.

## Circuit Reward slot

- Circuit Reward appears in a dedicated privileged Draft slot
- The actual reward item is displayed in the slot
- The slot is visible to both players
- Only eligible winner(s) can interact with their reward instance
- Eligible players have the full Draft timer to decide
- If the Collapse Node was tied, each player receives their own one-time instance/opportunity
- Circuit Reward actions are recorded in the Draft Log
## End Draft

- Either player may End Draft early
- Draft ends early only when both players have ended
- If one player ends first, they watch the opponent continue
- The waiting player may Undo End Draft while the opponent has not ended and the waiting player still has at least one valid Draft action
- Once both players end, Draft closes immediately
- At timer expiration, a purchase request that reached the server before the deadline may finish; requests received after the deadline fail
- Outstanding mandatory acquisition choices still resolve after the timer reaches zero; timeout uses a random legal choice before Draft fully ends
## Draft Log

Draft UI includes a Draft Log control. It opens a chronological text log of public Draft actions, including player acquisitions and Circuit Reward activity. Confirmed server transaction order is authoritative. Failed purchase attempts may be stored internally and surfaced later if desired.


# 12. Effect resolution and choices

- Effects resolve sequentially, one effect after another
- There is no general-purpose effect stack that must finish after a game-ending condition
- Optional effects may allow the player to decline
- Mandatory effects may require a player choice
- If a required choice is not made before its choice timer expires, the server selects a random legal option
- Effects may have no valid target; communicate this explicitly in the UI
- Silencing a Location means its Location text is no longer active while silenced
- Silencing stops continuous/future Location behavior and prevents silenced onCollapse rewards/effects from triggering


# 13. Information visibility

## Public by default

- Revealed cards
- Node Power totals
- Current probability distribution
- Effect Banks
- VP totals, subject to the player's display preference
- Wallet balances during Draft
- Draft market supply
- Draft purchases and Draft Log
- Shared Trash pile contents
## Private by default

- Hand contents
- Face-down card identity
- Draw-pile order and contents
- Discard pile contents
- Draw and Discard may only be inspected when effect text explicitly grants access
