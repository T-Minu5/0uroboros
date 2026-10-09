---
kind: concept
category: effects
aliases: [Flow group, Choice, Random, Option, Option cost]
is_a: "[[Effect step]]"
related: ["[[Pick]]", "[[Effect step]]"]
code: src/effects/types.ts (ChoiceOption)
tags: [ontology/effects]
---
# Flow effects

Branching steps. Each option holds its own [[Effect step]] list.

| Effect | Does | Printed |
| --- | --- | --- |
| Choice | Offer options; `choose` sets how many and who picks (you or opponent). An option may have a **cost** that must be payable and is paid first. | Opponent chooses 2: +2 Crypto, +1 Card or +1 VP (Pay 2 Crypto) |
| Random | Run one option picked at random | — |

Other ways to sequence steps:
- `then` — follow-ups that run only if the step resolved (e.g. "Discard a card, then +2 Cards")
- `optional` — the player may skip (also skips follow-ups)

Choices may be optional, mandatory or random. A mandatory choice that times out picks a random legal option.
