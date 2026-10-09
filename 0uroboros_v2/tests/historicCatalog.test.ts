import { describe, expect, it } from 'vitest';
import source from '../assets/card_art/cards.json';
import { HISTORIC_CARDS, HISTORIC_EXCLUSIONS, HISTORIC_SOURCE_METADATA } from '@0uroboros/engine/historicCatalog';
import { EVALUATION_ALL_CARDS, EVALUATION_BASE_CARDS, EVALUATION_CHAOS_CARDS, draftOffer, draftPhase, createStrategicMarket } from '@0uroboros/engine/evaluationMarket';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from '@0uroboros/engine/cardArtwork';
import { migrateEffects } from '@0uroboros/engine/effects/migrate';
import type { AnyEffect, EffectStep } from '@0uroboros/engine/effects/types';
import { seededRandom } from '@0uroboros/engine/runtime';
import { bundledContent } from '../src/contentPack/contentStore';

const byId=(id:string)=>HISTORIC_CARDS.find(card=>card.definitionId===id)!;
const retained=EVALUATION_ALL_CARDS.filter(card=>!HISTORIC_CARDS.includes(card));
function flatten(effects:readonly AnyEffect[]):EffectStep[]{return migrateEffects(effects,'card').flatMap(effect=>[effect,...flatten(effect.then??[]),...(effect.options??[]).flatMap(option=>flatten(option.effects))]);}
const you={type:'player',who:'self'} as const;

