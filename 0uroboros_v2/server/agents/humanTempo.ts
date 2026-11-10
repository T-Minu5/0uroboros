import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StrategyProfile, StrategyWeights } from '@0uroboros/engine/ai/strategy';
import type { MatchReport } from '@0uroboros/engine/runtime';
import type { ProfileChange } from '../aiStrategist';
import type { GameEvidence } from './evidence';
import { diffProfiles, emptyChange, type BaselineTips } from './mentoring';
import { clampToEnvelope, STRAT_G, type StyleEnvelope } from './roster';

/**
 * Human tempo: Strat-G watches complete local games where the human (seat 0) plays VP-Dog, reads Draft
 * buys in Cycle bands 1–4 / 5–8 / 9–12 / 13–16, formulates that into a ProfileChange, and soft-applies it
 * like coaching (share toward the inferred target). Not an experiment — tips fold into mentorTips.
 */

export const HUMAN_TEMPO_SHARE = 0.35;
export const HUMAN_TEMPO_MIN_GAMES = 3;
export const HUMAN_TEMPO_ROLLING = 20;
const CARD_BIAS_CAP = 2;
const WEIGHT_KEYS = ['crypto', 'draw', 'thin', 'drain', 'chaos', 'vp', 'power', 'restore', 'disrupt'] as const satisfies readonly (keyof StrategyWeights)[];
const SCALARS = ['economyUntilCycle', 'chaosFromCycle', 'vpFromCycle', 'handCryptoTarget', 'minBuyScore', 'dilution'] as const;
const CATEGORIES = ['Crypto', 'Base', 'Chaos', 'VP'] as const;

export type TempoBand = 'early' | 'mid' | 'lateMid' | 'end';
export type CategoryName = (typeof CATEGORIES)[number];
export type CategoryTally = Record<CategoryName, number>;
export type BandTally = { purchases: number; spend: number; categories: CategoryTally; cards: Record<string, number> };
export type HumanTempoSummary = {
  games: number;
  bands: Record<TempoBand, BandTally>;
  topCards: { id: string; count: number }[];
};
export type WatchedGame = { id: string; recordedAt: string; bands: Record<TempoBand, BandTally> };
export type HumanTempoStore = {
  schema: 1;
  appliedAt: string;
  share: number;
  games: WatchedGame[];
  summary: HumanTempoSummary;
  /** Strat-G's current best before this soft coaching, so re-apply never compounds. */
  start: StrategyProfile | null;
  change: ProfileChange;
  lines: string[];
  planBlurb: string;
};

/** Phase Cycles may move here (unlike competitor coaching); still clamped when applied via Strat-G's envelope. */
export const HUMAN_TEMPO_ENVELOPE: StyleEnvelope = {
  ...STRAT_G.envelope,
  economyUntilCycle: [3, 7],
  chaosFromCycle: [6, 13],
  vpFromCycle: [6, 14],
  handCryptoTarget: [7, 14],
  minBuyScore: [0, 4],
  dilution: [0, 1.5],
  weights: {
    ...STRAT_G.envelope.weights,
    crypto: [0.6, 3],
    draw: [0.8, 3.5],
    thin: [0.5, 3.5],
    drain: [1, 3.5],
    chaos: [0.5, 3.5],
    vp: [1.2, 3.5],
  },
};

const emptyCategories = (): CategoryTally => ({ Crypto: 0, Base: 0, Chaos: 0, VP: 0 });
const emptyBand = (): BandTally => ({ purchases: 0, spend: 0, categories: emptyCategories(), cards: {} });
const emptyBands = (): Record<TempoBand, BandTally> => ({ early: emptyBand(), mid: emptyBand(), lateMid: emptyBand(), end: emptyBand() });

const round = (value: number) => Math.round(value * 100) / 100;
const toward = (from: number, to: number, share: number) => round(from + share * (to - from));

export function bandOf(cycle: number): TempoBand | null {
  if (cycle >= 1 && cycle <= 4) return 'early';
  if (cycle >= 5 && cycle <= 8) return 'mid';
  if (cycle >= 9 && cycle <= 12) return 'lateMid';
  if (cycle >= 13 && cycle <= 16) return 'end';
  return null;
}

const BAND_LABEL: Record<TempoBand, string> = {
  early: 'Cycles 1–4', mid: 'Cycles 5–8', lateMid: 'Cycles 9–12', end: 'Cycles 13–16',
};

/** Complete human-vs-VP-Dog games only (same gate as human evidence on the bus). */
export function isWatchedHumanVsVpDog(evidence: Pick<GameEvidence, 'source' | 'agent' | 'valid'>): boolean {
  return evidence.source === 'human-vs-agent' && evidence.agent === 'vp-dog' && evidence.valid;
}

