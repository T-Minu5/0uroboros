import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from './cardArtwork';
import { cardPresentation, type CardWithPresentation } from './cardPresentation';
import { servedArtPath } from './depthArt/depthManifest';
import './card-face.css';

/**
 * A clip laid over the art window. Without `loop`, `onEnd` fires when it finishes or fails to play.
 * `playing: false` keeps the clip loaded but hidden on its first frame, so a later start has no load delay.
 */
export type CardArtVideo = { src: string; loop?: boolean; sound?: boolean; playing?: boolean; rate?: number; onEnd?: () => void };
export type CardFaceProps = { card: CardWithPresentation; context?: 'runtime' | 'draft' | 'preview'; compact?: boolean; remainingDuration?: number; powerChanging?: boolean; className?: string; movableCue?: boolean; video?: CardArtVideo };

function ArtVideo({src,loop=false,sound=false,playing=true,rate=1,onEnd}:CardArtVideo){
  const ref=useRef<HTMLVideoElement>(null);
  const endRef=useRef(onEnd);endRef.current=onEnd;
  // `muted` is set on the element directly: React does not reliably reflect it, and autoplay depends on it.
  useEffect(()=>{const video=ref.current;if(video)video.muted=!sound;},[sound]);
  useEffect(()=>{
    const video=ref.current;if(!video)return;
    if(!playing){video.pause();if(video.currentTime)video.currentTime=0;return;}
    video.muted=!sound;
    video.playbackRate=rate;
    // Sound can be refused without a recent tap; the clip then plays silently rather than not at all.
    void video.play().catch(()=>{video.muted=true;return video.play();}).catch(()=>endRef.current?.());
  },[src,playing,rate]);
  const end=()=>{if(playing)endRef.current?.();};
  return <video ref={ref} className="cf-art cf-art-video" data-idle={playing?undefined:''} src={src} loop={loop} playsInline preload="auto" aria-hidden="true" onEnded={end} onError={end}/>;
}
type TitleFit = { scale: number; truncated: boolean };

/** The name is set at 14px against the template and shrunk to 9px before it ellipsizes. */
const TITLE_MIN_SCALE = 9 / 14;

/**
 * Fit the name to the strip. Both measurements are layout pixels taken in the same space,
 * so the ratio holds no matter what transform scale an ancestor applies to the card.
 */
function useTitleFit(name:string, compact:boolean) {
  const windowRef=useRef<HTMLSpanElement>(null), measureRef=useRef<HTMLSpanElement>(null);
  const [fit,setFit]=useState<TitleFit>({scale:1,truncated:false});
  useLayoutEffect(()=>{
    if(compact)return;
    let active=true;
    const measure=()=>{
      const strip=windowRef.current,sample=measureRef.current;
      if(!strip||!sample||strip.clientWidth<=0||sample.offsetWidth<=0)return;
      // A pixel of slack keeps a name that measures exactly to the edge off the ellipsis.
      const ratio=(strip.clientWidth-1)/sample.offsetWidth;
      const next:TitleFit=ratio>=1?{scale:1,truncated:false}
        :{scale:Math.max(ratio,TITLE_MIN_SCALE),truncated:ratio<TITLE_MIN_SCALE};
      if(active)setFit(current=>Math.abs(current.scale-next.scale)<.005&&current.truncated===next.truncated?current:next);
    };
    measure(); const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    if(windowRef.current)observer?.observe(windowRef.current);
    if(measureRef.current)observer?.observe(measureRef.current);
    void document.fonts?.ready.then(()=>{if(active)measure()});
    return()=>{active=false;observer?.disconnect()};
  },[name,compact]);
  return{windowRef,measureRef,fit};
}

/** How far the rules panel may close up its leading before the text starts shrinking. */
const KEYWORD_TIERS = 3;

/**
 * Close the rules panel up a step at a time until the tags sit inside it. Overflow is the
 * trigger rather than a row count, because one long clause wrapping inside a single tag
 * overruns the panel just as readily as three short tags on three rows do. Each tier only
 * touches vertical space, so the tags keep their line breaks and the measurement settles
 * instead of oscillating between two layouts. Every step is proportional to the card, so the
 * tier a card settles on holds at every size it is drawn at.
 */
function useKeywordFit(signature:string) {
  const panelRef=useRef<HTMLDivElement>(null);
  const [tier,setTier]=useState(0);
  useLayoutEffect(()=>{setTier(0)},[signature]);
  useLayoutEffect(()=>{
    const panel=panelRef.current;
    if(!panel)return;
    let active=true;
    const measure=()=>{
      if(!active||panel.clientHeight<=0)return;
      // A pixel of slack keeps sub-pixel rounding from provoking a needless tightening.
      if(panel.scrollHeight>panel.clientHeight+1)setTier(current=>current<KEYWORD_TIERS?current+1:current);
    };
    measure(); const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    observer?.observe(panel);
    void document.fonts?.ready.then(()=>{if(active)measure()});
    return()=>{active=false;observer?.disconnect()};
  },[signature,tier]);
  return{panelRef,tier};
}

