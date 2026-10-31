import { describe, expect, it } from 'vitest';
import { actionsFor, createStep, describeLocation, describeStep, describeSteps, targetsFor, whoChoices } from '@0uroboros/engine/effects/catalog';
import { migrateEffects } from '@0uroboros/engine/effects/migrate';
import type { EffectStep, Scope } from '@0uroboros/engine/effects/types';
import { compileContent, createDefaultContent, normalizeDocument, validateContent } from '@0uroboros/engine/authoring/contentModel';
import { isGeneratedCard, newCardCategory, poolForClass } from '../src/authoring/cardBrowser';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { isNoTargetEvent, eventTime } from '../src/presentation';
import { starterCards, type Card, type EvaluationEffect, type PlayerId } from '@0uroboros/engine/game';

const catalog: Card[] = [
  { id: 'alpha', definitionId: 'alpha-definition', name: 'Alpha Relay', type: 'Character', power: 2, cost: 2, art: '/alpha.png', effect: '' },
  { id: 'beta', definitionId: 'beta-definition', name: 'Beta Archive', type: 'Character', power: 3, cost: 3, art: '/beta.png', effect: '' },
];

const steps = (effects: Parameters<typeof migrateEffects>[0], scope: Scope = 'card') => migrateEffects(effects, scope);
const ids = (scope: Scope) => actionsFor(scope).map(spec => spec.id);

const card = (id: string, effects: EvaluationEffect[] = [], extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, power: 2, onReveal: effects, ...extra });

function session() {
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(19) });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
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

