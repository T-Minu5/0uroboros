import { describe, expect, it } from 'vitest';
import { sanitizeGameSetup } from '../src/gameSetup';

describe('sanitizeGameSetup', () => {
  it('defaults timers Off, trailing rewards on, and Eco-Strat VP defaults', () => {
    expect(sanitizeGameSetup(null)).toEqual({
      serverVP: { primary: 12, backup: 16 }, turnSeconds: null, draftSeconds: null,
      noLocations: false, middleNodesOnly: false, trailingRewards: true,
      mostCircuitsBonusVP: 6, nodeWinVP: 1,
    });
  });

  it('clamps Server VP, accepts both timers, and drops unknown legacy flags', () => {
    expect(sanitizeGameSetup({ serverVP: { primary: 6.4, backup: -3 }, turnSeconds: 2, cryptoSwap: { enabled: true, cycle: 40 }, midCycleDraw: false })).toEqual({
      serverVP: { primary: 6, backup: 0 }, turnSeconds: null, draftSeconds: null,
      noLocations: false, middleNodesOnly: false, trailingRewards: true,
      mostCircuitsBonusVP: 6, nodeWinVP: 1,
    });
    expect(sanitizeGameSetup({
      serverVP: { primary: 10 }, turnSeconds: 45, draftSeconds: 90, noTrailingRewards: true,
      draftCrypto: true, middleNodesOnly: true, tenCardDraft: true, noActions: true,
      mostCircuitsBonusVP: 99, nodeWinVP: 99,
    })).toEqual({
      serverVP: { primary: 10, backup: 16 }, turnSeconds: 45, draftSeconds: 90,
      noLocations: false, middleNodesOnly: true, trailingRewards: false,
      mostCircuitsBonusVP: 50, nodeWinVP: 50,
    });
    expect(sanitizeGameSetup(null)).not.toHaveProperty('draftCrypto');
    expect(sanitizeGameSetup(null)).not.toHaveProperty('tenCardDraft');
  });
});
