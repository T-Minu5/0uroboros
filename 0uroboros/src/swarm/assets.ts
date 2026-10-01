import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

import {
  FirstPartyAssetRecordSchema,
  type FirstPartyAssetRecord,
  type FirstPartyAssetType,
} from './contracts';

export const MAX_PACKET_ASSETS = 8;
export const MAX_PACKET_ICONS = 8;
export const MAX_PACKET_STATS_UI = 3;

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.PNG']);

const BASE_NAME_SEEDS = [
  'Atomic Unit',
  'Atomic Mass',
  'Thorn Shadow',
  'Dash-Dot',
  'Slash-Dot',
  'The Inbetweener',
  'Wave Card',
  'Particle Card',
  'Dotkrawler',
  'Quantum Telemetry',
  'Byte Drone',
  'Recursive Seance',
  'Cowl Obscyra',
  'Infernal Kernel',
  'The Tesseract Magi',
  'Root Rune',
  'Astra Ascii',
  'The Shiva of CERN',
  'Night Scythe',
  'Super-positioning',
  'Summon the Acolytes',
  'Temporal Rift',
  'Ghost Key',
  'Banishing Ritual',
  'Opulent Void',
  'Sacrificial Sigil',
  'The Heisenberg Hag',
  'Byte Heist',
  'Cypto Alchemist',
  'Crypto Alchemist',
  'Code Sniper',
  'Kilo Cycle',
  'Entropic Infantry',
  'Chronos Cache',
  'Merchant of Chaos',
  'Alpha Team',
  'Bravo Team',
  'Charlie Team',
];

const CHAOS_NAME_SEEDS = [
  'Nyx Luna',
  'Rezz Razor',
  'Rezz-Razor',
  'Rezz Blade',
  'Rezz-Blade',
  'Invocation of the Sword',
  'Bushido.io',
  'Bloodlet Drone',
  'H3x1-D3x1',
  '1337 Speaker',
  'Glitch-Witch.exe',
  'The Qubit Kid',
  'Chrome Mitchell',
  'Mary Mallon',
  'Mary Malice',
  'Mary Malware',
  'Typhoid Mary',
  '∆-Wave',
  'Delta-Wave',
  'System Seppuku',
  'Sudo Demiurge',
  'Cicada 3301',
  'Skinwalker',
  'Leviathan Form',
  'Spider Form',
  'Wasp Form',
  'Viper Form',
  'Wolf Form',
  'Subroutine Succubus',
  'Iterative Incubus',
  'Node Feratu',
  'The Azimuthal Kill',
  'Tihkal Hound',
  'Veil of Cthulhu',
  'Razor Blade Jade',
  'Dit Bot',
  'The Owl King',
];

const STARTER_NAMES = [
  'Slash-Dot',
  'Dash-Dot',
  'Dotkrawler',
  'Rezz-Razor',
  'Rezz-Blade',
  'Vault Encryption',
  'Byte-Coin',
  'Kilo-Coin',
];

const FILENAME_ALIASES: Record<string, string> = {
  'sacrifical-sigil': 'Sacrificial Sigil',
  'quantum-telementry': 'Quantum Telemetry',
  'crypto-alchemist': 'Crypto Alchemist',
  'shiva-of-cern': 'The Shiva of CERN',
  'superpositioning': 'Super-positioning',
  'delta-wave': '∆-Wave',
  'glitch-witch': 'Glitch-Witch.exe',
  'qubit-kid': 'The Qubit Kid',
  'bushido-io': 'Bushido.io',
  'h3x1-d3x1': 'H3x1-D3x1',
  '1337-speaker': '1337 Speaker',
  'rezz-razor': 'Rezz-Razor',
  'rezz-blade': 'Rezz-Blade',
};

export const CERTAIN_ICON_SYSTEMS: Record<string, string> = {
  'icon-priority': 'priority',
  'icon-action': 'Actions',
  'icon-crypto': 'Crypto',
  'icon-database': 'Data Centers',
  'icon-deck': 'deck',
  'icon-discard': 'discard',
  'icon-hand': 'hand',
  'icon-power': 'power',
};

const ICON_SYSTEMS = CERTAIN_ICON_SYSTEMS;

const KNOWN_NAMES = [...BASE_NAME_SEEDS, ...CHAOS_NAME_SEEDS, ...STARTER_NAMES];

let cached: FirstPartyAssetRecord[] | null = null;
let cachedRoot: string | null = null;

