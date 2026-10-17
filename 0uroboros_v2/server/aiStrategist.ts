import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_STRATEGY, effectTotal, handValue, hasAction, locationRead, sanitizeProfile, versionLabel, type LocationRules, type StrategyProfile, type StrategyWeights } from '@0uroboros/engine/ai/strategy';
import { migrateCard } from '@0uroboros/engine/effects/migrate';
import type { SelfPlayResult } from '@0uroboros/engine/ai/selfPlay';
import { DRAFT_COPIES_PER_PLAYER, DRAFT_OFFER_COUNT, DRAFT_PHASE_SUMMARY, GAME_BASE_COUNT, GAME_CHAOS_COUNT, GAME_CHAOS_MIX, GAME_PILE_SUPPLY, GAME_VP_COUNT, GAME_VP_SUPPLY, DRAFT_SOLAR_MONK_COUNT } from '@0uroboros/engine/evaluationMarket';
import { defaultServerVP, serverMaximums, type Card, type Servers } from '@0uroboros/engine/game';
import type { MatchReport } from '@0uroboros/engine/runtime';
import { isLocalRequest } from './contentApi';
import { DECKBUILDING_BASICS, DECKBUILDING_PROFILE_NOTE, EARLY_ECONOMY_PLAYBOOK } from './agents/deckbuilding';
import { withChange, type BaselineTips, type Tip } from './agents/mentoring';
import { clampToEnvelope, describeEnvelope, type StrategistIdentity } from './agents/roster';

/**
 * Strat-G, the strategy agent behind the AI opponent (internal ids keep the original
 * "strategist" names). Each dev-server start reads its notebook, plans, takes notes during games,
 * debriefs after each one and leaves its theories in the notebook. Its version (`versionLabel`)
 * changes only when the profile it plays changes: an adopted experiment, or a designer change to
 * its baseline or style. With an OpenAI key the reasoning is done by a model; without one the
 * same loop runs on deterministic statistics.
 *
 * It plays a protected baseline (the designer's playbook, `DEFAULT_STRATEGY`) plus the changes its
 * experiments have earned. The profile only changes through an experiment: one bounded change,
 * screened in seeded self-play against the current best, then played in alternating games against
 * the human. Code measures the results and decides; the model proposes and documents.
 *
 * Strat-G publishes finished games outward (`onGameRecorded`) and never receives anything back:
 * evaluators may read its records, but nothing they produce flows into its memory or profile.
 */

export type TheoryStatus = 'proposed' | 'supported' | 'refuted' | 'retired';
export type Theory = {
  id: string; text: string; status: TheoryStatus; confidence: number;
  support: number; against: number; createdBy: number; updatedBy: number;
  /** Built-in theories are scored automatically after every complete game. */
  test?: TheoryTest;
};
type TheoryTest = 'no-shyte' | 'economy-first' | 'chaos-endgame' | 'draw-engine' | 'vp-late' | 'early-aggression' | 'drain-race';
type SideStat = { bought: number; games: number; wins: number };
type LocationStat = { seen: number; aiWon: number; humanWon: number };
type Note = { version: number; at: string; text: string };

/** New absolute values for the tunable profile fields; `minCryptoValue` is fixed by the baseline (never Shyte-Coin). */
export type ProfileChange = {
  economyUntilCycle?: number; chaosFromCycle?: number; vpFromCycle?: number; handCryptoTarget?: number;
  minBuyScore?: number; dilution?: number; weights?: Partial<StrategyWeights>; cardBias?: Record<string, number>;
};
type ArmStats = { games: number; wins: number; losses: number; ties: number; margin: number };
export type ExperimentStage = 'lab' | 'field' | 'adopted' | 'rejected' | 'inconclusive';
export type Experiment = {
  id: string; theoryId: string | null; supportsTheory: boolean; menuId?: string;
  hypothesis: string; prediction: string; change: ProfileChange; changeSummary: string;
  source: 'model' | 'heuristic'; proposedBy: number; proposedAt: string; stage: ExperimentStage;
  /** Seeded self-play: each seed is played twice with the seats swapped, experiment vs current best. */
  lab: {
    seeds: number[]; games: number; invalid: number; experimentWins: number; controlWins: number; ties: number; meanMargin: number; verdict: 'promising' | 'rejected' | 'inconclusive';
    /** League trials: both arms play the same sampled opponents; points are 1 per win and ½ per tie. */
    league?: { opponents: string[]; pairs: number; experimentPoints: number; controlPoints: number; marginGain: number };
  } | null;
  /** Games against the human, alternating between the experiment and the current best. */
  field: { experiment: ArmStats; control: ArmStats };
  verdict: string | null; concludedBy: number | null; concludedAt: string | null;
};

export type StrategistMemory = {
  schema: 1;
  version: number;
  mode: 'llm' | 'heuristic';
  /** Always `baseline.profile` with `adopted` applied; rebuilt on every boot. */
  profile: StrategyProfile;
  plan: string;
  /** The designer's playbook. Learning never edits it. */
  baseline: { profile: StrategyProfile; plan: string; playbook: string[]; since: string };
  /** Changes earned by adopted experiments, as absolute values over the baseline. */
  adopted: ProfileChange;
  experiment: Experiment | null;
  experiments: Experiment[];
  experimentCount: number;
  theories: Theory[];
  notes: Note[];
  cardNotes: Record<string, string>;
  knownCards: string[];
  knownLocations: string[];
  /** The destruction VP this agent last planned around; a change is announced once in the notebook. */
  knownServerVP?: Servers;
  cardStats: Record<string, { ai: SideStat; human: SideStat }>;
  locationStats: Record<string, LocationStat>;
  record: { games: number; aiWins: number; humanWins: number; ties: number };
  /** Sessions that were not complete games (lookdev shortcuts, inactivity concessions); nothing is learned from them. */
  ignored: { count: number; lastReason: string | null };
  /** Experiment-menu ids suggested by the last complete game, used when no model is available. */
  signals: string[];
  /** One entry per version, opened when the profile changes; `bootedAt` is when that version began. */
  history: { version: number; bootedAt: string; mode: 'llm' | 'heuristic'; plan: string; games: number; aiWins: number }[];
  /** Frozen copies of the current best, saved on boot and on every adoption; the league samples past ones as opponents. */
  snapshots?: Snapshot[];
  /** The last tips this agent shared when the designer asked it to mentor another agent. */
  sharedTips?: { at: string; mode: 'llm' | 'heuristic'; tips: Tip[] };
};
export type Snapshot = { label: string; savedAt: string; profile: StrategyProfile };
export type StrategistBrief = {
  version: number; mode: 'llm' | 'heuristic'; plan: string; profile: StrategyProfile; theories: string[]; record: StrategistMemory['record'];
  /** Set when `profile` is the experiment arm rather than the current best. */
  experiment?: { id: string; hypothesis: string } | null;
};

/** What Strat-G publishes after each human game; a frozen copy, with nothing returned. */
export type StratGGameRecord = {
  gameId: string; report: MatchReport;
  stratG: { version: number; mode: StrategistMemory['mode']; plan: string; notes: string[]; theories: Pick<Theory, 'id' | 'text' | 'status' | 'confidence' | 'support' | 'against'>[] } | null;
};
export type StratGStatus = {
  enabled: boolean; state: 'off' | 'booting' | 'online' | 'failed'; version: number; mode: StrategistMemory['mode'] | null;
  plan: string; record: StrategistMemory['record']; modelConfigured: boolean; model: string; activeTheories: number; error: string | null;
  experiment: { id: string; hypothesis: string; change: string; stage: ExperimentStage; lab: string | null; field: string } | null;
  adoptedChanges: number; experimentsConcluded: number; ignoredGames: number;
  agent: { id: string; name: string; style: string | null };
  /** Label of the latest saved snapshot of the current best, as rated in the league. */
  snapshot: string | null;
};

/** Everything a league trial reports back: labels and results, never an opponent's profile or plan. */
export type LeagueOutcome = {
  opponents: string[]; seeds: number[]; games: number; invalid: number;
  /** Valid seat-games where both arms finished against the same opponent and seed. */
  pairs: number; experimentPoints: number; controlPoints: number; experimentWins: number; controlWins: number; ties: number;
  /** Mean of (experiment margin − current-best margin) per pair. */
  marginGain: number;
};
export type LeagueArms = { experimentId: string; label: string; control: StrategyProfile; experiment: StrategyProfile };

type SelfPlayHarness = {
  compileForSelfPlay: (document: never) => unknown;
  playSelfPlayGame: (options: { content: never; seed: number; strategy: StrategyProfile; seatStrategies?: [StrategyProfile, StrategyProfile]; recordDecisions?: boolean }) => SelfPlayResult;
};

export type StrategistOptions = {
  root?: string;
  contentFile?: string;
  apiKey?: string;
  model?: string;
  log?: (message: string) => void;
  fetchImpl?: typeof fetch;
  /** Read on every request; when false Strat-G neither boots nor learns, and the opponent plays the default profile. */
  enabled?: () => boolean;
  /** Whether the opponent keeps its per-decision log in match reports. */
  recordDecisions?: () => boolean;
  /** Publish-only: called after a human game is recorded. Its result and errors are ignored. */
  onGameRecorded?: (record: StratGGameRecord) => void;
  /** Self-play for experiment screening; without it experiments go straight to games against the human. */
  loadSelfPlay?: () => Promise<SelfPlayHarness>;
  /** Seeds per lab trial (each played twice, seats swapped), read at the start of each trial. Defaults to 20. */
  labSeeds?: number | (() => number);
  /** Who this strategist is: name, baseline, playbook and style envelope. Defaults to Strat-G. */
  identity?: StrategistIdentity;
  /**
   * League mode: experiments are screened only in league trials run by the referee (no automatic lab), promising
   * ones are adopted from the league result, and experiments waiting for human games go back to league trials.
   */
  league?: boolean;
  /** Tips the designer handed to this agent from its mentors; read on every boot and folded into the baseline. */
  mentorTips?: () => Promise<BaselineTips | null>;
};

type CatalogCard = Card & { pool?: string; enabled?: boolean };
type CatalogLocation = LocationRules & { id: string; name: string; rule: string; enabled?: boolean };
type Catalog = { cards: Map<string, CatalogCard>; locations: Map<string, CatalogLocation>; startingDeck?: { name: string; count: number }[] };

const NOTE_LIMIT = 300;
const THEORY_LIMIT = 30;
const EXPERIMENT_LOG_LIMIT = 60;
const LAB_SEEDS = 20;
/** Lab trials per boot or per finished game; the next idea waits for the following one. */
const LAB_TRIALS_PER_TRIGGER = 3;
const FIELD_GAMES_PER_ARM = 2;
/** Only these endings are complete games; concessions and the lookdev "end session" shortcut are not. */
const COMPLETE_GAME = /^(Cycle 16 final Draft complete\.|Both Servers destroyed)/;

const BASELINE_PLAYBOOK = [
  'Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.',
  'Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.',
  'Draft after Cycle 4: score every card from its actual effects (no fixed table) and buy the best set the whole Wallet affords; skip cards that would only dilute the deck.',
  'Deploy: Action and draw cards first so they fuel later turns; contest Nodes whose Location pays the winner, and do not fight for Locations that pay the loser.',
  'Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch) and hit the opponent\'s best cards.',
];

const RULES_SUMMARY = `0uroboros is a two-player deckbuilder over 16 Cycles. Both players start with the same starting deck (listed under STARTING DECK). Each Cycle draws a fresh hand of 5 and has three Runtime turns: players deploy Character cards face-down onto five Nodes (some open on turn 1, more on later turns, up to 4 cards per side per Node). Each Character costs 1 Action; a player has 2 Actions on turn 1, then unspent Actions carry over plus 1 per turn plus Action effects. VP cards deploy for 0 Actions; Crypto cannot be deployed. Revealed cards fire effects (draw, Actions, Crypto, Drain, Restore, Power shifts, thinning, ...). At Wave Collapse the higher Power wins each Node and its Location reward; whoever won more Locations is eligible for a random Circuit Reward (a tie makes both eligible); rewards marked "trailing" instead go to the player behind on VP counting Server damage dealt as that share of the Server's destruction VP. Then the Draft: spendable Crypto (from Character effects, and any held Crypto cards that resolve by printed value) is used to buy cards into Discard. Crypto resets every Cycle. Crypto cards are not sold in the market. Drain damages the enemy Servers (currently Primary ${serverMaximums.primary}, Backup ${serverMaximums.backup}, ${serverMaximums.primary + serverMaximums.backup} in all; the designer may rebalance these, so plan around destroying both Servers rather than a fixed damage number): destroying a Primary gives the destroyer +${defaultServerVP.primary} VP, a Backup +${defaultServerVP.backup} VP, and the game ends when a player loses both Servers (most VP still wins). Otherwise the most VP after the Cycle 16 Draft wins. VP cards score while owned. Market each game: ${GAME_BASE_COUNT} random Base piles, ${GAME_CHAOS_COUNT} random Chaos piles (${GAME_CHAOS_MIX}) (${GAME_PILE_SUPPLY} copies each) and ${GAME_VP_COUNT} VP piles (${GAME_VP_SUPPLY} copies each) with no Crypto card piles (spendable Crypto comes from Character effects); each Draft adds ${DRAFT_OFFER_COUNT} rotating Base/Chaos offers and ${DRAFT_SOLAR_MONK_COUNT} rotating Solar-monk (a VP card that is also a Character), each limited to ${DRAFT_COPIES_PER_PLAYER} copies per player, and each offer slot leans to the Cycle's phase (${DRAFT_PHASE_SUMMARY}), so plan purchases around what each phase brings. Cards bought in the Cycle 16 Draft are only worth their VP.`;
const LOCATION_GUIDE = `LOCATIONS: every open Node carries a Location whose rule changes play there; read each one before planning. First read the trigger: "On collapse:" fires once at Wave Collapse at the end of the Cycle, for that Node's winner or loser; "Ongoing:" fires at the start of turns 2 and 3 for whoever leads the Node at that moment, so committing Power early collects it twice; "Start of turn 2:"/"Start of turn 3:" fire once then; "On reveal:" fires for each card revealed there, for that card's owner, whoever wins. Then read who it helps. "The winning player" rewards contesting the Node. "The losing player" (Login the calvary, Loser's luck, Backup failure's Ongoing draw) means winning it hands the opponent the bonus, so commit only what the Circuit count needs or concede it and win elsewhere. Effects on "both sides"/"each side" are even and matter only through the cards each side has there. Gaining a Glitch or Shyte-Coin clogs the deck, so those rewards hurt their receiver. Every Location won also counts toward the Circuit Reward. In play, the runtime prices each open Location with your own weights and phase when it picks Nodes (Drain-heavy profiles fight for Data breach and Sludge core, draw-heavy ones for Signal tower and Wind fall), so Location play follows from your weights and timing; the catalog's "read" column shows how a Location plays.`;
const PROFILE_GUIDE = `Profile fields (the runtime clamps them): economyUntilCycle [1-12] cycles that favour Crypto/draw/thinning; chaosFromCycle [3-15] first cycle Chaos and Drain are valued fully; vpFromCycle [4-16] first cycle VP cards are valued fully; handCryptoTarget [4-16] Crypto per 5-card hand the economy aims for; minBuyScore [0-4] minimum points for a purchase; dilution [0-1.5] how much a card must beat the deck average; weights [0-5] for power, draw, actions, crypto, drain, restore, vp, duration, thin, disrupt, chaos; cardBias per card definition id [-6..6] points. minCryptoValue stays at the baseline's 2 (never Shyte-Coin) and cannot be experimented on. One experiment moves timing by at most 2 Cycles, a weight by about 30%, and a card bias by 1 point.`;

