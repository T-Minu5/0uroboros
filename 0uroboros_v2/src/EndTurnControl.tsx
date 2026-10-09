import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {DecisionClock} from './decisionClock';
/** `waiting` is set once this seat has committed and the other has not: the button shows Waiting and takes the commit back. */
type Props={cycle:number;turn:number;seconds:number|null;enabled:boolean;busy:boolean;dealing:boolean;onEnd:()=>void;onConcede:()=>void;waiting?:{undo:()=>void;opponent:string}|null};
export function EndTurnControl(props:Props){
 const {cycle,turn,seconds,enabled,busy,dealing,onEnd,waiting}=props;
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
 if(waiting)return <button className='end-turn turn-waiting' onClick={waiting.undo} aria-label={`Waiting for ${waiting.opponent}; click to resume planning`} data-countdown-rate={rate} style={{'--turn-fill':`${seconds===null?100:remaining/(seconds*1000)*100}%`} as CSSProperties}>
  <span className='turn-caption'>WAITING<small>for {waiting.opponent} · tap to undo</small></span>
  <i className='turn-countdown' role='progressbar' aria-label='Turn countdown' aria-valuemin={0} aria-valuemax={seconds??undefined} aria-valuenow={seconds===null?undefined:Math.ceil(remaining/1000)}><em/></i>
 </button>;
 return <button className={`end-turn ${enabled?'turn-ready':''}`} disabled={!enabled} onClick={onEnd} aria-label={enabled?'End Turn':dealing?'Dealing cards':busy?'Resolving turn':'End Turn unavailable'} data-countdown-rate={rate} style={{'--turn-fill':`${seconds===null?100:remaining/(seconds*1000)*100}%`} as CSSProperties}>
  <span className='turn-caption'>{dealing?'DEALING':busy?'RESOLVING':'END TURN'}<small>{enabled?`${seconds===null?'':`${Math.ceil(remaining/1000)}s · `}TURN ${turn} / 3`:dealing?'Five-card opening':'Follow the Circuit'}</small></span>
  <i className='turn-countdown' role='progressbar' aria-label={seconds===null?'Runtime timer unconfigured':'Turn countdown'} aria-valuemin={0} aria-valuemax={seconds??undefined} aria-valuenow={seconds===null?undefined:Math.ceil(remaining/1000)}><em/></i>
 </button>;
}
