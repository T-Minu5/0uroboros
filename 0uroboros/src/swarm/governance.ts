import type { RunBudgetConfig } from './config';
import {
  ContractRequestSchema,
  OrchestrationResultSchema,
  ProposalEnvelopeSchema,
  SpecialistAssignmentSchema,
  SpecialistResponseSchema,
  SystemsResponseSchema,
  WorkPackageSchema,
  type AstraSynthesis,
  type ConflictRecord,
  type ContractRequest,
  type OrchestrationResult,
  type ProposalEnvelope,
  type RunQueues,
  type SpecialistAssignment,
  type SpecialistResponse,
  type SystemsResponse,
  type ResearchResponse,
  type LookDevResponse,
  type ContentResponse,
  type WorldbuildingResponse,
  type WorkPackage,
} from './contracts';
import type { CanonicalIndex } from './context';
import { knownCanonicalIds } from './context';
import { GovernanceError } from './errors';
import {
  classifyGovernance,
  proposalIsAuthorityGate,
  workPackageIsAuthorityGate,
} from './routing';

export {
  classifyConflict,
  classifyContractRequest,
  classifyGovernance,
  classifyHumanGate,
  isValidContractRequest,
  normalizeSpecialistsConsulted,
  SPECIALIST_DISPLAY_NAMES,
} from './routing';
export {
  validateLookDevAssignment,
  validateLookDevResponse,
} from './lookdev';
export {
  validateContentAssignment,
  validateContentResponse,
} from './content';
export {
  validateWorldbuildingAssignment,
  validateWorldbuildingResponse,
} from './worldbuilding';
export {
  validateResearchAssignment,
  validateResearchResponse,
} from './research';

const MUTATION_TOOLS = new Set([
  'shell',
  'computer',
  'apply_patch',
  'filesystem',
  'git_commit',
  'git_push',
  'deploy',
  'billing',
]);

export function validateSpecialistAssignment(
  value: unknown,
  budget: RunBudgetConfig,
): SpecialistAssignment {
  const assignment = SpecialistAssignmentSchema.parse(value);
  if (assignment.proposal_limit > budget.max_proposals_per_assignment) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Assignment ${assignment.assignment_id} proposal_limit ${assignment.proposal_limit} exceeds configured maximum ${budget.max_proposals_per_assignment}.`,
    );
  }
  return assignment;
}

export function validateSpecialistResponse(
  value: unknown,
  assignment: SpecialistAssignment,
): SpecialistResponse {
  const response = SpecialistResponseSchema.parse(value);
  if (response.recommendations.length > assignment.proposal_limit) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Response ${response.assignment_id} has ${response.recommendations.length} recommendations; limit is ${assignment.proposal_limit}.`,
    );
  }
  if (response.agent !== assignment.role) {
    throw new GovernanceError(
      'ROLE_MISMATCH',
      `Response agent ${response.agent} does not match assignment role ${assignment.role}.`,
    );
  }
  return response;
}

