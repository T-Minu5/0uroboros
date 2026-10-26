import { CARD_CLASSES, VP_CLASSES, type Card, type CardClass, type PowerSource } from '../game';
import { builtinMod } from '../builtinMods';
import { locationTriggerPrefix } from '../locationTriggers';
import { describeConditionPredicate, type LocationCondition } from '../locationConditions';
import { formatAmount, transferFlow, transferText } from '../transferText';
import {
  DECK_ENDS, MOD_HOOKS, filterClasses, isBuiltinModifier, scopedWho,
  type ActionId, type CardWhere, type ChoiceOption, type Destination, type EffectStep, type ModDefinition, type ModHook, type ModifierKind, type ModifierRef,
  type Pick, type PickMode, type Relation, type Scope, type ServerSlot, type Target, type TargetType, type Who, type ZoneId,
} from './types';

/** Abstract sides a target may take; each scope spells them with its own `Who` values. */
export type Role = 'ally' | 'enemy' | 'both' | 'any';
export type Family = 'Resources' | 'Servers' | 'Zones' | 'Board' | 'Flow';
export const FAMILIES: readonly Family[] = ['Resources', 'Servers', 'Zones', 'Board', 'Flow'];
export const SCOPES: readonly Scope[] = ['card', 'location', 'locationPlay', 'locationCondition', 'circuit'];

const ROLE_WHO: Record<Scope, Record<Role, readonly Who[]>> = {
  card: { ally: ['self'], enemy: ['opponent'], both: ['both'], any: ['any'] },
  location: { ally: ['winner'], enemy: ['loser'], both: ['both'], any: ['any'] },
  locationPlay: { ally: ['played', 'winner'], enemy: ['other', 'loser'], both: ['both'], any: ['any'] },
  locationCondition: { ally: ['self'], enemy: ['opponent'], both: ['both'], any: ['any'] },
  circuit: { ally: ['self'], enemy: ['opponent'], both: ['both'], any: ['any'] },
};

export type NodeWhich = Extract<Target, { type: 'node' }>['which'];
export type TargetSpec =
  | { type: 'player'; roles: readonly Role[] }
  | { type: 'server'; roles: readonly Role[]; servers: readonly ServerSlot[] }
  | { type: 'zone'; roles: readonly Role[]; zones: readonly ZoneId[] }
  | { type: 'card'; roles: readonly Role[]; where: readonly CardWhere[]; relations?: readonly Relation[] }
  | { type: 'node'; which: readonly NodeWhich[] };

export type AmountSpec = { label: string; min: number; max: number; default: number; integer?: false };
export type ActionSpec = {
  id: ActionId;
  label: string;
  family: Family;
  help: string;
  targets?: readonly TargetSpec[];
  amount?: AmountSpec;
  picks?: readonly PickMode[];
  /** Board actions pick a number of cards; zone actions use `amount` as their card count instead. */
  pickCount?: boolean;
  chooser?: boolean;
  optional?: boolean;
  min?: boolean;
  destinations?: readonly Destination[];
  scopes?: readonly Scope[];
};

const PLAYERS: readonly Role[] = ['ally', 'enemy', 'both'];
const SIDES: readonly Role[] = ['ally', 'enemy', 'any', 'both'];
const BOARD: readonly CardWhere[] = ['board', 'thisNode'];
/** Every place a card effect can reach. Crypto has no Power, so Power and mod effects skip the wallet. */
const ANYWHERE: readonly CardWhere[] = [...BOARD, 'hand', 'bank', 'wallet', 'deckTop', 'deckBottom', 'discard'];
const POWERED: readonly CardWhere[] = [...BOARD, 'hand', 'bank', 'deckTop', 'deckBottom'];
const RANKED: readonly PickMode[] = ['choose', 'random', 'all', 'weakest', 'strongest', 'first'];
const player = (roles: readonly Role[] = PLAYERS): TargetSpec => ({ type: 'player', roles });
const server = (roles: readonly Role[], servers: readonly ServerSlot[] = ['auto', 'primary', 'backup', 'both']): TargetSpec => ({ type: 'server', roles, servers });

export const ACTIONS: Readonly<Record<ActionId, ActionSpec>> = {
  draw: { id: 'draw', label: 'Draw cards', family: 'Resources', help: 'Draw from the deck into hand, shuffling Discard in when the deck runs out.', targets: [player()], amount: { label: 'Cards', min: 0, max: 100, default: 1 } },
  gainActions: { id: 'gainActions', label: 'Gain Actions', family: 'Resources', help: 'Actions for the next Runtime turn.', targets: [player()], amount: { label: 'Actions', min: 0, max: 20, default: 1 }, scopes: ['card', 'location', 'locationPlay', 'locationCondition'] },
  gainCrypto: { id: 'gainCrypto', label: 'Gain Crypto', family: 'Resources', help: 'Crypto for the coming Draft.', targets: [player()], amount: { label: 'Crypto', min: 0, max: 100, default: 2 } },
  payCrypto: { id: 'payCrypto', label: 'Pay Crypto', family: 'Resources', help: 'Spend Crypto gained this Cycle. Optional with follow-ups: each targeted player may accept or decline. As a Choice option cost, the option is unavailable without enough Crypto.', targets: [player(['ally', 'both'])], amount: { label: 'Crypto', min: 1, max: 100, default: 1 }, optional: true },
  gainVP: { id: 'gainVP', label: 'Gain Victory Points', family: 'Resources', help: 'Negative amounts take Victory Points away.', targets: [player()], amount: { label: 'Victory Points', min: -100, max: 100, default: 1 } },
  gainCard: { id: 'gainCard', label: 'Gain a card', family: 'Resources', help: 'Create new copies of a card (or a random card from a chosen pool) in hand, on top of the deck, or in Discard.', targets: [{ type: 'zone', roles: PLAYERS, zones: ['hand', 'deck', 'discard'] }], amount: { label: 'Copies', min: 0, max: 100, default: 1 } },
  damageServer: { id: 'damageServer', label: 'Drain', family: 'Servers', help: '"Available" hits the Primary Server, or the Backup once the Primary is gone. Destroying an enemy Server scores destruction VP.', targets: [server(['enemy', 'ally', 'both'])], amount: { label: 'Damage', min: 0, max: 5000, default: 100 } },
  repairServer: { id: 'repairServer', label: 'Repair', family: 'Servers', help: 'Repair Server points, never above the maximum. A destroyed Server cannot be repaired.', targets: [server(['ally', 'enemy', 'both'])], amount: { label: 'Repair', min: 0, max: 5000, default: 100 } },
  destroyServer: { id: 'destroyServer', label: 'Destroy your backup', family: 'Servers', help: 'Set a Server to zero. Scores no destruction VP.', targets: [server(['ally', 'enemy', 'both'], ['backup', 'primary', 'both'])] },
  discardCards: { id: 'discardCards', label: 'Discard', family: 'Zones', help: 'Up to this many cards. With a minimum and follow-ups, it works as a cost.', targets: [{ type: 'card', roles: PLAYERS, where: ['hand'] }], amount: { label: 'Cards', min: 1, max: 20, default: 1 }, picks: ['choose', 'random'], chooser: true, optional: true, min: true },
  trashCards: { id: 'trashCards', label: 'Trash', family: 'Zones', help: 'Up to this many cards go to the shared Trash.', targets: [{ type: 'card', roles: PLAYERS, where: ['hand', 'discard', 'deck'] }], amount: { label: 'Cards', min: 1, max: 20, default: 1 }, picks: ['choose', 'random'], chooser: true, optional: true, min: true },
  mill: { id: 'mill', label: 'Mill', family: 'Zones', help: 'Move cards from the top of a deck.', targets: [{ type: 'zone', roles: PLAYERS, zones: ['deck'] }], amount: { label: 'Cards', min: 0, max: 50, default: 1 }, destinations: ['discard', 'trash'] },
  scry: { id: 'scry', label: 'Inspect', family: 'Zones', help: 'Look at the top cards and keep, discard or trash each.', targets: [{ type: 'zone', roles: PLAYERS, zones: ['deck'] }], amount: { label: 'Cards', min: 1, max: 10, default: 1 } },
  recover: { id: 'recover', label: 'Recover', family: 'Zones', help: 'Take cards back from the shared Trash, your Discard, or your destroyed pile.', targets: [{ type: 'card', roles: ['ally'], where: ['trash', 'destroyed', 'discard'] }], amount: { label: 'Cards', min: 1, max: 10, default: 1 }, picks: ['choose', 'random'], destinations: ['discard', 'hand', 'top'] },
  stealCrypto: { id: 'stealCrypto', label: 'Steal', family: 'Zones', help: 'Take Crypto cards from the enemy wallet into your hand.', targets: [{ type: 'zone', roles: ['enemy'], zones: ['wallet'] }], amount: { label: 'Cards', min: 1, max: 10, default: 1 }, picks: ['random', 'choose'], chooser: true },
  bump: { id: 'bump', label: 'Bump', family: 'Zones', help: 'Send cards from the Effect Bank or wallet to their owner’s Discard.', targets: [{ type: 'zone', roles: ['enemy', 'ally', 'both'], zones: ['bank', 'wallet', 'bankOrWallet'] }], amount: { label: 'Cards', min: 1, max: 10, default: 1 }, picks: ['choose', 'random'], chooser: true },
  moveCard: { id: 'moveCard', label: 'Move a card', family: 'Board', help: 'Move a revealed card to another open Node with room.', targets: [{ type: 'card', roles: SIDES, where: BOARD, relations: ['self', 'previous', 'next'] }], picks: ['choose', 'random'], chooser: true, optional: true },
  changePower: { id: 'changePower', label: 'Add or remove power', family: 'Board', help: 'A lasting change for the rest of the game, wherever the card goes. Taking Power from an enemy card moves it onto this card.', targets: [{ type: 'card', roles: SIDES, where: [...POWERED, 'deck'], relations: ['self', 'previous', 'next'] }], amount: { label: 'Power', min: -100, max: 100, default: 1 }, picks: RANKED, pickCount: true, chooser: true, optional: true },
  healCard: { id: 'healCard', label: 'Restore power', family: 'Board', help: 'Restore a weakened card toward its printed Power, never above it. Boosts are left alone.', targets: [{ type: 'card', roles: SIDES, where: [...POWERED, 'deck', 'discard'], relations: ['self', 'previous', 'next'] }], amount: { label: 'Power', min: 1, max: 100, default: 1 }, picks: ['choose', 'random', 'all', 'weakest', 'strongest'], pickCount: true, chooser: true, optional: true },
  restoreCard: { id: 'restoreCard', label: 'Reset power', family: 'Board', help: 'Reset a card to exactly its printed Power, removing boosts too.', targets: [{ type: 'card', roles: SIDES, where: [...POWERED, 'deck', 'discard'], relations: ['self', 'previous', 'next'] }], picks: ['choose', 'random', 'all', 'weakest', 'strongest'], pickCount: true, chooser: true, optional: true },
  destroyCard: { id: 'destroyCard', label: 'Destroy a card', family: 'Board', help: 'A destroyed card goes to its owner’s destroyed pile, from the board or any of their zones.', targets: [{ type: 'card', roles: SIDES, where: [...ANYWHERE, 'deck'], relations: ['previous', 'next'] }], picks: RANKED, pickCount: true, chooser: true, optional: true },
  trashCard: { id: 'trashCard', label: 'Trash a card', family: 'Board', help: 'A trashed card goes to the shared Trash, from the board or any of its owner’s zones.', targets: [{ type: 'card', roles: SIDES, where: [...ANYWHERE, 'deck'], relations: ['self', 'previous', 'next'] }], picks: RANKED, pickCount: true, chooser: true, optional: true },
  attachModifier: { id: 'attachModifier', label: 'Attach a mod', family: 'Board', help: 'A permanent mod on a Character, on the board or in any zone. Mods stack.', targets: [{ type: 'card', roles: SIDES, where: [...POWERED, 'collection'], relations: ['previous', 'next'] }], amount: { label: 'Aura Power', min: 1, max: 10, default: 1 }, picks: ['choose', 'random', 'first'], chooser: true },
  removeModifier: { id: 'removeModifier', label: 'Remove mods', family: 'Board', help: 'Strip every mod from a card, or every copy of one mod. Only cards carrying a matching mod can be picked.', targets: [{ type: 'card', roles: ['enemy', 'ally', 'any', 'both'], where: [...POWERED, 'collection'], relations: ['self', 'previous', 'next'] }], picks: ['choose', 'random', 'first', 'all'], chooser: true },
  transferPower: { id: 'transferPower', label: 'Node Power', family: 'Board', help: 'Shift this card’s side of Node Power to or from neighbouring Nodes until the Cycle ends.', targets: [{ type: 'node', which: ['neighbours'] }], amount: { label: 'Power', min: 0.5, max: 20, default: 1, integer: false }, scopes: ['card'] },
  morph: { id: 'morph', label: 'Morph', family: 'Board', help: 'Random: transform on resolve and the new form On Reveals. Evolve (sequential): after this card is played, advance one form at cleanup — later forms keep evolving from the same recipe. Cycle forms to wrap the list; optionally reset to the original form at end of Cycle.', scopes: ['card'] },
  choice: { id: 'choice', label: 'Choice', family: 'Flow', help: 'Offer options; each runs its own steps. Options can cost something to pick.' },
  random: { id: 'random', label: 'Random', family: 'Flow', help: 'Run one option picked at random.' },
};

