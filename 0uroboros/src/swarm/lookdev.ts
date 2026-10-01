import type { RunBudgetConfig } from './config';
import type {
  CuratedResourceRecord,
  ExternalEvidenceRecord,
  FirstPartyAssetRecord,
  LookDevAssignment,
  LookDevResponse,
  RetrievedContent,
  VisualReferencePacket,
} from './contracts';
import { LookDevAssignmentSchema, LookDevResponseSchema } from './contracts';
import { GovernanceError } from './errors';
import {
  MAX_PACKET_ASSETS,
  MAX_PACKET_ICONS,
  MAX_PACKET_STATS_UI,
  inspectFirstPartyAsset,
  queryFirstPartyAssets,
} from './assets';
import { isHarnessInfrastructureRequest } from './harnessRouting';
import type { CanonicalIndex } from './context';
import { defaultSwarmPackageRoot, loadCanonicalIndex } from './context';
import { resolveAssignmentContext } from './assignmentContext';
import { resolveDesignTokens } from './designTokens';
import { inspectFirstPartyVisuals, visualInspectionCapability } from './visualInspection';
import { assembleVisualReferencePacket } from './visualReference';
import { queryResourceLibrary, type ResourceLibraryEntry } from './resourceLibrary';

const LOOKDEV_OBJECTIVE_RE =
  /\b(lookdev|visual (?:design|feedback|language|hierarchy|presentation|treatment|direction)|motion(?: language)?|animation|shader|theatrics|cinematic|card (?:art|render(?:ing)?|staging|frame)|icon(?:s|ography)?|phase announcement|wave collapse presentation|3d presentation|asset integration|presentation polish|reveal motion|effect(?:s)? resolution|first-party asset|player stats ui)\b/i;

const LOOKDEV_BLOCKED_RE =
  /\b(what is the starting deck|starting deck\b|RULE-DECK-001|STARTING_DECK|boardgame\.io(?:'s)? transaction|implementation mismatch|verify current (?:api|docs)|canonical rule already|do not invoke.{0,40}lookdev)\b/i;

export const AUTHORITATIVE_GAME_EVENTS = [
  'CARD_REVEALED',
  'DRAIN_APPLIED',
  'RESTORE_APPLIED',
  'POWER_CHANGED',
  'PROBABILITY_CHANGED',
  'DATA_CENTER_DESTROYED',
  'NODE_WINNER_DETERMINED',
  'CIRCUIT_NODE_SELECTED',
] as const;

export const PRESENTATION_EVENT_EXAMPLES = [
  'reveal motion',
  'pulse',
  'scan',
  'glitch',
  'particle emission',
  'card reaction',
  'Node reaction',
  'Data Center impact',
  'probability transition',
  'cinematic Wave Collapse effect',
] as const;

export function shouldConsultLookDev(objective: string): boolean {
  if (isHarnessInfrastructureRequest(objective)) return false;
  if (LOOKDEV_BLOCKED_RE.test(objective)) return false;
  if (
    (/\b(new (?:chaos |base )?card|character (?:concept|card)|world identity|worldbuilding|lore for)\b/i.test(
      objective,
    ) ||
      /\bcontent should propose\b/i.test(objective)) &&
    !/\b(lookdev|shader|theatrics|animation|presentation|visual (?:design|feedback|treatment|direction))\b/i.test(
      objective,
    )
  ) {
    return false;
  }
  if (LOOKDEV_OBJECTIVE_RE.test(objective)) return true;
  if (/\bwave collapse\b/i.test(objective) && /\b(presentation|visual|cinematic|theatrics|singularity|liquid)\b/i.test(objective)) {
    return true;
  }
  if (/\b(drain|restore)\b/i.test(objective) && /\b(visual|icon|effect|presentation|feedback)\b/i.test(objective)) {
    return true;
  }
  if (/\brezz-?razor\b/i.test(objective) && /\b(presentation|visual|treatment|art)\b/i.test(objective)) {
    return true;
  }
  return false;
}

export function validateLookDevAssignment(
  value: unknown,
  budget: RunBudgetConfig,
): LookDevAssignment {
  const assignment = LookDevAssignmentSchema.parse({
    ...(value && typeof value === 'object' ? value : {}),
    role: 'lookdev',
  });
  if (assignment.proposal_limit > budget.max_lookdev_recommendations) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `LookDev assignment ${assignment.assignment_id} proposal_limit ${assignment.proposal_limit} exceeds MAX_LOOKDEV_RECOMMENDATIONS ${budget.max_lookdev_recommendations}.`,
    );
  }
  if (assignment.proposal_limit > budget.max_proposals_per_assignment) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `LookDev assignment ${assignment.assignment_id} proposal_limit exceeds configured maximum.`,
    );
  }
  return assignment;
}

