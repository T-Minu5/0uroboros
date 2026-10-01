import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PlanningRuntimeContext } from '../../src/swarm/agents';
import { BudgetTracker } from '../../src/swarm/budget';
import { resolveSwarmConfig, type SwarmConfig } from '../../src/swarm/config';
import {
  type ProposalEnvelope,
  type SpecialistAssignment,
  type SpecialistResponse,
  type WorkPackage,
} from '../../src/swarm/contracts';
import { loadCanonicalIndex } from '../../src/swarm/context';

export function testConfig(env: Record<string, string | undefined> = {}): SwarmConfig {
  return resolveSwarmConfig({
    OPENAI_API_KEY: 'sk-test-not-real',
    ALLOW_MODEL_FALLBACK: 'false',
    ...env,
  });
}

export function testCanonical() {
  return loadCanonicalIndex(join(process.cwd(), '0uroboros_swarm_v2_0'));
}

export function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), 'ouroboros-swarm-'));
}

export function emptyRuntime(
  overrides: Partial<PlanningRuntimeContext> = {},
): PlanningRuntimeContext {
  return {
    budget: new BudgetTracker(testConfig().budget),
    canonical: testCanonical(),
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
    worldKnowledgePacket: undefined,
    researchSourceMode: null,
    reviewerInvoked: false,
    specialistFailures: [],
    ...overrides,
  };
}

export function assignment(
  overrides: Partial<SpecialistAssignment> = {},
): SpecialistAssignment {
  return {
    assignment_id: 'asg-1',
    work_order_id: 'wo-1',
    role: 'engineering',
    objective: 'Assess HUD feasibility.',
    canonical_context_ids: ['CONTRACT-001', 'TECH-CONTRACT-002'],
    context_excerpt_refs: [],
    questions: ['What state is already exposed?'],
    constraints: ['Do not invent rules.'],
    expected_output: ['Feasibility notes'],
    proposal_limit: 3,
    authority_boundary: 'Advisory planning only.',
    ...overrides,
  };
}

export function specialistResponse(
  overrides: Partial<SpecialistResponse> = {},
): SpecialistResponse {
  return {
    agent: 'engineering',
    assignment_id: 'asg-1',
    summary: 'HUD can consume existing contract fields.',
    findings: ['CONTRACT-001 already requires authoritative values.'],
    recommendations: [
      {
        title: 'Bind HUD to contract fields',
        rationale: 'Avoid a second rules engine.',
        priority: 'high',
      },
    ],
    risks: ['Missing reveal-priority presentation details.'],
    assumptions: ['Phase 1 table already tracks VP and Actions.'],
    dependencies: ['Game Contract fixtures'],
    open_questions: [],
    canonical_ids_referenced: ['CONTRACT-001'],
    confidence: 0.8,
    ...overrides,
  };
}

export function workPackage(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    id: 'wp-hud-1',
    objective: 'Plan the first player HUD.',
    owner_role: 'engineering',
    authorized_rule_ids: ['RULE-VP-001'],
    authorized_tech_ids: ['TECH-CONTRACT-002'],
    scope: ['client HUD planning'],
    files_or_domains_allowed: ['src/client'],
    dependencies: ['Game Contract'],
    acceptance_criteria: ['HUD fields are listed and sourced from contract.'],
    tests_required: ['Contract fixture coverage'],
    authority_level: 'ADVISORY',
    approval_required: false,
    execution_tools_allowed: [],
    canonical_version: '2.0.0',
    ...overrides,
  };
}

export function proposal(overrides: Partial<ProposalEnvelope> = {}): ProposalEnvelope {
  return {
    id: 'prop-1',
    canonical_version: '2.0.0',
    created_at: '2026-09-06T00:00:00.000Z',
    agent: 'ux',
    classification: 'RECOMMENDATION',
    authority: 'UX',
    status: 'DRAFT',
    rules_changed: false,
    requirements_touched: ['UX-A11Y-001'],
    contracts_required: ['CONTRACT-001'],
    summary: 'Show VP without color-only encoding.',
    rationale: 'Critical state cannot rely on color alone.',
    risks: ['Clutter if every meter is equally loud.'],
    provenance: ['04_UX_LOOKDEV_DESIGN_SYSTEM.md'],
    stale_check_status: 'CURRENT',
    human_approval_required: false,
    queue_target: 'CANDIDATE',
    ...overrides,
  };
}
