import { describe, expect, it } from 'vitest';
import { describeCard, describeStep } from '@0uroboros/engine/effects/catalog';
import { normalizeDocument, validateContent } from '@0uroboros/engine/authoring/contentModel';
import { starterCards, type Card } from '@0uroboros/engine/game';
import {
  createSession, mirrorView, seededRandom, type RuntimeSession,
} from '@0uroboros/engine/runtime';
import authored from '../content/authored-content.json';

const card = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, name: id, power: 1, onReveal: [], ...extra });

function finish(game: RuntimeSession) {
  let n = 0;
  while (game.pendingCount || game.state.choice) {
    if (game.state.choice) {
      const open = game.state.choice.options.filter(option => !option.disabled);
      game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner);
    } else game.step();
    if (++n > 800) throw new Error('stalled');
  }
}

function session(): RuntimeSession {
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(22), aiSeats: [], midCycleDraw: false,
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

/** Deploy, finish Runtime turns, and run Collapse cleanup into Draft. */
function collapseCycle(game: RuntimeSession, source: Card, node = 0, owner: 0 | 1 = 0) {
  game.state.players[owner].hand.unshift(source);
  game.deploy(source.id, node, owner);
  for (let turn = game.state.turn; turn <= 3; turn++) {
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
  }
  return game;
}

describe('foreign Duration Effect Bank', () => {
  it('routes foreignBank into the enemy bank with entry.owner = caster', () => {
    const game = session();
    const infect = card('infect', {
      duration: 2, foreignBank: true,
      onCollapse: [{ action: 'gainCrypto', amount: 2, target: { type: 'player', who: 'self' } }],
    });
    collapseCycle(game, infect);
    expect(game.state.players[0].bank).toHaveLength(0);
    expect(game.state.players[1].bank).toHaveLength(1);
    expect(game.state.players[1].bank[0]).toMatchObject({
      card: { id: 'infect' },
      owner: 0,
    });
  });

  it('overflows to owner Discard when the enemy bank is full', () => {
    const game = session();
    game.state.players[1].bank = Array.from({ length: 4 }, (_, i) => ({
      card: card(`filler-${i}`, { duration: 99 }),
      owner: 1 as const,
      enteredCycle: 1,
      order: i,
    }));
    collapseCycle(game, card('infect-full', { duration: 2, foreignBank: true }));
    expect(game.state.players[1].bank).toHaveLength(4);
    expect(game.state.players[1].bank.every(entry => entry.card.id.startsWith('filler-'))).toBe(true);
    expect(game.state.players[0].discard.some(c => c.id === 'infect-full')).toBe(true);
    expect(game.state.players[0].bank).toHaveLength(0);
  });

  it('keeps normal Duration cards in the owner bank', () => {
    const game = session();
    collapseCycle(game, card('native', { duration: 2 }));
    expect(game.state.players[0].bank).toMatchObject([{ card: { id: 'native' }, owner: 0 }]);
    expect(game.state.players[1].bank).toHaveLength(0);
  });

  it('resolves foreign onCollapse as the caster (self = owner)', () => {
    const game = session();
    collapseCycle(game, card('infect-pay', {
      duration: 99,
      foreignBank: true,
      onCollapse: [{ action: 'gainCrypto', amount: 3, target: { type: 'player', who: 'self' } }],
    }));
    expect(game.state.players[1].bank[0]?.owner).toBe(0);
    // Next Cycle: bank onCollapse fires during Collapse after Node 5.
    game.endDraft(0); game.endDraft(1); game.nextCycle();
    const events: { cardId?: string; owner?: number; kind: string; amount?: number }[] = [];
    for (let turn = 1; turn <= 3; turn++) {
      game.endTurn(0);
      try { game.endTurn(1); } catch { /* */ }
      let n = 0;
      while (game.pendingCount || game.state.choice) {
        if (game.state.choice) {
          const open = game.state.choice.options.filter(option => !option.disabled);
          events.push(game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner));
        } else {
          const step = game.step();
          if (step) events.push(step.event);
        }
        if (++n > 800) throw new Error('stalled');
      }
    }
    const pay = events.filter(event => event.cardId === 'infect-pay' && event.kind === 'crypto' && event.amount === 3);
    expect(pay.length).toBeGreaterThanOrEqual(1);
    expect(pay.every(event => event.owner === 0)).toBe(true);
  });

  it('expires foreign bank cards into the owner Discard', () => {
    const game = session();
    game.state.players[1].bank = [{
      card: card('expiring', { duration: 1 }),
      owner: 0,
      enteredCycle: 1,
      expiresCycle: 1,
      order: 0,
    }];
    game.state.cycle = 1;
    for (let turn = 1; turn <= 3; turn++) {
      game.endTurn(0);
      try { game.endTurn(1); } catch { /* */ }
      finish(game);
    }
    expect(game.state.players[1].bank).toHaveLength(0);
    expect(game.state.players[0].discard.some(c => c.id === 'expiring')).toBe(true);
    expect(game.state.players[1].discard.some(c => c.id === 'expiring')).toBe(false);
  });

  it('bumps a foreign occupant to the owner Discard', () => {
    const game = session();
    game.state.players[1].bank = [{
      card: card('foreign-bump', { duration: 5 }),
      owner: 0,
      enteredCycle: 1,
      order: 0,
    }];
    game.state.players[0].hand.unshift(card('bumper', {
      onReveal: [{
        action: 'bump',
        amount: 1,
        target: { type: 'zone', who: 'opponent', zone: 'bank' },
        pick: { mode: 'random' },
      }],
    }));
    game.deploy('bumper', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[1].bank).toHaveLength(0);
    expect(game.state.players[0].discard.some(c => c.id === 'foreign-bump')).toBe(true);
    expect(game.state.players[1].discard.some(c => c.id === 'foreign-bump')).toBe(false);
  });

  it('bumps a native bank card to the host Discard', () => {
    const game = session();
    game.state.players[1].bank = [{
      card: card('native-bump', { duration: 5 }),
      owner: 1,
      enteredCycle: 1,
      order: 0,
    }];
    game.state.players[0].hand.unshift(card('bumper', {
      onReveal: [{
        action: 'bump',
        amount: 1,
        target: { type: 'zone', who: 'opponent', zone: 'bank' },
        pick: { mode: 'random' },
      }],
    }));
    game.deploy('bumper', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[1].bank).toHaveLength(0);
    expect(game.state.players[1].discard.some(c => c.id === 'native-bump')).toBe(true);
  });

  it('self-bank bump removes only foreign cards', () => {
    const game = session();
    game.state.players[0].bank = [
      { card: card('native-keep', { duration: 5 }), owner: 0, enteredCycle: 1, order: 0 },
      { card: card('foreign-out', { duration: 5 }), owner: 1, enteredCycle: 1, order: 1 },
    ];
    game.state.players[0].hand.unshift(card('cleanser', {
      onReveal: [{
        action: 'bump',
        amount: 1,
        target: { type: 'zone', who: 'self', zone: 'bank' },
        pick: { mode: 'random' },
      }],
    }));
    game.deploy('cleanser', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].bank.map(e => e.card.id)).toEqual(['native-keep']);
    expect(game.state.players[1].discard.some(c => c.id === 'foreign-out')).toBe(true);
    expect(game.state.players[0].discard.some(c => c.id === 'native-keep')).toBe(false);
  });

  it('self-bank bump with only natives reports no target', () => {
    const game = session();
    game.state.players[0].bank = [
      { card: card('native-a', { duration: 5 }), owner: 0, enteredCycle: 1, order: 0 },
    ];
    game.state.players[0].hand.unshift(card('cleanser', {
      onReveal: [{
        action: 'bump',
        amount: 1,
        target: { type: 'zone', who: 'self', zone: 'bank' },
        pick: { mode: 'random' },
      }],
    }));
    game.deploy('cleanser', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    const events: { text: string }[] = [];
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      if (game.state.choice) {
        const open = game.state.choice.options.filter(option => !option.disabled);
        events.push(game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner));
      } else {
        const step = game.step();
        if (step) events.push(step.event);
      }
      if (++n > 800) throw new Error('stalled');
    }
    expect(game.state.players[0].bank.map(e => e.card.id)).toEqual(['native-a']);
    expect(events.some(e => /No target/i.test(e.text))).toBe(true);
  });

  it('self-bank choose bump only offers foreign cards', () => {
    const game = session();
    game.state.players[0].bank = [
      { card: card('native-keep', { duration: 5 }), owner: 0, enteredCycle: 1, order: 0 },
      { card: card('foreign-pick', { duration: 5 }), owner: 1, enteredCycle: 1, order: 1 },
    ];
    game.state.players[0].hand.unshift(card('cleanser', {
      onReveal: [{
        action: 'bump',
        amount: 1,
        target: { type: 'zone', who: 'self', zone: 'bank' },
        pick: { mode: 'choose' },
      }],
    }));
    game.deploy('cleanser', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      if (game.state.choice) {
        expect(game.state.choice.options.map(o => o.id)).toEqual(['foreign-pick']);
        game.choose('foreign-pick', game.state.choice.owner);
      } else game.step();
      if (++n > 800) throw new Error('stalled');
    }
    expect(game.state.players[0].bank.map(e => e.card.id)).toEqual(['native-keep']);
    expect(game.state.players[1].discard.some(c => c.id === 'foreign-pick')).toBe(true);
  });

  it('self-bank trash and destroy hit foreign only and retire under owner', () => {
    const game = session();
    game.state.players[0].bank = [
      { card: card('native-stay', { duration: 5 }), owner: 0, enteredCycle: 1, order: 0 },
      { card: card('foreign-trash', { duration: 5 }), owner: 1, enteredCycle: 1, order: 1 },
      { card: card('foreign-destroy', { duration: 5 }), owner: 1, enteredCycle: 1, order: 2 },
    ];
    game.state.players[0].hand.unshift(card('cleaner', {
      onReveal: [
        {
          action: 'trashCard',
          target: { type: 'card', who: 'self', where: 'bank' },
          pick: { mode: 'random' },
        },
        {
          action: 'destroyCard',
          target: { type: 'card', who: 'self', where: 'bank' },
          pick: { mode: 'random' },
        },
      ],
    }));
    game.deploy('cleaner', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].bank.map(e => e.card.id)).toEqual(['native-stay']);
    expect(game.state.trash.some(c => c.id === 'foreign-trash')).toBe(true);
    expect(game.state.players[1].destroyed.some(c => c.id === 'foreign-destroy')).toBe(true);
  });

  it('self bankOrWallet with empty foreign burns wallet and leaves natives', () => {
    const game = session();
    game.state.players[0].wallet = 4;
    game.state.players[0].bank = [
      { card: card('native-safe', { duration: 5 }), owner: 0, enteredCycle: 1, order: 0 },
    ];
    game.state.players[0].hand.unshift(card('cleanser', {
      onReveal: [{
        action: 'bump',
        amount: 1,
        target: { type: 'zone', who: 'self', zone: 'bankOrWallet' },
        pick: { mode: 'random' },
      }],
    }));
    game.deploy('cleanser', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].bank.map(e => e.card.id)).toEqual(['native-safe']);
    expect(game.state.players[0].wallet).toBe(3);
  });

  it('enemy bank trash can hit any occupant', () => {
    const game = session();
    game.state.players[1].bank = [
      { card: card('enemy-native', { duration: 5 }), owner: 1, enteredCycle: 1, order: 0 },
      { card: card('my-infector', { duration: 5 }), owner: 0, enteredCycle: 1, order: 1 },
    ];
    game.state.players[0].hand.unshift(card('raider', {
      onReveal: [{
        action: 'trashCard',
        target: { type: 'card', who: 'opponent', where: 'bank' },
        pick: { mode: 'random' },
      }],
    }));
    game.deploy('raider', 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[1].bank).toHaveLength(1);
    expect(game.state.trash).toHaveLength(1);
  });

  it('describeStep mentions foreign for self-bank cleanse', () => {
    expect(describeStep({
      action: 'bump',
      amount: 1,
      target: { type: 'zone', who: 'self', zone: 'bank' },
      pick: { mode: 'random' },
    }, 'card')).toMatch(/foreign/);
    expect(describeStep({
      action: 'trashCard',
      target: { type: 'card', who: 'self', where: 'bank' },
      pick: { mode: 'random' },
    }, 'card')).toMatch(/foreign card in your Effect Bank/);
    expect(describeStep({
      action: 'destroyCard',
      target: { type: 'card', who: 'self', where: 'bank' },
      pick: { mode: 'choose' },
    }, 'card')).toMatch(/foreign card in your Effect Bank/);
  });

  it('describeCard mentions enemy Effect Bank; authoring rejects foreignBank without duration', () => {
    expect(describeCard({ duration: 2, foreignBank: true })).toMatch(/enemy Effect Bank/);
    expect(describeCard({ foreignBank: true })).not.toMatch(/enemy Effect Bank/);
    const raw = (authored as { document?: unknown }).document ?? authored;
    const document = normalizeDocument(structuredClone(raw) as never);
    const base = document.cards.find(entry => entry.type === 'Character' && entry.enabled)!;
    const withFlag = { ...base, id: 'foreign-bank-test', definitionId: 'foreign-bank-test', name: 'Foreign Bank Test', duration: 2, foreignBank: true };
    document.cards.push(withFlag as never);
    expect(validateContent(document).filter(error => /foreign-bank-test/.test(error))).toEqual([]);
    const bad = {
      ...base,
      id: 'foreign-bank-bad',
      definitionId: 'foreign-bank-bad',
      name: 'Foreign Bank Bad',
      foreignBank: true,
      duration: undefined,
      durationPeriod: undefined,
      schedule: undefined,
      recurring: undefined,
    };
    document.cards.push(bad as never);
    const badIndex = document.cards.length - 1;
    expect(validateContent(document).some(error => error.includes(`cards[${badIndex}].foreignBank`))).toBe(true);
  });

  it('mirrorView flips BankEntry.owner', () => {
    const game = session();
    game.state.players[1].bank = [{
      card: card('mirror-me', { duration: 99, foreignBank: true }),
      owner: 0,
      enteredCycle: 1,
      order: 0,
    }];
    const view = game.view(0);
    expect(view.players[1].bank[0].owner).toBe(0);
    const mirrored = mirrorView(view);
    expect(mirrored.players[0].bank[0].owner).toBe(1);
  });
});
