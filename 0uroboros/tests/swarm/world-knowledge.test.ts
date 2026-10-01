import { describe, expect, it } from 'vitest';

import {
  createPlanningTeam,
  SPECIALIST_TOOL_NAMES,
  toolNames,
} from '../../src/swarm/agents';
import { inventoryFirstPartyAssets } from '../../src/swarm/assets';
import {
  contentCannotTreatLoreAsRuleAuthority,
  proposalTreatsLoreAsRules,
  rejectLoreAsRuleAuthority,
  validateContentAssignment,
  validateContentResponse,
} from '../../src/swarm/content';
import type {
  FirstPartyVisualObservation,
  WorldKnowledgePacket,
  WorldProposal,
} from '../../src/swarm/contracts';
import { FirstPartyVisualObservationSchema } from '../../src/swarm/contracts';
import { GovernanceError } from '../../src/swarm/errors';
import {
  OBSIDIAN_WRITE_TOOLS,
  WORLDBUILDING_OBSIDIAN_READ_TOOLS,
  extractWikilinks,
  parseFrontmatter,
  worldbuildingHasNoObsidianWriteTools,
  type ObsidianVaultClient,
  type VaultNoteRecord,
  type VaultSearchHit,
} from '../../src/swarm/obsidianMcp';
import {
  MAX_WORLD_KNOWLEDGE_EXCERPTS,
  MAX_WORLD_KNOWLEDGE_NOTES,
  classifyWorldNoteStatus,
  establishedLorePreferredOverInvention,
  evidenceKindForNoteStatus,
  loreCannotOverrideGameplay,
  reconcileWorldProposal,
  retrieveWorldKnowledgePacket,
  unknownStatusRemainsUncertain,
  visualEvidenceIsNotLore,
  worldbuildingAuthorityRank,
} from '../../src/swarm/worldKnowledge';
import {
  assembleWorldbuildingPacket,
  markProposedLore,
  validateWorldbuildingAssignment,
  validateWorldbuildingResponse,
  worldbuildingObsidianIsReadOnly,
} from '../../src/swarm/worldbuilding';
import { assignment, emptyRuntime, testCanonical, testConfig } from './fixtures';

const index = testCanonical();
const budget = testConfig().budget;
const assets = inventoryFirstPartyAssets();

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

const vaultNotes = [
  note(
    'Factions/Node-Feratu.md',
    `---
status: established
tags:
  - canon
---
# Node-Feratu

Key belongs to the [[Hex-Hackers]] before the [[Node-Feratu]] recruit them.

The Node-Feratu were originally servants of the [[Tesseract Magi]].
They manipulate probability through stolen dream knowledge.
`,
  ),
  note(
    'Drafts/Node-Feratu-moon-cult.md',
    `---
status: draft
---
# Draft moon cult

Idea: Node-Feratu become a lunar covenant. This is brainstorming only.
`,
  ),
  note(
    'Archive/Node-Feratu-old.md',
    `---
status: deprecated
---
# Deprecated

The Node-Feratu belong to the Magi as loyal soldiers forever. Discarded.
`,
  ),
  note(
    'Scratch/untitled.md',
    `# Untitled Node-Feratu note

No status metadata. Maybe they collect antique toasters.
`,
  ),
  note(
    'Journal/groceries.md',
    `# Groceries

Milk, eggs, and bread. Unrelated to the world.
`,
  ),
];

async function packet(objective = 'Retrieve established lore for Node Feratu.'): Promise<WorldKnowledgePacket> {
  return retrieveWorldKnowledgePacket({
    objective,
    index,
    assets,
    client: mockClient(vaultNotes),
  });
}

function worldAsg(objective: string) {
  return validateWorldbuildingAssignment(
    assignment({ role: 'worldbuilding', objective, proposal_limit: 1 }),
    budget,
  );
}

