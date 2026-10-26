import { describe, expect, it } from 'vitest';
import source from '../assets/card_art/cards.json';
import { HISTORIC_CARDS, HISTORIC_EXCLUSIONS, HISTORIC_SOURCE_METADATA } from '@0uroboros/engine/historicCatalog';
import { EVALUATION_ALL_CARDS, EVALUATION_BASE_CARDS, EVALUATION_CHAOS_CARDS, DRAFT_SLOTS, cardGainsCryptoInRange, draftOffer, createStrategicMarket, isSolarMonk } from '@0uroboros/engine/evaluationMarket';
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
 it('starts with no fixed piles and deals a 10-slot rotating Draft offer (2 copies each)',()=>{
  expect(createStrategicMarket(()=>0.31)).toEqual([]);
  const offer=draftOffer(()=>.71,bundledContent,new Set(),new Set(),1);
  expect(offer).toHaveLength(DRAFT_SLOTS.length);
  expect(offer.every(p=>p.rotating&&p.remaining?.join()==='2,2'&&p.supply===4)).toBe(true);
  expect(['Action','Utility']).toContain(offer[0].card.cardClass);
  expect(['Action','Utility']).toContain(offer[1].card.cardClass);
  expect(offer[2].category).toBe('Chaos');
  expect(offer[3].category).toBe('Chaos');
  expect(isSolarMonk(offer[4].card)).toBe(true);
  expect(cardGainsCryptoInRange(offer[5].card,1,3)).toBe(true);
  expect(cardGainsCryptoInRange(offer[6].card,1,6)).toBe(true);
  expect(offer[7].card.cardClass).toBe('Attack');
  expect(offer[8].card.cardClass).toBe('Horror');
  expect(offer[9].card.type).toBe('VP');
  expect(isSolarMonk(offer[9].card)).toBe(false);
  const ids=offer.map(p=>p.card.definitionId??p.card.id);
  expect(new Set(ids).size).toBe(ids.length);
  const next=draftOffer(()=>.71,bundledContent,new Set(),new Set(ids),1);
  expect(next.every(p=>!offer.some(previous=>previous.id===p.id))).toBe(true);
 });
 it('caps offer costs at 1–7 in Cycles 1–4 and still rotates later',()=>{
  for(let seed=1;seed<=80;seed++){
   const offer=draftOffer(seededRandom(seed),bundledContent,new Set(),new Set(),2);
   for(const pile of offer)expect(pile.card.cost,pile.card.name).toBeGreaterThanOrEqual(1);
   for(const pile of offer)expect(pile.card.cost,pile.card.name).toBeLessThanOrEqual(7);
  }
  const late=draftOffer(seededRandom(3),bundledContent,new Set(),new Set(),14);
  expect(late.length).toBeGreaterThanOrEqual(8);
  const random=seededRandom(9);
  const first=draftOffer(random,bundledContent,new Set(),new Set(),14);
  const next=draftOffer(random,bundledContent,new Set(),new Set(first.map(p=>p.card.definitionId??p.card.id)),14);
  expect(next.every(p=>!first.some(previous=>previous.id===p.id))).toBe(true);
 });
 it('samples Draft slots across many seeds without Fixed piles or Generated-only identities as the whole market',()=>{
  const seen=new Set<string>();
  for(let seed=1;seed<=200;seed++){
   expect(createStrategicMarket(seededRandom(seed),bundledContent)).toEqual([]);
   const offer=draftOffer(seededRandom(seed),bundledContent,new Set(),new Set(),8);
   expect(offer.length).toBeGreaterThanOrEqual(8);
   for(const pile of offer)seen.add(pile.card.definitionId??pile.card.id);
  }
  expect(seen.size).toBeGreaterThan(20);
  expect(seen.has('glitch')).toBe(false);
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
