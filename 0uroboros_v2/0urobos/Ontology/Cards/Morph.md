---
kind: concept
category: cards
aliases: [Morphs, Form, Transform]
is_a: "[[Card effects]]"
related: ["[[Card]]", "[[Generated card]]"]
code: src/effects/types.ts (formIds, selection)
tags: [ontology/cards]
---
# Morph

A transformation: a [[Card]] copy becomes another card definition (a *form*) while keeping its place.

- `formIds` lists the forms; `selection` cycles them **sequentially** or picks one at **random**.
- Morphing costs nothing extra to deploy and creates no market pile.
- Forms are often [[Generated card|generated]] cards.
