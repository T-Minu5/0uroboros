/**
 * Victory Point calculation.
 *
 * Victory Points are maintained in real time. Cards in active zones contribute
 * their printed value. Trashed and Destroyed cards contribute nothing, so the
 * displayed score updates immediately when a Victory Point card leaves play.
 */

import type { OuroborosState, PlayerID } from '../types';
import { CARD_DEFINITIONS } from '../content/cards';

/** Zones where a card still contributes Victory Points. */
const SCORING_ZONES = new Set(['deck', 'hand', 'discard', 'node', 'effectBank']);

/**
 * Total Victory Points for a player: accumulated awards plus static card values
 * from cards in active zones.
 *
 * Cards whose identity has been redacted contribute nothing here, because a
 * client cannot see them. Victory Point totals are public, so `playerView`
 * publishes the authoritative totals and the client reads those instead of
 * recomputing from a filtered card list.
 */
export function totalVictoryPoints(state: OuroborosState, player: PlayerID): number {
  const fromCards = Object.values(state.cards).reduce((sum, card) => {
    if (card.owner !== player) return sum;
    if (!SCORING_ZONES.has(card.zone)) return sum;
    const def = CARD_DEFINITIONS[card.cardDefId];
    return sum + (def?.victoryPoints ?? 0);
  }, 0);
  return state.players[player].victoryPoints + fromCards;
}

export type MatchResult =
  | { outcome: 'win'; winner: PlayerID; loser: PlayerID; reason: string }
  | { outcome: 'tie'; reason: string };

/** Compare final Victory Points. Equal totals are a tie with no tiebreaker. */
export function finalResult(state: OuroborosState, reason: string): MatchResult {
  const v0 = totalVictoryPoints(state, '0');
  const v1 = totalVictoryPoints(state, '1');
  if (v0 > v1) return { outcome: 'win', winner: '0', loser: '1', reason };
  if (v1 > v0) return { outcome: 'win', winner: '1', loser: '0', reason };
  return { outcome: 'tie', reason };
}
