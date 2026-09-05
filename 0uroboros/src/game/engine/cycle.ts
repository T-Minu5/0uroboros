/**
 * Cycle lifecycle: setup, Location assignment, Start of Cycle, draw, cleanup,
 * Duration expiration, and Crypto processing at the Draft transition.
 */

import type {
  CardInstance,
  NodeStateData,
  OuroborosState,
  PlayerID,
  NodeIndex,
} from '../types';
import type { OuroborosConfig } from '../config/defaults';
import type { RandomAPI } from './random';
import { getCardDefinition, STARTING_DECK } from '../content/cards';
import { LOCATION_POOL } from '../content/locations';
import { CIRCUIT_REWARD_POOL } from '../content/circuitRewards';
import {
  createCardInstance,
  drawCards,
  moveToDiscard,
  tryEnterEffectBank,
  cardsAtNode,
} from './zones';
import { resolveOps, type EffectContext } from './effects';
import { resetProbabilities } from './probability';
import { createMarket, refreshChaos } from './draft';
import { addLog } from './log';

export function createInitialState(
  mode: OuroborosState['mode'],
  config: OuroborosConfig,
  random: RandomAPI,
): OuroborosState {
  const cards: Record<string, CardInstance> = {};
  const decks: Record<PlayerID, string[]> = { '0': [], '1': [] };

  // Both players begin with identical 10-card decks.
  for (const player of ['0', '1'] as PlayerID[]) {
    const deck = STARTING_DECK.map((cardDefId) =>
      createCardInstance(cardDefId, player, 'deck'),
    );
    deck.forEach((card) => {
      cards[card.instanceId] = card;
      decks[player].push(card.instanceId);
    });
  }

  const nodes: NodeStateData[] = config.baseProbabilities.map((probability, index) => ({
    index: index as NodeIndex,
    state: 'closed',
    locationId: null,
    locationSilenced: false,
    probability,
  }));

  const makePlayer = (id: PlayerID) => ({
    id,
    wallet: 0,
    victoryPoints: 0,
    dataCenters: {
      primary: {
        id: 'primary' as const,
        health: config.primaryDataCenterHealth,
        maxHealth: config.primaryDataCenterHealth,
        destroyed: false,
      },
      backup: {
        id: 'backup' as const,
        health: config.backupDataCenterHealth,
        maxHealth: config.backupDataCenterHealth,
        destroyed: false,
      },
    },
    nextPlayOrder: 0,
    endedTurn: false,
    endedDraft: false,
    lastPurchaseAt: {},
    conceded: false,
  });

  const state: OuroborosState = {
    mode,
    cycle: 1,
    turn: 0,
    windowsCompleted: 0,
    phase: 'matchSetup',
    cards,
    decks,
    hands: { '0': [], '1': [] },
    discards: { '0': [], '1': [] },
    trash: [],
    destroyed: [],
    effectBanks: {
      '0': new Array(config.effectBankSlots).fill(null),
      '1': new Array(config.effectBankSlots).fill(null),
    },
    nodes,
    players: { '0': makePlayer('0'), '1': makePlayer('1') },
    publicVictoryPoints: { '0': 0, '1': 0 },
    // Turn 1 reveal priority is random.
    revealPriority: random.int(2) === 0 ? '0' : '1',
    revealQueue: [],
    market: createMarket(config, random),
    collapseSelectedNode: null,
    pendingChoices: [],
    log: [],
    logSeq: 0,
    gameOverReason: null,
  };

  addLog(state, 'system', `Match setup complete. Player ${state.revealPriority} has reveal priority.`);
  return state;
}

/** Assign a Location to each Node for the Cycle. */
export function setupLocations(state: OuroborosState, random: RandomAPI): void {
  const picked = random.shuffle([...LOCATION_POOL]).slice(0, state.nodes.length);
  state.nodes.forEach((node, index) => {
    node.locationId = picked[index] ?? null;
    node.locationSilenced = false;
    node.state = 'closed';
  });
  addLog(state, 'phase', `Cycle ${state.cycle} Locations assigned.`);
}

/** Start of Cycle: reset probability and resolve Effect Bank start effects. */
export function startOfCycle(
  state: OuroborosState,
  config: OuroborosConfig,
  random: RandomAPI,
): void {
  resetProbabilities(state, config);
  state.collapseSelectedNode = null;
  state.revealQueue = [];

  for (const player of ['0', '1'] as PlayerID[]) {
    state.players[player].endedTurn = false;
    // Effect Bank effects resolve oldest to newest.
    for (const instanceId of state.effectBanks[player]) {
      if (!instanceId) continue;
      const card = state.cards[instanceId];
      if (!card) continue;
      for (const effect of getCardDefinition(card.cardDefId).effects) {
        if (effect.timing !== 'startOfCycle') continue;
        const ctx: EffectContext = {
          controller: card.controller,
          nodeIndex: null,
          sourceCard: card,
        };
        resolveOps(state, effect.ops, ctx, config, random);
      }
    }
  }
  addLog(state, 'phase', `Cycle ${state.cycle} start of Cycle effects resolved.`);
}

/** Draw the Cycle hand for both players. */
export function drawHands(
  state: OuroborosState,
  config: OuroborosConfig,
  random: RandomAPI,
): void {
  for (const player of ['0', '1'] as PlayerID[]) {
    drawCards(state, player, config.handDrawPerCycle, random);
  }
  addLog(state, 'phase', `Both players drew ${config.handDrawPerCycle} cards.`);
}

/**
 * Post-Collapse cleanup.
 *
 * Node cards move to Discard, eligible Duration cards enter Effect Banks in play
 * order with overflow going to Discard, End of Cycle effects and Duration
 * expiration resolve, then remaining hand cards are discarded.
 */
