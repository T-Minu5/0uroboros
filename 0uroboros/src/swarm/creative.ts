import type { CanonicalIndex } from './context';
import { retrieveCanonical } from './context';
import type {
  AstraSynthesis,
  ContentAssignment,
  ContentProposal,
  ContentResponse,
  FirstPartyAssetRecord,
  FirstPartyVisualObservation,
  ProposalEnvelope,
  WorldbuildingResponse,
} from './contracts';
import { GovernanceError } from './errors';

export const CHAOS_SAMPLE_FILES = ['rezz-razor.png', 'glitch-witch.png'] as const;
export const BASE_SAMPLE_FILES = ['slash-dot.png', 'dotkrawler.png'] as const;

export function sharedConceptId(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `concept-${slug || 'untitled'}`;
}

export function assignSharedConceptIds(
  names: string[],
  existing: string[] = [],
): string[] {
  const generated = names.map((name) => sharedConceptId(name));
  return uniqueStrings([...existing, ...generated]).slice(0, 5);
}

export function uniqueCreativeConceptIds(
  content: ContentResponse[],
  worldbuilding: Array<{ world_proposals: Array<{ concept_id?: string }> }>,
): string[] {
  return uniqueStrings([
    ...content.flatMap((item) => item.content_proposals.map((proposal) => proposal.concept_id)),
    ...worldbuilding.flatMap((item) =>
      item.world_proposals.map((proposal) => proposal.concept_id ?? ''),
    ),
  ]);
}

export function countCreativeConcepts(
  content: ContentResponse[],
  worldbuilding: Array<{ world_proposals: unknown[] }>,
): number {
  return uniqueCreativeConceptIds(
    content,
    worldbuilding as Array<{ world_proposals: Array<{ concept_id?: string }> }>,
  ).length;
}

export function isSingleConceptCreativeTask(objective: string): boolean {
  return (
    /\bone\b.{0,80}\b(chaos character|integrated candidate|candidate concept|new (?:chaos |base )?character)\b/i.test(
      objective,
    ) ||
    /\b(chaos character|integrated candidate).{0,80}\bone\b/i.test(objective) ||
    /\bMAX_CREATIVE_CONCEPTS_PER_RUN\s*=\s*1\b/i.test(objective)
  );
}

export function creativeConceptBudgetForObjective(objective: string, configuredMax: number): number {
  return isSingleConceptCreativeTask(objective) ? 1 : configuredMax;
}

