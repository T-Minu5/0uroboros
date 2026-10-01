# OpenAI Agent Runtime Architecture

## Current SDK primitives used by the design

Official current TypeScript Agents SDK documentation supports Agent, manager pattern via agents-as-tools, code orchestration, structured outputs via Zod/supported schemas, function tools, guardrails, maxTurns, built-in tracing, RunContext usage, human-in-the-loop interruptions/resume, and Sandbox Agents.

Sandbox Agents are currently beta. Use them only behind the execution boundary.

## Layer 1: Application Harness

Deterministic authority:
- env/model config
- WorkOrder creation
- canonical context retrieval
- schema validation
- specialist registration
- tool permissions
- RunBudget
- invocation counters
- queue routing
- staleness/ID checks
- approval policy
- artifact persistence
- usage capture
- retry/error policy
- canonical mutation gates

## Layer 2: Astra

Astra provides executive planning intelligence: decomposition, specialist choice, synthesis, WorkPackages, approval identification, and ordinary cross-domain tradeoffs. Astra does not enforce the constitution.

## Manager pattern

Eventually Astra may expose registered advisory tools for Product, UX, Engineering, Systems, LookDev, Content, Worldbuilding, Research and Reviewer. The first runtime exposes only Product, UX and Engineering.

Specialists receive no specialist agent-tools.

## Structured specialist calls

The harness validates SpecialistAssignment before specialist invocation and validates SpecialistResponse after it. If `agent.asTool()` requires a compact single input parameter, serialize the validated assignment without abandoning application-side contracts. Preserve assignment IDs in local context/artifacts.

## Guardrails

Use deterministic governance first. SDK guardrails can complement input/output/tool safety. Do not rely on nested specialist agent-tools to enforce proposal budgets or authority because current SDK documentation does not expose ordinary function-tool guardrail options directly on `agent.asTool()`.

## Human-in-the-loop

Approval-required tools can interrupt a run and resume from RunState. Use this naturally for canonical patch application, destructive execution, deployment, or future broad authority. Planning-only Phase 1 has no mutation tools, so most approvals occur as application gates after synthesis.

## Sandbox Agents

Use only for approved execution requiring filesystem/shell/workspace. Scope paths/tools/tests through WorkPackage. Do not use as default Product/UX/Rules workers.

## Tracing

Keep built-in SDK tracing enabled by default. Local run artifacts add governance metadata without replacing OpenAI traces.

## Usage

Record actual SDK usage. RunContext exposes aggregated usage. Do not invent exact per-agent token attribution when unavailable.

## Skills

Skills are reusable procedures/references, not authority-bearing reasoning identities. Likely useful skill categories include 0uroboros rules retrieval, proposal governance, Game Contract procedure, canonical curation, boardgame.io knowledge, Three.js conventions, and competitive research procedure.

Do not create a separate agent when a reusable skill is sufficient.

Build-time coding-agent skills such as `agents-sdk` and `openai-docs`, when available in the development environment, are aids for implementing the harness and should not automatically become runtime specialist agents.
