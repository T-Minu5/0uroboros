import {
  AUTHORITY_TOOL_RE,
  CANONICAL_MUTATION_RE,
  classifyReviewerFindingKind,
  isImplementationCandidate,
  workPackageHaystack,
} from './authority';
import type { CanonicalIndex } from './context';
import { retrieveCanonical } from './context';
import {
  ReviewPacketSchema,
  type OrchestrationResult,
  type ReviewFinding,
  type ReviewPacket,
  type ReviewTrigger,
  type ReviewerResponse,
  type RunQueues,
  type WorkPackage,
} from './contracts';
import {
  collectReliedResearchEvidenceIds,
  selectResearchEvidenceForReview,
} from './research';
import { classifyConflict, classifyGovernance } from './routing';

const EXPLICIT_REVIEW_RE =
  /\b(independent review|independent audit|review-gated|mel (?:asks|requested) (?:an? )?(?:independent )?review)\b/i;

const HIGH_IMPACT_ARCHITECTURE_RE =
  /\b(server authority|playerView|authoritative vs presentation|deterministic RNG|game contract architecture|execution sandbox|model\/tool permission|tool-permission architecture)\b/i;

const MATCH_CLAIM_RE =
  /\b(implementation already matches|no (?:current )?(?:implementation )?(?:mismatch|violation)|matches RULE-DECK-001|4\/4\/2 is (?:correct|approved))\b/i;

export const REVIEW_CANONICAL_EXCERPT_LIMIT = 24;

export function reviewPacketAcceptanceCriteriaCount(packet: ReviewPacket): number {
  return packet.relevant_work_packages.reduce(
    (sum, item) => sum + item.acceptance_criteria.length,
    0,
  );
}

export function workPackageAcceptanceCriteriaCount(packages: WorkPackage[]): number {
  return packages.reduce((sum, item) => sum + item.acceptance_criteria.length, 0);
}

export function assertReviewPacketCompleteness(
  packet: ReviewPacket,
  result: OrchestrationResult,
): void {
  const reviewed = result.work_packages.filter((item) => packet.artifact_ids.includes(item.id));
  const sourcePackages = reviewed.length > 0 ? reviewed : packet.relevant_work_packages;
  const packetCount = reviewPacketAcceptanceCriteriaCount(packet);
  const sourceCount = workPackageAcceptanceCriteriaCount(sourcePackages);
  if (packetCount !== sourceCount) {
    throw new Error(
      `REVIEW_PACKET_INCOMPLETE: review_packet_acceptance_criteria_count=${packetCount} work_package_acceptance_criteria_count=${sourceCount}`,
    );
  }
  for (const workPackage of packet.relevant_work_packages) {
    const source = result.work_packages.find((item) => item.id === workPackage.id);
    if (!source) continue;
    if (workPackage.acceptance_criteria.length !== source.acceptance_criteria.length) {
      throw new Error(
        `REVIEW_PACKET_INCOMPLETE: acceptance_criteria omitted for ${workPackage.id}`,
      );
    }
    if (workPackage.tests_required.length !== source.tests_required.length) {
      throw new Error(`REVIEW_PACKET_INCOMPLETE: tests_required omitted for ${workPackage.id}`);
    }
  }
  const starter = packet.relevant_work_packages.some(
    (item) =>
      item.authorized_rule_ids.includes('RULE-DECK-001') &&
      item.scope.some((scope) => scope.includes('cards.ts')),
  );
  if (starter) {
    const locations = new Set(packet.verified_evidence.map((item) => item.source_location));
    for (const required of ['STARTING_DECK', 'CARD_DEFINITIONS'] as const) {
      if (!locations.has(required)) {
        throw new Error(`REVIEW_PACKET_INCOMPLETE: missing evidence ${required}`);
      }
    }
  }
}

