import { compileChains, starterEffects, type Card, type EvaluationEffect } from '../game';
import { EVALUATION_ALL_CARDS, EVALUATION_BASE_CARDS, EVALUATION_CHAOS_CARDS, EVALUATION_VP_CARDS, EVALUATION_CRYPTO_CARDS } from '../evaluationMarket';
import { EVALUATION_LOCATIONS, EVALUATION_CIRCUIT_REWARDS, type EvaluationLocation, type LocationRewardEffect, type CircuitRewardDefinition, type CircuitRewardEffect } from '../content';
import { CARD_ART_PLACEHOLDER } from '../cardArtwork';
import { HISTORIC_SOURCE_METADATA } from '../historicCatalog';
import { deriveLocationText } from './recipeModel';

export type CardPool = 'Base' | 'Chaos' | 'VP' | 'Crypto';
export type CardClass = 'Action' | 'Utility' | 'Runtime' | 'Attack' | 'Hacker' | 'Horror';
export type AuthoredCard = Card & {
  pool: CardPool;
  enabled: boolean;
  cardClass?: CardClass;
  /** Created only by card effects; any type or class, never offered in Draft. */
  generated?: boolean;
  storyText?: string;
  effectRefs?: { onReveal?: string[]; onCollapse?: string[]; recurring?: string[] };
};
export type AuthoredLocation = EvaluationLocation & { enabled: boolean; effectIds?: string[] };
export type AuthoredCircuitReward = Omit<CircuitRewardDefinition,'effect'> & { effect?: CircuitRewardEffect; enabled: boolean; effectId?: string };
export type AuthoredEffect = {
  id: string;
  name: string;
  description: string;
  scope: 'card' | 'location' | 'circuit';
  effects: (EvaluationEffect | LocationRewardEffect | CircuitRewardEffect)[];
};
export type ContentDocument = {
  version: 1;
  cards: AuthoredCard[];
  locations: AuthoredLocation[];
  circuitRewards: AuthoredCircuitReward[];
  effects: AuthoredEffect[];
};
export type CompiledContent = {
  cards: (Card & Pick<AuthoredCard,'cardClass'|'generated'>)[];
  baseCards: Card[];
  chaosCards: Card[];
  vpCards: Card[];
  cryptoCards: Card[];
  locations: EvaluationLocation[];
  circuitRewards: CircuitRewardDefinition[];
};

function seededCardClass(card:Card,pool:CardPool):CardClass|undefined {
  if(card.type!=="Character")return undefined;
  const types=HISTORIC_SOURCE_METADATA[card.definitionId??card.id]?.types??[];
  if(types.includes('power'))return 'Horror';
  if(types.includes('action'))return 'Action';
  if(types.includes('utility'))return 'Utility';
  if(types.includes('attack'))return 'Attack';
  return pool==='Chaos'?'Attack':'Utility';
}
const STARTING_DECK: Record<string, Card['type']> = { 'slash-dot': 'Character', 'dash-dot': 'Character', dotkrawler: 'Character', 'rezz-razor': 'Character', 'rezz-blade': 'Character', 'byte-coin': 'Crypto', 'kilo-coin': 'Crypto', 'vault-encryption': 'VP' };
const EVAL_KINDS = new Set(['draw', 'actions', 'crypto', 'vp', 'drain', 'restore', 'moveSelf', 'moveCard', 'modifyPower', 'probability', 'trashSelf', 'recover', 'choice', 'mill', 'transferPower', 'handDiscard', 'handTrash', 'scry', 'gain', 'selfDestroyBackup', 'random', 'morph', 'attachModifier', 'damageLoser', 'restorePrimary', 'trashLowestAtLocation', 'trashAtLocation', 'destroyAtLocation', 'boostPowerAtLocation', 'stealCrypto', 'destroyCard', 'bump']);
const CARD_KINDS = EVAL_KINDS;
const LOCATION_KINDS = EVAL_KINDS;
const CIRCUIT_KINDS = EVAL_KINDS;
const CARD_EFFECT_FIELDS: Record<string, string[]> = {
  draw: ['amount', 'opponent'], actions: ['amount', 'opponent'], crypto: ['amount', 'opponent'], vp: ['amount', 'opponent'],
  drain: ['amount', 'target', 'opponent'], restore: ['amount', 'target', 'opponent'],
  moveSelf: [], moveCard: ['opponent', 'optional', 'boardSide', 'cardPick', 'cardRelation'], modifyPower: ['amount', 'opponent', 'optional', 'boardSide', 'cardPick', 'cardRelation'], probability: ['amount', 'direction', 'flow'],
  destroyCard: ['opponent', 'optional', 'cardRelation'],
  trashSelf: [], recover: [], choice: ['prompt', 'options'], mill: ['amount', 'opponent'],
  transferPower: ['amount', 'direction', 'flow'], stealCrypto: ['amount'], bump: ['amount', 'zone', 'cardPick'],
  handDiscard: ['amount', 'opponent', 'chooser', 'optional', 'min', 'then'],
  handTrash: ['amount', 'opponent', 'chooser', 'optional', 'min', 'then'],
  scry: ['amount', 'optional', 'opponent'], gain: ['amount', 'cardId', 'destination', 'opponent'], selfDestroyBackup: ['opponent'], random: ['options'],
  morph: ['formIds', 'selection'],
  attachModifier: ['modifier', 'amount', 'cardId', 'opponent', 'cardRelation', 'boardHost'],
  damageLoser: ['amount'], restorePrimary: ['amount'],
  trashLowestAtLocation: ['amount', 'boardSide'], boostPowerAtLocation: ['amount', 'boardSide'],
  trashAtLocation: ['amount', 'boardSide', 'rank'], destroyAtLocation: ['amount', 'boardSide', 'rank'],
};

