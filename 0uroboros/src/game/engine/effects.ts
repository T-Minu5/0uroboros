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
  DataCenterId,
  EffectOp,
  FxChapter,
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
import { pushFx } from './fx';

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
  /** Presentation chapter and rules text. Does not affect resolution. */
  chapter?: FxChapter;
  effectText?: string;
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

function dataCenterTarget(
  state: OuroborosState,
  defender: PlayerID,
  dataCenter?: DataCenterId,
): DataCenterId | null {
  const dcs = state.players[defender].dataCenters;
  if (dataCenter) return dcs[dataCenter].destroyed ? null : dataCenter;
  if (!dcs.primary.destroyed) return 'primary';
  if (!dcs.backup.destroyed) return 'backup';
  return null;
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
        const before = cardPower(card);
        card.powerMods += op.amount;
        pushFx(
          state,
          {
            kind: 'power',
            instanceId: card.instanceId,
            amount: op.amount,
            before,
            after: cardPower(card),
          },
          ctx,
        );
        if (op.target.kind === 'enemiesAtNode' || op.amount < 0) {
          pushFx(state, { kind: 'hitCard', instanceId: card.instanceId }, ctx);
        }
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
      const fromBefore = state.nodes[from].probability;
      const toBefore = state.nodes[to].probability;
      const moved = transferProbability(state, from, to, op.amount, config);
      if (moved <= 0) outcome.noValidTarget = true;
      else {
        addLog(state, 'collapse', `Moved ${moved}% probability from Node ${from + 1} to Node ${to + 1}.`);
        pushFx(
          state,
          {
            kind: 'chance',
            amount: moved,
            fromNode: from,
            toNode: to,
            fromBefore,
            toBefore,
            fromAfter: state.nodes[from].probability,
            toAfter: state.nodes[to].probability,
          },
          ctx,
        );
      }
      return;
    }

    case 'setProbability': {
      const target = resolveProbabilityRef(state, op.target, ctx.nodeIndex);
      if (target === null) {
        outcome.noValidTarget = true;
        return;
      }
      const before = state.nodes[target].probability;
      setProbability(state, target, op.amount, config);
      pushFx(
        state,
        {
          kind: 'chance',
          fromNode: target,
          toNode: target,
          amount: op.amount,
          fromBefore: before,
          toBefore: before,
          fromAfter: state.nodes[target].probability,
          toAfter: state.nodes[target].probability,
        },
        ctx,
      );
      return;
    }

    case 'gainCrypto': {
      const players = resolvePlayerRefs(op.target, ctx);
      if (players.length === 0) {
        outcome.noValidTarget = true;
        return;
      }
      players.forEach((player) => {
        const before = state.players[player].wallet;
        state.players[player].wallet += op.amount;
        pushFx(
          state,
          {
            kind: 'crypto',
            player,
            amount: op.amount,
            before,
            after: state.players[player].wallet,
          },
          ctx,
        );
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
        const before = state.players[player].victoryPoints;
        state.players[player].victoryPoints += op.amount;
        pushFx(
          state,
          {
            kind: 'vp',
            player,
            amount: op.amount,
            before,
            after: state.players[player].victoryPoints,
          },
          ctx,
        );
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
        const targetId = dataCenterTarget(state, defender, op.dataCenter);
        const before = targetId ? state.players[defender].dataCenters[targetId].health : 0;
        const result = damageDataCenter(state, defender, op.amount, config, op.dataCenter);
        if (result.noValidTarget) {
          outcome.noValidTarget = true;
          return;
        }
        const hitId = result.destroyedDataCenter ?? targetId;
        if (result.applied > 0 && hitId) {
          pushFx(
            state,
            {
              kind: 'damageDc',
              player: defender,
              dataCenter: hitId,
              amount: result.applied,
              before,
              after: state.players[defender].dataCenters[hitId].health,
            },
            ctx,
          );
        }
        if (result.destroyedDataCenter) {
          outcome.dataCenterDestroyed = true;
          const attacker = opponentOf(defender);
          const vpBefore = state.players[attacker].victoryPoints;
          state.players[attacker].victoryPoints += result.victoryPointsAwarded;
          addLog(
            state,
            'damage',
            `Player ${defender} ${result.destroyedDataCenter} Data Center destroyed. Player ${attacker} gains ${result.victoryPointsAwarded} Victory Points.`,
          );
          pushFx(
            state,
            {
              kind: 'vp',
              player: attacker,
              amount: result.victoryPointsAwarded,
              before: vpBefore,
              after: state.players[attacker].victoryPoints,
            },
            ctx,
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
        const targetId = op.dataCenter ?? 'primary';
        const before = state.players[player].dataCenters[targetId].health;
        const healed = healDataCenter(state, player, op.amount, op.dataCenter);
        if (healed > 0) {
          healedAny = true;
          pushFx(
            state,
            {
              kind: 'healDc',
              player,
              dataCenter: targetId,
              amount: healed,
              before,
              after: state.players[player].dataCenters[targetId].health,
            },
            ctx,
          );
        }
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
      pushFx(state, { kind: 'hitCard', instanceId: ctx.sourceCard.instanceId }, ctx);
      return;
    }

    case 'trashCard': {
      const target = resolveCardSelector(state, op.target, ctx);
      if (!target) {
        outcome.noValidTarget = true;
        return;
      }
      moveToTrash(state, target);
      pushFx(state, { kind: 'hitCard', instanceId: target.instanceId }, ctx);
      return;
    }

    case 'destroyCard': {
      const target = resolveCardSelector(state, op.target, ctx);
      if (!target) {
        outcome.noValidTarget = true;
        return;
      }
      moveToDestroyed(state, target);
      pushFx(state, { kind: 'hitCard', instanceId: target.instanceId }, ctx);
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