export const ACTION_IDS = Object.keys(ACTIONS) as ActionId[];

/* ---------------------------------------------------------------- editor entries */

/** The Effect menu's groups, in the order the content sheet lists them. */
export type EditorGroup = 'Resources' | 'Servers' | 'Cards' | 'Deck' | 'Node Power' | 'Mods' | 'Flow';
export const EDITOR_GROUPS: readonly EditorGroup[] = ['Resources', 'Servers', 'Cards', 'Deck', 'Node Power', 'Mods', 'Flow'];

/**
 * One option of an entry's Target select. It fixes a card place or play order, a zone, a Server or a
 * transfer direction; `pick` fixes how cards are picked there, e.g. a random deck card.
 */
export type TargetChoice = {
  key: string; label: string;
  pick?: PickMode;
  where?: CardWhere; relation?: Relation; zone?: ZoneId; server?: ServerSlot;
  direction?: NonNullable<EffectStep['direction']>;
};

/** A menu item: an action plus the fields it fixes. Several entries may share one stored action. */
export type EditorEntry = {
  key: string; label: string; group: EditorGroup; action: ActionId;
  /** Stored amount sign; the editor shows the magnitude. */
  sign?: 1 | -1;
  /** Fields the entry fixes on the step. */
  preset?: (scope: Scope) => Partial<EffectStep>;
  /** Hides the target fields: the preset decides the target. */
  fixedTarget?: boolean;
  /** The Target select, in the content sheet's words. Absent: the action's own target fields. */
  targets?: readonly TargetChoice[];
  matches?: (step: EffectStep) => boolean;
};

const cardChoice = (key: string, label: string, where: CardWhere, relation?: Relation): TargetChoice => ({ key, label, where, ...(relation ? { relation } : {}) });
const BOARD_TARGETS: readonly TargetChoice[] = [
  cardChoice('board', 'Any revealed card', 'board'), cardChoice('thisNode', 'Revealed card here', 'thisNode'),
  cardChoice('self', 'This card', 'board', 'self'), cardChoice('next', 'Next revealed card', 'board', 'next'),
  cardChoice('previous', 'Previously revealed card', 'board', 'previous'),
];
const CARD_TARGETS: readonly TargetChoice[] = [
  ...BOARD_TARGETS,
  cardChoice('hand', 'Card in hand', 'hand'), cardChoice('discard', 'Discard pile', 'discard'),
  cardChoice('deckTop', 'Top card', 'deckTop'), cardChoice('deckBottom', 'Bottom card', 'deckBottom'),
  { ...cardChoice('deck', 'Deck (random)', 'deck'), pick: 'random' }, cardChoice('bank', 'Effect Bank', 'bank'),
];
const SERVER_TARGETS: readonly TargetChoice[] = [
  { key: 'auto', label: 'Available', server: 'auto' }, { key: 'both', label: 'Both', server: 'both' }, { key: 'backup', label: 'Backup', server: 'backup' },
];
const NODE_TARGETS: readonly TargetChoice[] = [
  { key: 'left', label: 'Left', direction: 'left' }, { key: 'right', label: 'Right', direction: 'right' },
  { key: 'split', label: 'Between', direction: 'split' }, { key: 'choice', label: 'Choice', direction: 'choice' },
];
const TOP_OF_DECK: readonly TargetChoice[] = [{ key: 'deck', label: 'Top of deck', zone: 'deck' }];
const flowOf = (step: EffectStep) => step.flow ?? 'either';