const FOUNDING_THEORIES: Omit<Theory, 'createdBy' | 'updatedBy'>[] = [
  { id: 'no-shyte', text: 'Shyte-Coin is not worth a deck slot: it dilutes draws. Bigger Crypto (Kilo, Mega-Cache) or Characters that draw cards are better buys.', status: 'proposed', confidence: 0.6, support: 0, against: 0, test: 'no-shyte' },
  { id: 'economy-first', text: 'Buying a few high-value Crypto cards (cost 6+) by Cycle 5 builds the economy that wins the late game.', status: 'proposed', confidence: 0.55, support: 0, against: 0, test: 'economy-first' },
  { id: 'draw-engine', text: 'Characters that draw cards cycle the deck back to its best cards faster than extra Crypto does.', status: 'proposed', confidence: 0.55, support: 0, against: 0, test: 'draw-engine' },
  { id: 'chaos-endgame', text: `Pivoting into Chaos cards around Cycle 9 sets up an endgame Drain push that destroys Servers for +${defaultServerVP.primary}/+${defaultServerVP.backup} VP.`, status: 'proposed', confidence: 0.5, support: 0, against: 0, test: 'chaos-endgame' },
  { id: 'early-aggression', text: 'Heavy Chaos buying before Cycle 6 beats a slow economy (the counter-theory to chaos-endgame).', status: 'proposed', confidence: 0.4, support: 0, against: 0, test: 'early-aggression' },
  { id: 'vp-late', text: 'VP cards are best bought late (Cycle 12+); earlier they clog the hand.', status: 'proposed', confidence: 0.5, support: 0, against: 0, test: 'vp-late' },
  { id: 'drain-race', text: 'Most games are decided by Server destruction before Cycle 12, so Drain matters from the start and Restore is real defense.', status: 'proposed', confidence: 0.6, support: 0, against: 0, test: 'drain-race' },
];

type MenuItem = { id: string; theoryId: string | null; supportsTheory: boolean; hypothesis: string; prediction: string; change: (profile: StrategyProfile) => ProfileChange };
/** Experiments the heuristic mode works through when no model proposes one. */
const EXPERIMENT_MENU: MenuItem[] = [
  { id: 'chaos-earlier', theoryId: 'early-aggression', supportsTheory: true, hypothesis: 'Starting Chaos one Cycle earlier wins the Server race more often.', prediction: 'More wins and a better VP/Server margin than the current best.', change: p => ({ chaosFromCycle: p.chaosFromCycle - 1, economyUntilCycle: Math.min(p.economyUntilCycle, p.chaosFromCycle - 2) }) },
  { id: 'chaos-later', theoryId: 'chaos-endgame', supportsTheory: true, hypothesis: 'Two more economy Cycles build an engine that out-drains an early Chaos pivot.', prediction: 'More wins, mostly late, than the current best.', change: p => ({ economyUntilCycle: p.economyUntilCycle + 2, chaosFromCycle: p.chaosFromCycle + 2 }) },
  { id: 'draw', theoryId: 'draw-engine', supportsTheory: true, hypothesis: 'Valuing draw higher cycles back to the best cards faster than extra Crypto does.', prediction: 'More wins and more Locations won than the current best.', change: p => ({ weights: { draw: p.weights.draw + 0.4 } }) },
  { id: 'crypto', theoryId: 'economy-first', supportsTheory: true, hypothesis: 'Valuing high-value Crypto more (and aiming for a richer hand) out-buys the opponent mid-game.', prediction: 'Bigger mid-game Wallets and more wins than the current best.', change: p => ({ weights: { crypto: p.weights.crypto + 0.3 }, handCryptoTarget: p.handCryptoTarget + 2 }) },
  { id: 'drain', theoryId: 'drain-race', supportsTheory: true, hypothesis: 'Valuing Drain higher ends games by Server destruction before the opponent\'s engine pays off.', prediction: 'Earlier Server kills and more wins than the current best.', change: p => ({ weights: { drain: p.weights.drain + 0.5 } }) },
  { id: 'restore', theoryId: null, supportsTheory: true, hypothesis: 'Valuing Restore higher keeps my Servers alive long enough to win on VP.', prediction: 'Fewer losses by Server destruction than the current best.', change: p => ({ weights: { restore: p.weights.restore + 0.4 } }) },
  { id: 'vp-earlier', theoryId: 'vp-late', supportsTheory: false, hypothesis: 'Valuing VP cards two Cycles earlier banks points before the race is decided.', prediction: 'A better final VP margin than the current best.', change: p => ({ vpFromCycle: p.vpFromCycle - 2 }) },
  { id: 'leaner', theoryId: null, supportsTheory: true, hypothesis: 'A stricter purchase bar (fewer, better cards) keeps the deck sharp.', prediction: 'More wins with a smaller deck than the current best.', change: p => ({ minBuyScore: p.minBuyScore + 0.5, dilution: p.dilution + 0.2 }) },
  { id: 'thinner', theoryId: 'no-shyte', supportsTheory: true, hypothesis: 'Valuing deck thinning higher draws the best cards more often.', prediction: 'More wins and bigger mid-game Wallets than the current best.', change: p => ({ weights: { thin: p.weights.thin + 0.4 } }) },
  { id: 'power', theoryId: null, supportsTheory: true, hypothesis: 'Valuing Power higher wins more Locations and their rewards.', prediction: 'More Locations won and more wins than the current best.', change: p => ({ weights: { power: p.weights.power + 0.3 } }) },
  { id: 'disrupt', theoryId: null, supportsTheory: true, hypothesis: 'Valuing disruption higher slows the opponent\'s plan more than it costs mine.', prediction: 'More wins and a better margin than the current best.', change: p => ({ weights: { disrupt: p.weights.disrupt + 0.4 } }) },
];

const SCALAR_FIELDS = ['economyUntilCycle', 'chaosFromCycle', 'vpFromCycle', 'handCryptoTarget', 'minBuyScore', 'dilution'] as const;
const FIELD_LABEL: Record<(typeof SCALAR_FIELDS)[number], string> = {
  economyUntilCycle: 'economy through Cycle', chaosFromCycle: 'Chaos from Cycle', vpFromCycle: 'VP from Cycle',
  handCryptoTarget: 'Crypto target', minBuyScore: 'min buy score', dilution: 'dilution',
};

const now = () => new Date().toISOString();
/** OpenAI error bodies can echo a masked key; logs never carry any part of it. */
const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_*\-.]+/g, 'sk-…redacted');
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const pad = (version: number) => String(version).padStart(4, '0');
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const sameText = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, '') === b.toLowerCase().replace(/[^a-z0-9]+/g, '');
const tick = () => new Promise<void>(done => setImmediate(done));
const emptyArm = (): ArmStats => ({ games: 0, wins: 0, losses: 0, ties: 0, margin: 0 });

/** The notebook announcement for a change in Server destruction VP, or null when nothing changed (or on a first boot). */
export function serverVPNote(known: Servers | undefined, current: Servers, firstBoot = false): string | null {
  if (firstBoot || (known && known.primary === current.primary && known.backup === current.backup)) return null;
  const was = known ? ` (was ${known.primary} and ${known.backup})` : '';
  const shift = known ? Math.sign(current.primary + current.backup - known.primary - known.backup) : 0;
  const effect = shift > 0 ? 'Server damage now moves the score more: Drain pressure and finishing a damaged Server swing games more, Restore protects more VP, and the trailing-player count weighs damage more.'
    : shift < 0 ? 'Server damage now moves the score less: finishing a Server is worth less than before, VP cards carry more of the score, Restore protects fewer VP, and the trailing-player count weighs damage less.'
    : 'Plan Drain, Restore and VP purchases around these values.';
  return `Rule change from the designer: destroying an enemy Primary Server now gives +${current.primary} VP and a Backup +${current.backup} VP${was}, ${current.primary + current.backup} VP for both. ${effect} Re-check theories and plans built on the old values.`;
}

/** The designer's baseline, with any mentor tips folded in (their change is already translated and clamped). */
export function baselineOf(identity?: StrategistIdentity, tips?: BaselineTips | null): StrategistMemory['baseline'] {
  const designed = identity ? clampToEnvelope({ ...identity.baseline, cardBias: {} }, identity.envelope) : { ...DEFAULT_STRATEGY, cardBias: {} };
  const tipped = tips ? withChange(designed, tips.change) : designed;
  const profile = identity ? clampToEnvelope(tipped, identity.envelope) : tipped;
  return { profile, plan: profile.plan, playbook: [...EARLY_ECONOMY_PLAYBOOK, ...(identity?.playbook ?? BASELINE_PLAYBOOK), ...(tips?.lines ?? [])], since: now() };
}

type TipTheme = { score: (p: StrategyProfile) => number; change: (p: StrategyProfile) => ProfileChange; text: (p: StrategyProfile) => string };
const relative = (value: number, base: number) => (value - base) / Math.max(0.1, Math.abs(base));
/** Without a model, an agent's tips are the themes where its own profile leans hardest away from the default. */
const TIP_THEMES: TipTheme[] = [
  {
    score: p => relative(p.handCryptoTarget, DEFAULT_STRATEGY.handCryptoTarget) + relative(p.weights.crypto, DEFAULT_STRATEGY.weights.crypto),
    change: p => ({ handCryptoTarget: p.handCryptoTarget, weights: { crypto: p.weights.crypto } }),
    text: p => `Build the Wallet first: aim for about ${round(p.handCryptoTarget, 1)} Crypto per hand and value big Crypto (Kilo-Coin, Mega-Cache); a rich Wallet buys better cards every Draft after.`,
  },
  {
    score: p => relative(p.weights.draw, DEFAULT_STRATEGY.weights.draw) + relative(p.weights.actions, DEFAULT_STRATEGY.weights.actions),
    change: p => ({ weights: { draw: p.weights.draw, actions: p.weights.actions } }),
    text: () => 'Buy draw and Action cards early and play them first: they chain into more cards and Actions every turn, so the deck finds its best cards faster.',
  },
  {
    score: p => relative(p.weights.thin, DEFAULT_STRATEGY.weights.thin) + relative(p.dilution, DEFAULT_STRATEGY.dilution) / 2,
    change: p => ({ weights: { thin: p.weights.thin }, dilution: p.dilution }),
    text: () => 'Keep the deck thin: trash Shyte-Coin, Glitch and weak Crypto, and skip cards that only dilute the deck, so the strong cards come up more often.',
  },
  {
    score: p => relative(p.economyUntilCycle, DEFAULT_STRATEGY.economyUntilCycle),
    change: p => ({ economyUntilCycle: p.economyUntilCycle }),
    text: p => `Give the economy time: keep buying Crypto, draw and thinning through Cycle ${p.economyUntilCycle} before switching plans.`,
  },
  {
    score: p => relative(p.weights.vp, DEFAULT_STRATEGY.weights.vp) + (DEFAULT_STRATEGY.vpFromCycle - p.vpFromCycle) / DEFAULT_STRATEGY.vpFromCycle,
    change: p => ({ vpFromCycle: p.vpFromCycle, weights: { vp: p.weights.vp } }),
    text: p => `Bank VP steadily from Cycle ${p.vpFromCycle}: VP cards cost no Actions, and points bought early still count if the game ends on Server destruction.`,
  },
  {
    score: p => relative(p.weights.restore, DEFAULT_STRATEGY.weights.restore),
    change: p => ({ weights: { restore: p.weights.restore } }),
    text: () => 'Restore as soon as the Servers take real damage: a Server that survives is VP the opponent never scores.',
  },
];

