import { describe, expect, it } from 'vitest';

import { HIGH_CONFIDENCE_ICONS, ICON_URL } from '../src/client/visual/icons';

describe('first-party icon library', () => {
  it('exposes only high-confidence glyphs for HUD use', () => {
    expect([...HIGH_CONFIDENCE_ICONS]).toEqual([
      'priority',
      'action',
      'crypto',
      'database',
      'deck',
      'discard',
      'hand',
      'power',
    ]);
  });

  it('resolves a url for every high-confidence icon', () => {
    for (const name of HIGH_CONFIDENCE_ICONS) {
      expect(ICON_URL[name].length).toBeGreaterThan(0);
    }
  });
});
