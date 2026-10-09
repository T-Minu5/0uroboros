---
kind: concept
category: structure
aliases: [Runtime phase, Runtime Circuit]
is_a: Phase
part_of: "[[Cycle]]"
related: ["[[Runtime turn]]", "[[Circuit]]", "[[Reveal]]"]
code: src/runtime.ts (phase "runtime")
tags: [ontology/structure]
---
# Runtime

The deployment phase of a [[Cycle]]: three [[Runtime turn|Runtime turns]] on the [[Circuit]]. Followed by [[Wave Collapse]].

## Node opening
| Turn | Opens | Actions gained |
| --- | --- | --- |
| 1 | 3 random Nodes | +2 |
| 2 | 1 more Node | +1 |
| 3 | the last Node | +1 |

Opening order is random each Cycle and hidden from players. A closed Node's [[Location]] stays hidden until it opens.

## Rules
- Cards deploy face down; open Nodes stay playable until Collapse.
- Cards may be placed at unopened Nodes; they stay face down until that Node opens.
- Max 4 cards per player per Node.
- Unused [[Action|Actions]] carry between Runtime turns within the Cycle.