export function fallbackTips(profile: StrategyProfile, count: number): Tip[] {
  return TIP_THEMES.map((theme, index) => ({ theme, index, score: theme.score(profile) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, count)
    .map(({ theme }, index) => ({ rank: index + 1, text: theme.text(profile), change: theme.change(profile) }));
}

function seedMemory(identity?: StrategistIdentity, tips?: BaselineTips | null): StrategistMemory {
  const baseline = baselineOf(identity, tips);
  return {
    schema: 1, version: 0, mode: 'heuristic', profile: { ...baseline.profile }, plan: baseline.plan,
    baseline, adopted: {}, experiment: null, experiments: [], experimentCount: 0,
    theories: FOUNDING_THEORIES.map(theory => ({ ...theory, createdBy: 0, updatedBy: 0 })),
    notes: identity?.foundingNotes ? identity.foundingNotes.map(text => ({ version: 0, at: now(), text })) : [
      { version: 0, at: now(), text: 'Founding guidance from the designer: gain a few high-value Crypto and Base cards first, then collect Chaos cards for an endgame play. Every game is different, so adapt to the market and the opponent.' },
      { version: 0, at: now(), text: 'Pre-launch self-play (80 headless games per profile vs scripted opponents): most games ended by Server destruction around Cycles 8-11. Valuing Drain early and pivoting to Chaos by Cycle 5 won 88-92% vs 71% for a Cycle 9 pivot. Extra Crypto lowered the win rate (70 -> 62 of 80 as the Crypto weight rose), because draw/Power Base cards return more per Crypto spent. Shyte-Coin is never bought. Human opponents deploy far better than the scripts, so re-test all of this against the human.' },
    ],
    cardNotes: {}, knownCards: [], knownLocations: [], cardStats: {}, locationStats: {},
    record: { games: 0, aiWins: 0, humanWins: 0, ties: 0 }, ignored: { count: 0, lastReason: null }, signals: [], history: [],
  };
}

async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

async function writeAtomic(path: string, text: string) {
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, path);
}

async function loadCatalog(contentFile: string): Promise<Catalog> {
  const stored = await readJson<{ document?: { cards?: CatalogCard[]; locations?: CatalogLocation[]; startingDecks?: { id: string; cards: { cardId: string; count: number }[] }[]; activeStartingDeckId?: string } }>(contentFile);
  const cards = new Map<string, CatalogCard>(), locations = new Map<string, CatalogLocation>();
  for (const card of stored?.document?.cards ?? []) if (card.enabled !== false && !card.generated) cards.set(card.definitionId ?? card.id, migrateCard(card));
  for (const location of stored?.document?.locations ?? []) if (location.enabled !== false) locations.set(location.id, location);
  const decks = stored?.document?.startingDecks ?? [];
  const active = decks.find(deck => deck.id === stored?.document?.activeStartingDeckId) ?? decks[0];
  const nameOf = (id: string) => (stored?.document?.cards ?? []).find(card => (card.definitionId ?? card.id) === id)?.name ?? id;
  return { cards, locations, ...(active?.cards.length ? { startingDeck: active.cards.map(entry => ({ name: nameOf(entry.cardId), count: entry.count })) } : {}) };
}

/** Why a finished session does not count as a game, or null when it does. */
function notCounted(report: MatchReport): string | null {
  if (report.phase !== 'gameover') return `unfinished (${report.phase} at Cycle ${report.cycle})`;
  if (!COMPLETE_GAME.test(report.endedReason ?? '')) return `ended at Cycle ${report.cycle} by: ${report.endedReason ?? 'unknown'}`;
  return null;
}

/** VP lead plus Server lead (250 Server points ~ 1 VP), from `seat`'s side. */
function marginFor(report: MatchReport, seat: 0 | 1): number {
  const other = (1 - seat) as 0 | 1;
  return report.finalVP[seat] - report.finalVP[other] + (report.servers[seat] - report.servers[other]) / 250;
}

const FULL_INTEGRITY = serverMaximums.primary + serverMaximums.backup;
const neutralContext = (cycle: number) => ({ cycle, finalCycle: 16, owned: [], ownServers: FULL_INTEGRITY, ownServersMax: FULL_INTEGRITY, enemyServers: FULL_INTEGRITY, enemyServersMax: FULL_INTEGRITY });

/** A one-line read on what a card is for, from its effects. */
function describeCard(card: CatalogCard, profile: StrategyProfile): string {
  const effects = [...(card.onReveal ?? []), ...(card.onCollapse ?? []), ...(card.recurring ?? [])];
  const total = (action: Parameters<typeof effectTotal>[1], enemy = false) => effectTotal(effects, action, enemy);
  const roles: string[] = [];
  if (card.type === 'Crypto') roles.push((card.cryptoValue ?? 0) < profile.minCryptoValue ? 'low-value Crypto (skip)' : `Crypto worth ${card.cryptoValue}`);
  if (card.type === 'VP') roles.push(`${card.vp} VP finisher`);
  if (total('draw') >= 2) roles.push('deck-cycling draw engine');
  if (total('gainActions') >= 2) roles.push('Action engine');
  if (total('gainCrypto') >= 2) roles.push('economy');
  if (total('damageServer', true) >= 150) roles.push('endgame Drain finisher');
  else if (total('damageServer', true) > 0) roles.push('light Drain');
  if (total('repairServer') >= 150) roles.push('Server defense');
  if (total('trashCards') > 0 || hasAction(effects, 'scry')) roles.push('deck thinning');
  if ((card.power ?? 0) >= 5) roles.push('high Power');
  const early = handValue(card, profile, neutralContext(3)), late = handValue(card, profile, neutralContext(11));
  return `${roles.join(', ') || 'utility'}; est. hand value ${round(early, 1)} early / ${round(late, 1)} late at cost ${card.cost}. Untested.`;
}

function summarizeReport(report: MatchReport, catalog: Catalog): string {
  const name = (id: string) => catalog.cards.get(id)?.name ?? id;
  const bought = (owner: 0 | 1) => {
    const counts = new Map<string, number>();
    for (const purchase of report.purchases.filter(item => item.owner === owner)) counts.set(purchase.definitionId, (counts.get(purchase.definitionId) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([id, count]) => `${name(id)}${count > 1 ? ` x${count}` : ''}`).join(', ') || 'nothing';
  };
  const outcome = report.winner === 1 ? 'I won' : report.winner === 0 ? 'The human won' : 'Tie';
  return `${outcome} at Cycle ${report.cycle} (${report.endedReason ?? 'unfinished'}). VP human ${report.finalVP[0]} / me ${report.finalVP[1]}. Servers human ${report.servers[0]} / me ${report.servers[1]}. Human bought: ${bought(0)}. I bought: ${bought(1)}.`;
}

/** Notes the agent writes after each Draft, while the game is still running. */
function cycleNote(report: MatchReport, catalog: Catalog, previous: number): string[] {
  const latest = report.cycles.at(-1);
  if (!latest) return [];
  const name = (id: string) => catalog.cards.get(id)?.name ?? id;
  const notes: string[] = [];
  const fresh = report.purchases.filter(purchase => purchase.cycle > previous);
  const human = fresh.filter(purchase => purchase.owner === 0), mine = fresh.filter(purchase => purchase.owner === 1);
  notes.push(`Cycle ${latest.cycle}: VP ${latest.vp[0]}-${latest.vp[1]} (human-me), Servers ${latest.servers[0]}/${latest.servers[1]}, Locations won ${latest.locationsWon[0]}-${latest.locationsWon[1]}, Draft wallets ${latest.wallet[0]}/${latest.wallet[1]}. Human bought ${human.map(item => name(item.definitionId)).join(', ') || 'nothing'}; I bought ${mine.map(item => name(item.definitionId)).join(', ') || 'nothing'}.`);
  const humanChaos = report.purchases.filter(item => item.owner === 0 && item.category === 'Chaos').length;
  if (latest.cycle <= 6 && humanChaos >= 2) notes.push(`Observation: the human already owns ${humanChaos} Chaos cards by Cycle ${latest.cycle} - an early-aggression line. Watch my Servers.`);
  if (latest.wallet[0] >= latest.wallet[1] + 4) notes.push(`Observation: the human's Draft wallet (${latest.wallet[0]}) outpaces mine (${latest.wallet[1]}). Their economy is ahead.`);
  if (latest.servers[1] < 1500) notes.push(`Warning: my Servers are at ${latest.servers[1]}. Defense (Restore) matters now.`);
  if (latest.servers[0] < 1300) notes.push(`Opportunity: human Servers at ${latest.servers[0]}. A Drain push could destroy them for VP.`);
  const lostAll = latest.locations.filter(location => location.winner === 0).map(location => location.name);
  if (lostAll.length >= 4) notes.push(`I lost most Locations this Cycle (${lostAll.join(', ')}); my board Power is too low.`);
  return notes;
}

type Evidence = { support: boolean | null; reason: string };

/** Automatic evidence for the built-in theories: did the winner behave the way the theory predicts? */
function testTheory(test: TheoryTest, report: MatchReport, catalog: Catalog): Evidence {
  if (report.winner === null) return { support: null, reason: 'tie' };
  const winner = report.winner, loser = (1 - winner) as 0 | 1;
  const of = (owner: 0 | 1) => report.purchases.filter(item => item.owner === owner);
  const card = (id: string) => catalog.cards.get(id);
  const draws = (id: string) => effectTotal(card(id)?.onReveal, 'draw');
  const compare = (a: number, b: number, label: string): Evidence => a === b ? { support: null, reason: `${label} equal (${a})` } : { support: a > b, reason: `${label}: winner ${a}, loser ${b}` };
  switch (test) {
    case 'no-shyte': {
      const shyte = (owner: 0 | 1) => report.decks[owner]['shyte-coin'] ?? 0;
      const [won, lost] = [shyte(winner), shyte(loser)];
      return won === lost ? { support: null, reason: `Shyte-Coins owned equal (${won})` } : { support: won < lost, reason: `Shyte-Coins owned: winner ${won}, loser ${lost}` };
    }
    case 'economy-first': {
      const big = (owner: 0 | 1) => of(owner).filter(item => item.category === 'Crypto' && item.cost >= 6 && item.cycle <= 5).length;
      return compare(big(winner), big(loser), 'Kilo/Mega Crypto bought by Cycle 5');
    }
    case 'draw-engine': {
      const total = (owner: 0 | 1) => of(owner).reduce((sum, item) => sum + draws(item.definitionId), 0);
      return compare(total(winner), total(loser), 'cards of draw bought');
    }
    case 'chaos-endgame': {
      const late = (owner: 0 | 1) => of(owner).filter(item => item.category === 'Chaos' && item.cycle >= 8).length;
      return compare(late(winner), late(loser), 'Chaos bought from Cycle 8');
    }
    case 'early-aggression': {
      const early = (owner: 0 | 1) => of(owner).filter(item => item.category === 'Chaos' && item.cycle <= 5).length;
      return compare(early(winner), early(loser), 'Chaos bought by Cycle 5');
    }
    case 'vp-late': {
      const lateShare = (owner: 0 | 1) => {
        const vp = of(owner).filter(item => item.category === 'VP');
        return vp.length ? vp.filter(item => item.cycle >= 12).length / vp.length : 0;
      };
      return compare(round(lateShare(winner)), round(lateShare(loser)), 'share of VP buys from Cycle 12');
    }
    case 'drain-race': {
      const destroyed = /Servers destroyed/i.test(report.endedReason ?? '');
      return { support: destroyed && report.cycle < 12, reason: destroyed ? `Servers destroyed at Cycle ${report.cycle}` : `went to Cycle ${report.cycle} on VP` };
    }
  }
}

/** Confidence and status come only from counted evidence; nobody can declare a theory supported. */
function scoreTheory(theory: Theory) {
  theory.confidence = round((theory.support + 1) / (theory.support + theory.against + 2));
  if (theory.status === 'retired') return;
  const evidence = theory.support + theory.against;
  theory.status = evidence < 3 ? 'proposed' : theory.confidence >= 0.65 ? 'supported' : theory.confidence <= 0.35 ? 'refuted' : 'proposed';
}

/** Moves a numeric field toward `target` by at most `step`, so one experiment never swings the plan. */
const nudge = (current: number, target: number, step: number) => current + Math.max(-step, Math.min(step, target - current));

function applyChange(base: StrategyProfile, change: ProfileChange): StrategyProfile {
  const scalars: Partial<StrategyProfile> = {};
  for (const field of SCALAR_FIELDS) if (typeof change[field] === 'number') scalars[field] = change[field];
  return sanitizeProfile({ ...base, ...scalars, minCryptoValue: base.minCryptoValue, weights: { ...base.weights, ...(change.weights ?? {}) }, cardBias: { ...base.cardBias, ...(change.cardBias ?? {}) } }, base);
}

function mergeChange(a: ProfileChange, b: ProfileChange): ProfileChange {
  return { ...a, ...b, weights: { ...(a.weights ?? {}), ...(b.weights ?? {}) }, cardBias: { ...(a.cardBias ?? {}), ...(b.cardBias ?? {}) } };
}

function diffProfile(from: StrategyProfile, to: StrategyProfile): ProfileChange {
  const change: ProfileChange = {};
  for (const field of SCALAR_FIELDS) if (to[field] !== from[field]) change[field] = to[field];
  for (const key of Object.keys(to.weights) as (keyof StrategyWeights)[]) if (to.weights[key] !== from.weights[key]) (change.weights ??= {})[key] = to.weights[key];
  for (const id of new Set([...Object.keys(from.cardBias), ...Object.keys(to.cardBias)])) if ((to.cardBias[id] ?? 0) !== (from.cardBias[id] ?? 0)) (change.cardBias ??= {})[id] = to.cardBias[id] ?? 0;
  return change;
}

const isEmptyChange = (change: ProfileChange) => !SCALAR_FIELDS.some(field => change[field] !== undefined) && !Object.keys(change.weights ?? {}).length && !Object.keys(change.cardBias ?? {}).length;

function describeChange(from: StrategyProfile, change: ProfileChange, cardName: (id: string) => string): string {
  const parts: string[] = [];
  for (const field of SCALAR_FIELDS) if (change[field] !== undefined) parts.push(`${FIELD_LABEL[field]} ${from[field]}→${change[field]}`);
  for (const [key, value] of Object.entries(change.weights ?? {})) parts.push(`${key} weight ${from.weights[key as keyof StrategyWeights]}→${value}`);
  for (const [id, value] of Object.entries(change.cardBias ?? {})) parts.push(`${cardName(id)} bias ${from.cardBias[id] ?? 0}→${value}`);
  return parts.join(', ') || 'no change';
}

function armLine(arm: ArmStats) {
  return `${arm.wins}-${arm.losses}${arm.ties ? `-${arm.ties}` : ''} (margin ${arm.games ? `${round(arm.margin / arm.games, 1) >= 0 ? '+' : ''}${round(arm.margin / arm.games, 1)}` : 'n/a'}/game)`;
}
function labLine(lab: NonNullable<Experiment['lab']>) {
  const league = lab.league;
  if (league) return `league ${league.experimentPoints}/${league.pairs} for the experiment vs ${league.controlPoints}/${league.pairs} for the current best against ${league.opponents.join(', ') || 'no one'} (margin ${league.marginGain >= 0 ? '+' : ''}${league.marginGain}/game) → ${lab.verdict}`;
  return `lab ${lab.experimentWins}-${lab.controlWins}${lab.ties ? `-${lab.ties}` : ''} vs current best over ${lab.games - lab.invalid} self-play games (margin ${lab.meanMargin >= 0 ? '+' : ''}${lab.meanMargin}/game) → ${lab.verdict}`;
}
function fieldLine(exp: Experiment) {
  return `vs human: experiment ${armLine(exp.field.experiment)}, current best ${armLine(exp.field.control)}`;
}

function heuristicPlan(memory: StrategistMemory, version: number): string {
  const p = memory.profile;
  const adopted = memory.experiments.filter(item => item.stage === 'adopted');
  return [
    `${versionLabel(version)} plays the designer's baseline${adopted.length ? ` plus ${adopted.length} adopted change${adopted.length === 1 ? '' : 's'} (${adopted.map(item => item.changeSummary).join('; ')})` : ''}.`,
    `Through Cycle ${p.economyUntilCycle}: strong draw/Action Base cards and Crypto worth ${p.minCryptoValue}+ (never Shyte-Coin), aiming for ~${round(p.handCryptoTarget, 1)} Crypto per hand.`,
    p.chaosFromCycle - 1 > p.economyUntilCycle ? `Cycles ${p.economyUntilCycle + 1}-${p.chaosFromCycle - 1}: ${p.midgameMix ? 'a balanced midgame of attacks, engine, Server Restore and VP' : 'high-Power and Duration Base cards to win Locations'}.` : '',
    `From Cycle ${p.chaosFromCycle}: Chaos and Drain for the endgame push; VP cards from Cycle ${p.vpFromCycle}, and the last Draft buys only VP.`,
    memory.experiment ? `Testing ${memory.experiment.id}: ${memory.experiment.hypothesis}` : '',
  ].filter(Boolean).join(' ');
}

/** Model plans are prose; the schedule suffix states what the profile will actually do. */
function withSchedule(plan: string, profile: StrategyProfile): string {
  const prose = plan.replace(/\s*\(Schedule:[^)]*\)\s*$/, '').trim();
  const midgame = profile.midgameMix && profile.chaosFromCycle - 1 > profile.economyUntilCycle ? `, balanced midgame Cycles ${profile.economyUntilCycle + 1}-${profile.chaosFromCycle - 1}` : '';
  return `${prose} (Schedule: economy through Cycle ${profile.economyUntilCycle}${midgame}, Chaos from Cycle ${profile.chaosFromCycle}, VP from Cycle ${profile.vpFromCycle}.)`;
}

function profileLine(p: StrategyProfile) {
  return `Economy through Cycle ${p.economyUntilCycle} · ${p.midgameMix ? `midgame mix ${p.midgameMix} · ` : ''}Chaos from Cycle ${p.chaosFromCycle} · VP from Cycle ${p.vpFromCycle} · Crypto target ${round(p.handCryptoTarget, 1)}/hand · min Crypto value ${p.minCryptoValue} · min buy score ${p.minBuyScore} · dilution ${p.dilution}`;
}

/** `human`: it plays the human (every agent can be picked as the opponent); `defaultOpponent`: it is the one picked unless the human chooses another. */
type NotebookVoice = { name: string; style: string | null; envelope: string | null; league: boolean; human: boolean; defaultOpponent?: boolean };

function renderNotebook(memory: StrategistMemory, catalog: Catalog, voice: NotebookVoice = { name: 'Strat-G', style: null, envelope: null, league: false, human: true, defaultOpponent: true }): string {
  const p = memory.profile, r = memory.record, b = memory.baseline;
  const byStatus = (status: TheoryStatus) => memory.theories.filter(theory => theory.status === status);
  const theoryLine = (theory: Theory) => `- **${theory.id}** (${theory.support + theory.against ? `${Math.round(theory.confidence * 100)}% · ${theory.support} for / ${theory.against} against` : 'untested'} · ${versionLabel(theory.createdBy)}${theory.test ? ' · scored every game' : ''}): ${theory.text}`;
  const cardName = (id: string) => catalog.cards.get(id)?.name ?? catalog.locations.get(id)?.name ?? id;
  const stats = Object.entries(memory.cardStats)
    .map(([id, stat]) => ({ id, stat, games: stat.ai.games + stat.human.games, wins: stat.ai.wins + stat.human.wins }))
    .filter(entry => entry.games >= 2).sort((a, b) => b.wins / b.games - a.wins / a.games).slice(0, 15);
  const locations = Object.entries(memory.locationStats).sort((a, b) => b[1].seen - a[1].seen).slice(0, 15);
  const bias = Object.entries(p.cardBias).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 15);
  const adopted = memory.experiments.filter(item => item.stage === 'adopted');
  const exp = memory.experiment;
  const list = (items: string[], empty: string) => items.length ? items : [empty];
  const name = voice.name;
  const snapshots = memory.snapshots ?? [];
  return [
    `# ${name} notebook`,
    ``,
    voice.human && voice.defaultOpponent
      ? `Written by ${name}, the AI opponent's strategy agent. Each dev-server start reads this notebook (and \`memory.json\`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.`
      : voice.human
        ? `Written by ${name}, a league adversary. It plays AI-vs-AI league games, and the human whenever the human picks it as the opponent. Each dev-server start reads this notebook (and \`memory.json\`), plans, and leaves notes here. Its version changes only when the profile it plays changes.`
        : `Written by ${name}, a league adversary. It plays only AI-vs-AI league games. Each dev-server start reads this notebook (and \`memory.json\`), plans, and leaves notes here. Its version changes only when the profile it plays changes.`,
    ``,
    voice.league
      ? `How ${name} learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.`
      : `How ${name} learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, screened in seeded self-play against the current best, then played in alternating games against the human. Code measures the results and adopts or rejects the change; theories gain evidence the same way.`,
    ``,
    ...(voice.style ? [`Style: ${voice.style}`, ``] : []),
    ...(voice.envelope ? [`Style envelope (every profile is clamped into it): ${voice.envelope}.`, ``] : []),
    `## Current agent: ${versionLabel(memory.version)} (${memory.mode === 'llm' ? 'model-assisted' : 'heuristic'})`,
    ``,
    ...(voice.human ? [`Record against the human (complete games only): ${r.aiWins} wins, ${r.humanWins} losses, ${r.ties} ties over ${r.games} games.${memory.ignored.count ? ` Ignored ${memory.ignored.count} session${memory.ignored.count === 1 ? '' : 's'} that were not complete games.` : ''}`, ``] : []),
    ...(snapshots.length ? [`League snapshots (newest first): ${snapshots.slice(-5).reverse().map(item => item.label).join(', ')}`, ``] : []),
    `### Plan of play`,
    ``,
    memory.plan,
    ``,
    `### Profile in play (current best)`,
    ``,
    profileLine(p),
    ``,
    `Weights: ${Object.entries(p.weights).map(([key, value]) => `${key} ${value}`).join(', ')}`,
    ``,
    bias.length ? `Card biases: ${bias.map(([id, value]) => `${cardName(id)} ${value > 0 ? '+' : ''}${value}`).join(', ')}` : 'Card biases: none.',
    ``,
    `## Baseline strategy (protected)`,
    ``,
    `The designer's playbook, in force since ${b.since.slice(0, 10)}. Learning never edits it; changes are layered on top only when an experiment earns them.`,
    ``,
    ...b.playbook.map(line => `- ${line}`),
    ``,
    `Baseline profile: ${profileLine(b.profile)}`,
    ``,
    `Baseline weights: ${Object.entries(b.profile.weights).map(([key, value]) => `${key} ${value}`).join(', ')}`,
    ``,
    ...(memory.sharedTips ? [
      `## Tips I shared`,
      ``,
      `Asked by the designer on ${memory.sharedTips.at.slice(0, 10)} (${memory.sharedTips.mode === 'llm' ? 'model-assisted' : 'from my profile'}), for agents that need to understand engines and economy:`,
      ``,
      ...memory.sharedTips.tips.map(tip => `${tip.rank}. ${tip.text} (${describeChange(p, tip.change, cardName)})`),
      ``,
    ] : []),
    `## Adopted changes`,
    ``,
    ...list(adopted.map(item => `- **${item.id}** (${versionLabel(item.concludedBy ?? -1)}): ${item.changeSummary}. ${item.verdict ?? ''}`), '- none yet: playing the pure baseline.'),
    ``,
    `## Current experiment`,
    ``,
    ...(exp ? [
      `- **${exp.id}** (${exp.stage}, proposed by ${versionLabel(exp.proposedBy)}, ${exp.source}): ${exp.hypothesis}`,
      `- Change: ${exp.changeSummary}`,
      `- Prediction: ${exp.prediction}`,
      `- Theory: ${exp.theoryId ?? 'none'}${exp.theoryId ? ` (success ${exp.supportsTheory ? 'supports' : 'counts against'} it)` : ''}`,
      exp.lab ? `- ${labLine(exp.lab)}` : `- ${voice.league ? 'League trial' : 'Lab'}: ${exp.stage === 'lab' ? 'pending' : 'skipped (self-play unavailable)'}`,
      ...(voice.league ? [] : [`- ${fieldLine(exp)}; needs ${FIELD_GAMES_PER_ARM} complete games per arm.`]),
    ] : ['- none running.']),
    ``,
    `## Experiment log`,
    ``,
    ...list(memory.experiments.slice(-15).reverse().map(item => `- **${item.id}** ${item.stage} (${versionLabel(item.concludedBy ?? -1)}): ${item.hypothesis} Change: ${item.changeSummary}. ${item.verdict ?? ''}`), '- no experiments concluded yet.'),
    ``,
    `## Theories`,
    ``,
    `### Supported`, ...list(byStatus('supported').map(theoryLine), '- none yet'), ``,
    `### Under test`, ...list(byStatus('proposed').map(theoryLine), '- none'), ``,
    `### Refuted`, ...list(byStatus('refuted').map(theoryLine), '- none yet'), ``,
    `## Card and Location notes`,
    ``,
    ...(Object.entries(memory.cardNotes).slice(-40).map(([id, note]) => `- **${cardName(id)}**: ${note}`)),
    ``,
    ...(voice.human ? [
      `## Card results (complete games where a side bought it)`,
      ``,
      ...list(stats.map(({ id, stat, games, wins }) => `- ${cardName(id)}: ${wins}/${games} wins (me ${stat.ai.wins}/${stat.ai.games}, human ${stat.human.wins}/${stat.human.games})`), '- not enough games yet'),
      ``,
      `## Locations (from my side, complete games)`,
      ``,
      ...list(locations.map(([id, stat]) => `- ${cardName(id)}: seen ${stat.seen}, I won ${stat.aiWon}, human won ${stat.humanWon}`), '- no data yet'),
      ``,
    ] : []),
    `## Recent notes`,
    ``,
    ...memory.notes.slice(-40).reverse().map(note => `- ${versionLabel(note.version)} · ${note.at.slice(0, 16).replace('T', ' ')} · ${note.text}`),
    ``,
    `## Version history`,
    ``,
    ...memory.history.slice(-20).reverse().map(entry => `- ${versionLabel(entry.version)} (${entry.mode}) since ${entry.bootedAt.slice(0, 16).replace('T', ' ')} · ${entry.aiWins}/${entry.games} wins · ${entry.plan.slice(0, 160)}${entry.plan.length > 160 ? '…' : ''}`),
    ``,
  ].join('\n');
}

