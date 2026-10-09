import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SERVER_X, serverZ } from './boardLayout';
import { BOARD_DROP, BoardScene, BOARD_SCAN_MS, boardScanTotalMs, FAR_BANK_LIFT, Icon, NEAR_BANK_DROP, NEAR_BANK_FORMER_DROP, type BoardNode } from './BoardScene';
import { LocationText } from './LocationText';
import type { BoardScanTone } from './NeonHorizonScan';
import { SINGULARITY_MS } from './Singularity';
import { boardBackgroundLabel, loadBackgroundChoice, saveBackgroundChoice, stepBackground, type BackgroundChoice } from './boardBackgrounds';
import { floorLighting, loadRealLightingStore, saveRealLightingStore, updateFloorLighting, type RealLightingAction } from './realLighting';
import { LANE_PATTERNS, loadLanePatterns, saveLanePatterns, type LanePattern } from './lanePatterns';
import { BoardStylePicker, loadBoardStyle, saveBoardStyle, type BoardStyle } from './boardStyles';
import { SERVER_STYLES, loadServerStyles, saveServerStyles, type ServerStyle } from './serverStyles';
import { NEON_SURFACES, loadNeonSurface, saveNeonSurface, type NeonSurface } from './neonSurfaces';
import { PLAYER_COLOR_IDS, colorChoiceLabel, colorTaken, loadColorTheme, playerColor, playerColorVars, resolveColorTheme, saveColorTheme, withPlayerColor, type ColorTheme, type PlayerColor } from './playerTheme';
import { withPlayer, type PerPlayer } from './playerSettings';
import { CARD_BACKS, cardBackSrc, loadCardBacks, saveCardBacks, type CardBackId } from './cardBacks';
import { canDeploy, isCharacterCard, type Card, type CardModifier } from '@0uroboros/engine/game';
import { describeMod } from '@0uroboros/engine/effects/catalog';
import { builtinMod } from '@0uroboros/engine/builtinMods';
import { createSession, type RuntimeEvent, type SessionView } from '@0uroboros/engine/runtime';
import { LocalClient, attempt, type GameClient } from './net/GameClient';
import { OnlineClient, savedSeat, type LobbyState, type SavedSeat } from './net/OnlineClient';
import { OnlineLobby } from './net/OnlineLobby';
import type { RoomMode } from '@0uroboros/protocol/messages';
import { EffectPath, CardEffectMotion } from './Effects';
import { EffectChoice, EventMessage, TransferBadge, choiceNodes } from './EffectChoice';
import { useTransferDrag } from './transferDrag';
import { ZoneButtons, ZoneDrawer, type Zone } from './ZoneDrawer';
import { DraftPanel } from './DraftPanel';
import { GameSummary } from './GameSummary';
import { LogDrawer } from './LogDrawer';
import { CardCatalog } from './CardCatalog';
import { CardFace } from './CardFace';
import { cardInspectVideo } from './cardVideos';
import { cardsInPlay, warmCardMedia } from './cardPreload';
import './card-surfaces.css';
import { HISTORIC_SOURCE_METADATA } from '@0uroboros/engine/evaluationMarket';
import { EndTurnControl } from './EndTurnControl';
import { eventTime, isNoTargetEvent } from './presentation';
import { useCardPointerDrag, type CardOrigin } from './useCardPointerDrag';
import { springRelease } from './cardSpring';
import { bundledContent } from './contentPack/contentStore';
import { compileForDeck, loadGameContent, loadGameSource, type GameContentSource } from './contentPack/loadGameContent';
import { GameConfigure } from './GameConfigure';
import { loadGameSetup, saveGameSetup, type GameSetup } from './gameSetup';
import { STUDIO_TOOLS } from './studioTools';
// Studio-only: the agents window and dev game log drop out of `build:client` with the flag.
const SetupAgentsWindow = STUDIO_TOOLS ? lazy(() => import('./SetupAgentsWindow').then(m => ({ default: m.SetupAgentsWindow }))) : null;
const devGameLog = STUDIO_TOOLS ? import('./devGameLog') : null;
import './setup-screen.css';
import { BoardLightSliders, BoardTuningPanel } from './boardTuning';
import { handOverlap, useHandSpan } from './handFan';
import { DEFAULT_OPPONENT, isOpponent, loadStrategist, opponentName, reportCycle, reportGame, type OpponentId } from './ai/strategistClient';
import { versionLabel } from '@0uroboros/engine/ai/strategy';
const blankNodes:BoardNode[]=Array.from({length:5},(_,i)=>({cards:[[],[]],powers:[0,0],weight:[30,25,20,15,10][i],title:'Location pending',text:'Approved content required'}));
/** Centre of the authored `*_duration_*` bay row on the table outrigger; the effect bank docks onto it. */
const BANK_BAY_X=-8.07, BANK_BAY_Z=5.90;
/** Middle of the frame's left wing, between the table's outer edge and the deck, level with its side notch. */
const ZONE_BUTTONS_POSITION:[number,number,number]=[-8.6,.04,0];

