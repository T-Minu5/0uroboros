---
kind: concept
category: effects
aliases: [Mods group, Attach a mod, Remove mods]
is_a: "[[Effect step]]"
related: ["[[Mod]]", "[[Character]]"]
tags: [ontology/effects]
---
# Mod effects

| Effect | Action id | Does |
| --- | --- | --- |
| Attach a mod | `attachModifier` | Put a permanent [[Mod]] on a Character, on the board or in any zone ("collection" = deck, then Discard, then hand). Mods stack. |
| Remove mods | `removeModifier` | Strip every mod from a card, or every copy of one mod. Only cards carrying a matching mod can be picked. |

Printed: "Attach “printed effects happen twice” to a Character in the winning player's deck".
