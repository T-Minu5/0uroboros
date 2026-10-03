import { EVALUATION_ALL_CARDS, createStrategicMarket, baseOffer, chaosOffer, type MarketPile } from "./evaluationMarket";
import { EVALUATION_LOCATIONS, EVALUATION_CIRCUIT_REWARDS, type LocationRewardEffect, type CircuitRewardDefinition } from "./content";
import type { CompiledContent } from './authoring/contentModel';
import {
  type Card, type EvaluationEffect, type PlayerId, type RandomSource, type Deployment, type Servers,
  applyServerEffect, serverMaximums, drawCards,
  initialWeights, legalNodes, mirroredOpening, nodeWinner,
  revealOrder, runtimeActions, starterEffects, canDeploy, compileChains,
  shuffleCards, effectiveCardPower, cardPowerFloor,
} from "./game";
import { formatAmount, transferFlow, transferText } from "./transferText";

export type SessionPhase = "runtime" | "reveal" | "collapse" | "draft" | "gameover";
export type LocationDefinition = {
  id: string;
  name: string;
  rule: string;
  reward: string;
  effects?: readonly LocationRewardEffect[];
  ongoing?: readonly LocationRewardEffect[];
  onPlay?: readonly LocationRewardEffect[];
  schedule?: readonly { at: 2 | 3; effects: readonly LocationRewardEffect[] }[];
};
export type SessionConfig = {
  content?: CompiledContent;
  strategicMarket?: boolean;
  evaluationContent?: boolean;
  carryover: boolean;
  priorityPreference: "higher" | "lower";
  random: RandomSource;
  // An explicit development fixture, never described as the canonical full market.
  practiceMarket?: Card[];
  locations?: LocationDefinition[];
};
export type BankEntry = { card: Card; enteredCycle: number; expiresCycle?: number; remainingTurns?: number; order: number };
/** `card` is shown as the option's thumbnail; `node` marks an option picked on the board; `group` ties it to one of the choice's groups. */
export type ChoiceOption = { id: string; label: string; card?: Card; node?: number; group?: string };
export type ChoiceGroup = { id: string; label: string; card?: Card };
/**
 * Without `select` or `groups` one option resolves immediately. With `select` the player picks
 * min..max options; with `groups` exactly one option per group. Either way nothing resolves
 * until the whole selection is submitted.
 */
