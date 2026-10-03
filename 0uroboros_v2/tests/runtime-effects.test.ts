import {expect,it} from 'vitest';
import {createSession,firstLegalSelection,seededRandom,type RuntimeSession} from '../src/runtime';
import {EVALUATION_ALL_CARDS} from '../src/evaluationMarket';
import {starterCards,type Card,type EvaluationEffect} from '../src/game';
const make=()=>{const session=createSession({carryover:true,priorityPreference:'higher',strategicMarket:true,random:seededRandom(19)});session.state.nodeOrder=[0,1,2,3,4];session.state.players.forEach(p=>{p.hand=[];p.draw=[];p.discard=[];});return session;};
const card=(id:string,effects:EvaluationEffect[]=[],extra:Partial<Card>={}):Card=>({...starterCards[0],id,onReveal:effects,...extra});
function drain(session:RuntimeSession){const events=[];while(session.pendingCount){events.push(session.step()!.event);if(events.length>200)throw new Error('stalled');}return events;}
function play(session:RuntimeSession,source:Card){session.state.players[0].hand.unshift(source);session.deploy(source.id,0);session.endTurn();return drain(session);}

it('optional discard cost is all-or-none and pays the benefit only after the complete cost',()=>{
 const s=make();s.state.players[0].hand=[card('one'),card('two')];
 play(s,card('payment',[{kind:'handDiscard',amount:2,optional:true,then:[{kind:'crypto',amount:3}]}]));
 expect(s.state.choice?.options.map(o=>o.id)).toEqual(['decline','pay']);
 s.choose('pay');expect(s.state.choice).toMatchObject({select:{min:2,max:2}});
 expect(s.state.choice?.options.map(o=>o.card?.id)).toEqual(['one','two']);
 expect(()=>s.choose(['one'])).toThrow(/Choose 2/);
 expect(s.state.players[0].hand).toHaveLength(2);
 s.choose(['one','two']);drain(s);expect(s.state.players[0].wallet).toBe(3);
 expect(s.state.players[0].discard.map(c=>c.id)).toEqual(['one','two']);
});

it('insufficient optional payment never removes cards or grants the benefit',()=>{
 const s=make();s.state.players[0].hand=[card('only')];
 play(s,card('payment',[{kind:'handDiscard',amount:2,optional:true,then:[{kind:'crypto',amount:3}]}]));
 expect(s.state.choice?.options.map(o=>o.id)).toEqual(['decline']);
 s.choose('decline');drain(s);expect(s.state.players[0].hand.map(c=>c.id)).toEqual(['only']);expect(s.state.players[0].wallet).toBe(0);
});

it('hand trash removes VP ownership and permits finishing only after the required minimum',()=>{
 const s=make();s.state.players[0].hand=[card('vp',[],{type:'VP',vp:4}),card('keep')];
 play(s,card('trash',[{kind:'handTrash',amount:3,min:1}]));
 expect(s.state.choice).toMatchObject({select:{min:1,max:2}});
 expect(()=>s.choose([])).toThrow(/Choose 1–2/);
 s.choose(['vp']);drain(s);expect(s.view().players[0].totalVP).toBe(0);
 expect(s.state.choice).toBeNull();
 expect(s.state.trash.map(c=>c.id)).toEqual(['vp']);expect(s.state.players[0].hand.map(c=>c.id)).toEqual(['keep']);
});

it('scry asks keep, discard, or trash for every inspected card and applies them together',()=>{
 const s=make();s.state.players[0].draw=['a','b','c','d'].map(id=>card(id));
 play(s,card('scry',[{kind:'scry',amount:3}]));
 expect(s.view().players[0].draw.every(c=>c.hidden)).toBe(true);
 expect(s.state.choice?.groups?.map(g=>g.card?.id)).toEqual(['a','b','c']);
 expect(s.state.choice?.options.filter(o=>o.group==='a').map(o=>o.label)).toEqual(['Keep','Discard','Trash']);
 expect(()=>s.choose(['keep:a','discard:b'])).toThrow(/each card/);
 expect(()=>s.choose(['keep:a','discard:a','trash:c'])).toThrow(/each card/);
 expect(s.state.players[0].draw).toHaveLength(4);
 s.choose(['keep:a','discard:b','trash:c']);drain(s);
 expect(s.state.players[0].draw.map(c=>c.id)).toEqual(['a','d']);
 expect(s.state.players[0].discard.map(c=>c.id)).toEqual(['b']);
 expect(s.state.trash.map(c=>c.id)).toEqual(['c']);
});

