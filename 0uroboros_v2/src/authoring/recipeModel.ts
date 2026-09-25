import type { Card } from '../game';
import type { AuthoredCard } from './contentModel';

export type RecipeScope = 'card' | 'location' | 'circuit';
export type Recipe = {
  kind: string;
  amount?: number;
  target?: string;
  opponent?: boolean;
  chooser?: string;
  optional?: boolean;
  min?: number;
  cardId?: string;
  destination?: string;
  prompt?: string;
  options?: unknown;
  then?: unknown;
  formIds?: readonly string[];
  selection?: 'sequential' | 'random';
};
export type CatalogCard = Card | AuthoredCard;
export type Choice = { value: string; label: string };

const cardOperations: Choice[] = [
  { value: 'draw', label: 'Draw card' },
  { value: 'actions', label: 'Gain Action' },
  { value: 'crypto', label: 'Gain Crypto' },
  { value: 'gain', label: 'Gain card' },
  { value: 'move', label: 'Move' },
  { value: 'morph', label: 'Morph' },
  { value: 'gainPower', label: 'Gain Power' },
  { value: 'drainPower', label: 'Drain Power' },
  { value: 'transferPower', label: 'Transfer Power' },
  { value: 'drain', label: 'Drain Data Center' },
  { value: 'restore', label: 'Restore Data Center' },
  { value: 'handDiscard', label: 'Discard card' },
  { value: 'handTrash', label: 'Trash card' },
  { value: 'trashSelf', label: 'Trash this card' },
  { value: 'recover', label: 'Recover card' },
  { value: 'mill', label: 'Mill card' },
  { value: 'scry', label: 'Inspect card' },
  { value: 'selfDestroyBackup', label: 'Destroy own Backup' },
  { value: 'choice', label: 'Choose an effect' },
  { value: 'random', label: 'Random effect' },
];
const locationOperations: Choice[] = [
  { value: 'crypto', label: 'Gain Crypto' },
  { value: 'vp', label: 'Gain Victory Point' },
  { value: 'draw', label: 'Draw card' },
  { value: 'damageLoser', label: 'Drain Data Center' },
];
const circuitOperations: Choice[] = [
  { value: 'crypto', label: 'Gain Crypto' },
  { value: 'vp', label: 'Gain Victory Point' },
  { value: 'restorePrimary', label: 'Restore Data Center' },
];

export function enabledCards(cards: readonly CatalogCard[]): CatalogCard[] {
  return cards.filter(card => !('enabled' in card) || card.enabled);
}

export function cardDefinitionId(card: CatalogCard): string {
  return card.definitionId ?? card.id;
}

export function operationChoices(scope: RecipeScope, cards: readonly CatalogCard[]): Choice[] {
  if (scope === 'location') return locationOperations;
  if (scope === 'circuit') return circuitOperations;
  const available = enabledCards(cards);
  return cardOperations.filter(choice => choice.value === 'gain' ? available.length > 0 : choice.value === 'morph' ? available.some(card => card.type !== 'Crypto') : true);
}

export function recipeOperation(recipe: Recipe, scope: RecipeScope): string {
  if (scope !== 'card') return recipe.kind;
  if (recipe.kind === 'moveSelf' || recipe.kind === 'moveCard') return 'move';
  if (recipe.kind === 'modifyPower') return (recipe.amount ?? 0) < 0 ? 'drainPower' : 'gainPower';
  if (recipe.kind === 'probability') return 'transferPower';
  return recipe.kind;
}

export function recipeCount(recipe: Recipe, scope: RecipeScope): number | null {
  const operation = recipeOperation(recipe, scope);
  if (['choice', 'random', 'morph', 'selfDestroyBackup'].includes(operation)) return null;
  if (['move', 'trashSelf', 'recover'].includes(operation)) return 1;
  if (recipe.kind === 'probability') return (recipe.amount ?? 5) / 5;
  if (operation === 'gainPower' || operation === 'drainPower') return Math.abs(recipe.amount ?? 1);
  return recipe.amount ?? 1;
}

export function recipeCountEditable(recipe: Recipe, scope: RecipeScope): boolean {
  return !['choice', 'random', 'morph', 'move', 'trashSelf', 'recover', 'selfDestroyBackup'].includes(recipeOperation(recipe, scope));
}

export function recipeCountMinimum(recipe: Recipe, scope: RecipeScope): number {
  const operation = recipeOperation(recipe, scope);
  return operation === 'gainPower' || operation === 'drainPower' ? 1 : 0;
}

