/**
 * V1 engine acceptance matrix. ENGINE_TESTED can be true without a demo card
 * showcasing an obscure edge. Do not distort content to make every edge player-facing.
 */

export type CoverageLevel = 'MISSING' | 'ENGINE_TESTED' | 'RUNTIME_EXERCISED' | 'PLAYER_VISIBLE';

export interface EffectCoverageRow {
  mechanic: string;
  canonical_ids: string[];
  engine: CoverageLevel;
  runtime: CoverageLevel;
  player_visible: CoverageLevel;
  notes: string;
}

export const DEMO_EFFECT_COVERAGE_MATRIX: EffectCoverageRow[] = [
  {
    mechanic: 'DRAW',
    canonical_ids: ['RULE-DECK-005'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Hand draw and +N Cards ops. Visual T1. Cycle deal is logged separately from source +N Cards.',
  },
  {
    mechanic: 'ACTION_GAIN',
    canonical_ids: ['RULE-ACTION-001', 'RULE-ACTION-004'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'OnReveal gains become spendable next Runtime turn. Status shows pending.',
  },
  {
    mechanic: 'ACTION_SPEND',
    canonical_ids: ['RULE-CARD-003', 'RULE-CARD-004'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Character 1 Action. VP 0. Status shows remaining Actions.',
  },
  {
    mechanic: 'DRAIN',
    canonical_ids: ['RULE-DATA-002', 'RULE-DATA-003'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Unnamed damageDataCenter already exists. Visual T2. DC bar and hit flash.',
  },
  {
    mechanic: 'RESTORE',
    canonical_ids: ['RULE-DATA-005', 'RULE-DATA-006', 'RULE-DATA-007'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Unnamed Restore now targets Primary first, then Backup.',
  },
  {
    mechanic: 'CRYPTO',
    canonical_ids: ['RULE-CARD-005'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Draft auto-play and Wallet credit.',
  },
  {
    mechanic: 'POWER',
    canonical_ids: ['RULE-POWER-001', 'RULE-POWER-005'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Node Power is the two player totals.',
  },
  {
    mechanic: 'PROBABILITY',
    canonical_ids: ['RULE-PROB-007', 'RULE-RUNTIME-014'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Controlled weight and reveal priority.',
  },
  {
    mechanic: 'COLLAPSE',
    canonical_ids: ['RULE-COLLAPSE-001', 'RULE-COLLAPSE-002'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Nodes 1-5 plus Effect Bank. Visual T4 first pass: quiet board, focus ring, overlay walk.',
  },
  {
    mechanic: 'DRAFT',
    canonical_ids: ['RULE-CARD-005'],
    engine: 'ENGINE_TESTED',
    runtime: 'RUNTIME_EXERCISED',
    player_visible: 'PLAYER_VISIBLE',
    notes: 'Market purchase and Crypto auto-play.',
  },
];
