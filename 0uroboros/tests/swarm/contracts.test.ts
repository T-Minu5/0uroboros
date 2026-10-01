import { describe, expect, it } from 'vitest';

import {
  OrchestrationResultSchema,
  SpecialistAssignmentSchema,
  SpecialistResponseSchema,
  WorkPackageSchema,
} from '../../src/swarm/contracts';
import { validateSpecialistAssignment, validateSpecialistResponse } from '../../src/swarm/governance';
import { assignment, specialistResponse, testConfig, workPackage } from './fixtures';

describe('swarm contracts', () => {
  it('accepts a valid SpecialistAssignment', () => {
    expect(SpecialistAssignmentSchema.parse(assignment())).toMatchObject({
      assignment_id: 'asg-1',
      role: 'engineering',
    });
  });

  it('accepts a valid SpecialistResponse', () => {
    expect(SpecialistResponseSchema.parse(specialistResponse()).confidence).toBe(0.8);
  });

  it('rejects more recommendations than the assignment limit', () => {
    const asg = assignment({ proposal_limit: 1 });
    const response = specialistResponse({
      recommendations: [
        { title: 'One', rationale: 'a', priority: 'low' },
        { title: 'Two', rationale: 'b', priority: 'low' },
      ],
    });
    expect(() => validateSpecialistResponse(response, asg)).toThrow(/limit is 1/);
  });

  it('rejects confidence outside 0..1', () => {
    expect(() =>
      SpecialistResponseSchema.parse(specialistResponse({ confidence: 1.2 })),
    ).toThrow();
    expect(() =>
      SpecialistResponseSchema.parse(specialistResponse({ confidence: -0.1 })),
    ).toThrow();
  });

  it('rejects a malformed WorkPackage', () => {
    expect(() =>
      WorkPackageSchema.parse({
        ...workPackage(),
        acceptance_criteria: [],
      }),
    ).toThrow();
  });

  it('rejects a malformed OrchestrationResult', () => {
    expect(() =>
      OrchestrationResultSchema.parse({
        objective: 'HUD',
        summary: 'Plan',
      }),
    ).toThrow();
  });

  it('rejects assignments above the configured proposal maximum', () => {
    expect(() =>
      validateSpecialistAssignment(assignment({ proposal_limit: 5 }), {
        ...testConfig().budget,
        max_proposals_per_assignment: 3,
      }),
    ).toThrow(/exceeds configured maximum/);
  });
});
