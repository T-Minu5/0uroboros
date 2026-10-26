import { expandDeck, starterEffects, CARD_CLASSES, POWER_SOURCES, DEFAULT_STARTING_DECK, MIN_STARTING_DECK_SIZE, VP_CLASSES, type Card, type CardClass, type DeckEntry, type LegacyEffect } from '../game';
import { EVALUATION_ALL_CARDS, EVALUATION_BASE_CARDS, EVALUATION_CHAOS_CARDS, EVALUATION_VP_CARDS, EVALUATION_CRYPTO_CARDS, CURRENCY_PILES, DRAFT_OFFER_COUNT, cardGainsCryptoInRange } from '../evaluationMarket';
import { EVALUATION_LOCATIONS, EVALUATION_CIRCUIT_REWARDS, type EvaluationLocation, type CircuitRewardDefinition } from '../content';
import { CARD_ART_PLACEHOLDER } from '../cardArtwork';
import { HISTORIC_SOURCE_METADATA } from '../historicCatalog';
import { describeLocation, validateSteps, type ValidationCards } from '../effects/catalog';
import { liftLocationSchedule, migrateCard, migrateEffects, migrateLocation, migrateRewardEffects } from '../effects/migrate';
import { MOD_HOOKS, isBuiltinModifier, type AnyEffect, type EffectStep, type ModDefinition, type Scope } from '../effects/types';
import { validateLocationCondition, type LocationCondition } from '../locationConditions';
import { BUILTIN_MOD_FIELDS, BUILTIN_MOD_LIMITS, type BuiltinModOverrides } from '../builtinMods';
import { defaultOpponents, isCanonicalProfile, type AuthoredOpponent } from '../ai/opponents';
export type { AuthoredOpponent } from '../ai/opponents';

export type CardPool = 'Base' | 'Chaos' | 'VP' | 'Crypto';
export type { CardClass } from '../game';
type CardHooks = { onReveal?: EffectStep[]; onCollapse?: EffectStep[]; recurring?: EffectStep[]; schedule?: { at: number; timing?: 'start' | 'end'; effects: EffectStep[] }[] };
export type AuthoredCard = Omit<Card, keyof CardHooks> & CardHooks & {
  pool: CardPool;
  enabled: boolean;
  cardClass?: CardClass;
  /** Created only by card effects; any type or class, never offered in Draft. */
  generated?: boolean;
  storyText?: string;
};
type LocationHooks = {
  effects: EffectStep[]; ongoing?: EffectStep[]; onPlay?: EffectStep[];
  startTurn2?: EffectStep[]; startTurn3?: EffectStep[]; conditions?: LocationCondition[];
};
export type AuthoredLocation = Omit<EvaluationLocation, keyof LocationHooks> & LocationHooks & { enabled: boolean };
export type AuthoredCircuitReward = Omit<CircuitRewardDefinition, 'effect' | 'effects'> & { effects: EffectStep[]; enabled: boolean };
export type StartingDeck = { id: string; name: string; cards: DeckEntry[] };
export type AuthoredMod = ModDefinition & { enabled: boolean };
export const CONTENT_VERSION = 2;
export type ContentDocument = {
  version: typeof CONTENT_VERSION;
  cards: AuthoredCard[];
  locations: AuthoredLocation[];
  circuitRewards: AuthoredCircuitReward[];
  /** Absent in older saves; those load with none. */
  mods?: AuthoredMod[];
  /** Edited name, badge or text of the built-in mods; anything left out keeps its default. */
  builtinMods?: BuiltinModOverrides;
  /** Absent in older saves; those load with the default deck. */
  startingDecks?: StartingDeck[];
  activeStartingDeckId?: string;
  /** The AI opponents players can face; absent in older saves, which load with the league's founding baselines. */
  opponents?: AuthoredOpponent[];
};
export type CompiledContent = {
  cards: (Card & Pick<AuthoredCard,'cardClass'|'generated'>)[];
  baseCards: Card[];
  chaosCards: Card[];
  vpCards: Card[];
  cryptoCards: Card[];
  locations: EvaluationLocation[];
  circuitRewards: CircuitRewardDefinition[];
  /** Enabled authored mods. */
  mods?: ModDefinition[];
  /** The active starting deck, one entry per copy, dealt identically to both players. */
  startingDeck: Card[];
  /** The opponents this pack offers, in menu order; the first is the default. */
  opponents: AuthoredOpponent[];
};

