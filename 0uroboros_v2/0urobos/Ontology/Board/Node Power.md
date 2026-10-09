---
kind: concept
category: board
aliases: [Power total, Lane power]
part_of: "[[Node]]"
related: ["[[Card Power]]", "[[Node control]]", "[[Node Power effects]]"]
code: src/game.ts (effectiveCardPower, resolvePower)
tags: [ontology/board]
---
# Node Power

Each [[Player]]'s total Power at a [[Node]]: the sum of their revealed cards' [[Card Power]] plus any Node-level Power modifiers. There is no shared third value.

- An empty side counts as 0.
- Shown as a number in the Power diamond for each side.
- Decides [[Node control]].

## Moving it
[[Node Power effects]] (Push / Pull / Player's choice) move a player's own Power between this Node and a neighbour. Transfers keep the total, never take the opponent's Power, and do not wrap from N1 to N5.
