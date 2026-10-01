# Implementation Sequence

## Phase 0: Repo and SDK verification
1. Inspect repository/package manager/TypeScript/test conventions.
2. Verify current `@openai/agents` and Zod.
3. Inspect installed TypeScript declarations.
4. Use coding-agent skills `agents-sdk` / `openai-docs` when available.
5. Verify current model IDs/settings against official docs.

## Phase 1: Deterministic harness skeleton
Implement env validation, central model router, RunBudget, WorkOrder/SpecialistAssignment/SpecialistResponse/OrchestrationResult schemas, canonical context retrieval, run artifacts, queue types, usage manifest, tracing config. Offline tests first.

## Phase 2: Minimal manager runtime
Activate Astra + Product + UX + Lead Engineering. Expose specialists to Astra as agent tools. Prove conversation ownership, structured results, no recursion, proposal limits, invocation budget, maxTurns, routing, artifacts and usage.

## Phase 3: Human gate
Produce structured OrchestrationResult/WorkPackages and approval routing. No execution yet.

## Phase 4: Evaluation suite
Run authority, budget, recursion, staleness, fallback, contract and review-gating evals.

## Phase 5: Expand advisory organization
Add Systems, Research, LookDev, Content, Worldbuilding and gated Reviewer only after Phase 1–4 reliability.

## Phase 6: Execution pilot
Introduce one narrowly scoped SandboxAgent/equivalent execution worker for a harmless tooling/test WorkPackage. Validate scope, approval, filesystem boundary, tests and Execution Result Queue.

## Phase 7: Production execution organization
Add specialized execution roles only when repeated WorkPackage types justify them. Avoid agent proliferation.
