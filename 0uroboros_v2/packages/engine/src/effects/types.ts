import type { Card, CardType, LegacyEffect } from '../game';

/** Where an effect list lives; it decides who "you" is and which targets make sense. */
export type Scope = 'card' | 'location' | 'locationPlay' | 'locationCondition' | 'circuit' | 'runtimeHack';

/**
 * Whose cards, zones or Servers a step touches, relative to the effect's controller.
 * `both` acts on each player separately; `any` pools both players into one set of candidates.
 * `winner`/`loser` are the Node's controller and the other player (Location effects);
 * `played`/`other` are the owner of the card that triggered an on-play effect and their opponent.
 * `leastVP` is whichever player has fewer total VP when the effect resolves (Location effects); a tie counts
 * like a tied Location's winner.
 */
export type Who = 'self' | 'opponent' | 'both' | 'any' | 'winner' | 'loser' | 'played' | 'other' | 'leastVP';
export type ServerSlot = 'auto' | 'primary' | 'backup' | 'both';
/** `wallet` is the Crypto cards held in hand; `bankOrWallet` offers both. */
export type ZoneId = 'hand' | 'deck' | 'discard' | 'trash' | 'bank' | 'wallet' | 'bankOrWallet' | 'destroyed';
/**
 * `collection` searches the deck, then Discard, then hand. `wallet` is the Crypto cards in hand.
 * `deckTop` and `deckBottom` take matching cards in deck order from that end, so pick modes don't apply.
 */
export type CardWhere = 'board' | 'thisNode' | 'hand' | 'wallet' | 'deck' | 'deckTop' | 'deckBottom' | 'discard' | 'trash' | 'bank' | 'destroyed' | 'collection';
export const DECK_ENDS: readonly CardWhere[] = ['deckTop', 'deckBottom'];
export type CardClass = NonNullable<Card['cardClass']>;
/** `cardClass` matches any one of the listed classes; older content stores a single class. */
export type CardFilter = { cardType?: CardType; cardClass?: CardClass | readonly CardClass[] };
export const filterClasses = (filter?: CardFilter): readonly CardClass[] =>
  filter?.cardClass === undefined ? [] : typeof filter.cardClass === 'string' ? [filter.cardClass] : filter.cardClass;
export type Relation = 'self' | 'previous' | 'next';

export type Target =
  | { type: 'player'; who: Who }
  | { type: 'server'; who: Who; server: ServerSlot }
  | { type: 'zone'; who: Who; zone: ZoneId }
  | { type: 'card'; who: Who; where: CardWhere; relation?: Relation; filter?: CardFilter }
  | { type: 'node'; which: 'this' | 'neighbours' | 'any' };
export type TargetType = Target['type'];

export type PickMode = 'choose' | 'random' | 'all' | 'weakest' | 'strongest' | 'first';
/** How cards are picked from the target's candidates; `chooser` is relative to the controller. */
export type Pick = { mode: PickMode; count?: number; chooser?: 'self' | 'opponent' };

export type ActionId =
  | 'draw' | 'gainActions' | 'gainCrypto' | 'payCrypto' | 'gainVP' | 'gainCard'
  | 'damageServer' | 'repairServer' | 'destroyServer'
  | 'discardCards' | 'trashCards' | 'mill' | 'scry' | 'recover' | 'stealCrypto' | 'bump'
  | 'moveCard' | 'changePower' | 'healCard' | 'restoreCard' | 'destroyCard' | 'trashCard' | 'attachModifier' | 'removeModifier' | 'transferPower' | 'morph'
  | 'createHologram' | 'copyPreviousOnReveal'
  | 'choice' | 'random';

export type ModifierKind = 'doublePrintedEffects' | 'powerAuraAtLocation' | 'movableEachTurn';
export const BUILTIN_MODIFIERS: readonly ModifierKind[] = ['doublePrintedEffects', 'powerAuraAtLocation', 'movableEachTurn'];
export const isBuiltinModifier = (value: unknown): value is ModifierKind => BUILTIN_MODIFIERS.includes(value as ModifierKind);
/** A built-in modifier kind, or the ID of an authored mod. */
export type ModifierRef = ModifierKind | (string & {});

export type ModHook = 'onReveal' | 'onCollapse' | 'recurring';
export const MOD_HOOKS: readonly ModHook[] = ['onReveal', 'onCollapse', 'recurring'];
/** An authored card mod. Once attached, its effects run as the host's own for the rest of the game. */
export type ModDefinition = { id: string; name: string } & { [hook in ModHook]?: EffectStep[] };
export type Destination = 'hand' | 'top' | 'discard' | 'trash';

export type EffectStep = {
  action: ActionId;
  amount?: number;
  target?: Target;
  pick?: Pick;
  /** The controller may decline; with `then`, declining also skips the follow-ups. */
  optional?: boolean;
  /** Fewest cards that must be paid for `then` to run (discard and trash costs). */
  min?: number;
  /** Follow-ups that run only once this step resolved without failing or being skipped. */
  then?: readonly EffectStep[];
  destination?: Destination;
  cardId?: string;
  /**
   * Gain a card: optional pool of definition IDs. When set (and longer than one), each copy is
   * picked from this list (`selection`, default `random`). A single `cardId` still means exactly that card.
   */
  cardIds?: readonly string[];
  /** Attach: the mod to attach. Remove: the mod to strip; absent strips every mod. */
  modifier?: ModifierRef;
  formIds?: readonly string[];
  selection?: 'sequential' | 'random';
  /**
   * Sequential morph (evolve) only: after the last form, wrap back to the first instead of staying there.
   * Evolution advances when the card is cleaned up after being played, not on Reveal.
   */
  cycleForms?: boolean;
  /** Morph only: restore this card to the form it had before morphing, during end-of-Cycle cleanup. */
  resetAfterCycle?: boolean;
  direction?: 'choice' | 'left' | 'right' | 'split';
  flow?: 'either' | 'push' | 'pull';
  /**
   * `changePower` only. Negative amount vs an enemy card normally steals (moves Power onto the source).
   * Set `transfer: false` to remove Power without giving it to the source.
   */
  transfer?: boolean;
  prompt?: string;
  options?: readonly ChoiceOption[];
  /** Choice only: how many options are picked and by whom. Defaults to one, picked by the controller. */
  choose?: { count: number; chooser: 'self' | 'opponent' };
};

/** A Choice or Random branch. A `cost` must be payable for the option to be picked, and is paid first. */
export type ChoiceOption = { id: string; label: string; cost?: readonly EffectStep[]; effects: readonly EffectStep[] };

/** Saved content may still hold pre-catalog effects; they are migrated wherever they are read. */
export type AnyEffect = EffectStep | LegacyEffect;

export const isStep = (effect: AnyEffect): effect is EffectStep => typeof (effect as EffectStep).action === 'string';

/** "You" and "the opponent" of a Location or Circuit effect, written in that scope's terms. */
export function scopedWho(who: 'self' | 'opponent', scope: Scope): Who {
  if (scope === 'location') return who === 'self' ? 'winner' : 'loser';
  if (scope === 'locationPlay') return who === 'self' ? 'played' : 'other';
  // locationCondition, circuit and runtimeHack: you = the seat that met / claimed / unlocked it.
  return who;
}
