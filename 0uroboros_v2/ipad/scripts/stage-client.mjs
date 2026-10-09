#!/usr/bin/env node
/**
 * Builds the shippable client, applies the iPad asset limits, and injects the host bridge:
 *   - raster textures larger than 2048 px on a side are downscaled (iPad GPU memory; the board already caps DPR at 1.6)
 *   - the staged app must stay under the App Store's 200 MB cellular budget
 *   - app/index.html loads host-ipad.js before the client bundle
 * Pass the hosted server with VITE_GAME_SERVER_URL (wss://...).
 */
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import sharp from 'sharp';

const MAX_TEXTURE = 2048;
const MAX_APP_MB = 200;
const repo = resolve(import.meta.dirname, '..', '..');
const root = resolve(import.meta.dirname, '..');
const target = join(root, 'app');

if (!process.env.VITE_GAME_SERVER_URL) console.warn('VITE_GAME_SERVER_URL is unset: the iPad build will look for a server on localhost:8787.');
execSync('npm run build:client', { cwd: repo, stdio: 'inherit', env: { ...process.env, VITE_APP_VERSION: process.env.VITE_APP_VERSION ?? 'dev' } });
rmSync(target, { recursive: true, force: true });
cpSync(resolve(repo, 'dist/client'), target, { recursive: true });

// iPad asset limits.
let resized = 0, total = 0;
for (const file of await walk(target)) {
  total += statSync(file).size;
  if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
  const meta = await sharp(file).metadata();
  if (!meta.width || !meta.height || (meta.width <= MAX_TEXTURE && meta.height <= MAX_TEXTURE)) continue;
  const buffer = await sharp(file).resize({ width: MAX_TEXTURE, height: MAX_TEXTURE, fit: 'inside', withoutEnlargement: true }).toFormat(extname(file).slice(1).replace('jpg', 'jpeg')).toBuffer();
  total -= statSync(file).size; writeFileSync(file, buffer); total += buffer.length; resized++;
}
const mb = total / 1048576;
console.log(`iPad assets: ${resized} texture(s) downscaled to <= ${MAX_TEXTURE}px; staged app ${mb.toFixed(1)} MB`);
if (mb > MAX_APP_MB) { console.error(`Staged app exceeds ${MAX_APP_MB} MB.`); process.exit(1); }

// Bridge first, client second.
execSync('npm run bridge', { cwd: root, stdio: 'inherit' });
const index = join(target, 'index.html');
if (!existsSync(join(target, 'host-ipad.js'))) { console.error('host-ipad.js missing.'); process.exit(1); }
writeFileSync(index, readFileSync(index, 'utf8').replace('<script type="module"', '<script src="/host-ipad.js"></script>\n    <script type="module"'));
console.log(`Client staged in ${target}`);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path)); else out.push(path);
  }
  return out;
}
