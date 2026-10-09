#!/usr/bin/env node
/**
 * Produces the shipped versions of heavy assets from their sources in assets/source.
 *
 *   assets/source/board/backgrounds/*.png  ->  assets/board/backgrounds/*.webp   (lossy WebP; the floors are 2912x1632 photos)
 *   assets/source/models/ouroboros-board-v4.glb -> assets/models/ouroboros-board-v4.glb (meshopt-compressed; decoder ships with three)
 *
 * Idempotent: an output is rebuilt only when its source changed (a sidecar `.source.json` records the source hash).
 * `--check` fails if any output is missing or stale. Run after re-exporting the board from Blender or adding a floor.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, extname, join, resolve } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const check = process.argv.includes('--check');
const FLOOR_SOURCE = resolve(root, 'assets/source/board/backgrounds');
const FLOOR_OUT = resolve(root, 'assets/board/backgrounds');
const FLOOR_QUALITY = 86;
const GLB_SOURCE = resolve(root, 'assets/source/models/ouroboros-board-v4.glb');
const GLB_OUT = resolve(root, 'assets/models/ouroboros-board-v4.glb');

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const mb = n => `${(n / 1048576).toFixed(1)} MB`;
const stampOf = out => `${out}.source.json`;
const current = (out, source, settings) => {
  if (!existsSync(out) || !existsSync(stampOf(out))) return false;
  const stamp = JSON.parse(readFileSync(stampOf(out), 'utf8'));
  return stamp.sha === sha(source) && stamp.settings === settings;
};
const stamp = (out, source, settings) => writeFileSync(stampOf(out), `${JSON.stringify({ source: source.slice(root.length + 1), sha: sha(source), settings }, null, 2)}\n`);

const jobs = [];
for (const name of existsSync(FLOOR_SOURCE) ? readdirSync(FLOOR_SOURCE) : []) {
  if (!/\.(png|jpe?g)$/i.test(name)) continue;
  const source = join(FLOOR_SOURCE, name), out = join(FLOOR_OUT, `${basename(name, extname(name))}.webp`), settings = `webp q${FLOOR_QUALITY}`;
  jobs.push({ source, out, settings, run: async () => { await sharp(source).webp({ quality: FLOOR_QUALITY, effort: 6 }).toFile(out); } });
}
if (existsSync(GLB_SOURCE)) {
  // 16-bit positions: BoardScene sorts authored triangles by world-space thresholds, so vertices must stay within a fraction of a millimetre.
  const settings = 'gltf-transform meshopt medium, position 16 bits';
  jobs.push({ source: GLB_SOURCE, out: GLB_OUT, settings, run: async () => {
    execFileSync('npx', ['--no-install', 'gltf-transform', 'meshopt', GLB_SOURCE, GLB_OUT, '--level', 'medium', '--quantize-position', '16'], { cwd: root, stdio: 'inherit' });
  } });
}

let stale = 0;
for (const job of jobs) {
  const rel = job.out.slice(root.length + 1);
  if (current(job.out, job.source, job.settings)) { console.log(`current  ${rel}`); continue; }
  stale += 1;
  if (check) { console.log(`STALE    ${rel}`); continue; }
  mkdirSync(dirname(job.out), { recursive: true });
  await job.run();
  stamp(job.out, job.source, job.settings);
  console.log(`built    ${rel}  ${mb(statSync(job.source).size)} -> ${mb(statSync(job.out).size)}`);
}
if (check && stale) { console.error(`${stale} optimised asset(s) out of date. Run: npm run assets:optimise`); process.exit(1); }
