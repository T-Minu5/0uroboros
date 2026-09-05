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
  /** Maximum cards one player may place at a single Node. */
  nodeCapacityPerPlayer: number;
  /** Cards drawn at the start of each Cycle. */
  handDrawPerCycle: number;
  /** Whether Chaos offerings may repeat in consecutive Drafts. */
  allowChaosRepeats: boolean;
  /** Duration value displayed as infinity and never naturally expiring. */
  infiniteDurationValue: number;
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
  nodeCapacityPerPlayer: 4,
  handDrawPerCycle: 5,
  allowChaosRepeats: true,
  infiniteDurationValue: 99,
};

/** Short Cycle limit for fast smoke playtests. */
export const SMOKE_TEST_CONFIG: OuroborosConfig = {
  ...DEFAULT_CONFIG,
  cycleLimit: 3,
};