export function App(){
 /** The table the UI drives: a local session or the online seat. */
 const client=useRef<GameClient|null>(null);
 const online=useRef<OnlineClient|null>(null);
 const [lobby,setLobby]=useState<LobbyState|null>(null);
 const [savedOnlineSeat]=useState<SavedSeat|null>(savedSeat);
 const [opponentAway,setOpponentAway]=useState(false);
 /** The opponent agent's notes for this session are filed under this id; null once the debrief is sent. */
 const strategistGame=useRef<string|null>(null);
 /** Which agent plays this session's opponent; it receives the session's notes and debrief. */
 const strategistAgent=useRef<OpponentId>(DEFAULT_OPPONENT);
 const logGame=useRef<string|null>(null);
 /** False when the opponent agent is switched off: the finished game is still reported for observers, per-Cycle notes are not. */
 const strategistActive=useRef(false);
 const [content,setContent]=useState(bundledContent);
 const [contentLoading,setContentLoading]=useState(false);
 const [contentError,setContentError]=useState('');
 const [deckSource,setDeckSource]=useState<GameContentSource|null>(null);
 const [deckChoice,setDeckChoice]=useState(()=>localStorage.getItem(DECK_KEY));
 const startingDeck=deckSource?deckSource.decks.find(deck=>deck.id===deckChoice&&deck.playable)??deckSource.decks.find(deck=>deck.id===deckSource.defaultDeckId):undefined;
 const [opponent,setOpponent]=useState<OpponentId>(()=>{const saved=localStorage.getItem(OPPONENT_KEY);return isOpponent(saved)?saved:DEFAULT_OPPONENT;});
 const chooseOpponent=(id:OpponentId)=>{setOpponent(id);localStorage.setItem(OPPONENT_KEY,id);};
 const chooseDeck=(id:string)=>{setDeckChoice(id);localStorage.setItem(DECK_KEY,id);if(deckSource)setContent(compileForDeck(deckSource.document,id));};
 const [view,setView]=useState<SessionView|null>(null);
 const [setup,setSetup]=useState<GameSetup>(loadGameSetup);
 const changeSetup=(next:GameSetup)=>{setSetup(next);saveGameSetup(next);};
 const runtimeSeconds=setup.turnSeconds;
 const [boardReady,setBoardReady]=useState(false);
 const [priority]=useState<'higher'|'lower'>('higher');
 const [active,setActive]=useState<RuntimeEvent|null>(null);
 const [busy,setBusy]=useState(false);
 const resolvingRef=useRef(false);
 const [flight,setFlight]=useState<{card:Card;x:number;y:number;w:number;h:number;dx:number;dy:number;scale:number;crypto?:boolean;angle?:number;release?:CardOrigin['release']}|null>(null);
 const flightRef=useRef<HTMLDivElement>(null);
 // A dropped card springs into its slot carrying its drop momentum and lean; without a release the CSS flight runs.
 useLayoutEffect(()=>{
  const element=flightRef.current,release=flight?.release;
  if(!element||!flight||!release)return;
  const {dx,dy,scale,angle=0}=flight;
  return springRelease(release,{x:0,y:0},{x:dx,y:dy},({x,y,progress,tilt})=>{
   element.style.transform=`translate(${x}px,${y}px) perspective(${release.perspective}px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) rotate(${(angle*(1-progress)+tilt.rz).toFixed(2)}deg) scale(${1+(scale-1)*progress})`;
  },()=>undefined,FLIGHT_MS);
 },[flight]);
 const [fast,setFast]=useState(true); const fastRef=useRef(false);fastRef.current=fast;
 const [selected,setSelected]=useState<Card|null>(null);
 const [catalogOpen,setCatalogOpen]=useState(false);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [settingsTab,setSettingsTab]=useState<SettingsTab>('players');
 const [playerTab,setPlayerTab]=useState<0|1>(0);
 const [lanePatterns,setLanePatterns]=useState<PerPlayer<LanePattern>>(loadLanePatterns);
 const [serverStyles,setServerStyles]=useState<PerPlayer<ServerStyle>>(loadServerStyles);
 const [cardBacks,setCardBacks]=useState<PerPlayer<CardBackId>>(loadCardBacks);
 const [boardStyle,setBoardStyle]=useState<BoardStyle>(loadBoardStyle);
 const [neonSurface,setNeonSurface]=useState<NeonSurface>(loadNeonSurface);
 const [locationInspect,setLocationInspect]=useState<number|null>(null);
 const [arrivals,setArrivals]=useState<string[]>([]);
 const [bankArrivals,setBankArrivals]=useState<string[]>([]);
 const [opponentDraw,setOpponentDraw]=useState(0);
 const [cashed,setCashed]=useState<string[]>([]);
 const [cashFlight,setCashFlight]=useState<{card:Card;x:number;y:number;w:number;h:number;dx:number;dy:number;duration:number}|null>(null);
 const [boardScan,setBoardScan]=useState(false);
 const [boardScanTone,setBoardScanTone]=useState<BoardScanTone>('open');
 /** Session-end beat: cyan sweep, then the singularity, then the result card. */
 const [collapsing,setCollapsing]=useState(false);
 const [ended,setEnded]=useState(false);
 const [tallied,setTallied]=useState(false);
 const markTallied=useCallback(()=>setTallied(true),[]);
 const [backgroundChoice,setBackgroundChoice]=useState<BackgroundChoice>(loadBackgroundChoice);
 const [lightingStore,setLightingStore]=useState(loadRealLightingStore);
 const lightingMode=backgroundChoice.mode, floorBackground=backgroundChoice.background[lightingMode];
 const realLighting=useMemo(()=>floorLighting(lightingStore,floorBackground),[lightingStore,floorBackground]);
 const changeLighting=(action:RealLightingAction)=>setLightingStore(store=>updateFloorLighting(store,floorBackground,action));
 const [colorTheme,setColorTheme]=useState<ColorTheme>(loadColorTheme);
 const [videoSound,setVideoSound]=useState(false);
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
 const [panel,setPanel]=useState<'log'|'practice'|null>(null);
 const [drawer,setDrawer]=useState<Zone|null>(null);
 const [cycleStart,setCycleStart]=useState<{vp:number;integrity:number}|null>(null);
 const [acquired,setAcquired]=useState<Record<string,{at:number;count:number}>>({});
 const [now,setNow]=useState(Date.now());
 const timers=useRef<number[]>([]);
 const handZone=useRef<HTMLDivElement>(null);
 const handSpan=useHandSpan(handZone);
 const isDragging=useRef(false);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),500);return()=>{clearInterval(timer);timers.current.forEach(clearTimeout);};},[]);
 useEffect(()=>{const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelected(null);setCatalogOpen(false);setLocationInspect(null);setPanel(null);setDrawer(null);setSettingsOpen(false);}};window.addEventListener('keydown',esc);return()=>window.removeEventListener('keydown',esc);},[]);
 useEffect(()=>{let cancelled=false;loadGameSource().then(source=>{if(cancelled)return;setDeckSource(source);setContent(compileForDeck(source.document,localStorage.getItem(DECK_KEY)??undefined));}).catch(error=>{if(!cancelled)setContentError(error instanceof Error?error.message:'Content unavailable.');});return()=>{cancelled=true;};},[]);
 useEffect(()=>{if(view)warmCardMedia(cardsInPlay([view,client.current?.deckList()],content.cards));},[view,content]);
 function later(callback:()=>void,time:number){const id=window.setTimeout(()=>{timers.current=timers.current.filter(timer=>timer!==id);callback();},time);timers.current.push(id);}
 function record(event:RuntimeEvent){if(devGameLog){const id=logGame.current,session=client.current instanceof LocalClient?client.current.session:null;void devGameLog.then(m=>m.logGameEvent(id,session,event));}setHistory(h=>[...h,event].slice(-6000));}
 /** Online, the other seat's planning placements and commits show in the Log and on the board without a presentation beat. */
 const quiet=(event:RuntimeEvent)=>client.current?.mode==='online'&&event.owner===1&&event.phase==='runtime'&&(event.kind==='deploy'||event.kind==='turn');
 /** Starts presenting events the client holds, unless a presentation or a drag is already under way. */
 function kick(){if(client.current?.pendingCount&&!resolvingRef.current&&!isDragging.current){resolvingRef.current=true;setBusy(true);pump();}}
 function pump(){
  let before=client.current?.view()??undefined;
  let next=client.current?.step();
  while(next&&next.event.kind!=='cycle'&&(quiet(next.event)||eventTime(next.event,fastRef.current)===0)){record(next.event);setView(next.view);before=client.current?.view()??undefined;next=client.current?.step();}
  if(next?.event.kind==='cycle'){record(next.event);setNotice(next.event.text);setView(next.view);showOpening(next.view);return;}
  if(!next){resolvingRef.current=false;isDragging.current=false;setBusy(false);setActive(null);if(client.current?.view()){const snapshot=client.current.view()!;setView(snapshot);if(snapshot.phase==='draft')setNotice(`Draft ready · ${snapshot.players[0].wallet} Crypto to spend${snapshot.circuitEligible.includes(0)?' · Your free Circuit privilege is available.':'.'}`);if(snapshot.phase==='runtime')setNotice(`Turn ${snapshot.turn} · ${snapshot.players[0].actions} Actions available · ${snapshot.priority===0?'You reveal first':'Opponent reveals first'}.`);}return;}
  presentResolved(before,next);
 }
 function presentResolved(before:SessionView|undefined,resolved:{event:RuntimeEvent;view:SessionView}){
  setActive(resolved.event);record(resolved.event);
  if(isNoTargetEvent(resolved.event))setNotice('No target');
  const duration=eventTime(resolved.event,fastRef.current);
  const event=resolved.event;
  if(event.kind==='collapse'&&event.text.startsWith('Wave Collapse')){
   setBoardScanTone('close');setBoardScan(true);
   later(()=>setBoardScan(false),duration);
  }
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

  // Cards entering an Effect Bank slide into their slots; the queue waits for the entry and its slot light.
  const banked=before?newlyBanked(before,resolved.view):[[],[]];
  const bankHold=bankEntryMs(Math.max(...banked.map(ids=>ids.length)));
  if(bankHold){setBankArrivals(banked.flat());later(()=>setBankArrivals([]),bankHold);}
  // The authoritative result is held offscreen until the visual contact beat.
  const contact=resolved.event.target||resolved.event.targetNode!==undefined||resolved.event.targetCardId!==undefined||['move','probability','trash'].includes(resolved.event.kind) ? .60 :resolved.event.kind==='reveal'?.44:resolved.event.kind==='circuit'?.86:0;
  if(contact)later(()=>setView(resolved.view),duration*contact);else setView(resolved.view);
  later(pump,Math.max(duration,bankHold));
 }
 function showOpening(snapshot:SessionView){
  setLocationInspect(null);setOpeningNodeCount(0);
  const scanMs=fastRef.current?BOARD_SCAN_MS.fast:BOARD_SCAN_MS.normal;
  const scanTotal=boardScanTotalMs(fastRef.current);
  setBoardScanTone('open');setBoardScan(true);
  later(()=>setBoardScan(false),scanTotal);
  // Open nodes only after the board scan finishes (scan + staggered reveals).
  [scanTotal+100,scanTotal+900,scanTotal+1700].forEach((delay,index)=>later(()=>setOpeningNodeCount(index+1),delay));
  setCycleStart({vp:snapshot.players[0].totalVP,integrity:snapshot.players[0].servers.primary+snapshot.players[0].servers.backup});setAcquired({});
  const crypto=snapshot.players[0].hand.filter(card=>card.type==='Crypto');
  setOpeningCrypto(crypto.map(card=>card.id));setDealing(true);setBusy(true);resolvingRef.current=true;
  setNotice(`${snapshot.players[0].hand.length} cards drawn. Crypto will move to your cache.`);
  setArrivals(snapshot.players[0].hand.map(card=>card.id));later(()=>setArrivals([]),1100);
  setCashed([]);setClosedNodes([]);setCollapseNode(null);setAwardNode(null);setSelectionNode(null);
  later(()=>transferCrypto(crypto,0,()=>{setDealing(false);if(client.current?.pendingCount){pump();return;}setBusy(false);resolvingRef.current=false;setNotice(`${snapshot.players[0].hand.length} cards dealt · ${snapshot.players[0].hand.length-crypto.length} in hand · ${crypto.length} in Crypto wallet.`);}),scanTotal+2100);
 }
 function transferCrypto(cards:Card[],index:number,done:()=>void){
  const card=cards[index];if(!card){done();return;}
  const source=document.querySelector(`.hand-card[data-card-id="${CSS.escape(card.id)}"]`),target=document.querySelector('.cache-cards');
  if(source&&target){const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();setFlight({card,x:a.x,y:a.y,w:a.width,h:a.height,dx:b.x+b.width/2-a.x-a.width/2,dy:b.y+b.height/2-a.y-a.height/2,scale:67/a.width,crypto:true});}
  later(()=>{setOpeningCrypto(ids=>ids.filter(id=>id!==card.id));setFlight(null);later(()=>transferCrypto(cards,index+1,done),160);},500);
 }
 async function start(){if(!priority||!boardReady||contentLoading)return;setContentLoading(true);setContentError('');try{const [snapshot,brief]=await Promise.all([loadGameContent(startingDeck?.id),loadStrategist(opponent)]);setContent(snapshot);const session=createSession({carryover:true,priorityPreference:priority,random:Math.random,serverVP:setup.serverVP,strategicMarket:true,evaluationContent:true,content:snapshot,strategy:brief?.profile,strategyExperiment:brief?.experiment?.id??null,recordDecisions:brief?.recordDecisions??true});client.current=new LocalClient(session);logGame.current=`game-${new Date().toISOString().replace(/[:.]/g,'-')}`;strategistGame.current=brief?`game-${Date.now().toString(36)}`:null;strategistAgent.current=opponent;strategistActive.current=!!brief&&!brief.disabled;if(brief&&!brief.disabled)record({id:-Date.now(),kind:'cycle',text:`${opponentName(opponent)} ${versionLabel(brief.version)} plan: ${brief.plan}`});setView(session.view());showOpening(session.view());}catch(error){setContentError(error instanceof Error?error.message:'Content unavailable.');}finally{setContentLoading(false);}}
 /** Runs one command on either client; the continuation is immediate for a local table and follows the ack online. */
 function act(action:()=>RuntimeEvent|void|null|Promise<RuntimeEvent|void|null>,after?:()=>void,failed?:()=>void){
  attempt(action,event=>{if(event){record(event);setNotice(isNoTargetEvent(event)?'No target':event.text);}const snapshot=client.current?.view();if(snapshot){setView(snapshot);if(event?.kind==='cycle')showOpening(snapshot);}after?.();kick();},error=>{setNotice(error instanceof Error?error.message:'Action unavailable.');failed?.();kick();});
 }
 function acquire(pileId:string){
  if(!client.current||busy)return;
  attempt(()=>client.current!.buy(pileId),event=>{record(event);setNotice(event.text);setView(client.current!.view()!);setAcquired(previous=>({...previous,[pileId]:{at:Date.now(),count:(previous[pileId]?.count??0)+1}}));kick();},error=>{setNotice(error instanceof Error?error.message:'Acquisition unavailable.');kick();});
 }
 function claimPrivilege(){
  if(!client.current||resolvingRef.current)return;
  resolvingRef.current=true;
  attempt(()=>client.current!.claimCircuitReward(),event=>{const next=client.current!.view()!;setBusy(true);setActive(event);record(event);setNotice(isNoTargetEvent(event)?'No target':event.text);const duration=eventTime(event,fastRef.current);later(()=>setView(next),duration*.6);later(()=>{if(client.current?.pendingCount)pump();else{setActive(null);setBusy(false);resolvingRef.current=false;}},duration);},error=>{resolvingRef.current=false;setNotice(error instanceof Error?error.message:'Privilege unavailable.');});
 }
 function choose(selection:string|string[]){
  if(!client.current||resolvingRef.current)return;
  const before=client.current.view()!;resolvingRef.current=true;
  attempt(()=>client.current!.choose(selection),event=>{setNotice(isNoTargetEvent(event)?'No target':event.text);setBusy(true);presentResolved(before,{event,view:client.current!.view()!});},error=>{resolvingRef.current=false;setNotice(error instanceof Error?error.message:'Choice unavailable.');});
 }
 function endTurn(){
  if(!client.current||resolvingRef.current)return;
  resolvingRef.current=true;setSelected(null);
  act(()=>client.current!.endTurn(),()=>{if(client.current?.pendingCount){setBusy(true);later(pump,400);}else resolvingRef.current=false;},()=>{resolvingRef.current=false;});
 }
 function undoPlanning(){
  if(!client.current||busy||resolvingRef.current)return;
  setSelected(null);setDragged(null);setHoveredNode(null);
  act(()=>client.current!.undoAllPlanning());
 }
 function addTestCard(id:string,owner:0|1){
  if(!client.current?.addEvaluationCard||busy||resolvingRef.current)return false;
  try{
   const before=client.current.view()!;
   const event=client.current.addEvaluationCard(id,owner);
   resolvingRef.current=true;setBusy(true);
   presentResolved(before,{event,view:client.current.view()!});
   return true;
  }catch(error){setNotice(error instanceof Error?error.message:'Test card unavailable.');return false;}
 }
 /** The online seat: one client for the lobby and the game, subscribed for pushed events, snapshots and presence. */
 function onlineClient(){
  if(online.current)return online.current;
  const next=new OnlineClient();
  online.current=next;
  next.onLobby(setLobby);
  next.subscribe(change=>{
   if(change.kind==='pending'){kick();return;}
   if(change.kind==='snapshot'){
    const snapshot=next.view()!;const opening=!client.current&&snapshot.cycle===1&&snapshot.turn===1&&snapshot.phase==='runtime';
    client.current=next;logGame.current=null;strategistGame.current=null;setHistory(change.log);setView(snapshot);setOpponentAway(false);
    if(opening)showOpening(snapshot);else{setCycleStart({vp:snapshot.players[0].totalVP,integrity:snapshot.players[0].servers.primary+snapshot.players[0].servers.backup});setNotice('Back at the table.');kick();}
    return;
   }
   if(change.kind==='presence'&&change.seat===1){setOpponentAway(!change.connected);setNotice(change.connected?`${next.seatNames?.[1]??'Opponent'} is back.`:`${next.seatNames?.[1]??'Opponent'} disconnected · waiting up to 20 s.`);return;}
   if(change.kind==='connection'){if(change.state==='reconnecting')setNotice('Connection lost · reconnecting…');return;}
   if(change.kind==='error'){setNotice(change.message);return;}
  });
  return next;
 }
 const createOnline=(mode:RoomMode,name:string)=>{void onlineClient().createRoom(mode,name,{turnSeconds:setup.turnSeconds??0}).catch(()=>undefined);};
 const joinOnline=(code:string,name:string)=>{void onlineClient().joinRoom(code,name).catch(()=>undefined);};
 const resumeOnline=(saved:SavedSeat)=>{void onlineClient().resume(saved).catch(()=>undefined);};
 function leaveTable(){
  if(client.current?.mode==='online'||lobby?.status==='waiting')online.current?.leave();
  client.current?.close();client.current=null;setOpponentAway(false);
 }
 function legal(node:number,card=dragged){if(!view||!card)return 'Select a card.';if(busy||view.phase!=='runtime')return 'Wait for Runtime.';return canDeploy(card,view.players[0].actions,view.turn,node,view.nodes[node].cards[0].length,view.openNodes);}
 function relocateLegal(node:number,card=dragged){
  if(!view||!card)return 'Select a card.';
  if(busy||view.phase!=='runtime')return 'Wait for Runtime.';
  if(!view.movableCardIds.includes(card.id))return 'This card cannot move now.';
  const current=view.nodes.findIndex(entry=>entry.cards[0].some(placement=>!('hidden'in placement.card)&&placement.card.id===card.id));
  if(current<0)return 'Card is not on the board.';
  if(current===node)return 'Choose a different Node.';
  if(!view.openNodes.includes(node))return 'That Node is sealed.';
  if(view.nodes[node].cards[0].length>=4)return 'That Node is full.';
  return null;
 }
 function deploy(node:number,card=dragged,origin?:CardOrigin){
  if(!card||!client.current||resolvingRef.current)return;
  const reason=legal(node,card);if(reason){setNotice(reason);setDragged(null);return;}
  const source=document.querySelector(`[data-card-id="${CSS.escape(card.id)}"]`),target=document.querySelector(`[data-node-drop="${node}"]`);
  setDragged(null);setSelected(null);
  if((!source&&!origin)||!target){act(()=>client.current!.deploy(card.id,node));return;}
  const a=origin??source!.getBoundingClientRect(),b=target.getBoundingClientRect(),slot=view!.nodes[node].cards[0].length,scale=b.width/124;
  const x=b.x+b.width/2+(slot%2?27:-27)*scale,y=b.y+b.height/2+(slot<2?-27.5:27.5)*scale;
  resolvingRef.current=true;isDragging.current=true;setBusy(true);
  setFlight({card,x:a.x,y:a.y,w:a.width,h:a.height,dx:x-a.x-a.width/2,dy:y-a.y-a.height/2,scale:46*scale/a.width,angle:origin?.angle??0,release:origin?.release});
  const land=()=>{setFlight(null);setBusy(false);resolvingRef.current=false;isDragging.current=false;};
  later(()=>act(()=>client.current!.deploy(card.id,node),land,land),FLIGHT_MS);
 }
 function relocate(node:number,card=dragged,origin?:CardOrigin){
  if(!card||!client.current||resolvingRef.current)return;
  const reason=relocateLegal(node,card);if(reason){setNotice(reason);setDragged(null);return;}
  setDragged(null);setSelected(null);
  attempt(()=>client.current!.relocateCard(card.id,node),event=>{record(event);setView(client.current!.view()!);setNotice(event.text);if(origin)glideRelocated(node,card,origin);},error=>setNotice(error instanceof Error?error.message:'That card cannot move.'));
 }
 /** The board commits through its own renderer, so wait for the card to mount in its new Node, then glide it in from the drop point. */
 function glideRelocated(node:number,card:Card,origin:CardOrigin){
  // It is already face up, so skip the reveal flip.
  const glide=(frames:number)=>requestAnimationFrame(()=>{
   const landed=document.querySelector<HTMLElement>(`[data-node-drop="${node}"] .field-card[data-card-id="${CSS.escape(card.id)}"]`);
   landed?.getAnimations().forEach(animation=>{if((animation as CSSAnimation).animationName==='card-reveal')animation.finish();});
   const rect=landed?.getBoundingClientRect();
   if(!landed||!rect?.width||!landed.offsetWidth){if(frames>0)glide(frames-1);return;}
   const k=rect.width/landed.offsetWidth;
   const dx=(origin.x+origin.width/2-rect.x-rect.width/2)/k,dy=(origin.y+origin.height/2-rect.y-rect.height/2)/k;
   const release=origin.release;
   if(!release){landed.animate([{translate:`${dx}px ${dy}px`,zIndex:20},{translate:'0 0',zIndex:20}],{duration:1});return;}
   // Spring from the drop point in the board's own (scaled) units, swinging in the plane as it settles.
   landed.style.zIndex='20';
   springRelease({...release,velocity:{x:release.velocity.x/k,y:release.velocity.y/k}},{x:dx,y:dy},{x:0,y:0},({x,y,tilt})=>{
    landed.style.translate=`${x}px ${y}px`;landed.style.rotate=`${tilt.rz.toFixed(2)}deg`;
   },()=>{landed.style.removeProperty('translate');landed.style.removeProperty('rotate');landed.style.removeProperty('z-index');});
  });
  glide(20);
 }
 const beginCardDrag=useCardPointerDrag({
  enabled:!!view&&view.phase==='runtime'&&!busy,
  onStart:card=>{isDragging.current=true;setSelected(null);setDragged(card);},
  onHover:setHoveredNode,
  onEnd:()=>{setDragged(null);setHoveredNode(null);later(()=>{if(!resolvingRef.current){isDragging.current=false;kick();}},80);},
  onDrop:(node,card,origin)=>deploy(node,card,origin),
  canDrop:(node,card)=>!legal(node,card),
 });
 const beginFieldDrag=useCardPointerDrag({
  enabled:!!view&&view.phase==='runtime'&&!busy,
  onStart:card=>{isDragging.current=true;setSelected(null);setDragged(card);},
  onHover:setHoveredNode,
  onEnd:()=>{setDragged(null);setHoveredNode(null);later(()=>{if(!resolvingRef.current){isDragging.current=false;kick();}},80);},
  onDrop:(node,card,origin)=>relocate(node,card,origin),
  canDrop:(node,card)=>!relocateLegal(node,card),
 });
 const movable=new Set(view?.movableCardIds??[]);
 const nodes:BoardNode[]=view?view.nodes.map((n,i)=>({cards:n.cards.map((cards,side)=>cards.map(p=>({id:p.card.id,card:'hidden'in p.card?undefined:p.card,revealed:p.revealed,planned:view.planningCardIds.includes(p.card.id),movable:side===0&&!('hidden'in p.card)&&movable.has(p.card.id)}))) as BoardNode['cards'],powers:n.powers,weight:view.weights[i],title:n.location?.name??'Location pending',text:n.location?.rule??'No approved Location content',reward:n.location?.reward})):blankNodes;
 const local=view?.players[0]; const fieldHand=local?.hand.filter(c=>c.type!=='Crypto'||openingCrypto.includes(c.id))??[]; const cache=local?.hand.filter(c=>c.type==='Crypto'&&!openingCrypto.includes(c.id)&&!cashed.includes(c.id))??[];
 const cacheValue=cache.reduce((sum,card)=>sum+cryptoPayout(card),0);
 const phase=view?.phase??'setup';
 // Session end plays as one beat: a cyan sweep across the board, the singularity swallowing
 // it, and only then the result card. Showing the modal immediately would cover the collapse.
 const runEndSequence=useCallback(()=>{
  const scanTotal=boardScanTotalMs(fastRef.current);
  setBoardScanTone('end');setBoardScan(true);
  // The sweep is given room to clear before the hole opens, so the two beats read separately.
  const collapseAt=scanTotal+450;
  const ids=[
   window.setTimeout(()=>setBoardScan(false),scanTotal),
   window.setTimeout(()=>setCollapsing(true),collapseAt),
   window.setTimeout(()=>setEnded(true),collapseAt+SINGULARITY_MS.open+SINGULARITY_MS.hold),
  ];
  return()=>ids.forEach(clearTimeout);
 },[]);
 useEffect(()=>{
  if(phase!=='gameover'){setCollapsing(false);setEnded(false);setTallied(false);return;}
  return runEndSequence();
 },[phase,runEndSequence]);
 // The opponent agent takes notes after every Draft and debriefs once the session ends.
 useEffect(()=>{
  const id=strategistGame.current;
  const report=client.current?.matchReport();
  if(!id||!report||!view)return;
  if(view.phase==='gameover'){strategistGame.current=null;void reportGame(id,report,strategistAgent.current);return;}
  if(view.cycle>1&&strategistActive.current)reportCycle(id,report,strategistAgent.current);
 },[view?.cycle,view?.phase==='gameover']);
 // Lookdev handle: `__endSession()` plays the closing beat without finishing a session.
 useEffect(()=>{
  if(!(import.meta as ImportMeta&{env?:{DEV?:boolean}}).env?.DEV)return;
  const w=window as unknown as {__endSession?:()=>void};
  w.__endSession=()=>{runEndSequence();};
  return()=>{delete w.__endSession;};
 },[runEndSequence]);
 const destroyedCount=view?view.players[0].destroyed.length+view.players[1].destroyed.length:0;
 const pendingChoice=view?.choice&&view.choice.owner===0&&!busy?view.choice:null;
 const recovering=pendingChoice?.zone==='trash'?pendingChoice:null;
 const drawerZone=recovering?'trash':drawer;
 const selectableNodes=pendingChoice?choiceNodes(pendingChoice):[];
 const [transferHover,setTransferHover]=useState<string|null>(null);
 useEffect(()=>setTransferHover(null),[pendingChoice?.id]);
 const {view:transferView,drag:transferDrag}=useTransferDrag(recovering?undefined:pendingChoice?.transfer,pendingChoice?.id,id=>choose(id),transferHover);
 const chooseNode=(node:number)=>{const option=pendingChoice?.options.find(entry=>entry.node===node);if(option)choose(option.id);};
 const sourceCard=selected?HISTORIC_SOURCE_METADATA[selected.definitionId??selected.id]:null;
 const selectedClip=selected?cardInspectVideo(selected):undefined;
 const circuitLanded=active?.kind==='circuit';
 const globalEvent=active&&(active.kind==='gameover'||circuitLanded||(active.kind==='collapse'&&active.text.startsWith('Wave Collapse')));
 const seconds=view?.draftEndsAt?Math.max(0,Math.ceil((view.draftEndsAt-now)/1000)):0;
 const draftOpen=phase==='draft'&&(!busy||(active?.source==='circuit'&&active.owner===0));
 useEffect(()=>{
  if(view?.phase!=='draft'||busy||resolvingRef.current||!client.current)return;
  const event=client.current.tickDraft(now);
  if(!event)return;
  record(event);const snapshot=client.current.view()!;setView(snapshot);
  if(event.kind==='cycle'){setNotice(event.text);showOpening(snapshot);}
 },[now,view?.phase,view?.draftEnded,busy]);
 const playerColors=useMemo(()=>resolveColorTheme(colorTheme),[colorTheme]);
 const cardBackUrls=useMemo<PerPlayer<string>>(()=>[cardBackSrc(cardBacks[0],playerColors[0]),cardBackSrc(cardBacks[1],playerColors[1])],[cardBacks,playerColors]);
 useEffect(()=>saveColorTheme(colorTheme),[colorTheme]);
 useEffect(()=>saveLanePatterns(lanePatterns),[lanePatterns]);
 useEffect(()=>saveServerStyles(serverStyles),[serverStyles]);
 useEffect(()=>saveCardBacks(cardBacks),[cardBacks]);
 useEffect(()=>saveBoardStyle(boardStyle),[boardStyle]);
 useEffect(()=>saveNeonSurface(neonSurface),[neonSurface]);
 useEffect(()=>saveRealLightingStore(lightingStore),[lightingStore]);
 useEffect(()=>saveBackgroundChoice(backgroundChoice),[backgroundChoice]);
 const pileCounts=(owner:0|1)=>({deck:view?.players[owner].draw.length??5,hand:view?.players[owner].hand.length??5,discard:view?.players[owner].discard.length??0});
 const hudAnchors:NonNullable<React.ComponentProps<typeof BoardScene>['hudAnchors']>=[
 {id:'opponent-console',position:[0,.52,-4.6],content:<div className='opponent-console' style={{'--console-accent':playerColors[1].accent} as CSSProperties}><small className={`reveal-priority ${view?.priority===1?'active':''}`}><i aria-hidden='true'/>REVEAL PRIORITY</small><Resources owner={1} actions={view?.players[1].actions??2} crypto={view?.players[1].wallet??0} pending={view?.players[1].pendingActions??0} vp={view?.players[1].totalVP??0}/>{opponentDraw>0&&<div className='opponent-arrivals' aria-label={`Opponent draws ${opponentDraw} cards`}>{Array.from({length:opponentDraw},(_,i)=><img key={i} style={{'--arrival-delay':`${i*100}ms`} as CSSProperties} src={cardBackUrls[1]} alt='Face-down drawn card'/>)}</div>}</div>},
 {id:'local-console',position:[0,.52,4.6],content:<div className='local-console' style={{'--console-accent':playerColors[0].accent} as CSSProperties}><small className={`reveal-priority ${view?.priority===0?'active':''}`}><i aria-hidden='true'/>REVEAL PRIORITY</small><Resources owner={0} actions={local?.actions??2} crypto={local?.wallet??0} pending={local?.pendingActions??0} vp={local?.totalVP??0}/></div>},
 ...([1,0] as const).flatMap(owner=>(['backup','primary'] as const).map(target=>({id:`server-${owner}-${target}`,position:[target==='backup'?-SERVER_X:SERVER_X,.35,serverZ(owner,boardStyle==='neon')] as [number,number,number],content:<Server owner={owner} target={target} color={playerColors[owner]} value={view?.players[owner].servers[target]??(target==='primary'?2000:1500)} active={active?.target===target&&active.targetOwner===owner?active:null} duration={active?eventTime(active,fast):1500}/>}))),
 ...([1,0] as const).map(owner=>({id:`duration-${owner}`,position:[BANK_BAY_X,-.02,owner?-BANK_BAY_Z-FAR_BANK_LIFT:BANK_BAY_Z+NEAR_BANK_DROP] as [number,number,number],content:<div className={`bank-dock ${owner?'far':'near'}`}><Duration owner={owner} color={playerColors[owner]} cycle={view?.cycle??1} entries={view?.players[owner].bank??[]} activeCard={active?.cardId} activeEvent={active?.id} arriving={bankArrivals} inspect={setSelected}/><Piles owner={owner} counts={pileCounts(owner)}/></div>})),
 {id:'undo-planning',position:[BANK_BAY_X,-.02,BANK_BAY_Z+NEAR_BANK_FORMER_DROP-BOARD_DROP],content:<div className='undo-dock'><button className='undo-planning' disabled={!view?.canUndoPlanning||busy} onClick={undoPlanning}><Icon name='undo'/>Undo all actions</button></div>},
 ...(view?[{id:'zone-buttons',position:ZONE_BUTTONS_POSITION,content:<ZoneButtons trash={view.trash.length} destroyed={destroyedCount} open={drawerZone} toggle={zone=>setDrawer(current=>current===zone?null:zone)}/>}]:[]),
 ];
 return <main className='app' data-event-id={active?.id} data-event-kind={active?.kind} data-event-stage={active?.stage} data-event-node={active?.node}>
  <BoardTuningPanel endGame={view&&phase!=='gameover'&&client.current?.endSessionNow?{run:()=>act(()=>client.current!.endSessionNow!()),disabled:busy}:undefined} lighting={lightingMode==='real'?{floor:boardBackgroundLabel(floorBackground),value:realLighting,saved:lightingStore[floorBackground]?.saved,change:changeLighting,neon:boardStyle==='neon'}:undefined} paint={boardStyle==='neon'?{active:neonSurface==='paint',enable:()=>setNeonSurface('paint')}:undefined}/>
  <header className='topline'><div className='brand'><span>0</span>UROBOROS<small>THE CIRCUIT AND THE SERPENT</small></div><div className='phase-stack'><div className='phase-label'>{view?`CYCLE ${String(view.cycle).padStart(2,'0')} / ${phase==='runtime'?`RUNTIME ${view.turn} OF 3`:phase.toUpperCase()}`:'THE CIRCUIT AWAITS'}</div>{view&&<div className='cycle-track' aria-label='Cycle progress'>{['Turn 1','Turn 2','Turn 3','Collapse','Draft'].map((label,index)=>{const step=phase==='draft'?4:phase==='collapse'?3:view.turn-1;return <span key={label} className={index===step?'current':index<step?'complete':''} aria-current={index===step?'step':undefined}><i/>{label}{label==='Collapse'&&phase==='collapse'&&active?.node!==undefined&&<b className='cycle-step-detail'>{active.kind==='circuit'&&!circuitLanded?'CIRCUIT SELECTION':`N${active.node+1} / N5`}</b>}</span>;})}</div>}</div><nav><div className='settings-cluster'><button className='settings-toggle' aria-haspopup='true' aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(open=>!open)}>Settings</button>{settingsOpen&&<><span className='settings-scrim' onClick={()=>setSettingsOpen(false)}/><div className='settings-popover' aria-label='Session settings'><div className='settings-tabs' role='tablist'>{SETTINGS_TABS.map(tab=><button key={tab.id} type='button' role='tab' aria-selected={settingsTab===tab.id} onClick={()=>setSettingsTab(tab.id)}>{tab.label}</button>)}</div>
   {settingsTab==='players'&&<div className='settings-panel' role='tabpanel' aria-label='Players'><div className='player-tabs' role='tablist' aria-label='Player'>{([0,1] as const).map(owner=><button key={owner} type='button' role='tab' aria-selected={playerTab===owner} style={{'--swatch':playerColors[owner].accent} as CSSProperties} onClick={()=>setPlayerTab(owner)}><i aria-hidden='true'/>Player {owner+1}<small>{owner?'Opponent':'You'}</small></button>)}</div><PlayerSettings key={playerTab} owner={playerTab} colors={colorTheme} setColors={setColorTheme} lanes={lanePatterns} setLanes={setLanePatterns} servers={serverStyles} setServers={setServerStyles} backs={cardBacks} setBacks={setCardBacks}/></div>}
   {settingsTab==='board'&&<div className='settings-panel' role='tabpanel' aria-label='Board'><span className='bg-picker' role='group' aria-label='Floor background'><small>Background</small><button type='button' className='bg-picker-btn' aria-label='Previous floor background' onClick={()=>setBackgroundChoice(choice=>stepBackground(choice,-1))}>‹</button><span className='bg-picker-label'>{boardBackgroundLabel(floorBackground)}</span><button type='button' className='bg-picker-btn' aria-label='Next floor background' onClick={()=>setBackgroundChoice(choice=>stepBackground(choice,1))}>›</button></span><BoardStylePicker value={boardStyle} onChange={setBoardStyle}/>{boardStyle==='neon'&&<OptionPicker className='neon-surface-picker' label='Surface' name='Neon table surface' options={NEON_SURFACES} value={neonSurface} onChange={setNeonSurface}/>}<BoardLightSliders/></div>}
   {settingsTab==='general'&&<div className='settings-panel' role='tabpanel' aria-label='General'><button onClick={()=>{setSettingsOpen(false);setCatalogOpen(true);}}>Card catalog</button><a className='authoring-link' href='/author' target='_blank' rel='noreferrer' onClick={()=>setSettingsOpen(false)}>Content Studio</a><button onClick={()=>{setSettingsOpen(false);setPanel('practice');}}>Evaluation build</button><button aria-pressed={fast} disabled={busy} onClick={()=>setFast(!fast)}>{fast?'Fast':'Normal'} pace</button><button aria-pressed={videoSound} onClick={()=>setVideoSound(on=>!on)}>Card video sound: {videoSound?'On':'Off'}</button><OptionPicker label='Lighting' name='Lighting' options={LIGHTING_MODES} value={lightingMode} onChange={mode=>setBackgroundChoice(choice=>({...choice,mode}))}/></div>}  </div></>}</div><button onClick={()=>setPanel('log')}>Log <span>{history.length}</span></button></nav></header>
  <section className={`arena ${busy?'resolving':''}`} aria-label='Three-dimensional Circuit board'>
    <BoardScene boardStyle={boardStyle} neonSurface={neonSurface} planning={phase==='runtime'} gameover={collapsing} hudFollow={collapsing&&tallied} winner={view?.winner} playerColors={playerColors} videoSound={videoSound} floorBackground={floorBackground} lightingMode={lightingMode} realLighting={realLighting} lanePatterns={lanePatterns} serverStyles={serverStyles} cardBacks={cardBackUrls} boardScan={boardScan} boardScanTone={boardScanTone} boardScanDuration={fast?BOARD_SCAN_MS.fast:BOARD_SCAN_MS.normal} cycle={view?.cycle??1} closedNodes={closedNodes} collapseNode={collapseNode} awardNode={awardNode} selectionNode={selectionNode} onReady={()=>setBoardReady(true)} openNodes={dealing?(view?.openNodes??[]).slice(0,openingNodeCount):view?.openNodes??[]} servers={[view?.players[0].servers??{primary:2000,backup:1500},view?.players[1].servers??{primary:2000,backup:1500}]} hudAnchors={hudAnchors} nodes={nodes} turn={view?.turn??1} phase={phase} priority={view?.priority??0} dragged={dragged} hoveredNode={hoveredNode} legal={node=>dragged&&view?.movableCardIds.includes(dragged.id)?relocateLegal(node):legal(node)} drop={node=>dragged&&view?.movableCardIds.includes(dragged.id)?relocate(node):deploy(node)} inspect={c=>!isDragging.current&&setSelected(c)} onLocationInspect={index=>{if(view?.nodes[index].location)setLocationInspect(index);}} onFieldDrag={beginFieldDrag} effect={active&&(active.kind!=='circuit'||circuitLanded)?{...active,player:active.owner,sourceCardId:active.cardId}:null} selectedNode={view?.selectedNode??null} choiceNodes={selectableNodes} chooseNode={chooseNode} transfer={transferView}/>
   <aside className='crypto-cache hud-wallet' aria-label={`Crypto wallet, ${cacheValue} total, ${cache.length} cards`}>
    <div className='wallet-head'><Icon name='crypto'/><b className='cache-total'>{cacheValue}</b><div className='wallet-label'><b>CRYPTO WALLET</b><small>{cache.length} {cache.length===1?'card':'cards'}</small></div></div>
    <div className='cache-cards' style={{'--count':cache.length} as CSSProperties}>{cache.map((card,index)=><button className={`cache-card ${cashFlight?.card.id===card.id?'paying':''}`} data-card-id={card.id} style={{'--stack-index':index,'--fan':index-(cache.length-1)/2,'--angle':`${(index-(cache.length-1)/2)*Math.min(4,20/cache.length)}deg`,'--lift':`${Math.abs(index-(cache.length-1)/2)*2}px`,'zIndex':index+1} as CSSProperties} key={card.id} onClick={()=>setSelected(card)} title={card.name} aria-label={card.name}><CardFace card={card} compact/></button>)}</div>   </aside>
   <div className='turn-dock'>
    <EndTurnControl key={view?'playing':'setup'} seconds={client.current?.mode==='online'?lobby?.settings?.turnSeconds||null:runtimeSeconds} onConcede={()=>{if(client.current?.mode==='local')act(()=>client.current!.concede());}} cycle={view?.cycle??0} turn={view?.turn??1} enabled={!!view&&!busy&&phase==='runtime'&&!view.turnReady[0]} busy={busy} dealing={dealing} onEnd={endTurn} waiting={view&&phase==='runtime'&&view.turnReady[0]&&!busy?{undo:()=>act(()=>client.current!.undoEndTurn()),opponent:client.current?.seatNames?.[1]??'opponent'}:null}/>
   </div>
   <div ref={handZone} className='hand-zone' data-resource='0-hand' style={handSpan?{left:handSpan.left,right:handSpan.right}:undefined}><div className='hand-instruction'>{dealing?'Five-card deal · Crypto moves to cache':fieldHand.length?'Drag to deploy · Click to inspect':phase==='runtime'?'Your hand is empty':'The Circuit is resolving'}</div><div className='hand' style={{'--hand-overlap':`${handOverlap(fieldHand.length,handSpan?.room??0,handSpan?.cardWidth??120,handSpan?.cardHeight??168)}px`} as CSSProperties}>{fieldHand.map((card,i)=><button key={card.id} data-card-id={card.id} className={`hand-card ${arrivals.includes(card.id)?'drawing-card':''} ${dragged?.id===card.id||flight?.card.id===card.id?'dragging':''}`} style={{'--angle':`${(i-(fieldHand.length-1)/2)*Math.min(4,20/fieldHand.length)}deg`,'--lift':`${Math.abs(i-(fieldHand.length-1)/2)*5}px`,'--index':i,'--arrival-delay':`${Math.max(0,arrivals.indexOf(card.id))*110}ms`} as CSSProperties} draggable={false} aria-label={`Inspect ${card.name}`} onDragStart={e=>e.preventDefault()} onPointerDown={e=>beginCardDrag(e,card)} onClick={()=>{if(!isDragging.current)setSelected(card);}}><HandCardFace card={card}/></button>)}</div></div>
  </section>
  {cashFlight&&<div className='cash-flight' data-cash-flight={cashFlight.card.id} style={{left:cashFlight.x,top:cashFlight.y,width:cashFlight.w,height:cashFlight.h,'--cash-x':`${cashFlight.dx}px`,'--cash-y':`${cashFlight.dy}px`,'--cash-duration':`${cashFlight.duration*.72}ms`} as CSSProperties}><Icon name='crypto'/><strong>{cashFlight.card.name}</strong><b>+{cashFlight.card.cryptoValue??Number(cashFlight.card.effect.match(/\+(\d+) Crypto/)?.[1]??0)}</b></div>}
  {flight&&<div ref={flightRef} className={`flying-card ${flight.crypto?'crypto-flight':''} ${flight.release?'spring-flight':''}`} style={{left:flight.x,top:flight.y,width:flight.w,height:flight.h,'--flight-x':`${flight.dx}px`,'--flight-y':`${flight.dy}px`,'--flight-scale':flight.scale,'--flight-angle':`${flight.angle??0}deg`} as CSSProperties}><div className='flying-face hand-card flight-face-card'><HandCardFace card={flight.card}/></div><img className='flying-back' src={cardBackUrls[0]} alt=''/></div>}
  {active&&<EffectPath key={`path-${active.id}`} event={active.source==='circuit'&&active.owner===1?{...active,node:view?.selectedNode??undefined}:active} duration={eventTime(active,fast)}/>}
  {(active?.kind==='move'||active?.kind==='morph')&&<CardEffectMotion key={`card-effect-${active.id}`} event={active} duration={eventTime(active,fast)}/>}
  {globalEvent&&<EventMessage key={`global-${active.id}`} event={active}/>}
  <footer className='status-bar'><span className={`status-dot ${opponentAway?'away':''}`}/><span>{notice}</span>{client.current?.mode==='online'&&lobby?.code&&<span className='session-online' data-room-code={lobby.code}>Table {lobby.code}{opponentAway?' · opponent away':''}</span>}<span className='session-policy'>Actions carry over · Control Locations to earn the Circuit</span></footer>
  {!view&&<div className='setup-backdrop'><section className='setup-card'><small>ENTER THE CIRCUIT</small><h1>Every Node.<br/><em>Every possibility.</em></h1><p>Build your deck, plan across five Locations, and compete for control of the Circuit.</p><div className='setup-note'><b>{boardReady?'Your Circuit is ready':'Preparing your table'}</b><span>Control more Locations to earn the Circuit Reward and next reveal priority. Tied counts share the reward. Unused Actions carry forward.</span></div><GameConfigure setup={setup} onChange={changeSetup} decks={deckSource?.decks??null} deckId={startingDeck?.id} onDeck={chooseDeck} opponent={opponent} onOpponent={chooseOpponent} disabled={contentLoading}/><button className='primary-button' disabled={!priority||!boardReady||contentLoading||lobby?.status==='waiting'} onClick={start}>{contentLoading?'Loading saved content…':'Enter evaluation build'} <span>↗</span></button>{contentError&&<p role='alert'>{contentError}</p>}<OnlineLobby lobby={lobby??IDLE_LOBBY} saved={savedOnlineSeat} turnSeconds={setup.turnSeconds} disabled={!boardReady||contentLoading} onCreate={createOnline} onJoin={joinOnline} onResume={resumeOnline} onLeave={leaveTable}/><a className='setup-authoring-link' href='/author' target='_blank' rel='noreferrer'>Open Content Studio ↗</a><p className='setup-fineprint'>Actions carry over. This evaluation pack adds Location rewards and Circuit privileges. The provisional market adds economy, scoring, Duration and tactical effects. Both players purchase cards.</p></section>{SetupAgentsWindow&&<Suspense fallback={null}><SetupAgentsWindow/></Suspense>}</div>}
  {draftOpen&&view&&<DraftPanel view={view} busy={busy} now={now} seconds={seconds} acquired={acquired} cycleStart={cycleStart} inspect={setSelected} acquire={acquire} claim={claimPrivilege} end={()=>act(()=>client.current!.endDraft())} undo={()=>act(()=>client.current!.undoEndDraft())}/>}
  {locationInspect!==null&&view?.nodes[locationInspect].location&&<div className='modal-backdrop' onClick={()=>setLocationInspect(null)}><section className='location-inspect' role='dialog' aria-modal='true' aria-label={`Inspect Location ${view.nodes[locationInspect].location!.name}`} onClick={event=>event.stopPropagation()}><button className='close' aria-label='Close Location inspect' onClick={()=>setLocationInspect(null)}>×</button><small>NODE {locationInspect+1} · LOCATION</small><h2>{view.nodes[locationInspect].location!.name}</h2><p><LocationText text={view.nodes[locationInspect].location!.rule}/></p><div className='location-inspect-reward'><small>LOCATION REWARD</small><p><LocationText text={view.nodes[locationInspect].location!.reward}/></p></div><footer>Location Rewards resolve here during Wave Collapse. The Circuit Reward is a separate Draft offering.</footer></section></div>}
  {catalogOpen&&<CardCatalog content={content} canTest={!!view&&phase==='runtime'&&!busy&&!view.canUndoPlanning} close={()=>setCatalogOpen(false)} inspect={setSelected} add={addTestCard}/>}
  {selected&&!dragged&&<div className='modal-backdrop' onClick={()=>setSelected(null)}><section className='inspect' role='dialog' aria-modal='true' aria-label={`Inspect ${selected.name}`} onClick={e=>e.stopPropagation()}><button className='close' aria-label='Close card inspect' onClick={()=>setSelected(null)}>×</button><div className='inspect-art'><CardFace card={selected} context={phase==='draft'?'draft':'runtime'} video={selectedClip?{src:selectedClip,loop:true,sound:videoSound}:undefined}/>{selectedClip&&<button className='inspect-sound' aria-pressed={videoSound} onClick={()=>setVideoSound(on=>!on)}>{videoSound?'Sound on':'Sound off'}</button>}</div><div className='inspect-copy'><small>{selected.type}</small><h2>{selected.name}</h2><div className='inspect-stats'><span>POWER <b className={selected.power===undefined||selected.basePower===undefined||selected.power===selected.basePower?undefined:selected.power>selected.basePower?'power-boosted':'power-reduced'}>{selected.power??'—'}</b></span>{phase==='draft'&&<span>DRAFT COST <b>{selected.cost}</b></span>}</div><p>{selected.effect}</p>{selected.storyText&&<div className='source-card-text'><small>STORY</small><p>{selected.storyText}</p></div>}{selected.modifiers?.length?<div className='source-card-text'><small>MODS</small><ul>{selected.modifiers.map(modifier=><li key={modifier.id}>{modifierText(modifier,content?.cards??[])}{modifier.sourceName&&<em> · from {modifier.sourceName}</em>}</li>)}</ul></div>:null}{sourceCard&&<div className='source-card-text'><small>ORIGINAL CARD EFFECTS</small><ul>{sourceCard.effects.map((text,index)=><li key={index}>{text}</li>)}</ul>{sourceCard.effects.some(text=>/draft/i.test(text))&&<p className='content-note'>Each +Draft now transfers 1 of your Power between this Location and a neighbor.</p>}</div>}<small>{selected.type==='Crypto'?'Held Crypto resolves automatically for Draft.':`Runtime deployment: ${isCharacterCard(selected)?'1 Action':'0 Actions'}.`}</small>{selected.type==='VP'&&<p className='content-note'>{selected.vp??2} scoring VP while owned in an active zone.</p>}{selected.duration&&<p className='content-note'>Duration {selected.duration===99?'∞':selected.duration}. {selected.durationPeriod==='runtime'?'Measured in Runtime turns; scheduled effects follow the card text.':'The deployment Cycle counts as the first Cycle.'}</p>}{!busy&&phase==='runtime'&&local?.hand.some(c=>c.id===selected.id)&&selected.type!=='Crypto'&&<div className='inspect-deploy'><span>Deploy to Node</span>{[0,1,2,3,4].map(n=><button key={n} disabled={!!legal(n,selected)} title={legal(n,selected)??`Deploy to Node ${n+1}`} onClick={()=>deploy(n,selected)}>{n+1}</button>)}</div>}</div></section></div>}
  {panel==='log'&&<div className='panel-backdrop' onClick={()=>setPanel(null)}><LogDrawer events={history} cycles={client.current?.cycleHistory()??[]} live={view?{cycle:view.cycle,turn:view.turn,phase:view.phase}:null} colors={[playerColors[0].accent,playerColors[1].accent]} close={()=>setPanel(null)}/></div>}
  {panel==='practice'&&<div className='panel-backdrop' onClick={()=>setPanel(null)}><aside className='side-panel' onClick={e=>e.stopPropagation()}><button className='close' aria-label='Close panel' onClick={()=>setPanel(null)}>×</button><small>0UROBOROS / EVALUATION SCOPE</small><h2>Evaluation build</h2><p>This session uses a ten-card starter deck, real draw and discard zones, and alternating reveals. Win more Locations to earn the Circuit Reward; equal win counts reward both players.</p><p>Five approved evaluation Locations and three Circuit privileges are enabled. The market includes four core Base piles, two rotating Base offers, three VP piles, three Crypto piles and three rotating Chaos offers. New definitions are provisional evaluation content.</p><p>Unused Actions carry forward. Controlling more Locations earns next reveal priority; ties retain priority.</p><p>The local opponent deploys and purchases using its own cards, Wallet and public board information. Both players compete for shared supply. This is a local evaluation, not online multiplayer.</p></aside></div>}
  {view&&<ZoneDrawer zone={drawerZone} view={view} choice={recovering} choose={choose} inspect={setSelected} close={()=>setDrawer(null)}/>}
  {pendingChoice&&!recovering&&<EffectChoice choice={pendingChoice} choose={choose} transferView={transferView} transferHover={setTransferHover}/>}
  {transferDrag&&transferView&&<TransferBadge drag={transferDrag} amount={transferView.amount}/>}
  {phase==='gameover'&&ended&&!busy&&view&&<GameSummary view={view} colors={playerColors} inspect={setSelected} onTallied={markTallied} restart={()=>{leaveTable();setView(null);setHistory([]);setActive(null);}}/>}
 </main>;
}
function HandCardFace({card}:{card:Card}){return <CardFace card={card}/>;}
function cryptoPayout(card:Card){return card.cryptoValue??Number(card.effect.match(/\+(\d+) Crypto/i)?.[1]??0);}
function Resources({owner,actions,crypto,pending,vp}:{owner:number;actions:number;crypto:number;pending:number;vp:number}){
 const [labels,setLabels]=useState(false);
 useEffect(()=>{if(!labels)return;const timer=setTimeout(()=>setLabels(false),PILE_TIP_MS);return()=>clearTimeout(timer);},[labels]);
 return <div className='resources' data-labels-open={labels||undefined} onClick={()=>setLabels(true)}>{[{key:'actions',icon:'actions',value:actions,label:'Actions'},{key:'wallet',icon:'crypto',value:crypto,label:'Crypto'},{key:'vp',icon:'volume',value:vp,label:'VP'}].map(stat=><span className={`stat-${stat.key}`} data-resource={`${owner}-${stat.key}`} key={stat.key}><span className='stat-pair'><Icon name={stat.icon}/><b key={stat.value}>{stat.value}</b></span><span className='stat-foot'><small>{stat.label}</small>{stat.key==='actions'&&pending>0&&<em className='stat-pending' title={`+${pending} Action${pending===1?'':'s'} next Runtime turn`}>+{pending} next</em>}</span></span>)}</div>;}
