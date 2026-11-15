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

1. **Wallet amount** — the spendable [[Crypto]] a player can use in this Cycle's [[Draft]]. Effects can **Steal** amount from it (transfer to the other player) or **Bump** amount from it (burn; neither player receives it). `+N Crypto` gains and Draft costs move this number.
2. **Crypto Cache** — drawn [[Crypto card|Crypto cards]] shown in the green housing. Undeployed copies auto-resolve their `cryptoValue` into the wallet amount at Draft. Steal and Bump no longer move these cards.

The amount resets to 0 at the start of each [[Cycle]], and anything unspent after the Draft is lost.
