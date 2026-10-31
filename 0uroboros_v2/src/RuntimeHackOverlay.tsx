import type { Card } from '@0uroboros/engine/game';
import type { RuntimeEvent } from '@0uroboros/engine/runtime';
import { CardFace } from './CardFace';
import './runtime-hack.css';

type Props = {
  event: RuntimeEvent;
  playerName: string;
  rewardCard: Card | null;
  onClaim: () => void;
};

/** Award modal shown only when a seat actually unlocks a Runtime Hack (no title/board-scan cut). */
export function RuntimeHackOverlay({ event, playerName, rewardCard, onClaim }: Props) {
  const name = event.sourceName ?? 'Runtime Hack';
  return <div className="runtime-hack-overlay runtime-hack-modal-phase" role="presentation">
    <div className="modal-backdrop runtime-hack-backdrop" onClick={onClaim}>
      <section className="runtime-hack-modal" role="dialog" aria-modal="true" aria-label={`Runtime Hack ${name}`} onClick={click => click.stopPropagation()}>
        <small>Runtime Hack</small>
        <h2>{name}</h2>
        <p className="runtime-hack-player">{playerName}</p>
        {event.formula && <p className="runtime-hack-formula">{event.formula}</p>}
        {rewardCard && <div className="runtime-hack-card"><CardFace card={rewardCard} context="runtime" /></div>}
        {event.rewardCardName && !rewardCard && <p className="runtime-hack-reward">Award: {event.rewardCardName}</p>}
        <button type="button" className="runtime-hack-claim" onClick={onClaim}>Continue</button>
      </section>
    </div>
  </div>;
}
