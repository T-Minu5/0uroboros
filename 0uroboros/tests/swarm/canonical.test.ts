import { describe, expect, it } from 'vitest';

import {
  knownCanonicalIds,
  loadCanonicalIndex,
  retrieveCanonical,
  startingDeckRule,
} from '../../src/swarm/context';
import { validateCanonicalIds } from '../../src/swarm/governance';
import { testCanonical } from './fixtures';

describe('structured canonical retrieval', () => {
  const index = testCanonical();

  it('retrieves RULE-DECK-001 as 5 Character / 3 Crypto / 2 VP', () => {
    const rule = startingDeckRule(index);
    expect(rule?.status).toBe('current');
    expect(rule?.text).toContain('5 Character, 3 Crypto, 2 VP');
    expect(rule?.text).not.toMatch(/4 Character, 4 Crypto/);
  });

  it('retrieves an exact ID', () => {
    const items = retrieveCanonical(index, { ids: ['CONTRACT-001'] });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('CONTRACT-001');
  });

  it('retrieves by prefix', () => {
    const items = retrieveCanonical(index, { prefixes: ['RULE-DECK-'] });
    expect(items.some((item) => item.id === 'RULE-DECK-001')).toBe(true);
    expect(items.every((item) => item.id.startsWith('RULE-DECK-'))).toBe(true);
  });

  it('retrieves by domain', () => {
    const items = retrieveCanonical(index, { domains: ['UX'] });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.domain === 'UX')).toBe(true);
  });

  it('filters by version', () => {
    const current = retrieveCanonical(index, { ids: ['RULE-VP-001'], version: '2.0.0' });
    expect(current).toHaveLength(1);
    const missing = retrieveCanonical(index, { ids: ['RULE-VP-001'], version: '1.0.0' });
    expect(missing).toHaveLength(0);
  });

  it('hides superseded records unless requested', () => {
    const hidden = retrieveCanonical(index, { prefixes: ['HIST-'] });
    expect(hidden).toEqual([]);
    const shown = retrieveCanonical(index, {
      ids: ['HIST-DECK-4-4-2'],
      includeSuperseded: true,
    });
    expect(shown[0]?.status).toBe('superseded');
    expect(shown[0]?.superseded_by).toContain('RULE-DECK-001');
    expect(knownCanonicalIds(index).has('HIST-DECK-4-4-2')).toBe(false);
  });

  it('fails unknown canonical IDs', () => {
    expect(() => validateCanonicalIds(['RULE-FAKE-999'], index, true)).toThrow(
      /Unknown canonical IDs/,
    );
  });

  it('loads structured JSON in preference to markdown shells', () => {
    expect(index.items.some((item) => item.id === 'WORLD-CORE-001')).toBe(true);
    expect(loadCanonicalIndex(`${process.cwd()}/0uroboros_swarm_v2_0`).items.length).toBeGreaterThan(
      20,
    );
  });
});
