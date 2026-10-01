import { describe, expect, it } from 'vitest';

import { createPlanningTeam, toolNames } from '../../src/swarm/agents';
import { BudgetTracker } from '../../src/swarm/budget';
import { BudgetExhaustedError } from '../../src/swarm/errors';
import {
  applyReviewerVerdict,
  assertReviewPacketCompleteness,
  buildReviewPacket,
  detectReviewTriggers,
  formatReviewPacketInput,
  reviewPacketAcceptanceCriteriaCount,
  shouldRequireReview,
  workPackageAcceptanceCriteriaCount,
} from '../../src/swarm/review';
import type { OrchestrationResult } from '../../src/swarm/contracts';
import { validateOrchestrationResult } from '../../src/swarm/governance';
import { collectHarnessVerifiedEvidence } from '../../src/swarm/evidence';
import { startingDeckCorrectionPackage } from '../../src/swarm/evidence';
import { classifyStartingDeckAuthority } from '../../src/swarm/systems';
import { proposal, testCanonical, testConfig, workPackage } from './fixtures';
import { HUD_SMOKE_CONFLICT, hudSmokeOrchestrationResult } from './hud-smoke-fixture';

const index = testCanonical();

function resultWith(overrides: Partial<OrchestrationResult> = {}) {
  return validateOrchestrationResult({
    ...hudSmokeOrchestrationResult(),
    ...overrides,
  });
}

describe('Reviewer gating', () => {
  it('does not require review for ordinary HUD planning', () => {
    const result = resultWith();
    expect(detectReviewTriggers(result, { objective: result.objective })).toEqual([]);
    expect(shouldRequireReview([])).toBe(false);
  });

  it('does not require review for a presentation choice', () => {
    const result = resultWith({
      objective: 'UX recommends a vertical Node Power arrangement.',
      candidate_proposals: [
        proposal({
          summary: 'Stack Player A Power above Location above Player B Power.',
          classification: 'RECOMMENDATION',
        }),
      ],
    });
    expect(detectReviewTriggers(result, { objective: result.objective })).toEqual([]);
  });

  it('requires review for canonical mutation', () => {
    const result = resultWith({
      candidate_proposals: [
        proposal({
          classification: 'POTENTIAL_RULE_CONFLICT',
          rules_changed: true,
          status: 'NEEDS_APPROVAL',
          human_approval_required: true,
          summary: 'Change RULE-DECK-001 starting mix.',
        }),
      ],
    });
    expect(detectReviewTriggers(result)).toContain('CANONICAL_MUTATION');
  });

  it('requires review for implementation promotion', () => {
    const result = resultWith({
      work_packages: [
        workPackage({
          authority_level: 'IMPLEMENTATION',
          approval_required: true,
          authorized_rule_ids: ['RULE-DECK-001'],
          scope: ['src/game/content/cards.ts'],
        }),
      ],
    });
    expect(detectReviewTriggers(result)).toContain('IMPLEMENTATION_CANDIDATE');
  });

  it('requires review when synthesis contradicts harness-verified evidence', () => {
    const result = resultWith({
      summary: 'No current implementation mismatch is established. Implementation already matches RULE-DECK-001.',
      decisions: ['Reject the 4/4/2 observation as unsourced.'],
      verified_evidence: collectHarnessVerifiedEvidence(),
      systems_findings: [classifyStartingDeckAuthority(index)],
    });
    expect(detectReviewTriggers(result)).toContain('VERIFIED_EVIDENCE_DISAGREEMENT');
  });

  it('requires review for authority expansion', () => {
    const result = resultWith({
      work_packages: [
        workPackage({
          authority_level: 'ADVISORY',
          execution_tools_allowed: ['shell', 'git_push'],
        }),
      ],
    });
    expect(
      detectReviewTriggers(result, { requestedTools: ['shell'] }),
    ).toContain('AUTHORITY_EXPANSION');
  });

  it('requires review for a genuine canonical conflict and not a stale source', () => {
    const genuine = resultWith({
      conflicts: [
        {
          id: 'conflict-invented-rules',
          summary: 'Two current rules contradict priority meaning.',
          positions: ['RULE-RUNTIME-014 says one thing', 'A second current rule says the opposite'],
          affected_ids: ['RULE-RUNTIME-014', 'RULE-PROB-007'],
          recommended_default: 'Escalate',
          escalated: true,
          kind: 'GENUINE_CANONICAL',
        },
      ],
    });
    expect(detectReviewTriggers(genuine)).toContain('GENUINE_CANONICAL_CONFLICT');

    const stale = resultWith({
      conflicts: [
        {
          id: 'conflict-stale-1',
          summary: 'HIST-DECK-4-4-2 is superseded and does not match current RULE-DECK-001.',
          positions: ['Historical 4/4/2', 'Current 5/3/2'],
          affected_ids: ['HIST-DECK-4-4-2'],
          recommended_default: 'Ignore the stale source.',
          escalated: false,
          kind: 'STALE_SOURCE',
        },
      ],
    });
    expect(detectReviewTriggers(stale)).not.toContain('GENUINE_CANONICAL_CONFLICT');
    expect(detectReviewTriggers(stale)).not.toContain('CANONICAL_MUTATION');
  });

  it('requires review when Mel explicitly asks', () => {
    const result = resultWith({
      objective: 'Treat promotion of that correction toward future implementation as review-gated.',
    });
    expect(detectReviewTriggers(result, { objective: result.objective })).toContain(
      'EXPLICIT_USER_REQUEST',
    );
  });
});

