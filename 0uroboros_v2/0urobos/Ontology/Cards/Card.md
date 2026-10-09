---
kind: concept
category: cards
aliases: [Cards, Card definition, Card copy]
is_a: Authored content
related: ["[[Card type]]", "[[Card class]]", "[[Card pool]]", "[[Card Power]]", "[[Effect step]]", "[[Zone]]"]
code: src/game.ts (Card)
tags: [ontology/cards]
---
# Card

The basic game piece. A **definition** is authored once (93 today, see [[Cards index]]); each **copy** in a game is an instance with its own ID that keeps its own Power changes and [[Mod|Mods]].

## Is classified by
- [[Card type]] — Character, VP or Crypto (what it does in play)
- [[Card class]] — Action, Utility, Runtime, Attack, Hacker, Horror, Volume, Solar-monk
- [[Card pool]] — Base, Chaos, VP, Crypto (where it is offered)
- [[Generated card|Generated]] flag — created only by effects

## Fields
| Field | Meaning |
| --- | --- |
| `cost` | [[Crypto]] price in the [[Market]] |
| `power` | Printed [[Card Power]] |
| `vp` | [[Victory Points]] it scores (VP cards) |
| `cryptoValue` | Crypto it yields (Crypto cards) |
| `effect` | Printed text |
| `storyText` | Flavour, shown only when inspected |
| `onReveal`, `onCollapse` | [[Effect step]] lists by [[Trigger]] |
| `duration`, `durationPeriod`, `recurring`, `schedule` | See [[Duration]] |
| `powerSource` | Adds a live count to Power: cards in [[Trash]] or cards [[Destroyed]] |
| `modifiers` | Attached [[Mod|Mods]] |

## Lives in
One [[Zone]] at a time: Deck, Hand, Discard, Wallet, a Node lane, Effect Bank, Trash or Destroyed.
