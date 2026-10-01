import { describe, expect, it } from 'vitest';

import {
  createPlanningTeam,
  SPECIALIST_TOOL_NAMES,
  toolNames,
} from '../../src/swarm/agents';
import { inventoryFirstPartyAssets } from '../../src/swarm/assets';
import { BudgetTracker } from '../../src/swarm/budget';
import {
  assembleContentPacket,
  contentCannotExecute,
  contentCannotInvokeAgents,
  contentCreatesWorkPackages,
  defaultSharedConcept,
  proposalRequiresRuleChange,
  shouldConsultContent,
  validateContentAssignment,
  validateContentResponse,
} from '../../src/swarm/content';
import type { ContentProposal, ContentResponse, OrchestrationResult, WorldbuildingResponse } from '../../src/swarm/contracts';
import {
  countCreativeConcepts,
  creativeSpecialistsCannotInvokeEachOther,
  dedupeCandidateProposals,
  enforceCreativeConceptBudget,
  relevantAssetsForObjective,
  visualObservationsCannotBecomeLore,
} from '../../src/swarm/creative';
import { BudgetExhaustedError, GovernanceError } from '../../src/swarm/errors';
import { CREATIVE_VALIDATION_OBJECTIVE } from '../../src/swarm/harness';
import { shouldConsultLookDev } from '../../src/swarm/lookdev';
import { shouldConsultResearch } from '../../src/swarm/research';
import { creativeProposalDoesNotTriggerReview, detectReviewTriggers } from '../../src/swarm/review';
import { shouldConsultSystems } from '../../src/swarm/systems';
import {
  markProposedLore,
  preservesCoreTheme,
  shouldConsultWorldbuilding,
  sparseSubgenreAccent,
  worldbuildingCannotExecute,
  worldbuildingCannotInvokeAgents,
  worldbuildingCannotWriteMechanics,
  worldbuildingCreatesWorkPackages,
  validateWorldbuildingAssignment,
  validateWorldbuildingResponse,
} from '../../src/swarm/worldbuilding';
import { assignment, emptyRuntime, proposal, testCanonical, testConfig } from './fixtures';

const index = testCanonical();
const budget = testConfig().budget;
const assets = inventoryFirstPartyAssets();

function contentAsg(objective: string, extras: Record<string, unknown> = {}) {
  return validateContentAssignment(
    {
      ...assignment({ role: 'content', objective, proposal_limit: 5 }),
      shared_concept_ids: [defaultSharedConcept(objective)],
      ...extras,
    },
    budget,
  );
}

function worldAsg(objective: string, extras: Record<string, unknown> = {}) {
  return validateWorldbuildingAssignment(
    {
      ...assignment({ role: 'worldbuilding', objective, proposal_limit: 5 }),
      shared_concept_ids: [defaultSharedConcept(objective)],
      ...extras,
    },
    budget,
  );
}

function contentProposal(overrides: Partial<ContentProposal> = {}): ContentProposal {
  return {
    concept_id: 'concept-chaos-character',
    content_type: 'CHARACTER',
    name: 'Null-Latch',
    concept: 'A new Chaos Character that uses existing Drain and Action economy.',
    proposed_effect: 'On reveal, Drain 50 using existing Drain rules.',
    strategic_purpose: 'Pressure Data Centers without changing Runtime.',
    gameplay_role: 'tempo pressure',
    existing_rules_used: ['RULE-DATA-001'],
    rule_change_required: false,
    thematic_rationale: 'Inspired by Chaos chrome motifs, not a named starter rewrite.',
    related_first_party_evidence: [],
    risks: [],
    mechanics_used: [],
    ...overrides,
  };
}

function contentResponse(
  assignmentId: string,
  proposals: ContentProposal[],
  extras: Partial<ContentResponse> = {},
): ContentResponse {
  return {
    agent: 'content',
    assignment_id: assignmentId,
    summary: 'One new Chaos Character concept.',
    content_proposals: proposals,
    synergy_observations: [],
    rules_touched: proposals.flatMap((item) => item.existing_rules_used),
    rule_changes_required: proposals.some((item) => item.rule_change_required),
    first_party_asset_ids: [],
    research_evidence_ids: [],
    risks: [],
    balance_questions: [],
    open_questions: [],
    canonical_ids_referenced: ['WORLD-CORE-001'],
    context_omissions: [],
    confidence: 0.7,
    ...extras,
  };
}

