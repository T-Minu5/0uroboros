import { EVALUATION_ALL_CARDS, createStrategicMarket, draftOffer, type MarketPile } from "./evaluationMarket";
import { EVALUATION_LOCATIONS, EVALUATION_CIRCUIT_REWARDS, type LocationRewardEffect, type CircuitRewardDefinition } from "./content";
import type { CompiledContent } from './authoring/contentModel';
import {
  type Card, type CardModifier, type PlayerId, type RandomSource, type Deployment, type Servers,
  applyServerEffect, serverMaximums, defaultServerVP, drawCards,
  initialWeights, legalNodes, mirroredOpening, nodeWinner, trailingPlayer,
  revealOrder, runtimeActions, starterEffects, canDeploy,
  shuffleCards, effectiveCardPower, cardPowerFloor, expandDeck, DEFAULT_STARTING_DECK, setPowerDelta, isCharacterCard,
} from "./game";
import { ACTIONS, describeStep, modBadge, optionText } from "./effects/catalog";
import { migrateEffects } from "./effects/migrate";
import { builtinMod } from "./builtinMods";
import { DECK_ENDS, filterClasses, isBuiltinModifier, type ActionId, type AnyEffect, type CardFilter, type CardWhere, type ChoiceOption as ChoiceOptionStep, type EffectStep, type ModDefinition, type ModHook, type Scope, type ServerSlot, type Target, type Who } from "./effects/types";
import { formatAmount, transferFlow, transferText } from "./transferText";
import { DEFAULT_STRATEGY, deployPriority, draftScore, keepValue, locationStakes, optionValue, planDraft, strategyPhase, type StrategyContext, type StrategyProfile } from "./ai/strategy";
import { TelemetryCollector, type GameTelemetry } from "./ai/telemetry";

export type SessionPhase = "runtime" | "reveal" | "collapse" | "draft" | "gameover";
export type LocationDefinition = {
  id: string;
  name: string;
  rule: string;
  reward: string;
  effects?: readonly LocationRewardEffect[];
  ongoing?: readonly LocationRewardEffect[];
  onPlay?: readonly LocationRewardEffect[];
  startTurn2?: readonly LocationRewardEffect[];
  startTurn3?: readonly LocationRewardEffect[];
};
/** The last reveal position (0-based) a Location may be dealt to: start of turn 2 needs the first 3 reveals, start of turn 3 the first 4. */
export const latestRevealSlot = (location: Pick<LocationDefinition, 'startTurn2' | 'startTurn3'>) =>
  location.startTurn2?.length ? 2 : location.startTurn3?.length ? 3 : 4;
export type SessionConfig = {
  content?: CompiledContent;
  strategicMarket?: boolean;
  evaluationContent?: boolean;
  carryover: boolean;
  priorityPreference: "higher" | "lower";
  random: RandomSource;
  /** VP for destroying an enemy Primary / Backup Server. Defaults to `defaultServerVP`. */
  serverVP?: Servers;
  // An explicit development fixture, never described as the canonical full market.
  practiceMarket?: Card[];
  locations?: LocationDefinition[];
  /** The opponent's plan of play, written by the Strat-G agent. */
  strategy?: StrategyProfile;
  /** Per-seat overrides for self-play experiments; seats without one play `strategy`. */
  seatStrategies?: Partial<Record<PlayerId, StrategyProfile>>;
  /** The Strat-G experiment `strategy` belongs to, echoed in the match report; null for its current best profile. */
  strategyExperiment?: string | null;
  /** Seats played by the AI; every other seat is human. Defaults to [1]; `[]` seats two humans. */
  aiSeats?: PlayerId[];
  /** Keep a log of the AI's Draft, deploy and choice decisions for later review. Defaults to true. */
  recordDecisions?: boolean;
  /**
   * How the Log names the seats. Unset, events speak to seat 0 ("You acquire…", "Opponent acquires…"), as the solo
   * client expects. Set, events name both seats in the third person so one text serves every reader.
   */
  seatNames?: [string, string];
  /** The clock Draft deadlines and purchase cooldowns read; defaults to Date.now. Inject for tests and servers. */
  now?: () => number;
};
export type PurchaseRecord = { cycle: number; owner: PlayerId; definitionId: string; name: string; category: MarketPile["category"]; cost: number };
export type CycleRecord = {
  cycle: number; vp: [number, number]; servers: [number, number]; wallet: [number, number]; locationsWon: [number, number];
  locations: { id: string; name: string; winner: PlayerId | null }[];
  circuit: { rewardId: string; name: string; eligible: PlayerId[]; claimed: PlayerId[] } | null;
  /** Cards owned outside the board at the end of the Cycle, before Draft purchases. */
  deckSize: [number, number];
  /** The Draft's market as it opened; `stock` is what each seat could still buy. */
  market?: { id: string; name: string; category: MarketPile["category"]; cost: number; stock: [number, number] }[];
};
/** What an AI seat decided and the scores it weighed; written for review, never read back by the AI. */
export type DecisionRecord =
  | { kind: "deploy"; cycle: number; turn: number; owner: PlayerId; card: string; definitionId: string; node: number; location: string | null; priority: number; nodeScore: number; locationStake: number | null; options: number }
  | { kind: "draft"; cycle: number; owner: PlayerId; wallet: number; phase: string; bought: string; cost: number; plan: string[]; alternatives: { name: string; cost: number; score: number }[];
      /** Every affordable pile and its score; null means the AI's rules refuse that card outright. */
      offered?: { id: string; score: number | null }[] }
  | { kind: "draft-end"; cycle: number; owner: PlayerId; walletLeft: number; phase: string }
  | { kind: "circuit"; cycle: number; owner: PlayerId; rewardId: string; name: string }
  | { kind: "choice"; cycle: number; turn: number; owner: PlayerId; source: string; prompt: string; picked: string[]; method: "strategy" | "random" };
/** Everything the strategist needs to learn from a session; the local deck is only revealed after the fact. */
export type MatchReport = {
  strategyVersion: number; strategyExperiment?: string | null; cycle: number; phase: SessionPhase; winner: PlayerId | null; endedReason: string | null;
  finalVP: [number, number]; servers: [number, number];
  purchases: PurchaseRecord[]; cycles: CycleRecord[];
  decks: [Record<string, number>, Record<string, number>];
  aiSeats: PlayerId[];
  telemetry: GameTelemetry;
  /** Empty unless decision recording is on. */
  decisions: DecisionRecord[];
};
export type BankEntry = {
  card: Card; enteredCycle: number; expiresCycle?: number; remainingTurns?: number; order: number;
  /** View only: effect steps still to resolve from the Bank; null when they never run out. */
  effectsLeft?: number | null;
};
/** `card` is shown as the option's thumbnail; `node` marks an option picked on the board; `group` ties it to one of the choice's groups. */
/** A `disabled` option is shown but cannot be picked, such as one whose cost cannot be paid. */
export type ChoiceOption = { id: string; label: string; card?: Card; node?: number; group?: string; disabled?: boolean };
export type ChoiceGroup = { id: string; label: string; card?: Card };
/**
 * Without `select` or `groups` one option resolves immediately. With `select` the player picks
 * min..max options; with `groups` exactly one option per group. Either way nothing resolves
 * until the whole selection is submitted.
 */
export type TransferMove = { from: number; to: number; amount: number };
/** A Power transfer drawn as the chooser's Power at this Node and its neighbours; each option id maps to the moves it makes. */
export type TransferChoice = { amount: number; center: number; nodes: { node: number; name: string; power: number }[]; moves: Record<string, TransferMove[]> };
/** `zone` names the pile the options are drawn from, so the choice can be made inside that pile's drawer. */
export type RuntimeChoice = { id: number; owner: PlayerId; prompt: string; sourceName: string; node?: number; icon?: string; options: ChoiceOption[]; select?: { min: number; max: number }; groups?: ChoiceGroup[]; transfer?: TransferChoice; zone?: "trash"; verb?: string };
/** `aiPick` returns a legal selection when the opponent chooses; without it the opponent picks at random. */
type ChoiceRequest = { prompt: string; options: ChoiceOption[]; icon?: string; verb?: string; select?: { min: number; max: number }; groups?: ChoiceGroup[]; transfer?: TransferChoice; zone?: "trash"; resolve: (ids: string[]) => RuntimeEvent; aiPick?: () => string[] };
export type PlayerState = {
  bank: BankEntry[];
  draw: Card[]; hand: Card[]; discard: Card[]; destroyed: Card[];
  actions: number; pendingActions: number; wallet: number;
  servers: Servers; destructionVP: number; rewardVP: number; totalVP: number;
  /** Cards this player has moved this game, by relocating or with their cards' effects. */
  moved: number;
};
export type NodeState = {
  cards: [Deployment[], Deployment[]];
  location: LocationDefinition | null;
  powerModifiers: [number, number];
  powers: [number, number]; winner: PlayerId | null;
};
export type SessionState = {
  phase: SessionPhase; turn: number; cycle: number; priority: PlayerId;
  nodeOrder: number[]; players: [PlayerState, PlayerState]; nodes: NodeState[]; weights: number[];
  selectedNode: number | null; circuitEligible: PlayerId[];
  circuitReward: { definition: CircuitRewardDefinition | null; claimed: PlayerId[] };
  market: MarketPile[];
  trash: Card[]; choice: RuntimeChoice | null; draftReady: [boolean, boolean];
  /** Human seats that have committed their Runtime plan; the reveal starts once every human seat has. */
  turnReady: [boolean, boolean];
  unresolved: string[]; endedReason: string | null; winner: PlayerId | null;
  draftEndsAt: number | null; draftEnded: boolean;
  /** Cards moved this game by anyone, Location effects included. */
  movedTotal: number;
};
export type RuntimeEvent = {
  id: number; kind: "move" | "probability" | "trash" | "bank" | "choice" | "vp" | "deploy" | "reveal" | "draw" | "actions" | "crypto" | "drain" | "restore" | "morph" | "turn" | "collapse" | "location" | "power" | "reward" | "circuit" | "draft" | "purchase" | "cycle" | "gameover";
  text: string; node?: number; owner?: PlayerId; cardId?: string; targetCardId?: string; definitionId?: string;
  /** The text other seats see when `text` names something only `owner` may know (a face-down placement); see redactEvent. */
  publicText?: string;
  sourceNode?: number; targetNode?: number;
  source?: "card" | "location" | "circuit"; sourceName?: string;
  target?: "primary" | "backup" | "hand" | "actions" | "wallet" | "vp" | "trash" | "discard";
  amount?: number; before?: number; after?: number; targetOwner?: PlayerId;
  stage?: "node-start" | "node-award" | "node-close";
  /** Where in the session the event happened; stamped by the engine for the Log. */
  cycle?: number; turn?: number; phase?: SessionPhase;
};
export type VisibleCard = Card | { id: string; hidden: true };
export type VisiblePlacement = Omit<Deployment, "card"> & { card: VisibleCard };
/** End-of-session VP tally by source; the parts always sum to `total`. */
export type ScoreBreakdown = {
  total: number;
  /** Every owned card in an active zone that scores VP, both players revealed. */
  vpCards: Card[];
  cardVP: number; locationVP: number; circuitVP: number; effectVP: number; destructionVP: number;
};
/**
 * What one seat may see, with that seat at index 0 everywhere a value is indexed by seat (players, node cards and
 * Powers, priority, winners, readiness) and the other seat at index 1. `seat` records whose view it is; a seat-1 view
 * is the mirror of the table, so one client renders either seat. See RuntimeSession.view.
 */
export type SessionView = Omit<SessionState, "players" | "nodes" | "nodeOrder"> & {
  seat: PlayerId;
  /** Only populated once the session is over. */
  finalScore: [ScoreBreakdown, ScoreBreakdown] | null;
  openNodes: number[];
  canUndoPlanning: boolean;
  planningCardIds: string[];
  movableCardIds: string[];
  players: [Omit<PlayerState, "draw"> & { draw: { id: string; hidden: true }[] }, Omit<PlayerState, "draw" | "hand"> & { draw: { id: string; hidden: true }[]; hand: { id: string; hidden: true }[] }];
  nodes: (Omit<NodeState, "cards"> & { cards: [VisiblePlacement[], VisiblePlacement[]] })[];
};

type MorphTrigger = { effect: EffectStep; cadence: "recurring" | "scheduled"; origin: string; sourceStartAge: number; slot: string; at?: number; timing?: "start" | "end"; expiresAt: number };
/**
 * `age` counts the card's Runtime turns, or its Cycles when `cycleBound` (the reveal turn or Cycle is 1).
 * A Cycle-bound timer's start steps fire as each later Cycle opens and its end steps after Runtime turn 3;
 * the Effect Bank's Cycle expiry decides when the card leaves.
 */
type RuntimeTimer = { placement: Deployment; age: number; formStartAge: number; formExpiresAt: number; morphTriggers: MorphTrigger[]; cycleBound?: boolean; firedSlot?: number };
/** A "next revealed card" effect waiting for one of `owners` to reveal a card. */
type NextRevealTrigger = { ctx: EffectContext; step: EffectStep; owners: PlayerId[] };
/** Who an effect list belongs to; it decides which players `who` names and who acts on them. */
type EffectContext = {
  scope: Scope;
  /** The resolving card, or a stand-in for a Location or Circuit; its owner is the controller. */
  source: Deployment;
  /** The Location's Node (Location scopes). */
  node?: number;
  /** The Node's winner when the list started (Location scopes); null on a tie. */
  winner?: PlayerId | null;
  /** Owner of the card whose reveal triggered an On Play effect. */
  played?: PlayerId;
  /** Actions gained count for the current Runtime turn rather than the next. */
  immediateActions?: boolean;
  /** Event source for Location and Circuit effects. */
  label?: { source: "location" | "circuit"; sourceName: string; node?: number };
};
/** Outcomes that break a chain: nothing to act on, an optional step skipped, a cost declined or unpaid. */
const FAILED_OUTCOME = /: No target\.$|: No Power to shift\.$| skipped\.$|payment declined\.$|chained effects cancelled\.$|: cannot pay \d+ Crypto\.$/;
const STEP_EVENT: Record<ActionId, RuntimeEvent["kind"]> = {
  draw: "draw", gainActions: "actions", gainCrypto: "crypto", payCrypto: "crypto", gainVP: "vp", gainCard: "draw",
  damageServer: "drain", repairServer: "restore", destroyServer: "drain",
  discardCards: "trash", trashCards: "trash", mill: "trash", scry: "choice", recover: "trash", stealCrypto: "crypto", bump: "trash",
  moveCard: "move", changePower: "power", healCard: "power", restoreCard: "power", destroyCard: "trash", trashCard: "trash", attachModifier: "power", removeModifier: "power", transferPower: "power", morph: "morph",
  choice: "choice", random: "choice",
};
/** The confirm button's verb when a player picks targets for a card step. */
const CHOICE_VERBS: Partial<Record<ActionId, string>> = { moveCard: "Move", healCard: "Heal", restoreCard: "Reset", destroyCard: "Destroy", trashCard: "Trash" };
const CARD_VERBS: Partial<Record<ActionId, string>> = { moveCard: "move", changePower: "change Power", healCard: "heal", restoreCard: "restore", destroyCard: "destroy", trashCard: "trash", attachModifier: "attach a mod to", removeModifier: "remove mods from" };
const ZONE_PLACE_TEXT: Partial<Record<CardWhere, string>> = { hand: "hand", wallet: "wallet", bank: "Effect Bank", deck: "deck", discard: "Discard" };
/** A card off the board and the player who owns it. */
type ZoneCard = { card: Card; owner: PlayerId };
/** Actions that handle `optional` themselves rather than through a yes/skip prompt. */
const OPTIONAL_INSIDE = new Set<ActionId>(["discardCards", "trashCards"]);
const matchesFilter = (card: Card, filter?: CardFilter) => {
  const classes = filterClasses(filter), cardClass = card.cardClass ?? (card.type === "VP" ? "Volume" : undefined);
  return (!filter?.cardType || card.type === filter.cardType || filter.cardType === "Character" && isCharacterCard(card))
    && (!classes.length || cardClass !== undefined && classes.includes(cardClass));
};

export function seededRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function createSession(config: SessionConfig): RuntimeSession { return new RuntimeSession(config); }

/** The first option in each group, or the leading options a `select` choice accepts; always legal to submit. */
export function firstLegalSelection(choice: Pick<RuntimeChoice, "options" | "select" | "groups">): string[] {
  if (choice.groups) return choice.groups.map(group => choice.options.find(option => option.group === group.id)!.id);
  const count = choice.select ? Math.min(choice.select.max, Math.max(choice.select.min, 1)) : 1;
  return choice.options.filter(option => !option.disabled).slice(0, count).map(option => option.id);
}

const otherSeat = (seat: PlayerId): PlayerId => (1 - seat) as PlayerId;
const swapPair = <T>(pair: [T, T]): [T, T] => [pair[1], pair[0]];

/**
 * `event` as `seat` may see it. A human seat's face-down placement names its card only to that seat; everyone else
 * reads the public wording. Events are otherwise public: reveals, Powers, purchases and choices are table knowledge.
 */
export function redactEvent(event: RuntimeEvent, seat: PlayerId): RuntimeEvent {
  if (event.publicText === undefined) return event;
  const { publicText, cardId, ...rest } = event;
  if (event.owner === seat) return { ...rest, ...(cardId !== undefined ? { cardId } : {}) };
  return { ...rest, text: publicText };
}

/** `event` with the seats swapped, for a reader whose view puts seat 1 at index 0 (see SessionView). */
export function mirrorEvent(event: RuntimeEvent): RuntimeEvent {
  const flipped = { ...event };
  if (event.owner !== undefined) flipped.owner = otherSeat(event.owner);
  if (event.targetOwner !== undefined) flipped.targetOwner = otherSeat(event.targetOwner);
  return flipped;
}

/** A seat-0-indexed view re-indexed so the other seat sits at index 0. Node order and card data are unchanged. */
export function mirrorView(view: SessionView): SessionView {
  const flip = (seat: PlayerId | null) => seat === null ? null : otherSeat(seat);
  return {
    ...view,
    seat: otherSeat(view.seat),
    priority: otherSeat(view.priority),
    winner: flip(view.winner),
    players: [view.players[1], view.players[0]] as unknown as SessionView["players"],
    nodes: view.nodes.map(node => ({ ...node, cards: swapPair(node.cards), powerModifiers: swapPair(node.powerModifiers), powers: swapPair(node.powers), winner: flip(node.winner) })),
    circuitEligible: view.circuitEligible.map(otherSeat),
    circuitReward: { ...view.circuitReward, claimed: view.circuitReward.claimed.map(otherSeat) },
    draftReady: swapPair(view.draftReady),
    turnReady: swapPair(view.turnReady),
    finalScore: view.finalScore ? swapPair(view.finalScore) : null,
    choice: view.choice ? { ...view.choice, owner: otherSeat(view.choice.owner) } : null,
    market: view.market.map(pile => pile.remaining ? { ...pile, remaining: swapPair(pile.remaining) } : pile),
  };
}

const cardVP = (card: Card) => card.vp ?? (card.name === "Vault Encryption" ? 2 : 0);
/** Below this keep value the opponent treats a card as deck clutter (Shyte-Coin, Glitch). */
const AI_JUNK_VALUE = 1.5;
/** Node-choice units per hand point of Location value; a flipped Node is worth 60, so a Location can outweigh it only when capped near that. */
const LOCATION_POINT = 3;
const LOCATION_SCORE_CAP = 45;

// One session is the sole authority, whether it runs in the player's browser or on a game server. Presentation
// advances one queued event at a time; input cannot bypass a reveal/Collapse barrier. Every seat-specific entry point
// takes the acting seat, and `view(seat)` / `redactEvent` decide what each seat may see.
/** A seat's planning state at its first placement or move of the turn, restored by Undo all actions. */
type PlanningSnapshot = {
  hand: Card[]; actions: number; nodes: Deployment[][]; order: number;
  relocatedThisTurn: string[]; relocatedThisCycle: string[]; moved: number; movedTotal: number;
};

export class RuntimeSession {
  readonly state: SessionState;
  private queue: (() => RuntimeEvent)[] = [];
  private serial = 0;
  private order = 0;
  private acquired = 0;
  private purchaseTimes = new Map<string, number>();
  private config: SessionConfig;
  private choiceResolver: ((ids: string[]) => RuntimeEvent) | null = null;
  private botDraftAt: [number, number] = [0, 0];
  private runtimeTimers = new Map<string, RuntimeTimer>();
  /** Turn-timed cards whose duration ended on the board: they keep their Power until Collapse, then go to Discard. */
  private expiredOnBoard = new Set<string>();
  private morphProgress = new Map<string, Map<string, number>>();
  private collapseStartedNodes = new Set<number>();
  private collapseResolvedNodes = new Set<number>();
  private collapseEffectCards = new Set<string>();
  private planningSnapshot: [PlanningSnapshot | null, PlanningSnapshot | null] = [null, null];
  private relocatedThisTurn = new Set<string>();
  private relocatedThisCycle = new Set<string>();
  private nextRevealTriggers: NextRevealTrigger[] = [];
  private migrated = new WeakMap<readonly AnyEffect[], EffectStep[]>();
  private failedOutcomes = 0;
  private revealCounter = 0;
  /** Slices of `rewardVP` by where the VP came from; card effects are the remainder. */
  private rewardSources: [{ location: number; circuit: number }, { location: number; circuit: number }] = [{ location: 0, circuit: 0 }, { location: 0, circuit: 0 }];
  private purchases: PurchaseRecord[] = [];
  private cycleRecords: CycleRecord[] = [];
  private bankResolvedCycle = 0;
  private decisions: DecisionRecord[] = [];
  private telemetry: TelemetryCollector;

