/**
 * Draft Phase.
 *
 * Both players draft simultaneously in real time. Purchase validation is atomic:
 * validate Wallet, validate supply, deduct Crypto, decrement supply, grant card,
 * or do none of it. Opponent purchases, Wallet values, and remaining shared
 * supply are public. Unspent non-material Wallet Crypto disappears at End of
 * Draft.
 */

import type {
  DraftMarket,
  MarketSlot,
  OuroborosState,
  PlayerID,
  AcquireDestination,
} from '../types';
import type { OuroborosConfig } from '../config/defaults';
import type { RandomAPI } from './random';
import { getCardDefinition, MARKET_POOLS } from '../content/cards';
import { getCircuitRewardDefinition } from '../content/circuitRewards';
import { createCardInstance, placeAcquiredCard } from './zones';
import { resolveOps, type EffectContext } from './effects';
import { addLog } from './log';

export type PurchaseFailure =
  | 'unknownSlot'
  | 'supplyExhausted'
  | 'insufficientCrypto'
  | 'cooldown'
  | 'notEligible'
  | 'alreadyClaimed';

export type PurchaseResult =
  | { ok: true; instanceId: string; cost: number }
  | { ok: false; reason: PurchaseFailure };

export type MarketCategory = 'base' | 'victoryPoint' | 'crypto' | 'chaos';

/**
 * Build the persistent market at match setup.
 * Base, Victory Point, and Crypto piles persist for the entire match and never
 * replenish. Chaos refreshes every Draft with independent per-player supply.
 */
export function createMarket(config: OuroborosConfig, random: RandomAPI): DraftMarket {
  const pick = (pool: readonly string[], count: number): string[] =>
    random.shuffle([...pool]).slice(0, count);

  const sharedSlot = (cardDefId: string, supply: number): MarketSlot => ({
    cardDefId,
    supply,
  });

  return {
    base: pick(MARKET_POOLS.base, config.baseMarketSlots).map((id) =>
      sharedSlot(id, config.baseSharedSupply),
    ),
    victoryPoint: pick(MARKET_POOLS.victoryPoint, config.victoryPointMarketSlots).map((id) =>
      sharedSlot(id, config.victoryPointSharedSupply),
    ),
    crypto: pick(MARKET_POOLS.crypto, config.cryptoMarketSlots).map((id) =>
      sharedSlot(id, config.cryptoSharedSupply),
    ),
    chaos: refreshChaos(config, random),
    circuitReward: { rewardId: null, eligible: [], claimed: [] },
  };
}

/** Chaos availability refreshes every Draft and is independent per player. */
export function refreshChaos(config: OuroborosConfig, random: RandomAPI): MarketSlot[] {
  return random
    .shuffle([...MARKET_POOLS.chaos])
    .slice(0, config.chaosSlots)
    .map((cardDefId) => ({
      cardDefId,
      supply: null,
      perPlayerSupply: {
        '0': config.chaosPerPlayerSupply,
        '1': config.chaosPerPlayerSupply,
      },
    }));
}

function slotsFor(market: DraftMarket, category: MarketCategory): MarketSlot[] {
  return market[category];
}

/** Remaining supply visible to a specific player. */
export function availableSupply(slot: MarketSlot, player: PlayerID): number {
  if (slot.supply !== null) return slot.supply;
  return slot.perPlayerSupply?.[player] ?? 0;
}

/**
 * Attempt an atomic purchase.
 *
 * The caller supplies `now` so purchase ordering and cooldown never depend on
 * client timestamps.
 */
