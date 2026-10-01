import { describe, expect, it } from 'vitest';

import { AstraSynthesisSchema } from '../../src/swarm/contracts';
import { expandAstraSynthesis } from '../../src/swarm/governance';

const validSynthesis = {
  summary: 'Plan a HUD without implementing it.',
  decisions: ['Keep HUD advisory.'],
  specialists_consulted: ['product', 'ux', 'engineering'],
  work_package_intents: [
    {
      objective: 'Specify HUD contract fields',
      owner_role: 'engineering',
      scope: ['src/client'],
      acceptance_criteria: ['Contract fields are listed.'],
      tests_required: ['Contract fixtures'],
      authorized_rule_ids: ['RULE-VP-001'],
      authorized_tech_ids: ['TECH-CONTRACT-002'],
      dependencies: ['Game Contract'],
      approval_required: true,
    },
  ],
  candidate_notes: [
    {
      title: 'Show VP by default',
      rationale: 'RULE-VP-001',
      classification: 'RECOMMENDATION' as const,
      canonical_ids: ['RULE-VP-001'],
      approval_required: false,
    },
  ],
  contract_requests: [
    {
      summary: 'Node Power meaning is missing',
      missing_state: ['Node Power'],
    },
  ],
  conflicts: [],
  review_requests: [],
  risks: ['Inventing Node Power'],
  human_approvals_required: ['Approve HUD contract'],
};

describe('Astra synthesis contract', () => {
  it('accepts a lean model-owned synthesis', () => {
    expect(AstraSynthesisSchema.parse(validSynthesis).work_package_intents).toHaveLength(1);
  });

  it('rejects harness bookkeeping fields on the model contract', () => {
    expect(
      AstraSynthesisSchema.safeParse({
        ...validSynthesis,
        budget_usage: { max_turns: 10 },
      }).success,
    ).toBe(true);
    expect(AstraSynthesisSchema.parse(validSynthesis)).not.toHaveProperty('budget_usage');
    expect(AstraSynthesisSchema.parse(validSynthesis)).not.toHaveProperty('canonical_version');
  });

  it('rejects missing summary', () => {
    expect(() => AstraSynthesisSchema.parse({ ...validSynthesis, summary: '' })).toThrow();
  });

  it('lets the harness add IDs, timestamps, and empty execution tools', () => {
    const expanded = expandAstraSynthesis(AstraSynthesisSchema.parse(validSynthesis), {
      runId: 'run-test',
      createdAt: '2026-09-06T00:00:00.000Z',
      canonicalVersion: '2.0.0',
    });
    expect(expanded.work_packages[0]?.id).toBe('wp-run-test-1');
    expect(expanded.work_packages[0]?.execution_tools_allowed).toEqual([]);
    expect(expanded.candidate_proposals[0]?.created_at).toBe('2026-09-06T00:00:00.000Z');
    expect(expanded.candidate_proposals[0]?.runtime_run_id).toBe('run-test');
    expect(expanded.contract_requests[0]?.id).toBe('contract-run-test-1');
  });
});