export function detectReviewTriggers(
  result: OrchestrationResult,
  options: {
    objective?: string;
    requestedTools?: string[];
  } = {},
): ReviewTrigger[] {
  const triggers = new Set<ReviewTrigger>();
  const haystack = [
    result.objective,
    result.summary,
    ...result.decisions,
    options.objective ?? '',
  ].join('\n');

  if (
    result.work_packages.some((item) => {
      const haystack = workPackageHaystack(item);
      return (
        item.authority_level === 'IMPLEMENTATION' ||
        item.proposed_authority_level === 'IMPLEMENTATION' ||
        isImplementationCandidate(item, haystack, result.verified_evidence)
      );
    })
  ) {
    triggers.add('IMPLEMENTATION_CANDIDATE');
  }

  if (
    result.work_packages.some((item) => {
      const haystack = workPackageHaystack(item);
      return (
        item.authority_level === 'CANONICAL_MUTATION' ||
        item.proposed_authority_level === 'CANONICAL_MUTATION' ||
        CANONICAL_MUTATION_RE.test(haystack)
      );
    }) ||
    result.candidate_proposals.some(
      (item) => item.rules_changed || item.classification === 'POTENTIAL_RULE_CONFLICT',
    )
  ) {
    triggers.add('CANONICAL_MUTATION');
  }

  const requested = options.requestedTools ?? [];
  if (
    result.work_packages.some(
      (item) =>
        item.authority_level === 'DESTRUCTIVE' ||
        item.proposed_authority_level === 'DESTRUCTIVE' ||
        item.execution_tools_allowed.some((tool) => AUTHORITY_TOOL_RE.test(tool)),
    ) ||
    requested.some((tool) => AUTHORITY_TOOL_RE.test(tool))
  ) {
    triggers.add('AUTHORITY_EXPANSION');
  }

  if (hasVerifiedEvidenceDisagreement(result)) {
    triggers.add('VERIFIED_EVIDENCE_DISAGREEMENT');
  }

  if (
    result.conflicts.some((conflict) => classifyConflict(conflict) === 'GENUINE_CANONICAL')
  ) {
    triggers.add('GENUINE_CANONICAL_CONFLICT');
  }

  if (HIGH_IMPACT_ARCHITECTURE_RE.test(haystack)) {
    triggers.add('HIGH_IMPACT_ARCHITECTURE');
  }

  if (EXPLICIT_REVIEW_RE.test(options.objective ?? result.objective)) {
    triggers.add('EXPLICIT_USER_REQUEST');
  }

  return [...triggers];
}

export function hasVerifiedEvidenceDisagreement(result: OrchestrationResult): boolean {
  const harness = result.verified_evidence.filter(
    (item) => item.authority === 'HARNESS_VERIFIED_EVIDENCE',
  );
  if (harness.length === 0) return false;
  const claims = [result.summary, ...result.decisions].join(' ');
  if (MATCH_CLAIM_RE.test(claims)) return true;
  return result.systems_findings.some(
    (finding) =>
      finding.kind === 'IMPLEMENTATION_MISMATCH' &&
      finding.evidence_records.some((item) => item.authority === 'HARNESS_VERIFIED_EVIDENCE') &&
      /no (?:true )?implementation mismatch|unsourced|not established/i.test(claims),
  );
}

export function shouldRequireReview(triggers: ReviewTrigger[]): boolean {
  return triggers.length > 0;
}

export function lookDevProposalDoesNotTriggerReview(result: OrchestrationResult): boolean {
  return detectReviewTriggers(result).length === 0;
}

export function creativeProposalDoesNotTriggerReview(result: OrchestrationResult): boolean {
  return detectReviewTriggers(result).length === 0;
}

