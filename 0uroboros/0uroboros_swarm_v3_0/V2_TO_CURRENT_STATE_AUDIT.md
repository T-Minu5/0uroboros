# V2_TO_CURRENT_STATE_AUDIT

Audit date: 2026-09-08. V2 package was re-read as files, not from memory summaries. V2 is not overwritten. Canonical rules stay in `0uroboros_swarm_v2_0/01_APPROVED_RULES.md` and `0uroboros_agent_docs_v0.1/`.

Statuses: `CURRENT_AND_RELEVANT` · `CURRENT_BUT_NEEDS_V3_REFRAMING` · `IMPLEMENTED` · `PARTIALLY_IMPLEMENTED` · `NOT_IMPLEMENTED` · `SUPERSEDED_BY_NEWER_CANONICAL` · `SUPERSEDED_BY_NEWER_ARCHITECTURE` · `HISTORICAL_ONLY`

## Source inventory (complete V2 package)

| Path | Role |
| --- | --- |
| `00_README.md` | Operating model: Astra intelligence, TypeScript enforcement |
| `01_APPROVED_RULES.md` | Approved gameplay semantics |
| `canonical/rules.json` | Structured rule IDs |
| `canonical/world.json` | World IDs |
| `canonical/design-system.json` | Design IDs |
| `canonical/tech-requirements.json` | Tech IDs |
| `02_PRODUCT_TECH_REQUIREMENTS.md` | Product and technical requirements |
| `03_GAME_CONTRACT.md` | Contracts / invariants |
| `04_UX_LOOKDEV_DESIGN_SYSTEM.md` | UX, LookDev, visual system |
| `05_WORLD_BIBLE_GUIDANCE.md` | World guidance |
| `06_RESOURCE_LIBRARY.md` | References, 3JS technique URLs, competitive videos |
| `07_AGENT_CHARTERS.md` | Specialist charters |
| `08_AUTHORITY_MATRIX.md` | Who may mutate what |
| `09_PROPOSAL_SCHEMA.md` | Proposal contracts |
| `10_ORCHESTRATION.md` | Planning sequence |
| `11_EXTERNAL_REVIEW_BRIEF.md` | External review |
| `12_DEFERRED_V2.md` | Explicit deferrals |
| `13_CURATOR_CANONICAL_WORKFLOW.md` | Canonical mutation |
| `14_BOARDGAME_IO_SPIKE.md` | boardgame.io ADR |
| `15_OPENAI_AGENT_RUNTIME.md` | SDK Runner, tools, tracing |
| `16_MODEL_ROUTING.md` | Astra / Terra / Sol / Luna |
| `17_AGENT_TOOL_PERMISSIONS.md` | Tool fence |
| `18_EVALUATION_PLAN.md` | Evals |
| `19_IMPLEMENTATION_SEQUENCE.md` | Milestone sequence |
| `20_ARCHITECTURE_QA.md` | Architecture Q+A |
| `schemas/*` | Runtime schemas |
| `CHANGELOG.md` | V2 history |

## Package-level verdict

V3.0 is warranted. V2 remains a valid historical architectural milestone. The operating model has changed from one planning pass plus optional sandbox execution to a long-running delivery loop owned by a deterministic runner. V2 rules, authority, and Resource Library stay current. V2 does not describe DemoDeliveryRunner, persisted DemoDeliveryState, an 80% human checkpoint rubric, effect-reference-as-inspiration-only, or per-WorkPackage repair instead of global LookDev/Astra round caps.

No V2 prose said "LookDev may run once" or "Astra gets three rounds" as a program constraint. Those caps live in `src/swarm/config.ts` (`MAX_LOOKDEV_CALLS=1`) and planning reconcile (three Astra rounds). V3 reframes them as per-task anti-loop, not global delivery limits.

## File classifications