describe('Content routing and starter protection', () => {
  it('protects Rezz-Razor approved starter mechanics from a silent overwrite', () => {
    const objective = 'Improve Rezz-Razor.';
    expect(shouldConsultContent(objective)).toBe(true);
    const packet = assembleContentPacket({ objective, index, assets });
    expect(packet.starter_ids).toContain('RULE-STARTER-004');
    const asg = contentAsg(objective);
    const parsed = validateContentResponse(
      contentResponse(asg.assignment_id, [
        contentProposal({
          name: 'Rezz-Razor',
          proposed_effect: 'Rewrite Rezz-Razor to Drain 999 and skip Actions.',
        }),
      ]),
      asg,
      budget,
      index,
    );
    expect(parsed.content_proposals[0]?.rule_change_required).toBe(true);
    expect(parsed.rule_changes_required).toBe(true);
    expect(parsed.content_proposals[0]?.risks.join(' ')).toMatch(/RULE-STARTER-004/);
  });

  it('may run Content without Worldbuilding for Location reward concepts', () => {
    const objective = 'Propose three Location reward concepts using existing mechanics.';
    expect(shouldConsultContent(objective)).toBe(true);
    expect(shouldConsultWorldbuilding(objective)).toBe(false);
  });

  it('flags Wave Collapse changes as rule_change_required', () => {
    expect(proposalRequiresRuleChange('change Wave Collapse to skip Node control')).toBe(true);
    const asg = contentAsg('Propose a Chaos card concept.');
    const parsed = validateContentResponse(
      contentResponse(asg.assignment_id, [
        contentProposal({
          name: 'Collapse Fork',
          proposed_effect: 'Modify Wave Collapse so the loser also scores.',
          rule_change_required: false,
        }),
      ]),
      asg,
      budget,
      index,
    );
    expect(parsed.content_proposals[0]?.rule_change_required).toBe(true);
  });

  it('rejects Content output over the proposal limit', () => {
    const asg = contentAsg('Propose three Location reward concepts using existing mechanics.', {
      proposal_limit: 2,
    });
    expect(() =>
      validateContentResponse(
        contentResponse(asg.assignment_id, [
          contentProposal({ name: 'A', concept_id: 'concept-a' }),
          contentProposal({ name: 'B', concept_id: 'concept-b' }),
          contentProposal({ name: 'C', concept_id: 'concept-c' }),
        ]),
        asg,
        budget,
        index,
      ),
    ).toThrow(GovernanceError);
  });

  it('prefers inspected Chaos sample art when the objective does not name a character', () => {
    const picked = relevantAssetsForObjective(
      'Develop one new Chaos Character concept for 0uroboros.',
      assets,
    );
    expect(picked.map((item) => item.file_name).slice(0, 2)).toEqual([
      'rezz-razor.png',
      'glitch-witch.png',
    ]);
    expect(picked.every((item) => item.selection_role === 'REPRESENTATIVE_REFERENCE')).toBe(true);
  });

  it('uses identity-specific art for a named character task', () => {
    const picked = relevantAssetsForObjective('Improve Rezz-Razor presentation of existing art.', assets);
    expect(picked.some((item) => item.file_name === 'rezz-razor.png')).toBe(true);
    expect(picked.every((item) => item.selection_role === 'IDENTITY_SPECIFIC')).toBe(true);
  });

  it('has no execution, mutation, or delegation authority', () => {
    expect(contentCannotExecute()).toBe(true);
    expect(contentCannotInvokeAgents()).toBe(true);
    expect(contentCreatesWorkPackages(contentResponse('asg-1', []))).toEqual([]);
  });
});