export function resolveAssetsRoot(cwd: string = process.cwd()): string {
  const candidates = [resolve(cwd, 'assets'), resolve(cwd, '..', 'assets')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && existsSync(join(candidate, 'card_art'))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

export function resetAssetInventoryCache(): void {
  cached = null;
  cachedRoot = null;
}

export function inventoryFirstPartyAssets(cwd: string = process.cwd()): FirstPartyAssetRecord[] {
  const root = resolveAssetsRoot(cwd);
  if (cached && cachedRoot === root) return cached;
  const records: FirstPartyAssetRecord[] = [];
  walk(root, root, records);
  cached = records;
  cachedRoot = root;
  return records;
}

const QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'for',
  'of',
  'and',
  'or',
  'to',
  'in',
  'on',
  'with',
  'using',
  'our',
  'from',
  'into',
  'how',
  'what',
  'is',
  'are',
  'be',
  'this',
  'that',
  'under',
  'where',
  'when',
  'should',
  'must',
  'not',
  'do',
  'does',
  'create',
  'develop',
  'explore',
  'existing',
  'first-party',
  'direction',
  'treatment',
  'references',
  'reference',
  'relevant',
  'card',
  'cards',
  'character',
  'art',
  'artwork',
  'game',
  'visual',
  'visually',
  'animation',
  'communicate',
  'revealed',
  'triggers',
  'board',
  'polish',
  'assets',
]);

export function queryFirstPartyAssets(
  assets: FirstPartyAssetRecord[],
  options: { query?: string; types?: FirstPartyAssetType[]; maxResults?: number } = {},
): FirstPartyAssetRecord[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const types = options.types ?? [];
  const maxResults = options.maxResults ?? MAX_PACKET_ASSETS;
  const tokens = query
    .split(/[^a-z0-9∆-]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 3 && !QUERY_STOPWORDS.has(token));
  return assets
    .filter((asset) => {
      if (types.length > 0 && !types.includes(asset.asset_type)) return false;
      if (tokens.length === 0) return false;
      const haystack = [
        asset.file_name,
        asset.relative_path,
        asset.associated_card_or_character,
        asset.associated_game_system,
        asset.category,
        asset.notes,
        ...asset.file_name.split(/[-_.]/),
      ]
        .join(' ')
        .toLowerCase()
        .replace(/rezz razor/g, 'rezz-razor');
      return tokens.some(
        (token) =>
          haystack.includes(token) ||
          normalizeKey(token) === normalizeKey(asset.associated_card_or_character),
      );
    })
    .sort((a, b) => scoreAsset(b, tokens) - scoreAsset(a, tokens))
    .slice(0, maxResults);
}

export function inspectFirstPartyAsset(
  asset: FirstPartyAssetRecord,
  cwd: string = process.cwd(),
): FirstPartyAssetRecord {
  const root = resolveAssetsRoot(cwd);
  const abs = resolve(root, asset.relative_path);
  if (!abs.startsWith(root)) {
    return {
      ...asset,
      inspection_status: 'FAILED',
      notes: joinNotes(asset.notes, 'Inspection refused: path escapes the assets root.'),
      visual_observations: [],
    };
  }
  try {
    const buffer = readFileSync(abs);
    const ext = extname(asset.file_name);
    if (ext.toLowerCase() === '.svg') {
      const svg = buffer.toString('utf8');
      return {
        ...asset,
        dimensions: svgDimensions(svg) ?? asset.dimensions,
        observed_colors: svgColors(svg),
        inspection_status: 'INSPECTED_VECTOR',
        visual_observations: [],
      };
    }
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext.toLowerCase()) || ext === '.PNG') {
      const size = rasterDimensions(buffer, ext);
      return {
        ...asset,
        dimensions: size ?? asset.dimensions,
        inspection_status: 'METADATA_ONLY',
        visual_observations: [],
        notes: joinNotes(
          asset.notes,
          size
            ? 'Raster metadata read. Pixel appearance was not described by the inventory.'
            : 'Raster file found. Dimensions could not be parsed.',
        ),
      };
    }
    return {
      ...asset,
      inspection_status: 'UNSUPPORTED',
      visual_observations: [],
      notes: joinNotes(asset.notes, `No visual inspector for ${ext || 'unknown'} files.`),
    };
  } catch {
    return {
      ...asset,
      inspection_status: 'FAILED',
      visual_observations: [],
      notes: joinNotes(asset.notes, 'Read failed. No visual description was invented.'),
    };
  }
}

