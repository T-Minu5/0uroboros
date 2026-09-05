/**
 * Derived view data.
 *
 * The UI reads game state through these selectors so no component encodes a
 * rule. Everything here delegates to the engine and only shapes the result for
 * presentation.
 */

import type {
  CardDefinition,
  CardInstance,
  NodeIndex,
  OuroborosState,
  PlayerID,
} from '../game/types';
import { CARD_DEFINITIONS } from '../game/content/cards';
import { LOCATION_DEFINITIONS } from '../game/content/locations';
import { getActiveConfig } from '../game/OuroborosGame';
import { cardPower } from '../game/engine/power';
import { legalNodesFor } from '../game/engine/deploy';
import { totalVictoryPoints } from '../game/engine/scoring';
import { availableSupply, type MarketCategory } from '../game/engine/draft';

/** Placeholder definition used for cards the viewer may not inspect. */
export const HIDDEN_CARD: CardDefinition = {
  id: 'hidden',
  name: 'Unknown',
  kind: 'character',
  power: 0,
  cost: 0,
  deployable: false,
  effects: [],
};

export function definitionOf(card: CardInstance | undefined): CardDefinition {
  if (!card) return HIDDEN_CARD;
  return CARD_DEFINITIONS[card.cardDefId] ?? HIDDEN_CARD;
}

export function isHidden(card: CardInstance | undefined): boolean {
  return !card || card.cardDefId === 'hidden';
}

export function opponentOf(player: PlayerID): PlayerID {
  return player === '0' ? '1' : '0';
}

export interface HandCardView {
  card: CardInstance;
  definition: CardDefinition;
  /** Nodes this card may legally be deployed to right now. */
  legalNodes: NodeIndex[];
  /** Why the card cannot be played, for an explicit unplayable state. */
  blockedReason: string | null;
}

export function handView(
  G: OuroborosState,
  player: PlayerID,
  windowOpen: boolean,
): HandCardView[] {
  const config = getActiveConfig();
  return G.hands[player]
    .map((instanceId) => G.cards[instanceId])
    .filter((card): card is CardInstance => Boolean(card))
    .map((card) => {
      const definition = definitionOf(card);
      const legalNodes = definition.deployable
        ? legalNodesFor(G, player, card.instanceId, config)
        : [];

      let blockedReason: string | null = null;
      if (!definition.deployable) blockedReason = 'Not played at Nodes';
      else if (!windowOpen) blockedReason = 'Window closed';
      else if (legalNodes.length === 0) blockedReason = 'No legal Node';

      return { card, definition, legalNodes, blockedReason };
    });
}

export interface NodeView {
  index: NodeIndex;
  state: OuroborosState['nodes'][number]['state'];
  locationName: string;
  locationText: string;
  probability: number;
  selfPower: number;
  rivalPower: number;
  /** 'self', 'rival', or null for a tie. */
  leader: 'self' | 'rival' | null;
  selfCards: CardInstance[];
  rivalCards: CardInstance[];
  selfAtCapacity: boolean;
  isCollapseSelection: boolean;
}

export function nodeViews(
  G: OuroborosState,
  viewer: PlayerID,
  options: {
    isRevealed?: (card: CardInstance) => boolean;
    powerOf?: (card: CardInstance) => number;
  } = {},
): NodeView[] {
  const config = getActiveConfig();
  const rival = opponentOf(viewer);
  const isRevealed = options.isRevealed ?? ((card: CardInstance) => card.revealed);
  const powerOf = options.powerOf ?? cardPowerOf;

  return G.nodes.map((node) => {
    const location = node.locationId ? LOCATION_DEFINITIONS[node.locationId] : undefined;
    const selfCards = cardsAt(G, node.index, viewer);
    const rivalCards = cardsAt(G, node.index, rival);
    const selfPower = selfCards.filter(isRevealed).reduce((total, card) => total + powerOf(card), 0);
    const rivalPower = rivalCards.filter(isRevealed).reduce((total, card) => total + powerOf(card), 0);

    return {
      index: node.index,
      state: node.state,
      locationName: location?.name ?? 'Unassigned',
      locationText: location?.text ?? '',
      probability: node.probability,
      selfPower,
      rivalPower,
      leader: selfPower === rivalPower ? null : selfPower > rivalPower ? 'self' : 'rival',
      selfCards,
      rivalCards,
      selfAtCapacity: selfCards.length >= config.nodeCapacityPerPlayer,
      isCollapseSelection: G.collapseSelectedNode === node.index,
    };
  });
}

