import { describe, expect, it } from 'vitest';
import authored from '../content/authored-content.json';
import { compileContent, createDefaultContent, validateContent, type AuthoredMod, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { canDeploy, isCharacterCard, isPlayableCrypto, type Card } from '@0uroboros/engine/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { draftOffer } from '@0uroboros/engine/evaluationMarket';

const document = (authored as unknown as { document: ContentDocument }).document;
const overclock: AuthoredMod = {
  id: 'overclock', name: 'Overclock', enabled: true,
  onReveal: [{ action: 'gainCrypto', amount: 2, target: { type: 'player', who: 'self' } }],
};

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 400) throw new Error('stalled');
  }
  return events;
}

describe('Crypto-Shyte', () => {
  it('is generated Crypto with Power: playable, no mods, never drafted', () => {
    expect(validateContent(document)).toEqual([]);
    const content = compileContent(document);
    const shyte = content.cards.find(card => (card.definitionId ?? card.id) === 'crypto-shyte');
    expect(shyte).toMatchObject({
      name: 'Crypto-Shyte', type: 'Crypto', power: 1, cost: 0, cryptoValue: 0, generated: true,
    });
    expect(shyte?.cardClass).toBeUndefined();
    expect(isPlayableCrypto(shyte!)).toBe(true);
    expect(isPlayableCrypto({ type: 'Crypto' })).toBe(true);
    expect(isCharacterCard(shyte!)).toBe(false);
    expect(canDeploy(shyte!, 1, 0, 0)).toBeNull();
    expect(canDeploy({ ...shyte!, power: undefined }, 1, 0, 0)).toBeNull();
    expect(content.cryptoCards.some(card => (card.definitionId ?? card.id) === 'crypto-shyte')).toBe(false);

    const offer = draftOffer(seededRandom(3), content, new Set(), new Set(), 1);
    expect(offer.every(pile => (pile.card.definitionId ?? pile.card.id) !== 'crypto-shyte')).toBe(true);
  });

  it('deploys, reveals for +1 Crypto, and cannot receive mods', () => {
    const pack = compileContent(document);
    const game = createSession({
      content: pack, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: 'higher',
      random: seededRandom(9), midCycleDraw: false, recordDecisions: false,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });

    const definition = pack.cards.find(card => (card.definitionId ?? card.id) === 'crypto-shyte')!;
    expect(definition.onReveal).toEqual([expect.objectContaining({ action: 'gainCrypto', amount: 1 })]);
    const token: Card = { ...structuredClone(definition), id: 'crypto-shyte-copy' };
    game.state.players[0].hand = [token];
    expect(game.deploy(token.id, 0)).toMatchObject({ kind: 'deploy' });
    game.endTurn();
    const events = finish(game);
    expect(game.state.players[0].wallet).toBe(1);
    expect(events.some(event => event.kind === 'crypto' && /Crypto-Shyte/.test(event.text))).toBe(true);
    expect(game.state.nodes[0].cards[0].some(entry => entry.card.id === 'crypto-shyte-copy' && entry.revealed)).toBe(true);
    expect(game.state.nodes[0].powers[0]).toBe(1);

    const doc = createDefaultContent();
    doc.mods = [overclock];
    const modGame = createSession({
      content: compileContent(doc), strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: 'higher',
      random: seededRandom(11), midCycleDraw: false, recordDecisions: false,
    });
    modGame.state.nodeOrder = [0, 1, 2, 3, 4];
    modGame.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
    const host: Card = { ...structuredClone(definition), id: 'crypto-shyte-host' };
    modGame.state.players[0].draw = [host];
    modGame.state.players[0].hand = [{
      id: 'rigger', name: 'Rigger', type: 'Character', power: 1, cost: 0, art: definition.art, effect: 'Attach Overclock.',
      onReveal: [{ action: 'attachModifier', modifier: 'overclock', target: { type: 'card', who: 'self', where: 'collection' }, pick: { mode: 'first' } }],
    }];
    modGame.deploy('rigger', 0);
    modGame.endTurn();
    finish(modGame);
    expect(host.modifiers).toBeUndefined();
  });
});

