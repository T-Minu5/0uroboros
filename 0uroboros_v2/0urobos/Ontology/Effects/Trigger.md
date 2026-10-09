---
kind: concept
category: effects
aliases: [Triggers, Hook, On reveal, On collapse, Ongoing, Start of turn]
part_of: "[[Effect step]]"
related: ["[[Reveal]]", "[[Wave Collapse]]", "[[Duration]]", "[[Scope]]"]
code: src/locationTriggers.ts; src/game.ts (Card hooks)
tags: [ontology/effects]
---
# Trigger

When a list of [[Effect step|steps]] runs. Printed in white before the effect text.

| Trigger | On | Fires |
| --- | --- | --- |
| **On reveal** | Card, Mod | When the card turns face up ([[Reveal]]) |
| **On reveal** | Location | Each time a card is revealed there |
| **On collapse** | Card, Mod | When its Node resolves ([[Wave Collapse]]); from the [[Effect Bank]] after the last Node |
| **On collapse** | Location | When its Node resolves: the [[Location Reward]] |
| **Ongoing** | Location | While the Node is open |
| **Start of turn 2 / 3** | Location | At that [[Runtime turn]] |
| **Recurring** | Card, Mod | Every turn or Cycle while a [[Duration]] card is active |
| **Scheduled** | Card | At a set turn or Cycle offset, start or end |
| **On claim** | Circuit Reward | When claimed in the [[Draft]] |
