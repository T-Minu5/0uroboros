import { describe, expect, it } from 'vitest';
import { effectiveCardPower, starterCards, type Card, type Deployment, type EvaluationEffect, type PlayerId } from '../src/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';

const make = () => {
  const session = createSession({ carryover: true, priorityPreference: 'higher', random: seededRandom(7) });
  session.state.nodeOrder = [0, 1, 2, 3, 4];
  session.state.priority = 0;
  session.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
  return session;
};
const card = (id: string, effects: EvaluationEffect[] = [], extra: Partial<Card> = {}): Card => ({ ...starterCards[0], id, onReveal: effects, ...extra });
const placed = (item: Card, owner: PlayerId, node: number, order: number, revealed = true): Deployment => ({ card: item, owner, node, order, revealed });
const advance = (session: RuntimeSession) => {
  const events: RuntimeEvent[] = [];
  while (session.pendingCount) {
    events.push(session.step()!.event);
    if (events.length > 250) throw new Error('Resolution stalled.');
  }
  return events;
};
const finish = (session: RuntimeSession) => {
  const events: RuntimeEvent[] = [];
  for (let i = 0; session.pendingCount || session.state.choice; i++) {
    if (i > 400) throw new Error('Resolution stalled.');
    events.push(session.state.choice ? session.choose(session.state.choice.options[0].id) : session.step()!.event);
  }
  return events;
};

describe('revealed card movement', () => {
  it('moves a chosen own card without changing its identity, order, revelation, duration or modifier; queued reveals still run', () => {
    const session = make();
    const target = placed(card('target', [], { duration: 2 }), 0, 0, 40);
    target.powerModifier = 2;
    session.state.nodes[0].cards[0].push(target);
    session.state.players[0].hand = [card('source', [{ kind: 'moveCard' }]), card('later')];
    session.deploy('source', 0); session.deploy('later', 0); session.endTurn(); advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toContain('card-target');
    session.choose('card-target');
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['node-1', 'node-2']);
    const move = session.choose('node-2');
    expect(move).toMatchObject({ kind: 'move', cardId: 'source', targetCardId: 'target', targetOwner: 0, sourceNode: 0, targetNode: 2 });
    expect(session.state.nodes[2].cards[0][0]).toBe(target);
    expect(target).toMatchObject({ owner: 0, node: 2, order: 40, revealed: true, powerModifier: 2, card: { id: 'target', duration: 2 } });
    expect(session.state.nodes[2].powers[0]).toBe(5);
    expect(finish(session).some(event => event.kind === 'reveal' && event.cardId === 'later')).toBe(true);
  });

  it('moves an opposing revealed card, while hidden opposing cards remain masked and untargetable', () => {
    const session = make();
    const target = placed(card('visible'), 1, 0, 10);
    session.state.nodes[0].cards[1].push(target, placed(card('secret'), 1, 0, 11, false));
    session.state.players[0].hand = [card('source', [{ kind: 'moveCard', opponent: true }])];
    session.deploy('source', 0); session.endTurn(); advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['card-visible']);
    expect(session.view().nodes[0].cards[1].find(item => item.order === 11)?.card).toEqual({ id: 'hidden-placement-11', hidden: true });
    session.choose('card-visible');
    const event = session.choose('node-1');
    expect(event).toMatchObject({ cardId: 'source', targetCardId: 'visible', targetOwner: 1, sourceNode: 0, targetNode: 1 });
    expect(session.state.nodes[1].cards[1][0]).toBe(target);
    finish(session);
  });

  it('has harmless no-target results when destinations are full or the requested side has no revealed card', () => {
    const full = make();
    full.state.nodes[0].cards[1].push(placed(card('victim'), 1, 0, 1), ...Array.from({ length: 3 }, (_, i) => placed(card(`block-0-${i}`), 1, 0, i + 2)));
    for (const node of [1, 2]) full.state.nodes[node].cards[1] = Array.from({ length: 4 }, (_, i) => placed(card(`block-${node}-${i}`), 1, node, i + 10));
    full.state.players[0].hand = [card('source', [{ kind: 'moveCard', opponent: true }])];
    full.deploy('source', 0); full.endTurn();
    const result = advance(full).find(event => event.kind === 'move');
    expect(result?.text).toMatch(/no legal revealed card/);
    expect(full.state.choice).toBeNull();
    expect(full.state.nodes[0].cards[1][0].card.id).toBe('victim');

    const absent = make();
    absent.state.nodes[0].cards[1].push(placed(card('secret'), 1, 0, 1, false));
    absent.state.players[0].hand = [card('source', [{ kind: 'modifyPower', amount: 2, opponent: true }])];
    absent.deploy('source', 0); absent.endTurn();
    const noTarget = advance(absent).find(event => event.kind === 'power');
    expect(noTarget).toMatchObject({ cardId: 'source', targetOwner: 1, amount: 0 });
    expect(absent.state.nodes[0].cards[1][0].powerModifier).toBeUndefined();
  });

  it('allows an optional move to be skipped without moving any card', () => {
    const session = make();
    session.state.nodes[0].cards[1].push(placed(card('victim'), 1, 0, 1));
    session.state.players[0].hand = [card('source', [{ kind: 'moveCard', opponent: true, optional: true }])];
    session.deploy('source', 0); session.endTurn(); advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['card-victim', 'skip']);
    expect(session.choose('skip').text).toMatch(/skipped/);
    expect(session.state.nodes[0].cards[1][0].card.id).toBe('victim');
  });

  it('auto-selects opposing targets and destinations for opponent-owned effects', () => {
    const session = make();
    const target = placed(card('local'), 0, 0, 1);
    session.state.nodes[0].cards[0].push(target);
    session.state.nodes[0].cards[1].push(placed(card('opponent-source', [{ kind: 'moveCard', opponent: true }]), 1, 0, 2, false));
    session.state.priority = 1;
    session.endTurn();
    const events = finish(session);
    const event = events.find(item => item.kind === 'move');
    expect(event).toMatchObject({ owner: 1, cardId: 'opponent-source', targetCardId: 'local', targetOwner: 0, sourceNode: 0 });
    expect(event?.targetNode).toBeGreaterThan(0);
    expect(target.node).toBe(event?.targetNode);
  });
});

