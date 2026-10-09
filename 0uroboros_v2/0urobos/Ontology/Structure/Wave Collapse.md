---
kind: concept
category: structure
aliases: [Collapse, On collapse]
is_a: Phase
part_of: "[[Cycle]]"
related: ["[[Node control]]", "[[Location Reward]]", "[[Circuit Reward]]", "[[Effect Bank]]"]
code: src/runtime.ts (phase "collapse")
tags: [ontology/structure]
---
# Wave Collapse

The resolution phase after [[Runtime]]. The board resolves Node by Node, deterministically.

## At each Node
1. **Start** — the [[Location]] is announced.
2. **Cards** — cards there fire their own **On collapse** effects.
3. **Award** — the side with more [[Node Power]] wins ([[Node control]]); the Location's **On collapse** effects and [[Location Reward]] resolve for the winner (both sides on a tie).
4. **Close** — [[Duration]] cards move to the [[Effect Bank]] if there is room; other cards go to [[Discard]].

## After the last Node
- Effect Bank On collapse effects run, oldest to newest.
- [[Circuit Reward]] eligibility: the player who won more Locations; both on an equal count.

## Early end
If a Server destruction ends the game mid-Collapse, the current Node finishes (with awards), later Nodes are skipped, and the [[Draft]] is skipped. See [[Game end]].
