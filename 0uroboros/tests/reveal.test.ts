/**
 * Reveal eligibility and ordering.
 *
 * Covers the worked example from 02_CORE_RULES_CIRCUIT_COLLAPSE.md section 5.
 */

import { describe, expect, it } from 'vitest';
import { createHarness, openNodes, placeCardAtNode } from './helpers';
import { buildRevealQueue, eligibleCards } from '../src/game/engine/reveal';

describe('Reveal eligibility', () => {
  it('excludes cards at unopened Nodes', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    placeCardAtNode(state, '0', 'cipher_runner', 0);
    placeCardAtNode(state, '0', 'cipher_runner', 3);

    const eligible = eligibleCards(state, '0');
    expect(eligible).toHaveLength(1);
    expect(eligible[0].nodeIndex).toBe(0);
  });

  it('excludes already revealed cards', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    expect(eligibleCards(state, '0')).toHaveLength(0);
  });

  it('preserves chronological play order and skips unopened Nodes', () => {
    // Turn 3 example: Nodes 1 to 3 are open. A player plays N3, N1, N4, N2.
    // Eligible reveal order is N3, N1, then N2. The N4 card waits for Node 4.
    const { state } = createHarness();
    openNodes(state, [0, 1, 2]);
    placeCardAtNode(state, '0', 'cipher_runner', 2, { playOrder: 0 });
    placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 1 });
    placeCardAtNode(state, '0', 'cipher_runner', 3, { playOrder: 2 });
    placeCardAtNode(state, '0', 'cipher_runner', 1, { playOrder: 3 });

    const nodes = eligibleCards(state, '0').map((card) => card.nodeIndex);
    expect(nodes).toEqual([2, 0, 1]);
  });
});

describe('Reveal queue ordering', () => {
  it('alternates starting with the priority player', () => {
    const { state } = createHarness();
    state.revealPriority = '0';
    openNodes(state, [0]);
    const a1 = placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 0 });
    const a2 = placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 1 });
    const b1 = placeCardAtNode(state, '1', 'cipher_runner', 0, { playOrder: 0 });
    const b2 = placeCardAtNode(state, '1', 'cipher_runner', 0, { playOrder: 1 });

    expect(buildRevealQueue(state)).toEqual([a1, b1, a2, b2]);
  });

  it('honours the opposite priority player', () => {
    const { state } = createHarness();
    state.revealPriority = '1';
    openNodes(state, [0]);
    const a1 = placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 0 });
    const b1 = placeCardAtNode(state, '1', 'cipher_runner', 0, { playOrder: 0 });

    expect(buildRevealQueue(state)).toEqual([b1, a1]);
  });

  it('reveals the remaining cards in order when one player is exhausted', () => {
    const { state } = createHarness();
    state.revealPriority = '0';
    openNodes(state, [0, 1]);
    const a1 = placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 0 });
    const a2 = placeCardAtNode(state, '0', 'cipher_runner', 1, { playOrder: 1 });
    const a3 = placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 2 });
    const b1 = placeCardAtNode(state, '1', 'cipher_runner', 0, { playOrder: 0 });

    // Player 0 continues in play order once player 1 has nothing left.
    expect(buildRevealQueue(state)).toEqual([a1, b1, a2, a3]);
  });

  it('reveals only one player when the opponent committed nothing', () => {
    const { state } = createHarness();
    state.revealPriority = '1';
    openNodes(state, [0]);
    const a1 = placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 0 });
    const a2 = placeCardAtNode(state, '0', 'cipher_runner', 0, { playOrder: 1 });

    expect(buildRevealQueue(state)).toEqual([a1, a2]);
  });

  it('returns an empty queue when nothing is eligible', () => {
    const { state } = createHarness();
    expect(buildRevealQueue(state)).toEqual([]);
  });
});
