import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import { cardClassOf, cardClasses } from './authoring/cardBrowser';
import type { Card } from './game';
import type { MarketPile } from './evaluationMarket';
import type { SessionView } from './runtime';

type Props = {
 view: SessionView; busy: boolean; now: number; seconds: number;
 acquired: Record<string,{at:number;count:number}>;
 cycleStart: {vp:number;integrity:number}|null;
 inspect: (card:Card)=>void; acquire:(id:string)=>void;
 claim:()=>void; end:()=>void; undo:()=>void;
};

function subtypeGroups(piles:MarketPile[]):MarketPile[][]{
 return cardClasses
  .map(cardClass=>piles.filter(pile=>cardClassOf(pile.card)===cardClass).sort((a,b)=>a.card.cost-b.card.cost||a.card.name.localeCompare(b.card.name)))
  .filter(group=>group.length>0);
}

export function DraftPanel({view,busy,now,seconds,acquired,cycleStart,inspect,acquire,claim,end,undo}:Props){
 const local=view.players[0],opponent=view.players[1];
 const locked=busy||view.draftEnded||view.draftReady[0]||seconds===0;
 const privilege=view.circuitReward.definition;
 const baseGroups=subtypeGroups(view.market.filter(pile=>pile.category==='Base'));
 const chaosGroups=subtypeGroups(view.market.filter(pile=>pile.category==='Chaos'));
 const resources=[
  ...view.market.filter(pile=>pile.category==='VP'),
  ...view.market.filter(pile=>pile.category==='Crypto'),
 ];
 const vpEarned=Math.max(0,local.totalVP-(cycleStart?.vp??0));
 const integrityDelta=local.servers.primary+local.servers.backup-(cycleStart?.integrity??0);
 const locationsWon=view.nodes.filter(node=>node.winner===0).length;
 const locationsLost=view.nodes.filter(node=>node.winner===1).length;
 const eligible=view.circuitEligible.includes(0);
 const claimed=view.circuitReward.claimed.includes(0);

 const renderPile=(pile:MarketPile,size:'character'|'compact')=>{
  const stock=pile.remaining?.[0]??pile.supply;
  const cooling=!!acquired[pile.id]&&now-acquired[pile.id].at<2000;
  const affordable=!cooling&&stock>0&&pile.card.cost<=local.wallet;
  const unavailable=locked||!affordable;
  const state=cooling?'Added':stock===0?'Gone':pile.card.cost>local.wallet?'Too costly':'Acquire';
  // aria-disabled rather than disabled so right-click inspect still reaches unaffordable cards.
  return <article className={`market-card ${size} ${pile.category.toLowerCase()} ${pile.rotating?'rotating':''} ${cooling?'just-acquired':''} ${stock===0?'sold-out':''}`} key={pile.id} data-pile-id={pile.id} data-market-id={pile.id} data-card-name={pile.card.name} data-category={pile.category} data-stock={stock} data-cost={pile.card.cost}>
   <button className={`market-art acquire-card ${unavailable?'':'can-afford'}`} aria-disabled={unavailable} aria-label={`${state}: ${pile.card.name}, ${pile.card.cost} Crypto, ${stock} remaining`} title={`${state} · Right-click to inspect`}
    onClick={()=>{if(!unavailable)acquire(pile.id);}} onContextMenu={event=>{event.preventDefault();inspect(pile.card);}}>
    <CardFace card={pile.card} context='draft'/>
   </button>
   <span className='market-stock'>{cooling?'Added':stock===0?'Gone':`${stock} left`}</span>
  </article>;
 };

 return <section className='draft-overlay strategic-draft' aria-label='Evaluation Draft'>
  <header className='draft-topbar'>
   <section className={`circuit-privilege compact ${privilege?.effect.kind??'private'}`} data-circuit-source='true' aria-label='Circuit Reward privilege'>
    {eligible&&privilege?<>
     <div className='privilege-icon-wrap' aria-hidden='true'>
      <span className='loop-ring'/><span className='loop-ring reverse'/>
      <div className='privilege-symbol'><Icon name={privilege.effect.kind==='vp'?'volume':privilege.effect.kind==='crypto'?'crypto':'database'}/></div>
     </div>
     <div className='privilege-copy'>
      <small>CIRCUIT · FREE</small>
      <h2>{privilege.name}</h2>
      <p>{privilege.text}</p>
     </div>
     <button className='primary-button' disabled={locked||claimed} onClick={claim}>{claimed?'Claimed':'Claim'}</button>
    </>:<div className='privilege-copy'><small>CIRCUIT</small><h2>Opponent privilege</h2><p>You can still buy from the market.</p></div>}
   </section>
   <aside className='draft-wallet-hero' data-draft-resource='0-wallet' aria-label='Crypto wallet'>
    <div className='draft-clock'>{view.draftEnded?'DONE':`${seconds}s`}</div>
    <div className='wallet-hero-value'><Icon name='crypto'/><b key={local.wallet}>{local.wallet}</b></div>
    <small>Wallet</small>
   </aside>
  </header>

  <div className='draft-market-board' aria-label='Full market'>
   <p className='market-hint'>Click a card to acquire · Right-click to inspect</p>
   <section className='market-band characters' data-market-section='characters'>
    <div className='market-row character-row' data-market-section='base'>{baseGroups.map(group=><div className='market-group' key={group[0].id}>{group.map(pile=>renderPile(pile,'character'))}</div>)}</div>
    <div className='market-row character-row' data-market-section='chaos'>{chaosGroups.map(group=><div className='market-group' key={group[0].id}>{group.map(pile=>renderPile(pile,'character'))}</div>)}</div>
   </section>
   <section className='market-band resources' data-market-section='resources'>
    <div className='market-row resource-row' data-market-section='vp'>{resources.map(pile=>renderPile(pile,'compact'))}</div>
   </section>
  </div>

  <footer className='draft-footer'>
   <aside className='cycle-summary' aria-label='Cycle summary'>
    <dl>
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