const DECK_KEY='ouroboros.startingDeck';
const IDLE_LOBBY:LobbyState={status:'idle',connection:'offline',code:null,seat:null,seats:[null,null],mode:null,settings:null,result:null,error:null};
const OPPONENT_KEY='ouroboros.opponent';
type SettingsTab='players'|'board'|'general';
const SETTINGS_TABS:{id:SettingsTab;label:string}[]=[{id:'players',label:'Players'},{id:'board',label:'Board'},{id:'general',label:'General'}];
const LIGHTING_MODES=[{id:'real',label:'Real lighting'},{id:'studio',label:'Studio'}] as const;
function OptionPicker<T extends string>({label,name,options,value,onChange,className=''}:{label:string;name:string;options:readonly {id:T;label:string}[];value:T;onChange:(id:T)=>void;className?:string}){
 return <div className={`lane-pattern-picker ${className}`} role='radiogroup' aria-label={name}><small>{label}</small><div>{options.map(option=><button key={option.id} type='button' role='radio' aria-checked={value===option.id} onClick={()=>onChange(option.id)}>{option.label}</button>)}</div></div>;
}
type Update<T>=(update:(current:T)=>T)=>void;
/** One player's look on the Players tab: neon colour, lane pattern, Server tubes and card back. */
function PlayerSettings({owner,colors,setColors,lanes,setLanes,servers,setServers,backs,setBacks}:{owner:0|1;colors:ColorTheme;setColors:Update<ColorTheme>;lanes:PerPlayer<LanePattern>;setLanes:Update<PerPlayer<LanePattern>>;servers:PerPlayer<ServerStyle>;setServers:Update<PerPlayer<ServerStyle>>;backs:PerPlayer<CardBackId>;setBacks:Update<PerPlayer<CardBackId>>}){
 const who=`Player ${owner+1}`, color=playerColor(colors[owner]);
 return <section className='player-settings' role='tabpanel' aria-label={who} style={{'--swatch':color.accent} as CSSProperties}>
  <div className='lane-pattern-picker' role='radiogroup' aria-label={`${who} neon color`}><small>Neon color</small><div className='theme-swatches'>{PLAYER_COLOR_IDS.map(choice=>{
   const taken=colorTaken(colors,owner,choice);
   const label=`${who}: ${colorChoiceLabel(choice)}${taken?' (in use by the other player)':''}`;
   return <button type='button' key={choice} role='radio' aria-checked={colors[owner]===choice} aria-label={label} title={label} disabled={taken} className='theme-swatch' data-choice={choice} style={{'--swatch':playerColor(choice).accent} as CSSProperties} onClick={()=>setColors(current=>withPlayerColor(current,owner,choice))}/>;
  })}</div></div>
  <OptionPicker label='Lane pattern' name={`${who} lane pattern`} options={LANE_PATTERNS} value={lanes[owner]} onChange={id=>setLanes(current=>withPlayer(current,owner,id))}/>
  <OptionPicker label='Server tubes' name={`${who} server tubes`} options={SERVER_STYLES} value={servers[owner]} onChange={id=>setServers(current=>withPlayer(current,owner,id))}/>
  <div className='lane-pattern-picker card-back-picker' role='radiogroup' aria-label={`${who} card back`}><small>Card back</small><div>{CARD_BACKS.map(back=><button key={back.id} type='button' role='radio' aria-checked={backs[owner]===back.id} aria-label={`${who}: ${back.label}`} title={back.label} onClick={()=>setBacks(current=>withPlayer(current,owner,back.id))}><img src={cardBackSrc(back.id,color)} alt=''/></button>)}</div></div>
 </section>;
}
function Server({owner,target,color,value,active,duration,children}:{owner:number;target:'primary'|'backup';color:PlayerColor;value:number;active:RuntimeEvent|null;duration:number;children?:ReactNode}){const max=target==='primary'?2000:1500;return <div data-server={`${owner}-${target}`} style={{'--server-duration':`${duration}ms`,...playerColorVars(color)} as CSSProperties} className={`server ${owner===1?'far':'near'} ${active?`server-${active.kind}`:''} ${value===0?'destroyed':''}`}><div className='server-readout'><small>{target.toUpperCase()}</small><b>{value.toLocaleString()}</b>{children}</div><i role='progressbar' aria-label={`${target} integrity`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><em style={{width:`${value/max*100}%`}}/></i>{active&&<span className='server-delta'>{active.kind==='drain'?'−':'+'}{active.amount}</span>}</div>;}
/** Effect Bank entry: slide in, magnetic snap to full bleed, then one lap of light around the slot. The CSS reads these as custom properties. */
const BANK_SLIDE_MS=800, BANK_SNAP_MS=460, BANK_SWEEP_MS=750, BANK_STAGGER_MS=140;
/** How long an entry of `count` cards into one bank runs, lights included; 0 for none. */
const bankEntryMs=(count:number)=>count?BANK_SLIDE_MS+BANK_SNAP_MS+BANK_SWEEP_MS+(count-1)*BANK_STAGGER_MS:0;
/** Card ids that are in each player's bank after an event but were not before it. */
function newlyBanked(before:SessionView,after:SessionView){
 return ([0,1] as const).map(owner=>{
  const held=new Set(before.players[owner].bank.map(entry=>entry.card.id));
  return after.players[owner].bank.filter(entry=>!held.has(entry.card.id)).map(entry=>entry.card.id);
 });
}
function modifierText(modifier:CardModifier,cards:readonly Card[]){
 if(modifier.kind==='authored')return `${modifier.name??'Card mod'}: ${describeMod(modifier,cards)}`;
 const details=builtinMod(modifier.kind,modifier.kind==='powerAuraAtLocation'?modifier.amount??1:undefined);
 return `${details.name}: ${details.text}`;
}

function Duration({owner,color,cycle,entries,activeCard,activeEvent,arriving,inspect}:{owner:0|1;color:PlayerColor;cycle:number;entries:SessionView['players'][0]['bank'];activeCard?:string;activeEvent?:number;arriving:string[];inspect:(card:Card)=>void}){
 const entering=entries.filter(entry=>arriving.includes(entry.card.id)).map(entry=>entry.card.id);
 return <aside className={`duration live-bank ${owner===1?'far':'near'}`} style={playerColorVars(color)} data-owner={owner} data-player-color={color.id} data-bank-count={entries.length}>
  <small>{owner===1?'OPPONENT\'S':'YOUR'} EFFECT BANK</small>
  <div>{Array.from({length:4},(_,index)=>{
   const entry=entries[index];
   if(!entry)return <i className='bank-slot' key={index}/>;
   const remaining=entry.remainingTurns??(entry.expiresCycle===undefined?null:Math.max(0,entry.expiresCycle-cycle+1));
   const effectsLeft=entry.effectsLeft??null;
   const label=`${remaining===null?'permanent':`${remaining} ${entry.remainingTurns!==undefined?'turns':'Cycles'} left`}, ${effectsLeft===null?'effects never run out':`${effectsLeft} ${effectsLeft===1?'effect':'effects'} left to resolve`}`;
   const arrival=entering.indexOf(entry.card.id), resolving=activeCard===entry.card.id;
   const timing={'--bank-delay':`${Math.max(0,arrival)*BANK_STAGGER_MS}ms`,'--bank-slide':`${BANK_SLIDE_MS}ms`,'--bank-snap':`${BANK_SNAP_MS}ms`,'--bank-sweep-ms':`${BANK_SWEEP_MS}ms`} as CSSProperties;
   return <button key={entry.card.id} data-card-id={entry.card.id} className={`bank-slot ${resolving?'active-source':''} ${arrival>=0?'bank-arriving':''}`} style={timing} aria-label={`Inspect ${entry.card.name}, ${label}`} onClick={()=>inspect(entry.card)}>
    <CardFace card={entry.card} compact remainingDuration={remaining??99} bankEffects={effectsLeft}/>
    {arrival>=0&&<i className='bank-sweep after-entry' aria-hidden='true'/>}
    {resolving&&<i className='bank-sweep' key={activeEvent} aria-hidden='true'/>}
   </button>;
  })}</div>
 </aside>;
}
const PILES=[{name:'deck',label:'Draw',icon:'deck'},{name:'hand',label:'Hand',icon:'hand'},{name:'discard',label:'Discard',icon:'discard-pile'}] as const;
type PileCounts=Record<(typeof PILES)[number]['name'],number>;
const PILE_TIP_MS=1600;
/** A deployed card's flight into its slot, after which the Node commits it. */
const FLIGHT_MS=440;
/**
 * The label tooltip shows on hover, and on tap for touch screens, which have no hover.
 * The opponent's Hand is the `1-hand` resource target; the local `0-hand` id already belongs to the hand zone.
 */
function Piles({owner,counts}:{owner:0|1;counts:PileCounts}){
 const [tapped,setTapped]=useState<string|null>(null);
 useEffect(()=>{if(!tapped)return;const timer=setTimeout(()=>setTapped(null),PILE_TIP_MS);return()=>clearTimeout(timer);},[tapped]);
 return <div className='pile-row'>{PILES.map(({name,label,icon})=><button type='button' key={name} className={`pile pile-${name}`} data-resource={name==='hand'&&owner===0?undefined:`${owner}-${name}`} data-tip={label} data-tip-open={tapped===name||undefined} aria-label={`${owner?'Opponent':'Your'} ${label}, ${counts[name]} cards`} onClick={()=>setTapped(name)}><Icon name={icon}/><b>{counts[name]}</b></button>)}</div>;
}
