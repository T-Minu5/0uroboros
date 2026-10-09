---
kind: concept
category: resources
aliases: [Actions, +N Action]
is_a: Resource
part_of: "[[Player]]"
related: ["[[Runtime turn]]", "[[Character]]", "[[Resource effects]]"]
code: src/runtime.ts (actions, pendingActions)
tags: [ontology/resources]
---
# Action

The deployment resource of [[Runtime]].

- Gained per turn: +2 on turn 1, +1 on turns 2 and 3.
- Spent: 1 per [[Character]] (and Solar-monk) deployed; other VP cards cost 0; Crypto can't deploy.
- No maximum. Unused Actions carry between Runtime turns, but reset between [[Cycle|Cycles]].
- "+N Action" from an On reveal effect is usable next turn (shown as pending); scheduled start-of-turn Actions are usable that turn.
