import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent } from '../src/authoring/contentModel';
import { starterCards, type Card, type EvaluationEffect } from '../src/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';

const card = (id: string, extra: Partial<Card> = {}): Card => ({
  ...starterCards[0], id, definitionId: id, name: id, art: `/forms/${id}.png`, effect: id,
  onReveal: [], ...extra,
});

function make(forms: Card[], random = seededRandom(19)) {
  const content = compileContent(createDefaultContent());
  content.cards.push(...forms);
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, random, content });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
  return { game, content };
}

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 400) throw new Error('Morph resolution stalled.');
  }
  return events;
}

function deploy(game: RuntimeSession, source: Card) {
  game.state.players[0].hand.unshift(source);
  game.deploy(source.id, 0);
  game.endTurn();
}

describe('Morph recipes', () => {
  it('evolves a recurring physical card through its ordered forms, holds the last, and continues from the Bank', () => {
    const a = card('form-a', { power: 4, duration: 2, durationPeriod: 'runtime', recurring: [{ kind: 'crypto', amount: 1 }] });
    const b = card('form-b', { type: 'VP', power: 1, vp: 6, duration: 2, durationPeriod: 'runtime', recurring: [{ kind: 'crypto', amount: 2 }] });
    const { game, content } = make([a, b]);
    const morph: EvaluationEffect = { kind: 'morph', formIds: ['form-a', 'form-b'] };
    const source = card('evolver', { power: 2, duration: 5, durationPeriod: 'runtime', recurring: [morph] });
    game.state.players[0].hand.push(source);
    game.deploy(source.id, 0);
    const placement = game.state.nodes[0].cards[0][0];
    placement.powerModifier = 3;
    game.endTurn();
    let first: RuntimeEvent | undefined;
    while (game.pendingCount && !first) { const event = game.step()!.event; if (event.kind === 'morph') first = event; }
    expect(first).toMatchObject({ owner: 0, cardId: 'evolver', targetCardId: 'evolver', targetOwner: 0, node: 0, sourceName: 'evolver', before: 5, after: 7, definitionId: 'form-a' });
    expect(placement).toMatchObject({ card: { id: 'evolver', definitionId: 'form-a', name: 'form-a', art: '/forms/form-a.png' }, powerModifier: 3, node: 0, revealed: true });
    expect(game.state.nodes[0].powers[0]).toBe(7);
    const secondTurn = finish(game);
    expect(secondTurn.filter(event => event.kind === 'crypto' || event.kind === 'morph').map(event => [event.kind, event.amount, event.definitionId])).toEqual([
      ['crypto', 1, undefined], ['morph', undefined, 'form-b'],
    ]);
    expect(placement.card).toMatchObject({ id: 'evolver', definitionId: 'form-b', type: 'VP', vp: 6 });
    expect(placement.powerModifier).toBe(3);
    expect(game.state.nodes[0].powers[0]).toBe(4);
    expect(game.view().players[0].totalVP).toBe(6);
    expect(game.state.players[0].wallet).toBe(1);
    expect(content.cards.find(item => item.definitionId === 'form-a')).toEqual(a);
    expect(content.cards.find(item => item.definitionId === 'form-b')).toEqual(b);
    game.endTurn();
    const thirdTurn = finish(game);
    expect(thirdTurn.filter(event => event.kind === 'crypto' || event.kind === 'morph').map(event => [event.kind, event.definitionId])).toEqual([
      ['crypto', undefined], ['morph', 'form-b'],
    ]);
    game.endTurn(); finish(game);
    expect(game.state.players[0].bank.map(entry => entry.card.id)).toContain('evolver');
    expect(game.state.players[0].bank.find(entry => entry.card.id === 'evolver')?.card.definitionId).toBe('form-b');
    game.endDraft(0); game.endDraft(1); game.nextCycle();
    const nextCycle = finish(game);
    expect(nextCycle).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'morph', cardId: 'evolver', definitionId: 'form-b', targetOwner: 0 })]));
    expect(game.state.players[0].bank.find(entry => entry.card.id === 'evolver')?.card.definitionId).toBe('form-b');
    expect(game.view().players[0].totalVP).toBe(6);
  });

  it('completes authored onReveal order without running the new form reveal, then retains sequence progress after Discard', () => {
    const morph: EvaluationEffect = { kind: 'morph', formIds: ['form-a', 'form-b'], selection: 'sequential' };
    const a = card('form-a', { onReveal: [{ kind: 'crypto', amount: 99 }, morph] });
    const b = card('form-b');
    const { game } = make([a, b]);
    deploy(game, card('evolver', { onReveal: [{ kind: 'crypto', amount: 1 }, morph, { kind: 'crypto', amount: 2 }] }));
    const first = finish(game);
    expect(first.filter(event => event.cardId === 'evolver' && ['crypto', 'morph'].includes(event.kind)).map(event => [event.kind, event.amount, event.definitionId])).toEqual([
      ['crypto', 1, undefined], ['morph', undefined, 'form-a'], ['crypto', 2, undefined],
    ]);
    expect(game.state.players[0].wallet).toBe(3);
    game.endTurn(); finish(game);
    game.endTurn(); finish(game);
    expect(game.state.players[0].discard.find(item => item.id === 'evolver')?.definitionId).toBe('form-a');
    game.endDraft(0); game.endDraft(1); game.nextCycle(); finish(game);
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    const returned = game.state.players[0].hand.find(item => item.id === 'evolver')!;
    expect(returned.definitionId).toBe('form-a');
    game.deploy(returned.id, 0); game.endTurn();
    const replay = finish(game);
    expect(replay.filter(event => event.cardId === 'evolver' && ['crypto', 'morph'].includes(event.kind)).map(event => [event.kind, event.amount, event.definitionId])).toEqual([
      ['crypto', 99, undefined], ['morph', undefined, 'form-b'],
    ]);
    expect(game.state.nodes[0].cards[0][0].card.id).toBe('evolver');
  });

  it('uses session RNG for random forms and keeps ordered progress separate per list and card instance', () => {
    const forms = [card('form-a'), card('form-b')];
    const high = make(forms, () => 0.9).game;
    deploy(high, card('random-source', { onReveal: [{ kind: 'morph', formIds: ['form-a', 'form-b'], selection: 'random' }] }));
    expect(finish(high)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'morph', definitionId: 'form-b' })]));
    const low = make(forms, () => 0.1).game;
    deploy(low, card('random-source', { onReveal: [{ kind: 'morph', formIds: ['form-a', 'form-b'], selection: 'random' }] }));
    expect(finish(low)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'morph', definitionId: 'form-a' })]));
    const game = make(forms).game;
    const first = card('first', { onReveal: [
      { kind: 'morph', formIds: ['form-a', 'form-b'] },
      { kind: 'morph', formIds: ['form-b', 'form-a'] },
      { kind: 'morph', formIds: ['form-a', 'form-b'] },
    ] });
    const second = card('second', { onReveal: [{ kind: 'morph', formIds: ['form-a', 'form-b'] }] });
    game.state.players[0].hand.push(first, second);
    game.deploy('first', 0); game.deploy('second', 0); game.endTurn();
    const events = finish(game).filter(event => event.kind === 'morph');
    expect(events.filter(event => event.cardId === 'first').map(event => event.definitionId)).toEqual(['form-a', 'form-b', 'form-b']);
    expect(events.filter(event => event.cardId === 'second').map(event => event.definitionId)).toEqual(['form-a']);
  });

  it('runs a duration-one form exactly once after Morph from a source without a timer', () => {
    const form=card('timed-form',{duration:1,durationPeriod:'runtime',onReveal:[{kind:'crypto',amount:99}],schedule:[{at:1,effects:[{kind:'crypto',amount:4}]}]});
    const {game}=make([form]);
    deploy(game,card('source',{onReveal:[{kind:'morph',formIds:['timed-form']}]}));
    while(game.pendingCount){const event=game.step()!.event;if(event.kind==='morph')break;}
    expect(game.state.players[0].wallet).toBe(0);
    const later=finish(game);
    expect(later.filter(event=>event.kind==='crypto').map(event=>event.amount)).toEqual([4]);
    expect(game.state.nodes[0].cards[0][0].card.definitionId).toBe('timed-form');
    game.endTurn();
    expect(finish(game).filter(event=>event.kind==='crypto')).toHaveLength(0);
    expect(game.state.players[0].discard.find(item=>item.id==='source')?.definitionId).toBe('timed-form');
  });

  it('retains one-shot source Morph while each entered form uses its own relative schedule', () => {
    const morph: EvaluationEffect = { kind: 'morph', formIds: ['form-a', 'form-b'] };
    const a = card('form-a', { duration: 2, durationPeriod: 'runtime', schedule: [
      { at: 1, effects: [{ kind: 'crypto', amount: 11 }] },
      { at: 2, effects: [{ kind: 'crypto', amount: 22 }] },
    ] });
    const b = card('form-b', { duration: 2, durationPeriod: 'runtime', schedule: [
      { at: 1, effects: [{ kind: 'crypto', amount: 33 }] },
      { at: 2, effects: [{ kind: 'crypto', amount: 44 }] },
    ] });
    const { game } = make([a, b]);
    deploy(game, card('scheduled-source', { duration: 4, durationPeriod: 'runtime', onReveal: [morph], schedule: [{ at: 2, effects: [morph] }] }));
    const first = finish(game);
    expect(first.filter(event => event.kind === 'morph').map(event => event.definitionId)).toEqual(['form-a', 'form-b']);
    expect(first.filter(event => event.kind === 'crypto').map(event => event.amount)).toEqual([11, 22]);
    game.endTurn();
    const third = finish(game);
    expect(third.filter(event => event.kind === 'crypto').map(event => event.amount)).toEqual([33]);
    game.endTurn(); finish(game);
    expect(game.state.players[0].bank.find(entry => entry.card.id === 'scheduled-source')?.card.definitionId).toBe('form-b');
    game.endDraft(0); game.endDraft(1); game.nextCycle();
    const fourth = finish(game);
    expect(fourth.filter(event => event.kind === 'crypto').map(event => event.amount)).toEqual([44]);
    expect(fourth.some(event => event.kind === 'morph')).toBe(false);
  });

  it('retains a later form scheduled Morph at its absolute due turn after another form replaces it', () => {
    const a = card('form-a', { duration: 3, durationPeriod: 'runtime', schedule: [{ at: 2, effects: [
      { kind: 'morph', formIds: ['form-c'] },
    ] }] });
    const b = card('form-b');
    const c = card('form-c');
    const { game } = make([a, b, c]);
    const source = card('source', { duration: 5, durationPeriod: 'runtime', schedule: [
      { at: 2, timing: 'start', effects: [{ kind: 'morph', formIds: ['form-a'] }] },
      { at: 2, timing: 'end', effects: [{ kind: 'morph', formIds: ['form-b'] }] },
    ] });
    deploy(game, source);
    const secondStart = finish(game);
    expect(secondStart.filter(event => event.kind === 'morph').map(event => event.definitionId)).toEqual(['form-a']);
    game.endTurn();
    const thirdStart = finish(game);
    expect(thirdStart.filter(event => event.kind === 'morph').map(event => event.definitionId)).toEqual(['form-b']);
    game.endTurn(); finish(game);
    expect(game.state.players[0].bank.find(entry => entry.card.id === 'source')?.card.definitionId).toBe('form-b');
    game.endDraft(0); game.endDraft(1); game.nextCycle();
    const ageFour = finish(game);
    expect(ageFour.filter(event => event.kind === 'morph').map(event => event.definitionId)).toEqual(['form-c']);
  });

  it('preserves intentionally repeated identical Morph steps in one scheduled recipe', () => {
    const { game } = make([card('form-a'), card('form-b'), card('form-c')]);
    const repeated: EvaluationEffect = { kind: 'morph', formIds: ['form-a', 'form-b'] };
    deploy(game, card('source', { duration: 2, durationPeriod: 'runtime', onReveal: [{ kind: 'morph', formIds: ['form-c'] }], schedule: [
      { at: 2, effects: [repeated, repeated] },
    ] }));
    expect(finish(game).filter(event => event.kind === 'morph').map(event => event.definitionId)).toEqual(['form-c', 'form-a', 'form-b']);
  });

  it('runs a shared recurring evolution recipe once when consecutive forms carry it', () => {
    const morph:EvaluationEffect={kind:'morph',formIds:['form-a','form-b','form-c']};
    const a=card('form-a',{duration:3,durationPeriod:'runtime',recurring:[{...morph,selection:'sequential'}]});
    const b=card('form-b',{duration:3,durationPeriod:'runtime',recurring:[morph]});
    const c=card('form-c');
    const {game}=make([a,b,c]);
    deploy(game,card('source',{duration:5,durationPeriod:'runtime',recurring:[morph]}));
    expect(finish(game).filter(event=>event.kind==='morph').map(event=>event.definitionId)).toEqual(['form-a','form-b']);
    game.endTurn();
    expect(finish(game).filter(event=>event.kind==='morph').map(event=>event.definitionId)).toEqual(['form-c']);
  });

  it('updates Bank expiry when an onCollapse Morph becomes permanent, timed, or ordinary', () => {
    for (const [variant, duration, durationPeriod] of [
      ['permanent', 99, 'cycle'], ['timed', 2, 'runtime'], ['ordinary', undefined, undefined],
    ] as const) {
      const form = card(`form-${variant}`, { duration, durationPeriod });
      const { game } = make([form]);
      const source = card(`source-${variant}`, { duration: 1, durationPeriod: 'cycle', onCollapse: [{ kind: 'morph', formIds: [form.definitionId!] }] });
      game.state.players[0].bank.push({ card: source, enteredCycle: 1, expiresCycle: 1, order: 1 });
      game.state.turn = 3;
      game.endTurn();
      const events = finish(game);
      expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'morph', cardId: source.id, definitionId: form.definitionId, targetOwner: 0 })]));
      if (variant === 'ordinary') {
        expect(game.state.players[0].bank.some(entry => entry.card.id === source.id)).toBe(false);
        expect(game.state.players[0].discard.find(item => item.id === source.id)?.definitionId).toBe(form.definitionId);
      } else {
        const entry = game.state.players[0].bank.find(item => item.card.id === source.id);
        expect(entry?.card.definitionId).toBe(form.definitionId);
        expect(entry?.expiresCycle).toBeUndefined();
        game.endDraft(0); game.endDraft(1); game.nextCycle(); finish(game);
        expect(game.state.players[0].bank.some(item => item.card.id === source.id)).toBe(true);
      }
    }
  });

  it('rejects unavailable and Crypto forms without changing the active card', () => {
    for (const formIds of [['missing-form'], ['byte-coin']]) {
      const { game } = make([]);
      deploy(game, card('source', { onReveal: [{ kind: 'morph', formIds }] }));
      expect(game.step()?.event.kind).toBe('reveal');
      expect(() => game.step()).toThrow(formIds[0] === 'byte-coin' ? /Character or VP/ : /unavailable/);
      expect(game.state.nodes[0].cards[0][0].card.definitionId).toBe('source');
    }
  });

  it('does not run queued scheduled effects after the morphed physical card trashes itself', () => {
    const a = card('form-a', { duration: 2, durationPeriod: 'runtime', schedule: [{ at: 1, effects: [
      { kind: 'trashSelf' }, { kind: 'crypto', amount: 99 },
    ] }] });
    const { game } = make([a]);
    deploy(game, card('source', { duration: 3, durationPeriod: 'runtime', recurring: [{ kind: 'morph', formIds: ['form-a'] }] }));
    const events = finish(game);
    expect(events.filter(event => event.kind === 'morph')).toHaveLength(1);
    expect(game.state.trash.map(item => item.id)).toContain('source');
    expect(game.state.players[0].wallet).toBe(0);
    expect(game.state.nodes[0].cards[0].some(item => item.card.id === 'source')).toBe(false);
  });
});
