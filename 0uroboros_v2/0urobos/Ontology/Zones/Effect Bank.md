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

- After [[Wave Collapse]], a Duration card moves here from its Node if a slot is free (play order breaks ties); otherwise it goes to the **card owner's** [[Discard]].
- **`foreignBank` Durations** try the **enemy** Effect Bank instead of the caster's. The host seat only holds the slot; **ownership never changes** (`BankEntry.owner` = caster).
- Overflow (host bank full) → owner Discard, same as own-Bank overflow.
- Banked cards keep running their recurring and scheduled steps as the **owner**; their On collapse effects run after the last Node, oldest first, with `self`/`opponent` relative to the caster.
- **Removal (Bump / Trash / Destroy):**
  - **Your bank:** Foreign infectors only (`entry.owner !== host`). Native Durations are not legal targets.
  - **Enemy bank:** all occupants.
  - Always frees the host slot and retires under the **card owner** (Bump → owner Discard; Trash → shared Trash; Destroy → owner's destroyed pile).
- Expiry also sends the card to the owner's Discard. Permanent (99) cards stay until removed.
- UI: foreign occupants (`entry.owner !== host`) show a slow attack-red monochrome pulse for both seats.
