# Swarm v2.0 planning runtime

Phases 0-4 only. Astra plans. The TypeScript harness governs. WorkPackages are not executed.

Runtime wire contracts use canonical **snake_case** (`assignment_id`, `work_packages`, `canonical_version`). That matches `0uroboros_swarm_v2_0/schemas`. Do not add a parallel camelCase schema.

Astra emits `AstraSynthesisSchema` (judgment only). The harness adds run IDs, timestamps, queues, freshness, usage, and budget.

The harness keeps four planning-state concepts separate:

- open questions
- dependencies
- human design decisions
- approval-required authority gates

Approval Queue is only for canonical mutation, implementation authorization, destructive work, deployment, tool-authority expansion, or another explicit authority gate. Advisory WorkPackages, design recommendations, and unanswered UX questions stay off that queue.

`specialists_consulted` lists each invoked specialist once by display name. Role IDs stay on `specialist_role_ids` and in specialist artifacts.

Astra can consult Systems / Rules for canonical gameplay meaning. Systems is available, not mandatory. Creative Content/Worldbuilding tasks do not invoke Systems merely because approved mechanics are mentioned. Systems stays reserved for genuine rules-semantic questions, specialist-flagged uncertainty, canonical contradiction, or implementation-versus-canonical comparison. It does not create rules, mutate the Game Contract, or execute WorkPackages. Historical IDs such as `HIST-DECK-4-4-2` cannot override current rules such as `RULE-DECK-001`. Starting-deck mismatch evidence is attached only when the WorkOrder materially touches starting deck, deck setup, card composition, or implementation compliance.

Systems classifications include `CANONICAL_COMPLETENESS_GAP`: approved source material exists, but structured canonical records omitted it. That is a curator repair, not a Mel redesign. `CONTEXT_OMISSION` means the answer already exists in canonical knowledge, but the current specialist packet did not include it. That is a harness repair, not a Mel redesign, and it does not retry a paid call. `RULE_AMBIGUITY` is reserved for questions the design has not answered.

Harness-verified repository observations carry provenance (`evidence_type`, `source`, `source_location`, `verified_by`, `observed_value`, `canonical_ids`, `authority`). `HARNESS_VERIFIED_EVIDENCE` is distinct from a `MODEL_CLAIM`. Astra may dispute interpretation but must not discard the observed value as unsourced. Implementation evidence cannot override approved canonical authority.

`Node Power` is an alias for Node P1 Power and Node P2 Power (`RULE-POWER-005`, `CONTRACT-008`, `UX-NODE-006`). It is not a third authoritative value. The Node center still presents Player A Power, Location, Player B Power vertically.

## Commands

```bash
npm run swarm -- "Plan the first player HUD"
npm run swarm:smoke
npm run swarm:research
npm run swarm:lookdev
npm run swarm:inspect-visuals
npm run swarm:creative
npm run swarm:world-knowledge
npm run swarm:worldbuilding
npm test
npm run typecheck
```

`npm run swarm:smoke` is the live HUD planning objective. `npm run swarm:research` is the curated Shards of Infinity Research validation. `npm run swarm:lookdev` is the advisory Drain-reveal LookDev validation. `npm run swarm:inspect-visuals` is the bounded four-card first-party visual inspection. `npm run swarm:creative` is the one-concept Content + Worldbuilding validation. `npm run swarm:world-knowledge` is the read-only Obsidian vault packet for Node Feratu. `npm run swarm:worldbuilding` is the first Worldbuilding specialist validation against that vault. Live specialist commands need `OPENAI_API_KEY` in `.env`. Vault search uses the installed MCP Connector at `http://127.0.0.1:27200/mcp` and stays read-only.

## Environment

Copy `.env.example` to `.env`. `.env` is gitignored.

Required for live runs:

- `OPENAI_API_KEY`

Optional routing and budgets are listed in `.env.example`. Fallback stays off unless `ALLOW_MODEL_FALLBACK=true`. A fallback run is logged as not Astra. `OBSIDIAN_MCP_URL` and `OBSIDIAN_MCP_TOKEN` are optional. If the token is blank, the harness may read the local MCP Connector plugin settings for the open 0uroboros vault. Do not commit that token.

## Artifacts

Each run writes:

```text
tools/agent-harness/runs/<run-id>/
  manifest.json
  work-order.json
  specialist-results.json
  systems-results.json
  orchestration-result.json
  approval-queue.json
  queues.json
  usage.json
  errors.json
  structured-output-failure.json
  research-results.json
  lookdev-results.json
  content-results.json
  worldbuilding-results.json
  world-knowledge-packet.json
  review-packet.json
  review-result.json
```

That folder is gitignored. Specialists do not write it. The harness writes validated JSON.

## Traces and usage

Agents SDK tracing stays enabled. After a live run, open the OpenAI dashboard Trace viewer.

`usage.json` stores aggregated request and token counts when the SDK exposes them on `RunContext` or `error.state`. If structured-output validation fails, the SDK may redact the Zod path (`Invalid output type: final assistant output did not match the expected schema.`) and omit token counts. The harness does not invent values.

