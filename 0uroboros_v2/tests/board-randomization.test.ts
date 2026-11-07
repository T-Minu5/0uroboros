import { expect, it } from 'vitest';
import authored from '../content/authored-content.json';
import { compileForSelfPlay } from '@0uroboros/engine/ai/selfPlay';
import { createSession, seededRandom } from '@0uroboros/engine/runtime';
import { initialWeights, starterCards, selectCircuitNode } from '@0uroboros/engine/game';
import { DRAFT_OFFER_COUNT_MIDDLE, DRAFT_SLOTS_MIDDLE, draftOffer } from '@0uroboros/engine/evaluationMarket';

const content = compileForSelfPlay((authored as unknown as { document: Parameters<typeof compileForSelfPlay>[0] }).document);

it('assigns weight buckets by open order while preserving legality and secrecy',()=>{
 const openings=new Set<string>(),weights=new Set<string>(),orders=new Set<string>();
 for(let seed=1;seed<=40;seed++){
  const session=createSession({carryover:true,priorityPreference:'higher',evaluationContent:true,random:seededRandom(seed)});
  const originalWeights=[...session.state.weights];
  openings.add([...session.view().openNodes].sort().join());weights.add(originalWeights.join());
  orders.add(session.state.nodeOrder.join());
  // First opened Node gets 30, second 25, … fifth 10.
  expect(session.state.nodeOrder.map(node=>originalWeights[node])).toEqual([...initialWeights]);
  expect([...originalWeights].sort((a,b)=>a-b)).toEqual([...initialWeights].sort((a,b)=>a-b));
  expect(originalWeights.reduce((sum,n)=>sum+n,0)).toBe(100);
  let previous:number[]=[];
  for(let turn=1;turn<=3;turn++){
   const view=session.view();
   expect(view.openNodes).toHaveLength(turn+2);
   expect(new Set(view.openNodes).size).toBe(turn+2);
   expect(previous.every(n=>view.openNodes.includes(n))).toBe(true);
   expect(view).not.toHaveProperty('nodeOrder');
   view.nodes.forEach((node,n)=>expect(node.location!==null).toBe(view.openNodes.includes(n)));
   expect(view.weights).toEqual(originalWeights);
   const card={...starterCards[8],id:`local-${seed}-${turn}`};session.state.players[0].hand=[card];
   const closed=view.nodes.findIndex((_,n)=>!view.openNodes.includes(n));
   if(closed!==-1){session.deploy(card.id,closed);expect(session.state.nodes[closed].cards[0][0].revealed).toBe(false);session.undoAllPlanning();}
   const target=view.openNodes[turn-1];session.deploy(card.id,target);
   session.endTurn();
   let revealed=false;
   while(session.pendingCount){const next=session.step()!;if(next.event.kind==='reveal'&&next.event.cardId===card.id)revealed=true;}
   expect(revealed).toBe(true);previous=view.openNodes;
  }
  let cumulative=0;
  originalWeights.forEach((weight,index)=>{expect(selectCircuitNode(originalWeights,()=> (cumulative+weight/2)/100)).toBe(index);cumulative+=weight;});
  session.endDraft();session.nextCycle();
  expect(session.view().openNodes).toHaveLength(3);
  expect([...session.state.weights].sort((a,b)=>a-b)).toEqual([10,15,20,25,30]);
 }
 expect(openings.size).toBeGreaterThan(5);
 expect(orders.size).toBeGreaterThan(5);
 expect(weights.size).toBeGreaterThan(5);
});

it('is reproducible with a seeded source and resamples each Cycle',()=>{
 const make=()=>createSession({carryover:true,priorityPreference:'higher',evaluationContent:true,random:seededRandom(93)});
 const a=make(),b=make();const arrangements=new Set<string>();
 for(let cycle=0;cycle<4;cycle++){
  expect(a.view()).toEqual(b.view());arrangements.add(JSON.stringify([a.state.nodeOrder,a.state.weights]));
  for(const session of [a,b]){for(let turn=0;turn<3;turn++){session.endTurn();while(session.pendingCount)session.step();}session.endDraft();session.nextCycle();}
 }
 expect(arrangements.size).toBeGreaterThan(1);
});

