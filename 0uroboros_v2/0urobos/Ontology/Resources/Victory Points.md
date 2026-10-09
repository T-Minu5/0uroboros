---
kind: concept
category: resources
aliases: [VP, +N VP, Score]
is_a: Resource
part_of: "[[Player]]"
related: ["[[VP card]]", "[[Server]]", "[[Game end]]", "[[Resource effects]]"]
code: src/runtime.ts (destructionVP, rewardVP, totalVP)
tags: [ontology/resources]
---
# Victory Points

The score. Most VP at [[Game end]] wins.

## Sources
| Source | Notes |
| --- | --- |
| Server destruction | Destroying an enemy Primary +8, Backup +12 ([[Server]]) |
| Reward VP | "+N VP" effects from cards, [[Location Reward|Locations]] and [[Circuit Reward|Circuit Rewards]]; negative amounts take VP away |
| [[VP card|VP cards]] | Score their `vp` while in active player-owned zones |

Shown live by default (a hide option is allowed).
