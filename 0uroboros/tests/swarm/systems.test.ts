import { describe, expect, it } from 'vitest';

import { createPlanningTeam, SPECIALIST_TOOL_NAMES, toolNames } from '../../src/swarm/agents';
import { BudgetTracker } from '../../src/swarm/budget';
import { SystemsResponseSchema, type SystemsFinding } from '../../src/swarm/contracts';
import { validateOrchestrationResult } from '../../src/swarm/governance';
import {
  classifyConflict,
  classifyGovernance,
  normalizeSpecialistsConsulted,
} from '../../src/swarm/routing';
import {
  classifyFormattedPowerLabel,
  classifyControlledWeightImplementation,
  classifyStartingDeckAuthority,
  historicalCannotOverrideCurrent,
  implementationAssumptionsNote,
  actionEconomyEvidence,
  genericRestoreEvidence,
  routeSystemsFinding,
  routeSystemsResponse,
  shouldConsultSystems,
  startingDeckComposition,
} from '../../src/swarm/systems';
import { SYSTEMS_VALIDATION_OBJECTIVE } from '../../src/swarm/harness';
import { assignment, testCanonical, testConfig, workPackage } from './fixtures';
import { HUD_SMOKE_CONFLICT, hudSmokeOrchestrationResult } from './hud-smoke-fixture';

const index = testCanonical();

function systemsFinding(overrides: Partial<SystemsFinding> = {}): SystemsFinding {
  return {
    kind: 'CANONICAL_MATCH',
    summary: 'Canonical match',
    evidence: ['RULE-DECK-001'],
    evidence_records: [],
    canonical_ids: ['RULE-DECK-001'],
    required_action: 'None',
    ...overrides,
  };
}