export const DEFAULT_DECK_ID = 'deck-standard';
export function defaultStartingDeck(): StartingDeck {
  return { id: DEFAULT_DECK_ID, name: 'Standard', cards: DEFAULT_STARTING_DECK.map(entry => ({ ...entry })) };
}
/** Gives older saves the default deck so the editor and runtime always have one to work with. */
export function withStartingDecks(doc: ContentDocument): ContentDocument {
  if (doc.startingDecks?.length) return doc;
  return { ...doc, startingDecks: [defaultStartingDeck()], activeStartingDeckId: DEFAULT_DECK_ID };
}
export const deckSize = (deck: Pick<StartingDeck, 'cards'>) => deck.cards.reduce((sum, entry) => sum + entry.count, 0);
/** Gives older saves the league's founding opponents so every pack offers someone to play. */
export function withOpponents(doc: ContentDocument): ContentDocument {
  if (doc.opponents?.length) return doc;
  return { ...doc, opponents: defaultOpponents() };
}

function seededCardClass(card:Pick<Card,'type'|'id'|'definitionId'>,pool:CardPool):CardClass|undefined {
  if(card.type!=="Character")return undefined;
  const types=HISTORIC_SOURCE_METADATA[card.definitionId??card.id]?.types??[];
  if(types.includes('power'))return 'Horror';
  if(types.includes('action'))return 'Action';
  if(types.includes('utility'))return 'Utility';
  if(types.includes('attack'))return 'Attack';
  return pool==='Chaos'?'Attack':'Utility';
}
type LegacyCard = Omit<Card, 'onReveal'> & { onReveal: LegacyEffect[]; pool: CardPool };
const EXTRA_CARDS: LegacyCard[] = [
  { id: 'eval-relocation-relay', definitionId: 'eval-relocation-relay', name: 'Relocation Relay', type: 'Character', power: 2, cost: 3, art: CARD_ART_PLACEHOLDER, effect: 'Move one of your revealed cards to another open Node.', onReveal: [{ kind: 'moveCard' }], pool: 'Base' },
  { id: 'eval-hostile-reroute', definitionId: 'eval-hostile-reroute', name: 'Hostile Reroute', type: 'Character', power: 2, cost: 4, art: CARD_ART_PLACEHOLDER, effect: 'Move one opponent revealed card to another open Node.', onReveal: [{ kind: 'moveCard', opponent: true }], pool: 'Chaos' },
  { id: 'eval-signal-amplifier', definitionId: 'eval-signal-amplifier', name: 'Signal Amplifier', type: 'Character', power: 2, cost: 3, art: CARD_ART_PLACEHOLDER, effect: 'Add 2 Power to one of your revealed cards.', onReveal: [{ kind: 'modifyPower', amount: 2 }], pool: 'Base' },
  { id: 'eval-power-siphon', definitionId: 'eval-power-siphon', name: 'Power Siphon', type: 'Character', power: 2, cost: 4, art: CARD_ART_PLACEHOLDER, effect: 'Subtract 2 Power from one opponent revealed card.', onReveal: [{ kind: 'modifyPower', amount: -2, opponent: true }], pool: 'Chaos' },
];

export function createDefaultContent(): ContentDocument {
  const pools = new Map<string, CardPool>();
  for (const [pool, cards] of [['Base', EVALUATION_BASE_CARDS], ['Chaos', EVALUATION_CHAOS_CARDS], ['VP', EVALUATION_VP_CARDS], ['Crypto', EVALUATION_CRYPTO_CARDS]] as const) {
    for (const card of cards) pools.set(card.definitionId ?? card.id, pool);
  }
  const builtIn = EVALUATION_ALL_CARDS.map(card => {
    const pool = pools.get(card.definitionId ?? card.id)!;
    const printed = card.onReveal === undefined && starterEffects[card.name] ? { onReveal: structuredClone(starterEffects[card.name]) } : {};
    return { ...migrateCard(structuredClone({ ...card, ...printed })), pool };
  });
  const cards: AuthoredCard[] = [...builtIn, ...EXTRA_CARDS.map(card => migrateCard(card as unknown as Card) as AuthoredCard)].map(card => {
    const cardClass = card.cardClass ?? seededCardClass(card, card.pool);
    return { ...card, enabled: true, ...(cardClass ? { cardClass } : {}) } as AuthoredCard;
  });
  return {
    version: CONTENT_VERSION,
    cards,
    locations: EVALUATION_LOCATIONS.map(location => ({ ...migrateLocation(structuredClone(location)), enabled: true })),
    circuitRewards: EVALUATION_CIRCUIT_REWARDS.map(({ effect: _effect, effects: _effects, ...reward }) => ({ ...structuredClone(reward), effects: migrateRewardEffects(EVALUATION_CIRCUIT_REWARDS.find(item => item.id === reward.id)!), enabled: true })),
    mods: [],
    startingDecks: [defaultStartingDeck()],
    activeStartingDeckId: DEFAULT_DECK_ID,
    opponents: defaultOpponents(),
  };
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const text = (value: unknown, max = 1000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const integer = (value: unknown, min = 0, max = 1_000_000): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const number = (value: unknown, min = 0, max = 1_000_000): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function extraFields(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]) {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) if (!keys.has(key)) errors.push(`${path}.${key}: unsupported field`);
}
function requiredText(value: unknown, path: string, errors: string[], max = 1000) {
  if (!text(value, max)) errors.push(`${path}: required text, at most ${max} characters`);
}
function requiredId(value: unknown, path: string, errors: string[]) {
  if (!id(value)) errors.push(`${path}: use 1–80 letters, numbers, underscores or hyphens`);
}
function requiredNumber(value: unknown, path: string, errors: string[], min = 0, max = 1_000_000) {
  if (!number(value, min, max)) errors.push(`${path}: must be a finite number from ${min} to ${max}`);
}
function optionalNumber(value: unknown, path: string, errors: string[], min = 0, max = 1_000_000) {
  if (value !== undefined) requiredNumber(value, path, errors, min, max);
}
function idList(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value) || value.length > 64) { errors.push(`${path}: expected up to 64 IDs`); return; }
  value.forEach((entry, index) => requiredId(entry, `${path}[${index}]`, errors));
}
function checkUnique(items: unknown[], path: string, errors: string[]) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!record(item) || !id(item.id)) return;
    if (seen.has(item.id)) errors.push(`${path}[${index}].id: duplicate ID ${item.id}`);
    seen.add(item.id);
  });
}

