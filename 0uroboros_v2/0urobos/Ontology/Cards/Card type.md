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

The top-level kind of a [[Card]]. It decides where the card can go and whether it deploys.

| Type | Deploys to a Node | Deploy | Main job |
| --- | --- | --- | --- |
| [[Character]] | Yes | Free | Power and effects |
| [[VP card]] | Yes | Free | [[Victory Points]], Server Repair |
| [[Crypto card]] | Yes | Free | [[Crypto]] for the [[Draft]] (also playable; undeployed copies auto-resolve) |

Effects can filter targets by type ("Any type", Character, VP, Crypto). Solar-monks count as Characters for those filters.
