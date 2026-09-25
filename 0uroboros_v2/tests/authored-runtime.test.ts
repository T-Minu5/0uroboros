import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent, type ContentDocument } from '../src/authoring/contentModel';
import { starterCards, type Card } from '../src/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';

const identity = (card: Card) => card.definitionId ?? card.id;
const saved = (document: ContentDocument) => compileContent(JSON.parse(JSON.stringify(document)) as ContentDocument);
const make = (document: ContentDocument) => createSession({
  carryover: true, priorityPreference: 'higher', random: seededRandom(19),
  strategicMarket: true, evaluationContent: true, content: saved(document),
});
const empty = (session: RuntimeSession) => session.state.players.forEach(player => {
  player.hand = []; player.draw = []; player.discard = []; player.destroyed = [];
});
const advance = (session: RuntimeSession) => {
  const events: RuntimeEvent[] = [];
  while (session.pendingCount) {
    events.push(session.step()!.event);
    if (events.length > 400) throw new Error('Authored resolution stalled.');
  }
  return events;
};
const finish = (session: RuntimeSession) => {
  const events: RuntimeEvent[] = [];
  for (let i = 0; session.pendingCount || session.state.choice; i++) {
    if (i > 500) throw new Error('Authored resolution stalled.');
    events.push(session.state.choice ? session.choose(session.state.choice.options[0].id) : session.step()!.event);
  }
  return events;
};