function validateStartingDecks(value: Record<string, unknown>, enabledIds: ReadonlySet<unknown>, errors: string[]) {
  if (value.startingDecks === undefined) {
    if (value.activeStartingDeckId !== undefined) errors.push('activeStartingDeckId: no starting decks are defined');
    for (const { cardId } of DEFAULT_STARTING_DECK) if (!enabledIds.has(cardId)) errors.push(`cards: ${cardId} is used by the default starting deck and must remain enabled`);
    return;
  }
  if (!Array.isArray(value.startingDecks) || value.startingDecks.length === 0 || value.startingDecks.length > 50) { errors.push('startingDecks: expected 1–50 decks'); return; }
  const decks = value.startingDecks;
  checkUnique(decks, 'startingDecks', errors);
  decks.forEach((deck, index) => {
    const p = `startingDecks[${index}]`;
    if (!record(deck)) { errors.push(`${p}: expected a deck object`); return; }
    extraFields(deck, ['id', 'name', 'cards'], p, errors);
    requiredId(deck.id, `${p}.id`, errors);
    requiredText(deck.name, `${p}.name`, errors, 200);
    if (!Array.isArray(deck.cards) || deck.cards.length > 100) { errors.push(`${p}.cards: expected up to 100 card entries`); return; }
    const seen = new Set<string>();
    let total = 0;
    deck.cards.forEach((entry, at) => {
      const ep = `${p}.cards[${at}]`;
      if (!record(entry)) { errors.push(`${ep}: expected a card entry`); return; }
      extraFields(entry, ['cardId', 'count'], ep, errors);
      requiredId(entry.cardId, `${ep}.cardId`, errors);
      if (id(entry.cardId)) {
        if (!enabledIds.has(entry.cardId)) errors.push(`${ep}.cardId: unknown card ${entry.cardId}`);
        if (seen.has(entry.cardId)) errors.push(`${ep}.cardId: ${entry.cardId} is listed twice; change its count instead`);
        seen.add(entry.cardId);
      }
      if (!integer(entry.count, 1, 40)) errors.push(`${ep}.count: expected integer from 1 to 40`);
      else total += entry.count;
    });
    if (total > 100) errors.push(`${p}.cards: a starting deck holds at most 100 cards`);
    if (deck.id === value.activeStartingDeckId && total < MIN_STARTING_DECK_SIZE) errors.push(`${p}.cards: the deck loaded in new games needs at least ${MIN_STARTING_DECK_SIZE} cards for the opening hand`);
  });
  if (!decks.some(deck => record(deck) && deck.id === value.activeStartingDeckId)) errors.push('activeStartingDeckId: choose which starting deck new games load');
}

