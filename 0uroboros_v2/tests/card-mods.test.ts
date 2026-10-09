import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent, validateContent, type AuthoredMod } from '@0uroboros/engine/authoring/contentModel';
import { describeIssues } from '../src/authoring/validationIssues';
import { describeMod, describeStep, modBadge } from '@0uroboros/engine/effects/catalog';
import type { EffectStep } from '@0uroboros/engine/effects/types';
import { starterCards, type Card, type CardModifier } from '@0uroboros/engine/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';

const you = { type: 'player', who: 'self' } as const;
const crypto = (amount: number): EffectStep => ({ action: 'gainCrypto', amount, target: you });
const overclock: AuthoredMod = { id: 'overclock', name: 'Overclock', enabled: true, onReveal: [crypto(2)] };
const card = (id: string, extra: Partial<Card> = {}): Card => ({ ...starterCards[0], id, name: id, type: 'Character', power: 2, onReveal: [], ...extra });
const carried = (id: string, hooks: Pick<CardModifier, 'onReveal' | 'onCollapse' | 'recurring'>, modId = 'overclock'): CardModifier =>
  ({ id, kind: 'authored', modId, name: 'Overclock', badge: modBadge(hooks), ...hooks });

function session(mods: AuthoredMod[] = [overclock]) {
  const document = createDefaultContent();
  document.mods = mods;
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(11), content: compileContent(document) });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
  return game;
}

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 400) throw new Error('stalled');
  }
  return events;
}

function play(game: RuntimeSession, source: Card, node = 0) {
  game.state.players[0].hand.unshift(source);
  game.deploy(source.id, node);
  game.endTurn();
  return finish(game);
}