describe('authored content in RuntimeSession', () => {
  it('maps all ten canonical starter slots to authored definitions while preserving unique instance IDs', () => {
    const document = createDefaultContent();
    const slash = document.cards.find(card => identity(card) === 'slash-dot')!;
    slash.name = 'Saved Slash'; slash.power = 6; slash.cost = 9;
    slash.onReveal = [{ kind: 'crypto', amount: 4 }];
    const byte = document.cards.find(card => identity(card) === 'byte-coin')!;
    byte.name = 'Saved Byte'; byte.cryptoValue = 9;
    const vault = document.cards.find(card => identity(card) === 'vault-encryption')!;
    vault.name = 'Saved Vault'; vault.vp = 7;
    const compiled = saved(document);
    const session = createSession({ carryover: true, priorityPreference: 'higher', random: seededRandom(19), strategicMarket: true, evaluationContent: true, content: compiled });
    const slots: Record<string, string> = {
      slash: 'slash-dot', dash: 'dash', dot: 'dot', razor: 'rezz-razor', blade: 'rezz-blade',
      'byte-1': 'byte-coin', 'byte-2': 'byte-coin', kilo: 'kilo-coin',
      'vault-1': 'vault-encryption', 'vault-2': 'vault-encryption',
    };
    for (const owner of [0, 1] as const) {
      const cards = [...session.state.players[owner].hand, ...session.state.players[owner].draw];
      expect(cards).toHaveLength(10);
      expect(new Set(cards.map(card => card.id)).size).toBe(10);
      for (const [slot, definitionId] of Object.entries(slots)) {
        const instance = cards.find(card => card.id === `${owner}:${slot}`);
        const definition = compiled.cards.find(card => identity(card) === definitionId);
        expect(instance).toMatchObject({ definitionId, name: definition?.name, cost: definition?.cost });
        expect(instance?.onReveal).toEqual(definition?.onReveal);
      }
      expect(cards.find(card => card.id === `${owner}:slash`)).toMatchObject({ name: 'Saved Slash', power: 6, cost: 9 });
      expect(cards.find(card => card.id === `${owner}:byte-1`)).toMatchObject({ name: 'Saved Byte', cryptoValue: 9 });
      expect(cards.find(card => card.id === `${owner}:vault-1`)).toMatchObject({ name: 'Saved Vault', vp: 7 });
    }
    expect(session.view().players[0].totalVP).toBe(14);

    const local = [...session.state.players[0].hand, ...session.state.players[0].draw];
    const slashInstance = local.find(card => card.id === '0:slash')!;
    const byteInstance = local.find(card => card.id === '0:byte-1')!;
    const vaultInstance = local.find(card => card.id === '0:vault-1')!;
    empty(session);
    session.state.players[0].hand = [slashInstance, byteInstance, vaultInstance];
    session.state.players[0].centers.primary = 1800;
    session.deploy(slashInstance.id, 0); session.deploy(vaultInstance.id, 0);
    session.endTurn();
    const first = finish(session);
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'crypto', cardId: slashInstance.id, amount: 4 }),
      expect.objectContaining({ kind: 'restore', cardId: vaultInstance.id, amount: 100 }),
    ]));
    expect(session.state.players[0].centers.primary).toBe(1900);
    expect(session.state.players[0].wallet).toBe(4);
    expect(session.view().players[0].totalVP).toBe(7);
    session.endTurn(); finish(session);
    session.endTurn();
    const last = finish(session);
    expect(last).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'crypto', cardId: byteInstance.id, amount: 9 })]));
  });

  it('builds the core market and rotating offers from enabled authored pools and costs', () => {
    const document = createDefaultContent();
    document.cards.find(card => identity(card) === 'slash-dot')!.cost = 11;
    document.cards.find(card => identity(card) === 'eval-relocation-relay')!.cost = 1;
    const rotatingBase = new Set(['eval-relocation-relay', 'eval-signal-amplifier']);
    const chaos = new Set(['rezz-razor', 'rezz-blade', 'eval-hostile-reroute']);
    document.cards.forEach(card => {
      if (card.pool === 'Base' && !card.core) card.enabled = rotatingBase.has(identity(card));
      if (card.pool === 'Chaos') card.enabled = chaos.has(identity(card));
    });
    const session = make(document);
    expect(session.state.market.find(pile => pile.id === 'Base:slash-dot')?.card.cost).toBe(11);
    empty(session);
    session.state.turn = 3;
    session.endTurn(); finish(session);
    expect(new Set(session.state.market.filter(pile => pile.category === 'Base' && pile.rotating).map(pile => identity(pile.card)))).toEqual(rotatingBase);
    expect(new Set(session.state.market.filter(pile => pile.category === 'Chaos').map(pile => identity(pile.card)))).toEqual(chaos);
    expect(session.state.market.find(pile => pile.id === 'Base:eval-relocation-relay')?.card.cost).toBe(1);
  });

  it('resolves authored Location and Circuit recipes during Collapse and Draft', () => {
    const document = createDefaultContent();
    document.locations[0].name = 'Saved Exchange';
    document.locations[0].effects = [];
    document.locations[0].effectIds = ['location-crypto'];
    document.locations.slice(1).forEach(location => { location.effects = []; });
    document.effects.find(effect => effect.id === 'location-crypto')!.effects = [{ kind: 'crypto', amount: 7 }];
    document.circuitRewards[0].name = 'Saved Crown';
    document.circuitRewards[0].effectId = 'circuit-vp';
    document.circuitRewards.slice(1).forEach(reward => { reward.enabled = false; });
    document.effects.find(effect => effect.id === 'circuit-vp')!.effects = [{ kind: 'vp', amount: 9 }];
    const session = make(document);
    expect(session.state.nodes.some(node => node.location?.name === 'Saved Exchange')).toBe(true);
    empty(session);
    session.state.turn = 3;
    session.endTurn();
    const events = finish(session);
    expect(events.filter(event => event.source === 'location' && event.kind === 'crypto')).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'Saved Exchange', amount: 7, targetOwner: 0 }),
      expect.objectContaining({ sourceName: 'Saved Exchange', amount: 7, targetOwner: 1 }),
    ]));
    expect(session.state.players[0].wallet).toBe(7);
    expect(session.state.players[1].wallet).toBe(7);
    expect(session.state.circuitReward.definition).toMatchObject({ name: 'Saved Crown', effect: { kind: 'vp', amount: 9 } });
    expect(session.claimCircuitReward(0)).toMatchObject({ kind: 'vp', sourceName: 'Saved Crown', amount: 9 });
    expect(session.state.players[0].rewardVP).toBe(9);
  });

  it('runs resolved card effectRefs from an injected authored card through move and Power choices', () => {
    const document = createDefaultContent();
    const source = document.cards.find(card => identity(card) === 'eval-relocation-relay')!;
    source.name = 'Saved Relay'; source.power = 3; source.cost = 6;
    source.onReveal = [];
    source.effectRefs = { onReveal: ['card-move-opponent', 'card-power-surge'] };
    const session = make(document);
    empty(session);
    session.state.nodeOrder = [0, 1, 2, 3, 4];
    session.state.priority = 0;
    session.state.nodes[0].cards[1].push({ card: { ...starterCards[0], id: 'opponent-target' }, owner: 1, node: 0, order: 1, revealed: true });
    const added = session.addEvaluationCard('eval-relocation-relay');
    expect(session.state.players[0].hand[0]).toMatchObject({ name: 'Saved Relay', cost: 6, power: 3, onReveal: [{ kind: 'moveCard', opponent: true }, { kind: 'modifyPower', amount: 2 }] });
    session.deploy(added.cardId!, 0); session.endTurn(); advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toEqual(['card-opponent-target']);
    session.choose('card-opponent-target');
    const move = session.choose('node-1');
    expect(move).toMatchObject({ kind: 'move', cardId: added.cardId, targetCardId: 'opponent-target', targetOwner: 1, sourceNode: 0, targetNode: 1 });
    advance(session);
    expect(session.state.choice?.options.map(option => option.id)).toEqual([`card-${added.cardId}`]);
    const power = session.choose(`card-${added.cardId}`);
    expect(power).toMatchObject({ kind: 'power', cardId: added.cardId, targetCardId: added.cardId, targetOwner: 0, amount: 2, before: 3, after: 5 });
    expect(session.state.nodes[0].powers[0]).toBe(5);
    expect(session.state.nodes[1].powers[1]).toBe(3);
    finish(session);
  });

  it('clones compiled content so caller mutations cannot alter future cards, Locations or Circuit rewards', () => {
    const document = createDefaultContent();
    document.circuitRewards.slice(1).forEach(reward => { reward.enabled = false; });
    const compiled = saved(document);
    const source = compiled.cards.find(card => identity(card) === 'eval-relocation-relay')!;
    const originalCardName = source.name;
    const originalLocationName = compiled.locations[0].name;
    const originalReward = structuredClone(compiled.circuitRewards[0]);
    const session = createSession({ carryover: true, priorityPreference: 'higher', random: seededRandom(19), strategicMarket: true, evaluationContent: true, content: compiled });
    empty(session);
    source.name = 'Caller Mutation';
    source.cost = 999;
    compiled.locations[0].name = 'Caller Mutation';
    compiled.locations[0].effects[0].amount = 999;
    compiled.circuitRewards[0].name = 'Caller Mutation';
    compiled.circuitRewards[0].effect.amount = 999;
    const added = session.addEvaluationCard('eval-relocation-relay');
    expect(session.state.players[0].hand.find(card => card.id === added.cardId)).toMatchObject({ name: originalCardName, cost: 3 });
    session.state.turn = 3;
    session.endTurn(); finish(session);
    expect(session.state.circuitReward.definition).toEqual(originalReward);
    expect(session.state.nodes.some(node => node.location?.name === 'Caller Mutation')).toBe(false);
    session.endDraft(0); session.endDraft(1); session.nextCycle();
    expect(session.state.nodes.some(node => node.location?.name === originalLocationName)).toBe(true);
    expect(session.state.nodes.some(node => node.location?.name === 'Caller Mutation')).toBe(false);
  });
});
