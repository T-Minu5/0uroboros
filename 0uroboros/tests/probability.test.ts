/**
 * Node probability distribution behavior.
 */

import { describe, expect, it } from 'vitest';
import { createHarness } from './helpers';
import {
  normalize,
  quantize,
  resetProbabilities,
  selectCollapseNode,
  setProbability,
  transferProbability,
} from '../src/game/engine/probability';
import { createSeededRandom } from '../src/game/engine/random';

describe('Probability distribution', () => {
  it('starts at the configured base distribution summing to 100', () => {
    const { state } = createHarness();
    expect(state.nodes.map((n) => n.probability)).toEqual([30, 25, 20, 15, 10]);
    const total = state.nodes.reduce((sum, n) => sum + n.probability, 0);
    expect(total).toBe(100);
  });

  it('resets to the base distribution each Cycle', () => {
    const { state, config } = createHarness();
    state.nodes[0].probability = 90;
    state.nodes[1].probability = 10;
    resetProbabilities(state, config);
    expect(state.nodes.map((n) => n.probability)).toEqual([30, 25, 20, 15, 10]);
  });

  it('transfers probability between Nodes', () => {
    const { state, config } = createHarness();
    const moved = transferProbability(state, 0, 4, 10, config);
    expect(moved).toBe(10);
    expect(state.nodes[0].probability).toBe(20);
    expect(state.nodes[4].probability).toBe(20);
  });

  it('transfers all available and clamps the source to 0 when over-requested', () => {
    const { state, config } = createHarness();
    // Node 5 holds 10%. Requesting 40% should move only 10%.
    const moved = transferProbability(state, 4, 0, 40, config);
    expect(moved).toBe(10);
    expect(state.nodes[4].probability).toBe(0);
    expect(state.nodes[0].probability).toBe(40);
  });

  it('never produces a negative probability', () => {
    const { state, config } = createHarness();
    transferProbability(state, 4, 0, 999, config);
    state.nodes.forEach((node) => {
      expect(node.probability).toBeGreaterThanOrEqual(0);
    });
  });

  it('respects the 0.5% increment', () => {
    const { state, config } = createHarness();
    // 0.3 quantizes to 0.5 at the configured increment.
    const moved = transferProbability(state, 0, 1, 0.3, config);
    expect(moved % config.probabilityIncrement).toBe(0);
    expect(quantize(0.3, 0.5)).toBe(0.5);
    expect(quantize(0.24, 0.5)).toBe(0);
  });

  it('rejects a transfer to the same Node', () => {
    const { state, config } = createHarness();
    expect(transferProbability(state, 2, 2, 5, config)).toBe(0);
  });

  it('allows a Node to reach 100%', () => {
    const { state, config } = createHarness();
    setProbability(state, 0, 100, config);
    expect(state.nodes[0].probability).toBe(100);
    const others = state.nodes.slice(1).reduce((sum, n) => sum + n.probability, 0);
    expect(others).toBe(0);
  });

  it('keeps the distribution summing to 100 after normalization', () => {
    const { state, config } = createHarness();
    state.nodes[0].probability = 33.3;
    normalize(state, config);
    const total = state.nodes.reduce((sum, n) => sum + n.probability, 0);
    expect(total).toBeCloseTo(100, 4);
  });
});

describe('Probabilistic Collapse selection', () => {
  it('never selects a Node at 0%', () => {
    const { state, config } = createHarness();
    // Push all probability onto Node 1.
    setProbability(state, 0, 100, config);
    const random = createSeededRandom(999);
    for (let i = 0; i < 50; i += 1) {
      expect(selectCollapseNode(state, random)).toBe(0);
    }
  });

  it('is deterministic when one Node holds 100%', () => {
    const { state, config } = createHarness();
    setProbability(state, 3, 100, config);
    const random = createSeededRandom(7);
    expect(selectCollapseNode(state, random)).toBe(3);
  });

  it('returns null when no Node has weight', () => {
    const { state } = createHarness();
    state.nodes.forEach((node) => {
      node.probability = 0;
    });
    expect(selectCollapseNode(state, createSeededRandom(1))).toBeNull();
  });

  it('selects across the distribution over many trials', () => {
    const { state } = createHarness();
    const random = createSeededRandom(2024);
    const counts = new Map<number, number>();
    for (let i = 0; i < 2000; i += 1) {
      const selected = selectCollapseNode(state, random);
      if (selected !== null) counts.set(selected, (counts.get(selected) ?? 0) + 1);
    }
    // Every Node has non-zero weight, so all should appear.
    expect(counts.size).toBe(5);
    // The 30% Node should be selected more often than the 10% Node.
    expect((counts.get(0) ?? 0)).toBeGreaterThan(counts.get(4) ?? 0);
  });
});