describe('authoring effects overhaul', () => {
  it('exposes the shared catalog to Location and Circuit scopes', () => {
    for (const action of ['draw', 'gainCrypto', 'gainVP', 'damageServer', 'repairServer', 'trashCards', 'attachModifier', 'recover'] as const) {
      expect(ids('location')).toContain(action);
      expect(ids('circuit')).toContain(action);
    }
    expect(targetsFor('trashCard', 'location')[0]).toMatchObject({ relations: undefined });
    expect(ids('circuit')).not.toContain('morph');
  });

  it('migrates legacy aliases and derives printed text from the catalog', () => {
    expect(steps([{ kind: 'damageLoser', amount: 200 }], 'location')).toEqual([{ action: 'damageServer', amount: 200, target: { type: 'server', who: 'loser', server: 'auto' } }]);
    expect(steps([{ kind: 'restorePrimary', amount: 400 }], 'circuit')).toEqual([{ action: 'repairServer', amount: 400, target: { type: 'server', who: 'self', server: 'primary' } }]);
    expect(describeSteps(steps([{ kind: 'crypto', amount: 2 }, { kind: 'draw', amount: 1 }], 'location'), 'location', catalog))
      .toBe('+2 Crypto to the winning player. +1 Card to the winning player.');
    expect(describeLocation({ effects: steps([{ kind: 'crypto', amount: 2 }], 'location'), ongoing: steps([{ kind: 'draw', amount: 1 }], 'location'), onPlay: steps([{ kind: 'vp', amount: 1 }], 'locationPlay'), startTurn2: steps([{ kind: 'actions', amount: 1 }], 'location'), startTurn3: steps([{ kind: 'vp', amount: 1 }], 'location') }, catalog))
      .toBe('On collapse: +2 Crypto to the winning player. Ongoing: +1 Card to the winning player. On reveal: +1 VP to the player who played here. Start of turn 2: +1 Action to the winning player. Start of turn 3: +1 VP to the winning player.');
    const modifier = createStep('attachModifier', 'circuit', catalog);
    expect(modifier).toMatchObject({ action: 'attachModifier', modifier: 'doublePrintedEffects', target: { type: 'card', where: 'collection' } });
    expect(describeStep({ ...modifier, cardId: 'alpha-definition' }, 'circuit', catalog)).toBe('Attach “printed effects happen twice” to Alpha Relay');
    expect(describeStep({ ...modifier, modifier: 'powerAuraAtLocation', amount: 2 }, 'circuit', catalog)).toContain('+2 Power aura');
  });

  it('prints the target of card effects in the derived card text', () => {
    const text = (effects: Parameters<typeof migrateEffects>[0]) => describeSteps(steps(effects), 'card', catalog);
    expect(text([{ kind: 'modifyPower', amount: 3, cardRelation: 'next' }])).toBe('+3 Power to your next revealed card.');
    expect(text([{ kind: 'modifyPower', amount: 2 }])).toBe('Choose a revealed card of yours to give +2 Power.');
    expect(text([{ kind: 'modifyPower', amount: -1, cardRelation: 'previous' }])).toBe('-1 Power from your previously revealed card.');
    expect(text([{ kind: 'modifyPower', amount: -2, opponent: true }])).toBe('Choose a revealed enemy card to steal 2 Power from.');
    expect(text([{ kind: 'draw', amount: 1 }, { kind: 'crypto', amount: 2, opponent: true }, { kind: 'vp', amount: -1, opponent: true }]))
      .toBe('+1 Card. +2 Crypto to enemy. -1 VP from enemy.');
  });

  it('accepts negative printed Power and negative VP amounts', () => {
    const content = createDefaultContent();
    const target = content.cards.find(item => item.type === 'Character')!;
    target.power = -2;
    target.onReveal = [{ action: 'gainVP', amount: -1, target: { type: 'player', who: 'opponent' } }];
    expect(validateContent(content)).toEqual([]);
  });

  it('keeps Generated as a flag beside the class and auto-pools from class', () => {
    expect(poolForClass('Character', 'Attack')).toBe('Chaos');
    expect(newCardCategory('Generated')).toEqual({ pool: 'Base', type: 'Character', cardClass: 'Utility', generated: true });
    const document = createDefaultContent();
    document.cards.push({
      id: 'gen-token', definitionId: 'gen-token', name: 'Gen Token', type: 'Character', power: 1, cost: 0,
      art: '/assets/card_art/image_placeHolder.png', effect: '', pool: 'Base', enabled: true, cardClass: 'Action', generated: true,
    });
    const materialized = normalizeDocument(document);
    const migrated = materialized.cards.find(item => item.definitionId === 'gen-token')!;
    expect(migrated.cardClass).toBe('Action');
    expect(migrated.generated).toBe(true);
    expect(isGeneratedCard(migrated)).toBe(true);
    expect(validateContent(materialized)).toEqual([]);
    const compiled = compileContent(materialized);
    expect(compiled.baseCards.some(item => item.definitionId === 'gen-token')).toBe(false);
    expect(compiled.cards.some(item => item.definitionId === 'gen-token')).toBe(true);
  });

  it('routes Location rewards through effect steps, including migrated legacy aliases', () => {
    const document = createDefaultContent();
    document.locations.forEach((location, index) => { location.enabled = index < 2; });
    document.locations[0].effects = steps([{ kind: 'crypto', amount: 2 }], 'location');
    document.locations[1].effects = steps([{ kind: 'damageLoser', amount: 200 }], 'location');
    // Keep enough locations enabled for validation.
    document.locations.forEach((location, index) => { location.enabled = true; if (index > 1) location.effects = steps([{ kind: 'draw', amount: 0 }], 'location'); });
    const content = compileContent(document);
    expect(content.locations[1].effects).toEqual([{ action: 'damageServer', amount: 200, target: { type: 'server', who: 'loser', server: 'auto' } }]);
    const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(7), content });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    // Win every Node so shuffled Location placement cannot skip loser-only drains.
    for (let node = 0; node < 5; node++) {
      game.state.nodes[node].cards[0].push({ card: card(`win-${node}`, [], { power: 5 }), owner: 0, node, order: 0, revealed: true });
    }
    game.state.turn = 3;
    game.state.phase = 'runtime';
    game.endTurn();
    const events = finish(game);
    const locationEvents = events.filter(event => event.source === 'location');
    expect(locationEvents.some(event => event.kind === 'crypto' && event.amount === 2)).toBe(true);
    expect(locationEvents.some(event => event.kind === 'drain' && event.amount === 200)).toBe(true);
    expect(game.state.players[0].wallet).toBeGreaterThanOrEqual(2);
    expect(game.state.players[1].servers.primary + game.state.players[1].servers.backup).toBeLessThan(3500);
  });

  it('attaches permanent modifiers, doubles printed hooks, and applies location power auras', () => {
    const game = session();
    const host = card('host', [{ kind: 'crypto', amount: 1 }]);
    game.state.players[0].draw = [host];
    finish(playAttach(game, { kind: 'attachModifier', modifier: 'doublePrintedEffects' }));
    expect(host.modifiers?.[0]?.kind).toBe('doublePrintedEffects');

    const game2 = session();
    const auraHost = card('aura-host', [], { power: 1 });
    const ally = card('ally', [], { power: 2 });
    game2.state.players[0].draw = [auraHost];
    finish(playAttach(game2, { kind: 'attachModifier', modifier: 'powerAuraAtLocation', amount: 3 }));
    expect(auraHost.modifiers?.[0]).toMatchObject({ kind: 'powerAuraAtLocation', amount: 3 });
    game2.state.nodes[0].cards[0] = [
      { card: auraHost, owner: 0, node: 0, order: 0, revealed: true },
      { card: ally, owner: 0, node: 0, order: 1, revealed: true },
    ];
    (game2 as unknown as { recalculate(): void }).recalculate();
    expect(game2.state.nodes[0].powers[0]).toBe(1 + 2 + 3);

    const game3 = session();
    const doubled = card('doubled', [{ kind: 'crypto', amount: 1 }], {
      modifiers: [{ id: 'm1', kind: 'doublePrintedEffects' }],
    });
    game3.state.players[0].hand = [doubled];
    game3.deploy(doubled.id, 0);
    game3.endTurn();
    const reveal = finish(game3);
    expect(reveal.filter(event => event.kind === 'crypto' && event.cardId === doubled.id)).toHaveLength(2);
    expect(game3.state.players[0].wallet).toBe(2);
  });

  it('emits unmet pile events with perceptible presentation timing', () => {
    const game = session();
    const events = finish(playCard(game, card('seeker', [{ kind: 'recover' }])));
    const missed = events.find(event => isNoTargetEvent(event));
    expect(missed).toMatchObject({ text: expect.stringMatching(/Shared Trash is empty|No target/i), amount: 0 });
    expect(eventTime(missed!, false)).toBeGreaterThan(0);
  });

  it('targets the previously played card by play order', () => {
    const game = session();
    game.state.nodes[0].cards[0].push({ card: card('older', [], { power: 2, name: 'Older' }), owner: 0, node: 0, order: 1, revealed: true });
    game.state.nodes[1].cards[0].push({ card: card('newer', [], { power: 2, name: 'Newer' }), owner: 0, node: 1, order: 2, revealed: true });
    const source = card('link', [{ kind: 'modifyPower', amount: 3, cardRelation: 'previous' }], { power: 1, name: 'Link' });
    game.state.players[0].hand = [source];
    game.deploy('link', 2);
    game.endTurn();
    finish(game);
    const older = game.state.nodes[0].cards[0].find(placement => placement.card.id === 'older');
    const newer = game.state.nodes[1].cards[0].find(placement => placement.card.id === 'newer');
    expect(older?.card.powerDelta).toBe(3);
    expect(newer?.card.powerDelta ?? 0).toBe(0);
  });

  it('relocates a movable card once per Runtime turn', () => {
    const game = session();
    const rover = card('rover', [], {
      name: 'Rover',
      modifiers: [{ id: 'm1', kind: 'movableEachTurn' }],
    });
    game.state.nodes[0].cards[0].push({ card: rover, owner: 0, node: 0, order: 1, revealed: true });
    game.state.phase = 'runtime';
    game.state.turn = 1;
    expect(game.view().movableCardIds).toContain('rover');
    const moved = game.relocateCard('rover', 1);
    expect(moved.kind).toBe('move');
    expect(game.state.nodes[1].cards[0].some(placement => placement.card.id === 'rover')).toBe(true);
    expect(game.view().movableCardIds).not.toContain('rover');
    expect(() => game.relocateCard('rover', 2)).toThrow(/already moved/i);
  });

  it('attaches modifiers to board and previously played hosts, and drains the next revealed card', () => {
    const boardGame = session();
    const host = card('board-host', [], { power: 2, name: 'Board Host' });
    boardGame.state.nodes[0].cards[0].push({ card: host, owner: 0, node: 0, order: 1, revealed: true });
    playCard(boardGame, card('mod-board', [{ kind: 'attachModifier', modifier: 'doublePrintedEffects', boardHost: true }]));
    finish(boardGame);
    expect(boardGame.state.choice?.options.some(option => option.id === 'card-board-host')).toBe(true);
    boardGame.choose('card-board-host');
    finish(boardGame);
    expect(host.modifiers?.[0]?.kind).toBe('doublePrintedEffects');

    const prevGame = session();
    const older = card('older-mod', [], { power: 2, name: 'Older Mod' });
    prevGame.state.nodes[0].cards[0].push({ card: older, owner: 0, node: 0, order: 1, revealed: true });
    playCard(prevGame, card('mod-prev', [{
      kind: 'attachModifier', modifier: 'movableEachTurn', boardHost: true, cardRelation: 'previous',
    }]));
    finish(prevGame);
    expect(older.modifiers?.[0]?.kind).toBe('movableEachTurn');

    const drainGame = session();
    drainGame.state.nodes[0].cards[0].push({ card: card('first', [], { power: 4, name: 'First' }), owner: 0, node: 0, order: 1, revealed: true });
    const linker = card('drain-next', [{ kind: 'modifyPower', amount: -2, cardRelation: 'next' }], { power: 1, name: 'Drain Next' });
    drainGame.state.players[0].hand = [linker, card('second', [], { power: 4, name: 'Second' })];
    drainGame.state.players[0].actions = 5;
    drainGame.deploy('drain-next', 2);
    drainGame.deploy('second', 1);
    drainGame.endTurn();
    finish(drainGame);
    expect(drainGame.state.nodes[1].cards[0].find(placement => placement.card.id === 'second')?.card.powerDelta).toBe(-2);
    expect(drainGame.state.nodes[0].cards[0].find(placement => placement.card.id === 'first')?.card.powerDelta ?? 0).toBe(0);
  });

  it('destroys the next enemy revealed card and removes Runtime cards from the game', () => {
    const game = session();
    const hack = card('hack-attack', [{ kind: 'destroyCard', opponent: true, cardRelation: 'next' }], { power: 0, name: 'Hack Attack', cardClass: 'Runtime' });
    const victim = card('victim', [], { power: 5, name: 'Victim' });
    game.state.players[0].hand = [hack];
    game.deploy('hack-attack', 0);
    game.endTurn();
    expect(finish(game).some(event => /waiting for the opponent's next revealed card/.test(event.text))).toBe(true);
    game.state.nodes[1].cards[1].push({ card: victim, owner: 1, node: 1, order: 99, revealed: false });
    game.endTurn();
    const events = finish(game);
    expect(events.some(event => event.text === 'Hack Attack destroys Victim.')).toBe(true);
    expect(game.state.nodes[1].cards[1].some(placement => placement.card.id === 'victim')).toBe(false);
    expect(game.state.players[1].destroyed.map(entry => entry.id)).toContain('victim');
    expect(game.state.nodes[0].cards[0].some(placement => placement.card.id === 'hack-attack')).toBe(true);

    game.state.turn = 3;
    game.endTurn();
    finish(game);
    const everywhere = [
      ...game.state.trash, ...game.state.players.flatMap(player => [...player.discard, ...player.destroyed, ...player.hand, ...player.draw]),
      ...game.state.players.flatMap(player => player.bank.map(entry => entry.card)),
      ...game.state.nodes.flatMap(node => node.cards.flat().map(placement => placement.card)),
    ];
    expect(everywhere.some(entry => entry.id === 'hack-attack')).toBe(false);
  });

  it('lets a trashed Runtime card leave the game without entering the Trash', () => {
    const game = session();
    finish(playCard(game, card('fizzle', [{ kind: 'trashSelf' }], { cardClass: 'Runtime', name: 'Fizzle' })));
    expect(game.state.trash.some(entry => entry.id === 'fizzle')).toBe(false);
    expect(game.state.nodes[0].cards[0].some(placement => placement.card.id === 'fizzle')).toBe(false);
  });

  it('derives Power from the Trash and the destroyed piles', () => {
    const game = session();
    const collector = card('collector', [], { power: 0, name: 'Trash Collector', powerSource: 'trash' });
    const kull = card('kull', [], { power: 0, name: 'Kull Kode', powerSource: 'destroyed' });
    game.state.nodes[0].cards[0].push({ card: collector, owner: 0, node: 0, order: 1, revealed: true });
    game.state.nodes[1].cards[0].push({ card: kull, owner: 0, node: 1, order: 2, revealed: true });
    game.state.trash.push(card('t1'), card('t2'), card('t3'));
    game.state.players[0].destroyed.push(card('d1'));
    game.state.players[1].destroyed.push(card('d2'));
    finish(playCard(game, card('nudge', [], { power: 0 })));
    expect(game.state.nodes[0].powers[0]).toBe(3);
    expect(game.state.nodes[1].powers[0]).toBe(2);
  });

  it('authors Destroy card with a printed target', () => {
    expect(ids('card')).toContain('destroyCard');
    expect(ids('location')).toContain('destroyCard');
    expect(ids('circuit')).toContain('destroyCard');
    const destroy: EffectStep = { action: 'destroyCard', target: { type: 'card', who: 'opponent', where: 'board', relation: 'next' } };
    expect(steps([{ kind: 'destroyCard', opponent: true, cardRelation: 'next' }])).toEqual([destroy]);
    expect(describeSteps([destroy], 'card', catalog)).toBe('Destroy the next revealed enemy card.');
    const content = createDefaultContent();
    content.cards.push({ ...content.cards[0], id: 'hack-test', definitionId: 'hack-test', onReveal: [destroy], cardClass: 'Runtime', powerSource: 'trash' });
    expect(validateContent(content)).toEqual([]);
  });

  it('authors Location Trash and Destroy with weakest, strongest, or first-revealed targets', () => {
    const strongest: EffectStep = { action: 'destroyCard', target: { type: 'card', who: 'loser', where: 'thisNode' }, pick: { mode: 'strongest' } };
    expect(describeStep(strongest, 'location', catalog)).toBe('Destroy the strongest revealed card on the losing side here');
    expect(whoChoices(targetsFor('destroyCard', 'locationPlay')[0], 'locationPlay')).toEqual(['played', 'winner', 'other', 'loser', 'any', 'both']);
    const [legacy] = steps([{ kind: 'trashLowestAtLocation', amount: 1, boardSide: 'both' }], 'location');
    expect(legacy).toMatchObject({ action: 'trashCard', target: { type: 'card', who: 'both', where: 'thisNode' }, pick: { mode: 'weakest' } });
    expect(describeStep(legacy, 'location', catalog)).toBe('Trash the weakest revealed card on each side here');
    const first: EffectStep = { action: 'trashCard', target: { type: 'card', who: 'any', where: 'thisNode' }, pick: { mode: 'first', count: 2 } };
    expect(describeStep(first, 'location', catalog)).toBe('Trash the first 2 revealed cards here');
    const content = createDefaultContent();
    content.locations[0].effects = [strongest, legacy, first];
    expect(validateContent(content)).toEqual([]);
  });

  it('offers previous and next targets for attach and Power changes', () => {
    expect(targetsFor('attachModifier', 'card')[0]).toMatchObject({ relations: ['previous', 'next'] });
    expect(describeStep({ action: 'attachModifier', modifier: 'movableEachTurn', target: { type: 'card', who: 'self', where: 'board', relation: 'next' } }, 'card', catalog)).toMatch(/next revealed/);
    expect(describeStep({ action: 'changePower', amount: 2, target: { type: 'card', who: 'opponent', where: 'board', relation: 'previous' } }, 'card', catalog)).toMatch(/previously revealed enemy card/);
  });
});

function playCard(game: RuntimeSession, source: Card, owner: PlayerId = 0) {
  if (owner === 0) {
    game.state.players[0].hand.unshift(source);
    game.deploy(source.id, 0);
  } else {
    game.state.nodes[0].cards[1].push({ card: source, owner: 1, node: 0, order: 0, revealed: false });
  }
  game.endTurn();
  return game;
}

function playAttach(game: RuntimeSession, effect: EvaluationEffect) {
  return playCard(game, card('mod-source', [effect]));
}