function validateOpponents(value: unknown, cardIds: ReadonlySet<unknown>, errors: string[]) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) { errors.push('opponents: expected 1–20 opponents'); return; }
  checkUnique(value, 'opponents', errors);
  value.forEach((item, index) => {
    const p = `opponents[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected an opponent object`); return; }
    extraFields(item, ['id', 'name', 'style', 'profile'], p, errors);
    requiredId(item.id, `${p}.id`, errors);
    requiredText(item.name, `${p}.name`, errors, 40);
    requiredText(item.style, `${p}.style`, errors, 120);
    if (!record(item.profile)) { errors.push(`${p}.profile: expected a strategy profile`); return; }
    if (!isCanonicalProfile(item.profile)) errors.push(`${p}.profile: values outside the strategy bounds or malformed; publish a sanitized profile`);
    for (const cardId of Object.keys(record(item.profile.cardBias) ? item.profile.cardBias : {})) if (!cardIds.has(cardId)) errors.push(`${p}.profile.cardBias.${cardId}: unknown or disabled card`);
  });
}

function validateBuiltinMods(value: unknown, errors: string[]) {
  if (value === undefined) return;
  if (!record(value)) { errors.push('builtinMods: expected an object'); return; }
  for (const [kind, details] of Object.entries(value)) {
    const p = `builtinMods.${kind}`;
    if (!isBuiltinModifier(kind)) { errors.push(`${p}: not a built-in mod`); continue; }
    if (!record(details)) { errors.push(`${p}: expected an object`); continue; }
    extraFields(details, BUILTIN_MOD_FIELDS, p, errors);
    for (const field of BUILTIN_MOD_FIELDS) if (details[field] !== undefined) requiredText(details[field], `${p}.${field}`, errors, BUILTIN_MOD_LIMITS[field]);
  }
}

