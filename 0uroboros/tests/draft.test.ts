/**
 * Draft market, atomic purchases, supply, cooldown, and the Circuit Reward slot.
 */

import { describe, expect, it } from 'vitest';
import { createHarness } from './helpers';
import {
  availableSupply,
  claimCircuitReward,
  createMarket,
  endDraft,
  hasLegalDraftAction,
  purchase,
  refreshChaos,
} from '../src/game/engine/draft';
import { beginDraft } from '../src/game/engine/cycle';
import { addToHand } from './helpers';

describe('Market setup', () => {
  it('creates the configured number of slots per category', () => {
    const { config, random } = createHarness();
    const market = createMarket(config, random);
    expect(market.base).toHaveLength(config.baseMarketSlots);
    expect(market.victoryPoint).toHaveLength(config.victoryPointMarketSlots);
    expect(market.crypto).toHaveLength(config.cryptoMarketSlots);
    expect(market.chaos).toHaveLength(config.chaosSlots);
  });

  it('uses shared supply for Base, Victory Point, and Crypto piles', () => {
    const { config, random } = createHarness();
    const market = createMarket(config, random);
    expect(market.base[0].supply).toBe(config.baseSharedSupply);
    expect(market.victoryPoint[0].supply).toBe(config.victoryPointSharedSupply);
    expect(market.crypto[0].supply).toBe(config.cryptoSharedSupply);
  });

  it('uses independent per-player supply for Chaos', () => {
    const { config, random } = createHarness();
    const chaos = refreshChaos(config, random);
    expect(chaos[0].supply).toBeNull();
    expect(chaos[0].perPlayerSupply?.['0']).toBe(config.chaosPerPlayerSupply);
    expect(chaos[0].perPlayerSupply?.['1']).toBe(config.chaosPerPlayerSupply);
  });

  it('respects configuration changes without code changes', () => {
    const { config, random } = createHarness({ baseMarketSlots: 4, baseSharedSupply: 2 });
    const market = createMarket(config, random);
    expect(market.base).toHaveLength(4);
    expect(market.base[0].supply).toBe(2);
  });
});

describe('Purchases', () => {
  it('deducts Crypto and decrements shared supply atomically', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 10;
    const slot = state.market.base[0];
    const startingSupply = slot.supply ?? 0;

    const result = purchase(state, '0', 'base', 0, config, random, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(state.players['0'].wallet).toBe(10 - result.cost);
      expect(slot.supply).toBe(startingSupply - 1);
      // The acquired card enters the Discard pile immediately.
      expect(state.discards['0']).toContain(result.instanceId);
    }
  });

  it('rejects a purchase the Wallet cannot afford and spends nothing', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 0;
    const slot = state.market.base[0];
    const startingSupply = slot.supply ?? 0;

    const result = purchase(state, '0', 'base', 0, config, random, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficientCrypto');
    // No Crypto spent and no supply consumed.
    expect(state.players['0'].wallet).toBe(0);
    expect(slot.supply).toBe(startingSupply);
  });

  it('rejects a purchase when shared supply is exhausted', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 100;
    state.market.base[0].supply = 0;

    const result = purchase(state, '0', 'base', 0, config, random, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('supplyExhausted');
  });

  it('leaves an empty market slot when a persistent pile reaches 0', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 1000;
    state.market.base[0].supply = 1;

    const first = purchase(state, '0', 'base', 0, config, random, 0);
    expect(first.ok).toBe(true);
    expect(state.market.base[0].supply).toBe(0);

    // The slot remains present but unavailable rather than replenishing.
    const second = purchase(state, '0', 'base', 0, config, random, 10_000);
    expect(second.ok).toBe(false);
    expect(state.market.base[0]).toBeDefined();
  });

  it('gives the first valid transaction the final shared copy', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 100;
    state.players['1'].wallet = 100;
    state.market.base[0].supply = 1;

    const first = purchase(state, '0', 'base', 0, config, random, 0);
    const second = purchase(state, '1', 'base', 0, config, random, 0);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    // The losing request spends no Crypto.
    expect(state.players['1'].wallet).toBe(100);
  });

  it('applies the repeat cooldown only to the same card by the same player', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 100;

    const first = purchase(state, '0', 'base', 0, config, random, 0);
    expect(first.ok).toBe(true);

    // Same card immediately again is blocked.
    const repeat = purchase(state, '0', 'base', 0, config, random, 500);
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.reason).toBe('cooldown');

    // A different card is immediately purchasable.
    const different = purchase(state, '0', 'base', 1, config, random, 500);
    expect(different.ok).toBe(true);

    // The same card succeeds once the cooldown has elapsed.
    const afterCooldown = purchase(
      state,
      '0',
      'base',
      0,
      config,
      random,
      config.repeatPurchaseCooldownMs + 1,
    );
    expect(afterCooldown.ok).toBe(true);
  });

  it('does not apply the cooldown across different players', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 100;
    state.players['1'].wallet = 100;

    expect(purchase(state, '0', 'base', 0, config, random, 0).ok).toBe(true);
    expect(purchase(state, '1', 'base', 0, config, random, 0).ok).toBe(true);
  });

  it('tracks Chaos supply independently per player', () => {
    const { state, config, random } = createHarness();
    state.players['0'].wallet = 100;
    state.players['1'].wallet = 100;
    const slot = state.market.chaos[0];

    purchase(state, '0', 'chaos', 0, config, random, 0);
    expect(availableSupply(slot, '0')).toBe(config.chaosPerPlayerSupply - 1);
    // Player 1's availability is untouched.
    expect(availableSupply(slot, '1')).toBe(config.chaosPerPlayerSupply);
  });
});

