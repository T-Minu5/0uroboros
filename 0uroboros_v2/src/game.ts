export type Phase = "runtime" | "collapse" | "draft";
export type CardType = "Character" | "VP" | "Crypto";

import type { AnyEffect, EffectStep } from "./effects/types";

export type EffectChoiceOption = { id: string; label: string; effects: readonly LegacyEffect[] };
export type CardModifier = {
  id: string;
  kind: 'doublePrintedEffects' | 'powerAuraAtLocation' | 'movableEachTurn' | 'authored';
  amount?: number;
  sourceName?: string;
  /** Authored mods carry a snapshot of their definition, taken when attached. */
  modId?: string;
  name?: string;
  badge?: string;
  onReveal?: readonly EffectStep[];
  onCollapse?: readonly EffectStep[];
  recurring?: readonly EffectStep[];
};
/** @deprecated The pre-catalog effect shape; read it through `migrateEffects` (src/effects/migrate.ts). */
export type EvaluationEffect = LegacyEffect;
/** The pre-catalog effect shape, still accepted from saved content and migrated wherever it is read. */
export type LegacyEffect = {
  kind: "draw" | "actions" | "crypto" | "vp" | "drain" | "restore" | "moveSelf" | "moveCard" | "modifyPower" | "probability" | "trashSelf" | "recover" | "choice" | "mill" | "transferPower" | "handDiscard" | "handTrash" | "scry" | "gain" | "selfDestroyBackup" | "random" | "morph" | "attachModifier" | "damageLoser" | "restorePrimary" | "trashLowestAtLocation" | "trashAtLocation" | "destroyAtLocation" | "boostPowerAtLocation" | "stealCrypto" | "destroyCard" | "bump";
  amount?: number;
  target?: "primary" | "backup";
  options?: readonly EffectChoiceOption[];
  prompt?: string;
  opponent?: boolean;
  chooser?: "owner" | "opponent";
  optional?: boolean;
  min?: number;
  /** Follow-ups that run only once this effect has resolved (a paid cost, a found target). */
  then?: readonly LegacyEffect[];
  /** Authoring marker: every later step in the same list waits on this one. Compiled into `then`. */
  chain?: boolean;
  cardId?: string;
  destination?: "top" | "discard" | "hand";
  formIds?: readonly string[];
  selection?: "sequential" | "random";
  /** Location board: which side(s) to take cards from. */
  boardSide?: "either" | "winner" | "loser" | "both" | "played" | "other";
  /** Location board: pick the card by UI choice or at random (moves also randomize destination when random). */
  cardPick?: "choice" | "random";
  /** Location board trash/destroy: which revealed card(s) here are hit. */
  rank?: "weakest" | "strongest" | "first";
  /** Relative play-order target among revealed cards (previous/next to the resolving card). */
  cardRelation?: "previous" | "next";
  /** Attach modifier to a revealed board card instead of a Character in deck zones. */
  boardHost?: boolean;
  /**
   * Which neighbour(s) a Power transfer uses. "choice" lets the player pick a side; "left"/"right"
   * fix the side; "split" divides the amount between both, giving the odd point to the left.
   * At an edge Node, "split" uses the one neighbour for the whole amount.
   */
  direction?: "choice" | "left" | "right" | "split";
  /** Push moves Power out of this Node, pull draws it in. Defaults to "either" for "choice", else "push". */
  flow?: "either" | "push" | "pull";
  /** Bump: the opponent zone a card leaves for its owner's Discard. */
  zone?: "bank" | "wallet" | "either";
  modifier?: "doublePrintedEffects" | "powerAuraAtLocation" | "movableEachTurn";
};
/** Character subtypes, then the VP subtypes. */
export type CardClass = 'Action' | 'Utility' | 'Runtime' | 'Attack' | 'Hacker' | 'Horror' | 'Volume' | 'Solar-monk';
export const CARD_CLASSES: readonly CardClass[] = ['Action', 'Utility', 'Runtime', 'Attack', 'Hacker', 'Horror', 'Volume', 'Solar-monk'];
export const VP_CLASSES: readonly CardClass[] = ['Volume', 'Solar-monk'];
/** Solar-monks are VP cards that are also Characters: they cost an Action and count wherever an effect says Character. */
export const isSolarMonk = (card: Pick<Card, 'type' | 'cardClass'>) => card.type === 'VP' && card.cardClass === 'Solar-monk';
export const isCharacterCard = (card: Pick<Card, 'type' | 'cardClass'>) => card.type === 'Character' || isSolarMonk(card);
export const POWER_SOURCES = ['trash', 'destroyed', 'moved', 'movedByOwner'] as const;
export type PowerSource = typeof POWER_SOURCES[number];
export type Card = {
  cardClass?: CardClass;
  generated?: boolean;
  definitionId?: string;
  vp?: number;
  cryptoValue?: number;
  duration?: number;
  durationPeriod?: "runtime" | "cycle";
  schedule?: readonly {at:number;timing?:"start"|"end";effects:readonly AnyEffect[]}[];
  recurring?: readonly AnyEffect[];
  onReveal?: readonly AnyEffect[];
  onCollapse?: readonly AnyEffect[];
  modifiers?: CardModifier[];
  storyText?: string;
  id: string;
  name: string;
  type: CardType;
  power?: number;
  /** Adds a live count to printed Power: cards in the shared Trash, cards destroyed by both players,
      cards moved this game by anyone, or cards moved this game by the card's owner. */
  powerSource?: PowerSource;
  /** The card's own Power aura: +N Power to each other revealed ally at its Location. Shows no mod badge. */
  aura?: number;
  /** The card may move itself to another open Node once each Runtime turn, or once each Cycle. */
  selfMove?: "turn" | "cycle";
  /** Power gained or lost from effects. Stays with this copy for the rest of the game, in every zone. */
  powerDelta?: number;
  /** View only: printed Power, set when the shown Power differs from it. */
  basePower?: number;
  cost: number;
  art: string;
  effect: string;
};

