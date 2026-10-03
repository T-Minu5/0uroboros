import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAR_PAINT_COLORS, CAR_PAINT_SLIDERS, DEFAULT_CAR_PAINT, clampCarPaint } from '../src/neonCarPaint';

describe('car paint settings', () => {
  it('has a colour picker or a slider for every setting, each factory value inside its range', () => {
    expect([...CAR_PAINT_COLORS, ...CAR_PAINT_SLIDERS].map(s => s.key).sort()).toEqual(Object.keys(DEFAULT_CAR_PAINT).sort());
    for (const s of CAR_PAINT_SLIDERS) {
      expect(DEFAULT_CAR_PAINT[s.key]).toBeGreaterThanOrEqual(s.min);
      expect(DEFAULT_CAR_PAINT[s.key]).toBeLessThanOrEqual(s.max);
    }
  });

  it('clamps saved values to their sliders and keeps the defaults for anything invalid', () => {
    expect(clampCarPaint({ color: '#FF8800', pearlColor: '#00AAFF', brightness: 4, flakes: -1, roughness: 'shiny', reflections: Number.NaN })).toEqual({
      ...DEFAULT_CAR_PAINT, color: '#ff8800', pearlColor: '#00aaff', brightness: 1, flakes: 0,
    });
    expect(clampCarPaint({ color: 'red', flakeColor: 7 })).toEqual(DEFAULT_CAR_PAINT);
    expect(clampCarPaint(null)).toEqual(DEFAULT_CAR_PAINT);
  });
});

describe('saved car paint look', () => {
  const stubStorage = (store: Map<string, string>) =>
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('keeps the live paint as the saved look and starts from it on the next load', async () => {
    const store = new Map<string, string>();
    stubStorage(store);
    const paint = await import('../src/neonCarPaint');
    expect(paint.carPaintDefaults).toEqual(DEFAULT_CAR_PAINT);
    paint.setCarPaint({ color: '#112233', metallic: .2 });
    expect(paint.sameCarPaint(paint.carPaint, paint.carPaintDefaults)).toBe(false);
    paint.saveCarPaintDefaults();
    expect(paint.carPaintDefaults).toMatchObject({ color: '#112233', metallic: .2 });

    store.delete('ouroboros.carPaint.v2');
    vi.resetModules();
    const reloaded = await import('../src/neonCarPaint');
    expect(reloaded.carPaintDefaults).toMatchObject({ color: '#112233', metallic: .2 });
    expect(reloaded.carPaint).toEqual(reloaded.carPaintDefaults);
  });
});