describe('Worldbuilding routing and evidence discipline', () => {
  it('treats assigned meaning as proposed lore, not an established visual fact', () => {
    const observed = markProposedLore({
      concept_id: 'concept-motif',
      title: 'Crescent motif',
      statement: 'A crescent-shaped luminous element appears behind the character.',
      evidence_kind: 'FIRST_PARTY_VISUAL_OBSERVATION',
      related_names: [],
      related_first_party_evidence: ['asset-card-art-chaos-cards-rezz-razor-png'],
      challenges_established: [],
    });
    expect(observed.evidence_kind).toBe('FIRST_PARTY_VISUAL_OBSERVATION');
    const proposed = markProposedLore({
      concept_id: 'concept-motif',
      title: 'Lunar order',
      statement: 'Rezz-Razor belongs to an order that engraves executable sigils.',
      evidence_kind: 'FIRST_PARTY_VISUAL_OBSERVATION',
      related_names: ['Rezz-Razor'],
      related_first_party_evidence: ['asset-card-art-chaos-cards-rezz-razor-png'],
      challenges_established: [],
    });
    expect(proposed.evidence_kind).toBe('PROPOSED_LORE');
    expect(visualObservationsCannotBecomeLore()).toBe(true);
  });

  it('may run Worldbuilding without Content for Node Feratu lore', () => {
    const objective = 'Develop lore for Node Feratu.';
    expect(shouldConsultWorldbuilding(objective)).toBe(true);
    expect(shouldConsultContent(objective)).toBe(false);
  });

  it('preserves Cyberpunk + Quantum Physics + Occult and keeps subgenres sparse', () => {
    expect(
      preservesCoreTheme('Cyberpunk streets, quantum physics entanglement, and occult sigils.'),
    ).toBe(true);
    expect(sparseSubgenreAccent('A lunarpunk garden overlay.')).toBe(true);
    expect(sparseSubgenreAccent('Cyberpunk + quantum + occult only.')).toBe(false);
  });

  it('emits Obsidian-oriented relationship links', () => {
    const asg = worldAsg('Develop lore for Node Feratu.');
    const parsed = validateWorldbuildingResponse(
      {
        agent: 'worldbuilding',
        assignment_id: asg.assignment_id,
        summary: 'Node Feratu remains a proposed world identity.',
        established_facts_used: ['WORLD-CORE-001'],
        visual_observations_used: [],
        world_proposals: [
          {
            concept_id: 'concept-node-feratu',
            title: 'Node Feratu',
            statement: 'Node Feratu is a proposed threshold between collapsed Circuits.',
            evidence_kind: 'PROPOSED_LORE',
            related_names: ['Node Feratu'],
            related_first_party_evidence: [],
          },
        ],
        naming_proposals: [],
        relationships: [{ from: 'Node Feratu', to: 'Wave Collapse', relation: 'Location ↔ Technology' }],
        obsidian_links: [{ from: 'Node Feratu', to: 'Wave Collapse', relation: 'Location ↔ Technology' }],
        risks: [],
        canon_questions: [],
        open_questions: [],
        canonical_ids_referenced: ['WORLD-CORE-001'],
        first_party_asset_ids: [],
        research_evidence_ids: [],
        confidence: 0.6,
      },
      asg,
      budget,
    );
    expect(parsed.obsidian_links).toHaveLength(1);
    expect(worldbuildingCannotWriteMechanics()).toBe(true);
    expect(worldbuildingCannotExecute()).toBe(true);
    expect(worldbuildingCannotInvokeAgents()).toBe(true);
    expect(worldbuildingCreatesWorkPackages(parsed)).toEqual([]);
  });
});