export const starterCards: Card[] = [
  { id: "slash", name: "Slash-Dot", type: "Character", power: 3, cost: 4, art: "/assets/card_art/base cards/slash-dot.png", effect: "+3 Cards." },
  { id: "dash-dot", name: "Dash-Dot", type: "Character", power: 2, cost: 3, art: "/assets/card_art/base cards/action/dash-dot.png", effect: "+1 Card. +2 Actions." },
  { id: "dotkrawler", name: "Dotkrawler", type: "Character", power: 1, cost: 4, art: "/assets/card_art/base cards/action/dotkrawler.png", effect: "+1 Card. Push or pull 1 power. +2 Actions." },
  { id: "razor", name: "Rezz-Razor", type: "Character", power: 4, cost: 3, art: "/assets/card_art/chaos cards/rezz-razor.png", effect: "Drain 75. +1 Card. +1 Action." },
  { id: "blade", name: "Rezz-Blade", type: "Character", power: 3, cost: 4, art: "/assets/card_art/chaos cards/rezz-blade.png", effect: "Drain 100. +1 Card. +2 Actions." },
  { id: "byte-1", name: "Byte-Coin", type: "Crypto", cost: 3, art: "/assets/card_art/crypto/byte-coin.png", effect: "+2 Crypto." },
  { id: "byte-2", name: "Byte-Coin", type: "Crypto", cost: 3, art: "/assets/card_art/crypto/byte-coin.png", effect: "+2 Crypto." },
  { id: "kilo", name: "Kilo-Coin", type: "Crypto", cost: 6, art: "/assets/card_art/crypto/kilo-coin.png", effect: "+3 Crypto." },
  { id: "vault-1", name: "Vault Encryption", type: "VP", power: 2, cost: 3, art: "/assets/card_art/volume/2vp-b.png", effect: "Restore 100." },
  { id: "vault-2", name: "Vault Encryption", type: "VP", power: 2, cost: 3, art: "/assets/card_art/volume/2vp-b.png", effect: "Restore 100." }
];

