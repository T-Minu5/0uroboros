import type { Card } from '../game';
import type { AuthoredCard } from './contentModel';
import { locationTriggerPrefix } from '../locationTriggers';
import { transferFlow, transferText, type TransferDirection, type TransferFlow } from '../transferText';

export type RecipeScope = 'card' | 'location' | 'circuit' | 'locationPlay';
export type ModifierKind = 'doublePrintedEffects' | 'powerAuraAtLocation' | 'movableEachTurn';
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
  /** Card recipes only: later steps in the list wait until this one resolves. */
  chain?: boolean;
  formIds?: readonly string[];
  selection?: 'sequential' | 'random';
  boardSide?: 'either' | 'winner' | 'loser' | 'both' | 'played' | 'other';
  cardPick?: 'choice' | 'random';
  cardRelation?: 'previous' | 'next';
  boardHost?: boolean;
  modifier?: ModifierKind;
  rank?: 'weakest' | 'strongest' | 'first';
  direction?: TransferDirection;
  flow?: TransferFlow;
  zone?: 'bank' | 'wallet' | 'either';
};
export const shiftDirections: Choice[] = [
  { value: 'choice', label: 'Player chooses a side' },
  { value: 'left', label: 'Left only' },
  { value: 'right', label: 'Right only' },
  { value: 'split', label: 'Both sides (split)' },
];
export const transferFlows: Choice[] = [
  { value: 'either', label: 'Push or pull (player chooses)' },
  { value: 'push', label: 'Push only' },
  { value: 'pull', label: 'Pull only' },
];
export const bumpPicks: Choice[] = [
  { value: 'choice', label: 'Player chooses' },
  { value: 'random', label: 'At random' },
];
export type CatalogCard = Card | AuthoredCard;
export type Choice = { value: string; label: string };

/** Shared catalog for cards, locations, and circuit rewards. */
const sharedOperations: Choice[] = [
  { value: 'draw', label: 'Draw Card' },
  { value: 'actions', label: 'Gain Action' },
  { value: 'crypto', label: 'Gain Crypto' },
  { value: 'stealCrypto', label: 'Steal Crypto' },
  { value: 'bump', label: 'Bump Card' },
  { value: 'vp', label: 'Gain Victory Point' },
  { value: 'gain', label: 'Gain Card' },
  { value: 'move', label: 'Move' },
  { value: 'morph', label: 'Morph' },
  { value: 'gainPower', label: 'Gain Power' },
  { value: 'drainPower', label: 'Drain Power' },
  { value: 'transferPower', label: 'Transfer Power' },
  { value: 'drain', label: 'Drain Server' },
  { value: 'restore', label: 'Restore Server' },
  { value: 'handDiscard', label: 'Discard from hand' },
  { value: 'handTrash', label: 'Trash from hand' },
  { value: 'trashSelf', label: 'Trash this card' },
  { value: 'trashAtLocation', label: 'Trash Card' },
  { value: 'destroyCard', label: 'Destroy Card' },
  { value: 'recover', label: 'Recover Card' },
  { value: 'mill', label: 'Mill Card' },
  { value: 'scry', label: 'Inspect Card' },
  { value: 'selfDestroyBackup', label: 'Destroy own Backup' },
  { value: 'attachModifier', label: 'Attach card modifier' },
  { value: 'boostPowerAtLocation', label: 'Boost Power here' },
  { value: 'choice', label: 'Choose an effect' },
  { value: 'random', label: 'Random effect' },
];

/** Ops that need a source card deployment and are nonsensical on location/circuit alone. */
const cardOnlyOperations = new Set(['trashSelf', 'morph', 'transferPower', 'stealCrypto']);
/** Ops that target cards at a Location and are location-primary. */
const locationCardOperations = new Set(['trashAtLocation', 'boostPowerAtLocation']);
/** Ops that need a revealed card on the board, which a circuit reward has no way to pick. */
const boardOperations = new Set(['destroyCard']);

export function enabledCards(cards: readonly CatalogCard[]): CatalogCard[] {
  return cards.filter(card => !('enabled' in card) || card.enabled);
}

export function cardDefinitionId(card: CatalogCard): string {
  return card.definitionId ?? card.id;
}

export function operationChoices(scope: RecipeScope, cards: readonly CatalogCard[]): Choice[] {
  const available = enabledCards(cards);
  return sharedOperations.filter(choice => {
    if (scope !== 'card' && cardOnlyOperations.has(choice.value)) {
      // On-play has a real played card, so Trash this card is valid; Morph / Power transfer are not.
      if (!(scope === 'locationPlay' && choice.value === 'trashSelf')) return false;
    }
    if (scope !== 'location' && scope !== 'locationPlay' && locationCardOperations.has(choice.value)) return false;
    if (scope === 'circuit' && boardOperations.has(choice.value)) return false;
    if (choice.value === 'gain') return available.length > 0;
    if (choice.value === 'morph') return available.some(card => card.type !== 'Crypto');
    if (choice.value === 'attachModifier') return available.some(card => card.type === 'Character');
    return true;
  });
}

export function recipeOperation(recipe: Recipe, scope: RecipeScope): string {
  if (recipe.kind === 'damageLoser') return 'drain';
  if (recipe.kind === 'restorePrimary') return 'restore';
  if (recipe.kind === 'moveSelf' || recipe.kind === 'moveCard') return 'move';
  if (recipe.kind === 'modifyPower') return (recipe.amount ?? 0) < 0 ? 'drainPower' : 'gainPower';
  if (recipe.kind === 'probability') return 'transferPower';
  if (recipe.kind === 'trashLowestAtLocation') return 'trashAtLocation';
  if (recipe.kind === 'destroyAtLocation') return 'destroyCard';
  return recipe.kind;
}

/** Location trash/destroy steps pick cards here by rank rather than by relation to a played card. */
function isRankedRemoval(recipe: Recipe): boolean {
  return recipe.kind === 'trashAtLocation' || recipe.kind === 'trashLowestAtLocation' || recipe.kind === 'destroyAtLocation';
}

const rankChoices: Choice[] = [
  { value: 'weakest', label: 'Weakest card here' },
  { value: 'strongest', label: 'Strongest card here' },
  { value: 'first', label: 'First card revealed here' },
];

/** Side picker for Location trash/destroy; empty when the step has no side setting. */
export function boardSideChoices(recipe: Recipe, scope: RecipeScope): Choice[] {
  if (!isRankedRemoval(recipe)) return [];
  const [self, other] = scope === 'locationPlay'
    ? [{ value: 'played', label: "Played owner's side" }, { value: 'other', label: "Other player's side" }]
    : [{ value: 'winner', label: "Winner's side" }, { value: 'loser', label: "Loser's side" }];
  return [{ value: 'either', label: 'Either side' }, self, other, { value: 'both', label: 'Each side' }];
}

