import { describe, expect, it } from 'vitest';
import source from '../assets/card_art/cards.json';
import { HISTORIC_CARDS, HISTORIC_EXCLUSIONS, HISTORIC_SOURCE_METADATA } from '../src/historicCatalog';
import { EVALUATION_ALL_CARDS, EVALUATION_BASE_CARDS, EVALUATION_CHAOS_CARDS, baseOffer, chaosOffer, createStrategicMarket } from '../src/evaluationMarket';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from '../src/cardArtwork';
import type { EvaluationEffect } from '../src/game';
import { seededRandom } from '../src/runtime';
import { bundledContent } from '../src/authoring/contentStore';

const byId=(id:string)=>HISTORIC_CARDS.find(card=>card.definitionId===id)!;
const retained=EVALUATION_ALL_CARDS.filter(card=>!HISTORIC_CARDS.includes(card));
function flatten(effects:readonly EvaluationEffect[]):EvaluationEffect[]{return effects.flatMap(effect=>[effect,...flatten(effect.then??[]),...(effect.options??[]).flatMap(option=>flatten(option.effects))]);}

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
 it('preserves four persistent Base piles, two rotating Base offers, four Chaos offers and prior VP/Crypto shelves',()=>{
  const market=createStrategicMarket(()=>0.31);expect(market.filter(p=>p.category==='Base')).toHaveLength(4);expect(market.filter(p=>p.category==='VP')).toHaveLength(3);expect(market.filter(p=>p.category==='Crypto')).toHaveLength(3);
  const stableIds=new Set(market.filter(p=>p.category==='Base').map(p=>p.card.definitionId??p.card.id));
  const base=baseOffer(()=>.31,undefined,stableIds),chaos=chaosOffer(()=>.71);expect(base).toHaveLength(2);expect(chaos).toHaveLength(4);
  expect(base.every(p=>p.rotating)).toBe(true);expect(chaos.every(p=>p.remaining?.join() === '2,2')).toBe(true);
  expect(base.every(p=>!market.some(core=>core.id===p.id))).toBe(true);
  const other=createStrategicMarket(()=>0.77);
  expect(new Set(market.filter(p=>p.category==='Base').map(p=>p.id))).not.toEqual(new Set(other.filter(p=>p.category==='Base').map(p=>p.id)));
 });
 it('samples VP, Crypto and stable Base shelves from every draftable card, never Generated ones',()=>{
  const seen={VP:new Set<string>(),Crypto:new Set<string>(),Base:new Set<string>()};
  for(let seed=1;seed<=200;seed++)for(const pile of createStrategicMarket(seededRandom(seed),bundledContent)){
   if(pile.category!=='Chaos')seen[pile.category].add(pile.card.definitionId??pile.card.id);
  }
  const ids=(cards:readonly {id:string;definitionId?:string}[])=>new Set(cards.map(card=>card.definitionId??card.id));
  expect(seen.VP).toEqual(ids(bundledContent.vpCards));
  expect(seen.Crypto).toEqual(ids(bundledContent.cryptoCards));
  expect(seen.Base).toEqual(ids(bundledContent.baseCards));
  expect(bundledContent.vpCards.length).toBeGreaterThan(3);
  const generated=bundledContent.cards.filter(card=>card.generated).map(card=>card.definitionId??card.id);
  expect(generated).toEqual(expect.arrayContaining(['glitch','owl-king']));
  for(const id of generated)expect(seen.VP.has(id)||seen.Crypto.has(id)||seen.Base.has(id),id).toBe(false);
 });
 it('retains assigned Power and applies approved defaults only to newly introduced identities',()=>{
  expect(byId('slash-dot').power).toBe(3);expect(byId('root-rune').power).toBe(3);expect(byId('chronos-cache').power).toBe(1);
  for(const id of ['atomic-unit','atomic-mass','thorn-shadow','night-scythe','system-seppuku','owl-king']){const card=byId(id);expect(card.power).toBe(Math.max(1,Math.min(5,Math.ceil(card.cost/2))));}
  for(const card of HISTORIC_CARDS.filter(card=>card.type==='VP'))expect(card.power,card.id).toBe(card.vp);
  for(const card of HISTORIC_CARDS.filter(card=>card.type==='Crypto')){expect(card.power).toBeUndefined();expect(card.cryptoValue).toBeGreaterThan(0);}
 });
 it('uses description authority for contradictions and explicit future-only schedules where source says next',()=>{
  expect(byId('cowl-obscyra').onReveal).toEqual([{kind:'actions',amount:2},{kind:'draw',amount:1}]);
  for(const [id,last] of [['atomic-unit',5],['atomic-mass',3],['recursive-seance',6],['bloodlet-drone',8]] as const){const card=byId(id);expect(card.onReveal!.length).toBeGreaterThan(0);expect(card.schedule?.at(-1)?.at).toBe(last);}
  for(const [id,last] of [['byte-drone',4],['the-tesseract-magi',7],['dit-bot',5]] as const){const card=byId(id);expect(card.onReveal).toEqual([]);expect(card.schedule?.[0].at).toBe(2);expect(card.schedule?.at(-1)?.at).toBe(last);}
  expect(byId('temporal-rift').schedule?.[0]).toMatchObject({at:4,timing:'start'});
  expect(byId('kilo-cycle').schedule?.[0]).toMatchObject({at:3,timing:'end'});
  expect(byId('chronos-cache').schedule?.[0]).toMatchObject({at:3,timing:'end'});
  expect(byId('qubit-kid').schedule?.[0]).toMatchObject({at:2,timing:'start',effects:[{kind:'handDiscard',opponent:true,chooser:'owner'}]});
 });
 it('provides executable typed clauses for every card, with valid schedule and acquisition references',()=>{
  const ids=new Set(EVALUATION_ALL_CARDS.map(card=>card.definitionId));
  for(const card of EVALUATION_ALL_CARDS){
   const effects=flatten([...(card.onReveal??[]),...(card.onCollapse??[]),...(card.recurring??[]),...(card.schedule??[]).flatMap(tick=>tick.effects)]);
   // The two retained starter identities use the canonical name-keyed resolver.
   if(card.type==='Character'&&!['dash','dot'].includes(card.definitionId??''))expect(effects.length,card.name).toBeGreaterThan(0);
   for(const effect of effects){if(effect.kind==='gain')expect(ids.has(effect.cardId),card.name).toBe(true);if(effect.amount!==undefined)expect(Number.isFinite(effect.amount),card.name).toBe(true);}
   for(const tick of card.schedule??[]){expect(tick.at,card.name).toBeGreaterThanOrEqual(1);expect(tick.at,card.name).toBeLessThanOrEqual(card.duration!);expect(tick.effects.length,card.name).toBeGreaterThan(0);}
   if(card.schedule?.length||card.recurring?.length)expect(card.durationPeriod,card.name).toBe('runtime');
  }
 });
 it('maps every admitted historic Draft clause to own neighboring-Power transfer without keeping probability effects',()=>{
  for(const original of source.cards.filter(card=>card.effects.some(text=>/\+1 Draft/.test(text)))){
   const card=byId(original.id);if(!card)continue;
   const effects=flatten([...(card.onReveal??[]),...(card.schedule??[]).flatMap(tick=>tick.effects)]);
   expect(effects.some(effect=>effect.kind==='transferPower'&&effect.amount===1),original.id).toBe(true);
   expect(effects.some(effect=>effect.kind==='probability'),original.id).toBe(false);
  }
 });
});