export const EDITOR_ENTRIES: readonly EditorEntry[] = [
  { key: 'draw', label: 'Draw cards', group: 'Resources', action: 'draw' },
  { key: 'gainActions', label: 'Gain actions', group: 'Resources', action: 'gainActions' },
  { key: 'gainVP', label: 'Gain victory points', group: 'Resources', action: 'gainVP' },
  { key: 'gainCard', label: 'Gain a card', group: 'Resources', action: 'gainCard' },
  { key: 'gainCrypto', label: 'Gain crypto', group: 'Resources', action: 'gainCrypto' },
  { key: 'payCrypto', label: 'Pay', group: 'Resources', action: 'payCrypto' },
  { key: 'damageServer', label: 'Drain', group: 'Servers', action: 'damageServer', targets: SERVER_TARGETS },
  { key: 'repairServer', label: 'Repair', group: 'Servers', action: 'repairServer', targets: SERVER_TARGETS },
  { key: 'destroyServer', label: 'Destroy your backup', group: 'Servers', action: 'destroyServer', fixedTarget: true, preset: scope => ({ target: { type: 'server', who: scopedWho('self', scope), server: 'backup' } }) },
  { key: 'addPower', label: 'Add power', group: 'Cards', action: 'changePower', sign: 1, targets: CARD_TARGETS, matches: step => (step.amount ?? 1) >= 0 },
  { key: 'removePower', label: 'Remove power', group: 'Cards', action: 'changePower', sign: -1, targets: CARD_TARGETS, matches: step => (step.amount ?? 1) < 0 },
  { key: 'healCard', label: 'Restore power', group: 'Cards', action: 'healCard', targets: CARD_TARGETS },
  { key: 'restoreCard', label: 'Reset power', group: 'Cards', action: 'restoreCard', targets: CARD_TARGETS },
  { key: 'trashCard', label: 'Trash a card', group: 'Cards', action: 'trashCard', targets: CARD_TARGETS },
  { key: 'destroyCard', label: 'Destroy a card', group: 'Cards', action: 'destroyCard', targets: CARD_TARGETS.filter(choice => choice.relation !== 'self') },
  { key: 'moveCard', label: 'Move a card', group: 'Cards', action: 'moveCard', targets: BOARD_TARGETS },
  { key: 'morph', label: 'Morph', group: 'Cards', action: 'morph' },
  { key: 'mill', label: 'Mill', group: 'Deck', action: 'mill', targets: TOP_OF_DECK },
  { key: 'discardCards', label: 'Discard', group: 'Deck', action: 'discardCards', targets: [{ key: 'hand', label: 'Hand', where: 'hand' }] },
  {
    key: 'trashCards', label: 'Trash', group: 'Deck', action: 'trashCards',
    targets: [
      { key: 'hand', label: 'Hand', where: 'hand' }, { key: 'discard', label: 'Discard pile', where: 'discard' },
      { key: 'deck', label: 'Deck (random)', where: 'deck', pick: 'random' },
    ],
  },
  { key: 'scry', label: 'Inspect', group: 'Deck', action: 'scry', targets: TOP_OF_DECK },
  { key: 'stealCrypto', label: 'Steal', group: 'Deck', action: 'stealCrypto', targets: [{ key: 'wallet', label: 'Wallet', zone: 'wallet' }] },
  { key: 'bump', label: 'Bump', group: 'Deck', action: 'bump', targets: [{ key: 'bank', label: 'Effect Bank', zone: 'bank' }, { key: 'wallet', label: 'Wallet', zone: 'wallet' }, { key: 'bankOrWallet', label: 'Effect Bank or Wallet', zone: 'bankOrWallet' }] },
  {
    key: 'recover', label: 'Recover', group: 'Deck', action: 'recover',
    targets: [
      { key: 'trash', label: 'Trash pile', where: 'trash' },
      { key: 'discard', label: 'Discard pile', where: 'discard' },
      { key: 'destroyed', label: 'Destroyed pile', where: 'destroyed' },
    ],
  },
  { key: 'push', label: 'Push', group: 'Node Power', action: 'transferPower', targets: NODE_TARGETS, preset: () => ({ flow: 'push' }), matches: step => flowOf(step) === 'push' },
  { key: 'pull', label: 'Pull', group: 'Node Power', action: 'transferPower', targets: NODE_TARGETS, preset: () => ({ flow: 'pull' }), matches: step => flowOf(step) === 'pull' },
  { key: 'pushOrPull', label: "Player's choice", group: 'Node Power', action: 'transferPower', targets: NODE_TARGETS, preset: () => ({ flow: undefined }), matches: step => flowOf(step) === 'either' },
  { key: 'attachModifier', label: 'Attach a mod', group: 'Mods', action: 'attachModifier' },
  { key: 'removeModifier', label: 'Remove mods', group: 'Mods', action: 'removeModifier' },
  { key: 'choice', label: 'Choice', group: 'Flow', action: 'choice' },
  { key: 'random', label: 'Random', group: 'Flow', action: 'random' },
];

/** The menu item a saved step reads as. */
export function editorEntryFor(step: EffectStep): EditorEntry | undefined {
  return EDITOR_ENTRIES.find(entry => entry.action === step.action && (!entry.matches || entry.matches(step)));
}

/** The step a choice produces; `targetChoicesFor` checks it is allowed here. */
export function applyTargetChoice(step: EffectStep, choice: TargetChoice, scope: Scope): EffectStep {
  if (choice.direction) return { ...step, direction: choice.direction };
  let next = { ...step };
  const target = step.target;
  const who = target && 'who' in target ? target.who : scopedWho('self', scope);
  if (choice.server) next.target = { type: 'server', who, server: choice.server };
  else if (choice.zone) next.target = { type: 'zone', who, zone: choice.zone };
  else if (choice.where) {
    const filter = target?.type === 'card' && !choice.relation ? target.filter : undefined;
    next.target = { type: 'card', who, where: choice.where, ...(choice.relation ? { relation: choice.relation } : {}), ...(filter ? { filter } : {}) };
  }
  if (choice.pick) next = { ...next, pick: { mode: choice.pick, ...(next.pick?.count ? { count: next.pick.count } : {}) } };
  return next;
}

/** An entry's Target options that are valid in this scope, e.g. Circuits have no board. */
export function targetChoicesFor(entry: EditorEntry, step: EffectStep, scope: Scope): TargetChoice[] {
  return (entry.targets ?? []).filter(choice => {
    if (choice.direction) return true;
    const next = applyTargetChoice(step, choice, scope);
    return !targetIssue(next.action, next.target, scope);
  });
}

/** The option of `choices` the step currently matches. */
export function currentTargetChoice(step: EffectStep, choices: readonly TargetChoice[]): TargetChoice | undefined {
  const target = step.target;
  return choices.find(choice => {
    if (choice.direction) return (step.direction ?? 'choice') === choice.direction;
    if (choice.server) return target?.type === 'server' && target.server === choice.server;
    if (choice.zone) return target?.type === 'zone' && target.zone === choice.zone;
    if (target?.type !== 'card') return false;
    return target.relation ? choice.relation === target.relation : !choice.relation && choice.where === target.where;
  });
}

/** Switch a step to a menu item: its action, sign and preset, and a target from its list. */
export function applyEditorEntry(step: EffectStep, entry: EditorEntry, scope: Scope, cards: readonly Card[] = []): EffectStep {
  let next = changeAction(step, entry.action, scope, cards);
  if (next === step) next = { ...step };
  if (entry.sign) next.amount = Math.abs(next.amount ?? ACTIONS[entry.action].amount?.default ?? 1) * entry.sign;
  if (entry.preset) next = { ...next, ...entry.preset(scope) };
  if (entry.targets) {
    const choices = targetChoicesFor(entry, next, scope);
    if (choices.length && !currentTargetChoice(next, choices)) next = applyTargetChoice(next, choices[0], scope);
  }
  for (const key of Object.keys(next) as (keyof EffectStep)[]) if (next[key] === undefined) delete next[key];
  return next;
}
/** Steps a Choice option may require as its cost; each is checked for payability before it is offered. */
export const COST_ACTIONS: readonly ActionId[] = ['payCrypto', 'discardCards', 'trashCards', 'gainVP', 'damageServer'];
/** What a mod reference is called: a built-in mod's name or the authored mod's name. */
export function modifierLabel(ref: ModifierRef, mods: readonly { id: string; name: string }[] = []): string {
  return isBuiltinModifier(ref) ? builtinMod(ref).name : mods.find(mod => mod.id === ref)?.name ?? 'an unavailable mod';
}
type ModHooks = { [hook in ModHook]?: readonly EffectStep[] };
export const MOD_HOOK_LABELS: Record<ModHook, string> = { onReveal: 'When revealed', onCollapse: 'When its Location collapses', recurring: 'Each later Runtime turn' };
const MOD_HOOK_GLYPHS: Record<ModHook, string> = { onReveal: '◉', onCollapse: '▼', recurring: '↻' };
const signed = (amount: number) => `${amount < 0 ? '-' : '+'}${formatAmount(Math.abs(amount))}`;
const BADGE_TOKENS: Partial<Record<ActionId, (amount: number) => string>> = {
  draw: amount => `${signed(amount)}C`, gainActions: amount => `${signed(amount)}A`, gainCrypto: amount => `${signed(amount)}₵`, gainVP: amount => `${signed(amount)}VP`,
  changePower: amount => `${signed(amount)}P`, healCard: amount => `+${amount}HP`, damageServer: amount => `-${amount}`, repairServer: amount => `+${amount}♥`,
};
/** A short tag for the card art, generated from what the mod does: trigger glyphs, then its first effect. */
export function modBadge(mod: ModHooks): string {
  const hooks = MOD_HOOKS.filter(hook => mod[hook]?.length);
  if (!hooks.length) return '[MOD]';
  const first = mod[hooks[0]]![0];
  const token = BADGE_TOKENS[first.action]?.(first.amount ?? ACTIONS[first.action].amount?.default ?? 0) ?? ACTIONS[first.action].label.split(' ')[0].slice(0, 4).toUpperCase();
  const more = hooks.reduce((total, hook) => total + mod[hook]!.length, 0) > 1 ? '…' : '';
  return `[${hooks.map(hook => MOD_HOOK_GLYPHS[hook]).join('')}${token}${more}]`;
}
/** A mod's rules text: each trigger's effects under its label. */
export function describeMod(mod: ModHooks, cards: readonly Card[] = [], mods: readonly ModDefinition[] = []): string {
  return MOD_HOOKS.filter(hook => mod[hook]?.length).map(hook => `${MOD_HOOK_LABELS[hook]}: ${describeSteps(mod[hook]!, 'card', cards, mods)}`).join(' ');
}
export const MAX_DEPTH = 5;

/** Who a target may name in this scope, in display order. */
export function whoChoices(spec: TargetSpec, scope: Scope): Who[] {
  if (spec.type === 'node') return [];
  const roles = spec.roles.filter(role => role !== 'any' || spec.type === 'card');
  const standing = (scope === 'location' || scope === 'locationPlay') && spec.type !== 'card' && roles.includes('ally') && roles.includes('enemy') ? ['leastVP' as const] : [];
  return [...new Set([...roles.flatMap(role => ROLE_WHO[scope][role]), ...standing])];
}