export function buildReviewPacket(
  result: OrchestrationResult,
  triggers: ReviewTrigger[],
  index: CanonicalIndex,
  reviewId: string,
): ReviewPacket {
  const packages = result.work_packages.filter(
    (item) =>
      item.authority_level === 'IMPLEMENTATION' ||
      item.authority_level === 'CANONICAL_MUTATION' ||
      item.authority_level === 'DESTRUCTIVE',
  );
  const relevant = packages.length > 0 ? packages : result.work_packages.slice(0, 2);
  const ids = [
    ...relevant.flatMap((item) => [
      ...item.authorized_rule_ids,
      ...item.authorized_tech_ids,
    ]),
    ...result.systems_findings.flatMap((item) => item.canonical_ids),
    ...result.verified_evidence.flatMap((item) => item.canonical_ids),
    ...result.conflicts.flatMap((item) => item.affected_ids),
  ].filter((id, indexInList, all) => id && all.indexOf(id) === indexInList);
  const excerptIds = ids.slice(0, REVIEW_CANONICAL_EXCERPT_LIMIT);
  const excerpts = retrieveCanonical(index, { ids: excerptIds })
    .slice(0, REVIEW_CANONICAL_EXCERPT_LIMIT)
    .map((item) => ({ id: item.id, text: item.text }));
  const authority = relevant[0]?.authority_level ?? 'ADVISORY';
  return ReviewPacketSchema.parse({
    review_id: reviewId,
    triggers,
    objective: result.objective,
    artifact_kind: relevant.length === 1 ? 'work_package' : 'orchestration_result',
    artifact_ids: relevant.map((item) => item.id),
    astra_summary: result.summary,
    relevant_work_packages: relevant,
    relevant_canonical_ids: excerptIds,
    canonical_excerpts: excerpts,
    systems_findings: result.systems_findings.filter(
      (item) =>
        item.kind === 'IMPLEMENTATION_MISMATCH' ||
        item.kind === 'CANONICAL_COMPLETENESS_GAP' ||
        item.canonical_ids.some((id) => ids.includes(id)),
    ),
    verified_evidence: result.verified_evidence,
    research_evidence: selectResearchEvidenceForReview(
      result.research_evidence,
      collectReliedResearchEvidenceIds(result),
    ),
    risks: result.risks.slice(0, 8),
    conflicts: result.conflicts.filter(
      (conflict) => classifyConflict(conflict) === 'GENUINE_CANONICAL',
    ),
    authority_level: authority,
    canonical_version: result.canonical_version,
  });
}

export function formatReviewPacketInput(packet: ReviewPacket): string {
  return [
    `Review ${packet.review_id}.`,
    `Triggers: ${packet.triggers.join(', ')}`,
    `Objective: ${packet.objective}`,
    `Astra summary: ${packet.astra_summary}`,
    `Authority level: ${packet.authority_level}`,
    `Canonical version: ${packet.canonical_version}`,
    'Relevant WorkPackages:',
    JSON.stringify(
      packet.relevant_work_packages.map((item) => ({
        id: item.id,
        objective: item.objective,
        proposed_authority_level: item.proposed_authority_level,
        authority_level: item.authority_level,
        authorized_rule_ids: item.authorized_rule_ids,
        scope: item.scope,
        files_or_domains_allowed: item.files_or_domains_allowed,
        acceptance_criteria: item.acceptance_criteria,
        tests_required: item.tests_required,
        dependencies: item.dependencies,
        execution_tools_allowed: item.execution_tools_allowed,
      })),
    ),
    'Canonical excerpts:',
    packet.canonical_excerpts.map((item) => `${item.id}: ${item.text}`).join('\n'),
    'Systems findings:',
    JSON.stringify(
      packet.systems_findings.map((item) => ({
        kind: item.kind,
        summary: item.summary,
        canonical_ids: item.canonical_ids,
        evidence_records: item.evidence_records,
      })),
    ),
    'Harness-verified evidence:',
    JSON.stringify(packet.verified_evidence),
    'Research evidence relied on by the reviewed artifact only:',
    JSON.stringify(
      packet.research_evidence.map((item) => ({
        evidence_id: item.evidence_id,
        title: item.title,
        url: item.url,
        source_quality: item.source_quality,
        claims: item.claims,
        limitations: item.limitations,
      })),
    ),
    'Conflicts:',
    JSON.stringify(packet.conflicts),
    'Return only the structured ReviewerResponse schema.',
  ].join('\n');
}

