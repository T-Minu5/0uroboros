import { MIN_STARTING_DECK_SIZE } from '@0uroboros/engine/game';
import type { DeckOption } from './contentPack/loadGameContent';

/** Setup-screen choice of the deck both players are dealt. Short decks stay listed so it is clear why they cannot start; empty ones are hidden. */
export function StartingDeckPicker({decks,value,onChange,disabled}:{decks:DeckOption[]|null;value:string|undefined;onChange:(id:string)=>void;disabled?:boolean}){
 const chosen=decks?.find(deck=>deck.id===value);
 return <fieldset className='deck-picker' disabled={disabled}>
  <legend>Starting deck <small>Both players</small></legend>
  {!decks?<p className='deck-picker-note'>Loading decks…</p>:<>
   <div className='deck-picker-options' role='radiogroup' aria-label='Starting deck'>{decks.filter(deck=>deck.size>0).map(deck=><button key={deck.id} type='button' role='radio' aria-checked={deck.id===value} disabled={!deck.playable} title={deck.playable?undefined:`Needs at least ${MIN_STARTING_DECK_SIZE} cards`} onClick={()=>onChange(deck.id)}>
    <b>{deck.name||'Untitled deck'}</b>
    <small>{deck.playable?`${deck.size} cards`:deck.size?`${deck.size} of ${MIN_STARTING_DECK_SIZE} cards`:'Empty'}</small>
   </button>)}</div>
   {chosen&&<p className='deck-picker-cards'>{chosen.cards.map(card=><span key={card.name}>{card.count>1&&<i>{card.count}×</i>}{card.name}</span>)}</p>}
  </>}
 </fieldset>;
}
