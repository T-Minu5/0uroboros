import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { diffSelfPlayRules, sanitizeSelfPlayRules, selfPlayRulesHash, type RuleChange, type SelfPlayRules } from '@0uroboros/engine/ai/selfPlay';
import type { MatchReport } from '@0uroboros/engine/runtime';
import { BLOWOUT_MARGIN, diagnoseCycle16Stall, gameMetrics, isGameEnder, TARGET_BOTH_DESTROYED_RATE, TARGET_CYCLE16_MAX_RATE, TARGET_DESTRUCTION_END_RATE_MAX, TARGET_DESTRUCTION_END_RATE_MIN, type StallDiagnosis } from './ecoMetrics';

/**
 * League epochs: one ruleset, played until the designer changes it. Starting an epoch saves the new
 * rules (usually with an Elo wipe) and records what changed; every valid league game under it adds
 * to a running tally, so Eco-Strat can compare the target metrics before and after each change.
 */

export type EpochTally = {
  games: number; decisive: number; seat0Wins: number;
  destructionEnds: number; cycle16Ends: number; cycles: number; margin: number; blowouts: number; bothDestroyed: number;
  /** Decisive games where a seat led on VP at Cycle 8, and how many of those the Cycle 8 leader won. */
  leaderAt8: number; leaderAt8Won: number;
  /** Winners that came back from 5+ VP down. */
  comebacks: number;
  circuitClaims: number;
  /** Cycle-16 stall signals (sums across games; see stallFromTally). Older tallies may omit these. */
  cycle16MarketVp?: number; cycle16Restore?: number; cycle16Drain?: number;
  destructionMarketVp?: number; destructionRestore?: number; destructionDrain?: number;
  /** Games in which at least one game-ender was bought / offered. */
  cycle16EnderBuys?: number; cycle16EnderOffers?: number;
  destructionEnderBuys?: number; destructionEnderOffers?: number;
};
export type EpochStanding = { agent: string; elo: number | null; games: number; wins: number; losses: number; ties: number };
export type Epoch = {
  id: number; startedAt: string; rules: SelfPlayRules; rulesHash: string;
  /** Changes from the previous epoch's rules; empty for the first epoch or a plain Elo wipe. */
  changes: RuleChange[];
  eloWiped: boolean; note?: string;
  runs: number; tally: EpochTally;
  /** Elo table when the last run under this epoch finished. */
  standings: EpochStanding[] | null;
  /** Eco-Strat's rules-delta report on this epoch, once written. */
  reportId?: string | null;
};
type Store = { schema: 1; epochs: Epoch[] };

export type MetricTarget = { kind: 'band'; min: number; max: number } | { kind: 'min'; min: number } | { kind: 'max'; max: number } | { kind: 'lower' } | { kind: 'higher' } | { kind: 'info' };
export type EpochMetric = { id: string; label: string; unit: 'rate' | 'number'; target: MetricTarget; targetLabel: string };
export type MetricRow = EpochMetric & { before: number | null; after: number | null; verdict: 'closer' | 'further' | 'same' | 'n/a' };