describe('Historic catalog activation',()=>{
 it('accounts for every source definition exactly once, without ordinary cards silently omitted',()=>{
  expect(source.cards).toHaveLength(106);expect(HISTORIC_CARDS).toHaveLength(65);expect(HISTORIC_EXCLUSIONS).toHaveLength(41);
  const ids=[...HISTORIC_CARDS.map(card=>card.id),...HISTORIC_EXCLUSIONS.map(card=>card.id)];
  expect(new Set(ids).size).toBe(106);expect([...ids].sort()).toEqual(source.cards.map(card=>card.id).sort());
  expect(EVALUATION_ALL_CARDS).toHaveLength(74);expect(new Set(EVALUATION_ALL_CARDS.map(card=>card.definitionId)).size).toBe(74);
  for(const id of ['wave-card','particle-card','night-scythe','opulent-void','qubit-kid','system-seppuku','razor-blade-jade','dit-bot','owl-king'])expect(byId(id),id).toBeDefined();
 });
 it('preserves historic names, costs, descriptions, effects metadata and verified artwork exactly',()=>{
  for(const card of HISTORIC_CARDS){
   const original=source.cards.find(entry=>entry.id===card.id)!;
   expect(card.name,card.id).toBe(original.name);expect(card.cost,card.id).toBe(original.cost);expect(card.effect,card.id).toBe(original.description);
   expect(card.art,card.id).toBe(original.artwork);expect(cardArtworkPath(card),card.id).toBe(original.artwork);
   expect(HISTORIC_SOURCE_METADATA[card.id].effects,card.id).toEqual(original.effects);
  }
 });
 it('keeps morph/generator identities out of all offers and reserves placeholder art for retained evaluation rules',()=>{
  const excluded=new Set(HISTORIC_EXCLUSIONS.map(card=>card.id));
  for(const card of EVALUATION_ALL_CARDS)expect(excluded.has(card.definitionId??card.id),card.name).toBe(false);
  expect(retained).toHaveLength(9);
  for(const card of retained){expect(card.art,card.name).toBe(CARD_ART_PLACEHOLDER);expect(cardArtworkPath(card),card.name).toBe(CARD_ART_PLACEHOLDER);}
  expect(retained.map(card=>card.name)).toEqual(expect.arrayContaining(['Dash Relay','Cache Crawler','Cycle Cache','Phase Runner','Signal Surveyor','Burn Ledger','Salvage Relay','Forked Signal','Persistent Leech']));
  expect(EVALUATION_BASE_CARDS.some(card=>card.id==='owl-king')).toBe(true);
  expect(EVALUATION_CHAOS_CARDS.some(card=>card.id==='sudo-demiurge')).toBe(true);
 });
 it('deals 2 Base and 2 Chaos game cards (8 each), three VP game cards (4 each), the three currencies, and a separate Draft offer of three Base/Chaos cards and a Solar-monk',()=>{
  const market=createStrategicMarket(()=>0.31);
  expect(market.filter(p=>p.category==='Base')).toHaveLength(2);expect(market.filter(p=>p.category==='Chaos')).toHaveLength(2);expect(market.filter(p=>p.category==='VP')).toHaveLength(3);
  expect(market.filter(p=>p.category==='Crypto').map(p=>[p.card.definitionId,p.supply])).toEqual([['byte-coin',16],['kilo-coin',16],['mega-cache',8]]);
  expect(market.filter(p=>p.category==='Base'||p.category==='Chaos').every(p=>p.supply===8&&!p.rotating)).toBe(true);
  expect(market.filter(p=>p.category==='VP').every(p=>p.supply===4&&!p.rotating&&p.card.cardClass!=='Solar-monk')).toBe(true);
  const gameIds=new Set(market.map(p=>p.card.definitionId??p.card.id));
  const offer=draftOffer(()=>.71,undefined,gameIds);
  expect(offer.filter(p=>p.category==='Base'||p.category==='Chaos')).toHaveLength(3);
  expect(offer.filter(p=>p.category==='VP').every(p=>p.card.cardClass==='Solar-monk')).toBe(true);
  expect(offer.every(p=>p.rotating&&p.remaining?.join()==='2,2'&&p.supply===4)).toBe(true);
  expect(offer.every(p=>!gameIds.has(p.card.definitionId??p.card.id))).toBe(true);
  const next=draftOffer(()=>.71,undefined,gameIds,new Set(offer.map(p=>p.card.definitionId??p.card.id)));
  expect(next.every(p=>!offer.some(previous=>previous.id===p.id))).toBe(true);
  const other=createStrategicMarket(()=>0.77);
  expect(new Set(market.map(p=>p.id))).not.toEqual(new Set(other.map(p=>p.id)));
 });
 it('leans each Draft offer slot to the Cycle phase at its share, and still rotates the offer',()=>{
  const expected:[number,string[]|'Chaos',number][]=[[2,['Action','Utility'],.75],[6,['Runtime','Attack','Hacker'],.6],[10,'Chaos',.75],[15,['Horror'],.75]];
  for(const [cycle,favoured,share] of expected){
   expect(draftPhase(cycle).share).toBe(share);
   let hits=0,slots=0;
   for(let seed=1;seed<=1500;seed++){
    const random=seededRandom(seed);
    const gameIds=new Set(createStrategicMarket(random,bundledContent).map(p=>p.card.definitionId??p.card.id));
    const offer=draftOffer(random,bundledContent,gameIds,new Set(),cycle);
    expect(offer).toHaveLength(4);
    expect(offer.filter(p=>p.card.cardClass==='Solar-monk')).toHaveLength(1);
    for(const pile of offer.filter(p=>p.category!=='VP')){slots++;if(favoured==='Chaos'?pile.category==='Chaos':favoured.includes(pile.card.cardClass??''))hits++;}
   }
   expect(Math.abs(hits/slots-share)).toBeLessThan(.03);
  }
  const random=seededRandom(9);
  const first=draftOffer(random,bundledContent,new Set(),new Set(),14);
  const next=draftOffer(random,bundledContent,new Set(),new Set(first.map(p=>p.card.definitionId??p.card.id)),14);
  expect(next.every(p=>!first.some(previous=>previous.id===p.id))).toBe(true);
 });
 it('samples game cards from every draftable Base (except Runtime), Chaos and VP card, never Generated ones',()=>{
  const seen={VP:new Set<string>(),Crypto:new Set<string>(),Character:new Set<string>()};
  for(let seed=1;seed<=400;seed++){
   const market=createStrategicMarket(seededRandom(seed),bundledContent);
   expect([market.filter(p=>p.category==='Base').length,market.filter(p=>p.category==='Chaos').length]).toEqual([2,2]);
   for(const pile of market)seen[pile.category==='Base'||pile.category==='Chaos'?'Character':pile.category].add(pile.card.definitionId??pile.card.id);
  }
  const ids=(cards:readonly {id:string;definitionId?:string}[])=>new Set(cards.map(card=>card.definitionId??card.id));
  expect(seen.VP).toEqual(ids(bundledContent.vpCards.filter(card=>card.cardClass!=='Solar-monk')));
  expect(seen.Crypto).toEqual(new Set(['byte-coin','kilo-coin','mega-cache']));
  expect(bundledContent.baseCards.some(card=>card.cardClass==='Runtime')).toBe(true);
  expect(seen.Character).toEqual(ids([...bundledContent.baseCards.filter(card=>card.cardClass!=='Runtime'),...bundledContent.chaosCards]));
  expect(bundledContent.vpCards.length).toBeGreaterThan(3);
  const generated=bundledContent.cards.filter(card=>card.generated).map(card=>card.definitionId??card.id);
  expect(generated).toEqual(expect.arrayContaining(['glitch','owl-king']));
  for(const id of generated)expect(seen.VP.has(id)||seen.Crypto.has(id)||seen.Character.has(id),id).toBe(false);
 });
 it('retains assigned Power and applies approved defaults only to newly introduced identities',()=>{
  expect(byId('slash-dot').power).toBe(3);expect(byId('root-rune').power).toBe(3);expect(byId('chronos-cache').power).toBe(1);
  for(const id of ['atomic-unit','atomic-mass','thorn-shadow','night-scythe','system-seppuku','owl-king']){const card=byId(id);expect(card.power).toBe(Math.max(1,Math.min(5,Math.ceil(card.cost/2))));}
  for(const card of HISTORIC_CARDS.filter(card=>card.type==='VP'))expect(card.power,card.id).toBe(card.vp);
  for(const card of HISTORIC_CARDS.filter(card=>card.type==='Crypto')){expect(card.power).toBeUndefined();expect(card.cryptoValue).toBeGreaterThan(0);}
 });
 it('uses description authority for contradictions and explicit future-only schedules where source says next',()=>{
  expect(byId('cowl-obscyra').onReveal).toEqual([{action:'gainActions',amount:2,target:you},{action:'draw',amount:1,target:you}]);
  for(const [id,last] of [['atomic-unit',5],['atomic-mass',3],['recursive-seance',6],['bloodlet-drone',8]] as const){const card=byId(id);expect(card.onReveal!.length).toBeGreaterThan(0);expect(card.schedule?.at(-1)?.at).toBe(last);}
  for(const [id,last] of [['byte-drone',4],['the-tesseract-magi',7],['dit-bot',5]] as const){const card=byId(id);expect(card.onReveal).toEqual([]);expect(card.schedule?.[0].at).toBe(2);expect(card.schedule?.at(-1)?.at).toBe(last);}
  expect(byId('temporal-rift').schedule?.[0]).toMatchObject({at:4,timing:'start'});
  expect(byId('kilo-cycle').schedule?.[0]).toMatchObject({at:3,timing:'end'});
  expect(byId('chronos-cache').schedule?.[0]).toMatchObject({at:3,timing:'end'});
  expect(byId('qubit-kid').schedule?.[0]).toMatchObject({at:2,timing:'start',effects:[{action:'discardCards',amount:1,target:{type:'card',who:'opponent',where:'hand'},pick:{mode:'choose'}}]});
 });
 it('provides executable typed clauses for every card, with valid schedule and acquisition references',()=>{
  const ids=new Set(EVALUATION_ALL_CARDS.map(card=>card.definitionId));
  for(const card of EVALUATION_ALL_CARDS){
   const effects=flatten([...(card.onReveal??[]),...(card.onCollapse??[]),...(card.recurring??[]),...(card.schedule??[]).flatMap(tick=>tick.effects)]);
   // The two retained starter identities use the canonical name-keyed resolver.
   if(card.type==='Character'&&!['dash','dot'].includes(card.definitionId??''))expect(effects.length,card.name).toBeGreaterThan(0);
   for(const effect of effects){if(effect.action==='gainCard')expect(ids.has(effect.cardId),card.name).toBe(true);if(effect.amount!==undefined)expect(Number.isFinite(effect.amount),card.name).toBe(true);}
   for(const tick of card.schedule??[]){expect(tick.at,card.name).toBeGreaterThanOrEqual(1);expect(tick.at,card.name).toBeLessThanOrEqual(card.duration!);expect(tick.effects.length,card.name).toBeGreaterThan(0);}
   if(card.schedule?.length||card.recurring?.length)expect(card.durationPeriod,card.name).toBe('runtime');
  }
 });
 it('maps every admitted historic Draft clause to own neighboring-Power transfer without keeping probability effects',()=>{
  for(const original of source.cards.filter(card=>card.effects.some(text=>/\+1 Draft/.test(text)))){
   const card=byId(original.id);if(!card)continue;
   const effects=flatten([...(card.onReveal??[]),...(card.schedule??[]).flatMap(tick=>tick.effects)]);
   expect(effects.some(effect=>effect.action==='transferPower'&&effect.amount===1),original.id).toBe(true);
  }
 });
});