/** A target spec trimmed to what the scope can use, or null when nothing is left. Circuits run in Draft with an empty board. */
export function scopedTargetSpec(spec: TargetSpec, scope: Scope): TargetSpec | null {
  if (spec.type === 'node') return scope === 'card' ? spec : null;
  if (spec.type !== 'card') return spec;
  const where = spec.where.filter(place => scope !== 'circuit' || !BOARD.includes(place));
  if (!where.length) return null;
  const relations = scope === 'card' || scope === 'locationPlay' ? spec.relations : undefined;
  return { ...spec, where, ...(relations?.length ? { relations } : { relations: undefined }) };
}

export function targetsFor(action: ActionId, scope: Scope): TargetSpec[] {
  return (ACTIONS[action].targets ?? []).map(spec => scopedTargetSpec(spec, scope)).filter((spec): spec is TargetSpec => spec !== null);
}

export function actionsFor(scope: Scope): ActionSpec[] {
  return ACTION_IDS.map(id => ACTIONS[id]).filter(spec =>
    (spec.scopes ?? SCOPES).includes(scope) && (!spec.targets || targetsFor(spec.id, scope).length > 0));
}

export function defaultTarget(spec: TargetSpec, scope: Scope): Target {
  if (spec.type === 'node') return { type: 'node', which: spec.which[0] };
  const who = whoChoices(spec, scope)[0];
  if (spec.type === 'player') return { type: 'player', who };
  if (spec.type === 'server') return { type: 'server', who, server: spec.servers[0] };
  if (spec.type === 'zone') return { type: 'zone', who, zone: spec.zones[0] };
  return { type: 'card', who, where: spec.where[0] };
}

/** The spec a target matches for this action and scope, if it is allowed at all. */
export function matchTargetSpec(action: ActionId, target: Target | undefined, scope: Scope): TargetSpec | null {
  if (!target) return null;
  return targetsFor(action, scope).find(spec => spec.type === target.type) ?? null;
}

export function targetIssue(action: ActionId, target: Target | undefined, scope: Scope): string | null {
  const specs = targetsFor(action, scope);
  if (!specs.length) return target ? 'this effect takes no target' : null;
  if (!target || typeof target !== 'object') return 'target required';
  const spec = specs.find(entry => entry.type === target.type);
  if (!spec) return `expected a ${specs.map(entry => entry.type).join(' or ')} target here`;
  if (spec.type === 'node') return target.type === 'node' && spec.which.includes(target.which) ? null : `expected ${spec.which.join(' or ')}`;
  const who = (target as { who?: Who }).who;
  const allowed = whoChoices(spec, scope);
  if (!who || !allowed.includes(who)) return `whose: expected ${allowed.join(', ')}`;
  if (spec.type === 'server' && target.type === 'server' && !spec.servers.includes(target.server)) return `server: expected ${spec.servers.join(', ')}`;
  if (spec.type === 'zone' && target.type === 'zone' && !spec.zones.includes(target.zone)) return `zone: expected ${spec.zones.join(', ')}`;
  if (spec.type === 'card' && target.type === 'card') {
    if (!spec.where.includes(target.where)) return `where: expected ${spec.where.join(', ')}`;
    if (target.relation !== undefined) {
      if (!spec.relations?.includes(target.relation)) return 'relation: not available for this effect here';
      if (!BOARD.includes(target.where)) return 'relation: only board cards have a play order';
    }
  }
  return null;
}

/** Authored catalogs mark disabled cards; built-in ones have no flag. */
const enabled = (card: Card) => (card as Card & { enabled?: boolean }).enabled !== false;
const firstFormId = (cards: readonly Card[]) => {
  const form = cards.find(card => enabled(card) && (card.type === 'Character' || card.type === 'VP'));
  return form ? [form.definitionId ?? form.id] : [];
};

export function defaultOptions(scope: Scope): ChoiceOption[] {
  const you = { type: 'player' as const, who: scopedWho('self', scope) };
  return [
    { id: 'option-1', label: '+2 Crypto', effects: [{ action: 'gainCrypto', amount: 2, target: you }] },
    { id: 'option-2', label: '+1 Card', effects: [{ action: 'draw', amount: 1, target: you }] },
  ];
}

/** A new, valid step for the action with sensible defaults. */
export function createStep(action: ActionId, scope: Scope, cards: readonly Card[] = []): EffectStep {
  const spec = ACTIONS[action];
  const step: EffectStep = { action };
  const target = targetsFor(action, scope)[0];
  if (target) step.target = defaultTarget(target, scope);
  if (spec.amount && action !== 'attachModifier') step.amount = spec.amount.default;
  if (spec.picks) step.pick = { mode: spec.picks[0] };
  if (spec.destinations) step.destination = spec.destinations[0];
  if (action === 'gainCard') { const card = cards.find(enabled); if (card) step.cardId = card.definitionId ?? card.id; }
  if (action === 'attachModifier') { step.modifier = 'doublePrintedEffects'; step.target = { type: 'card', who: whoChoices(target!, scope)[0], where: 'collection', filter: { cardType: 'Character' } }; }
  if (action === 'morph') { step.formIds = firstFormId(cards); step.selection = 'sequential'; }
  if (action === 'transferPower') step.direction = 'choice';
  if (action === 'choice' || action === 'random') step.options = defaultOptions(scope);
  return step;
}
const MOD_ACTIONS: readonly ActionId[] = ['attachModifier', 'removeModifier'];

/** Switch a step to another action, keeping whatever still applies (follow-ups, options, a valid target, amount). */
export function changeAction(step: EffectStep, action: ActionId, scope: Scope, cards: readonly Card[] = []): EffectStep {
  if (step.action === action) return step;
  const next = createStep(action, scope, cards);
  const spec = ACTIONS[action];
  if (step.then?.length) next.then = step.then;
  if (step.options?.length && (action === 'choice' || action === 'random')) next.options = step.options;
  if (step.target && !targetIssue(action, step.target, scope)) next.target = step.target;
  if (spec.amount && step.amount !== undefined && action !== 'attachModifier') next.amount = clampAmount(spec.amount, Math.abs(step.amount) * (spec.amount.min < 0 ? Math.sign(step.amount) || 1 : 1));
  if (spec.picks && step.pick && spec.picks.includes(step.pick.mode)) next.pick = step.pick;
  if (spec.optional && step.optional) next.optional = true;
  if (MOD_ACTIONS.includes(action) && MOD_ACTIONS.includes(step.action) && step.modifier) {
    next.modifier = step.modifier;
    if (action === 'removeModifier') delete next.amount;
    else if (step.modifier === 'powerAuraAtLocation') next.amount = 1;
  }
  return next;
}

export function clampAmount(spec: AmountSpec, value: number): number {
  const rounded = spec.integer === false ? Math.round(value * 2) / 2 : Math.round(value);
  return Math.min(spec.max, Math.max(spec.min, Number.isFinite(rounded) ? rounded : spec.default));
}

/* ---------------------------------------------------------------- labels */

/** Editor label for a side: `card` reads as whose cards, zones or Servers ("Yours"), `player` as who acts ("You"). */
export function whoLabel(who: Who, scope: Scope, kind: 'card' | 'player' = 'player'): string {
  const claimer = scope === 'circuit' || scope === 'locationCondition';
  switch (who) {
    case 'self':
      if (scope === 'locationCondition') return kind === 'card' ? "Qualifying seat's" : 'Qualifying seat';
      return scope === 'circuit' ? 'Claimer' : kind === 'card' ? 'Yours' : 'You';
    case 'opponent': return claimer ? 'Other player' : 'Enemy';
    case 'winner': return kind === 'card' ? 'Winning' : 'Winning player';
    case 'loser': return kind === 'card' ? 'Losing' : 'Losing player';
    case 'played': return 'Played card’s owner';
    case 'other': return 'Other player';
    case 'both': return 'Both';
    case 'any': return 'Any side';
    case 'leastVP': return kind === 'card' ? 'Least-VP player’s' : 'Player with the least VP';
  }
}
export const WHERE_LABELS: Record<CardWhere, string> = {
  board: 'Any revealed card', thisNode: 'Revealed at this Location', hand: 'In hand', wallet: 'In the wallet (Crypto in hand)',
  deck: 'Anywhere in the deck', deckTop: 'Top of deck', deckBottom: 'Bottom of deck', discard: 'In Discard',
  trash: 'In the shared Trash', bank: 'In the Effect Bank', destroyed: 'In the destroyed pile', collection: 'In deck, Discard or hand',
};
const PLACE_NOUNS: Partial<Record<CardWhere, string>> = { hand: 'hand', wallet: 'wallet', deck: 'deck', discard: 'Discard', trash: 'Trash', bank: 'Effect Bank', destroyed: 'destroyed pile', collection: 'deck' };
export const ZONE_LABELS: Record<ZoneId, string> = {
  hand: 'Hand', deck: 'Deck', discard: 'Discard', trash: 'Trash', bank: 'Effect Bank', wallet: 'Crypto wallet', bankOrWallet: 'Effect Bank or wallet', destroyed: 'Destroyed pile',
};
export const SERVER_LABELS: Record<ServerSlot, string> = { auto: 'Available Server', primary: 'Primary', backup: 'Backup', both: 'Both Servers' };
export const RELATION_LABELS: Record<Relation, string> = { self: 'This card', previous: 'Previously revealed card', next: 'Next revealed card' };
export const PICK_LABELS: Record<PickMode, string> = { choose: 'Chosen', random: 'Random', all: 'All', weakest: 'Weakest', strongest: 'Strongest', first: 'First revealed' };
export const DESTINATION_LABELS: Record<Destination, string> = { hand: 'Hand', top: 'Top of deck', discard: 'Discard', trash: 'Trash' };
export const TARGET_TYPE_LABELS: Record<TargetType, string> = { player: 'Player', server: 'Server', zone: 'Zone', card: 'Card', node: 'Node' };

