---
kind: concept
category: structure
aliases: [The game, Runtime Mode]
related: ["[[Player]]", "[[Cycle]]", "[[Game end]]"]
code: src/runtime.ts (RuntimeSession)
tags: [ontology/structure]
---
# 0uroboros

A two-player competitive deck-building game. Players build decks across repeated [[Cycle|Cycles]], deploy cards face down onto five [[Node|Nodes]], fight for [[Node control]], drain each other's [[Server|Servers]] and score [[Victory Points]].

## Has
- 2 [[Player|Players]]
- Up to 16 [[Cycle|Cycles]]
- A shared [[Market]] and a shared [[Trash]]
- Authored content: [[Card|Cards]], [[Location|Locations]], [[Circuit Reward|Circuit Rewards]], [[Mod|Mods]], [[Starting deck|Starting decks]]

## Modes
- **Runtime Mode** (current): three deployment [[Runtime turn|turns]] per Cycle, Nodes opening over those turns.
- **Short-Circuit Mode** (all five Nodes open together): deferred.

## Win
See [[Game end]]. Most [[Victory Points]] wins; equal VP is a tie.
