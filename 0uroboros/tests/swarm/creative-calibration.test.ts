import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assembleApprovedMechanicsPacket,
  classifyProposedEffect,
  isApprovedActionGain,
  mechanicStatusRequiresRuleChange,
} from '../../src/swarm/approvedMechanics';
import { inventoryFirstPartyAssets } from '../../src/swarm/assets';
import {
  assembleContentPacket,
  defaultSharedConcept,
  shouldConsultContent,
  validateContentAssignment,
  validateContentResponse,
} from '../../src/swarm/content';
import type { ContentProposal, ContentResponse, WorldbuildingResponse } from '../../src/swarm/contracts';
import {
  countCreativeConcepts,
  creativeConceptBudgetForObjective,
  enforceCreativeConceptBudget,
  isSingleConceptCreativeTask,
  relevantAssetsForObjective,
  resolveIntegratedCandidateNaming,
} from '../../src/swarm/creative';
import {
  applyHarnessVerifiedMismatches,
  collectHarnessVerifiedEvidence,
  objectiveTouchesStartingDeck,
} from '../../src/swarm/evidence';
import { CREATIVE_VALIDATION_OBJECTIVE, HUD_SMOKE_OBJECTIVE, SYSTEMS_VALIDATION_OBJECTIVE } from '../../src/swarm/harness';
import { shouldConsultLookDev } from '../../src/swarm/lookdev';
import { shouldConsultResearch } from '../../src/swarm/research';
import { creativeProposalDoesNotTriggerReview, detectReviewTriggers } from '../../src/swarm/review';
import {
  hasGenuineSystemsTrigger,
  shouldConsultSystems,
  shouldEnableSystemsTool,
} from '../../src/swarm/systems';
import { shouldConsultWorldbuilding } from '../../src/swarm/worldbuilding';
import { assignment, testCanonical, testConfig } from './fixtures';
import { hudSmokeOrchestrationResult } from './hud-smoke-fixture';
import { GovernanceError } from '../../src/swarm/errors';
import { validateOrchestrationResult } from '../../src/swarm/governance';

const index = testCanonical();
const budget = testConfig().budget;
const assets = inventoryFirstPartyAssets();

export const FAILED_CREATIVE_RUN_ID = 'run-2026-09-07T10-09-01-128Z-ebe0a010';

function contentProposal(overrides: Partial<ContentProposal> = {}): ContentProposal {
  return {
    concept_id: 'concept-chaos-character',
    content_type: 'CHARACTER',
    name: 'Null-Latch',
    concept: 'A new Chaos Character that uses existing Drain and Action economy.',
    proposed_effect: 'OnReveal: Gain 1 Action.',
    strategic_purpose: 'Tempo after deployment.',
    gameplay_role: 'low-power Chaos tempo',
    existing_rules_used: [],
    mechanics_used: [],
    rule_change_required: false,
    thematic_rationale: 'Inspired by Chaos chrome motifs.',
    related_first_party_evidence: [],
    risks: [],
    ...overrides,
  };
}

