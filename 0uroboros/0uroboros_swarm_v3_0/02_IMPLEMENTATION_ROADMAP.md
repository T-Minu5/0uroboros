# Implementation roadmap

Living plan: `src/delivery/plan.ts` (`currentDemoDeliveryPlan()`).  
Completion audit: `docs/IMPLEMENTATION_GUIDE_COMPLETION_AUDIT.md` (historical M7 snapshot; V3 backlog is `backlog.json`).

## Current milestone

`M7_VISUAL_BAR` still active. `DEMO_READY` is Mel-only.

## Remaining high-leverage work (ordered)

1. Draft overlay actually mounts after Collapse theater (player-facing)
2. Card flight overlay always unhides (`onDone` on cancel)
3. Effect-reference registry + original SVG / R3F / shader families
4. Board concept art influencing table architecture (folder is populated)
5. Local Card/Location resolution storytelling (source → path → target → result)
6. Duration / Effect Bank as a world object
7. Broader effect coverage beyond starters (`DEMO_EFFECT_COVERAGE_MATRIX`)
8. M8 hardening: split-view drift, unused Actions during Draft, Vault Encryption art

## Definition of a reviewable demo

A recognizable 0uroboros table playable for several Cycles, with:

- Circuit deploy, reveal, Collapse, Draft, next Cycle
- Draft visible after Collapse
- First-party card art and high-confidence icons
- Original effects inspired by references (references not shipped)
- No approved rule changes

Not required for the 80% checkpoint: SocketIO, full market catalog, audio, membership, Chaos no-repeat, production hosting.

## Dependencies

- Rules: V2 `01` / agent docs
- Transport: Local() until Mel opens remote
- Visual: first-party art, icons, concept PNGs, effect refs as inspiration
- Delivery: this runner + tests before trusting a long loop
