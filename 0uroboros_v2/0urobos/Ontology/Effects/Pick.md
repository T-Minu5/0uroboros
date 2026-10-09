---
kind: concept
category: effects
aliases: [Pick mode, Chosen, Random pick, Weakest, Strongest, Chooser]
part_of: "[[Effect step]]"
related: ["[[Target]]", "[[Flow effects]]"]
code: src/effects/types.ts (Pick)
tags: [ontology/effects]
---
# Pick

How cards are picked from a [[Target]]'s candidates, how many, and who chooses.

| Mode | Printed as |
| --- | --- |
| Chosen | "Choose a revealed card of yours to …" / "Opponent chooses …" |
| Random | "a revealed card of yours" (unmarked) |
| All | "all your revealed cards" |
| Weakest / Strongest | "the weakest card in your hand" |
| First | Play-order first (mods) |

`count` sets how many; `chooser` is self or opponent. Deck top/bottom targets take cards in order, so pick modes don't apply there. A mandatory choice that times out picks a random legal option.
