/**
 * Core 0uroboros type definitions.
 *
 * Owner and Controller are modelled separately even though they are normally the
 * same player, because future effects may change control and zone return must
 * follow Owner.
 */

export type PlayerID = '0' | '1';

export const NODE_IDS = [0, 1, 2, 3, 4] as const;
export type NodeIndex = (typeof NODE_IDS)[number];

export type GameMode = 'runtime' | 'shortCircuit';

export type CardKind = 'character' | 'crypto' | 'victoryPoint' | 'base' | 'chaos';

export type Zone =
  | 'deck'
  | 'hand'
  | 'discard'
  | 'node'
  | 'effectBank'
  | 'trash'
  | 'destroyed';

export type NodeState = 'closed' | 'open' | 'collapsed';

export type DataCenterId = 'primary' | 'backup';

/** Timing windows an effect can be attached to. */
export type EffectTiming =
  | 'onPlay'
  | 'onReveal'
  | 'onCollapse'
  | 'startOfCycle'
  | 'endOfCycle'
  | 'onAcquire'
  | 'onDraftStart';

/** Acquisition destinations for purchased or granted cards. */
export type AcquireDestination = 'discard' | 'deckTop' | 'deckBottom' | 'deckRandom' | 'hand';

/**
 * Typed effect operations. Content is data, not parsed prose, so the resolution
 * engine stays closed while the content pool grows.
 */
export type EffectOp =
  | { op: 'addPower'; amount: number; target: PowerTarget }
  | { op: 'transferProbability'; amount: number; from: ProbabilityRef; to: ProbabilityRef }
  | { op: 'setProbability'; amount: number; target: ProbabilityRef }
  | { op: 'gainCrypto'; amount: number; target: PlayerRef }
  | { op: 'gainVictoryPoints'; amount: number; target: PlayerRef }
  | { op: 'damageDataCenter'; amount: number; target: PlayerRef; dataCenter?: DataCenterId }
  | { op: 'healDataCenter'; amount: number; target: PlayerRef; dataCenter?: DataCenterId }
  | { op: 'draw'; amount: number; target: PlayerRef }
  | { op: 'trashSelf' }
  | { op: 'destroyCard'; target: CardSelector }
  | { op: 'trashCard'; target: CardSelector }
  | { op: 'grantCard'; cardDefId: string; destination: AcquireDestination; target: PlayerRef }
  | { op: 'log'; message: string };

export type PlayerRef = 'self' | 'opponent' | 'both' | 'nodeWinner' | 'nodeLoser';

export type PowerTarget =
  | { kind: 'self' }
  | { kind: 'alliesAtNode' }
  | { kind: 'enemiesAtNode' }
  | { kind: 'allAtNode' };

export type ProbabilityRef =
  | { kind: 'thisNode' }
  | { kind: 'node'; index: NodeIndex }
  | { kind: 'lowestNode' }
  | { kind: 'highestNode' };

export type CardSelector =
  | { kind: 'self' }
  | { kind: 'lowestPowerEnemyAtNode' }
  | { kind: 'highestPowerEnemyAtNode' };

/** A timed bundle of effect operations attached to a card or Location. */
export interface EffectDefinition {
  timing: EffectTiming;
  ops: EffectOp[];
  /** Player-facing rules text. Sentence case, terminal punctuation, no em dashes. */
  text: string;
}

/** Static card definition from the content layer. */
export interface CardDefinition {
  id: string;
  name: string;
  kind: CardKind;
  /** Printed Power. Crypto cards are not deployable and use 0. */
  power: number;
  /** Printed Crypto cost when offered in the Draft market. */
  cost: number;
  /** Crypto value contributed to the Wallet at Draft transition. */
  cryptoValue?: number;
  /** Static Victory Point contribution while in an active zone. */
  victoryPoints?: number;
  /** Duration in Cycles. Deployment Cycle counts as 1. 99 displays as infinity. */
  duration?: number;
  effects: EffectDefinition[];
  /** Whether the card may be deployed to a Node. Crypto cards may not. */
  deployable: boolean;
}

/** A runtime card instance. Cards are tracked by instance, never by definition. */
export interface CardInstance {
  instanceId: string;
  cardDefId: string;
  owner: PlayerID;
  controller: PlayerID;
  zone: Zone;
  /** Node position when zone is 'node'. */
  nodeIndex: NodeIndex | null;
  /** Effect Bank slot when zone is 'effectBank'. */
  bankSlot: number | null;
  /** Monotonic per-player chronological play order. First-class state. */
  playOrder: number | null;
  revealed: boolean;
  /** Accumulated Power modifiers. Base Power lives in the definition. */
  powerMods: number;
  /** Remaining Duration in Cycles, counted down at End of Cycle. */
  durationRemaining: number | null;
}

