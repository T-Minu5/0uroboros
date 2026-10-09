import { useEffect, useRef, useState } from 'react';
import type { Card } from '@0uroboros/engine/game';
import type { SessionView } from '@0uroboros/engine/runtime';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import './zone-drawer.css';

export type Zone='trash'|'destroyed';
type Choice=NonNullable<SessionView['choice']>;

/** Trash and Destroyed piles on the board's left wing; each opens its drawer, a second press closes it. */
export function ZoneButtons({trash,destroyed,open,toggle}:{trash:number;destroyed:number;open:Zone|null;toggle:(zone:Zone)=>void}){
 return <div className='zone-buttons'>
  <button type='button' className='zone-button' data-resource='trash' aria-pressed={open==='trash'} aria-label={`Shared Trash, ${trash} cards`} title='Shared Trash' onClick={()=>toggle('trash')}><Icon name='trash'/><b>{trash}</b></button>
  <button type='button' className='zone-button' data-resource='destroyed' aria-pressed={open==='destroyed'} aria-label={`Destroyed, ${destroyed} cards`} title='Destroyed cards' onClick={()=>toggle('destroyed')}><Icon name='destroyed'/><b>{destroyed}</b></button>
 </div>;
}

function ZoneCard({card,selected,onClick,label}:{card:Card;selected?:boolean;onClick:()=>void;label:string}){
 return <button type='button' className={`zone-card ${selected?'selected':''}`} data-card-id={card.id} aria-pressed={selected===undefined?undefined:selected} aria-label={label} title={card.name} onClick={onClick}>
  <span className='zone-card-face'><CardFace card={card}/></span>
 </button>;
}

/**
 * Left-hand drawer listing the shared Trash or both players' Destroyed cards. Browsing opens a card's inspector; while
 * a recover effect is choosing from the Trash (`choice`), the drawer stays open until a card is picked and confirmed.
 */
export function ZoneDrawer({zone,view,choice,choose,inspect,close}:{zone:Zone|null;view:SessionView;choice:Choice|null;choose:(id:string)=>void;inspect:(card:Card)=>void;close:()=>void}){
 const last=useRef<Zone>('trash');
 if(zone)last.current=zone;
 const shown=zone??last.current;
 const recovering=!!choice&&shown==='trash';
 const [picked,setPicked]=useState<string|null>(null);
 useEffect(()=>setPicked(null),[choice?.id]);
 const options=recovering?choice.options.filter(option=>option.card):[];
 const grid=(cards:Card[],empty:string)=>cards.length
  ?<div className='zone-cards'>{cards.map(card=><ZoneCard key={card.id} card={card} label={`Inspect ${card.name}`} onClick={()=>inspect(card)}/>)}</div>
  :<p className='zone-empty'>{empty}</p>;
 return <>
  <div className={`zone-scrim ${zone?'open':''}`} onClick={recovering?undefined:close}/>
  <aside className={`zone-drawer ${zone?'open':''} ${recovering?'recovering':''}`} data-zone={shown} role={recovering?'dialog':'region'} aria-modal={recovering?'true':undefined} aria-label={shown==='trash'?'Shared Trash':'Destroyed cards'} inert={!zone}>
   <header>
    <small>{recovering?choice.sourceName:shown==='trash'?'SHARED ZONE':'REMOVED FROM PLAY'}</small>
    <h2><Icon name={shown}/>{recovering?'Recover a card':shown==='trash'?'Shared Trash':'Destroyed'}</h2>
    {!recovering&&<button type='button' className='zone-drawer-close' aria-label='Close drawer' onClick={close}>×</button>}
   </header>
   <div className='zone-drawer-body'>
    {recovering?<>
     <p>{choice.prompt}</p>
     <p className='zone-instruction'>Select a card, then confirm. Nothing resolves until you confirm.</p>
     <div className='zone-cards'>{options.map(option=><div key={option.id} className='zone-pick'>
      <ZoneCard card={option.card!} label={option.label} selected={picked===option.id} onClick={()=>setPicked(current=>current===option.id?null:option.id)}/>
      <button type='button' className='zone-inspect' aria-label={`Inspect ${option.label}`} onClick={()=>inspect(option.card!)}>Inspect</button>
     </div>)}</div>
    </>:shown==='trash'?<>
     <p>Cards here are unowned. Recovery effects can acquire them; they do not contribute to either player's VP.</p>
     {grid(view.trash,'No cards have entered Trash.')}
    </>:<>
     <p>Destroyed cards are out of the game. Browse them here for review.</p>
     <section className='zone-group'><h3>Yours <b>{view.players[0].destroyed.length}</b></h3>{grid(view.players[0].destroyed,'None of your cards have been destroyed.')}</section>
     <section className='zone-group'><h3>Opponent <b>{view.players[1].destroyed.length}</b></h3>{grid(view.players[1].destroyed,'None of the opponent\'s cards have been destroyed.')}</section>
    </>}
   </div>
   {recovering&&<footer><button type='button' className='zone-confirm' disabled={!picked} onClick={()=>picked&&choose(picked)}>Confirm</button><span>{picked?'1 of 1 selected':'0 of 1 selected'}</span></footer>}
  </aside>
 </>;
}
