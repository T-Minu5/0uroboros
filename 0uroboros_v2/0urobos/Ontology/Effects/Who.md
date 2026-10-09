---
kind: concept
category: effects
aliases: [Whose, Yours, Enemy, Any side, Both, Winning, Losing]
part_of: "[[Target]]"
related: ["[[Scope]]", "[[Player]]"]
code: src/effects/types.ts (Who); src/effects/catalog.ts (whoLabel)
tags: [ontology/effects]
---
# Who

Whose cards, zones or Servers a [[Target]] touches, relative to the effect's controller.

| Value | Editor label | Meaning |
| --- | --- | --- |
| `self` | Yours / You | The controller |
| `opponent` | Enemy | The other player |
| `both` | Both | Each player separately |
| `any` | Any side | One pool of candidates from both players |
| `winner` / `loser` | Winning / Losing (player) | Location scope: who leads this Node |
| `played` / `other` | — | Location On reveal: who played the card, and their opponent |

See [[Scope]] for how "you" changes on Locations and Circuit Rewards.