export function recipeCountMaximum(recipe: Recipe, scope: RecipeScope): number {
  const operation = recipeOperation(recipe, scope);
  return operation === 'gain' ? 100 : operation === 'gainPower' || operation === 'drainPower' ? 1000 : 1_000_000;
}

export function recipeTarget(recipe: Recipe, scope: RecipeScope): string {
  if (scope === 'location') return recipe.kind === 'damageLoser' ? 'loser-center' : recipe.kind === 'crypto' ? 'winner-wallet' : recipe.kind === 'vp' ? 'winner-vp' : 'winner-hand';
  if (scope === 'circuit') return recipe.kind === 'crypto' ? 'eligible-wallet' : recipe.kind === 'vp' ? 'eligible-vp' : 'eligible-primary';
  switch (recipeOperation(recipe, scope)) {
    case 'draw': case 'handDiscard': case 'handTrash': return recipe.opponent ? 'opponent-hand' : 'your-hand';
    case 'actions': return recipe.opponent ? 'opponent-actions' : 'your-actions';
    case 'crypto': return recipe.opponent ? 'opponent-wallet' : 'your-wallet';
    case 'gain': return `${recipe.opponent ? 'opponent' : 'your'}-${recipe.destination ?? 'top'}`;
    case 'move': return recipe.kind === 'moveSelf' ? 'this-card' : recipe.opponent ? 'opponent-card' : 'your-card';
    case 'gainPower': case 'drainPower': return recipe.opponent ? 'opponent-card' : 'your-card';
    case 'drain': return `opponent-${recipe.target ?? 'automatic'}`;
    case 'restore': return `your-${recipe.target ?? 'automatic'}`;
    case 'transferPower': return 'your-neighboring-nodes';
    case 'mill': return 'opponent-draw';
    case 'scry': return 'your-draw';
    case 'recover': return 'your-discard';
    case 'trashSelf': case 'morph': return 'this-card';
    case 'selfDestroyBackup': return 'your-backup';
    default: return 'branch-targets';
  }
}

export function targetChoices(recipe: Recipe, scope: RecipeScope): Choice[] {
  if (scope === 'location' || scope === 'circuit') {
    const value = recipeTarget(recipe, scope);
    const labels: Record<string, string> = {
      'winner-wallet': "Winning player's wallet", 'winner-vp': "Winning player's VP", 'winner-hand': "Winning player's hand",
      'loser-center': "Losing player's Data Center", 'eligible-wallet': "Eligible player's wallet",
      'eligible-vp': "Eligible player's VP", 'eligible-primary': "Eligible player's Primary Data Center",
    };
    return [{ value, label: labels[value] ?? value }];
  }
  switch (recipeOperation(recipe, scope)) {
    case 'draw': case 'handDiscard': case 'handTrash': return [{ value: 'your-hand', label: 'Your hand' }, { value: 'opponent-hand', label: 'Opponent hand' }];
    case 'actions': return [{ value: 'your-actions', label: 'Your Actions' }, { value: 'opponent-actions', label: 'Opponent Actions' }];
    case 'crypto': return [{ value: 'your-wallet', label: 'Your wallet' }, { value: 'opponent-wallet', label: 'Opponent wallet' }];
    case 'gain': return [
      { value: 'your-hand', label: 'Your hand' }, { value: 'your-top', label: 'Your draw pile top' }, { value: 'your-discard', label: 'Your discard' },
      { value: 'opponent-hand', label: 'Opponent hand' }, { value: 'opponent-top', label: 'Opponent draw pile top' }, { value: 'opponent-discard', label: 'Opponent discard' },
    ];
    case 'move': return [{ value: 'this-card', label: 'This card' }, { value: 'your-card', label: 'Your revealed card' }, { value: 'opponent-card', label: 'Opponent revealed card' }];
    case 'gainPower': case 'drainPower': return [{ value: 'your-card', label: 'Your revealed card' }, { value: 'opponent-card', label: 'Opponent revealed card' }];
    case 'drain': return [{ value: 'opponent-automatic', label: 'Opponent · automatic' }, { value: 'opponent-primary', label: 'Opponent · Primary' }, { value: 'opponent-backup', label: 'Opponent · Backup' }];
    case 'restore': return [{ value: 'your-automatic', label: 'Your · automatic' }, { value: 'your-primary', label: 'Your · Primary' }, { value: 'your-backup', label: 'Your · Backup' }];
    case 'transferPower': return [{ value: 'your-neighboring-nodes', label: 'Your neighboring Nodes' }];
    case 'mill': return [{ value: 'opponent-draw', label: 'Opponent draw pile' }];
    case 'scry': return [{ value: 'your-draw', label: 'Your draw pile' }];
    case 'recover': return [{ value: 'your-discard', label: 'Your discard' }];
    case 'trashSelf': case 'morph': return [{ value: 'this-card', label: 'This card' }];
    case 'selfDestroyBackup': return [{ value: 'your-backup', label: 'Your Backup Data Center' }];
    default: return [{ value: 'branch-targets', label: 'Set by each branch' }];
  }
}

