import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  classifyReviewerFindingKind,
  normalizeOrchestrationWorkPackages,
  normalizeWorkPackageAuthority,
} from '../../src/swarm/authority';
import { createArtifactStore, persistRunArtifacts } from '../../src/swarm/artifacts';
import { BudgetTracker } from '../../src/swarm/budget';
import { collectHarnessVerifiedEvidence } from '../../src/swarm/evidence';
import { assertPlanningOnly, validateOrchestrationResult } from '../../src/swarm/governance';
import {
  detectReviewTriggers,
  normalizeReviewerFindings,
  shouldRequireReview,
} from '../../src/swarm/review';
import { historicalCannotOverrideCurrent, startingDeckComposition } from '../../src/swarm/systems';
import { tempCwd, testCanonical, testConfig, workPackage } from './fixtures';
import { hudSmokeOrchestrationResult } from './hud-smoke-fixture';
import {
  REVIEWER_VALIDATION_LIVE_RUN_ID,
  liveDeckCorrectionWorkPackage,
  liveReviewerOrchestrationResult,
  liveReviewerResponse,
} from './reviewer-validation-fixture';

const index = testCanonical();
const evidence = collectHarnessVerifiedEvidence();

describe('WorkPackage authority normalization', () => {
  it('keeps Astra ADVISORY as proposed and raises a deck correction to IMPLEMENTATION', () => {
    const normalized = normalizeWorkPackageAuthority(liveDeckCorrectionWorkPackage(), {
      evidence,
    });
    expect(normalized.proposed_authority_level).toBe('ADVISORY');
    expect(normalized.authority_level).toBe('IMPLEMENTATION');
    expect(normalized.execution_tools_allowed).toEqual([]);
  });

  it('does not lower a higher proposed authority', () => {
    const normalized = normalizeWorkPackageAuthority(
      workPackage({
        objective: 'Plan HUD copy only.',
        scope: ['client HUD planning'],
        files_or_domains_allowed: ['src/client'],
        proposed_authority_level: 'IMPLEMENTATION',
        authority_level: 'IMPLEMENTATION',
      }),
      { evidence },
    );
    expect(normalized.authority_level).toBe('IMPLEMENTATION');
  });

  it('leaves ordinary HUD planning advisory', () => {
    const normalized = normalizeOrchestrationWorkPackages(
      validateOrchestrationResult(hudSmokeOrchestrationResult()),
    );
    expect(
      normalized.work_packages.every((item) => item.authority_level === 'ADVISORY'),
    ).toBe(true);
    expect(detectReviewTriggers(normalized)).toEqual([]);
  });
});

describe('Astra cannot suppress deterministic gates', () => {
  it('cannot hide implementation review behind an ADVISORY label', () => {
    const labeled = workPackage({
      objective: 'Correct STARTING_DECK in src/game/content/cards.ts to match RULE-DECK-001.',
      authorized_rule_ids: ['RULE-DECK-001'],
      scope: ['src/game/content/cards.ts'],
      files_or_domains_allowed: ['src/game/content/cards.ts'],
      proposed_authority_level: 'ADVISORY',
      authority_level: 'ADVISORY',
    });
    const normalized = normalizeWorkPackageAuthority(labeled, { evidence });
    expect(normalized.authority_level).toBe('IMPLEMENTATION');
    const result = liveReviewerOrchestrationResult({
      objective: 'Prepare the starting-deck correction.',
      work_packages: [normalized],
    });
    expect(detectReviewTriggers(result, { objective: result.objective })).toContain(
      'IMPLEMENTATION_CANDIDATE',
    );
    expect(detectReviewTriggers(result, { objective: result.objective })).not.toContain(
      'EXPLICIT_USER_REQUEST',
    );
  });

  it('cannot hide canonical-mutation review behind an ADVISORY label', () => {
    const labeled = workPackage({
      objective: 'Change RULE-DECK-001 to the historical 4/4/2 mix.',
      authorized_rule_ids: ['RULE-DECK-001'],
      scope: ['0uroboros_swarm_v2_0/canonical/rules.json'],
      files_or_domains_allowed: ['0uroboros_swarm_v2_0/canonical/rules.json'],
      proposed_authority_level: 'ADVISORY',
      authority_level: 'ADVISORY',
    });
    const normalized = normalizeWorkPackageAuthority(labeled);
    expect(normalized.authority_level).toBe('CANONICAL_MUTATION');
    expect(
      detectReviewTriggers(
        liveReviewerOrchestrationResult({
          objective: 'Prepare a rule edit.',
          work_packages: [normalized],
          systems_findings: [],
        }),
        { objective: 'Prepare a rule edit.' },
      ),
    ).toContain('CANONICAL_MUTATION');
  });

  it('cannot hide authority-expansion review behind an ADVISORY label', () => {
    const labeled = workPackage({
      objective: 'Plan HUD only.',
      proposed_authority_level: 'ADVISORY',
      authority_level: 'ADVISORY',
      execution_tools_allowed: [],
    });
    const normalized = normalizeWorkPackageAuthority(labeled, {
      requestedTools: ['shell', 'git_push'],
    });
    expect(normalized.authority_level).toBe('DESTRUCTIVE');
    expect(
      detectReviewTriggers(
        liveReviewerOrchestrationResult({
          objective: 'Plan HUD only.',
          work_packages: [normalized],
        }),
        { objective: 'Plan HUD only.', requestedTools: ['shell'] },
      ),
    ).toContain('AUTHORITY_EXPANSION');
  });

  it('cannot hide verified-evidence disagreement behind an ADVISORY label', () => {
    const result = liveReviewerOrchestrationResult({
      objective: 'Compare starting-deck implementation to RULE-DECK-001.',
      summary: 'Implementation already matches RULE-DECK-001. No current implementation mismatch.',
      decisions: ['4/4/2 is correct.'],
      work_packages: [
        workPackage({
          proposed_authority_level: 'ADVISORY',
          authority_level: 'ADVISORY',
        }),
      ],
    });
    expect(detectReviewTriggers(result, { objective: result.objective })).toContain(
      'VERIFIED_EVIDENCE_DISAGREEMENT',
    );
  });
});