export function postCollapseCleanup(
  state: OuroborosState,
  config: OuroborosConfig,
  random: RandomAPI,
): void {
  // Duration cards attempt Effect Bank entry in original play order.
  const nodeCards: CardInstance[] = [];
  for (const node of state.nodes) {
    nodeCards.push(...cardsAtNode(state, node.index));
  }
  const inPlayOrder = [...nodeCards].sort((a, b) => (a.playOrder ?? 0) - (b.playOrder ?? 0));

  for (const card of inPlayOrder) {
    const def = getCardDefinition(card.cardDefId);
    if (def.duration && def.duration > 0) {
      // The deployment Cycle counts as Duration 1.
      if (def.duration === 1) {
        moveToDiscard(state, card);
        continue;
      }
      const entered = tryEnterEffectBank(state, card);
      if (entered) {
        card.durationRemaining = def.duration;
        addLog(state, 'phase', `${def.name} entered the Effect Bank.`);
        continue;
      }
      // All slots occupied, so the card goes to Discard.
      addLog(state, 'phase', `${def.name} could not enter a full Effect Bank.`);
      moveToDiscard(state, card);
      continue;
    }
    moveToDiscard(state, card);
  }

  // End of Cycle effects from Effect Bank cards, oldest to newest.
  for (const player of ['0', '1'] as PlayerID[]) {
    for (const instanceId of state.effectBanks[player]) {
      if (!instanceId) continue;
      const card = state.cards[instanceId];
      if (!card) continue;
      for (const effect of getCardDefinition(card.cardDefId).effects) {
        if (effect.timing !== 'endOfCycle') continue;
        const ctx: EffectContext = {
          controller: card.controller,
          nodeIndex: null,
          sourceCard: card,
        };
        resolveOps(state, effect.ops, ctx, config, random);
      }
    }
  }

  expireDurations(state, config);

  // Discard the cards remaining in hand, except Crypto. Crypto cards auto-play
  // at the Draft transition, so they are not yet "remaining in hand" here; they
  // are credited to the Wallet and then follow normal destination rules in
  // beginDraft. Discarding them here would silently delete Draft income.
  for (const player of ['0', '1'] as PlayerID[]) {
    const hand = [...state.hands[player]];
    hand.forEach((instanceId) => {
      const card = state.cards[instanceId];
      if (!card) return;
      if (getCardDefinition(card.cardDefId).kind === 'crypto') return;
      moveToDiscard(state, card);
    });
  }

  addLog(state, 'phase', 'Post-Collapse cleanup complete.');
}

/**
 * Count down Duration and remove expired cards.
 *
 * A Duration 2 card deployed in Cycle 4 is active during Cycles 4 and 5, then
 * leaves at End of Cycle 5. Duration 99 displays as infinity and never expires.
 */
export function expireDurations(state: OuroborosState, config: OuroborosConfig): void {
  for (const player of ['0', '1'] as PlayerID[]) {
    for (const instanceId of [...state.effectBanks[player]]) {
      if (!instanceId) continue;
      const card = state.cards[instanceId];
      if (!card || card.durationRemaining === null) continue;
      if (card.durationRemaining >= config.infiniteDurationValue) continue;

      card.durationRemaining -= 1;
      if (card.durationRemaining <= 0) {
        addLog(
          state,
          'phase',
          `${getCardDefinition(card.cardDefId).name} left the Effect Bank as its Duration ended.`,
        );
        moveToDiscard(state, card);
      }
    }
  }
}

/**
 * Draft transition.
 *
 * Crypto cards in hand auto-play, resolve applicable effects, contribute their
 * value to the Wallet, then follow normal destination rules. The Circuit Reward
 * slot is populated for eligible winners.
 */
export function beginDraft(
  state: OuroborosState,
  eligible: PlayerID[],
  config: OuroborosConfig,
  random: RandomAPI,
): void {
  for (const player of ['0', '1'] as PlayerID[]) {
    state.players[player].wallet = 0;
    state.players[player].endedDraft = false;
    state.players[player].lastPurchaseAt = {};

    const hand = [...state.hands[player]];
    for (const instanceId of hand) {
      const card = state.cards[instanceId];
      if (!card) continue;
      const def = getCardDefinition(card.cardDefId);
      if (def.kind !== 'crypto') continue;

      state.players[player].wallet += def.cryptoValue ?? 0;
      for (const effect of def.effects) {
        if (effect.timing !== 'onDraftStart') continue;
        const ctx: EffectContext = { controller: player, nodeIndex: null, sourceCard: card };
        resolveOps(state, effect.ops, ctx, config, random);
      }
      moveToDiscard(state, card);
    }
  }

  state.market.chaos = refreshChaos(config, random);
  const rewardId = CIRCUIT_REWARD_POOL[random.int(CIRCUIT_REWARD_POOL.length)] ?? null;
  state.market.circuitReward = { rewardId, eligible, claimed: [] };

  addLog(
    state,
    'draft',
    `Draft begins. Wallets: player 0 has ${state.players['0'].wallet}, player 1 has ${state.players['1'].wallet}.`,
  );
}

/** Advance to the next Cycle after Draft closes. */
export function beginNextCycle(state: OuroborosState): void {
  state.cycle += 1;
  state.turn = 0;
  state.windowsCompleted = 0;
  state.collapseSelectedNode = null;
  state.revealQueue = [];
  for (const player of ['0', '1'] as PlayerID[]) {
    state.players[player].nextPlayOrder = 0;
    state.players[player].endedTurn = false;
  }
  addLog(state, 'phase', `Cycle ${state.cycle} begins.`);
}