it('scoped attacking-owner choice can choose an opposing card without exposing the rest of the hand view',()=>{
 const s=make();
 // No opponent Actions means these cards remain in hand until the scoped attack.
 s.state.players[1].actions=0;s.state.players[1].hand=[card('enemy-a'),card('enemy-b')];
 play(s,card('attack',[{kind:'handDiscard',amount:1,opponent:true,chooser:'owner'}]));
 expect(s.state.choice?.options.map(o=>o.id)).toEqual(['enemy-a','enemy-b']);
 expect(s.view().players[1].hand.every(c=>'hidden' in c)).toBe(true);
 s.choose('enemy-b');drain(s);expect(s.state.players[1].discard.map(c=>c.id)).toEqual(['enemy-b']);
});

it('Runtime schedules cross Cycle refill, give Actions in the scheduled turn, then expire',()=>{
 const s=make();s.state.players[0].hand=[card('timed',[],{duration:4,durationPeriod:'runtime',schedule:[{at:2,effects:[{kind:'actions',amount:2}]},{at:4,effects:[{kind:'draw',amount:1}]}]})];
 s.deploy('timed',0);s.endTurn();drain(s);
 expect(s.state.players[0].actions).toBe(4);expect(s.state.players[0].pendingActions).toBe(0);
 s.endTurn();drain(s);s.endTurn();drain(s);
 expect(s.view().players[0].bank[0]).toMatchObject({remainingTurns:1});
 s.state.players[0].draw=Array.from({length:6},(_,i)=>card(`refill-${i}`));
 s.endDraft(0);s.endDraft(1);s.nextCycle();expect(s.state.phase).toBe('reveal');drain(s);
 expect(s.state.players[0].hand).toHaveLength(6);expect(s.state.phase).toBe('runtime');
 s.endTurn();drain(s);expect(s.state.players[0].bank).toHaveLength(0);expect(s.state.players[0].discard.some(c=>c.id==='timed')).toBe(true);
});

it('self-destruction gives the opponent no destruction VP',()=>{
 const s=make();play(s,card('sacrifice',[{kind:'selfDestroyBackup'}]));
 expect(s.state.players[0].servers.backup).toBe(0);expect(s.state.players[1].destructionVP).toBe(0);
});

it('self-destruction of the last surviving server ends Runtime before later card effects',()=>{
 const s=make();s.state.players[0].servers.primary=0;
 const events=play(s,card('sacrifice',[{kind:'selfDestroyBackup'},{kind:'crypto',amount:99}]));
 expect(s.state.phase).toBe('gameover');expect(s.state.players[0].wallet).toBe(0);
 expect(events.at(-1)?.kind).toBe('gameover');expect(s.state.players[1].destructionVP).toBe(0);
});

