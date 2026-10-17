import { isSolarMonk, type Card, type RandomSource } from './game';
import { migrateCard } from './effects/migrate';
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
/** Game cards: 2 from the Base pool (Runtime cards excluded), 1 Attack or Hacker and 1 Horror from the Chaos pool. */
export const GAME_BASE_COUNT=2;
export const GAME_CHAOS_GROUPS:readonly {label:string;classes:readonly NonNullable<Card['cardClass']>[]}[]=[{label:'Attack or Hacker',classes:['Attack','Hacker']},{label:'Horror',classes:['Horror']}];
export const GAME_CHAOS_COUNT=GAME_CHAOS_GROUPS.length;
export const GAME_CHAOS_MIX=GAME_CHAOS_GROUPS.map(group=>`1 ${group.label}`).join(' + ');
export const GAME_CHARACTER_COUNT=GAME_BASE_COUNT+GAME_CHAOS_COUNT;
export const GAME_VP_COUNT=3;
export const GAME_PILE_SUPPLY=8;
export const GAME_VP_SUPPLY=4;
export const DRAFT_OFFER_COUNT=3;
/** Each Draft also rotates in one Solar-monk, when any is enabled; Solar-monks are never game cards. */
export const DRAFT_SOLAR_MONK_COUNT=1;
export const DRAFT_COPIES_PER_PLAYER=2;
/**
 * v3: Crypto cards are not sold in Draft. Crypto still exists as a spendable resource; Character
 * (and other) effects credit the Wallet. Kept as an empty list so authoring and AI facts stay aligned.
 */
export const CURRENCY_PILES:readonly {cardId:string;supply:number}[]=[];

function cardId(card:Card){return card.definitionId??card.id;}

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

function pickChaos(pool:readonly PoolEntry[],random:RandomSource):PoolEntry[]{
 const chaos=pool.filter(({category})=>category==='Chaos');
 const chosen:PoolEntry[]=[];
 for(const group of GAME_CHAOS_GROUPS){
  const left=chaos.filter(entry=>!chosen.includes(entry));
  const matching=left.filter(({card})=>group.classes.includes(chaosClassOf(card)));
  chosen.push(...pick(matching.length?matching:left,1,random));
 }
 return chosen;
}

/**
 * Game setup: 2 Base game cards and 1 Attack or Hacker and 1 Horror game card (shared supply of 8 each), and 3 Volume VP
 * game cards (4 each). These persist all game; Draft offers are added on top each round. Crypto piles are omitted in v3.
 */
export function createStrategicMarket(random:RandomSource,content?:MarketContent):MarketPile[]{
 const pool=characterPool(content);
 const characters=[
  ...pick(pool.filter(({card,category})=>category==='Base'&&isGameBaseCard(card)),GAME_BASE_COUNT,random),
  ...pickChaos(pool,random),
 ];
 const vpPool=content?.vpCards??EVALUATION_VP_CARDS;
 const vp=pick(vpPool.filter(card=>!isSolarMonk(card)),GAME_VP_COUNT,random);
 const crypto=content?.cryptoCards??EVALUATION_CRYPTO_CARDS;
 const currency=CURRENCY_PILES.flatMap(({cardId:id,supply})=>{const card=crypto.find(entry=>cardId(entry)===id);return card?[{card,supply}]:[];});
 return [
  ...characters.map(({card,category})=>({id:`${category}:${cardId(card)}`,card:structuredClone(card),category,supply:GAME_PILE_SUPPLY})),
  ...vp.map(card=>({id:`VP:${cardId(card)}`,card:structuredClone(card),category:'VP' as const,supply:GAME_VP_SUPPLY})),
  ...currency.map(({card,supply})=>({id:`Crypto:${cardId(card)}`,card:structuredClone(card),category:'Crypto' as const,supply})),
 ];
}