describe('deployment Power changes', () => {
  it('clamps damage at zero, applies a later buff from zero, and exposes only a view copy of adjusted Power', () => {
    const session = make();
    const definition = card('victim', [], { power: 2 });
    const target = placed(definition, 1, 0, 1);
    session.state.nodes[0].cards[1].push(target, placed(card('secret'), 1, 0, 2, false));
    session.state.players[0].hand = [card('source', [{ kind: 'modifyPower', amount: -5, opponent: true }, { kind: 'modifyPower', amount: 3, opponent: true }])];
    session.deploy('source', 0); session.endTurn(); advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['card-victim']);
    const damage = session.choose('card-victim');
    expect(damage).toMatchObject({ kind: 'power', cardId: 'source', targetCardId: 'victim', targetOwner: 1, amount: -2, before: 2, after: 0 });
    expect(effectiveCardPower(target)).toBe(0);
    expect(session.state.nodes[0].powers[1]).toBe(0);
    const firstView = session.view();
    expect(firstView.nodes[0].cards[1][0].card).toMatchObject({ id: 'victim', power: 0, basePower: 2 });
    expect(firstView.nodes[0].cards[1][1].card).toEqual({ id: 'hidden-placement-2', hidden: true });
    expect(definition.power).toBe(2);
    expect(definition.basePower).toBeUndefined();
    advance(session);
    const buff = session.choose('card-victim');
    expect(buff).toMatchObject({ amount: 3, before: 0, after: 3, targetOwner: 1 });
    expect(session.state.nodes[0].powers[1]).toBe(3);
    expect(session.view().nodes[0].cards[1][0].card).toMatchObject({ power: 3, basePower: 2 });
    expect(definition.power).toBe(2);
  });

  it('adjusts own card Power, supports optional skip, and resets modifiers when a card leaves the board', () => {
    const session = make();
    const target = placed(card('victim', [], { power: 1 }), 0, 0, 1);
    session.state.nodes[0].cards[0].push(target);
    session.state.players[0].hand = [card('source', [{ kind: 'modifyPower', amount: 2, optional: true }])];
    session.deploy('source', 0); session.endTurn(); advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toContain('skip');
    const event = session.choose('card-victim');
    expect(event).toMatchObject({ targetOwner: 0, before: 1, after: 3, amount: 2 });
    expect(session.state.nodes[0].powers[0]).toBe(6);
    expect(session.view().nodes[0].cards[0][0].card).toMatchObject({ power: 3, basePower: 1 });
    finish(session);
    session.endTurn(); finish(session);
    session.endTurn(); finish(session);
    expect(session.state.nodes.every(node => node.cards[0].length === 0)).toBe(true);
    expect(session.state.players[0].discard.find(item => item.id === 'victim')).toMatchObject({ power: 1 });
    expect(session.state.players[0].discard.find(item => item.id === 'victim')?.basePower).toBeUndefined();
    session.endDraft(0); session.nextCycle();
    session.state.players[0].hand = [target.card];
    session.deploy('victim', 0);
    expect(session.state.nodes[0].cards[0][0].powerModifier).toBeUndefined();
  });

  it('keeps a moved Collapse card from resolving onCollapse twice or entering a sealed Node', () => {
    const session = make();
    session.state.players[0].hand = [card('source', [], { onCollapse: [{ kind: 'moveCard' }] })];
    session.deploy('source', 0); session.endTurn(); finish(session);
    session.endTurn(); finish(session);
    session.endTurn(); advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['card-source']);
    session.choose('card-source');
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['node-1', 'node-2', 'node-3', 'node-4']);
    const moved = session.choose('node-1');
    expect(moved).toMatchObject({ sourceNode: 0, targetNode: 1, targetCardId: 'source' });
    const rest = finish(session);
    expect(rest.filter(event => event.kind === 'move')).toHaveLength(0);
    expect(session.state.players[0].discard.filter(item => item.id === 'source')).toHaveLength(1);
    expect(session.state.phase).toBe('draft');
  });

  it('excludes earlier sealed Nodes from Collapse move destinations', () => {
    const session = make();
    session.state.players[0].hand = [card('source', [], { onCollapse: [{ kind: 'moveCard' }] })];
    session.deploy('source', 1); session.endTurn(); finish(session);
    session.endTurn(); finish(session);
    session.endTurn(); advance(session);
    session.choose('card-source');
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['node-2', 'node-3', 'node-4']);
    expect(() => session.choose('node-0')).toThrow(/legal option/);
    session.choose('node-2');
    finish(session);
  });
});