function isCategory(value: string): value is CategoryName {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** Seat 0 (human) Draft buys tallied into the four Cycle bands. */
export function tallyHumanPurchases(report: Pick<MatchReport, 'purchases'>): Record<TempoBand, BandTally> {
  const bands = emptyBands();
  for (const buy of report.purchases) {
    if (buy.owner !== 0) continue;
    const band = bandOf(buy.cycle);
    if (!band) continue;
    const slot = bands[band];
    slot.purchases += 1;
    slot.spend += buy.cost;
    if (isCategory(buy.category)) slot.categories[buy.category] += 1;
    slot.cards[buy.definitionId] = (slot.cards[buy.definitionId] ?? 0) + 1;
  }
  return bands;
}

function mergeBand(into: BandTally, from: BandTally) {
  into.purchases += from.purchases;
  into.spend += from.spend;
  for (const category of CATEGORIES) into.categories[category] += from.categories[category];
  for (const [id, count] of Object.entries(from.cards)) into.cards[id] = (into.cards[id] ?? 0) + count;
}

export function aggregateTempo(games: readonly WatchedGame[]): HumanTempoSummary {
  const bands = emptyBands();
  const cards: Record<string, number> = {};
  for (const game of games) {
    for (const band of Object.keys(bands) as TempoBand[]) mergeBand(bands[band], game.bands[band] ?? emptyBand());
    for (const band of Object.values(game.bands)) {
      for (const [id, count] of Object.entries(band.cards)) cards[id] = (cards[id] ?? 0) + count;
    }
  }
  const topCards = Object.entries(cards).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).slice(0, 8);
  return { games: games.length, bands, topCards };
}

function shareOf(tally: BandTally, category: CategoryName): number {
  return tally.purchases > 0 ? tally.categories[category] / tally.purchases : 0;
}

function dominantCategory(tally: BandTally): CategoryName | null {
  if (!tally.purchases) return null;
  let best: CategoryName = 'Crypto', count = -1;
  for (const category of CATEGORIES) {
    if (tally.categories[category] > count) { best = category; count = tally.categories[category]; }
  }
  return count > 0 ? best : null;
}

/** First Cycle of each band — phase knobs pivot when a category starts dominating that window. */
const BAND_START: Record<TempoBand, number> = { early: 2, mid: 5, lateMid: 9, end: 13 };
const BAND_ORDER: TempoBand[] = ['early', 'mid', 'lateMid', 'end'];

function inferSchedule(summary: HumanTempoSummary): { economyUntilCycle: number; chaosFromCycle: number; vpFromCycle: number } {
  let economyUntilCycle = 4;
  for (const band of BAND_ORDER) {
    if (shareOf(summary.bands[band], 'Crypto') >= 0.35 || dominantCategory(summary.bands[band]) === 'Crypto') {
      economyUntilCycle = Math.max(economyUntilCycle, { early: 4, mid: 6, lateMid: 8, end: 8 }[band]);
    } else if (band !== 'early') break;
  }
  let chaosFromCycle = 9;
  for (const band of BAND_ORDER) {
    if (shareOf(summary.bands[band], 'Chaos') >= 0.2 || dominantCategory(summary.bands[band]) === 'Chaos') {
      chaosFromCycle = BAND_START[band];
      break;
    }
  }
  let vpFromCycle = 9;
  for (const band of BAND_ORDER) {
    if (shareOf(summary.bands[band], 'VP') >= 0.2 || dominantCategory(summary.bands[band]) === 'VP') {
      vpFromCycle = BAND_START[band];
      break;
    }
  }
  if (chaosFromCycle <= economyUntilCycle) chaosFromCycle = economyUntilCycle + 1;
  if (vpFromCycle <= economyUntilCycle) vpFromCycle = economyUntilCycle + 1;
  return { economyUntilCycle, chaosFromCycle, vpFromCycle };
}

function weightTargets(start: StrategyProfile, summary: HumanTempoSummary): Partial<StrategyWeights> {
  const early = summary.bands.early, mid = summary.bands.mid, late = summary.bands.lateMid, end = summary.bands.end;
  const cryptoShare = (shareOf(early, 'Crypto') + shareOf(mid, 'Crypto') * 0.5) / 1.5;
  const chaosShare = (shareOf(late, 'Chaos') + shareOf(end, 'Chaos')) / 2;
  const vpShare = (shareOf(late, 'VP') + shareOf(end, 'VP') * 1.2) / 2.2;
  const baseShare = (shareOf(early, 'Base') + shareOf(mid, 'Base')) / 2;
  const target: Partial<StrategyWeights> = {};
  target.crypto = round(start.weights.crypto + (cryptoShare - 0.25) * 1.6);
  target.draw = round(start.weights.draw + (baseShare - 0.2) * 1.2 + cryptoShare * 0.4);
  target.thin = round(start.weights.thin + (cryptoShare > 0.3 ? 0.3 : 0) + (baseShare > 0.25 ? 0.2 : 0));
  target.chaos = round(start.weights.chaos + (chaosShare - 0.15) * 2);
  target.drain = round(start.weights.drain + (chaosShare - 0.15) * 1.4);
  target.vp = round(start.weights.vp + (vpShare - 0.2) * 2);
  return target;
}