export function validateContent(value: unknown): string[] {
  const errors: string[] = [];
  if (!record(value)) return ['document: expected an object'];
  extraFields(value, ['version', 'cards', 'locations', 'circuitRewards', 'mods', 'builtinMods', 'startingDecks', 'activeStartingDeckId', 'opponents'], 'document', errors);
  validateBuiltinMods(value.builtinMods, errors);
  if (value.version !== CONTENT_VERSION) errors.push(`version: expected ${CONTENT_VERSION}${value.version === 1 ? ' (load the document through upgradeDocument first)' : ''}`);
  for (const field of ['cards', 'locations', 'circuitRewards'] as const) {
    if (!Array.isArray(value[field])) errors.push(`${field}: expected an array`);
    else if (value[field].length > 500) errors.push(`${field}: limit is 500`);
  }
  const cards = Array.isArray(value.cards) ? value.cards.slice(0, 501) : [];
  const locations = Array.isArray(value.locations) ? value.locations.slice(0, 501) : [];
  const rewards = Array.isArray(value.circuitRewards) ? value.circuitRewards.slice(0, 501) : [];
  checkUnique(cards, 'cards', errors); checkUnique(locations, 'locations', errors); checkUnique(rewards, 'circuitRewards', errors);
  const identities = new Set<string>();
  cards.forEach((card, index) => {
    if (!record(card)) return;
    const identity = card.definitionId ?? card.id;
    if (!id(identity)) return;
    if (identities.has(identity)) errors.push(`cards[${index}].definitionId: duplicate definition ID ${identity}`);
    identities.add(identity);
  });
  const enabledCards = cards.filter(record).filter(card => card.enabled === true);
  const cardIds = new Set(enabledCards.map(card => card.definitionId ?? card.id).filter(id));
  if (value.mods !== undefined && (!Array.isArray(value.mods) || value.mods.length > 200)) errors.push('mods: expected up to 200 mods');
  const mods = Array.isArray(value.mods) ? value.mods.slice(0, 201) : [];
  checkUnique(mods, 'mods', errors);
  const modIds = new Set(mods.filter(record).filter(mod => mod.enabled === true && id(mod.id)).map(mod => mod.id as string));
  const catalogCards: ValidationCards = { enabledIds: cardIds, types: new Map(enabledCards.map(card => [String(card.definitionId ?? card.id), card.type as Card['type']])), modIds };
  const steps = (list: unknown, path: string, scope: Scope) => validateSteps(list, path, scope, catalogCards, errors);
  cards.forEach((item, index) => {
    const p = `cards[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected a card object`); return; }
    extraFields(item, ['definitionId', 'vp', 'cryptoValue', 'duration', 'durationPeriod', 'schedule', 'recurring', 'onReveal', 'onCollapse', 'id', 'name', 'type', 'power', 'cost', 'art', 'effect', 'storyText', 'pool', 'enabled', 'cardClass', 'generated', 'modifiers', 'powerSource', 'aura', 'selfMove'], p, errors);
    requiredId(item.id, `${p}.id`, errors);
    if (item.definitionId !== undefined) requiredId(item.definitionId, `${p}.definitionId`, errors);
    requiredText(item.name, `${p}.name`, errors, 200);
    requiredText(item.art, `${p}.art`, errors, 1000);
    if (typeof item.effect !== 'string' || item.effect.length > 2000) errors.push(`${p}.effect: expected text up to 2000 characters`);
    if (item.storyText !== undefined && (typeof item.storyText !== 'string' || item.storyText.length > 4000)) errors.push(`${p}.storyText: expected text up to 4000 characters`);
    if (!['Character', 'VP', 'Crypto'].includes(String(item.type))) errors.push(`${p}.type: expected Character, VP or Crypto`);
    if (!['Base', 'Chaos', 'VP', 'Crypto'].includes(String(item.pool))) errors.push(`${p}.pool: invalid pool`);
    if (item.type === 'Character' && !['Base', 'Chaos'].includes(String(item.pool)) || item.type === 'VP' && item.pool !== 'VP' || item.type === 'Crypto' && item.pool !== 'Crypto') errors.push(`${p}.pool: incompatible with card type`);
    if (typeof item.enabled !== 'boolean') errors.push(`${p}.enabled: expected boolean`);
    if(item.generated!==undefined&&typeof item.generated!=='boolean')errors.push(`${p}.generated: expected boolean`);
    if(item.cardClass!==undefined&&!CARD_CLASSES.includes(item.cardClass as CardClass))errors.push(`${p}.cardClass: expected ${CARD_CLASSES.slice(0,-1).join(', ')} or ${CARD_CLASSES.at(-1)}`);
    else if(item.cardClass!==undefined&&item.type==='Crypto')errors.push(`${p}.cardClass: Crypto cards have no subtype`);
    else if(item.cardClass!==undefined&&(item.type==='VP')!==VP_CLASSES.includes(item.cardClass as CardClass))errors.push(`${p}.cardClass: ${item.type==='VP'?'VP cards are Volumes or Solar-monks':`${item.cardClass} is a VP subtype`}`);
    if(item.powerSource!==undefined&&(item.type!=='Character'||!(POWER_SOURCES as readonly unknown[]).includes(item.powerSource)))errors.push(`${p}.powerSource: expected ${POWER_SOURCES.join(', ')} on a Character`);
    if(item.aura!==undefined&&(item.type!=='Character'||!integer(item.aura,1,20)))errors.push(`${p}.aura: expected integer from 1 to 20 on a Character`);
    if(item.selfMove!==undefined&&(item.type!=='Character'||!['turn','cycle'].includes(String(item.selfMove))))errors.push(`${p}.selfMove: expected turn or cycle on a Character`);
    if((item.cardClass==='Hacker'||item.cardClass==='Attack'||item.cardClass==='Horror')&&(item.type!=='Character'||item.pool!=='Chaos'))errors.push(`${p}.cardClass: ${item.cardClass} cards must be Chaos Characters`);
    if((item.cardClass==='Action'||item.cardClass==='Utility'||item.cardClass==='Runtime')&&item.type==='Character'&&item.pool==='Chaos')errors.push(`${p}.cardClass: ${item.cardClass} cards must be Base Characters`);
    if (!integer(item.cost, 0, 1000)) errors.push(`${p}.cost: expected integer from 0 to 1000`);
    if (item.power !== undefined && !integer(item.power, -1000, 1000)) errors.push(`${p}.power: expected integer from -1000 to 1000`);
    if (item.vp !== undefined && !integer(item.vp, -1000, 1000)) errors.push(`${p}.vp: expected integer from -1000 to 1000`);
    if (item.cryptoValue !== undefined && !integer(item.cryptoValue, 0, 1000)) errors.push(`${p}.cryptoValue: expected integer from 0 to 1000`);
    if (item.type === 'Crypto' && item.cryptoValue === undefined) errors.push(`${p}.cryptoValue: Crypto cards require an explicit payout`);
    if (item.type === 'VP' && item.vp === undefined) errors.push(`${p}.vp: VP cards require explicit scoring points`);
    if (item.duration !== undefined && !integer(item.duration, 1, 100)) errors.push(`${p}.duration: expected integer from 1 to 100`);
    if (item.durationPeriod !== undefined && !['runtime', 'cycle'].includes(String(item.durationPeriod))) errors.push(`${p}.durationPeriod: expected runtime or cycle`);
    if ((Array.isArray(item.schedule) && item.schedule.length > 0 || Array.isArray(item.recurring) && item.recurring.length > 0) && !integer(item.duration, 1, 100)) errors.push(`${p}.duration: schedule and recurring effects require a duration`);
    for (const hook of ['onReveal', 'onCollapse', 'recurring']) if (item[hook] !== undefined) steps(item[hook], `${p}.${hook}`, 'card');
    if (item.schedule !== undefined) {
      if (!Array.isArray(item.schedule) || item.schedule.length > 100) errors.push(`${p}.schedule: expected up to 100 entries`);
      else item.schedule.forEach((entry, at) => {
        const sp = `${p}.schedule[${at}]`;
        if (!record(entry)) { errors.push(`${sp}: expected schedule entry`); return; }
        extraFields(entry, ['at', 'timing', 'effects'], sp, errors);
        if (!integer(entry.at, 1, 100)) errors.push(`${sp}.at: expected integer from 1 to 100`);
        if (entry.timing !== undefined && !['start', 'end'].includes(String(entry.timing))) errors.push(`${sp}.timing: expected start or end`);
        steps(entry.effects, `${sp}.effects`, 'card');
      });
    }
  });
  locations.forEach((item, index) => {
    const p = `locations[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected a location object`); return; }
    extraFields(item, ['id', 'name', 'rule', 'reward', 'effects', 'ongoing', 'onPlay', 'startTurn2', 'startTurn3', 'conditions', 'enabled'], p, errors);
    requiredId(item.id, `${p}.id`, errors); requiredText(item.name, `${p}.name`, errors, 200);
    requiredText(item.rule, `${p}.rule`, errors, 2000); requiredText(item.reward, `${p}.reward`, errors, 2000);
    if (typeof item.enabled !== 'boolean') errors.push(`${p}.enabled: expected boolean`);
    steps(item.effects, `${p}.effects`, 'location');
    for (const hook of ['ongoing', 'startTurn2', 'startTurn3']) if (item[hook] !== undefined) steps(item[hook], `${p}.${hook}`, 'location');
    if (item.onPlay !== undefined) steps(item.onPlay, `${p}.onPlay`, 'locationPlay');
    if (item.conditions !== undefined) {
      if (!Array.isArray(item.conditions) || item.conditions.length > 20) errors.push(`${p}.conditions: expected up to 20 conditions`);
      else item.conditions.forEach((condition, at) => {
        const cp = `${p}.conditions[${at}]`;
        if (!record(condition)) { errors.push(`${cp}: expected a condition object`); return; }
        errors.push(...validateLocationCondition(condition as LocationCondition, cp));
        if (Array.isArray(condition.effects)) steps(condition.effects, `${cp}.effects`, 'locationCondition');
      });
    }
  });
  mods.forEach((item, index) => {
    const p = `mods[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected a mod object`); return; }
    extraFields(item, ['id', 'name', 'enabled', ...MOD_HOOKS], p, errors);
    requiredId(item.id, `${p}.id`, errors);
    if (isBuiltinModifier(item.id)) errors.push(`${p}.id: ${item.id} is a built-in modifier; choose another ID`);
    requiredText(item.name, `${p}.name`, errors, 80);
    if (typeof item.enabled !== 'boolean') errors.push(`${p}.enabled: expected boolean`);
    for (const hook of MOD_HOOKS) if (item[hook] !== undefined) steps(item[hook], `${p}.${hook}`, 'card');
    if (!MOD_HOOKS.some(hook => Array.isArray(item[hook]) && (item[hook] as unknown[]).length)) errors.push(`${p}.onReveal: add at least one effect`);
  });
  rewards.forEach((item, index) => {
    const p = `circuitRewards[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected a reward object`); return; }
    extraFields(item, ['id', 'name', 'text', 'cost', 'effects', 'enabled', 'awardTrailing'], p, errors);
    requiredId(item.id, `${p}.id`, errors); requiredText(item.name, `${p}.name`, errors, 200);
    if (item.awardTrailing !== undefined && typeof item.awardTrailing !== 'boolean') errors.push(`${p}.awardTrailing: expected boolean`);
    requiredText(item.text, `${p}.text`, errors, 2000);
    if (item.cost !== 0) errors.push(`${p}.cost: expected 0`);
    if (typeof item.enabled !== 'boolean') errors.push(`${p}.enabled: expected boolean`);
    steps(item.effects, `${p}.effects`, 'circuit');
    if (Array.isArray(item.effects) && !item.effects.length) errors.push(`${p}.effects: add at least one effect`);
  });
  const draftable = cards.filter(record).filter(card => card.enabled === true && card.generated !== true);
  const count = (pool: CardPool) => draftable.filter(card => card.pool === pool).length;
  if (count('Base') + count('Chaos') < DRAFT_OFFER_COUNT) errors.push(`cards: at least ${DRAFT_OFFER_COUNT} enabled non-Generated Base or Chaos cards required for Draft offers`);
  if (draftable.filter(card => card.cardClass === 'Action' || card.cardClass === 'Utility').length < 2) errors.push('cards: at least 2 enabled non-Generated Action or Utility cards required for Draft');
  if (count('Chaos') < 2) errors.push('cards: at least 2 enabled non-Generated Chaos cards required for Draft');
  if (!draftable.some(card => card.pool === 'Chaos' && card.cardClass === 'Attack')) errors.push('cards: at least 1 enabled non-Generated Attack Chaos card required for Draft');
  if (!draftable.some(card => card.pool === 'Chaos' && card.cardClass === 'Horror')) errors.push('cards: at least 1 enabled non-Generated Horror Chaos card required for Draft');
  if (draftable.filter(card => card.pool === 'VP' && card.cardClass !== 'Solar-monk').length < 1) errors.push('cards: at least 1 enabled non-Generated Volume VP card required for Draft');
  const asCard = (item: Record<string, unknown>) => item as unknown as Card;
  if (!draftable.some(card => cardGainsCryptoInRange(asCard(card), 1, 3))) errors.push('cards: at least 1 enabled card that gains 1–3 Crypto required for Draft');
  if (!draftable.some(card => cardGainsCryptoInRange(asCard(card), 1, 6))) errors.push('cards: at least 1 enabled card that gains 1–6 Crypto required for Draft');
  for (const { cardId } of CURRENCY_PILES) {
    const card = cards.find(item => record(item) && (item.definitionId ?? item.id) === cardId);
    if (!record(card) || card.enabled !== true || card.generated === true || card.type !== 'Crypto') errors.push(`cards: ${cardId} is a Draft currency and must remain enabled as a non-Generated Crypto card`);
  }
  validateStartingDecks(value, cardIds, errors);
  validateOpponents(value.opponents, cardIds, errors);
  const enabledLocations = locations.filter(record).filter(location => location.enabled === true);
  const hasSteps = (location: Record<string, unknown>, hook: string) => Array.isArray(location[hook]) && (location[hook] as unknown[]).length > 0;
  if (enabledLocations.length < 5) errors.push('locations: at least 5 enabled locations required');
  else if (enabledLocations.filter(location => !hasSteps(location, 'startTurn2') && !hasSteps(location, 'startTurn3')).length < 1) errors.push('locations: at least 1 enabled Location needs no start-of-turn effects, to fill the fifth reveal');
  else if (enabledLocations.filter(location => !hasSteps(location, 'startTurn2')).length < 2) errors.push('locations: at least 2 enabled Locations need no start-of-turn-2 effects, to fill the fourth and fifth reveals');
  if (rewards.filter(record).filter(reward => reward.enabled === true).length < 1) errors.push('circuitRewards: at least 1 enabled reward required');
  return errors;
}

