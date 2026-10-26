import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import type { Card } from '@0uroboros/engine/game';
import { DRAFT_COPIES_PER_PLAYER, type MarketPile } from '@0uroboros/engine/evaluationMarket';
import type { SessionView } from '@0uroboros/engine/runtime';
import { isStep, type AnyEffect } from '@0uroboros/engine/effects/types';

/** Theme class for a Circuit Reward, matching the `.circuit-privilege.*` styles. */
const privilegeTheme=(effect:AnyEffect)=>{
 const action=isStep(effect)?effect.action:undefined;
 return action==='gainCrypto'?'crypto':action==='gainVP'?'vp':action==='repairServer'?'restorePrimary':'private';
};

type Props = {
 view: SessionView; busy: boolean; now: number; seconds: number;
 acquired: Record<string,{at:number;count:number}>;
 cycleStart: {vp:number;integrity:number}|null;
 inspect: (card:Card)=>void; acquire:(id:string)=>void;
 claim:()=>void; end:()=>void; undo:()=>void;
};

export function DraftPanel({view,busy,now,seconds,acquired,cycleStart,inspect,acquire,claim,end,undo}:Props){
 const local=view.players[0],opponent=view.players[1];
 const locked=busy||view.draftEnded||view.draftReady[0]||seconds===0;
 const privilege=view.circuitReward.definition;
 // Engine order: top 5 then bottom 5 — never re-sort by cost.
 const offers=view.market.filter(pile=>pile.rotating);
 const topRow=offers.slice(0,5);
 const bottomRow=offers.slice(5,10);
 // Persistent Crypto shelf (setup option), kept in engine order for the 2×2 grid.
 const cryptoPiles=view.market.filter(pile=>!pile.rotating&&pile.category==='Crypto');
 const vpEarned=Math.max(0,local.totalVP-(cycleStart?.vp??0));
 const integrityDelta=local.servers.primary+local.servers.backup-(cycleStart?.integrity??0);
 const locationsWon=view.nodes.filter(node=>node.winner===0).length;
 const locationsLost=view.nodes.filter(node=>node.winner===1).length;
 const eligible=view.circuitEligible.includes(0);
 const claimed=view.circuitReward.claimed.includes(0);

 const renderPile=(pile:MarketPile)=>{
  const stock=pile.remaining?.[0]??pile.supply;
  const justBought=!!acquired[pile.id]&&now-acquired[pile.id].at<600;
  const affordable=stock>0&&pile.card.cost<=local.wallet;
  const unavailable=locked||!affordable;
  const state=stock===0?'Gone':pile.card.cost>local.wallet?'Too costly':'Acquire';
  return <article className={`market-card character ${pile.category.toLowerCase()} ${pile.rotating?'rotating':''} ${justBought?'just-acquired':''} ${stock===0?'sold-out':''} ${unavailable?'unavailable':''}`} key={pile.id} data-pile-id={pile.id} data-market-id={pile.id} data-card-name={pile.card.name} data-category={pile.category} data-stock={stock} data-cost={pile.card.cost}>
   <button className='market-art' aria-label={`Inspect ${pile.card.name}`}
    onClick={()=>inspect(pile.card)} onContextMenu={event=>{event.preventDefault();inspect(pile.card);}}>
    <CardFace card={pile.card} context='preview'/>
   </button>
   {/* aria-disabled rather than disabled so the reason stays reachable in the tooltip. */}
   <button className={`market-acquire acquire-card ${unavailable?'':'can-afford'}`} aria-disabled={unavailable} aria-label={`${state}: ${pile.card.name}, ${pile.card.cost} Crypto, ${stock} remaining`} title={state}
    onClick={()=>{if(!unavailable)acquire(pile.id);}}>
    <span className='market-acquire-label'><Icon name='crypto'/><b>{pile.card.cost}</b>Acquire</span>
    <small className='market-acquire-remain'>{stock} Remain</small>
   </button>
  </article>;
 };

 return <section className='draft-overlay strategic-draft' aria-label='Evaluation Draft'>
  <header className='draft-topbar'>
   <section className={`circuit-privilege compact ${privilege?privilegeTheme(privilege.effect):'private'}`} data-circuit-source='true' aria-label='Circuit Reward privilege'>
    {eligible&&privilege?<>
     <div className='privilege-icon-wrap' aria-hidden='true'>
      <span className='loop-ring'/><span className='loop-ring reverse'/>
      <div className='privilege-symbol'><Icon name={privilegeTheme(privilege.effect)==='vp'?'volume':privilegeTheme(privilege.effect)==='crypto'?'crypto':'database'}/></div>
     </div>
     <div className='privilege-copy'>
      <small>CIRCUIT · FREE{privilege.awardTrailing?' · TRAILING PLAYER':''}</small>
      <h2>{privilege.name}</h2>
      <p>{privilege.text}</p>
     </div>
     <button className='primary-button' disabled={locked||claimed} onClick={claim}>{claimed?'Claimed':'Claim'}</button>
    </>:<div className='privilege-copy'><small>CIRCUIT</small><h2>Opponent privilege</h2><p>You can still buy from the market.</p></div>}
   </section>
   <aside className='draft-wallet-hero' data-draft-resource='0-wallet' aria-label='Crypto to spend'>
    <div className='draft-clock'>{view.draftEnded?'DONE':`${seconds}s`}</div>
    <div className='wallet-hero-value'><Icon name='crypto'/><b key={local.wallet}>{local.wallet}</b></div>
    <small>Crypto</small>
   </aside>
  </header>

  <div className='draft-market-board' aria-label='Full market'>
   <div className='market-main'>
    {topRow.length>0&&<div className='market-group market-row-offers' data-market-section='draft-top'>
     <h3 className='market-group-label'>This round <small>max {DRAFT_COPIES_PER_PLAYER} each</small></h3>
     <div className='market-cards'>{topRow.map(renderPile)}</div>
    </div>}
    {bottomRow.length>0&&<div className='market-group market-row-offers' data-market-section='draft-bottom'>
     <div className='market-cards'>{bottomRow.map(renderPile)}</div>
    </div>}
   </div>
   {cryptoPiles.length>0&&<aside className='market-crypto' data-market-section='draft-crypto' aria-label='Crypto shelf'>
    <h3 className='market-group-label'>Crypto</h3>
    <div className='market-crypto-grid'>{cryptoPiles.map(renderPile)}</div>
   </aside>}
  </div>

  <footer className='draft-footer'>
   <aside className='cycle-summary' aria-label='Cycle summary'>
    <dl>
     <div data-draft-resource='0-wallet'><dt>Crypto</dt><dd>{local.wallet}</dd></div>
     <div data-draft-resource='0-vp'><dt>VP</dt><dd>+{vpEarned}</dd></div>
     <div><dt>Integrity</dt><dd>{integrityDelta>0?`+${integrityDelta}`:integrityDelta}</dd></div>
     <div><dt>Locations</dt><dd>{locationsWon}–{locationsLost}</dd></div>
     <div className='draft-opponent' data-opponent-wallet={opponent.wallet} data-opponent-ready={view.draftReady[1]}><dt>Opp</dt><dd>{view.draftReady[1]?'Ready':opponent.wallet}</dd></div>
    </dl>
   </aside>
   <div className='draft-end-controls'>
    {view.draftReady[0]&&!view.draftEnded
     ?<button className='primary-button' disabled={busy||seconds===0} onClick={undo}>Resume</button>
     :<button className='primary-button' disabled={busy||view.draftEnded||seconds===0} onClick={end}>End Draft</button>}
    <small>{view.draftEnded?'Starting next cycle…':view.draftReady[0]?'Waiting for opponent · Resume anytime':seconds===0?'Time up':'Unspent Crypto expires'}</small>
   </div>
  </footer>
 </section>;
}
