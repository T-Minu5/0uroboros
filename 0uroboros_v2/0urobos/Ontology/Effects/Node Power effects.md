---
kind: concept
category: effects
aliases: [Node Power group, Push, Pull, Player's choice, Transfer power, Shift power, Split]
is_a: "[[Effect step]]"
related: ["[[Node Power]]", "[[Circuit]]"]
code: action transferPower (flow + direction); src/transferText.ts
tags: [ontology/effects]
---
# Node Power effects

Move the card owner's own [[Node Power]] between its Node and a neighbour until the [[Cycle]] ends. Card scope only.

| Menu item | `flow` | Meaning |
| --- | --- | --- |
| Push | push | Power leaves this Node |
| Pull | pull | Power comes into this Node |
| Player's choice | either | The player decides push or pull |

| Target | `direction` |
| --- | --- |
| Left / Right | Fixed neighbour |
| Between | split: divides the amount across both neighbours (odd point left; at an edge, all to the one neighbour) |
| Choice | The player picks the side |

## Printed
- Push or pull N power
- Push N power right / Push N power left
- Pull N power from the right / Pull N power from the left
- Push or pull N power on the left
- Push N power left or right; Pull N power from the left or right
- Push N power left and right (split; N is each side's share)

Transfers keep the total, never take the opponent's Power, and don't wrap N1↔N5. They replace the old "+Draft" Node-weight shifts (+1/+2/+3 → 1/2/3 Power).