/* ---------------------------------------------------------------- printed text */

const plural = (count: number, noun: string) => `${formatAmount(count)} ${noun}${Math.abs(count) === 1 ? '' : 's'}`;
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const cardName = (cards: readonly Card[], id?: string) => cards.find(card => (card.definitionId ?? card.id) === id)?.name;

function subject(who: Who, scope: Scope): string {
  switch (who) {
    case 'self': return 'you';
    case 'opponent': return scope === 'card' ? 'the opponent' : 'the other player';
    case 'winner': return 'the winning player';
    case 'loser': return 'the losing player';
    case 'played': return 'the player who played here';
    case 'other': return 'the other player';
    case 'both': return 'each player';
    case 'any': return 'either player';
    case 'leastVP': return 'the player with the least VP';
  }
}
function possessive(who: Who, scope: Scope): string {
  if (who === 'self') return 'your';
  if (who === 'opponent' && scope === 'card') return 'enemy';
  if (who === 'played') return 'their';
  if (who === 'leastVP') return "the least-VP player's";
  return `${subject(who, scope)}'s`;
}
/** Card faces print short tags and only call out a recipient other than the card's owner. */
function recipient(who: Who, scope: Scope, negative = false, noun = 'enemy'): string {
  if (who === 'self') return '';
  if (who === 'opponent' && scope === 'card') return negative ? ` from ${noun}` : ` to ${noun}`;
  return negative ? ` from ${subject(who, scope)}` : ` to ${subject(who, scope)}`;
}

function serverText(target: Target | undefined, scope: Scope): string {
  if (target?.type !== 'server') return 'server';
  const noun = target.server === 'both' ? 'servers' : target.server === 'backup' ? 'backup server' : target.server === 'primary' ? 'primary server' : 'server';
  const both = target.server === 'both' ? 'both ' : '';
  if (target.who === 'self') return `${both}your ${noun}`;
  if (target.who === 'opponent' && scope === 'card') return `${both}enemy ${noun}`;
  return `${both}${possessive(target.who, scope)} ${noun}`;
}

function sideSuffix(who: Who, scope: Scope): string {
  switch (who) {
    case 'self': return scope === 'card' ? ' of yours' : '';
    case 'winner': return ' on the winning side';
    case 'loser': return ' on the losing side';
    case 'played': return " on the played card's side";
    case 'other': return ' on the other side';
    case 'both': return ' on each side';
    case 'leastVP': return ' on the side with the least VP';
    default: return '';
  }
}

/** "a revealed card of yours", "2 revealed enemy cards here", "all cards here", "your next revealed card". Random picks read unmarked; chosen picks get a "Choose … to …" lead from `describeHead`. */
export function cardTargetText(target: Target | undefined, pick: Pick | undefined, scope: Scope): string {
  if (target?.type !== 'card') return 'a card';
  const enemy = target.who === 'opponent' && scope !== 'circuit' ? 'enemy ' : '';
  if (target.relation === 'self') return scope === 'locationPlay' ? 'the card that was played' : 'this card';
  if (target.relation === 'next') return target.who === 'self' || target.who === 'played' ? 'your next revealed card' : `the next revealed ${enemy}card`;
  if (target.relation === 'previous') return target.who === 'self' || target.who === 'played' ? 'your previously revealed card' : `the previously revealed ${enemy}card`;
  const count = pick?.count ?? 1, mode = pick?.mode ?? 'choose';
  const cardNoun = count === 1 ? 'card' : 'cards';
  if (DECK_ENDS.includes(target.where)) return `the ${target.where === 'deckTop' ? 'top' : 'bottom'} ${count === 1 ? '' : `${count} `}${cardNoun} of ${possessive(target.who, scope)} deck`;
  const onBoard = BOARD.includes(target.where), here = target.where === 'thisNode';
  const place = here ? (scope === 'card' ? ' at this Location' : ' here')
    : onBoard ? '' : ` in ${possessive(target.who, scope)} ${PLACE_NOUNS[target.where] ?? 'deck'}`;
  const side = onBoard ? sideSuffix(target.who, scope) : '';
  if (mode === 'all') {
    const owner = target.who === 'self' && scope === 'card' ? 'your ' : enemy;
    const allSide = target.who === 'both' || target.who === 'self' ? '' : side;
    return `all ${owner}${onBoard && !here ? 'revealed ' : ''}cards${allSide}${place}`;
  }
  const noun = onBoard ? `revealed ${enemy}${cardNoun}` : cardNoun;
  if (mode === 'weakest' || mode === 'strongest') return `the ${count === 1 ? '' : `${count} `}${mode} ${noun}${side}${place}`;
  if (mode === 'first') return `the first ${count === 1 ? '' : `${count} `}${noun}${side}${place}`;
  const article = count === 1 ? (noun.startsWith('enemy') ? 'an' : 'a') : String(count);
  return `${article} ${noun}${side}${place}`;
}

/** Whether a card step's target is picked by a player rather than at random or by rank. */
const isChosen = (step: EffectStep) => step.target?.type === 'card' && !step.target.relation && !DECK_ENDS.includes(step.target.where)
  && step.target.where !== 'collection' && (step.pick?.mode ?? 'choose') === 'choose';
/** "Defeat a card" or, for a chosen target, "Choose a card to defeat". */
function cardAction(step: EffectStep, scope: Scope, imperative: (target: string) => string, infinitive: string): string {
  const target = cardTargetText(step.target, step.pick, scope);
  if (!isChosen(step)) return imperative(target);
  const chooser = step.pick?.chooser === 'opponent' ? 'opponent' : 'self';
  const lead = scope === 'card' ? (chooser === 'self' ? 'Choose' : 'Opponent chooses')
    : scope === 'circuit' && chooser === 'self' ? 'Choose'
    : `${upperFirst(subject(scopedWho(chooser, scope), scope))} chooses`;
  return `${lead} ${target} to ${infinitive}`;
}

function zoneOwner(target: Target | undefined, scope: Scope): string {
  return target && 'who' in target ? possessive(target.who, scope) : 'your';
}

function chooserText(pick: Pick | undefined, scope: Scope): string {
  if (pick?.chooser !== 'opponent') return '';
  return scope === 'card' ? ' (enemy chooses)' : ` (${subject(scopedWho('opponent', scope), scope)} chooses)`;
}

/** One step as printed text: short tags on card faces, sentences on Locations and Circuit rewards. */
export function describeStep(step: EffectStep, scope: Scope, cards: readonly Card[] = [], mods: readonly ModDefinition[] = []): string {
  const head = describeHead(step, scope, cards, mods);
  const then = step.then?.length ? describeList(step.then, scope, cards, mods) : '';
  if (step.optional && then) return `You may ${lowerFirst(head)}. If you do, ${lowerFirst(then)}`;
  if (step.optional) return `You may ${lowerFirst(head)}`;
  return then ? `${head}, then ${lowerFirst(then)}` : head;
}

function describeList(steps: readonly EffectStep[], scope: Scope, cards: readonly Card[], mods: readonly ModDefinition[]): string {
  return steps.map(step => describeStep(step, scope, cards, mods).replace(/\.$/, '')).join(scope === 'card' ? ', ' : '. ');
}

export function optionText(option: ChoiceOption, scope: Scope, cards: readonly Card[] = [], mods: readonly ModDefinition[] = []): string {
  const label = (option.label?.trim() || describeList(option.effects, scope, cards, mods)).replace(/\.$/, '');
  return option.cost?.length ? `${label} (${describeList(option.cost, scope, cards, mods)})` : label;
}

