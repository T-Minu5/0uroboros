import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';
import { compileChains, starterCards, type Card, type EvaluationEffect } from '../src/game';
import { compileContent, createDefaultContent, validateContent } from '../src/authoring/contentModel';
import { deriveEffectText } from '../src/authoring/recipeModel';

const card = (id: string, effects: EvaluationEffect[] = [], extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, power: 2, onReveal: effects, ...extra });

function session() {
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(19) });
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

function play(game: RuntimeSession, source: Card) {
  game.state.players[0].hand.unshift(source);
  game.deploy(source.id, 0);
  game.endTurn();
  return finish(game);
}

const cryptoFrom = (events: RuntimeEvent[], name: string) => events.filter(event => event.text.startsWith(`${name}: +`) && event.text.endsWith('Crypto for Draft.'));

describe('chained effects', () => {
  it('compiles a chain flag into follow-ups and leaves unchained lists alone', () => {
    const plain: EvaluationEffect[] = [{ kind: 'draw', amount: 1 }, { kind: 'crypto', amount: 2 }];
    expect(compileChains(plain)).toEqual(plain);
    expect(compileChains([{ kind: 'draw', amount: 1 }, { kind: 'handDiscard', amount: 3, optional: true, chain: true }, { kind: 'crypto', amount: 4 }, { kind: 'vp', amount: 1 }]))
      .toEqual([{ kind: 'draw', amount: 1 }, { kind: 'handDiscard', amount: 3, optional: true, then: [{ kind: 'crypto', amount: 4 }, { kind: 'vp', amount: 1 }] }]);
    expect(compileChains([{ kind: 'crypto', amount: 1, chain: true }])).toEqual([{ kind: 'crypto', amount: 1 }]);
  });

  it('accepts chain on authored card effects and compiles it for play', () => {
    const content = createDefaultContent();
    const target = content.cards.find(item => item.type === 'Character')!;
    target.onReveal = [{ kind: 'handDiscard', amount: 3, optional: true, chain: true }, { kind: 'crypto', amount: 4 }];
    expect(validateContent(content)).toEqual([]);
    const compiled = compileContent(content).cards.find(item => item.id === target.id)!;
    expect(compiled.onReveal).toEqual([{ kind: 'handDiscard', amount: 3, optional: true, then: [{ kind: 'crypto', amount: 4 }] }]);
  });

  it('prints a chained step as "…, then …"', () => {
    expect(deriveEffectText([{ kind: 'destroyCard', opponent: true, cardRelation: 'next', chain: true }, { kind: 'crypto', amount: 2 }], 'card', []))
      .toMatch(/, then \+2 Crypto\.$/);
    expect(deriveEffectText([{ kind: 'draw', amount: 1 }, { kind: 'crypto', amount: 2 }], 'card', [])).toBe('+1 Card. +2 Crypto.');
  });

  it('lets the player skip an optional discard, forfeiting the chained reward', () => {
    const game = session();
    game.state.players[0].hand = [card('one'), card('two'), card('three')];
    play(game, card('broker', [{ kind: 'handDiscard', amount: 3, optional: true, chain: true }, { kind: 'crypto', amount: 4 }], { name: 'Broker' }));
    expect(game.state.choice?.options.map(option => option.id)).toEqual(['decline', 'pay']);
    game.choose('decline');
    expect(cryptoFrom(finish(game), 'Broker')).toHaveLength(0);
    expect(game.state.players[0].hand).toHaveLength(3);
  });

  it('pays the chained reward only after the full discard', () => {
    const game = session();
    game.state.players[0].hand = [card('one'), card('two'), card('three')];
    play(game, card('broker', [{ kind: 'handDiscard', amount: 3, optional: true, chain: true }, { kind: 'crypto', amount: 4 }], { name: 'Broker' }));
    game.choose('pay');
    expect(() => game.choose(['one', 'two'])).toThrow(/Choose 3/);
    expect(game.state.players[0].hand).toHaveLength(3);
    const events: RuntimeEvent[] = [game.choose(['one', 'two', 'three']), ...finish(game)];
    const discards = events.filter(event => event.target === 'discard');
    const rewards = cryptoFrom(events, 'Broker');
    expect(discards).toHaveLength(3);
    expect(rewards).toHaveLength(1);
    expect(events.indexOf(rewards[0])).toBeGreaterThan(events.indexOf(discards[2]));
    expect(game.state.players[0].discard.map(entry => entry.id)).toEqual(expect.arrayContaining(['one', 'two', 'three']));
  });

  it('holds a next-reveal reward until an enemy card actually reveals', () => {
    const game = session();
    const hack = card('hack', [{ kind: 'destroyCard', opponent: true, cardRelation: 'next', chain: true }, { kind: 'crypto', amount: 2 }], { power: 0, name: 'Hack' });
    const first = play(game, hack);
    expect(cryptoFrom(first, 'Hack')).toHaveLength(0);
    game.state.nodes[1].cards[1].push({ card: card('victim', [], { power: 5, name: 'Victim' }), owner: 1, node: 1, order: 99, revealed: false });
    game.endTurn();
    const events = finish(game);
    const destroyed = events.findIndex(event => event.text === 'Hack destroys Victim.');
    const paid = events.findIndex(event => cryptoFrom([event], 'Hack').length > 0);
    expect(destroyed).toBeGreaterThanOrEqual(0);
    expect(paid).toBeGreaterThan(destroyed);
  });

  it('never pays a next-reveal reward when the cycle ends first', () => {
    const game = session();
    const hack = card('hack', [{ kind: 'destroyCard', opponent: true, cardRelation: 'next', chain: true }, { kind: 'crypto', amount: 2 }], { power: 0, name: 'Hack' });
    const events = play(game, hack);
    const pending = () => (game as unknown as { nextRevealTriggers: unknown[] }).nextRevealTriggers;
    expect(pending()).toHaveLength(1);
    game.state.turn = 3;
    game.endTurn();
    events.push(...finish(game));
    expect(game.state.phase).not.toBe('runtime');
    expect(pending()).toHaveLength(0);
    expect(events.some(event => event.text.startsWith('Hack destroys'))).toBe(false);
    expect(cryptoFrom(events, 'Hack')).toHaveLength(0);
  });

  it('cancels follow-ups when the chained step finds no target', () => {
    const game = session();
    const events = play(game, card('snipe', [{ kind: 'destroyCard', opponent: true, chain: true }, { kind: 'crypto', amount: 2 }], { name: 'Snipe' }));
    expect(events.some(event => event.text === 'Snipe: chained effects cancelled.')).toBe(true);
    expect(cryptoFrom(events, 'Snipe')).toHaveLength(0);
  });

  it('runs follow-ups after a chained step that succeeds', () => {
    const game = session();
    const events = play(game, card('stack', [{ kind: 'vp', amount: 1, chain: true }, { kind: 'crypto', amount: 2 }], { name: 'Stack' }));
    expect(cryptoFrom(events, 'Stack')).toHaveLength(1);
  });
});
