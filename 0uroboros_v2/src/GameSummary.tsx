import { useEffect, useState, type CSSProperties } from 'react';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import type { Card, PlayerId } from './game';
import type { ScoreBreakdown, SessionView } from './runtime';
import type { PlayerColor, ResolvedColorTheme } from './playerTheme';
import './game-summary.css';

type Props = {
 view: SessionView;
 colors: ResolvedColorTheme;
 inspect: (card: Card) => void;
 restart: () => void;
};

/** Delay before the totals start counting, so the rows land first. */
const ROW_STAGGER_MS = 110;
const TALLY_MS = 900;

function useCountUp(target: number, delay: number){
 const [value, setValue] = useState(0);
 useEffect(() => {
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){ setValue(target); return; }
  let frame = 0;
  const start = performance.now() + delay;
  const tick = (now: number) => {
   const t = Math.min(Math.max((now - start) / TALLY_MS, 0), 1);
   setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
   if(t < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
 }, [target, delay]);
 return value;
}

const cardVP = (card: Card) => card.vp ?? (card.name === 'Vault Encryption' ? 2 : 0);

function PlayerTally({ owner, score, color, leading, showEffects, showDestruction, inspect }:{
 owner: PlayerId; score: ScoreBreakdown; color: PlayerColor; leading: boolean;
 showEffects: boolean; showDestruction: boolean; inspect: (card: Card) => void;
}){
 const [open, setOpen] = useState(false);
 const rows: { key: string; label: string; value: number }[] = [
  { key: 'locations', label: 'Locations', value: score.locationVP },
  { key: 'circuit', label: 'Circuit rewards', value: score.circuitVP },
  ...(showEffects ? [{ key: 'effects', label: 'Card effects', value: score.effectVP }] : []),
  ...(showDestruction ? [{ key: 'destruction', label: 'Server destruction', value: score.destructionVP }] : []),
 ];
 const totalDelay = (rows.length + 2) * ROW_STAGGER_MS;
 const total = useCountUp(score.total, totalDelay);
 return <article className={`summary-player ${leading ? 'leading' : ''}`} data-owner={owner} style={{ '--tally-accent': color.accent } as CSSProperties}>
  <header>
   <small>{owner === 0 ? 'YOUR CIRCUIT' : 'OPPONENT'}</small>
   <b className='summary-total' aria-label={`${score.total} VP`}>{total}<span>VP</span></b>
  </header>
  <ul className='summary-rows'>
   <li style={{ '--row-index': 0 } as CSSProperties}>
    <button className='summary-cards-toggle' aria-expanded={open} disabled={!score.vpCards.length} onClick={() => setOpen(value => !value)}>
     <span className='summary-row-label'><i aria-hidden='true'>{open ? '−' : '+'}</i>VP cards<em>{score.vpCards.length} {score.vpCards.length === 1 ? 'card' : 'cards'}</em></span>
     <b>{score.cardVP}</b>
    </button>
    {open && <div className='summary-cards' role='list'>
     {score.vpCards.map((card, index) => <button key={card.id} role='listitem' className='summary-card' style={{ '--card-index': index } as CSSProperties} aria-label={`Inspect ${card.name}, ${cardVP(card)} VP`} onClick={() => inspect(card)}>
      <CardFace card={card}/>
      <span className='summary-card-vp'>+{cardVP(card)}</span>
     </button>)}
    </div>}
   </li>
   {rows.map((row, index) => <li key={row.key} style={{ '--row-index': index + 1 } as CSSProperties}>
    <span className='summary-row-label'>{row.label}</span><b>{row.value}</b>
   </li>)}
  </ul>
 </article>;
}

/** End-of-session sheet: rises over the singularity without dimming it. */
export function GameSummary({ view, colors, inspect, restart }: Props){
 const scores = view.finalScore;
 if(!scores) return null;
 const headline = view.winner === 0 ? 'You win' : view.winner === 1 ? 'Opponent wins' : 'Tie';
 const showEffects = scores.some(score => score.effectVP !== 0);
 const showDestruction = scores.some(score => score.destructionVP !== 0);
 return <section className='game-summary' role='region' aria-label='Session summary'>
  <header className='summary-head'>
   <div>
    <small><Icon name='volume'/>CIRCUIT COMPLETE · CYCLE {String(view.cycle).padStart(2, '0')}</small>
    <h2>{headline}</h2>
    {view.endedReason && <p>{view.endedReason}</p>}
   </div>
   <button className='primary-button' onClick={restart}>New evaluation session <span>↗</span></button>
  </header>
  <div className='summary-players'>
   {([0, 1] as const).map(owner => <PlayerTally key={owner} owner={owner} score={scores[owner]} color={colors[owner]} leading={view.winner === owner} showEffects={showEffects} showDestruction={showDestruction} inspect={inspect}/>)}
  </div>
 </section>;
}
