import { describe, expect, it } from 'vitest';
import { CIRCUIT_MODES, circuitModeFlags, circuitModeOf, DEFAULT_END_GAME_AWARDS, DRAFT_TIMER_CHOICES, sanitizeGameSetup, withClientRules } from '../src/gameSetup';

describe('Circuit mode', () => {
  it('maps Open, Closed and Short to the board flags and back', () => {
    expect(CIRCUIT_MODES.map(mode => [mode.label, mode.hint])).toEqual([
      ['Open', 'Location text on'], ['Closed', 'Location text off'], ['Short', '3 Locations, text on'],
    ]);
    expect(circuitModeFlags('open')).toEqual({ noLocations: false, middleNodesOnly: false });
    expect(circuitModeFlags('closed')).toEqual({ noLocations: true, middleNodesOnly: false });
    expect(circuitModeFlags('short')).toEqual({ noLocations: false, middleNodesOnly: true });
    for (const mode of CIRCUIT_MODES) expect(circuitModeOf(circuitModeFlags(mode.id))).toBe(mode.id);
  });
});

describe('withClientRules', () => {
  it('takes VP and Circuit reward rules from the applied epoch and keeps the player’s mode and timers', () => {
    const own = sanitizeGameSetup({ turnSeconds: 45, draftSeconds: null, noLocations: true });
    expect(withClientRules(own, null)).toEqual(own);
    expect(withClientRules(own, { appliedAt: null, epochId: null, rules: null })).toEqual(own);
    const applied = withClientRules(own, {
      appliedAt: '2026-11-19T12:00:00.000Z', epochId: 7,
      rules: { serverVP: { primary: 12, backup: 20 }, nodeWinVP: 2, mostCircuitsBonusVP: 4, endGameAwards: DEFAULT_END_GAME_AWARDS, noCircuitRewards: false, noTrailingRewards: false },
    });
    expect(applied).toMatchObject({ turnSeconds: 45, draftSeconds: null, noLocations: true, middleNodesOnly: false, serverVP: { primary: 12, backup: 20 }, nodeWinVP: 2, mostCircuitsBonusVP: 4, circuitRewards: true, trailingRewards: true });
    expect(withClientRules(own, { appliedAt: 'x', epochId: 7, rules: { serverVP: { primary: 12, backup: 20 }, nodeWinVP: 2, mostCircuitsBonusVP: 4, endGameAwards: DEFAULT_END_GAME_AWARDS, noCircuitRewards: true, noTrailingRewards: false } }))
      .toMatchObject({ circuitRewards: false, trailingRewards: false });
  });
});

describe('sanitizeGameSetup', () => {
  it('defaults Open Circuit mode, 300s Draft, Circuit and trailing rewards off, and Server VP 16/24', () => {
    expect(sanitizeGameSetup(null)).toEqual({
      serverVP: { primary: 16, backup: 24 }, turnSeconds: null, draftSeconds: 300,
      noLocations: false, middleNodesOnly: false, circuitRewards: false, trailingRewards: false,
      mostCircuitsBonusVP: 6, nodeWinVP: 1, endGameAwards: DEFAULT_END_GAME_AWARDS,
    });
    expect([...DRAFT_TIMER_CHOICES]).toEqual([60, 90, 120, 180, 240, 300, 600]);
  });

  it('clamps Server VP, accepts both timers, and drops unknown legacy flags', () => {
    expect(sanitizeGameSetup({ serverVP: { primary: 6.4, backup: -3 }, turnSeconds: 2, cryptoSwap: { enabled: true, cycle: 40 }, midCycleDraw: false })).toEqual({
      serverVP: { primary: 6, backup: 0 }, turnSeconds: null, draftSeconds: 300,
      noLocations: false, middleNodesOnly: false, circuitRewards: false, trailingRewards: false,
      mostCircuitsBonusVP: 6, nodeWinVP: 1, endGameAwards: DEFAULT_END_GAME_AWARDS,
    });
    expect(sanitizeGameSetup({
      serverVP: { primary: 10 }, turnSeconds: 45, draftSeconds: 90, noTrailingRewards: true,
      draftCrypto: true, middleNodesOnly: true, tenCardDraft: true, noActions: true,
      mostCircuitsBonusVP: 99, nodeWinVP: 99, circuitRewards: true,
    })).toEqual({
      serverVP: { primary: 10, backup: 24 }, turnSeconds: 45, draftSeconds: 90,
      noLocations: false, middleNodesOnly: true, circuitRewards: true, trailingRewards: false,
      mostCircuitsBonusVP: 50, nodeWinVP: 50, endGameAwards: DEFAULT_END_GAME_AWARDS,
    });
    expect(sanitizeGameSetup({ draftSeconds: null }).draftSeconds).toBeNull();
    expect(sanitizeGameSetup({ noCircuitRewards: false })).toMatchObject({ circuitRewards: true });
    expect(sanitizeGameSetup(null)).not.toHaveProperty('draftCrypto');
    expect(sanitizeGameSetup(null)).not.toHaveProperty('tenCardDraft');
  });
});
