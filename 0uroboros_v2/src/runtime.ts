import { EVALUATION_ALL_CARDS, createStrategicMarket, baseOffer, chaosOffer, type MarketPile } from "./evaluationMarket";
import { EVALUATION_LOCATIONS, EVALUATION_CIRCUIT_REWARDS, type LocationRewardEffect, type CircuitRewardDefinition } from "./content";
import type { CompiledContent } from './authoring/contentModel';
import {
  type Card, type EvaluationEffect, type PlayerId, type RandomSource, type Deployment, type DataCenters,
  applyDataCenterEffect, dataCenterMaximums, drawCards,
  initialWeights, legalNodes, mirroredOpening, nodeWinner,
  revealOrder, runtimeActions, starterEffects, canDeploy,
  shuffleCards, effectiveCardPower,
} from "./game";

export type SessionPhase = "runtime" | "reveal" | "collapse" | "draft" | "gameover";
export type LocationDefinition = { id: string; name: string; rule: string; reward: string; effects?: readonly LocationRewardEffect[] };
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
export type RuntimeChoice = { id: number; owner: PlayerId; prompt: string; sourceName: string; node?: number; options: { id: string; label: string }[] };
export type PlayerState = {
  bank: BankEntry[];
  draw: Card[]; hand: Card[]; discard: Card[]; destroyed: Card[];
  actions: number; pendingActions: number; wallet: number;
  centers: DataCenters; destructionVP: number; rewardVP: number; totalVP: number;
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
export type SessionView = Omit<SessionState, "players" | "nodes" | "nodeOrder"> & {
  openNodes: number[];
  canUndoPlanning: boolean;
  planningCardIds: string[];
  players: [Omit<PlayerState, "draw"> & { draw: { id: string; hidden: true }[] }, Omit<PlayerState, "draw" | "hand"> & { draw: { id: string; hidden: true }[]; hand: { id: string; hidden: true }[] }];
  nodes: (Omit<NodeState, "cards"> & { cards: [VisiblePlacement[], VisiblePlacement[]] })[];
};

type MorphTrigger = { effect: EvaluationEffect; cadence: "recurring" | "scheduled"; origin: string; sourceStartAge: number; slot: string; at?: number; timing?: "start" | "end"; expiresAt: number };
type RuntimeTimer = { placement: Deployment; age: number; formStartAge: number; formExpiresAt: number; morphTriggers: MorphTrigger[] };

export function seededRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

export function createSession(config: SessionConfig): RuntimeSession { return new RuntimeSession(config); }

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
  private choices = new Map<string, () => RuntimeEvent>();
  private botDraftAt = 0;
  private runtimeTimers = new Map<string, RuntimeTimer>();
  private morphProgress = new Map<string, Map<string, number>>();
  private collapseStartedNodes = new Set<number>();
  private collapseResolvedNodes = new Set<number>();
  private collapseEffectCards = new Set<string>();
  private planningSnapshot: { hand: Card[]; actions: number; nodes: Deployment[][]; order: number } | null = null;

  constructor(config: SessionConfig) {
    if (typeof config.carryover !== "boolean" || !["higher", "lower"].includes(config.priorityPreference)) throw new Error("Explicit Action carryover and priority policy are required.");
    if (config.practiceMarket?.some(card => !starterEffects[card.name])) throw new Error("Practice market only supports the canonical starter cards.");
    this.config = { ...config, content: config.content ? structuredClone(config.content) : undefined };
    const opening = mirroredOpening(config.random);
    if (this.config.content) {
      const aliases:Record<string,string>={slash:'slash-dot',dash:'dash',dot:'dot',razor:'rezz-razor',blade:'rezz-blade','byte-1':'byte-coin','byte-2':'byte-coin',kilo:'kilo-coin','vault-1':'vault-encryption','vault-2':'vault-encryption'};
      for(const zones of opening)for(const zone of ['hand','draw'] as const)zones[zone]=zones[zone].map(card=>{
        const definition=this.config.content!.cards.find(entry=>(entry.definitionId??entry.id)===aliases[card.id.slice(2)]);
        if(!definition)throw new Error(`Starting card ${card.name} is missing from saved content.`);
        return {...structuredClone(definition),id:card.id};
      });
    }
    const player = (owner: PlayerId): PlayerState => ({ ...opening[owner], destroyed: [], bank: [], actions: 2, pendingActions: 0, wallet: 0, centers: { ...dataCenterMaximums }, destructionVP: 0, rewardVP: 0, totalVP: 4 });
    this.state = {
      phase: "runtime", turn: 1, cycle: 1, priority: config.random() < 0.5 ? 0 : 1,
      players: [player(0), player(1)],
      nodes: Array.from({ length: 5 }, (_, i) => ({ cards: [[], []], location: config.locations?.[i] ?? null, powerModifiers: [0, 0], powers: [0, 0], winner: null })),
      nodeOrder: [0,1,2,3,4], weights: [...initialWeights], selectedNode: null, circuitEligible: [], circuitReward: { definition: null, claimed: [] },
      market: config.strategicMarket ? createStrategicMarket(this.config.content) : (config.practiceMarket ?? []).map((card, i) => ({ id: `practice-${i}`, card: { ...card }, category: "Base", supply: 8 })),
      trash: [], choice: null, draftReady: [false, false],
      unresolved: [...(config.strategicMarket ? ["Market additions are provisional evaluation content, not final balance."] : ["Complete approved market content is unavailable."]), ...(config.evaluationContent ? [] : ["Location mechanics and Location Rewards are not implemented without approved content.", "Circuit Reward content is unavailable; only eligibility is computed."])],
      endedReason: null, winner: null, draftEndsAt: null, draftEnded: false,
    };
    this.randomizeBoard();
    this.setupEvaluationLocations();
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
    this.state.nodes.forEach((node, i) => { node.location = locations[i]; });
  }

  get pendingCount() { return this.state.choice ? 0 : this.queue.length; }

  view(): SessionView {
    this.refreshScores();
    const {nodeOrder, ...snapshot} = structuredClone(this.state);
    const view = {...snapshot, openNodes: legalNodes(this.state.turn,nodeOrder), canUndoPlanning: this.state.phase === "runtime" && !this.queue.length && !!this.planningSnapshot, planningCardIds: this.planningSnapshot ? this.state.nodes.flatMap(node => node.cards[0]).filter(card => card.order > this.planningSnapshot!.order).map(card => card.card.id) : []} as unknown as SessionView;
    if (!this.state.circuitEligible.includes(0)) view.circuitReward.definition = null;
    view.players.forEach(player=>player.bank.forEach(entry=>{const timer=this.runtimeTimers.get(entry.card.id);if(timer&&Number.isFinite(this.timerUntil(timer)))entry.remainingTurns=Math.max(0,this.timerUntil(timer)-timer.age);}));
    const hidden = (_card: Card, index: number) => ({ id: `hidden-${index}`, hidden: true as const });
    view.players[0].draw = this.state.players[0].draw.map(hidden);
    view.players[1].draw = this.state.players[1].draw.map(hidden);
    view.players[1].hand = this.state.players[1].hand.map(hidden);
    const visiblePower = (placement: Deployment): VisiblePlacement => ({
      ...structuredClone(placement),
      card: placement.revealed ? {
        ...placement.card,
        power: effectiveCardPower(placement),
        ...(placement.powerModifier ? { basePower: placement.card.power ?? 0 } : {}),
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
    return { id: ++this.serial, kind, text, ...detail };
  }

  private refreshScores() {
    this.state.players.forEach((player, owner) => {
      const active = [...player.draw, ...player.hand, ...player.discard, ...player.bank.map(entry => entry.card), ...this.state.nodes.flatMap(node => node.cards[owner].map(placement => placement.card))];
      player.totalVP = player.destructionVP + player.rewardVP + active.reduce((sum, card) => sum + (card.vp ?? (card.name === "Vault Encryption" ? 2 : 0)), 0);
    });
  }

  private locationWins(): [number, number] {
    return [this.state.nodes.filter(node => node.winner === 0).length, this.state.nodes.filter(node => node.winner === 1).length];
  }

  private recalculate() {
    this.state.nodes.forEach(node => {
      node.powers = node.cards.map((cards, owner) => cards.reduce((sum, placement) => sum + (placement.revealed ? effectiveCardPower(placement) : 0), node.powerModifiers[owner])) as [number, number];
      node.winner = nodeWinner(node.powers);
    });
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
      ...(timing === "start" && formAge>=1 ? card.recurring ?? [] : []),
      ...(card.schedule ?? []).filter(entry => entry.at === formAge && (entry.timing ?? "start") === timing).flatMap(entry => entry.effects),
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
        const own = state.cards[1].reduce((sum, placement) => sum + effectiveCardPower(placement), 0);
        const visibleEnemy = state.powers[0];
        const after = own + (card.power ?? 0);
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
        this.state.turn++;
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
      this.queue.push(() => {
        placement.revealed = true;
        if(placement.card.durationPeriod === "runtime") {
          const duration=placement.card.duration ?? 0;
          const timer:RuntimeTimer={placement,age:1,formStartAge:1,formExpiresAt:duration===99?Infinity:duration,morphTriggers:[]};
          this.rememberMorphTriggers(timer,placement.card);
          this.runtimeTimers.set(placement.card.id,timer);
        }
        this.recalculate();
        return this.event("reveal", `${placement.card.name} reveals.`, { node: placement.node, owner: placement.owner, cardId: placement.card.id });
      });
      const revealEffects=placement.card.onReveal ?? starterEffects[placement.card.name] ?? [];
      for (const effect of revealEffects) this.queue.push(() => this.resolveEvaluationEffect(placement, effect));
      if(placement.card.durationPeriod === "runtime" && ((placement.card.recurring?.length ?? 0)>0 || (placement.card.schedule ?? []).some(entry=>entry.at===1&&(entry.timing ?? "start")==="start") || revealEffects.some(effect=>effect.kind==="morph")))this.queue.push(()=>{
        const timer=this.runtimeTimers.get(placement.card.id);
        const effects=timer?this.scheduledEffects(timer,"start"):[];
        if(!effects.length)return this.event("bank",`${placement.card.name}: no opening Runtime effects.`);
        this.queue.unshift(...effects.slice(1).map(effect=>()=>effect.kind==="morph"?this.resolveMorph(placement,effect,true):this.resolveEvaluationEffect(placement,effect)));
        return effects[0].kind==="morph"?this.resolveMorph(placement,effects[0],true):this.resolveEvaluationEffect(placement,effects[0]);
      });
    }
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
      if(removed)player.discard.push(removed);
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

  private requestChoice(placement: Deployment, prompt: string, options: { id: string; label: string; resolve: () => RuntimeEvent }[]): RuntimeEvent {
    if (!options.length) return this.event("choice", `${placement.card.name}: no legal option; no effect.`, { node: placement.node, owner: placement.owner, source: "card", sourceName: placement.card.name });
    if (placement.owner === 1) {
      const selected = options[Math.floor(this.config.random() * options.length)];
      this.queue.unshift(selected.resolve);
      return this.event("choice", `Opponent chooses: ${selected.label}.`, { node: placement.node, owner: 1, source: "card", sourceName: placement.card.name });
    }
    this.choices = new Map(options.map(option => [option.id, option.resolve]));
    this.state.choice = { id: ++this.serial, owner: placement.owner, prompt, sourceName: placement.card.name, node: placement.node, options: options.map(({ id, label }) => ({ id, label })) };
    return this.event("choice", prompt, { node: placement.node, owner: placement.owner, source: "card", sourceName: placement.card.name });
  }

  choose(optionId: string, owner: PlayerId = 0): RuntimeEvent {
    if (!this.state.choice || this.state.choice.owner !== owner) throw new Error("No choice is pending for this player.");
    const resolve = this.choices.get(optionId);
    if (!resolve) throw new Error("Choose a legal option.");
    this.state.choice = null; this.choices.clear();
    const event = resolve();
    this.refreshScores();
    return event;
  }

  resolveChoiceTimeout(): RuntimeEvent {
    if (!this.state.choice) throw new Error("No mandatory choice is pending.");
    const choice = this.state.choice;
    const option = choice.options[Math.floor(this.config.random() * choice.options.length)];
    return this.choose(option.id, choice.owner);
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
    const before=deployed?effectiveCardPower(deployed):current.power??0;
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
    const after=deployed?effectiveCardPower(deployed):next.power??0;
    return this.event("morph",`${current.name} morphs into ${next.name}.`,{
      node:deployed?.node,owner,cardId:id,targetCardId:id,definitionId:next.definitionId??next.id,targetOwner:owner,
      source:"card",sourceName:current.name,before,after,
    });
  }

  private resolveEvaluationEffect(placement: Deployment, effect: EvaluationEffect): RuntimeEvent {
    if(effect.kind==="morph")return this.resolveMorph(placement,effect);
    if (effect.kind === "handDiscard" || effect.kind === "handTrash") return this.resolveHandSelection(placement, effect);
    if (effect.kind === "scry") return this.resolveScry(placement, effect.amount ?? 0);
    if (effect.kind === "selfDestroyBackup") {
      const player = this.state.players[placement.owner], before = player.centers.backup;
      player.centers.backup = 0;
      if(player.centers.primary===0 && this.state.phase!=="collapse")this.queue=[()=>this.gameOver("Both Data Centers destroyed by own effect.")];
      return this.event("drain", `${placement.card.name}: destroy your own Backup; opponent gains no destruction VP.`, {owner:placement.owner,targetOwner:placement.owner,target:"backup",amount:before,before,after:0,source:"card",sourceName:placement.card.name,cardId:placement.card.id});
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
      return this.requestChoice(placement, `Move ${card.name} to another open Node.`, targets.map(target => ({ id: `node-${target}`, label: `Node ${target + 1}`, resolve: () => {
        return this.movePlacement(placement, target, placement);
      } })));
    }
    if (effect.kind === "moveCard" || effect.kind === "modifyPower") {
      if (effect.kind === "modifyPower" && !Number.isInteger(effect.amount)) throw new Error("Card Power modifier must be an integer.");
      const targetOwner = (effect.opponent ? 1 - owner : owner) as PlayerId;
      const candidates = this.state.nodes.flatMap(state => state.cards[targetOwner]).filter(target =>
        target.revealed && !this.collapseResolvedNodes.has(target.node) &&
        (effect.kind === "modifyPower" || this.moveDestinations(target).length > 0));
      if (!candidates.length) return this.event(effect.kind === "moveCard" ? "move" : "power", `${card.name}: no legal revealed card to ${effect.kind === "moveCard" ? "move" : "modify"}.`, { ...base, targetOwner, ...(effect.kind === "modifyPower" ? { amount: 0 } : {}) });
      const options = candidates.map(target => ({
        id: `card-${target.card.id}`,
        label: `${target.card.name} · Node ${target.node + 1}`,
        resolve: () => effect.kind === "moveCard" ? this.chooseMoveDestination(placement, target) : this.modifyPlacementPower(placement, target, effect.amount!),
      }));
      if (effect.optional) options.push({ id: "skip", label: "Skip", resolve: () => this.event("choice", `${card.name}: optional ${effect.kind === "moveCard" ? "move" : "Power change"} skipped.`, base) });
      return this.requestChoice(placement, `${card.name}: choose ${effect.opponent ? "an opponent" : "your"} revealed card to ${effect.kind === "moveCard" ? "move" : "change Power"}.`, options);
    }
    if (effect.kind === "probability" || effect.kind === "transferPower") {
      if(!this.state.nodes[node]?.cards[owner].some(item=>item.card.id===card.id))return this.event("power",`${card.name}: no deployed source Location for a Power transfer.`,{...base,amount:0});
      const amount = effect.kind === "probability" ? (effect.amount ?? 5) / 5 : effect.amount ?? 1;
      this.recalculate();
      const neighbors = [node - 1, node + 1].filter(target => target >= 0 && target < 5);
      const directions = neighbors.flatMap(neighbor => [[node, neighbor], [neighbor, node]]);
      return this.requestChoice(placement, `Transfer up to ${amount} of your Power between this Node and a neighbor.`, directions.filter(([source]) => this.state.nodes[source].powers[owner] > 0).map(([source, target]) => ({
        id: `power-${source}-${target}`, label: `${Math.min(amount, this.state.nodes[source].powers[owner])} Power: Node ${source + 1} → Node ${target + 1}`, resolve: () => {
          this.recalculate();
          const moved = Math.min(amount, Math.max(0, this.state.nodes[source].powers[owner]));
          this.state.nodes[source].powerModifiers[owner] -= moved;
          this.state.nodes[target].powerModifiers[owner] += moved;
          this.recalculate();
          return this.event("power", `${card.name}: transfer ${moved} of your Power from Node ${source + 1} to Node ${target + 1}.`, {...base, sourceNode:source, targetNode:target, amount:moved});
        },
      })));
    }
    if (effect.kind === "trashSelf") {
      const lane=this.state.nodes[node]?.cards[owner];
      const index=lane?.findIndex(item=>item.card.id===card.id)??-1;
      const bank=this.state.players[owner].bank;
      const bankIndex=bank.findIndex(item=>item.card.id===card.id);
      if(index>=0)lane!.splice(index,1);
      else if(bankIndex>=0)bank.splice(bankIndex,1);
      else return this.event("trash",`${card.name}: card is no longer active.`,{...base,target:"trash",amount:0});
      this.runtimeTimers.delete(card.id);
      this.state.trash.push(card); this.recalculate(); this.refreshScores();
      return this.event("trash", `${card.name} enters shared Trash.`, { ...base, target: "trash", amount: 1 });
    }
    if (effect.kind === "mill") {
      const opponent = (1 - owner) as PlayerId;
      const milled = this.millToDiscard(opponent, effect.amount ?? 0);
      return this.event("trash", `${card.name}: mill ${milled} from ${opponent === 0 ? "your" : "opponent"} deck.`, { ...base, target: "discard", targetOwner: opponent, amount: milled });
    }
    if (effect.kind === "recover") return this.requestChoice(placement, "Recover one card from shared Trash to your Discard.", this.state.trash.map(target => ({ id: target.id, label: target.name, resolve: () => {
      const index = this.state.trash.findIndex(item => item.id === target.id);
      if (index < 0) throw new Error("Card is no longer in shared Trash.");
      this.state.players[owner].discard.push(this.state.trash.splice(index, 1)[0]);
      return this.event("trash", `${card.name} recovers ${target.name} to ${owner === 0 ? "your" : "opponent"} Discard.`, { ...base, target: "discard", targetOwner: owner, amount: 1 });
    } })));
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

  private chooseMoveDestination(source: Deployment, target: Deployment): RuntimeEvent {
    const destinations = this.moveDestinations(target);
    if (!destinations.length) return this.event("move", `${source.card.name}: no open Node can receive ${target.card.name}.`, {
      owner: source.owner, cardId: source.card.id, targetCardId: target.card.id, targetOwner: target.owner,
      node: source.node >= 0 ? source.node : undefined, source: "card", sourceName: source.card.name,
    });
    return this.requestChoice(source, `${source.card.name}: move ${target.card.name} to which Node?`, destinations.map(node => ({
      id: `node-${node}`, label: `Node ${node + 1}`, resolve: () => this.movePlacement(source, node, target),
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

  private modifyPlacementPower(source: Deployment, target: Deployment, amount: number): RuntimeEvent {
    if (!this.state.nodes[target.node].cards[target.owner].includes(target) || !target.revealed || this.collapseResolvedNodes.has(target.node)) throw new Error("Selected card is no longer a legal Power target.");
    const before = effectiveCardPower(target);
    const after = Math.max(0, before + amount);
    target.powerModifier = after - (target.card.power ?? 0);
    this.recalculate();
    return this.event("power", `${source.card.name}: ${target.card.name} Power ${before} → ${after}.`, {
      node: source.node >= 0 ? source.node : undefined, owner: source.owner, cardId: source.card.id,
      targetCardId: target.card.id, targetOwner: target.owner, source: "card", sourceName: source.card.name,
      amount: after - before, before, after, sourceNode: source.node >= 0 ? source.node : undefined, targetNode: target.node,
    });
  }

  private resolveHandSelection(placement: Deployment, effect: EvaluationEffect, selected = 0): RuntimeEvent {
    const owner=placement.owner;
    const victim=(effect.opponent ? 1-owner : owner) as PlayerId;
    const chooser=(effect.chooser === "opponent" ? 1-owner : owner) as PlayerId;
    const player=this.state.players[victim];
    const maximum=effect.amount ?? 1;
    if(effect.optional && effect.then && selected===0) {
      const options=[{id:"decline",label:"Decline",resolve:()=>this.event("choice",`${placement.card.name}: optional payment declined.`,{owner})}];
      if(player.hand.length>=maximum)options.push({id:"pay",label:`Discard ${maximum} cards`,resolve:()=>this.resolveHandSelection(placement,{...effect,optional:false,min:maximum},0)});
      return this.requestChoice({...placement,owner:chooser},`${placement.card.name}: pay the optional discard cost?`,options);
    }
    const minimum=effect.min ?? (effect.optional ? 0 : maximum);
    const finish=() => {
      if(selected >= minimum)this.queue.unshift(...(effect.then ?? []).map(next=>()=>this.resolveEvaluationEffect(placement,next)));
      return this.event("choice", `${placement.card.name}: selection complete (${selected}).`, {owner,source:"card",sourceName:placement.card.name});
    };
    if(selected >= maximum || !player.hand.length) return finish();
    const options=player.hand.map(card=>({id:card.id,label:card.name,resolve:()=>{
      const index=player.hand.findIndex(item=>item.id===card.id);
      if(index<0)throw new Error("Selected card is no longer in hand.");
      const [removed]=player.hand.splice(index,1);
      if(effect.kind === "handTrash")this.state.trash.push(removed);else player.discard.push(removed);
      this.queue.unshift(()=>this.resolveHandSelection(placement,effect,selected+1));
      this.refreshScores();
      return this.event("trash", `${placement.card.name}: ${card.name} enters ${effect.kind === "handTrash" ? "shared Trash" : "Discard"}.`, {owner,cardId:placement.card.id,source:"card",sourceName:placement.card.name,targetOwner:victim,target:effect.kind === "handTrash" ? "trash" : "discard",amount:1});
    }}));
    if(selected >= minimum)options.push({id:"finish-selection",label:"Finish selection",resolve:finish});
    return this.requestChoice({...placement,owner:chooser}, `${placement.card.name}: ${effect.kind === "handTrash" ? "trash" : "discard"} ${maximum-selected} more card${maximum-selected===1?"":"s"}${selected>=minimum?" (optional)":""}.`,options);
  }

  private resolveScry(placement: Deployment, amount: number, inspected?: string[], index=0): RuntimeEvent {
    const player=this.state.players[placement.owner];
    const ids=inspected ?? player.draw.slice(0,amount).map(card=>card.id);
    const card=player.draw.find(card=>card.id===ids[index]);
    if(!card)return this.event("choice", `${placement.card.name}: deck inspection complete.`,{owner:placement.owner});
    const proceed=()=>this.queue.unshift(()=>this.resolveScry(placement,amount,ids,index+1));
    return this.requestChoice(placement, `${placement.card.name}: inspect ${card.name}.`, [
      {id:"keep",label:`Keep ${card.name}`,resolve:()=>{proceed();return this.event("choice",`${placement.card.name}: keep inspected card.`,{owner:placement.owner});}},
      {id:"discard",label:`Discard ${card.name}`,resolve:()=>{player.draw=player.draw.filter(item=>item.id!==card.id);player.discard.push(card);proceed();return this.event("trash",`${placement.card.name}: discard ${card.name}.`,{owner:placement.owner,targetOwner:placement.owner,target:"discard",amount:1});}},
    ]);
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

  private applyTargetedDataCenterEffect(centers: DataCenters, kind: "drain" | "restore", amount: number, target?: "primary" | "backup") {
    if (!target) return applyDataCenterEffect(centers, kind, amount);
    const before = centers[target];
    const after = before === 0 ? 0 : kind === "drain" ? Math.max(0, before - amount) : Math.min(dataCenterMaximums[target], before + amount);
    return {
      centers: { ...centers, [target]: after },
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
    const result = this.applyTargetedDataCenterEffect(targetPlayer.centers, kind, amount, target);
    const before = result.target ? targetPlayer.centers[result.target] : 0;
    targetPlayer.centers = result.centers;
    player.destructionVP += result.destructionVP;
    const output = this.event(kind, `${placement.card.name}: ${kind === "drain" ? "Drain" : "Restore"} ${result.amount}${result.target ? ` at ${result.target} Data Center` : "; no available target"}.${result.destructionVP ? ` +${result.destructionVP} destruction VP.` : ""}`, { ...base, amount: result.amount, before, after: result.target ? result.centers[result.target] : 0, targetOwner: kind === "drain" ? (1 - owner) as PlayerId : owner, ...(result.target ? { target: result.target } : {}) });
    if (kind === "drain" && this.state.phase !== "collapse" && targetPlayer.centers.primary === 0 && targetPlayer.centers.backup === 0) {
      this.queue = [() => this.gameOver("Both Data Centers destroyed.")];
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
        for (const placement of cards) for (const effect of placement.card.onCollapse ?? []) callbacks.push(() => this.resolveEvaluationEffect(placement, effect));
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
          if (effect.kind === "damageLoser") {
            if (winner !== null) events.push(() => this.resolveLocationReward(node, winner, effect));
          } else {
            for (const owner of winner === null ? [0, 1] as const : [winner]) events.push(() => this.resolveLocationReward(node, owner, effect));
          }
        }
        // Finish every effect and award at this Node before applying the lethal
        // Collapse barrier. Later Node, Bank and Circuit callbacks are discarded.
        events.push(() => {
          this.collapseResolvedNodes.add(node);
          if (this.state.players.some(player => player.centers.primary === 0 && player.centers.backup === 0)) return {...this.gameOver(`Both Data Centers destroyed during Node ${node + 1}. Current Node awards complete.`),node,stage:"node-close"};
          return this.event("reward", location?.effects ? `${location.name} resolved.` : "Location Reward unresolved: approved content required.", { node, source: "location", sourceName: location?.name, stage: "node-close" });
        });
        this.queue.unshift(...events);
        return this.event("reward", location?.effects ? `${location.name}: ${winner === null ? "tied Node" : winner === 0 ? "your reward" : "opponent reward"}.` : "Location Reward requires approved content.", { node, source: "location", sourceName: location?.name, stage: "node-award" });
      });
    }
    this.queue.push(() => {
      const callbacks: (() => RuntimeEvent)[] = [];
      const entries = this.state.players.flatMap((player, owner) => player.bank.map(entry => ({ ...entry, owner: owner as PlayerId }))).sort((a, b) => a.order - b.order);
      for (const entry of entries) for (const effect of entry.card.onCollapse ?? []) callbacks.push(() => this.resolveEvaluationEffect({ card: entry.card, owner: entry.owner, node: -1, order: entry.order, revealed: true }, effect));
      if (!entries.length) return this.event("collapse", "No Duration cards in the Effect Bank after Node 5.");
      callbacks.push(() => this.state.players.some(player => player.centers.primary === 0 && player.centers.backup === 0) ? this.gameOver("Both Data Centers destroyed during Effect Bank resolution.") : this.event("bank", "Effect Bank resolution complete."));
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
      this.state.players.forEach((player, owner) => {
        player.discard.push(...player.hand.filter(card => card.type !== "Crypto"));
        player.hand = player.hand.filter(card => card.type === "Crypto");
        const placements = this.state.nodes.flatMap(node => node.cards[owner]).sort((a, b) => a.order - b.order);
        for (const placement of placements) {
          if (!placement.revealed) player.destroyed.push(placement.card);
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
    const player = this.state.players[owner];
    const base = { node, owner, source: "location" as const, sourceName: location.name, targetOwner: owner, amount: effect.amount };
    if (effect.kind === "draw") {
      const before = player.hand.length;
      Object.assign(player, drawCards(player, effect.amount, this.config.random));
      return this.event("draw", `${location.name}: ${owner === 0 ? "you draw" : "opponent draws"} ${player.hand.length - before}.`, { ...base, target: "hand", before, after: player.hand.length, amount: player.hand.length - before });
    }
    if (effect.kind === "crypto") {
      const before = player.wallet; player.wallet += effect.amount;
      return this.event("crypto", `${location.name}: +${effect.amount} Crypto.`, { ...base, target: "wallet", before, after: player.wallet });
    }
    if (effect.kind === "vp") {
      this.refreshScores(); const before = player.totalVP;
      player.rewardVP += effect.amount; this.refreshScores();
      return this.event("vp", `${location.name}: +${effect.amount} VP.`, { ...base, target: "vp", before, after: player.totalVP });
    }
    const loser = (1 - owner) as PlayerId;
    const targetPlayer = this.state.players[loser];
    const result = applyDataCenterEffect(targetPlayer.centers, "drain", effect.amount);
    const before = result.target ? targetPlayer.centers[result.target] : 0;
    targetPlayer.centers = result.centers;
    player.destructionVP += result.destructionVP;
    this.refreshScores();
    return this.event("drain", `${location.name}: ${loser === 0 ? "your" : "opponent"} ${result.target ?? "unavailable"} Data Center takes ${result.amount}.${result.destructionVP ? ` Winner gains ${result.destructionVP} destruction VP.` : ""}`, { ...base, targetOwner: loser, amount: result.amount, before, after: result.target ? result.centers[result.target] : 0, ...(result.target ? { target: result.target } : {}) });
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
      this.state.market = [
        ...this.state.market.filter(pile => pile.category !== "Chaos" && !pile.rotating),
        ...baseOffer(this.config.random,this.config.content),
        ...chaosOffer(this.config.random,this.config.content),
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
    const player = this.state.players[owner];
    const base = { owner, targetOwner: owner, source: "circuit" as const, sourceName: name, amount: effect.amount };
    if (effect.kind === "crypto") {
      const before = player.wallet; player.wallet += effect.amount;
      return this.event("crypto", `${owner === 0 ? "You claim" : "Opponent claims"} ${name}: +${effect.amount} Crypto.`, { ...base, target: "wallet", before, after: player.wallet });
    }
    if (effect.kind === "vp") {
      this.refreshScores(); const before = player.totalVP;
      player.rewardVP += effect.amount; this.refreshScores();
      return this.event("vp", `${owner === 0 ? "You claim" : "Opponent claims"} ${name}: +${effect.amount} VP.`, { ...base, target: "vp", before, after: player.totalVP });
    }
    const before = player.centers.primary;
    const amount = before > 0 ? Math.min(effect.amount, dataCenterMaximums.primary - before) : 0;
    player.centers.primary += amount;
    return this.event("restore", `${owner === 0 ? "You claim" : "Opponent claims"} ${name}: heal ${amount} to Primary${before === 0 ? "; destroyed Primary cannot be restored" : ""}.`, { ...base, amount, target: "primary", before, after: player.centers.primary });
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
    this.queue = []; this.state.choice = null; this.choices.clear();
    return this.event("gameover", this.state.endedReason);
  }
}