describe('authored card mods', () => {
  it('validates mods and the steps that name them', () => {
    const document = createDefaultContent();
    document.mods = [overclock];
    document.cards[0].onReveal = [{ action: 'attachModifier', modifier: 'overclock', target: { type: 'card', who: 'self', where: 'collection' } }];
    expect(validateContent(document)).toEqual([]);

    document.mods = [{ ...overclock, enabled: false }, { id: 'movableEachTurn', name: 'Clash', enabled: true }];
    const errors = validateContent(document);
    expect(errors).toEqual(expect.arrayContaining([
      'cards[0].onReveal[0].modifier: unknown or disabled mod overclock',
      'mods[1].id: movableEachTurn is a built-in modifier; choose another ID',
      'mods[1].onReveal: add at least one effect',
    ]));
    const issue = describeIssues(document, errors).find(entry => entry.section === 'mods');
    expect(issue).toMatchObject({ itemName: 'Clash', field: 'id' });
  });

  it('compiles only enabled mods, without the enabled flag', () => {
    const document = createDefaultContent();
    document.mods = [overclock, { ...overclock, id: 'spare', name: 'Spare', enabled: false }];
    expect(compileContent(document).mods).toEqual([{ id: 'overclock', name: 'Overclock', onReveal: [crypto(2)] }]);
  });

  it('prints mod names, Remove steps, and a badge generated from what the mod does', () => {
    const mods = [overclock];
    const host = { type: 'card', who: 'self', where: 'board', relation: 'next' } as const;
    expect(describeStep({ action: 'attachModifier', modifier: 'overclock', target: host }, 'card', [], mods)).toBe('Attach the “Overclock” mod to your next revealed card');
    expect(describeStep({ action: 'removeModifier', target: { type: 'card', who: 'opponent', where: 'board' }, pick: { mode: 'all' } }, 'card', [], mods)).toBe('Remove every mod from all enemy revealed cards');
    expect(describeStep({ action: 'removeModifier', modifier: 'overclock', target: { type: 'card', who: 'self', where: 'collection' }, pick: { mode: 'first' } }, 'card', [], mods))
      .toBe('Remove “Overclock” from the first card carrying it in your deck, Discard or hand');
    expect(modBadge(overclock)).toBe('[◉+2₵]');
    expect(modBadge({ recurring: [{ action: 'draw', amount: 1, target: you }], onCollapse: [crypto(1)] })).toBe('[▼↻+1₵…]');
    expect(describeMod({ onReveal: [crypto(2)], recurring: [{ action: 'draw', amount: 1, target: you }] })).toBe('When revealed: +2 Crypto. Each later Runtime turn: +1 Card.');
  });

  it('attaches an authored mod as a snapshot that runs when the host is revealed', () => {
    const game = session();
    const host = card('host');
    game.state.players[0].draw = [host];
    play(game, card('rigger', { onReveal: [{ action: 'attachModifier', modifier: 'overclock', target: { type: 'card', who: 'self', where: 'collection' }, pick: { mode: 'first' } }] }));
    expect(host.modifiers).toEqual([expect.objectContaining({ kind: 'authored', modId: 'overclock', name: 'Overclock', badge: '[◉+2₵]', onReveal: [crypto(2)], sourceName: 'rigger' })]);

    const next = session();
    next.state.players[0].actions = 5;
    host.modifiers = [...host.modifiers!, carried('m2', { onReveal: [crypto(2)] })];
    play(next, host);
    expect(next.state.players[0].wallet).toBe(4);
  });

  it('attaches to any of several chosen card classes, and says so on the card', () => {
    const game = session();
    const utility = card('utility', { cardClass: 'Utility' }), runtime = card('runtime', { cardClass: 'Runtime' });
    game.state.players[0].draw = [utility, runtime];
    const target = { type: 'card', who: 'self', where: 'collection', filter: { cardType: 'Character', cardClass: ['Action', 'Runtime'] } } as const;
    play(game, card('rigger', { onReveal: [{ action: 'attachModifier', modifier: 'overclock', target, pick: { mode: 'first' } }] }));
    expect(utility.modifiers).toBeUndefined();
    expect(runtime.modifiers).toEqual([expect.objectContaining({ modId: 'overclock' })]);

    expect(describeStep({ action: 'attachModifier', modifier: 'overclock', target }, 'card', [], [overclock])).toBe('Attach the “Overclock” mod to an Action or Runtime Character in your deck');
    expect(describeStep({ action: 'attachModifier', modifier: 'overclock', target: { ...target, filter: { cardClass: 'Hacker' } } }, 'card', [], [overclock])).toBe('Attach the “Overclock” mod to a Hacker Character in your deck');

    const document = createDefaultContent();
    document.mods = [overclock];
    document.cards[0].onReveal = [{ action: 'attachModifier', modifier: 'overclock', target }];
    expect(validateContent(document)).toEqual([]);
    document.cards[0].onReveal = [{ action: 'attachModifier', modifier: 'overclock', target: { ...target, filter: { cardClass: ['Action', 'Wizard' as never] } } }];
    expect(validateContent(document)).toContain('cards[0].onReveal[0].target.filter.cardClass: unknown class Wizard');
  });

  it('runs mod effects once even when printed effects are doubled', () => {
    const game = session();
    play(game, card('twin', { onReveal: [crypto(1)], modifiers: [{ id: 'm0', kind: 'doublePrintedEffects' }, carried('m1', { onReveal: [crypto(5)] })] }));
    expect(game.state.players[0].wallet).toBe(1 + 1 + 5);
  });

  it('runs every-turn mod effects at the start of each later Runtime turn while revealed', () => {
    const game = session();
    const host = card('ticker', { modifiers: [carried('m1', { recurring: [crypto(1)] })] });
    const events = play(game, host);
    expect(events.filter(event => event.kind === 'crypto' && event.cardId === 'ticker')).toHaveLength(1);
    expect(game.state.turn).toBe(2);
    expect(game.state.players[0].wallet).toBe(1);
  });

  it('runs collapse mod effects in Wave Collapse', () => {
    const game = session();
    game.state.nodes[0].cards[0].push({ card: card('anchor', { power: 9, modifiers: [carried('m1', { onCollapse: [crypto(3)] })] }), owner: 0, node: 0, order: 0, revealed: true });
    game.state.turn = 3;
    game.endTurn();
    expect(finish(game).some(event => event.kind === 'crypto' && event.cardId === 'anchor' && event.amount === 3)).toBe(true);
  });

  it('removes every mod, or only the named one, from board and deck cards', () => {
    const game = session();
    const host = card('host', { modifiers: [carried('m1', { onReveal: [crypto(2)] }), { id: 'm2', kind: 'movableEachTurn' }] });
    game.state.nodes[1].cards[0].push({ card: host, owner: 0, node: 1, order: 0, revealed: true });
    play(game, card('scrub', { onReveal: [{ action: 'removeModifier', modifier: 'overclock', target: { type: 'card', who: 'self', where: 'board' }, pick: { mode: 'all' } }] }));
    expect(host.modifiers).toEqual([{ id: 'm2', kind: 'movableEachTurn' }]);

    const deck = session();
    const stored = card('stored', { modifiers: [carried('m3', { onReveal: [crypto(2)] }), { id: 'm4', kind: 'doublePrintedEffects' }] });
    deck.state.players[0].draw = [card('plain'), stored];
    play(deck, card('wipe', { onReveal: [{ action: 'removeModifier', target: { type: 'card', who: 'self', where: 'collection' }, pick: { mode: 'first' } }] }));
    expect(stored.modifiers).toBeUndefined();
  });

  it('finds no target when nothing carries a matching mod', () => {
    const game = session();
    game.state.nodes[1].cards[1].push({ card: card('bare'), owner: 1, node: 1, order: 0, revealed: true });
    const events = play(game, card('scrub', { onReveal: [{ action: 'removeModifier', target: { type: 'card', who: 'opponent', where: 'board' }, pick: { mode: 'all' } }] }));
    expect(events.some(event => event.cardId === 'scrub' && /No target/.test(event.text))).toBe(true);
  });
});
