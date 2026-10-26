import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent } from '@0uroboros/engine/authoring/contentModel';
import { describeStep, validateSteps, type ValidationCards } from '@0uroboros/engine/effects/catalog';
import type { CardWhere, EffectStep, PickMode, Who } from '@0uroboros/engine/effects/types';
import { starterCards, type Card } from '@0uroboros/engine/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';

const card = (id: string, extra: Partial<Card> = {}): Card => ({ ...starterCards[0], id, name: id, type: 'Character', power: 2, onReveal: [], ...extra });
const coin = (id: string): Card => ({ ...starterCards[0], id, name: id, type: 'Crypto', cryptoValue: 1, power: undefined, onReveal: [] });
const step = (action: EffectStep['action'], where: CardWhere, who: Who = 'opponent', mode: PickMode = 'random', extra: Partial<EffectStep> = {}): EffectStep =>
  ({ action, target: { type: 'card', who, where }, pick: { mode }, ...extra });
const validation: ValidationCards = { enabledIds: new Set(), types: new Map() };

function session() {
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(5), content: compileContent(createDefaultContent()), midCycleDraw: false,
  });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
  game.state.players[1].actions = 0;
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

function play(game: RuntimeSession, effect: EffectStep) {
  const source = card('source', { onReveal: [effect] });
  game.state.players[0].hand.unshift(source);
  game.deploy(source.id, 0);
  game.endTurn();
  return finish(game);
}

