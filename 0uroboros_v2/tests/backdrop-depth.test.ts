import { describe, expect, it } from 'vitest';
import { luminanceFromRgba, reliefFromLuminance } from '../src/backdropDepth';

describe('backdrop relief depth', () => {
  const w = 160, h = 90;

  it('reads bright forms as near and stretches to the full 0..1 range', () => {
    const lum = new Float32Array(w * h).fill(.1);
    for (let y = 30; y < 60; y++) for (let x = 60; x < 100; x++) lum[y * w + x] = .9;
    const relief = reliefFromLuminance(lum, w, h);
    expect(relief[45 * w + 80]).toBeGreaterThan(.9);
    expect(relief[5 * w + 5]).toBeLessThan(.1);
    expect(Math.min(...relief)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...relief)).toBeLessThanOrEqual(1);
  });

  it('smooths pixel noise so the depth band traces shapes, not speckle', () => {
    let seed = 7;
    const noise = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const lum = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lum[y * w + x] = (x > 40 && x < 120 ? .7 : .2) + (noise() - .5) * .3;
    const relief = reliefFromLuminance(lum, w, h);
    const row = 20 * w;
    const steps = Array.from({ length: w - 1 }, (_, x) => Math.abs(relief[row + x + 1] - relief[row + x]));
    expect(Math.max(...steps)).toBeLessThan(.2);
  });

  it('converts RGBA bytes to gamma-lifted luminance', () => {
    const lum = luminanceFromRgba(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    expect(lum[0]).toBeCloseTo(1);
    expect(lum[1]).toBe(0);
  });
});
