import { describe, expect, it } from 'vitest';

import { BudgetTracker } from '../../src/swarm/budget';
import { BudgetExhaustedError } from '../../src/swarm/errors';
import {
  assertPlanningOnly,
  routeQueues,
  sanitizeWorkPackage,
  validateCanonicalFreshness,
  validateCanonicalIds,
  validateOrchestrationResult,
  validateSpecialistResponse,
} from '../../src/swarm/governance';
import { assignment, proposal, specialistResponse, testCanonical, testConfig, workPackage } from './fixtures';

describe('swarm governance', () => {
  const index = testCanonical();
  const budget = testConfig().budget;

  it('enforces specialist-call and total-call budgets', () => {
    const tracker = new BudgetTracker({
      ...budget,
      max_specialist_calls: 1,
      max_total_agent_calls: 2,
    });
    tracker.consumeAgentCall('astra');
    tracker.consumeAgentCall('specialist');
    expect(() => tracker.consumeAgentCall('specialist')).toThrow(BudgetExhaustedError);
    expect(tracker.exhausted).toBe('MAX_SPECIALIST_CALLS_PER_RUN');

    const total = new BudgetTracker({
      ...budget,
      max_specialist_calls: 8,
      max_total_agent_calls: 1,
    });
    total.consumeAgentCall('astra');
    expect(() => total.consumeAgentCall('specialist')).toThrow(/MAX_TOTAL_AGENT_CALLS/);
  });

  it('rejects unknown canonical IDs when required', () => {
    expect(() => validateCanonicalIds(['RULE-FAKE-999'], index, true)).toThrow(
      /Unknown canonical IDs/,
    );
    expect(validateCanonicalIds(['RULE-VP-001'], index, true)).toEqual([]);
  });

  it('detects stale canonical versions', () => {
    expect(() => validateCanonicalFreshness('1.0.0', ['RULE-VP-001'], index)).toThrow(
      /does not match current/,
    );
    expect(() => validateCanonicalFreshness('2.0.0', ['RULE-GONE-001'], index)).toThrow(
      /missing or superseded/,
    );
    expect(validateCanonicalFreshness('2.0.0', ['RULE-VP-001'], index)).toBe('CURRENT');
  });

  it('places authority-gated WorkPackages on the Approval Queue', () => {
    const result = validateOrchestrationResult({
      objective: 'HUD',
      summary: 'Plan only',
      decisions: ['Keep HUD advisory'],
      specialists_consulted: ['product'],
      work_packages: [
        workPackage({
          id: 'wp-approve',
          approval_required: true,
          authority_level: 'IMPLEMENTATION',
        }),
      ],
      candidate_proposals: [proposal({ human_approval_required: true, queue_target: 'APPROVAL' })],
      contract_requests: [],
      conflicts: [],
      review_requests: [],
      risks: ['Scope creep'],
      human_approvals_required: ['Confirm HUD copy'],
      canonical_version: '2.0.0',
      budget_usage: {
        ...budget,
        turns_used: 1,
        total_agent_calls: 1,
        specialist_calls: 0,
        review_calls: 0,
        conflict_rounds: 0,
        retries: 0,
        exhausted: null,
      },
    });
    const queues = routeQueues(result, 0, 2);
    expect(queues.approval.some((item) => item.id === 'wp-approve')).toBe(true);
    expect(queues.approval.some((item) => item.reason === 'Confirm HUD copy')).toBe(false);
    expect(queues.human_design_decision.some((item) => item.reason === 'Confirm HUD copy')).toBe(
      true,
    );
    expect(queues.execution_result).toEqual([]);
  });

  it('never executes WorkPackages', () => {
    expect(() => assertPlanningOnly()).toThrow(/not activated/);
    expect(sanitizeWorkPackage(workPackage({ execution_tools_allowed: ['shell'] })).execution_tools_allowed).toEqual(
      [],
    );
  });

  it('enforces proposal limits on specialist responses', () => {
    expect(() =>
      validateSpecialistResponse(
        specialistResponse({
          recommendations: [
            { title: 'A', rationale: 'a', priority: 'low' },
            { title: 'B', rationale: 'b', priority: 'low' },
          ],
        }),
        assignment({ proposal_limit: 1 }),
      ),
    ).toThrow(/limit is 1/);
  });
});
