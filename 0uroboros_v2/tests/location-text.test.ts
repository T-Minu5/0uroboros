import { describe, expect, it } from 'vitest';
import { LOCATION_EFFECT_COLORS, LOCATION_TRIGGER_COLOR, splitLocationText } from '@0uroboros/engine/locationTriggers';
import { describeStep } from '@0uroboros/engine/effects/catalog';
import type { CardWhere, EffectStep, Scope, Who } from '@0uroboros/engine/effects/types';

const coloured = (text: string) => splitLocationText(text).filter(part => part.color).map(part => [part.text, part.trigger ?? part.effect]);

describe('Location text colours', () => {
  it('prints every trigger prefix in white', () => {
    const parts = splitLocationText('On reveal: x. Ongoing: y. On collapse: z. Start of turn 2: w.').filter(part => part.trigger);
    expect(parts.map(part => part.trigger)).toEqual(['onReveal', 'ongoing', 'onCollapse', 'startTurn']);
    expect(parts.every(part => part.color === LOCATION_TRIGGER_COLOR)).toBe(true);
  });

  it('calls out each effect phrase in its colour', () => {
    expect(coloured('+2 Cards to the winning player. +1 Action to each player. Drain -100 from the losing player\'s server. Heal 2 on a random revealed card.')).toEqual([
      ['+2 Cards', 'draw'], ['+1 Action', 'actions'], ['Drain -100', 'drain'], ['Heal 2', 'heal'],
    ]);
    expect(coloured('+3 Crypto. Pay 1 Crypto. Destroy the weakest revealed card, then trash a card. +2 Power to every revealed card. -1 Power from it.')).toEqual([
      ['+3 Crypto', 'crypto'], ['Pay 1 Crypto', 'crypto'], ['Destroy', 'destroy'], ['trash', 'trash'], ['+2 Power', 'powerUp'], ['-1 Power', 'powerDown'],
    ]);
    expect(splitLocationText('+1 Card').find(part => part.effect)?.color).toBe(LOCATION_EFFECT_COLORS.draw);
  });

  it('colours Victory Points, Server repair, Reset, transfers, Discard, Mill, Inspect and Recover', () => {
    expect(coloured('Give 1 Victory Point to you. +2 VP. Restore 50 to your server. Restore server +100.')).toEqual([
      ['Give 1 Victory Point', 'victory'], ['+2 VP', 'victory'], ['Restore 50', 'repair'], ['Restore server +100', 'repair'],
    ]);
    expect(coloured('Repair +100. Repair your backup server +50. Restore +2. Restore a revealed card of yours +1. +1 VP.')).toEqual([
      ['Repair +100', 'repair'], ['Repair', 'repair'], ['+50', 'repair'], ['Restore +2', 'heal'], ['Restore', 'heal'], ['+1', 'heal'], ['+1 VP', 'victory'],
    ]);
    expect(coloured('Reset the Power of all cards here. Choose a card of yours to reset its Power. Push 2 power to a nearby location. Push or pull 1 power.')).toEqual([
      ['Reset the Power of', 'reset'], ['reset its Power', 'reset'], ['Push 2 power', 'transfer'], ['Push or pull 1 power', 'transfer'],
    ]);
    expect(coloured('Discard 2 cards from your hand. Mill 3 cards. Inspect the top 2 cards of your deck. Recover a card from the shared Trash.')).toEqual([
      ['Discard 2 cards', 'discard'], ['Mill 3 cards', 'mill'], ['Inspect the top 2 cards', 'inspect'], ['Recover a card', 'recover'],
    ]);
    expect(coloured('Bump a card to discard. Move a card. Attach a mod.')).toEqual([]);
  });

  it('words Reset, Restore, random, chosen and all targets the concise way', () => {
    const card = (who: Who, where: CardWhere, extra: Partial<EffectStep> = {}): Partial<EffectStep> => ({ target: { type: 'card', who, where }, ...extra });
    const reset = (step: Partial<EffectStep>, scope: Scope = 'card') => describeStep({ action: 'restoreCard', ...step } as EffectStep, scope);
    expect(reset(card('both', 'thisNode', { pick: { mode: 'all' } }), 'location')).toBe('Reset the Power of all cards here');
    expect(reset({ target: { type: 'card', who: 'self', where: 'board', relation: 'next' } })).toBe('Reset the Power of your next revealed card');
    expect(reset(card('opponent', 'thisNode', { pick: { mode: 'random' } }))).toBe('Reset the Power of a revealed enemy card at this Location');
    expect(reset(card('self', 'board', { pick: { mode: 'choose' } }))).toBe('Choose a revealed card of yours to reset its Power');
    expect(reset(card('self', 'board', { pick: { mode: 'choose', count: 2 } }))).toBe('Choose 2 revealed cards of yours to reset their Power');
    expect(describeStep({ action: 'healCard', amount: 1, ...card('self', 'board', { pick: { mode: 'random' } }) } as EffectStep, 'card')).toBe('Restore a revealed card of yours +1');
    expect(describeStep({ action: 'destroyCard', ...card('opponent', 'thisNode', { pick: { mode: 'choose', chooser: 'opponent' } }) } as EffectStep, 'card')).toBe('Opponent chooses a revealed enemy card at this Location to destroy');
  });

  it('leaves the Trash pile itself uncoloured', () => {
    expect(coloured('Recover a card from the shared Trash. Mill 2 cards into the Trash.')).toEqual([['Recover a card', 'recover'], ['Mill 2 cards', 'mill']]);
  });
});