type PoolEntry={card:Card;category:'Base'|'Chaos'};
/** Each Draft offer slot comes from the phase's favoured cards with probability `share`, otherwise from the rest of the pool. */
export type DraftPhase={from:number;to:number;favours:string;share:number;matches:(entry:PoolEntry)=>boolean};
const ofClass=(...classes:NonNullable<Card['cardClass']>[])=>({card}:PoolEntry)=>card.cardClass!==undefined&&classes.includes(card.cardClass);
export const DRAFT_PHASES:readonly DraftPhase[]=[
 {from:1,to:4,favours:'Action and Utility',share:.75,matches:ofClass('Action','Utility')},
 {from:5,to:8,favours:'Runtime, Attack and Hacker',share:.6,matches:ofClass('Runtime','Attack','Hacker')},
 {from:9,to:12,favours:'Chaos',share:.75,matches:({category})=>category==='Chaos'},
 {from:13,to:16,favours:'Horror',share:.75,matches:ofClass('Horror')},
];
export const draftPhase=(cycle:number)=>DRAFT_PHASES.find(phase=>cycle>=phase.from&&cycle<=phase.to)??DRAFT_PHASES[cycle<1?0:DRAFT_PHASES.length-1];
export const DRAFT_PHASE_SUMMARY=DRAFT_PHASES.map(phase=>`Cycles ${phase.from}-${phase.to} ${phase.favours} ${Math.round(phase.share*100)}%`).join('; ');

/**
 * One Draft round's offer: 3 Base/Chaos cards (Runtime included) that are not game cards and 1 Solar-monk, each limited
 * to 2 copies per player.
 * With a Cycle, each slot leans to that Cycle's phase (see DRAFT_PHASES). Last round's offer is avoided while
 * the pool has enough other cards, so the offer changes every round.
 */
export function draftOffer(random:RandomSource,content?:MarketContent,gameIds:ReadonlySet<string>=new Set(),previousIds:ReadonlySet<string>=new Set(),cycle?:number):MarketPile[]{
 const eligible:PoolEntry[]=characterPool(content).filter(({card})=>!gameIds.has(cardId(card)));
 const isFresh=({card}:PoolEntry)=>!previousIds.has(cardId(card));
 let chosen:PoolEntry[];
 if(cycle===undefined){
  const fresh=eligible.filter(isFresh);
  chosen=fresh.length>=DRAFT_OFFER_COUNT?pick(fresh,DRAFT_OFFER_COUNT,random):[...fresh,...pick(eligible.filter(entry=>!fresh.includes(entry)),DRAFT_OFFER_COUNT-fresh.length,random)];
 }else{
  const phase=draftPhase(cycle);
  chosen=[];
  while(chosen.length<DRAFT_OFFER_COUNT){
   const left=eligible.filter(entry=>!chosen.includes(entry));
   if(!left.length)break;
   const fresh=left.filter(isFresh);
   const from=fresh.length?fresh:left;
   const favoured=random()<phase.share;
   const group=from.filter(entry=>phase.matches(entry)===favoured);
   chosen.push(pick(group.length?group:from,1,random)[0]);
  }
 }
 // Drawn after the Base/Chaos slots so the Solar-monk leaves the rest of a seeded offer unchanged.
 const monks=(content?.vpCards??EVALUATION_VP_CARDS).filter(card=>isSolarMonk(card)&&!gameIds.has(cardId(card)));
 const freshMonks=monks.filter(card=>!previousIds.has(cardId(card)));
 const offered:{card:Card;category:MarketCategory}[]=[...chosen,...pick(freshMonks.length?freshMonks:monks,DRAFT_SOLAR_MONK_COUNT,random).map(card=>({card,category:'VP' as const}))];
 return offered.map(({card,category})=>({id:`Draft:${cardId(card)}`,card:structuredClone(card),category,supply:DRAFT_COPIES_PER_PLAYER*2,remaining:[DRAFT_COPIES_PER_PLAYER,DRAFT_COPIES_PER_PLAYER],rotating:true}));
}
