import { describe, expect, it } from 'vitest';
import { sanitizeGameSetup, TURN_TIMER_CHOICES } from '../src/gameSetup';

describe('game setup', () => {
  it('offers turn timers from 35 to 90 seconds in steps of 5', () => {
    expect(TURN_TIMER_CHOICES).toEqual([35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90]);
  });

  it('defaults to 12 VP for a Primary Server, 20 for a Backup and no turn timer', () => {
    expect(sanitizeGameSetup(null)).toEqual({ serverVP: { primary: 12, backup: 20 }, turnSeconds: null });
  });

  it('drops saved values the setup can no longer choose', () => {
    expect(sanitizeGameSetup({ serverVP: { primary: 6.4, backup: -3 }, turnSeconds: 2, cryptoSwap: { enabled: true, cycle: 40 } })).toEqual({ serverVP: { primary: 6, backup: 0 }, turnSeconds: null });
    expect(sanitizeGameSetup({ serverVP: { primary: 10 }, turnSeconds: 45 })).toEqual({ serverVP: { primary: 10, backup: 20 }, turnSeconds: 45 });
  });
});