function defaultOptions(): Recipe['options'] {
  return [
    { id: 'first', label: 'Draw a card', effects: [{ kind: 'draw', amount: 1 }] },
    { id: 'second', label: 'Gain Crypto', effects: [{ kind: 'crypto', amount: 1 }] },
  ];
}

export function createRecipe(operation: string, scope: RecipeScope, cards: readonly CatalogCard[]): Recipe {
  if (scope !== 'card') return { kind: operation, amount: 1 };
  const first = enabledCards(cards)[0];
  switch (operation) {
    case 'move': return { kind: 'moveSelf' };
    case 'gainPower': return { kind: 'modifyPower', amount: 1 };
    case 'drainPower': return { kind: 'modifyPower', amount: -1 };
    case 'transferPower': return { kind: 'transferPower', amount: 1 };
    case 'trashSelf': case 'recover': case 'selfDestroyBackup': return { kind: operation };
    case 'choice': case 'random': return { kind: operation, options: defaultOptions(), ...(operation === 'choice' ? { prompt: 'Choose one effect' } : {}) };
    case 'gain': return { kind: 'gain', amount: 1, cardId: first ? cardDefinitionId(first) : '', destination: 'top' };
    case 'morph': {
      const form = enabledCards(cards).find(card => card.type !== 'Crypto');
      return { kind: 'morph', formIds: form ? [cardDefinitionId(form)] : [], selection: 'sequential' };
    }
    default: return { kind: operation, amount: 1 };
  }
}

export function changeRecipeOperation(recipe: Recipe, operation: string, scope: RecipeScope, cards: readonly CatalogCard[]): Recipe {
  if (recipeOperation(recipe, scope) === operation) return recipe;
  if (scope === 'card' && recipe.kind === 'modifyPower' && (operation === 'gainPower' || operation === 'drainPower')) {
    const positive = Math.max(1, Math.abs(recipe.amount ?? 1));
    return { ...recipe, amount: operation === 'drainPower' ? -positive : positive };
  }
  return createRecipe(operation, scope, cards);
}

export function changeRecipeCount(recipe: Recipe, count: number, scope: RecipeScope): Recipe {
  if (!recipeCountEditable(recipe, scope) || !Number.isFinite(count)) return recipe;
  const minimum = recipeCountMinimum(recipe, scope);
  const maximum = recipeCountMaximum(recipe, scope);
  const amount = Math.min(maximum, Math.max(minimum, recipeOperation(recipe, scope) === 'transferPower' ? count : Math.trunc(count)));
  if (recipe.kind === 'probability') return { ...recipe, kind: 'transferPower', amount };
  if (recipeOperation(recipe, scope) === 'drainPower') return { ...recipe, amount: -amount };
  if (recipe.kind === 'handDiscard' || recipe.kind === 'handTrash') return { ...recipe, amount, ...(recipe.min !== undefined && recipe.min > amount ? { min: amount } : {}) };
  return { ...recipe, amount };
}