describe('Reviewer finding taxonomy', () => {
  it('classifies 4/4/2 vs RULE-DECK-001 as IMPLEMENTATION_MISMATCH, not CANONICAL_CONFLICT', () => {
    const kind = classifyReviewerFindingKind({
      summary:
        'The current STARTING_DECK composition is 4 Character / 4 Crypto / 2 VP rather than the canonical 5 Character / 3 Crypto / 2 VP.',
      evidence: [
        'RULE-DECK-001 requires 5 Character, 3 Crypto, and 2 VP.',
        'src/game/content/cards.ts STARTING_DECK is 4/4/2.',
      ],
      implementationDiffersFromCurrent: true,
    });
    expect(kind).toBe('IMPLEMENTATION_MISMATCH');
    expect(kind).not.toBe('CANONICAL_CONFLICT');
  });

  it('reserves CANONICAL_CONFLICT for two current rules', () => {
    expect(
      classifyReviewerFindingKind({
        summary:
          'Two current authoritative rules specify incompatible values for the same starting-deck behavior.',
        evidence: ['RULE-DECK-001 requires 5/3/2.', 'A second current rule requires 4/4/2.'],
        currentCanonicalContradiction: true,
      }),
    ).toBe('CANONICAL_CONFLICT');
  });

  it('ignores superseded historical disagreement', () => {
    expect(
      historicalCannotOverrideCurrent(index, 'RULE-DECK-001', 'HIST-DECK-4-4-2'),
    ).toBe(true);
    expect(
      classifyReviewerFindingKind({
        summary: 'HIST-DECK-4-4-2 disagrees with RULE-DECK-001.',
        evidence: ['HIST-DECK-4-4-2 is superseded and stale.'],
        historicalOnly: true,
      }),
    ).toBe('NO_MATERIAL_ISSUE');
    expect(
      classifyReviewerFindingKind({
        summary: 'HIST-DECK-4-4-2 is a superseded historical source and does not match RULE-DECK-001.',
        evidence: ['Historical 4/4/2 is stale.'],
      }),
    ).not.toBe('CANONICAL_CONFLICT');
  });

  it('classifies model match claims against harness evidence as EVIDENCE_CONFLICT', () => {
    expect(
      classifyReviewerFindingKind({
        summary: 'Astra says implementation already matches RULE-DECK-001.',
        evidence: ['HARNESS_VERIFIED_EVIDENCE shows STARTING_DECK 4/4/2.'],
        modelClaimsMatch: true,
        implementationDiffersFromCurrent: true,
      }),
    ).toBe('EVIDENCE_CONFLICT');
  });
});

