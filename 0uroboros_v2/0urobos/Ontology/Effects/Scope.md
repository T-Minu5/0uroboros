---
kind: concept
category: effects
aliases: [Scopes, Effect scope]
part_of: "[[Effect step]]"
related: ["[[Who]]", "[[Trigger]]"]
code: src/effects/types.ts (Scope, scopedWho)
tags: [ontology/effects]
---
# Scope

Where an effect list lives. It decides who "you" are and which targets make sense.

| Scope | Used by | "You" | "Opponent" |
| --- | --- | --- | --- |
| `card` | Cards, Mods | The card's owner | Enemy |
| `location` | Location Ongoing / On collapse / Start of turn | Winning player | Losing player |
| `locationPlay` | Location On reveal | The player who played here | The other player |
| `circuit` | Circuit Rewards | The claimer | The other player |

Some actions only exist in some scopes: e.g. there is no board in the `circuit` scope, and Node Power transfers and Morph are card-only.