export function enforceCreativeConceptBudget(conceptCount: number, max: number): void {
  if (conceptCount > max) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Creative concept total ${conceptCount} exceeds MAX_CREATIVE_CONCEPTS_PER_RUN ${max}.`,
    );
  }
}

export function proposalLimitForCreativeTask(objective: string, requested: number): number {
  return Math.min(requested, isSingleConceptCreativeTask(objective) ? 1 : requested);
}

export function normalizeCreativeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function proposalsAreDuplicates(
  left: { name?: string; summary?: string; concept?: string; proposed_effect?: string; concept_id?: string },
  right: { name?: string; summary?: string; concept?: string; proposed_effect?: string; concept_id?: string },
): boolean {
  if (left.concept_id && right.concept_id && left.concept_id === right.concept_id) {
    const leftText = normalizeCreativeName(`${left.proposed_effect ?? ''} ${left.concept ?? ''}`);
    const rightText = normalizeCreativeName(`${right.proposed_effect ?? ''} ${right.concept ?? ''}`);
    if (leftText && leftText === rightText) return true;
  }
  const leftName = normalizeCreativeName(left.name ?? left.summary ?? '');
  const rightName = normalizeCreativeName(right.name ?? right.summary ?? '');
  if (leftName && leftName === rightName) {
    const leftEffect = normalizeCreativeName(left.proposed_effect ?? left.concept ?? '');
    const rightEffect = normalizeCreativeName(right.proposed_effect ?? right.concept ?? '');
    return !leftEffect || !rightEffect || leftEffect === rightEffect;
  }
  return false;
}

export function dedupeContentProposals(proposals: ContentProposal[]): ContentProposal[] {
  const kept: ContentProposal[] = [];
  for (const proposal of proposals) {
    if (kept.some((item) => proposalsAreDuplicates(item, proposal))) continue;
    kept.push(proposal);
  }
  return kept;
}

export function dedupeCandidateProposals(proposals: ProposalEnvelope[]): ProposalEnvelope[] {
  const kept: ProposalEnvelope[] = [];
  for (const proposal of proposals) {
    if (
      kept.some((item) =>
        proposalsAreDuplicates(
          { name: item.summary, summary: item.summary, concept: item.rationale },
          { name: proposal.summary, summary: proposal.summary, concept: proposal.rationale },
        ),
      )
    ) {
      continue;
    }
    kept.push(proposal);
  }
  return kept;
}

export function visualObservationsCannotBecomeLore(): boolean {
  return true;
}

export function creativeSpecialistsCannotInvokeEachOther(): boolean {
  return true;
}

export function formatCachedObservations(
  observations: FirstPartyVisualObservation[],
  assets: FirstPartyAssetRecord[] = [],
): string {
  if (observations.length === 0) {
    return 'No cached first-party visual observations were supplied.';
  }
  return observations
    .map((item) => {
      const role =
        assets.find((asset) => asset.asset_id === item.asset_id)?.selection_role ?? 'UNSET';
      const representativeNote =
        role === 'REPRESENTATIVE_REFERENCE'
          ? 'Representative visual language only. Do not treat this named character as the new concept.'
          : role === 'IDENTITY_SPECIFIC'
            ? 'Identity-specific evidence for the named character in the objective.'
            : '';
      return [
        `${item.asset_id} (${item.subject}) [${item.inspection_status}] role=${role}`,
        representativeNote,
        `motifs: ${item.visible_motifs.join(', ') || '(none)'}`,
        `materials: ${item.materials.join(', ') || '(none)'}`,
        `not lore: ${item.not_lore}`,
      ]
        .filter(Boolean)
        .join(' | ');
    })
    .join('\n');
}

export function relevantAssetsForObjective(
  objective: string,
  assets: FirstPartyAssetRecord[],
  options: { liveAssetIds?: string[] } = {},
): FirstPartyAssetRecord[] {
  const haystack = objective.toLowerCase();
  const named = assets.filter(
    (item) =>
      item.identity_locked &&
      item.associated_card_or_character &&
      haystack.includes(item.associated_card_or_character.toLowerCase()),
  );
  if (named.length > 0) {
    return named.slice(0, 4).map((item) => stampRole(item, 'IDENTITY_SPECIFIC'));
  }
  if (/\bchaos\b/i.test(objective)) {
    return preferCachedThenSample(
      assets.filter((item) => item.category === 'chaos cards' && item.identity_locked),
      CHAOS_SAMPLE_FILES,
      options.liveAssetIds,
    ).map((item) => stampRole(item, 'REPRESENTATIVE_REFERENCE'));
  }
  if (/\bbase\b/i.test(objective)) {
    return preferCachedThenSample(
      assets.filter((item) => item.category === 'base cards' && item.identity_locked),
      BASE_SAMPLE_FILES,
      options.liveAssetIds,
    ).map((item) => stampRole(item, 'REPRESENTATIVE_REFERENCE'));
  }
  return [];
}

function stampRole(
  asset: FirstPartyAssetRecord,
  role: FirstPartyAssetRecord['selection_role'],
): FirstPartyAssetRecord {
  return { ...asset, selection_role: role };
}

function preferCachedThenSample(
  assets: FirstPartyAssetRecord[],
  preferredFiles: readonly string[],
  liveAssetIds?: string[],
): FirstPartyAssetRecord[] {
  const live = new Set(liveAssetIds ?? []);
  const preferred = preferredFiles
    .map((name) => assets.find((item) => item.file_name === name))
    .filter((item): item is FirstPartyAssetRecord => Boolean(item));
  const livePreferred = preferred.filter((item) => live.has(item.asset_id));
  const restPreferred = preferred.filter((item) => !live.has(item.asset_id));
  if (livePreferred.length > 0) {
    return [...livePreferred, ...restPreferred];
  }
  return preferred;
}

export function starterRules(index: CanonicalIndex) {
  return retrieveCanonical(index, { prefixes: ['RULE-STARTER-'] });
}

export function approvedStarterForName(index: CanonicalIndex, name: string) {
  const needle = name.toLowerCase();
  return starterRules(index).find((item) => item.text.toLowerCase().includes(needle));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function contentProposalTouchesProtectedStarter(
  proposal: ContentProposal,
  assignment: ContentAssignment,
  index: CanonicalIndex,
): boolean {
  const starter = approvedStarterForName(index, proposal.name);
  if (!starter) return false;
  if (proposal.rule_change_required) return false;
  return assignment.objective.toLowerCase().includes(proposal.name.toLowerCase());
}

export function resolveIntegratedCandidateNaming(
  synthesis: AstraSynthesis,
  content: ContentResponse[],
  worldbuilding: WorldbuildingResponse[],
  sharedConceptIdValue: string,
): AstraSynthesis {
  if (content.length === 0 && worldbuilding.length === 0) return synthesis;
  const workingNames = uniqueStrings([
    synthesis.selected_candidate_name,
    ...synthesis.alternative_working_names,
    ...content.flatMap((item) => item.content_proposals.map((proposal) => proposal.name)),
    ...worldbuilding.flatMap((item) => item.world_proposals.map((proposal) => proposal.title)),
    ...worldbuilding.flatMap((item) => item.naming_proposals ?? []),
  ]);
  const selected = synthesis.selected_candidate_name.trim() || workingNames[0] || '';
  const alternatives = workingNames.filter(
    (name) => normalizeCreativeName(name) !== normalizeCreativeName(selected),
  );
  const shared =
    synthesis.shared_concept_id.trim() ||
    uniqueCreativeConceptIds(content, worldbuilding)[0] ||
    sharedConceptIdValue;
  const hasExplicitSelectedNote = synthesis.candidate_notes.some(
    (note) => selected && normalizeCreativeName(note.title) === normalizeCreativeName(selected),
  );
  return {
    ...synthesis,
    selected_candidate_name: selected,
    alternative_working_names: alternatives,
    shared_concept_id: shared,
    candidate_notes: synthesis.candidate_notes.map((note, index) => ({
      ...note,
      selected: selected
        ? hasExplicitSelectedNote
          ? normalizeCreativeName(note.title) === normalizeCreativeName(selected)
          : index === 0
        : note.selected,
    })),
  };
}
