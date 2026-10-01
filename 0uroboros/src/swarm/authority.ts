import type {
  AuthorityLevel,
  EvidenceRecord,
  OrchestrationResult,
  ReviewFindingKind,
  WorkPackage,
} from './contracts';

const RANK: Record<AuthorityLevel, number> = {
  ADVISORY: 0,
  IMPLEMENTATION: 1,
  CANONICAL_MUTATION: 2,
  DESTRUCTIVE: 3,
};

export const IMPLEMENTATION_FILE_RE =
  /\bsrc\/(?:game|client|server)\/[\w./-]+\.(?:ts|tsx)\b/i;
export const MUTATE_IMPL_RE =
  /\b(correct|align|fix|patch|edit|mutate|change the implementation|implementation correction|conform(?:ing)? implementation)\b/i;
export const CANONICAL_MUTATION_RE =
  /\b(change|amend|replace|supersede|rewrite|mutate)\b.{0,40}\b(RULE-|TECH-|CONTRACT-|canonical rule|approved rule)\b/i;
export const CANONICAL_FILE_RE =
  /\b(0uroboros_swarm_v2_0\/canonical|01_APPROVED_RULES|canonical\/rules)\b/i;
const HISTORICAL_RE = /\bHIST-[A-Z0-9-]+\b/;
export const AUTHORITY_TOOL_RE = /\b(shell|git_commit|git_push|deploy|filesystem|apply_patch)\b/i;

export function workPackageHaystack(workPackage: WorkPackage): string {
  return [
    workPackage.objective,
    ...workPackage.scope,
    ...workPackage.files_or_domains_allowed,
    ...workPackage.acceptance_criteria,
  ].join('\n');
}

export function raiseAuthority(
  proposed: AuthorityLevel,
  inferred: AuthorityLevel,
): AuthorityLevel {
  return RANK[inferred] > RANK[proposed] ? inferred : proposed;
}

export function isImplementationCandidate(
  workPackage: WorkPackage,
  haystack: string,
  evidence: EvidenceRecord[],
): boolean {
  const touchesImplementationFile = IMPLEMENTATION_FILE_RE.test(haystack);
  const mutatesImplementation = MUTATE_IMPL_RE.test(haystack);
  const deckAlign =
    workPackage.authorized_rule_ids.includes('RULE-DECK-001') &&
    /cards\.ts|STARTING_DECK/i.test(haystack);
  const verifiedMismatch = evidence.some(
    (item) =>
      item.authority === 'HARNESS_VERIFIED_EVIDENCE' &&
      item.canonical_ids.some((id) => workPackage.authorized_rule_ids.includes(id)) &&
      IMPLEMENTATION_FILE_RE.test(item.source),
  );
  return (
    (touchesImplementationFile && mutatesImplementation) ||
    (deckAlign && (mutatesImplementation || verifiedMismatch || touchesImplementationFile))
  );
}

export function inferWorkPackageAuthority(
  workPackage: WorkPackage,
  options: {
    evidence?: EvidenceRecord[];
    requestedTools?: string[];
  } = {},
): AuthorityLevel {
  const requestedTools = options.requestedTools ?? workPackage.execution_tools_allowed;
  const haystack = workPackageHaystack(workPackage);
  if (requestedTools.some((tool) => AUTHORITY_TOOL_RE.test(tool))) {
    return 'DESTRUCTIVE';
  }
  if (
    CANONICAL_MUTATION_RE.test(haystack) ||
    (CANONICAL_FILE_RE.test(haystack) && MUTATE_IMPL_RE.test(haystack))
  ) {
    return 'CANONICAL_MUTATION';
  }
  if (isImplementationCandidate(workPackage, haystack, options.evidence ?? [])) {
    return 'IMPLEMENTATION';
  }
  return 'ADVISORY';
}

export function normalizeWorkPackageAuthority(
  workPackage: WorkPackage,
  options: {
    evidence?: EvidenceRecord[];
    requestedTools?: string[];
  } = {},
): WorkPackage {
  const proposed = workPackage.proposed_authority_level ?? workPackage.authority_level;
  const inferred = inferWorkPackageAuthority(workPackage, options);
  const authority_level = raiseAuthority(proposed, inferred);
  return {
    ...workPackage,
    proposed_authority_level: proposed,
    authority_level,
    approval_required:
      workPackage.approval_required ||
      authority_level === 'IMPLEMENTATION' ||
      authority_level === 'CANONICAL_MUTATION' ||
      authority_level === 'DESTRUCTIVE',
    execution_tools_allowed: [],
  };
}

export function normalizeOrchestrationWorkPackages(
  result: OrchestrationResult,
  options: { requestedTools?: string[] } = {},
): OrchestrationResult {
  return {
    ...result,
    work_packages: result.work_packages.map((workPackage) =>
      normalizeWorkPackageAuthority(workPackage, {
        evidence: result.verified_evidence,
        requestedTools: options.requestedTools,
      }),
    ),
  };
}

export function classifyReviewerFindingKind(input: {
  summary: string;
  evidence?: string[];
  currentCanonicalContradiction?: boolean;
  historicalOnly?: boolean;
  modelClaimsMatch?: boolean;
  implementationDiffersFromCurrent?: boolean;
}): ReviewFindingKind {
  if (input.historicalOnly) return 'NO_MATERIAL_ISSUE';
  if (input.currentCanonicalContradiction) return 'CANONICAL_CONFLICT';
  if (
    /external (?:research|evidence|source)/i.test(
      [input.summary, ...(input.evidence ?? [])].join(' '),
    ) &&
    /RULE-|canonical/i.test([input.summary, ...(input.evidence ?? [])].join(' '))
  ) {
    return 'EXTERNAL_EVIDENCE_CHALLENGE';
  }
  if (input.modelClaimsMatch && input.implementationDiffersFromCurrent) {
    return 'EVIDENCE_CONFLICT';
  }
  if (input.implementationDiffersFromCurrent) return 'IMPLEMENTATION_MISMATCH';
  const text = [input.summary, ...(input.evidence ?? [])].join(' ');
  if (HISTORICAL_RE.test(text) && /superseded|historical|stale/i.test(text)) {
    return 'NO_MATERIAL_ISSUE';
  }
  if (
    /STARTING_DECK|cards\.ts|implementation/i.test(text) &&
    /4 Character|4\/4\/2/i.test(text) &&
    /RULE-DECK-001|5 Character|5\/3\/2/i.test(text)
  ) {
    return 'IMPLEMENTATION_MISMATCH';
  }
  if (
    /two current (?:authoritative )?rules|current rules (?:contradict|incompatible)|incompatible values for the same/i.test(
      text,
    )
  ) {
    return 'CANONICAL_CONFLICT';
  }
  return 'NO_MATERIAL_ISSUE';
}
