---
kind: concept
category: effects
aliases: [Cards group, Add power, Remove power, Restore, Restore power, Reset, Reset power, Trash a card, Destroy a card, Move a card]
is_a: "[[Effect step]]"
related: ["[[Card Power]]", "[[Trash]]", "[[Destroyed]]", "[[Morph]]", "[[Deck]]", "[[Effect Bank]]"]
tags: [ontology/effects]
---
# Card effects

Act on individual cards, chosen with a card [[Target]] and a [[Pick]].

| Effect         | Action id         | Does                                                                    | Printed                               |
| -------------- | ----------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| Add power      | `changePower` (+) | Lasting +N [[Card Power]]; taking from an enemy moves it onto this card | +1 Power to …                         |
| Remove power   | `changePower` (-) | Lasting -N Power                                                        | -1 Power from …                       |
| Restore power  | `healCard`        | Heal toward printed Power, never above                                  | Restore a revealed card of yours +1   |
| Reset power    | `restoreCard`     | Back to exactly printed Power                                           | Reset the Power of all cards here     |
| Trash a card   | `trashCard`       | To the shared [[Trash]]                                                 | Trash the weakest revealed card here  |
| Destroy a card | `destroyCard`     | To its owner's [[Destroyed]] pile                                       | Destroy a revealed card on both sides |
| Move a card    | `moveCard`        | A revealed card to another open Node with room                          | Move a revealed card …                |
| Morph          | `morph`           | Become another card, keeping Power changes ([[Morph]])                  | —                                     |

## Targets

All Card effects except Move a card and Morph share one Target list: the board places, Card in hand, Top card, Bottom card, **Deck (random)** and **Effect Bank**.

- Deck (random) takes a random card from anywhere in the [[Deck]] ("Restore 2 cards in your deck +1").
- Effect Bank reaches cards stored in the [[Effect Bank]] ("Destroy a card in enemy Effect Bank").
- Move a card only targets revealed cards on the board; Morph has no target.