export function lookDevCannotMutateAssets(): boolean {
  return true;
}

export function statsUiIsNotUxRequirement(asset: FirstPartyAssetRecord): boolean {
  return asset.asset_type === 'STATS_UI_REFERENCE' && asset.ux_requirement === false;
}

export function iconIsNotCanonicalGameplay(asset: FirstPartyAssetRecord): boolean {
  return asset.asset_type === 'ICON' && asset.authority === 'FIRST_PARTY_VISUAL_ASSET';
}

export interface AssetFolderSummary {
  folder: string;
  file_count: number;
}

export function summarizeAssetFolders(assets: FirstPartyAssetRecord[], cwd: string = process.cwd()): AssetFolderSummary[] {
  const root = resolveAssetsRoot(cwd);
  const folders = ['card_art/base cards', 'card_art/chaos cards', 'Icons', 'Interface Elements', 'effect_animations', 'competative_gameplay_examples'];
  return folders.map((folder) => ({
    folder,
    file_count: existsSync(join(root, folder))
      ? assets.filter((item) => item.relative_path.replace(/\\/g, '/').startsWith(`${folder}/`)).length
      : 0,
  }));
}

function walk(dir: string, root: string, records: FirstPartyAssetRecord[]): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === '.DS_Store') continue;
    const abs = join(dir, entry);
    const stats = statSync(abs);
    if (stats.isDirectory()) {
      walk(abs, root, records);
      continue;
    }
    const rel = relative(root, abs).split(sep).join('/');
    const ext = extname(entry);
    if (!IMAGE_EXTS.has(ext) && ext.toLowerCase() !== '.svg') continue;
    records.push(toRecord(rel, entry, ext, stats.size, abs));
  }
}

function toRecord(
  relativePath: string,
  fileName: string,
  extension: string,
  fileSize: number,
  absPath: string,
): FirstPartyAssetRecord {
  const category = categoryFromPath(relativePath);
  const assetType = typeFromPath(relativePath, fileName);
  const associated = associateName(fileName, relativePath);
  const system = associateSystem(fileName, assetType);
  const identityLocked = Boolean(associated) && (assetType === 'CARD_ART' || assetType === 'CHARACTER_ART');
  let dimensions = { width: null as number | null, height: null as number | null };
  try {
    const buffer = readFileSync(absPath);
    if (extension.toLowerCase() === '.svg') {
      dimensions = svgDimensions(buffer.toString('utf8')) ?? dimensions;
    } else {
      dimensions = rasterDimensions(buffer, extension) ?? dimensions;
    }
  } catch {
    /* inventory still records the file */
  }
  return FirstPartyAssetRecordSchema.parse({
    asset_id: `asset-${slug(relativePath)}`.slice(0, 96),
    relative_path: relativePath,
    file_name: fileName,
    extension: extension.replace(/^\./, '').toLowerCase(),
    asset_type: assetType,
    category,
    associated_card_or_character: associated,
    associated_game_system: system,
    dimensions,
    file_size: fileSize,
    first_party: true,
    notes: placeholderNote(fileName),
    inspection_status: 'NOT_INSPECTED',
    identity_locked: identityLocked,
    ux_requirement: false,
    authority: 'FIRST_PARTY_VISUAL_ASSET',
    semantic_confidence: iconSemanticConfidence(fileName, assetType, system),
    selection_role: 'UNSET',
  });
}

function categoryFromPath(relativePath: string): string {
  if (relativePath.includes('chaos cards')) return 'chaos cards';
  if (relativePath.includes('base cards')) return 'base cards';
  if (relativePath.startsWith('Icons/')) return 'Icons';
  if (relativePath.startsWith('Interface Elements/')) return 'Interface Elements';
  if (relativePath.startsWith('effect_animations/')) return 'effect_animations';
  if (relativePath.startsWith('competative_gameplay_examples/')) return 'competative_gameplay_examples';
  return 'other';
}

function typeFromPath(relativePath: string, fileName: string): FirstPartyAssetType {
  const lower = fileName.toLowerCase();
  if (lower === 'playerstats.svg' || lower === 'card-stats.svg') return 'STATS_UI_REFERENCE';
  if (relativePath.startsWith('Icons/')) {
    if (lower.includes('stats') || lower.includes('neural storage')) return 'UI_REFERENCE';
    return 'ICON';
  }
  if (relativePath.includes('card_art')) return 'CHARACTER_ART';
  if (relativePath.startsWith('Interface Elements/')) return 'UI_REFERENCE';
  if (relativePath.startsWith('effect_animations/')) return 'OTHER';
  return 'OTHER';
}

