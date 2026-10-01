import { describe, expect, it } from 'vitest';

import { validateOrchestrationResult } from '../../src/swarm/governance';
import {
  classifyConflict,
  classifyContractRequest,
  classifyHumanGate,
  classifyGovernance,
  isValidContractRequest,
  normalizeSpecialistsConsulted,
} from '../../src/swarm/routing';
import { advisoryRoutingEligibility } from '../../src/swarm/leadRouting';
import { STARTER_RECONCILE_OBJECTIVE } from '../../src/swarm/evidence';
import { workPackage } from './fixtures';
import {
  HUD_SMOKE_CONTRACT_REQUESTS,
  HUD_SMOKE_CONFLICT,
  HUD_SMOKE_HUMAN_GATES,
  HUD_SMOKE_INVOKED_ROLES,
  HUD_SMOKE_SPECIALISTS_FROM_ASTRA,
  hudSmokeOrchestrationResult,
} from './hud-smoke-fixture';

describe('specialist invocation reporting', () => {
  it('counts each invoked specialist once by display name', () => {
    const normalized = normalizeSpecialistsConsulted([
      ...HUD_SMOKE_SPECIALISTS_FROM_ASTRA,
      ...HUD_SMOKE_INVOKED_ROLES,
    ]);
    expect(normalized.display_names).toEqual([
      'Product Lead',
      'UX Lead',
      'Lead Engineering',
    ]);
    expect(normalized.role_ids).toEqual(['product', 'ux', 'engineering']);
  });

  it('ignores Astra display names that were not actually invoked', () => {
    expect(normalizeSpecialistsConsulted(['ux'])).toEqual({
      display_names: ['UX Lead'],
      role_ids: ['ux'],
    });
  });
});

describe('HUD smoke approval audit', () => {
  const result = validateOrchestrationResult(hudSmokeOrchestrationResult());
  const { queues } = classifyGovernance(result, {
    conflictRoundsUsed: 0,
    maxConflictRounds: 2,
  });

  it('does not treat the ten smoke items as a single approval dump', () => {
    expect(queues.approval).toEqual([]);
    expect(queues.open_question).toHaveLength(1);
    expect(queues.dependency).toHaveLength(1);
    expect(queues.human_design_decision).toHaveLength(4);
  });

  it('classifies each smoke human gate', () => {
    expect(HUD_SMOKE_HUMAN_GATES.map(classifyHumanGate)).toEqual([
      'OPEN_QUESTION',
      'DEPENDENCY',
      'HUMAN_DESIGN_DECISION',
      'HUMAN_DESIGN_DECISION',
      'STANDING_REMINDER',
    ]);
  });

  it('keeps advisory WorkPackages off the Approval Queue', () => {
    expect(
      result.work_packages.every((item) => item.authority_level === 'ADVISORY'),
    ).toBe(true);
    expect(queues.approval.some((item) => item.source === 'work_package')).toBe(false);
  });
});

describe('HUD smoke contract request audit', () => {
  const classified = HUD_SMOKE_CONTRACT_REQUESTS.map(classifyContractRequest);

  it('does not keep the five HUD smoke requests on the Contract Request Queue', () => {
    expect(classified.every((request) => !isValidContractRequest(request))).toBe(true);
  });

  it('maps the UX kitchen-sink request to existing contract fields', () => {
    expect(classified[0]?.disposition).toBe('NEEDS_SYSTEMS');
    expect(classified[0]?.mapped_fields).toEqual(
      expect.arrayContaining([
        'match.cycle',
        'runtime.turn',
        'runtime.actions',
        'player.vp',
        'data_centers.primary',
        'nodes.power',
      ]),
    );
  });

  it('rejects formatted presentation derivatives', () => {
    const request = classifyContractRequest({
      id: 'contract-formatted-power',
      summary: 'Show Data Center power as 1,450 / 2,000',
      missing_state: ['1,450 / 2,000'],
      linked_provisional_mock_id: null,
    });
    expect(request.disposition).toBe('DERIVED_PRESENTATION');
    expect(isValidContractRequest(request)).toBe(false);
  });

  it('keeps a genuinely missing authoritative fact', () => {
    const request = classifyContractRequest({
      id: 'contract-hidden-chaos-bid',
      summary: 'Expose the unpublished Chaos bid secret for HUD scoring',
      missing_state: ['unpublished Chaos bid secret'],
      linked_provisional_mock_id: null,
    });
    expect(request.disposition).toBe('GENUINELY_MISSING');
    expect(isValidContractRequest(request)).toBe(true);
  });
});

describe('HUD smoke conflict audit', () => {
  it('classifies the Actions grouping dispute as cross-functional', () => {
    expect(classifyConflict(HUD_SMOKE_CONFLICT)).toBe('CROSS_FUNCTIONAL');
  });

  it('keeps genuine rule-meaning disputes on the Conflict Queue', () => {
    const { queues } = classifyGovernance(
      validateOrchestrationResult({
        ...hudSmokeOrchestrationResult(),
        conflicts: [
          {
            id: 'conflict-1',
            summary: 'Priority meaning is disputed',
            positions: ['UX wants a new state', 'Engineering says wait for Systems'],
            affected_ids: ['CONTRACT-001'],
            recommended_default: 'Escalate',
            escalated: false,
          },
        ],
        human_approvals_required: [],
        candidate_proposals: [],
        work_packages: [workPackage()],
        contract_requests: [],
      }),
      { conflictRoundsUsed: 2, maxConflictRounds: 2 },
    );
    expect(queues.conflict[0]?.kind).toBe('GENUINE_CANONICAL');
    expect(queues.conflict[0]?.escalated).toBe(true);
    expect(queues.approval.some((item) => item.id === 'conflict-1')).toBe(true);
  });
});

describe('starter reconciliation routing', () => {
  it('selects Systems and Engineering without Product, UX, or creative specialists', () => {
    expect(advisoryRoutingEligibility(STARTER_RECONCILE_OBJECTIVE)).toEqual({
      product: false,
      ux: false,
      engineering: true,
      systems: true,
      research: false,
      lookdev: false,
      content: false,
      worldbuilding: false,
    });
  });
});
