import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_SIDE_TILT, MAX_VERTICAL_TILT, restingTilt, sampleVelocity, stepTilt, tiltEye, tiltSettled, tiltTarget } from '../src/depthArt/dragTilt';
import { coverCrop, stepEye, viewUniforms } from '../src/depthArt/DepthArtRenderer';
import { servedArtPath } from '../src/depthArt/depthManifest';
import manifest from '../assets/card_art/depth/manifest.json';
import { createDepthApi } from '../server/depthApi';
import { artFile, depthPaths, documentArt, loadManifest } from '../server/depthPipeline';

describe('art eye spring', () => {
  const run = (target: { x: number; y: number }, ms: number) => {
    let state = { eye: { x: 0, y: 0 }, speed: { x: 0, y: 0 } };
    const path: number[] = [];
    for (let t = 0; t < ms; t += 16) { state = stepEye(state.eye, state.speed, target, 16); path.push(state.eye.x); }
    return path;
  };

  it('trails the card lean, then overshoots and settles', () => {
    const path = run({ x: 0.6, y: 0 }, 1200);
    expect(path[3]).toBeLessThan(0.3);
    expect(Math.max(...path)).toBeGreaterThan(0.65);
    expect(Math.abs(path.at(-1)! - 0.6)).toBeLessThan(0.01);
  });

  it('never leaves the range the crop covers', () => {
    expect(Math.max(...run({ x: 1, y: 0 }, 1200))).toBeLessThanOrEqual(1);
  });
});

describe('drag tilt', () => {
  it('leans into the motion and clamps', () => {
    expect(tiltTarget(0.5, 0).ry).toBeGreaterThan(0);
    expect(tiltTarget(0, 0.5).rx).toBeLessThan(0);
    expect(tiltTarget(100, -100)).toMatchObject({ rx: MAX_VERTICAL_TILT, ry: MAX_SIDE_TILT });
  });

  it('leans an extra quarter for up/down motion over side-to-side', () => {
    expect(-tiltTarget(0, 0.3).rx / tiltTarget(0.3, 0).ry).toBeCloseTo(1.25);
    expect(MAX_VERTICAL_TILT / MAX_SIDE_TILT).toBeCloseTo(1.25);
  });

  it('swings clockwise in the plane when moving right, counter-clockwise when moving left', () => {
    expect(tiltTarget(0.5, 0).rz).toBeGreaterThan(0);
    expect(tiltTarget(-0.5, 0).rz).toBeLessThan(0);
    expect(tiltTarget(0, 0.5).rz).toBe(0);
  });

  it('springs back flat once the pointer stops', () => {
    let tilt = sampleVelocity(restingTilt(), 40, 0, 16);
    for (let i = 0; i < 10; i++) tilt = stepTilt(tilt, 16);
    expect(tilt.ry).toBeGreaterThan(1);
    for (let i = 0; i < 120; i++) tilt = stepTilt(tilt, 16);
    expect(tiltSettled(tilt)).toBe(true);
  });

  it('turns the art against the card', () => {
    expect(tiltEye({ rx: 0, ry: MAX_SIDE_TILT }).x).toBe(1);
    expect(tiltEye({ rx: -MAX_VERTICAL_TILT, ry: 0 }).y).toBe(1);
  });
});

describe('parallax uniforms', () => {
  it('crops to cover the window', () => {
    expect(coverCrop(4 / 3, 4 / 3)).toEqual({ sx: 1, sy: 1 });
    expect(coverCrop(1, 4 / 3).sx).toBeCloseTo(0.75);
    expect(coverCrop(2, 4 / 3).sy).toBeCloseTo(2 / 3);
  });

  it('never samples past the edge of the image at full travel', () => {
    for (const aspect of [4 / 3, 0.9, 1.8]) for (const focus of [0.1, 0.5, 0.9]) for (const eye of [{ x: 1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 1 }]) for (const gain of [1, 1.25]) {
      const { crop, shift } = viewUniforms(aspect, { width: 400, height: 300, focus }, 3.25, eye, gain);
      const travel = Math.max(focus, 1 - focus);
      expect(0.5 + crop[0] / 2 + Math.abs(shift[0]) * travel).toBeLessThanOrEqual(1.0001);
      expect(0.5 + crop[1] / 2 + Math.abs(shift[1]) * travel).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('served art', () => {
  it('serves the WebP colour image when one exists, otherwise the source', () => {
    expect(servedArtPath('/assets/card_art/not-real.png')).toBe('/assets/card_art/not-real.png');
    const [src, entry] = Object.entries((manifest as { entries: Record<string, { color: string }> }).entries)[0] ?? [];
    if (src) expect(servedArtPath(src)).toBe(entry!.color);
  });
});

describe('depth pipeline', () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); });

  it('collects every art path from a document', () => {
    expect(documentArt({ cards: [{ art: '/a.png', nested: { art: '/b.png' } }, { art: '/a.png' }] }).sort()).toEqual(['/a.png', '/b.png']);
  });

  it('only resolves files inside the card art folder', () => {
    const paths = depthPaths('/project');
    expect(artFile(paths, '/assets/card_art/base%20cards/x.png')).toBe('/project/assets/card_art/base cards/x.png');
    expect(artFile(paths, '/assets/card_art/../models/x.glb')).toBeNull();
    expect(artFile(paths, '/assets/card_art/depth/x.color.webp')).toBeNull();
  });

  it('generates depth once after a save and skips art that is already current', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ouroboros-depth-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const paths = depthPaths(root);
    await mkdir(join(paths.cardArt, 'uploads'), { recursive: true });
    await writeFile(join(paths.cardArt, 'uploads', 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]));
    const runs: string[] = [];
    const worker = {
      async run(src: string, color: string, depth: string) {
        runs.push(src);
        await mkdir(paths.depthDir, { recursive: true });
        await writeFile(color, 'c'); await writeFile(depth, 'd');
        return { id: '1', ok: true, width: 400, height: 300, focus: 0.4 };
      },
      stop() {},
    };
    const api = createDepthApi({ paths, worker, log: () => {} });
    const document = { cards: [{ art: '/assets/card_art/uploads/hero.png' }, { art: '/assets/card_art/uploads/missing.png' }] };
    expect(await api.enqueue(document)).toEqual(['/assets/card_art/uploads/hero.png']);
    await api.idle();
    expect(runs).toHaveLength(1);
    const saved = await loadManifest(paths);
    const entry = saved.entries['/assets/card_art/uploads/hero.png']!;
    expect(entry.color).toMatch(/^\/assets\/card_art\/depth\/[0-9a-f]{20}-v\d+\.color\.webp$/);
    expect(api.jobs.get('/assets/card_art/uploads/hero.png')?.status).toBe('ready');
    expect(await api.enqueue(document)).toEqual([]);
    expect(JSON.parse(await readFile(paths.manifest, 'utf8')).entries).toHaveProperty(['/assets/card_art/uploads/hero.png']);
  });
});