function observation(overrides: Partial<FirstPartyVisualObservation> = {}): FirstPartyVisualObservation {
  return FirstPartyVisualObservationSchema.parse({
    asset_id: 'asset-card-art-chaos-cards-node-feratu-png',
    inspection_status: 'INSPECTED_RASTER',
    subject: 'Node Feratu',
    visible_motifs: ['crescent', 'chrome blade'],
    silhouette_notes: '',
    materials: ['chrome'],
    lighting: 'rim',
    palette_observations: [],
    cyberpunk_signals: [],
    quantum_signals: [],
    occult_signals: [],
    subgenre_signals: [],
    recurring_symbols: [],
    presentation_opportunities: [],
    uncertainties: [],
    confidence: 0.8,
    inspection_model: 'test',
    schema_version: 'visual-observation-v1',
    asset_hash: 'abc',
    authority: 'FIRST_PARTY_VISUAL_ASSET',
    not_lore: true,
    ...overrides,
  });
}

describe('Obsidian world-knowledge governance', () => {
  it('prefers established lore over model invention', async () => {
    expect(establishedLorePreferredOverInvention()).toBe(true);
    const knowledge = await packet();
    const established = knowledge.notes.find((item) => item.status === 'ESTABLISHED_LORE');
    expect(established?.path).toBe('Factions/Node-Feratu.md');
    const invented: WorldProposal = {
      concept_id: 'concept-node-feratu',
      title: 'Node-Feratu',
      statement: 'Key belongs to a solar cult instead of the Node-Feratu.',
      evidence_kind: 'FIRST_PARTY_WORLD_KNOWLEDGE',
      related_names: ['Key'],
      related_first_party_evidence: [],
      challenges_established: [],
    };
    const reconciled = reconcileWorldProposal(invented, knowledge);
    expect(reconciled.evidence_kind).toBe('WORLD_PROPOSAL');
    expect(reconciled.challenges_established.length).toBeGreaterThan(0);
    expect(worldbuildingAuthorityRank('CANONICAL')).toBeGreaterThan(
      worldbuildingAuthorityRank('FIRST_PARTY_WORLD_KNOWLEDGE'),
    );
    expect(worldbuildingAuthorityRank('FIRST_PARTY_WORLD_KNOWLEDGE')).toBeGreaterThan(
      worldbuildingAuthorityRank('FIRST_PARTY_VISUAL_ASSET'),
    );
  });

  it('does not treat draft lore as established canon', async () => {
    const knowledge = await packet();
    const draft = knowledge.notes.find((item) => item.path === 'Drafts/Node-Feratu-moon-cult.md');
    expect(draft?.status).toBe('DRAFT_LORE');
    expect(draft?.evidence_kind).toBe('FIRST_PARTY_WORLD_DRAFT');
    expect(evidenceKindForNoteStatus('DRAFT_LORE')).not.toBe('FIRST_PARTY_WORLD_KNOWLEDGE');
  });

  it('does not let deprecated notes override current material', async () => {
    const knowledge = await packet();
    const deprecated = knowledge.notes.find((item) => item.status === 'DEPRECATED');
    const current = knowledge.notes.find((item) => item.status === 'ESTABLISHED_LORE');
    expect(deprecated).toBeTruthy();
    expect(current).toBeTruthy();
    expect(knowledge.notes.findIndex((item) => item.status === 'ESTABLISHED_LORE')).toBeLessThan(
      knowledge.notes.findIndex((item) => item.status === 'DEPRECATED'),
    );
    const loyalist: WorldProposal = {
      concept_id: 'concept-loyal',
      title: 'Loyal soldiers',
      statement: 'The Node-Feratu belong to the Magi as loyal soldiers forever.',
      evidence_kind: 'FIRST_PARTY_WORLD_KNOWLEDGE',
      related_names: ['Node-Feratu'],
      related_first_party_evidence: [],
      challenges_established: [],
    };
    expect(reconcileWorldProposal(loyalist, knowledge).evidence_kind).not.toBe('ESTABLISHED_FACT');
  });

  it('keeps unknown-status notes uncertain', () => {
    expect(unknownStatusRemainsUncertain()).toBe(true);
    const classified = classifyWorldNoteStatus({
      path: 'Scratch/untitled.md',
      title: 'untitled',
      content: 'Maybe they collect antique toasters.',
    });
    expect(classified.status).toBe('UNKNOWN_STATUS');
    expect(evidenceKindForNoteStatus(classified.status)).toBe('FIRST_PARTY_WORLD_DRAFT');
  });

  it('searches the vault before Worldbuilding can generate', async () => {
    const knowledge = await packet();
    expect(knowledge.searched).toBe(true);
    expect(knowledge.vault_reachable).toBe(true);
    const asg = worldAsg('Retrieve established lore for Node Feratu.');
    expect(() =>
      validateWorldbuildingResponse(
        {
          agent: 'worldbuilding',
          assignment_id: asg.assignment_id,
          summary: 'Invented without searching.',
          world_proposals: [
            {
              concept_id: 'concept-x',
              title: 'X',
              statement: 'A new faction.',
              evidence_kind: 'PROPOSED_LORE',
            },
          ],
          confidence: 0.4,
        },
        asg,
        budget,
        { ...knowledge, searched: false },
      ),
    ).toThrow(GovernanceError);
    const parsed = validateWorldbuildingResponse(
      {
        agent: 'worldbuilding',
        assignment_id: asg.assignment_id,
        summary: 'Vault facts first.',
        world_proposals: [
          {
            concept_id: 'concept-gap',
            title: 'Dream fracture residue',
            statement: 'A small proposed residue left after a Node-Feratu dream hack.',
            evidence_kind: 'PROPOSED_LORE',
          },
        ],
        confidence: 0.6,
      },
      asg,
      budget,
      knowledge,
    );
    expect(parsed.vault_searched).toBe(true);
  });

  it('bounds the world knowledge packet and excludes unrelated notes', async () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      note(`Filler/note-${i}.md`, `# Node-Feratu filler ${i}\n\nstatus is unknown.`),
    );
    const knowledge = await retrieveWorldKnowledgePacket({
      objective: 'Retrieve established lore for Node Feratu.',
      index,
      assets,
      client: mockClient([...vaultNotes, ...many]),
    });
    expect(knowledge.notes.length).toBeLessThanOrEqual(MAX_WORLD_KNOWLEDGE_NOTES);
    expect(knowledge.excerpts.length).toBeLessThanOrEqual(MAX_WORLD_KNOWLEDGE_EXCERPTS);
    expect(knowledge.notes.some((item) => item.path === 'Journal/groceries.md')).toBe(false);
  });

  it('preserves Obsidian wikilinks in the packet', async () => {
    const knowledge = await packet();
    const established = knowledge.notes.find((item) => item.path === 'Factions/Node-Feratu.md');
    expect(established?.linked_concepts).toEqual(
      expect.arrayContaining(['Hex-Hackers', 'Node-Feratu', 'Tesseract Magi']),
    );
    expect(knowledge.linked_concepts).toEqual(
      expect.arrayContaining(['Hex-Hackers', 'Tesseract Magi']),
    );
    const formatted = assembleWorldbuildingPacket({
      objective: 'Retrieve established lore for Node Feratu.',
      index,
      assets,
      world_knowledge: knowledge,
    });
    expect(formatted.world_knowledge.linked_concepts.join(' ')).toMatch(/Hex-Hackers/);
  });

  it('does not treat visual evidence as lore', () => {
    expect(visualEvidenceIsNotLore()).toBe(true);
    const visual = markProposedLore({
      concept_id: 'concept-motif',
      title: 'Crescent',
      statement: 'A crescent-shaped luminous element appears behind the character.',
      evidence_kind: 'FIRST_PARTY_VISUAL_OBSERVATION',
      related_names: ['Node Feratu'],
      related_first_party_evidence: ['asset-card-art-chaos-cards-node-feratu-png'],
      challenges_established: [],
    });
    expect(visual.evidence_kind).toBe('FIRST_PARTY_VISUAL_OBSERVATION');
  });

  it('emits WORLD_EVIDENCE_TENSION without calling it a gameplay conflict', async () => {
    const knowledge = await retrieveWorldKnowledgePacket({
      objective: 'Retrieve established lore for Node Feratu.',
      index,
      assets,
      observations: [
        observation({
          visible_motifs: ['crescent'],
          uncertainties: ['tension: lore says no crescent'],
        }),
      ],
      client: mockClient([
        note(
          'Factions/Node-Feratu.md',
          `---
status: established
---
# Node Feratu

The Node-Feratu wear no crescent and no moon marks.
`,
        ),
      ]),
    });
    expect(knowledge.evidence_tensions[0]?.kind).toBe('WORLD_EVIDENCE_TENSION');
    expect(knowledge.evidence_tensions[0]?.summary).not.toMatch(/gameplay rule/i);
  });

  it('keeps lore below gameplay rules', () => {
    expect(loreCannotOverrideGameplay()).toBe(true);
    expect(worldbuildingAuthorityRank('CANONICAL')).toBeGreaterThan(
      worldbuildingAuthorityRank('FIRST_PARTY_WORLD_KNOWLEDGE'),
    );
  });

  it('gives Worldbuilding no Obsidian write tools', () => {
    expect(worldbuildingHasNoObsidianWriteTools()).toBe(true);
    expect(worldbuildingObsidianIsReadOnly()).toBe(true);
    expect(WORLDBUILDING_OBSIDIAN_READ_TOOLS).toEqual(
      expect.arrayContaining(['search_vault_smart', 'get_vault_file', 'get_outgoing_links', 'get_note_property']),
    );
    expect(WORLDBUILDING_OBSIDIAN_READ_TOOLS.some((tool) => (OBSIDIAN_WRITE_TOOLS as readonly string[]).includes(tool))).toBe(
      false,
    );
    const team = createPlanningTeam(testConfig(), emptyRuntime());
    expect(toolNames(team.specialistAgents.worldbuilding)).toEqual([]);
    expect(toolNames(team.astra)).toContain(SPECIALIST_TOOL_NAMES.worldbuilding);
    expect(toolNames(team.specialistAgents.worldbuilding).some((name) => name.includes('vault'))).toBe(false);
  });

  it('prevents Content from treating lore as rule authority', () => {
    expect(contentCannotTreatLoreAsRuleAuthority()).toBe(true);
    expect(
      proposalTreatsLoreAsRules(
        'Vault lore authorizes a new probability subsystem that replaces RULE-PROB-007.',
      ),
    ).toBe(true);
    const blocked = rejectLoreAsRuleAuthority({
      concept_id: 'concept-prob',
      content_type: 'CHARACTER',
      name: 'Dream Latch',
      concept: 'Obsidian lore authorizes a new probability subsystem.',
      proposed_effect: 'Invent a new probability mechanic.',
      strategic_purpose: 'Use faction lore as rules.',
      gameplay_role: 'invalid lore-as-rules attempt',
      existing_rules_used: [],
      mechanics_used: [],
      rule_change_required: false,
      thematic_rationale: 'The Node-Feratu lore authorizes it.',
      related_first_party_evidence: [],
      risks: [],
    });
    expect(blocked.rule_change_required).toBe(true);
    expect(blocked.risks.join(' ')).toMatch(/cannot authorize new gameplay mechanics/);
    const asg = validateContentAssignment(
      assignment({ role: 'content', objective: 'Propose a probability card using existing mechanics.', proposal_limit: 5 }),
      budget,
    );
    const parsed = validateContentResponse(
      {
        agent: 'content',
        assignment_id: asg.assignment_id,
        summary: 'Lore-as-rules attempt.',
        content_proposals: [blocked],
        synergy_observations: [],
        rules_touched: [],
        rule_changes_required: true,
        first_party_asset_ids: [],
        research_evidence_ids: [],
        risks: [],
        balance_questions: [],
        open_questions: [],
        canonical_ids_referenced: ['RULE-PROB-007'],
        confidence: 0.4,
      },
      asg,
      budget,
      index,
    );
    expect(parsed.rule_changes_required).toBe(true);
  });
});
