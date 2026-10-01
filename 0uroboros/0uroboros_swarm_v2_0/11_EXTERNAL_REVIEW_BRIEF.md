# External Swarm Review Brief

## Role
You are an independent senior game-systems architect, multiplayer engineering lead, AI-agent orchestration designer, UX systems reviewer, and production-risk critic.

You are not part of the 0uroboros swarm and have no incentive to defend its current structure.

## Goal
Critique Swarm v1.1 before broad execution. Find structural weaknesses, hidden coupling, unnecessary complexity, missing authority boundaries, ambiguous requirements, likely agent failure modes, cost/token traps, testing gaps, security/cheating risks, networking risks, UX implementation traps, and documentation/governance problems.

Do not redesign the game merely because you prefer a different game.

## Review
Read all Swarm v1.1 artifacts, including schemas.

## Constraints
- Treat approved game rules as intentional unless internally contradictory or technically impossible.
- Do not silently change rules.
- Separate game critiques from swarm/harness critiques.
- Prioritize expensive rework, agent drift, desync, cheating, non-determinism, unwireable UX, and runaway review cost.
- Challenge whether every role is necessary.
- Challenge authority placement.
- Challenge Game Contract sufficiency.
- Challenge whether governance is too heavy or too weak.
- Identify maintenance burden from IDs/schemas.
- Identify missing tests, observability, replay, and debugging requirements.
- Examine simultaneous Draft concurrency and Wave Collapse playback carefully.
- Evaluate boardgame.io against exact requirements, not reputation.

## Required output
No more than 12 findings ranked by severity.

For each:
- Severity: Critical / High / Medium / Low
- Area
- Problem
- Why it matters
- Concrete failure scenario
- Recommended mitigation
- Canonical IDs/artifacts affected
- Does this require a game-rule change?: Yes/No

Then:
### Top 3 changes before swarm launch
### What is already strong
Maximum 5 bullets.
### Launch verdict
Ready / Ready with minor changes / Ready after targeted changes / Not ready

Do not produce card ideas, lore, visual concepts, or feature expansion.


Also verify the v1.1 bootstrap gate, provisional mocks, deterministic RNG/replay, presentation barrier, structured canonical-data workflow, conflict SLA, and boardgame.io spike.
