/**
 * Wave Collapse.
 *
 * Nodes resolve deterministically from 1 through 5. Per Node:
 *   1. Location onCollapse text
 *   2. Card onCollapse text at that Node, in play order
 *   3. Recalculate Power and probability weight
 *   4. Determine the winner by highest total Power
 *   5. Grant applicable Location rewards, both players if tied
 * After Node 5, Effect Bank onCollapse effects trigger last, as a sixth
 * Location, resolving oldest to newest. Then one Node is selected using the
 * final probability weights for the separate Circuit Reward.
 *
 * If the Data Center destruction end condition occurs while a Node is being
 * resolved, that Node finishes completely, then Wave Collapse stops. No later
 * Nodes resolve, no Circuit Reward selection occurs, and Draft is skipped.
 */

import type {
  CollapseNodeReport,
  EffectDefinition,
  NodeIndex,
  OuroborosState,
  PlayerID,
} from '../types';
import type { OuroborosConfig } from '../config/defaults';
import type { RandomAPI } from './random';
import { getCardDefinition } from '../content/cards';
import { getLocationDefinition } from '../content/locations';
import { cardsAtNode, moveToDestroyed } from './zones';
import { nodeOutcome, nodePower } from './power';
import { resolveOps, type EffectContext } from './effects';
import { isEliminated } from './dataCenters';
import { selectCollapseNode } from './probability';
import { addLog } from './log';
import { pushFx } from './fx';

export interface CollapseResult {
  /** True when a Data Center destruction ended the match mid-Collapse. */
  endedEarly: boolean;
  /** Nodes that fully resolved. */
  resolvedNodes: NodeIndex[];
  /** Node chosen by the probabilistic selection, null when Collapse ended early. */
  selectedNode: NodeIndex | null;
  /** Players eligible to claim the Circuit Reward. */
  circuitRewardEligible: PlayerID[];
}

/** Any card still unrevealed when Wave Collapse occurs is Destroyed. */
export function destroyUnrevealedCards(state: OuroborosState): number {
  const unrevealed = Object.values(state.cards).filter(
    (card) => card.zone === 'node' && !card.revealed,
  );
  unrevealed.forEach((card) => {
    moveToDestroyed(state, card);
    addLog(
      state,
      'collapse',
      `${getCardDefinition(card.cardDefId).name} was destroyed while still unrevealed.`,
    );
    pushFx(state, {
      kind: 'hitCard',
      chapter: 'collapse',
      instanceId: card.instanceId,
      nodeIndex: card.nodeIndex,
      text: `${getCardDefinition(card.cardDefId).name} was destroyed while still unrevealed.`,
    });
  });
  return unrevealed.length;
}

/**
 * Whether an effect's outcome depends on who won the Node.
 *
 * The documented per-Node order resolves Location onCollapse text at step 1 but
 * grants Location rewards at step 5, after the winner is known. Both come from
 * Location text, so the split is derived from the data: anything referencing the
 * Node winner or loser is a reward and waits for the final Power comparison.
 */
function dependsOnNodeOutcome(effect: EffectDefinition): boolean {
  return effect.ops.some((op) => {
    if (!('target' in op)) return false;
    return op.target === 'nodeWinner' || op.target === 'nodeLoser';
  });
}