describe('Systems creative routing', () => {
  it('does not enable Systems for a creative-only Chaos Character task', () => {
    expect(shouldConsultContent(CREATIVE_VALIDATION_OBJECTIVE)).toBe(true);
    expect(shouldConsultWorldbuilding(CREATIVE_VALIDATION_OBJECTIVE)).toBe(true);
    expect(shouldConsultSystems(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldEnableSystemsTool(CREATIVE_VALIDATION_OBJECTIVE, [])).toBe(false);
    expect(shouldConsultResearch(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldConsultLookDev(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
  });

  it('keeps Systems available for genuine semantic or implementation questions', () => {
    expect(shouldConsultSystems(SYSTEMS_VALIDATION_OBJECTIVE)).toBe(true);
    expect(
      shouldConsultSystems(
        'What does the approved +1 Action OnReveal timing mean under RULE-ACTION-004?',
      ),
    ).toBe(true);
    expect(hasGenuineSystemsTrigger('Classify this effect against canonical implementation mismatch.')).toBe(
      true,
    );
    expect(
      shouldEnableSystemsTool(CREATIVE_VALIDATION_OBJECTIVE, [
        {
          content_proposals: [
            { mechanics_used: [{ status: 'UNRESOLVED' }] },
          ],
        },
      ]),
    ).toBe(true);
  });
});

describe('starting-deck mismatch relevance', () => {
  it('does not inject RULE-DECK-001 work into an unrelated creative task', () => {
    expect(objectiveTouchesStartingDeck(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    const recovered = applyHarnessVerifiedMismatches(
      validateOrchestrationResult({
        ...hudSmokeOrchestrationResult(),
        objective: CREATIVE_VALIDATION_OBJECTIVE,
        work_packages: [],
        systems_findings: [],
        candidate_proposals: [],
        specialists_consulted: ['Content', 'Worldbuilding'],
      }),
      collectHarnessVerifiedEvidence(),
      index,
      'run-creative-deck',
    );
    expect(recovered.work_packages.some((item) => item.authorized_rule_ids.includes('RULE-DECK-001'))).toBe(
      false,
    );
    expect(recovered.systems_findings.some((item) => item.canonical_ids.includes('RULE-DECK-001'))).toBe(
      false,
    );
  });

  it('does not attach starting-deck evidence to HUD smoke', () => {
    expect(objectiveTouchesStartingDeck(HUD_SMOKE_OBJECTIVE)).toBe(false);
    expect(collectHarnessVerifiedEvidence(HUD_SMOKE_OBJECTIVE)).toEqual([]);
  });
});

describe('visual cache and asset roles', () => {
  it('attaches cached Chaos representatives for a new Chaos identity task', () => {
    const liveId = assets.find((item) => item.file_name === 'glitch-witch.png')?.asset_id;
    const picked = relevantAssetsForObjective(CREATIVE_VALIDATION_OBJECTIVE, assets, {
      liveAssetIds: liveId ? [liveId] : [],
    });
    expect(picked[0]?.file_name).toBe(liveId ? 'glitch-witch.png' : 'rezz-razor.png');
    expect(picked.every((item) => item.selection_role === 'REPRESENTATIVE_REFERENCE')).toBe(true);
    expect(picked.map((item) => item.file_name).sort()).toEqual(['glitch-witch.png', 'rezz-razor.png']);
    expect(picked).toHaveLength(2);
    const packet = assembleContentPacket({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      index,
      assets,
      shared_concept_ids: [defaultSharedConcept(CREATIVE_VALIDATION_OBJECTIVE)],
      liveAssetIds: liveId ? [liveId] : [],
    });
    expect(packet.shared_concept_ids).toEqual(['concept-chaos-character']);
    expect(packet.asset_roles.some((item) => item.selection_role === 'REPRESENTATIVE_REFERENCE')).toBe(
      true,
    );
  });
});

describe('approved mechanics map and Action gain', () => {
  it('lists current approved primitives with canonical IDs', () => {
    const packet = assembleApprovedMechanicsPacket(index);
    expect(packet.primitives.map((item) => item.mechanic)).toEqual(
      expect.arrayContaining(['ACTION_GAIN', 'DRAIN', 'DRAW', 'POWER', 'CRYPTO']),
    );
    const action = packet.primitives.find((item) => item.mechanic === 'ACTION_GAIN');
    expect(action?.canonical_ids).toEqual(
      expect.arrayContaining(['RULE-ACTION-004', 'RULE-STARTER-002', 'RULE-STARTER-004']),
    );
  });

  it('recognizes +1 Action as an approved primitive', () => {
    expect(isApprovedActionGain('+1 Action')).toBe(true);
    const usages = classifyProposedEffect('+1 Action');
    expect(usages.some((item) => item.mechanic === 'ACTION_GAIN' && item.status === 'APPROVED_PRIMITIVE')).toBe(
      true,
    );
    expect(mechanicStatusRequiresRuleChange(usages)).toBe(false);
  });

  it('treats a new arrangement of approved primitives as not a rule change', () => {
    const usages = classifyProposedEffect('Drain 75. +1 Action.');
    expect(usages.some((item) => item.mechanic === 'ACTION_GAIN' && item.status === 'APPROVED_PRIMITIVE')).toBe(
      true,
    );
    expect(usages.some((item) => item.status === 'NEW_COMBINATION')).toBe(true);
    expect(mechanicStatusRequiresRuleChange(usages)).toBe(false);
  });

  it('marks a synthetic unsupported primitive as RULE_CHANGE_REQUIRED', () => {
    const usages = classifyProposedEffect('Gain 1 Focus and open an entanglement stack.');
    expect(usages.some((item) => item.status === 'RULE_CHANGE_REQUIRED')).toBe(true);
    expect(mechanicStatusRequiresRuleChange(usages)).toBe(true);
  });

  it('converts a false Action-gain rule-change flag into CONTEXT_OMISSION', () => {
    const asg = validateContentAssignment(
      assignment({
        role: 'content',
        objective: 'Propose a Chaos card concept.',
        proposal_limit: 1,
      }),
      budget,
    );
    const parsed = validateContentResponse(
      {
        agent: 'content',
        assignment_id: asg.assignment_id,
        summary: 'One Action-gain candidate.',
        content_proposals: [
          contentProposal({
            name: 'Phase Witness',
            proposed_effect: 'OnReveal: Gain 1 Action.',
            rule_change_required: true,
          }),
        ],
        synergy_observations: [],
        rules_touched: [],
        rule_changes_required: true,
        first_party_asset_ids: [],
        research_evidence_ids: [],
        risks: [],
        balance_questions: [],
        open_questions: [],
        canonical_ids_referenced: [],
        context_omissions: [],
        confidence: 0.5,
      },
      asg,
      budget,
      index,
    );
    expect(parsed.content_proposals[0]?.rule_change_required).toBe(false);
    expect(parsed.rule_changes_required).toBe(false);
    expect(parsed.context_omissions[0]?.kind).toBe('CONTEXT_OMISSION');
    expect(parsed.content_proposals[0]?.mechanics_used.some((item) => item.mechanic === 'ACTION_GAIN')).toBe(
      true,
    );
  });
});

describe('shared concept identity and creative budget', () => {
  it('enforces one shared concept ID and one selected name', () => {
    const shared = defaultSharedConcept(CREATIVE_VALIDATION_OBJECTIVE);
    const synthesis = resolveIntegratedCandidateNaming(
      {
        summary: 'Two working names collided.',
        decisions: [],
        specialists_consulted: ['content', 'worldbuilding'],
        work_package_intents: [],
        candidate_notes: [
          {
            title: 'Phase Witness',
            rationale: 'Content name',
            classification: 'PROPOSED_ADDITION',
            canonical_ids: [],
            approval_required: false,
            selected: false,
          },
        ],
        contract_requests: [],
        conflicts: [],
        review_requests: [],
        risks: [],
        human_approvals_required: [],
        selected_candidate_name: '',
        alternative_working_names: [],
        shared_concept_id: '',
      },
      [
        {
          agent: 'content',
          assignment_id: 'c1',
          summary: 'Content',
          content_proposals: [contentProposal({ name: 'Phase Witness', concept_id: shared })],
          synergy_observations: [],
          rules_touched: [],
          rule_changes_required: false,
          first_party_asset_ids: [],
          research_evidence_ids: [],
          risks: [],
          balance_questions: [],
          open_questions: [],
          canonical_ids_referenced: [],
          context_omissions: [],
          confidence: 0.5,
        } satisfies ContentResponse,
      ],
      [
        {
          agent: 'worldbuilding',
          assignment_id: 'w1',
          summary: 'World',
          established_facts_used: [],
          visual_observations_used: [],
          world_proposals: [
            {
              concept_id: shared,
              title: 'Vesper Null',
              statement: 'Proposed identity.',
              evidence_kind: 'PROPOSED_LORE',
              related_names: [],
              related_first_party_evidence: [],
              challenges_established: [],
            },
          ],
          naming_proposals: ['Vesper Null'],
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
        } satisfies WorldbuildingResponse,
      ],
      shared,
    );
    expect(synthesis.shared_concept_id).toBe(shared);
    expect(synthesis.selected_candidate_name).toBe('Phase Witness');
    expect(synthesis.alternative_working_names).toContain('Vesper Null');
    expect(synthesis.alternative_working_names).not.toContain('Phase Witness');
  });

  it('caps a one-candidate validation task at one unique concept', () => {
    expect(isSingleConceptCreativeTask(CREATIVE_VALIDATION_OBJECTIVE)).toBe(true);
    expect(creativeConceptBudgetForObjective(CREATIVE_VALIDATION_OBJECTIVE, 5)).toBe(1);
    expect(() => enforceCreativeConceptBudget(2, 1)).toThrow(GovernanceError);
    const shared = defaultSharedConcept(CREATIVE_VALIDATION_OBJECTIVE);
    expect(
      countCreativeConcepts(
        [
          {
            agent: 'content',
            assignment_id: 'c1',
            summary: 'Content',
            content_proposals: [contentProposal({ concept_id: shared })],
            synergy_observations: [],
            rules_touched: [],
            rule_changes_required: false,
            first_party_asset_ids: [],
            research_evidence_ids: [],
            risks: [],
            balance_questions: [],
            open_questions: [],
            canonical_ids_referenced: [],
            context_omissions: [],
            confidence: 0.5,
          },
        ],
        [
          {
            world_proposals: [{ concept_id: shared }],
          },
        ],
      ),
    ).toBe(1);
  });

  it('does not trigger Reviewer for ordinary unapproved candidate ideation', () => {
    const result = validateOrchestrationResult({
      ...hudSmokeOrchestrationResult(),
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      work_packages: [],
      candidate_proposals: [],
      systems_findings: [],
      specialists_consulted: ['Content', 'Worldbuilding'],
    });
    expect(detectReviewTriggers(result)).toEqual([]);
    expect(creativeProposalDoesNotTriggerReview(result)).toBe(true);
  });
});

describe(`offline replay of ${FAILED_CREATIVE_RUN_ID}`, () => {
  it('normalizes the failed creative run without rewriting the artifact', () => {
    const root = join(process.cwd(), 'tools/agent-harness/runs', FAILED_CREATIVE_RUN_ID);
    const workOrder = JSON.parse(readFileSync(join(root, 'work-order.json'), 'utf8')) as {
      objective: string;
    };
    const content = JSON.parse(readFileSync(join(root, 'content-results.json'), 'utf8')) as ContentResponse[];
    const historicalEffect = content[0]?.content_proposals[0]?.proposed_effect ?? '';
    expect(workOrder.objective).toMatch(/Chaos Character/);
    expect(shouldConsultSystems(workOrder.objective)).toBe(false);
    expect(shouldConsultResearch(workOrder.objective)).toBe(false);
    expect(shouldConsultLookDev(workOrder.objective)).toBe(false);
    expect(objectiveTouchesStartingDeck(workOrder.objective)).toBe(false);
    const recovered = applyHarnessVerifiedMismatches(
      validateOrchestrationResult({
        ...hudSmokeOrchestrationResult(),
        objective: workOrder.objective,
        work_packages: [],
        systems_findings: [],
        candidate_proposals: [],
        specialists_consulted: ['Content', 'Worldbuilding'],
      }),
      collectHarnessVerifiedEvidence(),
      index,
      FAILED_CREATIVE_RUN_ID,
    );
    expect(recovered.work_packages).toEqual([]);
    expect(detectReviewTriggers(recovered)).toEqual([]);
    const packet = assembleContentPacket({
      objective: workOrder.objective,
      index,
      assets,
      shared_concept_ids: [defaultSharedConcept(workOrder.objective)],
    });
    expect(packet.asset_roles.some((item) => item.selection_role === 'REPRESENTATIVE_REFERENCE')).toBe(
      true,
    );
    const usages = classifyProposedEffect(historicalEffect);
    expect(usages.some((item) => item.mechanic === 'ACTION_GAIN')).toBe(true);
    expect(mechanicStatusRequiresRuleChange(usages)).toBe(false);
    expect(isSingleConceptCreativeTask(workOrder.objective)).toBe(true);
    expect(creativeConceptBudgetForObjective(workOrder.objective, 5)).toBe(1);
  });
});
