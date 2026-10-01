import type { RunBudgetConfig } from './config';
import type {
  ExternalEvidenceRecord,
  OrchestrationResult,
  ResearchAssignment,
  ResearchObservation,
  ResearchResponse,
  ResearchSourceMode,
  RunQueues,
} from './contracts';
import { ResearchAssignmentSchema, ResearchResponseSchema } from './contracts';
import { GovernanceError } from './errors';
import {
  isApprovedResourceUrl,
  loadResourceLibrary,
  queryResourceLibrary,
  type ResourceLibraryEntry,
} from './resourceLibrary';
import { isHarnessInfrastructureRequest } from './harnessRouting';
import { shouldConsultSystems } from './systems';

const RESEARCH_OBJECTIVE_RE =
  /\b(research|compar(?:e|ison)|reference game|shards of infinity|slay the spire|boardgame\.io|openai|sdk|three\.js|official docs?|verify current|market|competitive (?:game|benchmark)|inspiration|resource library|current (?:api|framework|documentation)|source verification|visual reference|motion reference|theatrics|lookdev reference)\b/i;

const RESEARCH_BLOCKED_RE =
  /\b(what is the starting deck|starting deck\b|RULE-DECK-001|STARTING_DECK|typography|inter\b|design system|known approved (?:game )?rule|do not invoke.{0,40}research)\b/i;

const CANONICAL_ANSWERED_RE =
  /\b(what is the (?:starting deck|approved|canonical)|compare STARTING_DECK to RULE-DECK-001)\b/i;

import { shouldConsultContent } from './content';
import { shouldConsultWorldbuilding } from './worldbuilding';

export function shouldConsultResearch(objective: string): boolean {
  if (isHarnessInfrastructureRequest(objective)) return false;
  if (RESEARCH_BLOCKED_RE.test(objective) || CANONICAL_ANSWERED_RE.test(objective)) {
    return false;
  }
  if (
    (shouldConsultContent(objective) || shouldConsultWorldbuilding(objective)) &&
    !/\b(research|reference game|official docs?|verify current|sdk)\b/i.test(objective.replace(/do not invoke research/gi, ''))
  ) {
    return false;
  }
  if (RESEARCH_OBJECTIVE_RE.test(objective)) return true;
  return false;
}

export function researchWouldNotHelp(objective: string): boolean {
  if (shouldConsultResearch(objective)) return false;
  if (shouldConsultSystems(objective) && !RESEARCH_OBJECTIVE_RE.test(objective)) {
    return true;
  }
  return !RESEARCH_OBJECTIVE_RE.test(objective);
}

export function validateResearchAssignment(
  value: unknown,
  budget: RunBudgetConfig,
): ResearchAssignment {
  const assignment = ResearchAssignmentSchema.parse({
    ...(value && typeof value === 'object' ? value : {}),
    role: 'research',
  });
  if (assignment.proposal_limit > budget.max_research_proposals) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Research assignment ${assignment.assignment_id} proposal_limit ${assignment.proposal_limit} exceeds MAX_RESEARCH_PROPOSALS ${budget.max_research_proposals}.`,
    );
  }
  if (assignment.proposal_limit > budget.max_proposals_per_assignment) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Research assignment ${assignment.assignment_id} proposal_limit exceeds configured maximum.`,
    );
  }
  return assignment;
}

