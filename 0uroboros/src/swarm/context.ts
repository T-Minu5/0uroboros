import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CANONICAL_VERSION } from './config';
import { parseCanonicalMarkdown } from './canonicalSync';

export type CanonicalStatus = 'current' | 'superseded';

export interface CanonicalRecord {
  id: string;
  domain: string;
  status: CanonicalStatus;
  version: string;
  text: string;
  tags: string[];
  supersedes: string[];
  superseded_by: string[];
  document: string;
}

export type CanonicalItem = CanonicalRecord;

export interface CanonicalIndex {
  version: string;
  items: CanonicalRecord[];
}

export interface CanonicalQuery {
  ids?: string[];
  prefixes?: string[];
  domains?: string[];
  version?: string;
  includeSuperseded?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRecord(value: unknown, fallbackDocument: string): CanonicalRecord | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null;
  const status = value.status === 'superseded' ? 'superseded' : 'current';
  return {
    id: value.id,
    domain: typeof value.domain === 'string' ? value.domain : value.id.split('-')[0] ?? 'UNKNOWN',
    status,
    version: typeof value.version === 'string' ? value.version : CANONICAL_VERSION,
    text: typeof value.text === 'string' ? value.text : '',
    tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
    supersedes: Array.isArray(value.supersedes) ? value.supersedes.map(String) : [],
    superseded_by: Array.isArray(value.superseded_by) ? value.superseded_by.map(String) : [],
    document: typeof value.document === 'string' ? value.document : fallbackDocument,
  };
}

function loadJsonRecords(canonicalDir: string): CanonicalRecord[] {
  if (!existsSync(canonicalDir)) return [];
  const items: CanonicalRecord[] = [];
  for (const entry of readdirSync(canonicalDir)) {
    if (!entry.endsWith('.json')) continue;
    const document = `canonical/${entry}`;
    const raw = JSON.parse(readFileSync(join(canonicalDir, entry), 'utf8')) as unknown;
    const list = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
    for (const value of list) {
      const parsed = parseRecord(value, document);
      if (parsed) items.push(parsed);
    }
  }
  return items;
}

export function loadCanonicalIndex(
  packageRoot: string,
  version: string = CANONICAL_VERSION,
): CanonicalIndex {
  const jsonItems = loadJsonRecords(join(packageRoot, 'canonical'));
  const byId = new Map<string, CanonicalRecord>();
  for (const item of jsonItems) {
    byId.set(item.id, item);
  }
  if (byId.size === 0) {
    for (const item of parseCanonicalMarkdown(packageRoot)) {
      byId.set(item.id, item);
    }
  }
  return { version, items: [...byId.values()] };
}

export function retrieveCanonical(
  index: CanonicalIndex,
  query: CanonicalQuery,
): CanonicalRecord[] {
  const idSet = new Set(query.ids ?? []);
  const prefixes = query.prefixes ?? [];
  const domains = new Set((query.domains ?? []).map((value) => value.toUpperCase()));
  const includeSuperseded = query.includeSuperseded === true;

  return index.items.filter((item) => {
    if (query.version && item.version !== query.version) return false;
    const matchesId = idSet.has(item.id);
    const matchesPrefix = prefixes.some((prefix) => item.id.startsWith(prefix));
    const matchesDomain = domains.has(item.domain);
    if (!matchesId && !matchesPrefix && !matchesDomain) return false;
    if (!includeSuperseded && item.status === 'superseded' && !matchesId) return false;
    return true;
  });
}

export function formatCanonicalExcerpts(items: CanonicalRecord[]): string {
  if (items.length === 0) {
    return 'No matching canonical IDs were retrieved.';
  }
  return items
    .map((item) => `[${item.id} @ ${item.document} ${item.status}] ${item.text}`)
    .join('\n');
}

export function knownCanonicalIds(
  index: CanonicalIndex,
  options: { includeSuperseded?: boolean } = {},
): Set<string> {
  return new Set(
    index.items
      .filter((item) => options.includeSuperseded || item.status === 'current')
      .map((item) => item.id),
  );
}

export function defaultSwarmPackageRoot(cwd: string = process.cwd()): string {
  return join(cwd, '0uroboros_swarm_v2_0');
}

export function startingDeckRule(index: CanonicalIndex): CanonicalRecord | undefined {
  return index.items.find((item) => item.id === 'RULE-DECK-001' && item.status === 'current');
}
