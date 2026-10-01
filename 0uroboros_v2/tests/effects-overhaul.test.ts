import { describe, expect, it } from 'vitest';
import {
  boardSideChoices, changeRecipeBoardSide, changeRecipeTarget, createRecipe, deriveEffectText, deriveLocationText, normalizeRecipe,
  operationChoices, recipeOperation, recipeSummary, targetChoices,
} from '../src/authoring/recipeModel';
import { compileContent, createDefaultContent, materializeItemRecipes, validateContent } from '../src/authoring/contentModel';
import { isGeneratedCard, newCardCategory, poolForClass } from '../src/authoring/cardBrowser';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';
import { isNoTargetEvent, eventTime } from '../src/presentation';
import { starterCards, type Card, type EvaluationEffect, type PlayerId } from '../src/game';

const catalog: Card[] = [
  { id: 'alpha', definitionId: 'alpha-definition', name: 'Alpha Relay', type: 'Character', power: 2, cost: 2, art: '/alpha.png', effect: '' },
  { id: 'beta', definitionId: 'beta-definition', name: 'Beta Archive', type: 'Character', power: 3, cost: 3, art: '/beta.png', effect: '' },
];

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
  it('exposes the shared evaluation catalog to location and circuit scopes', () => {
    const location = operationChoices('location', catalog).map(choice => choice.value);
    const circuit = operationChoices('circuit', catalog).map(choice => choice.value);
    for (const op of ['draw', 'crypto', 'vp', 'drain', 'restore', 'handTrash', 'attachModifier', 'recover']) {
      expect(location).toContain(op);
      expect(circuit).toContain(op);
    }
    expect(location).not.toContain('trashSelf');
    expect(circuit).not.toContain('morph');
  });

  it('normalizes legacy aliases and derives printed text', () => {
    expect(normalizeRecipe({ kind: 'damageLoser', amount: 200 })).toEqual({ kind: 'drain', amount: 200, opponent: true });
    expect(normalizeRecipe({ kind: 'restorePrimary', amount: 400 })).toEqual({ kind: 'restore', amount: 400, target: 'primary' });
    expect(deriveEffectText([{ kind: 'crypto', amount: 2 }, { kind: 'draw', amount: 1 }], 'location', catalog))
      .toBe('Give 2 Crypto to the winning player\'s wallet. Draw 1 card into the winning player\'s hand.');
    expect(deriveLocationText({ effects: [{ kind: 'crypto', amount: 2 }], ongoing: [{ kind: 'draw', amount: 1 }], onPlay: [{ kind: 'vp', amount: 1 }], schedule: [{ at: 2, effects: [{ kind: 'actions', amount: 1 }] }] }, catalog))
      .toBe('On collapse: Give 2 Crypto to the winning player\'s wallet. Ongoing: Draw 1 card into the winning player\'s hand. On reveal: Give 1 Victory Point to the player who played here. After turn 2: Give 1 Action to the winning player.');
    const modifier = createRecipe('attachModifier', 'circuit', catalog);
    expect(modifier).toMatchObject({ kind: 'attachModifier', modifier: 'doublePrintedEffects' });
    expect(changeRecipeTarget(modifier, 'specific-character', 'circuit', catalog).cardId).toBe('alpha-definition');
    expect(recipeSummary({ kind: 'attachModifier', modifier: 'powerAuraAtLocation', amount: 2 }, 'circuit', catalog))
      .toContain('+2 Power aura');
  });

  it('prints the target of card effects in the derived card text', () => {
    expect(deriveEffectText([{ kind: 'modifyPower', amount: 3, cardRelation: 'next' }], 'card', catalog)).toBe('+3 Power to your next revealed card.');
    expect(deriveEffectText([{ kind: 'modifyPower', amount: 2 }], 'card', catalog)).toBe('+2 Power to one of your revealed cards.');
    expect(deriveEffectText([{ kind: 'modifyPower', amount: -1, cardRelation: 'previous' }], 'card', catalog)).toBe('-1 Power from your previously revealed card.');
    expect(deriveEffectText([{ kind: 'modifyPower', amount: -2, opponent: true }], 'card', catalog)).toBe('Steal 2 Power from an enemy revealed card.');
    expect(deriveEffectText([{ kind: 'draw', amount: 1 }, { kind: 'crypto', amount: 2, opponent: true }, { kind: 'vp', amount: -1, opponent: true }], 'card', catalog))
      .toBe('+1 Card. +2 Crypto to enemy. -1 Victory Point from enemy.');
  });

  it('accepts negative printed Power and negative VP amounts', () => {
    const content = createDefaultContent();
    const target = content.cards.find(item => item.type === 'Character')!;
    target.power = -2;
    target.onReveal = [{ kind: 'vp', amount: -1, opponent: true }];
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
    const materialized = materializeItemRecipes(document);
    const migrated = materialized.cards.find(item => item.definitionId === 'gen-token')!;
    expect(migrated.cardClass).toBe('Action');
    expect(migrated.generated).toBe(true);
    expect(isGeneratedCard(migrated)).toBe(true);
    expect(validateContent(materialized)).toEqual([]);
    const compiled = compileContent(materialized);
    expect(compiled.baseCards.some(item => item.definitionId === 'gen-token')).toBe(false);
    expect(compiled.cards.some(item => item.definitionId === 'gen-token')).toBe(true);
  });

  it('routes location and circuit rewards through evaluation effects including legacy aliases', () => {
    const document = createDefaultContent();
    document.locations.forEach((location, index) => { location.enabled = index < 2; });
    document.locations[0].effects = [{ kind: 'crypto', amount: 2 }];
    document.locations[1].effects = [{ kind: 'damageLoser', amount: 200 }];
    // Keep enough locations enabled for validation.
    document.locations.forEach((location, index) => { location.enabled = true; if (index > 1) location.effects = [{ kind: 'draw', amount: 0 }]; });
    const content = compileContent(document);
    expect(content.locations.find(location => location.effects.some(effect => effect.kind === 'drain' && effect.opponent))?.effects[0])
      .toEqual({ kind: 'drain', amount: 200, opponent: true });
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

  it('emits No target events with perceptible presentation timing', () => {
    const game = session();
    const events = finish(playCard(game, card('seeker', [{ kind: 'recover' }])));
    const missed = events.find(event => isNoTargetEvent(event));
    expect(missed).toMatchObject({ text: expect.stringMatching(/No target/i), amount: 0 });
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
    expect(older?.powerModifier).toBe(3);
    expect(newer?.powerModifier ?? 0).toBe(0);
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
    expect(drainGame.state.nodes[1].cards[0].find(placement => placement.card.id === 'second')?.powerModifier).toBe(-2);
    expect(drainGame.state.nodes[0].cards[0].find(placement => placement.card.id === 'first')?.powerModifier ?? 0).toBe(0);
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
    expect(operationChoices('card', catalog).map(choice => choice.value)).toContain('destroyCard');
    expect(operationChoices('location', catalog).map(choice => choice.value)).toContain('destroyCard');
    expect(operationChoices('circuit', catalog).map(choice => choice.value)).not.toContain('destroyCard');
    const destroy = changeRecipeTarget(createRecipe('destroyCard', 'card', catalog), 'opponent-next-card', 'card', catalog);
    expect(destroy).toMatchObject({ kind: 'destroyCard', opponent: true, cardRelation: 'next' });
    expect(deriveEffectText([destroy], 'card', catalog)).toBe('Destroy the next enemy revealed card.');
    const content = createDefaultContent();
    content.cards.push({ ...content.cards[0], id: 'hack-test', definitionId: 'hack-test', onReveal: [destroy as EvaluationEffect], cardClass: 'Runtime', powerSource: 'trash' });
    expect(validateContent(content)).toEqual([]);
  });

  it('authors Location Trash and Destroy with weakest, strongest, or first-revealed targets', () => {
    const destroy = createRecipe('destroyCard', 'location', catalog);
    expect(destroy).toEqual({ kind: 'destroyAtLocation', rank: 'weakest', amount: 1, boardSide: 'either' });
    expect(targetChoices(destroy, 'location').map(choice => choice.label)).toEqual(['Weakest card here', 'Strongest card here', 'First card revealed here']);
    const strongest = changeRecipeBoardSide(changeRecipeTarget(destroy, 'strongest', 'location', catalog), 'loser', 'location');
    expect(recipeSummary(strongest, 'location', catalog)).toBe("Destroy the strongest revealed card on the losing player's side.");
    expect(boardSideChoices(strongest, 'locationPlay').map(choice => choice.value)).toEqual(['either', 'played', 'other', 'both']);

    const legacy = { kind: 'trashLowestAtLocation', amount: 1, boardSide: 'both' as const };
    expect(recipeOperation(legacy, 'location')).toBe('trashAtLocation');
    expect(recipeSummary(legacy, 'location', catalog)).toBe('Trash the weakest revealed card on each side.');
    const first = changeRecipeTarget(legacy, 'first', 'location', catalog);
    expect(first).toEqual({ kind: 'trashAtLocation', rank: 'first', amount: 1, boardSide: 'both' });
    expect(recipeSummary({ ...first, amount: 2, boardSide: 'either' }, 'location', catalog)).toBe('Trash the first 2 revealed cards here.');

    const content = createDefaultContent();
    content.locations[0].effects = [strongest as never, first as never];
    expect(validateContent(content)).toEqual([]);
  });

  it('exposes previous/next targets for attach, gain, and drain in authoring', () => {
    const attach = createRecipe('attachModifier', 'card', catalog);
    const board = changeRecipeTarget(attach, 'your-next-card', 'card', catalog);
    expect(board).toMatchObject({ boardHost: true, cardRelation: 'next', opponent: false });
    expect(recipeSummary(board, 'card', catalog)).toMatch(/next revealed/);
    const power = changeRecipeTarget(createRecipe('gainPower', 'card', catalog), 'opponent-previous-card', 'card', catalog);
    expect(power).toMatchObject({ kind: 'modifyPower', cardRelation: 'previous', opponent: true });
    expect(recipeSummary(power, 'card', catalog)).toMatch(/previously revealed/);
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
