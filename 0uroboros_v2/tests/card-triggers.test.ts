import { describe, expect, it } from 'vitest';
import { describeCard, describeStep } from '@0uroboros/engine/effects/catalog';
import { describeTrigger } from '@0uroboros/engine/effects/triggers';
import { compileContent, normalizeDocument, validateContent, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { starterCards, type Card } from '@0uroboros/engine/game';
import { createSession, seededRandom, type RuntimeSession } from '@0uroboros/engine/runtime';
import authored from '../content/authored-content.json';

const card = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, name: id, power: 2, onReveal: [], ...extra });

function finish(game: RuntimeSession) {
  let n = 0;
  while (game.pendingCount || game.state.choice) {
    if (game.state.choice) {
      const open = game.state.choice.options.filter(option => !option.disabled);
      game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner);
    } else game.step();
    if (++n > 500) throw new Error('stalled');
  }
}

function play(game: RuntimeSession, source: Card, node = 0, owner: 0 | 1 = 0) {
  game.state.players[owner].hand.unshift(source);
  game.deploy(source.id, node, owner);
  game.endTurn(0);
  try { game.endTurn(1); } catch { /* */ }
  finish(game);
}

function session(): RuntimeSession {
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(11), aiSeats: [], midCycleDraw: false,
  });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach((player, seat) => {
    player.hand = [];
    player.draw = [card(`pad-${seat}-a`), card(`pad-${seat}-b`), card(`pad-${seat}-c`)];
    player.discard = [];
    player.wallet = 0;
  });
  game.state.turn = 1;
  game.state.phase = 'runtime';
  return game;
}

