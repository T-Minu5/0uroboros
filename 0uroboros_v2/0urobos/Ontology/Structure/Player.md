---
kind: concept
category: structure
aliases: [You, Opponent, Enemy]
part_of: "[[0uroboros]]"
related: ["[[Server]]", "[[Zone]]", "[[Action]]", "[[Crypto]]", "[[Victory Points]]", "[[Who]]"]
code: src/runtime.ts (PlayerState)
tags: [ontology/structure]
---
# Player

One of the two sides. Effects name players relative to whoever controls the effect: see [[Who]].

## Owns
- Two [[Server|Servers]]: Primary and Backup
- Personal [[Zone|Zones]]: [[Deck]], [[Hand]], [[Discard]], [[Wallet]], [[Effect Bank]], [[Destroyed]]
- A side (lane) at every [[Node]], holding up to 4 of their cards

## Tracks
| State | Notes |
| --- | --- |
| [[Action|Actions]] | Spent to deploy [[Character|Characters]]; earned Actions wait for the next [[Runtime turn]] |
| [[Wallet]] | Crypto amount for this Cycle's [[Draft]] |
| [[Victory Points]] | Destruction VP + reward VP + VP cards held |
| Server integrity | Primary 2000, Backup 1500 at start |

## Relations
- Takes [[Reveal priority]] when controlling more [[Location|Locations]]
- Is *winner* or *loser* at each Node during [[Wave Collapse]]
- Is *eligible* for the [[Circuit Reward]] when winning at least as many Locations as the opponent
