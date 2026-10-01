# Human direction checkpoint — V3 Implementation

**Play first:** http://127.0.0.1:5176/  
Look capture (Node HUD now stays visible): http://127.0.0.1:5176/?look=1  
Evidence: `tools/agent-harness/delivery/evidence/v3-implementation/`  
Source map: `docs/v3-implementation-source-map.md`  
Guide: `0uroboros_implementation_v3_0/`

## Development architecture / process

- **Astra (Cursor-led)** owns strategy. No LIVE_OPENAI autonomous burn this phase.
- **Retain** authoritative `src/game` + presentation queue / Collapse script / drag=deploy click=inspect.
- **Replace / elevate** default product look, Node plaque density, causal FX language, concept-informed table/wells, Collapse spectacle.
- **Specialists:** Cursor explore ×3 (source map), Cursor generalPurpose (multi-cycle evidence + independent UX/LookDev critique). OpenAI LookDev CLI blocked by sandbox `tsx` IPC; critique ran via Cursor Task (`gpt-5.6-sol-medium`).
- **Deterministic:** Vitest multi-Cycle + typecheck after each package.

## Retained / discarded

| Keep | Discard / de-prioritize |
| --- | --- |
| Approved rules + engine + Vitest spine | LIVE_OPENAI autonomous as quality driver |
| Presentation queue, Snap Node gaps, HS deploy keyframes | Diagnostic `FROM` / `TO ·` HUD labels as primary causality |
| First-party card art + icon wiring | Shipping effect webps |
| Theme firewall (Snap/HS principles only) | Look mode hiding `.node-heads` |
| Hybrid R3F board + projected Node column | Treating file-count scores as checkpoint |

## Agents / models / API

| Agent | Model | Role |
| --- | --- | --- |
| Astra (this session) | Cursor Composer | Strategy + implementation |
| Explore ×3 | composer-2.5-fast | Source map |
| Multi-cycle harness | composer-2.5-fast | Engine Cycle 1→3 proof |
| Independent UX/LookDev | gpt-5.6-sol-medium | Critique (no rubber-stamp) |

**OpenAI project budget:** ceiling $200; known prior spend ~$100.06 unchanged this session (no new OpenAI swarm calls completed). Cursor Task usage is separate from that ledger.

## Rule integrity

- No approved rules changed.
- `tests/multiCycleEngine.test.ts` + `tests/gameLoop.test.ts` pass (33 focused tests).
- Full suite: 549/550 (1 unrelated swarm sandbox dirty-git flake).

## Multi-Cycle validation

`multi-cycle-engine.json`: **pass**, `cyclesReached: 3`, deployments 3/3, phases Runtime→Collapse→Draft×2 then Cycle 3 start.

Browser playthrough script: `scripts/v3-browser-validate.mjs` (Chrome channel). Agent sandbox could not complete live screenshots (Chrome SIGABRT). **Mel: the live URL is the authoritative visual evidence.**

## Board concept influence

Concept art (`assets/gameboard concept art/Best Layout and design/`): magenta world rim, cyan Node pad outlines, player-edge bar, octagon slab, flanking pylons, city backdrop. Implemented in `TableVisual.tsx` + `LocationVisual.tsx` + arena JPEGs. Still lighter than concept industrial framing (known shortcoming).

## Card art and icons

- Hand/board/inspect use `lookdev/cardArt.ts` first-party PNGs.
- Icons via `visual/icons.tsx` + `assets/Icons/` (priority, action, crypto, power, …).

## Snap sequencing (visible in build)

- One presentation event at a time (`usePresentationQueue`).
- Collapse Node-ordered with `collapseNodeGapMs: 800`.
- Local beats on Node; global on Collapse theater.
- Tuned down from over-long holds so multi-Cycle stays human-playable.

## Hearthstone motion weight (visible in build)

- Deploy: deeper windup → travel → contact squash → settle (`CardFlightOverlay`, `cardDeployMs: 1080`).
- Causal target: expanding impact ring + burst (`TargetImpact` in `EffectPath.tsx`).
- Board cards retain source windup / hit punch in `CardVisual`.

## Animation reference → original effect

| Reference | Principle | Original implementation |
| --- | --- | --- |
| `fx-05.webp` Drawing Lines | Liquid spiral converge | `CollapseVisual` TubeGeometry spirals + particle attractor |
| `fx-12-occult.webp` | Dual-bar ritual glyph | `FxMark` SigilMark SVG |
| `fx-11-quantum.webp` | Nested field scan | `FxMark` InterferenceMark |
| Board concept PNGs | Magenta rim / cyan pads | `TableVisual` / `LocationVisual` |

## Three.js technique → original effect

| Technique URL | Learned | Original |
| --- | --- | --- |
| wavy-cubes / ScanEffect | Vertex displace + scan | `WaveField.tsx` GLSL + singularity core |
| GeometryPainter / line trace | Causal path | `EffectPath` CatmullRom Line + bolt |
| Particle/singularity notes | Inward attractor | `CollapseVisual` points + spirals |

Provenance: `src/client/visual/fx/provenance.json`.

## Strongest independent criticisms (post first pass; addressed in second)

1. Node gestalt layered not unified — **partial:** softer plaque, cyan wells, Power enlarged; still dual 2D/3D.
2. Concept influence superficial — **partial:** stronger rim/pads/edge bar; industrial depth still short.
3. FROM/TO diagnostic FX — **fixed:** removed; source pulse + path + TargetImpact + result label only.
4. Power not proven unobstructed — **improved:** 2.35rem display gems; Mel must verify populated Nodes.
5. Look mode hid Node relationship — **fixed:** `.node-heads` remain visible in `?look=1`.

## Remaining shortcomings

- Concept-art material depth and portal framing not matched.
- Populated 4v4 Node readability needs Mel eyes (no fresh agent screenshots).
- Draft is usable and themed lightly; not yet a full world immersion.
- Collapse spectacle improved but not Tier-4 singularity cinema.
- One swarm execution test flakes on dirty git host.

## Mel should test (5)

1. Drag a Character onto a Node — anticipation → contact → settle?
2. Default play: can you read opponent Power / Location / local Power as one Node column without HUD sludge?
3. Trigger a local Drain/probability FX — causality without FROM/TO chrome?
4. Pace Fast through Collapse → Draft → End Draft → Cycle 2 hand deal.
5. Side-by-side with concept art at 1440×900 — same product world, or still a prototype table?

## Astra confidence

Approximately **80% that the direction is coherent enough for Mel to judge** (not DEMO_READY). Hard gates pass on rules + multi-Cycle engine + UX contracts + original effects + first-party assets. Visual craft is intentionally incomplete vs concept art; remaining work is refinement, not whether the product is the right game.
