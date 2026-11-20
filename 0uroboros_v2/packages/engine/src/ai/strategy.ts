import { type Card, type CardTrigger } from '../game';
import { migrateEffects } from '../effects/migrate';
import type { AnyEffect, ChoiceOption, EffectStep, Who } from '../effects/types';

/** Agent versions read `v{release}.{revision}`; the revision counts changes to the playing profile since the release began. */
export const STRATEGY_RELEASE = 1;
export const versionLabel = (revision: number) => revision < 0 ? `before v${STRATEGY_RELEASE}.0` : `v${STRATEGY_RELEASE}.${Math.round(revision)}`;

/** Every AI player follows the shared money-and-thinning opener through this Cycle, then returns to its own objective. */
export const EARLY_ECONOMY_THROUGH = 4;
const EARLY_JUNK_VP = new Set(['basic-encryption']);
/** Payout per draw the server prompts call an upgrade over the starting Shyte; the AI itself reasons from Crypto per hand. */
export const CRYPTO_UPGRADE_PAYOUT = 3;
/** Non-Crypto play value (Power, other effects, Ongoing) a low-paying Crypto card needs before it is worth buying or keeping. */
const CRYPTO_SUPPORT_MIN = 1.5;
/** Cycles 1-4 points per Crypto a card pays per draw, before the deck reaches its Crypto target. */
const OPENING_CRYPTO_POINTS = 6;
/** Cycles 1-4 cost of filling one more deck slot, so one dense payer beats several thin ones. */
const OPENING_SLOT_COST = 5;
const earlyEconomy = (cycle: number) => cycle >= 1 && cycle <= EARLY_ECONOMY_THROUGH;

/** Relative worth of each effect family, in "hand points" (roughly one point of Node Power). */
export type StrategyWeights = {
  power: number;
  /** Per card drawn: drawing is how the deck cycles back to its best cards. */
  draw: number;
  /** Per Crypto earned by a Character during Runtime. */
  crypto: number;
  /** Per 100 Drain. */
  drain: number;
  /** Per 100 Restore. */
  restore: number;
  /** Per Victory Point. */
  vp: number;
  /** Flat bonus for cards that stay in the Effect Bank. */
  duration: number;
  /** Per card trashed from hand or deck: thinning weak cards out of the deck. */
  thin: number;
  /** Per point of opponent disruption (mill, steal, destroy, bump). */
  disrupt: number;
  /** Flat bonus for Chaos-pool cards once the endgame begins. */
  chaos: number;
};

/**
 * The opponent's plan of play. The strategist agent rewrites this between games;
 * every number is clamped to `PROFILE_BOUNDS` before the runtime sees it.
 */
export type StrategyProfile = {
  version: number;
  plan: string;
  /** Draft cycles that favour Crypto, deck thinning and draw engines. */
  economyUntilCycle: number;
  /** First Draft cycle where Chaos and Drain are valued at full strength. */
  chaosFromCycle: number;
  /** First Draft cycle where VP cards are valued at full strength. */
  vpFromCycle: number;
  /**
   * Share of full Chaos, Drain, Restore and VP value in the build phase (after the economy, before `chaosFromCycle`).
   * Unset or 0 keeps the build phase for engine and Power cards; Strat-G's three-phase plan balances it at 0.5.
   * Set by the designer only: experiments never change it.
   */
  midgameMix?: number;
  /** Crypto per five-card hand the economy aims for; Crypto buys taper off as the deck approaches it. */
  handCryptoTarget: number;
  /** Crypto cards paying less than this per draw, and doing little else, are never bought (Shyte dilutes the deck). */
  minCryptoValue: number;
  /** A purchase must be worth at least this many points after dilution. */
  minBuyScore: number;
  /** Share of the deck's average hand value a new card must beat to be worth adding. */
  dilution: number;
  weights: StrategyWeights;
  /** Learned per-card adjustments keyed by definition id, in points. */
  cardBias: Record<string, number>;
  /**
   * When set, the AI holds its hand until this Runtime turn (e.g. 3) so it can react to
   * where the opponent has already played. Other seats leave this unset.
   */
  holdUntilTurn?: number;
  /** Prefer Draft cards the opponent already bought this Draft (or earlier this Cycle). */
  mirrorBuys?: boolean;
};

export const DEFAULT_STRATEGY: StrategyProfile = {
  version: 0,
  plan: 'Shared early economy through Cycle 4 (Characters that print Crypto, plus Crypto cards ranked by Crypto per draw from Hacker/Crypto Draft slots; trash Basic Encryption, then Shyte once denser Crypto carries the hand), then pivot into Chaos for the Drain race, finishing on VP cards.',
  economyUntilCycle: 4,
  chaosFromCycle: 5,
  vpFromCycle: 12,
  handCryptoTarget: 9,
  minCryptoValue: 2,
  minBuyScore: 0.75,
  dilution: 0.5,
  weights: { power: 1, draw: 1.6, crypto: 1, drain: 2, restore: 1, vp: 2.2, duration: 0.8, thin: 1.2, disrupt: 0.8, chaos: 1.5 },
  cardBias: {},
};

