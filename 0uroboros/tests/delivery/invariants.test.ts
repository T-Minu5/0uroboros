import { describe, expect, it } from 'vitest';

import { CARD_DEFINITIONS, STARTING_DECK } from '../../src/game/content/cards';
import { DEFAULT_CONFIG } from '../../src/game/config/defaults';
import { currentDemoDeliveryPlan } from '../../src/delivery/plan';
import { RUNTIME_V1_RULE_INVARIANTS } from '../../src/delivery/invariants';
import { STARTER_RECONCILIATION_DISPUTES } from '../../src/delivery/reviewerDisputes';
import { testCanonical } from '../swarm/fixtures';

describe('Runtime V1 invariants', () => {
  it('encodes 10 starting cards as 5 + Byte-Coin x2 + Kilo-Coin x1 + Vault Encryption x2', () => {
    expect(STARTING_DECK).toHaveLength(10);
    const kinds = STARTING_DECK.map((id) => CARD_DEFINITIONS[id].kind);
    expect(kinds.filter((kind) => kind === 'character')).toHaveLength(5);
    expect(STARTING_DECK.filter((id) => id === 'byte_coin')).toHaveLength(2);
    expect(STARTING_DECK.filter((id) => id === 'kilo_coin')).toHaveLength(1);
    expect(STARTING_DECK.filter((id) => id === 'vault_encryption')).toHaveLength(2);
  });

  it('keeps Action grants and Node opening aligned to three Runtime turns', () => {
    expect(DEFAULT_CONFIG.runtimeTurnActionGrants).toEqual([2, 1, 1]);
    expect(DEFAULT_CONFIG.nodeOpenSchedule).toEqual([[0, 1, 2], [3], [4]]);
    expect(DEFAULT_CONFIG.nodeCapacityPerPlayer).toBe(4);
  });

  it('references only current canonical IDs', () => {
    const ids = new Set(testCanonical().items.filter((item) => item.status === 'current').map((item) => item.id));
    for (const invariant of RUNTIME_V1_RULE_INVARIANTS) {
      for (const id of invariant.canonical_ids) {
        expect(ids.has(id), id).toBe(true);
      }
    }
  });

  it('classifies the 9-vs-10 Reviewer finding as deterministic contradiction', () => {
    const roster = STARTER_RECONCILIATION_DISPUTES.find((item) => /nine cards/.test(item.summary));
    expect(roster?.classification).toBe('CONTRADICTED_BY_DETERMINISTIC_EVIDENCE');
    expect(currentDemoDeliveryPlan().id).toBe('DEMO_DELIVERY_PLAN');
  });
});