function describeHead(step: EffectStep, scope: Scope, cards: readonly Card[], mods: readonly ModDefinition[]): string {
  const short = scope === 'card';
  const amount = step.amount ?? ACTIONS[step.action]?.amount?.default ?? 0;
  const who = step.target && 'who' in step.target ? step.target.who : 'self';
  switch (step.action) {
    case 'draw': return `+${plural(amount, 'Card')}${recipient(who, scope, false, 'enemy hand')}`;
    case 'gainActions': return `+${plural(amount, 'Action')}${recipient(who, scope)}`;
    case 'gainCrypto': return `+${formatAmount(amount)} Crypto${recipient(who, scope)}`;
    case 'payCrypto': return `Pay ${formatAmount(amount)} Crypto`;
    case 'gainVP': return `${amount < 0 ? '-' : '+'}${formatAmount(Math.abs(amount))} VP${recipient(who, scope, amount < 0)}`;
    case 'gainCard': {
      const pool = step.cardIds?.length ? step.cardIds : step.cardId ? [step.cardId] : [];
      const names = pool.map(id => cardName(cards, id) ?? 'unavailable card');
      const name = names.length > 1
        ? (step.selection === 'sequential' ? names.join(' → ') : `random ${names.join(' or ')}`)
        : (names[0] ?? 'unavailable card');
      const zone = step.target?.type === 'zone' ? step.target.zone : 'deck';
      const owner = possessive(who, scope);
      const where = zone === 'hand' ? (who === 'self' ? '' : ` in ${owner} hand`) : zone === 'discard' ? ` in ${owner} Discard` : ` on top of ${owner} deck`;
      const copies = names.length > 1
        ? (amount === 1 ? name : `${formatAmount(amount)} (${name})`)
        : amount === 1 ? `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}` : `${formatAmount(amount)} ${name}${/s$/i.test(name) ? '' : /(x|z|ch|sh)$/i.test(name) ? 'es' : 's'}`;
      return `Gain ${copies}${where}`;
    }
    case 'damageServer': return short && who === 'opponent'
      ? `-${amount} ${upperFirst(serverText(step.target, scope))}`
      : `Drain -${amount} from ${serverText(step.target, scope)}`;
    case 'repairServer': {
      if (!short || who !== 'self') return `Repair ${serverText(step.target, scope)} +${amount}`;
      const server = step.target?.type === 'server' ? step.target.server : 'auto';
      return server === 'auto' ? `Repair +${amount}` : `Repair ${serverText(step.target, scope).replace(/^your /, '').replace(/^both your /, 'both ')} +${amount}`;
    }
    case 'destroyServer': return `Destroy ${serverText(step.target, scope)}`;
    case 'discardCards':
    case 'trashCards': {
      const verb = step.action === 'discardCards' ? 'Discard' : 'Trash';
      const place = step.target?.type === 'card' ? step.target.where : 'hand';
      const where = place === 'discard' ? 'Discard' : place === 'deck' ? 'deck' : 'hand';
      const min = step.min ?? (step.optional ? 0 : amount);
      const count = min === amount ? plural(amount, 'card') : min ? `${min}–${amount} cards` : `up to ${plural(amount, 'card')}`;
      const random = step.pick?.mode === 'random' ? ' at random' : '';
      return `${verb} ${count} from ${possessive(who, scope)} ${where}${random}${chooserText(step.pick, scope)}`;
    }
    case 'mill': return `Mill ${plural(amount, 'card')} from ${zoneOwner(step.target, scope)} deck${step.destination === 'trash' ? ' into the Trash' : ''}`;
    case 'scry': return `Inspect the top ${plural(amount, 'card')} of ${zoneOwner(step.target, scope)} deck, then keep, discard or trash each`;
    case 'recover': {
      const from = step.target?.type === 'card' && step.target.where === 'destroyed' ? `${possessive(who, scope)} destroyed pile` : 'the shared Trash';
      const to = step.destination === 'hand' ? 'hand' : step.destination === 'top' ? 'deck top' : 'discard';
      return `Recover ${amount === 1 ? 'a' : amount} ${step.pick?.mode === 'random' ? 'random ' : ''}card${amount === 1 ? '' : 's'} from ${from} into ${scope === 'card' ? 'your' : possessive(scopedWho('self', scope), scope)} ${to}`;
    }
    case 'stealCrypto': {
      const random = step.pick?.mode === 'random' ? 'random ' : '';
      const chosen = step.pick?.mode === 'choose' ? (step.pick.chooser === 'opponent' ? ' (their choice)' : ' (your choice)') : '';
      return `Steal ${amount === 1 ? `a ${random}Crypto card` : `${amount} ${random}Crypto cards`} from ${zoneOwner(step.target, scope)} wallet${chosen}`;
    }
    case 'bump': {
      const zone = step.target?.type === 'zone' ? step.target.zone : 'bankOrWallet';
      const random = step.pick?.mode === 'random' ? 'random ' : '';
      return `Bump ${amount === 1 ? `a ${random}card` : `${amount} ${random}cards`} from ${zoneOwner(step.target, scope)} ${ZONE_LABELS[zone].replace('Crypto wallet', 'wallet')} to discard${chooserText(step.pick, scope)}`;
    }
    case 'moveCard': return cardAction(step, scope, target => `Move ${target} to another open Node`, 'move to another open Node');
    case 'changePower': {
      if (amount < 0 && who === 'opponent' && step.target?.type === 'card' && scope === 'card') return cardAction(step, scope, target => `Steal ${-amount} Power from ${target}`, `steal ${-amount} Power from`);
      return amount < 0
        ? cardAction(step, scope, target => `-${-amount} Power from ${target}`, `give -${-amount} Power`)
        : cardAction(step, scope, target => `+${amount} Power to ${target}`, `give +${amount} Power`);
    }
    case 'healCard': return cardAction(step, scope, target => `Restore ${target} +${amount}`, `Restore +${amount}`);
    case 'restoreCard': {
      const several = (step.pick?.count ?? 1) > 1 || step.pick?.mode === 'all';
      return cardAction(step, scope, target => `Reset the Power of ${target}`, `reset ${several ? 'their' : 'its'} Power`);
    }
    case 'destroyCard': return cardAction(step, scope, target => `Destroy ${target}`, 'destroy');
    case 'trashCard': return cardAction(step, scope, target => `Trash ${target}`, 'trash');
    case 'attachModifier': {
      const ref = step.modifier ?? 'doublePrintedEffects';
      const mod = ref === 'powerAuraAtLocation' ? builtinMod('powerAuraAtLocation', step.amount ?? 1).name
        : isBuiltinModifier(ref) ? `“${lowerFirst(builtinMod(ref).name)}”`
        : `the “${modifierLabel(ref, mods)}” mod`;
      if (step.target?.type === 'card' && step.target.where === 'collection') {
        const classes = filterClasses(step.target.filter);
        const host = classes.length
          ? `${/^[AEIO]/.test(classes[0]) ? 'an' : 'a'} ${classes.length > 1 ? `${classes.slice(0, -1).join(', ')} or ${classes.at(-1)}` : classes[0]} ${classes.every(item => VP_CLASSES.includes(item)) ? 'card' : 'Character'}`
          : 'a Character';
        return `Attach ${mod} to ${step.cardId ? cardName(cards, step.cardId) ?? 'a specific Character' : `${host} in ${possessive(who, scope)} deck`}`;
      }
      return cardAction(step, scope, target => `Attach ${mod} to ${target}`, `gain ${mod}`);
    }
    case 'removeModifier': {
      const what = step.modifier ? `“${isBuiltinModifier(step.modifier) ? lowerFirst(builtinMod(step.modifier).name) : modifierLabel(step.modifier, mods)}”` : 'every mod';
      const mode = step.pick?.mode;
      if (step.target?.type === 'card' && step.target.where === 'collection') {
        return `Remove ${what} from ${mode === 'all' ? 'every card' : mode === 'first' ? 'the first card' : 'a card'} carrying ${step.modifier ? 'it' : 'a mod'} in ${possessive(who, scope)} deck, Discard or hand`;
      }
      return cardAction(step, scope, target => `Remove ${what} from ${target}`, `lose ${what}`);
    }
    case 'transferPower': return transferText(amount, step.direction, transferFlow({ direction: step.direction, flow: step.flow }));
    case 'morph': {
      const names = (step.formIds ?? []).map(id => cardName(cards, id) ?? 'an unavailable form');
      if (!names.length) return 'Choose forms for this card';
      const body = step.selection === 'random'
        ? `Morph this card into a random form: ${names.join(' or ')}`
        : `After this card is played, evolve through ${names.join(' → ')}${step.cycleForms ? ', then repeat' : ''}`;
      return step.resetAfterCycle ? `${body}. Reset to its original form at end of Cycle` : body;
    }
    case 'choice': {
      const options = (step.options ?? []).map(option => optionText(option, scope, cards, mods));
      const count = step.choose?.count ?? 1;
      const who = step.choose?.chooser === 'opponent' ? (scope === 'card' ? 'Opponent chooses' : `${upperFirst(subject(scopedWho('opponent', scope), scope))} chooses`) : 'Choose';
      const list = options.length > 1 ? `${options.slice(0, -1).join(', ')} or ${options.at(-1)}` : options[0] ?? 'nothing';
      return `${who} ${count === 1 ? 'one' : count}: ${list}`;
    }
    case 'random': {
      const options = (step.options ?? []).map(option => optionText(option, scope, cards, mods));
      return `At random: ${options.length > 1 ? `${options.slice(0, -1).join(', ')} or ${options.at(-1)}` : options[0] ?? 'nothing'}`;
    }
  }
  return 'Unknown effect';
}

/** A whole effect list as printed text, one sentence per step. */
export function describeSteps(steps: readonly EffectStep[], scope: Scope, cards: readonly Card[] = [], mods: readonly ModDefinition[] = []): string {
  return mergeServerPairs(steps).map(step => `${describeStep(step, scope, cards, mods).replace(/\.$/, '')}.`).join(' ');
}

type CardSteps = {
  onReveal?: readonly EffectStep[];
  onCollapse?: readonly EffectStep[];
  recurring?: readonly EffectStep[];
  schedule?: readonly { at: number; timing?: 'start' | 'end'; effects: readonly EffectStep[] }[];
  duration?: number;
  durationPeriod?: 'cycle' | 'runtime';
  aura?: number;
  selfMove?: 'turn' | 'cycle';
  powerSource?: PowerSource;
};

const POWER_SOURCE_TEXT: Record<PowerSource, string> = {
  trash: 'card in the Trash', destroyed: 'destroyed card', moved: 'card moved this game', movedByOwner: 'card you have moved this game',
};
export const powerSourceText = (source: PowerSource) => `+1 Power for each ${POWER_SOURCE_TEXT[source]}.`;