type Range = readonly [number, number];
export const PROFILE_BOUNDS: {
  economyUntilCycle: Range; chaosFromCycle: Range; vpFromCycle: Range; handCryptoTarget: Range;
  minCryptoValue: Range; minBuyScore: Range; dilution: Range; weight: Range; cardBias: Range; midgameMix: Range;
} = {
  economyUntilCycle: [1, 12], chaosFromCycle: [3, 15], vpFromCycle: [4, 16], handCryptoTarget: [4, 16],
  minCryptoValue: [1, 5], minBuyScore: [0, 4], dilution: [0, 1.5], weight: [0, 5], cardBias: [-6, 6], midgameMix: [0, 1],
};

const clamp = (value: number, [min, max]: Range) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Coerces untrusted JSON (saved memory, model output) into a legal profile. */
export function sanitizeProfile(value: unknown, fallback: StrategyProfile = DEFAULT_STRATEGY): StrategyProfile {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<StrategyProfile>;
  const weights = { ...fallback.weights };
  for (const key of Object.keys(weights) as (keyof StrategyWeights)[]) weights[key] = clamp(finite(source.weights?.[key], fallback.weights[key]), PROFILE_BOUNDS.weight);
  const cardBias: Record<string, number> = {};
  for (const [id, bias] of Object.entries({ ...fallback.cardBias, ...(source.cardBias ?? {}) })) {
    const amount = clamp(finite(bias, 0), PROFILE_BOUNDS.cardBias);
    if (Math.abs(amount) >= 0.05) cardBias[id] = Math.round(amount * 100) / 100;
  }
  const economyUntilCycle = Math.round(clamp(finite(source.economyUntilCycle, fallback.economyUntilCycle), PROFILE_BOUNDS.economyUntilCycle));
  const chaosFromCycle = Math.round(clamp(Math.max(finite(source.chaosFromCycle, fallback.chaosFromCycle), economyUntilCycle + 1), PROFILE_BOUNDS.chaosFromCycle));
  const midgameMix = clamp(finite(source.midgameMix, fallback.midgameMix ?? 0), PROFILE_BOUNDS.midgameMix);
  const holdRaw = finite(source.holdUntilTurn, fallback.holdUntilTurn ?? 0);
  const holdUntilTurn = holdRaw >= 2 && holdRaw <= 3 ? Math.round(holdRaw) : undefined;
  const mirrorBuys = source.mirrorBuys === true || (source.mirrorBuys === undefined && fallback.mirrorBuys === true);
  return {
    version: Math.max(0, Math.round(finite(source.version, fallback.version))),
    plan: typeof source.plan === 'string' && source.plan.trim() ? source.plan.trim().slice(0, 600) : fallback.plan,
    economyUntilCycle,
    chaosFromCycle,
    vpFromCycle: Math.round(clamp(finite(source.vpFromCycle, fallback.vpFromCycle), PROFILE_BOUNDS.vpFromCycle)),
    ...(midgameMix ? { midgameMix } : {}),
    handCryptoTarget: clamp(finite(source.handCryptoTarget, fallback.handCryptoTarget), PROFILE_BOUNDS.handCryptoTarget),
    minCryptoValue: Math.round(clamp(finite(source.minCryptoValue, fallback.minCryptoValue), PROFILE_BOUNDS.minCryptoValue)),
    minBuyScore: clamp(finite(source.minBuyScore, fallback.minBuyScore), PROFILE_BOUNDS.minBuyScore),
    dilution: clamp(finite(source.dilution, fallback.dilution), PROFILE_BOUNDS.dilution),
    weights,
    cardBias,
    ...(holdUntilTurn ? { holdUntilTurn } : {}),
    ...(mirrorBuys ? { mirrorBuys: true } : {}),
  };
}

/** What the opponent knows when it values a card: its own deck and public scoreboard state. */
export type StrategyContext = {
  cycle: number;
  finalCycle: number;
  /** Every card the AI owns outside the board. */
  owned: readonly Card[];
  ownServers: number; ownServersMax: number;
  enemyServers: number; enemyServersMax: number;
  /** Definition ids the other seat bought this Cycle's Draft (for mirrorBuys). */
  opponentBoughtIds?: readonly string[];
  /** Card definitions by id, so random morph forms can be valued; unset, morphs count for nothing. */
  lookup?: (id: string) => Card | undefined;
};

export type Phase = 'economy' | 'build' | 'endgame';
export function strategyPhase(profile: StrategyProfile, cycle: number): Phase {
  return cycle <= profile.economyUntilCycle ? 'economy' : cycle < profile.chaosFromCycle ? 'build' : 'endgame';
}

type Multipliers = { econ: number; drain: number; restore: number; vp: number };

