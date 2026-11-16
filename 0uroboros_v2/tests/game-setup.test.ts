import { describe, expect, it } from 'vitest';
import { DEFAULT_END_GAME_AWARDS, DRAFT_TIMER_CHOICES, sanitizeGameSetup } from '../src/gameSetup';

describe('sanitizeGameSetup', () => {
  it('defaults Extended runtime, 300s Draft, trailing rewards on, and Server VP 16/24', () => {
    expect(sanitizeGameSetup(null)).toEqual({
      serverVP: { primary: 16, backup: 24 }, turnSeconds: null, draftSeconds: 300,
      noLocations: false, middleNodesOnly: false, trailingRewards: true,
      mostCircuitsBonusVP: 6, nodeWinVP: 1, endGameAwards: DEFAULT_END_GAME_AWARDS,
    });
    expect([...DRAFT_TIMER_CHOICES]).toEqual([60, 90, 120, 180, 240, 300, 600]);
  });

  it('clamps Server VP, accepts both timers, and drops unknown legacy flags', () => {
    expect(sanitizeGameSetup({ serverVP: { primary: 6.4, backup: -3 }, turnSeconds: 2, cryptoSwap: { enabled: true, cycle: 40 }, midCycleDraw: false })).toEqual({
      serverVP: { primary: 6, backup: 0 }, turnSeconds: null, draftSeconds: 300,
      noLocations: false, middleNodesOnly: false, trailingRewards: true,
      mostCircuitsBonusVP: 6, nodeWinVP: 1, endGameAwards: DEFAULT_END_GAME_AWARDS,
    });
    expect(sanitizeGameSetup({
      serverVP: { primary: 10 }, turnSeconds: 45, draftSeconds: 90, noTrailingRewards: true,
      draftCrypto: true, middleNodesOnly: true, tenCardDraft: true, noActions: true,
      mostCircuitsBonusVP: 99, nodeWinVP: 99,
    })).toEqual({
      serverVP: { primary: 10, backup: 24 }, turnSeconds: 45, draftSeconds: 90,
      noLocations: false, middleNodesOnly: true, trailingRewards: false,
      mostCircuitsBonusVP: 50, nodeWinVP: 50, endGameAwards: DEFAULT_END_GAME_AWARDS,
    });
    expect(sanitizeGameSetup({ draftSeconds: null }).draftSeconds).toBeNull();
    expect(sanitizeGameSetup(null)).not.toHaveProperty('draftCrypto');
    expect(sanitizeGameSetup(null)).not.toHaveProperty('tenCardDraft');
  });
});
