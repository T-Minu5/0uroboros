---
kind: concept
category: cards
aliases: [Starting decks, Starter deck, Deck list]
is_a: Authored content
related: ["[[Deck]]", "[[Card]]"]
code: src/game.ts (DeckEntry, expandDeck, MIN_STARTING_DECK_SIZE)
tags: [ontology/cards]
---
# Starting deck

An authored list of card IDs and counts that both players start with. One deck is marked active (today: **Standard**). Minimum 5 cards. See [[Starting decks and mods index]].

## Opening
- Both players get an identical shuffle: the same first five cards and the same remaining order.
- After that, reshuffles are independent.