/** How far the build phase leans toward the endgame (0 outside it). */
const midgameShare = (profile: StrategyProfile, cycle: number) => strategyPhase(profile, cycle) === 'build' ? profile.midgameMix ?? 0 : 0;

function multipliers(profile: StrategyProfile, context: StrategyContext): Multipliers {
  const phase = strategyPhase(profile, context.cycle);
  const mix = midgameShare(profile, context.cycle);
  // Cards bought in a Draft are first drawn next Cycle, and their Crypto is spent the Draft after.
  const futureDrafts = Math.max(0, context.finalCycle - context.cycle - 1);
  const econ = (phase === 'economy' ? 1.25 : phase === 'build' ? 0.9 : 0.5) * Math.min(1, futureDrafts / 4);
  const killable = context.enemyServers <= context.enemyServersMax * 0.35 ? 1.3 : 1;
  const drain = (context.cycle < profile.chaosFromCycle ? 0.45 + 0.9 * mix : 1.35) * killable;
  const damage = context.ownServersMax ? 1 - context.ownServers / context.ownServersMax : 0;
  const restore = Math.max(0.4 + 1.6 * damage, 0.4 + 0.6 * mix);
  const vp = context.cycle >= context.finalCycle - 1 ? 1.6 : context.cycle >= profile.vpFromCycle ? 1 : 0.25 + 0.75 * mix;
  return { econ, drain, restore, vp };
}

const NEUTRAL: Multipliers = { econ: 1, drain: 1, restore: 1, vp: 1 };
const ENEMY = new Set<Who>(['opponent', 'loser', 'other']);
/** Cards that only clog a deck when gained (Locations hand them out). */
const JUNK_CARDS = new Set(['glitch', 'shyte-coin', 'crypto-shyte']);
const targetWho = (step: EffectStep): Who | undefined => step.target && 'who' in step.target ? step.target.who : undefined;
const listValue = (steps: readonly EffectStep[] | undefined, w: StrategyWeights, m: Multipliers) =>
  (steps ?? []).reduce((sum, step) => sum + effectValue(step, w, m), 0);

/** Worth of one step to whoever controls it; harming the other player counts as positive. */
function effectValue(step: EffectStep, w: StrategyWeights, m: Multipliers): number {
  const amount = step.amount ?? 1;
  const who = targetWho(step);
  const foe = who !== undefined && ENEMY.has(who);
  const mixed = who === 'both' || who === 'any';
  const sign = foe ? -1 : 1;
  const option = (o: ChoiceOption) => listValue(o.cost, w, m) + listValue(o.effects, w, m);
  let value: number;
  switch (step.action) {
    case 'draw': value = sign * w.draw * amount; break;
    case 'gainCrypto': value = sign * w.crypto * amount * m.econ; break;
    case 'payCrypto': value = -sign * w.crypto * amount * m.econ; break;
    case 'gainCard': value = sign * (step.cardId && JUNK_CARDS.has(step.cardId) ? -w.thin : w.draw * 1.2) * amount; break;
    case 'gainVP': value = sign * w.vp * amount; break;
    case 'damageServer': value = (foe ? 1 : mixed ? 0 : -1) * w.drain * (amount / 100) * m.drain; break;
    case 'repairServer': value = sign * w.restore * (amount / 100) * m.restore; break;
    case 'destroyServer': value = foe ? 6 : -6; break;
    case 'trashCards': value = foe ? w.disrupt * amount : w.thin * amount * m.econ; break;
    case 'discardCards': value = foe ? w.disrupt * amount : -0.3 * amount; break;
    case 'scry': value = w.thin * 0.3 * amount * m.econ; break;
    case 'peek': value = w.thin * 0.1 * amount * m.econ; break;
    case 'mill': case 'stealCrypto': case 'bump': value = (foe || mixed ? 1 : -0.5) * w.disrupt * amount; break;
    case 'destroyCard': case 'trashCard': {
      const relation = step.target?.type === 'card' ? step.target.relation : undefined;
      value = relation === 'self' ? 0 : (foe || mixed ? 1 : -1) * w.disrupt * 1.5;
      break;
    }
    case 'moveCard': case 'transferPower': value = w.power * 0.5; break;
    case 'changePower': value = mixed ? w.power * 0.3 * Math.abs(amount) : sign * w.power * 0.6 * amount; break;
    case 'healCard': value = (mixed ? 1 : sign) * w.power * 0.4 * amount; break;
    case 'restoreCard': value = w.power * 0.8; break;
    case 'recover': value = sign * w.draw * 0.8 * amount; break;
    case 'attachModifier': value = sign * w.power * 1.5; break;
    case 'removeModifier': value = (foe ? 1 : -0.5) * w.power; break;
    case 'choice': {
      const values = (step.options ?? []).map(option).sort((a, b) => b - a);
      const count = Math.max(1, step.choose?.count ?? 1);
      // An opponent chooser leaves the controller the worst options.
      const picked = step.choose?.chooser === 'opponent' ? values.slice(-count) : values.slice(0, count);
      value = picked.reduce((sum, next) => sum + next, 0);
      break;
    }
    case 'random': {
      const options = step.options ?? [];
      value = options.length ? options.reduce((sum, next) => sum + option(next), 0) / options.length : 0;
      break;
    }
    default: value = 0;
  }
  return value + listValue(step.then, w, m);
}

