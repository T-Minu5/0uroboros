/**
 * Runtime Action economy.
 *
 * Turn grants, deploy spend, and OnReveal deferral. Carryover between Runtime
 * turns is a config flag. Actions never carry between Cycles.
 */

import type { CardKind, OuroborosState, PlayerID } from '../types';
import type { OuroborosConfig } from '../config/defaults';

export function actionCostToDeploy(kind: CardKind): number {
  if (kind === 'victoryPoint' || kind === 'crypto') return 0;
  return 1;
}

export function clearCycleActions(state: OuroborosState): void {
  for (const player of ['0', '1'] as PlayerID[]) {
    state.players[player].actions = 0;
    state.players[player].pendingActions = 0;
  }
}

export function startRuntimeTurn(
  state: OuroborosState,
  config: OuroborosConfig,
  turnIndex: number,
): void {
  const grant = config.runtimeTurnActionGrants[turnIndex] ?? 0;
  for (const player of ['0', '1'] as PlayerID[]) {
    const seat = state.players[player];
    if (!config.actionCarryoverBetweenTurns) {
      seat.actions = 0;
    }
    seat.actions += seat.pendingActions;
    seat.pendingActions = 0;
    seat.actions += grant;
  }
}

export function gainActions(
  state: OuroborosState,
  player: PlayerID,
  amount: number,
  availability: 'immediate' | 'nextTurn',
): void {
  if (amount <= 0) return;
  if (availability === 'nextTurn') {
    state.players[player].pendingActions += amount;
    return;
  }
  state.players[player].actions += amount;
}

export function canAffordActions(state: OuroborosState, player: PlayerID, amount: number): boolean {
  return state.players[player].actions >= amount;
}

export function spendActions(state: OuroborosState, player: PlayerID, amount: number): boolean {
  if (!canAffordActions(state, player, amount)) return false;
  state.players[player].actions -= amount;
  return true;
}
