import {expect,it} from 'vitest';
import {createSession,seededRandom,type RuntimeSession} from '../src/runtime';
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
 s.choose('pay');expect(s.state.choice?.options).toHaveLength(2);
 s.choose('one');drain(s);expect(s.state.players[0].wallet).toBe(0);
 s.choose('two');drain(s);expect(s.state.players[0].wallet).toBe(3);
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
 expect(s.state.choice?.options.some(o=>o.id==='finish-selection')).toBe(false);
 s.choose('vp');drain(s);expect(s.view().players[0].totalVP).toBe(0);
 expect(s.state.choice?.options.some(o=>o.id==='finish-selection')).toBe(true);
 s.choose('finish-selection');drain(s);expect(s.state.trash.map(c=>c.id)).toEqual(['vp']);expect(s.state.players[0].hand.map(c=>c.id)).toEqual(['keep']);
});

it('scry keeps retained draw order and removes only explicitly discarded inspected cards',()=>{
 const s=make();s.state.players[0].draw=['a','b','c','d'].map(id=>card(id));
 play(s,card('scry',[{kind:'scry',amount:3}]));
 expect(s.view().players[0].draw.every(c=>c.hidden)).toBe(true);
 s.choose('keep');drain(s);s.choose('discard');drain(s);s.choose('keep');drain(s);
 expect(s.state.players[0].draw.map(c=>c.id)).toEqual(['a','c','d']);expect(s.state.players[0].discard.map(c=>c.id)).toEqual(['b']);
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
 expect(s.state.players[0].centers.backup).toBe(0);expect(s.state.players[1].destructionVP).toBe(0);
});

it('self-destruction of the last surviving center ends Runtime before later card effects',()=>{
 const s=make();s.state.players[0].centers.primary=0;
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
  s.state.players.forEach(p=>{for(const value of [p.actions,p.pendingActions,p.wallet,p.centers.primary,p.centers.backup,p.totalVP]){expect(Number.isFinite(value)).toBe(true);expect(value).toBeGreaterThanOrEqual(0);}expect(p.bank.length).toBeLessThanOrEqual(4);});
 };
 const pump=()=>{let steps=0;while(s.pendingCount||s.state.choice){const event=s.state.choice?s.choose(s.state.choice.options[0].id):s.step()!.event;if(event.cardId?.includes(':generated-'))generated.add(event.cardId);check();if(++steps>500)throw new Error(`Choice/schedule loop for ${definition.name}`);}};
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
 const s=make();const added=s.addEvaluationCard('bios-archive');s.state.players[0].centers.primary=1000;
 s.deploy(added.cardId!,0);s.endTurn();drain(s);expect(s.state.players[0].centers.primary).toBe(1150);
 s.endTurn();drain(s);expect(s.state.players[0].centers.primary).toBe(1225);
 s.endTurn();drain(s);s.endDraft(0);s.endDraft(1);s.nextCycle();drain(s);
 expect(s.state.players[0].centers.primary).toBe(1300);expect(s.state.players[0].bank[0].card.id).toBe(added.cardId);
 s.state.players[0].centers.primary=0;s.endTurn();drain(s);expect(s.state.players[0].centers.primary).toBe(0);
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
