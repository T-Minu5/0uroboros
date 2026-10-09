---
kind: concept
category: effects
aliases: [Targets, Target choice]
part_of: "[[Effect step]]"
related: ["[[Who]]", "[[Pick]]", "[[Zone]]", "[[Server]]", "[[Node]]", "[[Deck]]", "[[Effect Bank]]"]
code: src/effects/types.ts (Target); src/effects/catalog.ts (TargetChoice)
tags: [ontology/effects]
---
# Target

What an [[Effect step]] acts on. Five shapes:

| Type | Fields | Example |
| --- | --- | --- |
| Player | [[Who]] | "+1 Card" |
| Server | Who + Available / Both / Backup | "-200 Enemy server" |
| Zone | Who + zone (hand, deck, discard, trash, bank, wallet…) | "Mill 2 cards from enemy deck" |
| Card | Who + where + optional relation + filter | "Restore a revealed card of yours +1" |
| Node | this / neighbours | Node Power transfers |

## Card targets (editor Target select)
Any revealed card · Revealed card here · This card · Next revealed card · Previously revealed card · Card in hand · Top card · Bottom card · Deck (random) · Effect Bank. Filters: card type and card class.

- **Deck (random)** picks a random card anywhere in the [[Deck]]. It fixes the [[Pick]] to random, so the editor hides the Pick select, but a count is kept ("Restore 2 cards in your deck +1").
- **Effect Bank** reaches cards stored in the [[Effect Bank]] ("Destroy a card in enemy Effect Bank").
- Both are offered by Add power, Remove power, Restore power, Reset power, Trash a card and Destroy a card. Move a card stays on the board and Morph has no target.

## Node targets
Left · Right · Between (split) · Choice.

If no legal target exists, the step resolves with no effect and says so.
