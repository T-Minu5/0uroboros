#!/usr/bin/env node
/**
 * Builds the public website: the client build at the root (Play), plus the static pages in `site/` (Download) and the
 * CDN header rules. Output: dist/site. For a domain release set VITE_GAME_SERVER_URL (wss://...). For Hostinger IP
 * playtest leave it unset so the client uses the page host on port 8787.
 *
 *   VITE_GAME_SERVER_URL=wss://api.yourdomain.com npm run build:site
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const out = resolve('dist/site');
if (!process.env.VITE_GAME_SERVER_URL) console.warn('VITE_GAME_SERVER_URL is unset: the site will look for the server on the page host, port 8787.');
execSync('npm run build:client', { stdio: 'inherit', env: { ...process.env, VITE_APP_VERSION: process.env.VITE_APP_VERSION ?? gitVersion() } });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(resolve('dist/client'), out, { recursive: true });
cpSync(resolve('site'), out, { recursive: true });
writeFileSync(resolve(out, 'version.json'), `${JSON.stringify({ version: process.env.VITE_APP_VERSION ?? gitVersion(), builtAt: new Date().toISOString(), server: process.env.VITE_GAME_SERVER_URL ?? null })}\n`);
if (!existsSync(resolve(out, 'index.html')) || !existsSync(resolve(out, 'download/index.html'))) { console.error('Site build is incomplete.'); process.exit(1); }
console.log(`Site built in ${out} (${readFileSync(resolve(out, 'version.json'), 'utf8').trim()})`);

function gitVersion() {
  try { return execSync('git describe --tags --always --dirty', { encoding: 'utf8' }).trim(); } catch { return 'dev'; }
}
