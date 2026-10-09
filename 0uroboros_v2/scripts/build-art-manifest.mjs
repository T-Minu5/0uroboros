#!/usr/bin/env node
/**
 * Builds packages/content/art-manifest.json: the exact list of asset files the game client ships.
 *
 * Sources of truth:
 *   - content/authored-content.json: artwork of every enabled card (via its `art`, else the cardArtwork.json
 *     id/name mapping, else the placeholder) and the depth maps generated for that artwork.
 *   - client source (src/, minus the Content Studio and studio-only panels): literal `/assets/...` paths.
 *   - a few folder rules for templated references: Icons (`icon-${name}.svg`), card backs (SVG glob).
 *   - card video clips named after a shipped card (see src/cardVideos.ts).
 *
 * `--check` regenerates in memory and fails if the committed manifest differs, so a new asset reference
 * cannot reach a client build without being listed. Everything not in the manifest stays with the studio.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const check = process.argv.includes('--check');
const MANIFEST = resolve(root, 'packages/content/art-manifest.json');
const STUDIO_ONLY = new Set(['src/AgentsPanel.tsx', 'src/TestGamesPanel.tsx', 'src/AgentReader.tsx', 'src/AgentsPage.tsx', 'src/devGameLog.ts', 'src/agentsApi.ts', 'src/studio.tsx', 'src/agents.tsx']);

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const nameKey = name => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { if (n.startsWith('.')) continue; const p = join(dir, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const rel = p => relative(root, p).split('\\').join('/');
const files = new Set();
const missing = [];
const add = (path, why) => {
  const clean = decodeURIComponent(path).replace(/^\/+/, '');
  if (!clean.startsWith('assets/')) return;
  const abs = resolve(root, clean);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    // Vite's publicDir (public/assets/...) is copied by Vite itself and is not part of the manifest.
    if (existsSync(resolve(root, 'public', clean))) return;
    missing.push(`${clean} (${why})`); return;
  }
  files.add(clean);
};

// 1. Card artwork for the content pack.
const saved = readJson(resolve(root, 'content/authored-content.json'));
const pack = saved.document ?? saved;
const artwork = readJson(resolve(root, 'packages/engine/src/cardArtwork.json'));
const byName = new Map(Object.entries(artwork.byName).map(([name, path]) => [nameKey(name), path]));
const artOf = card => card.art || artwork.byId[card.definitionId ?? card.id] || byName.get(nameKey(card.name)) || artwork.placeholder;
const cards = (pack.cards ?? []).filter(card => card.enabled !== false);
if (!cards.length) { console.error('No enabled cards found in content/authored-content.json'); process.exit(1); }
const shippedArt = new Set();
for (const card of cards) { const art = artOf(card); shippedArt.add(art); add(art, `card ${card.name}`); }
add(artwork.placeholder, 'placeholder');

// 2. Depth maps for shipped artwork.
const depthManifestPath = resolve(root, 'assets/card_art/depth/manifest.json');
if (existsSync(depthManifestPath)) {
  add(rel(depthManifestPath), 'depth manifest');
  const depth = readJson(depthManifestPath);
  for (const [art, entry] of Object.entries(depth.entries ?? {})) {
    if (!shippedArt.has(art)) continue;
    if (entry.color) add(entry.color, `depth colour for ${art}`);
    if (entry.depth) add(entry.depth, `depth map for ${art}`);
  }
}

// 3. Literal references in client source.
const clientFiles = walk(resolve(root, 'src')).filter(p => /\.(ts|tsx|css)$/.test(p)).filter(p => { const r = rel(p); return !r.startsWith('src/authoring/') && !STUDIO_ONLY.has(r); });
const clientSource = clientFiles.map(file => readFileSync(file, 'utf8'));
clientFiles.forEach((file, i) => {
  for (const m of clientSource[i].matchAll(/['"`(]\/?(assets\/[^'"`()$*?{}]+\.[a-z0-9]{2,5})/gi)) add(m[1], rel(file));
});

// 4. Folder rules for templated references: Icons (`icon-${name}.svg`) and card backs (named by file in CARD_BACKS).
for (const p of walk(resolve(root, 'assets/Icons'))) if (p.endsWith('.svg')) add(rel(p), 'Icon component template');
for (const p of walk(resolve(root, 'assets/card_art/card backs'))) {
  const name = p.slice(p.lastIndexOf('/') + 1);
  if (p.endsWith('.svg') && clientSource.some(text => text.includes(`'${name}'`))) add(rel(p), 'card back');
}

// 5. Card video clips named after shipped cards (plain name = inspect clip, `_onFX*` = effect clip).
const cardKeys = new Set(cards.flatMap(card => [nameKey(card.name), ...(card.definitionId ? [nameKey(card.definitionId)] : [])]));
const videosRoot = resolve(root, 'assets/videos');
if (existsSync(videosRoot)) for (const p of walk(videosRoot)) {
  if (!/\.mp4$/i.test(p) || rel(p).startsWith('assets/videos/Board/')) continue;
  const stem = p.slice(p.lastIndexOf('/') + 1).replace(/\.mp4$/i, '');
  const key = nameKey(stem.replace(/_onfx\d*$/i, ''));
  if (cardKeys.has(key)) add(rel(p), `clip for ${stem}`);
}

if (missing.length) { console.error(`Referenced assets that do not exist:\n  ${missing.join('\n  ')}`); process.exit(1); }

const list = [...files].sort();
const bytes = list.reduce((sum, f) => sum + statSync(resolve(root, f)).size, 0);
const manifest = { packRevision: saved.revision ?? null, files: list };
const json = `${JSON.stringify(manifest, null, 2)}\n`;
const mb = n => `${(n / 1048576).toFixed(1)} MB`;
if (check) {
  const current = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : '';
  if (current !== json) { console.error(`art-manifest.json is out of date (${list.length} files, ${mb(bytes)}). Run: npm run assets:manifest`); process.exit(1); }
  console.log(`art-manifest.json is current: ${list.length} files, ${mb(bytes)}.`);
} else {
  writeFileSync(MANIFEST, json);
  console.log(`Wrote ${rel(MANIFEST)}: ${list.length} files, ${mb(bytes)}.`);
}
