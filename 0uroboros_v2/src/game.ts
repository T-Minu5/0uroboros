export type Phase = "runtime" | "collapse" | "draft";
export type CardType = "Character" | "VP" | "Crypto";

export type EffectChoiceOption = { id: string; label: string; effects: readonly EvaluationEffect[] };
export type CardModifier = {
  id: string;
  kind: 'doublePrintedEffects' | 'powerAuraAtLocation' | 'movableEachTurn';
  amount?: number;
  sourceName?: string;
};
export type EvaluationEffect = {
  kind: "draw" | "actions" | "crypto" | "vp" | "drain" | "restore" | "moveSelf" | "moveCard" | "modifyPower" | "probability" | "trashSelf" | "recover" | "choice" | "mill" | "transferPower" | "handDiscard" | "handTrash" | "scry" | "gain" | "selfDestroyBackup" | "random" | "morph" | "attachModifier" | "damageLoser" | "restorePrimary" | "trashLowestAtLocation" | "trashAtLocation" | "destroyAtLocation" | "boostPowerAtLocation" | "stealCrypto" | "destroyCard";
  amount?: number;
  target?: "primary" | "backup";
  options?: readonly EffectChoiceOption[];
  prompt?: string;
  opponent?: boolean;
  chooser?: "owner" | "opponent";
  optional?: boolean;
  min?: number;
  /** Follow-ups that run only once this effect has resolved (a paid cost, a found target). */
  then?: readonly EvaluationEffect[];
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
   * Which way a Power shift runs. "choice" lets the player pick any transfer between this Node
   * and a neighbour; "left"/"right" push the amount out to that neighbour; "split" divides it
   * between both, giving the odd point to the left.
   */
  direction?: "choice" | "left" | "right" | "split";
  modifier?: "doublePrintedEffects" | "powerAuraAtLocation" | "movableEachTurn";
};
export type Card = {
  cardClass?: 'Action' | 'Utility' | 'Runtime' | 'Attack' | 'Hacker' | 'Horror';
  generated?: boolean;
  definitionId?: string;
  vp?: number;
  cryptoValue?: number;
  duration?: number;
  durationPeriod?: "runtime" | "cycle";
  schedule?: readonly {at:number;timing?:"start"|"end";effects:readonly EvaluationEffect[]}[];
  recurring?: readonly EvaluationEffect[];
  onReveal?: readonly EvaluationEffect[];
  onCollapse?: readonly EvaluationEffect[];
  modifiers?: CardModifier[];
  storyText?: string;
  id: string;
  name: string;
  type: CardType;
  power?: number;
  /** Adds a live count to printed Power: cards in the shared Trash, or cards destroyed by both players. */
  powerSource?: "trash" | "destroyed";
  basePower?: number;
  cost: number;
  art: string;
  effect: string;
};