describe('combined creative governance', () => {
  const objective = 'Create one new Chaos Character concept with mechanics and world identity.';

  it('routes Content and Worldbuilding, not Research, LookDev, or Systems by default', () => {
    expect(shouldConsultContent(objective)).toBe(true);
    expect(shouldConsultWorldbuilding(objective)).toBe(true);
    expect(shouldConsultResearch(objective)).toBe(false);
    expect(shouldConsultLookDev(objective)).toBe(false);
    expect(shouldConsultLookDev(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldConsultSystems(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldConsultResearch(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    const packet = assembleContentPacket({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      index,
      assets,
      shared_concept_ids: [defaultSharedConcept(CREATIVE_VALIDATION_OBJECTIVE)],
    });
    expect(packet.shared_concept_ids).toEqual(['concept-chaos-character']);
    expect(packet.starter_ids).toEqual(expect.arrayContaining(['RULE-ACTION-004', 'RULE-STARTER-004']));
    expect(packet.asset_roles.some((item) => item.selection_role === 'REPRESENTATIVE_REFERENCE')).toBe(
      true,
    );
  });

  it('keeps a shared concept ID and an aggregate creative budget of five', () => {
    const shared = defaultSharedConcept(CREATIVE_VALIDATION_OBJECTIVE);
    expect(shared).toBe('concept-chaos-character');
    const content = contentResponse('asg-c', [
      contentProposal({ concept_id: shared }),
      contentProposal({ name: 'Twin', concept_id: 'concept-twin' }),
    ]);
    const world: WorldbuildingResponse = {
      agent: 'worldbuilding',
      assignment_id: 'asg-w',
      summary: 'World identity for the new Chaos Character.',
      established_facts_used: [],
      visual_observations_used: [],
      world_proposals: [
        {
          concept_id: shared,
          title: 'Probability thief',
          statement: 'A proposed cult of probability thieves.',
          evidence_kind: 'PROPOSED_LORE',
          related_names: [],
          related_first_party_evidence: [],
          challenges_established: [],
        },
      ],
      naming_proposals: [],
      relationships: [],
      obsidian_links: [],
      risks: [],
      canon_questions: [],
      open_questions: [],
      canonical_ids_referenced: [],
      first_party_asset_ids: [],
      research_evidence_ids: [],
      vault_searched: true,
      vault_note_paths: [],
      note_statuses: [],
      evidence_tensions: [],
      confidence: 0.5,
    };
    expect(countCreativeConcepts([content], [world])).toBe(2);
    expect(() => enforceCreativeConceptBudget(6, 5)).toThrow(/MAX_CREATIVE_CONCEPTS_PER_RUN/);
    expect(() => enforceCreativeConceptBudget(1, 1)).not.toThrow();
    expect(creativeSpecialistsCannotInvokeEachOther()).toBe(true);
  });

  it('does not trigger Reviewer for creative proposals and dedupes candidate wording', () => {
    const result = {
      objective,
      summary: 'One unapproved Chaos Character candidate.',
      decisions: [],
      specialists_consulted: ['Content', 'Worldbuilding'],
      specialist_role_ids: ['content', 'worldbuilding'],
      work_packages: [],
      candidate_proposals: [],
      contract_requests: [],
      conflicts: [],
      review_requests: [],
      risks: [],
      human_approvals_required: [],
      open_questions: [],
      human_design_decisions: [],
      systems_findings: [],
      canonical_completeness_gaps: [],
      context_omissions: [],
      verified_evidence: [],
      research_evidence: [],
      research_observations: [],
      lookdev_results: [],
      content_results: [],
      worldbuilding_results: [],
      candidate_envelopes: [],
      specialist_failures: [],
      first_party_asset_ids: [],
      canonical_version: '2.0.0',
      dependencies: [],
      review_triggers: [],
      review_verdict: null,
      budget_usage: new BudgetTracker(budget).snapshot(),
    };
    expect(detectReviewTriggers(result as OrchestrationResult).length).toBe(0);
    expect(creativeProposalDoesNotTriggerReview(result as OrchestrationResult)).toBe(true);
    const kept = dedupeCandidateProposals([
      proposal({ id: 'prop-1', summary: 'Null Latch drains on reveal' }),
      proposal({ id: 'prop-2', summary: 'Null Latch drains on reveal' }),
    ]);
    expect(kept).toHaveLength(1);
  });

  it('registers Content and Worldbuilding tools and stops a second Content call', () => {
    const team = createPlanningTeam(testConfig(), emptyRuntime());
    expect(toolNames(team.astra)).toContain(SPECIALIST_TOOL_NAMES.content);
    expect(toolNames(team.astra)).toContain(SPECIALIST_TOOL_NAMES.worldbuilding);
    const tracker = new BudgetTracker({ ...budget, max_content_calls: 1 });
    tracker.consumeAgentCall('content');
    expect(() => tracker.consumeAgentCall('content')).toThrow(BudgetExhaustedError);
  });
});
