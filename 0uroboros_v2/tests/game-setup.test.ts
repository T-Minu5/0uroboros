import { describe, expect, it } from 'vitest';
import { sanitizeGameSetup } from '../src/gameSetup';

describe('sanitizeGameSetup', () => {
  it('defaults to 12 VP for a Primary Server, 16 for a Backup, Eco-Strat most-Circuits bonus 6, trailing rewards always on (no setup field), and no turn timer', () => {
    expect(sanitizeGameSetup(null)).toEqual({ serverVP: { primary: 12, backup: 16 }, turnSeconds: null, noLocations: false, draftCrypto: false, middleNodesOnly: false, tenCardDraft: false, mostCircuitsBonusVP: 6 });
  });

  it('clamps Server VP and drops unknown legacy flags', () => {
    expect(sanitizeGameSetup({ serverVP: { primary: 6.4, backup: -3 }, turnSeconds: 2, cryptoSwap: { enabled: true, cycle: 40 }, midCycleDraw: false })).toEqual({ serverVP: { primary: 6, backup: 0 }, turnSeconds: null, noLocations: false, draftCrypto: false, middleNodesOnly: false, tenCardDraft: false, mostCircuitsBonusVP: 6 });
    expect(sanitizeGameSetup({ serverVP: { primary: 10 }, turnSeconds: 45, noTrailingRewards: false, draftCrypto: true, middleNodesOnly: true, tenCardDraft: true, noActions: true, mostCircuitsBonusVP: 99 })).toEqual({ serverVP: { primary: 10, backup: 16 }, turnSeconds: 45, noLocations: false, draftCrypto: true, middleNodesOnly: true, tenCardDraft: true, mostCircuitsBonusVP: 50 });
  });
});