export type DeckEntry = { cardId: string; count: number };
/** Used whenever saved content does not name a starting deck of its own. */
export const DEFAULT_STARTING_DECK: readonly DeckEntry[] = [
  { cardId: "byte-coin", count: 1 },
  { cardId: "shyte-coin", count: 3 },
  { cardId: "dotkrawler", count: 1 },
  { cardId: "slash-dot", count: 1 },
  { cardId: "rezz-blade", count: 1 },
  { cardId: "basic-encryption", count: 1 },
  { cardId: "vault-encryption", count: 1 },
  { cardId: "night-scythe", count: 1 },
];
export const MIN_STARTING_DECK_SIZE = 5;

/** One card per copy, each with a per-definition instance ID (`shyte-coin-2`); owners are prefixed at deal time. */
export function expandDeck(entries: readonly DeckEntry[], definitions: readonly Card[]): Card[] {
  return entries.flatMap(entry => {
    const definition = definitions.find(card => (card.definitionId ?? card.id) === entry.cardId);
    if (!definition) throw new Error(`Starting deck card ${entry.cardId} is missing from content.`);
    return Array.from({ length: entry.count }, (_, copy) => ({ ...structuredClone(definition), definitionId: entry.cardId, id: `${entry.cardId}-${copy + 1}` }));
  });
}

export const market = [
  { ...starterCards[0], supply: 8 }, { ...starterCards[1], supply: 8 },
  { ...starterCards[2], supply: 8 }, { ...starterCards[3], supply: 8 }
];

export const nodeNames = ["The Event Horizon", "Black-Sun Array", "Mirror of Mnemosyne", "The Root Temple", "CERN Serpent"];
export const initialWeights = [30, 25, 20, 15, 10];

export function legalNodes(turn: number, order: readonly number[] = [0, 1, 2, 3, 4]) {
  return turn >= 1 && turn <= 3 ? order.slice(0, turn + 2) : [];
}

export function canDeploy(card: Card, actions: number, turn: number, node: number, occupancy: number, _openNodes: readonly number[] = legalNodes(turn)) {
  if (card.type === "Crypto") return "Crypto belongs in the Crypto Cache for Draft.";
  if (!Number.isInteger(node) || node < 0 || node >= 5 || turn < 1 || turn > 3) return "Unknown Node or Runtime turn.";
  if (occupancy >= 4) return "This deployment region is full.";
  if (isCharacterCard(card) && actions < 1) return "Insufficient Actions.";
  return null;
}

export function resolvePower(cards: Card[]) {
  return cards.reduce((total, card) => total + (card.power ?? 0), 0);
}

// Pure canonical rules. Content-dependent decisions deliberately remain caller-owned.
export type PlayerId = 0 | 1;
export type RandomSource = () => number;
export type Servers = { primary: number; backup: number };
export type DeckZones = { draw: Card[]; hand: Card[]; discard: Card[] };
export type Deployment = { card: Card; owner: PlayerId; node: number; order: number; revealed: boolean; revealSequence?: number };
/** Changes cannot push a card below zero, but a card printed with negative Power keeps it. */
export function cardPowerFloor(card: Card): number {
  return Math.min(0, card.power ?? 0);
}
export function effectiveCardPower(placement: Deployment, auraBonus = 0): number {
  return Math.max(cardPowerFloor(placement.card), (placement.card.power ?? 0) + (placement.card.powerDelta ?? 0) + auraBonus);
}
/** Sets a card's lasting Power change; zero clears it. */
export function setPowerDelta(card: Card, delta: number) {
  if (delta) card.powerDelta = delta;
  else delete card.powerDelta;
}
export const serverMaximums: Servers = { primary: 2000, backup: 1500 };
/** VP the destroyer scores for taking each enemy Server to zero. */
export const defaultServerVP: Servers = { primary: 12, backup: 20 };

/**
 * A player's VP plus, for each enemy Server still standing, the share of its destruction VP matching the share of its
 * health they have taken (75% gone counts as 75% of that Server's VP). Destroyed Servers already paid out into VP.
 */
export function projectedVP(vp: number, enemyServers: Servers, serverVP: Servers = defaultServerVP): number {
  return (Object.keys(serverMaximums) as (keyof Servers)[]).reduce((sum, server) =>
    enemyServers[server] > 0 ? sum + (1 - enemyServers[server] / serverMaximums[server]) * serverVP[server] : sum, vp);
}

