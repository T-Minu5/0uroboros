import { isSolarMonk, type Card, type RandomSource } from './game';
export { isSolarMonk };
import { migrateCard, migrateEffects } from './effects/migrate';
import type { AnyEffect } from './effects/types';
import { HISTORIC_CARDS, HISTORIC_SOURCE_METADATA, historicCategory } from './historicCatalog';
import { CARD_ART_PLACEHOLDER } from './cardArtwork';
export { HISTORIC_CARDS, HISTORIC_SOURCE_METADATA, HISTORIC_EXCLUSIONS } from './historicCatalog';
export type MarketCategory='Base'|'VP'|'Crypto'|'Chaos';
export type MarketPile={id:string;card:Card;category:MarketCategory;supply:number;remaining?:[number,number];rotating?:boolean};
export type MarketContent={baseCards:readonly Card[];chaosCards:readonly Card[];vpCards:readonly Card[];cryptoCards:readonly Card[]};

// Retained evaluation rules have distinct identities and never borrow historic artwork.
const retainedBase:Card[]=([
 {id:'dash',definitionId:'dash',name:'Dash Relay',type:'Character',power:2,cost:3,effect:'+1 Card.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'draw',amount:1}]},
 {id:'dot',definitionId:'dot',name:'Cache Crawler',type:'Character',power:1,cost:3,effect:'+1 Card. +1 Crypto.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'draw',amount:1},{kind:'crypto',amount:1}]},
 {id:'eval-cycle-cache',definitionId:'eval-cycle-cache',name:'Cycle Cache',type:'Character',power:1,cost:3,effect:'Duration 2 Cycles. On collapse, +1 Crypto.',art:CARD_ART_PLACEHOLDER,onReveal:[],duration:2,durationPeriod:'cycle',onCollapse:[{kind:'crypto',amount:1}]},
 {id:'eval-phase-runner',definitionId:'eval-phase-runner',name:'Phase Runner',type:'Character',power:4,cost:3,effect:'On reveal, move this card to another open Node.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'moveSelf'}]},
 {id:'eval-signal-surveyor',definitionId:'eval-signal-surveyor',name:'Signal Surveyor',type:'Character',power:2,cost:3,effect:'On reveal, transfer 1 of your Power between this Node and a neighboring Node. +1 Card.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'transferPower',amount:1},{kind:'draw',amount:1}]},
 {id:'eval-burn-ledger',definitionId:'eval-burn-ledger',name:'Burn Ledger',type:'Character',power:1,cost:2,effect:'+3 Crypto. Trash this card.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'crypto',amount:3},{kind:'trashSelf'}]},
 {id:'eval-salvage-relay',definitionId:'eval-salvage-relay',name:'Salvage Relay',type:'Character',power:2,cost:3,effect:'On reveal, recover one card from shared Trash to your Discard.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'recover'}]},
 {id:'eval-forked-signal',definitionId:'eval-forked-signal',name:'Forked Signal',type:'Character',power:2,cost:2,effect:'On reveal, choose +2 Crypto or +1 Card.',art:CARD_ART_PLACEHOLDER,onReveal:[{action:'choice',prompt:'Choose +2 Crypto or +1 Card.',options:[{id:'crypto',label:'+2 Crypto',effects:[{action:'gainCrypto',amount:2,target:{type:'player',who:'self'}}]},{id:'draw',label:'+1 Card',effects:[{action:'draw',amount:1,target:{type:'player',who:'self'}}]}]}]},
] as Card[]).map(card=>migrateCard(card));
const retainedChaos:Card[]=([{id:'eval-persistent-leech',definitionId:'eval-persistent-leech',name:'Persistent Leech',type:'Character',power:2,cost:5,effect:'Duration 3 Cycles. On collapse, Drain 50.',art:CARD_ART_PLACEHOLDER,onReveal:[],duration:3,durationPeriod:'cycle',onCollapse:[{kind:'drain',amount:50}]}] as Card[]).map(card=>migrateCard(card));
export const EVALUATION_BASE_CARDS:readonly Card[]=[...retainedBase,...HISTORIC_CARDS.filter(card=>historicCategory(card)==='Base')];
export const EVALUATION_CHAOS_CARDS:readonly Card[]=[...retainedChaos,...HISTORIC_CARDS.filter(card=>historicCategory(card)==='Chaos')];
export const EVALUATION_VP_CARDS:readonly Card[]=HISTORIC_CARDS.filter(card=>card.type==='VP');
export const EVALUATION_CRYPTO_CARDS:readonly Card[]=HISTORIC_CARDS.filter(card=>card.type==='Crypto');
export const EVALUATION_ALL_CARDS:readonly Card[]=[...EVALUATION_BASE_CARDS,...EVALUATION_CHAOS_CARDS,...EVALUATION_VP_CARDS,...EVALUATION_CRYPTO_CARDS];

/** @deprecated Fixed game piles are gone; kept for authoring/AI copy that still mentions legacy mix. */
export const GAME_BASE_COUNT=0;
export const GAME_CHAOS_GROUPS:readonly {label:string;classes:readonly NonNullable<Card['cardClass']>[]}[]=[{label:'Attack or Hacker',classes:['Attack','Hacker']},{label:'Horror',classes:['Horror']}];
export const GAME_CHAOS_COUNT=0;
export const GAME_CHAOS_MIX='none (fixed Chaos piles removed)';
export const GAME_CHARACTER_COUNT=0;
export const GAME_VP_COUNT=0;
export const GAME_PILE_SUPPLY=8;
export const GAME_VP_SUPPLY=4;

/** Default rotating offers each Draft (top 4 + bottom 4). */
export const DRAFT_OFFER_COUNT=8;
/** Optional ten-card Draft when Configure `tenCardDraft` is on (top 5 + bottom 5). */
export const DRAFT_OFFER_COUNT_TEN=10;
/** @deprecated Alias of DRAFT_OFFER_COUNT; 8-card Draft is now the default for every table. */
export const DRAFT_OFFER_COUNT_MIDDLE=DRAFT_OFFER_COUNT;
export const DRAFT_SOLAR_MONK_COUNT=1;
export const DRAFT_COPIES_PER_PLAYER=2;
/** Cycles 1–4 only offer cards costing 1–7 Crypto. */
export const DRAFT_EARLY_COST_MAX=7;
export const DRAFT_EARLY_CYCLES=4;
/**
 * From this Cycle on, Attack and Horror slots weight cards costing above DRAFT_LATE_COST_THRESHOLD
 * more heavily when filling the offer.
 */
export const DRAFT_LATE_COST_BIAS_FROM=8;
/** Heavier cost bias for Attack/Horror from this Cycle through the end of the game. */
export const DRAFT_LATE_COST_BIAS_HEAVY_FROM=12;
/** Cost must be strictly above this to receive the late Attack/Horror weight. */
export const DRAFT_LATE_COST_THRESHOLD=6;
/** Relative pick weight for high-cost Attack/Horror in Cycles DRAFT_LATE_COST_BIAS_FROM..heavy−1 (+40%). */
export const DRAFT_LATE_COST_WEIGHT=1.4;
/** Relative pick weight for high-cost Attack/Horror in Cycles DRAFT_LATE_COST_BIAS_HEAVY_FROM+ (+60%). */
export const DRAFT_LATE_COST_WEIGHT_HEAVY=1.6;
/** Soft floor: at least this many offered cards must print +N Crypto with N ≥ this amount. */
export const DRAFT_CRYPTO_GAIN_MIN=2;
export const DRAFT_CRYPTO_OFFER_MIN=2;

/** Classic Crypto definition ids that often fill Hacker/Crypto Draft slots (not a persistent shelf). */
export const CURRENCY_CARD_IDS:readonly string[]=['shyte-coin','byte-coin','kilo-coin','mega-cache'];
/** @deprecated Shelf removed; alias kept for older imports. */
export const CURRENCY_PILES:readonly {cardId:string;supply:number}[]=CURRENCY_CARD_IDS.map(cardId=>({cardId,supply:0}));

function cardId(card:Card){return card.definitionId??card.id;}

/** @deprecated Crypto shelf removed; always empty. Crypto enters Draft via Hacker/Crypto rotating slots. */
export function createCryptoPiles(_content?:MarketContent):MarketPile[]{
 return [];
}

function pick<T>(items:readonly T[],count:number,random:RandomSource):T[]{
 const shuffled=[...items];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return shuffled.slice(0,Math.max(0,count));
}

/** One draw from `items` with non-negative relative `weights` (same length). Falls back to uniform if weights sum to 0. */
function pickWeightedOne<T>(items:readonly T[],weights:readonly number[],random:RandomSource):T|undefined{
 if(!items.length)return undefined;
 const total=weights.reduce((sum,weight)=>sum+Math.max(0,weight),0);
 if(!(total>0))return pick(items,1,random)[0];
 let roll=random()*total;
 for(let i=0;i<items.length;i++){
  roll-=Math.max(0,weights[i]??0);
  if(roll<=0)return items[i];
 }
 return items[items.length-1];
}

function characterPool(content?:MarketContent){
 return [
  ...(content?.baseCards??EVALUATION_BASE_CARDS).map(card=>({card,category:'Base' as const})),
  ...(content?.chaosCards??EVALUATION_CHAOS_CARDS).map(card=>({card,category:'Chaos' as const})),
 ];
}

/** Base cards that may be game cards; Runtime cards only ever come through Draft offers. */
export const isGameBaseCard=(card:Card)=>card.cardClass!=='Runtime';
/** A Chaos card's class; unclassed built-in cards follow their historic type (power cards are Horrors). */
export const chaosClassOf=(card:Card)=>card.cardClass??(HISTORIC_SOURCE_METADATA[cardId(card)]?.types.includes('power')?'Horror':'Attack');

type PoolEntry={card:Card;category:MarketCategory};

/** Collect gainCrypto / legacy crypto amounts from nested steps (choices, then, schedules). */
function collectCryptoAmounts(effects:readonly AnyEffect[]|undefined,into:number[]=[]):number[]{
 if(!effects?.length)return into;
 for(const step of migrateEffects(effects,'card')){
  if(step.action==='gainCrypto')into.push(step.amount??0);
  if(step.options)for(const option of step.options){
   collectCryptoAmounts(option.effects,into);
   if(option.cost)collectCryptoAmounts(option.cost,into);
  }
  if(step.then)collectCryptoAmounts(step.then,into);
 }
 return into;
}

/** Crypto-gain amounts on the card (onReveal / onCollapse / recurring / schedule), including nested choices. */
export function cryptoGainAmounts(card:Card):number[]{
 return [
  ...collectCryptoAmounts(card.onReveal),
  ...collectCryptoAmounts(card.onCollapse),
  ...collectCryptoAmounts(card.recurring),
  ...(card.schedule??[]).flatMap(entry=>collectCryptoAmounts(entry.effects)),
 ];
}

/** True when the card has at least one Crypto-gain amount in [min, max] inclusive. */
export function cardGainsCryptoInRange(card:Card,min:number,max:number):boolean{
 return cryptoGainAmounts(card).some(amount=>amount>=min&&amount<=max);
}

/** True when the card gains any positive Crypto. */
export function cardGainsCrypto(card:Card):boolean{
 return cryptoGainAmounts(card).some(amount=>amount>0);
}

/** Persistent market piles at session start. Always empty — Crypto is offered only in rotating Hacker/Crypto slots. */
export function createStrategicMarket(_random:RandomSource,_content?:MarketContent,_opts?:{draftCrypto?:boolean}):MarketPile[]{
 return [];
}

/** Slot rules for rotating Draft offers, in UI order (top row then bottom row). */
export type DraftSlot={
 id:string;
 label:string;
 category:(entry:PoolEntry)=>MarketCategory;
 matches:(entry:PoolEntry)=>boolean;
 /** Soft slots may be swapped to meet the crypto-gain floor. */
 soft?:boolean;
};

/** Default 8-card Draft: Action/Utility ×2, Hacker/Crypto ×2, Attack, Horror, Solar Monk, VP. */
export const DRAFT_SLOTS:readonly DraftSlot[]=[
 {id:'action-utility-1',label:'Action or Utility',category:()=>'Base',matches:({card})=>card.cardClass==='Action'||card.cardClass==='Utility',soft:true},
 {id:'action-utility-2',label:'Action or Utility',category:()=>'Base',matches:({card})=>card.cardClass==='Action'||card.cardClass==='Utility',soft:true},
 {id:'hacker-crypto-1',label:'Hacker or Crypto',category:entry=>entry.category,matches:({card})=>card.cardClass==='Hacker'||card.type==='Crypto',soft:true},
 {id:'hacker-crypto-2',label:'Hacker or Crypto',category:entry=>entry.category,matches:({card})=>card.cardClass==='Hacker'||card.type==='Crypto',soft:true},
 {id:'attack',label:'Attack',category:()=>'Chaos',matches:({card,category})=>category==='Chaos'&&chaosClassOf(card)==='Attack'},
 {id:'horror',label:'Horror',category:()=>'Chaos',matches:({card,category})=>category==='Chaos'&&chaosClassOf(card)==='Horror'},
 {id:'solar-monk',label:'Solar Monk',category:()=>'VP',matches:({card})=>isSolarMonk(card)},
 {id:'vp',label:'VP',category:()=>'VP',matches:({card})=>card.type==='VP'&&!isSolarMonk(card)},
];

/** Optional 10-card Draft: default eight plus two general Chaos fills. */
export const DRAFT_SLOTS_TEN:readonly DraftSlot[]=[
 ...DRAFT_SLOTS.slice(0,4),
 {id:'chaos-1',label:'Chaos',category:()=>'Chaos',matches:({category})=>category==='Chaos',soft:true},
 {id:'chaos-2',label:'Chaos',category:()=>'Chaos',matches:({category})=>category==='Chaos',soft:true},
 ...DRAFT_SLOTS.slice(4),
];

/** @deprecated Alias of DRAFT_SLOTS; 8-card Draft is the default for every table. */
export const DRAFT_SLOTS_MIDDLE:readonly DraftSlot[]=DRAFT_SLOTS;

export const DRAFT_SLOT_SUMMARY=DRAFT_SLOTS.map(slot=>slot.label).join(' → ');
export const DRAFT_SLOT_SUMMARY_TEN=DRAFT_SLOTS_TEN.map(slot=>slot.label).join(' → ');
/** @deprecated Prefer DRAFT_LATE_COST_* constants; kept for leftover imports. */
export type DraftPhase={from:number;to:number;favours:string;share:number;matches:(entry:PoolEntry)=>boolean};
export const DRAFT_PHASES:readonly DraftPhase[]=[];
export const draftPhase=(_cycle:number):DraftPhase=>({from:1,to:16,favours:'slot rules',share:1,matches:()=>true});
export const DRAFT_PHASE_SUMMARY=`Default ${DRAFT_OFFER_COUNT} slots: ${DRAFT_SLOT_SUMMARY}. Optional ${DRAFT_OFFER_COUNT_TEN}: ${DRAFT_SLOT_SUMMARY_TEN}. At least ${DRAFT_CRYPTO_OFFER_MIN} cards with +${DRAFT_CRYPTO_GAIN_MIN} Crypto. Cycles 1–${DRAFT_EARLY_CYCLES} cost ${1}–${DRAFT_EARLY_COST_MAX}; later Cycles any cost. From Cycle ${DRAFT_LATE_COST_BIAS_FROM}, Attack/Horror slots favour cost >${DRAFT_LATE_COST_THRESHOLD} (+${Math.round((DRAFT_LATE_COST_WEIGHT-1)*100)}%, +${Math.round((DRAFT_LATE_COST_WEIGHT_HEAVY-1)*100)}% from Cycle ${DRAFT_LATE_COST_BIAS_HEAVY_FROM}).`;

/** Attack and Horror hard slots that receive late-game high-cost pick weighting. */
export function isLateCostBiasedSlot(slot:Pick<DraftSlot,'id'>):boolean{
 return slot.id==='attack'||slot.id==='horror';
}

/**
 * Relative pick weight for a candidate in an Attack/Horror slot. Baseline 1; from Cycle 8,
 * cost > 6 is 1.4× (Cycles 8–11) or 1.6× (Cycles 12+). Other slots always return 1.
 */
export function draftSlotPickWeight(slot:Pick<DraftSlot,'id'>,card:Card,cycle?:number):number{
 if(!isLateCostBiasedSlot(slot)||cycle===undefined||cycle<DRAFT_LATE_COST_BIAS_FROM)return 1;
 if(Math.max(0,card.cost)<=DRAFT_LATE_COST_THRESHOLD)return 1;
 return cycle>=DRAFT_LATE_COST_BIAS_HEAVY_FROM?DRAFT_LATE_COST_WEIGHT_HEAVY:DRAFT_LATE_COST_WEIGHT;
}

/** True when the card prints at least one Crypto-gain amount ≥ DRAFT_CRYPTO_GAIN_MIN (Crypto cards also count via cryptoValue). */
export function cardGainsCryptoAtLeast(card:Card,min=DRAFT_CRYPTO_GAIN_MIN):boolean{
 if(card.type==='Crypto'&&(card.cryptoValue??0)>=min)return true;
 return cryptoGainAmounts(card).some(amount=>amount>=min);
}

function allPool(content?:MarketContent):PoolEntry[]{
 const characters=characterPool(content);
 const vp=(content?.vpCards??EVALUATION_VP_CARDS).map(card=>({card,category:'VP' as const}));
 // Non-generated Crypto only (compileContent already omits generated from cryptoCards).
 const crypto=(content?.cryptoCards??EVALUATION_CRYPTO_CARDS).map(card=>({card,category:'Crypto' as const}));
 return [...characters,...vp,...crypto];
}

function inEarlyCost(card:Card,cycle?:number){
 if(cycle===undefined||cycle>DRAFT_EARLY_CYCLES)return true;
 const cost=Math.max(0,card.cost);
 return cost>=1&&cost<=DRAFT_EARLY_COST_MAX;
}

function pickForSlot(
 slot:DraftSlot,
 pool:readonly PoolEntry[],
 taken:ReadonlySet<string>,
 previousIds:ReadonlySet<string>,
 random:RandomSource,
 cycle?:number,
):PoolEntry|undefined{
 const unused=pool.filter(entry=>slot.matches(entry)&&!taken.has(cardId(entry.card)));
 if(!unused.length)return undefined;
 const withCost=unused.filter(({card})=>inEarlyCost(card,cycle));
 const prefer=withCost.length?withCost:unused;
 const fresh=prefer.filter(({card})=>!previousIds.has(cardId(card)));
 const from=fresh.length?fresh:prefer;
 if(!isLateCostBiasedSlot(slot))return pick(from,1,random)[0];
 const weights=from.map(({card})=>draftSlotPickWeight(slot,card,cycle));
 return pickWeightedOne(from,weights,random);
}

/**
 * After slots fill, soft-swap until at least DRAFT_CRYPTO_OFFER_MIN cards gain ≥ DRAFT_CRYPTO_GAIN_MIN Crypto.
 * Hard slots (Attack / Horror / Solar Monk / VP) stay put.
 */
function ensureCryptoFloor(
 offered:{card:Card;category:MarketCategory}[],
 slots:readonly DraftSlot[],
 pool:readonly PoolEntry[],
 taken:Set<string>,
 previousIds:ReadonlySet<string>,
 random:RandomSource,
 cycle?:number,
){
 const soft=slots.map((slot,index)=>slot.soft?index:-1).filter(index=>index>=0&&index<offered.length);
 let need=DRAFT_CRYPTO_OFFER_MIN-offered.filter(entry=>cardGainsCryptoAtLeast(entry.card)).length;
 if(need<=0)return;
 for(const index of soft){
  if(need<=0)break;
  if(cardGainsCryptoAtLeast(offered[index].card))continue;
  const slot=slots[index];
  const candidates=pool.filter(entry=>
   slot.matches(entry)
   &&cardGainsCryptoAtLeast(entry.card)
   &&!taken.has(cardId(entry.card))
   &&inEarlyCost(entry.card,cycle)
  );
  const prefer=candidates.filter(entry=>!previousIds.has(cardId(entry.card)));
  const pickFrom=prefer.length?prefer:candidates.length?candidates:pool.filter(entry=>
   slot.matches(entry)&&cardGainsCryptoAtLeast(entry.card)&&!taken.has(cardId(entry.card))
  );
  const next=pick(pickFrom,1,random)[0];
  if(!next)continue;
  taken.delete(cardId(offered[index].card));
  taken.add(cardId(next.card));
  offered[index]={card:next.card,category:slot.category(next)};
  need-=1;
 }
}

/**
 * One Draft round: ordered rotating offers (2 copies per player). Slot order is top row then
 * bottom row. Last round's identities are avoided while the pool allows. `gameIds` is ignored
 * (fixed piles removed). Pass `DRAFT_SLOTS_TEN` for the optional 10-card Draft.
 */
export function draftOffer(
 random:RandomSource,
 content?:MarketContent,
 _gameIds:ReadonlySet<string>=new Set(),
 previousIds:ReadonlySet<string>=new Set(),
 cycle?:number,
 slots:readonly DraftSlot[]=DRAFT_SLOTS,
):MarketPile[]{
 const pool=allPool(content);
 const taken=new Set<string>();
 const offered:{card:Card;category:MarketCategory}[]=[];
 for(const slot of slots){
  const entry=pickForSlot(slot,pool,taken,previousIds,random,cycle);
  if(!entry)continue;
  taken.add(cardId(entry.card));
  offered.push({card:entry.card,category:slot.category(entry)});
 }
 ensureCryptoFloor(offered,slots,pool,taken,previousIds,random,cycle);
 return offered.map(({card,category})=>({
  id:`Draft:${cardId(card)}`,
  card:structuredClone(card),
  category,
  supply:DRAFT_COPIES_PER_PLAYER*2,
  remaining:[DRAFT_COPIES_PER_PLAYER,DRAFT_COPIES_PER_PLAYER] as [number,number],
  rotating:true,
 }));
}
