---
kind: concept
category: board
aliases: [Control, Winner, Loser, Winning player, Losing player]
part_of: "[[Node]]"
related: ["[[Node Power]]", "[[Wave Collapse]]", "[[Reveal priority]]", "[[Circuit Reward]]"]
code: src/game.ts (nodeWinner)
tags: [ontology/board]
---
# Node control

Who is winning a [[Node]].

- Higher [[Node Power]] controls it, even when both totals are negative.
- Empty side = 0, so 0 beats negative Power.
- Equal totals tie (including 0 vs 0).

## Drives
- **Winner / loser** for that [[Location]]'s effects and [[Location Reward]] (both sides on a tie)
- [[Reveal priority]] — more Locations controlled
- [[Circuit Reward]] eligibility — more Locations won after Collapse; both on an equal count