const migrated = new WeakMap<readonly AnyEffect[], EffectStep[]>();
const stepsOf = (effects: readonly AnyEffect[] | undefined): EffectStep[] => {
  if (!effects?.length) return [];
  let steps = migrated.get(effects);
  if (!steps) migrated.set(effects, steps = migrateEffects(effects, 'card'));
  return steps;
};

/** Sum of `amount` (1 when unset) over steps with this action aimed at the controller, or at the other player when `enemy`. */
export function effectTotal(effects: readonly AnyEffect[] | undefined, action: EffectStep['action'], enemy = false): number {
  return stepsOf(effects)
    .filter(step => step.action === action && ENEMY.has(targetWho(step) ?? 'self') === enemy)
    .reduce((sum, step) => sum + (step.amount ?? 1), 0);
}

/** Net Crypto a step list pays its controller, following `then`; an optional payment is only made when it nets Crypto. */
function netCrypto(steps: readonly EffectStep[] | undefined): number {
  return (steps ?? []).reduce((sum, step) => {
    const own = ENEMY.has(targetWho(step) ?? 'self') ? 0
      : step.action === 'gainCrypto' ? step.amount ?? 1 : step.action === 'payCrypto' ? -(step.amount ?? 1) : 0;
    const total = own + netCrypto(step.then);
    return sum + (step.optional ? Math.max(0, total) : total);
  }, 0);
}

/** Whether any step in the list has one of these actions. */
export const hasAction = (effects: readonly AnyEffect[] | undefined, ...actions: EffectStep['action'][]) => stepsOf(effects).some(step => actions.includes(step.action));

const sumEffects = (effects: readonly AnyEffect[] | undefined, w: StrategyWeights, m: Multipliers) => listValue(stepsOf(effects), w, m);

/** Expected firings of an Ongoing trigger while its card is on the board for a Cycle. */
const triggerFirings = (trigger: CardTrigger) =>
  trigger.kind === 'listenAccess' || (trigger.kind === 'whenPlayed' && trigger.scope === 'thisNode') ? 0.5 : 1;
/** Rough Crypto the enemy gains per Cycle, which a `mirrorCrypto` Ongoing copies. */
const MIRRORED_CRYPTO = 2;

/** Worth of a card's Ongoing triggers over one Cycle on the board. */
function triggerValue(card: Card, w: StrategyWeights, m: Multipliers): number {
  return (card.triggers ?? []).reduce((sum, trigger) => {
    if ('then' in trigger) return sum + triggerFirings(trigger) * listValue(trigger.then, w, m);
    if (trigger.kind === 'mirrorCrypto') return sum + w.crypto * MIRRORED_CRYPTO * m.econ;
    return sum + w.power * 0.5;
  }, 0);
}

/** Expected Crypto from a card's Ongoing triggers over one Cycle on the board. */
function triggerCrypto(card: Card): number {
  return (card.triggers ?? []).reduce((sum, trigger) =>
    sum + ('then' in trigger ? triggerFirings(trigger) * effectTotal(trigger.then, 'gainCrypto') : trigger.kind === 'mirrorCrypto' ? MIRRORED_CRYPTO : 0), 0);
}

/** Average On Reveal Crypto of the forms a random morph can become (the new form reveals as if played). */
function morphCrypto(card: Card, context: StrategyContext | undefined, depth: number): number {
  if (!context?.lookup || depth > 1) return 0;
  return stepsOf(card.onReveal).reduce((sum, step) => {
    if (step.action !== 'morph' || step.selection !== 'random' || !step.formIds?.length) return sum;
    const forms = step.formIds.map(id => context.lookup!(id)).filter((form): form is Card => Boolean(form));
    return forms.length ? sum + forms.reduce((total, form) => total + revealCrypto(form, context, depth + 1), 0) / forms.length : sum;
  }, 0);
}

/** Crypto a card is sure to pay when revealed: gains, steals and random morph forms. */
function revealCrypto(card: Card, context?: StrategyContext, depth = 0): number {
  return effectTotal(card.onReveal, 'gainCrypto') + effectTotal(card.onReveal, 'stealCrypto', true) + morphCrypto(card, context, depth);
}

const printedPower = (card: Card) => card.powerSource ? 2 : (card.power ?? 0) + (card.powerDelta ?? 0);

/**
 * Whether the AI deploys a Crypto card instead of holding it for its Draft auto-pay. Plain coins stay in hand;
 * anything with Power, Ongoing triggers, non-Crypto effects or a reveal paying more than holding is played.
 */
