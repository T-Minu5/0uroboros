/**
 * Reveal eligibility and ordering.
 *
 * Cards at open Nodes are eligible to reveal. Cards at unopened Nodes remain
 * face down until their Node opens. The priority player reveals their first
 * eligible card, then the opponent reveals their first eligible card, then
 * players alternate while preserving each player's exact chronological play
 * order. If one player has no remaining eligible cards, the other player's
 * remaining eligible cards reveal in order.
 */

import type { CardInstance, OuroborosState, PlayerID } from '../types';

/** Unrevealed cards sitting at open Nodes, in that player's play order. */
export function eligibleCards(state: OuroborosState, player: PlayerID): CardInstance[] {
  return Object.values(state.cards)
    .filter(
      (card) =>
        card.zone === 'node' &&
        card.controller === player &&
        !card.revealed &&
        card.nodeIndex !== null &&
        state.nodes[card.nodeIndex].state === 'open',
    )
    .sort((a, b) => (a.playOrder ?? 0) - (b.playOrder ?? 0));
}

/**
 * Build the full reveal order for the current turn.
 *
 * Returns instance ids in the exact order they should reveal.
 */
export function buildRevealQueue(state: OuroborosState): string[] {
  const priority = state.revealPriority;
  const other: PlayerID = priority === '0' ? '1' : '0';

  const queues: Record<PlayerID, CardInstance[]> = {
    '0': eligibleCards(state, '0'),
    '1': eligibleCards(state, '1'),
  };

  const order: string[] = [];
  let current = priority;
  while (queues['0'].length > 0 || queues['1'].length > 0) {
    const card = queues[current].shift();
    if (card) {
      order.push(card.instanceId);
    }
    // Alternate. When the other player is empty, this player continues in order.
    const next: PlayerID = current === priority ? other : priority;
    current = queues[next].length > 0 ? next : current;
    if (queues[current].length === 0) {
      const fallback: PlayerID = current === '0' ? '1' : '0';
      if (queues[fallback].length === 0) break;
      current = fallback;
    }
  }
  return order;
}
