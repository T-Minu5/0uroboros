import { useEffect, useRef, useState } from 'react';
import type { ChoiceOption, RuntimeEvent, SessionView } from '@0uroboros/engine/runtime';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import { formatAmount } from '@0uroboros/engine/transferText';
import type { TransferDrag, TransferView } from './transferDrag';
import './transfer-choice.css';

type Choice=NonNullable<SessionView['choice']>;

/*
 * Fixed 480px stage so arrowheads never stretch: three 160px columns, centres at 80/240/400. The 44px diamonds' side points
 * sit 31px either side of a centre on the diamond row's midline (y 31); push arcs skim just above it, pull arcs just below.
 */
const TRANSFER_ARCS={
 push:{left:'M207 28 C194 23 126 23 113 28',right:'M273 28 C286 23 354 23 367 28'},
 pull:{left:'M113 34 C126 39 194 39 207 34',right:'M367 34 C354 39 286 39 273 34'},
};
const TRANSFER_SIDES=['left','both','right'] as const;
const DIAGRAM_KEY='ouroboros.transferDiagram';

function TransferChoice({choice,choose,view,hover}:{choice:Choice;choose:(id:string)=>void;view:TransferView;hover:(id:string|null)=>void}){
 const transfer=choice.transfer!;
 const [shown,setShown]=useState(()=>localStorage.getItem(DIAGRAM_KEY)!=='hidden');
 const toggle=()=>setShown(value=>{localStorage.setItem(DIAGRAM_KEY,value?'hidden':'shown');return !value;});
 const has=(id:string)=>choice.options.some(option=>option.id===id);
 const label=(id:string)=>choice.options.find(option=>option.id===id)?.label??id;
 const total=(id:string)=>formatAmount((transfer.moves[id]??[]).reduce((sum,move)=>sum+move.amount,0));
 const column=(node:number)=>node<transfer.center?0:node>transfer.center?2:1;
 const slots:(typeof transfer.nodes[number]|null)[]=[null,null,null];
 transfer.nodes.forEach(entry=>{slots[column(entry.node)]=entry;});
 const delta=(node:number)=>view.delta[node]??0;
 const dragging=view.from!==null;
 const arcShown=(mode:'push'|'pull',side:'left'|'right')=>has(`${mode}-${side}`)||has(`${mode}-both`)&&!!slots[side==='left'?0:2];
 const arcActive=(mode:'push'|'pull',side:'left'|'right')=>view.option===`${mode}-${side}`||view.option===`${mode}-both`&&!!slots[side==='left'?0:2];
 const state=(node:number)=>view.over===node?'is-over':view.from===node?'is-origin':dragging?(view.targets.includes(node)?'is-target':''):view.sources.includes(node)?'is-source':'';
 const button=(id:string,mode:'push'|'pull')=>has(id)&&<button type='button' className={`transfer-action transfer-${mode}`} data-choice-option={id} aria-label={label(id)} title={label(id)}
  onMouseEnter={()=>hover(id)} onMouseLeave={()=>hover(null)} onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))hover(id);}} onBlur={()=>hover(null)} onClick={()=>choose(id)}>
  {mode==='push'?'Push':'Pull'} {total(id)}
 </button>;
 const modes=(['push','pull'] as const).filter(mode=>choice.options.some(option=>option.id.startsWith(`${mode}-`)));
 // Push buttons sit on the diamonds' top points and pull buttons on their bottom points.
 const actionRow=(mode:'push'|'pull')=><div className={`transfer-row transfer-${mode}-row`}>
  {TRANSFER_SIDES.map(side=><div key={side}>{button(`${mode}-${side}`,mode)}</div>)}
 </div>;
 return <>
  <div className='transfer-head'>
   <small>{choice.sourceName}</small>
   <button type='button' className='transfer-diagram-toggle' aria-expanded={shown} aria-controls='transfer-diagram' onClick={toggle}>{shown?'Hide diagram':'Show diagram'}</button>
  </div>
  <h2>{choice.icon&&<Icon name={choice.icon}/>}{dragging?'Drop on a glowing location':'Drag power between glowing locations'}</h2>
  <p className='transfer-summary'>{choice.prompt}{dragging&&' Esc cancels.'}</p>
  {shown&&<div id='transfer-diagram' className={`transfer-stage ${dragging?'is-dragging':''}`}>
   {modes.includes('push')&&actionRow('push')}
   <div className='transfer-row transfer-diamonds'>
    <svg className='transfer-arcs' width='480' height='62' viewBox='0 0 480 62' aria-hidden='true'>
     <defs>{modes.map(mode=><marker key={mode} id={`transfer-head-${mode}`} viewBox='0 0 10 10' refX='7' refY='5' markerWidth='6' markerHeight='6' orient='auto-start-reverse'><path d='M0 0 L10 5 L0 10 z'/></marker>)}</defs>
     {modes.flatMap(mode=>(['left','right'] as const).filter(side=>arcShown(mode,side)).map(side=><path key={`${mode}-${side}`} className={`transfer-${mode}-arc ${arcActive(mode,side)?'is-active':''}`} d={TRANSFER_ARCS[mode][side]} markerEnd={`url(#transfer-head-${mode})`}/>))}
    </svg>
    {slots.map((slot,index)=>slot?<div key={slot.node} className={`transfer-node ${index===1?'is-center':''} ${state(slot.node)}`}>
     <span className='transfer-node-id' aria-hidden='true'>N{slot.node+1}</span>
     <span className={`transfer-diamond ${delta(slot.node)>0?'is-gaining':delta(slot.node)<0?'is-losing':''}`} data-transfer-node={slot.node} onPointerDown={event=>view.begin(event,slot.node)} aria-label={`Node ${slot.node+1}, ${slot.name}: your Power ${slot.power}`}><b>{formatAmount(slot.power+delta(slot.node))}</b></span>
     {delta(slot.node)!==0&&<em className='transfer-delta'>{delta(slot.node)>0?'+':'−'}{formatAmount(Math.abs(delta(slot.node)))}</em>}
    </div>:<div key={`empty-${index}`} className='transfer-node is-empty' aria-hidden='true'/>)}
   </div>
   {modes.includes('pull')&&actionRow('pull')}
   <div className='transfer-row transfer-names'>{slots.map((slot,index)=><div key={index} className={slot?'':'is-empty'}>
    {slot&&<small>{slot.name}</small>}
    {slot&&index===1&&<i>This location</i>}
   </div>)}</div>
  </div>}
 </>;
}

