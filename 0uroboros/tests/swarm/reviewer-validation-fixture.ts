import type {
  OrchestrationResult,
  ReviewerResponse,
  WorkPackage,
} from '../../src/swarm/contracts';
import { collectHarnessVerifiedEvidence } from '../../src/swarm/evidence';
import { validateOrchestrationResult } from '../../src/swarm/governance';
import { classifyStartingDeckAuthority } from '../../src/swarm/systems';
import { testCanonical, testConfig, workPackage } from './fixtures';

export const REVIEWER_VALIDATION_LIVE_RUN_ID =
  'run-2026-09-07T00-38-14-107Z-35d0a5a6';

const budget = testConfig().budget;
const index = testCanonical();

/** Live starting-deck correction WorkPackage, including Astra's ADVISORY label. */
export function liveDeckCorrectionWorkPackage(): WorkPackage {
  return workPackage({
    id: `wp-${REVIEWER_VALIDATION_LIVE_RUN_ID}-1`,
    objective:
      'Correct the verified starting-deck composition mismatch against RULE-DECK-001 in a future authorized implementation run.',
    owner_role: 'engineering',
    authorized_rule_ids: ['RULE-DECK-001'],
    authorized_tech_ids: [],
    scope: [
      'Begin at src/game/content/cards.ts:STARTING_DECK and inspect its consumers to establish how both players receive their initial decks.',
      'Make the smallest composition correction from 4 Character / 4 Crypto / 2 VP to 5 Character / 3 Crypto / 2 VP.',
    ],
    files_or_domains_allowed: [
      'Begin at src/game/content/cards.ts:STARTING_DECK and inspect its consumers to establish how both players receive their initial decks.',
      'Make the smallest composition correction from 4 Character / 4 Crypto / 2 VP to 5 Character / 3 Crypto / 2 VP.',
    ],
    dependencies: [
      'Mandatory review before promotion toward implementation.',
      'Explicit authorization for a separate future implementation run.',
    ],
    acceptance_criteria: [
      'The starting-deck definition contains exactly 10 cards: 5 Character, 3 Crypto, and 2 VP.',
    ],
    tests_required: [
      'Assert STARTING_DECK totals 10 cards with category counts exactly 5/3/2.',
    ],
    proposed_authority_level: 'ADVISORY',
    authority_level: 'ADVISORY',
    approval_required: true,
    execution_tools_allowed: [],
    canonical_version: '2.0.0',
  });
}

export function liveReviewerResponse(): ReviewerResponse {
  return {
    review_id: `rev-${REVIEWER_VALIDATION_LIVE_RUN_ID}`,
    verdict: 'PASS_WITH_NOTES',
    summary:
      'The harness-verified implementation conflicts with RULE-DECK-001, and the advisory WorkPackage appropriately bounds a future correction without authorizing execution.',
    findings: [
      {
        kind: 'CANONICAL_CONFLICT',
        summary:
          'The current STARTING_DECK composition is 4 Character / 4 Crypto / 2 VP rather than the canonical 5 Character / 3 Crypto / 2 VP.',
        evidence: [
          'RULE-DECK-001 requires both players to start with 5 Character, 3 Crypto, and 2 VP cards.',
          'Harness-verified src/game/content/cards.ts:STARTING_DECK contains 4 Character, 4 Crypto, and 2 VP cards.',
        ],
      },
    ],
    required_revisions: [],
    risks: [
      'Promotion and execution remain separately review-gated and are not authorized by this verdict.',
    ],
    canonical_ids_referenced: ['RULE-DECK-001'],
    evidence_ids_referenced: ['src/game/content/cards.ts:STARTING_DECK'],
    confidence: 0.99,
  };
}

export function liveReviewerOrchestrationResult(
  overrides: Partial<OrchestrationResult> = {},
): OrchestrationResult {
  return validateOrchestrationResult({
    objective:
      'Review the current starting-deck implementation against the approved 0uroboros starting-deck rule and prepare it for a future implementation correction. Treat promotion of that correction toward future implementation as review-gated.',
    summary:
      'Verified implementation mismatch: src/game/content/cards.ts at STARTING_DECK defines 4 Character / 4 Crypto / 2 VP, while approved canonical v2.0.0 RULE-DECK-001 requires 5 Character / 3 Crypto / 2 VP.',
    decisions: [
      'RULE-DECK-001 governs the correction. HIST-DECK-4-4-2 is superseded and has zero authority.',
      'This is an implementation mismatch, not a canonical ambiguity or rule conflict.',
    ],
    specialists_consulted: ['Lead Engineering', 'Systems / Rules'],
    work_packages: [liveDeckCorrectionWorkPackage()],
    candidate_proposals: [],
    contract_requests: [],
    conflicts: [],
    review_requests: [],
    risks: [],
    human_approvals_required: [],
    systems_findings: [classifyStartingDeckAuthority(index)],
    verified_evidence: collectHarnessVerifiedEvidence(),
    review_triggers: ['EXPLICIT_USER_REQUEST'],
    review_verdict: 'PASS_WITH_NOTES',
    canonical_version: '2.0.0',
    budget_usage: {
      ...budget,
      turns_used: 0,
      total_agent_calls: 3,
      specialist_calls: 2,
      review_calls: 0,
      conflict_rounds: 0,
      retries: 0,
      exhausted: null,
    },
    ...overrides,
  });
}
