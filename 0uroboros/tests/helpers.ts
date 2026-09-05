/**
 * Test helpers.
 *
 * Rules are tested independently from the visual client. These helpers build
 * deterministic states directly from the engine so tests never depend on React,
 * Three.js, or boardgame.io transport.
 */

import type { NodeIndex, OuroborosState, PlayerID } from '../src/game/types';
import { DEFAULT_CONFIG, type OuroborosConfig } from '../src/game/config/defaults';
import { createSeededRandom, type RandomAPI } from '../src/game/engine/random';
import { createInitialState } from '../src/game/engine/cycle';
import { createCardInstance, moveToNode } from '../src/game/engine/zones';
import { resetInstanceCounter } from '../src/game/engine/zones';

export interface TestHarness {
  state: OuroborosState;
  config: OuroborosConfig;
  random: RandomAPI;
}

export function createHarness(
  overrides: Partial<OuroborosConfig> = {},
  seed = 12345,
): TestHarness {
  resetInstanceCounter();
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const random = createSeededRandom(seed);
  const state = createInitialState('runtime', config, random);
  return { state, config, random };
}

/** Open a set of Nodes so cards placed there become reveal eligible. */
export function openNodes(state: OuroborosState, indices: NodeIndex[]): void {
  indices.forEach((index) => {
    state.nodes[index].state = 'open';
  });
}

/**
 * Place a card directly at a Node, bypassing hand and legality checks.
 * Returns the created instance id.
 */
export function placeCardAtNode(
  state: OuroborosState,
  player: PlayerID,
  cardDefId: string,
  nodeIndex: NodeIndex,
  options: { revealed?: boolean; playOrder?: number } = {},
): string {
  const card = createCardInstance(cardDefId, player, 'deck');
  state.cards[card.instanceId] = card;
  const playOrder = options.playOrder ?? state.players[player].nextPlayOrder;
  state.players[player].nextPlayOrder = Math.max(
    state.players[player].nextPlayOrder,
    playOrder + 1,
  );
  moveToNode(state, card, nodeIndex, playOrder);
  card.revealed = options.revealed ?? false;
  return card.instanceId;
}

/** Put a specific card definition into a player's hand. */
export function addToHand(
  state: OuroborosState,
  player: PlayerID,
  cardDefId: string,
): string {
  const card = createCardInstance(cardDefId, player, 'hand');
  state.cards[card.instanceId] = card;
  state.hands[player].push(card.instanceId);
  return card.instanceId;
}

/** Assign a specific Location to a Node. */
export function setLocation(
  state: OuroborosState,
  nodeIndex: NodeIndex,
  locationId: string | null,
): void {
  state.nodes[nodeIndex].locationId = locationId;
}

/** Clear all Locations so tests isolate card behavior. */
export function clearLocations(state: OuroborosState): void {
  state.nodes.forEach((node) => {
    node.locationId = null;
  });
}
