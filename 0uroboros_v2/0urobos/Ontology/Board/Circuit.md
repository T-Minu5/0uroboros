---
kind: concept
category: board
aliases: [Board, The Circuit]
part_of: "[[Runtime]]"
related: ["[[Node]]", "[[Location]]", "[[Circuit Reward]]"]
code: src/runtime.ts (state.nodes, nodeOrder)
tags: [ontology/board]
---
# Circuit

The board for one [[Cycle]]: five [[Node|Nodes]] in a row (N1–N5), each holding a [[Location]].

- Nodes are neighbours left and right; N1 and N5 do not wrap. This matters for [[Node Power effects]].
- Each Cycle the Locations are reshuffled onto the Nodes and a new random opening order is drawn.
- Winning more Locations than the opponent earns the [[Circuit Reward]].

> Retired: Node percentages / weights (30/25/20/15/10) and weighted Circuit selection. Old "+Draft" weight shifts became Power transfers.