export function validateLookDevResponse(
  value: unknown,
  assignment: LookDevAssignment,
  budget: RunBudgetConfig,
): LookDevResponse {
  const response = LookDevResponseSchema.parse(value);
  if (response.assignment_id !== assignment.assignment_id) {
    throw new GovernanceError(
      'ROLE_MISMATCH',
      `LookDev response assignment ${response.assignment_id} does not match ${assignment.assignment_id}.`,
    );
  }
  if (response.visual_findings.length > budget.max_lookdev_findings) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `LookDev returned ${response.visual_findings.length} findings; limit is ${budget.max_lookdev_findings}.`,
    );
  }
  if (response.recommendations.length > Math.min(assignment.proposal_limit, budget.max_lookdev_recommendations)) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `LookDev returned ${response.recommendations.length} recommendations; limit is ${Math.min(assignment.proposal_limit, budget.max_lookdev_recommendations)}.`,
    );
  }
  const alternatives = response.recommendations.filter((item) => item.kind === 'ALTERNATIVE');
  if (alternatives.length > budget.max_lookdev_concepts) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `LookDev returned ${alternatives.length} alternatives; limit is ${budget.max_lookdev_concepts}.`,
    );
  }
  const primaries = response.recommendations.filter((item) => item.kind === 'PRIMARY');
  if (!assignment.allow_alternatives && primaries.length > 1) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      'LookDev may return only one PRIMARY recommendation unless the objective asks for options.',
    );
  }
  return response;
}

export function lookDevCreatesWorkPackages(_response: LookDevResponse): never[] {
  return [];
}

export function lookDevCannotInvokeAgents(): boolean {
  return true;
}

export function lookDevCannotExecute(): boolean {
  return true;
}

export function firstPartyCannotOverrideRules(): boolean {
  return true;
}

export function externalCannotOverrideFirstPartyIdentity(): boolean {
  return true;
}

export function visualDesignAuthorityRank(
  authority:
    | 'CANONICAL'
    | 'FIRST_PARTY_VISUAL_ASSET'
    | 'HARNESS_VERIFIED_EVIDENCE'
    | 'USER_CURATED_REFERENCE_GUIDANCE'
    | 'EXTERNAL_RESEARCH_EVIDENCE'
    | 'MODEL_CLAIM',
): number {
  if (authority === 'CANONICAL') return 6;
  if (authority === 'FIRST_PARTY_VISUAL_ASSET') return 5;
  if (authority === 'HARNESS_VERIFIED_EVIDENCE') return 4;
  if (authority === 'USER_CURATED_REFERENCE_GUIDANCE') return 3;
  if (authority === 'EXTERNAL_RESEARCH_EVIDENCE') return 2;
  return 1;
}

