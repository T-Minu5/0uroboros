import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CANONICAL_VERSION } from './config';
import type { CanonicalRecord } from './context';

const ID_PATTERN =
  /`((?:RULE|TECH|UX|CONTRACT|LOOKDEV|DESIGN|WORLD)-[A-Z0-9-]+)`/g;

export const CANONICAL_FILE_FOR_DOMAIN: Record<string, string> = {
  RULE: 'rules.json',
  TECH: 'tech-requirements.json',
  CONTRACT: 'tech-requirements.json',
  UX: 'design-system.json',
  LOOKDEV: 'design-system.json',
  DESIGN: 'design-system.json',
  WORLD: 'world.json',
};

function domainForId(id: string): string {
  return id.split('-')[0] ?? 'UNKNOWN';
}

function tagsFor(id: string, text: string): string[] {
  const tags = [domainForId(id).toLowerCase()];
  if (id === 'RULE-DECK-001' || /starting deck/i.test(text)) tags.push('starting-deck');
  if (/5 Character, 3 Crypto, 2 VP/.test(text)) tags.push('5-3-2');
  return tags;
}

export function parseCanonicalMarkdown(packageRoot: string): CanonicalRecord[] {
  if (!existsSync(packageRoot)) return [];
  const items: CanonicalRecord[] = [];
  const seen = new Set<string>();
  const stack = [packageRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'canonical' || entry.name === 'schemas') continue;
        stack.push(full);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      const text = readFileSync(full, 'utf8');
      const document = full.slice(packageRoot.length + 1);
      for (const line of text.split(/\r?\n/)) {
        ID_PATTERN.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = ID_PATTERN.exec(line))) {
          const id = match[1];
          if (seen.has(id)) continue;
          seen.add(id);
          const body = line.replace(/^-\s*/, '').trim();
          items.push({
            id,
            domain: domainForId(id),
            status: 'current',
            version: CANONICAL_VERSION,
            text: body,
            tags: tagsFor(id, body),
            supersedes: [],
            superseded_by: [],
            document,
          });
        }
      }
    }
  }
  return items;
}

export function obsoleteDeckRecord(): CanonicalRecord {
  return {
    id: 'HIST-DECK-4-4-2',
    domain: 'HIST',
    status: 'superseded',
    version: CANONICAL_VERSION,
    text: 'Obsolete playtest composition 4 Character / 4 Crypto / 2 VP. Superseded by RULE-DECK-001 (5 Character / 3 Crypto / 2 VP). Not a current rule.',
    tags: ['starting-deck', 'obsolete', '4-4-2'],
    supersedes: [],
    superseded_by: ['RULE-DECK-001'],
    document: 'canonical/rules.json',
  };
}

export function recordsByFile(items: CanonicalRecord[]): Record<string, CanonicalRecord[]> {
  const grouped: Record<string, CanonicalRecord[]> = {
    'rules.json': [],
    'tech-requirements.json': [],
    'design-system.json': [],
    'world.json': [],
  };
  for (const item of items) {
    const file = CANONICAL_FILE_FOR_DOMAIN[item.domain] ?? 'rules.json';
    grouped[file] = grouped[file] ?? [];
    grouped[file].push(item);
  }
  grouped['rules.json'].push(obsoleteDeckRecord());
  return grouped;
}

export function writeCanonicalFiles(packageRoot: string, items: CanonicalRecord[]): string[] {
  const dir = join(packageRoot, 'canonical');
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const [file, records] of Object.entries(recordsByFile(items))) {
    const path = join(dir, file);
    writeFileSync(
      path,
      `${JSON.stringify({ version: CANONICAL_VERSION, items: records }, null, 2)}\n`,
      'utf8',
    );
    written.push(path);
  }
  return written;
}

export function syncCanonicalFromMarkdown(packageRoot: string): string[] {
  return writeCanonicalFiles(packageRoot, parseCanonicalMarkdown(packageRoot));
}
