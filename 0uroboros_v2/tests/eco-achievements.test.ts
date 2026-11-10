import { describe, expect, it } from 'vitest';
import { TelemetryCollector } from '@0uroboros/engine/ai/telemetry';
import type { MatchReport } from '@0uroboros/engine/runtime';
import {
  ACHIEVEMENT_SLATE,
  ACHIEVEMENT_VP,
  MAX_ACHIEVEMENT_RECOMMENDATIONS,
  cohortMetrics,
  gameMetrics,
} from '../server/agents/ecoMetrics';
import { emptyJournal, renderJournal, type Journal } from '../server/agents/ecoJournal';
import { splitTabs } from '../src/miniMarkdown';

const emptyTelemetry = {
  events: 0, failedOutcomes: [0, 0] as [number, number], randomResults: 0, choices: [0, 0] as [number, number],
  drainDealt: [0, 0] as [number, number], restoreDone: [0, 0] as [number, number], restoreEvents: [0, 0] as [number, number],
  drainEvents: [0, 0] as [number, number],
  wastedRestores: [0, 0] as [number, number], drainBySource: {}, restoreBySource: {}, destructions: [],
  cards: {}, locations: {}, circuit: {}, perCycle: [], vpGained: [0, 0] as [number, number],
  cryptoGained: [0, 0] as [number, number], drawn: [0, 0] as [number, number], actionsGained: [0, 0] as [number, number],
  powerIncreased: [0, 0] as [number, number], cardPowerDrained: [0, 0] as [number, number], cardPowerRestored: [0, 0] as [number, number],
  cardsTrashed: [0, 0] as [number, number], cardsDestroyed: [0, 0] as [number, number],
};

function report(partial: Partial<MatchReport> & Pick<MatchReport, 'cycles' | 'purchases' | 'finalVP'>): MatchReport {
  return {
    strategyVersion: 1, cycle: partial.cycles.at(-1)?.cycle ?? 1, phase: 'gameover', winner: 0, endedReason: 'Cycle 16 final Draft complete.',
    servers: [3500, 3500], decks: [{}, {}], aiSeats: [1], telemetry: emptyTelemetry as unknown as MatchReport['telemetry'], decisions: [],
    ...partial,
  };
}

const cycle = (locationsWon: [number, number] = [1, 0]) => ({
  cycle: 1, vp: [0, 0] as [number, number], servers: [3500, 3500] as [number, number], wallet: [0, 0] as [number, number],
  locationsWon, deckSize: [10, 10] as [number, number], locations: [], circuit: null,
});

describe('card Power drain / restore telemetry', () => {
  it('counts enemy Power drained and heal/restore toward printed separately from lasting buffs', () => {
    const collector = new TelemetryCollector(() => ({ cycle: 1, turn: 1 }), () => undefined);
    collector.record({
      kind: 'power', text: 'Siphon: Enemy Power 5 → 3. Siphon steals 2.', owner: 0, targetOwner: 1, amount: -2,
    });
    collector.record({
      kind: 'power', text: 'Amp: Ally Power 2 → 4.', owner: 0, targetOwner: 0, amount: 2,
    });
    collector.record({
      kind: 'power', text: 'Patch: heal Ally Power 1 → 3.', owner: 0, targetOwner: 0, amount: 2,
    });
    collector.record({
      kind: 'power', text: 'Reset: restore Ally Power 6 → 4.', owner: 1, targetOwner: 1, amount: -2,
    });
    collector.record({
      kind: 'power', text: 'Nuke: remove Ally Power 4 → 2.', owner: 0, targetOwner: 0, amount: -2,
    });
    expect(collector.data.cardPowerDrained).toEqual([2, 0]);
    expect(collector.data.powerIncreased).toEqual([4, 0]); // +2 buff +2 steal
    expect(collector.data.cardPowerRestored).toEqual([2, 2]);
  });
});