export function validateResearchResponse(
  value: unknown,
  assignment: ResearchAssignment,
  budget: RunBudgetConfig,
): ResearchResponse {
  const response = ResearchResponseSchema.parse(value);
  if (response.assignment_id !== assignment.assignment_id) {
    throw new GovernanceError(
      'ROLE_MISMATCH',
      `Research response assignment ${response.assignment_id} does not match ${assignment.assignment_id}.`,
    );
  }
  if (response.evidence.length > budget.max_research_sources) {
    throw new GovernanceError(
      'RESEARCH_SOURCE_LIMIT',
      `Research returned ${response.evidence.length} sources; limit is ${budget.max_research_sources}.`,
    );
  }
  if (response.observations.length > budget.max_research_findings) {
    throw new GovernanceError(
      'RESEARCH_FINDING_LIMIT',
      `Research returned ${response.observations.length} observations; limit is ${budget.max_research_findings}.`,
    );
  }
  if (response.recommendations.length > Math.min(assignment.proposal_limit, budget.max_research_proposals)) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Research returned ${response.recommendations.length} recommendations; limit is ${Math.min(assignment.proposal_limit, budget.max_research_proposals)}.`,
    );
  }
  return stampResearchRun(response, assignment);
}

function stampResearchRun(
  response: ResearchResponse,
  assignment: ResearchAssignment,
): ResearchResponse {
  return {
    ...response,
    evidence: response.evidence.map((item, index) => ({
      ...item,
      evidence_type: 'EXTERNAL_RESEARCH' as const,
      authority: 'EXTERNAL_RESEARCH_EVIDENCE' as const,
      research_run_id: item.research_run_id || assignment.assignment_id,
      evidence_id: item.evidence_id || `ev-${assignment.assignment_id}-${index + 1}`,
    })),
  };
}

export function evidenceAuthorityRank(
  authority:
    | 'CANONICAL'
    | 'HARNESS_VERIFIED_EVIDENCE'
    | 'USER_CURATED_REFERENCE_GUIDANCE'
    | 'EXTERNAL_RESEARCH_EVIDENCE'
    | 'MODEL_CLAIM',
): number {
  if (authority === 'CANONICAL') return 5;
  if (authority === 'HARNESS_VERIFIED_EVIDENCE') return 4;
  if (authority === 'USER_CURATED_REFERENCE_GUIDANCE') return 3;
  if (authority === 'EXTERNAL_RESEARCH_EVIDENCE') return 2;
  return 1;
}

export function externalCannotOverrideCanonical(): boolean {
  return true;
}

export function communitySignalCannotBecomeCanonical(
  quality: ExternalEvidenceRecord['source_quality'],
): boolean {
  return quality === 'COMMUNITY_SIGNAL' || quality === 'INSPIRATION_ONLY';
}

export function officialDocsInformExternalFact(record: ExternalEvidenceRecord): boolean {
  return (
    record.source_type === 'OFFICIAL_DOCUMENTATION' &&
    (record.source_quality === 'PRIMARY_HIGH' || record.source_quality === 'SECONDARY_HIGH')
  );
}

export function officialDocsAreNotProjectAuthority(record: ExternalEvidenceRecord): boolean {
  return officialDocsInformExternalFact(record) && record.authority === 'EXTERNAL_RESEARCH_EVIDENCE';
}

export function classifyExternalDisagreement(
  observation: ResearchObservation,
): 'EXTERNAL_EVIDENCE_CHALLENGE' | 'CANONICAL_CONFLICT' | 'NO_CONFLICT' {
  if (observation.kind === 'EXTERNAL_EVIDENCE_CHALLENGE') {
    return 'EXTERNAL_EVIDENCE_CHALLENGE';
  }
  return 'NO_CONFLICT';
}

export function researchCreatesWorkPackages(_response: ResearchResponse): never[] {
  return [];
}

export function routeResearchResponse(response: ResearchResponse): {
  evidence: ExternalEvidenceRecord[];
  observations: ResearchObservation[];
  queues: Pick<
    RunQueues,
    'implementation' | 'approval' | 'contract_request' | 'conflict' | 'candidate'
  >;
  human_design_decisions: OrchestrationResult['human_design_decisions'];
} {
  const challenges = response.observations.filter(
    (item) => item.kind === 'EXTERNAL_EVIDENCE_CHALLENGE',
  );
  return {
    evidence: response.evidence,
    observations: response.observations,
    queues: {
      implementation: [],
      approval: [],
      contract_request: [],
      conflict: [],
      candidate: [],
    },
    human_design_decisions: challenges.map((item, index) => ({
      id: `research-challenge-${response.assignment_id}-${index + 1}`,
      reason: item.statement,
      source: 'specialist' as const,
      kind: 'HUMAN_DESIGN_DECISION' as const,
    })),
  };
}

export function selectResearchEvidenceForReview(
  evidence: ExternalEvidenceRecord[],
  reliedUponIds: string[],
): ExternalEvidenceRecord[] {
  const wanted = new Set(reliedUponIds.filter(Boolean));
  if (wanted.size === 0) return [];
  return evidence.filter((item) => wanted.has(item.evidence_id));
}

export function collectReliedResearchEvidenceIds(result: OrchestrationResult): string[] {
  const haystack = [
    result.summary,
    ...result.decisions,
    ...result.candidate_proposals.flatMap((item) => [item.summary, item.rationale, ...item.provenance]),
    ...result.work_packages.flatMap((item) => [item.objective, ...item.dependencies]),
  ].join('\n');
  return result.research_evidence
    .map((item) => item.evidence_id)
    .filter((id) => haystack.includes(id));
}

export function formatResourceLibraryForAssignment(
  assignment: ResearchAssignment,
  cwd: string = process.cwd(),
): string {
  const entries = queryResourceLibrary(loadResourceLibrary(cwd), {
    query: assignment.objective,
    tags: assignment.allowed_reference_tags,
    maxResults: 8,
  });
  if (entries.length === 0) {
    return 'No curated Resource Library matches. Prefer approved tags before live search.';
  }
  return [
    'Curated Resource Library matches. These are approved research inputs, not canonical authority.',
    ...entries.map((entry) => formatLibraryEntry(entry)),
  ].join('\n');
}

export function formatLibraryEntry(entry: ResourceLibraryEntry): string {
  const guidance = entry.user_guidance.slice(0, 3).join(' | ');
  return `- ${entry.category}: ${entry.url} [${entry.tags.join(', ')}] ${guidance || entry.notes}`.trim();
}

export function assertApprovedResearchUrl(url: string, cwd: string = process.cwd()): string {
  if (!isApprovedResourceUrl(url, loadResourceLibrary(cwd))) {
    throw new GovernanceError(
      'UNAPPROVED_RESEARCH_URL',
      `Research may retrieve only Resource Library URLs. Rejected: ${url}`,
    );
  }
  return url;
}

export function inferSourceMode(assignment: Pick<ResearchAssignment, 'source_mode' | 'objective' | 'constraints'>): ResearchSourceMode {
  if (assignment.source_mode) return assignment.source_mode;
  const haystack = [assignment.objective, ...assignment.constraints].join(' ');
  if (/\b(curated|resource library|approved reference)\b/i.test(haystack)) return 'CURATED';
  if (/\b(current|live|verify|official docs?)\b/i.test(haystack)) return 'LIVE';
  return 'MIXED';
}
