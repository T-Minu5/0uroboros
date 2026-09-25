import { useState } from 'react';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import type { Card } from './game';
import type { RuntimeEvent, SessionView } from './runtime';

type Props = {
 view: SessionView; busy: boolean; now: number; seconds: number;
 acquired: Record<string,{at:number;count:number}>;
 cycleStart: {vp:number;integrity:number}|null;
 history: RuntimeEvent[];
 inspect: (card:Card)=>void; acquire:(id:string)=>void;
 claim:()=>void; end:()=>void; undo:()=>void; next:()=>void;
};
const categories=['All','Base','VP','Crypto','Chaos'] as const;

export function DraftPanel({view,busy,now,seconds,acquired,cycleStart,history,inspect,acquire,claim,end,undo,next}:Props){
 const [category,setCategory]=useState<typeof categories[number]>('All');
 const local=view.players[0],opponent=view.players[1];
 const locked=busy||view.draftEnded||view.draftReady[0]||seconds===0;
 const purchases=history.filter(event=>event.kind==='purchase').slice(-6);
 const privilege=view.circuitReward.definition;
 const filtered=view.market.filter(pile=>category==='All'||pile.category===category);
 const sections=category==='All' ? [
  { key:'rotating-base', title:'Rotating Base Tech', note:'2 live this Cycle', piles:filtered.filter(pile=>pile.category==='Base'&&pile.rotating) },
  { key:'chaos', title:'Chaos Rotation', note:'3 live this Cycle', piles:filtered.filter(pile=>pile.category==='Chaos') },
  { key:'core-base', title:'Core Base Market', note:'Always available', piles:filtered.filter(pile=>pile.category==='Base'&&!pile.rotating) },
  { key:'vp', title:'VP Vaults', note:'Persistent shared supply', piles:filtered.filter(pile=>pile.category==='VP') },
  { key:'crypto', title:'Crypto Cache', note:'Persistent shared supply', piles:filtered.filter(pile=>pile.category==='Crypto') },
 ] : [
  { key:category.toLowerCase(), title:category==='Base'?'Base Market':category==='VP'?'VP Vaults':category==='Crypto'?'Crypto Cache':'Chaos Rotation', note:category==='Base'?'Core and rotating Base cards':'Filtered market view', piles:filtered }
 ];
 return <section className='draft-overlay strategic-draft' aria-label='Evaluation Draft'>
  <div className='draft-heading'>
   <div><small>CYCLE {view.cycle} / ACQUISITION</small><h1>Build your next possibility.</h1><p>Build an engine. Control the Circuit. Turn the lead into VP.</p></div>
   <div className='draft-wallet' data-draft-resource='0-wallet'><Icon name='crypto'/><b>{local.wallet}</b><small>YOUR WALLET</small></div>
   <div className='draft-clock'>{view.draftEnded?'COMPLETE':`${seconds}s`}<small>Draft window</small></div>
   <div className='draft-end-controls'>
    {view.draftEnded?<button className='primary-button' disabled={busy} onClick={next}>Next Cycle</button>:view.draftReady[0]?<button className='primary-button' disabled={busy||seconds===0} onClick={undo}>Resume Draft</button>:<button className='primary-button' disabled={busy} onClick={end}>End Draft</button>}
    <small>{view.draftEnded?'Both players finished':view.draftReady[0]?'Waiting for opponent':'Unspent Crypto expires'}</small>
   </div>
  </div>
  <div className='cycle-recap' aria-label='Cycle result'>
   <span><small>VP EARNED</small><b>+{Math.max(0,local.totalVP-(cycleStart?.vp??0))}</b></span>
   <span><small>INTEGRITY CHANGE</small><b>{local.centers.primary+local.centers.backup-(cycleStart?.integrity??0)}</b></span>
   <span><small>LOCATIONS WON</small><b>{view.nodes.filter(node=>node.winner===0).length} <small>—</small> {view.nodes.filter(node=>node.winner===1).length}</b></span>
   <span className='draft-opponent' data-opponent-wallet={opponent.wallet} data-opponent-ready={view.draftReady[1]}><small>OPPONENT · {view.draftReady[1]?'READY':'DRAFTING'}</small><b>{opponent.wallet} <Icon name='crypto'/></b></span>
  </div>
  <section className={`circuit-privilege ${privilege?.effect.kind??'private'}`} data-circuit-source='true' aria-label='Circuit Reward privilege'>
   {view.circuitEligible.includes(0)&&privilege?<>
    <div className='privilege-symbol'><Icon name={privilege.effect.kind==='vp'?'volume':privilege.effect.kind==='crypto'?'crypto':'database'}/></div>
    <div className='privilege-copy'><small>CIRCUIT PRIVILEGE · FREE · ONCE THIS DRAFT</small><h2>{privilege.name}</h2><p>{privilege.text}</p><div className='privilege-statline'><span data-draft-resource='0-vp'>Total VP <b>{local.totalVP}</b></span><span data-draft-resource='0-primary'>Primary <b>{local.centers.primary.toLocaleString()} / 2,000</b></span></div></div>
    <button className='primary-button' disabled={locked||view.circuitReward.claimed.includes(0)} onClick={claim}>{view.circuitReward.claimed.includes(0)?'Claimed':view.draftReady[0]||view.draftEnded?'Draft ended':'Claim free privilege'}</button>
   </>:<div className='privilege-copy'><small>CIRCUIT PRIVILEGE</small><h2>Opponent earned this privilege</h2><p>You can still acquire cards from the market.</p></div>}
  </section>
  <div className='draft-market-heading'><div className='market-filters' aria-label='Market categories'>{categories.map(value=><button aria-pressed={category===value} className={category===value?'active':''} key={value} onClick={()=>setCategory(value)}>{value}</button>)}</div><small>Base / VP / Crypto share supply · Chaos allows 2 per player · rotating Base and Chaos refresh each Cycle</small></div>
  <div className='market-sections'>{sections.filter(section=>section.piles.length).map(section=><section className='market-section' key={section.key} data-market-section={section.key}>
   <div className='market-section-heading'><h2>{section.title}</h2><small>{section.note}</small></div>
   <div className='market-grid'>{section.piles.map(pile=>{
   const stock=pile.remaining?.[0]??pile.supply;
   const cooling=!!acquired[pile.id]&&now-acquired[pile.id].at<2000;
   return <article className={`market-card ${pile.category.toLowerCase()} ${pile.rotating?'rotating':''} ${cooling?'just-acquired':''}`} key={pile.id} data-pile-id={pile.id} data-market-id={pile.id} data-card-name={pile.card.name} data-category={pile.category} data-stock={stock} data-cost={pile.card.cost}>
    <button className='market-art' onClick={()=>inspect(pile.card)} aria-label={`Inspect ${pile.card.name}`}><CardFace card={pile.card} context='draft'/></button>
    <small>{pile.rotating?'Rotating offer · ':''}{pile.category} · {stock} {pile.category==='Chaos'?'left for you':'in shared supply'}</small><h3>{pile.card.name}</h3><p>{pile.card.effect}</p>
    <div className='market-traits'>{pile.card.type==='VP'&&<span><Icon name='volume'/>{pile.card.vp??2} VP</span>}<span>{pile.card.type==='Crypto'?'Resolves at Draft':pile.card.type==='VP'?'Free deployment':'1 Action to deploy'}</span></div>
    <button className='acquire-card' disabled={locked||cooling||stock===0||pile.card.cost>local.wallet} onClick={()=>acquire(pile.id)}>{cooling?'Added to Discard':stock===0?'Unavailable':'Acquire'} <span>{pile.card.cost} <Icon name='crypto'/></span></button>
   </article>;
  })}</div></section>)}</div>
  <aside className='draft-purchase-feed' aria-label='Recent acquisitions'><small>RECENT ACQUISITIONS</small>{purchases.length?<ol>{purchases.map(event=><li key={event.id} data-purchase-owner={event.owner}><b>{event.owner===1?'Opponent':'You'}</b> {event.text.replace(/^(You acquire|Opponent acquires) /,'')}</li>)}</ol>:<p>Both players buy from their own Wallet. Acquired cards enter Discard.</p>}</aside>
  <p className='draft-footnote'>Evaluation market · Values are provisional. Acquisitions enter Discard. Repeat purchases from the same pile have a two-second cooldown per player.</p>
 </section>;
}
