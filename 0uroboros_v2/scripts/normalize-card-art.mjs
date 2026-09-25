import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artRoot = resolve(root, 'assets/card_art');
const sourcePath = resolve(artRoot, 'cards.json');
const manifestPath = resolve(root, 'docs/generated/CARD_ART_IMPORT.json');
const mappingPath = resolve(root, 'src/cardArtwork.json');
const placeholder = '/assets/card_art/image_placeHolder.png';
const check = process.argv.includes('--check');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
if (!Array.isArray(source.cards)) throw new Error('Expected a cards array in assets/card_art/cards.json');
if (source.cardCount !== source.cards.length) throw new Error('Source cardCount does not match cards array');
const beforeMechanics = JSON.stringify(source.cards.map(({ artwork, ...rest }) => rest));
const files = readdirSync(artRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(png|jpe?g|webp|gif|avif)$/i.test(entry.name))
  .map(entry => relative(artRoot, resolve(entry.parentPath, entry.name)).split('\\').join('/')).sort();
const fileSet = new Set(files);
if (!fileSet.has('image_placeHolder.png')) throw new Error('Exact required root placeholder is missing');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const previousCards = new Map((previous?.cards ?? []).map(card => [card.id, card]));
const seenIds = new Set(), seenNames = new Set();
const byId = {}, byName = {}, cards = [];

function resolveArtwork(input) {
  if (typeof input !== 'string' || !input.trim()) return { artwork: placeholder, status: 'missing', reason: 'No artwork reference supplied', candidates: [] };
  const normalized = input.replaceAll('\\', '/');
  let suffix;
  if (normalized.startsWith('/assets/card_art/')) suffix = normalized.slice('/assets/card_art/'.length);
  else if (normalized.includes('/cards/')) suffix = normalized.slice(normalized.indexOf('/cards/') + '/cards/'.length);
  else suffix = normalized.replace(/^\/+/, '');
  if (suffix.split('/').includes('..')) return { artwork: placeholder, status: 'missing', reason: 'Unsafe parent path in artwork reference', candidates: [] };
  const category = suffix.split('/')[0];
  const preferred = ['action', 'utility'].includes(category)
    ? `base cards/${suffix}`
    : category === 'attack'
      ? `chaos cards/${suffix}`
      : category === 'power'
        ? `chaos cards/hackers/${posix.basename(suffix)}`
        : suffix;
  const groups = [
    { mode: 'exact-preferred', matches: fileSet.has(preferred) ? [preferred] : [] },
    { mode: 'case-corrected-preferred', matches: files.filter(file => file.toLowerCase() === preferred.toLowerCase()) },
    { mode: 'unique-suffix', matches: files.filter(file => file === suffix || file.endsWith(`/${suffix}`)) },
    { mode: 'case-corrected-suffix', matches: files.filter(file => file.toLowerCase() === suffix.toLowerCase() || file.toLowerCase().endsWith(`/${suffix.toLowerCase()}`)) },
    { mode: 'unique-filename', matches: files.filter(file => posix.basename(file) === posix.basename(suffix)) },
  ];
  for (const { mode, matches } of groups) {
    if (!matches.length) continue;
    if (matches.length > 1) return { artwork: placeholder, status: 'ambiguous', reason: mode, candidates: matches };
    return { artwork: `/assets/card_art/${matches[0]}`, status: matches[0] === 'image_placeHolder.png' ? 'placeholder' : 'resolved', reason: mode, candidates: matches };
  }
  return { artwork: placeholder, status: 'missing', reason: 'No matching supplied image', candidates: [] };
}

for (const card of source.cards) {
  if (seenIds.has(card.id) || seenNames.has(card.name)) throw new Error(`Duplicate source id or name: ${card.id} / ${card.name}`);
  seenIds.add(card.id); seenNames.add(card.name);
  const prior = previousCards.get(card.id);
  // Keep original provenance across reruns; a user-edited reference replaces it.
  const originalArtwork = prior && card.artwork === prior.artwork ? prior.originalArtwork : card.artwork;
  const result = resolveArtwork(originalArtwork);
  cards.push({ id: card.id, name: card.name, originalArtwork, ...result });
  card.artwork = result.artwork;
  byId[card.id] = result.artwork;
  byName[card.name] = result.artwork;
}
if (JSON.stringify(source.cards.map(({ artwork, ...rest }) => rest)) !== beforeMechanics) throw new Error('Non-artwork card data changed');
const manifest = {
  schemaVersion: 1,
  source: 'assets/card_art/cards.json',
  mapping: 'src/cardArtwork.json',
  policy: 'Artwork paths only. Exact category folder first, then unique supplied suffix/filename. No mechanics or video changes; no video use.',
  placeholder,
  cardCount: cards.length,
  preservedCardDataSha256: createHash('sha256').update(beforeMechanics).digest('hex'),
  counts: Object.fromEntries(['resolved', 'missing', 'ambiguous', 'placeholder'].map(status => [status, cards.filter(card => card.status === status).length])),
  issues: cards.filter(card => ['missing', 'ambiguous'].includes(card.status)),
  cards,
};
const outputs = [[sourcePath, json(source)], [mappingPath, json({ placeholder, byId, byName })], [manifestPath, json(manifest)]];
const stale = outputs.filter(([path, content]) => !existsSync(path) || readFileSync(path, 'utf8') !== content);
if (check && stale.length) {
  console.error(`Normalization outputs are stale: ${stale.map(([path]) => relative(root, path)).join(', ')}`);
  process.exitCode = 1;
} else if (!check) for (const [path, content] of stale) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
console.log(JSON.stringify({ check, cardCount: cards.length, ...manifest.counts, issues: manifest.issues.map(({ id, reason, candidates }) => ({ id, reason, candidates })) }, null, 2));