export const auraText = (amount: number) => `Your other cards here have +${amount} Power.`;
export const selfMoveText = (period: 'turn' | 'cycle') => `Once each ${period === 'turn' ? 'Runtime turn' : 'Cycle'}, you may move this card to another open Node.`;

/** `at` counts the card's Runtime turns, or its Cycles, from the one its form was revealed in. */
const scheduleLead = (at: number, timing: 'start' | 'end' = 'start', unit = 'Runtime turn') => {
  const when = at === 1 ? `next ${unit}` : `${unit} ${at} ${unit === 'Cycle' ? 'Cycles' : 'turns'} from now`;
  return timing === 'end' ? `End of the ${when}` : at === 1 ? `Next ${unit}` : `In ${at} ${unit}s`;
};

/** A card's printed wording from every hook it carries. On reveal reads unprefixed, as on most card faces. */
export function describeCard(card: CardSteps, cards: readonly Card[] = [], mods: readonly ModDefinition[] = []): string {
  const text = (steps: readonly EffectStep[] | undefined) => steps?.length ? describeSteps(steps, 'card', cards, mods) : '';
  const turns = card.durationPeriod === 'runtime';
  const span = card.duration === undefined ? ''
    : card.duration >= 99 ? (turns ? 'every turn' : 'every Cycle')
    : turns ? (card.duration === 1 ? 'for the next turn' : `for the next ${card.duration} turns`)
    : card.duration === 1 ? 'for the next Cycle' : `for the next ${card.duration} Cycles`;
  const scheduled = !!card.schedule?.some(entry => entry.effects.length);
  return [
    card.powerSource ? powerSourceText(card.powerSource) : '',
    text(card.onReveal),
    card.onCollapse?.length ? `On collapse: ${text(card.onCollapse)}` : '',
    card.recurring?.length ? (span ? `${text(card.recurring).replace(/\.$/, '')}, ${span}.` : `${MOD_HOOK_LABELS.recurring}: ${text(card.recurring)}`) : '',
    ...(card.schedule ?? []).filter(entry => entry.effects.length).map(entry => `${scheduleLead(entry.at, entry.timing, turns ? 'Runtime turn' : 'Cycle')}: ${text(entry.effects)}`),
    scheduled && !card.recurring?.length && span && card.duration! < 99 ? `Lasts ${span.replace(/^for the next /, '')}.` : '',
    card.aura ? auraText(card.aura) : '',
    card.selfMove ? selfMoveText(card.selfMove) : '',
  ].filter(Boolean).join(' ');
}

type LocationSteps = {
  effects?: readonly EffectStep[]; ongoing?: readonly EffectStep[]; onPlay?: readonly EffectStep[];
  startTurn2?: readonly EffectStep[]; startTurn3?: readonly EffectStep[];
  conditions?: readonly LocationCondition[];
};
/** One condition: While in play predicate, then reward effects. */
export function describeCondition(condition: LocationCondition, cards: readonly Card[] = [], mods: readonly ModDefinition[] = []): string {
  const reward = condition.effects.length ? describeSteps(condition.effects, 'locationCondition', cards, mods) : '';
  return `${locationTriggerPrefix('whileInPlay')} ${describeConditionPredicate(condition)}${reward ? `, ${reward}` : ''}.`;
}
/** Location plate copy: each hook's effects under its timing prefix. */
export function describeLocation(location: LocationSteps, cards: readonly Card[] = [], mods: readonly ModDefinition[] = []): string {
  const parts: string[] = [];
  if (location.effects?.length) parts.push(`${locationTriggerPrefix('onCollapse')} ${describeSteps(location.effects, 'location', cards, mods)}`);
  if (location.ongoing?.length) parts.push(`${locationTriggerPrefix('ongoing')} ${describeSteps(location.ongoing, 'location', cards, mods)}`);
  if (location.onPlay?.length) parts.push(`${locationTriggerPrefix('onReveal')} ${describeSteps(location.onPlay, 'locationPlay', cards, mods)}`);
  if (location.startTurn2?.length) parts.push(`${locationTriggerPrefix('startTurn', 2)} ${describeSteps(location.startTurn2, 'location', cards, mods)}`);
  if (location.startTurn3?.length) parts.push(`${locationTriggerPrefix('startTurn', 3)} ${describeSteps(location.startTurn3, 'location', cards, mods)}`);
  for (const condition of location.conditions ?? []) parts.push(describeCondition(condition, cards, mods));
  return parts.join(' ');
}

/** Two identical Server steps, one Primary and one Backup, print as a single "both Servers" step. */
function mergeServerPairs(steps: readonly EffectStep[]): EffectStep[] {
  const merged: EffectStep[] = [];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index], next = steps[index + 1];
    const pair = next && (step.action === 'damageServer' || step.action === 'repairServer') && next.action === step.action
      && step.target?.type === 'server' && next.target?.type === 'server' && step.target.who === next.target.who
      && step.amount === next.amount && !step.then && !next.then
      && [step.target.server, next.target.server].sort().join() === 'backup,primary';
    if (pair) { merged.push({ ...step, target: { ...(step.target as Extract<Target, { type: 'server' }>), server: 'both' } }); index++; continue; }
    merged.push(step);
  }
  return merged;
}

/* ---------------------------------------------------------------- validation */

/** `modIds` are the enabled authored mods an attach or remove may name. */
export type ValidationCards = { enabledIds: ReadonlySet<string>; types: ReadonlyMap<string, Card['type']>; modIds?: ReadonlySet<string> };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const STEP_FIELDS = new Set(['action', 'amount', 'target', 'pick', 'optional', 'min', 'then', 'destination', 'cardId', 'cardIds', 'modifier', 'formIds', 'selection', 'cycleForms', 'resetAfterCycle', 'direction', 'flow', 'prompt', 'options', 'choose']);