  constructor(config: SessionConfig) {
    if (typeof config.carryover !== "boolean" || !["higher", "lower"].includes(config.priorityPreference)) throw new Error("Explicit Action carryover and priority policy are required.");
    if (config.practiceMarket?.some(card => !starterEffects[card.name])) throw new Error("Practice market only supports the canonical starter cards.");
    this.config = { ...config, content: config.content ? structuredClone(config.content) : undefined };
    const deck = this.config.content?.startingDeck ?? expandDeck(DEFAULT_STARTING_DECK, EVALUATION_ALL_CARDS);
    const opening = mirroredOpening(config.random, deck);
    const player = (owner: PlayerId): PlayerState => ({ ...opening[owner], destroyed: [], bank: [], actions: 2, pendingActions: 0, wallet: 0, servers: { ...serverMaximums }, destructionVP: 0, rewardVP: 0, totalVP: 0, moved: 0 });
    this.state = {
      phase: "runtime", turn: 1, cycle: 1, priority: config.random() < 0.5 ? 0 : 1,
      players: [player(0), player(1)],
      nodes: Array.from({ length: 5 }, (_, i) => ({ cards: [[], []], location: config.locations?.[i] ?? null, powerModifiers: [0, 0], powers: [0, 0], winner: null })),
      nodeOrder: [0,1,2,3,4], weights: [...initialWeights], selectedNode: null, circuitEligible: [], circuitReward: { definition: null, claimed: [] },
      market: config.strategicMarket ? [] : (config.practiceMarket ?? []).map((card, i) => ({ id: `practice-${i}`, card: { ...card }, category: "Base" as const, supply: 8 })),
      trash: [], choice: null, draftReady: [false, false], turnReady: [false, false],
      unresolved: [...(config.strategicMarket ? ["Market additions are provisional evaluation content, not final balance."] : ["Complete approved market content is unavailable."]), ...(config.evaluationContent ? [] : ["Location mechanics and Location Rewards are not implemented without approved content.", "Circuit Reward content is unavailable; only eligibility is computed."])],
      endedReason: null, winner: null, draftEndsAt: null, draftEnded: false, movedTotal: 0,
    };
    this.randomizeBoard();
    this.setupEvaluationLocations();
    // After board/location shuffle so seeded location layouts stay stable.
    if (config.strategicMarket) this.state.market = createStrategicMarket(this.config.random, this.config.content);
    this.refreshScores();
    this.telemetry = new TelemetryCollector(() => ({ cycle: this.state.cycle, turn: this.state.turn }), cardId => {
      const card = this.findCard(cardId);
      return card ? { definitionId: card.definitionId ?? card.id.replace(/^[01]:/, "").replace(/-\d+$/, ""), name: card.name, cost: card.cost, type: card.type, cardClass: card.cardClass } : undefined;
    });
  }

  private get aiSeats(): PlayerId[] { return this.config.aiSeats ?? [1]; }
  private get humanSeats(): PlayerId[] { return ([0, 1] as PlayerId[]).filter(seat => !this.aiSeats.includes(seat)); }
  private now(): number { return this.config.now?.() ?? Date.now(); }
  private assertHuman(owner: PlayerId) { if (this.aiSeats.includes(owner)) throw new Error("That seat is played by the AI."); }

  // Log narration. Unnamed, texts speak to seat 0 as the solo client always has; named, they use the names.
  /** The seat as a sentence subject: "You", "Opponent" or its name. */
  private subject(owner: PlayerId): string { return this.config.seatNames?.[owner] ?? (owner === 0 ? "You" : "Opponent"); }
  /** `firstPerson` for an unnamed seat 0 ("You acquire"); otherwise the subject with `thirdPerson` ("Ada acquires"). */
  private say(owner: PlayerId, firstPerson: string, thirdPerson: string): string {
    return !this.config.seatNames && owner === 0 ? firstPerson : `${this.subject(owner)} ${thirdPerson}`;
  }
  /** Possessive for `owner` as read by `reader`: "your", the seat's name with 's, or `other` for an unnamed opponent. */
  private whose(owner: PlayerId, reader: PlayerId = 0, other = "the opponent's"): string {
    if (owner === reader) return "your";
    return this.config.seatNames ? `${this.config.seatNames[owner]}'s` : other;
  }
  /** The Circuit Reward's name is public only when every reader may know it: unnamed, seat 0; named, both seats. */
  private circuitNamePublic(): boolean {
    const eligible = this.state.circuitEligible;
    return this.config.seatNames ? eligible.length === 2 : eligible.includes(0);
  }

  private findCard(cardId: string): Card | undefined {
    const zones = [...this.activeCards(0), ...this.activeCards(1), ...this.state.trash, ...this.state.players.flatMap(player => player.destroyed)];
    return zones.find(card => card.id === cardId);
  }

  private recordDecision(decision: DecisionRecord) {
    if (this.config.recordDecisions === false || this.decisions.length >= 3000) return;
    this.decisions.push(decision);
  }

