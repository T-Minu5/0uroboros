import { useEffect, useRef, useState } from 'react';
import type { Card, PlayerId } from '@0uroboros/engine/game';
import type { SessionView } from '@0uroboros/engine/runtime';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import './zone-drawer.css';

export type Zone = 'trash' | 'destroyed' | 'discard';
type Choice = NonNullable<SessionView['choice']>;

/** Trash and Destroyed piles on the board's left wing; each opens its drawer, a second press closes it. */
export function ZoneButtons({ trash, destroyed, open, toggle }: { trash: number; destroyed: number; open: Zone | null; toggle: (zone: Zone) => void }) {
  return <div className='zone-buttons'>
    <button type='button' className='zone-button' data-resource='trash' aria-pressed={open === 'trash'} aria-label={`Shared Trash, ${trash} cards`} title='Shared Trash' onClick={() => toggle('trash')}><Icon name='trash' /><b>{trash}</b></button>
    <button type='button' className='zone-button' data-resource='destroyed' aria-pressed={open === 'destroyed'} aria-label={`Destroyed, ${destroyed} cards`} title='Destroyed cards' onClick={() => toggle('destroyed')}><Icon name='destroyed' /><b>{destroyed}</b></button>
  </div>;
}

/** Circuit log button on the board's right wing, styled like the Trash and Destroyed piles. */
export function LogButton({ open, toggle }: { open: boolean; toggle: () => void }) {
  return <div className='zone-buttons'>
    <button type='button' className='zone-button log-button' aria-pressed={open} aria-label='Circuit log' title='Circuit log' onClick={toggle}><Icon name='log' /><b>Log</b></button>
  </div>;
}

function ZoneCard({ card, selected, onClick, label }: { card: Card; selected?: boolean; onClick: () => void; label: string }) {
  return <button type='button' className={`zone-card ${selected ? 'selected' : ''}`} data-card-id={card.id} aria-pressed={selected === undefined ? undefined : selected} aria-label={label} title={card.name} onClick={onClick}>
    <span className='zone-card-face'><CardFace card={card} /></span>
  </button>;
}

function titleFor(zone: Zone, discardOwner: PlayerId | undefined, picking: boolean, verb?: string) {
  if (picking) return verb ?? 'Choose a card';
  if (zone === 'trash') return 'Shared Trash';
  if (zone === 'destroyed') return 'Destroyed';
  return discardOwner === 1 ? "Opponent's Discard" : 'Your Discard';
}

/**
 * Left drawer: shared Trash / Destroyed. Right drawer: a player's Discard.
 * While a choice names `zone`, the matching drawer stays open for pick + confirm.
 */
export function ZoneDrawer({
  zone, view, choice, discardOwner = 0, choose, inspect, close,
}: {
  zone: Zone | null;
  view: SessionView;
  choice: Choice | null;
  discardOwner?: PlayerId;
  choose: (id: string | readonly string[]) => void;
  inspect: (card: Card) => void;
  close: () => void;
}) {
  const last = useRef<Zone>('trash');
  if (zone) last.current = zone;
  const shown = zone ?? last.current;
  const sideRight = shown === 'discard';
  const picking = !!choice && ((choice.zone === 'trash' && shown === 'trash') || (choice.zone === 'discard' && shown === 'discard'));
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [choice?.id]);
  const options = picking ? choice.options.filter(option => option.card) : [];
  const select = choice?.select;
  const min = select?.min ?? 1;
  const max = select?.max ?? 1;
  const togglePick = (id: string) => setPicked(current => {
    if (current.includes(id)) return current.filter(entry => entry !== id);
    if (max === 1) return [id];
    if (current.length >= max) return current;
    return [...current, id];
  });
  const canConfirm = picked.length >= min && picked.length <= max;
  const confirm = () => {
    if (!canConfirm) return;
    if (max === 1 && !select) choose(picked[0]);
    else choose(picked);
  };
  const grid = (cards: Card[], empty: string) => cards.length
    ? <div className='zone-cards'>{cards.map(card => <ZoneCard key={card.id} card={card} label={`Inspect ${card.name}`} onClick={() => inspect(card)} />)}</div>
    : <p className='zone-empty'>{empty}</p>;
  const discardCards = view.players[discardOwner]?.discard ?? [];
  const eyebrow = picking
    ? choice.sourceName
    : shown === 'trash' ? 'SHARED ZONE' : shown === 'destroyed' ? 'REMOVED FROM PLAY' : 'PLAYER ZONE';
  return <>
    <div className={`zone-scrim ${zone ? 'open' : ''}`} onClick={picking ? undefined : close} />
    <aside
      className={`zone-drawer ${sideRight ? 'side-right' : ''} ${zone ? 'open' : ''} ${picking ? 'recovering' : ''}`}
      data-zone={shown}
      role={picking ? 'dialog' : 'region'}
      aria-modal={picking ? 'true' : undefined}
      aria-label={titleFor(shown, discardOwner, false)}
      inert={!zone}
    >
      <header>
        <small>{eyebrow}</small>
        <h2><Icon name={shown === 'discard' ? 'discard-pile' : shown} />{titleFor(shown, discardOwner, picking, choice?.verb)}</h2>
        {!picking && <button type='button' className='zone-drawer-close' aria-label='Close drawer' onClick={close}>×</button>}
      </header>
      <div className='zone-drawer-body'>
        {picking ? <>
          <p>{choice.prompt}</p>
          <p className='zone-instruction'>
            {max === 1 ? 'Select a card, then confirm. Nothing resolves until you confirm.' : `Select ${min === max ? min : `${min}–${max}`} cards, then confirm.`}
          </p>
          <div className='zone-cards'>{options.map(option => <div key={option.id} className='zone-pick'>
            <ZoneCard card={option.card!} label={option.label} selected={picked.includes(option.id)} onClick={() => togglePick(option.id)} />
            <button type='button' className='zone-inspect' aria-label={`Inspect ${option.label}`} onClick={() => inspect(option.card!)}>Inspect</button>
          </div>)}</div>
        </> : shown === 'trash' ? <>
          <p>Cards here are unowned. Recovery effects can acquire them; they do not contribute to either player's VP.</p>
          {grid(view.trash, 'No cards have entered Trash.')}
        </> : shown === 'destroyed' ? <>
          <p>Destroyed cards are out of the game. Browse them here for review.</p>
          <section className='zone-group'><h3>Yours <b>{view.players[0].destroyed.length}</b></h3>{grid(view.players[0].destroyed, 'None of your cards have been destroyed.')}</section>
          <section className='zone-group'><h3>Opponent <b>{view.players[1].destroyed.length}</b></h3>{grid(view.players[1].destroyed, 'None of the opponent\'s cards have been destroyed.')}</section>
        </> : <>
          <p>{discardOwner === 0 ? 'Cards you discarded this Cycle. Effects can trash, destroy, or recover them from here.' : 'Cards your opponent discarded this Cycle.'}</p>
          {grid(discardCards, discardOwner === 0 ? 'Your Discard is empty.' : 'Opponent Discard is empty.')}
        </>}
      </div>
      {picking && <footer>
        <button type='button' className='zone-confirm' disabled={!canConfirm} onClick={confirm}>{choice.verb ?? 'Confirm'}</button>
        <span>{picked.length} of {max === min ? max : `${min}–${max}`} selected</span>
      </footer>}
    </aside>
  </>;
}