/** The player behind on projected VP, or null when they are level (to the hundredth). */
export function trailingPlayer(players: readonly [{ vp: number; servers: Servers }, { vp: number; servers: Servers }], serverVP: Servers = defaultServerVP): PlayerId | null {
  const [mine, theirs] = [projectedVP(players[0].vp, players[1].servers, serverVP), projectedVP(players[1].vp, players[0].servers, serverVP)].map(value => Math.round(value * 100));
  return mine === theirs ? null : mine < theirs ? 0 : 1;
}

export function nodeWinner(powers: readonly [number, number]): PlayerId | null {
  return powers[0] === powers[1] ? null : powers[0] > powers[1] ? 0 : 1;
}

export function controlledWeights(weights: readonly number[], powers: readonly (readonly [number, number])[]): [number, number] {
  if (weights.length !== powers.length) throw new Error("Each Node requires both player Power totals.");
  const totals: [number, number] = [0, 0];
  weights.forEach((weight, node) => {
    const winner = nodeWinner(powers[node]);
    if (winner === null) { totals[0] += weight / 2; totals[1] += weight / 2; }
    else totals[winner] += weight;
  });
  return totals;
}

export function transferProbability(weights: readonly number[], source: number, target: number, requested: number): number[] {
  if (!Number.isInteger(source) || !Number.isInteger(target) || source < 0 || target < 0 || source >= weights.length || target >= weights.length) throw new Error("Unknown probability Node.");
  if (!Number.isFinite(requested) || requested < 0 || !Number.isInteger(requested * 2)) throw new Error("Probability transfers use nonnegative 0.5% increments.");
  const next = [...weights];
  if (source === target) return next;
  const amount = Math.min(requested, next[source]);
  next[source] -= amount;
  next[target] += amount;
  return next;
}

export function selectCircuitNode(weights: readonly number[], random: RandomSource): number {
  if (weights.some(weight => !Number.isFinite(weight) || weight < 0)) throw new Error("Invalid probability weights.");
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) throw new Error("Circuit selection requires a positive total weight.");
  const roll = random();
  if (roll < 0 || roll >= 1 || !Number.isFinite(roll)) throw new Error("Random source must return a value in [0, 1).");
  let boundary = 0;
  for (let node = 0; node < weights.length; node++) {
    boundary += weights[node];
    if (roll * total < boundary) return node;
  }
  for (let node = weights.length - 1; node >= 0; node--) if (weights[node] > 0) return node;
  throw new Error("Circuit selection failed.");
}

/** Folds everything after a `chain` step into that step's `then`, so it waits for the step to resolve. */
export function compileChains(effects: readonly EvaluationEffect[]): EvaluationEffect[] {
  const compiled: EvaluationEffect[] = [];
  for (let index = 0; index < effects.length; index++) {
    const { chain, ...effect } = effects[index];
    const nested: EvaluationEffect = {
      ...effect,
      ...(effect.options ? { options: effect.options.map(option => ({ ...option, effects: compileChains(option.effects) })) } : {}),
      ...(effect.then ? { then: compileChains(effect.then) } : {}),
    };
    const rest = effects.slice(index + 1);
    if (chain && rest.length) {
      compiled.push({ ...nested, then: [...(nested.then ?? []), ...compileChains(rest)] });
      break;
    }
    compiled.push(nested);
  }
  return compiled;
}

