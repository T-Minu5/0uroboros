import { describe, expect, it } from 'vitest';
import { springSettled, stepSpring, type Spring2D } from '../src/cardSpring';

const run = (spring: Spring2D, target: { x: number; y: number }, ms: number, frameMs = 16) => {
  const path: Spring2D[] = [];
  for (let t = 0; t < ms; t += frameMs) path.push(spring = stepSpring(spring, target, frameMs));
  return path;
};

describe('release spring', () => {
  it('lands a dropped card in its slot within the flight time, with a soft overshoot', () => {
    const path = run({ x: 0, y: 0, vx: 0, vy: 0 }, { x: 400, y: 0 }, 440);
    const peak = Math.max(...path.map(state => state.x));
    expect(peak).toBeGreaterThan(400);
    expect(peak).toBeLessThan(440);
    expect(Math.abs(path.at(-1)!.x - 400)).toBeLessThan(3);
  });

  it('carries the drop momentum before turning toward the target', () => {
    const [first] = run({ x: 0, y: 0, vx: 0, vy: -2 }, { x: 300, y: 0 }, 16);
    expect(first!.y).toBeLessThan(0);
  });

  it('behaves the same at 60 Hz and 120 Hz', () => {
    const at60 = run({ x: 0, y: 0, vx: 1, vy: 0 }, { x: 250, y: 120 }, 320, 16).at(-1)!;
    const at120 = run({ x: 0, y: 0, vx: 1, vy: 0 }, { x: 250, y: 120 }, 320, 8).at(-1)!;
    expect(Math.abs(at60.x - at120.x)).toBeLessThan(1);
    expect(Math.abs(at60.y - at120.y)).toBeLessThan(1);
  });

  it('comes to rest', () => {
    expect(springSettled(run({ x: 0, y: 0, vx: 3, vy: 0 }, { x: 100, y: 50 }, 900).at(-1)!, { x: 100, y: 50 })).toBe(true);
  });
});