export function cryptoPlays(card: Card, context?: StrategyContext): boolean {
  if (card.type !== 'Crypto') return true;
  if (printedPower(card) > 0 || card.triggers?.length) return true;
  if (stepsOf(card.onReveal).some(step => step.action !== 'gainCrypto')) return true;
  return revealCrypto(card, context) > (card.cryptoValue ?? 0);
}

/** Crypto a Crypto card yields per draw: what it pays when played, or its Draft auto-pay when held. Ongoing income is not counted. */
export function cryptoPayout(card: Card, context?: StrategyContext): number {
  const held = card.cryptoValue ?? 0;
  return cryptoPlays(card, context) ? Math.max(held, revealCrypto(card, context)) : held;
}

/** What a played Crypto card is worth beyond the Crypto it pays: Power, other reveal effects and Ongoing triggers. */
function cryptoSupport(card: Card, w: StrategyWeights, m: Multipliers, context?: StrategyContext): number {
  if (!cryptoPlays(card, context)) return 0;
  const others = stepsOf(card.onReveal).filter(step => step.action !== 'gainCrypto' && step.action !== 'morph');
  return w.power * printedPower(card) + listValue(others, w, m) + sumEffects(card.onCollapse, w, m)
    + sumEffects(card.recurring, w, m) + triggerValue(card, w, m);
}

/** Crypto that pays under `minCryptoValue` and does little else: Shyte. It is never bought, and trashed once the deck's Crypto per hand holds without it. */
export function isJunkCrypto(card: Card, profile: StrategyProfile, context: StrategyContext): boolean {
  if (card.type !== 'Crypto' || cryptoPayout(card, context) >= profile.minCryptoValue) return false;
  return cryptoSupport(card, profile.weights, NEUTRAL, context) < CRYPTO_SUPPORT_MIN;
}

/** Worth of a list of steps to the player who controls them; used to rank choice options. */
export function optionValue(steps: readonly EffectStep[], profile: StrategyProfile, context?: StrategyContext): number {
  return listValue(steps, profile.weights, context ? multipliers(profile, context) : NEUTRAL);
}

/** Expected Crypto one draw of this card yields. Crypto cards pay on reveal or auto-pay at Draft; other cards' Crypto (net of any payment) depends on being deployed. */
export function cryptoPerDraw(card: Card, context?: StrategyContext): number {
  if (card.type === 'Crypto') return cryptoPayout(card, context) + 0.7 * triggerCrypto(card);
  return 0.7 * (netCrypto(stepsOf(card.onReveal)) + triggerCrypto(card));
}

/** Expected Crypto a five-card hand from this deck produces: Crypto per card slot, times five. */
export function cryptoPerHand(owned: readonly Card[], context?: StrategyContext): number {
  if (!owned.length) return 0;
  return (owned.reduce((sum, card) => sum + cryptoPerDraw(card, context), 0) / owned.length) * 5;
}

/**
 * Whether trashing `card` keeps the deck's income: Crypto per hand stays at least where it is, or at the hand target.
 * A card paying under the deck's average per slot raises Crypto per hand when it leaves, so one dense payer frees several Shytes.
 */
export function incomeHoldsWithout(card: Card, owned: readonly Card[], profile: StrategyProfile, context?: StrategyContext): boolean {
  const rest = owned.filter(item => item.id !== card.id);
  if (!rest.length || rest.length === owned.length) return false;
  return cryptoPerHand(rest, context) >= Math.min(profile.handCryptoTarget, cryptoPerHand(owned, context)) - 1e-9;
}

/**
 * Leanness a Crypto source buys: how many owned junk Crypto cards its per-draw Crypto replaces, less the slot it takes,
 * valued as that many trashes. A 5-payer stands in for five Shytes in one card.
 */
function consolidationValue(card: Card, profile: StrategyProfile, context: StrategyContext, m: Multipliers): number {
  const junk = context.owned.filter(item => isJunkCrypto(item, profile, context));
  if (!junk.length) return 0;
  const junkPay = Math.max(0.25, junk.reduce((sum, item) => sum + cryptoPerDraw(item, context), 0) / junk.length);
  const replaced = Math.min(junk.length, Math.floor(cryptoPerDraw(card, context) / junkPay + 1e-9)) - 1;
  return replaced > 0 ? profile.weights.thin * replaced * m.econ * 0.5 : 0;
}