describe('ReviewPacket and verdict routing', () => {
  it('builds a bounded packet without the full canonical library', () => {
    const result = resultWith({
      work_packages: [
        workPackage({
          id: 'wp-deck',
          authority_level: 'IMPLEMENTATION',
          authorized_rule_ids: ['RULE-DECK-001'],
        }),
      ],
      verified_evidence: collectHarnessVerifiedEvidence(),
      systems_findings: [classifyStartingDeckAuthority(index)],
    });
    const packet = buildReviewPacket(result, ['IMPLEMENTATION_CANDIDATE'], index, 'rev-1');
    expect(packet.canonical_excerpts.length).toBeLessThanOrEqual(24);
    expect(packet.canonical_excerpts.length).toBeLessThan(index.items.length);
    expect(packet.verified_evidence[0]?.authority).toBe('HARNESS_VERIFIED_EVIDENCE');
    expect(packet.astra_summary).toBe(result.summary);
    const formatted = formatReviewPacketInput(packet);
    expect(formatted).toMatch(/acceptance_criteria/);
    expect(packet.verified_evidence.some((item) => item.source_location === 'CARD_DEFINITIONS')).toBe(
      true,
    );
    expect(() => assertReviewPacketCompleteness(packet, result)).not.toThrow();
    expect(reviewPacketAcceptanceCriteriaCount(packet)).toBe(
      workPackageAcceptanceCriteriaCount(packet.relevant_work_packages),
    );
  });

  it('rejects a starter ReviewPacket that omitted CARD_DEFINITIONS evidence', () => {
    const workPkg = startingDeckCorrectionPackage(
      'rev-complete',
      '2.0.0',
      collectHarnessVerifiedEvidence()[0]!,
    );
    const complete = resultWith({
      work_packages: [workPkg],
      verified_evidence: collectHarnessVerifiedEvidence(),
      systems_findings: [classifyStartingDeckAuthority(index)],
    });
    const completePacket = buildReviewPacket(
      complete,
      ['IMPLEMENTATION_CANDIDATE'],
      index,
      'rev-complete',
    );
    expect(() => assertReviewPacketCompleteness(completePacket, complete)).not.toThrow();
    expect(completePacket.canonical_excerpts.some((item) => item.id.startsWith('RULE-STARTER-'))).toBe(
      true,
    );
    const incomplete = resultWith({
      work_packages: [workPkg],
      verified_evidence: collectHarnessVerifiedEvidence().filter(
        (item) => item.source_location !== 'CARD_DEFINITIONS',
      ),
      systems_findings: [classifyStartingDeckAuthority(index)],
    });
    const incompletePacket = buildReviewPacket(
      incomplete,
      ['IMPLEMENTATION_CANDIDATE'],
      index,
      'rev-incomplete',
    );
    expect(() => assertReviewPacketCompleteness(incompletePacket, incomplete)).toThrow(
      /CARD_DEFINITIONS/,
    );
  });

  it('lets PASS continue without executing and blocks REVISE/ESCALATE advancement', () => {
    const result = resultWith({
      work_packages: [
        workPackage({
          id: 'wp-deck',
          authority_level: 'IMPLEMENTATION',
          approval_required: true,
        }),
      ],
    });
    const pass = applyReviewerVerdict(
      result,
      {
        review_id: 'rev-pass',
        verdict: 'PASS',
        summary: 'Correction package is bounded.',
        findings: [],
        required_revisions: [],
        risks: [],
        canonical_ids_referenced: ['RULE-DECK-001'],
        evidence_ids_referenced: [],
        confidence: 0.8,
      },
      ['IMPLEMENTATION_CANDIDATE'],
      { conflictRoundsUsed: 0, maxConflictRounds: 2 },
    );
    expect(pass.result.review_verdict).toBe('PASS');
    expect(pass.queues.implementation).toHaveLength(1);
    expect(pass.queues.execution_result).toEqual([]);

    const revise = applyReviewerVerdict(
      result,
      {
        review_id: 'rev-revise',
        verdict: 'REVISE',
        summary: 'Acceptance criteria are incomplete.',
        findings: [
          {
            kind: 'MISSING_ACCEPTANCE_CRITERIA',
            summary: 'Add a composition assertion.',
            evidence: ['wp-deck'],
          },
        ],
        required_revisions: ['Add a starting-deck composition test name.'],
        risks: [],
        canonical_ids_referenced: ['RULE-DECK-001'],
        evidence_ids_referenced: [],
        confidence: 0.7,
      },
      ['IMPLEMENTATION_CANDIDATE'],
      { conflictRoundsUsed: 0, maxConflictRounds: 2 },
    );
    expect(revise.queues.implementation).toEqual([]);
    expect(revise.result.open_questions.some((item) => item.kind === 'REVISION_REQUIRED')).toBe(
      true,
    );

    const escalate = applyReviewerVerdict(
      result,
      {
        review_id: 'rev-esc',
        verdict: 'ESCALATE',
        summary: 'Gameplay meaning is disputed.',
        findings: [
          {
            kind: 'CANONICAL_CONFLICT',
            summary: 'Do not resolve this in review.',
            evidence: ['RULE-DECK-001'],
          },
        ],
        required_revisions: [],
        risks: ['Ambiguity'],
        canonical_ids_referenced: ['RULE-DECK-001'],
        evidence_ids_referenced: [],
        confidence: 0.6,
      },
      ['IMPLEMENTATION_CANDIDATE'],
      { conflictRoundsUsed: 0, maxConflictRounds: 2 },
    );
    expect(escalate.queues.implementation).toEqual([]);
    expect(escalate.result.human_design_decisions.length).toBeGreaterThan(0);
  });
});