describe('Systems routing availability', () => {
  it('exposes STARTING_DECK composition as harness evidence, not canonical authority', () => {
    expect(implementationAssumptionsNote()).toMatch(/5 Character \/ 3 Crypto \/ 2 VP/);
    expect(implementationAssumptionsNote()).toMatch(/HARNESS_VERIFIED_EVIDENCE/);
    expect(implementationAssumptionsNote()).toMatch(/HIST-DECK-4-4-2 is superseded/);
  });

  it('is available for a rules-semantic objective', () => {
    expect(shouldConsultSystems(SYSTEMS_VALIDATION_OBJECTIVE)).toBe(true);
    const runtime = {
      budget: new BudgetTracker(testConfig().budget),
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
    const team = createPlanningTeam(testConfig(), runtime);
    expect(toolNames(team.astra)).toContain(SPECIALIST_TOOL_NAMES.systems);
  });

  it('is not mandatory for a purely visual objective', () => {
    expect(
      shouldConsultSystems(
        'Choose typography, shader accents, and animation aesthetics for the marketing menu.',
      ),
    ).toBe(false);
  });
});

describe('Systems recursion and tools', () => {
  it('has no specialist tools, handoffs, or execution tools', () => {
    const runtime = {
      budget: new BudgetTracker(testConfig().budget),
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
    const systems = createPlanningTeam(testConfig(), runtime).specialistAgents.systems;
    expect(systems.tools).toEqual([]);
    expect(systems.handoffs).toEqual([]);
    expect(systems.outputType).toBe(SystemsResponseSchema);
  });
});

describe('canonical starting-deck authority', () => {
  it('classifies the approved 5/3/2 STARTING_DECK as a canonical match', () => {
    const impl = startingDeckComposition();
    expect(impl).toEqual({ character: 5, crypto: 3, vp: 2, total: 10 });
    const finding = classifyStartingDeckAuthority(index);
    expect(finding.kind).toBe('CANONICAL_MATCH');
    expect(finding.kind).not.toBe('RULE_AMBIGUITY');
    expect(finding.canonical_ids).toEqual(['RULE-DECK-001']);
    expect(finding.evidence_records[0]?.authority).toBe('HARNESS_VERIFIED_EVIDENCE');
  });

  it('classifies controlledWeight implementation against RULE-PROB-007', () => {
    const finding = classifyControlledWeightImplementation(index);
    expect(finding.kind).toBe('CANONICAL_MATCH');
    expect(finding.canonical_ids).toEqual(['RULE-PROB-007', 'RULE-RUNTIME-014']);
    expect(finding.evidence_records[0]?.source).toBe('src/game/engine/power.ts');
  });

  it('does not let HIST-DECK-4-4-2 override RULE-DECK-001', () => {
    expect(historicalCannotOverrideCurrent(index, 'RULE-DECK-001', 'HIST-DECK-4-4-2')).toBe(
      true,
    );
    expect(classifyStartingDeckAuthority(index).kind).toBe('CANONICAL_MATCH');
  });
});

describe('Systems presentation versus contract', () => {
  it('treats a formatted Data Center label as PRESENTATION_DECISION', () => {
    const finding = classifyFormattedPowerLabel('1,450 / 2,000');
    expect(finding.kind).toBe('PRESENTATION_DECISION');
    expect(routeSystemsFinding(finding, 'systems-formatted').contract_requests).toEqual([]);
  });

  it('keeps a genuine contract gap', () => {
    const finding = systemsFinding({
      kind: 'CONTRACT_GAP',
      summary: 'Approved rules require an unpublished Chaos bid secret on the Game Contract.',
      evidence: ['unpublished Chaos bid secret'],
      canonical_ids: [],
      required_action: 'Request the missing authoritative field.',
    });
    const routed = routeSystemsFinding(finding, 'systems-chaos-bid');
    expect(routed.contract_requests).toHaveLength(1);
    expect(routed.contract_requests[0]?.disposition).toBe('GENUINELY_MISSING');
  });
});

describe('Systems ambiguity and ordinary disagreement', () => {
  it('returns RULE_AMBIGUITY without inventing event order', () => {
    const finding = systemsFinding({
      kind: 'RULE_AMBIGUITY',
      summary:
        'The current approved rules do not define relative ordering between effect X and effect Y.',
      evidence: ['RULE-AAA-001', 'RULE-BBB-004'],
      canonical_ids: [],
      required_action: 'Human game-design decision.',
    });
    const routed = routeSystemsFinding(finding, 'systems-order');
    expect(finding.kind).toBe('RULE_AMBIGUITY');
    expect(routed.planning[0]?.kind).toBe('HUMAN_DESIGN_DECISION');
    expect(routed.contract_requests).toEqual([]);
  });

  it('does not turn a UX layout preference into a Systems rule conflict', () => {
    expect(classifyConflict(HUD_SMOKE_CONFLICT)).toBe('CROSS_FUNCTIONAL');
    expect(shouldConsultSystems('Adjust the HUD header typography and visual hierarchy only.')).toBe(
      false,
    );
  });
});

describe('Systems governance integration', () => {
  it('reports Systems / Rules once when invoked', () => {
    expect(normalizeSpecialistsConsulted(['systems', 'Systems / Rules'])).toEqual({
      display_names: ['Systems / Rules'],
      role_ids: ['systems'],
    });
  });

  it('routes Systems ambiguity onto planning state, not Approval or Conflict', () => {
    const response = SystemsResponseSchema.parse({
      agent: 'systems',
      assignment_id: assignment({ role: 'systems' }).assignment_id,
      summary: 'Deck mismatch and one unresolved ordering question.',
      rule_findings: [classifyStartingDeckAuthority(index)],
      implementation_mismatches: [classifyStartingDeckAuthority(index)],
      presentation_distinctions: [classifyFormattedPowerLabel('1,450 / 2,000')],
      ambiguities: [
        systemsFinding({
          kind: 'RULE_AMBIGUITY',
          summary: 'Two required gameplay events have no defined relative ordering.',
          required_action: 'Human game-design decision.',
        }),
      ],
      open_questions: ['Does reveal-priority equal Runtime.priority?'],
      recommendations: [],
      canonical_ids_referenced: ['RULE-DECK-001'],
      fixtures: [],
      risks: [],
      confidence: 0.9,
    });
    const routed = routeSystemsResponse(response, 'run-test');
    const result = validateOrchestrationResult({
      ...hudSmokeOrchestrationResult(),
      work_packages: [workPackage({ approval_required: true, authority_level: 'ADVISORY' })],
      candidate_proposals: [],
      human_approvals_required: [],
      conflicts: [HUD_SMOKE_CONFLICT],
      contract_requests: routed.contract_requests,
      systems_findings: routed.findings,
      open_questions: routed.planning.filter((item) => item.kind === 'OPEN_QUESTION'),
      human_design_decisions: routed.planning.filter(
        (item) => item.kind === 'HUMAN_DESIGN_DECISION',
      ),
    });
    const { queues } = classifyGovernance(result, {
      conflictRoundsUsed: 0,
      maxConflictRounds: 2,
    });
    expect(queues.approval).toEqual([]);
    expect(queues.conflict).toEqual([]);
    expect(queues.human_design_decision.some((item) => item.source === 'systems')).toBe(true);
    expect(queues.open_question.some((item) => item.source === 'systems')).toBe(true);
    expect(routed.findings.some((item) => item.kind === 'CANONICAL_MATCH')).toBe(true);
    expect(routed.findings.some((item) => item.kind === 'PRESENTATION_DECISION')).toBe(true);
  });
});

describe('starter engine evidence', () => {
  it('observes Action state and unnamed Restore fallback', () => {
    const actions = actionEconomyEvidence();
    const restore = genericRestoreEvidence();
    expect(actions.observed_value).toMatch(/PlayerState\.actions=true/);
    expect(actions.observed_value).toMatch(/gainActions in CARD_DEFINITIONS ops=true/);
    expect(restore.observed_value).toMatch(/healed=100/);
    expect(restore.canonical_ids).toEqual(expect.arrayContaining(['RULE-DATA-005', 'RULE-STARTER-006']));
  });
});
