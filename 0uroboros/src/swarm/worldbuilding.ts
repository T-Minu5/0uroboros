import type { RunBudgetConfig } from './config';
import type { CanonicalIndex } from './context';
import { formatCanonicalExcerpts, retrieveCanonical } from './context';
import type {
  FirstPartyAssetRecord,
  FirstPartyVisualObservation,
  WorldKnowledgePacket,
  WorldProposal,
  WorldbuildingAssignment,
  WorldbuildingResponse,
} from './contracts';
import { WorldbuildingAssignmentSchema, WorldbuildingResponseSchema } from './contracts';
import { GovernanceError } from './errors';
import {
  formatCachedObservations,
  proposalLimitForCreativeTask,
  relevantAssetsForObjective,
} from './creative';
import { resolveAssignmentContext } from './assignmentContext';
import {
  CURRENT_VAULT_PROFILE,
  classifyWorldRelationship,
  emptyWorldKnowledgePacket,
  establishedFactsFromPacket,
  formatWorldKnowledgePacket,
  isEstablishedWorldStatus,
  loreCannotOverrideGameplay,
  reconcileWorldProposal,
} from './worldKnowledge';
import {
  WORLDBUILDING_OBSIDIAN_READ_TOOLS,
  worldbuildingCannotMutateVault,
  worldbuildingHasNoObsidianWriteTools,
} from './obsidianMcp';

import { isHarnessInfrastructureRequest } from './harnessRouting';

const WORLDBUILDING_OBJECTIVE_RE =
  /\b(lore|faction|world identity|worldbuilding|naming system|character identity|location identity|obsidian|symbolic system|thematic cohesion|node feratu|world bible)\b/i;

const WORLDBUILDING_BLOCKED_RE =
  /\b(balance analysis|implementation mismatch|technical framework|simple effect animation|known rule interpretation|sdk research)\b/i;

const SPARSE_SUBGENRE_RE = /\b(solarpunk|lunarpunk|psychobilly)\b/i;

export function shouldConsultWorldbuilding(objective: string): boolean {
  if (isHarnessInfrastructureRequest(objective)) return false;
  if (WORLDBUILDING_BLOCKED_RE.test(objective)) return false;
  return WORLDBUILDING_OBJECTIVE_RE.test(objective);
}

export function worldbuildingCannotExecute(): boolean {
  return true;
}

export function worldbuildingCannotInvokeAgents(): boolean {
  return true;
}

export function worldbuildingCreatesWorkPackages(_response: WorldbuildingResponse): never[] {
  return [];
}

export function worldbuildingCannotWriteMechanics(): boolean {
  return true;
}

export function worldbuildingObsidianReadTools(): readonly string[] {
  return WORLDBUILDING_OBSIDIAN_READ_TOOLS;
}

export function worldbuildingObsidianIsReadOnly(): boolean {
  return worldbuildingHasNoObsidianWriteTools() && worldbuildingCannotMutateVault();
}

export { loreCannotOverrideGameplay };

export function validateWorldbuildingAssignment(
  value: unknown,
  budget: RunBudgetConfig,
): WorldbuildingAssignment {
  const assignment = WorldbuildingAssignmentSchema.parse({
    ...(value && typeof value === 'object' ? value : {}),
    role: 'worldbuilding',
  });
  const limited = {
    ...assignment,
    proposal_limit: proposalLimitForCreativeTask(assignment.objective, assignment.proposal_limit),
  };
  if (limited.proposal_limit > budget.max_worldbuilding_concepts) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Worldbuilding assignment ${limited.assignment_id} proposal_limit exceeds MAX_WORLDBUILDING_CONCEPTS ${budget.max_worldbuilding_concepts}.`,
    );
  }
  if (limited.proposal_limit > budget.max_proposals_per_assignment) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Worldbuilding assignment ${limited.assignment_id} proposal_limit exceeds configured maximum.`,
    );
  }
  return limited;
}