export function recipeCount(recipe: Recipe, scope: RecipeScope): number | null {
  const operation = recipeOperation(recipe, scope);
  if (['choice', 'random', 'morph', 'selfDestroyBackup', 'attachModifier'].includes(operation) && operation !== 'attachModifier') return null;
  if (operation === 'attachModifier') return recipe.modifier === 'powerAuraAtLocation' ? (recipe.amount ?? 1) : null;
  if (['move', 'trashSelf', 'recover'].includes(operation) || recipe.kind === 'destroyCard') return 1;
  if (recipe.kind === 'probability') return (recipe.amount ?? 5) / 5;
  if (operation === 'gainPower' || operation === 'drainPower') return Math.abs(recipe.amount ?? 1);
  return recipe.amount ?? 1;
}

export function recipeCountEditable(recipe: Recipe, scope: RecipeScope): boolean {
  const operation = recipeOperation(recipe, scope);
  if (operation === 'attachModifier') return recipe.modifier === 'powerAuraAtLocation';
  return recipe.kind !== 'destroyCard' && !['choice', 'random', 'morph', 'move', 'trashSelf', 'recover', 'selfDestroyBackup'].includes(operation);
}

export function recipeCountMinimum(recipe: Recipe, scope: RecipeScope): number {
  const operation = recipeOperation(recipe, scope);
  if (operation === 'vp') return -1_000_000;
  return operation === 'bump' || operation === 'gainPower' || operation === 'drainPower' || isRankedRemoval(recipe) || operation === 'boostPowerAtLocation' || (operation === 'attachModifier' && recipe.modifier === 'powerAuraAtLocation') ? 1 : 0;
}

export function recipeCountMaximum(recipe: Recipe, scope: RecipeScope): number {
  const operation = recipeOperation(recipe, scope);
  if (operation === 'bump') return 10;
  return operation === 'gain' ? 100 : operation === 'gainPower' || operation === 'drainPower' || operation === 'attachModifier' ? 1000 : 1_000_000;
}

function actorLabel(scope: RecipeScope, opponent: boolean): { prefix: string; you: string; them: string } {
  if (scope === 'location') return opponent
    ? { prefix: 'loser', you: 'losing player', them: 'winning player' }
    : { prefix: 'winner', you: 'winning player', them: 'losing player' };
  if (scope === 'locationPlay') return opponent
    ? { prefix: 'other', you: 'other player', them: 'player who played here' }
    : { prefix: 'played', you: 'player who played here', them: 'other player' };
  if (scope === 'circuit') return opponent
    ? { prefix: 'other', you: 'other player', them: 'eligible player' }
    : { prefix: 'eligible', you: 'eligible player', them: 'other player' };
  return opponent ? { prefix: 'opponent', you: 'opponent', them: 'you' } : { prefix: 'your', you: 'you', them: 'opponent' };
}

export function recipeTarget(recipe: Recipe, scope: RecipeScope): string {
  // Legacy location/circuit aliases keep fixed targets when no opponent flag was authored.
  if (recipe.kind === 'damageLoser') return 'loser-automatic';
  if (recipe.kind === 'restorePrimary') return 'eligible-primary';
  if (isRankedRemoval(recipe)) return recipe.rank ?? 'weakest';
  const op = recipeOperation(recipe, scope);
  const opp = Boolean(recipe.opponent);
  const actor = actorLabel(scope, opp).prefix;
  switch (op) {
    case 'draw': case 'handDiscard': case 'handTrash': return `${actor}-hand`;
    case 'actions': return `${actor}-actions`;
    case 'crypto': return `${actor}-wallet`;
    case 'stealCrypto': return 'opponent-wallet';
    case 'bump': return `${actorLabel(scope, true).prefix}-${recipe.zone ?? 'either'}`;
    case 'vp': return `${actor}-vp`;
    case 'gain': return `${actor}-${recipe.destination ?? 'top'}`;
    case 'move': {
      if (recipe.kind === 'moveSelf') return 'this-card';
      if (recipe.cardRelation === 'previous') return opp ? 'opponent-previous-card' : 'your-previous-card';
      if (recipe.cardRelation === 'next') return opp ? 'opponent-next-card' : 'your-next-card';
      if (scope === 'location' || scope === 'locationPlay') return recipe.boardSide ?? 'either';
      return opp ? 'opponent-card' : 'your-card';
    }
    case 'gainPower': case 'drainPower': case 'destroyCard': {
      if (recipe.cardRelation === 'previous') return opp ? 'opponent-previous-card' : 'your-previous-card';
      if (recipe.cardRelation === 'next') return opp ? 'opponent-next-card' : 'your-next-card';
      if (scope === 'location' || scope === 'locationPlay') return recipe.boardSide ?? 'either';
      return opp ? 'opponent-card' : 'your-card';
    }
    case 'drain': return `${scope === 'card' ? (opp ? 'opponent' : 'your') : actor}-${recipe.target ?? 'automatic'}`;
    case 'restore': return `${scope === 'card' ? (opp ? 'opponent' : 'your') : actor}-${recipe.target ?? (recipe.kind === 'restorePrimary' ? 'primary' : 'automatic')}`;
    case 'transferPower': return 'your-neighboring-nodes';
    case 'mill': {
      if (scope === 'card') return opp ? `${actor}-draw` : 'opponent-draw';
      return `${actorLabel(scope, !opp).prefix}-draw`;
    }
    case 'scry': return `${actor}-draw`;
    case 'recover': return 'shared-trash';
    case 'trashSelf': case 'morph': return 'this-card';
    case 'selfDestroyBackup': return `${actor}-backup`;
    case 'attachModifier': {
      if (recipe.boardHost || recipe.cardRelation) {
        if (recipe.cardRelation === 'previous') return opp ? 'opponent-previous-card' : 'your-previous-card';
        if (recipe.cardRelation === 'next') return opp ? 'opponent-next-card' : 'your-next-card';
        return opp ? 'opponent-card' : 'your-card';
      }
      return recipe.cardId ? 'specific-character' : 'random-character';
    }
    case 'boostPowerAtLocation': return recipe.boardSide ?? 'both';
    default: return 'branch-targets';
  }
}

function boardCardTargetChoices(selfLabel: string, opponentLabel: string, includeSelfMove = false): Choice[] {
  return [
    ...(includeSelfMove ? [{ value: 'this-card', label: 'This card' }] : []),
    { value: 'your-card', label: `${selfLabel} revealed card` },
    { value: 'your-previous-card', label: `${selfLabel} previously revealed card` },
    { value: 'your-next-card', label: `${selfLabel} next revealed card` },
    { value: 'opponent-card', label: `${opponentLabel} revealed card` },
    { value: 'opponent-previous-card', label: `${opponentLabel} previously revealed card` },
    { value: 'opponent-next-card', label: `${opponentLabel} next revealed card` },
  ];
}

