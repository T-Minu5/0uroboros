import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { envelopeRemainsCandidateDespiteEmptyVault, buildCandidateEnvelope } from '../../src/swarm/candidateEnvelope';
import {
  contentCannotTreatLoreAsRuleAuthority,
  proposalTreatsLoreAsRules,
  shouldConsultContent,
} from '../../src/swarm/content';
import type { AstraSynthesis, ContentResponse, WorldProposal, WorldbuildingResponse } from '../../src/swarm/contracts';
import { NULL_SIGIL_CREATIVE_RUN_ID, interpretNullSigilCreativeRun } from '../../src/swarm/creativeReplay';
import {
  CREATIVE_VALIDATION_OBJECTIVE,
  HUD_SMOKE_OBJECTIVE,
  LOOKDEV_VALIDATION_OBJECTIVE,
  RESEARCH_VALIDATION_OBJECTIVE,
  SYSTEMS_VALIDATION_OBJECTIVE,
  WORLDBUILDING_VALIDATION_OBJECTIVE,
} from '../../src/swarm/harness';
import {
  advisoryRoutingEligibility,
  isHarnessInfrastructureRequest,
  shouldConsultEngineering,
  shouldConsultProduct,
  shouldConsultUx,
} from '../../src/swarm/leadRouting';
import { shouldConsultLookDev } from '../../src/swarm/lookdev';
import { extractWikilinks, parseFrontmatter, type ObsidianVaultClient, type VaultNoteRecord, type VaultSearchHit } from '../../src/swarm/obsidianMcp';
import { shouldConsultResearch } from '../../src/swarm/research';
import {
  CURRENT_VAULT_PROFILE,
  characterSearchMissIsNotFailure,
  classifyWorldRelationship,
  classifyWorldbuildingProposal,
  emptyVaultMatchDoesNotMakeIncomplete,
  loreCannotOverrideGameplay,
  retrieveWorldKnowledgePacket,
  storyImplicationIsThematicOnly,
  worldbuildingAuthorityRank,
} from '../../src/swarm/worldKnowledge';
import { buildWorldKnowledgeQueries } from '../../src/swarm/worldQuery';
import {
  validateWorldbuildingAssignment,
  validateWorldbuildingResponse,
  worldbuildingObsidianIsReadOnly,
  shouldConsultWorldbuilding,
} from '../../src/swarm/worldbuilding';
import { assignment, testCanonical, testConfig } from './fixtures';

const index = testCanonical();
const budget = testConfig().budget;

const CARD_MECHANIC_OBJECTIVE =
  'Propose a new Chaos Character card concept using approved mechanics.';
const PRODUCT_OBJECTIVE =
  'Write player-facing product requirements and acceptance criteria for spectator mode.';
const ENGINEERING_OBJECTIVE =
  'Review Game Contract state representation and the server/client trust boundary.';
const VISUAL_EFFECT_OBJECTIVE =
  'Develop visual feedback presentation for Drain using existing icons and first-party assets.';
const HARNESS_VAULT_CHECK =
  'Verify whether Obsidian search occurred for the Chaos character vault packet.';

function note(path: string, content: string): VaultNoteRecord {
  const frontmatter = parseFrontmatter(content);
  return {
    path,
    title: path.replace(/\.md$/i, '').split('/').pop() ?? path,
    content,
    frontmatter,
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
    properties: Object.fromEntries(
      Object.entries(frontmatter).map(([key, value]) => [key, String(value)]),
    ),
    outgoing_links: extractWikilinks(content).map((to) => ({ to, relation: 'wikilink' })),
    headings: [],
  };
}

function mockClient(notes: VaultNoteRecord[]): ObsidianVaultClient {
  const search = (query: string): VaultSearchHit[] => {
    const needle = query.toLowerCase();
    return notes
      .filter((item) => `${item.path} ${item.content}`.toLowerCase().includes(needle))
      .map((item) => ({
        path: item.path,
        matches: [{ context: item.content.slice(0, 280) }],
      }));
  };
  return {
    async getServerInfo() {
      return {
        status: 'ok',
        version: '2.5.1',
        vault_name: 'Obsidian - 0uroboros',
        transport: 'streamable-http',
      };
    },
    async searchSimple(query: string) {
      return search(query);
    },
    async searchSmart(query: string) {
      return search(query);
    },
    async readFile(path: string) {
      const found = notes.find((item) => item.path === path);
      if (!found) throw new Error(`missing ${path}`);
      return found;
    },
    async listTags() {
      return [...new Set(notes.flatMap((item) => item.tags))];
    },
    async getOutgoingLinks(path: string) {
      return notes.find((item) => item.path === path)?.outgoing_links ?? [];
    },
  };
}