Canonical retrieval prefers `0uroboros_swarm_v2_0/canonical/*.json`. Refresh with `npm run canonical:sync`. `RULE-DECK-001` is 5 Character / 3 Crypto / 2 VP.

## Safety

Planning agents have no shell, filesystem write, Git, or deploy tools. Reviewer is a gated Sol quality-control path. Astra cannot invoke it as a tool and cannot suppress a mandatory review trigger. WorkPackage authority labels are Astra proposals. The harness records `proposed_authority_level` and sets `authority_level` from scope, files, operation, and harness-verified evidence. A correction that would change game code to match a current rule is `IMPLEMENTATION` even if Astra labeled it `ADVISORY`. `IMPLEMENTATION` is not execute-now. Ordinary planning does not call Reviewer. Implementation promotion, canonical mutation, verified-evidence disagreement, authority expansion, genuine canonical conflict, high-impact architecture changes, and an explicit Mel review request do. Reviewer receives a bounded ReviewPacket, writes `review-packet.json` and `review-result.json`, and never executes WorkPackages. `IMPLEMENTATION_MISMATCH` is implementation that does not match a current rule. `CANONICAL_CONFLICT` is only for two current authoritative rules that contradict. PASS is not execution authorization. `MAX_REVIEW_CALLS` defaults to 1. Final `budget_usage.review_calls` is snapshotted after gated review.

Competitive Research is a gated Terra specialist. Astra may invoke it only when external evidence is needed. `EXTERNAL_RESEARCH_EVIDENCE` informs recommendations and cannot override current canonical rules. Official technical documentation may establish external-system facts without becoming project authority. Research has its own call/source/finding budgets (`MAX_RESEARCH_CALLS` defaults to 1). Research output is evidence, observations, and optional recommendations. It does not create WorkPackages or trigger Reviewer by itself. Review packets include only Research evidence IDs the reviewed artifact actually relied on.

LookDev / Motion is a gated Terra specialist. Astra may invoke it when visual design, motion, shaders, card staging, icons, or Wave Collapse presentation is material. `MAX_LOOKDEV_CALLS` defaults to 1. LookDev receives a bounded first-party asset packet plus `VisualReferencePacket`, resolved design-token values, and relevant gameplay-rule excerpts. `FIRST_PARTY_VISUAL_ASSET` outranks external inspiration for visual identity and cannot override gameplay rules. LookDev maps Game Events to Presentation Events. It does not implement, mutate assets, or emit WorkPackages. A LookDev proposal does not trigger Reviewer by itself.

Live first-party visual inspection is a read-only Responses API `input_image` seam on the utility model. It is off unless `VISUAL_INSPECTION_LIVE=true` or `npm run swarm:inspect-visuals`. Maximum four images, one batch, hash cache, no asset mutation. Observations are evidence, not lore.

Content and Worldbuilding are advisory Terra specialists. Content proposes game content inside approved mechanics. Worldbuilding proposes lore and world identity from a bounded Obsidian `WorldKnowledgePacket`. The vault currently holds Mel-authored world story, plotline, and setting lore. It does not currently hold gameplay rules or character-specific canon. Astra may invoke either or both. They do not call each other. Product, UX, and Engineering stay gated off pure creative collaboration. Harness bookkeeping is never specialist work. The harness assigns a shared `concept_id` before they work. Unique concept IDs are capped by `MAX_CREATIVE_CONCEPTS_PER_RUN` (default 5; one-candidate validations use 1 envelope). A required specialist failure is persisted and makes the candidate `INCOMPLETE`. An empty vault match does not. Worldbuilding is read-only against Obsidian. See `docs/content-worldbuilding-handoff.md`.

User-authored Resource Library notes are `USER_CURATED_REFERENCE_GUIDANCE`. They sit above external interpretation for how a reference should be used. They do not override canonical rules. Visual references are usage classifications, not authority.

`VisualReferencePacket` is assembled by the harness/Astra from relevant Resource Library entries and first-party asset IDs only. Research does not instruct LookDev. See `docs/lookdev-boundary.md`.

`RULE-PROB-007` is the approved controlled-weight formula. `RULE-RUNTIME-014` uses it for next-turn reveal priority.

## Execution pilot

Planning still does not execute WorkPackages. `IMPLEMENTATION`, Reviewer PASS, and Astra cannot authorize repository mutation.

V1 execution is a separate harness (`runExecutionHarness`) with one Implementation Executor. Mel must record an explicit `human:` authorization bound to the WorkPackage hash. The executor mutates a staged sandbox copy, never the host tree, and never copies back. The harness, not the model, records the diff and command evidence.

Execution artifacts (gitignored with other run folders):

```text
tools/agent-harness/runs/<run-id>/
  execution-packet.json
  execution-authorization.json
  execution-result.json
  execution-diff.patch
  execution-validation.json
  executor-failure.json
  sandbox-workspace/
```

`EXECUTION_MODEL` defaults to Sol. `MAX_EXECUTION_CALLS` defaults to 1 and does not retry. Do not run the starting-deck correction until Mel authorizes that WorkPackage.