function attachModifierTargetChoices(selfLabel: string, opponentLabel: string, deckOwnerLabel: string): Choice[] {
  return [
    ...boardCardTargetChoices(selfLabel, opponentLabel),
    { value: 'random-character', label: `Random Character in ${deckOwnerLabel} deck` },
    { value: 'specific-character', label: 'Specific Character definition' },
  ];
}

/** Bump always hits the other player; only the zone varies. */
function bumpTargetChoices(scope: RecipeScope): Choice[] {
  const prefix = actorLabel(scope, true).prefix;
  const whose = scope === 'card' ? "Opponent's" : scope === 'location' ? "Losing player's" : "Other player's";
  return [
    { value: `${prefix}-bank`, label: `${whose} Effect Bank` },
    { value: `${prefix}-wallet`, label: `${whose} Crypto wallet` },
    { value: `${prefix}-either`, label: `${whose} Effect Bank or Crypto wallet` },
  ];
}

export function targetChoices(recipe: Recipe, scope: RecipeScope): Choice[] {
  if (isRankedRemoval(recipe)) return rankChoices;
  const op = recipeOperation(recipe, scope);
  if (op === 'bump') return bumpTargetChoices(scope);
  if (scope === 'locationPlay') {
    switch (op) {
      case 'draw': case 'handDiscard': case 'handTrash':
        return [{ value: 'played-hand', label: "Played card's owner's hand" }, { value: 'other-hand', label: "Other player's hand" }];
      case 'actions':
        return [{ value: 'played-actions', label: "Played card's owner's Actions" }, { value: 'other-actions', label: "Other player's Actions" }];
      case 'crypto':
        return [{ value: 'played-wallet', label: "Played card's owner's wallet" }, { value: 'other-wallet', label: "Other player's wallet" }];
      case 'vp':
        return [{ value: 'played-vp', label: "Played card's owner's VP" }, { value: 'other-vp', label: "Other player's VP" }];
      case 'gain':
        return [
          { value: 'played-hand', label: "Played owner's hand" }, { value: 'played-top', label: "Played owner's draw top" }, { value: 'played-discard', label: "Played owner's discard" },
          { value: 'other-hand', label: "Other player's hand" }, { value: 'other-top', label: "Other player's draw top" }, { value: 'other-discard', label: "Other player's discard" },
        ];
      case 'move':
        return [
          { value: 'this-card', label: 'The card that was played' },
          { value: 'either', label: 'A card · either side' },
          { value: 'played', label: "Played owner's side" },
          { value: 'other', label: "Other player's side" },
          { value: 'both', label: 'Both sides (one each)' },
          { value: 'your-previous-card', label: "Played owner's previously revealed card" },
          { value: 'your-next-card', label: "Played owner's next revealed card" },
          { value: 'opponent-previous-card', label: "Other player's previously revealed card" },
          { value: 'opponent-next-card', label: "Other player's next revealed card" },
        ];
      case 'gainPower': case 'drainPower':
        return [
          { value: 'either', label: 'Random/choice card · either side' },
          { value: 'played', label: "Played owner's side" },
          { value: 'other', label: "Other player's side" },
          { value: 'both', label: 'Both sides' },
          { value: 'your-card', label: "Played owner's revealed card" },
          { value: 'opponent-card', label: "Other player's revealed card" },
          { value: 'your-previous-card', label: "Played owner's previously revealed card" },
          { value: 'your-next-card', label: "Played owner's next revealed card" },
          { value: 'opponent-previous-card', label: "Other player's previously revealed card" },
          { value: 'opponent-next-card', label: "Other player's next revealed card" },
        ];
      case 'drain':
        return [
          { value: 'other-automatic', label: 'Other · automatic' }, { value: 'other-primary', label: 'Other · Primary' }, { value: 'other-backup', label: 'Other · Backup' },
          { value: 'played-automatic', label: "Played owner · automatic" }, { value: 'played-primary', label: 'Played owner · Primary' }, { value: 'played-backup', label: 'Played owner · Backup' },
        ];
      case 'restore':
        return [
          { value: 'played-automatic', label: 'Played owner · automatic' }, { value: 'played-primary', label: 'Played owner · Primary' }, { value: 'played-backup', label: 'Played owner · Backup' },
          { value: 'other-automatic', label: 'Other · automatic' }, { value: 'other-primary', label: 'Other · Primary' }, { value: 'other-backup', label: 'Other · Backup' },
        ];
      case 'mill':
        return [{ value: 'other-draw', label: "Other player's draw pile" }, { value: 'played-draw', label: "Played owner's draw pile" }];
      case 'scry':
        return [{ value: 'played-draw', label: "Played owner's draw pile" }, { value: 'other-draw', label: "Other player's draw pile" }];
      case 'recover':
        return [{ value: 'shared-trash', label: "Shared Trash → played owner's discard" }];
      case 'trashSelf':
        return [{ value: 'this-card', label: 'The card that was played' }];
      case 'selfDestroyBackup':
        return [{ value: 'played-backup', label: "Played owner's Backup" }, { value: 'other-backup', label: "Other player's Backup" }];
      case 'attachModifier':
        return attachModifierTargetChoices("Played owner's", "Other player's", "played owner's");
      case 'boostPowerAtLocation':
        return [
          { value: 'either', label: 'All revealed here' },
          { value: 'played', label: "Played owner's revealed cards" },
          { value: 'other', label: "Other player's revealed cards" },
          { value: 'both', label: 'All revealed cards (both sides)' },
        ];
      default:
        return [{ value: recipeTarget(recipe, scope), label: recipeTarget(recipe, scope) }];
    }
  }
  if (scope === 'location') {
    switch (op) {
      case 'draw': case 'handDiscard': case 'handTrash':
        return [{ value: 'winner-hand', label: "Winning player's hand" }, { value: 'loser-hand', label: "Losing player's hand" }];
      case 'actions':
        return [{ value: 'winner-actions', label: "Winning player's Actions" }, { value: 'loser-actions', label: "Losing player's Actions" }];
      case 'crypto':
        return [{ value: 'winner-wallet', label: "Winning player's wallet" }, { value: 'loser-wallet', label: "Losing player's wallet" }];
      case 'vp':
        return [{ value: 'winner-vp', label: "Winning player's VP" }, { value: 'loser-vp', label: "Losing player's VP" }];
      case 'gain':
        return [
          { value: 'winner-hand', label: "Winner's hand" }, { value: 'winner-top', label: "Winner's draw top" }, { value: 'winner-discard', label: "Winner's discard" },
          { value: 'loser-hand', label: "Loser's hand" }, { value: 'loser-top', label: "Loser's draw top" }, { value: 'loser-discard', label: "Loser's discard" },
        ];
      case 'gainPower': case 'drainPower': case 'move':
        return [
          { value: 'either', label: 'A card · either side' },
          { value: 'winner', label: "Winner's side" },
          { value: 'loser', label: "Loser's side" },
          { value: 'both', label: 'Both sides (one each)' },
          { value: 'your-card', label: "Winner's revealed card" },
          { value: 'opponent-card', label: "Loser's revealed card" },
          { value: 'your-previous-card', label: "Winner's previously revealed card" },
          { value: 'your-next-card', label: "Winner's next revealed card" },
          { value: 'opponent-previous-card', label: "Loser's previously revealed card" },
          { value: 'opponent-next-card', label: "Loser's next revealed card" },
        ];
      case 'drain':
        return [
          { value: 'loser-automatic', label: 'Loser · automatic' }, { value: 'loser-primary', label: 'Loser · Primary' }, { value: 'loser-backup', label: 'Loser · Backup' },
          { value: 'winner-automatic', label: 'Winner · automatic' }, { value: 'winner-primary', label: 'Winner · Primary' }, { value: 'winner-backup', label: 'Winner · Backup' },
        ];
      case 'restore':
        return [
          { value: 'winner-automatic', label: 'Winner · automatic' }, { value: 'winner-primary', label: 'Winner · Primary' }, { value: 'winner-backup', label: 'Winner · Backup' },
          { value: 'loser-automatic', label: 'Loser · automatic' }, { value: 'loser-primary', label: 'Loser · Primary' }, { value: 'loser-backup', label: 'Loser · Backup' },
        ];
      case 'mill':
        return [{ value: 'loser-draw', label: "Loser's draw pile" }, { value: 'winner-draw', label: "Winner's draw pile" }];
      case 'scry':
        return [{ value: 'winner-draw', label: "Winner's draw pile" }, { value: 'loser-draw', label: "Loser's draw pile" }];
      case 'recover':
        return [{ value: 'shared-trash', label: 'Shared Trash → winner discard' }];
      case 'selfDestroyBackup':
        return [{ value: 'winner-backup', label: "Winner's Backup" }, { value: 'loser-backup', label: "Loser's Backup" }];
      case 'attachModifier':
        return attachModifierTargetChoices("Winning player's", "Losing player's", "winner's");
      case 'boostPowerAtLocation':
        return [
          { value: 'either', label: 'All revealed here' },
          { value: 'winner', label: "Winner's revealed cards" },
          { value: 'loser', label: "Loser's revealed cards" },
          { value: 'both', label: 'All revealed cards (both sides)' },
        ];
      default:
        return [{ value: recipeTarget(recipe, scope), label: recipeTarget(recipe, scope) }];
    }
  }
  if (scope === 'circuit') {
    switch (op) {
      case 'draw': case 'handDiscard': case 'handTrash':
        return [{ value: 'eligible-hand', label: "Eligible player's hand" }, { value: 'other-hand', label: "Other player's hand" }];
      case 'actions':
        return [{ value: 'eligible-actions', label: "Eligible player's Actions" }, { value: 'other-actions', label: "Other player's Actions" }];
      case 'crypto':
        return [{ value: 'eligible-wallet', label: "Eligible player's wallet" }, { value: 'other-wallet', label: "Other player's wallet" }];
      case 'vp':
        return [{ value: 'eligible-vp', label: "Eligible player's VP" }, { value: 'other-vp', label: "Other player's VP" }];
      case 'gain':
        return [
          { value: 'eligible-hand', label: "Eligible hand" }, { value: 'eligible-top', label: "Eligible draw top" }, { value: 'eligible-discard', label: "Eligible discard" },
          { value: 'other-hand', label: "Other hand" }, { value: 'other-top', label: "Other draw top" }, { value: 'other-discard', label: "Other discard" },
        ];
      case 'gainPower': case 'drainPower': case 'move':
        return boardCardTargetChoices("Eligible player's", "Other player's", op === 'move');
      case 'drain':
        return [
          { value: 'other-automatic', label: 'Other · automatic' }, { value: 'other-primary', label: 'Other · Primary' }, { value: 'other-backup', label: 'Other · Backup' },
          { value: 'eligible-automatic', label: 'Eligible · automatic' }, { value: 'eligible-primary', label: 'Eligible · Primary' }, { value: 'eligible-backup', label: 'Eligible · Backup' },
        ];
      case 'restore':
        return [
          { value: 'eligible-automatic', label: 'Eligible · automatic' }, { value: 'eligible-primary', label: 'Eligible · Primary' }, { value: 'eligible-backup', label: 'Eligible · Backup' },
          { value: 'other-automatic', label: 'Other · automatic' }, { value: 'other-primary', label: 'Other · Primary' }, { value: 'other-backup', label: 'Other · Backup' },
        ];
      case 'mill':
        return [{ value: 'other-draw', label: "Other player's draw pile" }, { value: 'eligible-draw', label: "Eligible player's draw pile" }];
      case 'scry':
        return [{ value: 'eligible-draw', label: "Eligible player's draw pile" }, { value: 'other-draw', label: "Other player's draw pile" }];
      case 'recover':
        return [{ value: 'shared-trash', label: 'Shared Trash → eligible discard' }];
      case 'selfDestroyBackup':
        return [{ value: 'eligible-backup', label: "Eligible player's Backup" }, { value: 'other-backup', label: "Other player's Backup" }];
      case 'attachModifier':
        return attachModifierTargetChoices("Eligible player's", "Other player's", "eligible player's");
      default:
        return [{ value: recipeTarget(recipe, scope), label: recipeTarget(recipe, scope) }];
    }
  }
  switch (op) {
    case 'draw': case 'handDiscard': case 'handTrash': return [{ value: 'your-hand', label: 'Your hand' }, { value: 'opponent-hand', label: 'Opponent hand' }];
    case 'actions': return [{ value: 'your-actions', label: 'Your Actions' }, { value: 'opponent-actions', label: 'Opponent Actions' }];
    case 'crypto': return [{ value: 'your-wallet', label: 'Your wallet' }, { value: 'opponent-wallet', label: 'Opponent wallet' }];
    case 'vp': return [{ value: 'your-vp', label: 'Your VP' }, { value: 'opponent-vp', label: 'Opponent VP' }];
    case 'gain': return [
      { value: 'your-hand', label: 'Your hand' }, { value: 'your-top', label: 'Your draw pile top' }, { value: 'your-discard', label: 'Your discard' },
      { value: 'opponent-hand', label: 'Opponent hand' }, { value: 'opponent-top', label: 'Opponent draw pile top' }, { value: 'opponent-discard', label: 'Opponent discard' },
    ];
    case 'move': return boardCardTargetChoices('Your', 'Opponent', true);
    case 'gainPower': case 'drainPower': case 'destroyCard': return boardCardTargetChoices('Your', 'Opponent');
    case 'drain': return [
      { value: 'opponent-automatic', label: 'Opponent · automatic' }, { value: 'opponent-primary', label: 'Opponent · Primary' }, { value: 'opponent-backup', label: 'Opponent · Backup' },
      { value: 'your-automatic', label: 'Your · automatic' }, { value: 'your-primary', label: 'Your · Primary' }, { value: 'your-backup', label: 'Your · Backup' },
    ];
    case 'restore': return [
      { value: 'your-automatic', label: 'Your · automatic' }, { value: 'your-primary', label: 'Your · Primary' }, { value: 'your-backup', label: 'Your · Backup' },
      { value: 'opponent-automatic', label: 'Opponent · automatic' }, { value: 'opponent-primary', label: 'Opponent · Primary' }, { value: 'opponent-backup', label: 'Opponent · Backup' },
    ];
    case 'transferPower': return [{ value: 'your-neighboring-nodes', label: 'Your neighboring Nodes' }];
    case 'mill': return [{ value: 'opponent-draw', label: 'Opponent draw pile' }, { value: 'your-draw', label: 'Your draw pile' }];
    case 'scry': return [{ value: 'your-draw', label: 'Your draw pile' }, { value: 'opponent-draw', label: 'Opponent draw pile' }];
    case 'recover': return [{ value: 'shared-trash', label: 'Shared Trash → your discard' }];
    case 'trashSelf': case 'morph': return [{ value: 'this-card', label: 'This card' }];
    case 'selfDestroyBackup': return [{ value: 'your-backup', label: 'Your Backup Server' }, { value: 'opponent-backup', label: "Opponent's Backup" }];
    case 'attachModifier': return attachModifierTargetChoices('Your', 'Opponent', 'your');
    default: return [{ value: 'branch-targets', label: 'Set by each branch' }];
  }
}