describe('random gainCard draft eligibility', () => {
  function gainSession() {
    const pack = compileContent(document);
    const game = createSession({
      content: pack, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: 'higher',
      random: seededRandom(17), midCycleDraw: false, recordDecisions: false,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    return { pack, game };
  }

  it('filter/maxCost awards never pick Generated cards', () => {
    const { pack, game } = gainSession();
    const generatedIds = new Set(
      pack.cards.filter(card => card.generated).map(card => card.definitionId ?? card.id),
    );
    expect(generatedIds.has('crypto-shyte')).toBe(true);
    expect(generatedIds.has('wave-card')).toBe(true);

    game.state.players[0].hand = [{
      id: 'buyer', name: 'Buyer', type: 'Character', power: 1, cost: 0, art: '/x.png', effect: 'Gain.',
      onReveal: [
        { action: 'gainCard', amount: 8, filter: { cardType: 'Crypto' }, target: { type: 'zone', who: 'self', zone: 'hand' } },
        { action: 'gainCard', amount: 8, filter: { cardClass: 'Action' }, target: { type: 'zone', who: 'self', zone: 'discard' } },
      ],
    }];
    game.deploy('buyer', 0);
    game.endTurn();
    finish(game);

    const gained = [...game.state.players[0].hand, ...game.state.players[0].discard];
    expect(gained.length).toBe(16);
    expect(gained.every(card => !generatedIds.has(card.definitionId ?? card.id))).toBe(true);
    expect(gained.every(card => card.generated !== true)).toBe(true);
    expect(gained.some(card => (card.definitionId ?? card.id) === 'crypto-shyte')).toBe(false);
    expect(gained.some(card => (card.definitionId ?? card.id) === 'wave-card')).toBe(false);
  });

  it('explicit cardId still grants Generated Crypto-Shyte', () => {
    const { game } = gainSession();
    game.state.players[0].hand = [{
      id: 'giver', name: 'Giver', type: 'Character', power: 1, cost: 0, art: '/x.png', effect: 'Shyte.',
      onReveal: [{ action: 'gainCard', amount: 1, cardId: 'crypto-shyte', target: { type: 'zone', who: 'self', zone: 'hand' } }],
    }];
    game.deploy('giver', 0);
    game.endTurn();
    finish(game);
    expect(game.state.players[0].hand.some(card => card.definitionId === 'crypto-shyte')).toBe(true);
  });

  it('random cardIds pools skip Generated entries', () => {
    const { game } = gainSession();
    game.state.players[0].hand = [{
      id: 'picker', name: 'Picker', type: 'Character', power: 1, cost: 0, art: '/x.png', effect: 'Random.',
      onReveal: [{
        action: 'gainCard', amount: 12, selection: 'random',
        cardIds: ['crypto-shyte', 'byte-coin'],
        target: { type: 'zone', who: 'self', zone: 'hand' },
      }],
    }];
    game.deploy('picker', 0);
    game.endTurn();
    finish(game);
    const gained = game.state.players[0].hand;
    expect(gained).toHaveLength(12);
    expect(gained.every(card => card.definitionId === 'byte-coin')).toBe(true);
  });
});

describe('Currency Crypto playable', () => {
  it('deploys Byte-Coin free and pays cryptoValue on reveal', () => {
    const pack = compileContent(document);
    const byte = pack.cards.find(card => (card.definitionId ?? card.id) === 'byte-coin')!;
    expect(canDeploy(byte, 1, 0, 0)).toBeNull();
    expect(isPlayableCrypto(byte)).toBe(true);

    const game = createSession({
      content: pack, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: 'higher',
      random: seededRandom(5), midCycleDraw: false, recordDecisions: false,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
    const token: Card = { ...structuredClone(byte), id: 'byte-play' };
    game.state.players[0].hand = [token];
    expect(game.deploy(token.id, 0)).toMatchObject({ kind: 'deploy' });
    game.endTurn();
    finish(game);
    expect(game.state.players[0].wallet).toBe(2);
    expect(game.state.nodes[0].cards[0].some(entry => entry.card.id === 'byte-play' && entry.revealed)).toBe(true);
  });
});
