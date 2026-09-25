import { expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent } from '../src/runtime';
import { eventTime } from '../src/presentation';

it('removes empty resolution waits while preserving every real result and ending the Cycle',()=>{
 const session=createSession({carryover:true,priorityPreference:'higher',evaluationContent:true,random:seededRandom(341)});
 const events:RuntimeEvent[]=[];
 for(let turn=1;turn<=3;turn++){
  for(const card of [...session.state.players[0].hand]){
   if(card.type==='Crypto')continue;
   for(const node of session.view().openNodes){
    try{session.deploy(card.id,node);break;}catch{/* Try another legal node. */}
   }
  }
  session.endTurn();while(session.pendingCount)events.push(session.step()!.event);
 }
 const previous=events.reduce((total,event)=>total+(event.kind==='circuit'?3000:event.target?1500:event.kind==='reveal'?1100:event.kind==='power'?1050:850),0);
 const current=events.reduce((total,event)=>total+eventTime(event,false),0);
 expect(session.state.phase).toBe('draft');
 expect(current).toBeLessThan(previous*.75);
 for(const event of events.filter(event=>event.target&&(event.amount??0)>0)){
  expect(eventTime(event,false)).toBeGreaterThanOrEqual(1000);
  expect(eventTime(event,true)).toBeGreaterThanOrEqual(500);
 }
 expect(events.filter(event=>eventTime(event,false)===0).every(event=>!event.target||event.amount===0)).toBe(true);
 console.log(`Resolution time for seeded Cycle: ${previous/1000}s → ${current/1000}s; all ${events.length} events executed.`);
});

it('keeps game-ending and Circuit selection beats visible at either pace',()=>{
 for(const kind of ['gameover','circuit'] as const){
  const event={id:1,kind,text:'Result'} as RuntimeEvent;
  expect(eventTime(event,false)).toBeGreaterThan(0);
  expect(eventTime(event,true)).toBeGreaterThan(0);
 }
});
