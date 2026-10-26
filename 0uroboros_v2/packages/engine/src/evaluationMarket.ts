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
 {id:'dash',definitionId:'dash',name:'Dash Relay',type:'Character',power:2,cost:3,effect:'+1 Card. +1 Action.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'draw',amount:1},{kind:'actions',amount:1}]},
 {id:'dot',definitionId:'dot',name:'Cache Crawler',type:'Character',power:1,cost:3,effect:'+1 Card. +1 Action. +1 Crypto.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'draw',amount:1},{kind:'actions',amount:1},{kind:'crypto',amount:1}]},
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

/** Ten ordered rotating offers each Draft (top 5 + bottom 5). */
export const DRAFT_OFFER_COUNT=10;
export const DRAFT_SOLAR_MONK_COUNT=1;
export const DRAFT_COPIES_PER_PLAYER=2;
/** Cycles 1–4 only offer cards costing 1–7 Crypto. */
export const DRAFT_EARLY_COST_MAX=7;
export const DRAFT_EARLY_CYCLES=4;

/**
 * Persistent Crypto shelf when the `draftCrypto` setup option is on. Shared supply (not per-seat).
 * Order is the 2×2 Draft grid: Shyte / Byte on top, Kilo / Mega below.
 */
export const CURRENCY_PILES:readonly {cardId:string;supply:number}[]=[
 {cardId:'shyte-coin',supply:16},
 {cardId:'byte-coin',supply:16},
 {cardId:'kilo-coin',supply:16},
 {cardId:'mega-cache',supply:8},
];

function cardId(card:Card){return card.definitionId??card.id;}

/** The four Crypto card piles for Draft when the setting is enabled. */
export function createCryptoPiles(content?:MarketContent):MarketPile[]{
 const crypto=content?.cryptoCards??EVALUATION_CRYPTO_CARDS;
 return CURRENCY_PILES.flatMap(({cardId:id,supply})=>{
  const card=crypto.find(entry=>cardId(entry)===id);
  return card?[{id:`Crypto:${id}`,card:structuredClone(card),category:'Crypto' as const,supply}]:[];
 });
}

function pick<T>(items:readonly T[],count:number,random:RandomSource):T[]{
 const shuffled=[...items];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return shuffled.slice(0,Math.max(0,count));
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

/** True when the card has at least one Crypto-gain amount in [min, max] inclusive. */
export function cardGainsCryptoInRange(card:Card,min:number,max:number):boolean{
 const amounts=[
  ...collectCryptoAmounts(card.onReveal),
  ...collectCryptoAmounts(card.onCollapse),
  ...collectCryptoAmounts(card.recurring),
  ...(card.schedule??[]).flatMap(entry=>collectCryptoAmounts(entry.effects)),
 ];
 return amounts.some(amount=>amount>=min&&amount<=max);
}

/**
 * Persistent market piles at session start. Rotating offers are filled at each Draft.
 * When `draftCrypto` is on, the four Crypto cards sit as a fixed shelf beside the offer.
 */
export function createStrategicMarket(_random:RandomSource,content?:MarketContent,opts?:{draftCrypto?:boolean}):MarketPile[]{
 return opts?.draftCrypto?createCryptoPiles(content):[];
}

/** Slot rules for the 10 rotating Draft offers, in UI order (top row then bottom row). */
export type DraftSlot={
 id:string;
 label:string;
 category:(card:Card)=>MarketCategory;
 matches:(entry:PoolEntry)=>boolean;
};

export const DRAFT_SLOTS:readonly DraftSlot[]=[
 {id:'action-utility-1',label:'Action or Utility',category:()=>'Base',matches:({card})=>card.cardClass==='Action'||card.cardClass==='Utility'},
 {id:'action-utility-2',label:'Action or Utility',category:()=>'Base',matches:({card})=>card.cardClass==='Action'||card.cardClass==='Utility'},
 {id:'chaos-1',label:'Chaos',category:()=>'Chaos',matches:({category})=>category==='Chaos'},
 {id:'chaos-2',label:'Chaos',category:()=>'Chaos',matches:({category})=>category==='Chaos'},
 {id:'solar-monk',label:'Solar Monk',category:()=>'VP',matches:({card})=>isSolarMonk(card)},
 {id:'crypto-1-3',label:'Gain Crypto 1–3',category:entry=>entry.category,matches:({card})=>cardGainsCryptoInRange(card,1,3)},
 {id:'crypto-1-6',label:'Gain Crypto 1–6',category:entry=>entry.category,matches:({card})=>cardGainsCryptoInRange(card,1,6)},
 {id:'attack',label:'Attack',category:()=>'Chaos',matches:({card,category})=>category==='Chaos'&&chaosClassOf(card)==='Attack'},
 {id:'horror',label:'Horror',category:()=>'Chaos',matches:({card,category})=>category==='Chaos'&&chaosClassOf(card)==='Horror'},
 {id:'vp',label:'VP',category:()=>'VP',matches:({card})=>card.type==='VP'&&!isSolarMonk(card)},
];

export const DRAFT_SLOT_SUMMARY=DRAFT_SLOTS.map(slot=>slot.label).join(' → ');
/** @deprecated Phase weighting removed; kept for any leftover imports. */
export type DraftPhase={from:number;to:number;favours:string;share:number;matches:(entry:PoolEntry)=>boolean};
export const DRAFT_PHASES:readonly DraftPhase[]=[];
export const draftPhase=(_cycle:number):DraftPhase=>({from:1,to:16,favours:'slot rules',share:1,matches:()=>true});
export const DRAFT_PHASE_SUMMARY=`10 fixed slots: ${DRAFT_SLOT_SUMMARY}. Cycles 1–${DRAFT_EARLY_CYCLES} cost ${1}–${DRAFT_EARLY_COST_MAX}; later Cycles any cost.`;

function allPool(content?:MarketContent):PoolEntry[]{
 const characters=characterPool(content);
 const vp=(content?.vpCards??EVALUATION_VP_CARDS).map(card=>({card,category:'VP' as const}));
 return [...characters,...vp];
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
 return pick(from,1,random)[0];
}

/**
 * One Draft round: 10 ordered rotating offers (2 copies per player). Slot order is top row then
 * bottom row. Last round's identities are avoided while the pool allows. `gameIds` is ignored
 * (fixed piles removed).
 */
export function draftOffer(random:RandomSource,content?:MarketContent,_gameIds:ReadonlySet<string>=new Set(),previousIds:ReadonlySet<string>=new Set(),cycle?:number):MarketPile[]{
 const pool=allPool(content);
 const taken=new Set<string>();
 const offered:{card:Card;category:MarketCategory}[]=[];
 for(const slot of DRAFT_SLOTS){
  const entry=pickForSlot(slot,pool,taken,previousIds,random,cycle);
  if(!entry)continue;
  taken.add(cardId(entry.card));
  offered.push({card:entry.card,category:slot.category(entry)});
 }
 return offered.map(({card,category})=>({
  id:`Draft:${cardId(card)}`,
  card:structuredClone(card),
  category,
  supply:DRAFT_COPIES_PER_PLAYER*2,
  remaining:[DRAFT_COPIES_PER_PLAYER,DRAFT_COPIES_PER_PLAYER] as [number,number],
  rotating:true,
 }));
}
