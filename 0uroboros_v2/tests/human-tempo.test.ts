import { describe, expect, it } from 'vitest';
import { type StrategyProfile } from '@0uroboros/engine/ai/strategy';
import type { MatchReport } from '@0uroboros/engine/runtime';
import { withChange } from '../server/agents/mentoring';
import {
  appendWatchedGame, bandOf, buildHumanTempoStore, formulateTempoChange, HUMAN_TEMPO_ENVELOPE, HUMAN_TEMPO_MIN_GAMES,
  HUMAN_TEMPO_SHARE, humanTempoTips, isWatchedHumanVsVpDog, tallyHumanPurchases, withoutHumanTempo,
  type HumanTempoStore, type WatchedGame,
} from '../server/agents/humanTempo';
import { clampToEnvelope, STRAT_G } from '../server/agents/roster';

const start = (): StrategyProfile => clampToEnvelope({ ...STRAT_G.baseline, cardBias: {} }, STRAT_G.envelope);

function buy(cycle: number, category: 'Crypto' | 'Base' | 'Chaos' | 'VP', definitionId: string, cost = 3) {
  return { cycle, owner: 0 as const, definitionId, name: definitionId, category, cost, vp: category === 'VP' ? 2 : 0 };
}

function report(purchases: ReturnType<typeof buy>[]): Pick<MatchReport, 'purchases'> {
  return { purchases };
}

function watched(id: string, purchases: ReturnType<typeof buy>[]): WatchedGame {
  return { id, recordedAt: '2026-11-08T00:00:00.000Z', bands: tallyHumanPurchases(report(purchases)) };
}

/** Crypto-heavy early, VP-heavy end — the tempo soft coaching should lean economy later / VP earlier and raise those weights. */
function tempoGames(count: number): WatchedGame[] {
  const earlyCrypto = [buy(1, 'Crypto', 'kilo-coin'), buy(2, 'Crypto', 'mega-cache'), buy(3, 'Base', 'byte'), buy(4, 'Crypto', 'kilo-coin')];
  const midMix = [buy(5, 'Base', 'draw-card'), buy(6, 'Crypto', 'mega-cache'), buy(7, 'Base', 'thin'), buy(8, 'VP', 'vp-low')];
  const lateVp = [buy(9, 'VP', 'vp-mid'), buy(10, 'VP', 'vp-mid'), buy(11, 'Chaos', 'chaos-hit'), buy(12, 'VP', 'vp-high')];
  const endVp = [buy(13, 'VP', 'vp-high'), buy(14, 'VP', 'vp-high'), buy(15, 'VP', 'vp-mid'), buy(16, 'VP', 'vp-high')];
  return Array.from({ length: count }, (_, index) => watched(`game-${index}`, [...earlyCrypto, ...midMix, ...lateVp, ...endVp]));
}

describe('human tempo bands', () => {
  it('buckets Cycles into non-overlapping 1–4 / 5–8 / 9–12 / 13–16 bands', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16].map(bandOf)).toEqual(['early', 'early', 'mid', 'mid', 'lateMid', 'lateMid', 'end', 'end']);
    expect(bandOf(0)).toBeNull();
    expect(bandOf(17)).toBeNull();
  });

  it('tallies only the human seat and ignores the opponent', () => {
    const bands = tallyHumanPurchases({
      purchases: [
        buy(2, 'Crypto', 'kilo-coin'),
        { ...buy(2, 'VP', 'enemy-vp'), owner: 1 },
        buy(14, 'VP', 'vp-high'),
      ],
    });
    expect(bands.early.purchases).toBe(1);
    expect(bands.early.categories.Crypto).toBe(1);
    expect(bands.end.categories.VP).toBe(1);
    expect(bands.mid.purchases).toBe(0);
  });
});

