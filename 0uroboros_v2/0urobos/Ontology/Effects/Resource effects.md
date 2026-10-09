---
kind: concept
category: effects
aliases: [Resources group, Draw cards, Gain actions, Gain victory points, Gain a card, Gain crypto, Pay]
is_a: "[[Effect step]]"
related: ["[[Action]]", "[[Crypto]]", "[[Victory Points]]", "[[Generated card]]"]
tags: [ontology/effects]
---
# Resource effects

| Effect | Action id | Does | Printed |
| --- | --- | --- | --- |
| Draw cards | `draw` | Deck → hand, reshuffling Discard if needed | +2 Cards |
| Gain actions | `gainActions` | [[Action|Actions]] for the next Runtime turn | +1 Action |
| Gain victory points | `gainVP` | +/- [[Victory Points]] | +1 VP / -1 VP from enemy |
| Gain a card | `gainCard` | New copies to hand, deck top or Discard | Gain a Glitch · Gain a Byte-Coin on top of your deck |
| Gain crypto | `gainCrypto` | [[Crypto]] for the coming Draft | +2 Crypto |
| Pay | `payCrypto` | Spend Crypto; as a Choice cost, unavailable without enough | Pay 2 Crypto |