type LegacyLibrary = Map<string, { scope: string; effects: AnyEffect[] }>;
/** Brings an older document up to the current shape: version 1 effect kinds and shared library, then
Location after-turn schedules, then the founding opponents for saves that predate them. Anything else is returned unchanged. */
export function upgradeDocument(value: unknown): unknown {
  if (!record(value)) return value;
  const upgraded = liftLocationSchedules(value.version === 1 ? upgradeVersion1(value) : value);
  return upgraded.opponents === undefined ? { ...upgraded, opponents: defaultOpponents() } : upgraded;
}

const AFTER_TURN_COPY = /\bAfter turn [23]:/i;
const hasAfterTurn = (location: unknown) => record(location) && (location.schedule !== undefined || typeof location.rule === 'string' && AFTER_TURN_COPY.test(location.rule));
/** Location `schedule` entries become start-of-turn lists, and copy still printing an after-turn prefix is rewritten to match. */
function liftLocationSchedules(value: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(value.locations) || !value.locations.some(hasAfterTurn)) return value;
  const doc = structuredClone(value);
  const cards = (Array.isArray(doc.cards) ? doc.cards : []) as Card[];
  const mods = (Array.isArray(doc.mods) ? doc.mods.filter(record).filter(mod => mod.enabled === true) : []) as unknown as ModDefinition[];
  doc.locations = (doc.locations as unknown[]).map(location => {
    if (!hasAfterTurn(location)) return location;
    const lifted = liftLocationSchedule(location as Record<string, unknown> & { schedule?: { at: number; effects: AnyEffect[] }[] });
    const text = describeLocation(lifted as unknown as Parameters<typeof describeLocation>[0], cards, mods);
    return text ? { ...lifted, rule: text, reward: text } : lifted;
  });
  return doc;
}

