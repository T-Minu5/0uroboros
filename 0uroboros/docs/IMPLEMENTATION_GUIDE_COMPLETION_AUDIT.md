# IMPLEMENTATION_GUIDE_COMPLETION_AUDIT

Authoritative delivery backlog for completing `0uroboros_swarm_v2_0` against the live game. Authority order: current canonical rules → approved architecture → V2 guidance → implementation evidence → visual references.

Statuses: `COMPLETE` · `PARTIALLY_IMPLEMENTED` · `NOT_IMPLEMENTED` · `SUPERSEDED_BY_CANONICAL` · `DEFERRED_BY_EXPLICIT_SCOPE` · `BLOCKED`

| ID | Source | Section | Requirement | Evidence | Status | Required work | Dependency | Milestone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-MATCH | 01_APPROVED_RULES | Match | 2-player Cycle match, Local seats | `OuroborosGame`, `App.tsx` Local() | COMPLETE | None | — | M4 |
| R-DECK | 01 / canonical | Starting deck 5/3/2 | Slash-Dot, Dash-Dot, Dotkrawler, Rezz-Razor, Rezz-Blade, Byte-Coin x2, Kilo-Coin x1, Vault Encryption x2 | `cards.ts`, `startingDeck.test.ts` | COMPLETE | None | — | M4 |
| R-RUNTIME | 01 | Actions, Node opening 1–3 / 4 / 5 | Engine + HUD | `engine/`, GameTable | COMPLETE | None | — | M5 |
| R-POWER | 01 / CONTRACT-008 | Node Power alias, not a third value | selectors, NodeHeaders | COMPLETE | Keep unobstructed | — | M5 |
| R-COLLAPSE | 01 / 02 | Wave Collapse walk, presentation barrier | collapseTheater, presentationPhase tests | PARTIALLY_IMPLEMENTED | Stronger global selection spectacle still below bar | Visual | M7 |
| R-DRAIN | 01 | Drain / Restore / DC pools | engine + SpatialFx / EffectPath | PARTIALLY_IMPLEMENTED | Filament/shard language in; still needs live polish vs Snap | Visual | M7 |
| R-DRAFT | 01 / 03 | Simultaneous public market, wallet, reward, undo | DraftPanel, draft tests | PARTIALLY_IMPLEMENTED | Themed glass plate over table; not yet a world-space market | Visual | M7 |
| R-BANK | 01 / 03 | Effect Bank + Duration | engine + EffectBankRow overlay | PARTIALLY_IMPLEMENTED | Engine complete; HUD still a strip, not a world object | UX | M8 |
| R-PLAYERVIEW | 02 / 14 | Secret hands | playerView tests | COMPLETE | — | — | M4 |
| R-LOCAL | 02 / AGENTS | Phase 1 Local() | App.tsx | COMPLETE | SocketIO later | — | M4 |
| R-SOCKET | 02 / 12 | Remote SocketIO | deferred in plan | DEFERRED_BY_EXPLICIT_SCOPE | `src/server/index.ts` exists; not demo-gated | Mel | post-M8 |
| R-RNG | 02 | Deterministic Random plugin | game definition | COMPLETE | — | — | M4 |
| R-BARRIER | 02 | Presentation barrier Cycle N | presentationPhase tests | COMPLETE | — | — | M6 |
| R-R3F | 02 / 04 | R3F table | Board3D + visual/* | PARTIALLY_IMPLEMENTED | Arena table + lanes in; quality still trails comps | Visual | M7 |
| R-UX-BOARD-001 | 04 | Five vertical Node regions | Overlay + 3D wells | SUPERSEDED_BY_CANONICAL | Literal columns rejected. Lanes/wells are the approved reading. Geometry may change; five regions remain | Mel visual | M7 |
| R-FONTS | 04 | Inter / Orbitron | styles.css | COMPLETE | — | — | M7 |
| R-COPY | 04 | Sentence case, no em dashes | client copy | COMPLETE | Keep enforcing | — | always |
| R-WORLD | 05 | Cyberpunk + quantum + occult | LookDev tokens, card art | PARTIALLY_IMPLEMENTED | Art carries it; board still quieter than art | LookDev | M7 |
| R-ICONS | 06 / Mel | Use 17 SVG library | icons.tsx + HUD | PARTIALLY_IMPLEMENTED | 8 high-confidence glyphs live. 6 uncertain unused | Content | M7 |
| R-ART | assets | First-party card art | cardArt.ts + CardFace | PARTIALLY_IMPLEMENTED | Starter identities use art. Vault Encryption still has no file | Art | M7 |
| R-BOARDART | assets | Game-board concept art | `assets/gameboard concept art/` empty | BLOCKED | Folder exists, 0 files. Cannot treat as FIRST_PARTY_VISUAL_ASSET until Mel adds files | Mel | M7 |
| R-SPIKE | 14 | boardgame.io ADR | adopted in repo | COMPLETE | Spike brief remains historical | — | M3 |
| R-HARNESS | 15–19 | Astra runtime, evals, sequence | `src/swarm/*` | PARTIALLY_IMPLEMENTED | Harness exists. Production execution org not the demo gate | Swarm | parallel |
| R-DEFER | 12 | Short-Circuit, audio, membership, Chaos no-repeat, final art | documented | DEFERRED_BY_EXPLICIT_SCOPE | Do not pull in | Mel | V2+ |
| R-FX-COVERAGE | plan / matrix | Broader effect catalog | DEMO_EFFECT_COVERAGE_MATRIX | PARTIALLY_IMPLEMENTED | Starters covered. Market identities beyond starters incomplete | Content | M8 |
| R-M8 | plan | Demo hardening | playtest defects remain | NOT_IMPLEMENTED | Split-view drift, drag automation, unused Actions in Draft | QA | M8 |
| R-TECH-INT | 02 | Visual architecture may change without rule change | visual/* refactor this mission | COMPLETE | No rule changes | — | M7 |

## Totals (material rows above)

- Total: 24
- COMPLETE: 11
- PARTIALLY_IMPLEMENTED: 8
- NOT_IMPLEMENTED: 1
- DEFERRED_BY_EXPLICIT_SCOPE: 2
- SUPERSEDED_BY_CANONICAL: 1
- BLOCKED: 1

## This mission advanced

Visual architecture (`TableVisual`, `NodeLaneVisual`, `CardVisual`, `LocationVisual`, `DataCenterVisual`, `CollapseVisual`, `LightingRig`, `EffectPath`), icon HUD, art-first cards, Draft glass plate, HUD compaction so the table can occupy the seat, Collapse particle/ring field, no approved rule changes.
