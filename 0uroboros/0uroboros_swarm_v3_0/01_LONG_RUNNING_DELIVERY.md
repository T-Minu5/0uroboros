# Long-running delivery architecture

## DemoDeliveryRunner

Application-level loop in `src/delivery/runner.ts`. It loads `DemoDeliveryState`, picks the highest-value unresolved objective, may ask Astra for a bounded decision, routes a small specialist set, executes a WorkPackage, validates evidence, promotes locally when safe, tests, captures player-facing evidence, critiques, scores, updates the ledger, and continues.

SDK verification (installed `@openai/agents` 0.17.0, docs 2026):

- `Runner.run` / `run()` is one agent invocation
- `maxTurns` defaults to 10; pass an intentional number or `null`
- `session` persists conversation across runs
- Input may be a `RunState` for human-in-the-loop resume
- Compaction exists; this project historically avoids `Capabilities.default()` because of SDK compaction coupling

Configure `maxTurns` per specialist call. When that call ends, the project runner starts another bounded invocation if delivery state says work remains.

## DemoDeliveryState

Persisted JSON. Astra memory is not the store.

Tracked: mission ID, V3 version, canonical version, milestone, implementation-guide completion, current/completed/blocked WorkPackages, defects, quality-gate and visual-quality state, effect-reference coverage, effect implementation coverage, API spend, model usage, active human decisions, last successful integration, next objective, iteration count, confidence score + evidence, stopping reason.

Write before and after meaningful transitions.

## Iteration governance

```text
MAX_WORKPACKAGE_REPAIR_ATTEMPTS = 3
```

After three failed repairs, Astra must decompose the package. Total delivery iterations are governed by progress, quality, authority, budget, and the 80% checkpoint. Not by "LookDev once" or "Astra three rounds".

Planning-harness caps in `src/swarm/config.ts` remain per planning run so a single SDK session cannot loop forever.

## Context compaction

Astra receives current state plus a bounded evidence packet. Do not resend the whole conversation, canonical library, specialist transcripts, screenshot history, or Resource Library.

`compactDeliveryContext(state)` keeps: next objective, open defects, last critique, score, budget remaining, and file pointers.

## Recovery

Resumable after Cursor close, process interrupt, model/network failure, malformed output, execution failure, and test failure. Failed execution must not erase completed WorkPackages.

## 80% human checkpoint

`AUTONOMOUS_CONFIDENCE_CHECKPOINT = 0.80`

`ReviewCheckpointScore` is a deterministic weighted rubric. Do not ask Astra "are you 80% confident?".

Gates that prevent a pass even if the number is high:

- approved rules changed
- core Runtime broken
- Wave Collapse / Draft sequencing fundamentally broken
- build cannot launch
- catastrophic UX
- required visual/reference evidence never reviewed
- effect-reference work absent
- protected authority violated

When score ≥ 0.80 and no critical blocker: stop with `HUMAN_DIRECTION_CHECKPOINT`. Do not autonomously polish to 100%.

## Budget

Same ceiling: $200 USD. Do not reset. Unknown prior spend is not zero.

Do not optimize for $0. Use models when judgment improves the output. Deterministic code first for tests, arithmetic, diffs, asset enumeration, schema, cost, scoring, and simple transforms.
