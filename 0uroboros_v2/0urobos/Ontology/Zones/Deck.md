---
kind: concept
category: zones
aliases: [Draw pile, Top card, Bottom card, Top of deck]
is_a: "[[Zone]]"
part_of: "[[Player]]"
related: ["[[Hand]]", "[[Discard]]", "[[Deck effects]]", "[[Starting deck]]"]
code: src/game.ts (drawCards)
tags: [ontology/zones]
---
# Deck

A [[Player]]'s face-down draw pile.

- Draw 5 at the start of each [[Cycle]]; no maximum hand size.
- When a draw needs more cards than remain, the rest are drawn first, then [[Discard]] is shuffled in and the remainder drawn.
- Targets: **Top card**, **Bottom card**, **Deck (random)**.
- Acted on by: Mill, Inspect, Gain a card (on top), Trash (random deck card).
