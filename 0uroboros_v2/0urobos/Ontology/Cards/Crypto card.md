---
kind: concept
category: cards
aliases: [Crypto cards, Coin, Byte-Coin, Kilo-Coin, Mega-Cache, Shyte-Coin]
is_a: "[[Card type]]"
related: ["[[Crypto]]", "[[Wallet]]", "[[Draft]]"]
code: src/evaluationMarket.ts (CURRENCY_PILES)
tags: [ontology/cards]
---
# Crypto card

A [[Card type]] that cannot deploy. When drawn it moves from the [[Hand]] to the [[Wallet]] housing; entering the [[Draft]] it auto-resolves and credits its `cryptoValue` as [[Crypto]], then goes to [[Discard]].

## Currencies
| Card | Market supply | Notes |
| --- | --- | --- |
| Byte-Coin | 16 | Always buyable |
| Kilo-Coin | 16 | Always buyable |
| Mega-Cache | 8 | Always buyable |
| Shyte-Coin | — | [[Generated card]]; starter filler and Location punishment |

Crypto cards can be stolen or bumped from the Wallet ([[Deck effects]]).
