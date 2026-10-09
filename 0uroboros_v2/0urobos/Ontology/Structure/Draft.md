---
kind: concept
category: structure
aliases: [Draft phase, Shop]
is_a: Phase
part_of: "[[Cycle]]"
related: ["[[Market]]", "[[Wallet]]", "[[Crypto]]", "[[Circuit Reward]]"]
code: src/runtime.ts (phase "draft"), src/evaluationMarket.ts
tags: [ontology/structure]
---
# Draft

The buying phase at the end of each [[Cycle]]. Simultaneous, real-time, 90 seconds by default.

## Flow
1. [[Crypto card|Crypto cards]] in the [[Wallet]] auto-resolve and credit Crypto.
2. Players buy from the [[Market]]; purchases go to [[Discard]] unless the card says otherwise.
3. Eligible players may claim the [[Circuit Reward]] once each, free.
4. Both players End Draft (early allowed) or time runs out. Unspent Crypto is lost.

## Rules
- Unlimited affordable buys; first confirmed purchase wins a shared pile race.
- Effective cost never goes below 0.
- Draft effects do not attack.
- Cycle 16 includes a final Draft before scoring, unless the game ended during [[Wave Collapse]].
