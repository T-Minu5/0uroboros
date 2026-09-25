import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from './cardArtwork';
import { cardPresentation, type CardStyle, type CardWithPresentation } from './cardPresentation';
import './card-face.css';

export type CardFaceProps = { card: CardWithPresentation; context?: 'runtime' | 'draft' | 'preview'; compact?: boolean; remainingDuration?: number; powerChanging?: boolean; className?: string };
type TitleFit = { tracking: number; scale: number; mode: 'exact' | 'tracked' | 'scaled' | 'truncated' };
const TITLE_SPECS: Record<CardStyle, { size: number; tracking: number }> = {
  hacker:{size:14,tracking:1.12}, action:{size:14,tracking:1.12}, attack:{size:14,tracking:1.12},
  utility:{size:14,tracking:1.12}, crypto:{size:14,tracking:1.12}, vp:{size:10,tracking:1.2},
};

/** Preserve the Figma font size, then spend tracking and horizontal compression before ellipsizing. */
function useTitleFit(name:string, style:CardStyle, compact:boolean) {
  const windowRef=useRef<HTMLSpanElement>(null), measureRef=useRef<HTMLSpanElement>(null);
  const spec=TITLE_SPECS[style];
  const [fit,setFit]=useState<TitleFit>({tracking:spec.tracking,scale:1,mode:'exact'});
  useLayoutEffect(()=>{
    if(compact)return;
    let active=true;
    const measure=()=>{
      const window=windowRef.current,sample=measureRef.current;
      if(!window||!sample||window.clientWidth<=0)return;
      const available=window.clientWidth;
      sample.style.fontSize=`${spec.size}px`; sample.style.letterSpacing=`${spec.tracking}px`;
      const authoredWidth=sample.getBoundingClientRect().width;
      let next:TitleFit={tracking:spec.tracking,scale:1,mode:'exact'};
      if(authoredWidth>available){
        sample.style.letterSpacing='0px';
        const tightWidth=sample.getBoundingClientRect().width;
        if(tightWidth<=available){
          const gaps=Math.max(1,Array.from(name).length-1);
          next={tracking:Math.max(0,Math.min(spec.tracking,(available-tightWidth)/gaps)),scale:1,mode:'tracked'};
        }else{
          const requiredScale=available/tightWidth,scale=Math.max(.78,Math.min(1,requiredScale));
          next={tracking:0,scale,mode:requiredScale>=.78?'scaled':'truncated'};
        }
      }
      if(active)setFit(current=>current.mode===next.mode&&Math.abs(current.tracking-next.tracking)<.01&&Math.abs(current.scale-next.scale)<.005?current:next);
    };
    measure(); const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    if(windowRef.current)observer?.observe(windowRef.current);
    void document.fonts?.ready.then(()=>{if(active)measure()});
    return()=>{active=false;observer?.disconnect()};
  },[name,compact,spec.size,spec.tracking]);
  return{windowRef,measureRef,fit,spec};
}

export function CardFace({card,context='runtime',compact=false,remainingDuration,powerChanging=false,className=''}:CardFaceProps){
  const {style,icon}=cardPresentation(card),{windowRef,measureRef,fit,spec}=useTitleFit(card.name,style,compact);
  const duration=card.duration===undefined?undefined:remainingDuration??card.duration,printed=card.basePower;
  const powerState=card.power===undefined||printed===undefined||card.power===printed?'':card.power>printed?'boosted':'reduced';
  const titleStyle={
    '--cf-title-font-size':`${spec.size}px`, '--cf-title-tracking':`${fit.tracking}px`, '--cf-title-scale':fit.scale,
    width:`${100/fit.scale}%`, marginLeft:`${(100-(100/fit.scale))/2}%`,
  } as CSSProperties;
  return <div className={`cf-card${compact?' cf-card--compact':''}${className?` ${className}`:''}`} data-card-style={style} data-card-context={context} title={card.name}>
    <div className="cf-image-wrap"><img className="cf-art" src={cardArtworkPath(card)} alt="" onError={event=>{if(event.currentTarget.getAttribute('src')!==CARD_ART_PLACEHOLDER)event.currentTarget.src=CARD_ART_PLACEHOLDER}}/></div>
    {duration!==undefined&&<span className="cf-duration" data-card-duration={duration} aria-label={`Duration ${duration===99?'infinite':duration}`}><img src="/assets/Icons/icon-duration.svg" alt=""/><b>{duration===99?'∞':duration}</b></span>}
    {card.power!==undefined&&<b className={`cf-power card-power-value${powerState?` ${powerState}`:''}${powerChanging?' power-changing':''}`} data-card-power={card.power} aria-label={`Power ${card.power}${printed!==undefined?`, printed Power ${printed}`:''}`}>{card.power}</b>}
    {context==='draft'&&<span className="cf-cost" data-card-cost={card.cost} aria-label={`Draft cost ${card.cost}`}><b>{card.cost}</b><img src="/assets/Icons/icon-crypto.svg" alt=""/></span>}
    {!compact&&<div className="cf-title-strip"><img className="cf-class-icon" src={icon} alt=""/><span className="cf-title-window" ref={windowRef}><span className="cf-title card-name" data-title-fit={fit.mode} title={card.name} style={titleStyle}>{card.name}</span></span><span className="cf-title-measure" ref={measureRef} aria-hidden="true">{card.name}</span></div>}
  </div>;
}