function describeBands(summary: HumanTempoSummary): string[] {
  return BAND_ORDER.map(band => {
    const tally = summary.bands[band];
    if (!tally.purchases) return `${BAND_LABEL[band]}: no buys yet`;
    const mix = CATEGORIES.filter(category => tally.categories[category] > 0)
      .map(category => `${category} ${Math.round(100 * shareOf(tally, category))}%`)
      .join(', ');
    return `${BAND_LABEL[band]}: ${tally.purchases} buys (${mix}; spend ${tally.spend})`;
  });
}

/**
 * Moves `start` `share` of the way toward a human-tempo target inferred from band category mixes,
 * then clamps into `envelope` (use {@link HUMAN_TEMPO_ENVELOPE} so phase knobs can move for soft coaching).
 */
export function formulateTempoChange(
  start: StrategyProfile,
  summary: HumanTempoSummary,
  envelope: StyleEnvelope = HUMAN_TEMPO_ENVELOPE,
  share = HUMAN_TEMPO_SHARE,
): { change: ProfileChange; lines: string[]; planBlurb: string; target: StrategyProfile } {
  const base = clampToEnvelope(start, envelope);
  const schedule = inferSchedule(summary);
  const weights = weightTargets(base, summary);
  const target: StrategyProfile = {
    ...base,
    economyUntilCycle: schedule.economyUntilCycle,
    chaosFromCycle: schedule.chaosFromCycle,
    vpFromCycle: schedule.vpFromCycle,
    handCryptoTarget: round(base.handCryptoTarget + (shareOf(summary.bands.early, 'Crypto') - 0.25) * 3),
    weights: { ...base.weights },
    cardBias: { ...base.cardBias },
  };
  for (const key of WEIGHT_KEYS) {
    const goal = weights[key];
    if (typeof goal === 'number') target.weights[key] = toward(base.weights[key], goal, share);
  }
  target.economyUntilCycle = Math.round(toward(base.economyUntilCycle, schedule.economyUntilCycle, share));
  target.chaosFromCycle = Math.round(toward(base.chaosFromCycle, schedule.chaosFromCycle, share));
  target.vpFromCycle = Math.round(toward(base.vpFromCycle, schedule.vpFromCycle, share));
  target.handCryptoTarget = toward(base.handCryptoTarget, target.handCryptoTarget, share);
  for (const { id, count } of summary.topCards.slice(0, 5)) {
    if (count < 2) continue;
    const goal = Math.min(CARD_BIAS_CAP, Math.max(-CARD_BIAS_CAP, (count / Math.max(1, summary.games)) * 1.2));
    target.cardBias[id] = toward(base.cardBias[id] ?? 0, goal, share);
  }
  if (target.chaosFromCycle <= target.economyUntilCycle) target.chaosFromCycle = target.economyUntilCycle + 1;
  const shaped = clampToEnvelope(target, envelope);
  const change = diffProfiles(base, shaped);
  const bandLines = describeBands(summary);
  const planBlurb = summary.games < HUMAN_TEMPO_MIN_GAMES
    ? `Watching Draft tempo vs VP-Dog (${summary.games}/${HUMAN_TEMPO_MIN_GAMES} games before soft coaching). Inferred schedule economy→${schedule.economyUntilCycle}, Chaos→${schedule.chaosFromCycle}, VP→${schedule.vpFromCycle}.`
    : `Soft coaching from human Draft tempo vs VP-Dog (${summary.games} games, ${Math.round(share * 100)}% share): economy through Cycle ${shaped.economyUntilCycle}, Chaos from ${shaped.chaosFromCycle}, VP from ${shaped.vpFromCycle}. Not an experiment.`;
  const lines = summary.games < HUMAN_TEMPO_MIN_GAMES
    ? [`Human tempo (vs VP-Dog): watching — ${summary.games}/${HUMAN_TEMPO_MIN_GAMES} complete games before soft-applying. ${bandLines.join(' · ')}`]
    : [
      `Human tempo (vs VP-Dog): soft coaching ${Math.round(share * 100)}% toward your Draft tempo across ${summary.games} games — ${planBlurb}`,
      ...bandLines.map(line => `Human tempo band: ${line}`),
    ];
  return { change: summary.games < HUMAN_TEMPO_MIN_GAMES ? {} : change, lines, planBlurb, target: shaped };
}

