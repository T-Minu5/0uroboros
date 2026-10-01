# 0uroboros Swarm v2.0

## OpenAI Agent Runtime Architecture

Swarm v2.0 preserves the approved game rules, Product/Technical requirements, Game Contract, UX/LookDev system, World Bible, resource library, canonical IDs, proposal governance, Curator workflow, Boardgame.io bootstrap gate, staleness rules, conflict escalation, deterministic RNG requirements, and other institutional knowledge from v1.1.

The architectural upgrade is concrete runtime ownership:

```text
HUMAN / MEL
    ↓
APPLICATION HARNESS
Deterministic governance and routing
    ↓
GPT-6 ASTRA
Executive planner / manager
    ↓
Bounded advisory specialists as tools
    ↓
ASTRA SYNTHESIS
    ↓
DETERMINISTIC GOVERNANCE / QUEUES / HUMAN GATES
    ↓
AUTHORIZED WORK PACKAGE
    ↓
SANDBOXED EXECUTION AGENTS, only when approved
    ↓
TEST / QA / PROMOTION
```

## Core principle

**Astra provides intelligence. Application code provides enforcement.**

The TypeScript harness owns schema validation, proposal limits, canonical ID validation, authority checks, staleness, duplicate checks, queue routing, invocation budgets, max-turn policy, tool permissions, human-approval requirements, retry limits, run logging, token/usage capture, model routing, and canonical mutation gates. Astra cannot bypass these controls.

## Default OpenAI collaboration pattern

Planning uses the OpenAI Agents SDK manager pattern:

```text
Astra → registered specialist agents exposed as tools → Astra synthesis
```

Use `agent.asTool()` where the installed SDK supports the intended tool shape. Avoid unrestricted handoff chains for the core planning runtime. Deterministic TypeScript handles workflow transitions that do not need model judgment.

## Minimum runtime first

Activate only:
- Astra
- Product Lead
- UX Lead
- Lead Engineering

Prove manager-style delegation, structured contracts, model routing, proposal limits, run budgets, tracing, usage capture, canonical context retrieval, queue routing, and a human gate before adding the broader advisory organization or execution agents.

## Source-of-truth hierarchy

1. Approved Rules / Game Rules
2. Product Requirements / Technical Requirements
3. Design System / LookDev Requirements
4. World Bible / Theming / Naming System
5. Resource Library / Reference Examples
6. Agent Suggestions / Exploratory Proposals

Lower levels can inspire changes but never silently override higher levels.

## Promotion sequence

```text
Discovery / task
  ↓
Astra planning
  ↓
Bounded specialist consultation
  ↓
Structured candidate
  ↓
Deterministic pre-checks
  ↓
Optional review
  ↓
Astra synthesis
  ↓
Human approval when required
  ↓
Authorized WorkPackage
  ↓
Sandboxed execution when appropriate
  ↓
Tests / QA / review
  ↓
Promotion
  ↓
Canonical patch if knowledge changed
  ↓
Deterministic Curator pipeline
```

Not every task uses every stage.

## Package map

Existing institutional knowledge:
- `01_APPROVED_RULES.md`
- `02_PRODUCT_TECH_REQUIREMENTS.md`
- `03_GAME_CONTRACT.md`
- `04_UX_LOOKDEV_DESIGN_SYSTEM.md`
- `05_WORLD_BIBLE_GUIDANCE.md`
- `06_RESOURCE_LIBRARY.md`
- `12_DEFERRED_V2.md`
- `14_BOARDGAME_IO_SPIKE.md`

Agent operating system:
- `07_AGENT_CHARTERS.md`
- `08_AUTHORITY_MATRIX.md`
- `09_PROPOSAL_SCHEMA.md`
- `10_ORCHESTRATION.md`
- `13_CURATOR_CANONICAL_WORKFLOW.md`
- `15_OPENAI_AGENT_RUNTIME.md`
- `16_MODEL_ROUTING.md`
- `17_AGENT_TOOL_PERMISSIONS.md`
- `18_EVALUATION_PLAN.md`
- `19_IMPLEMENTATION_SEQUENCE.md`
- `20_ARCHITECTURE_QA.md`

Schemas:
- `schemas/proposal.schema.json`
- `schemas/game-contract.ts`
- `schemas/agent-runtime.schema.json`
- `schemas/work-package.schema.json`

## Verified OpenAI guidance

This architecture was reconciled against current official OpenAI documentation for the TypeScript Agents SDK, manager/agents-as-tools orchestration, structured schemas, max turns, tracing, RunContext usage, human approvals/interruptions, guardrails, and Sandbox Agents. Implementation syntax must still be verified against the installed SDK types when coding begins.

Official references:
- https://openai.github.io/openai-agents-js/
- https://openai.github.io/openai-agents-js/guides/multi-agent/
- https://openai.github.io/openai-agents-js/guides/tools/
- https://openai.github.io/openai-agents-js/guides/schemas/
- https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- https://openai.github.io/openai-agents-js/guides/tracing/
- https://openai.github.io/openai-agents-js/guides/sandbox-agents/
- https://developers.openai.com/api/docs/models/gpt-6-astra