export function purchase(
  state: OuroborosState,
  player: PlayerID,
  category: MarketCategory,
  slotIndex: number,
  config: OuroborosConfig,
  random: RandomAPI,
  now: number,
): PurchaseResult {
  const slot = slotsFor(state.market, category)[slotIndex];
  if (!slot) return { ok: false, reason: 'unknownSlot' };

  const playerState = state.players[player];
  const def = getCardDefinition(slot.cardDefId);
  const cost = Math.max(0, def.cost);

  // Repeat-purchase cooldown applies only to the same card by the same player.
  const lastAt = playerState.lastPurchaseAt[slot.cardDefId];
  if (lastAt !== undefined && now - lastAt < config.repeatPurchaseCooldownMs) {
    return { ok: false, reason: 'cooldown' };
  }

  if (availableSupply(slot, player) <= 0) return { ok: false, reason: 'supplyExhausted' };
  if (playerState.wallet < cost) return { ok: false, reason: 'insufficientCrypto' };

  // Commit: all mutations happen together after every check has passed.
  playerState.wallet -= cost;
  if (slot.supply !== null) slot.supply -= 1;
  else if (slot.perPlayerSupply) slot.perPlayerSupply[player] -= 1;
  playerState.lastPurchaseAt[slot.cardDefId] = now;

  const card = createCardInstance(slot.cardDefId, player, 'discard');
  const destination: AcquireDestination = 'discard';
  placeAcquiredCard(state, card, destination, random);

  // onAcquire effects resolve immediately after the card is granted.
  for (const effect of def.effects) {
    if (effect.timing !== 'onAcquire') continue;
    const ctx: EffectContext = { controller: player, nodeIndex: null, sourceCard: card };
    resolveOps(state, effect.ops, ctx, config, random);
  }

  addLog(state, 'draft', `Player ${player} acquired ${def.name} for ${cost} Crypto.`);
  return { ok: true, instanceId: card.instanceId, cost };
}

/**
 * Claim the Circuit Reward.
 * Only eligible winners may claim, and each eligible player gets one instance.
 */
export function claimCircuitReward(
  state: OuroborosState,
  player: PlayerID,
  config: OuroborosConfig,
  random: RandomAPI,
): PurchaseResult {
  const slot = state.market.circuitReward;
  if (!slot.rewardId) return { ok: false, reason: 'unknownSlot' };
  if (!slot.eligible.includes(player)) return { ok: false, reason: 'notEligible' };
  if (slot.claimed.includes(player)) return { ok: false, reason: 'alreadyClaimed' };

  const reward = getCircuitRewardDefinition(slot.rewardId);
  slot.claimed.push(player);

  for (const effect of reward.effects) {
    if (effect.timing !== 'onAcquire') continue;
    const ctx: EffectContext = { controller: player, nodeIndex: null, sourceCard: null };
    resolveOps(state, effect.ops, ctx, config, random);
  }

  addLog(state, 'draft', `Player ${player} claimed the Circuit Reward: ${reward.name}.`);
  return { ok: true, instanceId: slot.rewardId, cost: 0 };
}

/** Whether a player still has any legal Draft action, used for Undo End Draft. */
export function hasLegalDraftAction(
  state: OuroborosState,
  player: PlayerID,
): boolean {
  const wallet = state.players[player].wallet;
  const categories: MarketCategory[] = ['base', 'victoryPoint', 'crypto', 'chaos'];
  for (const category of categories) {
    for (const slot of slotsFor(state.market, category)) {
      if (availableSupply(slot, player) <= 0) continue;
      if (getCardDefinition(slot.cardDefId).cost <= wallet) return true;
    }
  }
  const reward = state.market.circuitReward;
  if (reward.rewardId && reward.eligible.includes(player) && !reward.claimed.includes(player)) {
    return true;
  }
  return false;
}

/** Unspent non-material Wallet Crypto disappears at End of Draft. */
export function endDraft(state: OuroborosState): void {
  for (const player of ['0', '1'] as PlayerID[]) {
    state.players[player].wallet = 0;
    state.players[player].endedDraft = false;
    state.players[player].lastPurchaseAt = {};
  }
  state.market.circuitReward = { rewardId: null, eligible: [], claimed: [] };
}