describe('human tempo formulation', () => {
  it('moves phase knobs and weights toward Crypto-early / VP-late play', () => {
    const base = start();
    const store = buildHumanTempoStore(tempoGames(HUMAN_TEMPO_MIN_GAMES), base, HUMAN_TEMPO_ENVELOPE);
    const { change, target } = formulateTempoChange(base, store.summary, HUMAN_TEMPO_ENVELOPE, HUMAN_TEMPO_SHARE);
    expect(target.vpFromCycle).toBeLessThan(base.vpFromCycle);
    expect(target.weights.vp).toBeGreaterThan(base.weights.vp);
    expect(target.weights.crypto).toBeGreaterThan(base.weights.crypto);
    expect(change.weights?.vp).toBeDefined();
    expect(store.change.weights?.vp).toBeDefined();
  });

  it('keeps tips empty until the minimum watched sample', () => {
    const store = buildHumanTempoStore(tempoGames(HUMAN_TEMPO_MIN_GAMES - 1), start());
    expect(humanTempoTips(store)).toBeNull();
    expect(store.change).toEqual({});
    expect(store.planBlurb).toMatch(/watching/i);
  });

  it('soft-applies tips after the minimum sample', () => {
    const store = buildHumanTempoStore(tempoGames(HUMAN_TEMPO_MIN_GAMES), start());
    const tips = humanTempoTips(store);
    expect(tips).not.toBeNull();
    expect(tips!.lines[0]).toMatch(/soft coaching/i);
    expect(tips!.change.weights?.vp ?? tips!.change.vpFromCycle).toBeDefined();
  });
});

describe('human tempo undo', () => {
  it('undo/reapply starts from the pre-tempo profile, so the share never compounds', () => {
    const base = start();
    const first = buildHumanTempoStore(tempoGames(HUMAN_TEMPO_MIN_GAMES), base);
    const applied = withChange(base, first.change);
    const undone = withoutHumanTempo(applied, first);
    expect(undone.weights.vp).toBeCloseTo(base.weights.vp, 1);
    expect(undone.weights.crypto).toBeCloseTo(base.weights.crypto, 1);
    const second = buildHumanTempoStore(first.games, undone);
    expect(second.change).toEqual(first.change);
  });
});

describe('human tempo evidence filter', () => {
  it('accepts only complete human-vs-VP-Dog games', () => {
    expect(isWatchedHumanVsVpDog({ source: 'human-vs-agent', agent: 'vp-dog', valid: true })).toBe(true);
    expect(isWatchedHumanVsVpDog({ source: 'human-vs-agent', agent: 'vp-dog', valid: false })).toBe(false);
    expect(isWatchedHumanVsVpDog({ source: 'human-vs-agent', agent: 'strat-g', valid: true })).toBe(false);
    expect(isWatchedHumanVsVpDog({ source: 'human-vs-strat-g', agent: 'vp-dog', valid: true })).toBe(false);
    expect(isWatchedHumanVsVpDog({ source: 'league', agent: 'vp-dog', valid: true })).toBe(false);
  });

  it('appends watched games into a rolling sample without duplicates', () => {
    const first = appendWatchedGame(null, {
      id: 'human-vp-dog-a', recordedAt: '2026-11-08T01:00:00.000Z',
      report: report([buy(1, 'Crypto', 'kilo-coin'), buy(14, 'VP', 'vp-high')]) as MatchReport,
    });
    const store = { schema: 1 as const, appliedAt: '', share: HUMAN_TEMPO_SHARE, games: first, summary: { games: 1, bands: first[0].bands, topCards: [] }, start: null, change: {}, lines: [], planBlurb: '' } satisfies HumanTempoStore;
    const again = appendWatchedGame(store, {
      id: 'human-vp-dog-a', recordedAt: '2026-11-08T01:00:00.000Z',
      report: report([buy(1, 'Crypto', 'kilo-coin')]) as MatchReport,
    });
    expect(again).toHaveLength(1);
    const next = appendWatchedGame(store, {
      id: 'human-vp-dog-b', recordedAt: '2026-11-08T02:00:00.000Z',
      report: report([buy(16, 'VP', 'vp-high')]) as MatchReport,
    });
    expect(next.map(game => game.id)).toEqual(['human-vp-dog-a', 'human-vp-dog-b']);
  });
});

describe('human tempo share', () => {
  it('uses the designed soft-coaching share', () => {
    expect(HUMAN_TEMPO_SHARE).toBe(0.35);
    expect(HUMAN_TEMPO_MIN_GAMES).toBe(3);
  });
});