it.each(EVALUATION_ALL_CARDS.map(definition=>[definition.name,definition] as const))('executes catalog card %s through four Cycles without invalid resources or card loss',(_name,definition)=>{
 const s=make();
 const food=(id:string)=>({...starterCards[5],id});
 s.state.players[0].draw=Array.from({length:16},(_,i)=>food(`deck-${i}`));
 s.state.players[0].hand=Array.from({length:5},(_,i)=>food(`hand-${i}`));
 s.state.players[1].hand=Array.from({length:5},(_,i)=>food(`opponent-${i}`));
 s.state.players[1].draw=Array.from({length:10},(_,i)=>food(`opponent-deck-${i}`));
 const added=s.addEvaluationCard(definition.definitionId ?? definition.id);
 const initial=37,generated=new Set<string>();
 const check=()=>{
  const cards=s.state.players.flatMap((p,owner)=>[...p.hand,...p.draw,...p.discard,...p.destroyed,...p.bank.map(e=>e.card),...s.state.nodes.flatMap(n=>n.cards[owner].map(c=>c.card))]).concat(s.state.trash);
  expect(cards.length).toBe(initial+generated.size);
  expect(new Set(cards.map(c=>c.id)).size).toBe(cards.length);
  expect(cards.filter(c=>c.id===added.cardId)).toHaveLength(1);
  s.state.players.forEach(p=>{for(const value of [p.actions,p.pendingActions,p.wallet,p.servers.primary,p.servers.backup,p.totalVP]){expect(Number.isFinite(value)).toBe(true);expect(value).toBeGreaterThanOrEqual(0);}expect(p.bank.length).toBeLessThanOrEqual(4);});
 };
 const pump=()=>{let steps=0;while(s.pendingCount||s.state.choice){const event=s.state.choice?s.choose(firstLegalSelection(s.state.choice)):s.step()!.event;if(event.cardId?.includes(':generated-'))generated.add(event.cardId);check();if(++steps>500)throw new Error(`Choice/schedule loop for ${definition.name}`);}};
 if(definition.type!=='Crypto')s.deploy(added.cardId!,0);
 for(let cycle=0;cycle<4;cycle++){
  pump();
  for(let turn=0;turn<3&&s.state.phase!=='gameover';turn++){s.endTurn();pump();}
  if(s.state.phase==='gameover')break;
  expect(s.state.phase).toBe('draft');s.endDraft(0);s.endDraft(1);s.nextCycle();pump();check();
 }
 if(definition.durationPeriod==='runtime' && definition.duration!==99)expect(s.state.players[0].bank.some(entry=>entry.card.id===added.cardId)).toBe(false);
});

it('Chronos Cache gains exactly one Mega-Cache atop the deck at the end of its third Runtime turn without consuming stock',()=>{
 const s=make();const added=s.addEvaluationCard('chronos-cache');const stock=s.state.market.map(p=>[p.id,p.supply]);
 s.deploy(added.cardId!,0);s.endTurn();drain(s);s.endTurn();drain(s);
 expect(s.state.players[0].draw).toHaveLength(0);
 s.endTurn();const events=drain(s);const generated=events.filter(e=>e.cardId?.includes(':generated-'));
 expect(generated).toHaveLength(1);expect(s.state.players[0].draw[0]).toMatchObject({definitionId:'mega-cache',cryptoValue:5});
 expect(s.state.market.filter(p=>stock.some(([id])=>id===p.id)).map(p=>[p.id,p.supply])).toEqual(stock);
});

it('permanent historic storage heals each Runtime turn across the Cycle boundary without reviving destroyed Primary',()=>{
 const s=make();const added=s.addEvaluationCard('bios-archive');s.state.players[0].servers.primary=1000;
 s.deploy(added.cardId!,0);s.endTurn();drain(s);expect(s.state.players[0].servers.primary).toBe(1150);
 s.endTurn();drain(s);expect(s.state.players[0].servers.primary).toBe(1225);
 s.endTurn();drain(s);s.endDraft(0);s.endDraft(1);s.nextCycle();drain(s);
 expect(s.state.players[0].servers.primary).toBe(1300);expect(s.state.players[0].bank[0].card.id).toBe(added.cardId);
 s.state.players[0].servers.primary=0;s.endTurn();drain(s);expect(s.state.players[0].servers.primary).toBe(0);
});

it('evaluation injection is explicit, unique, and blocked after any planning placement',()=>{
 const s=make();const a=s.addEvaluationCard('root-rune'),b=s.addEvaluationCard('root-rune');
 expect(a.cardId).not.toBe(b.cardId);s.deploy(a.cardId!,0);
 const before=structuredClone(s.state);expect(()=>s.addEvaluationCard('root-rune')).toThrow(/before planning/);expect(s.state).toEqual(before);
 s.undoAllPlanning();expect(()=>s.addEvaluationCard('root-rune')).not.toThrow();
 const normal=createSession({carryover:true,priorityPreference:'higher',random:seededRandom(1)});
 expect(()=>normal.addEvaluationCard('root-rune')).toThrow(/evaluation/);
});

