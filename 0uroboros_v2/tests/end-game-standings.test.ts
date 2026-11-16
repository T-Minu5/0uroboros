import { describe, expect, it } from 'vitest';
import {
  createSession, DEFAULT_END_GAME_AWARDS, mirrorView, seededRandom,
} from '@0uroboros/engine/runtime';

describe('endGameStandings', () => {
  it('lists Most Circuits and enabled awards with live tallies', () => {
    const session = createSession({
      carryover: true, priorityPreference: 'higher',
      random: seededRandom(7),
      mostCircuitsBonusVP: 6,
      endGameAwards: DEFAULT_END_GAME_AWARDS,
    });
    const view = session.view(0);
    expect(view.endGameStandings.map(row => row.id)).toEqual([
      'mostCircuits',
      'mostDestroyed',
      'mostTrashed',
      'mostPowerRemoved',
      'mostPowerBoosted',
      'mostCryptoBanked',
      'mostCryptoStolen',
    ]);
    expect(view.endGameStandings[0]).toMatchObject({
      id: 'mostCircuits', vp: 6, scores: [0, 0], leader: null,
    });
    for (const row of view.endGameStandings) {
      expect(row.scores).toEqual([0, 0]);
      expect(row.leader).toBeNull();
      expect(row.vp).toBeGreaterThan(0);
    }
  });

  it('mirrorView flips award scores and leaders for seat 1', () => {
    const session = createSession({
      carryover: true, priorityPreference: 'higher',
      random: seededRandom(3),
      mostCircuitsBonusVP: 6,
      endGameAwards: {
        ...DEFAULT_END_GAME_AWARDS,
        mostTrashed: { enabled: false, vp: 2 },
      },
    });
    const absolute = session.view(0).endGameStandings;
    // Force a lead on absolute seat 0 for destroyed / circuits via the public tally shape.
    const patched = absolute.map(row =>
      row.id === 'mostDestroyed'
        ? { ...row, scores: [4, 1] as [number, number], leader: 0 as const }
        : row.id === 'mostCircuits'
          ? { ...row, scores: [2, 1] as [number, number], leader: 0 as const }
          : row,
    );
    const mirrored = mirrorView({ ...session.view(0), endGameStandings: patched });
    expect(mirrored.endGameStandings.find(row => row.id === 'mostDestroyed')).toMatchObject({
      scores: [1, 4], leader: 1,
    });
    expect(mirrored.endGameStandings.find(row => row.id === 'mostCircuits')).toMatchObject({
      scores: [1, 2], leader: 1,
    });
    expect(mirrored.endGameStandings.some(row => row.id === 'mostTrashed')).toBe(false);
  });
});
