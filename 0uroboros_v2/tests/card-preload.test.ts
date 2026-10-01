import { describe, expect, it } from 'vitest';
import type { Card } from '../src/game';
import { cardsInPlay } from '../src/cardPreload';

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, definitionId: id, name: id, type: 'Character', cost: 1, art: `/art/${id}.png`, effect: '', ...extra });

describe('cards in play', () => {
  const catalog = [
    card('larva', { recurring: [{ kind: 'morph', formIds: ['pupa'] }] }),
    card('pupa', { recurring: [{ kind: 'morph', formIds: ['moth'] }] }),
    card('moth'),
    card('blade'),
    card('reward-source', { onReveal: [{ kind: 'gain', cardId: 'blade' }] }),
    card('unused'),
  ] as Card[];

  it('finds cards anywhere in the view, once per definition, and skips face-down placeholders', () => {
    const view = { hand: [{ ...card('moth'), id: '0:moth-1' }, { ...card('moth'), id: '0:moth-2' }], draw: [{ id: 'hidden-0', hidden: true }] };
    expect(cardsInPlay(view, catalog).map(found => found.definitionId)).toEqual(['moth']);
  });

  it('follows morph forms and gained cards through the catalog', () => {
    const view = { nodes: [{ cards: [[{ card: { ...catalog[0], id: '1:larva' } }]] }], reward: { effects: [{ kind: 'gain', cardId: 'reward-source' }] } };
    expect(cardsInPlay(view, catalog).map(found => found.definitionId).sort()).toEqual(['blade', 'larva', 'moth', 'pupa', 'reward-source']);
  });
});
