---
kind: concept
category: board
aliases: [Locations]
is_a: Authored content
part_of: "[[Node]]"
related: ["[[Location Reward]]", "[[Trigger]]", "[[Effect step]]", "[[Who]]"]
code: src/effects/catalog.ts (describeLocation); content.locations
tags: [ontology/board]
---
# Location

Authored content dealt onto a [[Node]] each [[Cycle]]. It gives the Node its rule and its [[Location Reward]]. 27 exist: see [[Locations index]].

## Fields
- `name`, `rule` (printed text), `reward`
- Effect lists by [[Trigger]]:

| Field | Printed as | Fires | Who means |
| --- | --- | --- | --- |
| `onPlay` | On reveal: | each time a card is revealed here | played / other |
| `ongoing` | Ongoing: | continuously while the Node is open | winner / loser |
| `effects` | On collapse: | when this Node resolves in [[Wave Collapse]] | winner / loser |
| `startTurn2`, `startTurn3` | Start of turn 2/3: | at that [[Runtime turn]] | winner / loser |

"Winner" is the side currently ahead at this Node ([[Node control]]); on a tie both sides receive rewards.

## Text
Location text is colour-coded by effect family. See [[Card Text Style Guide]].
