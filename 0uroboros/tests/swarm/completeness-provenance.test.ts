import { describe, expect, it } from 'vitest';

import {
  applyHarnessVerifiedMismatches,
  assertCorrectionUnexecuted,
  collectHarnessVerifiedEvidence,
  formatVerifiedEvidence,
  mergeStarterCorrectionPackage,
  repositoryCannotOverrideCanonical,
  STARTER_RECONCILE_OBJECTIVE,
  startingDeckCorrectionPackage,
} from '../../src/swarm/evidence';
import { validateOrchestrationResult } from '../../src/swarm/governance';
import {
  classifyGovernance,
  classifyContractRequest,
  isValidContractRequest,
} from '../../src/swarm/routing';
import {
  APPROVED_REVEAL_SOURCE_PHRASES,
  classifyCanonicalCompleteness,
  classifyNodePowerTerminology,
  classifyStartingDeckAuthority,
  historicalCannotOverrideCurrent,
  recoveredQuestionIsClosed,
  reinterpretLiveSystemsFinding,
  replayOfflineSystemsValidation,
  routeSystemsFinding,
  startingDeckEvidence,
  contextOmissionDoesNotRetryPaidCall,
} from '../../src/swarm/systems';
import { testCanonical, testConfig, workPackage } from './fixtures';
import { hudSmokeOrchestrationResult } from './hud-smoke-fixture';
import {
  SYSTEMS_VALIDATION_ASTRA_DISCARD_DECISIONS,
  SYSTEMS_VALIDATION_LIVE_QUESTIONS,
  SYSTEMS_VALIDATION_LIVE_RUN_ID,
  systemsValidationLiveResponse,
} from './systems-validation-fixture';

const index = testCanonical();
const budget = testConfig().budget;

describe('canonical completeness versus rule ambiguity', () => {
  it('repairs a completeness gap when approved source phrases are present in current records', () => {
    const incomplete = {
      ...index,
      items: index.items.map((item) =>
        item.id === 'RULE-RUNTIME-008'
          ? { ...item, text: '`RULE-RUNTIME-008` Reveals use play order.' }
          : item,
      ),
    };
    const gap = classifyCanonicalCompleteness(
      incomplete,
      'RULE-RUNTIME-008',
      APPROVED_REVEAL_SOURCE_PHRASES['RULE-RUNTIME-008'] ?? [],
      true,
    );
    const recovered = classifyCanonicalCompleteness(
      index,
      'RULE-RUNTIME-008',
      APPROVED_REVEAL_SOURCE_PHRASES['RULE-RUNTIME-008'] ?? [],
      true,
    );
    expect(gap.kind).toBe('CANONICAL_COMPLETENESS_GAP');
    expect(recovered.kind).toBe('CANONICAL_MATCH');
    expect(routeSystemsFinding(gap, 'gap-1').planning).toEqual([]);
    expect(routeSystemsFinding(gap, 'gap-1').contract_requests).toEqual([]);
  });

  it('keeps canonical completeness distinct from rule ambiguity', () => {
    expect(classifyCanonicalCompleteness(index, 'RULE-UNANSWERED-001', ['never stated'], true).kind).toBe(
      'CANONICAL_COMPLETENESS_GAP',
    );
    expect(classifyCanonicalCompleteness(index, 'RULE-UNANSWERED-001', ['never stated'], false).kind).toBe(
      'RULE_AMBIGUITY',
    );
  });

  it('keeps genuine unanswered rules as RULE_AMBIGUITY', () => {
    const finding = reinterpretLiveSystemsFinding(
      {
        kind: 'RULE_AMBIGUITY',
        summary: 'Approved rules do not define Chaos no-repeat duration after Cycle 16.',
        evidence: ['Chaos catalog is deferred.'],
        evidence_records: [],
        canonical_ids: [],
        required_action: 'Human game-design decision.',
      },
      index,
    );
    expect(finding.kind).toBe('RULE_AMBIGUITY');
    expect(routeSystemsFinding(finding, 'chaos-repeat').planning[0]?.kind).toBe(
      'HUMAN_DESIGN_DECISION',
    );
  });

  it('classifies omitted Drain rules as CONTEXT_OMISSION rather than RULE_AMBIGUITY', () => {
    const finding = reinterpretLiveSystemsFinding(
      {
        kind: 'RULE_AMBIGUITY',
        summary: 'Approved Drain semantics for source card and targeted Data Center are unavailable.',
        evidence: ['Canonical excerpts provide only LookDev effect principles.'],
        evidence_records: [],
        canonical_ids: [],
        required_action: 'Human game-design decision.',
      },
      index,
      { suppliedCanonicalIds: ['LOOKDEV-EFFECT-001'] },
    );
    expect(finding.kind).toBe('CONTEXT_OMISSION');
    expect(finding.canonical_ids).toContain('RULE-DATA-002');
    expect(routeSystemsFinding(finding, 'drain-omission').planning).toEqual([]);
    expect(contextOmissionDoesNotRetryPaidCall()).toBe(true);
  });

  it('treats Drain as a canonical match when Drain rules were supplied', () => {
    const finding = reinterpretLiveSystemsFinding(
      {
        kind: 'RULE_AMBIGUITY',
        summary: 'Approved Drain semantics for source card and targeted Data Center are unavailable.',
        evidence: ['Canonical excerpts provide only LookDev effect principles.'],
        evidence_records: [],
        canonical_ids: [],
        required_action: 'Human game-design decision.',
      },
      index,
      {
        suppliedCanonicalIds: ['RULE-DATA-001', 'RULE-DATA-002', 'RULE-DATA-003', 'RULE-DATA-004', 'RULE-DATA-008'],
      },
    );
    expect(finding.kind).toBe('CANONICAL_MATCH');
    expect(routeSystemsFinding(finding, 'drain-supplied').planning).toEqual([]);
  });
});