export function assembleLookDevPacket(input: {
  objective: string;
  assets: FirstPartyAssetRecord[];
  resources: CuratedResourceRecord[];
  retrievals?: RetrievedContent[];
  research_evidence?: ExternalEvidenceRecord[];
  cwd?: string;
  gameplay_event?: string;
  canonical?: CanonicalIndex;
}): {
  visual: VisualReferencePacket;
  assets: FirstPartyAssetRecord[];
  icons: FirstPartyAssetRecord[];
  stats_ui: FirstPartyAssetRecord[];
  gameplay_canonical_ids: string[];
  gameplay_excerpt_text: string;
  contract_fields: string[];
  game_events: string[];
  concepts: string[];
  resolved_tokens: ReturnType<typeof resolveDesignTokens>;
  visual_observations: ReturnType<typeof inspectFirstPartyVisuals>;
} {
  const index = input.canonical ?? loadCanonicalIndex(defaultSwarmPackageRoot(input.cwd));
  const gameplay = resolveAssignmentContext(input.objective, index, {
    includePresentationDefaults: true,
  });
  const named = namedCharactersInObjective(input.objective, input.assets);
  const representativeRequested =
    /\b(visual identity|visual language|compare (?:base|chaos)|representative|base and chaos)\b/i.test(
      input.objective,
    );
  const characterHits = queryFirstPartyAssets(input.assets, {
    query: named[0] ?? (representativeRequested ? input.objective : ''),
    types: ['CHARACTER_ART', 'CARD_ART'],
    maxResults: representativeRequested ? 4 : MAX_PACKET_ASSETS,
  });
  const selectedCharacters = selectCharacterAssets(characterHits, named, representativeRequested);
  const iconHits = queryFirstPartyAssets(input.assets, {
    query: /\bicon/i.test(input.objective) ? 'icon' : input.objective,
    types: ['ICON'],
    maxResults: MAX_PACKET_ICONS,
  });
  const drainRestoreIcons = /\b(drain|restore|data center)\b/i.test(input.objective)
    ? input.assets.filter((item) =>
        ['Actions', 'Data Centers', 'power', 'priority'].includes(item.associated_game_system),
      )
    : [];
  const statsHits = /\bstats?\b/i.test(input.objective)
    ? queryFirstPartyAssets(input.assets, {
        query: 'stats',
        types: ['STATS_UI_REFERENCE', 'UI_REFERENCE'],
        maxResults: MAX_PACKET_STATS_UI,
      })
    : [];
  const selectedIcons = uniqueAssets([
    ...drainRestoreIcons.filter((item) => item.asset_type === 'ICON'),
    ...iconHits,
  ])
    .map((item) => ({
      ...item,
      selection_role: 'SYSTEM_ICON' as const,
    }))
    .slice(0, MAX_PACKET_ICONS);
  const selectedStats = uniqueAssets(statsHits).slice(0, MAX_PACKET_STATS_UI);
  const inspected = [...selectedCharacters, ...selectedIcons, ...selectedStats].map((asset) =>
    inspectFirstPartyAsset(asset, input.cwd),
  );
  const relevantResources = preferTechniqueReferences(
    queryResourceLibrary(input.resources, {
      query: techniqueQuery(input.objective),
      maxResults: 6,
    }),
  );
  const tokens = resolveDesignTokens(index);
  const visual = assembleVisualReferencePacket({
    objective: input.objective,
    resources: relevantResources,
    retrievals: input.retrievals,
    research_evidence: input.research_evidence,
    gameplay_event: input.gameplay_event
      || (gameplay.concepts.includes('wave_collapse') ? 'Wave Collapse' : gameplay.game_events[0]),
    canonical: index,
    canonical_ids: gameplay.canonical_ids.filter((id) => /^(UX|LOOKDEV|DESIGN)-/.test(id)).slice(0, 16),
    theatrics_tier_target: gameplay.concepts.includes('wave_collapse')
      ? ['TIER_4']
      : /\bdrain|restore|reveal\b/i.test(input.objective)
        ? ['TIER_2', 'TIER_3']
        : undefined,
  });
  visual.first_party_asset_ids = inspected.map((item) => item.asset_id).slice(0, 12);
  visual.associated_card_or_character = uniqueStrings(
    inspected
      .filter((item) => item.selection_role === 'IDENTITY_SPECIFIC')
      .map((item) => item.associated_card_or_character)
      .filter(Boolean),
  ).slice(0, 8);
  visual.relevant_icon_ids = selectedIcons.map((item) => item.asset_id).slice(0, 8);
  visual.stats_ui_asset_ids = selectedStats.map((item) => item.asset_id).slice(0, 4);
  visual.resolved_tokens = tokens;
  visual.gameplay_canonical_ids = gameplay.canonical_ids;
  visual.contract_fields = gameplay.contract_fields;
  const observations = inspectFirstPartyVisuals(inspected, { cwd: input.cwd });
  return {
    visual,
    assets: inspected.filter((item) => item.asset_type === 'CHARACTER_ART' || item.asset_type === 'CARD_ART'),
    icons: inspected.filter((item) => item.asset_type === 'ICON'),
    stats_ui: inspected.filter((item) => item.asset_type === 'STATS_UI_REFERENCE' || item.asset_type === 'UI_REFERENCE'),
    gameplay_canonical_ids: gameplay.canonical_ids,
    gameplay_excerpt_text: gameplay.excerpt_text,
    contract_fields: gameplay.contract_fields,
    game_events: gameplay.game_events,
    concepts: gameplay.concepts,
    resolved_tokens: tokens,
    visual_observations: observations,
  };
}

