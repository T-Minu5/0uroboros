---
kind: concept
category: cards
aliases: [Characters]
is_a: "[[Card type]]"
related: ["[[Card class]]", "[[Node Power]]"]
code: src/game.ts (isCharacterCard)
tags: [ontology/cards]
---
# Character

The deployable fighting [[Card type]]. Deploys free during [[Runtime]], adds its [[Card Power]] to [[Node Power]] once revealed, and carries most effects.

## Classes
- Base pool: **Action**, **Utility**, **Runtime**
- Chaos pool: **Attack**, **Hacker**, **Horror**

See [[Card class]] and [[Card pool]].

**Solar-monk** [[VP card|VP cards]] also count as Characters: they deploy free and match "Character" targets.

Temporary Power rule for newly enabled Characters: half the cost rounded up, 1–5.