describe('achievement VP slate metrics', () => {
  it('seeds seven candidates and credits destruction-loser hits when the loser led the metric', () => {
    expect(ACHIEVEMENT_SLATE).toHaveLength(7);
    expect(ACHIEVEMENT_SLATE.filter(item => item.shipped).map(item => item.id)).toEqual(['most-circuits']);

    // Seat 1 loses by destruction but trashed more and led Circuits less often than seat 0.
    const destructionLoserTrash = report({
      finalVP: [40, 10], winner: 0, endedReason: 'Both of opponent Servers destroyed.',
      purchases: [],
      cycles: [
        { ...cycle([3, 2]), cycle: 1 },
        { ...cycle([3, 2]), cycle: 2 },
        { ...cycle([2, 3]), cycle: 3 },
      ],
      telemetry: {
        ...emptyTelemetry,
        cardsTrashed: [1, 8],
        cardsDestroyed: [5, 1],
        powerIncreased: [9, 2],
        cardPowerDrained: [1, 6],
        cardPowerRestored: [0, 4],
        restoreDone: [100, 800],
      } as unknown as MatchReport['telemetry'],
    });
    const m = gameMetrics(destructionLoserTrash);
    expect(m.endedBy).toBe('destruction');
    expect(m.cardPowerDrained).toEqual([1, 6]);
    expect(m.cardPowerRestored).toEqual([0, 4]);
    expect(m.achievements).toHaveLength(7);

    const trashed = m.achievements.find(item => item.id === 'most-trashed')!;
    expect(trashed.leader).toBe(1);
    expect(trashed.helpsDestructionLoser).toBe(true);
    expect(trashed.helpsDestructionWinner).toBe(false);
    expect(trashed.marginIfAwarded).toBe(Math.abs(40 - (10 + ACHIEVEMENT_VP)));
    expect(trashed.marginDeltaIfAwarded).toBe(trashed.marginIfAwarded! - m.vpMargin);

    const circuits = m.achievements.find(item => item.id === 'most-circuits')!;
    expect(circuits.leader).toBe(0); // 2–1 Circuit wins
    expect(circuits.helpsDestructionLoser).toBe(false);
    expect(circuits.shipped).toBe(true);

    const repaired = m.achievements.find(item => item.id === 'most-server-repaired')!;
    expect(repaired.leader).toBe(1);
    expect(repaired.helpsDestructionLoser).toBe(true);

    const cohort = cohortMetrics([
      { id: 'g1', report: destructionLoserTrash },
      { id: 'g2', report: report({
        finalVP: [22, 20], winner: 0, endedReason: 'Both of opponent Servers destroyed.',
        purchases: [], cycles: [cycle([2, 3])],
        telemetry: {
          ...emptyTelemetry,
          cardsTrashed: [3, 1],
          restoreDone: [50, 10],
        } as unknown as MatchReport['telemetry'],
      }) },
    ]);
    expect(cohort.achievements.slate).toHaveLength(7);
    expect(cohort.achievements.vp).toBe(ACHIEVEMENT_VP);
    const trashCohort = cohort.achievements.slate.find(item => item.id === 'most-trashed')!;
    expect(trashCohort.destructionLoserHits).toBe(1);
    expect(trashCohort.destructionLoserHitRate).toBe(0.5);
    expect(cohort.achievements.topByDestructionLoserHit).toHaveLength(MAX_ACHIEVEMENT_RECOMMENDATIONS);
    expect(cohort.achievements.topByDestructionLoserHit).not.toContain('most-circuits');
  });

  it('treats metric ties as nobody awarded', () => {
    const m = gameMetrics(report({
      finalVP: [10, 8], winner: 0, endedReason: 'Both of opponent Servers destroyed.',
      purchases: [], cycles: [cycle([1, 1])],
      telemetry: { ...emptyTelemetry, cardsTrashed: [0, 0] } as unknown as MatchReport['telemetry'],
    }));
    const trashed = m.achievements.find(item => item.id === 'most-trashed')!;
    expect(trashed.leader).toBeNull();
    expect(trashed.helpsDestructionLoser).toBeNull();
  });
});

describe('achievement slate in the journal Summary', () => {
  it('lists all seven ideas and marks the top three', () => {
    const journal: Journal = emptyJournal('2026-11-08T00:00:00.000Z');
    journal.currentBuild = 'b1';
    journal.builds.push({ id: 'b1', label: 'test', contentRevision: 1, firstSeen: journal.createdAt });
    journal.achievements = {
      at: journal.createdAt, reportId: 'rep-1', buildId: 'b1', games: 12, vp: ACHIEVEMENT_VP,
      slate: ACHIEVEMENT_SLATE.map((def, index) => ({
        id: def.id, award: def.award, shipped: def.shipped, top3: !def.shipped && index <= 3,
        decided: 10, tied: 2,
        destructionLoserHitRate: def.shipped ? 0.2 : 0.7 - index * 0.05,
        destructionWinnerHitRate: 0.3,
        leaderWonGameRate: 0.55,
        meanMarginIfAwarded6: 14,
      })),
    };
    const summary = splitTabs(renderJournal(journal)).tabs[0].text;
    expect(summary).toMatch(/### Achievement VP slate/);
    for (const def of ACHIEVEMENT_SLATE) expect(summary).toContain(def.id);
    expect(summary.match(/★/g)?.length).toBe(MAX_ACHIEVEMENT_RECOMMENDATIONS);
    expect(summary).toMatch(/most-circuits \(shipped\)/);
  });
});
