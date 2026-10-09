import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileContent, createDefaultContent, upgradeDocument, validateContent, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { DEFAULT_OPPONENTS, defaultOpponents, isCanonicalProfile, opponentBaseline, pickOpponent } from '@0uroboros/engine/ai/opponents';
import { DEFAULT_STRATEGY, sanitizeProfile } from '@0uroboros/engine/ai/strategy';
import { packHash } from '@0uroboros/content/hash';
import { LEAGUE_ROSTER } from '../server/agents/roster';
import { publishOpponent } from '../src/agentsApi';

describe('opponents in the content pack', () => {
  it('ships the four league baselines by default, each already sanitized', () => {
    const doc = createDefaultContent();
    expect(doc.opponents!.map(opponent => opponent.id)).toEqual(['strat-g', 't-5', 'dv-8', 'vp-dog']);
    for (const opponent of doc.opponents!) expect(isCanonicalProfile(opponent.profile)).toBe(true);
    expect(validateContent(doc)).toEqual([]);
  });

  it('seeds the baselines into a save that predates opponents, and compiles them through', () => {
    const { opponents: _opponents, ...older } = createDefaultContent();
    const upgraded = upgradeDocument(older) as ContentDocument;
    expect(upgraded.opponents).toEqual(defaultOpponents());
    expect(validateContent(upgraded)).toEqual([]);
    const compiled = compileContent(older as ContentDocument);
    expect(compiled.opponents.map(opponent => opponent.name)).toEqual(['Strat-G', 'T-5', 'DV-8', 'VP-Dog']);
    expect(compiled.opponents[0].profile).toEqual(opponentBaseline('strat-g'));
  });

  it('keeps the league roster on the same baselines the pack ships', () => {
    for (const agent of LEAGUE_ROSTER) expect(agent.baseline).toEqual(DEFAULT_OPPONENTS.find(opponent => opponent.id === agent.id)!.profile);
  });

  it('rejects duplicate ids, out-of-bounds profiles and biases on unknown cards', () => {
    const doc = createDefaultContent();
    const [first] = doc.opponents!;
    doc.opponents = [first, { ...first }];
    expect(validateContent(doc).some(error => error.includes('opponents[1].id: duplicate'))).toBe(true);
    doc.opponents = [{ ...first, profile: { ...first.profile, weights: { ...first.profile.weights, vp: 99 } } }];
    expect(validateContent(doc).some(error => error.startsWith('opponents[0].profile:'))).toBe(true);
    doc.opponents = [{ ...first, profile: sanitizeProfile({ ...first.profile, cardBias: { 'no-such-card': 1 } }) }];
    expect(validateContent(doc)).toContain('opponents[0].profile.cardBias.no-such-card: unknown or disabled card');
    doc.opponents = [{ ...first, profile: sanitizeProfile({ ...first.profile, cardBias: { [doc.cards[0].definitionId ?? doc.cards[0].id]: 1 } }) }];
    expect(validateContent(doc)).toEqual([]);
    doc.opponents = [];
    expect(validateContent(doc)).toContain('opponents: expected 1–20 opponents');
  });

  it('changes the pack hash when an opponent is re-tuned, so connected clients fetch the new pack', () => {
    const doc = createDefaultContent();
    const before = packHash(doc);
    doc.opponents![1].profile = sanitizeProfile({ ...doc.opponents![1].profile, version: 7, weights: { ...doc.opponents![1].profile.weights, drain: 3 } });
    expect(validateContent(doc)).toEqual([]);
    expect(packHash(doc)).not.toBe(before);
  });

  it('picks the saved opponent, falls back to the first, and plays the default brain without any', () => {
    const opponents = defaultOpponents();
    expect(pickOpponent(opponents, 'dv-8')?.id).toBe('dv-8');
    expect(pickOpponent(opponents, 'nobody')?.id).toBe('strat-g');
    expect(pickOpponent(opponents, null)?.id).toBe('strat-g');
    expect(pickOpponent([], 'strat-g')).toBeNull();
    expect(pickOpponent(undefined, 'strat-g')).toBeNull();
    expect(opponentBaseline('nobody')).toEqual(sanitizeProfile(DEFAULT_STRATEGY));
  });
});

describe('publishing an agent to the pack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('replaces the opponent entry with the agent\'s best, drops biases on disabled cards and saves at the loaded revision', async () => {
    const doc = createDefaultContent();
    const disabled = doc.cards.find(card => card.pool === 'Base')!;
    disabled.enabled = false;
    const kept = doc.cards.find(card => card.enabled)!;
    const keptId = kept.definitionId ?? kept.id, disabledId = disabled.definitionId ?? disabled.id;
    const best = sanitizeProfile({ ...opponentBaseline('t-5'), version: 12, cardBias: { [keptId]: 2, [disabledId]: -3 } }, opponentBaseline('t-5'));
    let saved: { revision: number; document: ContentDocument } | null = null;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.startsWith('/api/agents/publishable')) return json({ label: 'v12', profile: best });
      if (init?.method === 'PUT') { saved = JSON.parse(String(init.body)); return json({ revision: saved!.revision + 1, document: saved!.document }); }
      return json({ revision: 41, document: doc });
    });
    const result = await publishOpponent('t-5');
    expect(saved!.revision).toBe(41);
    const entry = saved!.document.opponents!.find(opponent => opponent.id === 't-5')!;
    expect(entry).toMatchObject({ name: 'T-5', style: 'Pure aggression' });
    expect(entry.profile.version).toBe(12);
    expect(entry.profile.cardBias).toEqual({ [keptId]: 2 });
    expect(saved!.document.opponents!.map(opponent => opponent.id)).toEqual(['strat-g', 't-5', 'dv-8', 'vp-dog']);
    expect(validateContent(saved!.document)).toEqual([]);
    expect(result).toEqual({ label: 'v12', revision: 42, hash: packHash(saved!.document) });
  });
});
