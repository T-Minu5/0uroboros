import { useMemo, useState } from 'react';
import { CardFace } from './CardFace';
import type { Card, PlayerId } from './game';
import { EVALUATION_ALL_CARDS, EVALUATION_BASE_CARDS, EVALUATION_CHAOS_CARDS } from './evaluationMarket';
import type { CompiledContent } from './authoring/contentModel';
import './card-catalog.css';

type Props = {content?:CompiledContent;canTest:boolean; inspect:(card:Card)=>void; add:(id:string,owner:PlayerId)=>boolean; close:()=>void};
const identity=(card:Card)=>card.definitionId??card.id;
const base=new Set(EVALUATION_BASE_CARDS.map(identity));
const chaos=new Set(EVALUATION_CHAOS_CARDS.map(identity));
function pool(card:Card){return chaos.has(identity(card))?'Chaos':base.has(identity(card))?'Base':card.type;}

export function CardCatalog({content,canTest,inspect,add,close}:Props){
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('All');
 const [owner,setOwner]=useState<PlayerId>(0);
 const [added,setAdded]=useState<string|null>(null);
 const all=content?.cards??EVALUATION_ALL_CARDS;
 const categoryOf=(card:Card)=>content?(content.chaosCards.some(item=>identity(item)===identity(card))?'Chaos':content.baseCards.some(item=>identity(item)===identity(card))?'Base':card.type):pool(card);
 const cards=useMemo(()=>all.filter(card=>(category==='All'||categoryOf(card)===category)&&`${card.name} ${card.effect}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)),[query,category,content]);
 return <div className='catalog-backdrop' onClick={close}>
  <section className='card-catalog' role='dialog' aria-modal='true' aria-label='Evaluation card catalog' onClick={e=>e.stopPropagation()}>
   <header><div><small>EVALUATION LIBRARY</small><h1>Every card. Ready to test.</h1><p>{all.length} playable definitions · Choose a card to inspect or test.</p></div><button className='close' aria-label='Close card catalog' onClick={close}>×</button></header>
   <div className='catalog-tools'><label><span>Find a card</span><input autoFocus type='search' placeholder='Name or effect…' value={query} onChange={event=>setQuery(event.target.value)}/></label><label><span>Pool</span><select value={category} onChange={event=>setCategory(event.target.value)}>{['All','Base','Chaos','VP','Crypto'].map(value=><option key={value}>{value}</option>)}</select></label><label><span>Add test cards to</span><select value={owner} onChange={event=>setOwner(Number(event.target.value) as PlayerId)}><option value={0}>Your hand</option><option value={1}>Opponent's hand</option></select></label></div>
   <p className='catalog-hint'>{canTest?'Add a card directly to a test hand before placing cards this turn. This evaluation tool is separate from market purchases.':'Start a Runtime turn with no placements to add test cards. Undo all actions first if you have already placed cards.'}</p>
   <div className='catalog-feedback' role='status'>{added??`${cards.length} cards shown`}</div>
   <div className='catalog-grid'>{cards.map(card=><article key={identity(card)} data-catalog-id={identity(card)}>
    <button className='catalog-art' aria-label={`Inspect ${card.name}`} onClick={()=>inspect(card)}><CardFace card={card} context="preview"/></button>
    <div className='catalog-copy'><small>{categoryOf(card)} · {card.cost} Crypto{card.power!==undefined?` · ${card.power} Power`:''}</small><h2>{card.name}</h2><p>{card.effect}</p></div>
    <button className='catalog-add' disabled={!canTest} onClick={()=>{if(add(identity(card),owner))setAdded(`${card.name} added to ${owner===0?'your':"the opponent's"} test hand.`);else setAdded('This turn is resolving. Add test cards at the next planning window.');}}>Add to test hand</button>
   </article>)}</div>
   {!cards.length&&<p className='catalog-empty'>No cards match this search.</p>}
  </section>
 </div>;
}
