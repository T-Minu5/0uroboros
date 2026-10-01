# Agent Runtime Schemas

Reuse the existing proposal system. Do not create a competing governance format.

## Proposal Envelope

Required concepts: id, canonical_version, created_at, agent, classification, authority, status, rules_changed, requirements_touched, contracts_required, summary, rationale, risks, provenance, stale_check_status, human_approval_required, queue_target.

Classifications: OBSERVATION, RECOMMENDATION, PROPOSED_ADDITION, POTENTIAL_RULE_CONFLICT, IMPLEMENTATION_DECISION, CONTRACT_REQUEST, PROVISIONAL_MOCK.

Statuses: DRAFT, NEEDS_REVIEW, NEEDS_APPROVAL, APPROVED, REJECTED, HOLD_FOR_PLAYTEST, IMPLEMENTABLE.

Rules:
- IMPLEMENTATION_DECISION requires exact authorizing RULE/TECH IDs unless covered by TECH-INT-001.
- rules_changed=true forces NEEDS_APPROVAL.
- no agent self-approves a rule-changing proposal.
- references are provenance only.
- risks required.
- CONTRACT_REQUEST asks for exposure, not new semantics.
- PROVISIONAL_MOCK must reference CONTRACT_REQUEST and is never canonical by usage.

## SpecialistAssignment
assignment_id, work_order_id, role, objective, canonical_context_ids, context_excerpt_refs, questions, constraints, expected_output, proposal_limit, authority_boundary.

## SpecialistResponse
agent, assignment_id, summary, findings, recommendations, risks, assumptions, dependencies, open_questions, canonical_ids_referenced, confidence.

Recommendations cannot exceed assignment proposal_limit. Confidence is 0..1.

## WorkPackage
id, objective, owner_role, authorized_rule_ids, authorized_tech_ids, scope, files_or_domains_allowed, dependencies, acceptance_criteria, tests_required, authority_level, approval_required, execution_tools_allowed, canonical_version.

## OrchestrationResult
objective, decisions, specialists_consulted, work_packages, candidate_proposals, contract_requests, conflicts, review_requests, risks, human_approvals_required, canonical_version, budget_usage.
