---
kind: concept
category: cards
aliases: [Duration card, Recurring, Schedule, Scheduled step, Storage, Permanent]
part_of: "[[Card]]"
related: ["[[Effect Bank]]", "[[Runtime turn]]", "[[Cycle]]", "[[Trigger]]"]
code: src/game.ts (duration, durationPeriod, recurring, schedule); src/runtime.ts (runtimeTimers)
tags: [ontology/cards]
---
# Duration

A card that keeps acting after it is revealed.

## Fields
| Field | Meaning |
| --- | --- |
| `duration` | How long it lasts; **99** = permanent (shown as infinity) |
| `durationPeriod` | Time scale for the whole card: **Runtime turns** or **Cycles** |
| `recurring` | Steps that run every turn/Cycle while active, starting with the reveal turn |
| `schedule` | Steps at a set offset (`at`), at the start or end of that turn/Cycle |

Switching the period keeps the same recipe; only the time scale and words change.

## Lifecycle
1. Deployed and revealed at a [[Node]]; it stays on the board until that Node collapses, even if its effects have stopped.
2. After [[Wave Collapse]] it moves to the [[Effect Bank]] if a slot is free (4 per player), otherwise to [[Discard]].
3. It leaves when the duration runs out (to Discard unless text says otherwise). Permanent cards stay until removed (e.g. bumped).

## Printed text
"…, for the next 2 turns", "…, every Cycle", "In 2 Cycles: …", "End of the next Runtime turn: …", "Lasts 2 Cycles."
