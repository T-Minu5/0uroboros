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

What players can buy in the [[Draft]]. There are **no fixed game piles** and **no persistent Crypto shelf** — only a rotating offer each Draft.

## Draft offer (changes every Draft)
Default **8** rotating piles (Configure can expand to 10), each limited to **2 copies per player**. Last Draft's identities are avoided when the pool allows. Soft floor: at least two cards that gain +2 [[Crypto]].

| Slot | Matches |
| --- | --- |
| 1–2 | Action or Utility |
| 3–4 | Hacker or [[Crypto card\|Crypto]] |
| 5 | Attack |
| 6 | Horror |
| 7 | Solar Monk |
| 8 | VP (non–Solar Monk) |

Optional 10-card mode inserts two soft Chaos fills between slots 4 and 5.

Cycles 1–4 only offer cards costing 1–7 Crypto; later Cycles any cost.

## Not in the market
- [[Generated card|Generated cards]]
- The [[Circuit Reward]], a separate privileged offer for eligible players