describe('card targets off the board', () => {
  it('validates and prints every place for either side', () => {
    for (const where of ['board', 'thisNode', 'hand', 'bank', 'wallet', 'deckTop', 'deckBottom'] as const) {
      for (const who of ['self', 'opponent'] as const) {
        const errors: string[] = [];
        validateSteps([step('destroyCard', where, who, 'choose', { pick: { mode: 'choose', chooser: 'opponent' } })], 'onReveal', 'card', validation, errors);
        expect(errors).toEqual([]);
      }
    }
    expect(describeStep(step('trashCard', 'hand', 'opponent', 'random'), 'card')).toBe('Trash a card in enemy hand');
    expect(describeStep(step('destroyCard', 'wallet', 'opponent', 'choose', { pick: { mode: 'choose', chooser: 'opponent' } }), 'card')).toBe('Opponent chooses a card in enemy wallet to destroy');
    expect(describeStep(step('destroyCard', 'deckTop', 'opponent', 'choose', { pick: { mode: 'choose', count: 2 } }), 'card')).toBe('Destroy the top 2 cards of enemy deck');
    expect(describeStep(step('changePower', 'deckBottom', 'self', 'choose', { amount: 2 }), 'card')).toBe('+2 Power to the bottom card of your deck');
    const errors: string[] = [];
    validateSteps([step('changePower', 'wallet', 'self', 'random', { amount: 1 })], 'onReveal', 'card', validation, errors);
    expect(errors.some(error => error.startsWith('onReveal[0].target: where'))).toBe(true);
  });

  it('trashes a random card from the enemy hand', () => {
    const game = session();
    game.state.players[1].hand = [card('foe-a'), card('foe-b')];
    play(game, step('trashCard', 'hand'));
    expect(game.state.players[1].hand).toHaveLength(1);
    expect(game.state.trash.map(entry => entry.id)).toEqual(expect.arrayContaining([expect.stringMatching(/^foe-/)]));
  });

  it('destroys the top and the bottom card of the enemy deck', () => {
    const game = session();
    game.state.players[1].draw = [card('top'), card('middle'), card('bottom')];
    play(game, step('destroyCard', 'deckTop'));
    expect(game.state.players[1].destroyed.map(entry => entry.id)).toEqual(['top']);
    const again = session();
    again.state.players[1].draw = [card('top'), card('middle'), card('bottom')];
    play(again, step('destroyCard', 'deckBottom'));
    expect(again.state.players[1].destroyed.map(entry => entry.id)).toEqual(['bottom']);
    expect(again.state.players[1].draw.map(entry => entry.id)).toEqual(['top', 'middle']);
  });

  it('trashes a Crypto card from the enemy wallet and leaves other hand cards alone', () => {
    const game = session();
    game.state.players[1].hand = [card('keeper'), coin('coin')];
    play(game, step('trashCard', 'wallet'));
    expect(game.state.players[1].hand.map(entry => entry.id)).toEqual(['keeper']);
    expect(game.state.trash.map(entry => entry.id)).toContain('coin');
  });

  it('destroys a card in the Effect Bank', () => {
    const game = session();
    game.state.players[1].bank = [{ card: card('banked'), enteredCycle: 1, order: 1 }];
    play(game, step('destroyCard', 'bank'));
    expect(game.state.players[1].bank).toEqual([]);
    expect(game.state.players[1].destroyed.map(entry => entry.id)).toEqual(['banked']);
  });

  it('changes Power on a card in your hand, and it keeps the change', () => {
    const game = session();
    game.state.players[0].hand = [card('mine')];
    play(game, step('changePower', 'hand', 'self', 'all', { amount: 3 }));
    const mine = [...game.state.players[0].hand, ...game.state.nodes.flatMap(node => node.cards[0].map(placement => placement.card))].find(entry => entry.id === 'mine');
    expect(mine?.powerDelta).toBe(3);
  });

  it('lets the opponent choose which of their hand cards is trashed', () => {
    const game = session();
    game.state.players[0].hand = [card('mine')];
    game.state.players[1].hand = [card('weak', { power: 1 }), card('strong', { power: 9 })];
    const events = play(game, step('trashCard', 'hand', 'opponent', 'choose', { pick: { mode: 'choose', chooser: 'opponent' } }));
    expect(events.some(event => event.text.startsWith('Opponent chooses'))).toBe(true);
    expect(game.state.trash.map(entry => entry.id)).toContain('weak');
    expect(game.state.players[1].hand.map(entry => entry.id)).toEqual(['strong']);
  });

  it('asks you to choose from the enemy hand, showing the cards', () => {
    const game = session();
    game.state.players[1].hand = [card('foe-a'), card('foe-b')];
    const source = card('source', { onReveal: [step('destroyCard', 'hand', 'opponent', 'choose')] });
    game.state.players[0].hand.unshift(source);
    game.deploy(source.id, 0);
    game.endTurn();
    while (game.pendingCount && !game.state.choice) game.step();
    expect(game.state.choice?.owner).toBe(0);
    expect(game.state.choice?.prompt).toMatch(/in the opponent's hand to destroy/);
    game.choose('card-foe-b');
    finish(game);
    expect(game.state.players[1].destroyed.map(entry => entry.id)).toEqual(['foe-b']);
  });

  it('destroys a random card from the enemy deck', () => {
    const game = session();
    game.state.players[1].draw = [card('top'), card('middle'), card('bottom')];
    play(game, step('destroyCard', 'deck'));
    expect(game.state.players[1].destroyed).toHaveLength(1);
    expect(game.state.players[1].draw).toHaveLength(2);
  });

  it('changes the Power of a card in your Effect Bank', () => {
    const game = session();
    const stored = card('stored');
    game.state.players[0].bank = [{ card: stored, enteredCycle: 1, order: 0 }];
    play(game, step('changePower', 'bank', 'self', 'random', { amount: 2 }));
    expect(stored.powerDelta).toBe(2);
  });

  it('bulk Trash takes random cards from the enemy deck', () => {
    const game = session();
    game.state.players[1].draw = [card('one'), card('two'), card('three')];
    play(game, step('trashCards', 'deck', 'opponent', 'random', { amount: 2 }));
    expect(game.state.players[1].draw).toHaveLength(1);
    expect(game.state.trash.filter(entry => ['one', 'two', 'three'].includes(entry.id))).toHaveLength(2);
  });

  it('trashes and destroys cards from Discard and opens a discard-zone choice when picking', () => {
    const trashGame = session();
    trashGame.state.players[0].discard = [card('junk-a'), card('junk-b')];
    play(trashGame, step('trashCard', 'discard', 'self', 'random'));
    expect(trashGame.state.players[0].discard).toHaveLength(1);
    expect(trashGame.state.trash.map(entry => entry.id)).toEqual(expect.arrayContaining([expect.stringMatching(/^junk-/)]));

    const destroyGame = session();
    destroyGame.state.players[0].discard = [card('scrap')];
    play(destroyGame, step('destroyCard', 'discard', 'self', 'random'));
    expect(destroyGame.state.players[0].discard).toHaveLength(0);
    expect(destroyGame.state.players[0].destroyed.map(entry => entry.id)).toEqual(['scrap']);

    const pick = session();
    pick.state.players[0].discard = [card('pick-me'), card('other')];
    const source = card('picker', { onReveal: [step('trashCard', 'discard', 'self', 'choose')] });
    pick.state.players[0].hand.unshift(source);
    pick.deploy(source.id, 0);
    pick.endTurn();
    while (pick.pendingCount && !pick.state.choice) pick.step();
    expect(pick.state.choice?.zone).toBe('discard');
    expect(pick.state.choice?.zoneOwner).toBe(0);
    expect(pick.state.choice?.options.map(option => option.card?.id)).toEqual(expect.arrayContaining(['pick-me', 'other']));
  });

  it('recovers a card from Discard into hand via the discard drawer choice', () => {
    const game = session();
    game.state.players[0].discard = [card('saved'), card('left')];
    const source = card('rescuer', {
      onReveal: [{ action: 'recover', amount: 1, target: { type: 'card', who: 'self', where: 'discard' }, pick: { mode: 'choose' }, destination: 'hand' }],
    });
    game.state.players[0].hand.unshift(source);
    game.deploy(source.id, 0);
    game.endTurn();
    while (game.pendingCount && !game.state.choice) game.step();
    expect(game.state.choice?.zone).toBe('discard');
    expect(game.state.choice?.zoneOwner).toBe(0);
    game.choose('saved', 0);
    finish(game);
    expect(game.state.players[0].hand.map(entry => entry.id)).toContain('saved');
    expect(game.state.players[0].discard.map(entry => entry.id)).toEqual(['left']);
  });
});
