import { describe, expect, it } from 'vitest';
import { DISC_COUNT, advanceDiscPhases, discAt, discScale } from '../src/pulseOrigami';

describe('Pulse Origami discs', () => {
  it('fills the whole tube with evenly spaced discs', () => {
    expect(DISC_COUNT).toBeGreaterThanOrEqual(35);
    expect(discAt(0)).toBeGreaterThan(0);
    expect(discAt(DISC_COUNT - 1)).toBeLessThan(1);
    expect(discAt(0)).toBeCloseTo(1 - discAt(DISC_COUNT - 1), 9);
  });

  it('only advances discs inside the powered part of the tube', () => {
    const phases = new Float32Array(DISC_COUNT);
    advanceDiscPhases(phases, .5, true, .1);
    phases.forEach((phase, i) => expect(phase).toBeCloseTo(discAt(i) < .5 ? .1 : 0, 6));
  });

  it('freezes drained discs and resumes them from the same phase when restored', () => {
    const phases = new Float32Array(DISC_COUNT);
    const last = DISC_COUNT - 1;
    advanceDiscPhases(phases, 1, true, 3.3);
    const frozen = phases[last], scale = discScale(frozen, last);
    for (let k = 0; k < 20; k++) advanceDiscPhases(phases, .2, true, .1);
    expect(phases[last]).toBe(frozen);
    expect(discScale(phases[last], last)).toBe(scale);
    advanceDiscPhases(phases, 1, true, .1);
    expect(phases[last]).toBeCloseTo(frozen + .1, 6);
  });

  it('holds every disc while the board is unpowered', () => {
    const phases = new Float32Array(DISC_COUNT);
    advanceDiscPhases(phases, 1, false, 1);
    expect(phases.every(phase => phase === 0)).toBe(true);
  });

  it('pulses between full size and the squeezed radius after its stagger', () => {
    expect(discScale(0, 3)).toBe(1);
    expect(discScale(3 * .25 + 1, 3)).toBeCloseTo(.3, 6);
    expect(discScale(3 * .25 + 2, 3)).toBeCloseTo(1, 6);
  });
});
