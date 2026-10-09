---
kind: concept
category: zones
aliases: [Bank, Storage]
is_a: "[[Zone]]"
part_of: "[[Player]]"
related: ["[[Duration]]", "[[Wave Collapse]]", "[[Deck effects]]"]
code: src/runtime.ts (PlayerState.bank, BankEntry)
tags: [ontology/zones]
---
# Effect Bank

Each [[Player]]'s storage for [[Duration]] cards: **4 slots**.

- After [[Wave Collapse]], a Duration card moves here from its Node if a slot is free (play order breaks ties); otherwise it goes to [[Discard]].
- Banked cards keep running their recurring and scheduled steps; their On collapse effects run after the last Node, oldest first.
- A card leaves when its duration expires (to Discard), or when **Bumped** by an effect. Permanent (99) cards stay until removed.
