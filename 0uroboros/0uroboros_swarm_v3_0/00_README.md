# 0uroboros Swarm v3.0

V3 is the current implementation and delivery package. V2 remains a historical architectural milestone at `0uroboros_swarm_v2_0/`.

V3 does not change approved gameplay. Canonical rules stay in V2 `01_APPROVED_RULES.md` and `0uroboros_agent_docs_v0.1/`. If a V2 implementation sentence conflicts with current canonical rules, V2 implementation is superseded. Canon is not rewritten for convenience.

## What changed from V2

The runner, not one model response, owns the long horizon.

```text
goal → assess → choose highest-value work → delegate → implement
→ run → observe → critique → compare to quality bar → repair
→ update plan → repeat
```

OpenAI Agents SDK loops (`run()`, `maxTurns` default 10, Sessions, RunState) are bounded model invocations. They are not the project delivery loop. A specialist `finalOutput` does not mean the mission is complete.

## Authority

1. Approved game rules (external)
2. Authority matrix / protected paths
3. This V3 operating package
4. Living `DEMO_DELIVERY_PLAN` in `src/delivery/plan.ts`
5. Persisted `DemoDeliveryState` (harness, not Astra memory)

Hard fence: no rule invention, no automatic Obsidian writes, no git push, no production deploy, no destructive git, no external credential changes. Protected files stay protected except an explicit approved mutation class.

## Current architecture

- Game: boardgame.io, `Local()` Phase 1, `src/game` authority, `playerView` for secrets
- Client: R3F board + HUD overlay. Presentation may not invent rules
- Planning swarm: `src/swarm/*` (Astra tools, sandbox, evals)
- Delivery loop: `src/delivery/*` (`DemoDeliveryRunner`)

## Launch autonomous delivery

```bash
npm run delivery -- assess
npm run delivery -- step
npm run delivery -- batch --iterations 4
npm run delivery -- autonomous
```

`assess` is read-only and returns. `step` is one iteration. `batch` (and legacy `loop`) is a bounded debug run and may return with `stop_reason = NONE`. `autonomous` is production long-run mode: it continues until a valid stop. Returning with `NONE` is a harness failure, not success.

State: `tools/agent-harness/delivery/state.json`  
Heartbeat: `tools/agent-harness/delivery/heartbeat.json`  
Ledger: `tools/agent-harness/delivery/ledger.json`

Resume after Cursor close, process interrupt, model failure, or test failure by running `npm run delivery -- autonomous`. Do not assume hours of work live in one model turn.

Stop only for: `HUMAN_DIRECTION_CHECKPOINT` (score ≥ 0.80 and no critical gate), `BUDGET_LIMIT`, `HUMAN_RULE_DECISION_REQUIRED`, `AUTHORITY_BLOCK`, `UNRECOVERABLE_TECHNICAL_BLOCKER`, `USER_CANCELLED`.

Ordinary test failures, weak LookDev, Reviewer REVISE, and shader bugs require another iteration.

## Documents

| File | Topic |
| --- | --- |
| `V2_TO_CURRENT_STATE_AUDIT.md` | Why V3 exists |
| `01_LONG_RUNNING_DELIVERY.md` | Runner, state, compaction, recovery |
| `02_IMPLEMENTATION_ROADMAP.md` | Remaining work, demo definition |
| `03_VISUAL_UX_EFFECTS.md` | Board, cards, effects, quality bar |
| `04_AGENT_ROUTING.md` | Astra vs specialists vs deterministic code |
| `05_EXECUTION_SAFETY.md` | Sandbox, tests, promotion |
| `06_REFERENCE_EVIDENCE.md` | First-party, Examples of Good, effect refs |
| `EFFECT_REFERENCE_REGISTRY.json` | Inspected effect-animation references |
| `backlog.json` | Completion matrix |
| `schemas/delivery-state.schema.json` | Persisted state shape |

Local demo: `npm run dev` then `http://localhost:5176/?look=1` (Vite may already be on 5176).
