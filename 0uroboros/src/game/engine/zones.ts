/**
 * Zone movement and deck flow.
 *
 * All card movement funnels through this module so zone invariants stay in one
 * place. Trash is shared, public, and recoverable. Destroyed is permanent and
 * contributes no Victory Points.
 */

import type {
  CardInstance,
  NodeIndex,
  OuroborosState,
  PlayerID,
  AcquireDestination,
} from '../types';
import { getCardDefinition } from '../content/cards';
import type { RandomAPI } from './random';

let instanceCounter = 0;

/** Deterministic instance id generation. Reset between tests. */
export function resetInstanceCounter(): void {
  instanceCounter = 0;
}

export function createCardInstance(
  cardDefId: string,
  owner: PlayerID,
  zone: CardInstance['zone'],
): CardInstance {
  instanceCounter += 1;
  const def = getCardDefinition(cardDefId);
  return {
    instanceId: `c${instanceCounter}_${cardDefId}`,
    cardDefId,
    owner,
    controller: owner,
    zone,
    nodeIndex: null,
    bankSlot: null,
    playOrder: null,
    revealed: false,
    powerMods: 0,
    durationRemaining: def.duration ?? null,
  };
}

function removeFromCurrentZone(state: OuroborosState, card: CardInstance): void {
  const { owner, instanceId } = card;
  switch (card.zone) {
    case 'deck':
      state.decks[owner] = state.decks[owner].filter((id) => id !== instanceId);
      break;
    case 'hand':
      state.hands[owner] = state.hands[owner].filter((id) => id !== instanceId);
      break;
    case 'discard':
      state.discards[owner] = state.discards[owner].filter((id) => id !== instanceId);
      break;
    case 'trash':
      state.trash = state.trash.filter((id) => id !== instanceId);
      break;
    case 'destroyed':
      state.destroyed = state.destroyed.filter((id) => id !== instanceId);
      break;
    case 'effectBank': {
      const bank = state.effectBanks[owner];
      const slot = bank.indexOf(instanceId);
      if (slot >= 0) bank[slot] = null;
      break;
    }
    case 'node':
      // Node membership is derived from card.zone and card.nodeIndex, so no
      // separate list needs pruning.
      break;
  }
}

export function moveToHand(state: OuroborosState, card: CardInstance): void {
  removeFromCurrentZone(state, card);
  card.zone = 'hand';
  card.nodeIndex = null;
  card.bankSlot = null;
  state.hands[card.owner].push(card.instanceId);
}

export function moveToDiscard(state: OuroborosState, card: CardInstance): void {
  removeFromCurrentZone(state, card);
  card.zone = 'discard';
  card.nodeIndex = null;
  card.bankSlot = null;
  card.playOrder = null;
  card.powerMods = 0;
  card.revealed = false;
  const def = getCardDefinition(card.cardDefId);
  card.durationRemaining = def.duration ?? null;
  state.discards[card.owner].push(card.instanceId);
}

/** Trash is shared, public, and recoverable through effects. */
export function moveToTrash(state: OuroborosState, card: CardInstance): void {
  removeFromCurrentZone(state, card);
  card.zone = 'trash';
  card.nodeIndex = null;
  card.bankSlot = null;
  card.playOrder = null;
  card.powerMods = 0;
  state.trash.push(card.instanceId);
}

/** Destroyed is permanent. Destroyed cards cannot return and grant no Victory Points. */
export function moveToDestroyed(state: OuroborosState, card: CardInstance): void {
  removeFromCurrentZone(state, card);
  card.zone = 'destroyed';
  card.nodeIndex = null;
  card.bankSlot = null;
  card.playOrder = null;
  card.powerMods = 0;
  state.destroyed.push(card.instanceId);
}

export function moveToNode(
  state: OuroborosState,
  card: CardInstance,
  nodeIndex: NodeIndex,
  playOrder: number,
): void {
  removeFromCurrentZone(state, card);
  card.zone = 'node';
  card.nodeIndex = nodeIndex;
  card.bankSlot = null;
  card.playOrder = playOrder;
}

/**
 * Attempt to place a Duration card into the owner's Effect Bank.
 * Returns false when all slots are occupied, in which case the caller sends the
 * card to Discard unless card text overrides.
 */
export function tryEnterEffectBank(state: OuroborosState, card: CardInstance): boolean {
  const bank = state.effectBanks[card.owner];
  const slot = bank.indexOf(null);
  if (slot === -1) return false;
  removeFromCurrentZone(state, card);
  card.zone = 'effectBank';
  card.nodeIndex = null;
  card.bankSlot = slot;
  bank[slot] = card.instanceId;
  return true;
}

/** All cards currently at a Node, optionally filtered to one controller. */
export function cardsAtNode(
  state: OuroborosState,
  nodeIndex: NodeIndex,
  controller?: PlayerID,
): CardInstance[] {
  return Object.values(state.cards).filter(
    (card) =>
      card.zone === 'node' &&
      card.nodeIndex === nodeIndex &&
      (controller === undefined || card.controller === controller),
  );
}

/**
 * Draw cards for a player.
 *
 * When the Draw pile is exhausted, reshuffle the Discard pile, including newly
 * acquired cards, and continue. If a draw requests more cards than exist across
 * Draw and reshufflable Discard, draw all available cards and stop.
 */
export function drawCards(
  state: OuroborosState,
  player: PlayerID,
  count: number,
  random: RandomAPI,
): string[] {
  const drawn: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (state.decks[player].length === 0) {
      if (state.discards[player].length === 0) break;
      reshuffleDiscardIntoDeck(state, player, random);
    }
    const instanceId = state.decks[player].shift();
    if (!instanceId) break;
    const card = state.cards[instanceId];
    card.zone = 'hand';
    state.hands[player].push(instanceId);
    drawn.push(instanceId);
  }
  return drawn;
}

export function reshuffleDiscardIntoDeck(
  state: OuroborosState,
  player: PlayerID,
  random: RandomAPI,
): void {
  const shuffled = random.shuffle([...state.discards[player]]);
  state.discards[player] = [];
  for (const instanceId of shuffled) {
    state.cards[instanceId].zone = 'deck';
    state.decks[player].push(instanceId);
  }
}

/** Place a newly granted or acquired card at its destination zone. */
export function placeAcquiredCard(
  state: OuroborosState,
  card: CardInstance,
  destination: AcquireDestination,
  random: RandomAPI,
): void {
  state.cards[card.instanceId] = card;
  switch (destination) {
    case 'discard':
      card.zone = 'discard';
      state.discards[card.owner].push(card.instanceId);
      break;
    case 'hand':
      card.zone = 'hand';
      state.hands[card.owner].push(card.instanceId);
      break;
    case 'deckTop':
      card.zone = 'deck';
      state.decks[card.owner].unshift(card.instanceId);
      break;
    case 'deckBottom':
      card.zone = 'deck';
      state.decks[card.owner].push(card.instanceId);
      break;
    case 'deckRandom': {
      card.zone = 'deck';
      const deck = state.decks[card.owner];
      const index = random.int(deck.length + 1);
      deck.splice(index, 0, card.instanceId);
      break;
    }
  }
}