export function applyReviewerVerdict(
  result: OrchestrationResult,
  review: ReviewerResponse,
  triggers: ReviewTrigger[],
  options: { conflictRoundsUsed: number; maxConflictRounds: number },
): { result: OrchestrationResult; queues: RunQueues } {
  const next: OrchestrationResult = {
    ...result,
    review_triggers: triggers,
    review_verdict: review.verdict,
    risks: [...result.risks, ...review.risks.filter((item) => !result.risks.includes(item))],
  };
  if (review.verdict === 'REVISE') {
    next.open_questions = [
      ...result.open_questions,
      {
        id: `review-revise-${review.review_id}`,
        reason: review.required_revisions[0] ?? review.summary,
        source: 'human_gate',
        kind: 'REVISION_REQUIRED',
      },
    ];
  }
  if (review.verdict === 'ESCALATE') {
    next.human_design_decisions = [
      ...result.human_design_decisions,
      {
        id: `review-escalate-${review.review_id}`,
        reason: [
          review.summary,
          ...review.findings.map((item) => item.summary),
        ].join(' | '),
        source: 'human_gate',
        kind: 'HUMAN_DESIGN_DECISION',
      },
    ];
    next.human_approvals_required = [
      ...result.human_approvals_required,
      `Reviewer escalated ${review.review_id}: ${review.summary}`,
    ];
  }
  const classified = classifyGovernance(next, options);
  if (review.verdict === 'REVISE' || review.verdict === 'ESCALATE') {
    classified.queues.implementation = [];
    classified.queues.execution_result = [];
  }
  return classified;
}

export function normalizeReviewerFindings(
  review: ReviewerResponse,
  result: OrchestrationResult,
): ReviewerResponse {
  const implementationDiffersFromCurrent = result.systems_findings.some(
    (item) => item.kind === 'IMPLEMENTATION_MISMATCH',
  );
  const modelClaimsMatch = MATCH_CLAIM_RE.test([result.summary, ...result.decisions].join(' '));
  return {
    ...review,
    findings: review.findings.map((finding) =>
      rewriteReviewerFindingKind(finding, {
        implementationDiffersFromCurrent,
        modelClaimsMatch,
      }),
    ),
  };
}

function rewriteReviewerFindingKind(
  finding: ReviewFinding,
  flags: {
    implementationDiffersFromCurrent: boolean;
    modelClaimsMatch: boolean;
  },
): ReviewFinding {
  const historicalOnly = /\bHIST-[A-Z0-9-]+\b/.test(
    [finding.summary, ...finding.evidence].join(' '),
  ) && /superseded|historical|stale/i.test([finding.summary, ...finding.evidence].join(' '));
  const currentCanonicalContradiction =
    finding.kind === 'CANONICAL_CONFLICT' &&
    looksLikeCurrentRuleContradiction(finding) &&
    !/STARTING_DECK|cards\.ts|implementation/i.test(
      [finding.summary, ...finding.evidence].join(' '),
    );
  const classified = classifyReviewerFindingKind({
    summary: finding.summary,
    evidence: finding.evidence,
    historicalOnly,
    currentCanonicalContradiction,
    modelClaimsMatch: flags.modelClaimsMatch,
    implementationDiffersFromCurrent: flags.implementationDiffersFromCurrent,
  });
  if (
    finding.kind === 'CANONICAL_CONFLICT' &&
    (classified === 'IMPLEMENTATION_MISMATCH' ||
      classified === 'NO_MATERIAL_ISSUE' ||
      classified === 'EVIDENCE_CONFLICT')
  ) {
    return { ...finding, kind: classified };
  }
  if (
    finding.kind === 'IMPLEMENTATION_MISMATCH' &&
    classified === 'EVIDENCE_CONFLICT'
  ) {
    return { ...finding, kind: classified };
  }
  return finding;
}

function looksLikeCurrentRuleContradiction(finding: ReviewFinding): boolean {
  const text = [finding.summary, ...finding.evidence].join(' ');
  const ids = text.match(/RULE-[A-Z0-9-]+/g) ?? [];
  const unique = [...new Set(ids)];
  return (
    unique.length >= 2 ||
    /two current (?:authoritative )?rules|current rules (?:contradict|incompatible)/i.test(text)
  );
}

