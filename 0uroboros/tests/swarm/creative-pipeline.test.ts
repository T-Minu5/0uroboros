import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCandidateEnvelope,
  CONTENT_OWNED_FIELDS,
} from '../../src/swarm/candidateEnvelope';
import {
  defaultSharedConcept,
  shouldConsultContent,
  validateContentAssignment,
  validateContentResponse,
} from '../../src/swarm/content';
import type { AstraSynthesis, ContentResponse, WorldbuildingResponse } from '../../src/swarm/contracts';
import {
  CONTENT_PERSISTENCE_GAP_RUN_ID,
  replayHistoricalCreativeRun,
} from '../../src/swarm/creativeReplay';
import { CREATIVE_VALIDATION_OBJECTIVE } from '../../src/swarm/harness';
import { shouldConsultLookDev } from '../../src/swarm/lookdev';
import {
  shouldConsultEngineering,
  shouldConsultProduct,
  shouldConsultUx,
} from '../../src/swarm/leadRouting';
import { shouldConsultResearch } from '../../src/swarm/research';
import {
  shouldConsultSystems,
  shouldEnableSystemsTool,
} from '../../src/swarm/systems';
import {
  classifySpecialistError,
  diagnoseConsumedCallWithoutResult,
} from '../../src/swarm/specialistFailure';
import { retrieveWorldKnowledgePacket } from '../../src/swarm/worldKnowledge';
import { shouldConsultWorldbuilding } from '../../src/swarm/worldbuilding';
import {
  buildWorldKnowledgeQueries,
} from '../../src/swarm/worldQuery';
import { assignment, testCanonical, testConfig } from './fixtures';
import { GovernanceError } from '../../src/swarm/errors';
import type { ObsidianVaultClient } from '../../src/swarm/obsidianMcp';

const index = testCanonical();
const budget = testConfig().budget;

const OFFLINE_CONTENT_FIXTURE = {
  summary: 'A low-Power Chaos tempo Character using approved Action gain.',
  content_proposals: [
    {
      name: 'Latch-Oracle',
      concept: 'A low-Power Chaos tempo Character.',
      proposed_effect: 'OnReveal: Gain 1 Action.',
      strategic_purpose: 'Tempo after a cheap deploy.',
      gameplay_role: 'low-Power Chaos tempo',
      power: 1,
      draft_cost: 1,
      mechanics_used: [
        {
          mechanic: 'ACTION_GAIN',
          canonical_ids: ['RULE-ACTION-004'],
          status: 'APPROVED_PRIMITIVE' as const,
        },
      ],
      balance_questions: ['Is Power 1 too fragile into Drain?'],
    },
  ],
  balance_questions: ['Is Power 1 too fragile into Drain?'],
  confidence: 0.7,
};

