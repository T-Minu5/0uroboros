import { describe, expect, it } from 'vitest';

import {
  assertNoPlanningMutationTools,
  createPlanningTeam,
  SPECIALIST_TOOL_NAMES,
  toolNames,
} from '../../src/swarm/agents';
import { BudgetTracker } from '../../src/swarm/budget';
import { DEFAULT_ASTRA_MODEL, DEFAULT_ENGINEERING_MODEL, DEFAULT_SPECIALIST_MODEL } from '../../src/swarm/config';
import {
  AstraSynthesisSchema,
  ResearchResponseSchema,
  ReviewerResponseSchema,
  LookDevResponseSchema,
  ContentModelOutputSchema,
  WorldbuildingResponseSchema,
  SpecialistResponseSchema,
  SystemsResponseSchema,
} from '../../src/swarm/contracts';
import { validateSpecialistResponse } from '../../src/swarm/governance';
import { assignment, emptyRuntime, specialistResponse, testConfig } from './fixtures';

describe('swarm agent configuration', () => {
  const config = testConfig();
  const runtime = emptyRuntime({ budget: new BudgetTracker(config.budget) });
  const team = createPlanningTeam(config, runtime);

  it('routes Astra to the Astra model config', () => {
    expect(team.astra.model).toBe(DEFAULT_ASTRA_MODEL);
  });

  it('routes Product, UX, Systems, Research, LookDev, Content, and Worldbuilding to Terra', () => {
    expect(team.specialistAgents.product.model).toBe(DEFAULT_SPECIALIST_MODEL);
    expect(team.specialistAgents.ux.model).toBe(DEFAULT_SPECIALIST_MODEL);
    expect(team.specialistAgents.systems.model).toBe(DEFAULT_SPECIALIST_MODEL);
    expect(team.specialistAgents.research.model).toBe(DEFAULT_SPECIALIST_MODEL);
    expect(team.specialistAgents.lookdev.model).toBe(DEFAULT_SPECIALIST_MODEL);
    expect(team.specialistAgents.content.model).toBe(DEFAULT_SPECIALIST_MODEL);
    expect(team.specialistAgents.worldbuilding.model).toBe(DEFAULT_SPECIALIST_MODEL);
  });

  it('routes Engineering to Sol', () => {
    expect(team.specialistAgents.engineering.model).toBe(DEFAULT_ENGINEERING_MODEL);
  });

  it('gives specialists no agent-tools or handoffs', () => {
    expect(team.specialistAgents.product.tools).toEqual([]);
    expect(team.specialistAgents.ux.tools).toEqual([]);
    expect(team.specialistAgents.engineering.tools).toEqual([]);
    expect(team.specialistAgents.systems.tools).toEqual([]);
    expect(team.specialistAgents.research.handoffs).toEqual([]);
    expect(team.specialistAgents.product.handoffs).toEqual([]);
    expect(team.specialistAgents.ux.handoffs).toEqual([]);
    expect(team.specialistAgents.engineering.handoffs).toEqual([]);
    expect(team.specialistAgents.systems.handoffs).toEqual([]);
    expect(team.specialistAgents.lookdev.handoffs).toEqual([]);
    expect(team.specialistAgents.content.tools).toEqual([]);
    expect(team.specialistAgents.content.handoffs).toEqual([]);
    expect(team.specialistAgents.worldbuilding.tools).toEqual([]);
    expect(team.specialistAgents.worldbuilding.handoffs).toEqual([]);
  });

  it('registers the eight advisory specialist tools on Astra', () => {
    expect(toolNames(team.astra).sort()).toEqual(
      Object.values(SPECIALIST_TOOL_NAMES).slice().sort(),
    );
    expect(team.astra.handoffs).toEqual([]);
  });

  it('gives no planning agent filesystem mutation or shell tools', () => {
    assertNoPlanningMutationTools(team.astra);
    assertNoPlanningMutationTools(team.specialistAgents.product);
    assertNoPlanningMutationTools(team.specialistAgents.ux);
    assertNoPlanningMutationTools(team.specialistAgents.engineering);
    assertNoPlanningMutationTools(team.specialistAgents.systems);
    assertNoPlanningMutationTools(team.specialistAgents.research);
    assertNoPlanningMutationTools(team.specialistAgents.lookdev);
    assertNoPlanningMutationTools(team.specialistAgents.content);
    assertNoPlanningMutationTools(team.specialistAgents.worldbuilding);
    assertNoPlanningMutationTools(team.reviewer);
  });

  it('does not automatically register Reviewer on the planning path', () => {
    expect(toolNames(team.astra)).not.toContain('reviewer');
    expect(team.reviewer.name).toBe('Game Design Reviewer');
    expect(team.reviewer.model).toBe(DEFAULT_ENGINEERING_MODEL);
    expect(team.reviewer.outputType).toBe(ReviewerResponseSchema);
    expect(team.reviewer.tools).toEqual([]);
    expect(team.reviewer.handoffs).toEqual([]);
  });

  it('tells Astra authority labels are proposals and Reviewer about IMPLEMENTATION_MISMATCH', () => {
    expect(String(team.astra.instructions)).toMatch(/Authority labels are proposals/);
    expect(String(team.reviewer.instructions)).toMatch(/IMPLEMENTATION_MISMATCH/);
    expect(String(team.reviewer.instructions)).toMatch(
      /Historical or superseded rules and implementation disagreement are not canonical conflicts/,
    );
  });

  it('keeps structured SDK output on Astra and specialists', () => {
    expect(team.astra.outputType).toBe(AstraSynthesisSchema);
    expect(team.specialistAgents.product.outputType).toBe(SpecialistResponseSchema);
    expect(team.specialistAgents.ux.outputType).toBe(SpecialistResponseSchema);
    expect(team.specialistAgents.engineering.outputType).toBe(SpecialistResponseSchema);
    expect(team.specialistAgents.systems.outputType).toBe(SystemsResponseSchema);
    expect(team.specialistAgents.research.outputType).toBe(ResearchResponseSchema);
    expect(team.specialistAgents.lookdev.outputType).toBe(LookDevResponseSchema);
    expect(team.specialistAgents.content.outputType).toBe(ContentModelOutputSchema);
    expect(team.specialistAgents.worldbuilding.outputType).toBe(WorldbuildingResponseSchema);
  });

  it('round-trips assignment IDs and referenced canonical IDs', () => {
    const asg = assignment({ assignment_id: 'asg-roundtrip', role: 'ux' });
    const response = validateSpecialistResponse(
      specialistResponse({
        agent: 'ux',
        assignment_id: 'asg-roundtrip',
        canonical_ids_referenced: ['CONTRACT-001', 'UX-A11Y-001'],
      }),
      asg,
    );
    expect(response.assignment_id).toBe(asg.assignment_id);
    expect(response.canonical_ids_referenced).toEqual(['CONTRACT-001', 'UX-A11Y-001']);
  });
});