export function changeRecipeTarget(recipe: Recipe, value: string, scope: RecipeScope): Recipe {
  if (!targetChoices(recipe, scope).some(choice => choice.value === value) || recipeTarget(recipe, scope) === value) return recipe;
  if (scope !== 'card') return recipe;
  switch (recipeOperation(recipe, scope)) {
    case 'draw': case 'actions': case 'crypto': case 'handDiscard': case 'handTrash': return { ...recipe, opponent: value.startsWith('opponent-') };
    case 'gain': {
      const [owner, destination] = value.split('-');
      return { ...recipe, opponent: owner === 'opponent', destination };
    }
    case 'move': {
      if (value === 'this-card') {
        const { opponent: _opponent, optional: _optional, ...rest } = recipe;
        return { ...rest, kind: 'moveSelf' };
      }
      return { ...recipe, kind: 'moveCard', opponent: value === 'opponent-card' };
    }
    case 'gainPower': case 'drainPower': return { ...recipe, opponent: value === 'opponent-card' };
    case 'drain': case 'restore': return { ...recipe, target: value.endsWith('automatic') ? undefined : value.endsWith('primary') ? 'primary' : 'backup' };
    default: return recipe;
  }
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
export function recipeSummary(recipe: Recipe, scope: RecipeScope, cards: readonly CatalogCard[]): string {
  const operation = recipeOperation(recipe, scope);
  const count = recipeCount(recipe, scope) ?? 0;
  const target = recipeTarget(recipe, scope);
  if (scope === 'location') {
    if (operation === 'draw') return `Draw ${plural(count, 'card')} into the winning player's hand.`;
    if (operation === 'crypto') return `Give ${count} Crypto to the winning player.`;
    if (operation === 'vp') return `Give ${plural(count, 'Victory Point')} to the winning player.`;
    return `Drain ${count} from the losing player's available Data Center.`;
  }
  if (scope === 'circuit') {
    if (operation === 'crypto') return `Give ${count} Crypto to the eligible player.`;
    if (operation === 'vp') return `Give ${plural(count, 'Victory Point')} to the eligible player.`;
    return `Restore ${count} to the eligible player's Primary Data Center.`;
  }
  switch (operation) {
    case 'draw': return `Draw ${plural(count, 'card')} into ${target === 'your-hand' ? 'your' : 'opponent'} hand.`;
    case 'actions': return `Give ${plural(count, 'Action')} to ${target === 'your-actions' ? 'you' : 'the opponent'}.`;
    case 'crypto': return `Give ${count} Crypto to ${target === 'your-wallet' ? 'your' : 'opponent'} wallet.`;
    case 'gain': {
      const name = cards.find(card => cardDefinitionId(card) === recipe.cardId)?.name ?? 'an unavailable card';
      const zone = target.endsWith('-top') ? 'draw pile top' : target.endsWith('-discard') ? 'discard' : 'hand';
      return `Gain ${count} ${name}${count === 1 ? '' : ' cards'} into ${target.startsWith('your-') ? 'your' : 'opponent'} ${zone}.`;
    }
    case 'move': return `Move ${target === 'this-card' ? 'this card' : target === 'your-card' ? 'a revealed card you own' : 'an opponent revealed card'} to another open Node.`;
    case 'morph': {
      const names = (recipe.formIds ?? []).map(id => cards.find(card => cardDefinitionId(card) === id)?.name ?? 'an unavailable form');
      if (!names.length) return 'Choose forms for this card.';
      return recipe.selection === 'random' ? `Morph this card into a random form: ${names.join(' or ')}.` : `Evolve this card through ${names.join(' → ')}.`;
    }
    case 'gainPower': return `Add ${count} Power to ${target === 'your-card' ? 'your' : 'an opponent'} revealed card.`;
    case 'drainPower': return `Remove ${count} Power from ${target === 'your-card' ? 'your' : 'an opponent'} revealed card.`;
    case 'transferPower': return `Transfer up to ${count} of your Power between neighboring Nodes.`;
    case 'drain': return `Drain ${count} from ${target.replace('opponent-', 'the opponent’s ')} Data Center.`;
    case 'restore': return `Restore ${count} to ${target.replace('your-', 'your ')} Data Center.`;
    case 'handDiscard': return `Discard up to ${plural(count, 'card')} from ${target === 'your-hand' ? 'your' : 'opponent'} hand.`;
    case 'handTrash': return `Trash up to ${plural(count, 'card')} from ${target === 'your-hand' ? 'your' : 'opponent'} hand.`;
    case 'trashSelf': return 'Trash this card.';
    case 'recover': return 'Recover one card from shared Trash into your discard.';
    case 'mill': return `Mill ${plural(count, 'card')} from the opponent’s draw pile into discard.`;
    case 'scry': return `Inspect up to ${plural(count, 'card')} from your draw pile.`;
    case 'selfDestroyBackup': return 'Destroy your own Backup Data Center.';
    case 'choice': return recipe.options ? `Choose one of ${(recipe.options as unknown[]).length} effects.` : 'Choose +2 Crypto or draw 1 card.';
    case 'random': return `Resolve one of ${(recipe.options as unknown[] | undefined)?.length ?? 0} random effects.`;
    default: return `Advanced effect: ${recipe.kind}.`;
  }
}
