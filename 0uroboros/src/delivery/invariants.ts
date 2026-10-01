/**
 * Testable representation of current approved Runtime V1 rules.
 * This is not a second rules system. Implementation must satisfy these values.
 */

export interface RuntimeV1RuleInvariant {
  id: string;
  canonical_ids: string[];
  statement: string;
}

export const RUNTIME_V1_RULE_INVARIANTS: RuntimeV1RuleInvariant[] = [
  {
    id: 'INV-DECK-COMPOSITION',
    canonical_ids: ['RULE-DECK-001', 'RULE-STARTER-007', 'RULE-STARTER-008', 'RULE-STARTER-006'],
    statement: 'Starting deck is 10 cards: 5 Character, 3 Crypto, 2 VP. Byte-Coin x2 + Kilo-Coin x1 + Vault Encryption x2 with the five named Characters.',
  },
  {
    id: 'INV-DECK-MIRROR',
    canonical_ids: ['RULE-DECK-002'],
    statement: 'Cycle 1 uses identical initial deck contents and order for both players.',
  },
  {
    id: 'INV-ACTION-COST',
    canonical_ids: ['RULE-CARD-003', 'RULE-CARD-004', 'RULE-CARD-005'],
    statement: 'Character deployment costs 1 Action. VP deployment costs 0. Crypto is not deployable at Nodes.',
  },
  {
    id: 'INV-ACTION-GRANTS',
    canonical_ids: ['RULE-ACTION-001', 'RULE-ACTION-003', 'RULE-ACTION-004'],
    statement: 'Turn 1 grants +2 Actions, Turn 2 +1, Turn 3 +1. OnReveal Action gain is usable on the next Runtime turn. Actions never carry between Cycles.',
  },
  {
    id: 'INV-NODE-OPEN',
    canonical_ids: ['RULE-RUNTIME-002'],
    statement: 'Turn 1 opens Nodes 1-3. Turn 2 opens Node 4. Turn 3 opens Node 5.',
  },
  {
    id: 'INV-NODE-CAPACITY',
    canonical_ids: ['RULE-RUNTIME-005'],
    statement: 'Maximum 4 cards per player per Node unless an approved effect changes it.',
  },
  {
    id: 'INV-PROBABILITY',
    canonical_ids: ['RULE-PROB-002', 'RULE-PROB-007', 'RULE-RUNTIME-014'],
    statement: 'Probability totals 100%. Next reveal priority uses controlled weight.',
  },
  {
    id: 'INV-DRAIN-RESTORE',
    canonical_ids: ['RULE-DATA-002', 'RULE-DATA-003', 'RULE-DATA-005', 'RULE-DATA-006', 'RULE-DATA-007'],
    statement: 'Generic Drain and Restore target Primary first, then Backup. No spill. No overheal. Destroyed Data Centers cannot be restored.',
  },
  {
    id: 'INV-COLLAPSE-REWARDS',
    canonical_ids: ['RULE-COLLAPSE-002', 'RULE-COLLAPSE-006', 'RULE-COLLAPSE-007'],
    statement: 'Location rewards resolve after the Node winner is determined. Circuit Reward is a separate system.',
  },
];
