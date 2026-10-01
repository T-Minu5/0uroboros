/**
 * Configurable playtest values.
 *
 * Every number here is a default, not a structural constant. Balance and pacing
 * changes must be possible by editing this file alone.
 * Source: 05_TECHNICAL_REQUIREMENTS.md section 18.
 */

export interface OuroborosConfig {
  runtimeTurnTimerSeconds: number;
  shortCircuitDeployTimerSeconds: number;
  draftTimerSeconds: number;
  cycleLimit: number;
  baseMarketSlots: number;
  baseSharedSupply: number;
  chaosSlots: number;
  chaosPerPlayerSupply: number;
  victoryPointMarketSlots: number;
  victoryPointSharedSupply: number;
  cryptoMarketSlots: number;
  cryptoSharedSupply: number;
  effectBankSlots: number;
  repeatPurchaseCooldownMs: number;
  reconnectGraceSeconds: number;
  afkTimerMultiplier: number;
  afkAutoConcedeTurns: number;
  probabilityIncrement: number;
  primaryDataCenterHealth: number;
  backupDataCenterHealth: number;
  primaryDestructionVP: number;
  backupDestructionVP: number;
  /** Node count and starting distribution. Must sum to 100. */
  nodeCount: number;
  baseProbabilities: number[];
  /**
   * Nodes (0-indexed) that open at the start of each Runtime deployment window.
   * Length is the number of windows in a Cycle. Short-Circuit ignores this and
   * opens every Node at once.
   */
  nodeOpenSchedule: number[][];
  /** Maximum cards one player may place at a single Node. */
  nodeCapacityPerPlayer: number;
  /** Cards drawn at the start of each Cycle. */
  handDrawPerCycle: number;
  /** Whether Chaos offerings may repeat in consecutive Drafts. */
  allowChaosRepeats: boolean;
  /** Duration value displayed as infinity and never naturally expiring. */
  infiniteDurationValue: number;
  /** Unused Actions persist into the next Runtime turn. Never between Cycles. */
  actionCarryoverBetweenTurns: boolean;
  /** Action grants per Runtime turn index. RULE-ACTION-001. */
  runtimeTurnActionGrants: number[];
}

export const DEFAULT_CONFIG: OuroborosConfig = {
  runtimeTurnTimerSeconds: 60,
  shortCircuitDeployTimerSeconds: 120,
  draftTimerSeconds: 90,
  cycleLimit: 16,
  baseMarketSlots: 9,
  baseSharedSupply: 8,
  chaosSlots: 3,
  chaosPerPlayerSupply: 2,
  victoryPointMarketSlots: 3,
  victoryPointSharedSupply: 8,
  cryptoMarketSlots: 3,
  cryptoSharedSupply: 16,
  effectBankSlots: 4,
  repeatPurchaseCooldownMs: 2000,
  reconnectGraceSeconds: 20,
  afkTimerMultiplier: 1.25,
  afkAutoConcedeTurns: 2,
  probabilityIncrement: 0.5,
  primaryDataCenterHealth: 2000,
  backupDataCenterHealth: 1500,
  primaryDestructionVP: 8,
  backupDestructionVP: 12,
  nodeCount: 5,
  baseProbabilities: [30, 25, 20, 15, 10],
  // Nodes 1–3 open on turn 1, Node 4 on turn 2, Node 5 on turn 3.
  nodeOpenSchedule: [[0, 1, 2], [3], [4]],
  nodeCapacityPerPlayer: 4,
  handDrawPerCycle: 5,
  allowChaosRepeats: true,
  infiniteDurationValue: 99,
  actionCarryoverBetweenTurns: false,
  runtimeTurnActionGrants: [2, 1, 1],
};

/** Short Cycle limit for fast smoke playtests. */
export const SMOKE_TEST_CONFIG: OuroborosConfig = {
  ...DEFAULT_CONFIG,
  cycleLimit: 3,
};

/** Deployment windows in a Runtime Cycle. Short-Circuit is always one window. */
export function circuitWindowCount(config: OuroborosConfig): number {
  return config.nodeOpenSchedule.length;
}

/** Phrase for the Node-opening announcement, e.g. "Nodes 1–3 open". */
export function nodeOpenPhrase(indices: number[]): string {
  const labels = [...indices].sort((a, b) => a - b).map((index) => index + 1);
  if (labels.length === 0) return 'No Node opens';
  if (labels.length === 1) return `Node ${labels[0]} opens`;
  if (labels.length === 2) return `Nodes ${labels[0]} and ${labels[1]} open`;
  const consecutive = labels.every((value, i) => i === 0 || value === labels[i - 1] + 1);
  if (consecutive) return `Nodes ${labels[0]}–${labels[labels.length - 1]} open`;
  return `Nodes ${labels.join(', ')} open`;
}
