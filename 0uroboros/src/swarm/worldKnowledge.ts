import type { CanonicalIndex } from './context';
import { retrieveCanonical } from './context';
import type {
  CurrentVaultProfile,
  FirstPartyAssetRecord,
  FirstPartyVisualObservation,
  WorldEvidenceKind,
  WorldEvidenceTension,
  WorldKnowledgeNote,
  WorldKnowledgePacket,
  WorldNoteStatus,
  WorldProposal,
  WorldRelationship,
} from './contracts';
import { WorldKnowledgePacketSchema } from './contracts';
import { relevantAssetsForObjective } from './creative';
import { liveCachedAssetIds, inspectFirstPartyVisuals } from './visualInspection';
import {
  buildWorldKnowledgeQueries,
  extractNamedWorldEntities,
} from './worldQuery';
import {
  createHttpObsidianVaultClient,
  discoverObsidianMcpConfig,
  extractWikilinks,
  titleFromPath,
  type ObsidianVaultClient,
  type VaultNoteRecord,
  type VaultOutgoingLink,
  type VaultSearchHit,
} from './obsidianMcp';

export const MAX_WORLD_KNOWLEDGE_NOTES = 8;
export const MAX_WORLD_KNOWLEDGE_EXCERPTS = 12;
export const MAX_WORLD_KNOWLEDGE_CHARS = 8000;
export const MAX_WORLD_KNOWLEDGE_LINKS = 12;
export const MAX_EXCERPT_CHARS = 420;

export const CURRENT_VAULT_PROFILE: CurrentVaultProfile = {
  world_story_lore: true,
  plotline: true,
  setting_lore: true,
  gameplay_rules: false,
  character_specific_canon: false,
};

export const FIRST_PARTY_WORLD_KNOWLEDGE_MEANING =
  'First-party story, setting, narrative, and world-lore knowledge authored or curated by Mel. It is not authoritative knowledge about every named game entity.';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'about', 'retrieve',
  'established', 'lore', 'inspect', 'relevant', 'first', 'party', 'visual',
  'summarize', 'identify', 'unresolved', 'propose', 'small', 'worldbuilding',
  'extension', 'existing', 'game', 'card', 'character',
]);

export function worldbuildingAuthorityRank(
  authority:
    | 'CANONICAL'
    | 'FIRST_PARTY_WORLD_KNOWLEDGE'
    | 'FIRST_PARTY_VISUAL_ASSET'
    | 'USER_CURATED_REFERENCE_GUIDANCE'
    | 'EXTERNAL_RESEARCH_EVIDENCE'
    | 'MODEL_CLAIM',
): number {
  if (authority === 'CANONICAL') return 6;
  if (authority === 'FIRST_PARTY_WORLD_KNOWLEDGE') return 5;
  if (authority === 'FIRST_PARTY_VISUAL_ASSET') return 4;
  if (authority === 'USER_CURATED_REFERENCE_GUIDANCE') return 3;
  if (authority === 'EXTERNAL_RESEARCH_EVIDENCE') return 2;
  return 1;
}

export function loreCannotOverrideGameplay(): boolean {
  return true;
}

export function storyImplicationIsThematicOnly(): boolean {
  return true;
}

export function characterSearchMissIsNotFailure(
  profile: CurrentVaultProfile = CURRENT_VAULT_PROFILE,
): boolean {
  return profile.character_specific_canon === false;
}

export function emptyVaultMatchDoesNotMakeIncomplete(
  searchOutcome: WorldKnowledgePacket['search_outcome'],
  requiredSpecialistsPresent: boolean,
): boolean {
  return requiredSpecialistsPresent && searchOutcome === 'WORLD_KNOWLEDGE_NO_MATCH'
    ? true
    : requiredSpecialistsPresent;
}

export function draftLoreIsNotCanon(): boolean {
  return true;
}

export function unknownStatusRemainsUncertain(): boolean {
  return true;
}

export function visualEvidenceIsNotLore(): boolean {
  return true;
}

export function establishedLorePreferredOverInvention(): boolean {
  return true;
}

export function noteStatusAuthority(status: WorldNoteStatus): number {
  if (status === 'ESTABLISHED_LORE' || status === 'APPROVED_WORLD_FACT') return 4;
  if (status === 'REFERENCE_NOTE') return 2;
  if (status === 'DRAFT_LORE' || status === 'WORLD_PROPOSAL' || status === 'UNKNOWN_STATUS') return 1;
  return 0;
}

export function isEstablishedWorldStatus(status: WorldNoteStatus): boolean {
  return status === 'ESTABLISHED_LORE' || status === 'APPROVED_WORLD_FACT';
}

