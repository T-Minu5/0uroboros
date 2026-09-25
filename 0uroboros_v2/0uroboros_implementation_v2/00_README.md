# 0uroboros Implementation Guide v3.0

## Purpose

This package defines what must be built, what must remain true, what source material controls the work, and what evidence is required before human review.

V3 deliberately avoids prescribing Astra's internal orchestration architecture. Earlier versions over-specified the process. V3 keeps the product contract specific while giving Astra authority to choose the most effective development method, specialist mix, implementation sequence, batching strategy, and iteration cadence.

The objective is not to preserve an existing prototype. The objective is to build the intended game.

## Core operating principle

**Mel owns the game. Astra owns the development strategy. Specialists own their disciplines. Deterministic tests protect deterministic truth. Tracing proves what the swarm actually did.**

## Authority order

When sources conflict:

1. Current approved/canonical gameplay rules
2. Explicitly approved UX/product decisions
3. First-party visual assets and board concept art
4. This V3 implementation guide
5. Current repository implementation evidence
6. Mel-curated competitive and effects references
7. Historical V2/V3 architecture and experiment documents
8. External research

Historical implementation documents never override newer canonical rules.

## Protected

- approved gameplay rules
- approved Node information hierarchy
- multi-cycle playability
- hidden-information rules
- first-party visual identity
- first-party asset ownership/meaning
- explicit human approvals

## Provisional

Unless separately locked by Mel:
- current frontend
- current scene hierarchy
- current board geometry
- current camera
- current HUD
- current card frames
- current materials
- current lighting
- current effects
- current animation architecture
- current development harness

Astra may retain, refactor, or replace provisional implementation when doing so better serves the product goal.

## Human checkpoint

Astra should work autonomously until there is a coherent, functioning build with approximately **80% confidence in the direction**, then stop for Mel.

This is a direction checkpoint, not an estimate that the product is 80% complete.

No checkpoint is valid unless the hard acceptance gates in `05_ACCEPTANCE_AND_CHECKPOINTS.md` pass.
