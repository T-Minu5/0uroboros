---
kind: concept
category: resources
aliases: [Circuit Rewards, Eligible player, Claimer]
is_a: Reward
part_of: "[[Draft]]"
related: ["[[Node control]]", "[[Wave Collapse]]", "[[Location Reward]]", "[[Effect step]]"]
code: src/runtime.ts (circuitEligible, circuitReward); content.circuitRewards
tags: [ontology/resources]
---
# Circuit Reward

A privileged bonus for winning the [[Circuit]]. 13 exist: see [[Circuit Rewards index]].

- **Eligibility:** after [[Wave Collapse]], the player who won more [[Location|Locations]]; on an equal count (including all ties) both are eligible.
- **Offer:** one random Circuit Reward each [[Draft]], claimable once per eligible player, free.
- **Content:** an authored [[Effect step]] list in the `circuit` [[Scope]] ("you" = the claimer), plus printed `text`.

Not a [[Market]] pile. Separate from [[Location Reward|Location Rewards]].