/** Worth of a card each time it is drawn and played, excluding the VP it scores just by being owned. */
export function handValue(card: Card, profile: StrategyProfile, context: StrategyContext): number {
  const w = profile.weights, m = multipliers(profile, context);
  if (card.type === 'Crypto') {
    // A Crypto card is either held for its Draft auto-pay or played for its reveal, never both.
    const held = w.crypto * (card.cryptoValue ?? 0) * Math.max(m.econ, 0.3);
    if (!cryptoPlays(card, context)) return held;
    const played = w.crypto * revealCrypto(card, context) * Math.max(m.econ, 0.3) + cryptoSupport(card, w, m, context)
      + (card.schedule ?? []).reduce((sum, entry) => sum + sumEffects(entry.effects, w, m), 0);
    return Math.max(held, played);
  }
  const lasting = card.duration ? Math.min(card.duration, 3) : 1;
  return w.power * printedPower(card)
    + sumEffects(card.onReveal, w, m)
    + sumEffects(card.onCollapse, w, m) * lasting
    + sumEffects(card.recurring, w, m) * lasting
    + (card.schedule ?? []).reduce((sum, entry) => sum + sumEffects(entry.effects, w, m), 0)
    + triggerValue(card, w, m) * lasting
    + (card.duration ? w.duration : 0);
}

const definition = (card: Card) => card.definitionId ?? card.id;

/** Points gained by adding one copy of `card` to the deck; zero or below means skip it. */
export function draftScore(card: Card, profile: StrategyProfile, context: StrategyContext, plannedCopies = 0): number {
  const m = multipliers(profile, context);
  const futureCycles = Math.max(0, context.finalCycle - context.cycle);
  const uses = Math.min(1, futureCycles / 3);
  const owned = context.owned;
  const average = owned.length ? owned.reduce((sum, item) => sum + handValue(item, profile, context), 0) / owned.length : 0;
  const dilution = profile.dilution * average * uses;
  const copies = owned.filter(item => definition(item) === definition(card)).length + plannedCopies;
  const bias = profile.cardBias[definition(card)] ?? 0;
  const id = definition(card);
  const opening = earlyEconomy(context.cycle);
  const mirrorBonus = profile.mirrorBuys && context.opponentBoughtIds?.includes(id) ? 4.5 : 0;

  if (card.type === 'Crypto') {
    if (isJunkCrypto(card, profile, context)) return -Infinity;
    const payout = cryptoPayout(card, context);
    const support = cryptoSupport(card, profile.weights, m, context);
    const need = Math.min(1, Math.max(0.15, (profile.handCryptoTarget - cryptoPerHand(owned, context)) / profile.handCryptoTarget));
    const decay = 1 / (1 + 0.25 * plannedCopies);
    const lean = consolidationValue(card, profile, context, m);
    // Shared opener: Crypto per draw is worth the most while the deck is short of its target, and every extra slot costs a draw.
    if (opening) return OPENING_CRYPTO_POINTS * payout * (0.4 + need) * decay - OPENING_SLOT_COST + support + lean + bias + mirrorBonus;
    return (profile.weights.crypto * payout * (0.4 + need) * m.econ + support * uses + lean) * decay - dilution + bias + mirrorBonus;
  }
  if (card.type === 'VP') {
    if (opening && EARLY_JUNK_VP.has(id)) return -Infinity;
    if (opening) return -Infinity;
    const points = profile.weights.vp * (card.vp ?? 0) * m.vp;
    return points + handValue(card, profile, context) * uses * 0.5 - dilution + bias + mirrorBonus;
  }
  if (opening && isChaos(card)) return -Infinity;
  const chaos = isChaos(card)
    ? (strategyPhase(profile, context.cycle) === 'endgame' ? profile.weights.chaos : (-0.5 + 1.5 * midgameShare(profile, context.cycle)) * profile.weights.chaos)
    : 0;
  // Early opener still values draw, Actions and trash enablers (Night Scythe) once Crypto buys are scored above them.
  const value = (handValue(card, profile, context) + chaos + consolidationValue(card, profile, context, m)) * uses;
  return value / (1 + 0.5 * copies) - dilution + bias + mirrorBonus;
}

/** Compiled cards drop their pool, but only Chaos Characters carry these classes. */
export function isChaos(card: Card): boolean {
  return card.cardClass === 'Hacker' || card.cardClass === 'Attack' || card.cardClass === 'Horror';
}

export type DraftOption = { id: string; card: Card; available: number };

/**
 * Picks the purchase set worth the most points within the wallet (bounded knapsack, diminishing
 * copies). Returns pile ids, most expensive first, so big buys happen before the wallet scatters.
 */
export function planDraft(options: readonly DraftOption[], wallet: number, profile: StrategyProfile, context: StrategyContext, maxCopies = 3): string[] {
  const budget = Math.max(0, Math.floor(wallet));
  type Item = { id: string; cost: number; value: number };
  const items: Item[] = [];
  for (const option of options) {
    const cost = Math.max(0, option.card.cost);
    for (let copy = 0; copy < Math.min(maxCopies, option.available); copy++) {
      const value = draftScore(option.card, profile, context, copy);
      if (!(value >= profile.minBuyScore)) break;
      items.push({ id: option.id, cost, value });
    }
  }
  // best[b] = best value with budget b; choice tracks the items taken. Items of one pile are in decreasing value order, so 0/1 knapsack keeps copies honest.
  const best = new Array<number>(budget + 1).fill(0);
  const taken: number[][] = Array.from({ length: budget + 1 }, () => []);
  items.forEach((item, index) => {
    for (let b = budget; b >= item.cost; b--) {
      const candidate = best[b - item.cost] + item.value;
      if (candidate > best[b] + 1e-9) {
        best[b] = candidate;
        taken[b] = [...taken[b - item.cost], index];
      }
    }
  });
  return taken[budget].map(index => items[index]).sort((a, b) => b.cost - a.cost || b.value - a.value).map(item => item.id);
}