export function createDefaultContent(): ContentDocument {
  const pools = new Map<string, CardPool>();
  for (const [pool, cards] of [['Base', EVALUATION_BASE_CARDS], ['Chaos', EVALUATION_CHAOS_CARDS], ['VP', EVALUATION_VP_CARDS], ['Crypto', EVALUATION_CRYPTO_CARDS]] as const) {
    for (const card of cards) pools.set(card.definitionId ?? card.id, pool);
  }
  return {
    version: 1,
    cards: EVALUATION_ALL_CARDS.map(card => {
      const id = card.definitionId ?? card.id;
      const hooks = card.onReveal === undefined && starterEffects[card.name] ? { onReveal: structuredClone(starterEffects[card.name]) as EvaluationEffect[] } : {};
      const pool=pools.get(id)!;
      const cardClass=seededCardClass(card,pool);
      return { ...structuredClone(card), ...hooks, pool, enabled: true, ...(cardClass?{cardClass}:{}) };
    }).concat([
      { id: 'eval-relocation-relay', definitionId: 'eval-relocation-relay', name: 'Relocation Relay', type: 'Character', power: 2, cost: 3, art: CARD_ART_PLACEHOLDER, effect: 'Move one of your revealed cards to another open Node.', onReveal: [{ kind: 'moveCard' }], pool: 'Base', enabled: true },
      { id: 'eval-hostile-reroute', definitionId: 'eval-hostile-reroute', name: 'Hostile Reroute', type: 'Character', power: 2, cost: 4, art: CARD_ART_PLACEHOLDER, effect: 'Move one opponent revealed card to another open Node.', onReveal: [{ kind: 'moveCard', opponent: true }], pool: 'Chaos', enabled: true },
      { id: 'eval-signal-amplifier', definitionId: 'eval-signal-amplifier', name: 'Signal Amplifier', type: 'Character', power: 2, cost: 3, art: CARD_ART_PLACEHOLDER, effect: 'Add 2 Power to one of your revealed cards while it remains deployed.', onReveal: [{ kind: 'modifyPower', amount: 2 }], pool: 'Base', enabled: true },
      { id: 'eval-power-siphon', definitionId: 'eval-power-siphon', name: 'Power Siphon', type: 'Character', power: 2, cost: 4, art: CARD_ART_PLACEHOLDER, effect: 'Subtract 2 Power from one opponent revealed card while it remains deployed.', onReveal: [{ kind: 'modifyPower', amount: -2, opponent: true }], pool: 'Chaos', enabled: true },
    ] as AuthoredCard[]).map(card=>({...card,...(card.cardClass?{}:seededCardClass(card,card.pool)?{cardClass:seededCardClass(card,card.pool)}:{})})),
    locations: EVALUATION_LOCATIONS.map(location => ({ ...structuredClone(location), enabled: true })),
    circuitRewards: EVALUATION_CIRCUIT_REWARDS.map(reward => ({ ...structuredClone(reward), enabled: true })),
    effects: [
      { id: 'card-move-opponent', name: 'Displace opponent card', description: 'Move one opponent card to another open Node.', scope: 'card', effects: [{ kind: 'moveCard', opponent: true }] },
      { id: 'card-power-surge', name: 'Gain Power', description: 'Add 2 Power to one of your revealed cards.', scope: 'card', effects: [{ kind: 'modifyPower', amount: 2 }] },
      { id: 'card-draw', name: 'Draw Card', description: 'Draw 1 card into your hand.', scope: 'card', effects: [{ kind: 'draw', amount: 1 }] },
      { id: 'card-gain', name: 'Gain Card', description: 'Gain 1 Byte-Coin into your hand.', scope: 'card', effects: [{ kind: 'gain', amount: 1, cardId: 'byte-coin', destination: 'hand' }] },
      { id: 'card-drain-power', name: 'Drain Power', description: 'Remove 2 Power from an opponent revealed card.', scope: 'card', effects: [{ kind: 'modifyPower', amount: -2, opponent: true }] },
      { id: 'card-gain-crypto', name: 'Gain Crypto', description: 'Add 1 Crypto to your wallet.', scope: 'card', effects: [{ kind: 'crypto', amount: 1 }] },
      { id: 'location-crypto', name: 'Location Crypto', description: 'Winner gains 1 Crypto.', scope: 'location', effects: [{ kind: 'crypto', amount: 1 }] },
      { id: 'circuit-vp', name: 'Circuit VP', description: 'Gain 2 Victory Points.', scope: 'circuit', effects: [{ kind: 'vp', amount: 2 }] },
    ],
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
function effectList(value: unknown, path: string, scope: AuthoredEffect['scope'], errors: string[], depth = 0) {
  if (!Array.isArray(value) || value.length > 64) { errors.push(`${path}: expected an array of up to 64 effects`); return; }
  if (depth > 5) { errors.push(`${path}: effect nesting exceeds five levels`); return; }
  value.forEach((item, index) => {
    const p = `${path}[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected an effect object`); return; }
    const kind = item.kind;
    const kinds = scope === 'card' ? CARD_KINDS : scope === 'location' ? LOCATION_KINDS : CIRCUIT_KINDS;
    if (typeof kind !== 'string' || !kinds.has(kind)) { errors.push(`${p}.kind: unsupported ${scope} effect`); return; }
    // Legacy location/circuit aliases keep the short {kind,amount} shape.
    if ((kind === 'damageLoser' || kind === 'restorePrimary') && scope !== 'card') {
      extraFields(item, ['kind', 'amount'], p, errors);
      if (!integer(item.amount)) errors.push(`${p}.amount: expected integer from 0 to 1000000`);
      return;
    }
    extraFields(item, ['kind', ...(CARD_EFFECT_FIELDS[kind] ?? []), ...(scope === 'card' ? ['chain', 'then'] : [])], p, errors);
    if (item.chain !== undefined && typeof item.chain !== 'boolean') errors.push(`${p}.chain: expected boolean`);
    const amountRequired = ['draw', 'actions', 'crypto', 'vp', 'drain', 'restore', 'mill', 'handDiscard', 'handTrash', 'scry', 'modifyPower', 'damageLoser', 'restorePrimary', 'trashLowestAtLocation', 'trashAtLocation', 'destroyAtLocation', 'boostPowerAtLocation'].includes(kind);
    if (amountRequired && item.amount === undefined) errors.push(`${p}.amount: required for ${kind}`);
    if (kind === 'modifyPower' && item.amount !== undefined && !integer(item.amount, -1000, 1000)) errors.push(`${p}.amount: expected integer from -1000 to 1000`);
    else if (kind === 'vp' && item.amount !== undefined && !integer(item.amount, -1000000, 1000000)) errors.push(`${p}.amount: expected integer from -1000000 to 1000000`);
    else if (kind === 'attachModifier' && item.modifier === 'powerAuraAtLocation' && item.amount !== undefined && !integer(item.amount, 1, 1000)) errors.push(`${p}.amount: expected integer from 1 to 1000`);
    else if (kind !== 'modifyPower' && kind !== 'vp' && kind !== 'attachModifier' && item.amount !== undefined && !['probability', 'transferPower'].includes(kind) && !integer(item.amount)) errors.push(`${p}.amount: expected integer from 0 to 1000000`);
    else if (kind !== 'modifyPower' && ['probability', 'transferPower'].includes(kind)) optionalNumber(item.amount, `${p}.amount`, errors);
    if (item.target !== undefined && !['primary', 'backup'].includes(String(item.target))) errors.push(`${p}.target: expected primary or backup`);
    if (item.opponent !== undefined && typeof item.opponent !== 'boolean') errors.push(`${p}.opponent: expected boolean`);
    if (item.chooser !== undefined && !['owner', 'opponent'].includes(String(item.chooser))) errors.push(`${p}.chooser: expected owner or opponent`);
    if (item.optional !== undefined && typeof item.optional !== 'boolean') errors.push(`${p}.optional: expected boolean`);
    if (item.min !== undefined && !integer(item.min, 0, 64)) errors.push(`${p}.min: expected integer from 0 to 64`);
    if (integer(item.min, 0, 64) && integer(item.amount, 0, 64) && item.min > item.amount) errors.push(`${p}.min: cannot exceed amount`);
    if (item.prompt !== undefined && !text(item.prompt, 500)) errors.push(`${p}.prompt: expected text, at most 500 characters`);
    if (kind === 'gain') requiredId(item.cardId, `${p}.cardId`, errors);
    if (kind === 'gain' && item.amount !== undefined && !integer(item.amount,0,100)) errors.push(`${p}.amount: gain count must be an integer from 0 to 100`);
    else if (item.cardId !== undefined) requiredId(item.cardId, `${p}.cardId`, errors);
    if (item.destination !== undefined && !['top', 'discard', 'hand'].includes(String(item.destination))) errors.push(`${p}.destination: expected hand, top or discard`);
    if (item.boardSide !== undefined && !['either', 'winner', 'loser', 'both', 'played', 'other'].includes(String(item.boardSide))) errors.push(`${p}.boardSide: expected either, winner, loser, both, played or other`);
    if (item.cardPick !== undefined && !['choice', 'random'].includes(String(item.cardPick))) errors.push(`${p}.cardPick: expected choice or random`);
    if (item.rank !== undefined && !['weakest', 'strongest', 'first'].includes(String(item.rank))) errors.push(`${p}.rank: expected weakest, strongest or first`);
    if (item.cardRelation !== undefined && !['previous', 'next'].includes(String(item.cardRelation))) errors.push(`${p}.cardRelation: expected previous or next`);
    if (item.boardHost !== undefined && typeof item.boardHost !== 'boolean') errors.push(`${p}.boardHost: expected boolean`);
    if (item.direction !== undefined && !['choice', 'left', 'right', 'split'].includes(String(item.direction))) errors.push(`${p}.direction: expected choice, left, right or split`);
    if (item.flow !== undefined && !['either', 'push', 'pull'].includes(String(item.flow))) errors.push(`${p}.flow: expected either, push or pull`);
    if (item.zone !== undefined && !['bank', 'wallet', 'either'].includes(String(item.zone))) errors.push(`${p}.zone: expected bank, wallet or either`);
    if (kind === 'attachModifier') {
      if (!['doublePrintedEffects', 'powerAuraAtLocation', 'movableEachTurn'].includes(String(item.modifier))) errors.push(`${p}.modifier: expected doublePrintedEffects, powerAuraAtLocation or movableEachTurn`);
      if (item.modifier === 'powerAuraAtLocation' && item.amount === undefined) errors.push(`${p}.amount: required for powerAuraAtLocation`);
    }
    if(kind==='morph'){
      idList(item.formIds,`${p}.formIds`,errors);
      if(Array.isArray(item.formIds)&&!item.formIds.length)errors.push(`${p}.formIds: select at least one form card`);
      if(Array.isArray(item.formIds)&&new Set(item.formIds).size!==item.formIds.length)errors.push(`${p}.formIds: each form may appear only once`);
      if(item.selection!==undefined&&!['sequential','random'].includes(String(item.selection)))errors.push(`${p}.selection: expected sequential or random`);
    }
    if (item.then !== undefined) effectList(item.then, `${p}.then`, scope === 'card' ? 'card' : scope, errors, depth + 1);
    if (item.options !== undefined) {
      if (!Array.isArray(item.options) || item.options.length > 12 || item.options.length === 0) errors.push(`${p}.options: expected 1–12 choices`);
      else item.options.forEach((option, optionIndex) => {
        const op = `${p}.options[${optionIndex}]`;
        if (!record(option)) { errors.push(`${op}: expected choice object`); return; }
        extraFields(option, ['id', 'label', 'effects'], op, errors);
        requiredId(option.id, `${op}.id`, errors);
        requiredText(option.label, `${op}.label`, errors, 200);
        effectList(option.effects, `${op}.effects`, scope === 'card' ? 'card' : scope, errors, depth + 1);
      });
      if (Array.isArray(item.options)) checkUnique(item.options, `${p}.options`, errors);
    } else if (kind === 'random') errors.push(`${p}.options: random effect requires explicit choices`);
  });
}

