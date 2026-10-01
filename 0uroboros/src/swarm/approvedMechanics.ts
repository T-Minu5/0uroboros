import type { CanonicalIndex } from './context';
import { formatCanonicalExcerpts, retrieveCanonical } from './context';
import type { MechanicStatus, MechanicUsage } from './contracts';

export interface ApprovedMechanicPrimitive {
  mechanic: string;
  canonical_ids: string[];
  patterns: RegExp[];
  approved_values?: number[];
}

export interface ApprovedMechanicsPacket {
  primitives: Array<{ mechanic: string; canonical_ids: string[] }>;
  excerpt_text: string;
  canonical_ids: string[];
}

export const APPROVED_MECHANIC_PRIMITIVES: ApprovedMechanicPrimitive[] = [
  {
    mechanic: 'POWER',
    canonical_ids: ['RULE-POWER-001', 'RULE-STARTER-001', 'RULE-STARTER-002'],
    patterns: [/\bpower\s+(\d+)\b/i],
  },
  {
    mechanic: 'DRAW',
    canonical_ids: ['RULE-DECK-005', 'RULE-STARTER-001'],
    patterns: [/\+\s*(\d+)\s*cards?\b/i, /\bdraw\s+(\d+)\b/i],
  },
  {
    mechanic: 'ACTION_GAIN',
    canonical_ids: [
      'RULE-ACTION-004',
      'RULE-ACTION-001',
      'RULE-STARTER-002',
      'RULE-STARTER-003',
      'RULE-STARTER-004',
      'RULE-STARTER-005',
    ],
    patterns: [/\+\s*(\d+)\s*actions?\b/i, /\bgain(?:s|ed)?\s+(\d+)\s+actions?\b/i],
    approved_values: [1, 2],
  },
  {
    mechanic: 'CRYPTO',
    canonical_ids: ['RULE-STARTER-003', 'RULE-STARTER-007', 'RULE-STARTER-008', 'RULE-DRAFT-002', 'RULE-DRAFT-003'],
    patterns: [/\+\s*(\d+)\s*crypto\b/i],
  },
  {
    mechanic: 'DRAIN',
    canonical_ids: ['RULE-DATA-001', 'RULE-DATA-002', 'RULE-DATA-003', 'RULE-DATA-004', 'RULE-STARTER-004', 'RULE-STARTER-005'],
    patterns: [/\bdrain\s+(\d+)\b/i],
    approved_values: [75, 100],
  },
  {
    mechanic: 'RESTORE',
    canonical_ids: ['RULE-DATA-005', 'RULE-DATA-006', 'RULE-DATA-007', 'RULE-STARTER-006'],
    patterns: [/\brestore\s+(\d+)\b/i],
    approved_values: [100],
  },
  {
    mechanic: 'VP',
    canonical_ids: ['RULE-VP-001', 'RULE-VP-002', 'RULE-VP-003'],
    patterns: [/\+\s*(\d+)\s*vp\b/i],
  },
  {
    mechanic: 'CARD_MOVEMENT',
    canonical_ids: ['RULE-CARD-006', 'RULE-ZONE-001', 'RULE-ZONE-002', 'RULE-ZONE-003', 'RULE-DRAFT-015'],
    patterns: [/\b(discard|hand|deck|move to)\b/i],
  },
  {
    mechanic: 'PROBABILITY',
    canonical_ids: [
      'RULE-PROB-001',
      'RULE-PROB-002',
      'RULE-PROB-003',
      'RULE-PROB-004',
      'RULE-PROB-005',
      'RULE-PROB-006',
      'RULE-PROB-007',
    ],
    patterns: [/\bprobability\b/i],
  },
  {
    mechanic: 'TRASH',
    canonical_ids: ['RULE-ZONE-001', 'RULE-ZONE-003'],
    patterns: [/\btrash(?:ed|ing)?\b/i],
  },
  {
    mechanic: 'DESTROY',
    canonical_ids: ['RULE-ZONE-002', 'RULE-ZONE-003'],
    patterns: [/\bdestroy(?:ed|ing)?\b/i],
  },
  {
    mechanic: 'DURATION',
    canonical_ids: ['RULE-BANK-001', 'RULE-BANK-002', 'RULE-BANK-003', 'RULE-BANK-004'],
    patterns: [/\bduration\b/i, /\beffect bank\b/i],
  },
  {
    mechanic: 'CARD_ACQUISITION',
    canonical_ids: ['RULE-DECK-005', 'RULE-DRAFT-009', 'RULE-DRAFT-015'],
    patterns: [/\b(buy|acquire|gain(?:s)? (?:a |the )?[a-z-]+ card)\b/i],
  },
  {
    mechanic: 'MODS',
    canonical_ids: ['RULE-MOD-001', 'RULE-MOD-002'],
    patterns: [/\bmods?\b/i],
  },
  {
    mechanic: 'TARGETING',
    canonical_ids: ['RULE-COLLAPSE-002', 'RULE-POWER-001', 'RULE-PROB-007'],
    patterns: [/\b(winner|loser|tied)\b/i],
  },
  {
    mechanic: 'TIMING',
    canonical_ids: ['RULE-ACTION-004', 'RULE-COLLAPSE-002', 'RULE-DRAFT-016'],
    patterns: [/\bonreveal\b/i, /\boncollapse\b/i, /\bdraft\b/i],
  },
];

const UNSUPPORTED_PRIMITIVE_RE =
  /\b(focus|mana|health|shields?|entanglement stack|new (?:resource|subsystem|timing hook|probability (?:mechanic|subsystem))|quantum charge)\b/i;