function synthesis(overrides: Partial<AstraSynthesis> = {}): AstraSynthesis {
  return {
    summary: 'Integrated candidate.',
    decisions: [],
    specialists_consulted: ['content', 'worldbuilding'],
    work_package_intents: [],
    candidate_notes: [
      {
        title: 'The Uncertainty Hexer',
        rationale: 'Primary name',
        classification: 'PROPOSED_ADDITION',
        canonical_ids: [],
        approval_required: false,
        selected: true,
      },
      {
        title: 'Phase Witness',
        rationale: 'Alt',
        classification: 'PROPOSED_ADDITION',
        canonical_ids: [],
        approval_required: false,
        selected: false,
      },
      {
        title: 'Null Seer',
        rationale: 'Alt',
        classification: 'PROPOSED_ADDITION',
        canonical_ids: [],
        approval_required: false,
        selected: false,
      },
      {
        title: 'Hex Latch',
        rationale: 'Alt',
        classification: 'PROPOSED_ADDITION',
        canonical_ids: [],
        approval_required: false,
        selected: false,
      },
      {
        title: 'Probability Thief',
        rationale: 'Alt',
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
    selected_candidate_name: 'The Uncertainty Hexer',
    alternative_working_names: [],
    shared_concept_id: '',
    ...overrides,
  };
}

function contentAssignment(conceptId: string) {
  return validateContentAssignment(
    {
      ...assignment({
        role: 'content',
        objective: 'Create a low-Power Chaos tempo Character using approved mechanics.',
        proposal_limit: 1,
      }),
      shared_concept_ids: [conceptId],
    },
    budget,
  );
}

function contentResult(conceptId: string): ContentResponse {
  return validateContentResponse(OFFLINE_CONTENT_FIXTURE, contentAssignment(conceptId), budget, index);
}

function worldResult(conceptId: string): WorldbuildingResponse {
  return {
    agent: 'worldbuilding',
    assignment_id: 'asg-w',
    summary: 'Proposed identity for a Chaos uncertainty specialist.',
    established_facts_used: [],
    visual_observations_used: [],
    world_proposals: [
      {
        concept_id: conceptId,
        title: 'The Uncertainty Hexer',
        statement: 'A proposed Chaos identity around uncertainty.',
        evidence_kind: 'PROPOSED_LORE',
        related_names: [],
        related_first_party_evidence: [],
        challenges_established: [],
      },
    ],
    naming_proposals: ['Phase Witness'],
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
    confidence: 0.6,
  };
}

function emptyVault(): ObsidianVaultClient {
  return {
    async getServerInfo() {
      return {
        status: 'ok',
        version: '2.5.1',
        vault_name: 'Obsidian - 0uroboros',
        transport: 'streamable-http',
      };
    },
    async searchSimple() {
      return [];
    },
    async searchSmart() {
      return [];
    },
    async readFile() {
      throw new Error('no notes');
    },
    async listTags() {
      return [];
    },
    async getOutgoingLinks() {
      return [];
    },
  };
}

describe('Obsidian query builder', () => {
  it('filters generic task words from a creative objective', () => {
    const plan = buildWorldKnowledgeQueries({
      objective: 'Develop one new Chaos Character candidate for 0uroboros.',
    });
    const lowered = plan.queries.map((item) => item.toLowerCase());
    expect(lowered).not.toContain('develop');
    expect(lowered).not.toContain('candidate');
    expect(lowered).not.toContain('0uroboros');
    expect(plan.queries).toEqual(expect.arrayContaining(['Chaos']));
  });

  it('derives high-signal queries from a Chaos uncertainty/divination concept', () => {
    const plan = buildWorldKnowledgeQueries({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      content_concept: 'A Chaos seer who weaponizes uncertainty and divination.',
    });
    const lowered = plan.queries.map((item) => item.toLowerCase());
    expect(lowered).toEqual(expect.arrayContaining(['chaos', 'uncertainty', 'divination']));
    expect(lowered).not.toContain('develop');
    expect(plan.queries.length).toBeGreaterThanOrEqual(2);
    expect(plan.queries.length).toBeLessThanOrEqual(6);
  });

  it('does not let character or representative names dominate world-lore queries', () => {
    const plan = buildWorldKnowledgeQueries({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      content_concept: 'Chaos uncertainty sigils intrusion corruption',
      content_summary: 'assumptions OnReveal Power Drain bounded',
      candidate_name: 'Null-Sigil',
      existing_entity_names: ['Rezz-Razor', 'Glitch-Witch.exe'],
    });
    const lowered = plan.queries.map((item) => item.toLowerCase());
    expect(lowered[0]).not.toMatch(/null-sigil|rezz-razor|glitch-witch/);
    expect(lowered).toEqual(expect.arrayContaining(['chaos', 'uncertainty']));
    expect(lowered).not.toContain('assumptions');
    expect(lowered).not.toContain('onreveal');
    expect(plan.character_verification_queries).toEqual(['Null-Sigil']);
  });

  it('keeps an existing named entity instead of replacing it with theme terms', () => {
    const plan = buildWorldKnowledgeQueries({
      objective: 'Develop lore for Node Feratu',
    });
    expect(plan.named_entities.join(' ')).toMatch(/Node Feratu/i);
    expect(plan.queries[0]).toMatch(/Node Feratu/i);
    expect(plan.queries.map((item) => item.toLowerCase())).not.toContain('develop');
  });

  it('records WORLD_KNOWLEDGE_NO_MATCH when a high-signal search is empty', async () => {
    const packet = await retrieveWorldKnowledgePacket({
      objective: 'Develop one new Chaos Character candidate for 0uroboros.',
      index,
      assets: [],
      client: emptyVault(),
      content_concept: 'uncertainty and divination',
    });
    expect(packet.searched).toBe(true);
    expect(packet.vault_reachable).toBe(true);
    expect(packet.notes).toEqual([]);
    expect(packet.search_outcome).toBe('WORLD_KNOWLEDGE_NO_MATCH');
    expect(packet.unresolved_questions).toContain('WORLD_KNOWLEDGE_NO_MATCH');
    expect(packet.unresolved_questions.join(' ')).not.toMatch(/No vault note established/i);
    expect(packet.unresolved_questions.join(' ')).not.toMatch(/UNKNOWN_STATUS/);
    expect(packet.vault_profile.character_specific_canon).toBe(false);
    expect(packet.vault_profile.gameplay_rules).toBe(false);
  });
});

describe('candidate envelope', () => {
  const shared = defaultSharedConcept(CREATIVE_VALIDATION_OBJECTIVE);

  it('collapses five notes about one concept into one envelope', () => {
    const envelope = buildCandidateEnvelope({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      sharedConceptId: shared,
      synthesis: synthesis(),
      contentResults: [contentResult(shared)],
      worldbuildingResults: [worldResult(shared)],
      specialistFailures: [],
    });
    expect(envelope).toBeTruthy();
    expect(envelope?.concept_id).toBe(shared);
    expect(envelope?.candidate_name).toBe('The Uncertainty Hexer');
    expect(envelope?.alternative_names.length).toBeGreaterThan(0);
    expect(envelope?.status).toBe('CANDIDATE');
    expect(envelope?.approved).toBe(false);
  });

  it('keeps the harness concept ID when a specialist returns another ID', () => {
    const asg = contentAssignment(shared);
    const parsed = validateContentResponse(
      {
        ...OFFLINE_CONTENT_FIXTURE,
        content_proposals: [
          {
            ...OFFLINE_CONTENT_FIXTURE.content_proposals[0],
            concept_id: 'candidate-chaos-quantum-occult-01',
          },
        ],
      },
      asg,
      budget,
      index,
    );
    expect(parsed.content_proposals[0]?.concept_id).toBe(shared);
  });

  it('marks INCOMPLETE when required Content fails and does not fill Content-owned fields', () => {
    const envelope = buildCandidateEnvelope({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      sharedConceptId: shared,
      synthesis: synthesis({
        decisions: ['Power 2, OnReveal Gain +1 Action, Draft cost 2'],
      }),
      contentResults: [],
      worldbuildingResults: [worldResult(shared)],
      specialistFailures: [
        {
          code: 'SPECIALIST_FAILURE',
          specialist: 'content',
          assignment_id: 'asg-c',
          concept_id: shared,
          model: 'gpt-5.6-terra',
          error_class: 'RESULT_PERSISTENCE_FAILURE',
          schema_name: 'ContentModelOutputSchema',
          schema_version: '1',
          error_message: 'Content result was not persisted.',
          validation_paths: [],
          usage: null,
          model_output_redacted: false,
          fatal: true,
        },
      ],
    });
    expect(envelope?.status).toBe('INCOMPLETE');
    expect(envelope?.content_contribution).toBeNull();
    expect(envelope?.balance_values.power).toBeNull();
    expect(envelope?.balance_values.effect).toBe('');
    expect(envelope?.unresolved_fields).toEqual(expect.arrayContaining([...CONTENT_OWNED_FIELDS]));
    expect(envelope?.worldbuilding_contribution).toBeTruthy();
  });

  it('is CANDIDATE and still unapproved when both specialists succeed', () => {
    const envelope = buildCandidateEnvelope({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      sharedConceptId: shared,
      synthesis: synthesis(),
      contentResults: [contentResult(shared)],
      worldbuildingResults: [worldResult(shared)],
      specialistFailures: [],
    });
    expect(envelope?.status).toBe('CANDIDATE');
    expect(envelope?.approved).toBe(false);
    expect(envelope?.mechanics_used.length).toBeGreaterThan(0);
  });
});

describe('offline Content fixture', () => {
  it('validates a lean structured contribution for a low-Power Chaos tempo Character', () => {
    const asg = contentAssignment(defaultSharedConcept(CREATIVE_VALIDATION_OBJECTIVE));
    const parsed = validateContentResponse(OFFLINE_CONTENT_FIXTURE, asg, budget, index);
    expect(parsed.content_proposals[0]?.gameplay_role).toMatch(/tempo/i);
    expect(parsed.content_proposals[0]?.power).toBe(1);
    expect(parsed.content_proposals[0]?.draft_cost).toBe(1);
    expect(parsed.content_proposals[0]?.proposed_effect).toMatch(/Gain 1 Action/);
    expect(parsed.content_proposals[0]?.mechanics_used.some((item) => item.mechanic === 'ACTION_GAIN')).toBe(
      true,
    );
    expect(parsed.content_proposals[0]?.concept_id).toBe(asg.shared_concept_ids[0]);
  });
});

describe('historical Content persistence gap', () => {
  it('classifies a consumed Content call with no artifact as RESULT_PERSISTENCE_FAILURE', () => {
    expect(
      diagnoseConsumedCallWithoutResult({
        content_calls: 1,
        content_results: [],
        errors: [],
        structured_output_failure: null,
      }),
    ).toBe('RESULT_PERSISTENCE_FAILURE');
    expect(classifySpecialistError(new GovernanceError('PROPOSAL_LIMIT', 'too many'))).toBe(
      'HARNESS_VALIDATION_FAILURE',
    );
  });

  it('replays the live creative run as INCOMPLETE without rewriting artifacts', () => {
    const replay = replayHistoricalCreativeRun(
      join(process.cwd(), 'tools/agent-harness/runs', CONTENT_PERSISTENCE_GAP_RUN_ID),
    );
    expect(replay.content_error_class).toBe('RESULT_PERSISTENCE_FAILURE');
    expect(replay.shared_concept_id).toBe('concept-chaos-character');
    expect(replay.worldbuilding_usable).toBe(true);
    expect(replay.envelope?.status).toBe('INCOMPLETE');
    expect(replay.envelope?.concept_id).toBe('concept-chaos-character');
    expect(replay.envelope?.balance_values.power).toBeNull();
    expect(replay.envelope?.balance_values.effect).toBe('');
    expect(replay.candidate_proposal_count).toBe(1);
  });
});

describe('creative routing regression', () => {
  it('keeps Content and Worldbuilding available without Product, UX, Engineering, Systems, Research, or LookDev', () => {
    expect(shouldConsultContent(CREATIVE_VALIDATION_OBJECTIVE)).toBe(true);
    expect(shouldConsultWorldbuilding(CREATIVE_VALIDATION_OBJECTIVE)).toBe(true);
    expect(shouldConsultProduct(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldConsultUx(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldConsultEngineering(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldConsultSystems(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldEnableSystemsTool(CREATIVE_VALIDATION_OBJECTIVE, [])).toBe(false);
    expect(shouldConsultResearch(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
    expect(shouldConsultLookDev(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
  });
});