type ModelAdvice = {
  plan?: string;
  notes?: string[];
  theories?: { id?: string; text?: string; status?: string }[];
  experiment?: { theoryId?: string; hypothesis?: string; prediction?: string; change?: ProfileChange } | null;
  cardNotes?: Record<string, string>;
};

const ADVICE_REPLY = `Reply with a single JSON object: {"plan": string (<= 600 chars: how you will play the current best, and what the running experiment tests), "notes": string[] (0-6 short notebook entries), "theories": [{"id": kebab-case string, "text": string, "status": "proposed"|"retired"}] (only new or retired theories), "experiment": null or {"theoryId": string, "hypothesis": string, "prediction": string, "change": {new absolute values for any of economyUntilCycle, chaosFromCycle, vpFromCycle, handCryptoTarget, minBuyScore, dilution, "weights": {...}, "cardBias": {definitionId: points}}}, "cardNotes": {card or location id: string}}. Propose an experiment only when the task says none is running.`;
const TIPS_REPLY = 'Reply with a single JSON object: {"tips": [{"text": string (<= 200 chars, specific: name cards, Cycles and numbers), "change": {the values in YOUR OWN profile that embody this tip, as absolute values for any of economyUntilCycle, chaosFromCycle, vpFromCycle, handCryptoTarget, minBuyScore, dilution, "weights": {...}, "cardBias": {definitionId: points}}}]}, best tip first.';