export function classifyWorldNoteStatus(input: {
  path: string;
  title: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  headings?: string[];
}): { status: WorldNoteStatus; reason: string } {
  const frontmatterStatus = firstString(
    input.frontmatter?.status,
    input.frontmatter?.canon,
    input.frontmatter?.world_status,
    input.frontmatter?.lore_status,
  );
  const mappedFrontmatter = mapStatusToken(frontmatterStatus);
  if (mappedFrontmatter) {
    return { status: mappedFrontmatter, reason: `frontmatter ${frontmatterStatus}` };
  }
  const tagHit = (input.tags ?? []).map((tag) => mapStatusToken(tag)).find(Boolean);
  if (tagHit) {
    return { status: tagHit, reason: 'tag' };
  }
  const folder = input.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  const folderHit = mapStatusToken(folder);
  if (folderHit) {
    return { status: folderHit, reason: `folder ${folder}` };
  }
  const haystack = [
    input.title,
    input.path,
    ...(input.headings ?? []).slice(0, 8),
    input.content.slice(0, 800),
  ].join('\n');
  const explicit = mapStatusToken(haystack);
  if (explicit) {
    return { status: explicit, reason: 'explicit wording' };
  }
  return { status: 'UNKNOWN_STATUS', reason: 'no explicit status metadata' };
}

export function evidenceKindForNoteStatus(status: WorldNoteStatus): WorldEvidenceKind {
  if (status === 'ESTABLISHED_LORE' || status === 'APPROVED_WORLD_FACT') {
    return 'FIRST_PARTY_WORLD_KNOWLEDGE';
  }
  if (status === 'DEPRECATED') return 'FIRST_PARTY_WORLD_DRAFT';
  if (status === 'WORLD_PROPOSAL') return 'WORLD_PROPOSAL';
  if (status === 'REFERENCE_NOTE') return 'EXTERNAL_EVIDENCE';
  return 'FIRST_PARTY_WORLD_DRAFT';
}

export function emptyWorldKnowledgePacket(
  objective: string,
  extras: Partial<WorldKnowledgePacket> = {},
): WorldKnowledgePacket {
  return WorldKnowledgePacketSchema.parse({
    objective,
    searched: false,
    vault_reachable: false,
    ...extras,
  });
}

