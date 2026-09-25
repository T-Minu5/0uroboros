import { expect, it } from 'vitest';
import { createSession, seededRandom } from '../src/runtime';
import { initialWeights, starterCards, selectCircuitNode } from '../src/game';

it('randomizes reveal order and weight placement independently while preserving legality and secrecy',()=>{
 const openings=new Set<string>(),weights=new Set<string>();
 for(let seed=1;seed<=40;seed++){
  const session=createSession({carryover:true,priorityPreference:'higher',evaluationContent:true,random:seededRandom(seed)});
  const originalWeights=[...session.state.weights];
  openings.add([...session.view().openNodes].sort().join());weights.add(originalWeights.join());
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
 expect(weights.size).toBeGreaterThan(15);
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