function checkUnique(items: unknown[], path: string, errors: string[]) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!record(item) || !id(item.id)) return;
    if (seen.has(item.id)) errors.push(`${path}[${index}].id: duplicate ID ${item.id}`);
    seen.add(item.id);
  });
}

export function validateContent(value: unknown): string[] {
  const errors: string[] = [];
  if (!record(value)) return ['document: expected an object'];
  extraFields(value, ['version', 'cards', 'locations', 'circuitRewards', 'effects'], 'document', errors);
  if (value.version !== 1) errors.push('version: expected 1');
  for (const field of ['cards', 'locations', 'circuitRewards', 'effects'] as const) {
    if (!Array.isArray(value[field])) errors.push(`${field}: expected an array`);
    else if (value[field].length > 500) errors.push(`${field}: limit is 500`);
  }
  const cards = Array.isArray(value.cards) ? value.cards.slice(0, 501) : [];
  const locations = Array.isArray(value.locations) ? value.locations.slice(0, 501) : [];
  const rewards = Array.isArray(value.circuitRewards) ? value.circuitRewards.slice(0, 501) : [];
  const effects = Array.isArray(value.effects) ? value.effects.slice(0, 501) : [];
  checkUnique(cards, 'cards', errors); checkUnique(locations, 'locations', errors); checkUnique(rewards, 'circuitRewards', errors); checkUnique(effects, 'effects', errors);
  const identities = new Set<string>();
  cards.forEach((card, index) => {
    if (!record(card)) return;
    const identity = card.definitionId ?? card.id;
    if (!id(identity)) return;
    if (identities.has(identity)) errors.push(`cards[${index}].definitionId: duplicate definition ID ${identity}`);
    identities.add(identity);
  });
  const cardIds = new Set(cards.filter(record).filter(card => card.enabled === true).map(card => card.definitionId ?? card.id).filter(id));
  const effectScopes = new Map(effects.filter(record).filter(effect => id(effect.id)).map(effect => [effect.id as string, effect.scope]));
  const checkRef = (ref: unknown, scope: AuthoredEffect['scope'], path: string) => {
    if (!id(ref)) return;
    if (!effectScopes.has(ref)) errors.push(`${path}: unknown effect ${ref}`);
    else if (effectScopes.get(ref) !== scope) errors.push(`${path}: effect ${ref} must have ${scope} scope`);
  };
  cards.forEach((item, index) => {
    const p = `cards[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected a card object`); return; }
    extraFields(item, ['definitionId', 'vp', 'cryptoValue', 'duration', 'durationPeriod', 'schedule', 'recurring', 'onReveal', 'onCollapse', 'id', 'name', 'type', 'power', 'cost', 'art', 'effect', 'storyText', 'pool', 'enabled', 'cardClass', 'generated', 'effectRefs', 'modifiers', 'powerSource'], p, errors);
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
    if(item.cardClass!==undefined&&!['Action','Utility','Runtime','Attack','Hacker','Horror'].includes(String(item.cardClass)))errors.push(`${p}.cardClass: expected Action, Utility, Runtime, Attack, Hacker or Horror`);
    if(item.cardClass!==undefined&&item.type!=='Character')errors.push(`${p}.cardClass: only Characters have a class`);
    if(item.powerSource!==undefined&&(item.type!=='Character'||!['trash','destroyed'].includes(String(item.powerSource))))errors.push(`${p}.powerSource: expected trash or destroyed on a Character`);
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
    if ((Array.isArray(item.schedule) && item.schedule.length > 0 || Array.isArray(item.recurring) && item.recurring.length > 0) && (item.durationPeriod !== 'runtime' || !integer(item.duration, 1, 100))) errors.push(`${p}.duration: schedule and recurring effects require a positive runtime duration`);
    for (const hook of ['onReveal', 'onCollapse', 'recurring']) if (item[hook] !== undefined) effectList(item[hook], `${p}.${hook}`, 'card', errors);
    if (item.schedule !== undefined) {
      if (!Array.isArray(item.schedule) || item.schedule.length > 100) errors.push(`${p}.schedule: expected up to 100 entries`);
      else item.schedule.forEach((entry, at) => {
        const sp = `${p}.schedule[${at}]`;
        if (!record(entry)) { errors.push(`${sp}: expected schedule entry`); return; }
        extraFields(entry, ['at', 'timing', 'effects'], sp, errors);
        if (!integer(entry.at, 1, 100)) errors.push(`${sp}.at: expected integer from 1 to 100`);
        if (entry.timing !== undefined && !['start', 'end'].includes(String(entry.timing))) errors.push(`${sp}.timing: expected start or end`);
        effectList(entry.effects, `${sp}.effects`, 'card', errors);
      });
    }
    if (item.effectRefs !== undefined) {
      if (!record(item.effectRefs)) errors.push(`${p}.effectRefs: expected an object`);
      else {
        extraFields(item.effectRefs, ['onReveal', 'onCollapse', 'recurring'], `${p}.effectRefs`, errors);
        if(Array.isArray(item.effectRefs.recurring)&&item.effectRefs.recurring.length&&(item.durationPeriod!=='runtime'||!integer(item.duration,1,100)))errors.push(`${p}.duration: recurring effect references require a positive runtime duration`);
        for (const hook of ['onReveal', 'onCollapse', 'recurring']) if (item.effectRefs[hook] !== undefined) {
          idList(item.effectRefs[hook], `${p}.effectRefs.${hook}`, errors);
          if (Array.isArray(item.effectRefs[hook])) item.effectRefs[hook].forEach((ref: unknown, at: number) => checkRef(ref, 'card', `${p}.effectRefs.${hook}[${at}]`));
        }
      }
    }
  });
  locations.forEach((item, index) => {
    const p = `locations[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected a location object`); return; }
    extraFields(item, ['id', 'name', 'rule', 'reward', 'effects', 'ongoing', 'onPlay', 'schedule', 'enabled', 'effectIds'], p, errors);
    requiredId(item.id, `${p}.id`, errors); requiredText(item.name, `${p}.name`, errors, 200);
    requiredText(item.rule, `${p}.rule`, errors, 2000); requiredText(item.reward, `${p}.reward`, errors, 2000);
    if (typeof item.enabled !== 'boolean') errors.push(`${p}.enabled: expected boolean`);
    effectList(item.effects, `${p}.effects`, 'location', errors);
    if (item.ongoing !== undefined) effectList(item.ongoing, `${p}.ongoing`, 'location', errors);
    if (item.onPlay !== undefined) effectList(item.onPlay, `${p}.onPlay`, 'location', errors);
    if (item.schedule !== undefined) {
      if (!Array.isArray(item.schedule) || item.schedule.length > 8) errors.push(`${p}.schedule: expected up to 8 schedule entries`);
      else item.schedule.forEach((entry: unknown, si: number) => {
        const sp = `${p}.schedule[${si}]`;
        if (!record(entry)) { errors.push(`${sp}: expected schedule object`); return; }
        extraFields(entry, ['at', 'effects'], sp, errors);
        if (![2, 3].includes(Number(entry.at))) errors.push(`${sp}.at: Location schedules use turn 2 or 3 only`);
        effectList(entry.effects, `${sp}.effects`, 'location', errors);
      });
    }
    if (item.effectIds !== undefined) {
      idList(item.effectIds, `${p}.effectIds`, errors);
      if (Array.isArray(item.effectIds)) item.effectIds.forEach((ref: unknown, at: number) => checkRef(ref, 'location', `${p}.effectIds[${at}]`));
    }
  });
  rewards.forEach((item, index) => {
    const p = `circuitRewards[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected a reward object`); return; }
    extraFields(item, ['id', 'name', 'text', 'cost', 'effect', 'effects', 'enabled', 'effectId'], p, errors);
    requiredId(item.id, `${p}.id`, errors); requiredText(item.name, `${p}.name`, errors, 200);
    requiredText(item.text, `${p}.text`, errors, 2000);
    if (item.cost !== 0) errors.push(`${p}.cost: expected 0`);
    if (typeof item.enabled !== 'boolean') errors.push(`${p}.enabled: expected boolean`);
    if(item.effects===undefined&&item.effect!==undefined)effectList([item.effect], `${p}.effect`, 'circuit', errors);
    if(item.effects!==undefined){
      effectList(item.effects,`${p}.effects`,'circuit',errors);
      if(Array.isArray(item.effects)&&!item.effects.length)errors.push(`${p}.effects: at least one recipe is required`);
    }
    if(item.effect===undefined&&item.effects===undefined&&item.effectId===undefined)errors.push(`${p}: at least one circuit recipe is required`);
    if (item.effectId !== undefined) checkRef(item.effectId, 'circuit', `${p}.effectId`);
  });
  effects.forEach((item, index) => {
    const p = `effects[${index}]`;
    if (!record(item)) { errors.push(`${p}: expected an effect recipe`); return; }
    extraFields(item, ['id', 'name', 'description', 'scope', 'effects'], p, errors);
    requiredId(item.id, `${p}.id`, errors); requiredText(item.name, `${p}.name`, errors, 200);
    if (typeof item.description !== 'string' || item.description.length > 2000) errors.push(`${p}.description: expected text, at most 2000 characters`);
    if (!['card', 'location', 'circuit'].includes(String(item.scope))) errors.push(`${p}.scope: invalid scope`);
    else effectList(item.effects, `${p}.effects`, item.scope as AuthoredEffect['scope'], errors);
  });
  const draftable = cards.filter(record).filter(card => card.enabled === true && card.generated !== true);
  const count = (pool: CardPool) => draftable.filter(card => card.pool === pool).length;
  if (count('Base') < 6) errors.push('cards: at least 6 enabled non-Generated Base cards required (4 stable + 2 rotating)');
  if (count('Chaos') < 4) errors.push('cards: at least 4 enabled non-Generated Chaos cards required');
  if (count('VP') < 3) errors.push('cards: at least 3 enabled non-Generated VP cards required');
  if (count('Crypto') < 3) errors.push('cards: at least 3 enabled non-Generated Crypto cards required');
  for (const [identity, type] of Object.entries(STARTING_DECK)) {
    const card = cards.find(item => record(item) && (item.definitionId ?? item.id) === identity);
    if (!record(card) || card.enabled !== true || card.generated === true || card.type !== type) errors.push(`cards: ${identity} is referenced by the starting deck and must remain enabled as ${type}`);
  }
  if (locations.filter(record).filter(location => location.enabled === true).length < 5) errors.push('locations: at least 5 enabled locations required');
  if (rewards.filter(record).filter(reward => reward.enabled === true).length < 1) errors.push('circuitRewards: at least 1 enabled reward required');
  function checkGains(list: unknown, path: string) {
    if (!Array.isArray(list)) return;
    list.forEach((entry, at) => {
      if (!record(entry)) return;
      if (entry.kind === 'gain' && id(entry.cardId) && !cardIds.has(entry.cardId)) errors.push(`${path}[${at}].cardId: unknown card ${entry.cardId}`);
      if(entry.kind==='morph'&&Array.isArray(entry.formIds))entry.formIds.forEach((form,fi)=>{
        const candidate=cards.find(card=>record(card)&&card.enabled===true&&(card.definitionId??card.id)===form);
        if(!candidate)errors.push(`${path}[${at}].formIds[${fi}]: unknown or disabled form card ${String(form)}`);
        else if(record(candidate)&&candidate.type==='Crypto')errors.push(`${path}[${at}].formIds[${fi}]: deployed forms must be Character or VP cards`);
      });
      checkGains(entry.then, `${path}[${at}].then`);
      if (Array.isArray(entry.options)) entry.options.forEach((option: unknown, oi: number) => { if (record(option)) checkGains(option.effects, `${path}[${at}].options[${oi}].effects`); });
    });
  }
  cards.forEach((card, i) => { if (record(card)) { for (const hook of ['onReveal', 'onCollapse', 'recurring']) checkGains(card[hook], `cards[${i}].${hook}`); if (Array.isArray(card.schedule)) card.schedule.forEach((entry: unknown, si: number) => { if (record(entry)) checkGains(entry.effects, `cards[${i}].schedule[${si}].effects`); }); } });
  effects.forEach((effect, i) => { if (record(effect) && effect.scope === 'card') checkGains(effect.effects, `effects[${i}].effects`); });
  return errors;
}

