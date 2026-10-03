import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_BACKS, DEFAULT_CARD_BACK, cardBackMarkup, cardBackSrc, loadCardBacks, saveCardBacks } from '../src/cardBacks';
import { playerColor } from '../src/playerTheme';

describe('card backs', () => {
  it('draws every SVG back on the palette black with its linework glowing in the player colour', () => {
    for (const back of CARD_BACKS) {
      if ('image' in back) continue;
      const markup = cardBackMarkup(back.id, '#fa0048')!;
      expect(markup, back.id).toContain('<path');
      expect(markup, back.id).toContain('fill="#030012"');
      expect(markup, back.id).toContain('flood-color="#fa0048"');
      expect(markup, back.id).toMatch(/stroke: #fa0048/);
      expect(markup, back.id).not.toMatch(/#171717|#e0e0e0/i);
      expect(markup, back.id).not.toContain('id="BACKGROUND"');
    }
  });

  it('crops each sheet emblem to its own cell', () => {
    const crops = CARD_BACKS.filter(back => 'crop' in back && back.file.startsWith('Ouro-small')).map(back => 'crop' in back && `${back.file} ${back.crop.join(',')}`);
    expect(new Set(crops).size).toBe(crops.length);
  });

  it('reuses one image per back and colour', () => {
    const red = playerColor('red'), cyan = playerColor('cyan');
    expect(cardBackSrc('infinity', red)).toBe(cardBackSrc('infinity', red));
    expect(cardBackSrc('infinity', red)).not.toBe(cardBackSrc('infinity', cyan));
    expect(cardBackSrc('silicone', red)).toBe(cardBackSrc('silicone', cyan));
  });
});

describe('card back setting', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults both players to the Ouroboros back and round-trips separate choices', () => {
    expect(loadCardBacks()).toEqual([DEFAULT_CARD_BACK, DEFAULT_CARD_BACK]);
    saveCardBacks(['eye', 'delta']);
    expect(loadCardBacks()).toEqual(['eye', 'delta']);
  });

  it('ignores unknown backs', () => {
    store.set('ouroboros.cardBacks', JSON.stringify(['eye', 'sword']));
    expect(loadCardBacks()).toEqual([DEFAULT_CARD_BACK, DEFAULT_CARD_BACK]);
  });
});
