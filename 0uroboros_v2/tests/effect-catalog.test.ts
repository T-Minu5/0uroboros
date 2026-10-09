import { describe, expect, it } from 'vitest';
import type { Card } from '@0uroboros/engine/game';
import {
  ACTIONS, ACTION_IDS, SCOPES, actionsFor, changeAction, createStep, describeStep, targetsFor, validateSteps, whoChoices, type ValidationCards,
} from '@0uroboros/engine/effects/catalog';
import type { EffectStep } from '@0uroboros/engine/effects/types';

const cards: (Card & { enabled?: boolean })[] = [
  { id: 'alpha', definitionId: 'alpha-definition', name: 'Alpha Relay', type: 'Character', cost: 2, art: '/alpha.png', effect: '' },
  { id: 'beta', name: 'Beta Archive', type: 'VP', cost: 3, art: '/beta.png', effect: '' },
];
const validation: ValidationCards = {
  enabledIds: new Set(cards.map(card => card.definitionId ?? card.id)),
  types: new Map(cards.map(card => [card.definitionId ?? card.id, card.type])),
};
const you = { type: 'player', who: 'self' } as const;

describe('effect catalog', () => {
  it('creates a valid default step for every action offered in every scope', () => {
    for (const scope of SCOPES) {
      for (const spec of actionsFor(scope)) {
        const errors: string[] = [];
        validateSteps([createStep(spec.id, scope, cards)], 'steps', scope, validation, errors);
        expect(errors, `${spec.id} in ${scope}`).toEqual([]);
      }
    }
  });

  it('offers each action only where its targets exist', () => {
    const ids = (scope: typeof SCOPES[number]) => actionsFor(scope).map(spec => spec.id);
    expect(ids('location')).not.toContain('transferPower');
    expect(ids('location')).not.toContain('morph');
    expect(ids('circuit')).not.toContain('moveCard');
    expect(ids('circuit')).toContain('destroyCard');
    expect(targetsFor('destroyCard', 'circuit')[0]).toMatchObject({ where: ['hand', 'bank', 'wallet', 'deckTop', 'deckBottom', 'deck'] });
    expect(ids('circuit')).toContain('healCard');
    for (const scope of SCOPES) expect(ids(scope)).toContain('bump');
    expect(ACTION_IDS.every(id => SCOPES.some(scope => ids(scope).includes(id)))).toBe(true);
  });

  it('locks Steal Crypto onto the enemy wallet and lets Restore and Reset reach either side’s cards anywhere', () => {
    const [steal] = targetsFor('stealCrypto', 'card');
    expect(steal).toMatchObject({ type: 'zone', zones: ['wallet'] });
    expect(whoChoices(steal, 'card')).toEqual(['opponent']);
    expect(whoChoices(steal, 'location')).toEqual(['loser']);
    for (const action of ['healCard', 'restoreCard'] as const) {
      const [spec] = targetsFor(action, 'card');
      expect(whoChoices(spec, 'card')).toEqual(['self', 'opponent', 'any', 'both']);
      expect(spec).toMatchObject({ type: 'card', where: ['board', 'thisNode', 'hand', 'bank', 'deckTop', 'deckBottom', 'deck', 'discard'] });
      expect(spec.type === 'card' && spec.relations).toEqual(['self', 'previous', 'next']);
    }
  });

  it('gives card effects every place, either side and who chooses', () => {
    for (const action of ['destroyCard', 'trashCard'] as const) {
      const [spec] = targetsFor(action, 'card');
      expect(spec).toMatchObject({ where: ['board', 'thisNode', 'hand', 'bank', 'wallet', 'deckTop', 'deckBottom', 'deck'] });
      expect(whoChoices(spec, 'card')).toEqual(expect.arrayContaining(['self', 'opponent']));
    }
    for (const action of ['moveCard', 'changePower', 'healCard', 'restoreCard', 'destroyCard', 'trashCard', 'attachModifier', 'removeModifier'] as const) expect(ACTIONS[action].chooser).toBe(true);
    expect(targetsFor('changePower', 'card')[0]).toMatchObject({ where: ['board', 'thisNode', 'hand', 'bank', 'deckTop', 'deckBottom', 'deck'] });
  });

  it('keeps follow-ups, options, a still-valid target and the amount when the action changes', () => {
    const then: EffectStep[] = [{ action: 'draw', amount: 2, target: you }];
    const power: EffectStep = { action: 'changePower', amount: -3, target: { type: 'card', who: 'opponent', where: 'board' }, pick: { mode: 'choose' }, optional: true, then };
    const moved = changeAction(power, 'destroyCard', 'card');
    expect(moved).toMatchObject({ action: 'destroyCard', target: power.target, pick: { mode: 'choose' }, optional: true, then });
    expect(moved.amount).toBeUndefined();
    expect(changeAction({ action: 'gainCrypto', amount: 4, target: you, then }, 'gainVP', 'card')).toEqual({ action: 'gainVP', amount: 4, target: you, then });
    const choice = createStep('choice', 'card');
    expect(changeAction(choice, 'random', 'card').options).toBe(choice.options);
    expect(changeAction({ action: 'draw', amount: 1, target: you }, 'attachModifier', 'card').amount).toBeUndefined();
  });

  it('starts Choice and Random with two runnable options and Morph with an enabled form', () => {
    for (const action of ['choice', 'random'] as const) {
      const options = createStep(action, 'location').options!;
      expect(options).toHaveLength(2);
      expect(options.every(option => option.effects[0].target?.type === 'player' && option.effects[0].target.who === 'winner')).toBe(true);
    }
    expect(createStep('morph', 'card', [{ ...cards[0], enabled: false }, cards[1]])).toMatchObject({ formIds: ['beta'], selection: 'sequential' });
    expect(createStep('gainCard', 'card', [{ ...cards[0], enabled: false }, cards[1]]).cardId).toBe('beta');
  });

  it('prints choices with their chooser, count and option costs', () => {
    const step: EffectStep = { action: 'choice', choose: { count: 2, chooser: 'opponent' }, options: [
      { id: 'a', label: '+2 Crypto', effects: [{ action: 'gainCrypto', amount: 2, target: you }] },
      { id: 'b', label: '+1 Card', effects: [{ action: 'draw', amount: 1, target: you }] },
      { id: 'c', label: '+1 VP', cost: [{ action: 'payCrypto', amount: 2, target: you }], effects: [{ action: 'gainVP', amount: 1, target: you }] },
    ] };
    expect(describeStep(step, 'card')).toBe('Opponent chooses 2: +2 Crypto, +1 Card or +1 VP (Pay 2 Crypto)');
    expect(describeStep({ action: 'healCard', amount: 2, target: { type: 'card', who: 'self', where: 'hand' }, pick: { mode: 'weakest' } }, 'card')).toBe('Restore the weakest card in your hand +2');
    expect(describeStep({ action: 'restoreCard', target: { type: 'card', who: 'self', where: 'board' }, pick: { mode: 'all' } }, 'card')).toBe('Reset the Power of all your revealed cards');
  });
});