export function validateSystemsResponse(
  value: unknown,
  assignment: SpecialistAssignment,
): SystemsResponse {
  const response = SystemsResponseSchema.parse(value);
  if (response.recommendations.length > assignment.proposal_limit) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Response ${response.assignment_id} has ${response.recommendations.length} recommendations; limit is ${assignment.proposal_limit}.`,
    );
  }
  if (assignment.role !== 'systems') {
    throw new GovernanceError(
      'ROLE_MISMATCH',
      `Systems response cannot be accepted for assignment role ${assignment.role}.`,
    );
  }
  return response;
}

export function validateCanonicalIds(
  ids: string[],
  index: CanonicalIndex,
  required: boolean,
): string[] {
  const known = knownCanonicalIds(index);
  const unknown = ids.filter((id) => id && !known.has(id));
  if (required && unknown.length > 0) {
    throw new GovernanceError(
      'INVALID_CANONICAL_ID',
      `Unknown canonical IDs: ${unknown.join(', ')}.`,
    );
  }
  return unknown;
}

export function validateCanonicalFreshness(
  canonicalVersion: string,
  referencedIds: string[],
  index: CanonicalIndex,
): 'CURRENT' | 'NEEDS_CHECK' {
  if (canonicalVersion !== index.version) {
    throw new GovernanceError(
      'STALE_CANONICAL',
      `canonical_version ${canonicalVersion} does not match current ${index.version}. Revalidate before promotion.`,
    );
  }
  const unknown = validateCanonicalIds(referencedIds, index, false);
  if (unknown.length > 0) {
    throw new GovernanceError(
      'STALE_CANONICAL',
      `Referenced IDs are missing or superseded: ${unknown.join(', ')}.`,
    );
  }
  return 'CURRENT';
}

export function detectInventedRuleIdsFromText(
  haystack: string,
  index: CanonicalIndex,
): string[] {
  const known = knownCanonicalIds(index);
  const mentioned = new Set<string>();
  for (const match of haystack.matchAll(/RULE-[A-Z0-9-]+/g)) {
    mentioned.add(match[0]);
  }
  return [...mentioned].filter((id) => !known.has(id));
}

export function detectInventedRuleIds(
  response: SpecialistResponse,
  index: CanonicalIndex,
): string[] {
  return detectInventedRuleIdsFromText(
    [
      response.summary,
      ...response.findings,
      ...response.recommendations.map((item) => `${item.title} ${item.rationale}`),
      ...response.canonical_ids_referenced,
    ].join(' '),
    index,
  );
}

export function detectInventedResearchRuleIds(
  response: ResearchResponse,
  index: CanonicalIndex,
): string[] {
  return detectInventedRuleIdsFromText(
    [
      response.summary,
      ...response.canonical_ids_referenced,
      ...response.observations.map((item) => item.statement),
      ...response.recommendations.map((item) => `${item.title} ${item.rationale}`),
      ...response.evidence.flatMap((item) => [item.summary, ...item.canonical_ids_related]),
    ].join(' '),
    index,
  );
}

export function detectInventedLookDevRuleIds(
  response: LookDevResponse,
  index: CanonicalIndex,
): string[] {
  return detectInventedRuleIdsFromText(
    [
      response.summary,
      ...response.visual_findings,
      ...response.recommendations.map((item) => `${item.title} ${item.rationale}`),
      ...response.canonical_ids_referenced,
    ].join(' '),
    index,
  );
}

export function detectInventedContentRuleIds(
  response: ContentResponse,
  index: CanonicalIndex,
): string[] {
  return detectInventedRuleIdsFromText(
    [
      response.summary,
      ...response.canonical_ids_referenced,
      ...response.rules_touched,
      ...response.content_proposals.flatMap((item) => [
        item.proposed_effect,
        ...item.existing_rules_used,
      ]),
    ].join(' '),
    index,
  );
}

export function detectInventedWorldbuildingRuleIds(
  response: WorldbuildingResponse,
  index: CanonicalIndex,
): string[] {
  return detectInventedRuleIdsFromText(
    [response.summary, ...response.canonical_ids_referenced, ...response.world_proposals.map((item) => item.statement)].join(
      ' ',
    ),
    index,
  );
}

export function detectInventedSystemsRuleIds(
  response: SystemsResponse,
  index: CanonicalIndex,
): string[] {
  return detectInventedRuleIdsFromText(
    [
      response.summary,
      ...response.canonical_ids_referenced,
      ...response.recommendations.map((item) => `${item.title} ${item.rationale}`),
      ...[
        ...response.rule_findings,
        ...response.implementation_mismatches,
        ...response.presentation_distinctions,
        ...response.ambiguities,
      ].flatMap((item) => [item.summary, ...item.evidence, ...item.canonical_ids]),
    ].join(' '),
    index,
  );
}

export function extractContractRequests(
  response: SpecialistResponse,
): ContractRequest[] {
  const requests: ContractRequest[] = [];
  const lines = [
    ...response.findings,
    ...response.recommendations.map((item) => item.title),
    ...response.open_questions,
  ];
  lines.forEach((line, index) => {
    if (!line.toUpperCase().includes('CONTRACT_REQUEST')) return;
    requests.push(
      ContractRequestSchema.parse({
        id: `contract-${response.assignment_id}-${index + 1}`,
        summary: line,
        missing_state: [line],
        linked_provisional_mock_id: null,
      }),
    );
  });
  return requests;
}

export function sanitizeWorkPackage(workPackage: WorkPackage): WorkPackage {
  const parsed = WorkPackageSchema.parse(workPackage);
  const forbidden = parsed.execution_tools_allowed.filter((tool) =>
    MUTATION_TOOLS.has(tool),
  );
  if (forbidden.length > 0 || parsed.execution_tools_allowed.length > 0) {
    return {
      ...parsed,
      execution_tools_allowed: [],
      approval_required:
        parsed.approval_required ||
        parsed.authority_level === 'CANONICAL_MUTATION' ||
        parsed.authority_level === 'DESTRUCTIVE' ||
        forbidden.length > 0,
    };
  }
  if (
    parsed.authority_level === 'CANONICAL_MUTATION' ||
    parsed.authority_level === 'DESTRUCTIVE'
  ) {
    return { ...parsed, approval_required: true, execution_tools_allowed: [] };
  }
  return { ...parsed, execution_tools_allowed: [] };
}

export function workPackageRequiresApproval(workPackage: WorkPackage): boolean {
  return workPackageIsAuthorityGate(workPackage);
}

export function proposalRequiresApproval(proposal: ProposalEnvelope): boolean {
  return proposalIsAuthorityGate(proposal);
}

export function routeQueues(
  result: OrchestrationResult,
  conflictRoundsUsed: number,
  maxConflictRounds: number,
): RunQueues {
  for (const proposal of result.candidate_proposals) {
    ProposalEnvelopeSchema.parse(proposal);
  }
  return classifyGovernance(result, { conflictRoundsUsed, maxConflictRounds }).queues;
}

export function assertPlanningOnly(): void {
  throw new GovernanceError(
    'EXECUTION_DISABLED',
    'WorkPackages are planning artifacts in Phases 0-4. Execution agents are not activated.',
  );
}

export function validateOrchestrationResult(value: unknown): OrchestrationResult {
  return OrchestrationResultSchema.parse(value);
}

export function mergeContractRequests(
  fromSpecialists: ContractRequest[],
  fromAstra: ContractRequest[],
): ContractRequest[] {
  const seen = new Set<string>();
  const merged: ContractRequest[] = [];
  for (const request of [...fromSpecialists, ...fromAstra]) {
    const key = request.summary;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(request);
  }
  return merged;
}

export function collectConflicts(
  fromAstra: ConflictRecord[],
  inventedRuleIds: string[],
): ConflictRecord[] {
  const conflicts = [...fromAstra];
  if (inventedRuleIds.length > 0) {
    conflicts.push({
      id: 'conflict-invented-rules',
      summary: 'Engineering or specialist output invented unstated rule IDs.',
      positions: [
        'Do not invent gameplay semantics.',
        `Unknown IDs: ${inventedRuleIds.join(', ')}.`,
      ],
      affected_ids: inventedRuleIds,
      recommended_default: 'Escalate. Do not treat invented IDs as canonical.',
      escalated: true,
    });
  }
  return conflicts;
}

export const FORBIDDEN_PLANNING_TOOLS = MUTATION_TOOLS;

export function expandAstraSynthesis(
  synthesis: AstraSynthesis,
  options: { runId: string; createdAt: string; canonicalVersion: string },
): {
  work_packages: WorkPackage[];
  candidate_proposals: ProposalEnvelope[];
  contract_requests: ContractRequest[];
  conflicts: ConflictRecord[];
} {
  const work_packages = synthesis.work_package_intents.map((intent, index) =>
    WorkPackageSchema.parse({
      id: `wp-${options.runId}-${index + 1}`,
      objective: intent.objective,
      owner_role: intent.owner_role,
      authorized_rule_ids: intent.authorized_rule_ids,
      authorized_tech_ids: intent.authorized_tech_ids,
      scope: intent.scope,
      files_or_domains_allowed: intent.scope,
      dependencies: intent.dependencies,
      acceptance_criteria:
        intent.acceptance_criteria.length > 0
          ? intent.acceptance_criteria
          : ['Acceptance criteria were not supplied and must be added before execution.'],
      tests_required: intent.tests_required,
      proposed_authority_level: 'ADVISORY',
      authority_level: 'ADVISORY',
      approval_required: intent.approval_required,
      execution_tools_allowed: [],
      canonical_version: options.canonicalVersion,
    }),
  );

  const candidate_proposals = synthesis.candidate_notes.map((note, index) => {
    const rulesChanged = note.classification === 'POTENTIAL_RULE_CONFLICT';
    const authorizedBy = note.canonical_ids.filter(
      (id) => id.startsWith('RULE-') || id.startsWith('TECH-'),
    );
    const classification =
      note.classification === 'IMPLEMENTATION_DECISION' && authorizedBy.length === 0
        ? 'RECOMMENDATION'
        : note.classification === 'PROVISIONAL_MOCK'
          ? 'CONTRACT_REQUEST'
          : note.classification;
    return ProposalEnvelopeSchema.parse({
      id: `prop-${options.runId}-${index + 1}`,
      canonical_version: options.canonicalVersion,
      created_at: options.createdAt,
      agent: 'astra',
      classification,
      authority: 'GOVERNANCE',
      status: rulesChanged ? 'NEEDS_APPROVAL' : 'DRAFT',
      rules_changed: rulesChanged,
      requirements_touched: note.canonical_ids,
      contracts_required: note.canonical_ids.filter((id) => id.startsWith('CONTRACT-')),
      summary: note.title,
      rationale: note.rationale,
      risks: ['Candidate note pending deterministic review.'],
      provenance: ['astra-synthesis'],
      stale_check_status: 'NEEDS_CHECK',
      human_approval_required: rulesChanged,
      queue_target: rulesChanged ? 'APPROVAL' : 'CANDIDATE',
      authorized_by: authorizedBy,
      runtime_run_id: options.runId,
    });
  });

  const contract_requests = synthesis.contract_requests.map((request, index) =>
    ContractRequestSchema.parse({
      id: `contract-${options.runId}-${index + 1}`,
      summary: request.summary,
      missing_state: request.missing_state,
      linked_provisional_mock_id: null,
    }),
  );

  const conflicts = synthesis.conflicts.map((conflict, index) => ({
    id: `conflict-${options.runId}-${index + 1}`,
    summary: conflict.summary,
    positions: conflict.positions,
    affected_ids: conflict.affected_ids,
    recommended_default: conflict.recommended_default,
    escalated: false,
  }));

  return { work_packages, candidate_proposals, contract_requests, conflicts };
}