function compactCatalog(catalog: Catalog, profile: StrategyProfile): string {
  const cards = [...catalog.cards.values()].map(card => `${card.definitionId ?? card.id} | ${card.name} | ${card.pool ?? card.type} | cost ${card.cost} | power ${card.power ?? 0}${card.vp ? ` | ${card.vp} VP` : ''}${card.cryptoValue ? ` | Crypto ${card.cryptoValue}` : ''} | ${card.effect}`);
  const locations = [...catalog.locations.values()].map(location => `${location.id} | ${location.name} | ${location.rule} | read (my weights, Cycle 8): ${locationRead(location, profile)}`);
  return `CARDS (id | name | pool | cost | power | effect):\n${cards.join('\n')}\n\nLOCATIONS (id | name | rule | read):\n${locations.join('\n')}`;
}

/** Strat-G reads the game's outcome and economy, not its own per-decision log. */
function reportForModel(report: MatchReport) {
  const { decisions: _decisions, telemetry, ...rest } = report;
  if (!telemetry) return rest;
  const { cards: _cards, perCycle: _perCycle, ...totals } = telemetry;
  return { ...rest, telemetry: totals };
}

function memoryForModel(memory: StrategistMemory) {
  const experiment = (item: Experiment) => ({ id: item.id, stage: item.stage, theoryId: item.theoryId, hypothesis: item.hypothesis, change: item.changeSummary, lab: item.lab ? labLine(item.lab) : null, field: fieldLine(item), verdict: item.verdict });
  return {
    version: memory.version, record: memory.record, plan: memory.plan,
    baseline: { playbook: memory.baseline.playbook, profile: memory.baseline.profile },
    currentBest: memory.profile,
    adoptedChanges: memory.experiments.filter(item => item.stage === 'adopted').map(experiment),
    runningExperiment: memory.experiment ? experiment(memory.experiment) : null,
    recentExperiments: memory.experiments.slice(-8).map(experiment),
    theories: memory.theories.filter(theory => theory.status !== 'retired').map(({ id, text, status, confidence, support, against }) => ({ id, text, status, confidence: round(confidence), support, against })),
    recentNotes: memory.notes.slice(-30).map(note => `${versionLabel(note.version)}: ${note.text}`),
    cardNotes: memory.cardNotes,
    cardStats: memory.cardStats, locationStats: memory.locationStats,
  };
}