describe('card Ongoing triggers', () => {
  it('describes built-in Ongoing rules', () => {
    expect(describeTrigger({ kind: 'mirrorCrypto' })).toMatch(/Mirror/);
    expect(describeTrigger({ kind: 'protectPower' })).toMatch(/cannot lose Power/);
    expect(describeTrigger({ kind: 'multiplyNode', min: 1.1, max: 2, random: true })).toMatch(/10%–100%/);
    expect(describeTrigger({
      kind: 'whenPlayed',
      match: { cardType: 'Crypto' },
      scope: 'thisNode',
      then: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }],
    })).toMatch(/Crypto card/);
    expect(describeStep({
      action: 'copyText',
      target: { type: 'card', who: 'opponent', where: 'deck' },
      pick: { mode: 'random' },
    }, 'card')).toMatch(/enemy deck/);
    expect(describeStep({
      action: 'silenceOngoing',
      target: { type: 'card', who: 'opponent', where: 'thisNode' },
    }, 'card')).toMatch(/Silence enemy Ongoing at this Location this Cycle/);
    expect(describeStep({
      action: 'silenceOngoing',
      target: { type: 'card', who: 'both', where: 'board' },
    }, 'card')).toMatch(/Silence all Ongoing at all Locations this Cycle/);
  });

  it('Silence Ongoing stops enemy card Ongoing at that Location for the Cycle', () => {
    const game = session();
    play(game, card('mirror', { power: 1, triggers: [{ kind: 'mirrorCrypto' }] }), 0, 1);
    play(game, card('banish', {
      power: 1,
      onReveal: [{
        action: 'silenceOngoing',
        target: { type: 'card', who: 'opponent', where: 'thisNode' },
      }],
    }));
    game.state.players[0].hand.unshift(card('giver', {
      power: 1,
      onReveal: [{ action: 'gainCrypto', amount: 3, target: { type: 'player', who: 'self' } }],
    }));
    game.deploy('giver', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    const texts: string[] = [];
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      const event = game.state.choice
        ? game.choose((game.state.choice.options.find(option => !option.disabled) ?? game.state.choice.options[0]!).id, game.state.choice.owner)
        : game.step()!.event;
      texts.push(event.text);
      if (/giver: \+3 Crypto/.test(event.text)) {
        // Drain a few more queued events so a mirror would have a chance to appear.
        for (let extra = 0; extra < 8 && (game.pendingCount || game.state.choice); extra++) {
          const next = game.state.choice
            ? game.choose((game.state.choice.options.find(option => !option.disabled) ?? game.state.choice.options[0]!).id, game.state.choice.owner)
            : game.step()!.event;
          texts.push(next.text);
        }
        expect(texts.some(text => /mirror \+/.test(text))).toBe(false);
        return;
      }
      if (++n > 500) throw new Error('stalled');
    }
    throw new Error(`giver Crypto never resolved: ${texts.join(' | ')}`);
  });

  it('mirrors enemy Crypto gains while revealed', () => {
    const game = session();
    play(game, card('mirror', { power: 1, triggers: [{ kind: 'mirrorCrypto' }] }));
    const before = game.state.players[0].wallet;
    play(game, card('giver', {
      power: 1,
      onReveal: [{ action: 'gainCrypto', amount: 3, target: { type: 'player', who: 'opponent' } }],
    }));
    expect(game.state.players[1].wallet).toBeGreaterThanOrEqual(3);
    expect(game.state.players[0].wallet).toBeGreaterThanOrEqual(before + 3);
  });

  it('steals wallet Crypto as currency', () => {
    const game = session();
    game.state.players[1].wallet = 5;
    play(game, card('thief', {
      onReveal: [{ action: 'stealCrypto', amount: 2, target: { type: 'zone', who: 'opponent', zone: 'wallet' } }],
    }));
    expect(game.state.players[1].wallet).toBe(3);
    expect(game.state.players[0].wallet).toBe(2);
  });

  it('protectPower blocks further Power loss', () => {
    const game = session();
    play(game, card('ward', { power: 4, triggers: [{ kind: 'protectPower' }] }));
    play(game, card('local-siphon', {
      onReveal: [{
        action: 'changePower', amount: -2, transfer: false,
        target: { type: 'card', who: 'self', where: 'board' },
        pick: { mode: 'first' },
      }],
    }));
    const after = game.state.nodes[0].cards[0].find(entry => entry.card.id === 'ward');
    expect(after?.card.powerDelta ?? 0).toBe(0);
  });

  it('suppressOngoing silences card Ongoing', () => {
    const game = session();
    game.state.nodes[0].location = {
      id: 'quiet', name: 'Quiet', rule: '', reward: '',
      passives: { suppressOngoing: true },
    };
    play(game, card('mirror', { power: 1, triggers: [{ kind: 'mirrorCrypto' }] }));
    const before = game.state.players[0].wallet;
    play(game, card('giver', {
      power: 1,
      onReveal: [{ action: 'gainCrypto', amount: 3, target: { type: 'player', who: 'opponent' } }],
    }));
    expect(game.state.players[0].wallet).toBe(before);
  });

  it('Ms. Mosquito draws when any card is destroyed', () => {
    const game = session();
    play(game, card('ms-mosquito', {
      power: 3, cardClass: 'Hacker',
      triggers: [{ kind: 'when', event: 'anyCardDestroyed', then: [{ action: 'draw', amount: 2, target: { type: 'player', who: 'self' } }] }],
    }));
    const host = game.state.nodes[0].cards[0].find(entry => entry.card.id === 'ms-mosquito');
    expect(host?.revealed).toBe(true);
    expect(host?.card.triggers?.[0]).toMatchObject({ kind: 'when', event: 'anyCardDestroyed' });
    play(game, card('foe', { power: 1 }), 0, 1);
    game.state.players[0].hand = [];
    game.state.players[0].draw = [card('d1'), card('d2'), card('d3'), card('d4')];
    game.state.players[0].hand.unshift(card('bomber', {
      power: 1,
      onReveal: [{
        action: 'destroyCard',
        target: { type: 'card', who: 'opponent', where: 'board' },
        pick: { mode: 'first' },
      }],
    }));
    game.deploy('bomber', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    let drew = false;
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      const event = game.state.choice
        ? game.choose((game.state.choice.options.find(option => !option.disabled) ?? game.state.choice.options[0]!).id, game.state.choice.owner)
        : game.step()!.event;
      if (/ms-mosquito: draw 2/.test(event.text)) {
        expect(game.state.nodes[0].cards[1].some(entry => entry.card.id === 'foe')).toBe(false);
        expect(game.state.players[0].hand.map(entry => entry.id)).toEqual(['d1', 'd2']);
        drew = true;
        break;
      }
      if (++n > 500) throw new Error('stalled');
    }
    expect(drew).toBe(true);
  });

  it('Holly Hedge gains Crypto when the enemy draws', () => {
    const game = session();
    play(game, card('holly-hedge', {
      power: 1, cardClass: 'Utility',
      triggers: [{ kind: 'when', event: 'enemyDraws', then: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }] }],
    }));
    const before = game.state.players[0].wallet;
    play(game, card('tutor', {
      power: 1,
      onReveal: [{ action: 'draw', amount: 2, target: { type: 'player', who: 'opponent' } }],
    }));
    expect(game.state.players[0].wallet).toBe(before + 1);
  });

  it('whenPlayed with cardType Crypto fires when a Crypto card is played here', () => {
    const game = session();
    play(game, card('watcher', {
      power: 1, cardClass: 'Utility',
      triggers: [{
        kind: 'whenPlayed',
        match: { cardType: 'Crypto' },
        scope: 'thisNode',
        then: [{ action: 'gainCrypto', amount: 2, target: { type: 'player', who: 'self' } }],
      }],
    }));
    const before = game.state.players[0].wallet;
    play(game, card('coin', { type: 'Crypto', cryptoValue: 1, power: undefined }));
    expect(game.state.players[0].wallet).toBe(before + 2);
  });

  it('Crypto Canary Listen fires when the enemy peeks your deck', () => {
    const game = session();
    play(game, card('crypto-canary', {
      type: 'Crypto', cryptoValue: 1, power: 2,
      triggers: [{
        kind: 'listenAccess', whose: 'enemyAccessesYours',
        then: [{ action: 'gainCrypto', amount: 5, target: { type: 'player', who: 'self' } }],
      }],
    }));
    const before = game.state.players[0].wallet;
    play(game, card('enemy-peek', {
      power: 1,
      onReveal: [{ action: 'peek', amount: 1, target: { type: 'card', who: 'opponent', where: 'deck' } }],
    }), 0, 1);
    expect(game.state.players[0].wallet).toBe(before + 5);
  });

  it('Crypto Canary Listen fires when the enemy discards from your hand', () => {
    const game = session();
    play(game, card('crypto-canary', {
      type: 'Crypto', cryptoValue: 1, power: 2,
      triggers: [{
        kind: 'listenAccess', whose: 'enemyAccessesYours',
        then: [{ action: 'gainCrypto', amount: 5, target: { type: 'player', who: 'self' } }],
      }],
    }));
    game.state.players[0].hand = [card('victim-a'), card('victim-b')];
    const before = game.state.players[0].wallet;
    play(game, card('qubit-kid', {
      power: 1,
      onReveal: [{
        action: 'discardCards', amount: 1, optional: true,
        target: { type: 'card', who: 'opponent', where: 'hand' },
        pick: { mode: 'choose' },
      }],
    }), 0, 1);
    expect(game.state.players[0].wallet).toBe(before + 5);
  });

  it('Ms. Mosquito draws when a card is destroyed from hand', () => {
    const game = session();
    play(game, card('ms-mosquito', {
      power: 3, cardClass: 'Hacker',
      triggers: [{ kind: 'when', event: 'anyCardDestroyed', then: [{ action: 'draw', amount: 2, target: { type: 'player', who: 'self' } }] }],
    }));
    game.state.players[0].hand = [];
    game.state.players[0].draw = [card('d1'), card('d2'), card('d3')];
    game.state.players[1].hand = [card('hand-victim')];
    const before = game.state.players[0].hand.length;
    play(game, card('hand-bomber', {
      power: 1,
      onReveal: [{
        action: 'destroyCard',
        target: { type: 'card', who: 'opponent', where: 'hand' },
        pick: { mode: 'first' },
      }],
    }));
    expect(game.state.players[0].hand.length).toBe(before + 2);
  });

  it('Expo-Net multiplies Node Power in 10% steps when random', () => {
    const game = session();
    play(game, card('tank', { power: 10 }));
    play(game, card('expo-net', {
      power: 0, cardClass: 'Utility',
      triggers: [{ kind: 'multiplyNode', min: 1.1, max: 2, random: true }],
    }));
    const host = game.state.nodes[0].cards[0].find(entry => entry.card.id === 'expo-net');
    const rolled = (host?.card.triggers?.[0] as { rolled?: number } | undefined)?.rolled;
    expect(rolled).toBeDefined();
    expect(Math.abs(rolled! * 10 - Math.round(rolled! * 10))).toBeLessThan(1e-9);
    expect(rolled!).toBeGreaterThanOrEqual(1.1);
    expect(rolled!).toBeLessThanOrEqual(2);
  });

  it('Expo-Net multiplies Node Power', () => {
    const game = session();
    play(game, card('tank', { power: 10 }));
    play(game, card('expo-net', {
      power: 0, cardClass: 'Utility',
      triggers: [{ kind: 'multiplyNode', min: 2, max: 2, random: false }],
    }));
    expect(game.state.nodes[0].powers[0]).toBeGreaterThanOrEqual(20);
  });

  it('Deepfake copies On Reveal from a random enemy deck card', () => {
    const game = session();
    game.state.players[1].draw = [
      card('loot', {
        name: 'loot',
        power: 1,
        onReveal: [{ action: 'gainCrypto', amount: 4, target: { type: 'player', who: 'self' } }],
      }),
    ];
    const before = game.state.players[0].wallet;
    const events: string[] = [];
    game.state.players[0].hand.unshift(card('deepfake', {
      power: 1, cardClass: 'Hacker',
      onReveal: [{
        action: 'copyText',
        target: { type: 'card', who: 'opponent', where: 'deck' },
        pick: { mode: 'random' },
      }],
    }));
    game.deploy('deepfake', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      const event = game.state.choice
        ? game.choose((game.state.choice.options.find(option => !option.disabled) ?? game.state.choice.options[0]!).id, game.state.choice.owner)
        : game.step()!.event;
      events.push(event.text);
      if (++n > 500) throw new Error('stalled');
    }
    expect(game.state.players[0].wallet).toBe(before + 4);
    expect(events.some(text => /deepfake copied 'loot'/i.test(text))).toBe(true);
  });

  it('copying Glitch-Witch hands the enemy a Generated Glitch and logs the source', () => {
    const document = normalizeDocument(((authored as { document?: unknown }).document ?? authored) as never) as ContentDocument;
    const pack = compileContent(document);
    const witch = pack.cards.find(entry => entry.name === 'Glitch-Witch');
    const deepfake = pack.cards.find(entry => entry.name === 'Deepfake' || (entry.definitionId ?? entry.id) === 'deepfake');
    expect(witch).toBeTruthy();
    expect(deepfake).toBeTruthy();
    const game = createSession({
      content: pack, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: 'higher',
      random: seededRandom(11), midCycleDraw: false, aiSeats: [],
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
    game.state.turn = 1;
    game.state.phase = 'runtime';
    game.state.players[1].draw = [{ ...structuredClone(witch!), id: 'witch-in-deck' }];
    game.state.players[0].hand = [{ ...structuredClone(deepfake!), id: 'deepfake-1' }];
    game.state.players[0].draw = [card('pad-a'), card('pad-b'), card('pad-c')];
    const beforeHand = game.state.players[0].hand.length;
    const events: string[] = [];
    game.deploy('deepfake-1', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      const event = game.state.choice
        ? game.choose((game.state.choice.options.find(option => !option.disabled) ?? game.state.choice.options[0]!).id, game.state.choice.owner)
        : game.step()!.event;
      events.push(event.text);
      if (++n > 500) throw new Error('stalled');
    }
    expect(events.some(text => /deepfake copied 'Glitch-Witch'/i.test(text))).toBe(true);
    expect(events.some(text => /gain 1 Glitch-[A-E] to Discard/i.test(text))).toBe(true);
    expect(game.state.players[0].hand.length).toBe(beforeHand - 1 + 2);
    const enemy = [...game.state.players[1].discard, ...game.state.players[1].hand, ...game.state.players[1].draw];
    expect(enemy.some(entry => entry.generated === true && /glitch/i.test(entry.name))).toBe(true);
  });

  it('R.0.1. Matrix has no next-card move On Reveal', () => {
    const raw = (authored as { document?: unknown }).document ?? authored;
    const document = normalizeDocument(raw as never);
    const matrix = document.cards.find(entry => entry.name === 'R.0.1. Matrix');
    expect(matrix).toBeTruthy();
    expect(matrix!.onReveal ?? []).toEqual([]);
    expect(matrix!.triggers?.some(trigger => trigger.kind === 'whenPlayed')).toBe(true);
  });

  it('authored playtest cards validate and print Ongoing text', () => {
    const raw = (authored as { document?: unknown }).document ?? authored;
    const document = normalizeDocument(raw as never);
    const errors = validateContent(document);
    expect(errors.filter(error => /expo-net|deepfake|ms-mosquito|holly-hedge|lana-lune|crypto-canary/.test(error))).toEqual([]);
    const ids = ['expo-net', 'deepfake', 'ms-mosquito', 'holly-hedge', 'lana-lune', 'crypto-canary', 'card-y7nje0x2'];
    for (const id of ids) {
      const found = document.cards.find(entry => entry.id === id || entry.definitionId === id);
      expect(found, id).toBeTruthy();
      expect(found!.enabled).toBe(true);
      expect(describeCard(found!).length).toBeGreaterThan(0);
    }
    const banish = document.cards.find(entry => entry.name === '3rian-Banish')!;
    expect(banish.cost).toBe(3);
    expect(banish.power).toBe(1);
    expect(banish.onReveal?.some(step => step.action === 'silenceOngoing')).toBe(true);
    expect(banish.onReveal?.some(step => step.action === 'gainCrypto' && step.amount === 1)).toBe(true);
  });
});
