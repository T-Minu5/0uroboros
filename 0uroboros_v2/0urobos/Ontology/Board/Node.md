---
kind: concept
category: board
aliases: [Nodes, N1, N2, N3, N4, N5, Lane]
part_of: "[[Circuit]]"
related: ["[[Location]]", "[[Node Power]]", "[[Node control]]", "[[Reveal]]"]
code: src/runtime.ts (NodeState)
tags: [ontology/board]
---
# Node

One of the five board positions (N1–N5) of the [[Circuit]]. A Node is the *slot*; the [[Location]] is the *content* dealt onto it each Cycle.

## Has
- One [[Location]] (hidden until the Node opens)
- Two sides (lanes), one per [[Player]], each holding up to 4 cards in play order
- A [[Node Power]] total per side and a winner ([[Node control]])

## States
- **Closed** — not yet opened this [[Runtime]]; cards may wait there face down
- **Open** — playable until [[Wave Collapse]]; cards reveal here
- **Resolved** — collapsed this Cycle

Moving a card to a full Node fails.