function cardsAt(G: OuroborosState, index: NodeIndex, controller: PlayerID): CardInstance[] {
  return Object.values(G.cards)
    .filter(
      (card) =>
        card.zone === 'node' && card.nodeIndex === index && card.controller === controller,
    )
    .sort((a, b) => (a.playOrder ?? 0) - (b.playOrder ?? 0));
}

export interface StatusView {
  player: PlayerID;
  victoryPoints: number;
  wallet: number;
  hasRevealPriority: boolean;
  endedTurn: boolean;
  endedDraft: boolean;
  deckCount: number;
  handCount: number;
  discardCount: number;
  dataCenters: Array<{
    id: 'primary' | 'backup';
    label: string;
    health: number;
    maxHealth: number;
    destroyed: boolean;
  }>;
}

export function statusView(G: OuroborosState, player: PlayerID): StatusView {
  const p = G.players[player];
  return {
    player,
    // Prefer the published total, which accounts for cards this seat cannot see.
    victoryPoints: G.publicVictoryPoints?.[player] ?? totalVictoryPoints(G, player),
    wallet: p.wallet,
    hasRevealPriority: G.revealPriority === player,
    endedTurn: p.endedTurn,
    endedDraft: p.endedDraft,
    deckCount: G.decks[player].length,
    handCount: G.hands[player].length,
    discardCount: G.discards[player].length,
    dataCenters: [
      { id: 'primary', label: 'Primary DC', ...pick(p.dataCenters.primary) },
      { id: 'backup', label: 'Backup DC', ...pick(p.dataCenters.backup) },
    ],
  };
}

function pick(dc: { health: number; maxHealth: number; destroyed: boolean }) {
  return { health: dc.health, maxHealth: dc.maxHealth, destroyed: dc.destroyed };
}

export interface BankSlotView {
  slot: number;
  card: CardInstance | null;
  definition: CardDefinition | null;
  durationLabel: string | null;
}

export function bankView(G: OuroborosState, player: PlayerID): BankSlotView[] {
  const config = getActiveConfig();
  return G.effectBanks[player].map((instanceId, slot) => {
    const card = instanceId ? (G.cards[instanceId] ?? null) : null;
    if (!card) return { slot, card: null, definition: null, durationLabel: null };

    const remaining = card.durationRemaining;
    const durationLabel =
      remaining === null
        ? null
        : remaining >= config.infiniteDurationValue
          ? '\u221e'
          : String(remaining);
    return { slot, card, definition: definitionOf(card), durationLabel };
  });
}

export interface MarketSlotView {
  category: MarketCategory;
  slotIndex: number;
  definition: CardDefinition;
  supply: number;
  affordable: boolean;
  blockedReason: string | null;
}

const CATEGORIES: MarketCategory[] = ['base', 'victoryPoint', 'crypto', 'chaos'];

export function marketView(G: OuroborosState, player: PlayerID): MarketSlotView[] {
  const wallet = G.players[player].wallet;
  const views: MarketSlotView[] = [];

  for (const category of CATEGORIES) {
    G.market[category].forEach((slot, slotIndex) => {
      const definition = CARD_DEFINITIONS[slot.cardDefId] ?? HIDDEN_CARD;
      const supply = availableSupply(slot, player);
      const affordable = definition.cost <= wallet;

      views.push({
        category,
        slotIndex,
        definition,
        supply,
        affordable,
        blockedReason: supply <= 0 ? 'Sold out' : affordable ? null : 'Not enough Crypto',
      });
    });
  }
  return views;
}

export const CATEGORY_LABELS: Record<MarketCategory, string> = {
  base: 'Base offerings',
  victoryPoint: 'Victory Point offerings',
  crypto: 'Crypto offerings',
  chaos: 'Chaos offerings',
};

/** Human-readable names for the documented fine-grained states. */
const PHASE_LABELS: Record<string, string> = {
  matchSetup: 'Match setup',
  locationSetup: 'Location setup',
  startCycleEffects: 'Start of Cycle',
  drawHand: 'Draw',
  circuitDeploy: 'Deploy',
  shortCircuitDeploy: 'Short-Circuit deploy',
  reveal: 'Reveal',
  waveCollapse: 'Wave Collapse',
  cleanup: 'End of Cycle',
  draft: 'Draft',
  endgame: 'Endgame',
};

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

export function cardPowerOf(card: CardInstance): number {
  return isHidden(card) ? 0 : cardPower(card);
}
