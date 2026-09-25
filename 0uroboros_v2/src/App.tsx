import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BoardScene, Icon, type BoardNode } from './BoardScene';
import { canDeploy, type Card } from './game';
import { createSession, type RuntimeSession, type RuntimeEvent, type SessionView } from './runtime';
import { EffectPath, CardEffectMotion } from './Effects';
import { EffectChoice } from './EffectChoice';
import { DraftPanel } from './DraftPanel';
import { CardCatalog } from './CardCatalog';
import { CardFace } from './CardFace';
import './card-surfaces.css';
import { HISTORIC_SOURCE_METADATA } from './evaluationMarket';
import { EndTurnControl } from './EndTurnControl';
import { eventTime } from './presentation';
import { useCardPointerDrag, type CardOrigin } from './useCardPointerDrag';
import { bundledContent } from './authoring/contentStore';
import { loadGameContent } from './authoring/loadGameContent';

const blankNodes:BoardNode[]=Array.from({length:5},(_,i)=>({cards:[[],[]],powers:[0,0],weight:[30,25,20,15,10][i],title:'Location pending',text:'Approved content required'}));

export function App(){
 const engine=useRef<RuntimeSession|null>(null);
 const [content,setContent]=useState(bundledContent);
 const [contentLoading,setContentLoading]=useState(false);
 const [contentError,setContentError]=useState('');
 const [view,setView]=useState<SessionView|null>(null);
 const [runtimeSeconds,setRuntimeSeconds]=useState<number|null>(null);
 const [boardReady,setBoardReady]=useState(false);
 const [priority]=useState<'higher'|'lower'>('higher');
 const [active,setActive]=useState<RuntimeEvent|null>(null);
 const [busy,setBusy]=useState(false);
 const resolvingRef=useRef(false);
 const [flight,setFlight]=useState<{card:Card;x:number;y:number;w:number;h:number;dx:number;dy:number;scale:number;crypto?:boolean;angle?:number}|null>(null);
 const [fast,setFast]=useState(false); const fastRef=useRef(false);fastRef.current=fast;
 const [selected,setSelected]=useState<Card|null>(null);
 const [catalogOpen,setCatalogOpen]=useState(false);
 const [locationInspect,setLocationInspect]=useState<number|null>(null);
 const [arrivals,setArrivals]=useState<string[]>([]);
 const [opponentDraw,setOpponentDraw]=useState(0);
 const [cashed,setCashed]=useState<string[]>([]);
 const [cashFlight,setCashFlight]=useState<{card:Card;x:number;y:number;w:number;h:number;dx:number;dy:number;duration:number}|null>(null);
 const [closedNodes,setClosedNodes]=useState<number[]>([]);
 const [collapseNode,setCollapseNode]=useState<number|null>(null);
 const [awardNode,setAwardNode]=useState<number|null>(null);
 const [selectionNode,setSelectionNode]=useState<number|null>(null);
 const [openingCrypto,setOpeningCrypto]=useState<string[]>([]);
 const [openingNodeCount,setOpeningNodeCount]=useState(0);
 const [dealing,setDealing]=useState(false);
 const [dragged,setDragged]=useState<Card|null>(null);
 const [hoveredNode,setHoveredNode]=useState<number|null>(null);
 const [notice,setNotice]=useState('Enter the evaluation Circuit to begin.');
 const [history,setHistory]=useState<RuntimeEvent[]>([]);
 const [panel,setPanel]=useState<'log'|'practice'|'trash'|null>(null);
 const [cycleStart,setCycleStart]=useState<{vp:number;integrity:number}|null>(null);
 const [acquired,setAcquired]=useState<Record<string,{at:number;count:number}>>({});
 const [now,setNow]=useState(Date.now());
 const timers=useRef<number[]>([]);
 const isDragging=useRef(false);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),500);return()=>{clearInterval(timer);timers.current.forEach(clearTimeout);};},[]);
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected(null);setCatalogOpen(false);setLocationInspect(null);setPanel(null);}};window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc);},[]);
 useEffect(()=>{let cancelled=false;loadGameContent().then(next=>{if(!cancelled)setContent(next);}).catch(error=>{if(!cancelled)setContentError(error instanceof Error?error.message:'Content unavailable.');});return()=>{cancelled=true;};},[]);
 function later(callback:()=>void,time:number){const id=window.setTimeout(()=>{timers.current=timers.current.filter(timer=>timer!==id);callback();},time);timers.current.push(id);}
 function record(event:RuntimeEvent){setHistory(h=>[...h,event].slice(-150));}
 function pump(){
  let before=engine.current?.view();
  let next=engine.current?.step();
  while(next&&eventTime(next.event,fastRef.current)===0){record(next.event);setView(next.view);before=engine.current?.view();next=engine.current?.step();}
  if(!next){resolvingRef.current=false;isDragging.current=false;setBusy(false);setActive(null);if(engine.current){const snapshot=engine.current.view();setView(snapshot);if(snapshot.phase==='draft')setNotice(`Draft ready · ${snapshot.players[0].wallet} Crypto to spend${snapshot.circuitEligible.includes(0)?' · Your free Circuit privilege is available.':'.'}`);if(snapshot.phase==='runtime')setNotice(`Turn ${snapshot.turn} · ${snapshot.players[0].actions} Actions available · ${snapshot.priority===0?'You reveal first':'Opponent reveals first'}.`);}return;}
  presentResolved(before,next);
 }
 function presentResolved(before:SessionView|undefined,resolved:{event:RuntimeEvent;view:SessionView}){
  setActive(resolved.event);record(resolved.event);
  const duration=eventTime(resolved.event,fastRef.current);
  const event=resolved.event;
  if(event.stage==='node-start'){setCollapseNode(event.node!);setAwardNode(null);}
  if(event.stage==='node-award')setAwardNode(event.node!);
  if(event.stage==='node-close'){setClosedNodes(nodes=>[...nodes,event.node!]);setAwardNode(null);}
  if(event.kind==='circuit'){setCollapseNode(null);setAwardNode(null);setSelectionNode(null);}
  if(event.kind==='draw'&&event.target==='hand'&&(event.amount??0)>0&&before){
   if(event.targetOwner===0){
    const previous=new Set(before.players[0].hand.map(card=>card.id));
    const drawn=resolved.view.players[0].hand.filter(card=>!previous.has(card.id));
    const crypto=drawn.filter(card=>card.type==='Crypto');
    setOpeningCrypto(ids=>[...ids,...crypto.map(card=>card.id)]);setArrivals(drawn.map(card=>card.id));setView(resolved.view);
    const settle=650+Math.max(0,drawn.length-1)*110;
    later(()=>setArrivals([]),settle);
    later(()=>transferCrypto(crypto,0,pump),settle+450);
   }else{setView(resolved.view);setOpponentDraw(event.amount!);later(()=>{setOpponentDraw(0);pump();},Math.max(duration,850));}
   return;
  }
  const redeemed=before?.players[0].hand.find(card=>card.id===event.cardId&&card.type==='Crypto');
  if(event.kind==='crypto'&&event.owner===0&&redeemed){
   const source=document.querySelector(`.cache-card[data-card-id="${CSS.escape(redeemed.id)}"]`),target=document.querySelector('[data-resource="0-wallet"]');
   if(source&&target){const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();setCashFlight({card:redeemed,x:a.x,y:a.y,w:a.width,h:a.height,dx:b.x+b.width/2-a.x-a.width/2,dy:b.y+b.height/2-a.y-a.height/2,duration});}
   later(()=>{setCashed(ids=>[...ids,redeemed.id]);setCashFlight(null);setView(resolved.view);},duration*.72);
   later(pump,duration);return;
  }

  // The authoritative result is held offscreen until the visual contact beat.
  const contact=resolved.event.target||resolved.event.targetNode!==undefined||resolved.event.targetCardId!==undefined||['move','probability','trash'].includes(resolved.event.kind) ? .60 :resolved.event.kind==='reveal'?.44:resolved.event.kind==='circuit'?.86:0;
  if(contact)later(()=>setView(resolved.view),duration*contact);else setView(resolved.view);
  later(pump,duration);
 }
 function showOpening(snapshot:SessionView){
  setLocationInspect(null);setOpeningNodeCount(0);
  [900,1700,2500].forEach((delay,index)=>later(()=>setOpeningNodeCount(index+1),delay));
  setCycleStart({vp:snapshot.players[0].totalVP,integrity:snapshot.players[0].centers.primary+snapshot.players[0].centers.backup});setAcquired({});
  const crypto=snapshot.players[0].hand.filter(card=>card.type==='Crypto');
  setOpeningCrypto(crypto.map(card=>card.id));setDealing(true);setBusy(true);resolvingRef.current=true;
  setNotice(`${snapshot.players[0].hand.length} cards drawn. Crypto will move to your cache.`);
  setArrivals(snapshot.players[0].hand.map(card=>card.id));later(()=>setArrivals([]),1100);
  setCashed([]);setClosedNodes([]);setCollapseNode(null);setAwardNode(null);setSelectionNode(null);
  later(()=>transferCrypto(crypto,0,()=>{setDealing(false);if(engine.current?.pendingCount){pump();return;}setBusy(false);resolvingRef.current=false;setNotice(`${snapshot.players[0].hand.length} cards dealt · ${snapshot.players[0].hand.length-crypto.length} in hand · ${crypto.length} in Crypto wallet.`);}),2900);
 }
 function transferCrypto(cards:Card[],index:number,done:()=>void){
  const card=cards[index];if(!card){done();return;}
  const source=document.querySelector(`.hand-card[data-card-id="${CSS.escape(card.id)}"]`),target=document.querySelector('.cache-cards');
  if(source&&target){const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();setFlight({card,x:a.x,y:a.y,w:a.width,h:a.height,dx:b.x+b.width/2-a.x-a.width/2,dy:b.y+b.height/2-a.y-a.height/2,scale:67/a.width,crypto:true});}
  later(()=>{setOpeningCrypto(ids=>ids.filter(id=>id!==card.id));setFlight(null);later(()=>transferCrypto(cards,index+1,done),160);},500);
 }
 async function start(){if(!priority||!boardReady||contentLoading)return;setContentLoading(true);setContentError('');try{const snapshot=await loadGameContent();setContent(snapshot);const session=createSession({carryover:true,priorityPreference:priority,random:Math.random,strategicMarket:true,evaluationContent:true,content:snapshot});engine.current=session;setView(session.view());showOpening(session.view());}catch(error){setContentError(error instanceof Error?error.message:'Content unavailable.');}finally{setContentLoading(false);}}
 function act(action:()=>RuntimeEvent|void|null){try{const event=action();if(event){record(event);setNotice(event.text);}if(engine.current){const snapshot=engine.current.view();setView(snapshot);if(event?.kind==='cycle')showOpening(snapshot);}}catch(error){setNotice(error instanceof Error?error.message:'Action unavailable.');}}
 function acquire(pileId:string){
  if(!engine.current||busy)return;
  try{const event=engine.current.buy(pileId);record(event);setNotice(event.text);setView(engine.current.view());setAcquired(previous=>({...previous,[pileId]:{at:Date.now(),count:(previous[pileId]?.count??0)+1}}));}catch(error){setNotice(error instanceof Error?error.message:'Acquisition unavailable.');}
 }
 function claimPrivilege(){
  if(!engine.current||resolvingRef.current)return;
  try{const event=engine.current.claimCircuitReward();const next=engine.current.view();resolvingRef.current=true;setBusy(true);setActive(event);record(event);setNotice(event.text);const duration=eventTime(event,fastRef.current);later(()=>setView(next),duration*.6);later(()=>{if(engine.current?.pendingCount)pump();else{setActive(null);setBusy(false);resolvingRef.current=false;}},duration);}catch(error){setNotice(error instanceof Error?error.message:'Privilege unavailable.');}
 }
 function choose(optionId:string){
  if(!engine.current||resolvingRef.current)return;
  try{const before=engine.current.view();const event=engine.current.choose(optionId);setNotice(event.text);resolvingRef.current=true;setBusy(true);presentResolved(before,{event,view:engine.current.view()});}catch(error){setNotice(error instanceof Error?error.message:'Choice unavailable.');}
 }
 function endTurn(){
  if(!engine.current||resolvingRef.current)return;
  resolvingRef.current=true;setSelected(null);act(()=>engine.current!.endTurn());
  if(engine.current.pendingCount){setBusy(true);later(pump,400);}else resolvingRef.current=false;
 }
 function undoPlanning(){
  if(!engine.current||busy||resolvingRef.current)return;
  setSelected(null);setDragged(null);setHoveredNode(null);
  act(()=>engine.current!.undoAllPlanning());
 }
 function addTestCard(id:string,owner:0|1){
  if(!engine.current||busy||resolvingRef.current)return false;
  try{
   const before=engine.current.view();
   const event=engine.current.addEvaluationCard(id,owner);
   resolvingRef.current=true;setBusy(true);
   presentResolved(before,{event,view:engine.current.view()});
   return true;
  }catch(error){setNotice(error instanceof Error?error.message:'Test card unavailable.');return false;}
 }
 function legal(node:number,card=dragged){if(!view||!card)return 'Select a card.';if(busy||view.phase!=='runtime')return 'Wait for Runtime.';return canDeploy(card,view.players[0].actions,view.turn,node,view.nodes[node].cards[0].length,view.openNodes);}
 function deploy(node:number,card=dragged,origin?:CardOrigin){
  if(!card||!engine.current||resolvingRef.current)return;
  const reason=legal(node,card);if(reason){setNotice(reason);setDragged(null);return;}
  const source=document.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`),target=document.querySelector(`[data-node-drop="${node}"]`);
  setDragged(null);setSelected(null);
  if((!source&&!origin)||!target){act(()=>engine.current!.deploy(card.id,node));return;}
  const a=origin??source!.getBoundingClientRect(),b=target.getBoundingClientRect(),slot=view!.nodes[node].cards[0].length,scale=b.width/124;
  const x=b.x+b.width/2+(slot%2?27:-27)*scale,y=b.y+b.height/2+(slot<2?-27.5:27.5)*scale;
  resolvingRef.current=true;isDragging.current=true;setBusy(true);
  setFlight({card,x:a.x,y:a.y,w:a.width,h:a.height,dx:x-a.x-a.width/2,dy:y-a.y-a.height/2,scale:46*scale/a.width,angle:origin?.angle??0});
  later(()=>{act(()=>engine.current!.deploy(card.id,node));setFlight(null);setBusy(false);resolvingRef.current=false;isDragging.current=false;},440);
 }
 const beginCardDrag=useCardPointerDrag({
  enabled:!!view&&view.phase==='runtime'&&!busy,
  onStart:card=>{isDragging.current=true;setSelected(null);setDragged(card);},
  onHover:setHoveredNode,
  onEnd:()=>{setDragged(null);setHoveredNode(null);later(()=>{if(!resolvingRef.current)isDragging.current=false;},80);},
  onDrop:(node,card,origin)=>deploy(node,card,origin),
  canDrop:(node,card)=>!legal(node,card),
 });
 const nodes:BoardNode[]=view?view.nodes.map((n,i)=>({cards:n.cards.map(cards=>cards.map(p=>({id:p.card.id,card:'hidden'in p.card?undefined:p.card,revealed:p.revealed,planned:view.planningCardIds.includes(p.card.id)}))) as BoardNode['cards'],powers:n.powers,weight:view.weights[i],title:n.location?.name??'Location pending',text:n.location?.rule??'No approved Location content',reward:n.location?.reward})):blankNodes;
 const local=view?.players[0]; const fieldHand=local?.hand.filter(c=>c.type!=='Crypto'||openingCrypto.includes(c.id))??[]; const cache=local?.hand.filter(c=>c.type==='Crypto'&&!openingCrypto.includes(c.id)&&!cashed.includes(c.id))??[];
 const phase=view?.phase??'setup';
 const sourceCard=selected?HISTORIC_SOURCE_METADATA[selected.definitionId??selected.id]:null;
 const circuitLanded=active?.kind==='circuit';
 const globalEvent=active&&(active.kind==='gameover'||circuitLanded||(active.kind==='collapse'&&active.text.startsWith('Wave Collapse')));
 const seconds=view?.draftEndsAt?Math.max(0,Math.ceil((view.draftEndsAt-now)/1000)):0;
 const draftOpen=phase==='draft'&&(!busy||(active?.source==='circuit'&&active.owner===0));
 useEffect(()=>{
  if(view?.phase!=='draft'||busy||resolvingRef.current||view.draftEnded||!engine.current)return;
  if(view.draftEndsAt!==null&&now>=view.draftEndsAt){act(()=>engine.current!.expireDraft(now));return;}
  const event=engine.current.opponentDraftStep(now);
  if(event){record(event);setView(engine.current.view());}
 },[now,view?.phase,busy]);
 const hudAnchors:NonNullable<React.ComponentProps<typeof BoardScene>['hudAnchors']>=[
 {id:'opponent-console',position:[0,.52,-4.6],content:<div className='opponent-console'><small>OPPONENT</small><Resources owner={1} actions={view?.players[1].actions??2} crypto={view?.players[1].wallet??0} pending={view?.players[1].pendingActions??0} vp={view?.players[1].totalVP??0}/><span data-resource='1-hand'>{view?.players[1].hand.length??5} cards in hand</span>{opponentDraw>0&&<div className='opponent-arrivals' aria-label={`Opponent draws ${opponentDraw} cards`}>{Array.from({length:opponentDraw},(_,i)=><img key={i} style={{'--arrival-delay':`${i*100}ms`} as CSSProperties} src='/assets/card_art/card backs/cardback_02_silicone.png' alt='Face-down drawn card'/>)}</div>}</div>},
 {id:'local-console',position:[0,.52,4.6],content:<div className='local-console'><small>YOUR CIRCUIT · {view?.priority===0?'PRIORITY':'REVEALS SECOND'}</small><Resources owner={0} actions={local?.actions??2} crypto={local?.wallet??0} pending={local?.pendingActions??0} vp={local?.totalVP??0}/></div>},
 ...([1,0] as const).flatMap(owner=>(['backup','primary'] as const).map(target=>({id:`dc-${owner}-${target}`,position:[target==='backup'?-4.6:4.6,.35,owner?-4.75:4.75] as [number,number,number],content:<DataCenter owner={owner} target={target} value={view?.players[owner].centers[target]??(target==='primary'?2000:1500)} active={active?.target===target&&active.targetOwner===owner?active:null} duration={active?eventTime(active,fast):1500}/>}))),
 ...([1,0] as const).map(owner=>({id:`duration-${owner}`,position:[-8.07,.1,owner?-5.9:5.9] as [number,number,number],content:<div className='bank-dock'><Duration owner={owner} cycle={view?.cycle??1} entries={view?.players[owner].bank??[]} activeCard={active?.cardId} inspect={setSelected}/>{owner===0&&<button className='undo-planning' disabled={!view?.canUndoPlanning||busy} onClick={undoPlanning}>Undo all actions</button>}</div>})),
 ...([1,0] as const).flatMap(owner=>['deck','discard'].map((name,i)=>({id:`pile-${owner}-${name}`,position:[-8.95+i*1.6,.1,owner?-4.8:4.8] as [number,number,number],content:<Pile owner={owner} name={name} label={name==='deck'?'Draw':'Discard'} count={view?(name==='deck'?view.players[owner].draw.length:view.players[owner].discard.length):name==='deck'?5:0}/>}))),
 {id:'crypto',position:[7.65,.12,6.85],content:<aside className='crypto-cache'><div><Icon name='crypto'/><b>CRYPTO WALLET</b></div><div className='cache-cards'>{cache.length?cache.map((card,index)=><button className={`cache-card ${cashFlight?.card.id===card.id?'paying':''}`} data-card-id={card.id} style={{'--stack-index':index} as CSSProperties} key={card.id} onClick={()=>setSelected(card)} title={`${card.name}: ${card.effect}`}><CardFace card={card} compact/><strong>{card.name}</strong><span>{`+${card.cryptoValue??Number(card.effect.match(/\+(\d+) Crypto/)?.[1]??0)}`}</span></button>):<small>No stored Crypto</small>}</div><small>{cache.length} cards · Redeemed at Draft</small></aside>},
 {id:'end-turn',position:[9.7,.2,7],content:<EndTurnControl key={view?'playing':'setup'} seconds={runtimeSeconds} onConcede={()=>act(()=>engine.current!.concedeForInactivity())} cycle={view?.cycle??0} turn={view?.turn??1} enabled={!!view&&!busy&&phase==='runtime'} busy={busy} dealing={dealing} onEnd={endTurn}/>}
 ];
 return <main className='app' data-event-id={active?.id} data-event-kind={active?.kind} data-event-stage={active?.stage} data-event-node={active?.node}>
  <header className='topline'><div className='brand'><span>0</span>UROBOROS<small>THE CIRCUIT AND THE SERPENT</small></div><div className='phase-label'>{view?`CYCLE ${String(view.cycle).padStart(2,'0')} / ${phase==='runtime'?`RUNTIME ${view.turn} OF 3`:phase.toUpperCase()}`:'THE CIRCUIT AWAITS'}</div><nav><a className='authoring-link' href='/author' target='_blank' rel='noreferrer'>Content Studio</a><button onClick={()=>setCatalogOpen(true)}>Card catalog</button><button className='practice-badge' onClick={()=>setPanel('practice')}>EVALUATION BUILD</button><button aria-pressed={fast} disabled={busy} onClick={()=>setFast(!fast)}>{fast?'Fast':'Normal'} pace</button>{view&&<button data-resource='trash' onClick={()=>setPanel('trash')}>Trash {view.trash.length}</button>}<button onClick={()=>setPanel('log')}>Log <span>{history.length}</span></button></nav></header>
  {view&&<div className='cycle-track' aria-label='Cycle progress'>{['Turn 1','Turn 2','Turn 3','Collapse','Draft'].map((label,index)=>{const step=phase==='draft'?4:phase==='collapse'?3:view.turn-1;return <span key={label} className={index===step?'current':index<step?'complete':''} aria-current={index===step?'step':undefined}><i/>{label}</span>;})}{phase==='collapse'&&active?.node!==undefined&&<b>{active.kind==='circuit'&&!circuitLanded?'CIRCUIT SELECTION':`N${active.node+1} / N5`}</b>}</div>}
  <section className={`arena ${busy?'resolving':''}`} aria-label='Three-dimensional Circuit board'>
   <BoardScene planning={phase==='runtime'} closedNodes={closedNodes} collapseNode={collapseNode} awardNode={awardNode} selectionNode={selectionNode} onReady={()=>setBoardReady(true)} openNodes={dealing?(view?.openNodes??[]).slice(0,openingNodeCount):view?.openNodes??[]} centers={[view?.players[0].centers??{primary:2000,backup:1500},view?.players[1].centers??{primary:2000,backup:1500}]} hudAnchors={hudAnchors} nodes={nodes} turn={view?.turn??1} phase={phase} priority={view?.priority??0} dragged={dragged} hoveredNode={hoveredNode} legal={legal} drop={deploy} inspect={c=>!isDragging.current&&setSelected(c)} onLocationInspect={index=>{if(view?.nodes[index].location)setLocationInspect(index);}} effect={active&&(active.kind!=='circuit'||circuitLanded)?{...active,player:active.owner,sourceCardId:active.cardId}:null} selectedNode={view?.selectedNode??null}/>
   <div className='hand-zone' data-resource='0-hand'><div className='hand-instruction'>{dealing?'Five-card deal · Crypto moves to cache':fieldHand.length?'Drag to deploy · Click to inspect':phase==='runtime'?'Your hand is empty':'The Circuit is resolving'}</div><div className='hand' style={{'--hand-overlap':`${14+Math.max(0,fieldHand.length-5)*10}px`} as CSSProperties}>{fieldHand.map((card,i)=><button key={card.id} data-card-id={card.id} className={`hand-card ${arrivals.includes(card.id)?'drawing-card':''} ${dragged?.id===card.id||flight?.card.id===card.id?'dragging':''}`} style={{'--angle':`${(i-(fieldHand.length-1)/2)*Math.min(4,20/fieldHand.length)}deg`,'--lift':`${Math.abs(i-(fieldHand.length-1)/2)*5}px`,'--index':i,'--arrival-delay':`${Math.max(0,arrivals.indexOf(card.id))*110}ms`} as CSSProperties} draggable={false} aria-label={`Inspect ${card.name}`} onDragStart={e=>e.preventDefault()} onPointerDown={e=>beginCardDrag(e,card)} onClick={()=>{if(!isDragging.current)setSelected(card);}}><HandCardFace card={card}/></button>)}</div></div>
  </section>
  {cashFlight&&<div className='cash-flight' data-cash-flight={cashFlight.card.id} style={{left:cashFlight.x,top:cashFlight.y,width:cashFlight.w,height:cashFlight.h,'--cash-x':`${cashFlight.dx}px`,'--cash-y':`${cashFlight.dy}px`,'--cash-duration':`${cashFlight.duration*.72}ms`} as CSSProperties}><Icon name='crypto'/><strong>{cashFlight.card.name}</strong><b>+{cashFlight.card.cryptoValue??Number(cashFlight.card.effect.match(/\+(\d+) Crypto/)?.[1]??0)}</b></div>}
  {flight&&<div className={`flying-card ${flight.crypto?'crypto-flight':''}`} style={{left:flight.x,top:flight.y,width:flight.w,height:flight.h,'--flight-x':`${flight.dx}px`,'--flight-y':`${flight.dy}px`,'--flight-scale':flight.scale,'--flight-angle':`${flight.angle??0}deg`} as CSSProperties}><div className='flying-face hand-card flight-face-card'><HandCardFace card={flight.card}/></div><img className='flying-back' src='/assets/card_art/card backs/cardback_02_silicone.png' alt=''/></div>}
  {active&&<EffectPath key={`path-${active.id}`} event={active.source==='circuit'&&active.owner===1?{...active,node:view?.selectedNode??undefined}:active} duration={eventTime(active,fast)}/>}
  {(active?.kind==='move'||active?.kind==='morph')&&<CardEffectMotion key={`card-effect-${active.id}`} event={active} duration={eventTime(active,fast)}/>}
  {globalEvent&&<div className={`global-event ${active.kind==='circuit'?'circuit-event':''}`} key={`global-${active.id}`}><small>{active.kind==='circuit'?'CIRCUIT REWARD':'CIRCUIT TRANSMISSION'}</small><p>{active.text}</p></div>}
  <footer className='status-bar'><span className='status-dot'/><span>{notice}</span><span className='session-policy'>Actions carry over · Control Locations to earn the Circuit</span></footer>
  {!view&&<div className='setup-backdrop'><section className='setup-card'><small>ENTER THE CIRCUIT</small><h1>Every Node.<br/><em>Every possibility.</em></h1><p>Build your deck, plan across five Locations, and compete for control of the Circuit.</p><div className='setup-note'><b>{boardReady?'Your Circuit is ready':'Preparing your table'}</b><span>Control more Locations to earn the Circuit Reward and next reveal priority. Tied counts share the reward. Unused Actions carry forward.</span></div><label className='runtime-timer-setting'>Runtime countdown <input aria-label='Runtime timer seconds' type='number' min='1' max='3600' placeholder='Seconds (optional)' value={runtimeSeconds??''} onChange={event=>setRuntimeSeconds(event.target.value?Math.min(3600,Math.max(1,Number(event.target.value))):null)}/><small>Optional. The standard turn duration is not set.</small></label><button className='primary-button' disabled={!priority||!boardReady||contentLoading} onClick={start}>{contentLoading?'Loading saved content…':'Enter evaluation build'} <span>↗</span></button>{contentError&&<p role='alert'>{contentError}</p>}<a className='setup-authoring-link' href='/author' target='_blank' rel='noreferrer'>Open Content Studio ↗</a><p className='setup-fineprint'>Actions carry over. This evaluation pack adds Location rewards and Circuit privileges. The provisional market adds economy, scoring, Duration and tactical effects. Both players purchase cards.</p></section></div>}
  {draftOpen&&view&&<DraftPanel view={view} busy={busy} now={now} seconds={seconds} acquired={acquired} cycleStart={cycleStart} history={history} inspect={setSelected} acquire={acquire} claim={claimPrivilege} end={()=>act(()=>engine.current!.endDraft())} undo={()=>act(()=>engine.current!.undoEndDraft())} next={()=>act(()=>engine.current!.nextCycle())}/>}
  {locationInspect!==null&&view?.nodes[locationInspect].location&&<div className='modal-backdrop' onClick={()=>setLocationInspect(null)}><section className='location-inspect' role='dialog' aria-modal='true' aria-label={`Inspect Location ${view.nodes[locationInspect].location!.name}`} onClick={event=>event.stopPropagation()}><button className='close' aria-label='Close Location inspect' onClick={()=>setLocationInspect(null)}>×</button><small>NODE {locationInspect+1} · LOCATION</small><h2>{view.nodes[locationInspect].location!.name}</h2><p>{view.nodes[locationInspect].location!.rule}</p><div className='location-inspect-reward'><small>LOCATION REWARD</small><p>{view.nodes[locationInspect].location!.reward}</p></div><footer>Location Rewards resolve here during Wave Collapse. The Circuit Reward is a separate Draft offering.</footer></section></div>}
  {catalogOpen&&<CardCatalog content={content} canTest={!!view&&phase==='runtime'&&!busy&&!view.canUndoPlanning} close={()=>setCatalogOpen(false)} inspect={setSelected} add={addTestCard}/>}
  {selected&&!dragged&&<div className='modal-backdrop' onClick={()=>setSelected(null)}><section className='inspect' role='dialog' aria-modal='true' aria-label={`Inspect ${selected.name}`} onClick={e=>e.stopPropagation()}><button className='close' aria-label='Close card inspect' onClick={()=>setSelected(null)}>×</button><div className='inspect-art'><CardFace card={selected} context={phase==='draft'?'draft':'runtime'}/></div><div className='inspect-copy'><small>{selected.type}</small><h2>{selected.name}</h2><div className='inspect-stats'><span>POWER <b>{selected.power??'—'}</b></span>{phase==='draft'&&<span>DRAFT COST <b>{selected.cost}</b></span>}</div><p>{selected.effect}</p>{sourceCard&&<div className='source-card-text'><small>ORIGINAL CARD EFFECTS</small><ul>{sourceCard.effects.map((text,index)=><li key={index}>{text}</li>)}</ul>{sourceCard.effects.some(text=>/draft/i.test(text))&&<p className='content-note'>Each +Draft now transfers 1 of your Power between this Location and a neighbor.</p>}</div>}<small>{selected.type==='Crypto'?'Held Crypto resolves automatically for Draft.':`Runtime deployment: ${selected.type==='Character'?'1 Action':'0 Actions'}.`}</small>{selected.type==='VP'&&<p className='content-note'>{selected.vp??2} scoring VP while owned in an active zone.</p>}{selected.duration&&<p className='content-note'>Duration {selected.duration===99?'∞':selected.duration}. {selected.durationPeriod==='runtime'?'Measured in Runtime turns; scheduled effects follow the card text.':'The deployment Cycle counts as the first Cycle.'}</p>}{!busy&&phase==='runtime'&&local?.hand.some(c=>c.id===selected.id)&&selected.type!=='Crypto'&&<div className='inspect-deploy'><span>Deploy to Node</span>{[0,1,2,3,4].map(n=><button key={n} disabled={!!legal(n,selected)} title={legal(n,selected)??`Deploy to Node ${n+1}`} onClick={()=>deploy(n,selected)}>{n+1}</button>)}</div>}</div></section></div>}
  {panel&&<div className='panel-backdrop' onClick={()=>setPanel(null)}><aside className='side-panel' onClick={e=>e.stopPropagation()}><button className='close' aria-label='Close panel' onClick={()=>setPanel(null)}>×</button><small>0UROBOROS / {panel==='log'?'HISTORY':panel==='trash'?'SHARED ZONE':'EVALUATION SCOPE'}</small><h2>{panel==='log'?'Circuit log':panel==='trash'?'Shared Trash':'Evaluation build'}</h2>{panel==='log'?<ol>{history.length?history.map(e=><li key={e.id} data-event-kind={e.kind} data-owner={e.owner} data-card-id={e.cardId} data-event-id={e.id}><small>{e.node!==undefined?`NODE ${e.node+1}`:e.kind.toUpperCase()}</small>{e.text}</li>):<p>Your first deployment starts the record.</p>}</ol>:panel==='trash'?<><p>Cards here are unowned. Recovery effects can acquire them; they do not contribute to either player's VP.</p><div className='trash-list'>{view?.trash.map(card=><button key={card.id} onClick={()=>{setPanel(null);setSelected(card);}}><b>{card.name}</b><small>{card.effect}</small></button>)}</div>{!view?.trash.length&&<p>No cards have entered Trash.</p>}</>:<><p>This session uses a ten-card starter deck, real draw and discard zones, and alternating reveals. Win more Locations to earn the Circuit Reward; equal win counts reward both players.</p><p>Five approved evaluation Locations and three Circuit privileges are enabled. The market includes four core Base piles, two rotating Base offers, three VP piles, three Crypto piles and three rotating Chaos offers. New definitions are provisional evaluation content.</p><p>Unused Actions carry forward. Controlling more Locations earns next reveal priority; ties retain priority.</p><p>The local opponent deploys and purchases using its own cards, Wallet and public board information. Both players compete for shared supply. This is a local evaluation, not online multiplayer.</p></>}</aside></div>}
  {view?.choice&&view.choice.owner===0&&!busy&&<EffectChoice choice={view.choice} choose={choose}/>}
  {phase==='gameover'&&!busy&&<div className='modal-backdrop'><section className='purchase-confirm'><small>CIRCUIT COMPLETE</small><h2>Session ended</h2><p>{view?.endedReason}</p><button className='primary-button' onClick={()=>{engine.current=null;setView(null);setHistory([]);setActive(null);}}>New evaluation session</button></section></div>}
 </main>;
}
function HandCardFace({card}:{card:Card}){return <CardFace card={card}/>;}
function Resources({owner,actions,crypto,pending,vp}:{owner:number;actions:number;crypto:number;pending:number;vp:number}){return <div className='resources'>{[{key:'actions',icon:'actions',value:actions+pending,label:'Actions'},{key:'wallet',icon:'crypto',value:crypto,label:'Crypto'},{key:'vp',icon:'volume',value:vp,label:'VP'}].map(stat=><span className={`stat-${stat.key}`} data-resource={`${owner}-${stat.key}`} key={stat.key}><span className='stat-pair'><Icon name={stat.icon}/><b key={stat.value}>{stat.value}</b></span><small>{stat.label}</small></span>)}</div>;}
function DataCenter({owner,target,value,active,duration}:{owner:number;target:'primary'|'backup';value:number;active:RuntimeEvent|null;duration:number}){const max=target==='primary'?2000:1500;return <div data-dc={`${owner}-${target}`} style={{'--dc-duration':`${duration}ms`} as CSSProperties} className={`data-center ${owner===1?'far':'near'} ${active?`dc-${active.kind}`:''} ${value===0?'destroyed':''}`}><div className='dc-readout'><small><Icon name='database'/>{target.toUpperCase()}</small><div><b>{value.toLocaleString()}</b><span>/ {max.toLocaleString()}</span></div></div><i role='progressbar' aria-label={`${target} integrity`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><em style={{width:`${value/max*100}%`}}/></i>{active&&<span className='dc-delta'>{active.kind==='drain'?'−':'+'}{active.amount}</span>}</div>;}
function Duration({owner,cycle,entries,activeCard,inspect}:{owner:0|1;cycle:number;entries:SessionView['players'][0]['bank'];activeCard?:string;inspect:(card:Card)=>void}){
 return <aside className={`duration live-bank ${owner===1?'far':'near'}`} data-owner={owner} data-bank-count={entries.length}>
  <small>{owner===1?'OPPONENT':'YOUR'} EFFECT BANK</small>
  <div>{Array.from({length:4},(_,index)=>{
   const entry=entries[index];
   if(!entry)return <i className='bank-slot' key={index}/>;
   const remaining=entry.remainingTurns??(entry.expiresCycle===undefined?null:Math.max(0,entry.expiresCycle-cycle+1));
   const label=remaining===null?'permanent':`${remaining} ${entry.remainingTurns!==undefined?'turns':'Cycles'} left`;
   return <button key={entry.card.id} data-card-id={entry.card.id} className={`bank-slot ${activeCard===entry.card.id?'active-source':''}`} aria-label={`Inspect ${entry.card.name}, ${label}`} onClick={()=>inspect(entry.card)}><CardFace card={entry.card} compact remainingDuration={remaining??99}/></button>;
  })}</div>
  <span>{entries.length}/4 active · Oldest resolves first</span>
 </aside>;
}
function Pile({owner,name,label,count}:{owner:0|1;name:string;label:string;count:number}){return <div className={`pile pile-${name}`} data-resource={`${owner}-${name}`}><Icon name={name}/><b>{count}</b><small>{label}</small></div>;}
