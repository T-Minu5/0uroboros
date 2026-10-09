import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession, type VisiblePlacement } from '../src/runtime';
import { starterCards, type Card, type PlayerId } from '../src/game';
import { describeCard, describeStep } from '../src/effects/catalog';
import { builtinMod, setBuiltinModDetails } from '../src/builtinMods';
import { createDefaultContent, validateContent } from '../src/authoring/contentModel';
import { CardFace } from '../src/CardFace';

const card = (id: string, extra: Partial<Card> = {}): Card => ({ ...starterCards[0], id, name: id, power: 2, onReveal: [], ...extra });

function session() {
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(19) });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
  return game;
}

function reveal(game: RuntimeSession, target: Card, node: number, owner: PlayerId = 0, order = 1) {
  game.state.nodes[node].cards[owner].push({ card: target, owner, node, order, revealed: true });
}

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 400) throw new Error('stalled');
  }
  return events;
}

const shownPower = (game: RuntimeSession, id: string) => {
  const placement = game.view().nodes.flatMap(node => [...node.cards[0], ...node.cards[1]]).find(entry => entry.card.id === id) as VisiblePlacement | undefined;
  return placement && !('hidden' in placement.card) ? placement.card.power : undefined;
};

afterEach(() => setBuiltinModDetails(undefined));

describe('card-level aura', () => {
  it('adds its amount to other revealed allies at its Location only, with no mod badge', () => {
    const game = session();
    const rezz = card('rezz', { aura: 2 });
    reveal(game, rezz, 0);
    reveal(game, card('ally'), 0, 0, 2);
    reveal(game, card('elsewhere'), 1, 0, 3);
    reveal(game, card('enemy'), 0, 1, 4);
    expect(shownPower(game, 'ally')).toBe(4);
    expect(shownPower(game, 'rezz')).toBe(2);
    expect(shownPower(game, 'elsewhere')).toBe(2);
    expect(shownPower(game, 'enemy')).toBe(2);
    expect(renderToStaticMarkup(createElement(CardFace, { card: rezz }))).not.toContain('cf-modifier-badge');
  });

  it('prints its own ability text', () => {
    expect(describeCard({ aura: 2 })).toBe('Your other cards here have +2 Power.');
    expect(describeCard({ selfMove: 'cycle' })).toBe('Once each Cycle, you may move this card to another open Node.');
    expect(describeCard({ powerSource: 'movedByOwner', selfMove: 'cycle' })).toBe('+1 Power for each card you have moved this game. Once each Cycle, you may move this card to another open Node.');
  });
});

describe('move-counting Power', () => {
  it('counts every move for the game total and credits the mover for the owner count', () => {
    const game = session();
    reveal(game, card('z-mobile', { power: 0, powerSource: 'moved' }), 0);
    reveal(game, card('t-moble', { power: 0, powerSource: 'movedByOwner' }), 0, 0, 2);
    reveal(game, card('enemy-t', { power: 0, powerSource: 'movedByOwner' }), 1, 1, 3);
    reveal(game, card('rover', { selfMove: 'turn' }), 2, 0, 4);
    game.relocateCard('rover', 1);
    expect(game.state.movedTotal).toBe(1);
    expect(game.state.players[0].moved).toBe(1);
    expect(game.state.players[1].moved).toBe(0);
    expect(shownPower(game, 'z-mobile')).toBe(1);
    expect(shownPower(game, 't-moble')).toBe(1);
    expect(shownPower(game, 'enemy-t')).toBe(0);
  });
});

describe('self-move', () => {
  it('lets a once-per-Cycle card move itself once, staying spent on the next Runtime turn', () => {
    const game = session();
    reveal(game, card('mobile', { selfMove: 'cycle' }), 0);
    reveal(game, card('runner', { selfMove: 'turn' }), 2, 0, 2);
    expect(game.view().movableCardIds).toEqual(expect.arrayContaining(['mobile', 'runner']));
    game.relocateCard('mobile', 1);
    game.relocateCard('runner', 1);
    expect(game.view().movableCardIds).toEqual([]);
    expect(() => game.relocateCard('mobile', 2)).toThrow(/already moved this Cycle/i);
    game.endTurn();
    finish(game);
    expect(game.state).toMatchObject({ phase: 'runtime', turn: 2 });
    expect(game.view().movableCardIds).toEqual(['runner']);
    expect(() => game.relocateCard('mobile', 2)).toThrow(/already moved this Cycle/i);
  });

  it('refuses cards with no move ability', () => {
    const game = session();
    reveal(game, card('anchor'), 0);
    expect(game.view().movableCardIds).toEqual([]);
    expect(() => game.relocateCard('anchor', 1)).toThrow(/not movable/i);
  });
});

