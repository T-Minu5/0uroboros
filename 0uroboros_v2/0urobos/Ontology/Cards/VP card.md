---
kind: concept
category: cards
aliases: [VP cards, Volume, Solar-monk, Encrypted Volume]
is_a: "[[Card type]]"
related: ["[[Victory Points]]", "[[Server effects]]", "[[Card class]]"]
code: src/game.ts (VP_CLASSES, isSolarMonk)
tags: [ontology/cards]
---
# VP card

A [[Card type]] that scores [[Victory Points]] while held in an active player-owned [[Zone]] (not [[Trash]] or [[Destroyed]]). Its `vp` value is separate from its [[Card Power]] (new VP cards use the VP value as Power).

## Classes
| Class | Deploy | Typical effect |
| --- | --- | --- |
| **Volume** | Free | Repair your Server ("Repair +100"), often over a [[Duration]] |
| **Solar-monk** | Free | Also a [[Character]]: counts for Character targets |

VP may be negative or state-dependent when card text says so.