/** Higher plays first: draw engines fuel later turns; Drain matters most in the endgame. */
export function deployPriority(card: Card, profile: StrategyProfile, context: StrategyContext): number {
  const total = (action: EffectStep['action'], enemy = false) => effectTotal(card.onReveal, action, enemy);
  const attack = strategyPhase(profile, context.cycle) === 'endgame' ? 1 : midgameShare(profile, context.cycle);
  return total('draw') * 2 + ((card.power ?? 0) + (card.powerDelta ?? 0)) * 0.5 + attack * total('damageServer', true) / 50 + (card.type === 'VP' ? 10 : 0);
}

/** A Location's effect lists, as content and the runtime carry them. */
export type LocationRules = {
  effects?: readonly AnyEffect[]; ongoing?: readonly AnyEffect[]; onPlay?: readonly AnyEffect[];
  startTurn2?: readonly AnyEffect[]; startTurn3?: readonly AnyEffect[];
  conditions?: readonly { effects: readonly AnyEffect[] }[];
};
/**
 * What a Location is worth to one player in hand points: `win` if they hold the Node when its effects fire, `lose` if
 * the other player does (the mirror image), and `reveal` for each of their cards revealed there. `stake` is win − lose:
 * positive means contest it, negative means winning it hands the other player the bonus.
 */
export type LocationStakes = { win: number; lose: number; stake: number; reveal: number };

const locationSteps = new WeakMap<readonly AnyEffect[], EffectStep[]>();
const locationStepsOf = (effects: readonly AnyEffect[] | undefined, scope: 'location' | 'locationPlay'): EffectStep[] => {
  if (!effects?.length) return [];
  let steps = locationSteps.get(effects);
  if (!steps) locationSteps.set(effects, steps = migrateEffects(effects, scope));
  return steps;
};

/** The seat that acts on a Location's effects: the Node's winner, or the owner of the card revealed there. */
type Side = 'winner' | 'played';
/** Rewrites a Location step's targets from the acting seat; even-handed targets resolve to `even`. */
function fromSeat(step: EffectStep, side: Side, even: 'self' | 'opponent'): EffectStep {
  const mine: Who[] = side === 'winner' ? ['winner', 'self'] : ['played', 'self'];
  const theirs: Who[] = side === 'winner' ? ['loser', 'opponent'] : ['other', 'opponent'];
  const seat = (who: Who): Who => mine.includes(who) ? 'self' : theirs.includes(who) ? 'opponent' : even;
  const target = step.target && 'who' in step.target ? { ...step.target, who: seat(step.target.who) } : step.target;
  const option = (o: ChoiceOption) => ({ ...o, cost: o.cost?.map(item => fromSeat(item, side, even)), effects: o.effects.map(item => fromSeat(item, side, even)) });
  return { ...step, target, then: step.then?.map(item => fromSeat(item, side, even)), options: step.options?.map(option) } as EffectStep;
}

/** Effects on both sides, the trailing player or a random side are priced as the average of landing on either seat. */
const seatValue = (steps: readonly EffectStep[], side: Side, w: StrategyWeights, m: Multipliers) =>
  steps.reduce((sum, step) => sum + (effectValue(fromSeat(step, side, 'self'), w, m) + effectValue(fromSeat(step, side, 'opponent'), w, m)) / 2, 0);

/**
 * Prices a Location's rule with this profile's weights for a card deployed on `turn`. On collapse fires once at the end
 * of the Cycle; Ongoing fires at the start of each later turn for whoever leads the Node then; Start of turn 2/3 fires
 * once if that turn is still ahead; On reveal fires for the revealing card's owner. The winner acts on every effect
 * (it picks what a trash or discard takes), so effects are priced from its seat and losing is the mirror image.
 */
export function locationStakes(location: LocationRules, profile: StrategyProfile, context: StrategyContext, turn = 1): LocationStakes {
  const w = profile.weights, m = multipliers(profile, context);
  const timed: [EffectStep[], number][] = [
    [locationStepsOf(location.effects, 'location'), 1],
    [locationStepsOf(location.ongoing, 'location'), Math.max(0, 3 - turn)],
    [locationStepsOf(location.startTurn2, 'location'), turn < 2 ? 1 : 0],
    [locationStepsOf(location.startTurn3, 'location'), turn < 3 ? 1 : 0],
  ];
  // Condition rewards are seat-personal (once if met); price lightly as reveal-side value.
  const conditionValue = (location.conditions ?? []).reduce((sum, condition) => {
    const steps = migrateEffects(condition.effects, 'locationCondition');
    return sum + steps.reduce((total, step) => total + effectValue(step, w, m), 0) * 0.5;
  }, 0);
  const win = round2(timed.reduce((sum, [steps, times]) => sum + (times ? times * seatValue(steps, 'winner', w, m) : 0), 0));
  return { win, lose: round2(-win), stake: round2(2 * win), reveal: round2(seatValue(locationStepsOf(location.onPlay, 'locationPlay'), 'played', w, m) + conditionValue) };
}
const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