function defaultOptions(): Recipe['options'] {
  return [
    { id: 'first', label: 'Draw a card', effects: [{ kind: 'draw', amount: 1 }] },
    { id: 'second', label: 'Gain Crypto', effects: [{ kind: 'crypto', amount: 1 }] },
  ];
}

function isOpponentTarget(value: string): boolean {
  return value.startsWith('opponent-') || value.startsWith('loser-') || value.startsWith('other-');
}

export function createRecipe(operation: string, scope: RecipeScope, cards: readonly CatalogCard[]): Recipe {
  const first = enabledCards(cards)[0];
  const character = enabledCards(cards).find(card => card.type === 'Character');
  const locationBoard = scope === 'location' || scope === 'locationPlay';
  switch (operation) {
    case 'move': {
      if (scope === 'card') return { kind: 'moveSelf' };
      if (locationBoard) return { kind: scope === 'locationPlay' ? 'moveSelf' : 'moveCard', boardSide: 'either', cardPick: 'random' };
      return { kind: 'moveCard' };
    }
    case 'gainPower': return { kind: 'modifyPower', amount: 1, ...(locationBoard ? { boardSide: 'either' as const, cardPick: 'random' as const } : {}) };
    case 'drainPower': return { kind: 'modifyPower', amount: -1, ...(locationBoard ? { boardSide: 'either' as const, cardPick: 'random' as const } : {}) };
    case 'transferPower': return { kind: 'transferPower', amount: 1 };
    case 'bump': return { kind: 'bump', amount: 1, zone: 'bank', cardPick: 'choice' };
    case 'destroyCard': return locationBoard ? { kind: 'destroyAtLocation', rank: 'weakest', amount: 1, boardSide: 'either' } : { kind: 'destroyCard', opponent: true };
    case 'trashAtLocation': return { kind: 'trashAtLocation', rank: 'weakest', amount: 1, boardSide: 'either' };
    case 'trashSelf': case 'recover': case 'selfDestroyBackup': return { kind: operation };
    case 'choice': case 'random': return { kind: operation, options: defaultOptions(), ...(operation === 'choice' ? { prompt: 'Choose one effect' } : {}) };
    case 'gain': return { kind: 'gain', amount: 1, cardId: first ? cardDefinitionId(first) : '', destination: 'top' };
    case 'morph': {
      const form = enabledCards(cards).find(card => card.type !== 'Crypto');
      return { kind: 'morph', formIds: form ? [cardDefinitionId(form)] : [], selection: 'sequential' };
    }
    case 'vp': return { kind: 'vp', amount: 1 };
    case 'drain': return scope === 'location' ? { kind: 'drain', amount: 1, opponent: true } : { kind: 'drain', amount: 1 };
    case 'restore': return { kind: 'restore', amount: 1, ...(scope === 'circuit' ? { target: 'primary' as const } : {}) };
    case 'attachModifier': return { kind: 'attachModifier', modifier: 'doublePrintedEffects', ...(character ? {} : {}) };
    case 'boostPowerAtLocation': return { kind: 'boostPowerAtLocation', amount: 1, boardSide: 'both' };
    default: return { kind: operation, amount: 1 };
  }
}

