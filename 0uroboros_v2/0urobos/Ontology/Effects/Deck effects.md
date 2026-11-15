---
kind: concept
category: effects
aliases: [Deck group, Mill, Discard effect, Trash cards, Inspect, Scry, Peek, Steal, Bump, Recover]
is_a: "[[Effect step]]"
related: ["[[Deck]]", "[[Hand]]", "[[Discard]]", "[[Wallet]]", "[[Effect Bank]]", "[[Trash]]"]
tags: [ontology/effects]
---
# Deck effects

Move cards between [[Zone|zones]] rather than changing them.

| Effect | Action id | Target | Does |
| --- | --- | --- | --- |
| Mill | `mill` | Top of deck | Top N cards to Discard or Trash |
| Discard | `discardCards` | Hand | Up to N cards; with a minimum and follow-ups it works as a cost |
| Trash | `trashCards` | Hand, Discard pile, Hand or Discard, Deck (random) | Up to N cards to the shared Trash; Hand or Discard lets the player pick from either pile; from the deck they are picked at random ("Trash 2 cards from your deck at random") |
| Inspect | `scry` | Top of deck | Look at the top N; choose among authored Keep / Discard / Trash for each (default all three). Both = controller sees Yours and Enemy's together |
| Peek | `peek` | Top of deck | Look at the top N for a few seconds; deck unchanged. Both = controller sees Yours and Enemy's together |
| Steal | `stealCrypto` | Enemy Wallet | Transfer N spendable Crypto into your wallet |
| Bump | `bump` | Effect Bank, Wallet, or either | Bank: cards → Discard. Wallet: burn N Crypto (neither gets it). Either: bank then wallet burn |
| Recover | `recover` | Trash pile (or your Destroyed pile) | Take cards back to Discard, hand or deck top |

Trash here is the bulk version. To trash one specific card, including a random deck card or a card in the Effect Bank, use Trash a card in [[Card effects]].