/** Location attached to a Node for a Cycle. */
export interface LocationDefinition {
  id: string;
  name: string;
  text: string;
  effects: EffectDefinition[];
}

export interface CircuitRewardDefinition {
  id: string;
  name: string;
  text: string;
  effects: EffectDefinition[];
}

export interface NodeStateData {
  index: NodeIndex;
  state: NodeState;
  locationId: string | null;
  locationSilenced: boolean;
  /** Probability in percent. Uses 0.5 increments, never negative. */
  probability: number;
}

export interface DataCenter {
  id: DataCenterId;
  health: number;
  maxHealth: number;
  destroyed: boolean;
}

export interface MarketSlot {
  cardDefId: string;
  /** Remaining shared supply. Null means per-player supply (Chaos). */
  supply: number | null;
  /** Per-player supply for Chaos offerings. */
  perPlayerSupply?: Record<PlayerID, number>;
}

export interface DraftMarket {
  base: MarketSlot[];
  victoryPoint: MarketSlot[];
  crypto: MarketSlot[];
  chaos: MarketSlot[];
  /** Circuit Reward slot, with the eligible players who may still claim it. */
  circuitReward: {
    rewardId: string | null;
    eligible: PlayerID[];
    claimed: PlayerID[];
  };
}

export interface PlayerState {
  id: PlayerID;
  /** Non-material Crypto for the current Draft. Resets to 0 each Cycle. */
  wallet: number;
  victoryPoints: number;
  dataCenters: Record<DataCenterId, DataCenter>;
  /** Next chronological play order index for this player. */
  nextPlayOrder: number;
  endedTurn: boolean;
  endedDraft: boolean;
  /** Last purchase timestamps per card definition, for repeat-buy cooldown. */
  lastPurchaseAt: Record<string, number>;
  conceded: boolean;
}

export type LogEntryKind =
  | 'phase'
  | 'deploy'
  | 'reveal'
  | 'collapse'
  | 'reward'
  | 'draft'
  | 'damage'
  | 'system';

export interface LogEntry {
  seq: number;
  kind: LogEntryKind;
  message: string;
  cycle: number;
  turn: number;
}

/** A pending player decision that blocks resolution until answered or timed out. */
export interface PendingChoice {
  id: string;
  player: PlayerID;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  optional: boolean;
}

/** The complete authoritative game state. Must stay JSON serializable. */
export interface OuroborosState {
  mode: GameMode;
  cycle: number;
  /** Runtime turn index, 0 through 4, mapping to the Node that opens. */
  turn: number;
  /** Deployment windows closed during the current Cycle. */
  windowsCompleted: number;
  /**
   * Fine-grained authoritative state name from the documented state machine.
   * boardgame.io phases are coarser because they represent move-legality
   * windows, so this field carries the exact state for debug and presentation.
   */
  phase: string;
  cards: Record<string, CardInstance>;
  /** Ordered deck contents per player, top of deck first. */
  decks: Record<PlayerID, string[]>;
  hands: Record<PlayerID, string[]>;
  discards: Record<PlayerID, string[]>;
  /** Shared public Trash. Recoverable through effects. */
  trash: string[];
  /** Permanent removal. Contributes no Victory Points and cannot return. */
  destroyed: string[];
  effectBanks: Record<PlayerID, Array<string | null>>;
  nodes: NodeStateData[];
  players: Record<PlayerID, PlayerState>;
  /**
   * Authoritative Victory Point totals, including static card contributions.
   *
   * Victory Point totals are public, but the cards producing them are often
   * private, so a client cannot derive these from its filtered view. The server
   * publishes them here through `playerView`.
   */
  publicVictoryPoints: Record<PlayerID, number>;
  revealPriority: PlayerID;
  /** Instance ids queued to reveal, in resolved reveal order. */
  revealQueue: string[];
  market: DraftMarket;
  /** Node selected by the probabilistic Wave Collapse, for presentation. */
  collapseSelectedNode: NodeIndex | null;
  pendingChoices: PendingChoice[];
  log: LogEntry[];
  logSeq: number;
  gameOverReason: string | null;
}