const ratio = (hits: number, total: number) => total ? hits / total : null;
/** The metrics the designer balances toward, with the targets Eco-Strat uses in its reports. */
export const EPOCH_METRICS: (EpochMetric & { value: (tally: EpochTally) => number | null })[] = [
  { id: 'destructionEnds', label: 'Games ended by Server destruction', unit: 'rate', target: { kind: 'band', min: TARGET_DESTRUCTION_END_RATE_MIN, max: TARGET_DESTRUCTION_END_RATE_MAX }, targetLabel: `${Math.round(TARGET_DESTRUCTION_END_RATE_MIN * 100)}–${Math.round(TARGET_DESTRUCTION_END_RATE_MAX * 100)}%`, value: t => ratio(t.destructionEnds, t.games) },
  { id: 'cycle16Ends', label: 'Games that went all 16 Cycles', unit: 'rate', target: { kind: 'max', max: TARGET_CYCLE16_MAX_RATE }, targetLabel: `at most ${Math.round(TARGET_CYCLE16_MAX_RATE * 100)}%`, value: t => ratio(t.cycle16Ends, t.games) },
  { id: 'bothDestroyed', label: 'Both players destroyed a Server', unit: 'rate', target: { kind: 'min', min: TARGET_BOTH_DESTROYED_RATE }, targetLabel: `over ${Math.round(TARGET_BOTH_DESTROYED_RATE * 100)}%`, value: t => ratio(t.bothDestroyed, t.games) },
  { id: 'leaderAt8Wins', label: 'Cycle 8 VP leader went on to win', unit: 'rate', target: { kind: 'lower' }, targetLabel: 'lower means less snowball', value: t => ratio(t.leaderAt8Won, t.leaderAt8) },
  { id: 'comebacks', label: 'Winner came back from 5+ VP down', unit: 'rate', target: { kind: 'higher' }, targetLabel: 'higher means more comebacks', value: t => ratio(t.comebacks, t.decisive) },
  { id: 'blowouts', label: `Blowouts (margin over ${BLOWOUT_MARGIN} VP)`, unit: 'rate', target: { kind: 'lower' }, targetLabel: 'lower', value: t => ratio(t.blowouts, t.games) },
  { id: 'seat0Wins', label: 'First seat win rate', unit: 'rate', target: { kind: 'band', min: 0.45, max: 0.55 }, targetLabel: '45–55%', value: t => ratio(t.seat0Wins, t.decisive) },
  { id: 'cycles', label: 'Average game length (Cycles)', unit: 'number', target: { kind: 'band', min: 11, max: 14 }, targetLabel: 'Cycles 11–14', value: t => t.games ? t.cycles / t.games : null },
  { id: 'margin', label: 'Average VP margin', unit: 'number', target: { kind: 'info' }, targetLabel: 'for reference', value: t => t.games ? t.margin / t.games : null },
  { id: 'circuitClaims', label: 'Circuit rewards claimed per game', unit: 'number', target: { kind: 'info' }, targetLabel: 'for reference', value: t => t.games ? t.circuitClaims / t.games : null },
];

/** How far a value sits from its target; 0 means on target. Null for reference-only metrics. */
export function targetDistance(target: MetricTarget, value: number): number | null {
  switch (target.kind) {
    case 'band': return value < target.min ? target.min - value : value > target.max ? value - target.max : 0;
    case 'min': return Math.max(0, target.min - value);
    case 'max': return Math.max(0, value - target.max);
    case 'lower': return value;
    case 'higher': return -value;
    default: return null;
  }
}

export const emptyTally = (): EpochTally => ({
  games: 0, decisive: 0, seat0Wins: 0, destructionEnds: 0, cycle16Ends: 0, cycles: 0, margin: 0, blowouts: 0, bothDestroyed: 0,
  leaderAt8: 0, leaderAt8Won: 0, comebacks: 0, circuitClaims: 0,
  cycle16MarketVp: 0, cycle16Restore: 0, cycle16Drain: 0,
  destructionMarketVp: 0, destructionRestore: 0, destructionDrain: 0,
  cycle16EnderBuys: 0, cycle16EnderOffers: 0, destructionEnderBuys: 0, destructionEnderOffers: 0,
});

function enderPresence(report: MatchReport) {
  let offered = false;
  for (const cycle of report.cycles) for (const pile of cycle.market ?? []) {
    if (isGameEnder(pile.id, pile.name)) { offered = true; break; }
  }
  const bought = report.purchases.some(item => isGameEnder(item.definitionId, item.name));
  return { offered, bought };
}

