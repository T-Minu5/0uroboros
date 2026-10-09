---
kind: concept
category: structure
aliases: [Priority]
part_of: "[[Runtime turn]]"
related: ["[[Reveal]]", "[[Node control]]", "[[Player]]"]
code: src/runtime.ts (state.priority)
tags: [ontology/structure]
---
# Reveal priority

Which [[Player]] reveals first in the next [[Runtime turn]].

- Goes to the player controlling more [[Location|Locations]] (see [[Node control]]).
- On an equal count, the current holder keeps it.

> Retired: priority by controlled Node weight (percentages were removed from the board).
