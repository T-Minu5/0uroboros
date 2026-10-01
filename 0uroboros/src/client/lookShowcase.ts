/**
 * Capture / lookdev URL helper. `?look=1` keeps the idle playtest board readable
 * while still showing source→target causality and Collapse atmosphere for screenshots.
 */

import type { FxEvent } from '../game/types';

export function lookShowcaseEnabled(
  search = typeof window !== 'undefined' ? window.location.search : '',
): boolean {
  const params = new URLSearchParams(search);
  return params.get('look') === '1' || params.get('look') === 'true';
}

/** Synthetic chance hop so captures show a directed path without mutating G. */
export function lookShowcaseFxEvent(tick = 1): FxEvent {
  return {
    id: -9000 - (tick % 1000),
    kind: 'chance',
    chapter: 'play',
    text: 'look showcase: source → target',
    fromNode: 1,
    toNode: 3,
    fromBefore: 42,
    toAfter: 67,
    amount: 15,
    sourceInstanceId: 'look-source',
  };
}
