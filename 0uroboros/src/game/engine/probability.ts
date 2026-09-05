/**
 * Node probability distribution.
 *
 * Probability is Cycle-local and resets to the configured base distribution each
 * Cycle. It may reach 0% or 100%, may never go negative, and uses 0.5%
 * increments. A 0% Node still resolves normally and can grant Location rewards
 * but cannot be selected by the final probabilistic Collapse.
 */

import type { NodeIndex, OuroborosState, ProbabilityRef } from '../types';
import type { OuroborosConfig } from '../config/defaults';
import type { RandomAPI } from './random';

/** Round to the configured increment to avoid floating point drift. */
export function quantize(value: number, increment: number): number {
  const steps = Math.round(value / increment);
  return Number((steps * increment).toFixed(4));
}

export function resetProbabilities(state: OuroborosState, config: OuroborosConfig): void {
  state.nodes.forEach((node, index) => {
    node.probability = config.baseProbabilities[index] ?? 0;
  });
}

export function resolveProbabilityRef(
  state: OuroborosState,
  ref: ProbabilityRef,
  contextNode: NodeIndex | null,
): NodeIndex | null {
  switch (ref.kind) {
    case 'thisNode':
      return contextNode;
    case 'node':
      return ref.index;
    case 'highestNode': {
      let best: NodeIndex | null = null;
      let bestValue = -Infinity;
      for (const node of state.nodes) {
        if (node.probability > bestValue) {
          bestValue = node.probability;
          best = node.index;
        }
      }
      return best;
    }
    case 'lowestNode': {
      let best: NodeIndex | null = null;
      let bestValue = Infinity;
      for (const node of state.nodes) {
        if (node.probability < bestValue) {
          bestValue = node.probability;
          best = node.index;
        }
      }
      return best;
    }
  }
}

/**
 * Transfer probability between Nodes.
 *
 * If an effect attempts to transfer more probability than the source has,
 * transfer all available probability and reduce the source to 0%.
 * Returns the amount actually transferred.
 */
export function transferProbability(
  state: OuroborosState,
  fromIndex: NodeIndex,
  toIndex: NodeIndex,
  requested: number,
  config: OuroborosConfig,
): number {
  if (fromIndex === toIndex) return 0;
  const source = state.nodes[fromIndex];
  const target = state.nodes[toIndex];
  if (!source || !target) return 0;

  const amount = quantize(
    Math.max(0, Math.min(requested, source.probability)),
    config.probabilityIncrement,
  );
  if (amount <= 0) return 0;

  source.probability = quantize(source.probability - amount, config.probabilityIncrement);
  target.probability = quantize(target.probability + amount, config.probabilityIncrement);
  return amount;
}

/** Set one Node's probability, renormalizing the remainder across other Nodes. */
export function setProbability(
  state: OuroborosState,
  nodeIndex: NodeIndex,
  value: number,
  config: OuroborosConfig,
): void {
  const target = state.nodes[nodeIndex];
  if (!target) return;
  const clamped = quantize(Math.max(0, Math.min(100, value)), config.probabilityIncrement);
  const others = state.nodes.filter((node) => node.index !== nodeIndex);
  const othersTotal = others.reduce((sum, node) => sum + node.probability, 0);
  const remaining = quantize(100 - clamped, config.probabilityIncrement);

  target.probability = clamped;
  if (othersTotal <= 0) {
    // Distribute the remainder evenly when every other Node sits at 0%.
    const share = quantize(remaining / others.length, config.probabilityIncrement);
    others.forEach((node) => {
      node.probability = share;
    });
  } else {
    others.forEach((node) => {
      node.probability = quantize(
        (node.probability / othersTotal) * remaining,
        config.probabilityIncrement,
      );
    });
  }
  normalize(state, config);
}

/** Correct residual drift so the distribution sums to 100. */
export function normalize(state: OuroborosState, config: OuroborosConfig): void {
  const total = state.nodes.reduce((sum, node) => sum + node.probability, 0);
  const drift = quantize(100 - total, config.probabilityIncrement);
  if (drift === 0) return;
  // Apply drift to the largest Node that can absorb it without going negative.
  const sorted = [...state.nodes].sort((a, b) => b.probability - a.probability);
  for (const node of sorted) {
    const adjusted = quantize(node.probability + drift, config.probabilityIncrement);
    if (adjusted >= 0) {
      node.probability = adjusted;
      return;
    }
  }
}

/**
 * Server-authoritative weighted Node selection for the Circuit Reward.
 * Nodes at 0% cannot be selected. Returns null when no Node has weight.
 */
export function selectCollapseNode(
  state: OuroborosState,
  random: RandomAPI,
): NodeIndex | null {
  const weights = state.nodes.map((node) => node.probability);
  const index = random.weighted(weights);
  if (index < 0) return null;
  return state.nodes[index].index;
}