it('a Runtime duration rejected by a full Bank stops scheduling once it enters Discard',()=>{
 const s=make();s.state.players[0].bank=Array.from({length:4},(_,i)=>({card:card(`permanent-${i}`,[],{duration:99}),enteredCycle:1,order:i}));
 play(s,card('rejected',[],{duration:5,durationPeriod:'runtime',schedule:[{at:4,effects:[{kind:'crypto',amount:99}]}]}));
 s.endTurn();drain(s);s.endTurn();drain(s);expect(s.state.players[0].discard.some(c=>c.id==='rejected')).toBe(true);
 s.endDraft(0);s.endDraft(1);s.nextCycle();drain(s);expect(s.state.players[0].wallet).toBe(0);
});

const shiftFrom=(node:number,effect:EvaluationEffect)=>{const s=make();const source=card('shifter',[effect],{power:6});s.state.players[0].hand.unshift(source);s.deploy('shifter',node);s.endTurn();const events=drain(s);return{s,events};};

it('a rightward shift pushes Power to the next Node without prompting',()=>{
 const {s}=shiftFrom(2,{kind:'transferPower',amount:2,direction:'right'});
 expect(s.state.choice).toBeFalsy();
 expect(s.state.nodes[2].powers[0]).toBe(4);
 expect(s.state.nodes[3].powers[0]).toBe(2);
 expect(s.state.nodes[1].powers[0]).toBe(0);
});

it('a split shift divides Power across both neighbours and gives the odd point to the left',()=>{
 const {s}=shiftFrom(2,{kind:'transferPower',amount:3,direction:'split'});
 expect(s.state.nodes[1].powers[0]).toBe(2);
 expect(s.state.nodes[3].powers[0]).toBe(1);
 expect(s.state.nodes[2].powers[0]).toBe(3);
});

it('a shift toward a Node that does not exist moves nothing',()=>{
 const {s,events}=shiftFrom(0,{kind:'transferPower',amount:2,direction:'left'});
 expect(s.state.nodes[0].powers[0]).toBe(6);
 expect(events.some(e=>e.text.includes('No Power to shift'))).toBe(true);
});

it('shift still prompts for a direction when the author left it to the player',()=>{
 const {s}=shiftFrom(2,{kind:'transferPower',amount:2,direction:'choice'});
 expect(s.state.choice?.options.length).toBeGreaterThan(1);
});

it('a player-choice transfer offers push and pull on both sides with the diamond layout',()=>{
 const {s}=shiftFrom(2,{kind:'transferPower',amount:2,direction:'choice'});
 expect(s.state.choice?.prompt).toBe('Push or pull 2 power to or from nearby locations.');
 expect(s.state.choice?.options.map(o=>o.id)).toEqual(['push-left','push-right','pull-left','pull-right']);
 expect(s.state.choice?.transfer).toMatchObject({amount:2,center:2,nodes:[{node:1,power:0},{node:2,power:6},{node:3,power:0}]});
});

it('pulling draws Power in from a neighbour, which may go negative',()=>{
 const {s}=shiftFrom(2,{kind:'transferPower',amount:2,direction:'choice'});
 const event=s.choose('pull-left');
 expect(event).toMatchObject({kind:'power',sourceNode:1,targetNode:2,amount:2});
 expect(s.state.nodes[1].powers[0]).toBe(-2);
 expect(s.state.nodes[2].powers[0]).toBe(8);
});

it('pushing is not capped by the Power on the source Location',()=>{
 const {s}=shiftFrom(2,{kind:'transferPower',amount:9,direction:'right'});
 expect(s.state.nodes[2].powers[0]).toBe(-3);
 expect(s.state.nodes[3].powers[0]).toBe(9);
});

it('push-only and pull-only player choices offer just that verb',()=>{
 const push=shiftFrom(2,{kind:'transferPower',amount:2,direction:'choice',flow:'push'}).s;
 expect(push.state.choice?.prompt).toBe('Push 2 power to a nearby location.');
 expect(push.state.choice?.options.map(o=>o.id)).toEqual(['push-left','push-right']);
 const pull=shiftFrom(2,{kind:'transferPower',amount:2,direction:'choice',flow:'pull'}).s;
 expect(pull.state.choice?.options.map(o=>o.id)).toEqual(['pull-left','pull-right']);
});

it('an automatic one-sided pull resolves without prompting',()=>{
 const {s}=shiftFrom(2,{kind:'transferPower',amount:2,direction:'right',flow:'pull'});
 expect(s.state.choice).toBeFalsy();
 expect(s.state.nodes[3].powers[0]).toBe(-2);
 expect(s.state.nodes[2].powers[0]).toBe(8);
});

