/**
 * Card deployment legality and execution.
 *
 * Players may deploy any number of legal cards from hand during a window, to any
 * legal Node including previously opened Nodes and future unopened Nodes.
 * Each player may have a maximum of 4 cards at a Node. Crypto cards are not
 * playable at Nodes.
 */

import type { NodeIndex, OuroborosState, PlayerID } from '../types';
import type { OuroborosConfig } from '../config/defaults';
import type { RandomAPI } from './random';
import { getCardDefinition } from '../content/cards';
import { cardsAtNode, moveToNode } from './zones';
import { resolveOps, type EffectContext } from './effects';
import { addLog } from './log';

export type DeployFailure =
  | 'notInHand'
  | 'notDeployable'
  | 'nodeCollapsed'
  | 'nodeCapacityReached';

export type DeployCheck = { ok: true } | { ok: false; reason: DeployFailure };

export function canDeploy(
  state: OuroborosState,
  player: PlayerID,
  instanceId: string,
  nodeIndex: NodeIndex,
  config: OuroborosConfig,
): DeployCheck {
  if (!state.hands[player].includes(instanceId)) return { ok: false, reason: 'notInHand' };

  const card = state.cards[instanceId];
  if (!card) return { ok: false, reason: 'notInHand' };
  if (!getCardDefinition(card.cardDefId).deployable) {
    return { ok: false, reason: 'notDeployable' };
  }

  const node = state.nodes[nodeIndex];
  if (!node) return { ok: false, reason: 'nodeCollapsed' };
  // Closed and open Nodes both accept deployment. Collapsed Nodes do not.
  if (node.state === 'collapsed') return { ok: false, reason: 'nodeCollapsed' };

  if (cardsAtNode(state, nodeIndex, player).length >= config.nodeCapacityPerPlayer) {
    return { ok: false, reason: 'nodeCapacityReached' };
  }
  return { ok: true };
}

/** Nodes this card may legally be deployed to right now. */
export function legalNodesFor(
  state: OuroborosState,
  player: PlayerID,
  instanceId: string,
  config: OuroborosConfig,
): NodeIndex[] {
  return state.nodes
    .filter((node) => canDeploy(state, player, instanceId, node.index, config).ok)
    .map((node) => node.index);
}

/**
 * Deploy a card. Assigns the next chronological play order for that player,
 * which is first-class state used by reveal ordering.
 */
export function deploy(
  state: OuroborosState,
  player: PlayerID,
  instanceId: string,
  nodeIndex: NodeIndex,
  config: OuroborosConfig,
  random: RandomAPI,
): void {
  const card = state.cards[instanceId];
  const playOrder = state.players[player].nextPlayOrder;
  state.players[player].nextPlayOrder += 1;

  moveToNode(state, card, nodeIndex, playOrder);

  // onPlay effects resolve at deployment, before reveal.
  for (const effect of getCardDefinition(card.cardDefId).effects) {
    if (effect.timing !== 'onPlay') continue;
    const ctx: EffectContext = {
      controller: player,
      nodeIndex,
      sourceCard: card,
      chapter: 'play',
      effectText: effect.text,
    };
    const outcome = resolveOps(state, effect.ops, ctx, config, random);
    if (outcome.noValidTarget) {
      addLog(state, 'deploy', `${getCardDefinition(card.cardDefId).name} had no valid target.`);
    }
  }

  addLog(
    state,
    'deploy',
    `Player ${player} committed a card to Node ${nodeIndex + 1} at play order ${playOrder}.`,
  );
}

/** Reveal a single card and resolve its onReveal effects. */
export function revealCard(
  state: OuroborosState,
  instanceId: string,
  config: OuroborosConfig,
  random: RandomAPI,
): void {
  const card = state.cards[instanceId];
  if (!card || card.revealed || card.zone !== 'node') return;

  card.revealed = true;
  const def = getCardDefinition(card.cardDefId);
  addLog(
    state,
    'reveal',
    `${def.name} revealed at Node ${(card.nodeIndex ?? 0) + 1} for player ${card.controller}.`,
  );

  for (const effect of def.effects) {
    if (effect.timing !== 'onReveal') continue;
    const ctx: EffectContext = {
      controller: card.controller,
      nodeIndex: card.nodeIndex,
      sourceCard: card,
      chapter: 'reveal',
      effectText: effect.text,
    };
    const outcome = resolveOps(state, effect.ops, ctx, config, random);
    if (outcome.noValidTarget) {
      addLog(state, 'reveal', `${def.name} had no valid target.`);
    }
  }
}