  private randomizeBoard() {
    const shuffled = (values: number[]) => {
      for(let i=values.length-1;i>0;i--){const j=Math.floor(this.config.random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
      return values;
    };
    this.state.nodeOrder=shuffled([0,1,2,3,4]);
    this.state.weights=shuffled([...initialWeights]);
  }

  private setupEvaluationLocations() {
    if (!this.config.evaluationContent) return;
    const locations = (this.config.content?.locations??EVALUATION_LOCATIONS).map(location => structuredClone(location));
    for (let i = locations.length - 1; i > 0; i--) {
      const j = Math.floor(this.config.random() * (i + 1));
      [locations[i], locations[j]] = [locations[j], locations[i]];
    }
    // Five Nodes; extra authored Locations remain in the pool unused this Cycle.
    const nodeCount = this.state.nodes.length;
    // A start-of-turn Location must already be open when its turn starts. Later reveal slots are fixed first,
    // from earlier slots and then the unused pool; deals without such Locations stay exactly as shuffled.
    for (let slot = nodeCount - 1; slot >= 0; slot--) {
      const at = this.state.nodeOrder[slot];
      if (!locations[at] || latestRevealSlot(locations[at]) >= slot) continue;
      const earlier = this.state.nodeOrder.slice(0, slot).find(index => locations[index] && latestRevealSlot(locations[index]) >= slot);
      const swap = earlier ?? locations.findIndex((location, index) => index >= nodeCount && latestRevealSlot(location) >= slot);
      if (swap >= 0) [locations[at], locations[swap]] = [locations[swap], locations[at]];
    }
    this.state.nodes.forEach((node, i) => { node.location = locations[i] ?? null; });
  }

  get pendingCount() { return this.state.choice ? 0 : this.queue.length; }

  /** Every card a player owns outside the board, sorted so it reveals their deck list but not its draw order. */
  deckList(owner: PlayerId): Card[] {
    const player = this.state.players[owner];
    return [...player.draw, ...player.hand, ...player.discard].map(card => this.shownCard(card)).sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * The table as `seat` may see it, with `seat` at index 0 (see SessionView). Only this seat's hand, face-down
   * placements and planning are shown; the other seat's hand, draw order and face-down cards are hidden, as is a
   * Circuit Reward this seat is not eligible for.
   */
  view(seat: PlayerId = 0): SessionView {
    this.refreshScores();
    const me = seat, them = (1 - seat) as PlayerId;
    const {nodeOrder, ...snapshot} = structuredClone(this.state);
    const planning = this.planningSnapshot[me];
    const movableCardIds = this.state.phase === "runtime" && !this.queue.length && !this.state.choice && !this.state.turnReady[me]
      ? this.state.nodes.flatMap(node => node.cards[me]).filter(placement =>
        !this.relocateBlocker(placement) && this.moveDestinations(placement).length > 0).map(placement => placement.card.id)
      : [];
    // Built seat-0-indexed with `me` redaction; a seat-1 reader gets the mirror below.
    const view = {...snapshot, seat: 0 as PlayerId, finalScore: this.state.phase === "gameover" ? [this.scoreBreakdown(0), this.scoreBreakdown(1)] : null, openNodes: legalNodes(this.state.turn,nodeOrder), canUndoPlanning: this.state.phase === "runtime" && !this.queue.length && !this.state.turnReady[me] && !!planning, planningCardIds: planning ? this.state.nodes.flatMap(node => node.cards[me]).filter(card => card.order > planning.order).map(card => card.card.id) : [], movableCardIds} as unknown as SessionView;
    if (!this.state.circuitEligible.includes(me)) view.circuitReward.definition = null;
    view.players.forEach((player,owner)=>player.bank.forEach((entry,index)=>{const timer=this.runtimeTimers.get(entry.card.id);if(timer&&Number.isFinite(this.timerUntil(timer)))entry.remainingTurns=Math.max(0,this.timerUntil(timer)-timer.age);entry.effectsLeft=this.bankEffectsLeft(this.state.players[owner].bank[index]);}));
    const hidden = (_card: Card, index: number) => ({ id: `hidden-${index}`, hidden: true as const });
    // The other seat's uncommitted planning is its secret: until every seat has ended the turn, this view shows that
    // side as it stood when its planning began (hand size, Actions, where its cards sit), so neither where nor when
    // it places or moves cards is visible. Once the reveal starts the snapshot is gone and the placements show face down.
    const theirPlanning = this.state.phase === "runtime" ? this.planningSnapshot[them] : null;
    view.players[0].draw = this.state.players[0].draw.map(hidden);
    view.players[1].draw = this.state.players[1].draw.map(hidden);
    (view.players[them] as { hand: VisibleCard[] }).hand = (theirPlanning?.hand ?? this.state.players[them].hand).map(hidden);
    if (theirPlanning) view.players[them].actions = theirPlanning.actions;
    (view.players[me] as { hand: VisibleCard[] }).hand = this.state.players[me].hand.map(card => this.shownCard(card));
    view.players.forEach((player, owner) => {
      const state = this.state.players[owner];
      player.discard = state.discard.map(card => this.shownCard(card));
      player.destroyed = state.destroyed.map(card => this.shownCard(card));
      player.bank.forEach((entry, index) => { entry.card = this.shownCard(state.bank[index].card); });
    });
    view.trash = this.state.trash.map(card => this.shownCard(card));
    const visiblePower = (placement: Deployment): VisiblePlacement => ({
      ...structuredClone(placement),
      card: placement.revealed ? this.shownCard(placement.card, this.cardPower(placement)) : { id: `hidden-placement-${placement.order}`, hidden: true },
    });
    view.nodes.forEach((node, i) => {
      // Closed Nodes reveal neither Location identity nor its rules/rewards to the client.
      if (!legalNodes(this.state.turn, this.state.nodeOrder).includes(i)) node.location = null;
      node.cards[me] = this.state.nodes[i].cards[me].map(placement => placement.revealed ? visiblePower(placement) : { ...structuredClone(placement), card: this.shownCard(placement.card) });
      if (theirPlanning) {
        // A relocated card keeps the Node it had when planning began; its Power counts there too.
        const theirs = theirPlanning.nodes[i].map(placement => ({ ...placement, node: i }));
        node.cards[them] = theirs.map(visiblePower);
        node.powers[them] = theirs.reduce((sum, placement) => sum + (placement.revealed ? this.cardPower(placement) : 0), this.state.nodes[i].powerModifiers[them]);
        node.winner = nodeWinner(node.powers);
      } else node.cards[them] = this.state.nodes[i].cards[them].map(visiblePower);
    });
    return seat === 0 ? view : mirrorView(view);
  }

  private event(kind: RuntimeEvent["kind"], text: string, detail: Omit<RuntimeEvent, "id" | "kind" | "text"> = {}): RuntimeEvent {
    if (FAILED_OUTCOME.test(text)) this.failedOutcomes++;
    const output: RuntimeEvent = { id: ++this.serial, kind, text, ...detail, cycle: this.state.cycle, turn: this.state.turn, phase: this.state.phase };
    // Telemetry is observation only; a fault there must never interrupt play.
    try { this.telemetry?.record(output); } catch { /* ignored */ }
    return output;
  }

  private activeCards(owner: PlayerId): Card[] {
    const player = this.state.players[owner];
    return [...player.draw, ...player.hand, ...player.discard, ...player.bank.map(entry => entry.card), ...this.state.nodes.flatMap(node => node.cards[owner].map(placement => placement.card))];
  }

  private refreshScores() {
    this.state.players.forEach((player, owner) => {
      player.totalVP = player.destructionVP + player.rewardVP + this.activeCards(owner as PlayerId).reduce((sum, card) => sum + cardVP(card), 0);
    });
  }

  private scoreBreakdown(owner: PlayerId): ScoreBreakdown {
    const player = this.state.players[owner], sources = this.rewardSources[owner];
    const vpCards = structuredClone(this.activeCards(owner).filter(card => cardVP(card) > 0));
    return {
      total: player.totalVP, vpCards,
      cardVP: vpCards.reduce((sum, card) => sum + cardVP(card), 0),
      locationVP: sources.location, circuitVP: sources.circuit,
      effectVP: player.rewardVP - sources.location - sources.circuit,
      destructionVP: player.destructionVP,
    };
  }

  private locationWins(): [number, number] {
    return [this.state.nodes.filter(node => node.winner === 0).length, this.state.nodes.filter(node => node.winner === 1).length];
  }

  private auraBonus(placement: Deployment): number {
    if (placement.node < 0 || !placement.revealed) return 0;
    const allies = this.state.nodes[placement.node]?.cards[placement.owner] ?? [];
    return allies.reduce((sum, other) => {
      if (other.card.id === placement.card.id || !other.revealed) return sum;
      return sum + (other.card.aura ?? 0) + (other.card.modifiers ?? []).filter(modifier => modifier.kind === 'powerAuraAtLocation').reduce((total, modifier) => total + (modifier.amount ?? 0), 0);
    }, 0);
  }

  private sourcedPower(card: Card, owner?: PlayerId): number {
    switch (card.powerSource) {
      case "trash": return this.state.trash.length;
      case "destroyed": return this.state.players.reduce((sum, player) => sum + player.destroyed.length, 0);
      case "moved": return this.state.movedTotal;
      case "movedByOwner": {
        const seat = owner ?? this.cardOwner(card);
        return seat === undefined ? 0 : this.state.players[seat].moved;
      }
      default: return 0;
    }
  }

  /** Printed Power plus any live count the card draws its Power from, before lasting changes. */
  private printedPower(card: Card): number {
    return (card.power ?? 0) + this.sourcedPower(card);
  }

  /** Power a card has off the board: printed, live bonus and lasting change, never below its floor. */
  private livePower(card: Card): number {
    return Math.max(cardPowerFloor(card), this.printedPower(card) + (card.powerDelta ?? 0));
  }

  /** A copy for the client showing live Power; `basePower` marks any difference from the printed value. */
  private shownCard(card: Card, live = this.livePower(card)): Card {
    const copy = structuredClone(card);
    if (card.type === "Crypto" || (card.power === undefined && !card.powerDelta && !card.powerSource)) return copy;
    const printed = card.power ?? 0;
    return { ...copy, power: live, ...(live !== printed ? { basePower: printed } : {}) };
  }

  private cardPower(placement: Deployment, withAura = true): number {
    return effectiveCardPower(placement, (withAura ? this.auraBonus(placement) : 0) + this.sourcedPower(placement.card, placement.owner));
  }

  private recalculate() {
    this.state.nodes.forEach(node => {
      node.powers = node.cards.map((cards, owner) => cards.reduce((sum, placement) => sum + (placement.revealed ? this.cardPower(placement) : 0), node.powerModifiers[owner])) as [number, number];
      node.winner = nodeWinner(node.powers);
    });
  }

  private stripModifiers(card: Card) {
    if (card.modifiers?.length) delete card.modifiers;
  }

  /** Runtime cards are single-cycle: once played they leave the game instead of entering any zone. */
  private isRuntimeCard(card: Card): boolean {
    return card.cardClass === "Runtime";
  }

  /** Cards that count Runtime turns: turn durations, plus any duration carrying Recurring or Scheduled steps. */
  private turnTimed(card: Card): boolean {
    return card.durationPeriod === "runtime" || !!card.duration && (!!card.recurring?.length || !!card.schedule?.length);
  }

  /** Sends a card that left the board to `zone`; returns false when a Runtime card was removed from the game instead. */
  private retire(card: Card, owner: PlayerId, zone: "trash" | "destroyed" | "discard"): boolean {
    this.runtimeTimers.delete(card.id);
    this.expiredOnBoard.delete(card.id);
    if (this.isRuntimeCard(card)) { this.stripModifiers(card); return false; }
    if (zone === "trash") this.state.trash.push(card);
    else if (zone === "destroyed") this.state.players[owner].destroyed.push(card);
    else this.state.players[owner].discard.push(card);
    return true;
  }

  private timerUntil(timer: RuntimeTimer) {
    return Math.max(timer.formExpiresAt, ...timer.morphTriggers.map(trigger => trigger.expiresAt));
  }

  /**
   * Effect steps a banked card still has to resolve: Recurring and Scheduled steps on the Runtime
   * turns it stays active, plus its On Collapse steps at each Effect Bank resolution it remains for.
   * Null when either kind never runs out.
   */
  private bankEffectsLeft(entry: BankEntry): number | null {
    const { card } = entry, timer = this.runtimeTimers.get(card.id);
    const { cycle, turn, phase } = this.state;
    const thisCollapseDone = this.bankResolvedCycle === cycle || phase === "draft" || phase === "gameover";
    const firstCollapse = thisCollapseDone ? 1 : 0;
    const collapseSteps = this.hookEffects(card, "onCollapse").length;
    const timeBound = !!timer && !timer.cycleBound;
    let collapses: number;
    if (timeBound) {
      const until = this.timerUntil(timer!);
      if (!Number.isFinite(until)) collapses = Infinity;
      else { const atTurn3 = timer!.age + 3 - turn; collapses = until < atTurn3 ? 0 : Math.max(0, Math.floor((until - atTurn3) / 3) + 1 - firstCollapse); }
    } else collapses = entry.expiresCycle === undefined ? Infinity : Math.max(0, entry.expiresCycle - cycle + 1 - firstCollapse);
    if (collapseSteps && !Number.isFinite(collapses)) return null;
    let total = collapseSteps * collapses;
    if (!timer) return total;
    const lastAge = timeBound ? this.timerUntil(timer) : entry.expiresCycle === undefined ? Infinity : timer.age + entry.expiresCycle - cycle;
    if (!Number.isFinite(lastAge) && (this.steps(card.recurring, "card").length || timer.morphTriggers.some(trigger => trigger.cadence === "recurring" && !Number.isFinite(trigger.expiresAt)))) return null;
    const horizon = Number.isFinite(lastAge) ? lastAge : timer.age + 48;
    for (let age = timer.age; age <= horizon; age++) for (const timing of ["start", "end"] as const) {
      if (age * 2 + (timing === "end" ? 1 : 0) <= (timer.firedSlot ?? -1)) continue;
      total += this.scheduledEffects({ ...timer, age }, timing).length;
    }
    return total;
  }

  private rememberMorphTriggers(timer: RuntimeTimer, card: Card) {
    if (!this.turnTimed(card) || !card.duration) return;
    const origin = card.definitionId ?? card.id;
    const expiresAt = card.duration === 99 || card.durationPeriod !== "runtime" ? Infinity : timer.formStartAge + card.duration - 1;
    const add = (trigger: MorphTrigger) => {
      if (!timer.morphTriggers.some(existing => existing.origin===trigger.origin && existing.sourceStartAge===trigger.sourceStartAge && existing.cadence===trigger.cadence && existing.slot===trigger.slot)) timer.morphTriggers.push(trigger);
    };
    this.steps(card.recurring,"card").forEach((effect,index)=>{if(effect.action==="morph")add({effect,cadence:"recurring",origin,sourceStartAge:timer.formStartAge,slot:`recurring-${index}`,expiresAt});});
    (card.schedule??[]).forEach((entry,entryIndex)=>this.steps(entry.effects,"card").forEach((effect,effectIndex)=>{if(effect.action==="morph")add({effect,cadence:"scheduled",origin,sourceStartAge:timer.formStartAge,slot:`schedule-${entryIndex}-${effectIndex}`,at:timer.formStartAge+entry.at-1,timing:entry.timing??"start",expiresAt});}));
  }

  private scheduledEffects(timer: RuntimeTimer, timing: "start" | "end") {
    const { card } = timer.placement;
    const formAge=timer.age-timer.formStartAge+1;
    const live = [
      ...(timing === "start" && formAge>=1 ? this.steps(card.recurring, "card") : []),
      ...(card.schedule ?? []).filter(entry => entry.at === formAge && (entry.timing ?? "start") === timing).flatMap(entry => this.steps(entry.effects, "card")),
    ];
    const retained=timer.morphTriggers.filter(trigger=>timer.age<=trigger.expiresAt &&
      (trigger.cadence==="recurring"?timing==="start":trigger.at===timer.age&&trigger.timing===timing));
    const signature=(effect:EffectStep)=>JSON.stringify([effect.formIds,effect.selection??"sequential"]);
    const liveCounts=new Map<string,number>();
    for(const effect of live)if(effect.action==="morph"){
      const key=signature(effect);
      liveCounts.set(key,(liveCounts.get(key)??0)+1);
    }
    const perOrigin=new Map<string,Map<string,number>>();
    for(const trigger of retained){
      const key=signature(trigger.effect), origin=`${trigger.origin}:${trigger.sourceStartAge}`;
      const origins=perOrigin.get(key)??new Map<string,number>();
      origins.set(origin,(origins.get(origin)??0)+1);
      perOrigin.set(key,origins);
    }
    const desired=new Map<string,number>(liveCounts);
    for(const [key,origins] of perOrigin)desired.set(key,Math.max(desired.get(key)??0,...origins.values()));
    const emitted=new Map(liveCounts);
    const appended=retained.filter(trigger=>{
      const key=signature(trigger.effect);
      if((emitted.get(key)??0)>=(desired.get(key)??0))return false;
      emitted.set(key,(emitted.get(key)??0)+1);
      return true;
    }).map(trigger=>trigger.effect);
    return [...live,...appended];
  }

  addEvaluationCard(definitionId: string, owner:PlayerId=0): RuntimeEvent {
    if(!this.config.strategicMarket || this.state.phase!=="runtime" || this.queue.length || this.state.choice || this.planningSnapshot.some(Boolean))throw new Error("Add evaluation cards only before planning placements at a Runtime boundary.");
    const definition=(this.config.content?.cards??EVALUATION_ALL_CARDS).find(card=>(card.definitionId ?? card.id)===definitionId);
    if(!definition)throw new Error("Unknown evaluation card.");
    const card={...structuredClone(definition),id:`${owner}:evaluation-${++this.acquired}`};
    const player=this.state.players[owner],before=player.hand.length;
    player.hand.push(card);this.refreshScores();
    return this.event("draw",`Added ${card.name} to evaluation hand.`,{owner,targetOwner:owner,cardId:card.id,definitionId,target:"hand",amount:1,before,after:player.hand.length});
  }

  /** A human seat places a card from its hand face down; reversible with undoAllPlanning until the seat commits. */
  deploy(cardId: string, node: number, owner: PlayerId = 0): RuntimeEvent {
    if (this.state.phase !== "runtime" || this.queue.length) throw new Error("Deployment is only available during Runtime.");
    this.assertHuman(owner);
    if (this.state.turnReady[owner]) throw new Error("This seat has committed its turn.");
    const snapshot = this.planningSnapshot[owner] ?? this.takePlanningSnapshot(owner);
    const event = this.place(owner, cardId, node);
    this.planningSnapshot[owner] = snapshot;
    return event;
  }

  private takePlanningSnapshot(owner: PlayerId): PlanningSnapshot {
    const player = this.state.players[owner];
    return {
      hand: [...player.hand], actions: player.actions,
      nodes: this.state.nodes.map(node => [...node.cards[owner]]), order: this.order,
      relocatedThisTurn: [...this.relocatedThisTurn], relocatedThisCycle: [...this.relocatedThisCycle],
      moved: player.moved, movedTotal: this.state.movedTotal,
    };
  }

  undoAllPlanning(owner: PlayerId = 0): RuntimeEvent {
    const snapshot = this.planningSnapshot[owner];
    if (this.state.phase !== "runtime" || this.queue.length || this.state.choice || !snapshot || this.state.turnReady[owner]) throw new Error("No reversible planning actions are available.");
    const player = this.state.players[owner];
    player.hand = [...snapshot.hand];
    player.actions = snapshot.actions;
    this.state.nodes.forEach((node, index) => {
      node.cards[owner] = [...snapshot.nodes[index]];
      node.cards[owner].forEach(placement => { placement.node = index; });
    });
    // `order` only rewinds while no later placement by the other seat depends on it.
    if (!this.state.nodes.some(node => node.cards[1 - owner].some(placement => placement.order > snapshot.order))) this.order = snapshot.order;
    this.relocatedThisTurn = new Set(snapshot.relocatedThisTurn);
    this.relocatedThisCycle = new Set(snapshot.relocatedThisCycle);
    player.moved = snapshot.moved;
    this.state.movedTotal = snapshot.movedTotal;
    this.planningSnapshot[owner] = null;
    this.recalculate();
    return this.event("turn", "All planning actions undone. Moved cards return, and hand order and Actions are restored.", {owner});
  }

  /** Why a board card cannot relocate itself now, or null when it can. The movable mod allows once per Runtime turn;
      a card's own self-move allows once per turn or once per Cycle. */
  private relocateBlocker(placement: Deployment): string | null {
    if (!placement.revealed) return "Movable card is not on the board.";
    const card = placement.card;
    const perTurn = (card.modifiers ?? []).some(modifier => modifier.kind === 'movableEachTurn') || card.selfMove === "turn";
    if (perTurn) return this.relocatedThisTurn.has(card.id) ? "This card already moved this turn." : null;
    if (card.selfMove === "cycle") return this.relocatedThisCycle.has(card.id) ? "This card already moved this Cycle." : null;
    return "This card is not movable.";
  }

  /** Free relocate for a revealed card with the movable mod or its own self-move. */
  relocateCard(cardId: string, destination: number, owner: PlayerId = 0): RuntimeEvent {
    if (this.state.phase !== "runtime" || this.queue.length || this.state.choice) throw new Error("Finish the current resolution first.");
    const placement = this.state.nodes.flatMap(node => node.cards[owner]).find(item => item.card.id === cardId);
    if (!placement) throw new Error("Movable card is not on the board.");
    const blocker = this.relocateBlocker(placement);
    if (blocker) throw new Error(blocker);
    if (!this.moveDestinations(placement).includes(destination)) throw new Error("Destination Node is unavailable.");
    if (this.state.turnReady[owner]) throw new Error("This seat has committed its turn.");
    const human = !this.aiSeats.includes(owner);
    const snapshot = human ? this.planningSnapshot[owner] ?? this.takePlanningSnapshot(owner) : null;
    const event = this.movePlacement(placement, destination, placement);
    this.relocatedThisTurn.add(cardId);
    this.relocatedThisCycle.add(cardId);
    if (snapshot) this.planningSnapshot[owner] = snapshot;
    return { ...event, text: `${placement.card.name} relocates to Node ${destination + 1}.` };
  }

  private place(owner: PlayerId, cardId: string, node: number): RuntimeEvent {
    const player = this.state.players[owner];
    const card = player.hand.find(item => item.id === cardId);
    if (!card) throw new Error("Card is not in this player's hand.");
    if (!this.state.nodes[node]) throw new Error("Unknown Node.");
    const reason = canDeploy(card, player.actions, this.state.turn, node, this.state.nodes[node].cards[owner].length, legalNodes(this.state.turn, this.state.nodeOrder));
    if (reason) throw new Error(reason);
    player.hand = player.hand.filter(item => item.id !== cardId);
    if (isCharacterCard(card)) player.actions--;
    this.state.nodes[node].cards[owner].push({ card, owner, node, order: ++this.order, revealed: false });
    // The card's identity is the owner's secret until it reveals: the AI's placements are announced face down, and a
    // human's placement carries the public wording for the other seat (see redactEvent).
    const publicText = `${this.subject(owner)} deployed a face-down card.`;
    if (this.aiSeats.includes(owner)) return this.event("deploy", publicText, { node, owner });
    return this.event("deploy", `${card.name} placed. End Turn to commit your plan.`, { node, owner, cardId, publicText });
  }

  private get strategy(): StrategyProfile { return this.config.strategy ?? DEFAULT_STRATEGY; }
  private strategyOf(owner: PlayerId): StrategyProfile { return this.config.seatStrategies?.[owner] ?? this.strategy; }

  /** Only the owner's own cards and the public scoreboard; the local hand and draw order stay hidden. */
  private strategyContext(owner: PlayerId = 1): StrategyContext {
    const own = this.state.players[owner], enemy = this.state.players[1 - owner];
    const max = serverMaximums.primary + serverMaximums.backup;
    return {
      cycle: this.state.cycle, finalCycle: 16,
      owned: [...own.draw, ...own.hand, ...own.discard, ...own.bank.map(entry => entry.card)],
      ownServers: own.servers.primary + own.servers.backup, ownServersMax: max,
      enemyServers: enemy.servers.primary + enemy.servers.backup, enemyServersMax: max,
    };
  }

  /** Plans one AI seat's deployments from public state and its own hand; it never inspects the other hand. */
  private aiDeploy(owner: PlayerId) {
    const player = this.state.players[owner], enemy = (1 - owner) as PlayerId;
    const profile = this.strategyOf(owner), context = this.strategyContext(owner);
    const priority = new Map(player.hand.map(card => [card.id, deployPriority(card, profile, context)]));
    const hand = [...player.hand].sort((a, b) => priority.get(b.id)! - priority.get(a.id)!);
    const stakes = new Map(this.state.nodes.map((state, node) => [node, state.location ? locationStakes(state.location, profile, context, this.state.turn) : null]));
    for (const card of hand) {
      if (card.type === "Crypto") continue;
      const candidates = legalNodes(this.state.turn, this.state.nodeOrder).filter(node => !canDeploy(card, player.actions, this.state.turn, node, this.state.nodes[node].cards[owner].length, legalNodes(this.state.turn, this.state.nodeOrder)));
      const locationScore = (node: number, swing: number) => {
        const read = stakes.get(node);
        return read ? Math.max(-LOCATION_SCORE_CAP, Math.min(LOCATION_SCORE_CAP, LOCATION_POINT * (swing * read.stake + read.reveal))) : 0;
      };
      const tacticalScore = (node: number) => {
        const state = this.state.nodes[node];
        // Only the seat's own identities and the other seat's publicly revealed Power are used.
        const own = state.cards[owner].reduce((sum, placement) => sum + this.cardPower(placement, false), 0);
        const visibleEnemy = state.powers[enemy];
        const after = own + this.printedPower(card);
        const flips = own <= visibleEnemy && after > visibleEnemy, ties = own <= visibleEnemy && after === visibleEnemy;
        const outcome = flips ? 3 : ties ? 1.5 : own < visibleEnemy ? .7 : .25;
        // How much this card moves the chance of holding the Node when its Location fires.
        const swing = flips ? 1 : ties ? .5 : own < visibleEnemy ? .15 : .05;
        return 20 * outcome - state.cards[owner].length * 3 + locationScore(node, swing);
      };
      candidates.sort((a, b) => this.config.strategicMarket ? tacticalScore(b) - tacticalScore(a) || a - b : this.state.nodes[a].cards[owner].length - this.state.nodes[b].cards[owner].length || a - b);
      if (!candidates.length) continue;
      const node = candidates[0];
      this.recordDecision({ kind: "deploy", cycle: this.state.cycle, turn: this.state.turn, owner, card: card.name, definitionId: card.definitionId ?? card.id, node, location: this.state.nodes[node].location?.name ?? null, priority: Math.round(priority.get(card.id)! * 100) / 100, nodeScore: Math.round(tacticalScore(node) * 100) / 100, locationStake: stakes.get(node)?.stake ?? null, options: candidates.length });
      this.place(owner, card.id, node);
    }
  }

  /**
   * A human seat commits its Runtime plan. The reveal starts once every human seat has committed and the AI seats have
   * placed; until then the committed seat waits and may undoEndTurn. Returns the waiting event, or null when the reveal
   * window begins (its events follow through step()).
   */
  endTurn(owner: PlayerId = 0): RuntimeEvent | null {
    if (this.state.phase !== "runtime" || this.queue.length) throw new Error("Finish the current resolution first.");
    // With no human seat (headless self-play) the caller is the table clock and the turn ends at once.
    if (this.humanSeats.length) {
      this.assertHuman(owner);
      if (this.state.turnReady[owner]) throw new Error("This seat has already committed its turn.");
      this.state.turnReady[owner] = true;
      const waiting = this.humanSeats.filter(seat => !this.state.turnReady[seat]);
      if (waiting.length) return this.event("turn", `${this.say(owner, "You commit", "commits")} the turn; waiting for ${this.subject(waiting[0])}.`, { owner });
    }
    this.planningSnapshot = [null, null];
    for (const seat of this.aiSeats) this.aiDeploy(seat);
    this.state.phase = "reveal";
    this.enqueueRevealWindow();
    this.queue.push(() => this.enqueueRuntimeSchedule("end"));
    this.queue.push(() => {
      this.recalculate();
      const wins = this.locationWins();
      if (wins[0] !== wins[1]) this.state.priority = wins[0] > wins[1] ? 0 : 1;
      if (this.state.turn < 3) {
        this.queue.push(() => this.enqueueLocationStartTurn());
        this.queue.push(() => this.enqueueLocationOngoing());
        this.state.turn++;
        this.relocatedThisTurn.clear();
        this.state.players.forEach(player => { player.actions = runtimeActions(this.state.turn, player.actions, player.pendingActions, this.config.carryover); player.pendingActions = 0; });
        // Opening-window effects resolve before the next planning boundary.
        // Actions earned here belong to the following Runtime turn.
        this.expireRuntimeTimers();
        if(this.runtimeTimers.size)this.queue.push(() => this.enqueueRuntimeSchedule("start", true));
        if(this.revealedWithMods("recurring").length)this.queue.push(() => this.enqueueModRecurring());
        this.enqueueRevealWindow();
        this.queue.push(() => {
          this.state.phase = "runtime";
          this.state.turnReady = [false, false];
          return this.event("turn", `Runtime turn ${this.state.turn} planning begins.`);
        });
        return this.event("turn", `Runtime turn ${this.state.turn}. Node ${this.state.nodeOrder[this.state.turn + 1] + 1} opens.`);
      }
      this.state.phase = "collapse";
      this.collapseStartedNodes.clear(); this.collapseResolvedNodes.clear(); this.collapseEffectCards.clear();
      this.enqueueCollapse();
      return this.event("collapse", "Wave Collapse begins. Resolve Nodes 1 through 5.");
    });
    return null;
  }

  /** A committed seat takes its turn back while the other human seat is still planning. */
  undoEndTurn(owner: PlayerId = 0): RuntimeEvent {
    if (this.state.phase !== "runtime" || this.queue.length || !this.state.turnReady[owner]) throw new Error("This seat has not committed a turn to take back.");
    this.state.turnReady[owner] = false;
    return this.event("turn", `${this.say(owner, "You resume", "resumes")} planning.`, { owner });
  }

  private enqueueRevealWindow() {
    const ordered = revealOrder(this.state.nodes.flatMap(node => node.cards.flat()), this.state.turn, this.state.priority, legalNodes(this.state.turn, this.state.nodeOrder));
    for (const placement of ordered) {
      const revealEffects=this.hookEffects(placement.card, 'onReveal');
      const locationOnPlay=(this.state.nodes[placement.node]?.location?.onPlay?.length ?? 0) > 0;
      const runtimeOpening=this.turnTimed(placement.card) && ((placement.card.recurring?.length ?? 0)>0 || (placement.card.schedule ?? []).some(entry=>entry.at===1&&(entry.timing ?? "start")==="start") || revealEffects.some(effect=>effect.action==="morph"));
      const followers=revealEffects.length+(locationOnPlay?1:0)+(runtimeOpening?1:0);
      this.queue.push(() => {
        placement.revealed = true;
        placement.revealSequence = ++this.revealCounter;
        if(this.turnTimed(placement.card)) {
          const duration=placement.card.duration ?? 0, cycleBound=placement.card.durationPeriod !== "runtime";
          const timer:RuntimeTimer={placement,age:1,formStartAge:1,formExpiresAt:duration===99||cycleBound?Infinity:duration,morphTriggers:[],...(cycleBound?{cycleBound}:{})};
          this.rememberMorphTriggers(timer,placement.card);
          this.runtimeTimers.set(placement.card.id,timer);
          this.expiredOnBoard.delete(placement.card.id);
        }
        this.recalculate();
        // This card's own reveal steps are still at the head of the queue; waiting triggers land after them.
        const triggered=this.claimNextRevealTriggers(placement);
        if(triggered.length)this.queue.splice(followers,0,...triggered);
        return this.event("reveal", `${placement.card.name} reveals.`, { node: placement.node, owner: placement.owner, cardId: placement.card.id });
      });
      const ctx = this.cardContext(placement);
      for (const effect of revealEffects) this.queue.push(() => this.resolveStep(ctx, effect));
      // Location on-play: when a card reveals here.
      if (locationOnPlay) {
        this.queue.push(() => this.enqueueLocationOnPlay(placement));
      }
      if(runtimeOpening)this.queue.push(()=>{
        const timer=this.runtimeTimers.get(placement.card.id);
        const effects=timer?this.scheduledEffects(timer,"start"):[];
        if(timer)timer.firedSlot=timer.age*2;
        if(!effects.length)return this.event("bank",`${placement.card.name}: no opening Runtime effects.`);
        this.queue.unshift(...effects.slice(1).map(effect=>()=>effect.action==="morph"?this.resolveMorph(placement,effect,true):this.resolveStep(ctx,effect)));
        return effects[0].action==="morph"?this.resolveMorph(placement,effects[0],true):this.resolveStep(ctx,effects[0]);
      });
    }
  }

  private locationSyntheticPlacement(node: number, owner: PlayerId): Deployment {
    const location = this.state.nodes[node].location!;
    return {
      card: { id: `location:${location.id}`, name: location.name, type: "Character", cost: 0, art: "", effect: location.reward },
      owner, node, order: 0, revealed: true,
    };
  }

  private revealedOnSides(node: number, owners: readonly PlayerId[]): Deployment[] {
    return owners.flatMap(owner => this.state.nodes[node].cards[owner].filter(placement => placement.revealed));
  }

  private movePlacementRandom(source: Deployment, target: Deployment, kind: "card" | "location"): RuntimeEvent {
    const destinations = this.moveDestinations(target);
    if (!destinations.length) return this.event("move", `${source.card.name}: No target.`, {
      owner: source.owner, cardId: source.card.id, targetCardId: target.card.id, targetOwner: target.owner,
      node: source.node >= 0 ? source.node : undefined, source: kind, sourceName: source.card.name, amount: 0,
    });
    const destination = destinations[Math.floor(this.config.random() * destinations.length)];
    const event = this.movePlacement(source, destination, target);
    return { ...event, source: kind, sourceName: source.card.name };
  }

  private expireRuntimeTimers() {
    for(const [id,timer] of this.runtimeTimers) {
      if(timer.age < this.timerUntil(timer))continue;
      const owner=timer.placement.owner, player=this.state.players[owner];
      const bank=player.bank.findIndex(entry=>entry.card.id===id);
      if(bank>=0 && player.bank[bank].card.duration && player.bank[bank].card.durationPeriod!=="runtime"){
        player.bank[bank].expiresCycle=player.bank[bank].card.duration===99?undefined:this.state.cycle+player.bank[bank].card.duration!-1;
        this.runtimeTimers.delete(id);
        continue;
      }
      const onBoard=this.state.nodes.flatMap(node=>node.cards[owner]).find(item=>item.card.id===id);
      if(onBoard){
        this.expiredOnBoard.add(id);
        this.queue.push(()=>this.event("bank",`${onBoard.card.name}: duration ends. It stays on Node ${onBoard.node+1} until Collapse.`,{node:onBoard.node,owner,cardId:id}));
      }else if(bank>=0)this.retire(player.bank.splice(bank,1)[0].card,owner,"discard");
      this.runtimeTimers.delete(id);
    }
    this.recalculate();
  }

  private enqueueRuntimeSchedule(timing: "start"|"end", advance=false): RuntimeEvent {
    const callbacks:(()=>RuntimeEvent)[]=[];
    for(const timer of this.runtimeTimers.values()) {
      const {placement}=timer;
      const active=this.state.players[placement.owner].bank.some(entry=>entry.card.id===placement.card.id)||this.state.nodes.some(node=>node.cards[placement.owner].some(item=>item.card.id===placement.card.id));
      if(!active){this.runtimeTimers.delete(placement.card.id);continue;}
      if(timer.cycleBound&&(timing==="start"?!advance||this.state.turn!==1:this.state.turn!==3))continue;
      if(advance)timer.age++;
      const effects=this.scheduledEffects(timer,timing);
      timer.firedSlot=timer.age*2+(timing==="end"?1:0);
      callbacks.push(...effects.map(effect=>()=>this.resolveScheduledEffect(placement,effect,timing)));
    }
    this.queue.unshift(...callbacks);
    return this.event("bank",callbacks.length?`Scheduled ${timing}-of-turn effects resolve.`:"No scheduled Runtime effects.");
  }

  private revealedWithMods(hook: ModHook): Deployment[] {
    return this.state.nodes.flatMap(node => node.cards.flat()).filter(placement => placement.revealed && this.modSteps(placement.card, hook).length);
  }

  /** Each later Runtime turn opens with the every-turn effects of mods on revealed cards. */
  private enqueueModRecurring(): RuntimeEvent {
    const callbacks = this.revealedWithMods("recurring").flatMap(placement => {
      const ctx = this.cardContext(placement);
      return this.modSteps(placement.card, "recurring").map(step => () => this.resolveStep(ctx, step));
    });
    this.queue.unshift(...callbacks);
    return this.event("bank", callbacks.length ? "Mod effects resolve for the new Runtime turn." : "No mod effects this turn.");
  }

  private requestChoice(placement: Deployment, prompt: string, options: (ChoiceOption & { resolve: () => RuntimeEvent })[], icon?: string, zone?: "trash", verb?: string): RuntimeEvent {
    return this.openChoice(placement, {
      prompt, icon, zone, verb,
      options: options.map(({ resolve: _resolve, ...option }) => option),
      resolve: ([id]) => options.find(option => option.id === id)!.resolve(),
    });
  }

  private openChoice(placement: Deployment, request: ChoiceRequest): RuntimeEvent {
    const { prompt, options, icon, groups, resolve } = request;
    const select = request.select && !(request.select.min === 1 && request.select.max === 1) ? request.select : undefined;
    if (!options.length) return this.event("choice", `${placement.card.name}: No target.`, { node: placement.node, owner: placement.owner, source: "card", sourceName: placement.card.name, amount: 0 });
    const shape = { options, ...(select ? { select } : {}), ...(groups?.length ? { groups } : {}) };
    if (this.aiSeats.includes(placement.owner)) {
      const ids = request.aiPick?.() ?? this.randomSelection(shape);
      this.queue.unshift(() => resolve(ids));
      const labels = ids.map(id => options.find(option => option.id === id)!.label);
      this.recordDecision({ kind: "choice", cycle: this.state.cycle, turn: this.state.turn, owner: placement.owner, source: placement.card.name, prompt, picked: labels, method: request.aiPick ? "strategy" : "random" });
      return this.event("choice", `${this.config.seatNames ? this.subject(placement.owner) : placement.owner === 1 ? "Opponent" : "AI"} chooses: ${labels.join(", ") || "nothing"}.`, { node: placement.node, owner: placement.owner, source: "card", sourceName: placement.card.name });
    }
    this.choiceResolver = resolve;
    this.state.choice = { id: ++this.serial, owner: placement.owner, prompt, sourceName: placement.card.name, node: placement.node, ...(icon ? { icon } : {}), ...shape, ...(request.transfer ? { transfer: request.transfer } : {}), ...(request.zone ? { zone: request.zone } : {}), ...(request.verb ? { verb: request.verb } : {}) };
    return this.event("choice", prompt, { node: placement.node, owner: placement.owner, source: "card", sourceName: placement.card.name });
  }

  private randomSelection(choice: Pick<RuntimeChoice, "options" | "select" | "groups">): string[] {
    const pick = <T>(items: T[]) => items[Math.floor(this.config.random() * items.length)];
    if (choice.groups) return choice.groups.map(group => pick(choice.options.filter(option => option.group === group.id)).id);
    const open = choice.options.filter(option => !option.disabled);
    if (!choice.select) return [pick(open).id];
    const pool = [...open];
    const { min, max } = choice.select;
    const count = min + Math.floor(this.config.random() * (max - min + 1));
    return Array.from({ length: Math.min(count, pool.length) }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0].id);
  }

  /** A single option id, or the complete selection for a `select` / `groups` choice. */
  choose(selection: string | readonly string[], owner: PlayerId = 0): RuntimeEvent {
    const choice = this.state.choice;
    if (!choice || choice.owner !== owner || !this.choiceResolver) throw new Error("No choice is pending for this player.");
    const ids = typeof selection === "string" ? [selection] : [...selection];
    const chosen = ids.map(id => choice.options.find(option => option.id === id));
    if (chosen.some(option => !option || option.disabled) || new Set(ids).size !== ids.length) throw new Error("Choose a legal option.");
    if (choice.groups) {
      if (ids.length !== choice.groups.length || choice.groups.some(group => chosen.filter(option => option!.group === group.id).length !== 1)) throw new Error("Choose one option for each card.");
    } else if (choice.select) {
      if (ids.length < choice.select.min || ids.length > choice.select.max) throw new Error(`Choose ${choice.select.min === choice.select.max ? choice.select.min : `${choice.select.min}–${choice.select.max}`} options.`);
    } else if (ids.length !== 1) throw new Error("Choose one option.");
    const resolve = this.choiceResolver;
    this.state.choice = null; this.choiceResolver = null;
    const event = resolve(ids);
    this.refreshScores();
    return event;
  }

  resolveChoiceTimeout(): RuntimeEvent {
    if (!this.state.choice) throw new Error("No mandatory choice is pending.");
    const choice = this.state.choice;
    return this.choose(this.randomSelection(choice), choice.owner);
  }

  /** A board card as currently shown, for choice thumbnails. */
  private choiceCard(target: Deployment): Card {
    return this.shownCard(target.card, this.cardPower(target));
  }

  private resolveMorph(placement: Deployment, effect: EffectStep, nextTurn=false): RuntimeEvent {
    const id=placement.card.id, owner=placement.owner;
    const deployed=this.state.nodes.flatMap(node=>node.cards[owner]).find(item=>item.card.id===id);
    const banked=this.state.players[owner].bank.find(entry=>entry.card.id===id);
    if(!deployed && !banked)return this.event("morph",`${placement.card.name}: card is no longer active.`,{
      owner,cardId:id,targetCardId:id,targetOwner:owner,source:"card",sourceName:placement.card.name,amount:0,
    });
    const formIds=effect.formIds;
    if(!formIds?.length)throw new Error("Morph requires at least one form card.");
    if(effect.selection!==undefined && effect.selection!=="sequential" && effect.selection!=="random")throw new Error("Morph selection must be sequential or random.");
    const definitions=formIds.map(formId=>{
      const form=(this.config.content?.cards??EVALUATION_ALL_CARDS).find(card=>(card.definitionId??card.id)===formId);
      if(!form)throw new Error(`Morph form unavailable: ${formId}`);
      if(form.type!=="Character" && form.type!=="VP")throw new Error(`Morph form must be Character or VP: ${formId}`);
      return form;
    });
    const current=deployed?.card??banked!.card;
    const before=deployed?this.cardPower(deployed,false):this.printedPower(current);
    const key=JSON.stringify(formIds);
    const progress=this.morphProgress.get(id)??new Map<string,number>();
    const index=effect.selection==="random" ? Math.floor(this.config.random()*definitions.length) : Math.min((progress.get(key)??-1)+1,definitions.length-1);
    const next:Card={...structuredClone(definitions[index]),id};
    if(current.powerDelta)next.powerDelta=current.powerDelta;
    if(effect.selection!=="random")progress.set(key,index);
    this.morphProgress.set(id,progress);
    let timer=this.runtimeTimers.get(id);
    if(timer)this.rememberMorphTriggers(timer,current);
    if(deployed)deployed.card=next;
    if(banked)banked.card=next;
    placement.card=next;
    if(timer){
      timer.placement.card=next;
      if((current.definitionId??current.id)!==(next.definitionId??next.id)){
        timer.formStartAge=timer.age+(nextTurn||this.state.phase==="collapse"?1:0);
        timer.cycleBound=next.durationPeriod!=="runtime"&&this.turnTimed(next)||undefined;
        timer.formExpiresAt=next.duration===99||timer.cycleBound?Infinity:next.durationPeriod==="runtime"&&next.duration ? timer.formStartAge+next.duration-1 : 0;
      }
      this.rememberMorphTriggers(timer,next);
    }else if(this.turnTimed(next)&&next.duration){
      const age=this.state.phase==="collapse"?0:1;
      const formStartAge=age+1, cycleBound=next.durationPeriod!=="runtime";
      timer={placement:deployed??placement,age,formStartAge,formExpiresAt:next.duration===99||cycleBound?Infinity:formStartAge+next.duration-1,morphTriggers:[],...(cycleBound?{cycleBound}:{})};
      this.rememberMorphTriggers(timer,next);
      this.runtimeTimers.set(id,timer);
    }
    if(banked){
      if(timer&&!timer.cycleBound||next.duration===99)banked.expiresCycle=undefined;
      else if(next.duration)banked.expiresCycle=this.state.cycle+next.duration-1;
      else{
        const entries=this.state.players[owner].bank;
        entries.splice(entries.indexOf(banked),1);
        this.state.players[owner].discard.push(next);
      }
    }
    this.recalculate();
    this.refreshScores();
    const after=deployed?this.cardPower(deployed,false):this.printedPower(next);
    return this.event("morph",`${current.name} morphs into ${next.name}.`,{
      node:deployed?.node,owner,cardId:id,targetCardId:id,definitionId:next.definitionId??next.id,targetOwner:owner,
      source:"card",sourceName:current.name,before,after,
    });
  }

  /* ------------------------------------------------------------------ effect steps */

  /** Steps for a stored effect list; older saved effects are migrated once per list. */
  private steps(list: readonly AnyEffect[] | undefined, scope: Scope): EffectStep[] {
    if (!list?.length) return [];
    let output = this.migrated.get(list);
    if (!output) { output = migrateEffects(list, scope); this.migrated.set(list, output); }
    return output;
  }

  /** Printed hook steps (doubled by the doublePrintedEffects mod), then the hook steps of every authored mod on the card. */
  private hookEffects(card: Card, hook: 'onReveal' | 'onCollapse'): EffectStep[] {
    const base = this.steps(hook === 'onReveal' ? (card.onReveal ?? starterEffects[card.name]) : card.onCollapse, 'card');
    const printed = card.modifiers?.some(modifier => modifier.kind === 'doublePrintedEffects') ? [...base, ...base] : [...base];
    return [...printed, ...this.modSteps(card, hook)];
  }

  private modSteps(card: Card, hook: ModHook): EffectStep[] {
    return (card.modifiers ?? []).flatMap(modifier => modifier.kind === 'authored' ? modifier[hook] ?? [] : []);
  }

  private get mods(): readonly ModDefinition[] {
    return this.config.content?.mods ?? [];
  }

  private cardContext(source: Deployment, immediateActions = false): EffectContext {
    return { scope: "card", source, ...(immediateActions ? { immediateActions } : {}) };
  }

  /** A Location's effects act for the Node's winner; on a tie the stand-in owner is only a placeholder (see `chooserFor`). */
  private locationContext(node: number, immediateActions = false): EffectContext {
    const location = this.state.nodes[node].location!;
    const winner = this.state.nodes[node].winner;
    return { scope: "location", node, winner, immediateActions, source: this.locationSyntheticPlacement(node, winner ?? 0), label: { source: "location", sourceName: location.name, node } };
  }

  /** On Play effects resolve as the card that revealed here. */
  private locationPlayContext(placement: Deployment): EffectContext {
    const location = this.state.nodes[placement.node].location!;
    return { scope: "locationPlay", node: placement.node, winner: this.state.nodes[placement.node].winner, played: placement.owner, source: placement, label: { source: "location", sourceName: location.name, node: placement.node } };
  }

  private circuitContext(owner: PlayerId, name: string): EffectContext {
    return { scope: "circuit", source: { card: { id: `circuit:${name}`, name, type: "Character", cost: 0, art: "", effect: name }, owner, node: -1, order: 0, revealed: true }, label: { source: "circuit", sourceName: name } };
  }

  private base(ctx: EffectContext) {
    const { card, owner, node } = ctx.source;
    return { node: node >= 0 ? node : undefined, owner, cardId: card.id, source: "card" as const, sourceName: card.name };
  }

  private noTarget(ctx: EffectContext, step: EffectStep, detail: Omit<RuntimeEvent, "id" | "kind" | "text"> = {}): RuntimeEvent {
    return this.event(STEP_EVENT[step.action], `${ctx.source.card.name}: No target.`, { ...this.base(ctx), amount: 0, ...detail });
  }

  /**
   * Players a `who` names. On a tied Location, `winner` means each player for player, Server and zone
   * targets, and nobody for card targets; `loser` needs a winner either way.
   */
  private whoPlayers(ctx: EffectContext, who: Who, cards: boolean): PlayerId[] {
    const owner = ctx.source.owner, other = (player: PlayerId) => (1 - player) as PlayerId;
    switch (who) {
      case "self": return [owner];
      case "opponent": return [other(owner)];
      case "both": return [owner, other(owner)];
      case "any": return [0, 1];
      case "played": return [ctx.played ?? owner];
      case "other": return [other(ctx.played ?? owner)];
      case "winner": return ctx.winner === undefined ? [owner] : ctx.winner === null ? (cards ? [] : [0, 1]) : [ctx.winner];
      case "loser": return ctx.winner === undefined ? [other(owner)] : ctx.winner === null ? [] : [other(ctx.winner)];
      case "leastVP": {
        this.refreshScores();
        const [first, second] = this.state.players.map(player => player.totalVP);
        return first === second ? (cards ? [] : [0, 1]) : [first < second ? 0 : 1];
      }
    }
  }

  /** Who acts when `recipient` is targeted: the controller, the On Play card's owner, or the Location winner. */
  private actorFor(ctx: EffectContext, recipient: PlayerId, hostile: boolean): PlayerId {
    if (ctx.scope === "card" || ctx.scope === "circuit") return ctx.source.owner;
    if (ctx.scope === "locationPlay") return ctx.played!;
    return ctx.winner ?? (hostile ? (1 - recipient) as PlayerId : recipient);
  }

  private actingAs(ctx: EffectContext, actor: PlayerId): EffectContext {
    return actor === ctx.source.owner ? ctx : { ...ctx, source: { ...ctx.source, owner: actor } };
  }

  /** Who picks for the controller; a tied Location picks one player at random. */
  private chooserFor(ctx: EffectContext, chooser?: "self" | "opponent"): PlayerId {
    const controller = ctx.scope === "location" && ctx.winner === null ? (this.config.random() < 0.5 ? 0 : 1) as PlayerId : ctx.source.owner;
    return chooser === "opponent" ? (1 - controller) as PlayerId : controller;
  }

  /** Runs `run` once per targeted player, each as the player acting on them. */
  private forEachRecipient(ctx: EffectContext, step: EffectStep, hostile: boolean, run: (ctx: EffectContext, recipient: PlayerId) => RuntimeEvent): RuntimeEvent {
    const who = step.target && "who" in step.target ? step.target.who : "self";
    const recipients = this.whoPlayers(ctx, who, false);
    if (!recipients.length) return this.noTarget(ctx, step);
    // The trailing player makes the choices in their own award.
    const actor = (recipient: PlayerId) => who === "leastVP" && !hostile ? recipient : this.actorFor(ctx, recipient, hostile);
    return this.runSteps(recipients.map(recipient => () => this.labelled(ctx, run(this.actingAs(ctx, actor(recipient)), recipient))));
  }

  /** Location and Circuit events name their source even when they resolve from the queue. */
  private labelled(ctx: EffectContext, event: RuntimeEvent): RuntimeEvent {
    return ctx.label ? { ...event, ...ctx.label } : event;
  }

  /** Runs `head`; once it and everything it queued have resolved, runs `then` unless any of it failed or was skipped. */
  private resolveChained(ctx: EffectContext, then: readonly EffectStep[], head: () => RuntimeEvent): RuntimeEvent {
    const failures = this.failedOutcomes;
    this.queue.unshift(() => {
      if (this.failedOutcomes !== failures) return this.event("choice", `${ctx.source.card.name}: chained effects cancelled.`, { owner: ctx.source.owner, cardId: ctx.source.card.id, source: "card", sourceName: ctx.source.card.name, amount: 0 });
      return this.runList(ctx, then);
    });
    return head();
  }

  /** Resolves a list in order through the queue, returning the first step's event. */
  private runList(ctx: EffectContext, steps: readonly EffectStep[]): RuntimeEvent {
    if (!steps.length) return this.event("choice", `${ctx.source.card.name}: nothing to resolve.`, { owner: ctx.source.owner, source: "card", sourceName: ctx.source.card.name });
    this.queue.unshift(...steps.slice(1).map(step => () => this.resolveStep(ctx, step)));
    return this.resolveStep(ctx, steps[0]);
  }

  /** Resolves one catalog step. Location and Circuit events carry their source. */
  private resolveStep(ctx: EffectContext, step: EffectStep): RuntimeEvent {
    return this.labelled(ctx, this.dispatchStep(ctx, step));
  }

  private dispatchStep(ctx: EffectContext, step: EffectStep): RuntimeEvent {
    // Hand and Discard costs run their own `then` once paid; next-reveal targets carry it on the waiting trigger.
    if (step.then?.length && step.action !== "discardCards" && step.action !== "trashCards" && !(step.target?.type === "card" && step.target.relation === "next")) {
      const { then, ...head } = step;
      return this.resolveChained(ctx, then, () => this.dispatchStep(ctx, head));
    }
    if (step.optional && !OPTIONAL_INSIDE.has(step.action) && !(step.target?.type === "card" && !DECK_ENDS.includes(step.target.where) && (step.pick?.mode ?? "choose") === "choose")) {
      const { optional: _optional, ...required } = step;
      const label = describeStep(required, ctx.scope, this.config.content?.cards ?? EVALUATION_ALL_CARDS, this.mods).replace(/\.$/, "");
      return this.requestChoice(ctx.source, `${ctx.source.card.name}: ${label}?`, [
        { id: "resolve", label: "Resolve", resolve: () => this.resolveStep(ctx, required) },
        { id: "skip", label: "Skip", resolve: () => this.event("choice", `${ctx.source.card.name}: optional ${ACTIONS[step.action].label.toLowerCase()} skipped.`, this.base(ctx)) },
      ]);
    }
    switch (step.action) {
      case "draw": case "gainActions": case "gainCrypto": case "payCrypto": case "gainVP":
        return this.forEachRecipient(ctx, step, false, (acting, recipient) => this.playerStep(acting, step, recipient));
      case "damageServer": case "repairServer": case "destroyServer": {
        const target = step.target?.type === "server" ? step.target : { who: "opponent" as Who, server: "auto" as ServerSlot };
        return this.forEachRecipient(ctx, step, step.action !== "repairServer", (acting, recipient) =>
          step.action === "destroyServer" ? this.destroyServer(acting, target.server, recipient) : this.serverStep(acting, step.action === "damageServer" ? "drain" : "restore", step.amount ?? 0, target.server, recipient));
      }
      case "gainCard": return this.forEachRecipient(ctx, step, false, (acting, recipient) => this.gainCards(acting, step, recipient));
      case "mill": return this.forEachRecipient(ctx, step, true, (acting, recipient) => this.millStep(acting, step, recipient));
      case "scry": return this.forEachRecipient(ctx, step, false, (acting, recipient) => this.resolveScry(acting.source, step.amount ?? 0, recipient));
      case "stealCrypto": return this.forEachRecipient(ctx, step, true, (acting, recipient) => this.stealCrypto(acting, step, recipient));
      case "bump": return this.forEachRecipient(ctx, step, true, (acting, recipient) => this.bumpStep(acting, step, recipient));
      case "discardCards": case "trashCards": return this.forEachRecipient(ctx, step, false, (acting, recipient) => this.resolveHandSelection(acting, step, recipient));
      case "recover": return this.forEachRecipient(ctx, step, false, (acting, recipient) => this.recoverStep(acting, step, recipient));
      case "moveCard": case "changePower": case "healCard": case "restoreCard": case "destroyCard": case "trashCard": case "attachModifier": case "removeModifier":
        return this.resolveCardStep(ctx, step);
      case "transferPower": return this.transferPower(ctx, step);
      case "morph": return this.resolveMorph(ctx.source, step);
      case "random": {
        const branches = step.options ?? [];
        if (!branches.length) throw new Error("Random effect requires explicit branches.");
        const selected = branches[Math.floor(this.config.random() * branches.length)];
        this.queue.unshift(...selected.effects.map(next => () => this.resolveStep(ctx, next)));
        return this.event("choice", `${ctx.source.card.name}: random result ${selected.label}.`, { owner: ctx.source.owner, source: "card", sourceName: ctx.source.card.name });
      }
      case "choice": return this.resolveChoiceStep(ctx, step);
    }
  }

  /* ---------------------------------------------------------------- players and Servers */

  private playerStep(ctx: EffectContext, step: EffectStep, recipient: PlayerId): RuntimeEvent {
    const { card } = ctx.source, amount = step.amount ?? 0;
    const credited = this.state.players[recipient];
    const base = { ...this.base(ctx), amount, targetOwner: recipient };
    switch (step.action) {
      case "draw": {
        const before = credited.hand.length;
        Object.assign(credited, drawCards(credited, amount, this.config.random));
        return this.event("draw", `${card.name}: draw ${credited.hand.length - before}.`, { ...base, amount: credited.hand.length - before, before, after: credited.hand.length, target: "hand" });
      }
      case "gainActions": {
        if (ctx.immediateActions) {
          const before = credited.actions;
          credited.actions += amount;
          return this.event("actions", `${card.name}: +${amount} Actions this Runtime turn.`, { ...base, target: "actions", before, after: credited.actions });
        }
        const before = credited.pendingActions;
        credited.pendingActions += amount;
        return this.event("actions", `${card.name}: +${amount} Action${amount === 1 ? "" : "s"} next Runtime turn.`, { ...base, before, after: credited.pendingActions, target: "actions" });
      }
      case "gainCrypto": {
        const before = credited.wallet;
        credited.wallet += amount;
        return this.event("crypto", `${card.name}: +${amount} Crypto for Draft.`, { ...base, before, after: credited.wallet, target: "wallet" });
      }
      case "payCrypto": {
        const before = credited.wallet;
        if (before < amount) return this.event("crypto", `${card.name}: cannot pay ${amount} Crypto.`, { ...base, amount: 0, before, after: before, target: "wallet" });
        credited.wallet -= amount;
        return this.event("crypto", `${card.name}: pay ${amount} Crypto.`, { ...base, before, after: credited.wallet, target: "wallet" });
      }
      default: {
        this.refreshScores();
        const before = credited.totalVP;
        credited.rewardVP += amount;
        const source = card.id.startsWith("location:") ? "location" : card.id.startsWith("circuit:") ? "circuit" : null;
        if (source) this.rewardSources[recipient][source] += amount;
        this.refreshScores();
        return this.event("vp", `${card.name}: ${amount < 0 ? "" : "+"}${amount} VP.`, { ...base, target: "vp", before, after: credited.totalVP });
      }
    }
  }

  private applyTargetedServerEffect(servers: Servers, kind: "drain" | "restore", amount: number, target?: "primary" | "backup") {
    const serverVP = this.config.serverVP ?? defaultServerVP;
    if (!target) return applyServerEffect(servers, kind, amount, serverVP);
    const before = servers[target];
    const after = before === 0 ? 0 : kind === "drain" ? Math.max(0, before - amount) : Math.min(serverMaximums[target], before + amount);
    return {
      servers: { ...servers, [target]: after },
      target,
      amount: Math.abs(after - before),
      destructionVP: kind === "drain" && before > 0 && after === 0 ? serverVP[target] : 0,
    };
  }

  /** Damage or repair; destroying an enemy Server credits the acting player with destruction VP. */
  private serverStep(ctx: EffectContext, kind: "drain" | "restore", amount: number, slot: ServerSlot, targetOwner: PlayerId): RuntimeEvent {
    if (slot === "both") return this.runSteps([() => this.serverStep(ctx, kind, amount, "primary", targetOwner), () => this.serverStep(ctx, kind, amount, "backup", targetOwner)]);
    const { card, owner } = ctx.source;
    const targetPlayer = this.state.players[targetOwner];
    const result = this.applyTargetedServerEffect(targetPlayer.servers, kind, amount, slot === "auto" ? undefined : slot);
    const before = result.target ? targetPlayer.servers[result.target] : 0;
    targetPlayer.servers = result.servers;
    const destructionVP = targetOwner === owner ? 0 : result.destructionVP;
    this.state.players[owner].destructionVP += destructionVP;
    const output = this.event(kind, result.target ? `${card.name}: ${kind === "drain" ? "Drain" : "Restore"} ${result.amount} at ${result.target} Server.${destructionVP ? ` +${destructionVP} destruction VP.` : ""}` : `${card.name}: No target.`, { ...this.base(ctx), amount: result.amount, before, after: result.target ? result.servers[result.target] : 0, targetOwner, ...(result.target ? { target: result.target } : {}) });
    if (kind === "drain" && this.state.phase !== "collapse" && targetPlayer.servers.primary === 0 && targetPlayer.servers.backup === 0) {
      this.queue = [() => this.gameOver(targetOwner === owner ? "Both Servers destroyed by own effect." : "Both Servers destroyed.")];
    }
    return output;
  }

  private destroyServer(ctx: EffectContext, slot: ServerSlot, targetOwner: PlayerId): RuntimeEvent {
    if (slot === "both" || slot === "auto") return this.runSteps((slot === "both" ? ["primary", "backup"] as const : ["backup"] as const).map(server => () => this.destroyServer(ctx, server, targetOwner)));
    const { card, owner } = ctx.source;
    const player = this.state.players[targetOwner], before = player.servers[slot];
    player.servers[slot] = 0;
    if (player.servers.primary === 0 && player.servers.backup === 0 && this.state.phase !== "collapse") this.queue = [() => this.gameOver(targetOwner === owner ? "Both Servers destroyed by own effect." : "Both Servers destroyed.")];
    return this.event("drain", `${card.name}: destroy ${targetOwner === owner ? `${this.whose(owner)} own` : this.whose(targetOwner, owner, "opponent")} ${slot === "backup" ? "Backup" : "Primary"}; no destruction VP.`, { owner, targetOwner, target: slot, amount: before, before, after: 0, source: "card", sourceName: card.name, cardId: card.id });
  }

  /* ---------------------------------------------------------------- zones */

  private gainCards(ctx: EffectContext, step: EffectStep, targetOwner: PlayerId): RuntimeEvent {
    const amount = step.amount ?? 1;
    if (!Number.isInteger(amount) || amount < 0 || amount > 100) throw new Error("Gain count must be an integer from 0 to 100.");
    const definition = (this.config.content?.cards ?? EVALUATION_ALL_CARDS).find(card => (card.definitionId ?? card.id) === step.cardId || card.id === step.cardId);
    if (!definition) throw new Error(`Gain definition unavailable: ${step.cardId}`);
    const zone = step.target?.type === "zone" ? step.target.zone : "deck";
    const player = this.state.players[targetOwner];
    const before = player.hand.length;
    const cards = Array.from({ length: amount }, () => ({ ...structuredClone(definition), id: `${targetOwner}:generated-${++this.acquired}` }));
    if (zone === "hand") player.hand.push(...cards);
    else if (zone === "discard") player.discard.push(...cards);
    else player.draw.unshift(...cards);
    this.refreshScores();
    const destination = zone === "hand" ? "hand" : zone === "discard" ? "Discard" : "the top of the deck";
    return this.event("draw", `${ctx.source.card.name}: gain ${amount} ${definition.name} to ${destination}.`, { owner: ctx.source.owner, cardId: cards[0]?.id, definitionId: definition.definitionId, source: "card", sourceName: ctx.source.card.name, amount, targetOwner, ...(zone === "hand" ? { target: "hand" as const, before, after: player.hand.length } : zone === "discard" ? { target: "discard" as const } : {}) });
  }

  private millStep(ctx: EffectContext, step: EffectStep, targetOwner: PlayerId): RuntimeEvent {
    const toTrash = step.destination === "trash";
    const milled = this.millCards(targetOwner, step.amount ?? 0, toTrash);
    const target = toTrash ? "trash" as const : "discard" as const;
    if (!milled) return this.noTarget(ctx, step, { target, targetOwner });
    return this.event("trash", `${ctx.source.card.name}: mill ${milled} from ${this.whose(targetOwner, 0, "opponent")} deck${toTrash ? " to shared Trash" : ""}.`, { ...this.base(ctx), target, targetOwner, amount: milled });
  }

  private millCards(owner: PlayerId, count: number, toTrash = false) {
    const player = this.state.players[owner];
    let moved = 0;
    for (let index = 0; index < count; index++) {
      if (!player.draw.length) {
        if (!player.discard.length) break;
        player.draw = shuffleCards(player.discard, this.config.random);
        player.discard = [];
      }
      const card = player.draw.shift();
      if (!card) break;
      if (toTrash) this.state.trash.push(card); else player.discard.push(card);
      moved++;
    }
    if (toTrash && moved) this.recalculate();
    return moved;
  }

  /** The Crypto "wallet" is the Crypto cards held in hand; only those can be offered or taken. */
  private stealCrypto(ctx: EffectContext, step: EffectStep, victim: PlayerId): RuntimeEvent {
    const { card, owner } = ctx.source;
    const base = this.base(ctx);
    const hand = this.state.players[victim].hand;
    const holdings = hand.filter(item => item.type === "Crypto");
    if (!holdings.length) return this.noTarget(ctx, step, { target: "hand", targetOwner: victim });
    const count = Math.min(Math.max(1, step.amount ?? 1), holdings.length);
    const steal = (ids: readonly string[]) => {
      const taken = ids.flatMap(id => { const index = hand.findIndex(item => item.id === id); return index >= 0 ? hand.splice(index, 1) : []; });
      if (!taken.length) return this.noTarget(ctx, step, { target: "hand", targetOwner: victim });
      this.state.players[owner].hand.push(...taken);
      this.refreshScores();
      return this.event("crypto", `${card.name} steals ${taken.map(item => item.name).join(", ")} from ${this.whose(victim, 0, "opponent")} wallet.`, { ...base, target: "hand", targetOwner: owner, amount: taken.length });
    };
    if (step.pick?.mode !== "choose") {
      const pool = [...holdings];
      return steal(Array.from({ length: count }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0].id));
    }
    const chooser = step.pick.chooser === "opponent" ? victim : owner;
    const cards = count === 1 ? "a Crypto card" : `${count} Crypto cards`;
    return this.openChoice({ ...ctx.source, owner: chooser }, {
      prompt: chooser === owner ? `${card.name}: choose ${cards} to steal from ${this.whose(victim, chooser)} wallet.` : `${card.name}: choose ${cards} from your wallet to give to ${this.config.seatNames ? this.subject(owner) : "the opponent"}.`,
      options: holdings.map(item => ({ id: item.id, label: item.name, card: structuredClone(item) })),
      select: { min: count, max: count }, verb: "Steal",
      resolve: ids => steal(ids),
    });
  }

  private bumpStep(ctx: EffectContext, step: EffectStep, victim: PlayerId): RuntimeEvent {
    const { card } = ctx.source;
    const base = this.base(ctx);
    const player = this.state.players[victim];
    const zone = step.target?.type === "zone" ? step.target.zone : "bankOrWallet";
    const zoneLabel = zone === "bank" ? "Effect Bank" : zone === "wallet" ? "Crypto wallet" : "Effect Bank or Crypto wallet";
    const chooser = step.pick?.chooser === "opponent" ? victim : ctx.source.owner;
    const whose = this.whose(victim, chooser);
    const candidates = [
      ...(zone !== "wallet" ? player.bank.map(entry => ({ card: entry.card, from: "Effect Bank" })) : []),
      ...(zone !== "bank" ? player.hand.filter(item => item.type === "Crypto").map(item => ({ card: item, from: "Crypto wallet" })) : []),
    ];
    if (!candidates.length) return this.noTarget(ctx, step, { target: "discard", targetOwner: victim });
    const count = Math.min(Math.max(1, step.amount ?? 1), candidates.length);
    const bump = (ids: readonly string[]) => {
      const bumped: { name: string; from: string }[] = [];
      for (const id of ids) {
        const bankIndex = player.bank.findIndex(entry => entry.card.id === id);
        const handIndex = player.hand.findIndex(item => item.id === id);
        const removed = bankIndex >= 0 ? player.bank.splice(bankIndex, 1)[0].card : handIndex >= 0 ? player.hand.splice(handIndex, 1)[0] : null;
        if (!removed) continue;
        this.stripModifiers(removed);
        this.retire(removed, victim, "discard");
        bumped.push({ name: removed.name, from: bankIndex >= 0 ? "Effect Bank" : "Crypto wallet" });
      }
      this.recalculate(); this.refreshScores();
      if (!bumped.length) return this.noTarget(ctx, step, { target: "discard", targetOwner: victim });
      return this.event("trash", `${card.name} bumps ${bumped.map(entry => `${entry.name} from ${whose} ${entry.from}`).join(", ")} to Discard.`, { ...base, target: "discard", targetOwner: victim, amount: bumped.length });
    };
    if (step.pick?.mode === "random") {
      const pool = [...candidates];
      return bump(Array.from({ length: count }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0].card.id));
    }
    return this.openChoice({ ...ctx.source, owner: chooser }, {
      prompt: `${card.name}: choose ${count === 1 ? "a card" : `${count} cards`} to bump from ${whose} ${zoneLabel} to Discard.`,
      options: candidates.map(entry => ({ id: entry.card.id, label: `${entry.card.name} · ${entry.from}`, card: structuredClone(entry.card) })),
      select: { min: count, max: count }, verb: "Bump",
      resolve: ids => bump(ids),
    });
  }