export function currentCanonicalIds(index: CanonicalIndex, ids: string[]): string[] {
  const current = new Set(
    index.items.filter((item) => item.status === 'current').map((item) => item.id),
  );
  return [...new Set(ids.filter((id) => current.has(id)))];
}

export function assembleApprovedMechanicsPacket(index: CanonicalIndex): ApprovedMechanicsPacket {
  const primitives = APPROVED_MECHANIC_PRIMITIVES.map((item) => ({
    mechanic: item.mechanic,
    canonical_ids: currentCanonicalIds(index, item.canonical_ids),
  })).filter((item) => item.canonical_ids.length > 0);
  const canonical_ids = [...new Set(primitives.flatMap((item) => item.canonical_ids))];
  return {
    primitives,
    canonical_ids,
    excerpt_text: formatCanonicalExcerpts(retrieveCanonical(index, { ids: canonical_ids.slice(0, 24) })),
  };
}

export function formatApprovedMechanicsPacket(packet: ApprovedMechanicsPacket): string {
  return [
    'Approved mechanics capability map. These primitives already exist. Using them is not a new game mechanic.',
    'Statuses: APPROVED_PRIMITIVE, NEW_COMBINATION, BALANCE_VARIANT, RULE_CHANGE_REQUIRED, UNRESOLVED.',
    packet.primitives.map((item) => `${item.mechanic}: ${item.canonical_ids.join(', ')}`).join('\n'),
    'Action gain examples: Dash-Dot, Dotkrawler, Rezz-Razor, Rezz-Blade. RULE-ACTION-004 times OnReveal Action gain.',
    'A new card that rearranges approved primitives is NEW_COMBINATION, not a rule change.',
    'A different Power, cost, or Drain number is BALANCE_VARIANT, not a rule change.',
    'Canonical excerpts:',
    packet.excerpt_text,
  ].join('\n');
}

export function classifyProposedEffect(text: string): MechanicUsage[] {
  const usages: MechanicUsage[] = [];
  if (UNSUPPORTED_PRIMITIVE_RE.test(text)) {
    usages.push({
      mechanic: 'UNSUPPORTED',
      canonical_ids: [],
      status: 'RULE_CHANGE_REQUIRED',
    });
  }
  for (const primitive of APPROVED_MECHANIC_PRIMITIVES) {
    const matched = matchPrimitive(primitive, text);
    if (!matched) continue;
    usages.push(matched);
  }
  const approvedFamilies = usages.filter(
    (item) => item.status === 'APPROVED_PRIMITIVE' || item.status === 'BALANCE_VARIANT',
  );
  const families = new Set(approvedFamilies.map((item) => item.mechanic));
  if (families.size > 1 && !usages.some((item) => item.status === 'RULE_CHANGE_REQUIRED')) {
    usages.push({
      mechanic: 'COMBINATION',
      canonical_ids: [...new Set(approvedFamilies.flatMap((item) => item.canonical_ids))],
      status: 'NEW_COMBINATION',
    });
  }
  if (usages.length === 0) {
    usages.push({
      mechanic: 'UNRESOLVED',
      canonical_ids: [],
      status: 'UNRESOLVED',
    });
  }
  return usages;
}

export function mechanicStatusRequiresRuleChange(usages: MechanicUsage[]): boolean {
  return usages.some((item) => item.status === 'RULE_CHANGE_REQUIRED');
}

export function isApprovedActionGain(text: string): boolean {
  return classifyProposedEffect(text).some(
    (item) => item.mechanic === 'ACTION_GAIN' && item.status === 'APPROVED_PRIMITIVE',
  );
}

export function contentContextOmissionForApprovedPrimitive(usages: MechanicUsage[]): {
  kind: 'CONTEXT_OMISSION';
  summary: string;
  evidence: string[];
  evidence_records: [];
  canonical_ids: string[];
  required_action: string;
} | null {
  const approved = usages.filter(
    (item) =>
      item.status === 'APPROVED_PRIMITIVE' ||
      item.status === 'NEW_COMBINATION' ||
      item.status === 'BALANCE_VARIANT',
  );
  if (approved.length === 0) return null;
  const ids = [...new Set(approved.flatMap((item) => item.canonical_ids))];
  return {
    kind: 'CONTEXT_OMISSION',
    summary: `Canonical retrieval already classifies ${approved.map((item) => item.mechanic).join(', ')} as approved content, not a new game subsystem.`,
    evidence: ids,
    evidence_records: [],
    canonical_ids: ids,
    required_action:
      'Repair the Content packet with the approved mechanics map. Do not ask Mel to redesign. Do not create a canonical mutation. Do not invoke Reviewer for this omission.',
  };
}

function matchPrimitive(
  primitive: ApprovedMechanicPrimitive,
  text: string,
): MechanicUsage | null {
  let hit = false;
  let numeric: number | null = null;
  for (const pattern of primitive.patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    hit = true;
    const captured = match.slice(1).map(Number).find((value) => Number.isFinite(value));
    if (captured !== undefined) numeric = captured;
  }
  if (!hit) return null;
  const status: MechanicStatus =
    numeric !== null && primitive.approved_values && !primitive.approved_values.includes(numeric)
      ? 'BALANCE_VARIANT'
      : 'APPROVED_PRIMITIVE';
  return {
    mechanic: primitive.mechanic,
    canonical_ids: primitive.canonical_ids,
    status,
  };
}