describe('Node Power terminology', () => {
  it('treats Node Power as an alias, not a redundant contract field', () => {
    const finding = classifyNodePowerTerminology(index);
    expect(finding.kind).toBe('PRESENTATION_DECISION');
    expect(finding.canonical_ids).toEqual(['RULE-POWER-005', 'CONTRACT-008', 'UX-NODE-006']);
    const request = classifyContractRequest({
      id: 'cr-node-power',
      summary: 'Add node_power as an authoritative Game Contract field.',
      missing_state: ['node_power', 'Node Power', 'total power at a Node'],
      linked_provisional_mock_id: null,
    });
    expect(isValidContractRequest(request)).toBe(false);
    expect(request.disposition).not.toBe('GENUINELY_MISSING');
    expect(index.items.some((item) => item.id === 'CONTRACT-008' && /node_power/.test(item.text))).toBe(
      true,
    );
  });
});

describe('harness-verified evidence provenance', () => {
  it('attaches repository provenance that an LLM did not manufacture', () => {
    const evidence = startingDeckEvidence();
    expect(evidence).toMatchObject({
      evidence_type: 'REPOSITORY_OBSERVATION',
      source: 'src/game/content/cards.ts',
      source_location: 'STARTING_DECK',
      verified_by: 'HARNESS',
      observed_value: '5 Character / 3 Crypto / 2 VP',
      canonical_ids: ['RULE-DECK-001'],
      authority: 'HARNESS_VERIFIED_EVIDENCE',
    });
    expect(formatVerifiedEvidence([evidence])).toMatch(/HARNESS_VERIFIED_EVIDENCE/);
    expect(formatVerifiedEvidence([evidence])).not.toMatch(/MODEL_CLAIM"/);
  });

  it('cannot let repository or historical 4/4/2 override RULE-DECK-001', () => {
    const evidence = collectHarnessVerifiedEvidence()[0]!;
    expect(repositoryCannotOverrideCanonical(index, evidence)).toBe(true);
    expect(historicalCannotOverrideCurrent(index, 'RULE-DECK-001', 'HIST-DECK-4-4-2')).toBe(true);
    expect(classifyStartingDeckAuthority(index).kind).toBe('CANONICAL_MATCH');
  });

  it('survives Astra synthesis that discarded the mismatch as unsourced', () => {
    const discarded = validateOrchestrationResult({
      ...hudSmokeOrchestrationResult(),
      objective:
        'Replay discarded Systems mismatch against RULE-DECK-001 starting-deck implementation.',
      summary: SYSTEMS_VALIDATION_ASTRA_DISCARD_DECISIONS.join(' '),
      decisions: SYSTEMS_VALIDATION_ASTRA_DISCARD_DECISIONS,
      specialists_consulted: ['Lead Engineering', 'Systems / Rules'],
      work_packages: [],
      candidate_proposals: [],
      contract_requests: [],
      conflicts: [],
      systems_findings: [],
      human_approvals_required: [],
      open_questions: [],
      human_design_decisions: [],
    });
    const recovered = applyHarnessVerifiedMismatches(
      discarded,
      collectHarnessVerifiedEvidence(),
      index,
      SYSTEMS_VALIDATION_LIVE_RUN_ID,
    );
    expect(recovered.verified_evidence[0]?.authority).toBe('HARNESS_VERIFIED_EVIDENCE');
    expect(recovered.work_packages).toHaveLength(0);
    expect(() => assertCorrectionUnexecuted()).toThrow(/Execution agents are not activated/);

    const { result, queues } = classifyGovernance(recovered, {
      conflictRoundsUsed: 0,
      maxConflictRounds: 2,
    });
    expect(result.human_design_decisions.some((item) => /4 Character/.test(item.reason))).toBe(
      false,
    );
    expect(queues.contract_request).toEqual([]);
    expect(queues.conflict).toEqual([]);
    expect(queues.implementation).toHaveLength(0);
    expect(queues.execution_result).toEqual([]);
  });
});

describe(`offline replay of ${SYSTEMS_VALIDATION_LIVE_RUN_ID}`, () => {
  it('reclassifies the live Systems run without a paid API call', () => {
    const routed = replayOfflineSystemsValidation(
      systemsValidationLiveResponse(),
      index,
      SYSTEMS_VALIDATION_LIVE_RUN_ID,
    );
    expect(
      routed.findings.some(
        (item) => item.kind === 'CANONICAL_MATCH' && item.canonical_ids.includes('RULE-DECK-001'),
      ),
    ).toBe(true);
    expect(
      routed.findings.some(
        (item) =>
          item.kind === 'CANONICAL_MATCH' &&
          item.canonical_ids.some((id) => id.startsWith('RULE-RUNTIME-')),
      ),
    ).toBe(true);
    expect(
      routed.findings.some(
        (item) =>
          item.kind === 'PRESENTATION_DECISION' && item.canonical_ids.includes('CONTRACT-008'),
      ),
    ).toBe(true);
    expect(routed.findings.some((item) => item.kind === 'RULE_AMBIGUITY')).toBe(false);
    expect(routed.contract_requests.filter(isValidContractRequest)).toEqual([]);
    expect(routed.canonical_completeness_gaps).toEqual([]);
    expect(routed.planning.every((item) => item.kind !== 'HUMAN_DESIGN_DECISION')).toBe(true);
    expect(
      SYSTEMS_VALIDATION_LIVE_QUESTIONS.every((question) =>
        recoveredQuestionIsClosed(question, index),
      ),
    ).toBe(true);
  });
});

describe('prior HUD governance calibration remains intact', () => {
  it('keeps the smoke approval split unchanged', () => {
    const { queues } = classifyGovernance(
      validateOrchestrationResult(hudSmokeOrchestrationResult()),
      { conflictRoundsUsed: 0, maxConflictRounds: 2 },
    );
    expect(queues.approval).toEqual([]);
    expect(queues.open_question).toHaveLength(1);
    expect(queues.dependency).toHaveLength(1);
    expect(queues.human_design_decision).toHaveLength(4);
    expect(budget.max_conflict_rounds).toBe(2);
  });
});

describe('starter WorkPackage merge and routing', () => {
  it('collects composition, identity, Action, and Restore evidence', () => {
    const evidence = collectHarnessVerifiedEvidence(STARTER_RECONCILE_OBJECTIVE);
    expect(evidence.map((item) => item.source_location)).toEqual([
      'STARTING_DECK',
      'CARD_DEFINITIONS',
      'PlayerState/EffectOp',
      'healDataCenter',
    ]);
    expect(evidence[2]?.observed_value).toMatch(/PlayerState\.actions=true/);
    expect(evidence[3]?.observed_value).toMatch(/healed=100/);
  });

  it('merges a thin Astra starter WorkPackage with required Action and Restore scope', () => {
    const thin = workPackage({
      id: 'wp-thin-deck',
      objective: 'Align STARTING_DECK with RULE-DECK-001.',
      authority_level: 'IMPLEMENTATION',
      approval_required: true,
      authorized_rule_ids: ['RULE-DECK-001'],
      scope: ['src/game/content/cards.ts'],
      files_or_domains_allowed: ['src/game/content/cards.ts'],
      acceptance_criteria: ['STARTING_DECK is 5/3/2'],
      tests_required: ['composition'],
    });
    const recovered = applyHarnessVerifiedMismatches(
      validateOrchestrationResult({
        ...hudSmokeOrchestrationResult(),
        objective: STARTER_RECONCILE_OBJECTIVE,
        work_packages: [thin],
        systems_findings: [],
      }),
      collectHarnessVerifiedEvidence(STARTER_RECONCILE_OBJECTIVE),
      index,
      'run-thin-merge',
    );
    expect(recovered.work_packages[0]?.id).toBe('wp-thin-deck');
    expect(recovered.work_packages[0]?.scope).toEqual(['src/game/content/cards.ts']);
    expect(recovered.verified_evidence).toHaveLength(4);
    const factory = startingDeckCorrectionPackage(
      'run-thin-merge',
      recovered.canonical_version,
      recovered.verified_evidence[0]!,
    );
    const merged = mergeStarterCorrectionPackage(thin, factory);
    expect(merged.scope).toEqual(expect.arrayContaining(factory.scope));
    expect(merged.scope).toHaveLength(factory.scope.length);
  });

  it('does not let Astra prose pollute starter write scope', () => {
    const factory = startingDeckCorrectionPackage(
      'run-prose-scope',
      '2.0.0',
      collectHarnessVerifiedEvidence()[0]!,
    );
    const polluted = workPackage({
      id: 'wp-prose',
      objective: 'Align STARTING_DECK with RULE-DECK-001.',
      authority_level: 'IMPLEMENTATION',
      approval_required: true,
      authorized_rule_ids: ['RULE-DECK-001'],
      scope: [
        'src/game/content/cards.ts',
        'Existing engine card-deployment entry point — Action eligibility and accounting branches only',
      ],
      files_or_domains_allowed: [
        'src/game/content/cards.ts',
        'Automated test domains — Action initialization',
      ],
      acceptance_criteria: ['vague'],
      tests_required: ['Pre-authorization blocker: defer Action lifecycle'],
    });
    const merged = mergeStarterCorrectionPackage(polluted, factory);
    expect(merged.scope).toEqual([...factory.scope]);
    expect(merged.files_or_domains_allowed).toEqual([...factory.files_or_domains_allowed]);
    expect(merged.tests_required).toEqual([...factory.tests_required]);
    expect(merged.acceptance_criteria).toEqual([...factory.acceptance_criteria]);
  });
});
