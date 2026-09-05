/**
 * Cycle lifecycle: Locations, Start of Cycle, cleanup, Effect Bank Durations,
 * and hand discard.
 */

import { describe, expect, it } from 'vitest';
import { addToHand, createHarness, openNodes, placeCardAtNode } from './helpers';
import {
  beginDraft,
  beginNextCycle,
  drawHands,
  expireDurations,
  postCollapseCleanup,
  setupLocations,
  startOfCycle,
} from '../src/game/engine/cycle';
import { tryEnterEffectBank } from '../src/game/engine/zones';

describe('Cycle setup', () => {
  it('assigns a Location to every Node', () => {
    const { state, random } = createHarness();
    setupLocations(state, random);
    state.nodes.forEach((node) => {
      expect(node.locationId).not.toBeNull();
    });
  });

  it('assigns distinct Locations across Nodes', () => {
    const { state, random } = createHarness();
    setupLocations(state, random);
    const ids = state.nodes.map((node) => node.locationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resets probability at Start of Cycle', () => {
    const { state, config, random } = createHarness();
    state.nodes[0].probability = 90;
    startOfCycle(state, config, random);
    expect(state.nodes.map((n) => n.probability)).toEqual([30, 25, 20, 15, 10]);
  });

  it('resolves Effect Bank startOfCycle effects', () => {
    const { state, config, random } = createHarness();
    // Serpent loop grants 1 Crypto at the start of each Cycle.
    const id = placeCardAtNode(state, '0', 'serpent_loop', 0);
    tryEnterEffectBank(state, state.cards[id]);

    startOfCycle(state, config, random);
    expect(state.players['0'].wallet).toBe(1);
  });

  it('draws the configured hand size for both players', () => {
    const { state, config, random } = createHarness();
    drawHands(state, config, random);
    expect(state.hands['0']).toHaveLength(config.handDrawPerCycle);
    expect(state.hands['1']).toHaveLength(config.handDrawPerCycle);
  });

  it('honours a configured hand size change', () => {
    const { state, config, random } = createHarness({ handDrawPerCycle: 3 });
    drawHands(state, config, random);
    expect(state.hands['0']).toHaveLength(3);
  });
});

describe('Post-Collapse cleanup', () => {
  it('moves non-Duration Node cards to Discard', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const id = placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });

    postCollapseCleanup(state, config, random);
    expect(state.cards[id].zone).toBe('discard');
    expect(state.discards['0']).toContain(id);
  });

  it('moves eligible Duration cards into the Effect Bank', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const id = placeCardAtNode(state, '0', 'serpent_loop', 0, { revealed: true });

    postCollapseCleanup(state, config, random);
    expect(state.cards[id].zone).toBe('effectBank');
    expect(state.effectBanks['0']).toContain(id);
  });

  it('sends Duration cards to Discard when the Effect Bank is full', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    // Fill all four slots.
    for (let i = 0; i < config.effectBankSlots; i += 1) {
      const filler = placeCardAtNode(state, '0', 'eternal_recursion', 1);
      tryEnterEffectBank(state, state.cards[filler]);
    }
    const overflow = placeCardAtNode(state, '0', 'serpent_loop', 0, { revealed: true });

    postCollapseCleanup(state, config, random);
    expect(state.cards[overflow].zone).toBe('discard');
  });

  it('attempts Effect Bank entry in original play order', () => {
    const { state, config, random } = createHarness({ effectBankSlots: 1 });
    state.effectBanks['0'] = [null];
    openNodes(state, [0]);
    const first = placeCardAtNode(state, '0', 'serpent_loop', 0, {
      revealed: true,
      playOrder: 0,
    });
    const second = placeCardAtNode(state, '0', 'serpent_loop', 0, {
      revealed: true,
      playOrder: 1,
    });

    postCollapseCleanup(state, config, random);
    // The earlier card claims the only slot.
    expect(state.cards[first].zone).toBe('effectBank');
    expect(state.cards[second].zone).toBe('discard');
  });

  it('discards all cards remaining in hand at End of Cycle', () => {
    const { state, config, random } = createHarness();
    addToHand(state, '0', 'cipher_runner');
    addToHand(state, '0', 'monolith_core');
    expect(state.hands['0']).toHaveLength(2);

    postCollapseCleanup(state, config, random);
    expect(state.hands['0']).toHaveLength(0);
    expect(state.discards['0']).toHaveLength(2);
  });

  it('keeps Crypto in hand for the Draft transition instead of discarding it', () => {
    const { state, config, random } = createHarness();
    addToHand(state, '0', 'crypto_shard');
    addToHand(state, '0', 'cipher_runner');

    postCollapseCleanup(state, config, random);
    // Only the non-Crypto card was discarded; Crypto still awaits auto-play.
    expect(state.hands['0']).toHaveLength(1);

    beginDraft(state, [], config, random);
    expect(state.players['0'].wallet).toBeGreaterThan(0);
    expect(state.hands['0']).toHaveLength(0);
  });

  it('resolves Effect Bank endOfCycle effects', () => {
    const { state, config, random } = createHarness();
    // Eternal recursion grants 1 Victory Point at the end of each Cycle.
    const id = placeCardAtNode(state, '0', 'eternal_recursion', 0);
    tryEnterEffectBank(state, state.cards[id]);

    postCollapseCleanup(state, config, random);
    expect(state.players['0'].victoryPoints).toBe(1);
  });
});

describe('Duration expiration', () => {
  it('counts the deployment Cycle as Duration 1', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    // Serpent loop has Duration 3, so it remains active for two more Cycles.
    const id = placeCardAtNode(state, '0', 'serpent_loop', 0, { revealed: true });
    postCollapseCleanup(state, config, random);

    expect(state.cards[id].zone).toBe('effectBank');
    expect(state.cards[id].durationRemaining).toBe(2);
  });

  it('removes a card once its Duration ends', () => {
    const { state, config } = createHarness();
    const id = placeCardAtNode(state, '0', 'serpent_loop', 0);
    tryEnterEffectBank(state, state.cards[id]);
    state.cards[id].durationRemaining = 1;

    expireDurations(state, config);
    expect(state.cards[id].zone).toBe('discard');
    expect(state.effectBanks['0']).not.toContain(id);
  });

  it('never expires an infinite Duration card', () => {
    const { state, config } = createHarness();
    const id = placeCardAtNode(state, '0', 'eternal_recursion', 0);
    tryEnterEffectBank(state, state.cards[id]);
    state.cards[id].durationRemaining = config.infiniteDurationValue;

    for (let i = 0; i < 20; i += 1) expireDurations(state, config);
    expect(state.cards[id].zone).toBe('effectBank');
    expect(state.cards[id].durationRemaining).toBe(config.infiniteDurationValue);
  });

  it('frees the Effect Bank slot when a card expires', () => {
    const { state, config } = createHarness();
    const id = placeCardAtNode(state, '0', 'serpent_loop', 0);
    tryEnterEffectBank(state, state.cards[id]);
    state.cards[id].durationRemaining = 1;

    expireDurations(state, config);
    expect(state.effectBanks['0'][0]).toBeNull();
  });
});

describe('Cycle advance', () => {
  it('increments the Cycle and resets turn and play order', () => {
    const { state } = createHarness();
    state.turn = 4;
    state.players['0'].nextPlayOrder = 7;

    beginNextCycle(state);
    expect(state.cycle).toBe(2);
    expect(state.turn).toBe(0);
    expect(state.players['0'].nextPlayOrder).toBe(0);
  });
});
