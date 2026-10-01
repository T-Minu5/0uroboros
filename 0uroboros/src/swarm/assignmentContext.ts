import type { CanonicalIndex, CanonicalRecord } from './context';
import { formatCanonicalExcerpts, retrieveCanonical } from './context';

export const MAX_ASSIGNMENT_CONTEXT_IDS = 28;

export interface ConceptMapping {
  key: string;
  pattern: RegExp;
  ids: string[];
  prefixes: string[];
  contract_fields: string[];
  game_events: string[];
}

export interface AssignmentContext {
  concepts: string[];
  canonical_ids: string[];
  excerpts: CanonicalRecord[];
  excerpt_text: string;
  contract_fields: string[];
  game_events: string[];
}

const PRESENTATION_DEFAULT_IDS = [
  'UX-BOARD-001',
  'UX-BOARD-002',
  'UX-BOARD-003',
  'UX-A11Y-001',
  'UX-A11Y-002',
  'LOOKDEV-EFFECT-001',
  'LOOKDEV-FX-001',
  'LOOKDEV-FX-004',
  'DESIGN-TYPE-001',
  'DESIGN-TYPE-002',
  'DESIGN-TYPE-003',
  'DESIGN-COLOR-001',
  'DESIGN-COLOR-002',
  'DESIGN-COLOR-003',
  'CONTRACT-001',
  'CONTRACT-002',
];

export const CONCEPT_MAP: ConceptMapping[] = [
  {
    key: 'drain',
    pattern: /\bdrain\b/i,
    ids: ['RULE-DATA-001', 'RULE-DATA-002', 'RULE-DATA-003', 'RULE-DATA-004', 'RULE-DATA-008'],
    prefixes: [],
    contract_fields: ['data_centers.primary', 'data_centers.backup'],
    game_events: ['CARD_REVEALED', 'DRAIN_APPLIED', 'DATA_CENTER_DESTROYED'],
  },
  {
    key: 'restore',
    pattern: /\brestore\b/i,
    ids: ['RULE-DATA-001', 'RULE-DATA-005', 'RULE-DATA-006', 'RULE-DATA-007'],
    prefixes: [],
    contract_fields: ['data_centers.primary', 'data_centers.backup'],
    game_events: ['RESTORE_APPLIED'],
  },
  {
    key: 'data_center_destruction',
    pattern: /\b(data center(?:s)? destroy|destroy(?:ed|ing)? data center|match-end|total data center destruction)\b/i,
    ids: ['RULE-DATA-007', 'RULE-DATA-008', 'RULE-COLLAPSE-004', 'RULE-MATCH-004', 'RULE-VP-001'],
    prefixes: [],
    contract_fields: ['data_centers.primary', 'data_centers.backup', 'player.vp'],
    game_events: ['DATA_CENTER_DESTROYED'],
  },
  {
    key: 'wave_collapse',
    pattern: /\bwave collapse|circuit reward|probability (?:resolution|selection)\b/i,
    ids: [
      'RULE-PROB-001',
      'RULE-PROB-002',
      'RULE-COLLAPSE-005',
      'RULE-COLLAPSE-006',
      'LOOKDEV-COLLAPSE-001',
    ],
    prefixes: ['RULE-COLLAPSE-'],
    contract_fields: ['nodes.power', 'nodes.status'],
    game_events: ['NODE_WINNER_DETERMINED', 'CIRCUIT_NODE_SELECTED', 'PROBABILITY_CHANGED'],
  },
  {
    key: 'priority',
    pattern: /\b(reveal )?priority\b|\bRULE-PROB-007\b/i,
    ids: ['RULE-RUNTIME-012', 'RULE-RUNTIME-013', 'RULE-RUNTIME-014', 'RULE-PROB-007', 'UX-NODE-005'],
    prefixes: [],
    contract_fields: ['runtime.priority', 'nodes.priority'],
    game_events: ['CARD_REVEALED'],
  },
  {
    key: 'draft_purchase',
    pattern: /\bdraft purchase|draft transaction|buy(?:ing)? cards\b/i,
    ids: ['RULE-DRAFT-009', 'RULE-DRAFT-011', 'RULE-DRAFT-012', 'RULE-DRAFT-013', 'RULE-DRAFT-019'],
    prefixes: [],
    contract_fields: [],
    game_events: [],
  },
];

export function resolveAssignmentContext(
  objective: string,
  index: CanonicalIndex,
  options: { includePresentationDefaults?: boolean } = {},
): AssignmentContext {
  const matched = CONCEPT_MAP.filter((item) => item.pattern.test(objective));
  const requested = [
    ...matched.flatMap((item) => item.ids),
    ...matched.flatMap((item) =>
      retrieveCanonical(index, { prefixes: item.prefixes }).map((record) => record.id),
    ),
    ...(options.includePresentationDefaults ? PRESENTATION_DEFAULT_IDS : []),
  ];
  const canonical_ids = uniqueCurrentIds(index, requested).slice(0, MAX_ASSIGNMENT_CONTEXT_IDS);
  const excerpts = retrieveCanonical(index, { ids: canonical_ids });
  return {
    concepts: matched.map((item) => item.key),
    canonical_ids,
    excerpts,
    excerpt_text: formatCanonicalExcerpts(excerpts),
    contract_fields: uniqueStrings(matched.flatMap((item) => item.contract_fields)),
    game_events: uniqueStrings(matched.flatMap((item) => item.game_events)),
  };
}

export function mergeAssignmentContextIds(
  existing: string[],
  resolved: string[],
): string[] {
  return uniqueStrings([...existing, ...resolved]).slice(0, MAX_ASSIGNMENT_CONTEXT_IDS);
}

export function contextIdsCoverConcept(
  suppliedIds: string[],
  conceptKey: string,
  index: CanonicalIndex,
): boolean {
  const mapping = CONCEPT_MAP.find((item) => item.key === conceptKey);
  if (!mapping) return true;
  const required = uniqueCurrentIds(index, mapping.ids);
  if (required.length === 0) return true;
  const supplied = new Set(suppliedIds);
  return required.every((id) => supplied.has(id));
}

function uniqueCurrentIds(index: CanonicalIndex, ids: string[]): string[] {
  const current = new Set(
    index.items.filter((item) => item.status === 'current').map((item) => item.id),
  );
  return uniqueStrings(ids.filter((id) => current.has(id)));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