export function addToTally(tally: EpochTally, report: MatchReport) {
  const m = gameMetrics(report);
  tally.games++;
  tally.cycles += m.cycles; tally.margin += m.vpMargin; tally.circuitClaims += m.circuitClaims[0] + m.circuitClaims[1];
  if (m.endedBy === 'destruction') tally.destructionEnds++;
  if (m.endedBy === 'cycle16') tally.cycle16Ends++;
  if (m.vpMargin > BLOWOUT_MARGIN) tally.blowouts++;
  if (m.destructionVP[0] > 0 && m.destructionVP[1] > 0) tally.bothDestroyed++;
  const marketVp = m.marketVp[0] + m.marketVp[1];
  const restore = m.restore[0] + m.restore[1];
  const drain = m.drain[0] + m.drain[1];
  const enders = enderPresence(report);
  if (m.endedBy === 'cycle16') {
    tally.cycle16MarketVp = (tally.cycle16MarketVp ?? 0) + marketVp;
    tally.cycle16Restore = (tally.cycle16Restore ?? 0) + restore;
    tally.cycle16Drain = (tally.cycle16Drain ?? 0) + drain;
    if (enders.bought) tally.cycle16EnderBuys = (tally.cycle16EnderBuys ?? 0) + 1;
    if (enders.offered) tally.cycle16EnderOffers = (tally.cycle16EnderOffers ?? 0) + 1;
  } else if (m.endedBy === 'destruction') {
    tally.destructionMarketVp = (tally.destructionMarketVp ?? 0) + marketVp;
    tally.destructionRestore = (tally.destructionRestore ?? 0) + restore;
    tally.destructionDrain = (tally.destructionDrain ?? 0) + drain;
    if (enders.bought) tally.destructionEnderBuys = (tally.destructionEnderBuys ?? 0) + 1;
    if (enders.offered) tally.destructionEnderOffers = (tally.destructionEnderOffers ?? 0) + 1;
  }
  if (m.winner === null) return;
  tally.decisive++;
  if (m.winner === 0) tally.seat0Wins++;
  if (m.winnerMaxDeficit >= 5) tally.comebacks++;
  const leader = m.vpLeaderAt['8'];
  if (leader !== null) { tally.leaderAt8++; if (leader === m.winner) tally.leaderAt8Won++; }
}

/** Compact Cycle-16 stall summary from an epoch tally (for Eco epoch reports). */
export function stallFromTally(tally: EpochTally): {
  cycle16: { games: number; avgMarketVpPerSeat: number; restoreToDrain: number; anyBoughtShare: number | null; anyOfferedShare: number | null };
  destruction: { games: number; avgMarketVpPerSeat: number; restoreToDrain: number; anyBoughtShare: number | null; anyOfferedShare: number | null };
  diagnosis: StallDiagnosis; note: string;
} {
  const bucket = (
    games: number,
    marketVp: number, restore: number, drain: number,
    buys: number, offers: number,
  ) => ({
    games,
    avgMarketVpPerSeat: games ? Number(((marketVp / games) / 2).toFixed(2)) : 0,
    avgRestorePerSeat: games ? Number(((restore / games) / 2).toFixed(2)) : 0,
    avgDrainPerSeat: games ? Number(((drain / games) / 2).toFixed(2)) : 0,
    restoreToDrain: drain ? Number((restore / drain).toFixed(2)) : 0,
    avgHealOffset: 0,
    gameEnders: {
      anyOfferedShare: games ? Number((offers / games).toFixed(2)) : null,
      anyAffordableShare: null as number | null,
      anyBoughtShare: games ? Number((buys / games).toFixed(2)) : null,
      avgBuysPerGame: 0,
      cards: [],
    },
  });
  const cycle16 = bucket(
    tally.cycle16Ends,
    tally.cycle16MarketVp ?? 0, tally.cycle16Restore ?? 0, tally.cycle16Drain ?? 0,
    tally.cycle16EnderBuys ?? 0, tally.cycle16EnderOffers ?? 0,
  );
  const destruction = bucket(
    tally.destructionEnds,
    tally.destructionMarketVp ?? 0, tally.destructionRestore ?? 0, tally.destructionDrain ?? 0,
    tally.destructionEnderBuys ?? 0, tally.destructionEnderOffers ?? 0,
  );
  const { diagnosis, note } = diagnoseCycle16Stall(cycle16, destruction);
  return {
    cycle16: {
      games: cycle16.games,
      avgMarketVpPerSeat: cycle16.avgMarketVpPerSeat,
      restoreToDrain: cycle16.restoreToDrain,
      anyBoughtShare: cycle16.gameEnders.anyBoughtShare,
      anyOfferedShare: cycle16.gameEnders.anyOfferedShare,
    },
    destruction: {
      games: destruction.games,
      avgMarketVpPerSeat: destruction.avgMarketVpPerSeat,
      restoreToDrain: destruction.restoreToDrain,
      anyBoughtShare: destruction.gameEnders.anyBoughtShare,
      anyOfferedShare: destruction.gameEnders.anyOfferedShare,
    },
    diagnosis, note,
  };
}