describe('Circuit Reward slot', () => {
  it('allows only eligible winners to claim', () => {
    const { state, config, random } = createHarness();
    state.market.circuitReward = {
      rewardId: 'serpent_crown',
      eligible: ['0'],
      claimed: [],
    };

    const denied = claimCircuitReward(state, '1', config, random);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('notEligible');

    const granted = claimCircuitReward(state, '0', config, random);
    expect(granted.ok).toBe(true);
    expect(state.players['0'].victoryPoints).toBe(4);
  });

  it('allows each eligible player exactly one instance', () => {
    const { state, config, random } = createHarness();
    state.market.circuitReward = {
      rewardId: 'serpent_crown',
      eligible: ['0', '1'],
      claimed: [],
    };

    expect(claimCircuitReward(state, '0', config, random).ok).toBe(true);
    expect(claimCircuitReward(state, '1', config, random).ok).toBe(true);

    const repeat = claimCircuitReward(state, '0', config, random);
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.reason).toBe('alreadyClaimed');
  });
});

describe('Draft transition and close', () => {
  it('processes Crypto cards in hand into the Wallet', () => {
    const { state, config, random } = createHarness();
    addToHand(state, '0', 'crypto_shard'); // value 1
    addToHand(state, '0', 'crypto_bloc'); // value 2
    addToHand(state, '0', 'quantum_vault'); // value 4

    beginDraft(state, [], config, random);
    expect(state.players['0'].wallet).toBe(7);
    // Crypto cards are material and follow normal destination rules.
    expect(state.discards['0']).toHaveLength(3);
  });

  it('resolves Crypto card effects at the Draft transition', () => {
    const { state, config, random } = createHarness();
    // Liquidity probe grants 1 additional Crypto on top of its value of 2.
    addToHand(state, '0', 'liquidity_probe');

    beginDraft(state, [], config, random);
    expect(state.players['0'].wallet).toBe(3);
  });

  it('discards unspent Wallet Crypto at End of Draft', () => {
    const { state } = createHarness();
    state.players['0'].wallet = 12;
    state.players['1'].wallet = 3;

    endDraft(state);
    expect(state.players['0'].wallet).toBe(0);
    expect(state.players['1'].wallet).toBe(0);
  });

  it('reports whether a player still has a legal Draft action', () => {
    const { state } = createHarness();
    state.players['0'].wallet = 0;
    // With an empty Wallet, only free cards would be legal.
    state.market.base.forEach((slot) => {
      slot.supply = 0;
    });
    state.market.victoryPoint.forEach((slot) => {
      slot.supply = 0;
    });
    state.market.crypto.forEach((slot) => {
      slot.supply = 0;
    });
    state.market.chaos.forEach((slot) => {
      if (slot.perPlayerSupply) slot.perPlayerSupply['0'] = 0;
    });
    expect(hasLegalDraftAction(state, '0')).toBe(false);

    state.market.circuitReward = { rewardId: 'serpent_crown', eligible: ['0'], claimed: [] };
    expect(hasLegalDraftAction(state, '0')).toBe(true);
  });
});