export function createStrategist(options: StrategistOptions = {}) {
  const root = options.root ?? resolve(process.cwd(), 'ai-strategist');
  const contentFile = options.contentFile ?? resolve(process.cwd(), 'content/authored-content.json');
  const identity = options.identity;
  const name = identity?.name ?? 'Strat-G';
  const agentId = identity?.id ?? 'strat-g';
  /** Strat-G is the default opponent; the human can pick any league agent instead. */
  const defaultOpponent = !identity || identity.id === 'strat-g';
  const leagueMode = !!options.league;
  const voice: NotebookVoice = { name, style: identity?.style ?? null, envelope: identity ? describeEnvelope(identity.envelope) : null, league: leagueMode, human: true, defaultOpponent };
  const log = options.log ?? ((message: string) => console.log(`[${name}] ${message}`));
  const enabled = options.enabled ?? (() => true);
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model || 'gpt-4o-mini';
  const memoryFile = join(root, 'memory.json');
  const labSeedCount = () => Math.max(1, Math.round((typeof options.labSeeds === 'function' ? options.labSeeds() : options.labSeeds) ?? LAB_SEEDS) || LAB_SEEDS);
  /** Keeps every profile this agent plays inside its style. */
  const shape = (profile: StrategyProfile) => identity ? clampToEnvelope(profile, identity.envelope) : profile;
  let memory: StrategistMemory = seedMemory(identity);
  let catalog: Catalog = { cards: new Map(), locations: new Map() };
  let writes: Promise<unknown> = Promise.resolve();
  const games = new Map<string, { file: string; lastCycle: number; notes: string[]; startedAt: string }>();
  const cardName = (id: string) => catalog.cards.get(id)?.name ?? catalog.locations.get(id)?.name ?? id;

  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = writes.then(task, task);
    writes = run.catch(() => undefined);
    return run;
  };

  const note = (text: string) => {
    memory.notes.push({ version: memory.version, at: now(), text });
    if (memory.notes.length > NOTE_LIMIT) memory.notes = memory.notes.slice(-NOTE_LIMIT);
  };

  /** The current best: the baseline with every adopted change applied. */
  function composeProfile(): StrategyProfile {
    return { ...shape(applyChange(sanitizeProfile(memory.baseline.profile), memory.adopted)), version: memory.version, plan: memory.plan };
  }
  function experimentProfile(experiment: Experiment): StrategyProfile {
    return { ...shape(applyChange(memory.profile, experiment.change)), version: memory.version, plan: memory.plan };
  }

  async function persist() {
    // A dev-server reload can leave an older instance finishing a slow boot; it must not overwrite a newer version.
    const saved = await readJson<{ version?: number }>(memoryFile).catch(() => null);
    if ((saved?.version ?? 0) > memory.version) { log(`${versionLabel(memory.version)} is stale (${versionLabel(saved!.version!)} is newer on disk); not saving`); return; }
    await recordVersion();
    await writeAtomic(memoryFile, `${JSON.stringify(memory, null, 2)}\n`);
    await writeAtomic(join(root, 'NOTEBOOK.md'), renderNotebook(memory, catalog, voice));
  }

  /** Freezes the current best as a league snapshot (`t-5@v1.0`, then `t-5@v1.1` after the next adoption). */
  async function saveSnapshot() {
    const label = `${identity?.id ?? 'strat-g'}@${versionLabel(memory.version)}`;
    const snapshot: Snapshot = { label, savedAt: now(), profile: { ...memory.profile, plan: '' } };
    memory.snapshots = [...(memory.snapshots ?? []).filter(item => item.label !== label), snapshot].slice(-10);
    await mkdir(join(root, 'snapshots'), { recursive: true });
    await writeAtomic(join(root, 'snapshots', `${label.replace(/[^\w.@-]/g, '-')}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  /** Opens the history entry and version file for the current version, once. */
  async function recordVersion() {
    if (memory.history.some(entry => entry.version === memory.version)) return;
    memory.history.push({ version: memory.version, bootedAt: now(), mode: memory.mode, plan: memory.plan, games: 0, aiWins: 0 });
    if (memory.history.length > 100) memory.history = memory.history.slice(-100);
    await mkdir(join(root, 'versions'), { recursive: true });
    await writeAtomic(join(root, 'versions', `${versionLabel(memory.version)}.json`), `${JSON.stringify({ version: versionLabel(memory.version), since: now(), mode: memory.mode, plan: memory.plan, profile: memory.profile, adopted: memory.adopted, experiment: memory.experiment, theories: memory.theories }, null, 2)}\n`);
  }

  /** The profile in play changed: that, and only that, makes a new version. */
  function revise(reason: string) {
    memory.version++;
    memory.profile = composeProfile();
    note(`Now ${versionLabel(memory.version)}: ${reason}`);
  }

  async function askModel<T = ModelAdvice>(task: string, payload: unknown, replyFormat = ADVICE_REPLY): Promise<T | null> {
    if (!options.apiKey) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.6,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `You are ${name}, ${!identity || identity.id === 'strat-g' ? 'the strategy agent that plays the AI opponent in the card game 0uroboros' : 'a league adversary in the card game 0uroboros: you play AI-vs-AI league games against other agents whose profiles, plans and notes you never see, and sometimes games against the human'}. ${identity && identity.id !== 'strat-g' || leagueMode ? `YOUR STYLE: ${identity?.persona ?? 'balanced'} Every profile you play is clamped into your style envelope (${identity ? describeEnvelope(identity.envelope) : 'none'}), so propose experiments that sharpen this style rather than abandon it. ` : ''}You play from a protected BASELINE (the designer's playbook below) plus the changes your experiments have earned, and you improve it the way a scientist would: observe games, form hypotheses (theories), test one change at a time as an experiment, and document what you learn. You cannot edit the profile directly and you cannot declare a theory supported or refuted: code runs each experiment (${leagueMode ? 'paired league games: the experiment and your current best face the same sampled opponents, past and present, on the same seeds' : 'a seeded self-play trial against your current best, then alternating games against the human'}) and records the measured result. Think about strategies and archetypes, deck-building and deck size, tempo, resource efficiency (Crypto, Actions, cards), what to Draft and when, Node control, the probability of drawing what you need, damage, healing, VP, Circuit Rewards, card synergies, economic trade-offs, short- versus long-term value, and how to adapt to this opponent. Propose experiments that are small, specific and falsifiable, each tied to a theory, with a prediction the code can check (wins or VP/Server margin against the current best). Do not re-propose a change that was already rejected unless something changed (new cards, new evidence). One game is an anecdote; say so rather than over-generalising. Notes must be specific (name cards, Locations, Cycles, numbers) and must not restate the plan. The plan must agree with the profile numbers.\n\nBASELINE PLAYBOOK:\n- ${memory.baseline.playbook.join('\n- ')}\n\nRULES: ${RULES_SUMMARY}\n\nSTARTING DECK: ${catalog.startingDeck?.map(entry => `${entry.count}x ${entry.name}`).join(', ') ?? 'see the catalog'}.\n\n${DECKBUILDING_BASICS}\n\n${LOCATION_GUIDE}\n\n${PROFILE_GUIDE}\n${DECKBUILDING_PROFILE_NOTE}\n\n${replyFormat}` },
            { role: 'user', content: `${task}\n\n${JSON.stringify(payload)}` },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI responded ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = await response.json() as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content;
      return content ? JSON.parse(content) as T : null;
    } catch (error) {
      log(`model unavailable, using heuristics (${redact(error instanceof Error ? error.message : String(error))})`);
      return null;
    } finally { clearTimeout(timer); }
  }

  /** Notes, theories and plan from the model. It may propose or retire theories, never score them or touch the profile. */
  function applyAdvice(advice: ModelAdvice) {
    for (const text of (advice.notes ?? []).filter(item => typeof item === 'string').slice(0, 6)) note(text.replace(/^(before )?v[\d.]+:\s*/i, '').slice(0, 500));
    for (const [id, text] of Object.entries(advice.cardNotes ?? {})) if (typeof text === 'string' && (catalog.cards.has(id) || catalog.locations.has(id))) memory.cardNotes[id] = text.slice(0, 300);
    for (const proposal of advice.theories ?? []) {
      if (!proposal || typeof proposal.text !== 'string' && typeof proposal.id !== 'string') continue;
      const id = slug(proposal.id ?? proposal.text!) || `theory-${memory.theories.length + 1}`;
      const existing = memory.theories.find(theory => theory.id === id);
      if (existing) {
        if (proposal.status === 'retired' && existing.status !== 'retired') { existing.status = 'retired'; existing.updatedBy = memory.version; }
        else if (proposal.text && !existing.test && !existing.support && !existing.against) { existing.text = proposal.text.slice(0, 400); existing.updatedBy = memory.version; }
      } else if (proposal.text && proposal.status !== 'retired' && !memory.theories.some(theory => theory.status !== 'retired' && sameText(theory.text, proposal.text!))) {
        memory.theories.push({ id, text: proposal.text.slice(0, 400), status: 'proposed', confidence: 0.5, support: 0, against: 0, createdBy: memory.version, updatedBy: memory.version });
      }
    }
    const active = memory.theories.filter(theory => theory.status !== 'retired');
    if (active.length > THEORY_LIMIT) {
      const linked = new Set([memory.experiment?.theoryId]);
      for (const theory of active.filter(item => !item.test && !linked.has(item.id)).sort((a, b) => (a.support + a.against) - (b.support + b.against) || a.createdBy - b.createdBy).slice(0, active.length - THEORY_LIMIT)) theory.status = 'retired';
    }
    if (typeof advice.plan === 'string' && advice.plan.trim()) memory.plan = advice.plan.trim().slice(0, 600);
  }

  /** Bounds a proposed change against the current best; null when nothing would change. */
  function boundChange(change: ProfileChange | undefined): ProfileChange | null {
    if (!change || typeof change !== 'object') return null;
    const current = memory.profile;
    const target = { ...current, weights: { ...current.weights }, cardBias: { ...current.cardBias } };
    for (const field of SCALAR_FIELDS) {
      const value = change[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const step = field.endsWith('Cycle') || field === 'handCryptoTarget' ? 2 : field === 'minBuyScore' ? 0.75 : 0.25;
      target[field] = round(nudge(current[field], value, step));
    }
    for (const [key, value] of Object.entries(change.weights ?? {})) {
      if (!(key in current.weights) || typeof value !== 'number' || !Number.isFinite(value)) continue;
      const weight = current.weights[key as keyof StrategyWeights];
      target.weights[key as keyof StrategyWeights] = round(nudge(weight, value, Math.max(0.25, weight * 0.3)));
    }
    for (const [id, value] of Object.entries(change.cardBias ?? {})) {
      if (!catalog.cards.has(id) || typeof value !== 'number' || !Number.isFinite(value)) continue;
      target.cardBias[id] = round(nudge(current.cardBias[id] ?? 0, value, 1));
    }
    const bounded = diffProfile(current, shape(applyChange(current, diffProfile(current, target))));
    return isEmptyChange(bounded) ? null : bounded;
  }

  function createExperiment(fields: { theoryId: string | null; supportsTheory: boolean; hypothesis: string; prediction: string; change: ProfileChange; source: Experiment['source']; menuId?: string }): Experiment {
    memory.experimentCount++;
    const id = `x${String(memory.experimentCount).padStart(3, '0')}-${slug(fields.menuId ?? fields.theoryId ?? fields.hypothesis).slice(0, 28) || 'idea'}`;
    const experiment: Experiment = {
      id, ...fields, changeSummary: describeChange(memory.profile, fields.change, cardName),
      proposedBy: memory.version, proposedAt: now(), stage: 'lab', lab: null,
      field: { experiment: emptyArm(), control: emptyArm() }, verdict: null, concludedBy: null, concludedAt: null,
    };
    memory.experiment = experiment;
    note(`New experiment ${id}: ${experiment.hypothesis} Change: ${experiment.changeSummary}. Prediction: ${experiment.prediction}`);
    return experiment;
  }

  const rejectedRecently = (summary: string) => memory.experiments.slice(-12).some(item => item.stage !== 'adopted' && item.changeSummary === summary);

  function proposeFromModel(advice: ModelAdvice | null): boolean {
    const proposal = advice?.experiment;
    if (!proposal || typeof proposal.hypothesis !== 'string' || !proposal.hypothesis.trim()) return false;
    const change = boundChange(proposal.change);
    if (!change) { note(`Model experiment "${proposal.hypothesis.slice(0, 120)}" was skipped: it would not change the current best.`); return false; }
    if (rejectedRecently(describeChange(memory.profile, change, cardName))) { note(`Model experiment "${proposal.hypothesis.slice(0, 120)}" was skipped: the same change was tested recently.`); return false; }
    const theoryId = typeof proposal.theoryId === 'string' && memory.theories.some(theory => theory.id === slug(proposal.theoryId!) && theory.status !== 'retired') ? slug(proposal.theoryId) : null;
    createExperiment({ theoryId, supportsTheory: true, hypothesis: proposal.hypothesis.trim().slice(0, 300), prediction: (proposal.prediction ?? 'More wins and a better margin than the current best.').slice(0, 300), change, source: 'model' });
    return true;
  }

  /** Works through the menu, starting with what the last game suggested and skipping recently tested ideas. */
  function proposeFromMenu(): boolean {
    const recent = new Set(memory.experiments.slice(-EXPERIMENT_MENU.length + 1).map(item => item.menuId));
    const ordered = [...EXPERIMENT_MENU].sort((a, b) => Number(memory.signals.includes(b.id)) - Number(memory.signals.includes(a.id)));
    for (const item of ordered) {
      if (recent.has(item.id)) continue;
      const change = boundChange(item.change(memory.profile));
      if (!change || rejectedRecently(describeChange(memory.profile, change, cardName))) continue;
      createExperiment({ theoryId: memory.theories.some(theory => theory.id === item.theoryId && theory.status !== 'retired') ? item.theoryId : null, supportsTheory: item.supportsTheory, hypothesis: item.hypothesis, prediction: item.prediction, change, source: 'heuristic', menuId: item.id });
      return true;
    }
    return false;
  }

  /** When the menu is exhausted, nudge one envelope-clamped field so a league trial can still run. */
  function proposeFallbackExperiment(): boolean {
    const profile = memory.profile;
    const weightKeys = Object.keys(profile.weights) as (keyof StrategyWeights)[];
    const attempts: ProfileChange[] = [
      ...weightKeys.map(key => ({ weights: { [key]: profile.weights[key] + 0.25 } })),
      { dilution: profile.dilution + 0.15 },
      { dilution: Math.max(0, profile.dilution - 0.15) },
      { minBuyScore: profile.minBuyScore + 0.25 },
      { handCryptoTarget: profile.handCryptoTarget + 1 },
    ];
    for (let i = 0; i < attempts.length; i++) {
      const change = boundChange(attempts[i]);
      if (!change || rejectedRecently(describeChange(profile, change, cardName))) continue;
      const menuId = `fallback-${memory.experimentCount + 1}-${i}`;
      createExperiment({
        theoryId: null, supportsTheory: true, menuId,
        hypothesis: 'A small envelope-clamped nudge while the experiment menu has nothing left to try.',
        prediction: 'More wins or a better margin than the current best.',
        change, source: 'heuristic',
      });
      log(`proposed fallback experiment ${memory.experiment!.id}`);
      return true;
    }
    return false;
  }

  function creditTheory(experiment: Experiment, success: boolean, reason: string) {
    const theory = experiment.theoryId ? memory.theories.find(item => item.id === experiment.theoryId) : undefined;
    if (!theory) return;
    if (success === experiment.supportsTheory) theory.support++; else theory.against++;
    scoreTheory(theory);
    theory.updatedBy = memory.version;
    note(`Theory ${theory.id} ${success === experiment.supportsTheory ? 'gained support' : 'was contradicted'} from ${experiment.id} (${reason}); now ${theory.support} for / ${theory.against} against.`);
  }

  function conclude(experiment: Experiment, stage: 'adopted' | 'rejected' | 'inconclusive', verdict: string) {
    if (stage === 'adopted') {
      memory.adopted = mergeChange(memory.adopted, experiment.change);
      revise(`adopted ${experiment.id} (${experiment.changeSummary}).`);
    }
    experiment.stage = stage; experiment.verdict = verdict; experiment.concludedBy = memory.version; experiment.concludedAt = now();
    memory.experiments.push(experiment);
    if (memory.experiments.length > EXPERIMENT_LOG_LIMIT) memory.experiments = memory.experiments.slice(-EXPERIMENT_LOG_LIMIT);
    memory.experiment = null;
    note(`Experiment ${experiment.id} ${stage}: ${verdict}`);
  }

  /** Seeded self-play, experiment vs current best with seats swapped per seed. Runs in the background. */
  async function runLab(experiment: Experiment): Promise<void> {
    let harness: SelfPlayHarness | null = null, document: unknown = null;
    try {
      harness = options.loadSelfPlay ? await options.loadSelfPlay() : null;
      document = harness ? (await readJson<{ document?: unknown }>(contentFile))?.document ?? null : null;
    } catch (error) { log(`lab unavailable (${error instanceof Error ? error.message : String(error)})`); harness = null; }
    if (!harness || !document) {
      experiment.stage = 'field';
      note(`Experiment ${experiment.id}: self-play lab unavailable, so it goes straight to games against the human.`);
      return;
    }
    const content = harness.compileForSelfPlay(document as never);
    const control = { ...memory.profile }, trial = experimentProfile(experiment);
    const labSeeds = labSeedCount();
    const base = 7000 + memory.experimentCount * 101;
    const seeds = Array.from({ length: labSeeds }, (_, index) => base + index);
    let games = 0, invalid = 0, experimentWins = 0, controlWins = 0, ties = 0, margin = 0;
    for (const seed of seeds) for (const seat of [0, 1] as const) {
      await tick();
      if (!enabled() || memory.experiment !== experiment) { log(`lab for ${experiment.id} stopped; it resumes on the next trigger`); return; }
      const result = harness.playSelfPlayGame({ content: content as never, seed, strategy: control, seatStrategies: seat === 0 ? [trial, control] : [control, trial], recordDecisions: false });
      games++;
      if (!result.valid || !result.report) { invalid++; continue; }
      if (result.report.winner === seat) experimentWins++; else if (result.report.winner === null) ties++; else controlWins++;
      margin += marginFor(result.report, seat);
    }
    const valid = games - invalid, decided = experimentWins + controlWins;
    const rate = decided ? experimentWins / decided : 0.5, meanMargin = valid ? round(margin / valid, 1) : 0;
    const verdict = valid < labSeeds ? 'inconclusive' : rate >= 0.58 && meanMargin > 0 ? 'promising' : rate <= 0.42 || (rate < 0.5 && meanMargin < 0) ? 'rejected' : 'inconclusive';
    experiment.lab = { seeds, games, invalid, experimentWins, controlWins, ties, meanMargin, verdict };
    const line = labLine(experiment.lab);
    if (verdict === 'promising') {
      experiment.stage = 'field';
      creditTheory(experiment, true, line);
      note(`Experiment ${experiment.id}: ${line}. Next: alternate it with the current best in games against the human.`);
    } else {
      if (verdict === 'rejected') creditTheory(experiment, false, line);
      conclude(experiment, verdict, `${line}. Kept the current best.`);
    }
  }

  /** Makes sure an experiment is running, then screens it; failures are logged and never reach gameplay. */
  function continueExperiments(advice: ModelAdvice | null) {
    if (!memory.experiment && !proposeFromModel(advice)) proposeFromMenu();
  }
  let labBudget = 0;
  /** `refill` tops the queue up to the automatic budget. League agents never screen on their own. */
  function scheduleLab(refill = false) {
    if (leagueMode) return;
    if (refill) labBudget = LAB_TRIALS_PER_TRIGGER;
    const experiment = memory.experiment;
    if (!experiment || experiment.stage !== 'lab' || !enabled() || labBudget <= 0) { labBudget = 0; return; }
    labBudget--;
    void serialize(async () => {
      if (memory.experiment !== experiment || experiment.stage !== 'lab') return;
      await runLab(experiment);
      if (!memory.experiment && enabled()) {
        proposeFromMenu();
        memory.plan = withSchedule(memory.mode === 'llm' ? memory.plan : heuristicPlan(memory, memory.version), memory.profile);
        memory.profile = composeProfile();
      }
      await persist();
      scheduleLab();
    }).catch(error => log(`experiment step failed (gameplay unaffected): ${error instanceof Error ? error.message : String(error)}`));
  }

  /** Frozen copies of this agent's latest snapshots (plans stripped) for the league's opponent pool. */
  function leagueSnapshots(): readonly Snapshot[] {
    return deepFreeze(structuredClone((memory.snapshots ?? []).slice(-5)));
  }

  /** The two profiles of the next league trial: the current best and the running experiment (proposing one if needed). */
  async function leagueTrialArms(): Promise<{ ok: true; arms: LeagueArms } | { ok: false; reason: string }> {
    if (!enabled()) return { ok: false, reason: `${name} is switched off.` };
    await start();
    if (!online) return { ok: false, reason: bootError ? `${name} failed to boot: ${bootError}` : `${name} is not online yet.` };
    return serialize(async () => {
      if (!memory.experiment) {
        if (!proposeFromMenu() && !proposeFallbackExperiment()) log(`${name} skipped: menu empty and fallback failed`);
        memory.plan = withSchedule(memory.mode === 'llm' ? memory.plan : heuristicPlan(memory, memory.version), memory.profile);
        await persist();
      }
      const experiment = memory.experiment;
      if (!experiment) return { ok: false as const, reason: `${name} has no untested experiment left.` };
      const label = memory.snapshots?.at(-1)?.label ?? `${identity?.id ?? 'strat-g'}@${versionLabel(memory.version)}`;
      return { ok: true as const, arms: deepFreeze({ experimentId: experiment.id, label, control: { ...memory.profile, plan: '' }, experiment: { ...experimentProfile(experiment), plan: '' } }) };
    });
  }

  /** Scores a league trial: promising changes are adopted (and snapshotted), others are rejected or set aside. */
  async function concludeLeagueTrial(experimentId: string, outcome: LeagueOutcome): Promise<string> {
    return serialize(async () => {
      const experiment = memory.experiment;
      if (!experiment || experiment.id !== experimentId) return `Experiment ${experimentId} is no longer running; the result was discarded.`;
      const expected = outcome.seeds.length * 2;
      const expRate = outcome.pairs ? outcome.experimentPoints / outcome.pairs : 0.5, ctrlRate = outcome.pairs ? outcome.controlPoints / outcome.pairs : 0.5;
      const gain = round(expRate - ctrlRate, 3);
      const verdict = outcome.pairs < Math.max(1, expected * 0.8) ? 'inconclusive' : gain >= 0.08 && outcome.marginGain > 0 ? 'promising' : gain <= -0.08 || (gain < 0 && outcome.marginGain < 0) ? 'rejected' : 'inconclusive';
      experiment.lab = {
        seeds: [...outcome.seeds], games: outcome.games, invalid: outcome.invalid, experimentWins: outcome.experimentWins, controlWins: outcome.controlWins, ties: outcome.ties, meanMargin: round(outcome.marginGain, 1), verdict,
        league: { opponents: [...outcome.opponents], pairs: outcome.pairs, experimentPoints: outcome.experimentPoints, controlPoints: outcome.controlPoints, marginGain: round(outcome.marginGain, 1) },
      };
      const line = labLine(experiment.lab);
      if (verdict !== 'inconclusive') creditTheory(experiment, verdict === 'promising', line);
      if (verdict === 'promising') conclude(experiment, 'adopted', `${line}. Adopted into the current best.`);
      else conclude(experiment, verdict, `${line}. Kept the current best.`);
      if (verdict === 'promising') await saveSnapshot();
      proposeFromMenu();
      memory.plan = withSchedule(memory.mode === 'llm' ? memory.plan : heuristicPlan(memory, memory.version), memory.profile);
      memory.profile = composeProfile();
      await persist();
      log(`league trial for ${experimentId}: ${verdict}`);
      return line;
    });
  }

  async function gameFiles(): Promise<{ version?: number; startedAt?: string; finished?: boolean; report?: MatchReport }[]> {
    const folder = join(root, 'games');
    let files: string[] = [];
    try { files = (await readdir(folder)).filter(file => file.endsWith('.json')).sort(); } catch { return []; }
    return (await Promise.all(files.map(file => readJson<{ version?: number; startedAt?: string; finished?: boolean; report?: MatchReport }>(join(folder, file)).catch(() => null)))).filter(entry => !!entry) as { version?: number; startedAt?: string; finished?: boolean; report?: MatchReport }[];
  }

  async function recentReports(limit: number): Promise<{ summary: string; notes: string[] }[]> {
    const entries = (await gameFiles()).filter(entry => entry.finished && entry.report && !notCounted(entry.report)).slice(-limit);
    return entries.map(entry => ({ summary: summarizeReport(entry.report!, catalog), notes: ((entry as { notes?: string[] }).notes ?? []).slice(-8) }));
  }

  function tallyGame(report: MatchReport, version: number) {
    const result = report.winner;
    memory.record.games++;
    if (result === 1) memory.record.aiWins++; else if (result === 0) memory.record.humanWins++; else memory.record.ties++;
    const entry = memory.history.find(item => item.version === version);
    if (entry) { entry.games++; if (result === 1) entry.aiWins++; }
    for (const owner of [0, 1] as const) {
      const side = owner === 1 ? 'ai' : 'human';
      const bought = new Map<string, number>();
      for (const purchase of report.purchases.filter(item => item.owner === owner)) bought.set(purchase.definitionId, (bought.get(purchase.definitionId) ?? 0) + 1);
      for (const [id, count] of bought) {
        const stat = memory.cardStats[id] ??= { ai: { bought: 0, games: 0, wins: 0 }, human: { bought: 0, games: 0, wins: 0 } };
        stat[side].bought += count; stat[side].games++; if (result === owner) stat[side].wins++;
      }
    }
    for (const cycle of report.cycles) for (const location of cycle.locations) {
      const stat = memory.locationStats[location.id] ??= { seen: 0, aiWon: 0, humanWon: 0 };
      stat.seen++; if (location.winner === 1) stat.aiWon++; if (location.winner === 0) stat.humanWon++;
    }
  }

  function scoreFoundingTheories(report: MatchReport): string[] {
    const evidence: string[] = [];
    for (const theory of memory.theories.filter(item => item.test && item.status !== 'retired')) {
      const outcome = testTheory(theory.test!, report, catalog);
      if (outcome.support === null) continue;
      if (outcome.support) theory.support++; else theory.against++;
      scoreTheory(theory);
      theory.updatedBy = memory.version;
      evidence.push(`${theory.id} ${outcome.support ? 'supported' : 'contradicted'} (${outcome.reason})`);
    }
    return evidence;
  }

  /**
   * One-time repair for memory written before the protected baseline existed: archive it, return to the
   * baseline profile, and rebuild the record, statistics and theory evidence from complete games only.
   */
  async function adoptBaseline(saved: StrategistMemory) {
    const stamp = now().replace(/[:.]/g, '-');
    await mkdir(join(root, 'archive'), { recursive: true });
    await writeAtomic(join(root, 'archive', `memory-v${pad(saved.version ?? 0)}-before-baseline-${stamp}.json`), `${JSON.stringify(saved, null, 2)}\n`);
    await copyFile(join(root, 'NOTEBOOK.md'), join(root, 'archive', `NOTEBOOK-v${pad(saved.version ?? 0)}-before-baseline-${stamp}.md`)).catch(() => undefined);
    const fresh = seedMemory(identity);
    memory.baseline = fresh.baseline; memory.adopted = {}; memory.experiment = null; memory.experiments = []; memory.experimentCount = 0; memory.signals = [];
    memory.record = { games: 0, aiWins: 0, humanWins: 0, ties: 0 }; memory.cardStats = {}; memory.locationStats = {};
    for (const entry of memory.history) { entry.games = 0; entry.aiWins = 0; }
    const founding = new Map(FOUNDING_THEORIES.map(theory => [theory.id, theory]));
    const kept: Theory[] = [];
    for (const theory of memory.theories) {
      if (kept.some(item => item.id === theory.id || sameText(item.text, theory.text))) continue;
      const seed = founding.get(theory.id);
      kept.push(seed ? { ...seed, createdBy: 0, updatedBy: 0 } : { ...theory, status: theory.status === 'retired' ? 'retired' : 'proposed', confidence: 0.5, support: 0, against: 0 });
    }
    for (const seed of FOUNDING_THEORIES) if (!kept.some(item => item.id === seed.id)) kept.push({ ...seed, createdBy: 0, updatedBy: 0 });
    memory.theories = kept;
    let ignored = 0, firstIgnoredAt: string | null = null;
    for (const entry of await gameFiles()) {
      if (!entry.finished || !entry.report) continue;
      if (notCounted(entry.report)) { ignored++; firstIgnoredAt ??= entry.startedAt ?? null; continue; }
      tallyGame(entry.report, entry.version ?? 0);
      scoreFoundingTheories(entry.report);
    }
    memory.ignored = { count: ignored, lastReason: ignored ? 'rebuilt from game files' : null };
    // Notes written after the first non-game were drawn from it; the archive keeps them.
    const before = memory.notes.length;
    if (firstIgnoredAt) memory.notes = memory.notes.filter(item => item.version === 0 || item.at < firstIgnoredAt!);
    note(`Baseline restored. Earlier versions changed the profile directly after every session, including ${ignored} that were not complete games (lookdev shortcuts and inactivity concessions), which drove the Drain weight from ${DEFAULT_STRATEGY.weights.drain} to ${saved.profile?.weights?.drain ?? '?'}. Archived that memory, returned to the designer's baseline, rebuilt the record from ${memory.record.games} complete game${memory.record.games === 1 ? '' : 's'}, reset unearned theory confidence, and set aside ${before - memory.notes.length} notes drawn from non-games. From now on the profile changes only through experiments.`);
  }

  /** The designer's baseline lives in code; when it changes, memory takes the new one and keeps its adopted changes on top. */
  function refreshDesignedBaseline(tips: BaselineTips | null) {
    const designed = baselineOf(identity, tips);
    const fingerprint = (baseline: StrategistMemory['baseline']) => JSON.stringify({ profile: { ...sanitizeProfile(baseline.profile), version: 0, plan: '' }, plan: baseline.plan, playbook: baseline.playbook });
    if (fingerprint(memory.baseline) === fingerprint(designed)) return;
    memory.baseline = designed;
    // A tip was translated from the current best, adopted values included, so it replaces them on the fields it moves.
    const replaced = tips ? dropAdopted(tips.change) : [];
    note(`The designer updated my baseline and playbook. New baseline plan: ${designed.plan}${tips ? ` It now includes ${tips.lines.length} designer hand-off${tips.lines.length === 1 ? '' : 's'} (mentor tips or coaching)${replaced.length ? `, which replace my adopted ${replaced.join(', ')}` : ''}.` : ''} Adopted changes stay layered on top, clamped to my style.`);
  }

  function dropAdopted(change: ProfileChange): string[] {
    const dropped: string[] = [];
    for (const field of SCALAR_FIELDS) if (change[field] !== undefined && memory.adopted[field] !== undefined) { delete memory.adopted[field]; dropped.push(FIELD_LABEL[field]); }
    for (const key of Object.keys(change.weights ?? {}) as (keyof StrategyWeights)[]) if (memory.adopted.weights?.[key] !== undefined) { delete memory.adopted.weights[key]; dropped.push(`${key} weight`); }
    for (const id of Object.keys(change.cardBias ?? {})) if (memory.adopted.cardBias?.[id] !== undefined) { delete memory.adopted.cardBias[id]; dropped.push(`${cardName(id)} bias`); }
    return dropped;
  }

  /** A server start: read the notebook, look at what changed in the content, plan. A new version only if the profile in play changed. */
  async function boot(): Promise<void> {
    await mkdir(join(root, 'games'), { recursive: true });
    const saved = await readJson<StrategistMemory>(memoryFile);
    catalog = await loadCatalog(contentFile);
    const tips = await (options.mentorTips?.() ?? null)?.catch(error => { log(`mentor tips unreadable, playing without them (${error instanceof Error ? error.message : String(error)})`); return null; }) ?? null;
    if (saved?.schema === 1) {
      memory = { ...seedMemory(identity, tips), ...saved, profile: sanitizeProfile(saved.profile) };
      if (!saved.baseline) await adoptBaseline(saved);
      else refreshDesignedBaseline(tips);
    } else memory = seedMemory(identity, tips);
    const playing = (profile: StrategyProfile) => JSON.stringify({ ...profile, version: 0, plan: '' });
    const before = saved?.schema === 1 ? playing(sanitizeProfile(saved.profile)) : null;
    memory.profile = composeProfile();
    if (before !== null && playing(memory.profile) !== before) revise('the designer changed the baseline or style this profile is built on.');
    if (leagueMode && memory.experiment?.stage === 'field') {
      memory.experiment.stage = 'lab';
      memory.experiment.field = { experiment: emptyArm(), control: emptyArm() };
      note(`Experiment ${memory.experiment.id} was waiting for games against the human; experiments are now decided in league trials, so it goes back to the league.`);
    }

    const cardIds = [...catalog.cards.keys()], locationIds = [...catalog.locations.keys()];
    const firstBoot = !memory.knownCards.length;
    const newCards = firstBoot ? [] : cardIds.filter(id => !memory.knownCards.includes(id));
    const newLocations = firstBoot ? [] : locationIds.filter(id => !memory.knownLocations.includes(id));
    const removed = firstBoot ? [] : memory.knownCards.filter(id => !catalog.cards.has(id));
    for (const id of firstBoot ? cardIds : newCards) memory.cardNotes[id] ??= describeCard(catalog.cards.get(id)!, memory.profile);
    for (const id of newLocations) memory.cardNotes[id] ??= `New Location: "${catalog.locations.get(id)!.rule}" Read: ${locationRead(catalog.locations.get(id)!, memory.profile)}. Untested; watch who wins it and how it shifts the economy.`;
    memory.knownCards = cardIds; memory.knownLocations = locationIds;
    const serverVPChange = serverVPNote(memory.knownServerVP, defaultServerVP, firstBoot);
    if (serverVPChange) note(serverVPChange);
    memory.knownServerVP = { ...defaultServerVP };

    const unread = memory.theories.filter(theory => theory.status !== 'retired').length;
    note(`${versionLabel(memory.version)} online (server start). Read the notebook: ${unread} active theories, ${memory.experiments.length} concluded experiments, record ${memory.record.aiWins}-${memory.record.humanWins}-${memory.record.ties}.${newCards.length ? ` New cards since last version: ${newCards.map(id => catalog.cards.get(id)?.name ?? id).join(', ')}.` : ''}${newLocations.length ? ` New Locations: ${newLocations.map(id => catalog.locations.get(id)?.name ?? id).join(', ')}.` : ''}${removed.length ? ` Removed cards: ${removed.join(', ')}.` : ''}`);

    const running = memory.experiment;
    const advice = await askModel(
      `You are ${name} ${versionLabel(memory.version)}, starting up. Read the memory (baseline, adopted changes, experiment log, theories, notes), the recent complete games and what changed in the card pool. Write your plan, add or retire theories, and theorize about any new cards or Locations. ${running ? `Experiment ${running.id} is still running (${running.stage}); do not propose another.` : 'No experiment is running: propose the next one.'}`,
      { memory: memoryForModel(memory), recentGames: await recentReports(5), newCards, newLocations, removedCards: removed, catalog: compactCatalog(catalog, memory.profile) },
    );
    memory.mode = advice ? 'llm' : 'heuristic';
    if (advice) applyAdvice(advice);
    continueExperiments(advice);
    if (!advice) memory.plan = heuristicPlan(memory, memory.version);
    memory.plan = withSchedule(memory.plan, memory.profile);
    memory.profile = composeProfile();
    if (leagueMode) await saveSnapshot();
    await persist();
    log(`${versionLabel(memory.version)} online (${memory.mode}). Plan: ${memory.plan}`);
  }

  let booting: Promise<void> | null = null, bootError: string | null = null, online = false;
  /** Boots this version once; later calls share the same boot. */
  function start(): Promise<void> {
    booting ??= boot().then(() => { online = true; scheduleLab(true); }).catch(error => {
      bootError = error instanceof Error ? error.message : String(error);
      log(`boot failed: ${bootError}`);
    });
    return booting;
  }

  /** Re-reads memory and the designer's baseline (mentor tips included) as a fresh server start would. */
  async function reboot(): Promise<void> {
    await start();
    await idle();
    booting = null; bootError = null; online = false;
    return start();
  }

  /** Only the fields experiments use, with values the runtime can read; card biases must name a known card. */
  function cleanChange(value: unknown): ProfileChange {
    const source = (value && typeof value === 'object' ? value : {}) as ProfileChange;
    const change: ProfileChange = {};
    const finite = (item: unknown): item is number => typeof item === 'number' && Number.isFinite(item);
    for (const field of SCALAR_FIELDS) if (finite(source[field])) change[field] = source[field];
    for (const [key, item] of Object.entries(source.weights ?? {})) if (key in DEFAULT_STRATEGY.weights && finite(item)) (change.weights ??= {})[key as keyof StrategyWeights] = item;
    for (const [id, item] of Object.entries(source.cardBias ?? {})) if (catalog.cards.has(id) && finite(item)) (change.cardBias ??= {})[id] = item;
    return change;
  }

  /** The designer asks this agent for its best tips for an agent that needs to understand engines and economy. */
  async function shareTips(count = 3): Promise<{ label: string | null; mode: 'llm' | 'heuristic'; tips: Tip[] }> {
    await start();
    if (!online) throw new Error(bootError ? `${name} failed to boot: ${bootError}` : `${name} is not online.`);
    return serialize(async () => {
      const reply = await askModel<{ tips?: { text?: unknown; change?: unknown }[] }>(
        `The designer asks you, ${name} ${versionLabel(memory.version)}, to mentor another league agent whose style differs from yours. It needs to understand how engine and economy decks work so it can play more balanced while keeping its own style. From what your own games, adopted changes and theories have shown, give your top ${count} tips, ranked best first. Each tip names one idea and the values in your own profile that embody it.`,
        { memory: memoryForModel(memory) },
        TIPS_REPLY,
      );
      const fromModel = (reply?.tips ?? [])
        .filter(tip => tip && typeof tip.text === 'string' && tip.text.trim())
        .map(tip => ({ text: (tip.text as string).trim().slice(0, 200), change: cleanChange(tip.change) }))
        .filter(tip => !isEmptyChange(tip.change)).slice(0, count);
      const extra = fallbackTips(memory.profile, count + fromModel.length).filter(tip => !fromModel.some(item => sameText(item.text, tip.text)));
      const tips = [...fromModel, ...extra].slice(0, count).map((tip, index) => ({ rank: index + 1, text: tip.text, change: tip.change }));
      const mode: 'llm' | 'heuristic' = fromModel.length ? 'llm' : 'heuristic';
      memory.sharedTips = { at: now(), mode, tips };
      note(`The designer asked for my top ${count} tips on engines and economy for another agent. Shared: ${tips.map(tip => `${tip.rank}. ${tip.text}`).join(' ')}`);
      await persist();
      log(`shared ${tips.length} tips (${mode})`);
      return { label: memory.snapshots?.at(-1)?.label ?? null, mode, tips };
    });
  }

  function status(): StratGStatus {
    const on = enabled(), exp = memory.experiment;
    return {
      enabled: on, state: !booting ? 'off' : bootError ? 'failed' : online ? 'online' : 'booting',
      version: booting ? memory.version : 0, mode: online ? memory.mode : null, plan: online ? memory.plan : '',
      record: { ...memory.record }, modelConfigured: !!options.apiKey, model,
      activeTheories: memory.theories.filter(theory => theory.status !== 'retired').length, error: bootError,
      experiment: exp ? { id: exp.id, hypothesis: exp.hypothesis, change: exp.changeSummary, stage: exp.stage, lab: exp.lab ? labLine(exp.lab) : null, field: `${fieldLine(exp)} (needs ${FIELD_GAMES_PER_ARM} per arm)` } : null,
      adoptedChanges: memory.experiments.filter(item => item.stage === 'adopted').length,
      experimentsConcluded: memory.experiments.length, ignoredGames: memory.ignored.count,
      agent: { id: identity?.id ?? 'strat-g', name, style: identity?.style ?? null },
      snapshot: online ? memory.snapshots?.at(-1)?.label ?? null : null,
    };
  }

  /** A deep-frozen copy for read-only consumers; mutating it cannot reach Strat-G's memory. */
  function snapshot(): Readonly<StrategistMemory> { return deepFreeze(structuredClone(memory)); }

  function publish(gameId: string, report: MatchReport, entry: { notes: string[] } | null) {
    if (!options.onGameRecorded) return;
    try {
      const record: StratGGameRecord = {
        gameId, report: structuredClone(report),
        stratG: online && entry ? {
          version: memory.version, mode: memory.mode, plan: memory.plan, notes: [...entry.notes],
          theories: memory.theories.filter(theory => theory.status !== 'retired').map(({ id, text, status, confidence, support, against }) => ({ id, text, status, confidence, support, against })),
        } : null,
      };
      options.onGameRecorded(deepFreeze(record));
    } catch (error) {
      log(`game publish failed (ignored): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** The next game's profile: in the field stage, games alternate between the experiment and the current best. */
  function brief(): StrategistBrief {
    const exp = memory.experiment;
    const testing = !!exp && exp.stage === 'field' && exp.field.experiment.games <= exp.field.control.games;
    return {
      version: memory.version, mode: memory.mode, record: memory.record,
      plan: testing ? `${memory.plan} This game tests ${exp!.id}: ${exp!.hypothesis} (${exp!.changeSummary}).` : memory.plan,
      profile: testing ? experimentProfile(exp!) : memory.profile,
      experiment: testing ? { id: exp!.id, hypothesis: exp!.hypothesis } : null,
      theories: memory.theories.filter(theory => theory.status === 'supported' || theory.status === 'proposed').sort((a, b) => (b.support + b.against) - (a.support + a.against) || b.confidence - a.confidence).slice(0, 5).map(theory => theory.text),
    };
  }

  async function gameEntry(gameId: string) {
    let entry = games.get(gameId);
    if (!entry) {
      const startedAt = now();
      entry = { file: join(root, 'games', `${startedAt.replace(/[:.]/g, '-')}-${versionLabel(memory.version)}.json`), lastCycle: 0, notes: [], startedAt };
      games.set(gameId, entry);
    }
    return entry;
  }

  async function observe(gameId: string, report: MatchReport) {
    return serialize(async () => {
      await start();
      const entry = await gameEntry(gameId);
      const latest = report.cycles.at(-1)?.cycle ?? 0;
      if (latest <= entry.lastCycle) return;
      const notes = cycleNote(report, catalog, entry.lastCycle);
      entry.lastCycle = latest;
      entry.notes.push(...notes);
      await writeAtomic(entry.file, `${JSON.stringify({ gameId, version: memory.version, startedAt: entry.startedAt, finished: false, notes: entry.notes, report }, null, 2)}\n`);
    });
  }

  /** Signals from a lost game that point at an experiment worth running next (heuristic mode). */
  function signalsFrom(report: MatchReport): { ids: string[]; notes: string[] } {
    const ids: string[] = [], notes: string[] = [];
    if (report.winner !== 0) return { ids, notes };
    const max = FULL_INTEGRITY;
    if (report.servers[1] <= max * 0.4) { ids.push('restore'); notes.push('my Servers fell below 40%'); }
    if (report.servers[0] <= max * 0.4) { ids.push('chaos-earlier', 'drain'); notes.push('the human Servers were nearly destroyed'); }
    const humanVP = report.purchases.filter(item => item.owner === 0 && item.category === 'VP');
    if (report.finalVP[0] - report.finalVP[1] >= 6 && humanVP.length && humanVP.reduce((sum, item) => sum + item.cycle, 0) / humanVP.length < memory.profile.vpFromCycle) { ids.push('vp-earlier'); notes.push('the human won on VP bought before my VP window'); }
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const mid = report.cycles.filter(cycle => cycle.cycle >= 3 && cycle.cycle <= 8);
    if (mid.length >= 3 && mean(mid.map(cycle => cycle.wallet[1])) + 2 < mean(mid.map(cycle => cycle.wallet[0]))) { ids.push('crypto'); notes.push(`my mid-game Draft wallet averaged ${round(mean(mid.map(cycle => cycle.wallet[1])), 1)} vs the human's ${round(mean(mid.map(cycle => cycle.wallet[0])), 1)}`); }
    return { ids, notes };
  }

  /** Field results: which arm this game belonged to, and a verdict once both arms have enough games. */
  function recordFieldGame(report: MatchReport): string | null {
    const exp = memory.experiment;
    if (!exp || exp.stage !== 'field') return null;
    const tag = report.strategyExperiment ?? null;
    const arm = tag === exp.id ? exp.field.experiment : tag === null ? exp.field.control : null;
    if (!arm) return `This game used an older experiment (${tag}); it counts for the record but not for ${exp.id}.`;
    arm.games++; arm.margin = round(arm.margin + marginFor(report, 1));
    if (report.winner === 1) arm.wins++; else if (report.winner === 0) arm.losses++; else arm.ties++;
    const label = arm === exp.field.experiment ? `experiment arm of ${exp.id}` : `current-best arm of ${exp.id}`;
    if (exp.field.experiment.games < FIELD_GAMES_PER_ARM || exp.field.control.games < FIELD_GAMES_PER_ARM) return `This game was the ${label} (${fieldLine(exp)}).`;
    const score = (stats: ArmStats) => (stats.wins + stats.ties / 2) / stats.games, margin = (stats: ArmStats) => stats.margin / stats.games;
    const better = score(exp.field.experiment) > score(exp.field.control) || (score(exp.field.experiment) === score(exp.field.control) && margin(exp.field.experiment) >= margin(exp.field.control));
    const line = `${exp.lab ? `${labLine(exp.lab)}; ` : ''}${fieldLine(exp)}`;
    creditTheory(exp, better, fieldLine(exp));
    conclude(exp, better ? 'adopted' : 'rejected', `${line}. ${better ? 'Adopted into the current best.' : 'Kept the current best.'} (Small sample: the self-play lab carries most of the weight.)`);
    return `This game completed ${exp.id}.`;
  }

  /** Post-game debrief: complete games are scored and learned from; anything else is filed and ignored. */
  async function debrief(gameId: string, report: MatchReport) {
    return serialize(async () => {
      await start();
      const entry = await gameEntry(gameId);
      if (report.cycles.length) entry.notes.push(...cycleNote(report, catalog, entry.lastCycle));
      const skip = notCounted(report);
      if (skip) {
        memory.ignored = { count: memory.ignored.count + 1, lastReason: skip };
        note(`Ignored a session that is not a complete game (${skip}). Nothing was learned from it.`);
        await writeAtomic(entry.file, `${JSON.stringify({ gameId, version: memory.version, startedAt: entry.startedAt, finished: true, ignored: skip, notes: entry.notes, report }, null, 2)}\n`);
        games.delete(gameId);
        await persist();
        log(`ignored a session that is not a complete game (${skip})`);
        publish(gameId, report, entry);
        return brief();
      }

      tallyGame(report, memory.version);
      const evidence = scoreFoundingTheories(report);
      const field = recordFieldGame(report);
      const signals = signalsFrom(report);
      memory.signals = signals.ids;

      note(`Debrief: ${summarizeReport(report, catalog)}`);
      if (evidence.length) note(`Theory evidence: ${evidence.join('; ')}.`);
      if (field) note(field);
      if (signals.notes.length) note(`Signals worth an experiment: ${signals.notes.join('; ')}.`);

      const running = memory.experiment;
      const advice = await askModel(
        `A complete game finished. You are ${name} ${versionLabel(memory.version)}. Debrief it: write notes about what mattered (cards, Locations, Cycles, numbers) and add or retire theories. ${running ? `Experiment ${running.id} is running (${running.stage}); do not propose another.` : 'No experiment is running: propose the next one.'}`,
        { memory: memoryForModel(memory), game: { summary: summarizeReport(report, catalog), inGameNotes: entry.notes, report: reportForModel(report), experimentArm: report.strategyExperiment ?? null }, catalog: compactCatalog(catalog, memory.profile) },
      );
      if (advice) applyAdvice(advice);
      continueExperiments(advice);
      if (!advice) memory.plan = heuristicPlan(memory, memory.version);
      memory.plan = withSchedule(memory.plan, memory.profile);
      memory.profile = composeProfile();
      await writeAtomic(entry.file, `${JSON.stringify({ gameId, version: memory.version, startedAt: entry.startedAt, finished: true, notes: entry.notes, report }, null, 2)}\n`);
      games.delete(gameId);
      await persist();
      log(`debrief saved (${memory.record.aiWins}-${memory.record.humanWins}-${memory.record.ties}).${memory.experiment ? ` Experiment ${memory.experiment.id}: ${memory.experiment.stage}.` : ''}`);
      publish(gameId, report, entry);
      scheduleLab(true);
      return brief();
    });
  }

  function reply(response: ServerResponse, status: number, value: unknown) {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(value));
  }

  async function body(request: IncomingMessage): Promise<{ gameId?: unknown; report?: unknown }> {
    let size = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024 * 1024) throw Object.assign(new Error('Report exceeds the size limit.'), { status: 413 });
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  const validReport = (value: unknown): value is MatchReport => {
    const report = value as MatchReport;
    return !!report && Array.isArray(report.purchases) && Array.isArray(report.cycles) && Array.isArray(report.finalVP) && Array.isArray(report.servers) && Array.isArray(report.decks);
  };

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    const path = (request.url ?? '').split('?')[0];
    if (!path.startsWith('/api/ai/')) return next();
    if ((new URLSearchParams((request.url ?? '').split('?')[1] ?? '').get('agent') || 'strat-g') !== agentId) return next();
    if (!isLocalRequest(request)) { reply(response, 403, { error: `${name} is available only from this local app.` }); return; }
    try {
      if (path === '/api/ai/strategy' && request.method === 'GET') {
        if (!enabled()) { reply(response, 200, disabledBrief()); return; }
        await start(); reply(response, 200, { ...brief(), recordDecisions: options.recordDecisions?.() ?? true }); return;
      }
      if ((path === '/api/ai/observe' || path === '/api/ai/game') && request.method === 'POST') {
        const payload = await body(request);
        if (typeof payload.gameId !== 'string' || !/^[\w-]{1,64}$/.test(payload.gameId) || !validReport(payload.report)) { reply(response, 400, { error: 'Expected { gameId, report }.' }); return; }
        if (!enabled()) {
          // The agent is off: nothing is learned, but the finished game is still published for observers.
          if (path === '/api/ai/game') publish(payload.gameId, payload.report, null);
          reply(response, 200, { ok: true, ignored: true }); return;
        }
        if (path === '/api/ai/observe') { await observe(payload.gameId, payload.report); reply(response, 200, { ok: true }); return; }
        reply(response, 200, await debrief(payload.gameId, payload.report));
        return;
      }
      reply(response, 404, { error: `Unknown ${name} route.` });
    } catch (error) {
      reply(response, (error as { status?: number }).status ?? 500, { error: error instanceof Error ? error.message : `${name} error.` });
    }
  };

  function disabledBrief(): StrategistBrief & { disabled: true; recordDecisions: boolean } {
    return { disabled: true, version: 0, mode: 'heuristic', plan: DEFAULT_STRATEGY.plan, profile: { ...DEFAULT_STRATEGY }, theories: [], record: { ...memory.record }, experiment: null, recordDecisions: options.recordDecisions?.() ?? true };
  }

  /** Resolves once queued debriefs and experiment steps have finished (tests and shutdown). */
  const idle = async () => { for (let last: unknown = null; last !== writes;) { last = writes; await writes; } };

  return { get ready() { return start(); }, start, reboot, shareTips, status, snapshot, middleware, brief, observe, debrief, idle, leagueSnapshots, leagueTrialArms, concludeLeagueTrial, memory: () => memory };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