function associateName(fileName: string, relativePath: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const key = normalizeKey(stem);
  if (FILENAME_ALIASES[key]) return FILENAME_ALIASES[key];
  const keys = nameKeys(stem);
  for (const name of KNOWN_NAMES) {
    const knownKeys = nameKeys(name);
    if (keys.some((item) => knownKeys.includes(item))) return canonicalDisplayName(name);
  }
  const stripped = key.replace(/-?\d+$/, '');
  if (stripped !== key) {
    for (const name of KNOWN_NAMES) {
      if (nameKeys(name).includes(stripped)) return canonicalDisplayName(name);
    }
  }
  if (/placeholder/i.test(fileName)) return '';
  if (relativePath.includes('card_art') && !FILENAME_ALIASES[key]) return '';
  return '';
}

function canonicalDisplayName(name: string): string {
  if (name === 'Rezz Razor') return 'Rezz-Razor';
  if (name === 'Rezz Blade') return 'Rezz-Blade';
  if (name === 'Cypto Alchemist') return 'Crypto Alchemist';
  if (name === 'Delta-Wave') return '∆-Wave';
  return name;
}

function associateSystem(fileName: string, type: FirstPartyAssetType): string {
  const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase();
  if (type === 'STATS_UI_REFERENCE') {
    if (stem === 'playerstats') return 'player stats UI';
    if (stem === 'card-stats') return 'card stats UI';
  }
  if (stem === 'neural storage_effects_bank_examples') return 'Effect Bank';
  return ICON_SYSTEMS[stem] ?? '';
}

export function iconSemanticConfidence(
  fileName: string,
  type: FirstPartyAssetType,
  system: string,
): 'CERTAIN' | 'UNCERTAIN' | 'UNKNOWN' {
  if (type !== 'ICON') return 'UNKNOWN';
  const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase();
  if (CERTAIN_ICON_SYSTEMS[stem] && system) return 'CERTAIN';
  return 'UNCERTAIN';
}

function placeholderNote(fileName: string): string {
  if (/placeholder/i.test(fileName)) return 'Filename indicates a placeholder. Association left unknown.';
  return '';
}

function scoreAsset(asset: FirstPartyAssetRecord, tokens: string[]): number {
  let score = 0;
  const haystack = `${asset.file_name} ${asset.associated_card_or_character} ${asset.associated_game_system}`.toLowerCase();
  for (const token of tokens) {
    if (haystack.includes(token.toLowerCase())) score += 3;
    if (normalizeKey(asset.associated_card_or_character) === normalizeKey(token)) score += 8;
    if (asset.identity_locked && haystack.includes(token.toLowerCase())) score += 4;
  }
  if (asset.asset_type === 'CHARACTER_ART') score += 1;
  return score;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/∆/g, 'delta')
    .replace(/\.exe$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function nameKeys(value: string): string[] {
  const key = normalizeKey(value);
  return key.startsWith('the-') ? [key, key.slice(4)] : [key];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function joinNotes(existing: string, extra: string): string {
  return [existing, extra].filter(Boolean).join(' ');
}

function svgDimensions(svg: string): { width: number; height: number } | null {
  const width = svg.match(/\bwidth="(\d+(?:\.\d+)?)"/i);
  const height = svg.match(/\bheight="(\d+(?:\.\d+)?)"/i);
  if (!width || !height) {
    const view = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/i);
    if (!view) return null;
    return { width: Number(view[1]), height: Number(view[2]) };
  }
  return { width: Number(width[1]), height: Number(height[1]) };
}

function svgColors(svg: string): string[] {
  const colors = new Set<string>();
  for (const match of svg.matchAll(/fill="(#[0-9A-Fa-f]{3,8})"/g)) {
    colors.add(match[1]!.toUpperCase());
  }
  for (const match of svg.matchAll(/stroke="(#[0-9A-Fa-f]{3,8})"/g)) {
    colors.add(match[1]!.toUpperCase());
  }
  return [...colors];
}

function rasterDimensions(
  buffer: Buffer,
  ext: string,
): { width: number; height: number } | null {
  const lower = ext.toLowerCase();
  if (lower === '.png' || ext === '.PNG') return pngSize(buffer);
  if (lower === '.jpg' || lower === '.jpeg') return jpegSize(buffer);
  return null;
}

function pngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1]!;
    const size = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + size;
  }
  return null;
}
