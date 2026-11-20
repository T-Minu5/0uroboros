import { describe, expect, it } from 'vitest';
import type { MatchReport } from '@0uroboros/engine/runtime';
import { addToTally, emptyTally, stallFromTally } from '../server/agents/leagueEpochs';
import { cohortMetrics, gameMetrics, isGameEnder } from '../server/agents/ecoMetrics';

const emptyTelemetry = {
  events: 0, failedOutcomes: [0, 0] as [number, number], randomResults: 0, choices: [0, 0] as [number, number],
  drainDealt: [0, 0] as [number, number], restoreDone: [0, 0] as [number, number], restoreEvents: [0, 0] as [number, number],
  drainEvents: [0, 0] as [number, number],
  wastedRestores: [0, 0] as [number, number], drainBySource: {}, restoreBySource: {}, destructions: [],
  cards: {}, locations: {}, circuit: {}, perCycle: [], vpGained: [0, 0] as [number, number],
  cryptoGained: [0, 0] as [number, number], drawn: [0, 0] as [number, number], actionsGained: [0, 0] as [number, number],
};

function report(partial: Partial<MatchReport> & Pick<MatchReport, 'cycles' | 'purchases' | 'finalVP'>): MatchReport {
  return {
    strategyVersion: 1, cycle: partial.cycles.at(-1)?.cycle ?? 1, phase: 'gameover', winner: 0, endedReason: 'Cycle 16 final Draft complete.',
    servers: [3500, 3500], decks: [{}, {}], aiSeats: [1], telemetry: emptyTelemetry as unknown as MatchReport['telemetry'], decisions: [],
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
    expect(m.timeline.map(row => row.circuitClaimsThisCycle)).toEqual([[1, 0], [1, 0], [0, 1]]);
    expect(m.timeline.map(row => row.circuitDifferential)).toEqual([1, 2, 1]);
    expect(m.circuitLead2At).toEqual([2, null]);
    expect(m.circuitClaims).toEqual([2, 1]);
    expect(m.circuitWins).toEqual([2, 1]);
    expect(m.locationsWon).toEqual([9, 6]);
    expect(m.mostCircuitsLeader).toBe(0);
    expect(m.mostNodesLeader).toBe(0);
    expect(m.mostCircuitsVsMostNodes).toBe('same');
  });

  it('surfaces quarterly Circuit claim timing and early-lead → later Location dominance', () => {
    const cycles = Array.from({ length: 12 }, (_, index) => {
      const cycle = index + 1;
      const seat0Claims = cycle <= 8;
      return {
        cycle,
        vp: [cycle, Math.max(0, cycle - 2)] as [number, number],
        servers: [3500, 3500] as [number, number],
        wallet: [0, 0] as [number, number],
        locationsWon: (cycle >= 9 ? [2, 3] : [4, 1]) as [number, number],
        deckSize: [10, 10] as [number, number],
        locations: [],
        circuit: seat0Claims
          ? { rewardId: `r${cycle}`, name: `R${cycle}`, eligible: [0 as const], claimed: [0 as const] }
          : { rewardId: `r${cycle}`, name: `R${cycle}`, eligible: [1 as const], claimed: [1 as const] },
      };
    });
    const cohort = cohortMetrics([{ id: 'quarterly', report: report({ finalVP: [40, 20], winner: 0, purchases: [], cycles }) }]);
    expect(cohort.progress.quarters).toHaveLength(4);
    expect(cohort.progress.quarters[0]).toMatchObject({ id: 'Q1', avgCircuitClaimsThisQuarter: 4 });
    // Seat 0's second claim lands on Cycle 2, so the 2+ lead first appears in Q1.
    expect(cohort.progress.quarters[0].circuitLead2PlusFirstReachedShare).toBe(1);
    expect(cohort.progress.quarters[1].circuitLead2PlusFirstReachedShare).toBe(0);
    expect(cohort.progress.earlyCircuitLeadLaterLocations.games).toBe(1);
    // Seat 0 led Circuits early but seat 1 won more Locations in Q3; rate is 0.
    expect(cohort.progress.earlyCircuitLeadLaterLocations.wonMoreLocationsInQ3Q4).toBe(0);
    expect(cohort.progress.earlyCircuitLeadLaterLocations.wonGame).toBe(1);
  });

  it('flags when most-Circuits and most-Nodes leaders disagree (observational)', () => {
    const sameLeaders = gameMetrics(report({
      finalVP: [10, 5], purchases: [],
      cycles: [
        { cycle: 1, vp: [2, 1], servers: [3500, 3500], wallet: [0, 0], locationsWon: [3, 2], deckSize: [10, 10], locations: [], circuit: null },
        { cycle: 2, vp: [4, 2], servers: [3500, 3500], wallet: [0, 0], locationsWon: [4, 1], deckSize: [10, 10], locations: [], circuit: null },
      ],
    }));
    expect(sameLeaders.circuitWins).toEqual([2, 0]);
    expect(sameLeaders.locationsWon).toEqual([7, 3]);
    expect(sameLeaders.mostCircuitsVsMostNodes).toBe('same');

    // Seat 0 wins more Cycles narrowly; seat 1 piles Nodes in one blowout Cycle.
    const splitCycles = [
      { cycle: 1, vp: [0, 0] as [number, number], servers: [3500, 3500] as [number, number], wallet: [0, 0] as [number, number], locationsWon: [3, 2] as [number, number], deckSize: [10, 10] as [number, number], locations: [], circuit: null },
      { cycle: 2, vp: [0, 0] as [number, number], servers: [3500, 3500] as [number, number], wallet: [0, 0] as [number, number], locationsWon: [3, 2] as [number, number], deckSize: [10, 10] as [number, number], locations: [], circuit: null },
      { cycle: 3, vp: [0, 0] as [number, number], servers: [3500, 3500] as [number, number], wallet: [0, 0] as [number, number], locationsWon: [3, 2] as [number, number], deckSize: [10, 10] as [number, number], locations: [], circuit: null },
      { cycle: 4, vp: [0, 0] as [number, number], servers: [3500, 3500] as [number, number], wallet: [0, 0] as [number, number], locationsWon: [0, 5] as [number, number], deckSize: [10, 10] as [number, number], locations: [], circuit: null },
    ];
    const split = gameMetrics(report({ finalVP: [8, 8], winner: null, purchases: [], cycles: splitCycles }));
    expect(split.circuitWins).toEqual([3, 1]);
    expect(split.locationsWon).toEqual([9, 11]);
    expect(split.mostCircuitsLeader).toBe(0);
    expect(split.mostNodesLeader).toBe(1);
    expect(split.mostCircuitsVsMostNodes).toBe('differ');

    const sameCycles = [
      { cycle: 1, vp: [2, 1] as [number, number], servers: [3500, 3500] as [number, number], wallet: [0, 0] as [number, number], locationsWon: [3, 2] as [number, number], deckSize: [10, 10] as [number, number], locations: [], circuit: null },
      { cycle: 2, vp: [4, 2] as [number, number], servers: [3500, 3500] as [number, number], wallet: [0, 0] as [number, number], locationsWon: [4, 1] as [number, number], deckSize: [10, 10] as [number, number], locations: [], circuit: null },
    ];
    const cohort = cohortMetrics([
      { id: 'same-a', report: report({ finalVP: [10, 5], purchases: [], cycles: sameCycles }) },
      { id: 'differ-b', report: report({ finalVP: [8, 8], winner: null, purchases: [], cycles: splitCycles }) },
    ]);
    expect(cohort.boardAwards.mostCircuitsVsMostNodes).toMatchObject({ games: 2, same: 1, differ: 1, tied: 0, differShare: 0.5, differAmongDecided: 0.5 });
    expect(cohort.circuit.winsPerGame).toBeGreaterThan(0);
  });

  it('counts Collapse particle Node control vs ties for Eco', () => {
    const m = gameMetrics(report({
      finalVP: [10, 8], purchases: [],
      cycles: [
        // Circuit winner 0, particle won by Circuit winner
        { cycle: 1, vp: [2, 1], servers: [3500, 3500], wallet: [0, 0], locationsWon: [3, 2], deckSize: [10, 10], locations: [], circuit: null, particleNode: 2, particleWinner: 0 },
        // Circuit winner 1, particle tied Node
        { cycle: 2, vp: [4, 2], servers: [3500, 3500], wallet: [0, 0], locationsWon: [2, 3], deckSize: [10, 10], locations: [], circuit: null, particleNode: 0, particleWinner: null },
        // Circuit winner 0, particle won by Circuit loser
        { cycle: 3, vp: [6, 4], servers: [3500, 3500], wallet: [0, 0], locationsWon: [4, 1], deckSize: [10, 10], locations: [], circuit: null, particleNode: 4, particleWinner: 1 },
        // Circuit tied, particle controlled
        { cycle: 4, vp: [7, 5], servers: [3500, 3500], wallet: [0, 0], locationsWon: [2, 2], deckSize: [10, 10], locations: [], circuit: null, particleNode: 1, particleWinner: 0 },
        // Older cycle without particle fields — ignored for particle stats
        { cycle: 5, vp: [8, 5], servers: [3500, 3500], wallet: [0, 0], locationsWon: [3, 2], deckSize: [10, 10], locations: [], circuit: null },
      ],
    }));
    expect(m.mostNodesLeader).toBe(0);
    expect(m.locationsWon).toEqual([14, 10]);
    expect(m.particleControlled).toBe(3);
    expect(m.particleTied).toBe(1);
    expect(m.particleWins).toEqual([2, 1]);
    expect(m.particleByCircuitWinner).toBe(1);
    expect(m.particleByCircuitLoser).toBe(1);
    expect(m.particleControlledWhileCircuitTied).toBe(1);
  });

  it('tracks winner vs loser Power, Crypto, plays, trash and destroy', () => {
    const m = gameMetrics(report({
      finalVP: [20, 10], winner: 0, purchases: [],
      cycles: [{ cycle: 1, vp: [2, 1], servers: [3500, 3500], wallet: [0, 0], locationsWon: [3, 2], deckSize: [10, 10], locations: [], circuit: null }],
      telemetry: {
        ...emptyTelemetry,
        cryptoGained: [12, 5],
        powerIncreased: [8, 3],
        cardsTrashed: [4, 1],
        cardsDestroyed: [2, 5],
        cards: {
          dash: { definitionId: 'dash', name: 'Dash', cost: 1, type: 'Character', plays: [6, 2], drain: [0, 0], restore: [0, 0], draw: [0, 0], actions: [0, 0], crypto: [0, 0], vp: [0, 0] },
          nuke: { definitionId: 'nuke', name: 'Nuke', cost: 4, type: 'Character', plays: [1, 4], drain: [0, 0], restore: [0, 0], draw: [0, 0], actions: [0, 0], crypto: [0, 0], vp: [0, 0] },
        },
      } as unknown as MatchReport['telemetry'],
    }));
    expect(m.powerIncreased).toEqual([8, 3]);
    expect(m.economy.cryptoGained).toEqual([12, 5]);
    expect(m.cardsPlayed).toEqual([7, 6]);
    expect(m.cardsTrashed).toEqual([4, 1]);
    expect(m.cardsDestroyed).toEqual([2, 5]);

    const cohort = cohortMetrics([{ id: 'g1', report: report({
      finalVP: [20, 10], winner: 0, purchases: [],
      cycles: [{ cycle: 1, vp: [2, 1], servers: [3500, 3500], wallet: [0, 0], locationsWon: [3, 2], deckSize: [10, 10], locations: [], circuit: null }],
      telemetry: {
        ...emptyTelemetry,
        cryptoGained: [12, 5],
        powerIncreased: [8, 3],
        cardsTrashed: [4, 1],
        cardsDestroyed: [2, 5],
        cards: {
          dash: { definitionId: 'dash', name: 'Dash', cost: 1, type: 'Character', plays: [6, 2], drain: [0, 0], restore: [0, 0], draw: [0, 0], actions: [0, 0], crypto: [0, 0], vp: [0, 0] },
        },
      } as unknown as MatchReport['telemetry'],
    }) }]);
    expect(cohort.boardAwards.particle.vsCircuit.byWinnerPerGame).toBe(0);
    expect(cohort.winnerProfile.winnerPowerIncreasedMore.rate).toBe(1);
    expect(cohort.winnerProfile.winnerCryptoGainedMore.rate).toBe(1);
    expect(cohort.winnerProfile.winnerPlayedMoreCards.rate).toBe(1);
    expect(cohort.winnerProfile.winnerTrashedMore.rate).toBe(1);
    expect(cohort.winnerProfile.winnerDestroyedMoreCards.rate).toBe(0);
  });

  it('exposes market VP per seat separately from destruction VP', () => {
    const m = gameMetrics(report({
      finalVP: [18, 12],
      marketVp: [6, 2],
      finalScore: [
        { total: 18, vpCards: [], ownedDeck: [], cardVP: 8, locationVP: 0, circuitVP: 0, effectVP: 2, destructionVP: 8 },
        { total: 12, vpCards: [], ownedDeck: [], cardVP: 2, locationVP: 0, circuitVP: 0, effectVP: 2, destructionVP: 8 },
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
      } as unknown as MatchReport['telemetry'],
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

  it('matches game-enders by id or Shoggoth-style name and diagnoses Cycle-16 stalls', () => {
    expect(isGameEnder('delta-wave', '∆-Wave')).toBe(true);
    expect(isGameEnder('card-a2qeb5kn', 'The Shoggoth')).toBe(true);
    expect(isGameEnder('other-id', 'The Shoggoth')).toBe(true);
    expect(isGameEnder('kilo-coin', 'Kilo-Coin')).toBe(false);

    const cycle16Games = Array.from({ length: 4 }, (_, index) => report({
      cycle: 16,
      endedReason: 'Cycle 16 final Draft complete.',
      finalVP: [24 + index, 18],
      winner: 0,
      purchases: [
        { cycle: 8, owner: 0, definitionId: 'vault-encryption', name: 'Vault Encryption', category: 'VP', cost: 5, vp: 4 },
        { cycle: 10, owner: 1, definitionId: 'vault-encryption', name: 'Vault Encryption', category: 'VP', cost: 5, vp: 4 },
      ],
      cycles: Array.from({ length: 16 }, (__, cycleIndex) => ({
        cycle: cycleIndex + 1,
        vp: [cycleIndex, Math.max(0, cycleIndex - 2)] as [number, number],
        servers: [3500, 3500] as [number, number],
        wallet: [4, 4] as [number, number],
        locationsWon: [0, 0] as [number, number],
        deckSize: [10, 10] as [number, number],
        locations: [],
        circuit: null,
        market: [{ id: 'vault-encryption', name: 'Vault Encryption', category: 'VP' as const, cost: 5, stock: [1, 1] as [number, number] }],
      })),
      telemetry: {
        ...emptyTelemetry,
        drainDealt: [200, 180] as [number, number],
        restoreDone: [160, 150] as [number, number],
      } as unknown as MatchReport['telemetry'],
    }));
    const destructionGames = Array.from({ length: 4 }, (_, index) => report({
      cycle: 12,
      endedReason: 'Servers destroyed.',
      finalVP: [18, 10 + index],
      winner: 0,
      purchases: [
        { cycle: 9, owner: 0, definitionId: 'delta-wave', name: '∆-Wave', category: 'Chaos', cost: 9, vp: 0 },
      ],
      cycles: Array.from({ length: 12 }, (__, cycleIndex) => ({
        cycle: cycleIndex + 1,
        vp: [cycleIndex, Math.max(0, cycleIndex - 3)] as [number, number],
        servers: [2000, 3500] as [number, number],
        wallet: [10, 8] as [number, number],
        locationsWon: [0, 0] as [number, number],
        deckSize: [10, 10] as [number, number],
        locations: [],
        circuit: null,
        market: [{ id: 'delta-wave', name: '∆-Wave', category: 'Chaos' as const, cost: 9, stock: [1, 1] as [number, number] }],
      })),
      telemetry: {
        ...emptyTelemetry,
        drainDealt: [400, 120] as [number, number],
        restoreDone: [80, 60] as [number, number],
        destructions: [{ cycle: 12, victim: 1, server: 'primary', by: 0, source: 'card', sourceId: 'delta-wave', vp: 8 }],
      } as unknown as MatchReport['telemetry'],
    }));
    const cohort = cohortMetrics([
      ...cycle16Games.map((item, index) => ({ id: `c16-${index}`, report: item })),
      ...destructionGames.map((item, index) => ({ id: `dest-${index}`, report: item })),
    ]);
    expect(cohort.endedBy.cycle16).toBe(4);
    expect(cohort.endedBy.destruction).toBe(4);
    expect(cohort.cycle16Stall.cycle16.gameEnders.anyBoughtShare).toBe(0);
    expect(cohort.cycle16Stall.destruction.gameEnders.anyBoughtShare).toBe(1);
    expect(['missing-enders', 'mixed', 'repair-and-vp']).toContain(cohort.cycle16Stall.diagnosis);

    const tally = emptyTally();
    for (const game of [...cycle16Games, ...destructionGames]) addToTally(tally, game);
    const stall = stallFromTally(tally);
    expect(stall.cycle16.games).toBe(4);
    expect(stall.destruction.games).toBe(4);
    expect(stall.cycle16.anyBoughtShare).toBe(0);
    expect(stall.destruction.anyBoughtShare).toBe(1);
  });
});
