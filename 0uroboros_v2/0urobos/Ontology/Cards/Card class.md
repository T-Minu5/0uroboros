---
kind: concept
category: cards
aliases: [Class, Subtype, Action class, Utility, Runtime class, Attack, Hacker, Horror]
part_of: "[[Card]]"
related: ["[[Card type]]", "[[Card pool]]"]
code: src/game.ts (CardClass)
tags: [ontology/cards]
---
# Card class

The subtype of a [[Card]]. A filter for effects ("Card class: Hacker") and the basis of [[Card pool|pools]].

| Class | Type | Pool | Count |
| --- | --- | --- | --- |
| Action | [[Character]] | Base | 19 |
| Utility | [[Character]] | Base | 21 |
| Runtime | [[Character]] | Base (Draft offers only) | 6 |
| Attack | [[Character]] | Chaos | 14 |
| Hacker | [[Character]] | Chaos | 8 |
| Horror | [[Character]] | Chaos | 8 |
| Volume | [[VP card]] | VP | 9 |
| Solar-monk | [[VP card]] (also Character) | VP | 4 |

Counts include [[Generated card|generated]] cards. Crypto cards have no class.

> Naming: the imported catalog's `power` tag became **Hacker** (to avoid confusion with numeric Power); `encryptedVolume` became **Volume**.