/** Version 1 used legacy effect kinds and a shared effects library; library entries are copied into every item that referenced them. */
function upgradeVersion1(value: Record<string, unknown>): Record<string, unknown> {
  const doc = structuredClone(value) as Record<string, unknown> & { cards?: unknown; locations?: unknown; circuitRewards?: unknown };
  const library: LegacyLibrary = new Map((Array.isArray(doc.effects) ? doc.effects : []).filter(record).map(entry => [String(entry.id), { scope: String(entry.scope), effects: (entry.effects ?? []) as AnyEffect[] }]));
  const resolve = (ref: unknown, scope: string): AnyEffect[] => {
    const entry = library.get(String(ref));
    if (!entry) throw new Error(`Unknown ${scope} recipe reference: ${String(ref)}`);
    if (entry.scope !== scope) throw new Error(`Recipe ${String(ref)} must have ${scope} scope.`);
    return structuredClone(entry.effects);
  };
  const list = (value: unknown): AnyEffect[] => Array.isArray(value) ? value as AnyEffect[] : [];
  for (const card of Array.isArray(doc.cards) ? doc.cards.filter(record) : []) {
    const refs = record(card.effectRefs) ? card.effectRefs : {};
    for (const hook of ['onReveal', 'onCollapse', 'recurring'] as const) {
      const shared = list(refs[hook]).flatMap(ref => resolve(ref, 'card'));
      if (card[hook] === undefined && !shared.length) continue;
      card[hook] = migrateEffects([...list(card[hook]), ...shared], 'card');
    }
    if (Array.isArray(card.schedule)) card.schedule = card.schedule.map(entry => record(entry) ? { ...entry, effects: migrateEffects(list(entry.effects), 'card') } : entry);
    delete card.effectRefs;
  }
  for (const location of Array.isArray(doc.locations) ? doc.locations.filter(record) : []) {
    const shared = list(location.effectIds).flatMap(ref => resolve(ref, 'location'));
    location.effects = migrateEffects([...list(location.effects), ...shared], 'location');
    if (location.ongoing !== undefined) location.ongoing = migrateEffects(list(location.ongoing), 'location');
    if (location.onPlay !== undefined) location.onPlay = migrateEffects(list(location.onPlay), 'locationPlay');
    if (Array.isArray(location.schedule)) location.schedule = location.schedule.map(entry => record(entry) ? { ...entry, effects: migrateEffects(list(entry.effects), 'location') } : entry);
    delete location.effectIds;
  }
  for (const reward of Array.isArray(doc.circuitRewards) ? doc.circuitRewards.filter(record) : []) {
    const effects = reward.effects !== undefined ? list(reward.effects) : reward.effectId !== undefined ? resolve(reward.effectId, 'circuit') : reward.effect ? [reward.effect as AnyEffect] : [];
    reward.effects = migrateEffects(effects, 'circuit');
    delete reward.effect; delete reward.effectId;
  }
  delete doc.effects;
  doc.version = CONTENT_VERSION;
  return doc;
}

