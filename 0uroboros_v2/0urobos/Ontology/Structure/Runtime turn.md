---
kind: concept
category: structure
aliases: [Turn, Turns, Runtime turns]
part_of: "[[Runtime]]"
related: ["[[Action]]", "[[Reveal]]", "[[Reveal priority]]", "[[Duration]]"]
code: src/runtime.ts (state.turn)
tags: [ontology/structure]
---
# Runtime turn

One of the three turns of [[Runtime]], and the smaller of the two time scales.

## Flow
1. **Planning** — both players deploy cards from [[Hand]] to Node lanes, spending [[Action|Actions]]. Own placements show face up until End Turn. *Undo all actions* is available until then.
2. **End Turn** — placements are committed (concealed). A shared countdown can end the turn early.
3. **[[Reveal]]** — committed cards at open Nodes turn face up alternately, by [[Reveal priority]], and their On reveal effects resolve.

## Timing hooks
- Location "Start of turn 2/3" effects
- Card [[Duration]] schedules: "Next Runtime turn", "End of the next Runtime turn", "every turn"
- Actions earned On reveal become usable next turn; scheduled start-of-turn Actions are usable that turn.