function synthesis(): AstraSynthesis {
  return {
    summary: 'One Chaos candidate.',
    decisions: [],
    specialists_consulted: ['Content', 'Worldbuilding'],
    work_package_intents: [],
    candidate_notes: [],
    contract_requests: [],
    conflicts: [],
    review_requests: [],
    risks: [],
    human_approvals_required: [],
    selected_candidate_name: 'Null-Sigil',
    alternative_working_names: [],
    shared_concept_id: 'concept-chaos-character',
  };
}

function contentResult(): ContentResponse {
  return {
    agent: 'content',
    assignment_id: 'asg-content',
    summary: 'Null-Sigil tempo attacker.',
    content_proposals: [
      {
        concept_id: 'concept-chaos-character',
        content_type: 'CHARACTER',
        name: 'Null-Sigil',
        concept: 'Chaos Character using approved primitives.',
        proposed_effect: 'Power 3. Drain 75. +1 Card. +1 Action.',
        strategic_purpose: 'tempo',
        gameplay_role: 'attacker',
        existing_rules_used: ['RULE-ACTION-004'],
        mechanics_used: [
          { mechanic: 'ACTION_GAIN', canonical_ids: ['RULE-ACTION-004'], status: 'APPROVED_PRIMITIVE' },
        ],
        rule_change_required: false,
        thematic_rationale: 'Story quantum instability is theme only.',
        related_first_party_evidence: [],
        risks: [],
      },
    ],
    synergy_observations: [],
    rules_touched: [],
    rule_changes_required: false,
    first_party_asset_ids: [],
    research_evidence_ids: [],
    risks: [],
    open_questions: [],
    balance_questions: [],
    canonical_ids_referenced: ['RULE-ACTION-004'],
    context_omissions: [],
    confidence: 0.7,
  };
}

