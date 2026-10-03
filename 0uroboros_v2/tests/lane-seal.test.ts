import { describe, expect, it } from 'vitest';
import { SEAL_SLIDE_S, SINK_OPACITY, laneSinkOverlay } from '../src/laneSeal';

/** First time, in seconds, at which the overlay reports the plate has covered it. */
function coveredTime(side: number, neon: boolean) {
  for (let t = 0; t <= SEAL_SLIDE_S + .01; t += .005) if (laneSinkOverlay(side, t, neon).covered) return t;
  return Infinity;
}

describe('lane sink overlay', () => {
  it('starts clear and reaches full darkness once covered', () => {
    for (const neon of [false, true]) for (const side of [0, 1]) {
      expect(laneSinkOverlay(side, 0, neon).opacity).toBe(0);
      const end = laneSinkOverlay(side, SEAL_SLIDE_S, neon);
      expect(end.covered).toBe(true);
      expect(end.opacity).toBeCloseTo(SINK_OPACITY);
    }
  });

  it('keeps the Neon layer until the plate has crossed the whole lane, later than the Classic pattern', () => {
    for (const side of [0, 1]) {
      const classic = coveredTime(side, false), neon = coveredTime(side, true);
      expect(neon).toBeGreaterThan(classic);
      expect(laneSinkOverlay(side, classic, true).covered).toBe(false);
      expect(laneSinkOverlay(side, classic, true).opacity).toBeLessThan(SINK_OPACITY);
      expect(neon).toBeLessThanOrEqual(SEAL_SLIDE_S + .005);
    }
  });

  it('darkens steadily while the plate slides', () => {
    for (const side of [0, 1]) {
      let last = -1;
      for (let t = 0; t <= SEAL_SLIDE_S; t += .05) {
        const { opacity } = laneSinkOverlay(side, t, true);
        expect(opacity).toBeGreaterThanOrEqual(last);
        last = opacity;
      }
    }
  });
});