  /** Cards back from the shared Trash or the recipient's destroyed pile. */
  private recoverStep(ctx: EffectContext, step: EffectStep, recipient: PlayerId): RuntimeEvent {
    const { card } = ctx.source;
    const fromDestroyed = step.target?.type === "card" && step.target.where === "destroyed";
    const pile = fromDestroyed ? this.state.players[recipient].destroyed : this.state.trash;
    const filter = step.target?.type === "card" ? step.target.filter : undefined;
    const candidates = pile.filter(item => matchesFilter(item, filter));
    const destination = step.destination ?? "discard";
    if (!candidates.length) return this.noTarget(ctx, step, { target: "trash" });
    const count = Math.min(Math.max(1, step.amount ?? 1), candidates.length);
    const whose = this.whose(recipient, 0, "opponent");
    const placeName = destination === "hand" ? "hand" : destination === "top" ? "deck" : "Discard";
    const recover = (ids: readonly string[]) => {
      const names: string[] = [];
      for (const id of ids) {
        const index = pile.findIndex(item => item.id === id);
        if (index < 0) throw new Error(`Card is no longer in ${fromDestroyed ? "the destroyed pile" : "shared Trash"}.`);
        const [taken] = pile.splice(index, 1);
        const player = this.state.players[recipient];
        if (destination === "hand") player.hand.push(taken); else if (destination === "top") player.draw.unshift(taken); else player.discard.push(taken);
        names.push(taken.name);
      }
      this.recalculate(); this.refreshScores();
      return this.event("trash", `${card.name} recovers ${names.join(", ")} to ${whose} ${placeName}.`, { ...this.base(ctx), target: destination === "hand" ? "hand" : "discard", targetOwner: recipient, amount: names.length });
    };
    if (step.pick?.mode === "random") {
      const pool = [...candidates];
      return recover(Array.from({ length: count }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0].id));
    }
    const source = fromDestroyed ? "your destroyed pile" : "shared Trash";
    const prompt = count === 1 ? `Recover one card from ${source} to your ${placeName}.` : `Recover ${count} cards from ${source} to your ${placeName}.`;
    if (count === 1) return this.requestChoice(ctx.source, prompt, candidates.map(target => ({ id: target.id, label: target.name, card: this.shownCard(target), resolve: () => recover([target.id]) })), undefined, fromDestroyed ? undefined : "trash", "Recover");
    return this.openChoice(ctx.source, {
      prompt, options: candidates.map(target => ({ id: target.id, label: target.name, card: this.shownCard(target) })),
      select: { min: count, max: count }, verb: "Recover", ...(fromDestroyed ? {} : { zone: "trash" as const }), resolve: recover,
    });
  }

  /** Discard or trash from hand (or trash from Discard). With `min` and `then` it works as a cost. */
  private resolveHandSelection(ctx: EffectContext, step: EffectStep, victim: PlayerId): RuntimeEvent {
    const placement = ctx.source, owner = placement.owner;
    const chooser = (step.pick?.chooser === "opponent" ? 1 - owner : owner) as PlayerId;
    const player = this.state.players[victim];
    const trash = step.action === "trashCards";
    const where = step.target?.type === "card" ? step.target.where : "hand";
    const fromDiscard = where === "discard", fromDeck = where === "deck";
    const zone = fromDiscard ? player.discard : fromDeck ? player.draw : player.hand;
    const filter = step.target?.type === "card" ? step.target.filter : undefined;
    const maximum = step.amount ?? 1;
    const verb = trash ? "trash" : "discard";
    if (step.optional && step.then?.length) {
      const options = [{ id: "decline", label: "Decline", resolve: () => this.event("choice", `${placement.card.name}: optional payment declined.`, { owner }) }];
      if (zone.filter(card => matchesFilter(card, filter)).length >= maximum) options.push({ id: "pay", label: `${trash ? "Trash" : "Discard"} ${maximum} cards`, resolve: () => this.resolveHandSelection(ctx, { ...step, optional: false, min: maximum }, victim) });
      return this.requestChoice({ ...placement, owner: chooser }, `${placement.card.name}: pay the optional ${verb} cost?`, options, "discard", undefined, trash ? "Trash" : "Discard");
    }
    const minimum = step.min ?? (step.optional ? 0 : maximum);
    const finish = (selected: number) => {
      if (selected >= minimum) this.queue.unshift(...(step.then ?? []).map(next => () => this.resolveStep(ctx, next)));
      return this.event("choice", `${placement.card.name}: selection complete (${selected}).`, { owner, source: "card", sourceName: placement.card.name });
    };
    const eligible = zone.filter(card => matchesFilter(card, filter));
    if (!eligible.length) return finish(0);
    const remove = (id: string) => (): RuntimeEvent => {
      const index = zone.findIndex(item => item.id === id);
      if (index < 0) throw new Error(`Selected card is no longer in ${fromDiscard ? "Discard" : fromDeck ? "the deck" : "hand"}.`);
      const [removed] = zone.splice(index, 1);
      if (trash) this.state.trash.push(removed); else player.discard.push(removed);
      this.recalculate();
      this.refreshScores();
      return this.event("trash", `${placement.card.name}: ${removed.name} enters ${trash ? "shared Trash" : "Discard"}.`, { owner, cardId: placement.card.id, source: "card", sourceName: placement.card.name, targetOwner: victim, target: trash ? "trash" : "discard", amount: 1 });
    };
    // A hand smaller than the minimum is emptied, but the chained effects still require the full minimum.
    const max = Math.min(maximum, eligible.length), min = Math.min(minimum, max);
    if (step.pick?.mode === "random") {
      const pool = [...eligible];
      const ids = Array.from({ length: max }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0].id);
      return this.runSteps([...ids.map(remove), () => finish(ids.length)]);
    }
    const count = min === max ? `${max}` : min ? `${min}–${max}` : `up to ${max}`;
    return this.openChoice({ ...placement, owner: chooser }, {
      prompt: `${placement.card.name}: select ${count} card${max === 1 ? "" : "s"} to ${verb}${fromDiscard ? " from Discard" : ""}.`,
      options: eligible.map(card => ({ id: card.id, label: card.name, card: this.shownCard(card) })),
      select: { min, max }, verb: trash ? "Trash" : "Discard",
      icon: step.action === "discardCards" ? "discard" : undefined,
      resolve: ids => this.runSteps([...ids.map(remove), () => finish(ids.length)]),
      aiPick: () => {
        const context = this.strategyContext(victim);
        const value = (card: Card) => keepValue(card, this.strategyOf(chooser), context, trash);
        const ranked = [...eligible].sort((a, b) => value(a) - value(b));
        if (victim !== chooser) return ranked.reverse().slice(0, max).map(card => card.id);
        // Thinning: trash every junk card the effect allows, but never discard more than required.
        const junk = trash ? ranked.filter(card => value(card) < AI_JUNK_VALUE).length : 0;
        return ranked.slice(0, Math.min(max, Math.max(min, junk))).map(card => card.id);
      },
    });
  }

  private resolveScry(placement: Deployment, amount: number, viewer: PlayerId): RuntimeEvent {
    const player = this.state.players[viewer];
    const cards = player.draw.slice(0, amount);
    if (!cards.length) return this.event("choice", `${placement.card.name}: No target.`, { owner: placement.owner, amount: 0 });
    const actions = new Map<string, { card: Card; action: "keep" | "discard" | "trash" }>();
    const options = cards.flatMap(card => (["keep", "discard", "trash"] as const).map(action => {
      const id = `${action}:${card.id}`;
      actions.set(id, { card, action });
      return { id, label: action[0].toUpperCase() + action.slice(1), group: card.id };
    }));
    const apply = ({ card, action }: { card: Card; action: "discard" | "trash" }) => (): RuntimeEvent => {
      player.draw = player.draw.filter(item => item.id !== card.id);
      if (action === "discard") player.discard.push(card); else { this.state.trash.push(card); this.recalculate(); }
      return this.event("trash", `${placement.card.name}: ${action} ${card.name}.`, { owner: placement.owner, targetOwner: viewer, target: action, amount: 1 });
    };
    return this.openChoice(placement, {
      prompt: `${placement.card.name}: inspect ${cards.length === 1 ? cards[0].name : `the top ${cards.length} cards`}. Choose keep, discard, or trash for each.`,
      groups: cards.map(card => ({ id: card.id, label: card.name, card: this.shownCard(card) })),
      options,
      aiPick: () => {
        const context = this.strategyContext(viewer);
        return cards.map(card => {
          const value = keepValue(card, this.strategyOf(placement.owner), context, true);
          const action = viewer === placement.owner
            ? value < AI_JUNK_VALUE ? "trash" : value < AI_JUNK_VALUE * 2 ? "discard" : "keep"
            : value >= AI_JUNK_VALUE * 3 ? "trash" : value >= AI_JUNK_VALUE * 2 ? "discard" : "keep";
          return `${action}:${card.id}`;
        });
      },
      resolve: ids => {
        const removals = ids.map(id => actions.get(id)!).filter((entry): entry is { card: Card; action: "discard" | "trash" } => entry.action !== "keep");
        return this.runSteps([...removals.map(apply), () => this.event("choice", `${placement.card.name}: deck inspection complete.`, { owner: placement.owner })]);
      },
    });
  }

  /* ---------------------------------------------------------------- cards */

  private isCardTargetLegal(step: EffectStep, target: Deployment): boolean {
    if (!target.revealed || this.collapseResolvedNodes.has(target.node)) return false;
    if (!this.state.nodes[target.node]?.cards[target.owner].includes(target)) return false;
    if (step.target?.type === "card" && !matchesFilter(target.card, step.target.filter)) return false;
    if (step.action === "moveCard") return this.moveDestinations(target).length > 0;
    if (step.action === "attachModifier") return isCharacterCard(target.card);
    if (step.action === "removeModifier") return this.matchingMods(target.card, step.modifier).length > 0;
    if (step.action === "healCard") return (target.card.powerDelta ?? 0) < 0;
    if (step.action === "restoreCard") return (target.card.powerDelta ?? 0) !== 0;
    return true;
  }

  /** Previously / next revealed card relative to the resolving card (by play order). */
  private relatedPlayedCard(source: Deployment, owners: readonly PlayerId[], relation: "previous" | "next"): Deployment | null {
    const ordered = owners.flatMap(owner => this.state.nodes.flatMap(node => node.cards[owner]))
      .filter(placement => placement.revealed && !this.collapseResolvedNodes.has(placement.node))
      .sort((a, b) => a.order - b.order);
    const index = ordered.findIndex(placement => placement.card.id === source.card.id);
    if (index >= 0) return (relation === "previous" ? ordered[index - 1] : ordered[index + 1]) ?? null;
    // Resolving from bank/location without being in the lane: previous = most recent, next = earliest.
    if (!ordered.length) return null;
    return relation === "previous" ? ordered[ordered.length - 1] : ordered[0];
  }

  private resolveCardStep(ctx: EffectContext, step: EffectStep): RuntimeEvent {
    const target = step.target?.type === "card" ? step.target : { type: "card" as const, who: "self" as Who, where: "board" as CardWhere };
    const { card } = ctx.source;
    if (target.relation === "self") {
      if (step.action === "trashCard") return this.trashSelf(ctx);
      const self = this.state.nodes[ctx.source.node]?.cards[ctx.source.owner].includes(ctx.source) ? ctx.source : null;
      if (step.action === "moveCard") {
        const targets = self ? this.moveDestinations(self) : [];
        return this.requestChoice(ctx.source, `Move ${card.name} to another open Node.`, targets.map(node => ({ id: `node-${node}`, label: `Node ${node + 1}`, node, resolve: () => this.movePlacement(ctx.source, node, ctx.source) })));
      }
      return self && this.isCardTargetLegal(step, self) ? this.applyCardStep(ctx, step, self, true) : this.noTarget(ctx, step);
    }
    const owners = this.whoPlayers(ctx, target.who, true);
    if (!owners.length) return this.noTarget(ctx, step);
    if (target.relation) {
      if (target.relation === "next") return this.awaitNextReveal(ctx, step, owners);
      const related = this.relatedPlayedCard(ctx.source, owners, "previous");
      if (!related || !this.isCardTargetLegal(step, related)) return this.noTarget(ctx, step, { targetOwner: owners.length === 1 ? owners[0] : undefined });
      return this.applyCardStep(ctx, step, related, true);
    }
    const mode = step.pick?.mode ?? "choose";
    const groups: PlayerId[][] = target.who === "both" && mode !== "all" ? owners.map(owner => [owner]) : [owners];
    if (target.where === "board" || target.where === "thisNode") {
      if (ctx.scope === "circuit") return this.noTarget(ctx, step);
      const node = target.where === "thisNode" ? ctx.node ?? ctx.source.node : null;
      if (node !== null && node < 0) return this.noTarget(ctx, step);
      if (ctx.scope !== "card" && node !== null && mode !== "choose" && mode !== "random" && (step.action === "trashCard" || step.action === "destroyCard")) return this.removeRankedAtNode(ctx, step, node, groups);
      if (ctx.scope !== "card" && node !== null && mode === "all" && step.action === "changePower") return this.boostAtNode(ctx, step, node, owners);
      const candidates = (group: PlayerId[]) => group.flatMap(owner => this.state.nodes.flatMap((state, index) => node === null || index === node ? state.cards[owner] : [])).filter(placement => this.isCardTargetLegal(step, placement));
      const actionable = groups.filter(group => candidates(group).length);
      if (!actionable.length) return this.noTarget(ctx, step, { targetOwner: owners.length === 1 ? owners[0] : undefined });
      return this.runSteps(actionable.map(group => () => this.pickBoardCards(ctx, step, candidates(group))));
    }
    if (target.where === "collection") return this.forEachRecipient(ctx, step, false, (acting, recipient) => this.resolveCollectionStep(acting, step, recipient));
    const where = target.where;
    const candidates = (group: PlayerId[]): ZoneCard[] => group.flatMap(owner => this.zoneCards(owner, where).filter(card => this.isZoneTargetLegal(step, card)).map(card => ({ card, owner })));
    if (DECK_ENDS.includes(where)) {
      const count = ACTIONS[step.action].pickCount ? Math.max(1, step.pick?.count ?? 1) : 1;
      const picks = owners.flatMap(owner => candidates([owner]).slice(0, count));
      return picks.length ? this.applyZoneCards(ctx, step, picks) : this.noTarget(ctx, step, { targetOwner: owners.length === 1 ? owners[0] : undefined });
    }
    const actionable = groups.filter(group => candidates(group).length);
    if (!actionable.length) return this.noTarget(ctx, step, { targetOwner: owners.length === 1 ? owners[0] : undefined });
    return this.runSteps(actionable.map(group => () => this.pickZoneCards(ctx, step, where, candidates(group))));
  }

  /** A player's cards in a zone, in order: hand order, Effect Bank order, deck from the top (or the bottom). */
  private zoneCards(owner: PlayerId, where: CardWhere): Card[] {
    const player = this.state.players[owner];
    switch (where) {
      case "hand": return [...player.hand];
      case "wallet": return player.hand.filter(card => card.type === "Crypto");
      case "bank": return player.bank.map(entry => entry.card);
      case "deck": case "deckTop": return [...player.draw];
      case "deckBottom": return [...player.draw].reverse();
      case "discard": return [...player.discard];
      default: return [];
    }
  }

  private isZoneTargetLegal(step: EffectStep, card: Card): boolean {
    if (step.target?.type === "card" && !matchesFilter(card, step.target.filter)) return false;
    switch (step.action) {
      case "changePower": return card.type !== "Crypto" && (card.power !== undefined || !!card.powerSource || !!card.powerDelta);
      case "healCard": return (card.powerDelta ?? 0) < 0;
      case "restoreCard": return (card.powerDelta ?? 0) !== 0;
      case "attachModifier": return isCharacterCard(card);
      case "removeModifier": return this.matchingMods(card, step.modifier).length > 0;
      default: return true;
    }
  }

  /** The AI's picks when it chooses cards for an effect: harm the other side's strongest cards, help its own. */
  private aiCardPicks(step: EffectStep, chooser: PlayerId, entries: readonly { id: string; owner: PlayerId; power: number }[], count: number): string[] | undefined {
    const helpful = step.action === "healCard" || step.action === "restoreCard" || (step.action === "changePower" && (step.amount ?? 0) > 0);
    const harmful = step.action === "destroyCard" || step.action === "trashCard" || (step.action === "changePower" && (step.amount ?? 0) < 0);
    if (!helpful && !harmful) return undefined;
    const good = (entry: { owner: PlayerId }) => (entry.owner === chooser) === helpful;
    return [...entries].sort((a, b) => Number(good(b)) - Number(good(a)) || (good(a) ? b.power - a.power : a.power - b.power)).slice(0, count).map(entry => entry.id);
  }

  /** Picks among off-board candidates by the step's pick rule, then applies the step to each pick. */
  private pickZoneCards(ctx: EffectContext, step: EffectStep, where: CardWhere, candidates: ZoneCard[]): RuntimeEvent {
    const mode = step.pick?.mode ?? "choose";
    const count = Math.min(Math.max(1, step.pick?.count ?? 1), candidates.length);
    const apply = (picks: ZoneCard[]) => this.applyZoneCards(ctx, step, picks);
    if (mode === "all") return apply(candidates);
    if (mode === "random") {
      const pool = [...candidates];
      return apply(Array.from({ length: count }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0]));
    }
    if (mode === "first") return apply(candidates.slice(0, count));
    if (mode === "weakest" || mode === "strongest") return apply([...candidates].sort((a, b) => mode === "weakest" ? this.livePower(a.card) - this.livePower(b.card) : this.livePower(b.card) - this.livePower(a.card)).slice(0, count));
    const { card } = ctx.source;
    const chooser = this.chooserFor(ctx, step.pick?.chooser);
    const mixed = new Set(candidates.map(entry => entry.owner)).size > 1;
    const whose = mixed ? "either player's" : candidates[0].owner === chooser ? "your" : "the opponent's";
    const id = (entry: ZoneCard) => `card-${entry.card.id}`;
    const options = candidates.map(entry => ({ id: id(entry), label: `${entry.card.name}${mixed ? ` · ${entry.owner === chooser ? "yours" : "opponent's"}` : ""}`, card: this.shownCard(entry.card) }));
    return this.openChoice({ ...ctx.source, owner: chooser }, {
      prompt: `${card.name}: choose ${count === 1 ? "a card" : `${count} cards`} in ${whose} ${ZONE_PLACE_TEXT[where] ?? "cards"} to ${CARD_VERBS[step.action] ?? "affect"}.`,
      options, verb: CHOICE_VERBS[step.action],
      ...(count > 1 || step.optional ? { select: { min: step.optional ? 0 : count, max: count } } : {}),
      aiPick: () => this.aiCardPicks(step, chooser, candidates.map(entry => ({ id: id(entry), owner: entry.owner, power: this.livePower(entry.card) })), count) ?? this.randomSelection({ options, ...(count > 1 ? { select: { min: count, max: count } } : {}) }),
      resolve: ids => ids.length ? apply(candidates.filter(entry => ids.includes(id(entry)))) : this.event("choice", `${card.name}: optional ${CARD_VERBS[step.action] ?? "effect"} skipped.`, this.base(ctx)),
    });
  }

  private applyZoneCards(ctx: EffectContext, step: EffectStep, picks: readonly ZoneCard[]): RuntimeEvent {
    return this.runSteps(picks.map(({ card, owner }) => () => this.applyZoneCard(ctx, step, card, owner)));
  }

  /** Takes a card out of whichever of its owner's zones holds it; returns that zone's name. */
  private takeFromZone(owner: PlayerId, card: Card): string | null {
    const player = this.state.players[owner];
    for (const [zone, name] of [[player.hand, card.type === "Crypto" ? "wallet" : "hand"], [player.draw, "deck"], [player.discard, "Discard"]] as const) {
      const index = zone.indexOf(card);
      if (index >= 0) { zone.splice(index, 1); return name; }
    }
    const banked = player.bank.findIndex(entry => entry.card === card);
    if (banked >= 0) { player.bank.splice(banked, 1); return "Effect Bank"; }
    return null;
  }

  private applyZoneCard(ctx: EffectContext, step: EffectStep, card: Card, owner: PlayerId): RuntimeEvent {
    const source = ctx.source;
    const detail = { ...this.base(ctx), targetCardId: card.id, targetOwner: owner };
    switch (step.action) {
      case "destroyCard": case "trashCard": {
        const zone = step.action === "destroyCard" ? "destroyed" as const : "trash" as const;
        const from = this.takeFromZone(owner, card);
        if (!from) return this.noTarget(ctx, step, { targetOwner: owner });
        this.stripModifiers(card);
        const kept = this.retire(card, owner, zone);
        this.recalculate();
        this.refreshScores();
        const whose = owner === source.owner ? "its owner's" : this.whose(owner);
        return this.event("trash", kept ? `${source.card.name} ${zone === "destroyed" ? "destroys" : "trashes"} ${card.name} from ${whose} ${from}.` : `${source.card.name}: ${card.name} is removed from the game.`, { ...detail, ...(kept && zone === "trash" ? { target: "trash" as const } : {}), amount: 1 });
      }
      case "attachModifier": return this.attachModifier(ctx, step, card);
      case "removeModifier": return this.removeModifiers(ctx, step, card);
      case "healCard": case "restoreCard": {
        const before = this.livePower(card);
        this.healCardPower(card, step.action === "healCard" ? step.amount ?? 1 : undefined);
        const after = this.livePower(card);
        return this.event("power", `${source.card.name}: ${step.action === "healCard" ? "heal" : "restore"} ${card.name} Power ${before} → ${after}.`, { ...detail, amount: after - before, before, after });
      }
      default: {
        if (!Number.isInteger(step.amount)) throw new Error("Card Power modifier must be an integer.");
        const before = this.livePower(card);
        const after = Math.max(cardPowerFloor(card), before + step.amount!);
        setPowerDelta(card, after - this.printedPower(card));
        const steal = ctx.scope === "card" && owner !== source.owner && step.amount! < 0 && this.state.nodes[source.node]?.cards[source.owner].includes(source);
        if (steal) setPowerDelta(source.card, (source.card.powerDelta ?? 0) + (before - after));
        this.recalculate();
        return this.event("power", `${source.card.name}: ${card.name} Power ${before} → ${after}.${steal && before > after ? ` ${source.card.name} steals ${before - after}.` : ""}`, { ...detail, amount: after - before, before, after });
      }
    }
  }

  /** Picks among board candidates by the step's pick rule, then applies the step to each pick. */
  private pickBoardCards(ctx: EffectContext, step: EffectStep, candidates: Deployment[]): RuntimeEvent {
    if (!candidates.length) return this.noTarget(ctx, step);
    const mode = step.pick?.mode ?? "choose";
    const count = Math.min(Math.max(1, step.pick?.count ?? 1), candidates.length);
    const apply = (targets: Deployment[], chosen: boolean) => this.runSteps(targets.map(target => () => this.applyCardStep(ctx, step, target, chosen)));
    if (mode === "all") return apply(candidates, false);
    if (mode === "random") {
      const pool = [...candidates];
      return apply(Array.from({ length: count }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0]), false);
    }
    if (mode !== "choose") return apply(this.rankPlacements(candidates, mode).slice(0, count), false);
    const { card } = ctx.source;
    const chooser = this.chooserFor(ctx, step.pick?.chooser);
    const verb = CARD_VERBS[step.action];
    const whose = ctx.scope === "location" || ctx.scope === "locationPlay" ? "a" : candidates.every(target => target.owner === ctx.source.owner) ? "your" : candidates.every(target => target.owner !== ctx.source.owner) ? "an opponent" : "a";
    const prompt = step.action === "attachModifier" ? `${card.name}: choose a revealed card to attach a modifier.` : `${card.name}: choose ${whose} revealed card${count === 1 ? "" : `s (${count})`} to ${verb}.`;
    const skip = () => this.event("choice", `${card.name}: optional ${step.action === "changePower" ? "Power change" : verb} skipped.`, this.base(ctx));
    const options = candidates.map(target => ({ id: `card-${target.card.id}`, label: `${target.card.name} · Node ${target.node + 1}`, card: this.choiceCard(target) }));
    const strategic = () => this.aiCardPicks(step, chooser, candidates.map((target, index) => ({ id: options[index].id, owner: target.owner, power: this.cardPower(target) })), count);
    if (count === 1) {
      const choices = [...options, ...(step.optional ? [{ id: "skip", label: "Skip" }] : [])];
      return this.openChoice({ ...ctx.source, owner: chooser }, {
        prompt, options: choices, verb: CHOICE_VERBS[step.action],
        aiPick: () => strategic() ?? this.randomSelection({ options: choices }),
        resolve: ([id]) => { const target = candidates.find(entry => `card-${entry.card.id}` === id); return target ? this.applyCardStep(ctx, step, target, true) : skip(); },
      });
    }
    return this.openChoice({ ...ctx.source, owner: chooser }, {
      prompt, options, select: { min: step.optional ? 0 : count, max: count }, verb: CHOICE_VERBS[step.action],
      aiPick: () => strategic() ?? this.randomSelection({ options, select: { min: step.optional ? 0 : count, max: count } }),
      resolve: ids => ids.length ? apply(candidates.filter(target => ids.includes(`card-${target.card.id}`)), true) : skip(),
    });
  }

  private rankPlacements(placements: Deployment[], mode: "weakest" | "strongest" | "first"): Deployment[] {
    const firstRevealed = (a: Deployment, b: Deployment) => (a.revealSequence ?? 0) - (b.revealSequence ?? 0) || a.order - b.order;
    return [...placements].sort((a, b) => mode === "first" ? firstRevealed(a, b)
      : (mode === "strongest" ? this.cardPower(b) - this.cardPower(a) : this.cardPower(a) - this.cardPower(b)) || firstRevealed(a, b));
  }

  private applyCardStep(ctx: EffectContext, step: EffectStep, target: Deployment, chosen: boolean): RuntimeEvent {
    const source = ctx.source;
    switch (step.action) {
      case "moveCard": return chosen ? this.chooseMoveDestination(source, target) : this.movePlacementRandom(source, target, ctx.scope === "card" || ctx.scope === "circuit" ? "card" : "location");
      case "destroyCard": return this.removePlacement(source, target, "destroyed");
      case "trashCard": return this.removePlacement(source, target, "trash");
      case "attachModifier": return this.attachModifier(ctx, step, target.card);
      case "removeModifier": return this.removeModifiers(ctx, step, target.card);
      case "healCard": case "restoreCard": {
        const before = this.cardPower(target, false);
        this.healCardPower(target.card, step.action === "healCard" ? step.amount ?? 1 : undefined);
        this.recalculate();
        const after = this.cardPower(target, false);
        return this.event("power", `${source.card.name}: ${step.action === "healCard" ? "heal" : "restore"} ${target.card.name} Power ${before} → ${after}.`, {
          ...this.base(ctx), targetCardId: target.card.id, targetOwner: target.owner, amount: after - before, before, after, targetNode: target.node,
        });
      }
      default: {
        if (!Number.isInteger(step.amount)) throw new Error("Card Power modifier must be an integer.");
        // Taking Power off an enemy card moves it onto this one rather than deleting it.
        const steal = ctx.scope === "card" && target.owner !== source.owner && step.amount! < 0;
        return this.modifyPlacementPower(source, target, step.amount!, steal);
      }
    }
  }

  /** Mods placed on or stripped from a card found in the deck, then Discard, then hand. */
  private resolveCollectionStep(ctx: EffectContext, step: EffectStep, owner: PlayerId): RuntimeEvent {
    const target = step.target as Extract<Target, { type: "card" }>;
    const player = this.state.players[owner];
    if (step.action === "attachModifier") {
      const host = this.pickModifierHost(owner, step.cardId, step.pick?.mode === "first" || (step.cardId && !step.pick) ? "first" : "random", target.filter);
      return host ? this.attachModifier(ctx, step, host) : this.noTarget(ctx, step, { targetOwner: owner });
    }
    if (step.action !== "removeModifier") return this.noTarget(ctx, step, { targetOwner: owner });
    const carriers = [player.draw, player.discard, player.hand].flat().filter(card => matchesFilter(card, target.filter) && this.matchingMods(card, step.modifier).length);
    if (!carriers.length) return this.noTarget(ctx, step, { targetOwner: owner });
    const mode = step.pick?.mode;
    const hosts = mode === "all" ? carriers : mode === "first" ? [carriers[0]] : [carriers[Math.floor(this.config.random() * carriers.length)]];
    return this.runSteps(hosts.map(host => () => this.removeModifiers(ctx, step, host)));
  }

  /** Location trash/destroy by rank keeps one message for everything it removed. */
  private removeRankedAtNode(ctx: EffectContext, step: EffectStep, node: number, groups: PlayerId[][]): RuntimeEvent {
    const location = this.state.nodes[node].location;
    const name = location?.name ?? ctx.source.card.name;
    const destroy = step.action === "destroyCard";
    const zone = destroy ? "destroyed" as const : "trash" as const;
    const detail = { node, source: "location" as const, sourceName: name, ...(destroy ? {} : { target: "trash" as const }) };
    const mode = (step.pick?.mode ?? "weakest") as "all" | "weakest" | "strongest" | "first";
    const hit: string[] = [], removed: string[] = [];
    for (const group of groups) {
      const revealed = this.revealedOnSides(node, group).filter(placement => this.isCardTargetLegal(step, placement));
      const picked = mode === "all" ? revealed : this.rankPlacements(revealed, mode).slice(0, Math.max(1, step.pick?.count ?? 1));
      for (const target of picked) {
        const lane = this.state.nodes[node].cards[target.owner];
        const index = lane.indexOf(target);
        if (index < 0) continue;
        lane.splice(index, 1);
        this.stripModifiers(target.card);
        (this.retire(target.card, target.owner, zone) ? hit : removed).push(target.card.name);
      }
    }
    this.recalculate();
    this.refreshScores();
    if (!hit.length && !removed.length) return this.event("trash", `${name}: No target.`, { ...detail, amount: 0 });
    const parts = [
      ...(hit.length ? [`${destroy ? "destroy" : "trash"} ${hit.join(", ")}`] : []),
      ...(removed.length ? [`${removed.join(", ")} ${removed.length === 1 ? "is" : "are"} removed from the game`] : []),
    ];
    return this.event("trash", `${name}: ${parts.join("; ")}.`, { ...detail, amount: hit.length + removed.length });
  }

  /** A Location's Power change to every revealed card on its sides. */
  private boostAtNode(ctx: EffectContext, step: EffectStep, node: number, owners: PlayerId[]): RuntimeEvent {
    const name = this.state.nodes[node].location?.name ?? ctx.source.card.name;
    const base = { node, source: "location" as const, sourceName: name };
    const amount = step.amount ?? 1;
    const targets = this.revealedOnSides(node, owners).filter(placement => this.isCardTargetLegal(step, placement));
    if (!targets.length) return this.event("power", `${name}: No target.`, { ...base, amount: 0 });
    for (const target of targets) setPowerDelta(target.card, (target.card.powerDelta ?? 0) + amount);
    this.recalculate();
    return this.event("power", `${name}: ${amount < 0 ? "" : "+"}${amount} Power to ${targets.length} revealed card${targets.length === 1 ? "" : "s"} here.`, { ...base, amount, after: targets.length });
  }

  private trashSelf(ctx: EffectContext): RuntimeEvent {
    const { card, owner, node } = ctx.source;
    const base = this.base(ctx);
    const lane = this.state.nodes[node]?.cards[owner];
    const index = lane?.findIndex(item => item.card.id === card.id) ?? -1;
    const bank = this.state.players[owner].bank;
    const bankIndex = bank.findIndex(item => item.card.id === card.id);
    if (index >= 0) lane!.splice(index, 1);
    else if (bankIndex >= 0) bank.splice(bankIndex, 1);
    else return this.event("trash", `${card.name}: No target.`, { ...base, target: "trash", amount: 0 });
    this.stripModifiers(card);
    const trashed = this.retire(card, owner, "trash");
    this.recalculate(); this.refreshScores();
    return this.event("trash", trashed ? `${card.name} enters shared Trash.` : `${card.name} is removed from the game.`, { ...base, ...(trashed ? { target: "trash" as const } : {}), amount: 1 });
  }

  private awaitNextReveal(ctx: EffectContext, step: EffectStep, owners: PlayerId[]): RuntimeEvent {
    this.nextRevealTriggers.push({ ctx, step, owners });
    const whose = owners.length !== 1 ? "the" : this.whose(owners[0]);
    return this.event("choice", `${ctx.source.card.name}: waiting for ${whose} next revealed card.`, {
      ...this.base(ctx), ...(owners.length === 1 ? { targetOwner: owners[0] } : {}),
    });
  }

  /** Claims the waiting triggers this reveal satisfies; each resolves after the revealed card's own reveal effects. */
  private claimNextRevealTriggers(revealed: Deployment): (() => RuntimeEvent)[] {
    const claimed = this.nextRevealTriggers.filter(trigger => trigger.owners.includes(revealed.owner) && trigger.ctx.source.card.id !== revealed.card.id);
    if (!claimed.length) return [];
    this.nextRevealTriggers = this.nextRevealTriggers.filter(trigger => !claimed.includes(trigger));
    return claimed.map(trigger => () => {
      const { then, ...step } = trigger.step;
      const apply = () => this.isCardTargetLegal(step, revealed)
        ? this.applyCardStep(trigger.ctx, step, revealed, true)
        : this.noTarget(trigger.ctx, step, { targetOwner: revealed.owner });
      return then?.length ? this.resolveChained(trigger.ctx, then, apply) : apply();
    });
  }

  private attachModifier(ctx: EffectContext, step: EffectStep, host: Card): RuntimeEvent {
    const { card } = ctx.source;
    const ref = step.modifier ?? "doublePrintedEffects";
    let modifier: CardModifier;
    if (isBuiltinModifier(ref)) {
      modifier = { id: `mod-${++this.serial}`, kind: ref, ...(ref === "powerAuraAtLocation" ? { amount: step.amount ?? 1 } : {}), sourceName: card.name };
    } else {
      const mod = this.mods.find(entry => entry.id === ref);
      if (!mod) return this.noTarget(ctx, step, { targetOwner: this.cardOwner(host) ?? ctx.source.owner });
      const { id: modId, name, ...hooks } = structuredClone(mod);
      modifier = { id: `mod-${++this.serial}`, kind: "authored", modId, name, badge: modBadge(hooks), ...hooks, sourceName: card.name };
    }
    host.modifiers = [...(host.modifiers ?? []), modifier];
    this.recalculate();
    return this.event("power", `${card.name}: attach ${this.modifierName(modifier)} to ${host.name}.`, { ...this.base(ctx), targetOwner: this.cardOwner(host) ?? ctx.source.owner, amount: modifier.amount ?? 1, targetCardId: host.id });
  }

  private modifierName(modifier: CardModifier): string {
    if (modifier.kind === "authored") return `the “${modifier.name}” mod`;
    if (modifier.kind === "powerAuraAtLocation") return builtinMod(modifier.kind, modifier.amount ?? 1).name;
    const name = builtinMod(modifier.kind).name;
    return name.charAt(0).toLowerCase() + name.slice(1);
  }

  /** The card's mods a Remove step strips: every mod, or each copy of the named one. */
  private matchingMods(card: Card, ref: string | undefined): CardModifier[] {
    return (card.modifiers ?? []).filter(modifier => !ref || (modifier.kind === "authored" ? modifier.modId === ref : modifier.kind === ref));
  }

  private removeModifiers(ctx: EffectContext, step: EffectStep, host: Card): RuntimeEvent {
    const removed = this.matchingMods(host, step.modifier);
    const targetOwner = this.cardOwner(host) ?? ctx.source.owner;
    if (!removed.length) return this.noTarget(ctx, step, { targetOwner });
    const kept = host.modifiers!.filter(modifier => !removed.includes(modifier));
    if (kept.length) host.modifiers = kept; else delete host.modifiers;
    this.recalculate();
    const names = [...new Set(removed.map(modifier => this.modifierName(modifier)))].join(", ");
    return this.event("power", `${ctx.source.card.name}: remove ${names} from ${host.name}.`, { ...this.base(ctx), targetOwner, amount: removed.length, targetCardId: host.id });
  }

  private cardOwner(card: Card): PlayerId | undefined {
    return ([0, 1] as const).find(owner => this.activeCards(owner).includes(card));
  }

  private pickModifierHost(owner: PlayerId, cardId: string | undefined, mode: "first" | "random", filter?: CardFilter): Card | null {
    const player = this.state.players[owner];
    const zones = [player.draw, player.discard, player.hand];
    const matches = (card: Card) => isCharacterCard(card) && matchesFilter(card, filter) && (!cardId || (card.definitionId ?? card.id) === cardId || card.id === cardId);
    for (const zone of zones) {
      const candidates = zone.filter(matches);
      if (!candidates.length) continue;
      if (mode === "first") return candidates[0];
      return candidates[Math.floor(this.config.random() * candidates.length)];
    }
    return null;
  }

  private transferPower(ctx: EffectContext, step: EffectStep): RuntimeEvent {
    const placement = ctx.source, { card, owner, node } = placement;
    const base = this.base(ctx);
    if (!this.state.nodes[node]?.cards[owner].some(item => item.card.id === card.id)) return this.event("power", `${card.name}: No target.`, { ...base, amount: 0 });
    const amount = step.amount ?? 1;
    const direction = step.direction ?? "choice";
    const flow = transferFlow(step);
    const left = node > 0 ? node - 1 : null, right = node < 4 ? node + 1 : null;
    const neighbors = [left, right].filter((value): value is number => value !== null);
    const shares: Record<"left" | "right" | "both", [number, number][]> = {
      left: left === null ? [] : [[left, amount]],
      right: right === null ? [] : [[right, amount]],
      both: neighbors.length === 2 ? [[left!, Math.ceil(amount / 2)], [right!, Math.floor(amount / 2)]] : neighbors.map((neighbor): [number, number] => [neighbor, amount]),
    };
    const sides: ("left" | "right" | "both")[] = direction === "choice" ? ["left", "right"] : direction === "split" ? ["both"] : [direction];
    const modes: ("push" | "pull")[] = flow === "either" ? ["push", "pull"] : [flow];
    // Power moves in full: a Node may go negative for its owner.
    const moves: Record<string, TransferMove[]> = {};
    for (const mode of modes) for (const side of sides) {
      const legs = shares[side].filter(([, share]) => share > 0).map(([neighbor, share]) => mode === "push" ? { from: node, to: neighbor, amount: share } : { from: neighbor, to: node, amount: share });
      if (legs.length) moves[`${mode}-${side}`] = legs;
    }
    const ids = Object.keys(moves);
    if (!ids.length) return this.event("power", `${card.name}: No Power to shift.`, { ...base, amount: 0 });
    const nodeName = (target: number) => this.state.nodes[target].location?.name ?? `Node ${target + 1}`;
    const describe = (id: string) => {
      const legs = moves[id], pushed = id.startsWith("push-");
      const total = legs.reduce((sum, leg) => sum + leg.amount, 0);
      return { legs, pushed, total, others: legs.map(leg => pushed ? leg.to : leg.from) };
    };
    const apply = (id: string) => {
      const { legs, pushed, total, others } = describe(id);
      for (const leg of legs) {
        this.state.nodes[leg.from].powerModifiers[owner] -= leg.amount;
        this.state.nodes[leg.to].powerModifiers[owner] += leg.amount;
      }
      this.recalculate();
      const away = others.map(target => `Node ${target + 1}`).join(" and ");
      return this.event("power", `${card.name}: ${pushed ? `push ${formatAmount(total)} power from Node ${node + 1} to ${away}` : `pull ${formatAmount(total)} power from ${away} to Node ${node + 1}`}.`, { ...base, sourceNode: legs[0].from, targetNode: legs[0].to, amount: total });
    };
    if (ids.length === 1) return apply(ids[0]);
    this.recalculate();
    return this.openChoice(placement, {
      prompt: `${transferText(amount, direction, flow)}.`,
      options: ids.map(id => {
        const { pushed, total, others } = describe(id);
        return { id, label: `${pushed ? "Push" : "Pull"} ${formatAmount(total)} power ${pushed ? "to" : "from"} ${others.map(nodeName).join(" and ")}` };
      }),
      transfer: { amount, center: node, nodes: [left, node, right].filter((value): value is number => value !== null).map(target => ({ node: target, name: nodeName(target), power: this.state.nodes[target].powers[owner] })), moves },
      resolve: ([id]) => apply(id),
    });
  }

  /* ---------------------------------------------------------------- choices */

  /** Whether the controller can pay a Choice option's cost step right now. */
  private canPay(ctx: EffectContext, cost: EffectStep): boolean {
    const players = cost.target && "who" in cost.target ? this.whoPlayers(ctx, cost.target.who, false) : [ctx.source.owner];
    const amount = cost.amount ?? 0;
    return players.every(owner => {
      const player = this.state.players[owner];
      if (cost.action === "payCrypto") return player.wallet >= amount;
      if (cost.action === "discardCards" || cost.action === "trashCards") {
        const filter = cost.target?.type === "card" ? cost.target.filter : undefined;
        const zone = cost.target?.type === "card" && cost.target.where === "discard" ? player.discard : player.hand;
        return zone.filter(card => matchesFilter(card, filter)).length >= (cost.amount ?? 1);
      }
      return true;
    });
  }

  private resolveChoiceStep(ctx: EffectContext, step: EffectStep): RuntimeEvent {
    const { card } = ctx.source;
    const options = step.options ?? [];
    if (!options.length) return this.noTarget(ctx, step);
    const payable = new Map(options.map(option => [option.id, (option.cost ?? []).every(cost => this.canPay(ctx, cost))]));
    const available = options.filter(option => payable.get(option.id));
    if (!available.length) return this.noTarget(ctx, step);
    const count = Math.min(Math.max(1, step.choose?.count ?? 1), available.length);
    const chooser = this.chooserFor(ctx, step.choose?.chooser);
    // Costs are paid in full first; a cost that comes up short cancels that option's effects.
    const runOption = (option: ChoiceOptionStep): RuntimeEvent => {
      const cost = (option.cost ?? []).map(paid => paid.action === "discardCards" || paid.action === "trashCards" ? { ...paid, optional: false, min: paid.min ?? paid.amount ?? 1 } : paid);
      if (cost.length) return this.resolveChained(ctx, option.effects, () => this.runList(ctx, cost));
      if (!option.effects.length) return this.event("choice", `${card.name}: ${option.label}.`, { owner: ctx.source.owner });
      return this.runList(ctx, option.effects);
    };
    const prompt = `${card.name}: ${step.prompt ?? (count === 1 ? "choose an effect." : `choose ${count} effects.`)}`;
    return this.openChoice({ ...ctx.source, owner: chooser }, {
      prompt,
      options: options.map(option => ({ id: option.id, label: optionText(option, ctx.scope, this.config.content?.cards ?? EVALUATION_ALL_CARDS, this.mods), ...(payable.get(option.id) ? {} : { disabled: true }) })),
      ...(count > 1 ? { select: { min: count, max: count } } : {}),
      resolve: ids => this.runSteps(options.filter(option => ids.includes(option.id)).map(option => () => runOption(option))),
      aiPick: () => {
        const context = this.strategyContext(chooser), favour = chooser === ctx.source.owner ? 1 : -1;
        const score = (option: ChoiceOptionStep) => favour * optionValue([...(option.cost ?? []), ...option.effects], this.strategy, context);
        return [...available].sort((a, b) => score(b) - score(a)).slice(0, count).map(option => option.id);
      },
    });
  }

  /* ---------------------------------------------------------------- Location and Circuit lists */

  private locationSteps(location: LocationDefinition, hook: "effects" | "ongoing" | "onPlay" | "startTurn2" | "startTurn3"): EffectStep[] {
    return this.steps(location[hook], hook === "onPlay" ? "locationPlay" : "location");
  }

  private enqueueLocationOnPlay(placement: Deployment): RuntimeEvent {
    const location = this.state.nodes[placement.node]?.location;
    const effects = location ? this.locationSteps(location, "onPlay") : [];
    if (!effects.length) return this.event("reward", `${placement.card.name}: no Location on-play effects.`, { node: placement.node, owner: placement.owner, cardId: placement.card.id, source: "location", sourceName: location?.name, amount: 0 });
    const ctx = this.locationPlayContext(placement);
    this.queue.unshift(...effects.map(step => () => this.resolveStep(ctx, step)));
    return this.event("reward", `${location!.name}: on-play for ${placement.card.name}.`, { node: placement.node, owner: placement.owner, cardId: placement.card.id, source: "location", sourceName: location!.name });
  }

  /** Start-of-turn Location effects for the turn that just began; only Locations already open last turn qualify. */
  private enqueueLocationStartTurn(): RuntimeEvent {
    const turn = this.state.turn;
    const hook = turn === 2 ? "startTurn2" : turn === 3 ? "startTurn3" : null;
    if (!hook) return this.event("reward", `No Location start-of-turn effects on turn ${turn}.`);
    this.recalculate();
    const callbacks: (() => RuntimeEvent)[] = [];
    for (const node of legalNodes(turn - 1, this.state.nodeOrder)) {
      const location = this.state.nodes[node].location;
      if (!location?.[hook]?.length) continue;
      const ctx = this.locationContext(node, true);
      for (const step of this.locationSteps(location, hook)) callbacks.push(() => this.resolveStep(ctx, step));
    }
    this.queue.unshift(...callbacks);
    return this.event("reward", callbacks.length ? `Location start-of-turn ${turn} effects resolve.` : `No Location start-of-turn ${turn} effects.`, { amount: callbacks.length });
  }

  private enqueueLocationOngoing(): RuntimeEvent {
    this.recalculate();
    const openTurn = Math.max(1, this.state.turn - 1);
    const callbacks: (() => RuntimeEvent)[] = [];
    for (const node of legalNodes(openTurn, this.state.nodeOrder)) {
      const location = this.state.nodes[node].location;
      if (!location) continue;
      const ctx = this.locationContext(node, true);
      for (const step of this.locationSteps(location, "ongoing")) callbacks.push(() => this.resolveStep(ctx, step));
    }
    this.queue.unshift(...callbacks);
    return this.event("reward", callbacks.length ? "Location ongoing effects resolve." : "No Location ongoing effects.", { amount: callbacks.length });
  }

  private resolveScheduledEffect(placement: Deployment, step: EffectStep, timing: "start" | "end"): RuntimeEvent {
    const active = this.state.players[placement.owner].bank.some(entry => entry.card.id === placement.card.id) || this.state.nodes.some(node => node.cards[placement.owner].some(item => item.card.id === placement.card.id));
    if (!active) return this.event("bank", `${placement.card.name}: scheduled effect source is no longer active.`, { owner: placement.owner, cardId: placement.card.id, source: "card", sourceName: placement.card.name });
    if (step.action === "morph") return this.resolveMorph(placement, step, true);
    return this.resolveStep(this.cardContext(placement, timing === "start"), step);
  }

  private resolveCircuitEffect(owner: PlayerId, name: string, step: EffectStep): RuntimeEvent {
    return this.resolveStep(this.circuitContext(owner, name), step);
  }

  private moveDestinations(target: Deployment): number[] {
    if(!this.state.nodes[target.node]?.cards[target.owner].includes(target))return [];
    if (this.collapseResolvedNodes.has(target.node)) return [];
    return legalNodes(this.state.turn, this.state.nodeOrder).filter(node =>
      node !== target.node && !this.collapseStartedNodes.has(node) && this.state.nodes[node].cards[target.owner].length < 4);
  }

  private chooseMoveDestination(source: Deployment, target: Deployment): RuntimeEvent {
    const destinations = this.moveDestinations(target);
    if (!destinations.length) return this.event("move", `${source.card.name}: No target.`, {
      owner: source.owner, cardId: source.card.id, targetCardId: target.card.id, targetOwner: target.owner,
      node: source.node >= 0 ? source.node : undefined, source: "card", sourceName: source.card.name, amount: 0,
    });
    return this.requestChoice(source, `${source.card.name}: move ${target.card.name} to which Node?`, destinations.map(node => ({
      id: `node-${node}`, label: `Node ${node + 1}`, node, resolve: () => this.movePlacement(source, node, target),
    })));
  }

  private movePlacement(source: Deployment, destination: number, target: Deployment): RuntimeEvent {
    const from = target.node;
    if (!this.moveDestinations(target).includes(destination)) throw new Error("Destination Node is unavailable.");
    const cards = this.state.nodes[from].cards[target.owner];
    if (!cards.includes(target)) throw new Error("Selected card is no longer deployed.");
    cards.splice(cards.indexOf(target), 1);
    target.node = destination;
    this.state.nodes[destination].cards[target.owner].push(target);
    this.state.movedTotal++;
    if (!source.card.id.startsWith("location:")) this.state.players[source.owner].moved++;
    this.recalculate();
    return this.event("move", `${source === target ? target.card.name : `${source.card.name}: ${target.card.name}`} moves from Node ${from + 1} to Node ${destination + 1}.`, {
      node: source.node >= 0 ? source.node : undefined, owner: source.owner, cardId: source.card.id,
      targetCardId: target.card.id, targetOwner: target.owner, sourceNode: from, targetNode: destination,
      source: "card", sourceName: source.card.name,
    });
  }

  private removePlacement(source: Deployment, target: Deployment, zone: "destroyed" | "trash"): RuntimeEvent {
    const detail = {
      node: source.node >= 0 ? source.node : undefined, owner: source.owner, cardId: source.card.id,
      targetCardId: target.card.id, targetOwner: target.owner, source: "card" as const, sourceName: source.card.name,
      sourceNode: source.node >= 0 ? source.node : undefined, targetNode: target.node,
    };
    const lane = this.state.nodes[target.node]?.cards[target.owner];
    const index = lane ? lane.indexOf(target) : -1;
    if (index < 0) return this.event("trash", `${source.card.name}: No target.`, { ...detail, amount: 0 });
    lane!.splice(index, 1);
    this.stripModifiers(target.card);
    const kept = this.retire(target.card, target.owner, zone);
    this.recalculate();
    this.refreshScores();
    return this.event("trash", kept ? `${source.card.name} ${zone === "destroyed" ? "destroys" : "trashes"} ${target.card.name}.` : `${source.card.name}: ${target.card.name} is removed from the game.`, { ...detail, ...(kept && zone === "trash" ? { target: "trash" as const } : {}), amount: 1 });
  }

  /** Heal raises a weakened card toward printed Power and never above it; with no amount
      (Restore) every lasting change, boosts included, is cleared. Returns the Power shift. */
  private healCardPower(card: Card, amount?: number): number {
    const before = card.powerDelta ?? 0;
    const after = amount === undefined ? 0 : before < 0 ? Math.min(0, before + Math.max(0, amount)) : before;
    setPowerDelta(card, after);
    return after - before;
  }

  private modifyPlacementPower(source: Deployment, target: Deployment, amount: number, steal = false): RuntimeEvent {
    if (!this.state.nodes[target.node].cards[target.owner].includes(target) || !target.revealed || this.collapseResolvedNodes.has(target.node)) throw new Error("Selected card is no longer a legal Power target.");
    const before = this.cardPower(target, false);
    const after = Math.max(cardPowerFloor(target.card), before + amount);
    setPowerDelta(target.card, after - this.printedPower(target.card));
    /* A steal moves Power rather than destroying it, so the source card gains whatever the
       target actually lost — which is less than asked for when the target was nearly empty. */
    if (steal && this.state.nodes[source.node]?.cards[source.owner].includes(source)) {
      setPowerDelta(source.card, (source.card.powerDelta ?? 0) + (before - after));
    }
    this.recalculate();
    return this.event("power", `${source.card.name}: ${target.card.name} Power ${before} → ${after}.${steal && before > after ? ` ${source.card.name} steals ${before - after}.` : ""}`, {
      node: source.node >= 0 ? source.node : undefined, owner: source.owner, cardId: source.card.id,
      targetCardId: target.card.id, targetOwner: target.owner, source: "card", sourceName: source.card.name,
      amount: after - before, before, after, sourceNode: source.node >= 0 ? source.node : undefined, targetNode: target.node,
    });
  }

  /** Runs the steps in order through the queue, returning the first step's event. */
  private runSteps(steps: (() => RuntimeEvent)[]): RuntimeEvent {
    const [first, ...rest] = steps;
    this.queue.unshift(...rest);
    return first();
  }

  private enqueueCollapse() {
    for (let node = 0; node < 5; node++) {
      this.queue.push(() => {
        const location = this.state.nodes[node].location;
        return this.event("location", location ? `${location.name}: ${location.rule}` : "Location resolution: approved content required.", { node, source: "location", sourceName: location?.name, stage: "node-start" });
      });
      this.queue.push(() => {
        const callbacks: (() => RuntimeEvent)[] = [];
        this.collapseStartedNodes.add(node);
        const cards = this.state.nodes[node].cards.flat().filter(placement => placement.revealed && !this.collapseEffectCards.has(placement.card.id)).sort((a, b) => a.order - b.order);
        cards.forEach(placement => this.collapseEffectCards.add(placement.card.id));
        for (const placement of cards) {
          const ctx = this.cardContext(placement);
          for (const effect of this.hookEffects(placement.card, 'onCollapse')) callbacks.push(() => this.resolveStep(ctx, effect));
        }
        this.queue.unshift(...callbacks);
        return this.event("collapse", callbacks.length ? "Card onCollapse effects resolve." : "No card onCollapse effects at this Node.", { node });
      });
      this.queue.push(() => {
        this.recalculate();
        const winner = this.state.nodes[node].winner;
        return this.event("power", winner === null ? "Node tied." : `${this.say(winner, "You control", "controls")} this Node.`, { node, ...(winner !== null ? { owner: winner } : {}) });
      });
      this.queue.push(() => {
        const location = this.state.nodes[node].location;
        const winner = this.state.nodes[node].winner;
        const events: (() => RuntimeEvent)[] = [];
        if (location) {
          const ctx = this.locationContext(node);
          for (const step of this.locationSteps(location, "effects")) events.push(() => this.resolveStep(ctx, step));
        }
        // Finish every effect and award at this Node before applying the lethal
        // Collapse barrier. Later Node, Bank and Circuit callbacks are discarded.
        events.push(() => {
          this.collapseResolvedNodes.add(node);
          if (this.state.players.some(player => player.servers.primary === 0 && player.servers.backup === 0)) return {...this.gameOver(`Both Servers destroyed during Node ${node + 1}. Current Node awards complete.`),node,stage:"node-close"};
          return this.event("reward", location?.effects ? `${location.name} resolved.` : "Location Reward unresolved: approved content required.", { node, source: "location", sourceName: location?.name, stage: "node-close" });
        });
        this.queue.unshift(...events);
        return this.event("reward", location?.effects ? `${location.name}: ${winner === null ? "tied Node" : `${this.whose(winner, 0, "opponent")} reward`}.` : "Location Reward requires approved content.", { node, source: "location", sourceName: location?.name, stage: "node-award" });
      });
    }
    this.queue.push(() => {
      const callbacks: (() => RuntimeEvent)[] = [];
      const entries = this.state.players.flatMap((player, owner) => player.bank.map(entry => ({ ...entry, owner: owner as PlayerId }))).sort((a, b) => a.order - b.order);
      this.bankResolvedCycle = this.state.cycle;
      for (const entry of entries) {
        const ctx = this.cardContext({ card: entry.card, owner: entry.owner, node: -1, order: entry.order, revealed: true });
        for (const effect of this.hookEffects(entry.card, 'onCollapse')) callbacks.push(() => this.resolveStep(ctx, effect));
      }
      if (!entries.length) return this.event("collapse", "No Duration cards in the Effect Bank after Node 5.");
      callbacks.push(() => this.state.players.some(player => player.servers.primary === 0 && player.servers.backup === 0) ? this.gameOver("Both Servers destroyed during Effect Bank resolution.") : this.event("bank", "Effect Bank resolution complete."));
      this.queue.unshift(...callbacks);
      return this.event("collapse", "Effect Bank resolves after Node 5, oldest first.");
    });
    this.queue.push(() => {
      this.state.selectedNode = null;
      const wins = this.locationWins();
      const rewards=this.config.content?.circuitRewards??EVALUATION_CIRCUIT_REWARDS;
      const definition = this.config.evaluationContent ? structuredClone(rewards[Math.floor(this.config.random() * rewards.length)]) : null;
      this.refreshScores();
      const [me, them] = this.state.players;
      const winner = definition?.awardTrailing ? trailingPlayer([{ vp: me.totalVP, servers: me.servers }, { vp: them.totalVP, servers: them.servers }], this.config.serverVP ?? defaultServerVP) : nodeWinner(wins);
      this.state.circuitEligible = winner === null ? [0, 1] : [winner];
      this.state.circuitReward = { definition, claimed: [] };
      if (this.telemetry) { this.telemetry.circuitId = definition?.id ?? null; this.telemetry.circuitName = definition?.name ?? null; }
      const visibleName = this.circuitNamePublic() ? definition?.name : undefined;
      const basis = definition?.awardTrailing ? `Locations won ${wins[0]}–${wins[1]}, but this reward goes to the trailing player (VP plus Server damage dealt). ${winner === null ? "Neither trails, so both players are eligible" : `${this.say(winner, "You trail and are", "trails and is")} eligible`}` : `Locations won ${wins[0]}–${wins[1]}. ${winner === null ? "Both players are eligible" : winner === 0 ? "You are eligible" : "Opponent is eligible"}`;
      return this.event("circuit", `${basis}${definition ? visibleName ? ` for ${visibleName}.` : " for a private Circuit Reward." : "; reward content unresolved."}`, { source: "circuit", sourceName: visibleName });
    });
    this.queue.push(() => {
      this.nextRevealTriggers = [];
      this.state.players.forEach((player, owner) => {
        player.discard.push(...player.hand.filter(card => card.type !== "Crypto"));
        player.hand = player.hand.filter(card => card.type === "Crypto");
        const placements = this.state.nodes.flatMap(node => node.cards[owner]).sort((a, b) => a.order - b.order);
        for (const placement of placements) {
          if (this.isRuntimeCard(placement.card)) this.retire(placement.card, owner as PlayerId, "discard");
          else if (!placement.revealed) player.destroyed.push(placement.card);
          else if (this.expiredOnBoard.has(placement.card.id)) player.discard.push(placement.card);
          else if ((placement.card.duration || this.runtimeTimers.has(placement.card.id)) && player.bank.length < 4) player.bank.push({ card: placement.card, enteredCycle: this.state.cycle, expiresCycle: this.runtimeTimers.has(placement.card.id) && !this.runtimeTimers.get(placement.card.id)!.cycleBound || placement.card.duration === 99 || placement.card.durationPeriod === "runtime" ? undefined : this.state.cycle + placement.card.duration! - 1, order: placement.order });
          else player.discard.push(placement.card);
        }
        this.state.nodes.forEach(node => { node.cards[owner] = []; });
        const expired = player.bank.filter(entry => entry.expiresCycle !== undefined && entry.expiresCycle <= this.state.cycle);
        player.discard.push(...expired.map(entry => entry.card));
        player.bank = player.bank.filter(entry => !expired.includes(entry));
        player.pendingActions = 0;
      });
      this.expiredOnBoard.clear();
      // Build this queue now, after all Location draws and cleanup. Capturing the
      // hand while initially constructing Collapse would omit Signal tower draws.
      this.enqueueDraftTransition();
      return this.event("collapse", "End of Cycle. Deployed cards and remaining non-Crypto hand enter Discard.");
    });
  }

  private enqueueDraftTransition() {
    this.state.players.forEach((player, owner) => {
      for (const card of player.hand) {
        if (card.type !== "Crypto") continue;
        const payouts = card.cryptoValue !== undefined ? [card.cryptoValue] : (starterEffects[card.name] ?? []).filter(effect => effect.action === "gainCrypto").map(effect => effect.amount ?? 0);
        for (const amount of payouts) {
          this.queue.push(() => {
            const before = player.wallet;
            player.wallet += amount;
            return this.event("crypto", `${card.name} auto-resolves: +${amount} Crypto for Draft.`, { owner: owner as PlayerId, targetOwner: owner as PlayerId, cardId: card.id, source: "card", sourceName: card.name, target: "wallet", amount, before, after: player.wallet });
          });
        }
      }
    });
    this.queue.push(() => this.enterDraft());
  }

  private enterDraft(): RuntimeEvent {
    this.state.players.forEach(player => {
      player.discard.push(...player.hand);
      player.hand = [];
    });
    // Retain resolved Node Power during Draft as a result record; nextCycle resets it.
    this.state.phase = "draft";
    this.refreshScores();
    const [local, opponent] = this.state.players;
    this.cycleRecords.push({
      cycle: this.state.cycle,
      vp: [local.totalVP, opponent.totalVP],
      servers: [local.servers.primary + local.servers.backup, opponent.servers.primary + opponent.servers.backup],
      wallet: [local.wallet, opponent.wallet],
      locationsWon: this.locationWins(),
      locations: this.state.nodes.filter(node => node.location).map(node => ({ id: node.location!.id, name: node.location!.name, winner: node.winner })),
      circuit: this.state.circuitReward.definition ? { rewardId: this.state.circuitReward.definition.id, name: this.state.circuitReward.definition.name, eligible: [...this.state.circuitEligible], claimed: [] } : null,
      deckSize: [local, opponent].map(player => player.draw.length + player.hand.length + player.discard.length + player.bank.length) as [number, number],
    });
    this.state.draftEndsAt = this.now() + 90_000;
    this.state.draftEnded = false;
    this.state.draftReady = [0, 1].map(seat => !this.config.strategicMarket && this.aiSeats.includes(seat as PlayerId)) as [boolean, boolean];
    this.purchaseTimes.clear(); this.botDraftAt = [0, 0];
    if (this.config.strategicMarket) {
      const identity = (pile: MarketPile) => pile.card.definitionId ?? pile.card.id;
      const persistent = this.state.market.filter(pile => !pile.rotating);
      const previousOffer = new Set(this.state.market.filter(pile => pile.rotating).map(identity));
      this.state.market = [
        ...draftOffer(this.config.random, this.config.content, new Set(persistent.map(identity)), previousOffer, this.state.cycle),
        ...persistent,
      ];
    }
    const record = this.cycleRecords[this.cycleRecords.length - 1];
    if (record) record.market = this.state.market.map(pile => ({ id: pile.card.definitionId ?? pile.card.id, name: pile.card.name, category: pile.category, cost: Math.max(0, pile.card.cost), stock: pile.remaining ? [pile.remaining[0], pile.remaining[1]] : [pile.supply, pile.supply] }));
    for (const seat of this.aiSeats) if (this.state.circuitReward.definition && this.state.circuitEligible.includes(seat)) this.queue.push(() => this.applyCircuitClaim(seat));
    return this.event("draft", "Draft begins. Held Crypto resolves into Wallet; hand and deployed cards enter Discard.");
  }

  step(): { event: RuntimeEvent; view: SessionView } | null {
    if (this.state.choice) return null;
    const next = this.queue.shift();
    if (!next) return null;
    const event = next();
    return { event, view: this.view() };
  }

  claimCircuitReward(owner: PlayerId = 0, now = this.now()): RuntimeEvent {
    if(this.state.phase==="draft"&&this.state.circuitReward.claimed.includes(owner))throw new Error("This player already claimed the Circuit Reward.");
    if (this.state.phase !== "draft" || this.queue.length || this.state.draftEnded || this.state.draftReady[owner]) throw new Error("Circuit claims require an active Draft.");
    if (this.state.draftEndsAt !== null && now > this.state.draftEndsAt) throw new Error("Draft deadline has passed.");
    return this.applyCircuitClaim(owner);
  }

  private applyCircuitClaim(owner: PlayerId): RuntimeEvent {
    const slot = this.state.circuitReward;
    if (!slot.definition) throw new Error("No Circuit Reward is available.");
    if (!this.state.circuitEligible.includes(owner)) throw new Error("This player is not eligible for the Circuit Reward.");
    if (slot.claimed.includes(owner)) throw new Error("This player already claimed the Circuit Reward.");
    const effects=this.steps(slot.definition.effects??[slot.definition.effect],"circuit");
    if(!effects.length)throw new Error("Circuit Reward has no effect recipes.");
    slot.claimed.push(owner);
    const record = this.cycleRecords[this.cycleRecords.length - 1];
    if (record?.cycle === this.state.cycle && record.circuit) record.circuit.claimed.push(owner);
    if (this.aiSeats.includes(owner)) this.recordDecision({ kind: "circuit", cycle: this.state.cycle, owner, rewardId: slot.definition.id, name: slot.definition.name });
    const name = this.circuitNamePublic() ? slot.definition.name : "a private Circuit Reward";
    this.queue.unshift(...effects.slice(1).map(effect=>()=>this.resolveCircuitEffect(owner,name,effect)));
    return this.resolveCircuitEffect(owner,name,effects[0]);
  }

  buy(pileId: string, now = this.now(), owner: PlayerId = 0): RuntimeEvent {
    if (this.state.phase !== "draft" || this.queue.length || this.state.draftEnded || this.state.draftReady[owner]) throw new Error("Purchases require an active Draft.");
    if (this.state.draftEndsAt !== null && now > this.state.draftEndsAt) throw new Error("Draft deadline has passed.");
    const pile = this.state.market.find(item => item.id === pileId);
    if (!pile || (pile.remaining ? pile.remaining[owner] : pile.supply) <= 0) throw new Error("Pile is unavailable.");
    const cooldownKey = `${owner}:${pileId}`;
    if (now - (this.purchaseTimes.get(cooldownKey) ?? -Infinity) < 2000) throw new Error("This pile is on its two-second purchase cooldown.");
    const player = this.state.players[owner];
    const cost = Math.max(0, pile.card.cost);
    if (player.wallet < cost) throw new Error("Insufficient Wallet.");
    player.wallet -= cost;
    pile.supply--;
    if (pile.remaining) pile.remaining[owner]--;
    const card = { ...pile.card, id: `${owner}:acquired-${++this.acquired}` };
    player.discard.push(card);
    this.purchaseTimes.set(cooldownKey, now);
    this.purchases.push({ cycle: this.state.cycle, owner, definitionId: pile.card.definitionId ?? pile.card.id, name: pile.card.name, category: pile.category, cost });
    this.refreshScores();
    return this.event("purchase", `${this.say(owner, "You acquire", "acquires")} ${pile.card.name} to Discard for ${cost} Crypto.`, { owner, targetOwner: owner, cardId: card.id, definitionId: card.definitionId, target: "wallet", amount: cost, before: player.wallet + cost, after: player.wallet });
  }

  endDraft(owner: PlayerId = 0): RuntimeEvent {
    if (this.state.phase !== "draft" || this.queue.length) throw new Error("Draft is not active.");
    this.state.draftReady[owner] = true;
    // Without a strategic market the AI seats have nothing to draft and are ready at once.
    if (!this.config.strategicMarket) for (const seat of this.aiSeats) this.state.draftReady[seat] = true;
    this.state.draftEnded = this.state.draftReady.every(Boolean);
    return this.event("draft", this.state.draftEnded ? "Both players ended Draft." : `${this.say(owner, "You ended", "ended")} Draft.`, { owner });
  }

  undoEndDraft(owner: PlayerId = 0, now = this.now()): RuntimeEvent {
    if (this.state.phase !== "draft" || !this.state.draftReady[owner] || this.state.draftReady[1 - owner] || this.state.draftEndsAt === null || now >= this.state.draftEndsAt) throw new Error("Draft readiness can no longer be undone.");
    this.state.draftReady[owner] = false; this.state.draftEnded = false;
    return this.event("draft", `${this.say(owner, "You resume", "resumes")} Draft.`, { owner });
  }

  /** Pushes the Draft deadline back by `ms`, for a table that paused while a seat reconnected. */
  extendDraft(ms: number): void {
    if (this.state.phase !== "draft" || this.state.draftEndsAt === null || ms <= 0) return;
    this.state.draftEndsAt += ms;
  }

  expireDraft(now = this.now()): RuntimeEvent | null {
    if (this.state.phase !== "draft" || this.state.draftEnded || this.queue.length || this.state.draftEndsAt === null || now < this.state.draftEndsAt || this.state.choice) return null;
    this.state.draftReady = [true, true]; this.state.draftEnded = true;
    return this.event("draft", "Draft time expired. Both players are ready for the next Cycle.");
  }

  opponentDraftStep(now = this.now(), owner: PlayerId = 1): RuntimeEvent | null {
    if (!this.config.strategicMarket || this.state.phase !== "draft" || this.queue.length || this.state.choice || this.state.draftReady[owner] || now < this.botDraftAt[owner]) return null;
    const expired = this.expireDraft(now); if (expired) return expired;
    this.botDraftAt[owner] = now + 1400;
    const player = this.state.players[owner];
    const stock = (pile: MarketPile) => pile.remaining ? pile.remaining[owner] : pile.supply;
    const affordable = this.state.market.filter(pile => stock(pile) > 0 && pile.card.cost <= player.wallet);
    const strategy = this.strategyOf(owner), context = this.strategyContext(owner), phase = strategyPhase(strategy, this.state.cycle);
    // Re-plan every purchase: the best affordable set changes as the wallet and deck change.
    const plan = planDraft(affordable.map(pile => ({ id: pile.id, card: pile.card, available: stock(pile) })), player.wallet, strategy, context);
    if (!plan.length) {
      this.recordDecision({ kind: "draft-end", cycle: this.state.cycle, owner, walletLeft: player.wallet, phase });
      return this.endDraft(owner);
    }
    const ready = plan.find(id => now - (this.purchaseTimes.get(`${owner}:${id}`) ?? -Infinity) >= 2000);
    if (!ready) return null;
    const pileName = (id: string) => this.state.market.find(pile => pile.id === id)?.card.name ?? id;
    const bought = this.state.market.find(pile => pile.id === ready)!;
    const scored = affordable.map(pile => ({ pile, score: draftScore(pile.card, strategy, context) }));
    const alternatives = scored.map(({ pile, score }) => ({ name: pile.card.name, cost: pile.card.cost, score }))
      .filter(entry => Number.isFinite(entry.score)).sort((a, b) => b.score - a.score).slice(0, 5)
      .map(entry => ({ ...entry, score: Math.round(entry.score * 100) / 100 }));
    const offered = scored.map(({ pile, score }) => ({ id: pile.card.definitionId ?? pile.card.id, score: Number.isFinite(score) ? Math.round(score * 100) / 100 : null }));
    this.recordDecision({ kind: "draft", cycle: this.state.cycle, owner, wallet: player.wallet, phase, bought: bought.card.name, cost: bought.card.cost, plan: plan.map(pileName), alternatives, offered });
    return this.buy(ready, now, owner);
  }

  /** End-of-Collapse records, one per finished Cycle. */
  cycleHistory(): CycleRecord[] { return structuredClone(this.cycleRecords); }

  matchReport(): MatchReport {
    this.refreshScores();
    const counts = (owner: PlayerId) => this.activeCards(owner).reduce<Record<string, number>>((tally, card) => {
      const id = card.definitionId ?? card.id.replace(/^[01]:/, "");
      tally[id] = (tally[id] ?? 0) + 1;
      return tally;
    }, {});
    const [local, opponent] = this.state.players;
    return {
      strategyVersion: this.strategy.version, strategyExperiment: this.config.strategyExperiment ?? null, cycle: this.state.cycle, phase: this.state.phase,
      winner: this.state.winner, endedReason: this.state.endedReason,
      finalVP: [local.totalVP, opponent.totalVP],
      servers: [local.servers.primary + local.servers.backup, opponent.servers.primary + opponent.servers.backup],
      purchases: structuredClone(this.purchases), cycles: structuredClone(this.cycleRecords),
      decks: [counts(0), counts(1)],
      aiSeats: [...this.aiSeats],
      telemetry: structuredClone(this.telemetry.data),
      decisions: structuredClone(this.decisions),
    };
  }

  nextCycle(): RuntimeEvent {
    if (this.state.phase !== "draft" || !this.state.draftEnded || this.queue.length || this.state.choice) throw new Error("End Draft and finish resolution before advancing.");
    if (this.state.cycle >= 16) return this.gameOver("Cycle 16 final Draft complete.");
    this.expireRuntimeTimers();
    this.state.cycle++;
    this.state.turn = 1;
    this.relocatedThisTurn.clear();
    this.relocatedThisCycle.clear();
    this.state.selectedNode = null;
    this.state.circuitEligible = [];
    this.state.circuitReward = { definition: null, claimed: [] };
    this.randomizeBoard();
    this.setupEvaluationLocations();
    this.state.draftEndsAt = null;
    this.state.draftEnded = false;
    this.state.draftReady = [false, false];
    this.state.turnReady = [false, false];
    this.planningSnapshot = [null, null];
    this.state.players.forEach(player => {
      player.wallet = 0;
      player.actions = 2;
      player.pendingActions = 0;
      Object.assign(player, drawCards(player, 5, this.config.random));
    });
    this.state.nodes.forEach(node => { node.cards = [[], []]; node.powerModifiers = [0, 0]; node.powers = [0, 0]; node.winner = null; });
    this.collapseStartedNodes.clear(); this.collapseResolvedNodes.clear(); this.collapseEffectCards.clear();
    this.state.phase = this.runtimeTimers.size ? "reveal" : "runtime";
    if(this.runtimeTimers.size){
      this.queue.push(()=>this.enqueueRuntimeSchedule("start",true));
      this.queue.push(()=>{this.state.phase="runtime";return this.event("turn", "Runtime turn 1 planning begins.");});
    }
    return this.event("cycle", `Cycle ${this.state.cycle}. Wallet resets; draw five cards.`);
  }

  concedeForInactivity(owner:PlayerId=0):RuntimeEvent {
    if(this.state.phase!=="runtime"||this.queue.length)throw new Error("Concession is only available at a Runtime decision boundary.");
    return this.resign(owner, "Automatic concession after two consecutive no-input Runtime turns.");
  }

  /** `owner` gives up the game in any phase: the other seat wins whatever the score. Concessions and forfeits use this. */
  resign(owner: PlayerId, reason = `${this.subject(owner)} ${this.config.seatNames || owner !== 0 ? "concedes" : "concede"}.`): RuntimeEvent {
    if (this.state.phase === "gameover") throw new Error("The session has already ended.");
    this.refreshScores();
    this.state.phase = "gameover"; this.state.winner = (1 - owner) as PlayerId;
    this.state.endedReason = reason;
    this.queue = []; this.state.choice = null; this.choiceResolver = null;
    return this.event("gameover", this.state.endedReason, { owner });
  }

  /** Evaluation shortcut: scores the session as it stands and ends it, whatever the phase. */
  endSessionNow(): RuntimeEvent {
    if (this.state.phase === "gameover") throw new Error("The session has already ended.");
    return this.gameOver("Session ended early for evaluation.");
  }

  private gameOver(reason: string): RuntimeEvent {
    this.refreshScores();
    this.state.phase = "gameover";
    const [local, opponent] = this.state.players.map(player => player.totalVP);
    this.state.winner = nodeWinner([local, opponent]);
    this.state.endedReason = `${reason} ${local === opponent ? "Tie" : this.say(local > opponent ? 0 : 1, "You win", "wins")}, ${local} to ${opponent} VP.`;
    this.queue = []; this.state.choice = null; this.choiceResolver = null;
    return this.event("gameover", this.state.endedReason);
  }
}
