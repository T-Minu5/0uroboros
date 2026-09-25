import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {DecisionClock} from './decisionClock';
type Props={cycle:number;turn:number;seconds:number|null;enabled:boolean;busy:boolean;dealing:boolean;onEnd:()=>void;onConcede:()=>void};
export function EndTurnControl(props:Props){
 const {cycle,turn,seconds,enabled,busy,dealing,onEnd}=props;
 const clock=useRef(new DecisionClock()),latest=useRef(props);latest.current=props;
 const [remaining,setRemaining]=useState((seconds??0)*1000),[rate,setRate]=useState(1);
 useEffect(()=>{
  clock.current.begin(`${cycle}-${turn}`,seconds);setRemaining(clock.current.remaining);setRate(clock.current.rate);
  let last=performance.now();
  const input=()=>{if(latest.current.cycle>0){clock.current.input();setRate(1);}};
  window.addEventListener('pointerdown',input,true);window.addEventListener('keydown',input,true);
  const timer=window.setInterval(()=>{const now=performance.now();if(latest.current.enabled){const result=clock.current.tick(now-last);setRemaining(clock.current.remaining);if(result==='concede')latest.current.onConcede();else if(result==='turn')latest.current.onEnd();}last=now;},100);
  return()=>{clearInterval(timer);window.removeEventListener('pointerdown',input,true);window.removeEventListener('keydown',input,true);};
 },[cycle,turn,seconds]);
 return <button className={`end-turn ${enabled?'turn-ready':''}`} disabled={!enabled} onClick={onEnd} aria-label={enabled?'End Turn':dealing?'Dealing cards':busy?'Resolving turn':'End Turn unavailable'} data-countdown-rate={rate} style={{'--turn-fill':`${seconds===null?100:remaining/(seconds*1000)*100}%`} as CSSProperties}>
  <span className='turn-caption'>{dealing?'DEALING':busy?'RESOLVING':'END TURN'}<small>{enabled?`${seconds===null?'':`${Math.ceil(remaining/1000)}s · `}TURN ${turn} / 3`:dealing?'Five-card opening':'Follow the Circuit'}</small></span>
  <i className='turn-countdown' role='progressbar' aria-label={seconds===null?'Runtime timer unconfigured':'Turn countdown'} aria-valuemin={0} aria-valuemax={seconds??undefined} aria-valuenow={seconds===null?undefined:Math.ceil(remaining/1000)}><em/></i>
 </button>;
}
