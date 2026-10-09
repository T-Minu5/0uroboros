---
kind: concept
category: cards
aliases: [Card types, Type]
part_of: "[[Card]]"
related: ["[[Character]]", "[[VP card]]", "[[Crypto card]]", "[[Card class]]"]
code: src/game.ts (CardType)
tags: [ontology/cards]
---
# Card type

The top-level kind of a [[Card]]. It decides where the card can go and what deploying it costs.

| Type | Deploys to a Node | Deploy cost | Main job |
| --- | --- | --- | --- |
| [[Character]] | Yes | 1 [[Action]] | Power and effects |
| [[VP card]] | Yes | 0 Actions (Solar-monk: 1) | [[Victory Points]], Server Repair |
| [[Crypto card]] | No | — | [[Crypto]] for the [[Draft]] |

Effects can filter targets by type ("Any type", Character, VP, Crypto). Solar-monks count as Characters for those filters.
