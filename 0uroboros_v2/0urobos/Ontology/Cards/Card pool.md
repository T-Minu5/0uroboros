---
kind: concept
category: cards
aliases: [Pool, Base, Chaos, Base pool, Chaos pool]
part_of: "[[Card]]"
related: ["[[Market]]", "[[Card class]]", "[[Generated card]]"]
code: content cards[].pool; src/evaluationMarket.ts
tags: [ontology/cards]
---
# Card pool

Where a [[Card]] can be offered in the [[Market]].

| Pool | Classes | How it reaches players |
| --- | --- | --- |
| **Base** | Action, Utility, Runtime | 2 game piles (not Runtime) + rotating Draft offers |
| **Chaos** | Attack, Hacker, Horror | 2 game piles + rotating Draft offers |
| **VP** | Volume, Solar-monk | 3 Volume piles + 1 Solar-monk pile |
| **Crypto** | — | 3 always-on currency piles |

The authoring studio also lists **Generated** as a filter: cards made only by effects, never offered. See [[Generated card]].