describe('Undo all actions', () => {
  it('returns moved cards, their move allowance and move counts along with placements', () => {
    const game = session();
    const mobile = card('mobile', { selfMove: 'cycle' });
    reveal(game, mobile, 0);
    game.state.players[0].hand = [card('planned')];
    game.relocateCard('mobile', 1);
    game.deploy('planned', 2);
    expect(game.view().canUndoPlanning).toBe(true);
    game.undoAllPlanning();
    const home = game.state.nodes[0].cards[0].find(entry => entry.card.id === 'mobile');
    expect(home?.node).toBe(0);
    expect(game.state.nodes[1].cards[0]).toHaveLength(0);
    expect(game.state.nodes[2].cards[0]).toHaveLength(0);
    expect(game.state.players[0].hand.map(entry => entry.id)).toEqual(['planned']);
    expect(game.state.movedTotal).toBe(0);
    expect(game.state.players[0].moved).toBe(0);
    expect(game.view().movableCardIds).toContain('mobile');
  });

  it('is offered after a move alone', () => {
    const game = session();
    reveal(game, card('rover', { modifiers: [{ id: 'm1', kind: 'movableEachTurn' }] }), 0);
    game.relocateCard('rover', 1);
    expect(game.view().canUndoPlanning).toBe(true);
    game.undoAllPlanning();
    expect(game.state.nodes[0].cards[0].map(entry => entry.card.id)).toEqual(['rover']);
    expect(game.view().movableCardIds).toContain('rover');
  });
});

describe('editable built-in mods', () => {
  it('uses edited names, badges and text everywhere, filling N with the aura amount', () => {
    setBuiltinModDetails({ powerAuraAtLocation: { name: 'Hype N', badge: '[N!]' }, movableEachTurn: { text: 'Slides around.' } });
    expect(builtinMod('powerAuraAtLocation', 3)).toMatchObject({ name: 'Hype 3', badge: '[3!]' });
    expect(builtinMod('movableEachTurn')).toMatchObject({ name: 'Movable once each turn', text: 'Slides around.' });
    expect(describeStep({ action: 'attachModifier', modifier: 'powerAuraAtLocation', amount: 2, target: { type: 'card', where: 'board', who: 'self', relation: 'self' } } as never, 'card')).toContain('Hype 2');
    const host = card('host', { modifiers: [{ id: 'a', kind: 'powerAuraAtLocation', amount: 2 }] });
    expect(renderToStaticMarkup(createElement(CardFace, { card: host }))).toContain('[2!]');
  });

  it('validates the overrides and the new card fields', () => {
    const doc = createDefaultContent();
    expect(validateContent({ ...doc, builtinMods: { movableEachTurn: { name: 'Glide' } } })).toEqual([]);
    expect(validateContent({ ...doc, builtinMods: { unknownMod: { name: 'X' } } })).toContain('builtinMods.unknownMod: not a built-in mod');
    expect(validateContent({ ...doc, builtinMods: { movableEachTurn: { badge: '' } } }).join()).toMatch(/builtinMods\.movableEachTurn\.badge/);
    const character = doc.cards.findIndex(entry => entry.type === 'Character');
    const vp = doc.cards.findIndex(entry => entry.type === 'VP');
    const withCard = (index: number, extra: object) => ({ ...doc, cards: doc.cards.map((entry, at) => at === index ? { ...entry, ...extra } : entry) });
    expect(validateContent(withCard(character, { aura: 2, selfMove: 'cycle', powerSource: 'movedByOwner' }))).toEqual([]);
    expect(validateContent(withCard(vp, { aura: 2 })).join()).toMatch(/aura/);
    expect(validateContent(withCard(character, { selfMove: 'always' })).join()).toMatch(/selfMove/);
  });
});