describe('Reviewer independence and budget', () => {
  it('is not an Astra tool and has no mutation or specialist tools', () => {
    const config = testConfig();
    const runtime = {
      budget: new BudgetTracker(config.budget),
      canonical: index,
      specialistResults: [],
      systemsResults: [],
      researchResults: [],
      lookdevResults: [],
      contentResults: [],
      worldbuildingResults: [],
      assignments: [],
      researchAssignments: [],
      lookdevAssignments: [],
      contentAssignments: [],
      worldbuildingAssignments: [],
      researchSourceMode: null,
      reviewerInvoked: false,
    };
    const team = createPlanningTeam(config, runtime);
    expect(toolNames(team.astra)).not.toContain('reviewer');
    expect(team.reviewer.tools).toEqual([]);
    expect(team.reviewer.handoffs).toEqual([]);
  });

  it('stops a second Reviewer call when MAX_REVIEW_CALLS is 1', () => {
    const tracker = new BudgetTracker({
      ...testConfig().budget,
      max_review_calls: 1,
      max_total_agent_calls: 8,
    });
    tracker.consumeAgentCall('reviewer');
    expect(() => tracker.consumeAgentCall('reviewer')).toThrow(BudgetExhaustedError);
    expect(tracker.exhausted).toBe('MAX_REVIEW_CALLS');
  });

  it('cannot be suppressed by an empty Astra review_requests list', () => {
    const result = resultWith({
      review_requests: [],
      work_packages: [workPackage({ authority_level: 'IMPLEMENTATION' })],
    });
    expect(detectReviewTriggers(result)).toContain('IMPLEMENTATION_CANDIDATE');
  });

  it('fires IMPLEMENTATION_CANDIDATE from a down-labeled deck correction without an explicit user request', () => {
    const result = resultWith({
      objective: 'Prepare the starting-deck correction.',
      work_packages: [
        workPackage({
          objective: 'Correct STARTING_DECK in src/game/content/cards.ts to match RULE-DECK-001.',
          authorized_rule_ids: ['RULE-DECK-001'],
          scope: ['src/game/content/cards.ts'],
          files_or_domains_allowed: ['src/game/content/cards.ts'],
          proposed_authority_level: 'ADVISORY',
          authority_level: 'ADVISORY',
        }),
      ],
      verified_evidence: collectHarnessVerifiedEvidence(),
    });
    const triggers = detectReviewTriggers(result, { objective: result.objective });
    expect(triggers).toContain('IMPLEMENTATION_CANDIDATE');
    expect(triggers).not.toContain('EXPLICIT_USER_REQUEST');
  });

  it('does not treat the HUD layout conflict as a review trigger', () => {
    const result = resultWith({ conflicts: [HUD_SMOKE_CONFLICT] });
    expect(detectReviewTriggers(result)).toEqual([]);
  });
});
