import {expect,it} from 'vitest';
import {DecisionClock} from '../src/decisionClock';
import {createSession,seededRandom} from '../src/runtime';
it('has no invented deadline when unconfigured',()=>{const c=new DecisionClock();c.begin('1-1',null);expect(c.tick(999999)).toBeNull();});
it('uses configured duration and increases only the next no-input decision countdown',()=>{
 const c=new DecisionClock();c.begin('1-1',20);expect(c.tick(19000)).toBeNull();expect(c.tick(1000)).toBe('turn');
 c.begin('1-2',20);expect(c.rate).toBe(1.25);expect(c.tick(8000)).toBeNull();expect(c.remaining).toBe(10000);
 c.input();expect(c.rate).toBe(1);expect(c.tick(9999)).toBeNull();expect(c.tick(1)).toBe('turn');expect(c.missed).toBe(0);
});
it('concedes on a second consecutive no-input expiry and expires once',()=>{const c=new DecisionClock();c.begin('1-1',10);expect(c.tick(10000)).toBe('turn');c.begin('1-2',10);expect(c.tick(8000)).toBe('concede');expect(c.tick(10000)).toBeNull();});
it('input breaks the inactivity streak',()=>{const c=new DecisionClock();c.begin('1-1',10);c.tick(10000);c.begin('1-2',10);c.input();c.tick(10000);c.begin('1-3',10);expect(c.tick(10000)).toBe('turn');});
it('concession overrides VP and cannot occur during resolution',()=>{const s=createSession({carryover:true,priorityPreference:'higher',random:seededRandom(1)});s.state.players[0].rewardVP=100;s.concedeForInactivity();expect(s.state.winner).toBe(1);expect(s.state.phase).toBe('gameover');const t=createSession({carryover:true,priorityPreference:'higher',random:seededRandom(2)});t.endTurn();expect(()=>t.concedeForInactivity()).toThrow();});
it('closes each Collapse Node only after all of its rewards, before the next Node',()=>{
 const s=createSession({carryover:true,priorityPreference:'higher',random:seededRandom(341),evaluationContent:true});
 for(let i=0;i<2;i++){s.endTurn();while(s.pendingCount)s.step();}s.endTurn();const events=[];while(s.pendingCount)events.push(s.step()!.event);
 for(let node=0;node<5;node++){const start=events.findIndex(e=>e.node===node&&e.stage==='node-start'),award=events.findIndex(e=>e.node===node&&e.stage==='node-award'),close=events.findIndex(e=>e.node===node&&e.stage==='node-close');expect(start).toBeGreaterThanOrEqual(0);expect(award).toBeGreaterThan(start);expect(close).toBeGreaterThan(award);expect(events.slice(close+1).some(e=>e.node===node&&e.source==='location')).toBe(false);if(node<4)expect(events.findIndex(e=>e.node===node+1&&e.stage==='node-start')).toBeGreaterThan(close);}
});