export const starterCards: Card[] = [
  { id: "slash", name: "Slash-Dot", type: "Character", power: 3, cost: 4, art: "/assets/card_art/base cards/slash-dot.png", effect: "+3 Cards." },
  { id: "dash-dot", name: "Dash-Dot", type: "Character", power: 2, cost: 3, art: "/assets/card_art/base cards/action/dash-dot.png", effect: "+1 Card. +2 Actions." },
  { id: "dotkrawler", name: "Dotkrawler", type: "Character", power: 1, cost: 4, art: "/assets/card_art/base cards/action/dotkrawler.png", effect: "+1 Card. Shift 1 power (your choice). +2 Actions." },
  { id: "razor", name: "Rezz-Razor", type: "Character", power: 4, cost: 3, art: "/assets/card_art/chaos cards/rezz-razor.png", effect: "Drain 75. +1 Card. +1 Action." },
  { id: "blade", name: "Rezz-Blade", type: "Character", power: 3, cost: 4, art: "/assets/card_art/chaos cards/rezz-blade.png", effect: "Drain 100. +1 Card. +2 Actions." },
  { id: "byte-1", name: "Byte-Coin", type: "Crypto", cost: 3, art: "/assets/card_art/crypto/byte-coin.png", effect: "+2 Crypto." },
  { id: "byte-2", name: "Byte-Coin", type: "Crypto", cost: 3, art: "/assets/card_art/crypto/byte-coin.png", effect: "+2 Crypto." },
  { id: "kilo", name: "Kilo-Coin", type: "Crypto", cost: 6, art: "/assets/card_art/crypto/kilo-coin.png", effect: "+3 Crypto." },
  { id: "vault-1", name: "Vault Encryption", type: "VP", power: 2, cost: 3, art: "/assets/card_art/volume/2vp-b.png", effect: "Restore 100." },
  { id: "vault-2", name: "Vault Encryption", type: "VP", power: 2, cost: 3, art: "/assets/card_art/volume/2vp-b.png", effect: "Restore 100." }
];

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
  if (card.type === "Character" && actions < 1) return "Insufficient Actions.";
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
export type Deployment = { card: Card; owner: PlayerId; node: number; order: number; revealed: boolean; powerModifier?: number; revealSequence?: number };
/** Changes cannot push a card below zero, but a card printed with negative Power keeps it. */
export function cardPowerFloor(card: Card): number {
  return Math.min(0, card.power ?? 0);
}
export function effectiveCardPower(placement: Deployment, auraBonus = 0): number {
  return Math.max(cardPowerFloor(placement.card), (placement.card.power ?? 0) + (placement.powerModifier ?? 0) + auraBonus);
}
export const serverMaximums: Servers = { primary: 2000, backup: 1500 };

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

export function mirroredOpening(random: RandomSource): [DeckZones, DeckZones] {
  const shuffled = shuffleCards(starterCards, random);
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

export function applyServerEffect(servers: Servers, kind: "drain" | "restore", amount: number): { servers: Servers; target: keyof Servers | null; amount: number; destructionVP: number } {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Server effect amount must be nonnegative.");
  const target = servers.primary > 0 ? "primary" : servers.backup > 0 ? "backup" : null;
  if (!target) return { servers: { ...servers }, target, amount: 0, destructionVP: 0 };
  const before = servers[target];
  const after = kind === "drain" ? Math.max(0, before - amount) : Math.min(serverMaximums[target], before + amount);
  return { servers: { ...servers, [target]: after }, target, amount: Math.abs(after - before), destructionVP: after === 0 ? target === "primary" ? 8 : 12 : 0 };
}

// The caller must supply the unresolved turn carryover policy; there is no V1 default.
export function runtimeActions(turn: number, remaining: number, pendingOnReveal: number, carryover: boolean): number {
  if (![1, 2, 3].includes(turn)) throw new Error("Runtime contains exactly three turns.");
  return turn === 1 ? 2 : (carryover ? remaining : 0) + 1 + pendingOnReveal;
}

export type StarterEffect = { kind: "draw" | "actions" | "crypto" | "drain" | "restore" | "transferPower"; amount: number };
export const starterEffects: Readonly<Record<string, readonly StarterEffect[]>> = {
  "Slash-Dot": [{ kind: "draw", amount: 3 }],
  "Dash-Dot": [{ kind: "draw", amount: 1 }, { kind: "actions", amount: 2 }],
  "Dotkrawler": [{ kind: "draw", amount: 1 }, { kind: "transferPower", amount: 1 }, { kind: "actions", amount: 2 }],
  "Rezz-Razor": [{ kind: "drain", amount: 75 }, { kind: "draw", amount: 1 }, { kind: "actions", amount: 1 }],
  "Rezz-Blade": [{ kind: "drain", amount: 100 }, { kind: "draw", amount: 1 }, { kind: "actions", amount: 2 }],
  "Byte-Coin": [{ kind: "crypto", amount: 2 }],
  "Kilo-Coin": [{ kind: "crypto", amount: 3 }],
  "Vault Encryption": [{ kind: "restore", amount: 100 }],
};

export function nextRevealPriority(weights: readonly number[], powers: readonly (readonly [number, number])[], current: PlayerId, preference: "higher-controlled-weight" | "lower-controlled-weight"): PlayerId {
  const [a, b] = controlledWeights(weights, powers);
  if (a === b) return current;
  return preference === "higher-controlled-weight" ? (a > b ? 0 : 1) : (a < b ? 0 : 1);
}
