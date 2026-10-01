import type { Card, RandomSource } from './game';
import { HISTORIC_CARDS, historicCategory } from './historicCatalog';
import { CARD_ART_PLACEHOLDER } from './cardArtwork';
export { HISTORIC_CARDS, HISTORIC_SOURCE_METADATA, HISTORIC_EXCLUSIONS } from './historicCatalog';
export type MarketCategory='Base'|'VP'|'Crypto'|'Chaos';
export type MarketPile={id:string;card:Card;category:MarketCategory;supply:number;remaining?:[number,number];rotating?:boolean};
export type MarketContent={baseCards:readonly Card[];chaosCards:readonly Card[];vpCards:readonly Card[];cryptoCards:readonly Card[]};

// Retained evaluation rules have distinct identities and never borrow historic artwork.
const retainedBase:Card[]=[
 {id:'dash',definitionId:'dash',name:'Dash Relay',type:'Character',power:2,cost:3,effect:'+1 Card. +1 Action.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'draw',amount:1},{kind:'actions',amount:1}]},
 {id:'dot',definitionId:'dot',name:'Cache Crawler',type:'Character',power:1,cost:3,effect:'+1 Card. +1 Action. +1 Crypto.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'draw',amount:1},{kind:'actions',amount:1},{kind:'crypto',amount:1}]},
 {id:'eval-cycle-cache',definitionId:'eval-cycle-cache',name:'Cycle Cache',type:'Character',power:1,cost:3,effect:'Duration 2 Cycles. On collapse, +1 Crypto.',art:CARD_ART_PLACEHOLDER,onReveal:[],duration:2,durationPeriod:'cycle',onCollapse:[{kind:'crypto',amount:1}]},
 {id:'eval-phase-runner',definitionId:'eval-phase-runner',name:'Phase Runner',type:'Character',power:4,cost:3,effect:'On reveal, move this card to another open Node.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'moveSelf'}]},
 {id:'eval-signal-surveyor',definitionId:'eval-signal-surveyor',name:'Signal Surveyor',type:'Character',power:2,cost:3,effect:'On reveal, transfer 1 of your Power between this Node and a neighboring Node. +1 Card.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'transferPower',amount:1},{kind:'draw',amount:1}]},
 {id:'eval-burn-ledger',definitionId:'eval-burn-ledger',name:'Burn Ledger',type:'Character',power:1,cost:2,effect:'+3 Crypto. Trash this card.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'crypto',amount:3},{kind:'trashSelf'}]},
 {id:'eval-salvage-relay',definitionId:'eval-salvage-relay',name:'Salvage Relay',type:'Character',power:2,cost:3,effect:'On reveal, recover one card from shared Trash to your Discard.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'recover'}]},
 {id:'eval-forked-signal',definitionId:'eval-forked-signal',name:'Forked Signal',type:'Character',power:2,cost:2,effect:'On reveal, choose +2 Crypto or +1 Card.',art:CARD_ART_PLACEHOLDER,onReveal:[{kind:'choice'}]},
];
const retainedChaos:Card[]=[{id:'eval-persistent-leech',definitionId:'eval-persistent-leech',name:'Persistent Leech',type:'Character',power:2,cost:5,effect:'Duration 3 Cycles. On collapse, Drain 50.',art:CARD_ART_PLACEHOLDER,onReveal:[],duration:3,durationPeriod:'cycle',onCollapse:[{kind:'drain',amount:50}]}];
export const EVALUATION_BASE_CARDS:readonly Card[]=[...retainedBase,...HISTORIC_CARDS.filter(card=>historicCategory(card)==='Base')];
export const EVALUATION_CHAOS_CARDS:readonly Card[]=[...retainedChaos,...HISTORIC_CARDS.filter(card=>historicCategory(card)==='Chaos')];
export const EVALUATION_VP_CARDS:readonly Card[]=HISTORIC_CARDS.filter(card=>card.type==='VP');
export const EVALUATION_CRYPTO_CARDS:readonly Card[]=HISTORIC_CARDS.filter(card=>card.type==='Crypto');
export const EVALUATION_ALL_CARDS:readonly Card[]=[...EVALUATION_BASE_CARDS,...EVALUATION_CHAOS_CARDS,...EVALUATION_VP_CARDS,...EVALUATION_CRYPTO_CARDS];
const STABLE_BASE_COUNT=4;
const VP_SHELF_COUNT=3;
const CRYPTO_SHELF_COUNT=3;

function cardId(card:Card){return card.definitionId??card.id;}

function pick(cards:readonly Card[],count:number,random:RandomSource):Card[]{
 const shuffled=[...cards];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return shuffled.slice(0,Math.max(0,count));
}

/** Draw 4 stable Base piles at game setup from every Base card so the market varies between sessions. */
export function pickStableBaseCards(random:RandomSource,content?:MarketContent,count=STABLE_BASE_COUNT):Card[]{
 return pick(content?.baseCards??EVALUATION_BASE_CARDS,count,random);
}

/** Every shelf samples its whole pool each game; nothing is pinned to a fixed set. */
export function createStrategicMarket(random:RandomSource,content?:MarketContent):MarketPile[]{
 const stables=pickStableBaseCards(random,content);
 const vp=pick(content?.vpCards??EVALUATION_VP_CARDS,VP_SHELF_COUNT,random);
 const crypto=pick(content?.cryptoCards??EVALUATION_CRYPTO_CARDS,CRYPTO_SHELF_COUNT,random);
 return [
  ...stables.map(card=>({id:`Base:${cardId(card)}`,card:structuredClone(card),category:'Base' as const,supply:8})),
  ...vp.map(card=>({id:`VP:${cardId(card)}`,card:structuredClone(card),category:'VP' as const,supply:8})),
  ...crypto.map(card=>({id:`Crypto:${cardId(card)}`,card:structuredClone(card),category:'Crypto' as const,supply:16})),
 ];
}

export function baseOffer(random:RandomSource,content?:MarketContent,excludeIds?:ReadonlySet<string>):MarketPile[]{
 const exclude=excludeIds??new Set<string>();
 return pick((content?.baseCards??EVALUATION_BASE_CARDS).filter(card=>!exclude.has(cardId(card))),2,random)
  .map(card=>({id:`Base:${cardId(card)}`,card:structuredClone(card),category:'Base' as const,supply:8,rotating:true}));
}
export function chaosOffer(random:RandomSource,content?:MarketContent):MarketPile[]{return pick(content?.chaosCards??EVALUATION_CHAOS_CARDS,4,random).map(card=>({id:`Chaos:${cardId(card)}`,card:structuredClone(card),category:'Chaos',supply:4,remaining:[2,2]}));}
