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

A [[Card type]] that deploys free during [[Runtime turn|Runtime]]. Undeployed copies stay in the [[Hand]] (shown as the [[Wallet]] housing) and auto-resolve at the start of [[Draft]], crediting `cryptoValue` as [[Crypto]], then go to [[Discard]]. Played copies fire On reveal / On collapse like other cards (currency usually reprints its payout on reveal).

## Currencies
| Card | Market supply | Notes |
| --- | --- | --- |
| Byte-Coin | 16 | Always buyable |
| Kilo-Coin | 16 | Always buyable |
| Mega-Cache | 8 | Always buyable |
| Shyte-Coin | — | Starter filler and Location punishment |

Crypto cards can be stolen or bumped from the Wallet ([[Deck effects]]).