describe(`offline replay of ${REVIEWER_VALIDATION_LIVE_RUN_ID}`, () => {
  it('normalizes the live deck package, triggers Reviewer independently, and does not execute', () => {
    const live = liveReviewerOrchestrationResult();
    const normalized = normalizeOrchestrationWorkPackages(live);
    const deck = normalized.work_packages[0];
    expect(deck?.proposed_authority_level).toBe('ADVISORY');
    expect(deck?.authority_level).toBe('IMPLEMENTATION');

    const independent = detectReviewTriggers(
      { ...normalized, objective: 'Prepare the starting-deck correction.' },
      { objective: 'Prepare the starting-deck correction.' },
    );
    expect(independent).toContain('IMPLEMENTATION_CANDIDATE');
    expect(independent).not.toContain('EXPLICIT_USER_REQUEST');
    expect(shouldRequireReview(independent)).toBe(true);

    const withHistoricalTrigger = detectReviewTriggers(normalized, {
      objective: live.objective,
    });
    expect(withHistoricalTrigger).toContain('IMPLEMENTATION_CANDIDATE');
    expect(withHistoricalTrigger).toContain('EXPLICIT_USER_REQUEST');

    const rewritten = normalizeReviewerFindings(liveReviewerResponse(), normalized);
    expect(rewritten.findings[0]?.kind).toBe('IMPLEMENTATION_MISMATCH');
    expect(rewritten.findings[0]?.kind).not.toBe('CANONICAL_CONFLICT');
    expect(normalized.systems_findings[0]?.kind).toBe('CANONICAL_MATCH');

    const budget = new BudgetTracker(testConfig().budget);
    budget.consumeAgentCall('astra');
    budget.consumeAgentCall('specialist');
    budget.consumeAgentCall('specialist');
    expect(budget.snapshot().review_calls).toBe(0);
    budget.consumeAgentCall('reviewer');
    const finalUsage = budget.snapshot();
    expect(finalUsage.review_calls).toBe(1);
    expect(finalUsage.total_agent_calls).toBe(4);

    const cwd = tempCwd();
    const store = createArtifactStore(REVIEWER_VALIDATION_LIVE_RUN_ID, cwd);
    persistRunArtifacts(store, {
      manifest: {
        run_id: REVIEWER_VALIDATION_LIVE_RUN_ID,
        started_at: '2026-09-07T00:38:14.107Z',
        completed_at: '2026-09-07T00:39:14.600Z',
        duration_ms: 60493,
        canonical_version: '2.0.0',
        configured_models: { reviewer: 'gpt-5.6-sol' },
        actual_models: { reviewer: 'gpt-5.6-sol' },
        fallback_events: [],
        agents_invoked: ['Astra', 'Game Design Reviewer'],
        reviewer_invoked: true,
        work_packages_executed: [],
        status: 'completed',
        stop_reason: null,
      },
      workOrder: {
        id: `wo-${REVIEWER_VALIDATION_LIVE_RUN_ID}`,
        objective: live.objective,
        context: 'offline replay',
        constraints: [],
        acceptance_criteria: [],
        requested_expertise: [],
        out_of_scope: [],
        canonical_version: '2.0.0',
      },
      specialistResults: [],
      orchestrationResult: { ...normalized, budget_usage: finalUsage },
      queues: {
        candidate: [],
        review: [],
        contract_request: [],
        conflict: [],
        implementation: normalized.work_packages,
        approval: normalized.work_packages.map((item) => ({
          id: item.id,
          reason: `Normalized ${item.authority_level} WorkPackage`,
          source: 'work_package' as const,
        })),
        open_question: [],
        dependency: [],
        human_design_decision: [],
        execution_result: [],
      },
      usage: {
        run_id: REVIEWER_VALIDATION_LIVE_RUN_ID,
        requests: null,
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        review_calls: finalUsage.review_calls,
        reviewer_invoked: true,
        notes: ['Call counts are deterministic. Token counts stay null when the SDK omits them.'],
      },
      errors: [],
    });

    const persistedResult = JSON.parse(
      readFileSync(join(store.dir, 'orchestration-result.json'), 'utf8'),
    ) as { budget_usage: { review_calls: number }; work_packages: WorkPackageLike[] };
    const persistedManifest = JSON.parse(
      readFileSync(join(store.dir, 'manifest.json'), 'utf8'),
    ) as { reviewer_invoked: boolean; work_packages_executed: string[] };
    const persistedUsage = JSON.parse(readFileSync(join(store.dir, 'usage.json'), 'utf8')) as {
      review_calls: number;
      reviewer_invoked: boolean;
    };
    expect(persistedResult.budget_usage.review_calls).toBe(1);
    expect(persistedUsage.review_calls).toBe(1);
    expect(persistedManifest.reviewer_invoked).toBe(true);
    expect(persistedUsage.reviewer_invoked).toBe(true);
    expect(persistedManifest.work_packages_executed).toEqual([]);
    expect(persistedResult.work_packages[0]?.authority_level).toBe('IMPLEMENTATION');
    expect(existsSync(join(store.dir, 'review-result.json'))).toBe(true);
    expect(() => assertPlanningOnly()).toThrow(/Execution agents are not activated/);
  });

  it('does not change STARTING_DECK', () => {
    const impl = startingDeckComposition();
    expect(impl).toEqual({ character: 5, crypto: 3, vp: 2, total: 10 });
  });
});

type WorkPackageLike = { authority_level: string };
