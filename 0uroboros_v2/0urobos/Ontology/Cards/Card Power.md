---
kind: concept
category: cards
aliases: [Power, Printed Power, Power change, powerDelta]
part_of: "[[Card]]"
related: ["[[Node Power]]", "[[Card effects]]"]
code: src/game.ts (effectiveCardPower, setPowerDelta, cardPowerFloor)
tags: [ontology/cards]
---
# Card Power

A card's strength, summed into [[Node Power]] once revealed.

## Layers
1. **Printed Power** — the `power` on the card (may be negative, e.g. A Total Loss -9)
2. **Power source** — optional live bonus: +1 per card in [[Trash]], or +1 per card [[Destroyed]]
3. **Power change** (`powerDelta`) — lasting gains/losses from effects; stays with that copy in every zone for the rest of the game
4. **Aura** — temporary bonus from a Power-aura [[Mod]] at the same Location

Changes cannot push a card below 0 unless it was printed negative.

## Effects on it
| Word | Meaning |
| --- | --- |
| Add / Remove power | Change it by +N / -N |
| **Restore** | Heal a weakened card toward its printed Power, never above; boosts untouched |
| **Reset** | Set it back to printed Power |

See [[Card effects]].