export function materializeItemRecipes(doc: ContentDocument): ContentDocument {
  const copy=structuredClone(doc);
  const recipes=new Map(copy.effects.map(effect=>[effect.id,effect]));
  const resolve=(ref:string,scope:AuthoredEffect['scope'])=>{
    const recipe=recipes.get(ref);
    if(!recipe)throw new Error(`Unknown ${scope} recipe reference: ${ref}`);
    if(recipe.scope!==scope)throw new Error(`Recipe ${ref} must have ${scope} scope.`);
    return structuredClone(recipe.effects);
  };
  const normalizeEffects=(list:EvaluationEffect[]|undefined)=>{
    if(!list)return list;
    return list.map(effect=>{
      if(effect.kind==='damageLoser')return {kind:'drain' as const,amount:effect.amount??1,opponent:true};
      if(effect.kind==='restorePrimary')return {kind:'restore' as const,amount:effect.amount??1,target:'primary' as const};
      return effect;
    });
  };
  for(const card of copy.cards){
    for(const hook of ['onReveal','onCollapse','recurring'] as const){
      const refs=card.effectRefs?.[hook]??[];
      if(refs.length)card[hook]=[...(card[hook]??[]),...refs.flatMap(ref=>resolve(ref,'card') as EvaluationEffect[])];
      card[hook]=normalizeEffects(card[hook] as EvaluationEffect[]|undefined);
    }
    if(Array.isArray(card.schedule))card.schedule=card.schedule.map(entry=>({...entry,effects:normalizeEffects([...entry.effects])??[]}));
    delete card.effectRefs;
  }
  for(const location of copy.locations){
    if(location.effectIds?.length)location.effects=[...location.effects,...location.effectIds.flatMap(ref=>resolve(ref,'location') as LocationRewardEffect[])];
    location.effects=normalizeEffects([...location.effects]) as LocationRewardEffect[];
    if(location.ongoing)location.ongoing=normalizeEffects([...location.ongoing]) as LocationRewardEffect[];
    if(location.onPlay)location.onPlay=normalizeEffects([...location.onPlay]) as LocationRewardEffect[];
    if(location.schedule)location.schedule=location.schedule.map(entry=>({...entry,effects:normalizeEffects([...entry.effects])??[]}));
    delete location.effectIds;
    const copyText=deriveLocationText(location, copy.cards);
    if(copyText){location.rule=copyText;location.reward=copyText;}
  }
  for(const reward of copy.circuitRewards){
    const referenced=reward.effectId?resolve(reward.effectId,'circuit') as CircuitRewardEffect[]:undefined;
    reward.effects=reward.effects!==undefined?reward.effects:referenced??(reward.effect?[reward.effect]:[]);
    reward.effects=normalizeEffects([...(reward.effects??[])]) as CircuitRewardEffect[];
    if(reward.effects.length)reward.effect=structuredClone(reward.effects[0]);
    delete reward.effectId;
  }
  return copy;
}

