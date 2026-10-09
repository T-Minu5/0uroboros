#!/usr/bin/env node
/**
 * Builds the shippable client in the game repo and copies it into desktop/app, which electron-builder bundles as an
 * extra resource. Pass the hosted server with VITE_GAME_SERVER_URL (wss://...).
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..', '..');
const target = resolve(import.meta.dirname, '..', 'app');
if (!process.env.VITE_GAME_SERVER_URL) console.warn('VITE_GAME_SERVER_URL is unset: the desktop build will look for a server on localhost:8787.');
execSync('npm run build:client', { cwd: repo, stdio: 'inherit', env: { ...process.env, VITE_APP_VERSION: process.env.VITE_APP_VERSION ?? process.env.npm_package_version ?? 'dev' } });
rmSync(target, { recursive: true, force: true });
cpSync(resolve(repo, 'dist/client'), target, { recursive: true });
if (!existsSync(resolve(target, 'index.html'))) { console.error('Client staging failed.'); process.exit(1); }
console.log(`Client staged in ${target}`);
