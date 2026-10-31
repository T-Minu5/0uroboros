import { describe, expect, it } from 'vitest';
import type { MatchReport } from '@0uroboros/engine/runtime';
import { cohortMetrics, gameMetrics } from '../server/agents/ecoMetrics';

const emptyTelemetry = {
  events: 0, failedOutcomes: [0, 0] as [number, number], randomResults: 0, choices: [0, 0] as [number, number],
  drainDealt: [0, 0] as [number, number], restoreDone: [0, 0] as [number, number], restoreEvents: [0, 0] as [number, number],
  wastedRestores: [0, 0] as [number, number], drainBySource: {}, restoreBySource: {}, destructions: [],
  cards: {}, locations: {}, circuit: {}, perCycle: [], vpGained: [0, 0] as [number, number],
  cryptoGained: [0, 0] as [number, number], drawn: [0, 0] as [number, number], actionsGained: [0, 0] as [number, number],
};

function report(partial: Partial<MatchReport> & Pick<MatchReport, 'cycles' | 'purchases' | 'finalVP'>): MatchReport {
  return {
    strategyVersion: 1, cycle: partial.cycles.at(-1)?.cycle ?? 1, phase: 'gameover', winner: 0, endedReason: 'Cycle 16 final Draft complete.',
    servers: [3500, 3500], decks: [{}, {}], aiSeats: [1], telemetry: emptyTelemetry as MatchReport['telemetry'], decisions: [],
    ...partial,
  };
}

describe('Eco metrics Circuit differential and market VP', () => {
  it('logs per-cycle Location wins and cumulative Circuit differential on the timeline', () => {
    const m = gameMetrics(report({
      finalVP: [20, 10],
      purchases: [],
      cycles: [
        {
          cycle: 1, vp: [2, 1], servers: [3500, 3500], wallet: [3, 2], locationsWon: [3, 2], deckSize: [10, 10],
          locations: [], circuit: { rewardId: 'r1', name: 'R1', eligible: [0], claimed: [0] },
        },
        {
          cycle: 2, vp: [5, 2], servers: [3500, 3500], wallet: [1, 4], locationsWon: [4, 1], deckSize: [11, 10],
          locations: [], circuit: { rewardId: 'r2', name: 'R2', eligible: [0], claimed: [0] },
        },
        {
          cycle: 3, vp: [8, 4], servers: [3500, 3500], wallet: [2, 2], locationsWon: [2, 3], deckSize: [12, 11],
          locations: [], circuit: { rewardId: 'r3', name: 'R3', eligible: [1], claimed: [1] },
        },
      ],
    }));
    expect(m.timeline.map(row => row.locationsWon)).toEqual([[3, 2], [4, 1], [2, 3]]);
    expect(m.timeline.map(row => row.circuitClaims)).toEqual([[1, 0], [2, 0], [2, 1]]);
    expect(m.timeline.map(row => row.circuitDifferential)).toEqual([1, 2, 1]);
    expect(m.circuitLead2At).toEqual([2, null]);
    expect(m.circuitClaims).toEqual([2, 1]);
  });

  it('exposes market VP per seat separately from destruction VP', () => {
    const m = gameMetrics(report({
      finalVP: [18, 12],
      marketVp: [6, 2],
      finalScore: [
        { total: 18, vpCards: [], cardVP: 8, locationVP: 0, circuitVP: 0, effectVP: 2, destructionVP: 8 },
        { total: 12, vpCards: [], cardVP: 2, locationVP: 0, circuitVP: 0, effectVP: 2, destructionVP: 8 },
      ],
      purchases: [
        { cycle: 4, owner: 0, definitionId: 'basic-encryption', name: 'Basic Encryption', category: 'VP', cost: 3, vp: 2 },
        { cycle: 5, owner: 0, definitionId: 'vault-encryption', name: 'Vault Encryption', category: 'VP', cost: 5, vp: 4 },
        { cycle: 6, owner: 1, definitionId: 'basic-encryption', name: 'Basic Encryption', category: 'VP', cost: 3, vp: 2 },
        { cycle: 3, owner: 0, definitionId: 'dash', name: 'Dash', category: 'Base', cost: 2, vp: 0 },
      ],
      cycles: [{
        cycle: 1, vp: [0, 0], servers: [3500, 3500], wallet: [0, 0], locationsWon: [0, 0], deckSize: [10, 10],
        locations: [], circuit: null,
      }],
      telemetry: {
        ...emptyTelemetry,
        destructions: [
          { cycle: 8, victim: 1, server: 'primary', by: 0, source: 'card', sourceId: 'x', vp: 4 },
          { cycle: 10, victim: 1, server: 'backup', by: 0, source: 'card', sourceId: 'y', vp: 4 },
          { cycle: 9, victim: 0, server: 'primary', by: 1, source: 'card', sourceId: 'z', vp: 4 },
          { cycle: 11, victim: 0, server: 'backup', by: 1, source: 'card', sourceId: 'w', vp: 4 },
        ],
      } as MatchReport['telemetry'],
    }));
    expect(m.marketVp).toEqual([6, 2]);
    expect(m.destructionVP).toEqual([8, 8]);
    expect(m.otherVp).toEqual([4, 2]);
    expect(m.finalScore?.[0].cardVP).toBe(8);
    expect(m.finalScore?.[0].destructionVP).toBe(8);
  });

  it('summarizes whether a 2+ Circuit lead snowballs in the cohort', () => {
    const leadGame = report({
      finalVP: [30, 10], winner: 0,
      purchases: [],
      cycles: [
        { cycle: 1, vp: [2, 1], servers: [3500, 3500], wallet: [0, 0], locationsWon: [3, 2], deckSize: [10, 10], locations: [], circuit: { rewardId: 'a', name: 'A', eligible: [0], claimed: [0] } },
        { cycle: 2, vp: [5, 2], servers: [3500, 3500], wallet: [0, 0], locationsWon: [4, 1], deckSize: [10, 10], locations: [], circuit: { rewardId: 'b', name: 'B', eligible: [0], claimed: [0] } },
        { cycle: 3, vp: [9, 3], servers: [3500, 3500], wallet: [0, 0], locationsWon: [3, 2], deckSize: [10, 10], locations: [], circuit: { rewardId: 'c', name: 'C', eligible: [0], claimed: [0] } },
      ],
    });
    const cohort = cohortMetrics([{ id: 'g1', report: leadGame }]);
    expect(cohort.snowball.circuitLead2Plus.games).toBe(1);
    expect(cohort.snowball.circuitLead2Plus.avgCycleReached).toBe(2);
    expect(cohort.snowball.circuitLead2Plus.keptCircuitLead).toBe(1);
    expect(cohort.snowball.circuitLead2Plus.leaderWonGame).toBe(1);
    expect(cohort.vpSources.avgMarketVp).toBe(0);
  });
});