export function compileContent(doc: ContentDocument): CompiledContent {
  const errors = validateContent(doc);
  if (errors.length) throw new Error(`Invalid authored content:\n${errors.join('\n')}`);
  const normalized=materializeItemRecipes(doc);
  const cardsByPool: Record<CardPool, Card[]> = { Base: [], Chaos: [], VP: [], Crypto: [] };
  const cards:CompiledContent['cards']=[];
  for (const authored of normalized.cards) {
    if (!authored.enabled) continue;
    const { pool, enabled: _enabled, effectRefs, ...card } = structuredClone(authored);
    for (const hook of ['onReveal', 'onCollapse', 'recurring'] as const) if (card[hook]) card[hook] = compileChains(card[hook]!);
    if (card.schedule) card.schedule = card.schedule.map(entry => ({ ...entry, effects: compileChains(entry.effects) }));
    cards.push(card);
    if (!card.generated) cardsByPool[pool].push(card);
  }
  const locations = normalized.locations.filter(location => location.enabled).map(authored => {
    const { enabled: _enabled, effectIds, ...location } = structuredClone(authored);
    return location;
  });
  const circuitRewards = normalized.circuitRewards.filter(reward => reward.enabled).map(authored => {
    const { enabled: _enabled, effectId, ...reward } = structuredClone(authored);
    return {...reward,effect:reward.effects![0]};
  });
  return { cards, baseCards: cardsByPool.Base, chaosCards: cardsByPool.Chaos, vpCards: cardsByPool.VP, cryptoCards: cardsByPool.Crypto, locations, circuitRewards };
}
