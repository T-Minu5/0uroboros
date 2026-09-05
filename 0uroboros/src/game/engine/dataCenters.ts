/**
 * Data Center damage, healing, and destruction.
 *
 * Generic damage targets Primary until Primary is destroyed, then Backup.
 * Damage never spills between Data Centers. Explicitly targeted destroyed Data
 * Centers do not redirect. Destroyed Data Centers cannot be healed. Healing
 * cannot exceed maximum health.
 */

import type { DataCenterId, OuroborosState, PlayerID } from '../types';
import type { OuroborosConfig } from '../config/defaults';

export interface DamageResult {
  applied: number;
  destroyedDataCenter: DataCenterId | null;
  victoryPointsAwarded: number;
  noValidTarget: boolean;
}

/**
 * Apply damage to a player's Data Center.
 *
 * When dataCenter is omitted, damage is generic and targets Primary first.
 * Victory Points from destruction are awarded to the attacker by the caller.
 */
export function damageDataCenter(
  state: OuroborosState,
  defender: PlayerID,
  amount: number,
  config: OuroborosConfig,
  dataCenter?: DataCenterId,
): DamageResult {
  const player = state.players[defender];
  const primary = player.dataCenters.primary;
  const backup = player.dataCenters.backup;

  let targetId: DataCenterId | null;
  if (dataCenter) {
    // Explicit target does not redirect when already destroyed.
    targetId = player.dataCenters[dataCenter].destroyed ? null : dataCenter;
  } else if (!primary.destroyed) {
    targetId = 'primary';
  } else if (!backup.destroyed) {
    targetId = 'backup';
  } else {
    targetId = null;
  }

  if (targetId === null || amount <= 0) {
    return {
      applied: 0,
      destroyedDataCenter: null,
      victoryPointsAwarded: 0,
      noValidTarget: targetId === null,
    };
  }

  const target = player.dataCenters[targetId];
  const applied = Math.min(amount, target.health);
  target.health -= applied;

  if (target.health <= 0) {
    target.health = 0;
    target.destroyed = true;
    const vp =
      targetId === 'primary' ? config.primaryDestructionVP : config.backupDestructionVP;
    // Excess damage disappears rather than spilling to the other Data Center.
    return {
      applied,
      destroyedDataCenter: targetId,
      victoryPointsAwarded: vp,
      noValidTarget: false,
    };
  }

  return {
    applied,
    destroyedDataCenter: null,
    victoryPointsAwarded: 0,
    noValidTarget: false,
  };
}

export function healDataCenter(
  state: OuroborosState,
  player: PlayerID,
  amount: number,
  dataCenter?: DataCenterId,
): number {
  const target =
    state.players[player].dataCenters[dataCenter ?? 'primary'];
  if (target.destroyed || amount <= 0) return 0;
  const healed = Math.min(amount, target.maxHealth - target.health);
  target.health += healed;
  return healed;
}

/** A player loses when both of their Data Centers are destroyed. */
export function isEliminated(state: OuroborosState, player: PlayerID): boolean {
  const dcs = state.players[player].dataCenters;
  return dcs.primary.destroyed && dcs.backup.destroyed;
}
