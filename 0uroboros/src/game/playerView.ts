/**
 * Information visibility boundary.
 *
 * This is a server guarantee, not a rendering convention. Private data is
 * stripped before state reaches a client.
 *
 * Public: revealed cards, Node Power totals, probability distribution, Effect
 * Banks, Victory Point totals, Wallet balances, Draft market supply, Draft
 * purchases and log, shared Trash contents.
 *
 * Private: hand contents, face-down card identity, Draw pile order and contents,
 * Discard pile contents.
 */

import type { CardInstance, OuroborosState, PlayerID } from './types';
import { totalVictoryPoints } from './engine/scoring';

/** Identity-stripped placeholder for a card the viewer may not inspect. */
function redact(card: CardInstance): CardInstance {
  return {
    ...card,
    cardDefId: 'hidden',
    powerMods: 0,
    durationRemaining: null,
  };
}

/**
 * Strip private information for a specific viewer.
 * `playerID` is null for spectators, who see only public state.
 */
export function playerView(
  state: OuroborosState,
  playerID: string | null,
): OuroborosState {
  const viewer = playerID as PlayerID | null;

  const cards: Record<string, CardInstance> = {};
  for (const [instanceId, card] of Object.entries(state.cards)) {
    const isOwn = viewer !== null && card.owner === viewer;

    // Public zones are always fully visible.
    if (card.zone === 'trash' || card.zone === 'destroyed' || card.zone === 'effectBank') {
      cards[instanceId] = card;
      continue;
    }
    // Revealed cards at Nodes are public.
    if (card.zone === 'node' && card.revealed) {
      cards[instanceId] = card;
      continue;
    }
    // A player sees their own hand and their own face-down commitments.
    if (isOwn) {
      cards[instanceId] = card;
      continue;
    }
    // Everything else is hidden: opponent hand, face-down cards, deck, discard.
    cards[instanceId] = redact(card);
  }

  return {
    ...state,
    cards,
    // Computed from the unfiltered state, because the totals are public even
    // when the cards producing them are not.
    publicVictoryPoints: {
      '0': totalVictoryPoints(state, '0'),
      '1': totalVictoryPoints(state, '1'),
    },
    // Deck order is private. Length is preserved so counts can be displayed.
    decks: {
      '0': viewer === '0' ? state.decks['0'] : state.decks['0'].map(() => 'hidden'),
      '1': viewer === '1' ? state.decks['1'] : state.decks['1'].map(() => 'hidden'),
    },
    hands: {
      '0': viewer === '0' ? state.hands['0'] : state.hands['0'].map(() => 'hidden'),
      '1': viewer === '1' ? state.hands['1'] : state.hands['1'].map(() => 'hidden'),
    },
    discards: {
      '0': viewer === '0' ? state.discards['0'] : state.discards['0'].map(() => 'hidden'),
      '1': viewer === '1' ? state.discards['1'] : state.discards['1'].map(() => 'hidden'),
    },
    // Pending choices belong to their owner only.
    pendingChoices: state.pendingChoices.filter((choice) => choice.player === viewer),
  };
}