function resolveNode(
  state: OuroborosState,
  nodeIndex: NodeIndex,
  config: OuroborosConfig,
  random: RandomAPI,
): { dataCenterDestroyed: boolean; report: CollapseNodeReport } {
  const node = state.nodes[nodeIndex];
  let dataCenterDestroyed = false;

  addLog(state, 'collapse', `Node ${nodeIndex + 1} collapse begins.`);
  pushFx(state, {
    kind: 'nodeFocus',
    chapter: 'collapse',
    nodeIndex,
    text: `Node ${nodeIndex + 1} collapse.`,
  });

  const location =
    node.locationId && !node.locationSilenced
      ? getLocationDefinition(node.locationId)
      : null;
  const locationEffects = (location?.effects ?? []).filter(
    (effect) => effect.timing === 'onCollapse',
  );

  // Step 1: Location onCollapse text that does not depend on the winner, such as
  // probability redistribution.
  for (const effect of locationEffects.filter((e) => !dependsOnNodeOutcome(e))) {
    const ctx: EffectContext = {
      // Location effects have no owning player, so 'self' is meaningless here and
      // every placeholder Location targets an explicit player reference instead.
      controller: '0',
      nodeIndex,
      sourceCard: null,
      chapter: 'collapse',
      effectText: effect.text,
    };
    const outcome = resolveOps(state, effect.ops, ctx, config, random);
    if (outcome.dataCenterDestroyed) dataCenterDestroyed = true;
    if (outcome.noValidTarget && location) {
      addLog(state, 'collapse', `${location.name} had no valid target.`);
    }
  }

  // Step 2: Card onCollapse text at this Node, preserving play order.
  const cards = cardsAtNode(state, nodeIndex)
    .filter((card) => card.revealed)
    .sort((a, b) => (a.playOrder ?? 0) - (b.playOrder ?? 0));

  for (const card of cards) {
    // Skip cards removed by an earlier effect in this same Node resolution.
    if (state.cards[card.instanceId]?.zone !== 'node') continue;
    const def = getCardDefinition(card.cardDefId);
    for (const effect of def.effects) {
      if (effect.timing !== 'onCollapse') continue;
      const ctx: EffectContext = {
        controller: card.controller,
        nodeIndex,
        sourceCard: card,
        chapter: 'collapse',
        effectText: effect.text,
      };
      const outcome = resolveOps(state, effect.ops, ctx, config, random);
      if (outcome.dataCenterDestroyed) dataCenterDestroyed = true;
      if (outcome.noValidTarget) {
        addLog(state, 'collapse', `${def.name} had no valid target.`);
      }
    }
  }

  // Steps 3 and 4: recalculate Power and determine the winner.
  const finalOutcome = nodeOutcome(state, nodeIndex);
  const p0 = nodePower(state, nodeIndex, '0');
  const p1 = nodePower(state, nodeIndex, '1');
  if (finalOutcome.result === 'win') {
    addLog(
      state,
      'collapse',
      `Node ${nodeIndex + 1} won by player ${finalOutcome.winner}. Power ${p0} to ${p1}.`,
    );
  } else {
    addLog(state, 'collapse', `Node ${nodeIndex + 1} is tied at ${p0} Power.`);
  }

  // Step 5: grant Location rewards using the final outcome. A tie rewards both
  // players, which resolvePlayerRefs handles when nodeWinner is null.
  for (const effect of locationEffects.filter((e) => dependsOnNodeOutcome(e))) {
    const ctx: EffectContext = {
      controller: finalOutcome.result === 'win' ? finalOutcome.winner : '0',
      nodeIndex,
      sourceCard: null,
      nodeWinner: finalOutcome.result === 'win' ? finalOutcome.winner : null,
      nodeLoser: finalOutcome.result === 'win' ? finalOutcome.loser : undefined,
      chapter: 'collapse',
      effectText: effect.text,
    };
    const outcome = resolveOps(state, effect.ops, ctx, config, random);
    if (outcome.dataCenterDestroyed) dataCenterDestroyed = true;
    if (outcome.noValidTarget && location) {
      addLog(state, 'collapse', `${location.name} had no valid target.`);
    }
  }

  node.state = 'collapsed';
  const rewardText = locationEffects
    .filter((effect) => dependsOnNodeOutcome(effect))
    .map((effect) => effect.text)
    .join(' ');
  return {
    dataCenterDestroyed,
    report: {
      index: nodeIndex,
      winner: finalOutcome.result === 'win' ? finalOutcome.winner : null,
      power0: p0,
      power1: p1,
      locationName: location?.name ?? 'Unassigned',
      locationText: location?.text ?? '',
      rewardText,
    },
  };
}