/** The lifted Power: follows the pointer from the location it left and lights up over a valid drop. */
export function TransferBadge({drag,amount}:{drag:TransferDrag;amount:number}){
 return <div className={`transfer-badge ${drag.over!==null?'can-drop':''}`} style={{left:drag.x,top:drag.y}} aria-hidden='true'><b>{formatAmount(amount)}</b></div>;
}

/** Circuit-wide announcements, presented like a choice dialog but passive: nothing to click, resolution carries on. */
export function EventMessage({event}:{event:RuntimeEvent}){
 const circuit=event.kind==='circuit', over=event.kind==='gameover';
 return <div className='choice-backdrop event-message'><section className={`choice-dialog event-dialog ${circuit?'circuit-event':''}`} role='status' aria-live='polite'>
  <small>{circuit?'CIRCUIT REWARD':'CIRCUIT TRANSMISSION'}</small>
  <h2>{circuit?'Circuit closed':over?'Session over':'Wave Collapse'}</h2>
  <p>{event.text}</p>
  <footer><span>{over?'Final results follow.':'Resolution continues automatically.'}</span></footer>
 </section></div>;
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
const DECLINE_IDS=['decline','skip'];

/** "Trash 3 cards", "Discard a card", "Select cards": the verb, plus a count once it is known. */
export function confirmLabel(verb:string,select:{min:number;max:number},picked:number,noun='card'){
 const count=select.min===select.max||select.max===1?select.max:picked;
 return count===0?`${verb} ${noun}s`:count===1?`${verb} a${/^[aeiou]/i.test(noun)?'n':''} ${noun}`:`${verb} ${count} ${noun}s`;
}
/** "Select none", "Don't discard", "Don't trash cards". */
export function declineLabel(verb:string,max:number){
 return verb==='Select'?'Select none':`Don't ${verb.toLowerCase()}${max>1?' cards':''}`;
}

export function EffectChoice({choice,choose,transferView,transferHover}:{choice:Choice;choose:(selection:string|string[])=>void;transferView?:TransferView|null;transferHover?:(id:string|null)=>void}){
 const dialog=useRef<HTMLElement>(null);
 const [picked,setPicked]=useState<string[]>([]);
 useEffect(()=>{
  setPicked([]);
  const previous=document.activeElement as HTMLElement|null;
  if(choice.transfer)dialog.current?.focus();
  else dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  return()=>{if(previous?.isConnected)previous.focus();};
 },[choice.id]);
 const nodes=choiceNodes(choice);
 const nodeMode=nodes.length>0;
 const {select,groups}=choice;
 const cardOptions=choice.options.filter(hasCard);
 const declineOption=choice.options.find(option=>!option.card&&DECLINE_IDS.includes(option.id));
 const plainOptions=choice.options.filter(option=>!option.card&&option!==declineOption);
 const verb=choice.verb??'Select';
 /* Single card picks are confirmed too, so every card choice ends on the same verb button. */
 const singleCard=!select&&!groups&&!nodeMode&&cardOptions.length>0;
 const selection=select??(singleCard?{min:declineOption?0:1,max:1}:undefined);
 const confirm=()=>singleCard?choose(picked[0]):choose(picked);
 /* An optional cost: the payment becomes the primary button beside its decline. */
 const payment=!!declineOption&&!cardOptions.length&&!select&&!groups&&!nodeMode;
 const decline=declineOption?()=>choose(declineOption.id):selection?.min===0?()=>choose([]):null;
 const toggle=(id:string)=>setPicked(current=>{
  if(current.includes(id))return current.filter(entry=>entry!==id);
  if(selection&&current.length>=selection.max)return selection.max===1?[id]:current;
  return [...current,id];
 });
 const pickInGroup=(group:string,id:string)=>setPicked(current=>[...current.filter(entry=>choice.options.find(option=>option.id===entry)?.group!==group),id]);
 const ready=groups?groups.every(group=>picked.some(id=>choice.options.find(option=>option.id===id)?.group===group.id)):selection?picked.length>=Math.max(1,selection.min)&&picked.length<=selection.max:false;
 const transfer=!!choice.transfer&&!!transferView;
 const noun=cardOptions.length?'card':'option';
 const heading=nodeMode?'Select a Node':groups?'Decide for each card':select?(cardOptions.length?(select.max===1?'Select a card':'Select cards'):'Make your choices'):cardOptions.length?'Select a card':'Make your choice';
 const instruction=nodeMode?'Click one of the highlighted Nodes on the board.'
  :groups?'Choose an option under every card, then confirm. Nothing resolves until you confirm.'
  :select?`${select.min===select.max?`Select ${select.max}`:select.min?`Select ${select.min} to ${select.max}`:`Select up to ${select.max}`} ${noun}${select.max===1?'':'s'}, then confirm. Nothing resolves until you confirm.`
  :null;
 const footer=nodeMode?'Resolution continues after you select a Node.':groups?`${picked.length} of ${groups.length} decided`:selection?`${picked.length} of ${selection.max} selected`:'Resolution continues after your choice.';
 const primary=groups?'Confirm':selection?confirmLabel(verb,selection,picked.length,noun):null;
 const onBoard=nodeMode||transfer;
 return <div className={`choice-backdrop ${onBoard?'node-choice':''}`}><section ref={dialog} className={`choice-dialog ${cardOptions.length||groups?'has-cards':''} ${transfer?'has-transfer':''}`} role='dialog' tabIndex={-1} aria-modal={onBoard?undefined:'true'} aria-label='Resolve card choice' data-choice-mode={transfer?'transfer':nodeMode?'node':groups?'groups':select?'select':'single'} onKeyDown={event=>{
  if(onBoard||event.key!=='Tab')return;
  const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
  const first=buttons[0],last=buttons[buttons.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }}>
  {transfer?<TransferChoice choice={choice} choose={id=>choose(id)} view={transferView!} hover={id=>transferHover?.(id)}/>:<>
   <small>{choice.sourceName}</small>
   <h2>{choice.icon&&<Icon name={choice.icon}/>}{heading}</h2>
   <p>{choice.prompt}</p>
   {instruction&&<p className='choice-instruction'>{instruction}</p>}
  </>}
  {transfer?null
  :groups?<div className='choice-groups'>{groups.map(group=><div className='choice-group' key={group.id}>
    {group.card?<span className='choice-card-face'><CardFace card={group.card}/></span>:<b>{group.label}</b>}
    <div className='choice-group-actions' role='radiogroup' aria-label={group.label}>{choice.options.filter(option=>option.group===group.id).map(option=><button type='button' key={option.id} role='radio' aria-checked={picked.includes(option.id)} className={picked.includes(option.id)?'selected':''} data-choice-option={option.id} onClick={()=>pickInGroup(group.id,option.id)}>{option.label}</button>)}</div>
   </div>)}</div>
  :<>
   {cardOptions.length>0&&<div className='choice-cards'>{cardOptions.map(option=><CardOption key={option.id} option={option} selected={picked.includes(option.id)} disabled={option.disabled} onClick={()=>toggle(option.id)}/>)}</div>}
   {plainOptions.length>0&&!payment&&<div className={`choice-options ${nodeMode?'node-options':''}`}>{plainOptions.map(option=><button type='button' key={option.id} data-choice-option={option.id} className={select&&picked.includes(option.id)?'selected':''} aria-pressed={select?picked.includes(option.id):undefined} disabled={option.disabled} title={option.disabled?'Cannot pay this cost':undefined} onClick={()=>select?toggle(option.id):choose(option.id)}>{option.label}{option.disabled&&<small className='choice-unpayable'>Cannot pay</small>}</button>)}</div>}
  </>}
  {!transfer&&<footer><span>{footer}</span>{(primary||decline||payment)&&<div className='choice-actions'>
   {decline&&<button type='button' className='choice-decline' data-choice-decline onClick={decline}>{declineLabel(verb,selection?.max??1)}</button>}
   {primary&&<button type='button' className='choice-confirm' disabled={!ready} onClick={confirm}>{primary}</button>}
   {payment&&plainOptions.map(option=><button type='button' key={option.id} className='choice-confirm' data-choice-option={option.id} onClick={()=>choose(option.id)}>{option.label}</button>)}
  </div>}</footer>}
 </section></div>;
}
