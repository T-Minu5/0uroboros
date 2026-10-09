---
kind: concept
category: cards
aliases: [Mods, Card mod, Modifier, Built-in mod, Authored mod]
is_a: Authored content
related: ["[[Card]]", "[[Mod effects]]", "[[Effect step]]"]
code: src/effects/types.ts (ModDefinition, BUILTIN_MODIFIERS); src/game.ts (CardModifier)
tags: [ontology/cards]
---
# Mod

A lasting upgrade attached to a [[Card]] copy. Once attached, it stays with that copy for the rest of the game.

## Built-in mods
| Mod | Badge | Effect |
| --- | --- | --- |
| Printed effects happen twice | [x2] | The card's own reveal and collapse effects run twice (not other mods') |
| Power aura at Location | [+N] | While revealed, every other ally at its Location has +N Power |
| Movable each turn | [↔] | Once per Runtime turn its owner may move it to another open Location for free |

## Authored mods
Defined in the studio with their own [[Effect step]] lists on hooks **On reveal**, **On collapse** and **Recurring**; they run as the host's own effects. Today: *The Giver* (On reveal: +1 Power to a random revealed card of yours). See [[Starting decks and mods index]].

Attached or removed by [[Mod effects]], Locations (Occult archive, Moving mod) and [[Circuit Reward|Circuit Rewards]] (Recursive curse, The Rizz, Telemetry).
