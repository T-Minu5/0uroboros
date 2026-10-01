# Agent Tools and Permissions

## Astra planning tools
Allowed: registered advisory specialist agent-tools, canonical retrieval, candidate/conflict/contract/review/work-package proposal tools, low-risk utility when justified.

Not allowed: unrestricted filesystem write, shell, Git commit/push, deployment, billing, destructive commands, canonical mutation.

## Advisory specialists
Allowed: relevant canonical/reference retrieval and schema-bound outputs. UX/LookDev may issue CONTRACT_REQUEST and provisional mock.

Not allowed: specialist agent-tools, recursive delegation, production filesystem mutation, shell, Git/deploy/billing, canonical patch application.

## Reviewer
Read-only canonical/selected batch plus deterministic validation results. No mutation or self-promotion.

## Utility
Low-risk formatting/classification/extraction only. No authority expansion.

## Execution agents
Activated only by authorized WorkPackage. May receive scoped filesystem read/write, isolated shell, tests, lint, typecheck, patch generation. Cannot widen scope, alter canonical semantics, add tools, spawn agents, or deploy unless separately approved.

## Sandbox boundary
Prefer SandboxAgent or equivalent isolated workspace when approved execution truly needs files/shell/patching/resumable workspace.

## Canonical patch tool
Deterministic tool validates patch, approval provenance, IDs/version, applies patch, regenerates/synchronizes docs and logs changelog. Approval-gate it when required.

## Future dangerous tools
Deployment, broad shell, credentials, billing, external production writes and destructive actions are absent in Phase 1 and require explicit policy plus human approval before introduction.
