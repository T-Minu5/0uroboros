import { useEffect, useRef } from 'react';
import type { SessionView } from './runtime';

export function EffectChoice({choice,choose}:{choice:NonNullable<SessionView['choice']>;choose:(id:string)=>void}){
 const dialog=useRef<HTMLElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  return()=>{if(previous?.isConnected)previous.focus();};
 },[choice.id]);
 return <div className='choice-backdrop'><section ref={dialog} className='choice-dialog' role='dialog' aria-modal='true' aria-label='Resolve card choice' onKeyDown={event=>{
  if(event.key!=='Tab')return;
  const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button')??[]);
  const first=buttons[0],last=buttons[buttons.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}><small>{choice.sourceName}</small><h2>Make your choice</h2><p>{choice.prompt}</p><div className='choice-options'>{choice.options.map(option=><button key={option.id} data-choice-option={option.id} onClick={()=>choose(option.id)}>{option.label}</button>)}</div><footer>Resolution continues after your choice.</footer></section></div>;
}
