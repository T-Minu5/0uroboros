# V3 implementation source map

Built for `0uroboros_implementation_v3_0` (2026-09-10). Paths are absolute under the repo unless noted.

## Canonical rules

| Source | Role |
| --- | --- |
| `../0uroboros_agent_docs_v0.1/` | External product/rules canon |
| `0uroboros_swarm_v2_0/01_APPROVED_RULES.md` + `canonical/` | In-repo RULE-* authority |
| `0uroboros_implementation_v3_0/` | Product constitution + acceptance (no rule changes) |

## Engine / content

| Path | Note |
| --- | --- |
| `src/game/` | boardgame.io authority; phases `circuit` ↔ `draft` |
| `src/game/content/cards.ts` | STARTING_DECK 5/3/2 |
| `src/game/engine/*` | deploy, reveal, collapse, draft, fx |

## First-party visuals

| Path | Count / note |
| --- | --- |
| `assets/gameboard concept art/` | 9 PNGs — layout authority |
| `assets/card_art/` | ~77 PNGs base + chaos |
| `assets/Icons/` | 14 SVGs (priority, action, crypto, power, …) |
| `assets/Interface Elements/` | HUD reference |
| `assets/effect_animations/` | 47 webps — **reference only** |
| `src/client/visual/art/` | Runtime JPEG crops of concept |

## References

| Path | Note |
| --- | --- |
| `0uroboros_swarm_v2_0/06_RESOURCE_LIBRARY.md` | Snap/HS URLs + Three.js technique URLs |
| `docs/VISUAL_REFERENCE_REVIEW_LEDGER.md` | Transfer principles |
| `0uroboros_swarm_v3_0/EFFECT_REFERENCE_REGISTRY.json` | Inspected effect refs |
| `docs/EFFECT_TECHNIQUE_LIBRARY.md` | Technique → product FX IDs |

## Frontend

| Path | Note |
| --- | --- |
| `src/client/GameTable.tsx` | Orchestrator |
| `src/client/board/` + `visual/` | R3F table / Nodes / FX |
| `src/client/hud/` | Node column, hand, draft, flight |
| `src/client/presentation/` | Snap sequencing + timing |

## Tests / harness

| Path | Note |
| --- | --- |
| `tests/gameLoop.test.ts` | Multi-Cycle spine |
| `tools/agent-harness/delivery/` | Usage ledger; ~$100 of $200 spent |
| `src/delivery/` | Autonomous runner **not** primary for this phase |

## Strategy lock

Retain engine + presentation queue. Elevate default product look toward concept art. Targeted specialists only. No LIVE_OPENAI autonomous burn.
