---
kind: concept
category: zones
aliases: [Crypto Wallet, Crypto Cache]
is_a: "[[Zone]]"
part_of: "[[Player]]"
related: ["[[Crypto]]", "[[Crypto card]]", "[[Draft]]"]
code: src/runtime.ts (PlayerState.wallet); ZoneId "wallet"
tags: [ontology/zones]
---
# Wallet

The word means two linked things:

1. **Wallet zone** (Crypto Cache) — the stack of [[Crypto card|Crypto cards]] a player has drawn this Cycle, shown in the green housing. Effects can **Steal** from it or **Bump** cards out of it.
2. **Wallet amount** — the [[Crypto]] a player can spend in this Cycle's [[Draft]]: the cards' values plus any "+N Crypto" gains.

The amount resets to 0 at the start of each [[Cycle]], and anything unspent after the Draft is lost.
