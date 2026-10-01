import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent, validateContent } from '../src/authoring/contentModel';

describe('authored content', () => {
  it('seeds a playable document including the existing catalog and the new effect examples', () => {
    const document = createDefaultContent();
    expect(validateContent(document)).toEqual([]);
    const compiled = compileContent(document);
    expect(compiled.cards.length).toBeGreaterThan(74);
    expect(compiled.locations).toHaveLength(6);
    expect(compiled.circuitRewards).toHaveLength(3);
    expect(compiled.baseCards.find(card => card.definitionId === 'eval-relocation-relay')?.onReveal).toEqual([{ kind: 'moveCard' }]);
    expect(compiled.chaosCards.find(card => card.definitionId === 'eval-power-siphon')?.onReveal).toEqual([{ kind: 'modifyPower', amount: -2, opponent: true }]);
    expect(compiled.baseCards.find(card => card.definitionId === 'dash')?.onReveal).toEqual([{ kind: 'draw', amount: 1 }, { kind: 'actions', amount: 1 }]);
  });

  it('merges reusable recipes into card hooks and location rewards', () => {
    const document = createDefaultContent();
    const card = document.cards.find(card => card.definitionId === 'eval-signal-amplifier')!;
    card.effectRefs = { onReveal: ['card-power-surge'] };
    document.locations[0].effectIds = ['location-crypto'];
    document.circuitRewards[0].effectId = 'circuit-vp';
    const compiled = compileContent(document);
    expect(compiled.baseCards.find(item => item.definitionId === card.definitionId)?.onReveal).toEqual([{ kind: 'modifyPower', amount: 2 }, { kind: 'modifyPower', amount: 2 }]);
    expect(compiled.locations[0].effects).toEqual([{ kind: 'crypto', amount: 2 }, { kind: 'crypto', amount: 1 }]);
    expect(compiled.circuitRewards[0].effect).toEqual({ kind: 'vp', amount: 2 });
    expect(card.onReveal).toEqual([{ kind: 'modifyPower', amount: 2 }]);
  });

  it('reports malformed effects, dangling references, incompatible pools and market shortages', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'eval-signal-amplifier')!.effectRefs = { onCollapse: ['missing'] };
    document.cards.find(card => card.definitionId === 'dash')!.pool = 'VP';
    document.effects[0].effects = [{ kind: 'modifyPower', amount: Number.POSITIVE_INFINITY }];
    document.locations[0].effects = [{ kind: 'damageLoser', amount: -2 }];
    document.cards.filter(card => card.pool === 'Chaos').forEach(card => { card.enabled = false; });
    const errors = validateContent(document);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('effectRefs.onCollapse[0]: unknown effect'),
      expect.stringContaining('cards: at least 4 enabled non-Generated Chaos cards'),
      expect.stringContaining('cards: rezz-razor is referenced by the starting deck'),
    ]));
    expect(errors.some(error => error.includes('.pool: incompatible'))).toBe(true);
    expect(errors.some(error => error.includes('effects[0].effects[0].amount'))).toBe(true);
    expect(errors.some(error => error.includes('locations[0].effects[0].amount'))).toBe(true);
    expect(() => compileContent(document)).toThrow(/Invalid authored content/);
  });

  it('rejects missing or disabled starting deck definitions', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'byte-coin')!.enabled = false;
    expect(validateContent(document)).toContain('cards: byte-coin is referenced by the starting deck and must remain enabled as Crypto');
  });

  it('rejects fractional action counts, disabled gain targets, and inert scheduled effects', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'eval-signal-amplifier')!.onReveal = [{ kind: 'modifyPower', amount: 1.5 }];
    document.cards.find(card => card.definitionId === 'eval-relocation-relay')!.onReveal = [{ kind: 'draw', amount: 0.5 }];
    document.cards.find(card => card.definitionId === 'eval-hostile-reroute')!.recurring = [{ kind: 'crypto', amount: 1 }];
    document.cards.find(card => card.definitionId === 'mega-cache')!.enabled = false;
    const errors = validateContent(document);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('amount: expected integer from -1000'),
      expect.stringContaining('amount: expected integer from 0'),
      expect.stringContaining('duration: schedule and recurring effects require'),
      expect.stringContaining('unknown card mega-cache'),
    ]));
  });

  it('rejects ambiguous choice IDs and allows historical negative VP values', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'basic-encryption')!.vp = -2;
    expect(validateContent(document)).toEqual([]);
    document.effects[0].effects = [{ kind: 'choice', options: [
      { id: 'same', label: 'First', effects: [{ kind: 'draw', amount: 1 }] },
      { id: 'same', label: 'Second', effects: [{ kind: 'crypto', amount: 1 }] },
    ] }];
    expect(validateContent(document).some(error => error.includes('.options[1].id: duplicate ID same'))).toBe(true);
  });

  it('round trips quantities, recipients, and ordered or random Morph forms', () => {
    const document = createDefaultContent();
    const recipes = [
      { kind: 'gain' as const, cardId: 'byte-coin', amount: 3, destination: 'hand' as const, opponent: true },
      { kind: 'draw' as const, amount: 2, opponent: true },
      { kind: 'actions' as const, amount: 1, opponent: true },
      { kind: 'crypto' as const, amount: 4, opponent: true },
      { kind: 'morph' as const, formIds: ['slash-dot', 'vault-encryption'], selection: 'sequential' as const },
      { kind: 'morph' as const, formIds: ['vault-encryption', 'slash-dot'], selection: 'random' as const },
    ];
    document.effects.push({ id: 'test-recipe', name: 'Recipe', description: '', scope: 'card', effects: recipes });
    document.cards.find(card => card.definitionId === 'eval-relocation-relay')!.effectRefs = { onReveal: ['test-recipe'] };
    const reloaded = JSON.parse(JSON.stringify(document));
    expect(validateContent(reloaded)).toEqual([]);
    expect(compileContent(reloaded).cards.find(card => card.definitionId === 'eval-relocation-relay')!.onReveal?.slice(-6)).toEqual(recipes);
  });

  it('rejects missing, disabled, Crypto, empty, duplicate, and unsupported Morph forms', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'eval-signal-amplifier')!.enabled = false;
    document.effects[0].effects = [
      { kind: 'morph', formIds: ['missing-form'] },
      { kind: 'morph', formIds: ['eval-signal-amplifier'] },
      { kind: 'morph', formIds: ['byte-coin'] },
      { kind: 'morph', formIds: [] },
      { kind: 'morph', formIds: ['slash-dot', 'slash-dot'] },
    ];
    const errors = validateContent(document);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown or disabled form card missing-form'),
      expect.stringContaining('unknown or disabled form card eval-signal-amplifier'),
      expect.stringContaining('deployed forms must be Character or VP cards'),
      expect.stringContaining('select at least one form card'),
      expect.stringContaining('each form may appear only once'),
    ]));
    const invalid = JSON.parse(JSON.stringify(document));
    invalid.effects[0].effects = [{ kind: 'morph', formIds: ['slash-dot'], selection: 'all' }];
    expect(validateContent(invalid)).toEqual(expect.arrayContaining([expect.stringContaining('expected sequential or random')]));
  });

  it('rejects unsupported gain counts and recurring references without a Runtime duration', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'eval-relocation-relay')!.onReveal = [{kind:'gain',cardId:'byte-coin',amount:101}];
    document.cards.find(card => card.definitionId === 'eval-signal-amplifier')!.effectRefs = {recurring:['card-power-surge']};
    document.cards.find(card => card.definitionId === 'byte-coin')!.cryptoValue = undefined;
    document.cards.find(card => card.definitionId === 'vault-encryption')!.vp = undefined;
    expect(validateContent(document)).toEqual(expect.arrayContaining([
      expect.stringContaining('gain count must be an integer from 0 to 100'),
      expect.stringContaining('recurring effect references require'),
      expect.stringContaining('Crypto cards require an explicit payout'),
      expect.stringContaining('VP cards require explicit scoring points'),
    ]));
  });
});