export function validateWorldbuildingResponse(
  value: unknown,
  assignment: WorldbuildingAssignment,
  budget: RunBudgetConfig,
  packet?: WorldKnowledgePacket,
): WorldbuildingResponse {
  const response = WorldbuildingResponseSchema.parse(value);
  const harnessConceptId = assignment.shared_concept_ids[0] ?? '';
  if (packet && response.world_proposals.length > 0 && !packet.searched) {
    throw new GovernanceError(
      'SEARCH_REQUIRED',
      'Worldbuilding must search the Obsidian vault before proposing new lore.',
    );
  }
  const limit = Math.min(assignment.proposal_limit, budget.max_worldbuilding_concepts);
  if (response.world_proposals.length > limit) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Worldbuilding returned ${response.world_proposals.length} concepts; limit is ${limit}.`,
    );
  }
  const proposals = response.world_proposals
    .map((proposal) => ({
      ...proposal,
      concept_id: harnessConceptId || proposal.concept_id,
    }))
    .map((proposal) => (packet ? reconcileWorldProposal(proposal, packet) : proposal))
    .map((proposal) => markProposedLore(proposal, packet));
  const candidateName = proposals[0]?.title;
  const relationships = (packet
    ? response.relationships.map((item) => classifyWorldRelationship(item, packet, candidateName))
    : response.relationships
  );
  const links = packet?.linked_concepts.length
    ? uniqueRelationships([
        ...response.obsidian_links,
        ...packet.linked_concepts.slice(0, 12).map((to) => ({
          from: packet.card_or_character_names[0] || packet.notes[0]?.title || 'World',
          to,
          relation: '[[wikilink]]',
        })),
      ])
    : response.obsidian_links;
  return {
    ...response,
    agent: 'worldbuilding',
    assignment_id: assignment.assignment_id,
    world_proposals: proposals,
    relationships,
    established_facts_used: uniqueStrings([
      ...response.established_facts_used,
      ...(packet ? establishedFactsFromPacket(packet).slice(0, 6) : []),
    ]),
    vault_searched: packet?.searched ?? response.vault_searched,
    vault_note_paths: packet?.notes.map((note) => note.path) ?? response.vault_note_paths,
    note_statuses: packet?.notes.map((note) => ({ path: note.path, status: note.status })) ?? response.note_statuses,
    evidence_tensions: packet?.evidence_tensions ?? response.evidence_tensions,
    obsidian_links: links,
    open_questions: uniqueStrings([
      ...response.open_questions,
      ...(packet?.unresolved_questions ?? []),
    ]),
    first_party_asset_ids: uniqueStrings([
      ...response.first_party_asset_ids,
      ...(packet?.first_party_asset_ids ?? []),
    ]),
    risks: uniqueStrings([
      ...response.risks,
      ...proposals.flatMap((proposal) =>
        proposal.challenges_established.map(
          (fact) => `WORLD_PROPOSAL challenges established lore: ${fact}`,
        ),
      ),
      loreCannotOverrideGameplay()
        ? 'Gameplay rules remain above worldbuilding material. Lore cannot override mechanics.'
        : '',
    ]),
  };
}

export function worldbuildingConceptIdMismatches(
  value: unknown,
  harnessConceptId: string,
): string[] {
  const parsed = WorldbuildingResponseSchema.safeParse(value);
  if (!parsed.success || !harnessConceptId) return [];
  return uniqueStrings(
    parsed.data.world_proposals
      .map((proposal) => proposal.concept_id)
      .filter((id) => id.trim().length > 0 && id !== harnessConceptId),
  );
}

export function markProposedLore(
  proposal: WorldProposal,
  packet?: WorldKnowledgePacket,
): WorldProposal {
  if (proposal.evidence_kind === 'WORLD_EVIDENCE_TENSION') return proposal;
  if (proposal.evidence_kind === 'WORLD_PROPOSAL') return proposal;
  if (proposal.evidence_kind === 'FIRST_PARTY_WORLD_DRAFT') return proposal;
  if (proposal.evidence_kind === 'EXTERNAL_EVIDENCE') return proposal;
  if (proposal.evidence_kind === 'PROPOSED_CHARACTER_LORE') return proposal;
  if (proposal.evidence_kind === 'PROPOSED_WORLD_EXTENSION') return proposal;
  if (proposal.evidence_kind === 'VISUAL_INFERENCE') return proposal;
  if (proposal.evidence_kind === 'ESTABLISHED_FACT') return proposal;
  if (
    proposal.evidence_kind === 'FIRST_PARTY_WORLD_KNOWLEDGE' ||
    proposal.evidence_kind === 'ESTABLISHED_WORLD_LORE'
  ) {
    const established = packet?.notes.some(
      (note) =>
        isEstablishedWorldStatus(note.status) &&
        (note.title === proposal.title ||
          note.excerpts.some((excerpt) => excerpt.text.includes(proposal.statement.slice(0, 40)))),
    );
    if (established) {
      return { ...proposal, evidence_kind: 'ESTABLISHED_WORLD_LORE' };
    }
    return { ...proposal, evidence_kind: 'PROPOSED_LORE' };
  }
  const assignsMeaning = /\b(belongs|means|covenant|cult|order that|faction)\b/i.test(
    proposal.statement,
  );
  if (proposal.evidence_kind === 'FIRST_PARTY_VISUAL_OBSERVATION' && !assignsMeaning) {
    return proposal;
  }
  return { ...proposal, evidence_kind: 'PROPOSED_LORE' };
}

export function preservesCoreTheme(text: string): boolean {
  return /cyberpunk/i.test(text) && /quantum/i.test(text) && /occult/i.test(text);
}

export function sparseSubgenreAccent(text: string): boolean {
  return SPARSE_SUBGENRE_RE.test(text);
}

export function assembleWorldbuildingPacket(input: {
  objective: string;
  index: CanonicalIndex;
  assets: FirstPartyAssetRecord[];
  observations?: FirstPartyVisualObservation[];
  shared_concept_ids?: string[];
  world_knowledge?: WorldKnowledgePacket;
  liveAssetIds?: string[];
}): {
  canonical_ids: string[];
  excerpt_text: string;
  established_names: string[];
  first_party_asset_ids: string[];
  observation_text: string;
  shared_concept_ids: string[];
  constraints: string[];
  world_knowledge: WorldKnowledgePacket;
} {
  const gameplay = resolveAssignmentContext(input.objective, input.index);
  const namedAssets = relevantAssetsForObjective(input.objective, input.assets, {
    liveAssetIds: input.liveAssetIds,
  });
  const theme = retrieveCanonical(input.index, {
    ids: [
      'WORLD-CORE-001',
      'WORLD-CORE-002',
      'WORLD-CORE-003',
      'WORLD-SUB-001',
      'WORLD-SUB-002',
      'WORLD-OBS-001',
      'LOOKDEV-COLLAPSE-003',
    ],
  });
  const ids = uniqueStrings([...theme.map((item) => item.id), ...gameplay.canonical_ids.slice(0, 6)]).slice(0, 16);
  const world_knowledge =
    input.world_knowledge ?? emptyWorldKnowledgePacket(input.objective, { canonical_world_ids: ids });
  const shared = uniqueStrings(input.shared_concept_ids ?? []);
  return {
    canonical_ids: ids,
    excerpt_text: formatCanonicalExcerpts(retrieveCanonical(input.index, { ids })),
    established_names: uniqueStrings([
      ...namedAssets.map((item) => item.associated_card_or_character),
      ...world_knowledge.card_or_character_names,
    ]),
    first_party_asset_ids: uniqueStrings([
      ...namedAssets.map((item) => item.asset_id),
      ...world_knowledge.first_party_asset_ids,
    ]),
    observation_text: formatCachedObservations(
      (input.observations ?? world_knowledge.visual_observations)
        .filter((item) =>
          namedAssets.some((asset) => asset.asset_id === item.asset_id) || namedAssets.length === 0,
        )
        .slice(0, 4),
      namedAssets,
    ),
    shared_concept_ids: shared.length > 0 ? shared.slice(0, 1) : shared,
    world_knowledge,
    constraints: [
      `Current vault profile: world_story_lore=${CURRENT_VAULT_PROFILE.world_story_lore}, plotline=${CURRENT_VAULT_PROFILE.plotline}, setting_lore=${CURRENT_VAULT_PROFILE.setting_lore}, gameplay_rules=${CURRENT_VAULT_PROFILE.gameplay_rules}, character_specific_canon=${CURRENT_VAULT_PROFILE.character_specific_canon}.`,
      'Ask what established world/story concepts are relevant to this proposed character. Do not ask what the vault says about this character.',
      'Search high-signal world concepts first. Character-name misses are expected and are not defects.',
      'Distinguish ESTABLISHED_WORLD_LORE, PROPOSED_CHARACTER_LORE, PROPOSED_WORLD_EXTENSION, and VISUAL_INFERENCE. Do not conflate them.',
      'FIRST_PARTY_WORLD_KNOWLEDGE is Mel-authored story, setting, narrative, and world-lore. It is not authoritative knowledge of every named game entity.',
      'UNKNOWN_STATUS and draft notes are not canon. Do not promote drafts.',
      'Deprecated notes cannot override current material.',
      'A visible motif is VISUAL_INFERENCE, not character canon.',
      'Representative first-party art informs established visual language. It is not the new character.',
      'A proposed relationship to a world event is PROPOSED_CHARACTER_LORE unless the vault establishes that relationship.',
      'If a stronger alternative would challenge established lore, emit WORLD_PROPOSAL and name the fact. Do not silently overwrite it.',
      'WORLD_EVIDENCE_TENSION is for vault/art mismatch. It is not a gameplay rule conflict.',
      'Story prose that implies gameplay is thematic only. Lore cannot override RULE, TECH, CONTRACT, or approved mechanics.',
      'Preserve Cyberpunk + Quantum Physics + Occult. Solarpunk/Lunarpunk/Psychobilly stay sparse accents.',
      'Do not define card mechanics.',
      'WORLD_KNOWLEDGE_NO_MATCH means no relevant world lore was retrieved. It does not make a candidate incomplete.',
      'Do not write into the Obsidian vault. Search, read, and follow bounded wikilinks only.',
    ],
  };
}

export function formatWorldbuildingPacket(
  packet: ReturnType<typeof assembleWorldbuildingPacket>,
): string {
  return [
    'Worldbuilding packet. Propose world identity, not mechanics.',
    `Shared concept IDs: ${packet.shared_concept_ids.join(', ') || '(assign one per new concept)'}`,
    `Established names: ${packet.established_names.join(', ') || '(none named)'}`,
    `First-party assets: ${packet.first_party_asset_ids.join(', ') || '(none)'}`,
    'Constraints:',
    packet.constraints.join('\n'),
    'Canonical excerpts:',
    packet.excerpt_text,
    'Cached visual observations (not lore):',
    packet.observation_text,
    formatWorldKnowledgePacket(packet.world_knowledge),
  ].join('\n');
}

function uniqueRelationships(
  links: Array<{ from: string; to: string; relation: string }>,
): Array<{ from: string; to: string; relation: string }> {
  const seen = new Set<string>();
  const result: Array<{ from: string; to: string; relation: string }> = [];
  for (const link of links) {
    const key = `${link.from}=>${link.to}:${link.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result.slice(0, 12);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
