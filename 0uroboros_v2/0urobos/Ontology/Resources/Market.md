---
kind: concept
category: resources
aliases: [Market pile, Pile, Draft offer, Game cards, Supply]
part_of: "[[Draft]]"
related: ["[[Card pool]]", "[[Crypto]]", "[[Circuit Reward]]"]
code: src/evaluationMarket.ts (createStrategicMarket, draftOffer)
tags: [ontology/resources]
---
# Market

What players can buy in the [[Draft]]. Built from piles, each with a shared supply.

## Game piles (dealt once, last all game)
| Piles | From | Supply each |
| --- | --- | --- |
| 2 Base | Base pool, not Runtime | 8 |
| 2 Chaos | Chaos pool | 8 |
| 3 Volume | VP pool | 8 |
| 1 Solar-monk | VP pool | 8 |
| Byte-Coin, Kilo-Coin, Mega-Cache | Crypto | 16 / 16 / 8 |

## Draft offer (changes every Draft)
3 Base or Chaos cards (Runtime included) that aren't game piles, each limited to **2 copies per player**. Last Draft's offer is avoided when possible.

Each of the 3 slots leans to the Cycle's phase: it comes from the favoured cards with the given chance, otherwise from the rest of the pool (`DRAFT_PHASES`).

| Cycles | Favoured | Chance per slot |
| --- | --- | --- |
| 1–4 | [[Card class\|Action]] and Utility | 75% |
| 5–8 | Runtime, Attack and Hacker | 60% |
| 9–12 | [[Card pool\|Chaos]] (Attack, Hacker, Horror) | 75% |
| 13–16 | Horror | 75% |

## Not in the market
- [[Generated card|Generated cards]]
- The [[Circuit Reward]], a separate privileged offer for eligible players

> V3.1 described 9 Base / 3 VP / 3 Crypto piles + 3 Chaos offers; the current build uses the structure above.