export function formatLookDevPacket(packet: ReturnType<typeof assembleLookDevPacket>): string {
  return [
    'First-party visual packet. FIRST_PARTY_VISUAL_ASSET outranks external inspiration for identity.',
    'Do not replace existing card art. Do not treat Stats UI mocks as UX requirements.',
    `Gameplay concepts: ${packet.concepts.join(', ') || '(none)'}`,
    `Gameplay canonical IDs: ${packet.gameplay_canonical_ids.join(', ') || '(none)'}`,
    `Contract fields: ${packet.contract_fields.join(', ') || '(none)'}`,
    `Game events: ${packet.game_events.join(', ') || '(none)'}`,
    'Gameplay excerpts:',
    packet.gameplay_excerpt_text,
    `Resolved design tokens: ${packet.resolved_tokens.map((item) => `${item.name}=${item.value}`).join(' | ')}`,
    `Visual inspection: ${visualInspectionCapability().mechanism}`,
    `First-party assets: ${packet.visual.first_party_asset_ids.join(', ') || '(none)'}`,
    `Identity-specific characters: ${packet.visual.associated_card_or_character.join(', ') || '(none)'}`,
    `Icons: ${packet.icons.map((item) => `${item.asset_id}:${item.file_name}:${item.associated_game_system || 'unknown'}:${item.semantic_confidence}`).join(' | ') || '(none)'}`,
    `Stats UI references: ${packet.stats_ui.map((item) => item.file_name).join(', ') || '(none)'}`,
    'Asset records:',
    JSON.stringify(
      [...packet.assets, ...packet.icons, ...packet.stats_ui].map((item) => ({
        asset_id: item.asset_id,
        path: item.relative_path,
        type: item.asset_type,
        associated_card_or_character: item.associated_card_or_character,
        associated_game_system: item.associated_game_system,
        inspection_status: item.inspection_status,
        dimensions: item.dimensions,
        observed_colors: item.observed_colors,
        identity_locked: item.identity_locked,
        ux_requirement: item.ux_requirement,
        semantic_confidence: item.semantic_confidence,
        selection_role: item.selection_role,
      })),
      null,
      2,
    ),
    'External VisualReferencePacket (technique/inspiration only):',
    JSON.stringify(
      {
        resource_ids: packet.visual.resource_ids,
        reference_classifications: packet.visual.reference_classifications,
        usage_constraints: packet.visual.usage_constraints,
        approved_palette: packet.visual.approved_palette,
        approved_typography: packet.visual.approved_typography,
        theatrics_tier_target: packet.visual.theatrics_tier_target,
        resolved_tokens: packet.resolved_tokens,
        gameplay_canonical_ids: packet.gameplay_canonical_ids,
        contract_fields: packet.contract_fields,
      },
      null,
      2,
    ),
  ].join('\n');
}

function techniqueQuery(objective: string): string {
  if (/\bwave collapse|singularity|liquid/i.test(objective)) return 'singularity liquid wave EffectComposer';
  if (/\bdrain|restore|effect/i.test(objective)) return '3js effects ScanEffect';
  if (/\bcard|reveal|staging/i.test(objective)) return '3js effects card';
  return '3js effects';
}

function preferTechniqueReferences(entries: ResourceLibraryEntry[]): ResourceLibraryEntry[] {
  return entries.filter((entry) => !/hearthstone|marvel snap|drimgar/i.test(`${entry.url} ${entry.title}`));
}

function uniqueAssets(assets: FirstPartyAssetRecord[]): FirstPartyAssetRecord[] {
  const seen = new Set<string>();
  const result: FirstPartyAssetRecord[] = [];
  for (const asset of assets) {
    if (seen.has(asset.asset_id)) continue;
    seen.add(asset.asset_id);
    result.push(asset);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function namedCharactersInObjective(objective: string, assets: FirstPartyAssetRecord[]): string[] {
  const haystack = objective.toLowerCase();
  return uniqueStrings(
    assets
      .map((item) => item.associated_card_or_character)
      .filter(Boolean)
      .filter((name) => {
        const lower = name.toLowerCase();
        return haystack.includes(lower) || haystack.includes(lower.replace(/-/g, ' '));
      }),
  );
}

function selectCharacterAssets(
  hits: FirstPartyAssetRecord[],
  named: string[],
  representativeRequested: boolean,
): FirstPartyAssetRecord[] {
  if (named.length > 0) {
    return uniqueAssets(
      hits.filter((item) => named.includes(item.associated_card_or_character)),
    ).map((item) => ({ ...item, selection_role: 'IDENTITY_SPECIFIC' as const }));
  }
  if (representativeRequested) {
    return uniqueAssets(hits)
      .slice(0, 4)
      .map((item) => ({ ...item, selection_role: 'REPRESENTATIVE_REFERENCE' as const }));
  }
  return [];
}