/** Below this many valid games an epoch is too small to call a change closer or further. */
export const MIN_COMPARABLE_GAMES = 8;
export function compareTallies(before: EpochTally | null, after: EpochTally): MetricRow[] {
  const comparable = !!before && before.games >= MIN_COMPARABLE_GAMES && after.games >= MIN_COMPARABLE_GAMES;
  return EPOCH_METRICS.map(({ value, ...metric }) => {
    const [b, a] = [before ? value(before) : null, value(after)];
    let verdict: MetricRow['verdict'] = 'n/a';
    if (comparable && a !== null && b !== null) {
      const [db, da] = [targetDistance(metric.target, b), targetDistance(metric.target, a)];
      if (db !== null && da !== null) verdict = Math.abs(da - db) < (metric.unit === 'rate' ? 0.02 : 0.2) ? 'same' : da < db ? 'closer' : 'further';
    }
    return { ...metric, before: b, after: a, verdict };
  });
}

export function createEpochStore(file: string, initialRules: () => SelfPlayRules, now: () => string = () => new Date().toISOString()) {
  let store: Store | null = null;
  let dirty = 0;

  async function load(): Promise<Store> {
    if (store) return store;
    try {
      const saved = JSON.parse(await readFile(file, 'utf8')) as Store;
      if (saved?.schema === 1 && Array.isArray(saved.epochs) && saved.epochs.length) store = saved;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!store) {
      const rules = sanitizeSelfPlayRules(initialRules());
      store = { schema: 1, epochs: [{ id: 1, startedAt: now(), rules, rulesHash: selfPlayRulesHash(rules), changes: [], eloWiped: false, runs: 0, tally: emptyTally(), standings: null }] };
      await save();
    }
    return store;
  }
  async function save() {
    if (!store) return;
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temp, file);
    dirty = 0;
  }
  const currentOf = (value: Store) => value.epochs.at(-1)!;

  return {
    file,
    load,
    async current() { return currentOf(await load()); },
    async list() { return [...(await load()).epochs]; },
    /** Starts a new epoch under `rules`; the caller wipes Elo. */
    async begin(rules: SelfPlayRules, options: { eloWiped: boolean; note?: string }): Promise<Epoch> {
      const value = await load();
      const previous = currentOf(value);
      const clean = sanitizeSelfPlayRules(rules);
      const epoch: Epoch = {
        id: previous.id + 1, startedAt: now(), rules: clean, rulesHash: selfPlayRulesHash(clean), changes: diffSelfPlayRules(previous.rules, clean),
        eloWiped: options.eloWiped, ...(options.note ? { note: options.note.slice(0, 280) } : {}), runs: 0, tally: emptyTally(), standings: null,
      };
      value.epochs.push(epoch);
      await save();
      return epoch;
    },
    /** Counts one valid game under the current epoch; flushed to disk every few games and at run end. */
    async recordGame(report: MatchReport) {
      const value = await load();
      addToTally(currentOf(value).tally, report);
      if (++dirty >= 20) await save();
    },
    async finishRun(standings: EpochStanding[]) {
      const value = await load();
      const epoch = currentOf(value);
      epoch.runs++;
      epoch.standings = standings;
      await save();
      return epoch;
    },
    async setReport(epochId: number, reportId: string) {
      const value = await load();
      const epoch = value.epochs.find(item => item.id === epochId);
      if (!epoch) return;
      epoch.reportId = reportId;
      await save();
    },
    /** The latest earlier epoch that has games: the "before" side of a comparison. */
    async previousWithGames(epochId: number): Promise<Epoch | null> {
      const value = await load();
      return [...value.epochs].reverse().find(item => item.id < epochId && item.tally.games > 0) ?? null;
    },
  };
}
export type EpochStore = ReturnType<typeof createEpochStore>;