export function shuffleCards(cards: readonly Card[], random: RandomSource): Card[] {
  const next = [...cards];
  for (let i = next.length - 1; i > 0; i--) {
    const roll = random();
    if (roll < 0 || roll >= 1 || !Number.isFinite(roll)) throw new Error("Random source must return a value in [0, 1).");
    const j = Math.floor(roll * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function drawCards(zones: DeckZones, count: number, random: RandomSource): DeckZones {
  if (!Number.isInteger(count) || count < 0) throw new Error("Draw count must be a nonnegative integer.");
  const next = { draw: [...zones.draw], hand: [...zones.hand], discard: [...zones.discard] };
  // Exhaust the current draw pile in order before shuffling Discard to pay the remainder.
  for (let n = 0; n < count; n++) {
    if (!next.draw.length) { next.draw = shuffleCards(next.discard, random); next.discard = []; }
    const card = next.draw.shift();
    if (!card) break;
    next.hand.push(card);
  }
  return next;
}

export function mirroredOpening(random: RandomSource, deck: readonly Card[] = starterCards): [DeckZones, DeckZones] {
  const shuffled = shuffleCards(deck, random);
  const makePlayer = (owner: PlayerId): DeckZones => {
    const cards = shuffled.map(card => ({ ...card, id: `${owner}:${card.id}` }));
    return { hand: cards.slice(0, 5), draw: cards.slice(5), discard: [] };
  };
  return [makePlayer(0), makePlayer(1)];
}

export function revealOrder(deployments: readonly Deployment[], turn: number, priority: PlayerId, openNodes: readonly number[] = legalNodes(turn)): Deployment[] {
  const eligible = deployments.filter(placement => !placement.revealed && openNodes.includes(placement.node));
  const queues = [0, 1].map(owner => eligible.filter(placement => placement.owner === owner).sort((a, b) => a.order - b.order));
  const ordered: Deployment[] = [];
  while (queues[0].length || queues[1].length) {
    const first = queues[priority].shift();
    const second = queues[1 - priority].shift();
    if (first) ordered.push(first);
    if (second) ordered.push(second);
  }
  return ordered;
}

export function applyServerEffect(servers: Servers, kind: "drain" | "restore", amount: number, serverVP: Servers = defaultServerVP): { servers: Servers; target: keyof Servers | null; amount: number; destructionVP: number } {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Server effect amount must be nonnegative.");
  const target = servers.primary > 0 ? "primary" : servers.backup > 0 ? "backup" : null;
  if (!target) return { servers: { ...servers }, target, amount: 0, destructionVP: 0 };
  const before = servers[target];
  const after = kind === "drain" ? Math.max(0, before - amount) : Math.min(serverMaximums[target], before + amount);
  return { servers: { ...servers, [target]: after }, target, amount: Math.abs(after - before), destructionVP: after === 0 ? serverVP[target] : 0 };
}

// The caller must supply the unresolved turn carryover policy; there is no V1 default.
export function runtimeActions(turn: number, remaining: number, pendingOnReveal: number, carryover: boolean): number {
  if (![1, 2, 3].includes(turn)) throw new Error("Runtime contains exactly three turns.");
  return turn === 1 ? 2 : (carryover ? remaining : 0) + 1 + pendingOnReveal;
}

const you = { type: "player", who: "self" } as const;
const draw = (amount: number): EffectStep => ({ action: "draw", amount, target: you });
const gainActions = (amount: number): EffectStep => ({ action: "gainActions", amount, target: you });
const drain = (amount: number): EffectStep => ({ action: "damageServer", amount, target: { type: "server", who: "opponent", server: "auto" } });
const crypto = (amount: number): EffectStep => ({ action: "gainCrypto", amount, target: you });
export const starterEffects: Readonly<Record<string, readonly EffectStep[]>> = {
  "Slash-Dot": [draw(3)],
  "Dash-Dot": [draw(1), gainActions(2)],
  "Dotkrawler": [draw(1), { action: "transferPower", amount: 1, target: { type: "node", which: "neighbours" } }, gainActions(2)],
  "Rezz-Razor": [drain(75), draw(1), gainActions(1)],
  "Rezz-Blade": [drain(100), draw(1), gainActions(2)],
  "Byte-Coin": [crypto(2)],
  "Kilo-Coin": [crypto(3)],
  "Vault Encryption": [{ action: "repairServer", amount: 100, target: { type: "server", who: "self", server: "auto" } }],
};

export function nextRevealPriority(weights: readonly number[], powers: readonly (readonly [number, number])[], current: PlayerId, preference: "higher-controlled-weight" | "lower-controlled-weight"): PlayerId {
  const [a, b] = controlledWeights(weights, powers);
  if (a === b) return current;
  return preference === "higher-controlled-weight" ? (a > b ? 0 : 1) : (a < b ? 0 : 1);
}