it('middleNodesOnly opens one middle Node per turn and keeps ends out of play', () => {
  const openings = new Set<string>();
  for (let seed = 1; seed <= 24; seed++) {
    const session = createSession({
      carryover: true, priorityPreference: 'higher', evaluationContent: true,
      middleNodesOnly: true, random: seededRandom(seed),
    });
    expect(session.state.nodeOrder).toHaveLength(3);
    expect([...session.state.nodeOrder].sort()).toEqual([1, 2, 3]);
    expect(session.view().playableNodes).toEqual([1, 2, 3]);
    expect(session.state.weights[0]).toBe(0);
    expect(session.state.weights[4]).toBe(0);
    // Middle-three open order takes the first three buckets: 30, 25, 20.
    expect(session.state.nodeOrder.map(node => session.state.weights[node])).toEqual([30, 25, 20]);
    expect([...session.state.weights].filter(Boolean).sort((a, b) => a - b)).toEqual([20, 25, 30]);
    expect(session.state.weights.reduce((sum, n) => sum + n, 0)).toBe(75);

    let previous: number[] = [];
    for (let turn = 1; turn <= 3; turn++) {
      const view = session.view();
      expect(view.openNodes).toHaveLength(turn);
      expect(view.openNodes.every(node => [1, 2, 3].includes(node))).toBe(true);
      expect(previous.every(node => view.openNodes.includes(node))).toBe(true);
      openings.add([...view.openNodes].sort().join());
      view.nodes.forEach((node, n) => {
        if (n === 0 || n === 4) expect(node.location).toBeNull();
        else expect(node.location !== null).toBe(view.openNodes.includes(n));
      });
      const card = { ...starterCards[8], id: `mid-${seed}-${turn}` };
      session.state.players[0].hand = [card];
      expect(() => session.deploy(card.id, 0)).toThrow(/out of play/);
      expect(() => session.deploy(card.id, 4)).toThrow(/out of play/);
      const sealedMiddle = [1, 2, 3].find(node => !view.openNodes.includes(node));
      if (sealedMiddle !== undefined) {
        session.deploy(card.id, sealedMiddle);
        expect(session.state.nodes[sealedMiddle].cards[0][0].revealed).toBe(false);
        session.undoAllPlanning();
      }
      session.deploy(card.id, view.openNodes[0]);
      session.endTurn();
      while (session.pendingCount) session.step();
      previous = view.openNodes;
    }
    session.endDraft();
    session.nextCycle();
    expect(session.view().openNodes).toHaveLength(1);
    expect(session.state.weights[0]).toBe(0);
    expect(session.state.weights[4]).toBe(0);
  }
  expect(openings.size).toBeGreaterThan(3);
});

it('default Draft offers eight rotating cards; tenCardDraft expands to ten', () => {
  expect(DRAFT_SLOTS_MIDDLE).toHaveLength(DRAFT_OFFER_COUNT_MIDDLE);
  expect(DRAFT_SLOTS_MIDDLE.map(slot => slot.id)).toEqual([
    'action-utility-1', 'action-utility-2', 'hacker-utility-1', 'hacker-utility-2', 'attack', 'horror', 'solar-monk', 'vp',
  ]);
  expect(draftOffer(seededRandom(11), content, new Set(), new Set(), 8, DRAFT_SLOTS_MIDDLE)).toHaveLength(DRAFT_OFFER_COUNT_MIDDLE);
  const eight = createSession({
    content, carryover: true, priorityPreference: 'higher', evaluationContent: true, strategicMarket: true,
    middleNodesOnly: true, random: seededRandom(11),
  });
  for (let turn = 0; turn < 3; turn++) {
    eight.endTurn();
    while (eight.pendingCount) eight.step();
  }
  expect(eight.state.phase).toBe('draft');
  expect(eight.state.market.filter(pile => pile.rotating)).toHaveLength(DRAFT_OFFER_COUNT_MIDDLE);

  const ten = createSession({
    content, carryover: true, priorityPreference: 'higher', evaluationContent: true, strategicMarket: true,
    tenCardDraft: true, random: seededRandom(11),
  });
  for (let turn = 0; turn < 3; turn++) {
    ten.endTurn();
    while (ten.pendingCount) ten.step();
  }
  expect(ten.state.phase).toBe('draft');
  expect(ten.state.market.filter(pile => pile.rotating)).toHaveLength(10);
});

it('middleNodesOnly keeps end Nodes out of Power push/pull and Collapse', () => {
  const session = createSession({
    content, carryover: true, priorityPreference: 'higher', evaluationContent: true,
    middleNodesOnly: true, midCycleDraw: false, aiSeats: [], random: seededRandom(5),
  });
  session.state.nodeOrder = [1, 2, 3];
  session.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
  session.state.nodes.forEach(node => { node.location = null; });
  const shifter = {
    ...starterCards[0],
    id: 'end-shifter',
    power: 6,
    onReveal: [{ kind: 'transferPower' as const, amount: 2, direction: 'left' as const, flow: 'push' as const }],
  };
  session.state.players[0].hand = [shifter];
  session.deploy('end-shifter', 1);
  session.endTurn(0); session.endTurn(1);
  const events = [];
  while (session.pendingCount) events.push(session.step()!.event);
  expect(events.some(event => /No Power to shift/.test(event.text))).toBe(true);
  expect(session.state.nodes[0].powerModifiers[0]).toBe(0);
  expect(session.state.nodes[1].powerModifiers[0]).toBe(0);
  expect(session.state.nodes[1].powers[0]).toBe(6);

  const rightPush = {
    ...starterCards[0],
    id: 'right-shifter',
    power: 4,
    onReveal: [{ kind: 'transferPower' as const, amount: 1, direction: 'right' as const, flow: 'push' as const }],
  };
  session.state.players[0].hand = [rightPush];
  session.deploy('right-shifter', 1);
  session.endTurn(0); session.endTurn(1);
  while (session.pendingCount) session.step();
  expect(session.state.nodes[0].powerModifiers[0]).toBe(0);
  expect(session.state.nodes[1].powerModifiers[0]).toBe(-1);
  expect(session.state.nodes[2].powerModifiers[0]).toBe(1);

  session.endTurn(0); session.endTurn(1);
  const collapse = [];
  while (session.pendingCount) collapse.push(session.step()!.event);
  expect(collapse.some(event => event.kind === 'collapse')).toBe(true);
  const collapsed = collapse.filter(event => event.stage === 'node-start').map(event => event.node);
  expect(collapsed.length).toBeGreaterThan(0);
  expect(collapsed.every(node => node === 1 || node === 2 || node === 3)).toBe(true);
  expect(collapse.some(event => event.node === 0 || event.node === 4)).toBe(false);
});