function worldResult(): WorldbuildingResponse {
  return {
    agent: 'worldbuilding',
    assignment_id: 'asg-world',
    summary: 'Proposed Chaos identity.',
    established_facts_used: [],
    visual_observations_used: [],
    world_proposals: [
      {
        concept_id: 'concept-chaos-character',
        title: 'Null-Sigil',
        statement: 'PROPOSED_LORE — Null-Sigil is a Chaos operative with an erased occult identity.',
        evidence_kind: 'PROPOSED_LORE',
        related_names: ['Chaos'],
        related_first_party_evidence: [],
        challenges_established: [],
      },
    ],
    naming_proposals: [],
    relationships: [
      {
        from: 'Null-Sigil',
        to: 'Chaos',
        relation: 'PROPOSED: operative of Chaos-aligned intrusion culture.',
      },
    ],
    obsidian_links: [],
    risks: [],
    canon_questions: [],
    open_questions: ['WORLD_KNOWLEDGE_NO_MATCH'],
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

describe('advisory routing matrix', () => {
  it('gates Product, UX, and Engineering off a Content + Worldbuilding character task', () => {
    const route = advisoryRoutingEligibility(CREATIVE_VALIDATION_OBJECTIVE);
    expect(route.content).toBe(true);
    expect(route.worldbuilding).toBe(true);
    expect(route.product).toBe(false);
    expect(route.ux).toBe(false);
    expect(route.engineering).toBe(false);
    expect(route.systems).toBe(false);
    expect(route.research).toBe(false);
    expect(route.lookdev).toBe(false);
  });

  it('keeps Product and UX eligible for HUD design, with Engineering when the plan is requested', () => {
    const route = advisoryRoutingEligibility(HUD_SMOKE_OBJECTIVE);
    expect(route.product).toBe(true);
    expect(route.ux).toBe(true);
    expect(route.engineering).toBe(true);
    expect(shouldConsultUx(HUD_SMOKE_OBJECTIVE)).toBe(true);
    expect(shouldConsultEngineering(HUD_SMOKE_OBJECTIVE)).toBe(true);
  });

  it('keeps Engineering eligible for Game Contract architecture', () => {
    const route = advisoryRoutingEligibility(SYSTEMS_VALIDATION_OBJECTIVE);
    expect(route.engineering).toBe(true);
    expect(route.systems).toBe(true);
    expect(route.product).toBe(false);
    expect(route.ux).toBe(false);
  });

  it('keeps Worldbuilding eligible for a world lore task without Content', () => {
    const route = advisoryRoutingEligibility(WORLDBUILDING_VALIDATION_OBJECTIVE);
    expect(route.worldbuilding).toBe(true);
    expect(route.content).toBe(false);
    expect(route.product).toBe(false);
    expect(route.ux).toBe(false);
    expect(route.engineering).toBe(false);
  });

  it('keeps Content eligible for card mechanic ideation without Systems', () => {
    const route = advisoryRoutingEligibility(CARD_MECHANIC_OBJECTIVE);
    expect(route.content).toBe(true);
    expect(route.systems).toBe(false);
    expect(route.product).toBe(false);
    expect(route.ux).toBe(false);
    expect(route.engineering).toBe(false);
  });

  it('keeps LookDev eligible for visual effect presentation without UX unless interaction is asked', () => {
    expect(shouldConsultLookDev(VISUAL_EFFECT_OBJECTIVE)).toBe(true);
    expect(shouldConsultUx(VISUAL_EFFECT_OBJECTIVE)).toBe(false);
    expect(shouldConsultLookDev(LOOKDEV_VALIDATION_OBJECTIVE)).toBe(true);
  });

  it('keeps Research eligible for external reference analysis', () => {
    expect(shouldConsultResearch(RESEARCH_VALIDATION_OBJECTIVE)).toBe(true);
    expect(shouldConsultProduct(RESEARCH_VALIDATION_OBJECTIVE)).toBe(false);
  });

  it('enables Product only for player-facing product work', () => {
    expect(shouldConsultProduct(PRODUCT_OBJECTIVE)).toBe(true);
    expect(shouldConsultProduct(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
  });

  it('enables Engineering only for implementation or contract work', () => {
    expect(shouldConsultEngineering(ENGINEERING_OBJECTIVE)).toBe(true);
    expect(shouldConsultEngineering(CREATIVE_VALIDATION_OBJECTIVE)).toBe(false);
  });

  it('never requires UX to verify harness retrieval', () => {
    expect(isHarnessInfrastructureRequest(HARNESS_VAULT_CHECK)).toBe(true);
    expect(shouldConsultUx(HARNESS_VAULT_CHECK)).toBe(false);
    expect(shouldConsultProduct(HARNESS_VAULT_CHECK)).toBe(false);
    expect(shouldConsultEngineering(HARNESS_VAULT_CHECK)).toBe(false);
    expect(shouldConsultContent(HARNESS_VAULT_CHECK)).toBe(false);
    expect(shouldConsultWorldbuilding(HARNESS_VAULT_CHECK)).toBe(false);
  });
});

describe('Obsidian world-lore semantics', () => {
  it('encodes the current vault profile without permanently banning future character lore', () => {
    expect(CURRENT_VAULT_PROFILE).toEqual({
      world_story_lore: true,
      plotline: true,
      setting_lore: true,
      gameplay_rules: false,
      character_specific_canon: false,
    });
    expect(characterSearchMissIsNotFailure()).toBe(true);
    expect(characterSearchMissIsNotFailure({ ...CURRENT_VAULT_PROFILE, character_specific_canon: true })).toBe(
      false,
    );
  });

  it('keeps world lore below gameplay rules and treats story implications as theme', () => {
    expect(loreCannotOverrideGameplay()).toBe(true);
    expect(storyImplicationIsThematicOnly()).toBe(true);
    expect(worldbuildingAuthorityRank('CANONICAL')).toBeGreaterThan(
      worldbuildingAuthorityRank('FIRST_PARTY_WORLD_KNOWLEDGE'),
    );
    expect(contentCannotTreatLoreAsRuleAuthority()).toBe(true);
    expect(
      proposalTreatsLoreAsRules(
        'The story describes reality becoming unstable, so Obsidian lore authorizes a new probability subsystem.',
      ),
    ).toBe(true);
  });

  it('does not treat a character search miss as a vault failure', async () => {
    const packet = await retrieveWorldKnowledgePacket({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      index,
      assets: [],
      client: mockClient([]),
      content_concept: 'Chaos uncertainty sigils',
      candidate_name: 'Null-Sigil',
    });
    expect(packet.search_outcome).toBe('WORLD_KNOWLEDGE_NO_MATCH');
    expect(packet.unresolved_questions).not.toContain('No vault note established Null-Sigil.');
    expect(characterSearchMissIsNotFailure(packet.vault_profile)).toBe(true);
  });

  it('lets retrieved world lore inform proposed character lore without becoming biography', async () => {
    const packet = await retrieveWorldKnowledgePacket({
      objective: 'Develop one Chaos Character candidate.',
      index,
      assets: [],
      content_concept: 'Chaos quantum uncertainty',
      candidate_name: 'Null-Sigil',
      client: mockClient([
        note(
          'Events/Quantum-Event.md',
          `---
status: established
---
# Quantum Event

Reality became unstable around the quantum event.
`,
        ),
      ]),
    });
    const proposal: WorldProposal = {
      concept_id: 'concept-chaos-character',
      title: 'Null-Sigil',
      statement: 'This Character could have emerged from the quantum event.',
      evidence_kind: 'ESTABLISHED_WORLD_LORE',
      related_names: ['Quantum Event'],
      related_first_party_evidence: [],
      challenges_established: [],
    };
    const classified = classifyWorldbuildingProposal(proposal, packet);
    expect(classified.evidence_kind).toBe('PROPOSED_CHARACTER_LORE');
  });

  it('does not promote a proposed character relationship into established world lore', () => {
    const packet = {
      objective: 'character',
      searched: true,
      vault_reachable: true,
      vault_name: 'Obsidian - 0uroboros',
      canonical_world_ids: ['WORLD-CORE-001'],
      notes: [
        {
          path: 'Events/X.md',
          title: 'Event X',
          status: 'ESTABLISHED_LORE' as const,
          status_reason: 'frontmatter',
          evidence_kind: 'FIRST_PARTY_WORLD_KNOWLEDGE' as const,
          tags: [],
          properties: {},
          linked_concepts: [],
          excerpts: [{ note_path: 'Events/X.md', title: 'Event X', status: 'ESTABLISHED_LORE' as const, text: 'Event X fractured the network.' }],
        },
      ],
      excerpts: [],
      linked_concepts: [],
      card_or_character_names: ['Null-Sigil'],
      first_party_asset_ids: [],
      visual_observations: [],
      user_guidance: [],
      unresolved_questions: [],
      evidence_tensions: [],
      provenance: [],
      search_outcome: 'MATCHED' as const,
      queries_used: ['Chaos'],
      vault_profile: CURRENT_VAULT_PROFILE,
    };
    const relationship = classifyWorldRelationship(
      { from: 'Null-Sigil', to: 'Event X', relation: 'This Character could have emerged from X.' },
      packet,
      'Null-Sigil',
    );
    expect(relationship.evidence_kind).toBe('PROPOSED_CHARACTER_LORE');
  });

  it('does not mark a complete candidate incomplete because the vault had no match', () => {
    const envelope = buildCandidateEnvelope({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      sharedConceptId: 'concept-chaos-character',
      synthesis: synthesis(),
      contentResults: [contentResult()],
      worldbuildingResults: [worldResult()],
      specialistFailures: [],
    });
    expect(envelope?.status).toBe('CANDIDATE');
    expect(emptyVaultMatchDoesNotMakeIncomplete('WORLD_KNOWLEDGE_NO_MATCH', true)).toBe(true);
    expect(envelopeRemainsCandidateDespiteEmptyVault(envelope, 'WORLD_KNOWLEDGE_NO_MATCH')).toBe(true);
  });

  it('prefers world concepts over generic objective words and gameplay bookkeeping', () => {
    const plan = buildWorldKnowledgeQueries({
      objective: CREATIVE_VALIDATION_OBJECTIVE,
      content_concept: 'Chaos quantum uncertainty sigils intrusion',
      content_summary: 'assumptions OnReveal Power Drain Action bounded',
      candidate_name: 'Null-Sigil',
    });
    const lowered = plan.queries.map((item) => item.toLowerCase());
    expect(lowered).toEqual(expect.arrayContaining(['chaos', 'uncertainty']));
    expect(lowered).not.toContain('develop');
    expect(lowered).not.toContain('assumptions');
    expect(lowered).not.toContain('onreveal');
    expect(lowered.slice(0, 4).join(' ')).not.toMatch(/null-sigil/);
  });

  it('retrieves only bounded linked notes from pass-1 hits', async () => {
    const packet = await retrieveWorldKnowledgePacket({
      objective: 'Develop one Chaos Character candidate.',
      index,
      assets: [],
      content_concept: 'Chaos intrusion',
      client: mockClient([
        note(
          'Factions/Chaos-Intrusion.md',
          `---
status: established
---
# Chaos Intrusion

Chaos operators exploit the [[Quantum-Fracture]].
`,
        ),
        note(
          'Events/Quantum-Fracture.md',
          `---
status: established
---
# Quantum-Fracture

Reality became unstable around the quantum event. No Chaos keyword here.
`,
        ),
        note('Journal/groceries.md', '# Groceries\n\nMilk, eggs, and bread.'),
      ]),
    });
    expect(packet.notes.map((item) => item.path)).toEqual(
      expect.arrayContaining(['Factions/Chaos-Intrusion.md', 'Events/Quantum-Fracture.md']),
    );
    expect(packet.notes.some((item) => item.path === 'Journal/groceries.md')).toBe(false);
    expect(packet.notes.length).toBeLessThanOrEqual(8);
  });

  it('keeps Worldbuilding read-only against Obsidian', () => {
    expect(worldbuildingObsidianIsReadOnly()).toBe(true);
  });

  it('normalizes Worldbuilding character identity as proposed lore', () => {
    const asg = validateWorldbuildingAssignment(
      {
        ...assignment({
          role: 'worldbuilding',
          objective: CREATIVE_VALIDATION_OBJECTIVE,
          proposal_limit: 1,
        }),
        shared_concept_ids: ['concept-chaos-character'],
      },
      budget,
    );
    const parsed = validateWorldbuildingResponse(
      { ...worldResult(), assignment_id: asg.assignment_id },
      asg,
      budget,
      {
        objective: CREATIVE_VALIDATION_OBJECTIVE,
        searched: true,
        vault_reachable: true,
        vault_name: 'Obsidian - 0uroboros',
        canonical_world_ids: ['WORLD-CORE-001'],
        notes: [],
        excerpts: [],
        linked_concepts: [],
        card_or_character_names: ['Null-Sigil'],
        first_party_asset_ids: [],
        visual_observations: [],
        user_guidance: [],
        unresolved_questions: ['WORLD_KNOWLEDGE_NO_MATCH'],
        evidence_tensions: [],
        provenance: [],
        search_outcome: 'WORLD_KNOWLEDGE_NO_MATCH',
        queries_used: ['Chaos'],
        vault_profile: CURRENT_VAULT_PROFILE,
      },
    );
    expect(parsed.world_proposals[0]?.evidence_kind).toBe('PROPOSED_CHARACTER_LORE');
    expect(parsed.relationships[0]?.evidence_kind).toBe('PROPOSED_CHARACTER_LORE');
  });
});

describe('Null-Sigil latest-run replay', () => {
  it('interprets the historical run under corrected world semantics without rewriting artifacts', () => {
    const replay = interpretNullSigilCreativeRun(
      join(process.cwd(), 'tools/agent-harness/runs', NULL_SIGIL_CREATIVE_RUN_ID),
    );
    expect(replay.candidate_name).toBe('Null-Sigil');
    expect(replay.approved).toBe(false);
    expect(replay.envelope_status).toBe('CANDIDATE');
    expect(replay.content_contribution_valid).toBe(true);
    expect(replay.worldbuilding_contribution_valid).toBe(true);
    expect(replay.empty_vault_is_not_incomplete).toBe(true);
    expect(replay.astra_called_incomplete_for_empty_vault).toBe(true);
    expect(replay.chaos_affiliation).toBe('PROPOSED_CHARACTER_LORE');
    expect(replay.visual_adjacency).toBe('unsupported_proposed');
    expect(replay.ux_invocation).toBe('routing_defect');
    expect(replay.reviewer_invoked).toBe(false);
    expect(replay.deck_mismatch).toBe(false);
    expect(replay.execution).toBe(false);
    expect(replay.historical_queries.join(' ')).toMatch(/Null-Sigil|assumptions|OnReveal/);
  });
});