it('a split at the edge sends the whole amount to the only neighbour',()=>{
 const {s}=shiftFrom(0,{kind:'transferPower',amount:3,direction:'split'});
 expect(s.state.nodes[1].powers[0]).toBe(3);
 expect(s.state.nodes[0].powers[0]).toBe(3);
});

const banked=(...ids:string[])=>ids.map((id,order)=>({card:card(id,[],{duration:5}),enteredCycle:1,order}));

it('a random bump moves an opponent Effect Bank card to their discard pile',()=>{
 const s=make();s.state.players[1].bank=banked('bank-a','bank-b');
 const events=play(s,card('bumper',[{kind:'bump',amount:1,zone:'bank',cardPick:'random'}]));
 expect(s.state.choice).toBeFalsy();
 expect(s.state.players[1].bank).toHaveLength(1);
 expect(s.state.players[1].discard).toHaveLength(1);
 expect(events.find(e=>e.text.includes('bumps'))).toMatchObject({kind:'trash',target:'discard',targetOwner:1,amount:1});
});

it('a chosen bump lets the player pick from the opponent Crypto wallet',()=>{
 const s=make();
 s.state.players[1].hand=[card('coin-a',[],{type:'Crypto',cryptoValue:1}),card('coin-b',[],{type:'Crypto',cryptoValue:2}),card('not-crypto')];
 s.state.players[1].bank=banked('bank-a');
 play(s,card('bumper',[{kind:'bump',amount:1,zone:'wallet',cardPick:'choice'}]));
 expect(s.state.choice?.options.map(o=>o.id)).toEqual(['coin-a','coin-b']);
 expect(s.state.choice?.options[0].card?.id).toBe('coin-a');
 s.choose('coin-b');
 expect(s.state.players[1].hand.filter(c=>c.type==='Crypto').map(c=>c.id)).toEqual(['coin-a']);
 expect(s.state.players[1].discard.map(c=>c.id)).toEqual(['coin-b']);
 expect(s.state.players[1].bank).toHaveLength(1);
});

it('a bump from either zone offers bank and wallet cards together',()=>{
 const s=make();
 s.state.players[1].hand=[card('coin-a',[],{type:'Crypto',cryptoValue:1})];
 s.state.players[1].bank=banked('bank-a');
 play(s,card('bumper',[{kind:'bump',amount:2,zone:'either'}]));
 expect(s.state.choice?.options.map(o=>o.id)).toEqual(['bank-a','coin-a']);
 s.choose(['bank-a','coin-a']);
 expect(s.state.players[1].discard.map(c=>c.id).sort()).toEqual(['bank-a','coin-a']);
});

it('a bump with nothing to hit reports no target',()=>{
 const s=make();
 const events=play(s,card('bumper',[{kind:'bump',amount:1,zone:'either',cardPick:'random'}]));
 expect(events.some(e=>e.text==='bumper: No target.'||e.text.endsWith(': No target.'))).toBe(true);
 expect(s.state.players[1].discard).toHaveLength(0);
});

it('stealing Crypto moves cards from the opponent wallet into your hand',()=>{
 const s=make();
 s.state.players[1].hand=[card('coin-a',[],{type:'Crypto',cryptoValue:1}),card('coin-b',[],{type:'Crypto',cryptoValue:2}),card('coin-c',[],{type:'Crypto',cryptoValue:3})];
 play(s,card('thief',[{kind:'stealCrypto',amount:2}]));
 expect(s.state.players[1].hand.filter(c=>c.type==='Crypto')).toHaveLength(1);
 expect(s.state.players[0].hand.filter(c=>c.type==='Crypto')).toHaveLength(2);
});

it('stealing Crypto from an opponent holding none reports no target',()=>{
 const s=make();
 const events=play(s,card('thief',[{kind:'stealCrypto',amount:1}]));
 expect(events.some(e=>e.kind==='crypto'&&e.text.includes('No target'))).toBe(true);
 expect(s.state.players[0].hand.filter(c=>c.type==='Crypto')).toHaveLength(0);
});
