import { describe, expect, it } from 'vitest';

import { CARD_DEFINITIONS, STARTING_DECK } from '../src/game/content/cards';
import { createHarness } from './helpers';
import { canDeploy } from '../src/game/engine/deploy';

const COUNTS: Record<string, number> = {
  slash_dot: 1,
  dash_dot: 1,
  dotkrawler: 1,
  rezz_razor: 1,
  rezz_blade: 1,
  byte_coin: 2,
  kilo_coin: 1,
  vault_encryption: 2,
};

describe('Approved starting deck', () => {
  it('is 10 cards with 5 Character, 3 Crypto, and 2 VP', () => {
    expect(STARTING_DECK).toHaveLength(10);
    const kinds = STARTING_DECK.map((id) => CARD_DEFINITIONS[id].kind);
    expect(kinds.filter((kind) => kind === 'character')).toHaveLength(5);
    expect(kinds.filter((kind) => kind === 'crypto')).toHaveLength(3);
    expect(kinds.filter((kind) => kind === 'victoryPoint')).toHaveLength(2);
  });

  it('uses the approved identities and counts', () => {
    for (const [id, count] of Object.entries(COUNTS)) {
      expect(STARTING_DECK.filter((item) => item === id)).toHaveLength(count);
    }
  });

  it('keeps placeholder definitions as fixtures', () => {
    expect(CARD_DEFINITIONS.cipher_runner).toBeDefined();
    expect(CARD_DEFINITIONS.crypto_shard).toBeDefined();
    expect(STARTING_DECK).not.toContain('cipher_runner');
  });

  it('gives both players identical Cycle 1 deck order', () => {
    const { state } = createHarness();
    const left = state.decks['0'].map((id) => state.cards[id].cardDefId);
    const right = state.decks['1'].map((id) => state.cards[id].cardDefId);
    expect(left).toEqual(right);
    expect(left).toEqual(STARTING_DECK);
  });

  it('marks Crypto starters undeployable and Vault Encryption deployable', () => {
    const { state, config } = createHarness();
    const byte = Object.values(state.cards).find((card) => card.cardDefId === 'byte_coin');
    const vault = Object.values(state.cards).find((card) => card.cardDefId === 'vault_encryption');
    expect(byte).toBeDefined();
    expect(vault).toBeDefined();
    if (!byte || !vault) return;
    state.hands['0'].push(byte.instanceId);
    byte.zone = 'hand';
    expect(canDeploy(state, '0', byte.instanceId, 0, config).ok).toBe(false);
    state.hands['0'].push(vault.instanceId);
    vault.zone = 'hand';
    expect(canDeploy(state, '0', vault.instanceId, 0, config).ok).toBe(true);
  });
});
