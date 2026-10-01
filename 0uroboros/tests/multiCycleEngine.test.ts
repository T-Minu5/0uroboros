import { describe, expect, it } from 'vitest';

import { runMultiCycleEngineEvidence } from '../scripts/multi-cycle-engine-evidence';

describe('multi-Cycle engine (boardgame.io Client)', () => {
  it('plays Cycle 1–2 through Draft and starts Cycle 3 runtime', () => {
    const report = runMultiCycleEngineEvidence();
    expect(report.pass, report.notes.join('; ')).toBe(true);
    expect(report.cyclesReached).toBe(3);
    expect(report.phasesObserved.some((p) => p.ctxPhase === 'draft')).toBe(true);
  });
});
