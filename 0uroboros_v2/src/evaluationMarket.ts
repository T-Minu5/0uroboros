import { starterCards, type Card, type RandomSource } from './game';
import { HISTORIC_CARDS, historicCategory } from './historicCatalog';
import { CARD_ART_PLACEHOLDER } from './cardArtwork';
export { HISTORIC_CARDS, HISTORIC_SOURCE_METADATA, HISTORIC_EXCLUSIONS } from './historicCatalog';
export type MarketCategory='Base'|'VP'|'Crypto'|'Chaos';
export type MarketPile={id:string;card:Card;category:MarketCategory;supply:number;remaining?:[number,number];rotating?:boolean};
export type MarketContent={baseCards:readonly Card[];chaosCards:readonly Card[];vpCards:readonly Card[];cryptoCards:readonly Card[];coreBaseIds:readonly string[];activeVpIds:readonly string[];activeCryptoIds:readonly string[]};

// Retained evaluation rules have distinct identities and never borrow historic artwork.
const retainedBase:Card[]=[
 {...starterCards[1],name:'Dash Relay',art:CARD_ART_PLACEHOLDER,definitionId:'dash'},
 {...starterCards[2],name:'Cache Crawler',art:CARD_ART_PLACEHOLDER,definitionId:'dot'},
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
const CORE_BASE_IDS=new Set(['slash-dot','dash','dot','eval-cycle-cache']);
const ACTIVE_VP_IDS=new Set(['basic-encryption','vault-encryption','quantum-archive']);
const ACTIVE_CRYPTO_IDS=new Set(['byte-coin','kilo-coin','mega-cache']);
export function createStrategicMarket(content?:MarketContent):MarketPile[]{
 const baseIds=content?new Set(content.coreBaseIds):CORE_BASE_IDS,vpIds=content?new Set(content.activeVpIds):ACTIVE_VP_IDS,cryptoIds=content?new Set(content.activeCryptoIds):ACTIVE_CRYPTO_IDS;
 return ([['Base',(content?.baseCards??EVALUATION_BASE_CARDS).filter(card=>baseIds.has(card.definitionId??card.id))],['VP',(content?.vpCards??EVALUATION_VP_CARDS).filter(card=>vpIds.has(card.definitionId??card.id))],['Crypto',(content?.cryptoCards??EVALUATION_CRYPTO_CARDS).filter(card=>cryptoIds.has(card.definitionId??card.id))]] as const).flatMap(([category,cards])=>cards.map(card=>({id:`${category}:${card.definitionId??card.id}`,card:structuredClone(card),category,supply:category==='Crypto'?16:8})));
}
function pick(cards:readonly Card[],count:number,random:RandomSource):Card[]{
 const shuffled=[...cards];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}return shuffled.slice(0,count);
}
export function baseOffer(random:RandomSource,content?:MarketContent):MarketPile[]{const core=content?new Set(content.coreBaseIds):CORE_BASE_IDS;return pick((content?.baseCards??EVALUATION_BASE_CARDS).filter(card=>!core.has(card.definitionId??card.id)),2,random).map(card=>({id:`Base:${card.definitionId??card.id}`,card:structuredClone(card),category:'Base',supply:8,rotating:true}));}
export function chaosOffer(random:RandomSource,content?:MarketContent):MarketPile[]{return pick(content?.chaosCards??EVALUATION_CHAOS_CARDS,3,random).map(card=>({id:`Chaos:${card.definitionId??card.id}`,card:structuredClone(card),category:'Chaos',supply:4,remaining:[2,2]}));}
