---
kind: concept
category: structure
aliases: [On reveal, Revealed, Face up]
part_of: "[[Runtime turn]]"
related: ["[[Reveal priority]]", "[[Trigger]]", "[[Card]]"]
code: src/game.ts (revealOrder)
tags: [ontology/structure]
---
# Reveal

The moment a deployed card turns face up and its **On reveal** [[Trigger]] fires.

## Order
Cards reveal alternately: the player with [[Reveal priority]] reveals their oldest unrevealed card, then the opponent, and so on. Each player's cards keep chronological play order.

## States
- **Face down** — deployed and committed, not yet revealed (also cards waiting at closed Nodes)
- **Revealed** — face up; counts toward [[Node Power]] and is a target for "revealed card" effects

Revealed cards that move stay revealed. Location **On reveal** effects fire for each card played there (scope `locationPlay`, see [[Scope]]).
