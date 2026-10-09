---
kind: concept
category: structure
aliases: [Endgame, Victory]
part_of: "[[0uroboros]]"
related: ["[[Server]]", "[[Victory Points]]", "[[Cycle]]"]
code: src/runtime.ts (gameOver)
tags: [ontology/structure]
---
# Game end

The game ends when either:
- both [[Server|Servers]] of one [[Player]] are destroyed, or
- the final [[Draft]] of [[Cycle]] 16 completes.

The winner has the most [[Victory Points]]. Equal VP is a tie. VP is shown live by default.

If Server destruction happens during [[Wave Collapse]], the current Node finishes, later Nodes and the Draft are skipped.