export function changeRecipeOperation(recipe: Recipe, operation: string, scope: RecipeScope, cards: readonly CatalogCard[]): Recipe {
  if (recipeOperation(recipe, scope) === operation) return recipe;
  if (recipe.kind === 'modifyPower' && (operation === 'gainPower' || operation === 'drainPower')) {
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
  if (recipe.kind === 'probability') return { ...recipe, kind: 'transferPower', amount, flow: transferFlow(recipe) };
  if (recipeOperation(recipe, scope) === 'drainPower') return { ...recipe, amount: -amount };
  if (recipe.kind === 'handDiscard' || recipe.kind === 'handTrash') return { ...recipe, amount, ...(recipe.min !== undefined && recipe.min > amount ? { min: amount } : {}) };
  return { ...recipe, amount };
}

/** Legacy "trash lowest" steps become a ranked Trash step the first time they are edited. */
function rankedRemoval(recipe: Recipe): Recipe {
  return recipe.kind === 'trashLowestAtLocation' ? { ...recipe, kind: 'trashAtLocation', rank: recipe.rank ?? 'weakest' } : recipe;
}

export function changeRecipeBoardSide(recipe: Recipe, side: string, scope: RecipeScope): Recipe {
  if (!boardSideChoices(recipe, scope).some(choice => choice.value === side)) return recipe;
  return { ...rankedRemoval(recipe), boardSide: side as Recipe['boardSide'] };
}

export function changeRecipeTarget(recipe: Recipe, value: string, scope: RecipeScope, cards: readonly CatalogCard[] = []): Recipe {
  if (!targetChoices(recipe, scope).some(choice => choice.value === value) || recipeTarget(recipe, scope) === value) return recipe;
  if (isRankedRemoval(recipe)) return { ...rankedRemoval(recipe), rank: value as Recipe['rank'] };
  const op = recipeOperation(recipe, scope);
  const boardSides = new Set(['either', 'winner', 'loser', 'both', 'played', 'other']);
  switch (op) {
    case 'draw': case 'actions': case 'crypto': case 'vp': case 'handDiscard': case 'handTrash': case 'mill': case 'scry': case 'selfDestroyBackup':
      return { ...recipe, opponent: isOpponentTarget(value) };
    case 'gain': {
      const parts = value.split('-');
      const destination = parts[parts.length - 1];
      return { ...recipe, opponent: isOpponentTarget(value), destination: destination === 'hand' || destination === 'top' || destination === 'discard' ? destination : 'top' };
    }
    case 'move': {
      if (value === 'this-card') {
        const { opponent: _opponent, optional: _optional, boardSide: _boardSide, cardRelation: _cardRelation, ...rest } = recipe;
        return { ...rest, kind: 'moveSelf' };
      }
      if (boardSides.has(value)) {
        return { ...recipe, kind: 'moveCard', boardSide: value as Recipe['boardSide'], cardPick: recipe.cardPick ?? 'random', opponent: undefined, cardRelation: undefined };
      }
      const relation = value.endsWith('-previous-card') ? 'previous' as const : value.endsWith('-next-card') ? 'next' as const : undefined;
      return { ...recipe, kind: 'moveCard', opponent: value.startsWith('opponent-') || isOpponentTarget(value), cardRelation: relation, boardSide: undefined };
    }
    case 'destroyCard': {
      const { cardRelation: _cardRelation, ...rest } = recipe;
      const relation = value.endsWith('-previous-card') ? 'previous' as const : value.endsWith('-next-card') ? 'next' as const : undefined;
      return { ...rest, opponent: value.startsWith('opponent-'), ...(relation ? { cardRelation: relation } : {}) };
    }
    case 'gainPower': case 'drainPower':
      if (boardSides.has(value)) return { ...recipe, boardSide: value as Recipe['boardSide'], cardPick: recipe.cardPick ?? 'random', opponent: undefined, cardRelation: undefined };
      {
        const relation = value.endsWith('-previous-card') ? 'previous' as const : value.endsWith('-next-card') ? 'next' as const : undefined;
        return { ...recipe, opponent: value.startsWith('opponent-') || isOpponentTarget(value), cardRelation: relation, boardSide: undefined };
      }
    case 'boostPowerAtLocation':
      if (boardSides.has(value)) return { ...recipe, boardSide: value as Recipe['boardSide'] };
      return recipe;
    case 'bump': return { ...recipe, zone: value.slice(value.lastIndexOf('-') + 1) as Recipe['zone'] };
    case 'drain': case 'restore': {
      const server = value.endsWith('automatic') ? undefined : value.endsWith('primary') ? 'primary' : 'backup';
      return { ...recipe, opponent: isOpponentTarget(value), target: server };
    }
    case 'attachModifier': {
      if (value === 'specific-character') {
        const character = enabledCards(cards).find(card => card.type === 'Character');
        return { ...recipe, cardId: recipe.cardId || (character ? cardDefinitionId(character) : undefined), boardHost: undefined, cardRelation: undefined, opponent: undefined };
      }
      if (value === 'random-character') {
        return { ...recipe, cardId: undefined, boardHost: undefined, cardRelation: undefined, opponent: undefined };
      }
      const relation = value.endsWith('-previous-card') ? 'previous' as const : value.endsWith('-next-card') ? 'next' as const : undefined;
      return {
        ...recipe,
        cardId: undefined,
        boardHost: true,
        opponent: value.startsWith('opponent-') || isOpponentTarget(value),
        cardRelation: relation,
      };
    }
    default: return recipe;
  }
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const bumpZone = (zone: Recipe['zone']) => zone === 'bank' ? 'Effect Bank' : zone === 'wallet' ? 'Crypto wallet' : 'Effect Bank or Crypto wallet';

function boardSidePhrase(side: Recipe['boardSide'] | undefined, scope: RecipeScope): string {
  switch (side) {
    case 'winner': return "the winning player's side";
    case 'loser': return "the losing player's side";
    case 'played': return "the played owner's side";
    case 'other': return "the other player's side";
    case 'both': return 'both sides';
    case 'either':
    default:
      return scope === 'locationPlay' ? 'either side' : 'either side';
  }
}

export function recipeSummary(recipe: Recipe, scope: RecipeScope, cards: readonly CatalogCard[]): string {
  const operation = recipeOperation(recipe, scope);
  const count = recipeCount(recipe, scope) ?? 0;
  const target = recipeTarget(recipe, scope);
  const opp = Boolean(recipe.opponent) || isOpponentTarget(target);
  const who = scope === 'location' ? (opp ? 'the losing player' : 'the winning player')
    : scope === 'locationPlay' ? (opp ? 'the other player' : 'the player who played here')
    : scope === 'circuit' ? (opp ? 'the other player' : 'the eligible player')
      : (opp ? 'the opponent' : 'you');
  const whose = scope === 'location' ? (opp ? "the losing player's" : "the winning player's")
    : scope === 'locationPlay' ? (opp ? "the other player's" : "the player who played here's")
    : scope === 'circuit' ? (opp ? "the other player's" : "the eligible player's")
      : (opp ? "opponent" : 'your');
  const locationCard = scope === 'location' || scope === 'locationPlay';
  const pick = recipe.cardPick === 'choice' ? 'chosen' : 'random';
  const side = boardSidePhrase(recipe.boardSide, scope);

  if (isRankedRemoval(recipe)) {
    const verb = recipe.kind === 'destroyAtLocation' ? 'Destroy' : 'Trash';
    const rank = recipe.rank ?? 'weakest';
    const cardsNoun = count === 1 ? 'revealed card' : 'revealed cards';
    const picked = rank === 'first'
      ? `the first ${count === 1 ? '' : `${count} `}${cardsNoun}`
      : `the ${count === 1 ? '' : `${count} `}${rank} ${cardsNoun}`;
    const where = recipe.boardSide === 'both' ? 'on each side' : recipe.boardSide && recipe.boardSide !== 'either' ? `on ${side}` : 'here';
    return `${verb} ${picked} ${where}.`;
  }

  switch (operation) {
    case 'draw': return `Draw ${plural(count, 'card')} into ${whose} hand.`;
    case 'actions': return `Give ${plural(count, 'Action')} to ${who}.`;
    case 'crypto': return `Give ${count} Crypto to ${whose} wallet.`;
    case 'vp': return count < 0 ? `Remove ${plural(-count, 'Victory Point')} from ${who}.` : `Give ${plural(count, 'Victory Point')} to ${who}.`;
    case 'gain': {
      const name = cards.find(card => cardDefinitionId(card) === recipe.cardId)?.name ?? 'an unavailable card';
      const zone = target.endsWith('-top') ? 'draw pile top' : target.endsWith('-discard') ? 'discard' : 'hand';
      return `Gain ${count} ${name}${count === 1 ? '' : ' cards'} into ${whose} ${zone}.`;
    }
    case 'move': {
      if (target === 'this-card') return `Move ${scope === 'locationPlay' ? 'the card that was played' : 'this card'} to another open Node.`;
      if (locationCard && recipe.cardRelation) {
        const relation = recipe.cardRelation === 'previous' ? 'previously revealed' : 'next revealed';
        return `Move ${opp ? `${whose} ${relation}` : `${whose} ${relation}`} card to another open Node.`;
      }
      if (locationCard) {
        const how = recipe.cardPick === 'choice' ? 'Choose' : 'Move a random';
        if (recipe.boardSide === 'both') return `${how === 'Choose' ? 'Choose one revealed card on each side and move them' : 'Move one random revealed card on each side'} to other open Nodes.`;
        return `${how} revealed card on ${side} to another open Node.`;
      }
      const relation = recipe.cardRelation === 'previous' ? 'previously revealed' : recipe.cardRelation === 'next' ? 'next revealed' : 'revealed';
      return `Move ${opp ? `an opponent ${relation}` : `your ${relation}`} card to another open Node.`;
    }
    case 'morph': {
      const names = (recipe.formIds ?? []).map(id => cards.find(card => cardDefinitionId(card) === id)?.name ?? 'an unavailable form');
      if (!names.length) return 'Choose forms for this card.';
      return recipe.selection === 'random' ? `Morph this card into a random form: ${names.join(' or ')}.` : `Evolve this card through ${names.join(' → ')}.`;
    }
    case 'gainPower': {
      if (locationCard && recipe.cardRelation) {
        const relation = recipe.cardRelation === 'previous' ? 'previously revealed' : 'next revealed';
        return `Add ${count} Power to ${whose} ${relation} card.`;
      }
      if (locationCard) {
        if (recipe.boardSide === 'both') return `Add ${count} Power to a ${pick} revealed card on each side.`;
        return `Add ${count} Power to a ${pick} revealed card on ${side}.`;
      }
      {
        const relation = recipe.cardRelation === 'previous' ? 'previously revealed' : recipe.cardRelation === 'next' ? 'next revealed' : 'revealed';
        return `Add ${count} Power to ${opp ? `an opponent ${relation}` : `your ${relation}`} card.`;
      }
    }
    case 'drainPower': {
      if (locationCard && recipe.cardRelation) {
        const relation = recipe.cardRelation === 'previous' ? 'previously revealed' : 'next revealed';
        return `Remove ${count} Power from ${whose} ${relation} card.`;
      }
      if (locationCard) {
        if (recipe.boardSide === 'both') return `Remove ${count} Power from a ${pick} revealed card on each side.`;
        return `Remove ${count} Power from a ${pick} revealed card on ${side}.`;
      }
      {
        const relation = recipe.cardRelation === 'previous' ? 'previously revealed' : recipe.cardRelation === 'next' ? 'next revealed' : 'revealed';
        return `Remove ${count} Power from ${opp ? `an opponent ${relation}` : `your ${relation}`} card.`;
      }
    }
    case 'transferPower': return `${transferText(count, recipe.direction, transferFlow(recipe))}.`;
    // Always taken from the card owner's opponent; the engine has no other direction for it.
    case 'stealCrypto': return `Steal ${plural(count, 'random Crypto card')} from the opponent's wallet.`;
    case 'bump': {
      const owner = scope === 'card' ? "the opponent's" : scope === 'location' ? "the losing player's" : "the other player's";
      const picked = recipe.cardPick === 'random' ? 'random ' : 'chosen ';
      return `Bump ${count === 1 ? `a ${picked}card` : `${count} ${picked}cards`} from ${owner} ${bumpZone(recipe.zone)} to their discard pile.`;
    }
    case 'drain': return `Drain ${count} from ${whose} ${recipe.target ?? 'available'} Server.`;
    case 'restore': return `Restore ${count} to ${whose} ${recipe.target ?? 'available'} Server.`;
    case 'handDiscard': return `Discard up to ${plural(count, 'card')} from ${whose} hand.`;
    case 'handTrash': return `Trash up to ${plural(count, 'card')} from ${whose} hand.`;
    case 'trashSelf': return scope === 'locationPlay' ? 'Trash the card that was played.' : 'Trash this card.';
    case 'recover': return `Recover one card from shared Trash into ${whose} discard.`;
    case 'mill': return `Mill ${plural(count, 'card')} from ${whose} draw pile into discard.`;
    case 'scry': return `Inspect up to ${plural(count, 'card')} from ${whose} draw pile, then keep, discard, or trash each.`;
    case 'selfDestroyBackup': return `Destroy ${whose} Backup Server.`;
    case 'destroyCard': return `${sentenceCase(`destroy ${cardTargetPhrase(recipe)}`)}.`;
    case 'attachModifier': {
      const host = recipe.cardId
        ? (cards.find(card => cardDefinitionId(card) === recipe.cardId)?.name ?? 'a specific Character')
        : recipe.boardHost
          ? (() => {
            const relation = recipe.cardRelation === 'previous' ? 'previously revealed' : recipe.cardRelation === 'next' ? 'next revealed' : 'revealed';
            return opp ? `an opponent ${relation} card` : `your ${relation} card`;
          })()
          : `a random Character in ${whose} deck`;
      if (recipe.modifier === 'powerAuraAtLocation') return `Attach +${count} Power aura at this Location to ${host}.`;
      if (recipe.modifier === 'movableEachTurn') return `Attach “movable each turn” to ${host}.`;
      return `Attach “printed effects happen twice” to ${host}.`;
    }
    case 'boostPowerAtLocation': {
      if (recipe.boardSide === 'winner' || recipe.boardSide === 'loser' || recipe.boardSide === 'played' || recipe.boardSide === 'other') {
        return `Give +${count} Power to every revealed card on ${side}.`;
      }
      return `Give +${count} Power to every revealed card at this Location.`;
    }
    case 'choice': return recipe.options ? `Choose one of ${(recipe.options as unknown[]).length} effects.` : 'Choose +2 Crypto or draw 1 card.';
    case 'random': return `Resolve one of ${(recipe.options as unknown[] | undefined)?.length ?? 0} random effects.`;
    default: return `Advanced effect: ${recipe.kind}.`;
  }
}

/* A card face prints shorthand tags, not the sentences the recipe editor and Location plates
   show. Anything without a shorthand falls back to its sentence so no step prints blank. */
const signed = (amount: number, noun: string) => `${amount < 0 ? '-' : '+'}${Math.abs(amount)} ${noun}`;
const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/* A card's Drain always hits the opponent and its Restore always heals its owner — the engine
   ignores the opponent flag outside Locations — so the printed side is fixed by the operation. */
const serverNoun = (target: string | undefined) => target === 'backup' ? 'backup server' : 'server';

/** The card a card-scope Power change lands on, phrased as the tail of "+3 Power to …". */
function cardTargetPhrase(recipe: Recipe): string {
  const opponent = Boolean(recipe.opponent);
  if (recipe.cardRelation === 'next') return opponent ? 'the next enemy revealed card' : 'your next revealed card';
  if (recipe.cardRelation === 'previous') return opponent ? 'the previous enemy revealed card' : 'your previously revealed card';
  if (recipe.cardPick === 'random') return opponent ? 'a random enemy revealed card' : 'a random revealed card of yours';
  return opponent ? 'an enemy revealed card' : 'one of your revealed cards';
}

/** Player resources default to the card's owner, so only an enemy recipient is printed. */
function recipientSuffix(recipe: Recipe, amount: number, noun = 'enemy'): string {
  if (!recipe.opponent) return '';
  return amount < 0 ? ` from ${noun}` : ` to ${noun}`;
}

function printedRecipeText(recipe: Recipe): string | null {
  const operation = recipeOperation(recipe, 'card');
  const count = recipeCount(recipe, 'card') ?? 0;
  const amount = recipe.amount ?? 1;
  const opponent = Boolean(recipe.opponent);
  switch (operation) {
    case 'draw': return `+${count} Card${count === 1 ? '' : 's'}${recipientSuffix(recipe, count, 'enemy hand')}`;
    case 'actions': return `${signed(amount, `Action${Math.abs(amount) === 1 ? '' : 's'}`)}${recipientSuffix(recipe, amount)}`;
    case 'crypto': return `${signed(amount, 'Crypto')}${recipientSuffix(recipe, amount)}`;
    case 'vp': return `${signed(amount, `Victory Point${Math.abs(amount) === 1 ? '' : 's'}`)}${recipientSuffix(recipe, amount)}`;
    case 'drain': return `-${count} ${sentenceCase(`enemy ${serverNoun(recipe.target)}`)}`;
    case 'restore': return `Restore ${serverNoun(recipe.target)} +${count}`;
    case 'transferPower': return transferText(count, recipe.direction, transferFlow(recipe));
    case 'stealCrypto': return `Steal ${count === 1 ? 'a Crypto card' : `${count} Crypto cards`} from enemy wallet`;
    case 'bump': return `Bump ${count === 1 ? `a ${recipe.cardPick === 'random' ? 'random ' : ''}card` : `${count} ${recipe.cardPick === 'random' ? 'random ' : ''}cards`} from enemy ${bumpZone(recipe.zone)} to discard`;
    // Card-scope mill always empties the opponent's deck, so the printed side is fixed.
    case 'mill': return `Mill ${plural(count, 'card')} from enemy deck`;
    case 'gainPower': return `${signed(count, 'Power')} to ${cardTargetPhrase(recipe)}`;
    /* Taking Power off your own card reads as a loss; off the opponent's it reads as a steal. */
    case 'drainPower': return opponent
      ? `Steal ${count} Power from ${cardTargetPhrase(recipe)}`
      : `${signed(-count, 'Power')} from ${cardTargetPhrase(recipe)}`;
    case 'destroyCard': return `Destroy ${cardTargetPhrase(recipe)}`;
    case 'selfDestroyBackup': return 'Destroy your backup server';
    case 'trashSelf': return 'Trash this card';
    default: return null;
  }
}

/** Two matching Server steps, one Primary and one Backup, print as a single "both" tag. */
function mergeBothServers(recipes: readonly Recipe[]): (Recipe | { both: Recipe })[] {
  const merged: (Recipe | { both: Recipe })[] = [];
  for (let index = 0; index < recipes.length; index++) {
    const recipe = recipes[index], next = recipes[index + 1];
    const operation = recipeOperation(recipe, 'card');
    const pairable = (operation === 'drain' || operation === 'restore') && next
      && recipeOperation(next, 'card') === operation
      && (recipe.amount ?? 1) === (next.amount ?? 1)
      && Boolean(recipe.opponent) === Boolean(next.opponent)
      && [recipe.target, next.target].sort().join() === 'backup,primary';
    if (pairable) { merged.push({ both: recipe }); index++; continue; }
    merged.push(recipe);
  }
  return merged;
}

function printedCardText(recipes: readonly Recipe[], cards: readonly CatalogCard[]): string {
  const tags = mergeBothServers(recipes).map(entry => {
    if (!('both' in entry)) return { text: printedRecipeText(entry) ?? recipeSummary(entry, 'card', cards), chain: Boolean(entry.chain) };
    const recipe = entry.both, count = recipeCount(recipe, 'card') ?? 0;
    return { text: recipeOperation(recipe, 'card') === 'drain'
      ? `-${count} Both enemy servers`
      : `Restore both servers +${count}`, chain: Boolean(recipe.chain) };
  }).filter(tag => tag.text);
  // A chained step reads "…, then …" into whatever waits on it.
  const phrases: string[] = [];
  tags.forEach((tag, index) => {
    const text = tag.text.replace(/\.$/, '');
    if (index > 0 && tags[index - 1].chain) phrases[phrases.length - 1] += `, then ${text}`;
    else phrases.push(text);
  });
  return phrases.map(phrase => `${phrase}.`).join(' ');
}

/** Join printed-hook summaries into card/location/reward display text. */
export function deriveEffectText(recipes: readonly Recipe[], scope: RecipeScope, cards: readonly CatalogCard[]): string {
  if (scope === 'card') return printedCardText(recipes, cards);
  return recipes.map(recipe => recipeSummary(recipe, scope, cards)).filter(Boolean).join(' ');
}

type LocationCopySource = {
  effects?: readonly Recipe[] | null;
  ongoing?: readonly Recipe[] | null;
  onPlay?: readonly Recipe[] | null;
  schedule?: readonly { at: number; effects: readonly Recipe[] }[] | null;
};

/** Location plate/inspect copy with automatic timing prefixes for each effect hook. */
export function deriveLocationText(location: LocationCopySource, cards: readonly CatalogCard[]): string {
  const parts: string[] = [];
  if (location.effects?.length) {
    parts.push(`${locationTriggerPrefix('onCollapse')} ${deriveEffectText(location.effects, 'location', cards)}`);
  }
  if (location.ongoing?.length) {
    parts.push(`${locationTriggerPrefix('ongoing')} ${deriveEffectText(location.ongoing, 'location', cards)}`);
  }
  if (location.onPlay?.length) {
    parts.push(`${locationTriggerPrefix('onReveal')} ${deriveEffectText(location.onPlay, 'locationPlay', cards)}`);
  }
  for (const entry of location.schedule ?? []) {
    if (!entry.effects?.length) continue;
    parts.push(`${locationTriggerPrefix('afterTurn', entry.at)} ${deriveEffectText(entry.effects, 'location', cards)}`);
  }
  return parts.join(' ');
}

/** Normalize legacy location/circuit kinds into EvaluationEffect-compatible recipes. */
export function normalizeRecipe(recipe: Recipe): Recipe {
  if (recipe.kind === 'damageLoser') return { kind: 'drain', amount: recipe.amount ?? 1, opponent: true };
  if (recipe.kind === 'restorePrimary') return { kind: 'restore', amount: recipe.amount ?? 1, target: 'primary' };
  return recipe;
}