describe('Effect Bank card interactions', () => {
  it('treats moveSelf and transferPower from banked cards as harmless effects without a deployed source', () => {
    const session = make();
    const mover = card('bank-mover', [], { name: 'Bank Mover', duration: 99, onCollapse: [{ kind: 'moveSelf' }] });
    const transfer = card('bank-transfer', [], { name: 'Bank Transfer', duration: 99, onCollapse: [{ kind: 'transferPower', amount: 2 }] });
    session.state.players[0].bank = [
      { card: mover, enteredCycle: 1, order: 1 },
      { card: transfer, enteredCycle: 1, order: 2 },
    ];
    session.state.turn = 3;
    session.endTurn();
    const events = finish(session);
    expect(events.find(event => event.sourceName === mover.name && event.kind === 'choice')).toMatchObject({ kind: 'choice', owner: 0 });
    expect(events.find(event => event.sourceName === mover.name && event.kind === 'choice')?.text).toMatch(/no legal option; no effect/);
    expect(events.find(event => event.cardId === transfer.id)).toMatchObject({ kind: 'power', owner: 0, amount: 0 });
    expect(events.find(event => event.cardId === transfer.id)?.text).toMatch(/no deployed source Location/);
    expect(session.state.choice).toBeNull();
    expect(session.state.players[0].bank.map(entry => entry.card.id)).toEqual([mover.id, transfer.id]);
    expect(session.state.nodes.every(node => node.powerModifiers[0] === 0)).toBe(true);
  });

  it('trashes a banked Runtime Duration card once and stops its future timer', () => {
    const session = make();
    const banked = card('bank-trash', [], { duration: 99, durationPeriod: 'runtime', recurring: [{ kind: 'crypto', amount: 2 }], onCollapse: [] });
    session.state.players[0].hand = [banked];
    session.deploy(banked.id, 0);
    session.endTurn(); finish(session);
    session.endTurn(); finish(session);
    session.endTurn(); finish(session);
    expect(session.state.players[0].bank.map(entry => entry.card.id)).toContain(banked.id);
    banked.onCollapse = [{ kind: 'trashSelf' }, { kind: 'trashSelf' }];

    session.endDraft(0); session.endDraft(1); session.nextCycle(); finish(session);
    session.endTurn(); finish(session);
    session.endTurn(); finish(session);
    session.endTurn();
    const events = finish(session).filter(event => event.cardId === banked.id && event.kind === 'trash');
    expect(events.map(event => event.amount)).toEqual([1, 0]);
    expect(session.state.trash.filter(item => item.id === banked.id)).toHaveLength(1);
    expect(session.state.players[0].bank.some(entry => entry.card.id === banked.id)).toBe(false);
    expect(session.state.players[0].discard.some(item => item.id === banked.id)).toBe(false);

    session.endDraft(0); session.endDraft(1); session.nextCycle();
    expect(session.state.phase).toBe('runtime');
    expect(session.pendingCount).toBe(0);
  });
});
