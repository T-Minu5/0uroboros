/**
 * Power computation and Node control.
 *
 * Power may be negative. Highest numerical total wins even when both totals are
 * negative. A player with no cards at a Node has 0 Power, so 0 beats a negative
 * total. Equal totals are tied.
 */

import type { CardInstance, NodeIndex, OuroborosState, PlayerID } from '../types';
import { getCardDefinition } from '../content/cards';
import { cardsAtNode } from './zones';

export function cardPower(card: CardInstance): number {
  return getCardDefinition(card.cardDefId).power + card.powerMods;
}

/**
 * Total Power a player has at a Node.
 *
 * Only revealed cards contribute, because unrevealed commitments are hidden and
 * their Power is not yet part of the comparison.
 */
export function nodePower(
  state: OuroborosState,
  nodeIndex: NodeIndex,
  player: PlayerID,
): number {
  return cardsAtNode(state, nodeIndex, player)
    .filter((card) => card.revealed)
    .reduce((total, card) => total + cardPower(card), 0);
}

export type NodeOutcome =
  | { result: 'win'; winner: PlayerID; loser: PlayerID }
  | { result: 'tie' };

export function nodeOutcome(state: OuroborosState, nodeIndex: NodeIndex): NodeOutcome {
  const p0 = nodePower(state, nodeIndex, '0');
  const p1 = nodePower(state, nodeIndex, '1');
  if (p0 > p1) return { result: 'win', winner: '0', loser: '1' };
  if (p1 > p0) return { result: 'win', winner: '1', loser: '0' };
  return { result: 'tie' };
}

/**
 * Controlled probability weight, used to assign next-turn reveal priority.
 *
 * A player receives the full weight of Nodes they are winning and half the
 * weight of tied Nodes. Empty Nodes are 0 versus 0 and therefore tied.
 */
export function controlledWeight(state: OuroborosState, player: PlayerID): number {
  return state.nodes.reduce((total, node) => {
    const outcome = nodeOutcome(state, node.index);
    if (outcome.result === 'tie') return total + node.probability / 2;
    return outcome.winner === player ? total + node.probability : total;
  }, 0);
}

/**
 * Reveal priority for the next turn.
 *
 * The player with greater controlled weight gets priority. If controlled weight
 * is tied, the player who previously had priority retains it.
 */
export function nextRevealPriority(state: OuroborosState): PlayerID {
  const w0 = controlledWeight(state, '0');
  const w1 = controlledWeight(state, '1');
  if (w0 > w1) return '0';
  if (w1 > w0) return '1';
  return state.revealPriority;
}