/** Longest a comma-separated clause can be and still read as its own tag. */
const KEYWORD_MAX = 14;

/**
 * Split printed rules into the tags the template prints under the name. Sentences always
 * break apart. Commas only do when every clause is a short mechanical one, so "+2 actions,
 * +1 card, +2 crypto" becomes three tags while a prose sentence that happens to contain a
 * comma stays in one piece.
 */
export function effectKeywords(effect:string|undefined):string[]{
  return (effect??'').split('.').map(sentence=>sentence.trim()).filter(Boolean).flatMap(sentence=>{
    const clauses=sentence.split(',').map(clause=>clause.trim()).filter(Boolean);
    return clauses.length>1&&clauses.every(clause=>clause.length<=KEYWORD_MAX)?clauses:[sentence];
  });
}

export function CardFace({card,context='runtime',compact=false,remainingDuration,powerChanging=false,className='',movableCue=false,video}:CardFaceProps){
  const {style,icon}=cardPresentation(card),{windowRef,measureRef,fit}=useTitleFit(card.name,compact);
  const art=cardArtworkPath(card);
  const duration=card.duration===undefined?undefined:remainingDuration??card.duration,printed=card.basePower;
  const powerState=card.power===undefined||printed===undefined||card.power===printed?'':card.power>printed?'boosted':'reduced';
  const titleStyle={'--cf-title-scale':fit.scale} as CSSProperties;
  const keywords=compact?[]:effectKeywords(card.effect);
  const {panelRef,tier}=useKeywordFit(keywords.join('|'));
  const modifiers=card.modifiers??[];
  const badges=modifiers.flatMap(modifier=>{
    if(modifier.kind==='doublePrintedEffects')return [{key:modifier.id,label:'[x2]'}];
    if(modifier.kind==='powerAuraAtLocation')return [{key:modifier.id,label:`[+${modifier.amount??1}]`}];
    if(modifier.kind==='movableEachTurn')return [{key:modifier.id,label:'[↔]'}];
    return [];
  });
  return <div className={`cf-card${compact?' cf-card--compact':''}${movableCue?' cf-card--movable':''}${className?` ${className}`:''}`} data-card-style={style} data-card-context={context} data-movable={movableCue||undefined} title={card.name}>
    <div className="cf-body">
      <div className="cf-image-wrap" data-depth-art-src={art} data-depth-intensity={compact?.7:1}>
        <img className="cf-art" src={servedArtPath(art)} alt="" onError={event=>{const current=event.currentTarget.getAttribute('src');event.currentTarget.src=current!==art&&current!==CARD_ART_PLACEHOLDER?art:CARD_ART_PLACEHOLDER}}/>
        {video&&<ArtVideo key={video.src} {...video}/>}
        {badges.length>0&&<div className="cf-modifier-badges" aria-label="Card modifiers">{badges.map(badge=><span className="cf-modifier-badge" key={badge.key}>{badge.label}</span>)}</div>}
      </div>
      {!compact&&<div className="cf-title-strip"><img className="cf-class-icon" src={icon} alt=""/><span className="cf-title-window" ref={windowRef}><span className="cf-title card-name" data-title-fit={fit.truncated?'truncated':'exact'} title={card.name} style={titleStyle}>{card.name}</span></span><span className="cf-title-measure" ref={measureRef} aria-hidden="true">{card.name}</span></div>}
        {keywords.length>0&&<div className="cf-keywords" ref={panelRef} data-fit={tier}>{keywords.map((keyword,index)=><span className="cf-keyword" key={index}>{keyword}</span>)}</div>}
    </div>
    {duration!==undefined&&<span className="cf-duration" data-card-duration={duration} aria-label={`Duration ${duration===99?'infinite':duration}`}><img src="/assets/Icons/icon-duration.svg" alt=""/><b>{duration===99?'∞':duration}</b></span>}
    {card.power!==undefined&&<b className={`cf-power card-power-value${powerState?` ${powerState}`:''}${powerChanging?' power-changing':''}`} data-card-power={card.power} aria-label={`Power ${card.power}${printed!==undefined?`, printed Power ${printed}`:''}`}>{card.power}</b>}
    {context==='draft'&&<span className="cf-cost" data-card-cost={card.cost} aria-label={`Draft cost ${card.cost}`}><b>{card.cost}</b><img src="/assets/Icons/icon-crypto.svg" alt=""/></span>}
  </div>;
}