/** One plain line on how a Location plays, for agents that read rules as text. */
export function locationRead(location: LocationRules, profile: StrategyProfile = DEFAULT_STRATEGY, context?: StrategyContext): string {
  const read = locationStakes(location, profile, context ?? { cycle: 8, finalCycle: 16, owned: [], ownServers: 3500, ownServersMax: 3500, enemyServers: 3500, enemyServersMax: 3500 }, 1);
  const parts = [
    read.stake >= 0.5 ? `contest it: holding it is worth about ${read.stake} hand points more than losing it`
      : read.stake <= -0.5 ? `winning it hands the other player about ${-read.stake} hand points, so commit only what the Circuit count needs or concede it`
        : 'about even for both sides; it matters through which cards sit there',
    ...(Math.abs(read.reveal) >= 0.2 ? [`each card you reveal here ${read.reveal > 0 ? 'gains' : 'costs'} you about ${Math.abs(read.reveal)}`] : []),
  ];
  return parts.join('; ');
}

/**
 * Lower means the AI would rather lose it. Trashing removes a card for good, so positive VP cards
 * are protected; a discard keeps the card owned, so only its hand value matters. In Cycles 1-4 the
 * shared early economy overrides that for Basic Encryption and for Crypto. Junk Crypto (Shyte) is the first card out
 * once the deck's Crypto per hand holds without it, and is kept through the opener while it still funds the hand.
 */
export function keepValue(card: Card, profile: StrategyProfile, context: StrategyContext, permanent: boolean): number {
  const hand = handValue(card, profile, context) + (profile.cardBias[definition(card)] ?? 0);
  const id = definition(card);
  if (permanent && isJunkCrypto(card, profile, context)) {
    if (incomeHoldsWithout(card, context.owned, profile, context)) return 0.5;
    if (earlyEconomy(context.cycle)) return 40;
  }
  if (permanent && earlyEconomy(context.cycle)) {
    if (EARLY_JUNK_VP.has(id)) return -20;
    if (card.type === 'Crypto') return 45 + cryptoPayout(card, context);
  }
  if (card.type === 'VP' && permanent) return (card.vp ?? 0) > 0 ? 50 + (card.vp ?? 0) : -10;
  return hand;
}

/** Below this keep value a card is deck clutter whatever the deck holds (Shyte-Coin, Glitch). */
export const JUNK_KEEP_VALUE = 1.5;
/** Thinning never takes a deck below this many cards, junk aside. */
export const MIN_THIN_DECK = 8;

/**
 * Which of the controller's own `candidates` to trash, weakest first, up to `limit`. Junk always goes. In Cycles 1-4
 * Basic Encryption goes first, then junk Crypto (Shyte) one card at a time while the deck's Crypto per hand holds
 * without it. After the opener, cards go when they fall below the purchase bar, while the deck keeps MIN_THIN_DECK cards
 * and Crypto stays until the rest of the deck still meets `handCryptoTarget`.
 */
export function thinningPicks(candidates: readonly Card[], profile: StrategyProfile, context: StrategyContext, limit: number): Card[] {
  let owned = [...context.owned];
  const value = (card: Card) => keepValue(card, profile, { ...context, owned }, true);
  const picks: Card[] = [];
  for (const card of [...candidates].sort((a, b) => value(a) - value(b))) {
    if (picks.length >= limit) break;
    const rest = owned.filter(item => item.id !== card.id);
    const id = definition(card);
    if (earlyEconomy(context.cycle) && card.type === 'Crypto') {
      if (!isJunkCrypto(card, profile, context) || !incomeHoldsWithout(card, owned, profile, context)) continue;
    } else if (card.type === 'Crypto' && !isJunkCrypto(card, profile, context) && cryptoPerHand(rest, context) < profile.handCryptoTarget) {
      // Keep Crypto worth keeping (not Shyte) that still funds the hand target, even when endgame econ makes it look like junk.
      continue;
    }
    if (value(card) >= JUNK_KEEP_VALUE) {
      if (rest.length < MIN_THIN_DECK) break;
      if (earlyEconomy(context.cycle) && EARLY_JUNK_VP.has(id)) {
        picks.push(card);
        owned = rest;
        continue;
      }
      const average = rest.length ? rest.reduce((sum, item) => sum + handValue(item, profile, context), 0) / rest.length : 0;
      if (value(card) >= profile.dilution * average) break;
    }
    picks.push(card);
    owned = rest;
  }
  return picks;
}
