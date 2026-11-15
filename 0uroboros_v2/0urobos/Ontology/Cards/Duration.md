---
kind: concept
category: cards
aliases: [Duration card, Recurring, Schedule, Scheduled step, Storage, Permanent]
part_of: "[[Card]]"
related: ["[[Effect Bank]]", "[[Runtime turn]]", "[[Cycle]]", "[[Trigger]]"]
code: src/game.ts (duration, durationPeriod, foreignBank, recurring, schedule); src/runtime.ts (runtimeTimers, BankEntry)
tags: [ontology/cards]
---
# Duration

A card that keeps acting after it is revealed.

## Fields
| Field | Meaning |
| --- | --- |
| `duration` | How long it lasts; **99** = permanent (shown as infinity) |
| `durationPeriod` | Time scale for the whole card: **Runtime turns** or **Cycles** |
| `foreignBank` | After Collapse, enter the **enemy** [[Effect Bank]] if a slot is free (else owner Discard). Ownership never changes. Only valid with `duration`. |
| `recurring` | Steps that run every turn/Cycle while active, starting with the reveal turn |
| `schedule` | Steps at a set offset (`at`), at the start or end of that turn/Cycle |

Switching the period keeps the same recipe; only the time scale and words change.

## Lifecycle
1. Deployed and revealed at a [[Node]]; it stays on the board until that Node collapses, even if its effects have stopped.
2. After [[Wave Collapse]] it moves to the [[Effect Bank]] if a slot is free (4 per player), otherwise to [[Discard]]. With `foreignBank`, the target bank is the opponent's; overflow still goes to the owner's Discard.
3. It leaves when the duration runs out (to the owner's Discard unless text says otherwise). Permanent cards stay until removed. **Bump / Trash / Destroy** on a bank: from your own bank only **Foreign** infectors are legal; from the enemy bank any occupant. Removal always retires under the card owner (Bump → Discard, Trash → shared Trash, Destroy → destroyed pile).

## Printed text
"…, for the next 2 turns", "…, every Cycle", "In 2 Cycles: …", "End of the next Runtime turn: …", "Lasts 2 Cycles.", "After Collapse, enters the enemy Effect Bank."
