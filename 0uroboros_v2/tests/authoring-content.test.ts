import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent, validateContent, withStartingDecks, DEFAULT_DECK_ID } from '../src/authoring/contentModel';
import { DEFAULT_STARTING_DECK } from '../src/game';
import { migrateEffects } from '../src/effects/migrate';
import type { EffectStep } from '../src/effects/types';

const you = { type: 'player', who: 'self' } as const;
const steps = (effects: Parameters<typeof migrateEffects>[0]) => migrateEffects(effects, 'card');
const findCard = (document: ReturnType<typeof createDefaultContent>, id: string) => document.cards.find(card => card.definitionId === id)!;

describe('authored content', () => {
  it('seeds a playable version 2 document including the existing catalog and the new effect examples', () => {
    const document = createDefaultContent();
    expect(document.version).toBe(2);
    expect(validateContent(document)).toEqual([]);
    const compiled = compileContent(document);
    expect(compiled.cards.length).toBeGreaterThan(74);
    expect(compiled.locations).toHaveLength(6);
    expect(compiled.circuitRewards).toHaveLength(3);
    expect(compiled.baseCards.find(card => card.definitionId === 'eval-relocation-relay')?.onReveal).toEqual(steps([{ kind: 'moveCard' }]));
    expect(compiled.chaosCards.find(card => card.definitionId === 'eval-power-siphon')?.onReveal).toEqual([{ action: 'changePower', amount: -2, target: { type: 'card', who: 'opponent', where: 'board' }, pick: { mode: 'choose' } }]);
    expect(compiled.baseCards.find(card => card.definitionId === 'dash')?.onReveal).toEqual([{ action: 'draw', amount: 1, target: you }, { action: 'gainActions', amount: 1, target: you }]);
    for (const reward of compiled.circuitRewards) expect(reward.effect).toEqual(reward.effects![0]);
  });

  it('reports malformed and legacy effects, incompatible pools and market shortages', () => {
    const document = createDefaultContent();
    findCard(document, 'dash').pool = 'VP';
    findCard(document, 'eval-signal-amplifier').onReveal = [{ action: 'changePower', amount: Number.POSITIVE_INFINITY, target: { type: 'card', who: 'self', where: 'board', relation: 'self' } }];
    findCard(document, 'eval-relocation-relay').onCollapse = [{ kind: 'draw', amount: 1 }] as never;
    document.locations[0].effects = [{ action: 'damageServer', amount: -2, target: { type: 'server', who: 'loser', server: 'auto' } }];
    document.cards.filter(card => card.pool === 'Chaos' || card.pool === 'Base').forEach(card => { card.enabled = false; });
    const errors = validateContent(document);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('cards: at least 7 enabled non-Generated Base or Chaos cards'),
      expect.stringContaining('cards: at least 2 enabled non-Generated Base cards that are not Runtime'),
      expect.stringContaining('cards: at least 1 enabled non-Generated Attack or Hacker Chaos card'),
      expect.stringContaining('cards: at least 1 enabled non-Generated Horror Chaos card'),
      expect.stringMatching(/^startingDecks\[0\]\.cards\[\d+\]\.cardId: unknown card rezz-blade$/),
      expect.stringMatching(/onCollapse\[0\]\.action: unknown effect \(legacy draw must be migrated\)$/),
    ]));
    expect(errors.some(error => error.includes('.pool: incompatible'))).toBe(true);
    expect(errors.some(error => /onReveal\[0\]\.amount/.test(error))).toBe(true);
    expect(errors.some(error => error.includes('locations[0].effects[0].amount'))).toBe(true);
    expect(() => compileContent(document)).toThrow(/Invalid authored content/);
  });

  it('rejects disabled starting deck cards and Draft currencies', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'byte-coin')!.enabled = false;
    expect(validateContent(document)).toEqual(expect.arrayContaining([
      'startingDecks[0].cards[0].cardId: unknown card byte-coin',
      'cards: byte-coin is a Draft currency and must remain enabled as a non-Generated Crypto card',
    ]));
  });

  it('seeds the Standard starting deck and resolves the active deck into one card per copy', () => {
    const document = createDefaultContent();
    expect(document.activeStartingDeckId).toBe(DEFAULT_DECK_ID);
    expect(document.startingDecks).toEqual([{ id: DEFAULT_DECK_ID, name: 'Standard', cards: DEFAULT_STARTING_DECK.map(entry => ({ ...entry })) }]);
    const compiled = compileContent(document);
    expect(compiled.startingDeck).toHaveLength(10);
    expect(compiled.startingDeck.filter(card => card.definitionId === 'shyte-coin').map(card => card.id)).toEqual(['shyte-coin-1', 'shyte-coin-2', 'shyte-coin-3']);
    expect(compiled.startingDeck.map(card => card.definitionId)).toEqual(['byte-coin', 'shyte-coin', 'shyte-coin', 'shyte-coin', 'dotkrawler', 'slash-dot', 'rezz-blade', 'basic-encryption', 'vault-encryption', 'night-scythe']);
  });

  it('loads older saves without decks using the default deck', () => {
    const document = createDefaultContent();
    delete document.startingDecks; delete document.activeStartingDeckId;
    expect(validateContent(document)).toEqual([]);
    expect(withStartingDecks(document).startingDecks?.[0].cards).toEqual(DEFAULT_STARTING_DECK);
    expect(compileContent(document).startingDeck).toHaveLength(10);
    document.cards.find(card => card.definitionId === 'night-scythe')!.enabled = false;
    expect(validateContent(document)).toContain('cards: night-scythe is used by the default starting deck and must remain enabled');
  });

  it('loads whichever named deck is active, including Generated cards', () => {
    const document = createDefaultContent();
    document.cards.find(card => card.definitionId === 'shyte-coin')!.generated = true;
    document.startingDecks!.push({ id: 'deck-rush', name: 'Rush', cards: [{ cardId: 'rezz-blade', count: 4 }, { cardId: 'shyte-coin', count: 2 }] });
    document.activeStartingDeckId = 'deck-rush';
    expect(validateContent(document)).toEqual([]);
    const compiled = compileContent(document);
    expect(compiled.startingDeck.map(card => card.id)).toEqual(['rezz-blade-1', 'rezz-blade-2', 'rezz-blade-3', 'rezz-blade-4', 'shyte-coin-1', 'shyte-coin-2']);
    expect(compiled.startingDeck.find(card => card.definitionId === 'shyte-coin')).toMatchObject({ generated: true, cryptoValue: 1 });
  });

  it('validates deck names, copies, duplicates, opening size and the active selection', () => {
    const document = createDefaultContent();
    document.startingDecks!.push({ id: 'deck-small', name: ' ', cards: [{ cardId: 'slash-dot', count: 2 }, { cardId: 'slash-dot', count: 1 }, { cardId: 'missing-card', count: 0 }] });
    expect(validateContent(document)).toEqual(expect.arrayContaining([
      'startingDecks[1].name: required text, at most 200 characters',
      'startingDecks[1].cards[1].cardId: slash-dot is listed twice; change its count instead',
      'startingDecks[1].cards[2].cardId: unknown card missing-card',
      'startingDecks[1].cards[2].count: expected integer from 1 to 40',
    ]));
    expect(validateContent(document).some(error => error.includes('needs at least 5 cards'))).toBe(false);
    document.activeStartingDeckId = 'deck-small';
    expect(validateContent(document)).toContain('startingDecks[1].cards: the deck loaded in new games needs at least 5 cards for the opening hand');
    document.activeStartingDeckId = 'deck-gone';
    expect(validateContent(document)).toContain('activeStartingDeckId: choose which starting deck new games load');
  });

  it('rejects fractional amounts, disabled gain targets, and inert recurring effects', () => {
    const document = createDefaultContent();
    findCard(document, 'eval-signal-amplifier').onReveal = [{ action: 'changePower', amount: 1.5, target: { type: 'card', who: 'self', where: 'board', relation: 'self' } }];
    findCard(document, 'eval-relocation-relay').onReveal = [{ action: 'draw', amount: 0.5, target: you }];
    findCard(document, 'eval-hostile-reroute').recurring = [{ action: 'gainCrypto', amount: 1, target: you }];
    findCard(document, 'mega-cache').enabled = false;
    const errors = validateContent(document);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('amount: expected integer from -100'),
      expect.stringContaining('amount: expected integer from 0'),
      expect.stringContaining('duration: schedule and recurring effects require'),
      expect.stringContaining('unknown card mega-cache'),
    ]));
  });

  it('rejects ambiguous choice IDs and allows historical negative VP values', () => {
    const document = createDefaultContent();
    findCard(document, 'basic-encryption').vp = -2;
    expect(validateContent(document)).toEqual([]);
    findCard(document, 'eval-relocation-relay').onReveal = [{ action: 'choice', options: [
      { id: 'same', label: 'First', effects: [{ action: 'draw', amount: 1, target: you }] },
      { id: 'same', label: 'Second', effects: [{ action: 'gainCrypto', amount: 1, target: you }] },
    ] }];
    expect(validateContent(document).some(error => error.includes('.options[1].id: duplicate ID same'))).toBe(true);
  });

  it('round trips quantities, recipients, choice costs, and ordered or random Morph forms', () => {
    const document = createDefaultContent();
    const them = { type: 'player', who: 'opponent' } as const;
    const authored: EffectStep[] = [
      { action: 'gainCard', cardId: 'byte-coin', amount: 3, target: { type: 'zone', who: 'opponent', zone: 'hand' } },
      { action: 'draw', amount: 2, target: them },
      { action: 'gainActions', amount: 1, target: them },
      { action: 'gainCrypto', amount: 4, target: them },
      { action: 'choice', choose: { count: 1, chooser: 'opponent' }, options: [
        { id: 'pay', label: 'Pay 2 for 1 VP', cost: [{ action: 'payCrypto', amount: 2, target: you }], effects: [{ action: 'gainVP', amount: 1, target: you }] },
        { id: 'free', label: '+1 Card', effects: [{ action: 'draw', amount: 1, target: you }] },
      ] },
      { action: 'morph', formIds: ['slash-dot', 'vault-encryption'], selection: 'sequential' },
      { action: 'morph', formIds: ['vault-encryption', 'slash-dot'], selection: 'random' },
    ];
    findCard(document, 'eval-relocation-relay').onReveal = authored;
    const reloaded = JSON.parse(JSON.stringify(document));
    expect(validateContent(reloaded)).toEqual([]);
    expect(compileContent(reloaded).cards.find(card => card.definitionId === 'eval-relocation-relay')!.onReveal).toEqual(authored);
  });

  it('rejects missing, disabled, Crypto, empty, duplicate, and unsupported Morph forms', () => {
    const document = createDefaultContent();
    findCard(document, 'eval-signal-amplifier').enabled = false;
    findCard(document, 'eval-relocation-relay').onReveal = [
      { action: 'morph', formIds: ['missing-form'] },
      { action: 'morph', formIds: ['eval-signal-amplifier'] },
      { action: 'morph', formIds: ['byte-coin'] },
      { action: 'morph', formIds: [] },
      { action: 'morph', formIds: ['slash-dot', 'slash-dot'] },
    ];
    const errors = validateContent(document);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown or disabled form card missing-form'),
      expect.stringContaining('unknown or disabled form card eval-signal-amplifier'),
      expect.stringContaining('deployed forms must be Character or VP cards'),
      expect.stringContaining('select at least one form card'),
      expect.stringContaining('each form may appear only once'),
    ]));
    findCard(document, 'eval-relocation-relay').onReveal = [{ action: 'morph', formIds: ['slash-dot'], selection: 'all' as never }];
    expect(validateContent(document)).toEqual(expect.arrayContaining([expect.stringContaining('expected sequential or random')]));
  });

  it('accepts Transfer flow and Bump zones and rejects unknown values', () => {
    const document = createDefaultContent();
    const card = findCard(document, 'eval-relocation-relay');
    card.onReveal = [
      { action: 'transferPower', amount: 2, direction: 'split', flow: 'pull', target: { type: 'node', which: 'neighbours' } },
      { action: 'bump', amount: 1, target: { type: 'zone', who: 'opponent', zone: 'wallet' }, pick: { mode: 'random' } },
    ];
    expect(validateContent(document)).toEqual([]);
    card.onReveal = [
      { action: 'transferPower', amount: 2, flow: 'sideways' as never, target: { type: 'node', which: 'neighbours' } },
      { action: 'bump', amount: 1, target: { type: 'zone', who: 'opponent', zone: 'deck' }, pick: { mode: 'random' } },
    ];
    expect(validateContent(document)).toEqual(expect.arrayContaining([expect.stringContaining('expected either, push or pull'), expect.stringContaining('zone: expected bank, wallet, bankOrWallet')]));
  });

  it('rejects unsupported gain counts, recurring effects without a Runtime duration, and unscored cards', () => {
    const document = createDefaultContent();
    findCard(document, 'eval-relocation-relay').onReveal = [{ action: 'gainCard', cardId: 'byte-coin', amount: 101, target: { type: 'zone', who: 'self', zone: 'deck' } }];
    findCard(document, 'eval-signal-amplifier').recurring = [{ action: 'changePower', amount: 2, target: { type: 'card', who: 'self', where: 'board', relation: 'self' } }];
    findCard(document, 'byte-coin').cryptoValue = undefined;
    findCard(document, 'vault-encryption').vp = undefined;
    expect(validateContent(document)).toEqual(expect.arrayContaining([
      expect.stringContaining('gain count must be an integer from 0 to 100'),
      expect.stringContaining('duration: schedule and recurring effects require'),
      expect.stringContaining('Crypto cards require an explicit payout'),
      expect.stringContaining('VP cards require explicit scoring points'),
    ]));
  });
});