| Item | Status | Notes |
| --- | --- | --- |
| `01_APPROVED_RULES.md` + `canonical/rules.json` | CURRENT_AND_RELEVANT | External authority. V3 must not rewrite semantics. |
| `canonical/world.json` | CURRENT_AND_RELEVANT | World IDs |
| `canonical/design-system.json` | CURRENT_AND_RELEVANT | Design IDs |
| `canonical/tech-requirements.json` | CURRENT_AND_RELEVANT | Tech IDs |
| `03_GAME_CONTRACT.md` | CURRENT_AND_RELEVANT | Contracts remain |
| `08_AUTHORITY_MATRIX.md` | CURRENT_AND_RELEVANT | Fence stays |
| `12_DEFERRED_V2.md` | CURRENT_AND_RELEVANT | Still deferred unless Mel opens |
| `13_CURATOR_CANONICAL_WORKFLOW.md` | CURRENT_AND_RELEVANT | Canonical writes still gated |
| `16_MODEL_ROUTING.md` | CURRENT_AND_RELEVANT | Luna/Terra/Sol/Astra mapping still right |
| `17_AGENT_TOOL_PERMISSIONS.md` | CURRENT_AND_RELEVANT | No git push, no Obsidian write, no deploy |
| `18_EVALUATION_PLAN.md` | CURRENT_AND_RELEVANT | Evals still apply |
| `20_ARCHITECTURE_QA.md` | CURRENT_AND_RELEVANT | Q+A still useful |
| `00_README.md` operating diagram | CURRENT_BUT_NEEDS_V3_REFRAMING | Still true for planning. Missing delivery loop |
| `02_PRODUCT_TECH_REQUIREMENTS.md` | CURRENT_BUT_NEEDS_V3_REFRAMING | Many items implemented; visual bar and effects production need V3 process |
| `04_UX_LOOKDEV_DESIGN_SYSTEM.md` | CURRENT_BUT_NEEDS_V3_REFRAMING | UX-BOARD-001 five columns superseded as literal 3D columns. Lanes/wells remain |
| `05_WORLD_BIBLE_GUIDANCE.md` | CURRENT_AND_RELEVANT | Theme modifies vocabulary, not rules |
| `06_RESOURCE_LIBRARY.md` | CURRENT_BUT_NEEDS_V3_REFRAMING | URLs current. V3 requires operable evidence, not a list |
| `07_AGENT_CHARTERS.md` | CURRENT_BUT_NEEDS_V3_REFRAMING | Astra is delivery manager, not default implementer |
| `09_PROPOSAL_SCHEMA.md` | CURRENT_AND_RELEVANT | Planning harness still uses it |
| `10_ORCHESTRATION.md` | CURRENT_BUT_NEEDS_V3_REFRAMING | One-pass planning is not the delivery loop |
| `11_EXTERNAL_REVIEW_BRIEF.md` | HISTORICAL_ONLY | Optional; not the 80% checkpoint |
| `14_BOARDGAME_IO_SPIKE.md` | HISTORICAL_ONLY | ADR adopted. Local() Phase 1 remains |
| `15_OPENAI_AGENT_RUNTIME.md` | CURRENT_BUT_NEEDS_V3_REFRAMING | SDK `maxTurns` default 10 must not end the project. Sessions/RunState exist in `@openai/agents` 0.17.0. Project runner is separate |
| `19_IMPLEMENTATION_SEQUENCE.md` | PARTIALLY_IMPLEMENTED | Runtime slice exists. Visual/effects/M8 incomplete |
| `schemas/*` | CURRENT_AND_RELEVANT | Keep. V3 adds delivery-state schema |

## Requirement classifications (operative)

| Requirement | Status |
| --- | --- |
| 2p Cycle match, Local seats, playerView | IMPLEMENTED |
| Starting deck 5/3/2, unshuffled Cycle 1 | IMPLEMENTED |
| Circuit / Reveal / Collapse / Draft engine | IMPLEMENTED |
| Presentation barrier: Draft after Collapse walk | PARTIALLY_IMPLEMENTED | Engine jumps to draft. Client can hide Draft forever if leftover `revealQueue` blocks theater |
| Draft overlay visible to player | NOT_IMPLEMENTED | Player-facing defect this mission |
| Secret hands | IMPLEMENTED |
| Drain / Restore / DC / probability | PARTIALLY_IMPLEMENTED | Engine yes. Storytelling FX incomplete |
| Effect Bank + Duration HUD | PARTIALLY_IMPLEMENTED |
| R3F table + first-party card art | PARTIALLY_IMPLEMENTED | Arena table exists. Concept art folder is no longer empty |
| High-confidence icons in HUD | PARTIALLY_IMPLEMENTED | 8 of 17 live |
| Click inspect, drag does not inspect | IMPLEMENTED |
| Competitive visual bar (Snap / StS) | NOT_IMPLEMENTED | Below bar |
| Effect-animation Assets as inspiration only | CURRENT_AND_RELEVANT | V3 makes this explicit. Must not ship webps |
| 3JS technique URLs as code study | CURRENT_BUT_NEEDS_V3_REFRAMING | Listed. Not yet driving shaders |
| $200 API ceiling, not reset | CURRENT_AND_RELEVANT | Prose in plan. No USD ledger until V3 |
| Sandbox execution, no copy-back by default | IMPLEMENTED | Planning harness |
| Local promotion of validated diffs | PARTIALLY_IMPLEMENTED | V1 executor exists. Delivery runner must own loop |
| No git push / deploy / Obsidian write | CURRENT_AND_RELEVANT | |
| DEMO_READY declaration | NOT_IMPLEMENTED | Mel only |
| Long-running DemoDeliveryRunner | NOT_IMPLEMENTED | V3 |
| DemoDeliveryState persistence | NOT_IMPLEMENTED | V3 |
| AUTONOMOUS_CONFIDENCE_CHECKPOINT 0.80 | NOT_IMPLEMENTED | V3 |
| Global LookDev-once / Astra-three-rounds as delivery cap | SUPERSEDED_BY_NEWER_ARCHITECTURE | Keep as per-WorkPackage anti-loop |
| UX-BOARD-001 as five literal columns | SUPERSEDED_BY_NEWER_CANONICAL | Five regions as lanes/wells |
| Board concept art folder empty | SUPERSEDED_BY_NEWER_ARCHITECTURE | Folder now has first-party PNGs. JPEGs in `src/client/visual/art/` |

## V3 decision

Publish `0uroboros_swarm_v3_0` as the current implementation/delivery package. Point at V2 for approved rules. Do not copy canonical rule text into V3.
