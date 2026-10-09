#!/usr/bin/env node
/**
 * Verifies a `build:client` output: no studio chunks, and reports the shipped size so CI can track it.
 * Usage: node scripts/check-client-bundle.mjs [dist/client]
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const out = process.argv[2] ?? 'dist/client';
const FORBIDDEN = /AuthoringApp|AgentsPanel|TestGamesPanel|AgentsPage|AgentReader|devGameLog|contentApi|depthPipeline|agents\//i;
let total = 0; const offenders = []; const byKind = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    total += s.size;
    const r = relative(out, p);
    const kind = r.startsWith('assets/') && !/\.(js|css)$/.test(r) ? r.split('/')[1] ?? 'assets' : (r.match(/\.(\w+)$/)?.[1] ?? 'other');
    byKind[kind] = (byKind[kind] ?? 0) + s.size;
    if (/\.js$/.test(r) && FORBIDDEN.test(r)) offenders.push(r);
  }
})(out);
const mb = n => `${(n / 1048576).toFixed(1)} MB`;
console.log(`Client bundle ${out}: ${mb(total)} total`);
for (const [kind, size] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${kind.padEnd(14)} ${mb(size)}`);
if (offenders.length) { console.error(`Studio code leaked into the client bundle:\n  ${offenders.join('\n  ')}`); process.exit(1); }
console.log('No studio chunks in the client bundle.');