export type TransferMove = { from: number; to: number; amount: number };
/** A Power transfer drawn as the chooser's Power at this Node and its neighbours; each option id maps to the moves it makes. */
export type TransferChoice = { amount: number; center: number; nodes: { node: number; name: string; power: number }[]; moves: Record<string, TransferMove[]> };
export type RuntimeChoice = { id: number; owner: PlayerId; prompt: string; sourceName: string; node?: number; icon?: string; options: ChoiceOption[]; select?: { min: number; max: number }; groups?: ChoiceGroup[]; transfer?: TransferChoice };
type ChoiceRequest = { prompt: string; options: ChoiceOption[]; icon?: string; select?: { min: number; max: number }; groups?: ChoiceGroup[]; transfer?: TransferChoice; resolve: (ids: string[]) => RuntimeEvent };
export type PlayerState = {
  bank: BankEntry[];
  draw: Card[]; hand: Card[]; discard: Card[]; destroyed: Card[];
  actions: number; pendingActions: number; wallet: number;
  servers: Servers; destructionVP: number; rewardVP: number; totalVP: number;
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
  unresolved: string[]; endedReason: string | null; winner: PlayerId | null;
  draftEndsAt: number | null; draftEnded: boolean;
};
export type RuntimeEvent = {
  id: number; kind: "move" | "probability" | "trash" | "bank" | "choice" | "vp" | "deploy" | "reveal" | "draw" | "actions" | "crypto" | "drain" | "restore" | "morph" | "turn" | "collapse" | "location" | "power" | "reward" | "circuit" | "draft" | "purchase" | "cycle" | "gameover";
  text: string; node?: number; owner?: PlayerId; cardId?: string; targetCardId?: string; definitionId?: string;
  sourceNode?: number; targetNode?: number;
  source?: "card" | "location" | "circuit"; sourceName?: string;
  target?: "primary" | "backup" | "hand" | "actions" | "wallet" | "vp" | "trash" | "discard";
  amount?: number; before?: number; after?: number; targetOwner?: PlayerId;
  stage?: "node-start" | "node-award" | "node-close";
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
export type SessionView = Omit<SessionState, "players" | "nodes" | "nodeOrder"> & {
  /** Only populated once the session is over. */
  finalScore: [ScoreBreakdown, ScoreBreakdown] | null;
  openNodes: number[];
  canUndoPlanning: boolean;
  planningCardIds: string[];
  movableCardIds: string[];
  players: [Omit<PlayerState, "draw"> & { draw: { id: string; hidden: true }[] }, Omit<PlayerState, "draw" | "hand"> & { draw: { id: string; hidden: true }[]; hand: { id: string; hidden: true }[] }];
  nodes: (Omit<NodeState, "cards"> & { cards: [VisiblePlacement[], VisiblePlacement[]] })[];
};

type MorphTrigger = { effect: EvaluationEffect; cadence: "recurring" | "scheduled"; origin: string; sourceStartAge: number; slot: string; at?: number; timing?: "start" | "end"; expiresAt: number };
type RuntimeTimer = { placement: Deployment; age: number; formStartAge: number; formExpiresAt: number; morphTriggers: MorphTrigger[] };
/** A "next revealed card" effect waiting for `targetOwner` to reveal a card. */
type NextRevealTrigger = { source: Deployment; effect: EvaluationEffect; targetOwner: PlayerId };
/** Outcomes that break a chain: nothing to act on, an optional step skipped, a cost declined. */
const FAILED_OUTCOME = /: No target\.$|: No Power to shift\.$| skipped\.$|payment declined\.$|chained effects cancelled\.$/;

export function seededRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function createSession(config: SessionConfig): RuntimeSession { return new RuntimeSession(config); }

/** The first option in each group, or the leading options a `select` choice accepts; always legal to submit. */
export function firstLegalSelection(choice: Pick<RuntimeChoice, "options" | "select" | "groups">): string[] {
  if (choice.groups) return choice.groups.map(group => choice.options.find(option => option.group === group.id)!.id);
  const count = choice.select ? Math.min(choice.select.max, Math.max(choice.select.min, 1)) : 1;
  return choice.options.slice(0, count).map(option => option.id);
}

const cardVP = (card: Card) => card.vp ?? (card.name === "Vault Encryption" ? 2 : 0);

// One local session is the sole authority. Presentation advances one queued event at
// a time; input cannot bypass a reveal/Collapse barrier. No networking is implied.
export class RuntimeSession {
  readonly state: SessionState;
  private queue: (() => RuntimeEvent)[] = [];
  private serial = 0;
  private order = 0;
  private acquired = 0;
  private purchaseTimes = new Map<string, number>();
  private config: SessionConfig;
  private choiceResolver: ((ids: string[]) => RuntimeEvent) | null = null;
  private botDraftAt = 0;
  private runtimeTimers = new Map<string, RuntimeTimer>();
  private morphProgress = new Map<string, Map<string, number>>();
  private collapseStartedNodes = new Set<number>();
  private collapseResolvedNodes = new Set<number>();
  private collapseEffectCards = new Set<string>();
  private planningSnapshot: { hand: Card[]; actions: number; nodes: Deployment[][]; order: number } | null = null;
  private relocatedThisTurn = new Set<string>();
  private nextRevealTriggers: NextRevealTrigger[] = [];
  private failedOutcomes = 0;
  private revealCounter = 0;
  /** Slices of `rewardVP` by where the VP came from; card effects are the remainder. */
  private rewardSources: [{ location: number; circuit: number }, { location: number; circuit: number }] = [{ location: 0, circuit: 0 }, { location: 0, circuit: 0 }];

  constructor(config: SessionConfig) {
    if (typeof config.carryover !== "boolean" || !["higher", "lower"].includes(config.priorityPreference)) throw new Error("Explicit Action carryover and priority policy are required.");
    if (config.practiceMarket?.some(card => !starterEffects[card.name])) throw new Error("Practice market only supports the canonical starter cards.");
    this.config = { ...config, content: config.content ? structuredClone(config.content) : undefined };
    const opening = mirroredOpening(config.random);
    if (this.config.content) {
      const aliases:Record<string,string>={slash:'slash-dot','dash-dot':'dash-dot',dotkrawler:'dotkrawler',razor:'rezz-razor',blade:'rezz-blade','byte-1':'byte-coin','byte-2':'byte-coin',kilo:'kilo-coin','vault-1':'vault-encryption','vault-2':'vault-encryption'};
      for(const zones of opening)for(const zone of ['hand','draw'] as const)zones[zone]=zones[zone].map(card=>{
        const definition=this.config.content!.cards.find(entry=>(entry.definitionId??entry.id)===aliases[card.id.slice(2)]);
        if(!definition)throw new Error(`Starting card ${card.name} is missing from saved content.`);
        return {...structuredClone(definition),id:card.id};
      });
    }
    const player = (owner: PlayerId): PlayerState => ({ ...opening[owner], destroyed: [], bank: [], actions: 2, pendingActions: 0, wallet: 0, servers: { ...serverMaximums }, destructionVP: 0, rewardVP: 0, totalVP: 4 });
    this.state = {
      phase: "runtime", turn: 1, cycle: 1, priority: config.random() < 0.5 ? 0 : 1,
      players: [player(0), player(1)],
      nodes: Array.from({ length: 5 }, (_, i) => ({ cards: [[], []], location: config.locations?.[i] ?? null, powerModifiers: [0, 0], powers: [0, 0], winner: null })),
      nodeOrder: [0,1,2,3,4], weights: [...initialWeights], selectedNode: null, circuitEligible: [], circuitReward: { definition: null, claimed: [] },
      market: config.strategicMarket ? [] : (config.practiceMarket ?? []).map((card, i) => ({ id: `practice-${i}`, card: { ...card }, category: "Base" as const, supply: 8 })),
      trash: [], choice: null, draftReady: [false, false],
      unresolved: [...(config.strategicMarket ? ["Market additions are provisional evaluation content, not final balance."] : ["Complete approved market content is unavailable."]), ...(config.evaluationContent ? [] : ["Location mechanics and Location Rewards are not implemented without approved content.", "Circuit Reward content is unavailable; only eligibility is computed."])],
      endedReason: null, winner: null, draftEndsAt: null, draftEnded: false,
    };
    this.randomizeBoard();
    this.setupEvaluationLocations();
    // After board/location shuffle so seeded location layouts stay stable.
    if (config.strategicMarket) this.state.market = createStrategicMarket(this.config.random, this.config.content);
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
    this.state.nodes.forEach((node, i) => { node.location = locations[i] ?? null; });
  }

  get pendingCount() { return this.state.choice ? 0 : this.queue.length; }

  /** Every card a player owns outside the board, sorted so it reveals their deck list but not its draw order. */
  deckList(owner: PlayerId): Card[] {
    const player = this.state.players[owner];
    return [...player.draw, ...player.hand, ...player.discard].map(card => structuredClone(card)).sort((a, b) => a.id.localeCompare(b.id));
  }

  view(): SessionView {
    this.refreshScores();
    const {nodeOrder, ...snapshot} = structuredClone(this.state);
    const movableCardIds = this.state.phase === "runtime" && !this.queue.length && !this.state.choice
      ? this.state.nodes.flatMap(node => node.cards[0]).filter(placement =>
        placement.revealed
        && (placement.card.modifiers ?? []).some(modifier => modifier.kind === 'movableEachTurn')
        && !this.relocatedThisTurn.has(placement.card.id)
        && this.moveDestinations(placement).length > 0).map(placement => placement.card.id)
      : [];
    const view = {...snapshot, finalScore: this.state.phase === "gameover" ? [this.scoreBreakdown(0), this.scoreBreakdown(1)] : null, openNodes: legalNodes(this.state.turn,nodeOrder), canUndoPlanning: this.state.phase === "runtime" && !this.queue.length && !!this.planningSnapshot, planningCardIds: this.planningSnapshot ? this.state.nodes.flatMap(node => node.cards[0]).filter(card => card.order > this.planningSnapshot!.order).map(card => card.card.id) : [], movableCardIds} as unknown as SessionView;
    if (!this.state.circuitEligible.includes(0)) view.circuitReward.definition = null;
    view.players.forEach(player=>player.bank.forEach(entry=>{const timer=this.runtimeTimers.get(entry.card.id);if(timer&&Number.isFinite(this.timerUntil(timer)))entry.remainingTurns=Math.max(0,this.timerUntil(timer)-timer.age);}));
    const hidden = (_card: Card, index: number) => ({ id: `hidden-${index}`, hidden: true as const });
    view.players[0].draw = this.state.players[0].draw.map(hidden);
    view.players[1].draw = this.state.players[1].draw.map(hidden);
    view.players[1].hand = this.state.players[1].hand.map(hidden);
    view.players[0].hand = view.players[0].hand.map(card => card.powerSource ? { ...card, power: this.printedPower(card) } : card);
    const visiblePower = (placement: Deployment): VisiblePlacement => ({
      ...structuredClone(placement),
      card: placement.revealed ? {
        ...placement.card,
        power: this.cardPower(placement),
        ...(placement.powerModifier ? { basePower: this.printedPower(placement.card) } : {}),
      } : { id: `hidden-placement-${placement.order}`, hidden: true },
    });
    view.nodes.forEach((node, i) => {
      // Closed Nodes reveal neither Location identity nor its rules/rewards to the client.
      if (!legalNodes(this.state.turn, this.state.nodeOrder).includes(i)) node.location = null;
      node.cards[0] = this.state.nodes[i].cards[0].map(placement => placement.revealed ? visiblePower(placement) : structuredClone(placement));
      node.cards[1] = this.state.nodes[i].cards[1].map(visiblePower);
    });
    return view;
  }

  private event(kind: RuntimeEvent["kind"], text: string, detail: Omit<RuntimeEvent, "id" | "kind" | "text"> = {}): RuntimeEvent {
    if (FAILED_OUTCOME.test(text)) this.failedOutcomes++;
    return { id: ++this.serial, kind, text, ...detail };
  }

  /** Runs `head`; once it and everything it queued have resolved, runs `then` unless any of it failed or was skipped. */
  private resolveChained(placement: Deployment, then: readonly EvaluationEffect[], head: () => RuntimeEvent): RuntimeEvent {
    const failures = this.failedOutcomes;
    this.queue.unshift(() => {
      if (this.failedOutcomes !== failures) return this.event("choice", `${placement.card.name}: chained effects cancelled.`, { owner: placement.owner, cardId: placement.card.id, source: "card", sourceName: placement.card.name, amount: 0 });
      this.queue.unshift(...then.slice(1).map(next => () => this.resolveEvaluationEffect(placement, next)));
      return this.resolveEvaluationEffect(placement, then[0]);
    });
    return head();
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
      return sum + (other.card.modifiers ?? []).filter(modifier => modifier.kind === 'powerAuraAtLocation').reduce((total, modifier) => total + (modifier.amount ?? 0), 0);
    }, 0);
  }

  private sourcedPower(card: Card): number {
    if (card.powerSource === "trash") return this.state.trash.length;
    if (card.powerSource === "destroyed") return this.state.players.reduce((sum, player) => sum + player.destroyed.length, 0);
    return 0;
  }

  /** Printed Power plus any live count the card draws its Power from, before board changes. */
  private printedPower(card: Card): number {
    return (card.power ?? 0) + this.sourcedPower(card);
  }

  private cardPower(placement: Deployment, withAura = true): number {
    return effectiveCardPower(placement, (withAura ? this.auraBonus(placement) : 0) + this.sourcedPower(placement.card));
  }

  private recalculate() {
    this.state.nodes.forEach(node => {
      node.powers = node.cards.map((cards, owner) => cards.reduce((sum, placement) => sum + (placement.revealed ? this.cardPower(placement) : 0), node.powerModifiers[owner])) as [number, number];
      node.winner = nodeWinner(node.powers);
    });
  }

  private normalizeEffect(effect: EvaluationEffect): EvaluationEffect {
    if (effect.kind === 'damageLoser') return { kind: 'drain', amount: effect.amount ?? 1, opponent: true };
    if (effect.kind === 'restorePrimary') return { kind: 'restore', amount: effect.amount ?? 1, target: 'primary' };
    if (effect.kind === 'trashLowestAtLocation') return { kind: 'trashAtLocation', rank: 'weakest', amount: effect.amount ?? 1, ...(effect.boardSide ? { boardSide: effect.boardSide } : {}) };
    return effect;
  }

  /** Location effects that act on revealed cards at the Node by side rather than paying a player. */
  private isLocationBoardEffect(effect: EvaluationEffect): boolean {
    return effect.kind === "trashAtLocation" || effect.kind === "destroyAtLocation" || effect.kind === "boostPowerAtLocation" ||
      ((effect.kind === "moveCard" || effect.kind === "modifyPower") && !effect.cardRelation);
  }

  private printedHookEffects(card: Card, hook: 'onReveal' | 'onCollapse'): EvaluationEffect[] {
    const base = compileChains(hook === 'onReveal' ? (card.onReveal ?? starterEffects[card.name] ?? []) : (card.onCollapse ?? []));
    if (card.modifiers?.some(modifier => modifier.kind === 'doublePrintedEffects')) return [...base, ...base];
    return [...base];
  }

  private stripModifiers(card: Card) {
    if (card.modifiers?.length) delete card.modifiers;
  }

  /** Runtime cards are single-cycle: once played they leave the game instead of entering any zone. */
  private isRuntimeCard(card: Card): boolean {
    return card.cardClass === "Runtime";
  }

  /** Sends a card that left the board to `zone`; returns false when a Runtime card was removed from the game instead. */
  private retire(card: Card, owner: PlayerId, zone: "trash" | "destroyed" | "discard"): boolean {
    this.runtimeTimers.delete(card.id);
    if (this.isRuntimeCard(card)) { this.stripModifiers(card); return false; }
    if (zone === "trash") this.state.trash.push(card);
    else if (zone === "destroyed") this.state.players[owner].destroyed.push(card);
    else this.state.players[owner].discard.push(card);
    return true;
  }

  private timerUntil(timer: RuntimeTimer) {
    return Math.max(timer.formExpiresAt, ...timer.morphTriggers.map(trigger => trigger.expiresAt));
  }

  private rememberMorphTriggers(timer: RuntimeTimer, card: Card) {
    if (card.durationPeriod !== "runtime" || !card.duration) return;
    const origin = card.definitionId ?? card.id;
    const expiresAt = card.duration === 99 ? Infinity : timer.formStartAge + card.duration - 1;
    const add = (trigger: MorphTrigger) => {
      if (!timer.morphTriggers.some(existing => existing.origin===trigger.origin && existing.sourceStartAge===trigger.sourceStartAge && existing.cadence===trigger.cadence && existing.slot===trigger.slot)) timer.morphTriggers.push(trigger);
    };
    (card.recurring??[]).forEach((effect,index)=>{if(effect.kind==="morph")add({effect,cadence:"recurring",origin,sourceStartAge:timer.formStartAge,slot:`recurring-${index}`,expiresAt});});
    (card.schedule??[]).forEach((entry,entryIndex)=>entry.effects.forEach((effect,effectIndex)=>{if(effect.kind==="morph")add({effect,cadence:"scheduled",origin,sourceStartAge:timer.formStartAge,slot:`schedule-${entryIndex}-${effectIndex}`,at:timer.formStartAge+entry.at-1,timing:entry.timing??"start",expiresAt});}));
  }

  private scheduledEffects(timer: RuntimeTimer, timing: "start" | "end") {
    const { card } = timer.placement;
    const formAge=timer.age-timer.formStartAge+1;
    const live = [
      ...(timing === "start" && formAge>=1 ? compileChains(card.recurring ?? []) : []),
      ...(card.schedule ?? []).filter(entry => entry.at === formAge && (entry.timing ?? "start") === timing).flatMap(entry => compileChains(entry.effects)),
    ];
    const retained=timer.morphTriggers.filter(trigger=>timer.age<=trigger.expiresAt &&
      (trigger.cadence==="recurring"?timing==="start":trigger.at===timer.age&&trigger.timing===timing));
    const signature=(effect:EvaluationEffect)=>JSON.stringify([effect.formIds,effect.selection??"sequential"]);
    const liveCounts=new Map<string,number>();
    for(const effect of live)if(effect.kind==="morph"){
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
    if(!this.config.strategicMarket || this.state.phase!=="runtime" || this.queue.length || this.state.choice || this.planningSnapshot)throw new Error("Add evaluation cards only before planning placements at a Runtime boundary.");
    const definition=(this.config.content?.cards??EVALUATION_ALL_CARDS).find(card=>(card.definitionId ?? card.id)===definitionId);
    if(!definition)throw new Error("Unknown evaluation card.");
    const card={...structuredClone(definition),id:`${owner}:evaluation-${++this.acquired}`};
    const player=this.state.players[owner],before=player.hand.length;
    player.hand.push(card);this.refreshScores();
    return this.event("draw",`Added ${card.name} to evaluation hand.`,{owner,targetOwner:owner,cardId:card.id,definitionId,target:"hand",amount:1,before,after:player.hand.length});
  }

  deploy(cardId: string, node: number): RuntimeEvent {
    if (this.state.phase !== "runtime" || this.queue.length) throw new Error("Deployment is only available during Runtime.");
    const snapshot = this.planningSnapshot ?? {
      hand: [...this.state.players[0].hand], actions: this.state.players[0].actions,
      nodes: this.state.nodes.map(node => [...node.cards[0]]), order: this.order,
    };
    const event = this.place(0, cardId, node);
    this.planningSnapshot = snapshot;
    return event;
  }

  undoAllPlanning(): RuntimeEvent {
    const snapshot = this.planningSnapshot;
    if (this.state.phase !== "runtime" || this.queue.length || this.state.choice || !snapshot) throw new Error("No reversible planning actions are available.");
    this.state.players[0].hand = [...snapshot.hand];
    this.state.players[0].actions = snapshot.actions;
    this.state.nodes.forEach((node, index) => { node.cards[0] = [...snapshot.nodes[index]]; });
    this.order = snapshot.order;
    this.planningSnapshot = null;
    this.recalculate();
    return this.event("turn", "All planning placements undone. Hand order and Actions restored.", {owner: 0});
  }

  /** Free relocate for a revealed card with the movableEachTurn modifier (once per Runtime turn). */
  relocateCard(cardId: string, destination: number, owner: PlayerId = 0): RuntimeEvent {
    if (this.state.phase !== "runtime" || this.queue.length || this.state.choice) throw new Error("Finish the current resolution first.");
    if (this.relocatedThisTurn.has(cardId)) throw new Error("This card already moved this turn.");
    const placement = this.state.nodes.flatMap(node => node.cards[owner]).find(item => item.card.id === cardId);
    if (!placement || !placement.revealed) throw new Error("Movable card is not on the board.");
    if (!(placement.card.modifiers ?? []).some(modifier => modifier.kind === 'movableEachTurn')) throw new Error("This card is not movable.");
    if (!this.moveDestinations(placement).includes(destination)) throw new Error("Destination Node is unavailable.");
    const event = this.movePlacement(placement, destination, placement);
    this.relocatedThisTurn.add(cardId);
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
    if (card.type === "Character") player.actions--;
    this.state.nodes[node].cards[owner].push({ card, owner, node, order: ++this.order, revealed: false });
    return this.event("deploy", owner === 0 ? `${card.name} placed. End Turn to commit your plan.` : "Opponent deployed a face-down card.", { node, owner, ...(owner === 0 ? { cardId } : {}) });
  }

  private opponentDeploy() {
    const opponent = this.state.players[1];
    // AI uses public state and its own hand; it does not inspect the local hand.
    for (const card of [...opponent.hand]) {
      if (card.type === "Crypto") continue;
      const candidates = legalNodes(this.state.turn, this.state.nodeOrder).filter(node => !canDeploy(card, opponent.actions, this.state.turn, node, this.state.nodes[node].cards[1].length, legalNodes(this.state.turn, this.state.nodeOrder)));
      const tacticalScore = (node: number) => {
        const state = this.state.nodes[node];
        // Only opponent-owned identities and publicly revealed local Power are used.
        const own = state.cards[1].reduce((sum, placement) => sum + this.cardPower(placement, false), 0);
        const visibleEnemy = state.powers[0];
        const after = own + this.printedPower(card);
        const outcome = own <= visibleEnemy && after > visibleEnemy ? 3 : own <= visibleEnemy && after === visibleEnemy ? 1.5 : own < visibleEnemy ? .7 : .25;
        return 20 * outcome - state.cards[1].length * 3;
      };
      candidates.sort((a, b) => this.config.strategicMarket ? tacticalScore(b) - tacticalScore(a) || a - b : this.state.nodes[a].cards[1].length - this.state.nodes[b].cards[1].length || a - b);
      if (candidates.length) this.place(1, card.id, candidates[0]);
    }
  }

  endTurn(): void {
    if (this.state.phase !== "runtime" || this.queue.length) throw new Error("Finish the current resolution first.");
    this.planningSnapshot = null;
    this.opponentDeploy();
    this.state.phase = "reveal";
    this.enqueueRevealWindow();
    this.queue.push(() => this.enqueueRuntimeSchedule("end"));
    this.queue.push(() => {
      this.recalculate();
      const wins = this.locationWins();
      if (wins[0] !== wins[1]) this.state.priority = wins[0] > wins[1] ? 0 : 1;
      if (this.state.turn < 3) {
        const completedTurn = this.state.turn;
        this.queue.push(() => this.enqueueLocationSchedules(completedTurn));
        this.queue.push(() => this.enqueueLocationOngoing());
        this.state.turn++;
        this.relocatedThisTurn.clear();
        this.state.players.forEach(player => { player.actions = runtimeActions(this.state.turn, player.actions, player.pendingActions, this.config.carryover); player.pendingActions = 0; });
        // Opening-window effects resolve before the next planning boundary.
        // Actions earned here belong to the following Runtime turn.
        this.expireRuntimeTimers();
        if(this.runtimeTimers.size)this.queue.push(() => this.enqueueRuntimeSchedule("start", true));
        this.enqueueRevealWindow();
        this.queue.push(() => {
          this.state.phase = "runtime";
          return this.event("turn", `Runtime turn ${this.state.turn} planning begins.`);
        });
        return this.event("turn", `Runtime turn ${this.state.turn}. Node ${this.state.nodeOrder[this.state.turn + 1] + 1} opens.`);
      }
      this.state.phase = "collapse";
      this.collapseStartedNodes.clear(); this.collapseResolvedNodes.clear(); this.collapseEffectCards.clear();
      this.enqueueCollapse();
      return this.event("collapse", "Wave Collapse begins. Resolve Nodes 1 through 5.");
    });
  }

  private enqueueRevealWindow() {
    const ordered = revealOrder(this.state.nodes.flatMap(node => node.cards.flat()), this.state.turn, this.state.priority, legalNodes(this.state.turn, this.state.nodeOrder));
    for (const placement of ordered) {
      const revealEffects=this.printedHookEffects(placement.card, 'onReveal');
      const locationOnPlay=(this.state.nodes[placement.node]?.location?.onPlay?.length ?? 0) > 0;
      const runtimeOpening=placement.card.durationPeriod === "runtime" && ((placement.card.recurring?.length ?? 0)>0 || (placement.card.schedule ?? []).some(entry=>entry.at===1&&(entry.timing ?? "start")==="start") || revealEffects.some(effect=>effect.kind==="morph"));
      const followers=revealEffects.length+(locationOnPlay?1:0)+(runtimeOpening?1:0);
      this.queue.push(() => {
        placement.revealed = true;
        placement.revealSequence = ++this.revealCounter;
        if(placement.card.durationPeriod === "runtime") {
          const duration=placement.card.duration ?? 0;
          const timer:RuntimeTimer={placement,age:1,formStartAge:1,formExpiresAt:duration===99?Infinity:duration,morphTriggers:[]};
          this.rememberMorphTriggers(timer,placement.card);
          this.runtimeTimers.set(placement.card.id,timer);
        }
        this.recalculate();
        // This card's own reveal steps are still at the head of the queue; waiting triggers land after them.
        const triggered=this.claimNextRevealTriggers(placement);
        if(triggered.length)this.queue.splice(followers,0,...triggered);
        return this.event("reveal", `${placement.card.name} reveals.`, { node: placement.node, owner: placement.owner, cardId: placement.card.id });
      });
      for (const effect of revealEffects) this.queue.push(() => this.resolveEvaluationEffect(placement, effect));
      // Location on-play: when a card reveals here.
      if (locationOnPlay) {
        this.queue.push(() => this.enqueueLocationOnPlay(placement));
      }
      if(runtimeOpening)this.queue.push(()=>{
        const timer=this.runtimeTimers.get(placement.card.id);
        const effects=timer?this.scheduledEffects(timer,"start"):[];
        if(!effects.length)return this.event("bank",`${placement.card.name}: no opening Runtime effects.`);
        this.queue.unshift(...effects.slice(1).map(effect=>()=>effect.kind==="morph"?this.resolveMorph(placement,effect,true):this.resolveEvaluationEffect(placement,effect)));
        return effects[0].kind==="morph"?this.resolveMorph(placement,effects[0],true):this.resolveEvaluationEffect(placement,effects[0]);
      });
    }
  }

  private enqueueLocationOnPlay(placement: Deployment): RuntimeEvent {
    const location = this.state.nodes[placement.node]?.location;
    const effects = location?.onPlay ?? [];
    if (!effects.length) return this.event("reward", `${placement.card.name}: no Location on-play effects.`, { node: placement.node, owner: placement.owner, cardId: placement.card.id, source: "location", sourceName: location?.name, amount: 0 });
    // Resolve against the played card itself — not winner/loser.
    this.queue.unshift(...effects.map(effect => () => {
      const normalized = this.normalizeEffect(effect);
      // Board-side trash/boost/move/power; relation/board-host targets resolve against the played card.
      if (this.isLocationBoardEffect(normalized)) {
        return this.resolveLocationNodeEffect(placement.node, normalized, placement.owner);
      }
      const event = this.resolveEvaluationEffect(placement, normalized);
      return { ...event, source: "location" as const, sourceName: location!.name, node: placement.node };
    }));
    return this.event("reward", `${location!.name}: on-play for ${placement.card.name}.`, { node: placement.node, owner: placement.owner, cardId: placement.card.id, source: "location", sourceName: location!.name });
  }

  private enqueueLocationSchedules(completedTurn: number): RuntimeEvent {
    if (completedTurn < 2) return this.event("reward", "Location turn schedules never fire after turn 1.");
    const open = legalNodes(completedTurn, this.state.nodeOrder);
    const callbacks: (() => RuntimeEvent)[] = [];
    for (const node of open) {
      const location = this.state.nodes[node].location;
      for (const entry of location?.schedule ?? []) {
        if (entry.at !== completedTurn) continue;
        for (const effect of entry.effects) {
          const normalized = this.normalizeEffect(effect);
          callbacks.push(() => this.resolveLocationNodeEffect(node, normalized));
        }
      }
    }
    this.queue.unshift(...callbacks);
    return this.event("reward", callbacks.length ? `Location schedules resolve after turn ${completedTurn}.` : `No Location schedules after turn ${completedTurn}.`, { amount: callbacks.length });
  }

  private enqueueLocationOngoing(): RuntimeEvent {
    this.recalculate();
    const openTurn = Math.max(1, this.state.turn - 1);
    const open = legalNodes(openTurn, this.state.nodeOrder);
    const callbacks: (() => RuntimeEvent)[] = [];
    for (const node of open) {
      const location = this.state.nodes[node].location;
      if (!location?.ongoing?.length) continue;
      const winner = this.state.nodes[node].winner;
      for (const effect of location.ongoing) {
        const normalized = this.normalizeEffect(effect);
        if (this.isLocationBoardEffect(normalized)) {
          callbacks.push(() => this.resolveLocationNodeEffect(node, normalized));
          continue;
        }
        const loserOnly = effect.kind === "damageLoser" || (normalized.kind === "drain" && normalized.opponent);
        if (loserOnly) {
          if (winner !== null) callbacks.push(() => this.resolveLocationReward(node, winner, normalized));
        } else {
          for (const owner of winner === null ? [0, 1] as const : [winner]) callbacks.push(() => this.resolveLocationReward(node, owner, normalized));
        }
      }
    }
    this.queue.unshift(...callbacks);
    return this.event("reward", callbacks.length ? "Location ongoing effects resolve." : "No Location ongoing effects.", { amount: callbacks.length });
  }

  /** Node-wide Location effects that target board cards by side (trash lowest, boost, move, Power). */
  private resolveLocationNodeEffect(node: number, effect: EvaluationEffect, playedOwner?: PlayerId): RuntimeEvent {
    return this.resolveLocationBoardCardEffect(node, effect, playedOwner);
  }

  private locationSyntheticPlacement(node: number, owner: PlayerId): Deployment {
    const location = this.state.nodes[node].location!;
    return {
      card: { id: `location:${location.id}`, name: location.name, type: "Character", cost: 0, art: "", effect: location.reward },
      owner, node, order: 0, revealed: true,
    };
  }

  private boardSideOwners(node: number, side: NonNullable<EvaluationEffect["boardSide"]>, playedOwner?: PlayerId): PlayerId[] {
    const winner = this.state.nodes[node].winner;
    switch (side) {
      case "winner": return winner !== null ? [winner] : [];
      case "loser": return winner !== null ? [(1 - winner) as PlayerId] : [];
      case "played": return playedOwner !== undefined ? [playedOwner] : [];
      case "other": return playedOwner !== undefined ? [(1 - playedOwner) as PlayerId] : [];
      case "both":
      case "either":
        return [0, 1];
    }
  }

  private revealedOnSides(node: number, owners: readonly PlayerId[]): Deployment[] {
    return owners.flatMap(owner => this.state.nodes[node].cards[owner].filter(placement => placement.revealed));
  }

  private resolveLocationBoardCardEffect(node: number, effect: EvaluationEffect, playedOwner?: PlayerId): RuntimeEvent {
    const location = this.state.nodes[node].location!;
    const base = { node, source: "location" as const, sourceName: location.name };
    const side = effect.boardSide ?? (effect.kind === "boostPowerAtLocation" ? "both" : "either");
    const chooser = (playedOwner ?? this.state.nodes[node].winner ?? 0) as PlayerId;
    const source = this.locationSyntheticPlacement(node, chooser);
    const pick = effect.cardPick ?? "random";

    if (effect.kind === "boostPowerAtLocation") {
      const amount = effect.amount ?? 1;
      const owners = this.boardSideOwners(node, side, playedOwner);
      const targets = this.revealedOnSides(node, owners);
      if (!targets.length) return this.event("power", `${location.name}: No target.`, { ...base, amount: 0 });
      for (const target of targets) target.powerModifier = (target.powerModifier ?? 0) + amount;
      this.recalculate();
      return this.event("power", `${location.name}: +${amount} Power to ${targets.length} revealed card${targets.length === 1 ? "" : "s"} here.`, { ...base, amount, after: targets.length });
    }

    if (effect.kind === "trashAtLocation" || effect.kind === "destroyAtLocation") {
      const destroy = effect.kind === "destroyAtLocation";
      const zone = destroy ? "destroyed" as const : "trash" as const;
      const detail = destroy ? base : { ...base, target: "trash" as const };
      const count = Math.max(1, effect.amount ?? 1);
      const rank = effect.rank ?? "weakest";
      const owners = this.boardSideOwners(node, side, playedOwner);
      if (!owners.length) return this.event("trash", `${location.name}: No target.`, { ...detail, amount: 0 });
      const groups = side === "both" ? owners.map(owner => [owner]) : [owners];
      const hit: string[] = [], removed: string[] = [];
      for (const group of groups) {
        const revealed = this.revealedOnSides(node, group);
        const firstRevealed = (a: Deployment, b: Deployment) => (a.revealSequence ?? 0) - (b.revealSequence ?? 0) || a.order - b.order;
        const ranked = [...revealed].sort((a, b) =>
          rank === "first" ? firstRevealed(a, b)
            : (rank === "strongest" ? this.cardPower(b) - this.cardPower(a) : this.cardPower(a) - this.cardPower(b)) || firstRevealed(a, b));
        for (const target of ranked.slice(0, count)) {
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
      if (!hit.length && !removed.length) return this.event("trash", `${location.name}: No target.`, { ...detail, amount: 0 });
      const parts = [
        ...(hit.length ? [`${destroy ? "destroy" : "trash"} ${hit.join(", ")}`] : []),
        ...(removed.length ? [`${removed.join(", ")} ${removed.length === 1 ? "is" : "are"} removed from the game`] : []),
      ];
      return this.event("trash", `${location.name}: ${parts.join("; ")}.`, { ...detail, amount: hit.length + removed.length });
    }

    if (effect.kind === "moveCard" || effect.kind === "modifyPower") {
      if (effect.kind === "modifyPower" && !Number.isInteger(effect.amount)) throw new Error("Card Power modifier must be an integer.");
      const owners = this.boardSideOwners(node, side, playedOwner);
      if (!owners.length) return this.event(effect.kind === "moveCard" ? "move" : "power", `${location.name}: No target.`, { ...base, amount: 0 });

      // both → one card per side; otherwise one card from the pooled owners.
      const groups: PlayerId[][] = side === "both" ? owners.map(owner => [owner]) : [owners];
      if (pick === "choice") {
        const actionable = groups.filter(group => this.revealedOnSides(node, group).some(target =>
          target.revealed && !this.collapseResolvedNodes.has(target.node) &&
          (effect.kind === "modifyPower" || this.moveDestinations(target).length > 0)));
        if (!actionable.length) return this.event(effect.kind === "moveCard" ? "move" : "power", `${location.name}: No target.`, { ...base, amount: 0 });
        const [first, ...rest] = actionable;
        for (let i = rest.length - 1; i >= 0; i--) {
          this.queue.unshift(() => this.resolveLocationBoardCardEffectOnOwners(node, effect, rest[i], playedOwner));
        }
        return this.resolveLocationBoardCardEffectOnOwners(node, effect, first, playedOwner);
      }

      const selected: Deployment[] = [];
      for (const group of groups) {
        const candidates = this.revealedOnSides(node, group).filter(target =>
          target.revealed && !this.collapseResolvedNodes.has(target.node) &&
          (effect.kind === "modifyPower" || this.moveDestinations(target).length > 0));
        if (candidates.length) selected.push(candidates[Math.floor(this.config.random() * candidates.length)]);
      }
      if (!selected.length) return this.event(effect.kind === "moveCard" ? "move" : "power", `${location.name}: No target.`, { ...base, amount: 0 });
      const applyTo = (target: Deployment): RuntimeEvent => {
        if (effect.kind === "moveCard") return this.movePlacementRandom(source, target);
        const event = this.modifyPlacementPower(source, target, effect.amount!);
        return { ...event, source: "location", sourceName: location.name };
      };
      const [first, ...rest] = selected;
      for (const target of rest) this.queue.unshift(() => applyTo(target));
      return applyTo(first);
    }

    // Fallback: run as a winner/played-facing reward if somehow routed here.
    const owner = (playedOwner ?? this.state.nodes[node].winner ?? 0) as PlayerId;
    return this.resolveLocationReward(node, owner, effect);
  }

  private resolveLocationBoardCardEffectOnOwners(node: number, effect: EvaluationEffect, owners: PlayerId[], playedOwner?: PlayerId): RuntimeEvent {
    const location = this.state.nodes[node].location!;
    const base = { node, source: "location" as const, sourceName: location.name };
    if (effect.kind !== "moveCard" && effect.kind !== "modifyPower") return this.resolveLocationBoardCardEffect(node, effect, playedOwner);
    const pick = effect.cardPick ?? "random";
    const chooser = (playedOwner ?? this.state.nodes[node].winner ?? 0) as PlayerId;
    const source = this.locationSyntheticPlacement(node, chooser);
    const candidates = this.revealedOnSides(node, owners).filter(target =>
      target.revealed && !this.collapseResolvedNodes.has(target.node) &&
      (effect.kind === "modifyPower" || this.moveDestinations(target).length > 0));
    if (!candidates.length) return this.event(effect.kind === "moveCard" ? "move" : "power", `${location.name}: No target.`, { ...base, amount: 0 });
    const applyTo = (target: Deployment): RuntimeEvent => {
      if (effect.kind === "moveCard") {
        return pick === "choice" ? this.chooseMoveDestination(source, target) : this.movePlacementRandom(source, target);
      }
      const event = this.modifyPlacementPower(source, target, effect.amount!);
      return { ...event, source: "location", sourceName: location.name };
    };
    if (pick === "choice") {
      return this.requestChoice(source, `${location.name}: choose a revealed card to ${effect.kind === "moveCard" ? "move" : "change Power"}.`, candidates.map(target => ({
        id: `card-${target.card.id}`,
        label: `${target.card.name} · Node ${target.node + 1}`,
        card: this.choiceCard(target),
        resolve: () => applyTo(target),
      })));
    }
    return applyTo(candidates[Math.floor(this.config.random() * candidates.length)]);
  }

  private movePlacementRandom(source: Deployment, target: Deployment): RuntimeEvent {
    const destinations = this.moveDestinations(target);
    if (!destinations.length) return this.event("move", `${source.card.name}: No target.`, {
      owner: source.owner, cardId: source.card.id, targetCardId: target.card.id, targetOwner: target.owner,
      node: source.node >= 0 ? source.node : undefined, source: "location", sourceName: source.card.name, amount: 0,
    });
    const destination = destinations[Math.floor(this.config.random() * destinations.length)];
    const event = this.movePlacement(source, destination, target);
    return { ...event, source: "location", sourceName: source.card.name };
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
      let removed:Card|undefined;
      if(bank>=0)removed=player.bank.splice(bank,1)[0].card;
      for(const node of this.state.nodes){const index=node.cards[owner].findIndex(item=>item.card.id===id);if(index>=0)removed=node.cards[owner].splice(index,1)[0].card;}
      if(removed)this.retire(removed,owner,"discard");
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
      if(advance)timer.age++;
      const effects=this.scheduledEffects(timer,timing);
      callbacks.push(...effects.map(effect=>()=>this.resolveScheduledEffect(placement,effect,timing)));
    }
    this.queue.unshift(...callbacks);
    return this.event("bank",callbacks.length?`Scheduled ${timing}-of-turn effects resolve.`:"No scheduled Runtime effects.");
  }

  private resolveScheduledEffect(placement:Deployment,effect:EvaluationEffect,timing:"start"|"end"):RuntimeEvent {
    const active=this.state.players[placement.owner].bank.some(entry=>entry.card.id===placement.card.id)||this.state.nodes.some(node=>node.cards[placement.owner].some(item=>item.card.id===placement.card.id));
    if(!active)return this.event("bank",`${placement.card.name}: scheduled effect source is no longer active.`,{owner:placement.owner,cardId:placement.card.id,source:"card",sourceName:placement.card.name});
    if(effect.kind==="morph")return this.resolveMorph(placement,effect,true);
    if(effect.kind === "actions" && timing === "start") {
      const targetOwner=(effect.opponent ? 1-placement.owner : placement.owner) as PlayerId;
      const player=this.state.players[targetOwner], before=player.actions;
      player.actions+=effect.amount ?? 0;
      return this.event("actions",`${placement.card.name}: +${effect.amount ?? 0} Actions this Runtime turn.`,{owner:placement.owner,targetOwner,cardId:placement.card.id,source:"card",sourceName:placement.card.name,target:"actions",amount:effect.amount ?? 0,before,after:player.actions});
    }
    return this.resolveEvaluationEffect(placement,effect);
  }

  private requestChoice(placement: Deployment, prompt: string, options: (ChoiceOption & { resolve: () => RuntimeEvent })[], icon?: string): RuntimeEvent {
    return this.openChoice(placement, {
      prompt, icon,
      options: options.map(({ resolve: _resolve, ...option }) => option),
      resolve: ([id]) => options.find(option => option.id === id)!.resolve(),
    });
  }

  private openChoice(placement: Deployment, request: ChoiceRequest): RuntimeEvent {
    const { prompt, options, icon, groups, resolve } = request;
    const select = request.select && !(request.select.min === 1 && request.select.max === 1) ? request.select : undefined;
    if (!options.length) return this.event("choice", `${placement.card.name}: No target.`, { node: placement.node, owner: placement.owner, source: "card", sourceName: placement.card.name, amount: 0 });
    const shape = { options, ...(select ? { select } : {}), ...(groups?.length ? { groups } : {}) };
    if (placement.owner === 1) {
      const ids = this.randomSelection(shape);
      this.queue.unshift(() => resolve(ids));
      const labels = ids.map(id => options.find(option => option.id === id)!.label);
      return this.event("choice", `Opponent chooses: ${labels.join(", ") || "nothing"}.`, { node: placement.node, owner: 1, source: "card", sourceName: placement.card.name });
    }
    this.choiceResolver = resolve;
    this.state.choice = { id: ++this.serial, owner: placement.owner, prompt, sourceName: placement.card.name, node: placement.node, ...(icon ? { icon } : {}), ...shape, ...(request.transfer ? { transfer: request.transfer } : {}) };
    return this.event("choice", prompt, { node: placement.node, owner: placement.owner, source: "card", sourceName: placement.card.name });
  }

  private randomSelection(choice: Pick<RuntimeChoice, "options" | "select" | "groups">): string[] {
    const pick = <T>(items: T[]) => items[Math.floor(this.config.random() * items.length)];
    if (choice.groups) return choice.groups.map(group => pick(choice.options.filter(option => option.group === group.id)).id);
    if (!choice.select) return [pick(choice.options).id];
    const pool = [...choice.options];
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
    if (chosen.some(option => !option) || new Set(ids).size !== ids.length) throw new Error("Choose a legal option.");
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
    return { ...structuredClone(target.card), power: this.cardPower(target), ...(target.powerModifier ? { basePower: this.printedPower(target.card) } : {}) };
  }

  private resolveMorph(placement: Deployment, effect: EvaluationEffect, nextTurn=false): RuntimeEvent {
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
    const next={...structuredClone(definitions[index]),id};
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
        timer.formExpiresAt=next.duration===99?Infinity:next.durationPeriod==="runtime"&&next.duration ? timer.formStartAge+next.duration-1 : 0;
      }
      this.rememberMorphTriggers(timer,next);
    }else if(next.durationPeriod==="runtime"&&next.duration){
      const age=this.state.phase==="collapse"?0:1;
      const formStartAge=age+1;
      timer={placement:deployed??placement,age,formStartAge,formExpiresAt:next.duration===99?Infinity:formStartAge+next.duration-1,morphTriggers:[]};
      this.rememberMorphTriggers(timer,next);
      this.runtimeTimers.set(id,timer);
    }
    if(banked){
      if(this.runtimeTimers.has(id)||next.duration===99)banked.expiresCycle=undefined;
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

  private resolveEvaluationEffect(placement: Deployment, effect: EvaluationEffect): RuntimeEvent {
    effect = this.normalizeEffect(effect);
    // Hand costs run their own `then` once paid; next-reveal targets carry it on the waiting trigger.
    if (effect.then?.length && effect.kind !== "handDiscard" && effect.kind !== "handTrash" && effect.cardRelation !== "next") {
      const { then, ...head } = effect;
      return this.resolveChained(placement, then, () => this.resolveEvaluationEffect(placement, head));
    }
    if(effect.kind==="morph")return this.resolveMorph(placement,effect);
    if (effect.kind === "handDiscard" || effect.kind === "handTrash") return this.resolveHandSelection(placement, effect);
    if (effect.kind === "scry") return this.resolveScry(placement, effect.amount ?? 0, effect.opponent);
    if (effect.kind === "attachModifier") return this.resolveAttachModifier(placement, effect);
    if (effect.kind === "vp") {
      const { card, owner } = placement;
      const recipient = (effect.opponent ? 1 - owner : owner) as PlayerId;
      const player = this.state.players[recipient];
      this.refreshScores();
      const before = player.totalVP;
      player.rewardVP += effect.amount ?? 0;
      const source = card.id.startsWith("location:") ? "location" : card.id.startsWith("circuit:") ? "circuit" : null;
      if (source) this.rewardSources[recipient][source] += effect.amount ?? 0;
      this.refreshScores();
      return this.event("vp", `${card.name}: +${effect.amount ?? 0} VP.`, {
        node: placement.node >= 0 ? placement.node : undefined, owner, cardId: card.id, source: "card", sourceName: card.name,
        targetOwner: recipient, target: "vp", amount: effect.amount ?? 0, before, after: player.totalVP,
      });
    }
    if (effect.kind === "selfDestroyBackup") {
      const targetOwner = (effect.opponent ? 1 - placement.owner : placement.owner) as PlayerId;
      const player = this.state.players[targetOwner], before = player.servers.backup;
      player.servers.backup = 0;
      if(player.servers.primary===0 && this.state.phase!=="collapse")this.queue=[()=>this.gameOver("Both Servers destroyed by own effect.")];
      return this.event("drain", `${placement.card.name}: destroy ${targetOwner === placement.owner ? "your own" : "opponent"} Backup; no destruction VP.`, {owner:placement.owner,targetOwner,target:"backup",amount:before,before,after:0,source:"card",sourceName:placement.card.name,cardId:placement.card.id});
    }
    if (effect.kind === "gain") {
      const amount=effect.amount ?? 1;
      if(!Number.isInteger(amount) || amount<0 || amount>100)throw new Error("Gain count must be an integer from 0 to 100.");
      const definition=(this.config.content?.cards??EVALUATION_ALL_CARDS).find(card=>(card.definitionId ?? card.id)===effect.cardId || card.id===effect.cardId);
      if(!definition)throw new Error(`Gain definition unavailable: ${effect.cardId}`);
      const targetOwner=(effect.opponent ? 1-placement.owner : placement.owner) as PlayerId;
      const player=this.state.players[targetOwner];
      const before=player.hand.length;
      const cards=Array.from({length:amount},()=>({...structuredClone(definition),id:`${targetOwner}:generated-${++this.acquired}`}));
      if(effect.destination === "hand")player.hand.push(...cards);
      else if(effect.destination === "discard")player.discard.push(...cards);
      else player.draw.unshift(...cards);
      this.refreshScores();
      const destination=effect.destination === "hand" ? "hand" : effect.destination === "discard" ? "Discard" : "the top of the deck";
      return this.event("draw",`${placement.card.name}: gain ${amount} ${definition.name} to ${destination}.`,{owner:placement.owner,cardId:cards[0]?.id,definitionId:definition.definitionId,source:"card",sourceName:placement.card.name,amount,targetOwner,...(effect.destination === "hand" ? {target:"hand" as const,before,after:player.hand.length} : effect.destination === "discard" ? {target:"discard" as const} : {})});
    }
    if (effect.kind === "random") {
      const branches=effect.options ?? [];
      if (!branches.length) throw new Error("Random effect requires explicit branches.");
      const selected=branches[Math.floor(this.config.random()*branches.length)];
      this.queue.unshift(...selected.effects.map(next=>()=>this.resolveEvaluationEffect(placement,next)));
      return this.event("choice", `${placement.card.name}: random result ${selected.label}.`, {owner:placement.owner,source:"card",sourceName:placement.card.name});
    }

    if (["draw", "actions", "crypto", "drain", "restore"].includes(effect.kind)) return this.resolveEffect(placement, effect.kind as "draw" | "actions" | "crypto" | "drain" | "restore", effect.amount ?? 0, effect.target, effect.opponent);
    const { card, owner } = placement;
    const node = placement.node;
    const base = { node: node >= 0 ? node : undefined, owner, cardId: card.id, source: "card" as const, sourceName: card.name };
    if (effect.kind === "moveSelf") {
      const targets = this.moveDestinations(placement);
      return this.requestChoice(placement, `Move ${card.name} to another open Node.`, targets.map(target => ({ id: `node-${target}`, label: `Node ${target + 1}`, node: target, resolve: () => {
        return this.movePlacement(placement, target, placement);
      } })));
    }
    if (effect.kind === "moveCard" || effect.kind === "modifyPower" || effect.kind === "destroyCard") {
      if (effect.kind === "modifyPower" && !Number.isInteger(effect.amount)) throw new Error("Card Power modifier must be an integer.");
      const targetOwner = (effect.opponent ? 1 - owner : owner) as PlayerId;
      const eventKind = effect.kind === "moveCard" ? "move" : effect.kind === "destroyCard" ? "trash" : "power";
      if (effect.cardRelation === "next") return this.awaitNextReveal(placement, effect, targetOwner);
      if (effect.cardRelation === "previous") {
        const related = this.relatedPlayedCard(placement, targetOwner, effect.cardRelation);
        if (!related || !this.isCardTargetLegal(effect, related)) return this.event(eventKind, `${card.name}: No target.`, { ...base, targetOwner, amount: 0 });
        return this.applyCardTargetEffect(placement, effect, related);
      }
      const candidates = this.state.nodes.flatMap(state => state.cards[targetOwner]).filter(target => this.isCardTargetLegal(effect, target));
      if (!candidates.length) return this.event(eventKind, `${card.name}: No target.`, { ...base, targetOwner, amount: 0 });
      const verb = effect.kind === "moveCard" ? "move" : effect.kind === "destroyCard" ? "destroy" : "change Power";
      const options: (ChoiceOption & { resolve: () => RuntimeEvent })[] = candidates.map(target => ({
        id: `card-${target.card.id}`,
        label: `${target.card.name} · Node ${target.node + 1}`,
        card: this.choiceCard(target),
        resolve: () => this.applyCardTargetEffect(placement, effect, target),
      }));
      if (effect.optional) options.push({ id: "skip", label: "Skip", resolve: () => this.event("choice", `${card.name}: optional ${effect.kind === "modifyPower" ? "Power change" : verb} skipped.`, base) });
      return this.requestChoice(placement, `${card.name}: choose ${effect.opponent ? "an opponent" : "your"} revealed card to ${verb}.`, options);
    }
    if (effect.kind === "probability" || effect.kind === "transferPower") {
      if(!this.state.nodes[node]?.cards[owner].some(item=>item.card.id===card.id))return this.event("power",`${card.name}: No target.`,{...base,amount:0});
      const amount = effect.kind === "probability" ? (effect.amount ?? 5) / 5 : effect.amount ?? 1;
      const direction = effect.direction ?? "choice";
      const flow = transferFlow(effect);
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
    if (effect.kind === "trashSelf") {
      const lane=this.state.nodes[node]?.cards[owner];
      const index=lane?.findIndex(item=>item.card.id===card.id)??-1;
      const bank=this.state.players[owner].bank;
      const bankIndex=bank.findIndex(item=>item.card.id===card.id);
      if(index>=0)lane!.splice(index,1);
      else if(bankIndex>=0)bank.splice(bankIndex,1);
      else return this.event("trash",`${card.name}: No target.`,{...base,target:"trash",amount:0});
      this.stripModifiers(card);
      const trashed = this.retire(card, owner, "trash");
      this.recalculate(); this.refreshScores();
      return this.event("trash", trashed ? `${card.name} enters shared Trash.` : `${card.name} is removed from the game.`, { ...base, ...(trashed ? { target: "trash" as const } : {}), amount: 1 });
    }
    if (effect.kind === "stealCrypto") {
      /* The Crypto "wallet" is just the Crypto cards held in hand, so a steal takes them at
         random — picking deliberately would leak the rest of the opponent's hand. */
      const victim = (1 - owner) as PlayerId;
      const hand = this.state.players[victim].hand;
      const taken: Card[] = [];
      for (let remaining = effect.amount ?? 1; remaining > 0; remaining--) {
        const holdings = hand.map((item, index) => [item, index] as const).filter(([item]) => item.type === "Crypto");
        if (!holdings.length) break;
        const [, index] = holdings[Math.floor(this.config.random() * holdings.length)];
        taken.push(hand.splice(index, 1)[0]);
      }
      if (!taken.length) return this.event("crypto", `${card.name}: No target.`, { ...base, target: "hand", targetOwner: victim, amount: 0 });
      this.state.players[owner].hand.push(...taken);
      this.refreshScores();
      return this.event("crypto", `${card.name} steals ${taken.map(item => item.name).join(", ")} from ${victim === 0 ? "your" : "opponent"} wallet.`, { ...base, target: "hand", targetOwner: owner, amount: taken.length });
    }
    if (effect.kind === "bump") {
      // The Crypto wallet is the Crypto cards held in hand, as for Steal Crypto.
      const victim = (1 - owner) as PlayerId;
      const player = this.state.players[victim];
      const zone = effect.zone ?? "either";
      const zoneLabel = zone === "bank" ? "Effect Bank" : zone === "wallet" ? "Crypto wallet" : "Effect Bank or Crypto wallet";
      const whose = victim === 0 ? "your" : "the opponent's";
      const candidates = [
        ...(zone !== "wallet" ? player.bank.map(entry => ({ card: entry.card, from: "Effect Bank" })) : []),
        ...(zone !== "bank" ? player.hand.filter(item => item.type === "Crypto").map(item => ({ card: item, from: "Crypto wallet" })) : []),
      ];
      if (!candidates.length) return this.event("trash", `${card.name}: No target.`, { ...base, target: "discard", targetOwner: victim, amount: 0 });
      const count = Math.min(Math.max(1, effect.amount ?? 1), candidates.length);
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
        if (!bumped.length) return this.event("trash", `${card.name}: No target.`, { ...base, target: "discard", targetOwner: victim, amount: 0 });
        return this.event("trash", `${card.name} bumps ${bumped.map(entry => `${entry.name} from ${whose} ${entry.from}`).join(", ")} to Discard.`, { ...base, target: "discard", targetOwner: victim, amount: bumped.length });
      };
      if (effect.cardPick === "random") {
        const pool = [...candidates];
        return bump(Array.from({ length: count }, () => pool.splice(Math.floor(this.config.random() * pool.length), 1)[0].card.id));
      }
      return this.openChoice(placement, {
        prompt: `${card.name}: choose ${count === 1 ? "a card" : `${count} cards`} to bump from ${whose} ${zoneLabel} to Discard.`,
        options: candidates.map(entry => ({ id: entry.card.id, label: `${entry.card.name} · ${entry.from}`, card: structuredClone(entry.card) })),
        select: { min: count, max: count },
        resolve: ids => bump(ids),
      });
    }
    if (effect.kind === "mill") {
      const opponent = (1 - owner) as PlayerId;
      const milled = this.millToDiscard(opponent, effect.amount ?? 0);
      if (!milled) return this.event("trash", `${card.name}: No target.`, { ...base, target: "discard", targetOwner: opponent, amount: 0 });
      return this.event("trash", `${card.name}: mill ${milled} from ${opponent === 0 ? "your" : "opponent"} deck.`, { ...base, target: "discard", targetOwner: opponent, amount: milled });
    }
    if (effect.kind === "recover") {
      if (!this.state.trash.length) return this.event("trash", `${card.name}: No target.`, { ...base, target: "trash", amount: 0 });
      return this.requestChoice(placement, "Recover one card from shared Trash to your Discard.", this.state.trash.map(target => ({ id: target.id, label: target.name, card: structuredClone(target), resolve: () => {
      const index = this.state.trash.findIndex(item => item.id === target.id);
      if (index < 0) throw new Error("Card is no longer in shared Trash.");
      this.state.players[owner].discard.push(this.state.trash.splice(index, 1)[0]);
      this.recalculate();
      return this.event("trash", `${card.name} recovers ${target.name} to ${owner === 0 ? "your" : "opponent"} Discard.`, { ...base, target: "discard", targetOwner: owner, amount: 1 });
    } })));
    }
    if (effect.kind === "choice" && effect.options?.length) {
      return this.requestChoice(placement, `${card.name}: ${effect.prompt ?? "choose an effect."}`, effect.options.map(option => ({
        id: option.id,
        label: option.label,
        resolve: () => this.resolveChoiceEffects(placement, option.label, option.effects),
      })));
    }
    return this.requestChoice(placement, `${card.name}: choose an effect.`, [
      { id: "crypto", label: "+2 Crypto", resolve: () => this.resolveEffect(placement, "crypto", 2) },
      { id: "draw", label: "+1 Card", resolve: () => this.resolveEffect(placement, "draw", 1) },
    ]);
  }

  private moveDestinations(target: Deployment): number[] {
    if(!this.state.nodes[target.node]?.cards[target.owner].includes(target))return [];
    if (this.collapseResolvedNodes.has(target.node)) return [];
    return legalNodes(this.state.turn, this.state.nodeOrder).filter(node =>
      node !== target.node && !this.collapseStartedNodes.has(node) && this.state.nodes[node].cards[target.owner].length < 4);
  }

  /** Previously / next revealed card relative to the resolving card (by play order). */
  private relatedPlayedCard(source: Deployment, owner: PlayerId, relation: "previous" | "next"): Deployment | null {
    const ordered = this.state.nodes.flatMap(node => node.cards[owner])
      .filter(placement => placement.revealed && !this.collapseResolvedNodes.has(placement.node))
      .sort((a, b) => a.order - b.order);
    const index = ordered.findIndex(placement => placement.card.id === source.card.id);
    if (index >= 0) {
      const target = relation === "previous" ? ordered[index - 1] : ordered[index + 1];
      return target ?? null;
    }
    // Resolving from bank/location without being in the lane: previous = most recent, next = earliest.
    if (!ordered.length) return null;
    return relation === "previous" ? ordered[ordered.length - 1] : ordered[0];
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
    this.recalculate();
    return this.event("move", `${source === target ? target.card.name : `${source.card.name}: ${target.card.name}`} moves from Node ${from + 1} to Node ${destination + 1}.`, {
      node: source.node >= 0 ? source.node : undefined, owner: source.owner, cardId: source.card.id,
      targetCardId: target.card.id, targetOwner: target.owner, sourceNode: from, targetNode: destination,
      source: "card", sourceName: source.card.name,
    });
  }

  private isCardTargetLegal(effect: EvaluationEffect, target: Deployment): boolean {
    if (!target.revealed || this.collapseResolvedNodes.has(target.node)) return false;
    if (!this.state.nodes[target.node]?.cards[target.owner].includes(target)) return false;
    if (effect.kind === "moveCard") return this.moveDestinations(target).length > 0;
    if (effect.kind === "attachModifier") return target.card.type === "Character";
    return true;
  }

  private applyCardTargetEffect(source: Deployment, effect: EvaluationEffect, target: Deployment): RuntimeEvent {
    if (effect.kind === "moveCard") return this.chooseMoveDestination(source, target);
    if (effect.kind === "destroyCard") return this.destroyPlacement(source, target);
    if (effect.kind === "attachModifier") return this.resolveAttachModifier(source, effect, target.card);
    // Taking Power off an opponent card moves it onto this one rather than deleting it.
    const steal = Boolean(effect.opponent) && (effect.amount ?? 0) < 0;
    return this.modifyPlacementPower(source, target, effect.amount!, steal);
  }

  private destroyPlacement(source: Deployment, target: Deployment): RuntimeEvent {
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
    const destroyed = this.retire(target.card, target.owner, "destroyed");
    this.recalculate();
    this.refreshScores();
    return this.event("trash", destroyed ? `${source.card.name} destroys ${target.card.name}.` : `${source.card.name}: ${target.card.name} is removed from the game.`, { ...detail, amount: 1 });
  }

  private awaitNextReveal(source: Deployment, effect: EvaluationEffect, targetOwner: PlayerId): RuntimeEvent {
    this.nextRevealTriggers.push({ source, effect, targetOwner });
    return this.event("choice", `${source.card.name}: waiting for ${targetOwner === 0 ? "your" : "the opponent's"} next revealed card.`, {
      node: source.node >= 0 ? source.node : undefined, owner: source.owner, cardId: source.card.id, targetOwner, source: "card", sourceName: source.card.name,
    });
  }

  /** Claims the waiting triggers this reveal satisfies; each resolves after the revealed card's own reveal effects. */
  private claimNextRevealTriggers(revealed: Deployment): (() => RuntimeEvent)[] {
    const claimed = this.nextRevealTriggers.filter(trigger => trigger.targetOwner === revealed.owner && trigger.source.card.id !== revealed.card.id);
    if (!claimed.length) return [];
    this.nextRevealTriggers = this.nextRevealTriggers.filter(trigger => !claimed.includes(trigger));
    return claimed.map(trigger => () => {
      const { then, ...effect } = trigger.effect;
      const apply = () => this.isCardTargetLegal(effect, revealed)
        ? this.applyCardTargetEffect(trigger.source, effect, revealed)
        : this.event(effect.kind === "moveCard" ? "move" : effect.kind === "destroyCard" ? "trash" : "power", `${trigger.source.card.name}: No target.`, { owner: trigger.source.owner, targetOwner: revealed.owner, amount: 0, source: "card", sourceName: trigger.source.card.name });
      return then?.length ? this.resolveChained(trigger.source, then, apply) : apply();
    });
  }

  private modifyPlacementPower(source: Deployment, target: Deployment, amount: number, steal = false): RuntimeEvent {
    if (!this.state.nodes[target.node].cards[target.owner].includes(target) || !target.revealed || this.collapseResolvedNodes.has(target.node)) throw new Error("Selected card is no longer a legal Power target.");
    const before = this.cardPower(target, false);
    const after = Math.max(cardPowerFloor(target.card), before + amount);
    target.powerModifier = after - this.printedPower(target.card);
    /* A steal moves Power rather than destroying it, so the source card gains whatever the
       target actually lost — which is less than asked for when the target was nearly empty. */
    if (steal && this.state.nodes[source.node]?.cards[source.owner].includes(source)) {
      source.powerModifier = (source.powerModifier ?? 0) + (before - after);
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

  private resolveHandSelection(placement: Deployment, effect: EvaluationEffect): RuntimeEvent {
    const owner=placement.owner;
    const victim=(effect.opponent ? 1-owner : owner) as PlayerId;
    const chooser=(effect.chooser === "opponent" ? 1-owner : owner) as PlayerId;
    const player=this.state.players[victim];
    const maximum=effect.amount ?? 1;
    if(effect.optional && effect.then) {
      const options=[{id:"decline",label:"Decline",resolve:()=>this.event("choice",`${placement.card.name}: optional payment declined.`,{owner})}];
      if(player.hand.length>=maximum)options.push({id:"pay",label:`Discard ${maximum} cards`,resolve:()=>this.resolveHandSelection(placement,{...effect,optional:false,min:maximum})});
      return this.requestChoice({...placement,owner:chooser},`${placement.card.name}: pay the optional discard cost?`,options,"discard");
    }
    const minimum=effect.min ?? (effect.optional ? 0 : maximum);
    const finish=(selected:number) => {
      if(selected >= minimum)this.queue.unshift(...(effect.then ?? []).map(next=>()=>this.resolveEvaluationEffect(placement,next)));
      return this.event("choice", `${placement.card.name}: selection complete (${selected}).`, {owner,source:"card",sourceName:placement.card.name});
    };
    if(!player.hand.length) return finish(0);
    const verb=effect.kind === "handTrash" ? "trash" : "discard";
    const remove=(id:string)=>():RuntimeEvent=>{
      const index=player.hand.findIndex(item=>item.id===id);
      if(index<0)throw new Error("Selected card is no longer in hand.");
      const [removed]=player.hand.splice(index,1);
      if(effect.kind === "handTrash")this.state.trash.push(removed);else player.discard.push(removed);
      this.recalculate();
      this.refreshScores();
      return this.event("trash", `${placement.card.name}: ${removed.name} enters ${effect.kind === "handTrash" ? "shared Trash" : "Discard"}.`, {owner,cardId:placement.card.id,source:"card",sourceName:placement.card.name,targetOwner:victim,target:effect.kind === "handTrash" ? "trash" : "discard",amount:1});
    };
    // A hand smaller than the minimum is emptied, but the chained effects still require the full minimum.
    const max=Math.min(maximum, player.hand.length), min=Math.min(minimum, max);
    const count=min===max ? `${max}` : min ? `${min}–${max}` : `up to ${max}`;
    return this.openChoice({...placement,owner:chooser}, {
      prompt: `${placement.card.name}: select ${count} card${max===1?"":"s"} to ${verb}.`,
      options: player.hand.map(card=>({id:card.id,label:card.name,card:structuredClone(card)})),
      select: {min,max},
      icon: effect.kind === "handDiscard" ? "discard" : undefined,
      resolve: ids=>this.runSteps([...ids.map(remove),()=>finish(ids.length)]),
    });
  }

  private resolveScry(placement: Deployment, amount: number, opponent=false): RuntimeEvent {
    const viewer=(opponent ? 1-placement.owner : placement.owner) as PlayerId;
    const player=this.state.players[viewer];
    const cards=player.draw.slice(0,amount);
    if(!cards.length)return this.event("choice", `${placement.card.name}: No target.`,{owner:placement.owner,amount:0});
    const actions=new Map<string,{card:Card;action:"keep"|"discard"|"trash"}>();
    const options=cards.flatMap(card=>(["keep","discard","trash"] as const).map(action=>{
      const id=`${action}:${card.id}`;
      actions.set(id,{card,action});
      return {id,label:action[0].toUpperCase()+action.slice(1),group:card.id};
    }));
    const apply=({card,action}:{card:Card;action:"discard"|"trash"})=>():RuntimeEvent=>{
      player.draw=player.draw.filter(item=>item.id!==card.id);
      if(action==="discard")player.discard.push(card);else{this.state.trash.push(card);this.recalculate();}
      return this.event("trash",`${placement.card.name}: ${action} ${card.name}.`,{owner:placement.owner,targetOwner:viewer,target:action,amount:1});
    };
    return this.openChoice(placement, {
      prompt: `${placement.card.name}: inspect ${cards.length===1?cards[0].name:`the top ${cards.length} cards`}. Choose keep, discard, or trash for each.`,
      groups: cards.map(card=>({id:card.id,label:card.name,card:structuredClone(card)})),
      options,
      resolve: ids=>{
        const removals=ids.map(id=>actions.get(id)!).filter((entry):entry is {card:Card;action:"discard"|"trash"}=>entry.action!=="keep");
        return this.runSteps([...removals.map(apply),()=>this.event("choice",`${placement.card.name}: deck inspection complete.`,{owner:placement.owner})]);
      },
    });
  }

  private resolveAttachModifier(placement: Deployment, effect: EvaluationEffect, forcedHost?: Card): RuntimeEvent {
    const { card, owner } = placement;
    const beneficiary = (effect.opponent ? 1 - owner : owner) as PlayerId;
    const base = { node: placement.node >= 0 ? placement.node : undefined, owner, cardId: card.id, source: "card" as const, sourceName: card.name, targetOwner: beneficiary, amount: 0 };
    const apply = (host: Card): RuntimeEvent => {
      const modifier = {
        id: `mod-${++this.serial}`,
        kind: effect.modifier ?? 'doublePrintedEffects',
        ...(effect.modifier === 'powerAuraAtLocation' ? { amount: effect.amount ?? 1 } : {}),
        sourceName: card.name,
      } as const;
      host.modifiers = [...(host.modifiers ?? []), modifier];
      this.recalculate();
      const detail = modifier.kind === 'powerAuraAtLocation'
        ? `+${modifier.amount} Power aura at Location`
        : modifier.kind === 'movableEachTurn'
          ? 'movable each turn'
          : 'printed effects happen twice';
      return this.event("power", `${card.name}: attach ${detail} to ${host.name}.`, {
        ...base, amount: modifier.amount ?? 1, targetCardId: host.id,
      });
    };

    if (forcedHost) return apply(forcedHost);
    if (effect.boardHost || effect.cardRelation) {
      if (effect.cardRelation === 'next') return this.awaitNextReveal(placement, effect, beneficiary);
      if (effect.cardRelation === 'previous') {
        const related = this.relatedPlayedCard(placement, beneficiary, effect.cardRelation);
        if (!related || related.card.type !== 'Character') return this.event("power", `${card.name}: No target.`, base);
        return apply(related.card);
      }
      const candidates = this.state.nodes.flatMap(node => node.cards[beneficiary])
        .filter(target => target.revealed && target.card.type === 'Character' && !this.collapseResolvedNodes.has(target.node));
      if (!candidates.length) return this.event("power", `${card.name}: No target.`, base);
      return this.requestChoice(placement, `${card.name}: choose a revealed card to attach a modifier.`, candidates.map(target => ({
        id: `card-${target.card.id}`,
        label: `${target.card.name} · Node ${target.node + 1}`,
        card: this.choiceCard(target),
        resolve: () => apply(target.card),
      })));
    }

    const host = this.pickModifierHost(beneficiary, effect.cardId);
    if (!host) return this.event("power", `${card.name}: No target.`, base);
    return apply(host);
  }

  private pickModifierHost(owner: PlayerId, cardId?: string): Card | null {
    const player = this.state.players[owner];
    const zones = [player.draw, player.discard, player.hand];
    const matches = (card: Card) => card.type === 'Character' && (!cardId || (card.definitionId ?? card.id) === cardId || card.id === cardId);
    for (const zone of zones) {
      const candidates = zone.filter(matches);
      if (!candidates.length) continue;
      if (cardId) return candidates[0];
      return candidates[Math.floor(this.config.random() * candidates.length)];
    }
    return null;
  }

  private resolveChoiceEffects(placement: Deployment, label: string, effects: readonly EvaluationEffect[]): RuntimeEvent {
    if(!effects.length)return this.event("choice",`${placement.card.name}: ${label}.`,{owner:placement.owner});
    this.queue.unshift(...effects.slice(1).map(effect=>()=>this.resolveEvaluationEffect(placement,effect)));
    return this.resolveEvaluationEffect(placement,effects[0]);
  }

  private millToDiscard(owner: PlayerId, count: number) {
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
      player.discard.push(card);
      moved++;
    }
    return moved;
  }

  private applyTargetedServerEffect(servers: Servers, kind: "drain" | "restore", amount: number, target?: "primary" | "backup") {
    if (!target) return applyServerEffect(servers, kind, amount);
    const before = servers[target];
    const after = before === 0 ? 0 : kind === "drain" ? Math.max(0, before - amount) : Math.min(serverMaximums[target], before + amount);
    return {
      servers: { ...servers, [target]: after },
      target,
      amount: Math.abs(after - before),
      destructionVP: kind === "drain" && before > 0 && after === 0 ? (target === "primary" ? 8 : 12) : 0,
    };
  }

  private resolveEffect(placement: Deployment, kind: "draw" | "actions" | "crypto" | "drain" | "restore", amount: number, target?: "primary" | "backup", opponent=false): RuntimeEvent {
    const owner = placement.owner;
    const player = this.state.players[owner];
    const recipient=(opponent ? 1-owner : owner) as PlayerId;
    const credited=this.state.players[recipient];
    const base = { node: placement.node >= 0 ? placement.node : undefined, owner, cardId: placement.card.id, amount, source: "card" as const, sourceName: placement.card.name };
    if (kind === "draw") {
      const before = credited.hand.length;
      Object.assign(credited, drawCards(credited, amount, this.config.random));
      return this.event(kind, `${placement.card.name}: draw ${credited.hand.length - before}.`, { ...base, amount: credited.hand.length - before, before, after: credited.hand.length, targetOwner: recipient, target: "hand" });
    }
    if (kind === "actions") {
      const before = credited.pendingActions;
      credited.pendingActions += amount;
      return this.event(kind, `${placement.card.name}: +${amount} Action${amount === 1 ? "" : "s"} next Runtime turn.`, { ...base, before, after: credited.pendingActions, targetOwner: recipient, target: "actions" });
    }
    if (kind === "crypto") {
      const before = credited.wallet;
      credited.wallet += amount;
      return this.event(kind, `${placement.card.name}: +${amount} Crypto for Draft.`, { ...base, before, after: credited.wallet, targetOwner: recipient, target: "wallet" });
    }
    const targetPlayer = kind === "drain" ? this.state.players[1 - owner] : player;
    const result = this.applyTargetedServerEffect(targetPlayer.servers, kind, amount, target);
    const before = result.target ? targetPlayer.servers[result.target] : 0;
    targetPlayer.servers = result.servers;
    player.destructionVP += result.destructionVP;
    const output = this.event(kind, result.target ? `${placement.card.name}: ${kind === "drain" ? "Drain" : "Restore"} ${result.amount} at ${result.target} Server.${result.destructionVP ? ` +${result.destructionVP} destruction VP.` : ""}` : `${placement.card.name}: No target.`, { ...base, amount: result.amount, before, after: result.target ? result.servers[result.target] : 0, targetOwner: kind === "drain" ? (1 - owner) as PlayerId : owner, ...(result.target ? { target: result.target } : {}) });
    if (kind === "drain" && this.state.phase !== "collapse" && targetPlayer.servers.primary === 0 && targetPlayer.servers.backup === 0) {
      this.queue = [() => this.gameOver("Both Servers destroyed.")];
    }
    return output;
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
        for (const placement of cards) for (const effect of this.printedHookEffects(placement.card, 'onCollapse')) callbacks.push(() => this.resolveEvaluationEffect(placement, effect));
        this.queue.unshift(...callbacks);
        return this.event("collapse", callbacks.length ? "Card onCollapse effects resolve." : "No card onCollapse effects at this Node.", { node });
      });
      this.queue.push(() => {
        this.recalculate();
        const winner = this.state.nodes[node].winner;
        return this.event("power", winner === null ? "Node tied." : `${winner === 0 ? "You" : "Opponent"} control this Node.`, { node, ...(winner !== null ? { owner: winner } : {}) });
      });
      this.queue.push(() => {
        const location = this.state.nodes[node].location;
        const winner = this.state.nodes[node].winner;
        const events: (() => RuntimeEvent)[] = [];
        for (const effect of location?.effects ?? []) {
          const normalized = this.normalizeEffect(effect);
          if (this.isLocationBoardEffect(normalized)) {
            events.push(() => this.resolveLocationNodeEffect(node, normalized));
            continue;
          }
          const loserOnly = effect.kind === "damageLoser" || (normalized.kind === "drain" && normalized.opponent);
          if (loserOnly) {
            if (winner !== null) events.push(() => this.resolveLocationReward(node, winner, normalized));
          } else {
            for (const owner of winner === null ? [0, 1] as const : [winner]) events.push(() => this.resolveLocationReward(node, owner, normalized));
          }
        }
        // Finish every effect and award at this Node before applying the lethal
        // Collapse barrier. Later Node, Bank and Circuit callbacks are discarded.
        events.push(() => {
          this.collapseResolvedNodes.add(node);
          if (this.state.players.some(player => player.servers.primary === 0 && player.servers.backup === 0)) return {...this.gameOver(`Both Servers destroyed during Node ${node + 1}. Current Node awards complete.`),node,stage:"node-close"};
          return this.event("reward", location?.effects ? `${location.name} resolved.` : "Location Reward unresolved: approved content required.", { node, source: "location", sourceName: location?.name, stage: "node-close" });
        });
        this.queue.unshift(...events);
        return this.event("reward", location?.effects ? `${location.name}: ${winner === null ? "tied Node" : winner === 0 ? "your reward" : "opponent reward"}.` : "Location Reward requires approved content.", { node, source: "location", sourceName: location?.name, stage: "node-award" });
      });
    }
    this.queue.push(() => {
      const callbacks: (() => RuntimeEvent)[] = [];
      const entries = this.state.players.flatMap((player, owner) => player.bank.map(entry => ({ ...entry, owner: owner as PlayerId }))).sort((a, b) => a.order - b.order);
      for (const entry of entries) for (const effect of this.printedHookEffects(entry.card, 'onCollapse')) callbacks.push(() => this.resolveEvaluationEffect({ card: entry.card, owner: entry.owner, node: -1, order: entry.order, revealed: true }, effect));
      if (!entries.length) return this.event("collapse", "No Duration cards in the Effect Bank after Node 5.");
      callbacks.push(() => this.state.players.some(player => player.servers.primary === 0 && player.servers.backup === 0) ? this.gameOver("Both Servers destroyed during Effect Bank resolution.") : this.event("bank", "Effect Bank resolution complete."));
      this.queue.unshift(...callbacks);
      return this.event("collapse", "Effect Bank resolves after Node 5, oldest first.");
    });
    this.queue.push(() => {
      this.state.selectedNode = null;
      const wins = this.locationWins();
      const winner = nodeWinner(wins);
      this.state.circuitEligible = winner === null ? [0, 1] : [winner];
      const rewards=this.config.content?.circuitRewards??EVALUATION_CIRCUIT_REWARDS;
      const definition = this.config.evaluationContent ? structuredClone(rewards[Math.floor(this.config.random() * rewards.length)]) : null;
      this.state.circuitReward = { definition, claimed: [] };
      const visibleName = this.state.circuitEligible.includes(0) ? definition?.name : undefined;
      return this.event("circuit", `Locations won ${wins[0]}–${wins[1]}. ${winner === null ? "Both players are eligible" : winner === 0 ? "You are eligible" : "Opponent is eligible"}${definition ? visibleName ? ` for ${visibleName}.` : " for a private Circuit Reward." : "; reward content unresolved."}`, { source: "circuit", sourceName: visibleName });
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
          else if ((placement.card.duration || this.runtimeTimers.has(placement.card.id)) && player.bank.length < 4) player.bank.push({ card: placement.card, enteredCycle: this.state.cycle, expiresCycle: this.runtimeTimers.has(placement.card.id) || placement.card.duration === 99 || placement.card.durationPeriod === "runtime" ? undefined : this.state.cycle + placement.card.duration! - 1, order: placement.order });
          else player.discard.push(placement.card);
        }
        this.state.nodes.forEach(node => { node.cards[owner] = []; });
        const expired = player.bank.filter(entry => entry.expiresCycle !== undefined && entry.expiresCycle <= this.state.cycle);
        player.discard.push(...expired.map(entry => entry.card));
        player.bank = player.bank.filter(entry => !expired.includes(entry));
        player.pendingActions = 0;
      });
      // Build this queue now, after all Location draws and cleanup. Capturing the
      // hand while initially constructing Collapse would omit Signal tower draws.
      this.enqueueDraftTransition();
      return this.event("collapse", "End of Cycle. Deployed cards and remaining non-Crypto hand enter Discard.");
    });
  }

  private resolveLocationReward(node: number, owner: PlayerId, effect: LocationRewardEffect): RuntimeEvent {
    const location = this.state.nodes[node].location!;
    const placement: Deployment = {
      card: { id: `location:${location.id}`, name: location.name, type: "Character", cost: 0, art: "", effect: location.reward },
      owner, node, order: 0, revealed: true,
    };
    const event = this.resolveEvaluationEffect(placement, this.normalizeEffect(effect));
    return { ...event, source: "location", sourceName: location.name, node };
  }

  private enqueueDraftTransition() {
    this.state.players.forEach((player, owner) => {
      for (const card of player.hand) {
        if (card.type !== "Crypto") continue;
        for (const effect of card.cryptoValue !== undefined ? [{ kind: "crypto", amount: card.cryptoValue }] : starterEffects[card.name] ?? []) {
          if (effect.kind !== "crypto") continue;
          this.queue.push(() => {
            const before = player.wallet;
            player.wallet += effect.amount;
            return this.event("crypto", `${card.name} auto-resolves: +${effect.amount} Crypto for Draft.`, { owner: owner as PlayerId, targetOwner: owner as PlayerId, cardId: card.id, source: "card", sourceName: card.name, target: "wallet", amount: effect.amount, before, after: player.wallet });
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
    this.state.draftEndsAt = Date.now() + 90_000;
    this.state.draftEnded = false;
    this.state.draftReady = [false, !this.config.strategicMarket];
    this.purchaseTimes.clear(); this.botDraftAt = 0;
    if (this.config.strategicMarket) {
      const persistent = this.state.market.filter(pile => pile.category !== "Chaos" && !pile.rotating);
      const stableBaseIds = new Set(persistent.filter(pile => pile.category === "Base").map(pile => pile.card.definitionId ?? pile.card.id));
      this.state.market = [
        ...persistent,
        ...baseOffer(this.config.random, this.config.content, stableBaseIds),
        ...chaosOffer(this.config.random, this.config.content),
      ];
    }
    if (this.state.circuitReward.definition && this.state.circuitEligible.includes(1)) this.queue.push(() => this.applyCircuitClaim(1));
    return this.event("draft", "Draft begins. Held Crypto resolves into Wallet; hand and deployed cards enter Discard.");
  }

  step(): { event: RuntimeEvent; view: SessionView } | null {
    if (this.state.choice) return null;
    const next = this.queue.shift();
    if (!next) return null;
    const event = next();
    return { event, view: this.view() };
  }

  claimCircuitReward(owner: PlayerId = 0, now = Date.now()): RuntimeEvent {
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
    const effects=slot.definition.effects??[slot.definition.effect];
    if(!effects.length)throw new Error("Circuit Reward has no effect recipes.");
    slot.claimed.push(owner);
    const name = this.state.circuitEligible.includes(0) ? slot.definition.name : "a private Circuit Reward";
    this.queue.unshift(...effects.slice(1).map(effect=>()=>this.resolveCircuitEffect(owner,name,effect)));
    return this.resolveCircuitEffect(owner,name,effects[0]);
  }

  private resolveCircuitEffect(owner:PlayerId,name:string,effect:CircuitRewardDefinition['effect']):RuntimeEvent {
    const placement: Deployment = {
      card: { id: `circuit:${name}`, name, type: "Character", cost: 0, art: "", effect: name },
      owner, node: -1, order: 0, revealed: true,
    };
    const event = this.resolveEvaluationEffect(placement, this.normalizeEffect(effect));
    return { ...event, source: "circuit", sourceName: name };
  }

  buy(pileId: string, now = Date.now(), owner: PlayerId = 0): RuntimeEvent {
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
    this.refreshScores();
    return this.event("purchase", `${owner === 0 ? "You acquire" : "Opponent acquires"} ${pile.card.name} to Discard for ${cost} Crypto.`, { owner, targetOwner: owner, cardId: card.id, definitionId: card.definitionId, target: "wallet", amount: cost, before: player.wallet + cost, after: player.wallet });
  }

  endDraft(owner: PlayerId = 0): RuntimeEvent {
    if (this.state.phase !== "draft" || this.queue.length) throw new Error("Draft is not active.");
    this.state.draftReady[owner] = true;
    if (!this.config.strategicMarket) this.state.draftReady[1] = true;
    this.state.draftEnded = this.state.draftReady.every(Boolean);
    return this.event("draft", this.state.draftEnded ? "Both players ended Draft." : `${owner === 0 ? "You ended" : "Opponent ended"} Draft.`, { owner });
  }

  undoEndDraft(owner: PlayerId = 0, now = Date.now()): RuntimeEvent {
    if (this.state.phase !== "draft" || !this.state.draftReady[owner] || this.state.draftReady[1 - owner] || this.state.draftEndsAt === null || now >= this.state.draftEndsAt) throw new Error("Draft readiness can no longer be undone.");
    this.state.draftReady[owner] = false; this.state.draftEnded = false;
    return this.event("draft", `${owner === 0 ? "You resume" : "Opponent resumes"} Draft.`, { owner });
  }

  expireDraft(now = Date.now()): RuntimeEvent | null {
    if (this.state.phase !== "draft" || this.state.draftEnded || this.queue.length || this.state.draftEndsAt === null || now < this.state.draftEndsAt || this.state.choice) return null;
    this.state.draftReady = [true, true]; this.state.draftEnded = true;
    return this.event("draft", "Draft time expired. Both players are ready for the next Cycle.");
  }

  opponentDraftStep(now = Date.now()): RuntimeEvent | null {
    if (!this.config.strategicMarket || this.state.phase !== "draft" || this.queue.length || this.state.choice || this.state.draftReady[1] || now < this.botDraftAt) return null;
    const expired = this.expireDraft(now); if (expired) return expired;
    this.botDraftAt = now + 1400;
    const player = this.state.players[1];
    const owned = [...player.draw, ...player.hand, ...player.discard, ...player.bank.map(entry => entry.card)];
    const affordable = this.state.market.filter(pile => (pile.remaining ? pile.remaining[1] : pile.supply) > 0 && pile.card.cost <= player.wallet);
    const legal = affordable.filter(pile => now - (this.purchaseTimes.get(`1:${pile.id}`) ?? -Infinity) >= 2000);
    if (!legal.length) return affordable.length ? null : this.endDraft(1);
    const utility: Record<string, number> = { "chronos-cache": 10, "temporal-rift": 8, "quantum-telemetry": 8, "root-rune": 8, "code-sniper": 9, "shiva-of-cern": 11, "node-feratu": 9, "1337-speaker": 9, "nyx-luna": 7 };
    const score = (card: Card) => {
      const count = owned.filter(item => item.name === card.name).length;
      const income = owned.filter(item => item.type === "Crypto").length;
      return (this.state.cycle >= 10 && card.vp ? card.vp * 4 : card.type === "Crypto" ? (income < 4 ? 9 : 2) : utility[card.definitionId ?? ""] ?? (card.power ?? 0) + (card.duration ? 4 : 0)) / (1 + count * 1.8) + card.cost * .1;
    };
    legal.sort((a, b) => score(b.card) - score(a.card) || a.id.localeCompare(b.id));
    return this.buy(legal[0].id, now, 1);
  }

  nextCycle(): RuntimeEvent {
    if (this.state.phase !== "draft" || !this.state.draftEnded || this.queue.length || this.state.choice) throw new Error("End Draft and finish resolution before advancing.");
    if (this.state.cycle >= 16) return this.gameOver("Cycle 16 final Draft complete.");
    this.expireRuntimeTimers();
    this.state.cycle++;
    this.state.turn = 1;
    this.relocatedThisTurn.clear();
    this.state.selectedNode = null;
    this.state.circuitEligible = [];
    this.state.circuitReward = { definition: null, claimed: [] };
    this.randomizeBoard();
    this.setupEvaluationLocations();
    this.state.draftEndsAt = null;
    this.state.draftEnded = false;
    this.state.draftReady = [false, false];
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
    this.state.phase="gameover";this.state.winner=(1-owner) as PlayerId;
    this.state.endedReason="Automatic concession after two consecutive no-input Runtime turns.";
    return this.event("gameover",this.state.endedReason,{owner});
  }

  private gameOver(reason: string): RuntimeEvent {
    this.refreshScores();
    this.state.phase = "gameover";
    const [local, opponent] = this.state.players.map(player => player.totalVP);
    this.state.winner = nodeWinner([local, opponent]);
    this.state.endedReason = `${reason} ${local === opponent ? "Tie" : local > opponent ? "You win" : "Opponent wins"}, ${local} to ${opponent} VP.`;
    this.queue = []; this.state.choice = null; this.choiceResolver = null;
    return this.event("gameover", this.state.endedReason);
  }
}
