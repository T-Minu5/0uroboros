/**
 * Zone movement, deck flow, Trash versus Destroyed, and Effect Bank capacity.
 */

import { describe, expect, it } from 'vitest';
import { addToHand, createHarness, placeCardAtNode } from './helpers';
import {
  cardsAtNode,
  drawCards,
  moveToDestroyed,
  moveToDiscard,
  moveToTrash,
  reshuffleDiscardIntoDeck,
  tryEnterEffectBank,
} from '../src/game/engine/zones';
import { totalVictoryPoints } from '../src/game/engine/scoring';
import { getCardDefinition } from '../src/game/content/cards';

describe('Starting decks', () => {
  it('gives both players identical 10-card decks', () => {
    const { state } = createHarness();
    expect(state.decks['0']).toHaveLength(10);
    expect(state.decks['1']).toHaveLength(10);

    const defs = (player: '0' | '1') =>
      state.decks[player].map((id) => state.cards[id].cardDefId).sort();
    expect(defs('0')).toEqual(defs('1'));
  });

  it('contains 4 Character, 4 Crypto, and 2 Victory Point cards', () => {
    const { state } = createHarness();
    const kinds = state.decks['0'].map((id) => getCardDefinition(state.cards[id].cardDefId).kind);
    expect(kinds.filter((kind) => kind === 'character')).toHaveLength(4);
    expect(kinds.filter((kind) => kind === 'crypto')).toHaveLength(4);
    expect(kinds.filter((kind) => kind === 'victoryPoint')).toHaveLength(2);
  });
});

describe('Drawing', () => {
  it('draws the requested number of cards', () => {
    const { state, random } = createHarness();
    const drawn = drawCards(state, '0', 5, random);
    expect(drawn).toHaveLength(5);
    expect(state.hands['0']).toHaveLength(5);
    expect(state.decks['0']).toHaveLength(5);
  });

  it('reshuffles the Discard pile when the Draw pile is exhausted', () => {
    const { state, random } = createHarness();
    // Cycle 1 draws 5, Cycle 2 draws the remaining 5.
    drawCards(state, '0', 10, random);
    expect(state.decks['0']).toHaveLength(0);

    // Discard the hand, then draw again to force a reshuffle.
    [...state.hands['0']].forEach((id) => moveToDiscard(state, state.cards[id]));
    expect(state.discards['0']).toHaveLength(10);

    const drawn = drawCards(state, '0', 3, random);
    expect(drawn).toHaveLength(3);
    expect(state.decks['0']).toHaveLength(7);
  });

  it('draws all available cards and stops when the request exceeds supply', () => {
    const { state, random } = createHarness();
    const drawn = drawCards(state, '0', 25, random);
    // Only the 10 starting cards exist, and nothing is in Discard to reshuffle.
    expect(drawn).toHaveLength(10);
    expect(state.decks['0']).toHaveLength(0);
    expect(state.discards['0']).toHaveLength(0);
  });

  it('includes newly acquired cards in a reshuffle', () => {
    const { state, random } = createHarness();
    drawCards(state, '0', 10, random);
    const acquired = addToHand(state, '0', 'monolith_core');
    moveToDiscard(state, state.cards[acquired]);

    reshuffleDiscardIntoDeck(state, '0', random);
    expect(state.decks['0']).toContain(acquired);
  });
});

describe('Trash versus Destroyed', () => {
  it('places trashed cards in the shared public Trash', () => {
    const { state } = createHarness();
    const id = placeCardAtNode(state, '0', 'cipher_runner', 0);
    moveToTrash(state, state.cards[id]);

    expect(state.trash).toContain(id);
    expect(state.cards[id].zone).toBe('trash');
    // Trash is shared, so a single list holds cards from both players.
    expect(state.destroyed).not.toContain(id);
  });

  it('places destroyed cards in the permanent Destroyed zone', () => {
    const { state } = createHarness();
    const id = placeCardAtNode(state, '0', 'cipher_runner', 0);
    moveToDestroyed(state, state.cards[id]);

    expect(state.destroyed).toContain(id);
    expect(state.cards[id].zone).toBe('destroyed');
  });

  it('stops counting Victory Points once a card is trashed or destroyed', () => {
    const { state } = createHarness();
    const id = addToHand(state, '0', 'gnostic_tablet');
    // Two starting Ledger sigils at 2 each, plus the 3-point tablet.
    expect(totalVictoryPoints(state, '0')).toBe(4 + 3);

    moveToTrash(state, state.cards[id]);
    expect(totalVictoryPoints(state, '0')).toBe(4);

    const second = addToHand(state, '0', 'gnostic_tablet');
    moveToDestroyed(state, state.cards[second]);
    expect(totalVictoryPoints(state, '0')).toBe(4);
  });

  it('supports negative Victory Point values', () => {
    const { state } = createHarness();
    addToHand(state, '0', 'cursed_ledger');
    // Two starting Ledger sigils at 2 each, Cursed ledger at -2.
    expect(totalVictoryPoints(state, '0')).toBe(4 - 2);
  });
});

describe('Effect Bank capacity', () => {
  it('fills the four configured slots then refuses further entry', () => {
    const { state, config } = createHarness();
    for (let i = 0; i < config.effectBankSlots; i += 1) {
      const id = placeCardAtNode(state, '0', 'serpent_loop', 0);
      expect(tryEnterEffectBank(state, state.cards[id])).toBe(true);
    }

    const overflow = placeCardAtNode(state, '0', 'serpent_loop', 1);
    expect(tryEnterEffectBank(state, state.cards[overflow])).toBe(false);
    expect(state.effectBanks['0'].filter(Boolean)).toHaveLength(config.effectBankSlots);
  });
});

describe('Node capacity tracking', () => {
  it('reports cards at a Node per controller', () => {
    const { state } = createHarness();
    placeCardAtNode(state, '0', 'cipher_runner', 2);
    placeCardAtNode(state, '0', 'cipher_runner', 2);
    placeCardAtNode(state, '1', 'cipher_runner', 2);

    expect(cardsAtNode(state, 2)).toHaveLength(3);
    expect(cardsAtNode(state, 2, '0')).toHaveLength(2);
    expect(cardsAtNode(state, 2, '1')).toHaveLength(1);
  });
});
