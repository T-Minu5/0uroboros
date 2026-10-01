# Authority and Tool Matrix

## Planning roles

| Role | Model class | Tools | Repo write | Delegation | Approval authority |
|---|---|---|---|---|---|
| Astra | Astra | registered specialist agent-tools, canonical retrieval, queue/work-package proposal tools | No | Registered advisory tools only | Identifies need, cannot self-approve |
| Product | Terra | canonical retrieval | No | None | None |
| Systems | Terra/Sol | canonical retrieval, fixtures | No | None | None |
| UX | Terra | canonical retrieval, CONTRACT_REQUEST, provisional mock | No | None | None |
| Lead Engineering | Sol | canonical retrieval, architecture analysis | No during planning | None | None |
| LookDev | Terra | canonical/event fixtures | No | None | None |
| Content | Terra | canonical + reference retrieval | No | None | None |
| Worldbuilding | Terra | world/reference retrieval | No | None | None |
| Research | Terra/Luna | approved research/retrieval | No | None | None |
| Reviewer | Sol | canonical + selected batch | No | None | Advises only |
| Utility | Luna | formatting/classification/extraction | No | None | None |

## Execution roles

Execution agents exist only for authorized WorkPackages. They receive scoped workspace/files/shell/tests as needed. No execution agent may widen its scope, change canonical semantics, add tools, spawn agents, or deploy without separate approval.

## Deterministic governance ownership

Application code owns schema enforcement, authorization, proposal limits, canonical version checks, queue routing, max calls, max turns policy, retry limits, approval requirements, write-scope enforcement, canonical mutation validation, local run artifacts, usage aggregation, and model routing.

## Human approval required

Gameplay/rule-meaning changes, major authority changes, approval-required canonical patching, broad/destructive filesystem work, deployment, irreversible actions, tool-authority expansion, and anything explicitly marked approval-required.

## Hard boundaries

1. Astra cannot bypass deterministic governance.
2. Specialists cannot spawn specialists.
3. Advisory agents cannot mutate production code.
4. Execution agents cannot operate outside WorkPackage scope.
5. LookDev cannot determine gameplay outcomes.
6. Engineering cannot invent gameplay semantics.
7. Systems arbitrates authoritative-vs-presentation semantics.
8. Review cannot self-promote.
9. Curator cannot infer approval.
10. References have zero canonical authority.