export async function retrieveWorldKnowledgePacket(input: {
  objective: string;
  index: CanonicalIndex;
  assets: FirstPartyAssetRecord[];
  observations?: FirstPartyVisualObservation[];
  user_guidance?: string[];
  client?: ObsidianVaultClient | null;
  cwd?: string;
  queries?: string[];
  content_summary?: string;
  content_concept?: string;
  candidate_name?: string;
  candidate_type?: string;
  canonical_theme_tags?: string[];
  vault_profile?: CurrentVaultProfile;
}): Promise<WorldKnowledgePacket> {
  const vaultProfile = input.vault_profile ?? CURRENT_VAULT_PROFILE;
  const canonicalIds = retrieveCanonical(input.index, {
    ids: ['WORLD-CORE-001', 'WORLD-CORE-002', 'WORLD-CORE-003', 'WORLD-OBS-001'],
  }).map((item) => item.id);
  const namedAssets = relevantAssetsForObjective(input.objective, input.assets, {
    liveAssetIds: liveCachedAssetIds(input.assets, { cwd: input.cwd }),
  });
  const resolvedObservations =
    input.observations ?? inspectFirstPartyVisuals(namedAssets, { cwd: input.cwd ?? process.cwd() });
  const worldEntities = extractNamedWorldEntities(input.objective);
  const queryPlan = buildWorldKnowledgeQueries({
    objective: input.objective,
    content_summary: input.content_summary,
    content_concept: input.content_concept,
    candidate_name: input.candidate_name,
    candidate_type: input.candidate_type,
    canonical_theme_tags: input.canonical_theme_tags,
    existing_entity_names: worldEntities,
    visual_motifs: resolvedObservations.flatMap((item) => item.visible_motifs),
  });
  const queries =
    input.queries && input.queries.length > 0 ? uniqueStrings(input.queries).slice(0, 6) : queryPlan.queries;
  const names = uniqueStrings([
    ...worldEntities,
    ...queryPlan.named_entities,
    ...(input.candidate_name ? [input.candidate_name] : []),
  ]);
  const client = input.client ?? createVaultClient(input.cwd);
  if (!client) {
    return emptyWorldKnowledgePacket(input.objective, {
      searched: true,
      canonical_world_ids: canonicalIds,
      card_or_character_names: names,
      first_party_asset_ids: namedAssets.map((item) => item.asset_id),
      visual_observations: relevantObservations(resolvedObservations, namedAssets),
      user_guidance: input.user_guidance ?? [],
      unresolved_questions: ['Obsidian MCP is not configured. Worldbuilding cannot search the vault.'],
      provenance: ['FIRST_PARTY_WORLD_KNOWLEDGE unavailable'],
      search_outcome: 'UNAVAILABLE',
      queries_used: queries,
      vault_profile: vaultProfile,
    });
  }

  try {
    const server = await client.getServerInfo();
    const hits = await searchVault(client, queries.slice(0, 4));
    const selected = selectRelevantHits(hits, queries).slice(0, MAX_WORLD_KNOWLEDGE_NOTES);
    const notes: WorldKnowledgeNote[] = [];
    for (const hit of selected) {
      const record = await readVaultNote(client, hit.path);
      const status = classifyWorldNoteStatus(record);
      const excerptSources = hit.matches.map((match) => match.context).filter(Boolean);
      notes.push(toKnowledgeNote(record, status.status, status.reason, excerptSources, queries));
    }
    const pass1 = preferCurrentOverDeprecated(boundWorldKnowledgeNotes(notes, queries));
    const linked = await retrieveLinkedNotes(client, pass1, MAX_WORLD_KNOWLEDGE_NOTES - pass1.length);
    const followQueries = uniqueStrings([
      ...queries,
      ...linked.flatMap((note) => [note.title, ...note.linked_concepts]),
    ]);
    const bounded = preferCurrentOverDeprecated(
      boundWorldKnowledgeNotes([...pass1, ...linked], followQueries, linked.map((note) => note.path)),
    );
    const excerpts = bounded.flatMap((note) => note.excerpts).slice(0, MAX_WORLD_KNOWLEDGE_EXCERPTS);
    const links = uniqueStrings(bounded.flatMap((note) => note.linked_concepts)).slice(
      0,
      MAX_WORLD_KNOWLEDGE_LINKS,
    );
    const observations = relevantObservations(resolvedObservations, namedAssets);
    const tensions = detectWorldEvidenceTensions(bounded, observations);
    const noMatch = bounded.length === 0;
    const unresolved = uniqueStrings([
      ...collectUnresolvedQuestions(bounded, {
        candidateName: input.candidate_name,
        profile: vaultProfile,
      }),
      ...(noMatch ? ['WORLD_KNOWLEDGE_NO_MATCH'] : []),
    ]);
    const packet = WorldKnowledgePacketSchema.parse({
      objective: input.objective,
      searched: true,
      vault_reachable: true,
      vault_name: server.vault_name,
      canonical_world_ids: canonicalIds,
      notes: bounded,
      excerpts,
      linked_concepts: links,
      card_or_character_names: names,
      first_party_asset_ids: namedAssets.map((item) => item.asset_id),
      visual_observations: observations,
      user_guidance: input.user_guidance ?? [],
      unresolved_questions: unresolved,
      evidence_tensions: tensions,
      provenance: [
        'FIRST_PARTY_WORLD_KNOWLEDGE from Mel Obsidian vault',
        FIRST_PARTY_WORLD_KNOWLEDGE_MEANING,
        `connector ${server.version} ${server.transport}`,
        'Worldbuilding is read-only. No vault writes were issued.',
      ],
      search_outcome: noMatch ? 'WORLD_KNOWLEDGE_NO_MATCH' : 'MATCHED',
      queries_used: queries,
      vault_profile: vaultProfile,
    });
    return clampPacketChars(packet);
  } catch (error) {
    return emptyWorldKnowledgePacket(input.objective, {
      searched: true,
      canonical_world_ids: canonicalIds,
      card_or_character_names: names,
      first_party_asset_ids: namedAssets.map((item) => item.asset_id),
      visual_observations: relevantObservations(resolvedObservations, namedAssets),
      user_guidance: input.user_guidance ?? [],
      unresolved_questions: [
        `Obsidian vault search failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
      provenance: ['FIRST_PARTY_WORLD_KNOWLEDGE unavailable'],
      search_outcome: 'UNAVAILABLE',
      queries_used: queries,
      vault_profile: vaultProfile,
    });
  }
}

export function boundWorldKnowledgeNotes(
  notes: WorldKnowledgeNote[],
  queries: string[],
  keepPaths: string[] = [],
): WorldKnowledgeNote[] {
  const keep = new Set(keepPaths.map((item) => item.toLowerCase()));
  return notes
    .filter((note) => noteRelevance(note, queries) > 0 || keep.has(note.path.toLowerCase()))
    .sort((left, right) => {
      const statusDelta = noteStatusAuthority(right.status) - noteStatusAuthority(left.status);
      if (statusDelta !== 0) return statusDelta;
      return noteRelevance(right, queries) - noteRelevance(left, queries);
    })
    .slice(0, MAX_WORLD_KNOWLEDGE_NOTES)
    .map((note) => ({
      ...note,
      excerpts: note.excerpts.slice(0, 4),
    }));
}

export function preferCurrentOverDeprecated(
  notes: WorldKnowledgeNote[],
): WorldKnowledgeNote[] {
  const current = notes.filter((note) => note.status !== 'DEPRECATED');
  const deprecated = notes.filter((note) => note.status === 'DEPRECATED');
  return [...current, ...deprecated];
}

export function establishedFactsFromPacket(packet: WorldKnowledgePacket): string[] {
  return packet.notes
    .filter((note) => isEstablishedWorldStatus(note.status))
    .flatMap((note) => note.excerpts.map((excerpt) => excerpt.text));
}

export function reconcileWorldProposal(
  proposal: WorldProposal,
  packet: WorldKnowledgePacket,
): WorldProposal {
  const classified = classifyWorldbuildingProposal(proposal, packet);
  const established = establishedFactsFromPacket(packet);
  const challenges = established.filter((fact) => contradicts(classified.statement, fact));
  if (
    classified.evidence_kind === 'FIRST_PARTY_VISUAL_OBSERVATION' ||
    classified.evidence_kind === 'VISUAL_INFERENCE'
  ) {
    return classified;
  }
  if (classified.evidence_kind === 'ESTABLISHED_FACT' && !packet.canonical_world_ids.length) {
    return { ...classified, evidence_kind: 'PROPOSED_LORE' };
  }
  if (
    (classified.evidence_kind === 'ESTABLISHED_FACT' ||
      classified.evidence_kind === 'FIRST_PARTY_WORLD_KNOWLEDGE' ||
      classified.evidence_kind === 'ESTABLISHED_WORLD_LORE') &&
    challenges.length > 0
  ) {
    return {
      ...classified,
      evidence_kind: 'WORLD_PROPOSAL',
      challenges_established: uniqueStrings([
        ...classified.challenges_established,
        ...challenges.slice(0, 3),
      ]),
    };
  }
  if (
    classified.evidence_kind === 'FIRST_PARTY_WORLD_KNOWLEDGE' ||
    classified.evidence_kind === 'ESTABLISHED_WORLD_LORE'
  ) {
    const supported = established.some((fact) => overlaps(classified.statement, fact));
    if (!supported) {
      return demoteUnsupportedWorldClaim(classified);
    }
  }
  if (classified.evidence_kind === 'FIRST_PARTY_WORLD_DRAFT') {
    return classified;
  }
  if (challenges.length > 0 && classified.evidence_kind !== 'WORLD_PROPOSAL') {
    return {
      ...classified,
      evidence_kind: 'WORLD_PROPOSAL',
      challenges_established: uniqueStrings([
        ...classified.challenges_established,
        ...challenges.slice(0, 3),
      ]),
    };
  }
  return classified;
}

const CHARACTER_CLAIM_RE =
  /\b(emerged from|could have emerged|personal relationship|adjacent figures|operative of|avatar of|erased identity|biography|affiliated with Chaos)\b/i;

export function classifyWorldbuildingProposal(
  proposal: WorldProposal,
  packet: WorldKnowledgePacket,
): WorldProposal {
  const profile = packet.vault_profile ?? CURRENT_VAULT_PROFILE;
  if (proposal.evidence_kind === 'WORLD_EVIDENCE_TENSION' || proposal.evidence_kind === 'WORLD_PROPOSAL') {
    return proposal;
  }
  if (
    proposal.evidence_kind === 'FIRST_PARTY_VISUAL_OBSERVATION' ||
    proposal.evidence_kind === 'VISUAL_INFERENCE'
  ) {
    if (CHARACTER_CLAIM_RE.test(proposal.statement)) {
      return { ...proposal, evidence_kind: 'PROPOSED_CHARACTER_LORE' };
    }
    return {
      ...proposal,
      evidence_kind:
        proposal.evidence_kind === 'VISUAL_INFERENCE' ? 'VISUAL_INFERENCE' : 'FIRST_PARTY_VISUAL_OBSERVATION',
    };
  }
  if (isCharacterSpecificClaim(proposal) && !vaultEstablishesCharacterClaim(proposal, packet, profile)) {
    return { ...proposal, evidence_kind: 'PROPOSED_CHARACTER_LORE' };
  }
  if (
    (proposal.evidence_kind === 'ESTABLISHED_FACT' ||
      proposal.evidence_kind === 'FIRST_PARTY_WORLD_KNOWLEDGE' ||
      proposal.evidence_kind === 'ESTABLISHED_WORLD_LORE') &&
    vaultSupportsWorldFact(proposal, packet)
  ) {
    return { ...proposal, evidence_kind: 'ESTABLISHED_WORLD_LORE' };
  }
  if (isWorldExtensionClaim(proposal) && !vaultSupportsWorldFact(proposal, packet)) {
    return { ...proposal, evidence_kind: 'PROPOSED_WORLD_EXTENSION' };
  }
  return proposal;
}

export function classifyWorldRelationship(
  relationship: WorldRelationship,
  packet: WorldKnowledgePacket,
  candidateName?: string,
): WorldRelationship {
  const profile = packet.vault_profile ?? CURRENT_VAULT_PROFILE;
  const involvesCandidate = Boolean(
    candidateName &&
      (relationship.from.toLowerCase() === candidateName.toLowerCase() ||
        relationship.to.toLowerCase() === candidateName.toLowerCase()),
  );
  const established =
    vaultMentionsName(packet, relationship.from) && vaultMentionsName(packet, relationship.to);
  if (involvesCandidate && !(profile.character_specific_canon && established)) {
    return { ...relationship, evidence_kind: 'PROPOSED_CHARACTER_LORE' };
  }
  if (established) {
    return { ...relationship, evidence_kind: 'ESTABLISHED_WORLD_LORE' };
  }
  return { ...relationship, evidence_kind: relationship.evidence_kind ?? 'PROPOSED_LORE' };
}

export function detectWorldEvidenceTensions(
  notes: WorldKnowledgeNote[],
  observations: FirstPartyVisualObservation[],
): WorldEvidenceTension[] {
  const tensions: WorldEvidenceTension[] = [];
  for (const note of notes.filter((item) => isEstablishedWorldStatus(item.status))) {
    for (const observation of observations) {
      if (observation.not_lore !== true) continue;
      const loreText = note.excerpts.map((item) => item.text).join(' ');
      if (!loreText || !observation.subject) continue;
      const subjectHit =
        loreText.toLowerCase().includes(observation.subject.toLowerCase()) ||
        note.title.toLowerCase().includes(observation.subject.toLowerCase());
      if (!subjectHit) continue;
      const visualMotifs = observation.visible_motifs.join(' ').toLowerCase();
      if (!visualMotifs) continue;
      if (explicitTension(loreText, visualMotifs, observation.uncertainties.join(' '))) {
        tensions.push({
          kind: 'WORLD_EVIDENCE_TENSION',
          summary: `Vault lore for ${note.title} and first-party art for ${observation.subject} appear inconsistent.`,
          vault_note_path: note.path,
          asset_id: observation.asset_id,
          lore_excerpt: loreText.slice(0, MAX_EXCERPT_CHARS),
          visual_excerpt: observation.visible_motifs.join(', '),
        });
      }
    }
  }
  return tensions.slice(0, 4);
}

export function formatWorldKnowledgePacket(packet: WorldKnowledgePacket): string {
  const notes = packet.notes.length
    ? packet.notes
        .map((note) =>
          [
            `${note.path} [${note.status}] ${note.evidence_kind}`,
            `title: ${note.title}`,
            note.tags.length ? `tags: ${note.tags.join(', ')}` : '',
            note.linked_concepts.length ? `links: ${note.linked_concepts.map((item) => `[[${item}]]`).join(', ')}` : '',
            ...note.excerpts.map((excerpt) => `- ${excerpt.text}`),
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n\n')
    : '(none)';
  const tensions = packet.evidence_tensions.length
    ? packet.evidence_tensions.map((item) => item.summary).join('\n')
    : '(none)';
  return [
    'World knowledge packet. FIRST_PARTY_WORLD_KNOWLEDGE is read-only Mel-authored story, setting, narrative, and world-lore. It is not character-specific canon unless the current vault profile says so.',
    `Vault profile: story=${(packet.vault_profile ?? CURRENT_VAULT_PROFILE).world_story_lore} plotline=${(packet.vault_profile ?? CURRENT_VAULT_PROFILE).plotline} setting=${(packet.vault_profile ?? CURRENT_VAULT_PROFILE).setting_lore} gameplay_rules=${(packet.vault_profile ?? CURRENT_VAULT_PROFILE).gameplay_rules} character_specific_canon=${(packet.vault_profile ?? CURRENT_VAULT_PROFILE).character_specific_canon}.`,
    `Searched: ${packet.searched}. Vault reachable: ${packet.vault_reachable}. Outcome: ${packet.search_outcome}.`,
    `Queries: ${packet.queries_used.join(', ') || '(none)'}`,
    `Vault: ${packet.vault_name || '(unknown)'}`,
    `Canonical world IDs: ${packet.canonical_world_ids.join(', ') || '(none)'}`,
    `Names: ${packet.card_or_character_names.join(', ') || '(none)'}`,
    'Notes:',
    notes,
    'Linked concepts:',
    packet.linked_concepts.map((item) => `[[${item}]]`).join(', ') || '(none)',
    'Visual observations remain FIRST_PARTY_VISUAL_ASSET, not lore.',
    'Evidence tensions (not gameplay conflicts):',
    tensions,
    'Unresolved:',
    packet.unresolved_questions.join('\n') || '(none)',
    'Provenance:',
    packet.provenance.join('\n'),
  ].join('\n');
}

function createVaultClient(cwd?: string): ObsidianVaultClient | null {
  const config = discoverObsidianMcpConfig(cwd);
  if (!config.token) return null;
  return createHttpObsidianVaultClient(config);
}

async function searchVault(client: ObsidianVaultClient, queries: string[]): Promise<VaultSearchHit[]> {
  const hits: VaultSearchHit[] = [];
  for (const query of queries.slice(0, 4)) {
    const smart = await client.searchSmart(query, 8);
    const simple = smart.length > 0 ? [] : await client.searchSimple(query, 8);
    hits.push(...smart, ...simple);
  }
  const byPath = new Map<string, VaultSearchHit>();
  for (const hit of hits) {
    const existing = byPath.get(hit.path);
    if (!existing) {
      byPath.set(hit.path, hit);
      continue;
    }
    byPath.set(hit.path, {
      ...existing,
      matches: [...existing.matches, ...hit.matches].slice(0, 6),
      score: Math.max(existing.score ?? 0, hit.score ?? 0),
    });
  }
  return [...byPath.values()];
}

function selectRelevantHits(hits: VaultSearchHit[], queries: string[]): VaultSearchHit[] {
  const needles = queries.map((item) => item.toLowerCase());
  return hits
    .map((hit) => ({
      hit,
      score:
        (hit.score ?? 0) +
        needles.reduce((sum, needle) => {
          const haystack = `${hit.path} ${hit.matches.map((match) => match.context).join(' ')}`.toLowerCase();
          return sum + (haystack.includes(needle) ? 2 : 0);
        }, 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.hit);
}

async function readVaultNote(client: ObsidianVaultClient, path: string): Promise<VaultNoteRecord> {
  const record = await client.readFile(path);
  const outgoing = await client.getOutgoingLinks(path).catch(() => [] as VaultOutgoingLink[]);
  const fromBody = extractWikilinks(record.content).map((to) => ({ to, relation: 'wikilink' }));
  return {
    ...record,
    outgoing_links: uniqueByTo([...outgoing, ...fromBody]),
  };
}

async function retrieveLinkedNotes(
  client: ObsidianVaultClient,
  existing: WorldKnowledgeNote[],
  remainingSlots: number,
): Promise<WorldKnowledgeNote[]> {
  if (remainingSlots <= 0 || existing.length === 0) return [];
  const already = new Set(existing.map((note) => note.path.toLowerCase()));
  const concepts = uniqueStrings(existing.flatMap((note) => note.linked_concepts)).slice(0, 4);
  const extra: WorldKnowledgeNote[] = [];
  for (const concept of concepts) {
    if (extra.length >= remainingSlots) break;
    const hits = await searchVault(client, [concept]);
    for (const hit of selectRelevantHits(hits, [concept])) {
      if (already.has(hit.path.toLowerCase()) || extra.some((note) => note.path === hit.path)) continue;
      const record = await readVaultNote(client, hit.path);
      const status = classifyWorldNoteStatus(record);
      extra.push(
        toKnowledgeNote(
          record,
          status.status,
          status.reason,
          hit.matches.map((match) => match.context).filter(Boolean),
          [concept],
        ),
      );
      already.add(hit.path.toLowerCase());
      if (extra.length >= remainingSlots) break;
    }
  }
  return extra;
}

function toKnowledgeNote(
  record: VaultNoteRecord,
  status: WorldNoteStatus,
  reason: string,
  matchContexts: string[],
  queries: string[],
): WorldKnowledgeNote {
  const excerpts = uniqueStrings([
    ...matchContexts,
    ...sectionExcerpts(record.content, queries),
  ])
    .map((text) => clipExcerpt(text))
    .filter(Boolean)
    .slice(0, 4)
    .map((text) => ({
      note_path: record.path,
      title: record.title,
      status,
      text,
    }));
  return {
    path: record.path,
    title: record.title || titleFromPath(record.path),
    status,
    status_reason: reason,
    evidence_kind: evidenceKindForNoteStatus(status),
    tags: record.tags,
    properties: stringifyProperties(record.properties),
    linked_concepts: record.outgoing_links.map((item) => item.to),
    excerpts,
  };
}

function sectionExcerpts(content: string, queries: string[]): string[] {
  const blocks = content.split(/^#{1,6}\s+/m);
  const needles = queries.map((item) => item.toLowerCase());
  return blocks
    .filter((block) => needles.some((needle) => block.toLowerCase().includes(needle)))
    .map((block) => clipExcerpt(block))
    .filter(Boolean)
    .slice(0, 4);
}

export function extractNamedConcepts(objective: string): string[] {
  return extractNamedWorldEntities(objective);
}

function relevantObservations(
  observations: FirstPartyVisualObservation[] | undefined,
  assets: FirstPartyAssetRecord[],
): FirstPartyVisualObservation[] {
  return (observations ?? [])
    .filter(
      (item) =>
        assets.some((asset) => asset.asset_id === item.asset_id) ||
        assets.some((asset) =>
          asset.associated_card_or_character
            ? item.subject.toLowerCase().includes(asset.associated_card_or_character.toLowerCase())
            : false,
        ),
    )
    .slice(0, 4);
}

function collectUnresolvedQuestions(
  notes: WorldKnowledgeNote[],
  input: { candidateName?: string; profile: CurrentVaultProfile },
): string[] {
  const questions: string[] = [];
  if (notes.length > 0 && notes.every((note) => note.status === 'UNKNOWN_STATUS')) {
    questions.push('Retrieved vault notes have UNKNOWN_STATUS and must not be treated as canon.');
  }
  if (notes.some((note) => note.status === 'DRAFT_LORE' || note.status === 'WORLD_PROPOSAL')) {
    questions.push('Draft or proposal notes are present and remain unapproved.');
  }
  if (input.profile.character_specific_canon && input.candidateName) {
    const hit = notes.some((note) => vaultTextMentions(note, input.candidateName!));
    if (!hit) {
      questions.push(`No vault note established ${input.candidateName}.`);
    }
  }
  return questions.slice(0, 6);
}

function noteRelevance(note: WorldKnowledgeNote, queries: string[]): number {
  const haystack = `${note.path} ${note.title} ${note.excerpts.map((item) => item.text).join(' ')}`
    .toLowerCase()
    .replace(/[-_]+/g, ' ');
  return queries.reduce(
    (sum, query) => sum + (haystack.includes(query.toLowerCase().replace(/[-_]+/g, ' ')) ? 1 : 0),
    0,
  );
}

function clampPacketChars(packet: WorldKnowledgePacket): WorldKnowledgePacket {
  let encoded = JSON.stringify(packet);
  if (encoded.length <= MAX_WORLD_KNOWLEDGE_CHARS) return packet;
  const notes = packet.notes.map((note) => ({
    ...note,
    excerpts: note.excerpts.slice(0, 1).map((excerpt) => ({
      ...excerpt,
      text: excerpt.text.slice(0, 180),
    })),
  }));
  return WorldKnowledgePacketSchema.parse({
    ...packet,
    notes,
    excerpts: notes.flatMap((note) => note.excerpts).slice(0, 8),
  });
}

function clipExcerpt(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS);
}

function mapStatusToken(value: unknown): WorldNoteStatus | null {
  const text = String(value ?? '').toLowerCase();
  if (!text.trim()) return null;
  if (/\b(deprecated|archive|archived|discarded|superseded)\b/.test(text)) return 'DEPRECATED';
  if (/\b(approved|canon|canonical|established|bible|world bible|word bible)\b/.test(text)) {
    if (/\bapproved\b/.test(text)) return 'APPROVED_WORLD_FACT';
    return 'ESTABLISHED_LORE';
  }
  if (/\b(draft|brainstorm|wip|idea|experiment)\b/.test(text)) return 'DRAFT_LORE';
  if (/\b(proposal|proposed)\b/.test(text)) return 'WORLD_PROPOSAL';
  if (/\b(reference|research note)\b/.test(text)) return 'REFERENCE_NOTE';
  return null;
}

function contradicts(proposal: string, fact: string): boolean {
  const left = proposal.toLowerCase();
  const right = fact.toLowerCase();
  if (!overlaps(proposal, fact)) return false;
  return (
    (/\bbelongs to\b/.test(left) && /\bbelongs to\b/.test(right) && left !== right) ||
    (/\bnot\b/.test(left) && !/\bnot\b/.test(right)) ||
    (/\binstead of\b/.test(left) && overlaps(proposal, fact))
  );
}

function overlaps(left: string, right: string): boolean {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const shared = leftTokens.filter((token) => rightTokens.includes(token));
  return shared.length >= 3;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function explicitTension(lore: string, motifs: string, uncertainties: string): boolean {
  if (/\btension|inconsistent|contradict/i.test(uncertainties)) return true;
  const loreLow = lore.toLowerCase();
  const motifLow = motifs.toLowerCase();
  return (
    (/\bno (?:crescent|moon|sigil|blade)\b/.test(loreLow) && /crescent|moon|sigil|blade/.test(motifLow)) ||
    (/\bwears white\b/.test(loreLow) && /black|chrome|blood/.test(motifLow))
  );
}

function stringifyProperties(properties: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = Array.isArray(value) ? value.map(String).join(', ') : String(value);
  }
  return result;
}

function uniqueByTo(links: VaultOutgoingLink[]): VaultOutgoingLink[] {
  const seen = new Set<string>();
  const result: VaultOutgoingLink[] = [];
  for (const link of links) {
    const key = link.to.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  }
  return '';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function demoteUnsupportedWorldClaim(proposal: WorldProposal): WorldProposal {
  if (isCharacterSpecificClaim(proposal)) {
    return { ...proposal, evidence_kind: 'PROPOSED_CHARACTER_LORE' };
  }
  if (isWorldExtensionClaim(proposal)) {
    return { ...proposal, evidence_kind: 'PROPOSED_WORLD_EXTENSION' };
  }
  return { ...proposal, evidence_kind: 'PROPOSED_LORE' };
}

function isCharacterSpecificClaim(proposal: WorldProposal): boolean {
  const names = uniqueStrings([
    proposal.title,
    ...proposal.related_names,
    ...extractNamedWorldEntities(`${proposal.title} ${proposal.statement}`),
  ]).filter((name) => looksLikeCharacterName(name) && !isWorldFactionOrPlace(name));
  if (names.length > 0) return true;
  return CHARACTER_CLAIM_RE.test(proposal.statement);
}

function looksLikeCharacterName(name: string): boolean {
  if (isWorldFactionOrPlace(name)) return false;
  return /[A-Z][\w]+(?:-[\w.]+)+/.test(name) || /\bnull-sigil\b/i.test(name);
}

function isWorldFactionOrPlace(name: string): boolean {
  return /\b(node[- ]feratu|hex-hackers|sigil-shamans|tesseract magi|chaos)\b/i.test(name);
}

function isWorldExtensionClaim(proposal: WorldProposal): boolean {
  return /\b(new (?:faction|location|timeline|organization|world)|add(?:s|ed)? to the (?:world|setting)|world extension)\b/i.test(
    `${proposal.title} ${proposal.statement}`,
  );
}

function vaultSupportsWorldFact(proposal: WorldProposal, packet: WorldKnowledgePacket): boolean {
  const established = establishedFactsFromPacket(packet);
  if (established.some((fact) => overlaps(proposal.statement, fact))) return true;
  return packet.notes.some(
    (note) =>
      isEstablishedWorldStatus(note.status) &&
      (note.title === proposal.title ||
        note.excerpts.some((excerpt) => excerpt.text.toLowerCase().includes(proposal.statement.slice(0, 40).toLowerCase()))),
  );
}

function vaultEstablishesCharacterClaim(
  proposal: WorldProposal,
  packet: WorldKnowledgePacket,
  profile: CurrentVaultProfile,
): boolean {
  if (!profile.character_specific_canon) return false;
  const names = uniqueStrings([proposal.title, ...proposal.related_names]);
  return names.some((name) => vaultMentionsName(packet, name)) && vaultSupportsWorldFact(proposal, packet);
}

function vaultMentionsName(packet: WorldKnowledgePacket, name: string): boolean {
  return packet.notes.some((note) => vaultTextMentions(note, name));
}

function vaultTextMentions(note: WorldKnowledgeNote, name: string): boolean {
  const needle = name.toLowerCase();
  return (
    note.title.toLowerCase().includes(needle) ||
    note.excerpts.some((excerpt) => excerpt.text.toLowerCase().includes(needle))
  );
}
