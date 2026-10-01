import { useEffect, useRef, useState } from 'react';
import type { ChoiceOption, SessionView } from './runtime';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';

type Choice=NonNullable<SessionView['choice']>;

/** Node choices are made on the board, so the dialog leaves the table uncovered and clickable. */
export const choiceNodes=(choice:Choice)=>choice.select||choice.groups?[]:choice.options.flatMap(option=>option.node===undefined?[]:[option.node]);

function CardOption({option,selected,onClick,disabled}:{option:ChoiceOption&{card:NonNullable<ChoiceOption['card']>};selected?:boolean;onClick:()=>void;disabled?:boolean}){
 const location=option.label.includes(' · ')?option.label.slice(option.label.indexOf(' · ')+3):null;
 return <button type='button' className={`choice-card ${selected?'selected':''}`} data-choice-option={option.id} aria-pressed={selected===undefined?undefined:selected} aria-label={option.label} disabled={disabled} onClick={onClick}>
  <span className='choice-card-face'><CardFace card={option.card}/></span>
  {location&&<small>{location}</small>}
 </button>;
}
const hasCard=(option:ChoiceOption):option is ChoiceOption&{card:NonNullable<ChoiceOption['card']>}=>!!option.card;

export function EffectChoice({choice,choose}:{choice:Choice;choose:(selection:string|string[])=>void}){
 const dialog=useRef<HTMLElement>(null);
 const [picked,setPicked]=useState<string[]>([]);
 useEffect(()=>{
  setPicked([]);
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  return()=>{if(previous?.isConnected)previous.focus();};
 },[choice.id]);
 const nodes=choiceNodes(choice);
 const nodeMode=nodes.length>0;
 const {select,groups}=choice;
 const cardOptions=choice.options.filter(hasCard), plainOptions=choice.options.filter(option=>!option.card);
 const toggle=(id:string)=>setPicked(current=>{
  if(current.includes(id))return current.filter(entry=>entry!==id);
  if(select&&current.length>=select.max)return select.max===1?[id]:current;
  return [...current,id];
 });
 const pickInGroup=(group:string,id:string)=>setPicked(current=>[...current.filter(entry=>choice.options.find(option=>option.id===entry)?.group!==group),id]);
 const ready=groups?groups.every(group=>picked.some(id=>choice.options.find(option=>option.id===id)?.group===group.id)):select?picked.length>=select.min&&picked.length<=select.max:false;
 const heading=nodeMode?'Select a Node':groups?'Decide for each card':select?(select.max===1?'Select a card':'Select cards'):cardOptions.length?'Select a card':'Make your choice';
 const instruction=nodeMode?'Click one of the highlighted Nodes on the board.'
  :groups?'Choose an option under every card, then confirm. Nothing resolves until you confirm.'
  :select?`${select.min===select.max?`Select ${select.max}`:select.min?`Select ${select.min} to ${select.max}`:`Select up to ${select.max}`} card${select.max===1?'':'s'}, then confirm. Nothing resolves until you confirm.`
  :null;
 const footer=nodeMode?'Resolution continues after you select a Node.':groups?`${picked.length} of ${groups.length} decided`:select?`${picked.length} of ${select.max} selected`:'Resolution continues after your choice.';
 return <div className={`choice-backdrop ${nodeMode?'node-choice':''}`}><section ref={dialog} className={`choice-dialog ${cardOptions.length||groups?'has-cards':''}`} role='dialog' aria-modal={nodeMode?undefined:'true'} aria-label='Resolve card choice' data-choice-mode={nodeMode?'node':groups?'groups':select?'select':'single'} onKeyDown={event=>{
  if(nodeMode||event.key!=='Tab')return;
  const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
  const first=buttons[0],last=buttons[buttons.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}>
  <small>{choice.sourceName}</small>
  <h2>{choice.icon&&<Icon name={choice.icon}/>}{heading}</h2>
  <p>{choice.prompt}</p>
  {instruction&&<p className='choice-instruction'>{instruction}</p>}
  {groups?<div className='choice-groups'>{groups.map(group=><div className='choice-group' key={group.id}>
    {group.card?<span className='choice-card-face'><CardFace card={group.card}/></span>:<b>{group.label}</b>}
    <div className='choice-group-actions' role='radiogroup' aria-label={group.label}>{choice.options.filter(option=>option.group===group.id).map(option=><button type='button' key={option.id} role='radio' aria-checked={picked.includes(option.id)} className={picked.includes(option.id)?'selected':''} data-choice-option={option.id} onClick={()=>pickInGroup(group.id,option.id)}>{option.label}</button>)}</div>
   </div>)}</div>
  :<>
   {cardOptions.length>0&&<div className='choice-cards'>{cardOptions.map(option=>select
    ?<CardOption key={option.id} option={option} selected={picked.includes(option.id)} onClick={()=>toggle(option.id)}/>
    :<CardOption key={option.id} option={option} onClick={()=>choose(option.id)}/>)}</div>}
   {plainOptions.length>0&&<div className={`choice-options ${nodeMode?'node-options':''}`}>{plainOptions.map(option=><button type='button' key={option.id} data-choice-option={option.id} className={select&&picked.includes(option.id)?'selected':''} aria-pressed={select?picked.includes(option.id):undefined} onClick={()=>select?toggle(option.id):choose(option.id)}>{option.label}</button>)}</div>}
  </>}
  <footer>{(select||groups)&&<button type='button' className='choice-confirm' disabled={!ready} onClick={()=>choose(picked)}>Confirm</button>}<span>{footer}</span></footer>
 </section></div>;
}