function amountIssue(spec: AmountSpec, value: unknown): string | null {
  if (spec.integer === false) {
    return typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max && Number.isInteger(value * 2) ? null : `expected a number from ${spec.min} to ${spec.max} in steps of 0.5`;
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= spec.min && value <= spec.max ? null : `expected integer from ${spec.min} to ${spec.max}`;
}

/** Checks an effect list against the catalog. `asCost` limits steps to payable costs aimed at the controller. */
export function validateSteps(value: unknown, path: string, scope: Scope, cards: ValidationCards, errors: string[], depth = 0, asCost = false) {
  if (!Array.isArray(value) || value.length > 64) { errors.push(`${path}: expected an array of up to 64 effects`); return; }
  if (depth > MAX_DEPTH) { errors.push(`${path}: effect nesting exceeds ${MAX_DEPTH} levels`); return; }
  value.forEach((item, index) => validateStep(item, `${path}[${index}]`, scope, cards, errors, depth, asCost));
}

function validateStep(item: unknown, p: string, scope: Scope, cards: ValidationCards, errors: string[], depth: number, asCost: boolean) {
  if (!record(item)) { errors.push(`${p}: expected an effect object`); return; }
  const action = item.action as ActionId;
  const spec = typeof action === 'string' ? ACTIONS[action] : undefined;
  if (!spec) { errors.push(`${p}.action: unknown effect${typeof item.kind === 'string' ? ` (legacy ${item.kind} must be migrated)` : ''}`); return; }
  if (!actionsFor(scope).some(entry => entry.id === action)) { errors.push(`${p}.action: ${spec.label} is not available in ${scope} effects`); return; }
  if (asCost && !COST_ACTIONS.includes(action)) errors.push(`${p}.action: ${spec.label} cannot be an option cost`);
  for (const key of Object.keys(item)) if (!STEP_FIELDS.has(key)) errors.push(`${p}.${key}: unsupported field`);
  const step = item as EffectStep;
  const issue = targetIssue(action, step.target, scope);
  if (issue) errors.push(`${p}.target: ${issue}`);
  if (asCost && step.target && 'who' in step.target && !whoChoices({ type: 'player', roles: ['ally'] }, scope).includes(step.target.who)) errors.push(`${p}.target: a cost is paid by the player choosing`);
  if (step.target?.type === 'card' && step.target.filter !== undefined) {
    const filter = step.target.filter as Record<string, unknown>;
    if (!record(filter)) errors.push(`${p}.target.filter: expected an object`);
    else {
      if (filter.cardType !== undefined && !['Character', 'VP', 'Crypto'].includes(String(filter.cardType))) errors.push(`${p}.target.filter.cardType: expected Character, VP or Crypto`);
      if (Array.isArray(filter.cardClass)) {
        if (!filter.cardClass.length) errors.push(`${p}.target.filter.cardClass: list at least one class or leave it out`);
        for (const value of filter.cardClass) if (!CARD_CLASSES.includes(value as CardClass)) errors.push(`${p}.target.filter.cardClass: unknown class ${String(value)}`);
      } else if (filter.cardClass !== undefined && !CARD_CLASSES.includes(filter.cardClass as CardClass)) errors.push(`${p}.target.filter.cardClass: unknown class`);
    }
  }
  if (spec.amount) {
    if (step.amount !== undefined) { const problem = amountIssue(spec.amount, step.amount); if (problem) errors.push(`${p}.amount: ${problem}`); }
  } else if (step.amount !== undefined) errors.push(`${p}.amount: this effect has no amount`);
  if (action === 'gainCard' && step.amount !== undefined && !(Number.isInteger(step.amount) && step.amount >= 0 && step.amount <= 100)) errors.push(`${p}.amount: gain count must be an integer from 0 to 100`);
  if (step.pick !== undefined) {
    const pick = step.pick as Record<string, unknown>;
    if (!spec.picks) errors.push(`${p}.pick: this effect does not pick cards`);
    else if (!record(pick) || !spec.picks.includes(pick.mode as PickMode)) errors.push(`${p}.pick.mode: expected ${spec.picks.join(', ')}`);
    else {
      if (pick.count !== undefined && (!spec.pickCount || !Number.isSafeInteger(pick.count) || (pick.count as number) < 1 || (pick.count as number) > 10)) errors.push(`${p}.pick.count: expected integer from 1 to 10`);
      if (pick.chooser !== undefined && !['self', 'opponent'].includes(String(pick.chooser))) errors.push(`${p}.pick.chooser: expected self or opponent`);
      if (pick.chooser === 'opponent' && !spec.chooser) errors.push(`${p}.pick.chooser: only you choose for this effect`);
    }
  }
  if (step.optional !== undefined && (typeof step.optional !== 'boolean' || (step.optional && !spec.optional))) errors.push(`${p}.optional: not available for this effect`);
  if (step.min !== undefined) {
    if (!spec.min || !Number.isSafeInteger(step.min) || step.min < 0 || step.min > 20) errors.push(`${p}.min: expected integer from 0 to 20`);
    else if (typeof step.amount === 'number' && step.min > step.amount) errors.push(`${p}.min: cannot exceed amount`);
  }
  if (step.destination !== undefined && !spec.destinations?.includes(step.destination)) errors.push(`${p}.destination: expected ${(spec.destinations ?? []).join(', ') || 'none'}`);
  if (action === 'gainCard') {
    const pool = step.cardIds as unknown;
    if (pool !== undefined) {
      if (!Array.isArray(pool) || pool.length > 64) errors.push(`${p}.cardIds: expected up to 64 IDs`);
      else {
        if (!pool.length) errors.push(`${p}.cardIds: select at least one card`);
        if (new Set(pool).size !== pool.length) errors.push(`${p}.cardIds: each card may appear only once`);
        pool.forEach((id, at) => {
          if (typeof id !== 'string' || !idPattern.test(id) || !cards.enabledIds.has(id)) errors.push(`${p}.cardIds[${at}]: unknown or disabled card ${String(id)}`);
        });
      }
    }
    if (step.cardId !== undefined) {
      if (typeof step.cardId !== 'string' || !idPattern.test(step.cardId)) errors.push(`${p}.cardId: use 1–80 letters, numbers, underscores or hyphens`);
      else if (!cards.enabledIds.has(step.cardId)) errors.push(`${p}.cardId: unknown card ${step.cardId}`);
    }
    if (pool === undefined && step.cardId === undefined) errors.push(`${p}.cardId: pick a card, or a pool of cards`);
    if (step.selection !== undefined && !['sequential', 'random'].includes(String(step.selection))) errors.push(`${p}.selection: expected sequential or random`);
  } else if (step.cardId !== undefined || step.cardIds !== undefined) {
    if (step.cardIds !== undefined) errors.push(`${p}.cardIds: unsupported field`);
    if (step.cardId !== undefined) {
      if (typeof step.cardId !== 'string' || !idPattern.test(step.cardId)) errors.push(`${p}.cardId: use 1–80 letters, numbers, underscores or hyphens`);
      else if (action !== 'attachModifier') errors.push(`${p}.cardId: unsupported field`);
      else if (!cards.enabledIds.has(step.cardId)) errors.push(`${p}.cardId: unknown card ${step.cardId}`);
    }
  }
  if (MOD_ACTIONS.includes(action)) {
    const known = isBuiltinModifier(step.modifier) || (typeof step.modifier === 'string' && !!cards.modIds?.has(step.modifier));
    if (action === 'attachModifier' ? !known : step.modifier !== undefined && !known) errors.push(`${p}.modifier: unknown or disabled mod ${String(step.modifier)}`);
    if (action === 'attachModifier' && step.modifier !== 'powerAuraAtLocation' && step.amount !== undefined) errors.push(`${p}.amount: only a Power aura has an amount`);
  } else if (step.modifier !== undefined) errors.push(`${p}.modifier: unsupported field`);
  if (action === 'morph') {
    const forms = step.formIds as unknown;
    if (!Array.isArray(forms) || forms.length > 64) errors.push(`${p}.formIds: expected up to 64 IDs`);
    else {
      if (!forms.length) errors.push(`${p}.formIds: select at least one form card`);
      if (new Set(forms).size !== forms.length) errors.push(`${p}.formIds: each form may appear only once`);
      forms.forEach((form, at) => {
        if (typeof form !== 'string' || !cards.enabledIds.has(form)) errors.push(`${p}.formIds[${at}]: unknown or disabled form card ${String(form)}`);
        else if (cards.types.get(form) === 'Crypto') errors.push(`${p}.formIds[${at}]: deployed forms must be Character or VP cards`);
      });
    }
    if (step.selection !== undefined && !['sequential', 'random'].includes(String(step.selection))) errors.push(`${p}.selection: expected sequential or random`);
    if (step.cycleForms !== undefined) {
      if (typeof step.cycleForms !== 'boolean') errors.push(`${p}.cycleForms: expected true or false`);
      else if (step.cycleForms && step.selection === 'random') errors.push(`${p}.cycleForms: only for sequential evolution`);
    }
    if (step.resetAfterCycle !== undefined && typeof step.resetAfterCycle !== 'boolean') errors.push(`${p}.resetAfterCycle: expected true or false`);
  } else {
    if (step.formIds !== undefined) errors.push(`${p}.formIds: unsupported field`);
    if (action !== 'gainCard' && step.selection !== undefined) errors.push(`${p}.selection: unsupported field`);
    if (step.cycleForms !== undefined) errors.push(`${p}.cycleForms: unsupported field`);
    if (step.resetAfterCycle !== undefined) errors.push(`${p}.resetAfterCycle: unsupported field`);
  }
  if (action === 'transferPower') {
    if (step.direction !== undefined && !['choice', 'left', 'right', 'split'].includes(String(step.direction))) errors.push(`${p}.direction: expected choice, left, right or split`);
    if (step.flow !== undefined && !['either', 'push', 'pull'].includes(String(step.flow))) errors.push(`${p}.flow: expected either, push or pull`);
  } else {
    if (step.direction !== undefined) errors.push(`${p}.direction: unsupported field`);
    if (step.flow !== undefined) errors.push(`${p}.flow: unsupported field`);
  }
  if (step.prompt !== undefined && (action !== 'choice' || typeof step.prompt !== 'string' || !step.prompt.trim() || step.prompt.length > 500)) errors.push(`${p}.prompt: expected text, at most 500 characters`);
  if (action === 'choice' || action === 'random') validateOptions(step, p, scope, cards, errors, depth);
  else {
    if (step.options !== undefined) errors.push(`${p}.options: unsupported field`);
    if (step.choose !== undefined) errors.push(`${p}.choose: unsupported field`);
  }
  if (step.then !== undefined) validateSteps(step.then, `${p}.then`, scope, cards, errors, depth + 1, asCost);
}

function validateOptions(step: EffectStep, p: string, scope: Scope, cards: ValidationCards, errors: string[], depth: number) {
  const options = step.options as unknown;
  if (!Array.isArray(options) || options.length < 2 || options.length > 12) { errors.push(`${p}.options: expected 2–12 options`); return; }
  const seen = new Set<string>();
  options.forEach((option, index) => {
    const op = `${p}.options[${index}]`;
    if (!record(option)) { errors.push(`${op}: expected an option object`); return; }
    for (const key of Object.keys(option)) if (!['id', 'label', 'cost', 'effects'].includes(key)) errors.push(`${op}.${key}: unsupported field`);
    if (typeof option.id !== 'string' || !idPattern.test(option.id)) errors.push(`${op}.id: use 1–80 letters, numbers, underscores or hyphens`);
    else if (seen.has(option.id)) errors.push(`${op}.id: duplicate ID ${option.id}`);
    else seen.add(option.id);
    if (typeof option.label !== 'string' || !option.label.trim() || option.label.length > 200) errors.push(`${op}.label: required text, at most 200 characters`);
    if (option.cost !== undefined) {
      if (step.action === 'random') errors.push(`${op}.cost: random options cannot cost anything`);
      else validateSteps(option.cost, `${op}.cost`, scope, cards, errors, depth + 1, true);
    }
    validateSteps(option.effects, `${op}.effects`, scope, cards, errors, depth + 1);
  });
  if (step.action === 'choice' && step.choose !== undefined) {
    const choose = step.choose as unknown;
    if (!record(choose)) errors.push(`${p}.choose: expected an object`);
    else {
      if (!Number.isSafeInteger(choose.count) || (choose.count as number) < 1 || (choose.count as number) > options.length) errors.push(`${p}.choose.count: expected integer from 1 to ${options.length}`);
      if (!['self', 'opponent'].includes(String(choose.chooser))) errors.push(`${p}.choose.chooser: expected self or opponent`);
    }
  } else if (step.choose !== undefined) errors.push(`${p}.choose: random effects pick one option`);
}

/** Every action the list uses, nested branches included; used to check migrated content. */
export function collectActions(steps: readonly EffectStep[], into = new Set<string>()): Set<string> {
  for (const step of steps) {
    into.add(step.action);
    if (step.then) collectActions(step.then, into);
    for (const option of step.options ?? []) { collectActions(option.effects, into); if (option.cost) collectActions(option.cost, into); }
  }
  return into;
}