/** Effect Bank onCollapse effects resolve last, oldest arrival to newest. */
function resolveEffectBanks(
  state: OuroborosState,
  config: OuroborosConfig,
  random: RandomAPI,
): { dataCenterDestroyed: boolean } {
  let dataCenterDestroyed = false;
  for (const player of ['0', '1'] as PlayerID[]) {
    const bank = state.effectBanks[player];
    for (const instanceId of bank) {
      if (!instanceId) continue;
      const card = state.cards[instanceId];
      if (!card) continue;
      const def = getCardDefinition(card.cardDefId);
      for (const effect of def.effects) {
        if (effect.timing !== 'onCollapse') continue;
        const ctx: EffectContext = {
          controller: card.controller,
          nodeIndex: null,
          sourceCard: card,
          chapter: 'collapse',
          effectText: effect.text,
        };
        const outcome = resolveOps(state, effect.ops, ctx, config, random);
        if (outcome.dataCenterDestroyed) dataCenterDestroyed = true;
      }
    }
  }
  return { dataCenterDestroyed };
}

export function runWaveCollapse(
  state: OuroborosState,
  config: OuroborosConfig,
  random: RandomAPI,
): CollapseResult {
  destroyUnrevealedCards(state);

  const resolvedNodes: NodeIndex[] = [];
  const nodeReports: CollapseNodeReport[] = [];
  let endedEarly = false;

  for (const node of state.nodes) {
    const { dataCenterDestroyed, report } = resolveNode(state, node.index, config, random);
    resolvedNodes.push(node.index);
    nodeReports.push(report);

    // Finish the current Node completely, then stop if the match has ended.
    if (dataCenterDestroyed && (isEliminated(state, '0') || isEliminated(state, '1'))) {
      endedEarly = true;
      addLog(
        state,
        'collapse',
        'Wave Collapse stopped early because a player lost both Data Centers.',
      );
      break;
    }
  }

  if (endedEarly) {
    publishCollapseReport(state, nodeReports, null, [], true);
    return { endedEarly: true, resolvedNodes, selectedNode: null, circuitRewardEligible: [] };
  }

  const bankResult = resolveEffectBanks(state, config, random);
  if (bankResult.dataCenterDestroyed && (isEliminated(state, '0') || isEliminated(state, '1'))) {
    publishCollapseReport(state, nodeReports, null, [], true);
    return { endedEarly: true, resolvedNodes, selectedNode: null, circuitRewardEligible: [] };
  }

  // Probabilistic selection for the separate Circuit Reward.
  const selectedNode = selectCollapseNode(state, random);
  state.collapseSelectedNode = selectedNode;

  let circuitRewardEligible: PlayerID[] = [];
  if (selectedNode !== null) {
    const outcome = nodeOutcome(state, selectedNode);
    // A tied selected Node grants each player their own reward instance.
    circuitRewardEligible = outcome.result === 'win' ? [outcome.winner] : ['0', '1'];
    addLog(
      state,
      'reward',
      `Wave Collapse selected Node ${selectedNode + 1} at ${state.nodes[selectedNode].probability}% for the Circuit Reward.`,
    );
    pushFx(state, {
      kind: 'collapseSelect',
      chapter: 'collapse',
      nodeIndex: selectedNode,
      text: `Wave Collapse selected Node ${selectedNode + 1}.`,
    });
  } else {
    addLog(state, 'reward', 'Wave Collapse selected no Node for the Circuit Reward.');
  }

  publishCollapseReport(state, nodeReports, selectedNode, circuitRewardEligible, false);
  return { endedEarly: false, resolvedNodes, selectedNode, circuitRewardEligible };
}

function publishCollapseReport(
  state: OuroborosState,
  nodes: CollapseNodeReport[],
  selectedNode: NodeIndex | null,
  eligible: PlayerID[],
  endedEarly: boolean,
): void {
  state.collapseSerial += 1;
  state.collapseReport = {
    serial: state.collapseSerial,
    cycle: state.cycle,
    nodes,
    selectedNode,
    eligible,
    endedEarly,
  };
}
