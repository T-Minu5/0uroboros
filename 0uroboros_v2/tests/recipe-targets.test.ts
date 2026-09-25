import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';
import { starterCards, type Card, type EvaluationEffect, type PlayerId } from '../src/game';

const card = (id: string, effects: EvaluationEffect[] = [], extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, onReveal: effects, ...extra });

function session() {
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, random: seededRandom(19) });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
  return game;
}

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 300) throw new Error('Recipe resolution stalled.');
  }
  return events;
}

function play(game: RuntimeSession, source: Card, owner: PlayerId = 0) {
  if (owner === 0) {
    game.state.players[0].hand.unshift(source);
    game.deploy(source.id, 0);
  } else {
    game.state.nodes[0].cards[1].push({ card: source, owner: 1, node: 0, order: 0, revealed: false });
  }
  game.endTurn();
  return finish(game);
}

describe('effect recipe quantities and recipients', () => {
  it('gains three independent Crypto copies on top in creation order without changing market stock', () => {
    const game = session();
    game.state.players[0].draw = [card('existing')];
    const stock = game.state.market.map(pile => [pile.id, pile.supply]);
    const events = play(game, card('source', [{ kind: 'gain', cardId: 'mega-cache', amount: 3 }]));
    const gain = events.find(event => event.kind === 'draw' && event.cardId?.includes(':generated-'))!;
    const copies = game.state.players[0].draw.slice(0, 3);
    expect(copies.map(copy => copy.definitionId)).toEqual(['mega-cache', 'mega-cache', 'mega-cache']);
    expect(copies.map(copy => copy.cryptoValue)).toEqual([5, 5, 5]);
    expect(new Set(copies.map(copy => copy.id)).size).toBe(3);
    expect(copies.map(copy => copy.id)).toEqual([...copies.map(copy => copy.id)].sort());
    expect(game.state.players[0].draw[3].id).toBe('existing');
    expect(gain).toMatchObject({ owner: 0, targetOwner: 0, amount: 3, cardId: copies[0].id, definitionId: 'mega-cache' });
    expect(gain.target).toBeUndefined();
    expect(game.state.market.map(pile => [pile.id, pile.supply])).toEqual(stock);
  });

  it('gains three VP cards into the opposing hand and updates the recipient score', () => {
    const game = session();
    game.state.players[1].hand = [card('already-held', [], { type: 'Crypto' })];
    game.state.players[1].actions = 0;
    const events = play(game, card('source', [{ kind: 'gain', cardId: 'basic-encryption', amount: 3, destination: 'hand', opponent: true }]));
    const gained = game.state.players[1].hand.slice(1);
    expect(gained).toHaveLength(3);
    expect(new Set(gained.map(copy => copy.id)).size).toBe(3);
    expect(gained.every(copy => copy.id.startsWith('1:generated-') && copy.definitionId === 'basic-encryption')).toBe(true);
    expect(game.state.players[1].totalVP).toBe(3 * gained[0].vp!);
    expect(game.state.players[0].totalVP).toBe(0);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: 'draw', owner: 0, targetOwner: 1, target: 'hand', amount: 3, before: 1, after: 4,
    })]));
  });

  it('routes gains from an opponent-owned source, and keeps legacy one-card Discard gain and zero harmless', () => {
    const game = session();
    const events = play(game, card('enemy-source', [
      { kind: 'gain', cardId: 'mega-cache', amount: 0, destination: 'discard', opponent: true },
      { kind: 'gain', cardId: 'mega-cache', destination: 'discard', opponent: true },
    ]), 1);
    expect(game.state.players[0].discard).toHaveLength(1);
    expect(game.state.players[0].discard[0].id).toMatch(/^0:generated-/);
    expect(game.state.players[1].discard).toHaveLength(0);
    expect(events.filter(event => event.kind === 'draw' && event.sourceName === 'Slash-Dot')).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: 1, targetOwner: 0, target: 'discard', amount: 0 }),
      expect.objectContaining({ owner: 1, targetOwner: 0, target: 'discard', amount: 1 }),
    ]));
  });

  it('rejects invalid gain counts before creating cards', () => {
    const game = session();
    game.state.players[0].hand = [card('source', [{ kind: 'gain', cardId: 'mega-cache', amount: 101 }])];
    game.deploy('source', 0);
    game.endTurn();
    expect(game.step()?.event.kind).toBe('reveal');
    expect(() => game.step()).toThrow(/Gain count must be an integer from 0 to 100/);
    expect(game.state.players[0].draw).toHaveLength(0);
  });

  it('draws for the opposite player across a shuffle shortage and reports actual cards received', () => {
    const game = session();
    game.state.players[1].draw = [card('first')];
    game.state.players[1].discard = [card('second'), card('third')];
    const events = play(game, card('source', [{ kind: 'draw', amount: 4, opponent: true }]));
    expect(game.state.players[1].hand.map(item => item.id)[0]).toBe('first');
    expect(new Set(game.state.players[1].hand.map(item => item.id))).toEqual(new Set(['first', 'second', 'third']));
    expect(game.state.players[1].draw).toHaveLength(0);
    expect(game.state.players[1].discard).toHaveLength(0);
    expect(game.state.players[0].hand).toHaveLength(0);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: 'draw', owner: 0, cardId: 'source', targetOwner: 1, target: 'hand', amount: 3, before: 0, after: 3,
    })]));
  });

  it('credits ordinary Crypto and pending Actions to either player while preserving the source owner', () => {
    const game = session();
    const events = play(game, card('source', [
      { kind: 'crypto', amount: 2 }, { kind: 'actions', amount: 1 },
      { kind: 'crypto', amount: 3, opponent: true }, { kind: 'actions', amount: 2, opponent: true },
    ]));
    expect([game.state.players[0].wallet, game.state.players[1].wallet]).toEqual([2, 3]);
    expect([game.state.players[0].actions, game.state.players[1].actions]).toEqual([3, 5]);
    expect(game.state.players.map(player => player.pendingActions)).toEqual([0, 0]);
    expect(events.filter(event => event.cardId === 'source' && ['crypto', 'actions'].includes(event.kind))).toEqual([
      expect.objectContaining({ kind: 'crypto', owner: 0, targetOwner: 0, target: 'wallet', amount: 2, before: 0, after: 2 }),
      expect.objectContaining({ kind: 'actions', owner: 0, targetOwner: 0, target: 'actions', amount: 1, before: 0, after: 1 }),
      expect.objectContaining({ kind: 'crypto', owner: 0, targetOwner: 1, target: 'wallet', amount: 3, before: 0, after: 3 }),
      expect.objectContaining({ kind: 'actions', owner: 0, targetOwner: 1, target: 'actions', amount: 2, before: 0, after: 2 }),
    ]);
  });

  it('routes an opponent-owned draw, Crypto, and pending Actions back to the local player', () => {
    const game = session();
    game.state.players[0].draw = [card('local-draw')];
    const events = play(game, card('enemy-source', [
      { kind: 'draw', amount: 1, opponent: true },
      { kind: 'crypto', amount: 4, opponent: true },
      { kind: 'actions', amount: 1, opponent: true },
    ]), 1);
    expect(game.state.players[0].hand.map(item => item.id)).toEqual(['local-draw']);
    expect(game.state.players[1].hand).toHaveLength(0);
    expect([game.state.players[0].wallet, game.state.players[1].wallet]).toEqual([4, 0]);
    expect([game.state.players[0].actions, game.state.players[1].actions]).toEqual([4, 3]);
    expect(events.filter(event => event.cardId === 'enemy-source' && ['draw', 'crypto', 'actions'].includes(event.kind))).toEqual([
      expect.objectContaining({ kind: 'draw', owner: 1, targetOwner: 0, target: 'hand', amount: 1 }),
      expect.objectContaining({ kind: 'crypto', owner: 1, targetOwner: 0, target: 'wallet', amount: 4 }),
      expect.objectContaining({ kind: 'actions', owner: 1, targetOwner: 0, target: 'actions', amount: 1 }),
    ]);
  });

  it('credits scheduled start Actions to the opposing current turn', () => {
    const game = session();
    const events = play(game, card('timed', [], {
      duration: 2, durationPeriod: 'runtime',
      schedule: [{ at: 2, timing: 'start', effects: [{ kind: 'actions', amount: 3, opponent: true }] }],
    }));
    expect(game.state.players[0].actions).toBe(2);
    expect(game.state.players[1].actions).toBe(6);
    expect(game.state.players.map(player => player.pendingActions)).toEqual([0, 0]);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({
      kind: 'actions', owner: 0, cardId: 'timed', targetOwner: 1, target: 'actions', amount: 3, before: 3, after: 6,
    })]));
  });

  it('retains existing Data Center targets even when opponent is specified on drain and restore', () => {
    const game = session();
    game.state.players[0].centers.primary = 1800;
    game.state.players[1].centers.primary = 1900;
    const events = play(game, card('source', [
      { kind: 'drain', amount: 5, opponent: false },
      { kind: 'restore', amount: 5, opponent: true },
    ]));
    expect(game.state.players[0].centers.primary).toBe(1805);
    expect(game.state.players[1].centers.primary).toBe(1895);
    expect(events.filter(event => ['drain', 'restore'].includes(event.kind))).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'drain', owner: 0, targetOwner: 1, target: 'primary' }),
      expect.objectContaining({ kind: 'restore', owner: 0, targetOwner: 0, target: 'primary' }),
    ]));
  });
});
