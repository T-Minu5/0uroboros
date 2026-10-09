import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';
import { starterCards, type Card } from '../src/game';
import type { ChoiceOption, EffectStep } from '../src/effects/types';
import type { ContentDocument } from '../src/authoring/contentModel';
import authored from '../content/authored-content.json';

const you = { type: 'player', who: 'self' } as const;
const crypto = (amount: number): EffectStep => ({ action: 'gainCrypto', amount, target: you });
const option = (id: string, effects: EffectStep[], cost?: EffectStep[]): ChoiceOption => ({ id, label: id, effects, ...(cost ? { cost } : {}) });
const card = (id: string, onReveal: EffectStep[]): Card => ({ ...starterCards[0], id, name: id, power: 2, onReveal });

function session() {
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(7) });
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

describe('choice options', () => {
  it('lets the opponent pick, and the AI opponent picks the option worth least to the card owner', () => {
    const game = session();
    play(game, card('Fork', [{ action: 'choice', choose: { count: 1, chooser: 'opponent' }, options: [option('big', [crypto(5)]), option('small', [crypto(1)])] }]));
    expect(game.state.choice).toBeNull();
    expect(game.state.players[0].wallet).toBe(1);
    expect(game.state.players[1].wallet).toBe(0);
  });

  it('picks N of M options and resolves each chosen option in order', () => {
    const game = session();
    play(game, card('Menu', [{ action: 'choice', choose: { count: 2, chooser: 'self' }, options: [option('one', [crypto(1)]), option('two', [crypto(2)]), option('four', [crypto(4)])] }]));
    expect(game.state.choice?.select).toEqual({ min: 2, max: 2 });
    expect(() => game.choose(['one'])).toThrow();
    game.choose(['one', 'four']);
    finish(game);
    expect(game.state.players[0].wallet).toBe(5);
  });

  it('shows an unpayable option disabled and refuses it', () => {
    const game = session();
    play(game, card('Toll', [{ action: 'choice', options: [option('free', [crypto(1)]), option('paid', [crypto(6)], [{ action: 'payCrypto', amount: 3, target: you }])] }]));
    expect(game.state.choice?.options.find(entry => entry.id === 'paid')?.disabled).toBe(true);
    expect(() => game.choose('paid')).toThrow(/legal option/);
    game.choose('free');
    finish(game);
    expect(game.state.players[0].wallet).toBe(1);
  });

  it('pays the cost before the option effects resolve', () => {
    const game = session();
    game.state.players[0].wallet = 4;
    play(game, card('Toll', [{ action: 'choice', options: [option('free', [crypto(1)]), option('paid', [crypto(6)], [{ action: 'payCrypto', amount: 3, target: you }])] }]));
    expect(game.state.choice?.options.find(entry => entry.id === 'paid')?.disabled).toBeUndefined();
    game.choose('paid');
    finish(game);
    expect(game.state.players[0].wallet).toBe(7);
  });

  it('prints option costs in the in-game choice labels', () => {
    const game = session();
    play(game, card('Toll', [{ action: 'choice', options: [option('free', [crypto(1)]), option('paid', [crypto(6)], [{ action: 'payCrypto', amount: 3, target: you }])] }]));
    expect(game.state.choice?.options.map(entry => entry.label)).toEqual(['free', 'paid (Pay 3 Crypto)']);
  });

  it('plays the saved Forked Signal menu from authored content', () => {
    const saved = (authored as unknown as { document: ContentDocument }).document;
    const forked = saved.cards.find(entry => entry.name === 'Forked Signal')!;
    const gained = (forked.onReveal![0] as EffectStep).options!.find(entry => entry.id === 'crypto')!.effects[0].amount;
    for (const [pick, check] of [['crypto', (g: RuntimeSession) => g.state.players[0].wallet === gained], ['draw', (g: RuntimeSession) => g.state.players[0].hand.length === 1]] as const) {
      const game = session();
      game.state.players[0].draw = [{ ...starterCards[0], id: 'drawn' }];
      play(game, structuredClone(forked) as Card);
      expect(game.state.choice?.options.map(entry => entry.id)).toEqual(['crypto', 'draw']);
      game.choose(pick);
      finish(game);
      expect(check(game)).toBe(true);
    }
  });
});
