/**
 * Effect resolution.
 *
 * Effects resolve sequentially, one after another. There is no general-purpose
 * effect stack that must finish after a game-ending condition. Effects with no
 * valid target fail cleanly and report so, allowing the UI to communicate
 * "No valid target".
 */

import type {
  CardInstance,
  EffectOp,
  NodeIndex,
  OuroborosState,
  PlayerID,
  PlayerRef,
  CardSelector,
  PowerTarget,
} from '../types';
import type { OuroborosConfig } from '../config/defaults';
import type { RandomAPI } from './random';
import { cardPower } from './power';
import {
  cardsAtNode,
  createCardInstance,
  drawCards,
  moveToDestroyed,
  moveToTrash,
  placeAcquiredCard,
} from './zones';
import { damageDataCenter, healDataCenter } from './dataCenters';
import { resolveProbabilityRef, setProbability, transferProbability } from './probability';
import { addLog } from './log';

/** Context an effect resolves within. */
export interface EffectContext {
  /** Player who controls the effect source. */
  controller: PlayerID;
  /** Node the effect originates at, when applicable. */
  nodeIndex: NodeIndex | null;
  /** Source card, when the effect comes from a card. */
  sourceCard: CardInstance | null;
  /** Node winner and loser, populated during Collapse resolution. */
  nodeWinner?: PlayerID | null;
  nodeLoser?: PlayerID | null;
}

export interface EffectOutcome {
  /** True when at least one op found no valid target. */
  noValidTarget: boolean;
  /** Set when applying this effect destroyed a Data Center. */
  dataCenterDestroyed: boolean;
}

function opponentOf(player: PlayerID): PlayerID {
  return player === '0' ? '1' : '0';
}

function resolvePlayerRefs(ref: PlayerRef, ctx: EffectContext): PlayerID[] {
  switch (ref) {
    case 'self':
      return [ctx.controller];
    case 'opponent':
      return [opponentOf(ctx.controller)];
    case 'both':
      return ['0', '1'];
    case 'nodeWinner':
      // A tied Node has no winner, so a tie grants the reward to both players.
      return ctx.nodeWinner ? [ctx.nodeWinner] : ctx.nodeWinner === null ? ['0', '1'] : [];
    case 'nodeLoser':
      return ctx.nodeLoser ? [ctx.nodeLoser] : [];
  }
}

function resolvePowerTargets(
  state: OuroborosState,
  target: PowerTarget,
  ctx: EffectContext,
): CardInstance[] {
  if (target.kind === 'self') {
    return ctx.sourceCard ? [ctx.sourceCard] : [];
  }
  if (ctx.nodeIndex === null) return [];
  const all = cardsAtNode(state, ctx.nodeIndex);
  switch (target.kind) {
    case 'alliesAtNode':
      return all.filter(
        (card) => card.controller === ctx.controller && card.instanceId !== ctx.sourceCard?.instanceId,
      );
    case 'enemiesAtNode':
      return all.filter((card) => card.controller !== ctx.controller);
    case 'allAtNode':
      return all;
  }
}

function resolveCardSelector(
  state: OuroborosState,
  selector: CardSelector,
  ctx: EffectContext,
): CardInstance | null {
  if (selector.kind === 'self') return ctx.sourceCard;
  if (ctx.nodeIndex === null) return null;
  const enemies = cardsAtNode(state, ctx.nodeIndex).filter(
    (card) => card.controller !== ctx.controller,
  );
  if (enemies.length === 0) return null;

  const sorted = [...enemies].sort((a, b) => {
    const diff = cardPower(a) - cardPower(b);
    // Stable tiebreak on play order keeps resolution deterministic.
    if (diff !== 0) return diff;
    return (a.playOrder ?? 0) - (b.playOrder ?? 0);
  });
  return selector.kind === 'lowestPowerEnemyAtNode' ? sorted[0] : sorted[sorted.length - 1];
}