/** The editable form of a document: upgraded, with a starting deck, and blank Location copy written from its effects.
Hand-shortened Location copy is kept. */
export function normalizeDocument(value: ContentDocument | unknown): ContentDocument {
  const copy = withOpponents(withStartingDecks(structuredClone(upgradeDocument(value)) as ContentDocument));
  copy.mods ??= [];
  for (const location of copy.locations) {
    if (location.rule?.trim()) continue;
    const text = describeLocation(location, copy.cards as unknown as Card[], copy.mods.filter(mod => mod.enabled));
    if (text) { location.rule = text; location.reward = text; }
  }
  return copy;
}

export function compileContent(doc: ContentDocument): CompiledContent {
  const errors = validateContent(upgradeDocument(doc));
  if (errors.length) throw new Error(`Invalid authored content:\n${errors.join('\n')}`);
  const normalized = normalizeDocument(doc);
  const cardsByPool: Record<CardPool, Card[]> = { Base: [], Chaos: [], VP: [], Crypto: [] };
  const cards: CompiledContent['cards'] = [];
  for (const authored of normalized.cards) {
    if (!authored.enabled) continue;
    const { pool, enabled: _enabled, ...card } = structuredClone(authored);
    cards.push(card);
    if (!card.generated) cardsByPool[pool].push(card);
  }
  const locations = normalized.locations.filter(location => location.enabled).map(({ enabled: _enabled, ...location }) => location);
  const circuitRewards = normalized.circuitRewards.filter(reward => reward.enabled).map(({ enabled: _enabled, ...reward }) => ({ ...reward, effect: reward.effects[0] }));
  const mods = normalized.mods!.filter(mod => mod.enabled).map(({ enabled: _enabled, ...mod }) => mod);
  const activeDeck = normalized.startingDecks!.find(deck => deck.id === normalized.activeStartingDeckId)!;
  const startingDeck = expandDeck(activeDeck.cards, cards);
  const opponents = normalized.opponents!.map(opponent => structuredClone(opponent));
  return { cards, baseCards: cardsByPool.Base, chaosCards: cardsByPool.Chaos, vpCards: cardsByPool.VP, cryptoCards: cardsByPool.Crypto, locations, circuitRewards, mods, startingDeck, opponents };
}
