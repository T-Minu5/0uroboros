# OpenAI Runtime Orchestration

## Intelligence vs governance

Astra/specialists provide judgment. TypeScript application code enforces validation, authority, limits, routing, approvals, permissions, versions, retries, logging and canonical mutation gates.

## Core planning flow

```text
User objective
  ↓
Harness validates input and creates WorkOrder + RunBudget
  ↓
Astra plans
  ↓
Astra invokes only relevant registered specialist agent-tools
  ↓
Specialists return structured responses
  ↓
Harness validates responses and budgets
  ↓
Astra synthesizes
  ↓
Harness performs deterministic pre-checks and queue routing
```

Specialists never take over the user conversation. Avoid recursive handoff chains.

## Use code when the next step is known

Code owns queue transitions, schemas, proposal counts, ID validation, staleness, authority, duplicate checks, approval-required flags, call budgets, retries and permissions.

Astra owns decomposition, specialist selection, cross-domain comparison, ordinary tradeoffs, optional review judgment, WorkPackage creation and unresolved-question identification.

## Queues

Typed local/run-artifact objects in Phase 1:
- Candidate Proposal Backlog
- Review Queue
- Contract Request Queue
- Conflict Queue
- Implementation Queue
- Approval Queue
- Execution Result Queue

No Redis/message broker in Phase 1.

## RunBudget

Every run defines max_turns, max_total_agent_calls, max_specialist_calls, max_review_calls, max_conflict_rounds, max_proposals_per_assignment, retry_limit, and optional token budget/warning threshold.

Budget exhaustion stops gracefully, persists partial result, and never causes recursive retries.

## Conflict SLA

At most two resolution rounds. Then human escalation with smallest needed decision, both positions, affected IDs, consequences and recommended default.

## Human approval

Use SDK interruption/approval for approval-gated tools where appropriate. Application policy remains authoritative for whether approval is required.

## Planning vs execution

Planning decides what/why/constraints/acceptance criteria. Execution modifies approved files/domains, runs required tests, and returns patch/results under an authorized WorkPackage.

## Context discipline

Astra gets broad enough institutional context to plan. Specialists receive only relevant IDs/excerpts, objective, questions, constraints and schema. Canonical context retrieval is an application service.

## Staleness

Every candidate records canonical_version. Review/execution validate referenced IDs and supersession. Stale items require revalidation.

## No automatic review cascade

Creative output does not automatically invoke Review or every domain. Astra/deterministic policy selects Review only when justified.

## Minimum runtime

```text
Mel
 ↓
Astra
 ├─ Product Lead tool
 ├─ UX Lead tool
 └─ Lead Engineering tool
 ↓
Astra structured synthesis
 ↓
Harness governance checks
 ↓
Human gate
```

Expand only after this works reliably.
