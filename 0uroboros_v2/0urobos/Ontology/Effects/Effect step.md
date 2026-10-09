---
kind: concept
category: effects
aliases: [Effect, Effects, Step, Recipe, Follow-up]
related: ["[[Trigger]]", "[[Scope]]", "[[Target]]", "[[Pick]]", "[[Who]]"]
code: src/effects/types.ts (EffectStep); src/effects/catalog.ts (ACTIONS, EDITOR_ENTRIES)
tags: [ontology/effects]
---
# Effect step

The single recipe shape behind every effect in the game. [[Card|Cards]], [[Location|Locations]], [[Circuit Reward|Circuit Rewards]] and [[Mod|Mods]] all hold lists of steps, grouped by [[Trigger]]. Printed text is generated from the steps.

## Fields
| Field | Meaning |
| --- | --- |
| `action` | What happens (one of the families below) |
| `amount` | How much |
| `target` | What it acts on: [[Target]] |
| `pick` | Which candidates and who chooses: [[Pick]] |
| `optional` | The controller may decline (skipping follow-ups too) |
| `min` | Fewest cards that must be paid for follow-ups to run (costs) |
| `then` | Follow-up steps that run only if this one resolved |
| `destination`, `cardId`, `modifier`, `formIds`, `direction`, `flow`, `options`, `choose` | Action-specific |

## Families (Effect editor groups)
| Group | Effects |
| --- | --- |
| [[Resource effects]] | Draw cards, Gain actions, Gain victory points, Gain a card, Gain crypto, Pay |
| [[Server effects]] | Drain, Repair, Destroy your backup |
| [[Card effects]] | Add power, Remove power, Restore power, Reset power, Trash a card, Destroy a card, Move a card, Morph |
| [[Deck effects]] | Mill, Discard, Trash, Inspect, Steal, Bump, Recover |
| [[Node Power effects]] | Push, Pull, Player's choice |
| [[Mod effects]] | Attach a mod, Remove mods |
| [[Flow effects]] | Choice, Random |

Each menu item maps onto one stored action; e.g. Add and Remove power are both `changePower` with a sign.
