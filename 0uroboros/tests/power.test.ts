/**
 * Power comparison, Node control, and reveal priority.
 */

import { describe, expect, it } from 'vitest';
import { createHarness, openNodes, placeCardAtNode } from './helpers';
import {
  controlledWeight,
  nextRevealPriority,
  nodeOutcome,
  nodePower,
} from '../src/game/engine/power';

describe('Power', () => {
  it('sums only revealed cards at a Node', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: false });

    // Unrevealed commitments are hidden and do not count toward the comparison.
    expect(nodePower(state, 0, '0')).toBe(3);
  });

  it('treats a player with no cards at a Node as 0 Power', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    expect(nodePower(state, 0, '1')).toBe(0);
  });

  it('lets 0 Power beat a negative total', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    const id = placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    state.cards[id].powerMods = -10;

    expect(nodePower(state, 0, '0')).toBe(-7);
    const outcome = nodeOutcome(state, 0);
    expect(outcome.result).toBe('win');
    if (outcome.result === 'win') expect(outcome.winner).toBe('1');
  });

  it('awards the win to the highest total when both are negative', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    const a = placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    const b = placeCardAtNode(state, '1', 'cipher_runner', 0, { revealed: true });
    state.cards[a].powerMods = -5; // -2
    state.cards[b].powerMods = -20; // -17

    const outcome = nodeOutcome(state, 0);
    expect(outcome.result).toBe('win');
    if (outcome.result === 'win') expect(outcome.winner).toBe('0');
  });

  it('reports equal totals as a tie', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    placeCardAtNode(state, '1', 'cipher_runner', 0, { revealed: true });
    expect(nodeOutcome(state, 0).result).toBe('tie');
  });
});

describe('Controlled weight and reveal priority', () => {
  it('counts empty Nodes as tied and splits their weight', () => {
    const { state } = createHarness();
    // Every Node is empty, so both players hold half of the total distribution.
    expect(controlledWeight(state, '0')).toBe(50);
    expect(controlledWeight(state, '1')).toBe(50);
  });

  it('gives full weight for won Nodes and half for tied Nodes', () => {
    const { state } = createHarness();
    openNodes(state, [0, 1]);
    // Player 0 wins Node 1 at 30%.
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    // Node 2 at 25% is contested and tied.
    placeCardAtNode(state, '0', 'cipher_runner', 1, { revealed: true });
    placeCardAtNode(state, '1', 'cipher_runner', 1, { revealed: true });

    // 30 for the win, plus half of 25, 20, 15, and 10 for the tied Nodes.
    expect(controlledWeight(state, '0')).toBe(30 + 12.5 + 10 + 7.5 + 5);
    expect(controlledWeight(state, '1')).toBe(12.5 + 10 + 7.5 + 5);
  });

  it('grants priority to the greater controlled weight', () => {
    const { state } = createHarness();
    state.revealPriority = '1';
    openNodes(state, [0]);
    placeCardAtNode(state, '0', 'monolith_core', 0, { revealed: true });

    expect(nextRevealPriority(state)).toBe('0');
  });

  it('retains previous priority when controlled weight is tied', () => {
    const { state } = createHarness();
    state.revealPriority = '1';
    // No cards anywhere, so weights are equal.
    expect(nextRevealPriority(state)).toBe('1');
  });
});