/** Apply a single effect op. */
function applyOp(
  state: OuroborosState,
  op: EffectOp,
  ctx: EffectContext,
  config: OuroborosConfig,
  random: RandomAPI,
  outcome: EffectOutcome,
): void {
  switch (op.op) {
    case 'addPower': {
      const targets = resolvePowerTargets(state, op.target, ctx);
      if (targets.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      targets.forEach((card) => {
        card.powerMods += op.amount;
      });
      return;
    }

    case 'transferProbability': {
      const from = resolveProbabilityRef(state, op.from, ctx.nodeIndex);
      const to = resolveProbabilityRef(state, op.to, ctx.nodeIndex);
      if (from === null || to === null || from === to) {
        outcome.noValidTarget = true;
        return;
      }
      const moved = transferProbability(state, from, to, op.amount, config);
      if (moved <= 0) outcome.noValidTarget = true;
      else {
        addLog(state, 'collapse', `Moved ${moved}% probability from Node ${from + 1} to Node ${to + 1}.`);
      }
      return;
    }

    case 'setProbability': {
      const target = resolveProbabilityRef(state, op.target, ctx.nodeIndex);
      if (target === null) {
        outcome.noValidTarget = true;
        return;
      }
      setProbability(state, target, op.amount, config);
      return;
    }

    case 'gainCrypto': {
      const players = resolvePlayerRefs(op.target, ctx);
      if (players.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      players.forEach((player) => {
        state.players[player].wallet += op.amount;
      });
      return;
    }

    case 'gainVictoryPoints': {
      const players = resolvePlayerRefs(op.target, ctx);
      if (players.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      players.forEach((player) => {
        state.players[player].victoryPoints += op.amount;
      });
      return;
    }

    case 'damageDataCenter': {
      const players = resolvePlayerRefs(op.target, ctx);
      if (players.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      players.forEach((defender) => {
        const result = damageDataCenter(state, defender, op.amount, config, op.dataCenter);
        if (result.noValidTarget) {
          outcome.noValidTarget = true;
          return;
        }
        if (result.destroyedDataCenter) {
          outcome.dataCenterDestroyed = true;
          const attacker = opponentOf(defender);
          state.players[attacker].victoryPoints += result.victoryPointsAwarded;
          addLog(
            state,
            'damage',
            `Player ${defender} ${result.destroyedDataCenter} Data Center destroyed. Player ${attacker} gains ${result.victoryPointsAwarded} Victory Points.`,
          );
        } else if (result.applied > 0) {
          addLog(state, 'damage', `Player ${defender} takes ${result.applied} Data Center damage.`);
        }
      });
      return;
    }

    case 'healDataCenter': {
      const players = resolvePlayerRefs(op.target, ctx);
      if (players.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      let healedAny = false;
      players.forEach((player) => {
        const healed = healDataCenter(state, player, op.amount, op.dataCenter);
        if (healed > 0) healedAny = true;
      });
      if (!healedAny) outcome.noValidTarget = true;
      return;
    }

    case 'draw': {
      const players = resolvePlayerRefs(op.target, ctx);
      if (players.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      players.forEach((player) => {
        const drawn = drawCards(state, player, op.amount, random);
        if (drawn.length === 0) outcome.noValidTarget = true;
      });
      return;
    }

    case 'trashSelf': {
      if (!ctx.sourceCard) {
        outcome.noValidTarget = true;
        return;
      }
      moveToTrash(state, ctx.sourceCard);
      return;
    }

    case 'trashCard': {
      const target = resolveCardSelector(state, op.target, ctx);
      if (!target) {
        outcome.noValidTarget = true;
        return;
      }
      moveToTrash(state, target);
      return;
    }

    case 'destroyCard': {
      const target = resolveCardSelector(state, op.target, ctx);
      if (!target) {
        outcome.noValidTarget = true;
        return;
      }
      moveToDestroyed(state, target);
      return;
    }

    case 'grantCard': {
      const players = resolvePlayerRefs(op.target, ctx);
      if (players.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      players.forEach((player) => {
        // Granted cards do not consume market supply.
        const card = createCardInstance(op.cardDefId, player, 'discard');
        placeAcquiredCard(state, card, op.destination, random);
      });
      return;
    }

    case 'log': {
      addLog(state, 'system', op.message);
      return;
    }
  }
}

/** Resolve an ordered list of ops, one after another. */
export function resolveOps(
  state: OuroborosState,
  ops: EffectOp[],
  ctx: EffectContext,
  config: OuroborosConfig,
  random: RandomAPI,
): EffectOutcome {
  const outcome: EffectOutcome = { noValidTarget: false, dataCenterDestroyed: false };
  for (const op of ops) {
    applyOp(state, op, ctx, config, random, outcome);
  }
  return outcome;
}
