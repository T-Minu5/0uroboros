import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SERVER_STYLE, SERVER_STYLES, loadServerStyles, saveServerStyles } from '../src/serverStyles';
import { SHIELD_HIT_S, hitGlow } from '../src/serverShield';

describe('server tube style setting', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults both players to the shield', () => {
    expect(DEFAULT_SERVER_STYLE).toBe('shield');
    expect(loadServerStyles()).toEqual(['shield', 'shield']);
  });

  it('offers shield, pulse and classic as separate choices', () => {
    expect(SERVER_STYLES.map(option => option.id)).toEqual(['shield', 'pulse', 'classic']);
  });

  it('round-trips a separate choice for each player', () => {
    saveServerStyles(['classic', 'pulse']);
    expect(loadServerStyles()).toEqual(['classic', 'pulse']);
    saveServerStyles(['shield', 'classic']);
    expect(loadServerStyles()).toEqual(['shield', 'classic']);
  });

  it('carries a choice saved before styles were per player over to both players', () => {
    store.set('ouroboros.serverStyle', 'pulse');
    expect(loadServerStyles()).toEqual(['pulse', 'pulse']);
  });

  it('falls back to the default for unknown or unreadable values', () => {
    store.set('ouroboros.serverStyles', JSON.stringify(['liquid', 'pulse']));
    expect(loadServerStyles()).toEqual(['shield', 'shield']);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadServerStyles()).toEqual(['shield', 'shield']);
    expect(() => saveServerStyles(['classic', 'classic'])).not.toThrow();
  });
});

describe('hit ripple on Pulse discs', () => {
  it('flashes at the impact, then travels outward as a ring', () => {
    expect(hitGlow(0, 0, 1)).toBeGreaterThan(1);
    expect(hitGlow(1, .05, 1)).toBe(0);
    expect(hitGlow(.7, .4, 1)).toBeGreaterThan(hitGlow(.2, .4, 1));
  });

  it('is gone outside its lifetime and keeps only the impact flash without motion', () => {
    expect(hitGlow(0, -.1, 1)).toBe(0);
    expect(hitGlow(0, SHIELD_HIT_S + .01, 1)).toBe(0);
    expect(hitGlow(.7, .4, 0)).toBe(0);
    expect(hitGlow(0, .05, 0)).toBeGreaterThan(1);
  });
});
