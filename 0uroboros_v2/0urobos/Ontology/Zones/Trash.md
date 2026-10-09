---
kind: concept
category: zones
aliases: [Shared Trash, Trash pile]
is_a: "[[Zone]]"
part_of: "[[0uroboros]]"
related: ["[[Destroyed]]", "[[Card effects]]", "[[Deck effects]]", "[[Card Power]]"]
code: src/runtime.ts (state.trash)
tags: [ontology/zones]
---
# Trash

The one **shared** pile for both players. Cards here leave their owner's deck cycle and do not score.

- **Arrive by:** Trash (from hand, Discard, board or a random deck card), Mill to Trash, Inspect → trash.
- **Leave by:** **Recover** (into Discard, hand or deck top).
- Some cards gain +1 [[Card Power]] per card in the Trash.
