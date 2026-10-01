import { describe, expect, it } from 'vitest';
import type { Card } from '../src/game';
import {
  changeRecipeCount, changeRecipeOperation, changeRecipeTarget, createRecipe, operationChoices,
  recipeCount, recipeOperation, recipeSummary, recipeTarget, targetChoices,
  type Recipe,
} from '../src/authoring/recipeModel';

const cards: Card[] = [
  { id: 'alpha', definitionId: 'alpha-definition', name: 'Alpha Relay', type: 'Character', cost: 2, art: '/alpha.png', effect: '' },
  { id: 'beta', name: 'Beta Archive', type: 'VP', cost: 3, art: '/beta.png', effect: '' },
];

describe('recipe editor model', () => {
  it('maps saved move and signed Power recipes to human operations without rewriting them', () => {
    const self: Recipe = { kind: 'moveSelf' };
    const other: Recipe = { kind: 'moveCard', opponent: true, optional: true };
    const power: Recipe = { kind: 'modifyPower', amount: -3, opponent: true, optional: true };
    expect(recipeOperation(self, 'card')).toBe('move');
    expect(recipeTarget(self, 'card')).toBe('this-card');
    expect(recipeCount(self, 'card')).toBe(1);
    expect(recipeTarget(other, 'card')).toBe('opponent-card');
    expect(recipeOperation(power, 'card')).toBe('drainPower');
    expect(recipeCount(power, 'card')).toBe(3);
    expect(other).toEqual({ kind: 'moveCard', opponent: true, optional: true });
    expect(power).toEqual({ kind: 'modifyPower', amount: -3, opponent: true, optional: true });
    expect(changeRecipeTarget(other, 'this-card', 'card')).toEqual({ kind: 'moveSelf' });
    expect(changeRecipeOperation(power, 'gainPower', 'card', cards)).toEqual({ kind: 'modifyPower', amount: 3, opponent: true, optional: true });
    expect(changeRecipeCount(power, 5000, 'card')).toEqual({ kind: 'modifyPower', amount: -1000, opponent: true, optional: true });
  });

  it('keeps legacy probability untouched until Count is edited, then stores native Power units', () => {
    const legacy: Recipe = { kind: 'probability', amount: 15 };
    expect(recipeOperation(legacy, 'card')).toBe('transferPower');
    expect(recipeCount(legacy, 'card')).toBe(3);
    expect(legacy).toEqual({ kind: 'probability', amount: 15 });
    expect(changeRecipeCount(legacy, 4, 'card')).toEqual({ kind: 'transferPower', amount: 4 });
  });

  it('preserves optional, follow-up, and nested branch data through unrelated edits', () => {
    const then = [{ kind: 'draw', amount: 2 }];
    const options = [{ id: 'one', label: 'One', effects: [{ kind: 'crypto', amount: 3 }] }];
    const hand: Recipe = { kind: 'handTrash', amount: 2, optional: true, min: 1, chooser: 'opponent', then };
    expect(changeRecipeTarget(hand, 'opponent-hand', 'card')).toEqual({ ...hand, opponent: true });
    expect(changeRecipeCount(hand, 3, 'card')).toEqual({ ...hand, amount: 3 });
    const choice: Recipe = { kind: 'choice', prompt: 'Choose', options };
    expect(changeRecipeTarget(choice, 'branch-targets', 'card')).toBe(choice);
    expect(changeRecipeCount(choice, 2, 'card')).toBe(choice);
    expect(choice.options).toBe(options);
  });

  it('maps legacy gain to own draw top, then supports explicit quantity and each destination', () => {
    const legacy: Recipe = { kind: 'gain', cardId: 'alpha-definition' };
    expect(recipeCount(legacy, 'card')).toBe(1);
    expect(recipeTarget(legacy, 'card')).toBe('your-top');
    expect(legacy).toEqual({ kind: 'gain', cardId: 'alpha-definition' });
    const targeted = changeRecipeTarget(legacy, 'opponent-hand', 'card');
    expect(targeted).toEqual({ kind: 'gain', cardId: 'alpha-definition', opponent: true, destination: 'hand' });
    expect(changeRecipeCount(targeted, 101, 'card')).toEqual({ ...targeted, amount: 100 });
    expect(changeRecipeCount(targeted, 0, 'card')).toEqual({ ...targeted, amount: 0 });
    expect(recipeSummary({ ...targeted, amount: 2 }, 'card', cards)).toBe('Gain 2 Alpha Relay cards into opponent hand.');
    expect(targetChoices(legacy, 'card').map(choice => choice.value)).toEqual(['your-hand', 'your-top', 'your-discard', 'opponent-hand', 'opponent-top', 'opponent-discard']);
  });

  it('makes choice and random steps with executable branches and shares the full effect catalog', () => {
    expect(recipeSummary({ kind: 'choice' }, 'card', cards)).toBe('Choose +2 Crypto or draw 1 card.');
    for (const operation of ['choice', 'random']) {
      const recipe = createRecipe(operation, 'card', cards);
      expect((recipe.options as unknown[]).length).toBe(2);
      expect((recipe.options as { effects: unknown[] }[]).every(option => option.effects.length > 0)).toBe(true);
    }
    const locationOps = operationChoices('location', cards).map(choice => choice.value);
    const circuitOps = operationChoices('circuit', cards).map(choice => choice.value);
    expect(locationOps).toContain('draw');
    expect(locationOps).toContain('drain');
    expect(locationOps).toContain('attachModifier');
    expect(locationOps).not.toContain('trashSelf');
    expect(circuitOps).toContain('vp');
    expect(circuitOps).toContain('restore');
    expect(circuitOps).toContain('attachModifier');
    expect(targetChoices({ kind: 'damageLoser', amount: 200 }, 'location').map(choice => choice.value)).toContain('loser-automatic');
    expect(targetChoices({ kind: 'restorePrimary', amount: 400 }, 'circuit').map(choice => choice.value)).toContain('eligible-primary');
    expect(changeRecipeTarget({ kind: 'restorePrimary', amount: 400 }, 'other-backup', 'circuit')).toEqual({ kind: 'restorePrimary', amount: 400, opponent: true, target: 'backup' });
    expect(targetChoices({ kind: 'moveCard' }, 'location').map(choice => choice.value)).toEqual([
      'either', 'winner', 'loser', 'both',
      'your-card', 'opponent-card',
      'your-previous-card', 'your-next-card', 'opponent-previous-card', 'opponent-next-card',
    ]);
    expect(changeRecipeTarget({ kind: 'moveCard' }, 'winner', 'location')).toEqual({ kind: 'moveCard', boardSide: 'winner', cardPick: 'random' });
    expect(createRecipe('move', 'location', cards)).toEqual({ kind: 'moveCard', boardSide: 'either', cardPick: 'random' });
    expect(recipeSummary({ kind: 'moveCard', boardSide: 'loser', cardPick: 'random' }, 'location', cards)).toMatch(/random.*losing/i);
    expect(recipeSummary({ kind: 'trashLowestAtLocation', amount: 1, boardSide: 'both' }, 'location', cards)).toMatch(/each side/);
  });

  it('prepares Morph forms from enabled non-Crypto definitions', () => {
    const catalog = [
      { ...cards[0], enabled: false },
      { ...cards[1], enabled: true },
      { id: 'coin', name: 'Coin', type: 'Crypto' as const, cost: 1, art: '/coin.png', effect: '', enabled: true },
    ];
    expect(createRecipe('morph', 'card', catalog)).toEqual({ kind: 'morph', formIds: ['beta'], selection: 'sequential' });
    expect(recipeSummary({ kind: 'morph', formIds: ['alpha-definition', 'beta'] }, 'card', cards)).toBe('Evolve this card through Alpha Relay → Beta Archive.');
    expect(recipeSummary({ kind: 'morph', formIds: ['alpha-definition', 'beta'], selection: 'random' }, 'card', cards)).toBe('Morph this card into a random form: Alpha Relay or Beta Archive.');
  });
});