/** Strat-G's current best with an earlier human-tempo soft coaching taken back out. */
export function withoutHumanTempo(current: StrategyProfile, previous: HumanTempoStore | null): StrategyProfile {
  if (!previous?.start) return current;
  const start: StrategyProfile = { ...current, weights: { ...current.weights }, cardBias: { ...current.cardBias } };
  const undo = (now: number, was: number, coached: number | undefined) => coached === undefined ? now : round(now - (coached - was));
  for (const field of SCALARS) start[field] = undo(current[field], previous.start[field], previous.change[field]);
  for (const key of Object.keys(current.weights) as (keyof StrategyWeights)[]) {
    start.weights[key] = undo(current.weights[key], previous.start.weights[key], previous.change.weights?.[key]);
  }
  for (const [id, coached] of Object.entries(previous.change.cardBias ?? {})) {
    start.cardBias[id] = undo(current.cardBias[id] ?? 0, previous.start.cardBias[id] ?? 0, coached);
  }
  return start;
}

export function humanTempoTips(store: HumanTempoStore | null): BaselineTips | null {
  if (!store || store.summary.games < HUMAN_TEMPO_MIN_GAMES) return null;
  if (emptyChange(store.change) && !store.lines.length) return null;
  return { change: store.change, lines: store.lines };
}

export function humanTempoStatus(store: HumanTempoStore | null) {
  const games = store?.summary.games ?? 0;
  const applied = !!store && games >= HUMAN_TEMPO_MIN_GAMES && !emptyChange(store.change);
  return {
    games,
    minGames: HUMAN_TEMPO_MIN_GAMES,
    share: store?.share ?? HUMAN_TEMPO_SHARE,
    applied,
    appliedAt: store?.appliedAt ?? null,
    planBlurb: store?.planBlurb ?? null,
    bands: store ? describeBands(store.summary) : [],
  };
}

/** Markdown block for Strat-G's notebook. */
export function humanTempoNotebookSection(store: HumanTempoStore | null): string[] {
  if (!store || !store.summary.games) {
    return [
      `## Human tempo (vs VP-Dog)`,
      ``,
      `Watching complete local games where you play seat 0 against VP-Dog. Draft buys are tallied in Cycles 1–4 / 5–8 / 9–12 / 13–16. After ${HUMAN_TEMPO_MIN_GAMES} games, Strat-G soft-applies a ${Math.round(HUMAN_TEMPO_SHARE * 100)}% coaching nudge toward that tempo (not an experiment).`,
      ``,
    ];
  }
  const status = humanTempoStatus(store);
  return [
    `## Human tempo (vs VP-Dog)`,
    ``,
    store.planBlurb,
    ``,
    `Soft coaching: ${status.applied ? `applied at ${store.appliedAt.slice(0, 16).replace('T', ' ')} (${Math.round(store.share * 100)}% share)` : `accumulating (${store.summary.games}/${HUMAN_TEMPO_MIN_GAMES} games; tips stay empty until then)`}. This is not an experiment and does not adopt into the versioned current best.`,
    ``,
    ...describeBands(store.summary).map(line => `- ${line}`),
    ``,
    ...(store.summary.topCards.length
      ? [`Repeated buys: ${store.summary.topCards.map(card => `${card.id}×${card.count}`).join(', ')}`, ``]
      : []),
    ...(store.lines.length ? store.lines.map(line => `- ${line}`) : []),
    ``,
  ];
}

export function buildHumanTempoStore(
  games: WatchedGame[],
  start: StrategyProfile,
  envelope: StyleEnvelope = HUMAN_TEMPO_ENVELOPE,
  share = HUMAN_TEMPO_SHARE,
  appliedAt = new Date().toISOString(),
): HumanTempoStore {
  const summary = aggregateTempo(games);
  const { change, lines, planBlurb } = formulateTempoChange(start, summary, envelope, share);
  return {
    schema: 1,
    appliedAt,
    share,
    games,
    summary,
    start: summary.games >= HUMAN_TEMPO_MIN_GAMES ? clampToEnvelope(start, envelope) : null,
    change,
    lines,
    planBlurb,
  };
}

export function appendWatchedGame(previous: HumanTempoStore | null, evidence: Pick<GameEvidence, 'id' | 'recordedAt' | 'report'>): WatchedGame[] {
  const next: WatchedGame = { id: evidence.id, recordedAt: evidence.recordedAt, bands: tallyHumanPurchases(evidence.report) };
  const games = [...(previous?.games ?? []).filter(game => game.id !== next.id), next];
  return games.slice(-HUMAN_TEMPO_ROLLING);
}

export function createHumanTempoStore(file: string) {
  async function read(): Promise<HumanTempoStore | null> {
    try {
      const saved = JSON.parse(await readFile(file, 'utf8')) as HumanTempoStore;
      return saved?.schema === 1 ? saved : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async function write(store: HumanTempoStore) {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temp, file);
  }
  return { file, read, write };
}
