import { useEffect, useRef, useState } from 'react';
import type { ChoiceOption, SessionView } from './runtime';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import { formatAmount } from './transferText';
import './transfer-choice.css';

type Choice=NonNullable<SessionView['choice']>;

/* Fixed 432px stage so arrowheads never stretch: three 144px columns, centres at 72/216/360. */
const PUSH_ARC={left:'M216 46 C200 4 96 4 78 40',right:'M216 46 C232 4 336 4 354 40'};
const PULL_ARC={left:'M78 4 C96 44 190 44 202 12',right:'M354 4 C336 44 242 44 230 12'};

function TransferChoice({choice,choose}:{choice:Choice;choose:(id:string)=>void}){
 const transfer=choice.transfer!;
 const [preview,setPreview]=useState<string|null>(null);
 const has=(id:string)=>choice.options.some(option=>option.id===id);
 const label=(id:string)=>choice.options.find(option=>option.id===id)?.label??id;
 const total=(id:string)=>formatAmount((transfer.moves[id]??[]).reduce((sum,move)=>sum+move.amount,0));
 const column=(node:number)=>node<transfer.center?0:node>transfer.center?2:1;
 const slots:(typeof transfer.nodes[number]|null)[]=[null,null,null];
 transfer.nodes.forEach(entry=>{slots[column(entry.node)]=entry;});
 const delta=(node:number)=>(preview?transfer.moves[preview]??[]:[]).reduce((sum,move)=>sum+(move.to===node?move.amount:0)-(move.from===node?move.amount:0),0);
 const arcShown=(mode:'push'|'pull',side:'left'|'right')=>has(`${mode}-${side}`)||has(`${mode}-both`)&&!!slots[side==='left'?0:2];
 const arcActive=(mode:'push'|'pull',side:'left'|'right')=>preview===`${mode}-${side}`||preview===`${mode}-both`&&!!slots[side==='left'?0:2];
 const button=(id:string,mode:'push'|'pull')=>has(id)&&<button type='button' className={`transfer-action transfer-${mode}`} data-choice-option={id} aria-label={label(id)} title={label(id)}
  onMouseEnter={()=>setPreview(id)} onMouseLeave={()=>setPreview(null)} onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))setPreview(id);}} onBlur={()=>setPreview(null)} onClick={()=>choose(id)}>
  {mode==='push'?'Push':'Pull'} {total(id)}
 </button>;
 const actionRow=(mode:'push'|'pull')=><div className={`transfer-row transfer-${mode}-row`}>
  <div>{button(`${mode}-left`,mode)}</div><div>{button(`${mode}-both`,mode)}</div><div>{button(`${mode}-right`,mode)}</div>
 </div>;
 const arcs=(mode:'push'|'pull')=>(['left','right'] as const).some(side=>arcShown(mode,side))&&<svg className={`transfer-arcs transfer-${mode}-arcs`} width='432' height='48' viewBox='0 0 432 48' aria-hidden='true'>
  <defs><marker id={`transfer-head-${mode}`} viewBox='0 0 10 10' refX='7' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'><path d='M0 0 L10 5 L0 10 z'/></marker></defs>
  {(['left','right'] as const).filter(side=>arcShown(mode,side)).map(side=><path key={side} className={arcActive(mode,side)?'is-active':''} d={(mode==='push'?PUSH_ARC:PULL_ARC)[side]} markerEnd={`url(#transfer-head-${mode})`}/>)}
 </svg>;
 const hasPull=choice.options.some(option=>option.id.startsWith('pull-'));
 const hasPush=choice.options.some(option=>option.id.startsWith('push-'));
 return <div className='transfer-stage'>
  {hasPush&&actionRow('push')}
  {hasPush&&arcs('push')}
  <div className='transfer-row transfer-diamonds'>{slots.map((slot,index)=>slot?<div key={slot.node} className={`transfer-node ${index===1?'is-center':''}`}>
   <span className={`transfer-diamond ${delta(slot.node)>0?'is-gaining':delta(slot.node)<0?'is-losing':''}`} aria-label={`${slot.name}: your Power ${slot.power}`}><b>{formatAmount(slot.power+delta(slot.node))}</b></span>
   {delta(slot.node)!==0&&<em className='transfer-delta'>{delta(slot.node)>0?'+':'−'}{formatAmount(Math.abs(delta(slot.node)))}</em>}
   <small>{slot.name}</small>
   {index===1&&<i>This location</i>}
  </div>:<div key={`empty-${index}`} className='transfer-node is-empty' aria-hidden='true'/>)}</div>
  {hasPull&&arcs('pull')}
  {hasPull&&actionRow('pull')}
 </div>;
}

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
 const transfer=!!choice.transfer;
 const heading=transfer?choice.prompt.replace(/\.$/,''):nodeMode?'Select a Node':groups?'Decide for each card':select?(select.max===1?'Select a card':'Select cards'):cardOptions.length?'Select a card':'Make your choice';
 const instruction=nodeMode?'Click one of the highlighted Nodes on the board.'
  :groups?'Choose an option under every card, then confirm. Nothing resolves until you confirm.'
  :select?`${select.min===select.max?`Select ${select.max}`:select.min?`Select ${select.min} to ${select.max}`:`Select up to ${select.max}`} card${select.max===1?'':'s'}, then confirm. Nothing resolves until you confirm.`
  :null;
 const footer=nodeMode?'Resolution continues after you select a Node.':groups?`${picked.length} of ${groups.length} decided`:select?`${picked.length} of ${select.max} selected`:'Resolution continues after your choice.';
 return <div className={`choice-backdrop ${nodeMode?'node-choice':''}`}><section ref={dialog} className={`choice-dialog ${cardOptions.length||groups?'has-cards':''} ${transfer?'has-transfer':''}`} role='dialog' aria-modal={nodeMode?undefined:'true'} aria-label='Resolve card choice' data-choice-mode={transfer?'transfer':nodeMode?'node':groups?'groups':select?'select':'single'} onKeyDown={event=>{
  if(nodeMode||event.key!=='Tab')return;
  const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
  const first=buttons[0],last=buttons[buttons.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}>
  <small>{choice.sourceName}</small>
  <h2>{choice.icon&&<Icon name={choice.icon}/>}{heading}</h2>
  {!transfer&&<p>{choice.prompt}</p>}
  {instruction&&<p className='choice-instruction'>{instruction}</p>}
  {transfer?<TransferChoice choice={choice} choose={id=>choose(id)}/>
  :groups?<div className='choice-groups'>{groups.map(group=><div className='choice-group' key={group.id}>
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
