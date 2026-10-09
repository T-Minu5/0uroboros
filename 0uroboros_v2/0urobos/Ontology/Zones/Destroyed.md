---
kind: concept
category: zones
aliases: [Destroyed pile, Destroy]
is_a: "[[Zone]]"
part_of: "[[Player]]"
related: ["[[Trash]]", "[[Card effects]]", "[[Card Power]]"]
code: src/runtime.ts (PlayerState.destroyed)
tags: [ontology/zones]
---
# Destroyed

Each [[Player]]'s pile of destroyed cards. **Destroy a card** sends a card here from the board or any of its owner's zones. Destroyed cards do not score.

- The V3.1 rules call this permanent removal; the current build lets **Recover** take cards back from your own destroyed pile.
- Some cards gain +1 [[Card Power]] per card destroyed by both players.

Different from [[Trash]]: Trash is shared, Destroyed belongs to the card's owner.
