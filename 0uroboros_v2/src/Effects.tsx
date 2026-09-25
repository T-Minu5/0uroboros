import { useLayoutEffect, useState, type CSSProperties } from 'react';
import type { RuntimeEvent } from './runtime';
import './card-effect-motion.css';
type Geometry={path:string;sx:number;sy:number;tx:number;ty:number};
export function EffectPath({event,duration}:{event:RuntimeEvent;duration:number}){
 const [geometry,setGeometry]=useState<Geometry|null>(null);
 useLayoutEffect(()=>{
  if(event.kind==='morph')return;
  const nodeTransfer=event.kind==='move'||event.kind==='probability'||event.kind==='power'&&event.targetNode!==undefined;
  if(!nodeTransfer&&!event.targetCardId&&(!event.target||event.amount===undefined||event.amount===0))return;
  const card=event.cardId?document.querySelector(`[data-card-id="${CSS.escape(event.cardId)}"]`):null;
  const location=event.node!==undefined?document.querySelector(`[data-location-node="${event.node}"]`):null;
  const node=event.node!==undefined?document.querySelector(`[data-node-drop="${event.node}"]`):null;
  const privilege=event.source==='circuit'?document.querySelector('[data-circuit-source]'):null;
  const sourceWeight=nodeTransfer&&event.sourceNode!==undefined?document.querySelector(`[data-location-node="${event.sourceNode}"]`):null;
  const source=sourceWeight??privilege??(event.source==='location'?location:card)??location??node;
  const owner=event.targetOwner??event.owner??0;
  const draftTarget=event.source==='circuit'?document.querySelector(`[data-draft-resource="${owner}-${event.target}"]`):null;
  const nodeTarget=nodeTransfer&&event.targetNode!==undefined?document.querySelector(event.kind!=='move'?`[data-location-node="${event.targetNode}"]`:`[data-lane-node="${event.targetNode}"][data-lane-owner="${owner}"]`):null;
  const targetCard=event.kind==='power'&&event.targetCardId?document.querySelector(`.field-card[data-card-id="${CSS.escape(event.targetCardId)}"]`):null;
  const target=targetCard??nodeTarget??draftTarget??document.querySelector(event.target==='trash'?'[data-resource="trash"]':event.target==='primary'||event.target==='backup'?`[data-dc="${owner}-${event.target}"]`:`[data-resource="${owner}-${event.target}"]`);
  if(!source||!target)return;
  const a=source.getBoundingClientRect(),b=target.getBoundingClientRect();
  const sx=a.x+a.width/2,sy=a.y+a.height/2,tx=b.x+b.width/2,ty=b.y+b.height/2;
  setGeometry({path:`M ${sx} ${sy} Q ${(sx+tx)/2} ${Math.min(sy,ty)-65} ${tx} ${ty}`,sx,sy,tx,ty});
 },[event]);
 if(!geometry)return null;
 const label=event.kind==='probability'?'%':event.target==='wallet'?'Crypto':event.target==='vp'?'VP':event.target==='hand'?'Cards':event.target==='actions'?'Actions':event.kind==='restore'?'Integrity restored':'Integrity';
 const negative=event.after!==undefined&&event.before!==undefined?event.after<event.before:event.kind==='drain';
 return <><svg className={`effect-path ${event.kind} ${event.source==='circuit'?'privilege-path':''}`} aria-hidden='true' style={{'--effect-duration':`${duration}ms`} as CSSProperties}><circle className='source-activation' cx={geometry.sx} cy={geometry.sy} r='16'/><path className='effect-guide' d={geometry.path}/><path className='effect-trace' d={geometry.path} pathLength='1'/><circle r='5'><animateMotion dur={`${duration*.4}ms`} begin={`${duration*.2}ms`} path={geometry.path} fill='freeze'/><animate attributeName='opacity' values='0;0;1;1;0' keyTimes='0;.19;.2;.6;1' dur={`${duration}ms`} fill='freeze'/></circle></svg>{event.kind!=='trash'&&event.kind!=='move'&&event.kind!=='power'&&event.target!=='primary'&&event.target!=='backup'&&event.target!=='actions'&&event.target!=='wallet'&&<div className={`resource-arrival ${event.kind} ${event.source==='circuit'?'privilege-path':''}`} style={{left:geometry.tx,top:geometry.ty-24,'--effect-duration':`${duration}ms`} as CSSProperties}><b>{negative?'−':'+'}{event.amount}</b><span>{label}</span></div>}</>;
}

/** Snapshot the visible card before the contact beat updates its authoritative lane. */
export function CardEffectMotion({event,duration}:{event:RuntimeEvent;duration:number}){
 useLayoutEffect(()=>{
  if(event.kind==='morph'){
   const cardId=event.targetCardId;
   if(!cardId)return;
   const card=document.querySelector<HTMLElement>(`.field-card[data-card-id="${CSS.escape(cardId)}"], .bank-slot[data-card-id="${CSS.escape(cardId)}"]`);
   if(!card)return;
   card.dataset.morphingCard=cardId;
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const glow='drop-shadow(0 0 10px #bc49ff) drop-shadow(0 0 20px #654cff)';
   const animation=card.animate(reduced?[
    {filter:'none',opacity:1},
    {filter:glow,opacity:.35,offset:.59},
    {filter:glow,opacity:.35,offset:.61},
    {filter:'none',opacity:1},
   ]:[
    {transform:'perspective(650px) rotateY(0deg)',filter:'none'},
    {transform:'perspective(650px) rotateY(90deg)',filter:glow,offset:.59},
    {transform:'perspective(650px) rotateY(-90deg)',filter:glow,offset:.61},
    {transform:'perspective(650px) rotateY(0deg)',filter:'none'},
   ],{duration,easing:'ease-in-out',fill:'both'});
   return()=>{animation.cancel();delete card.dataset.morphingCard;};
  }
  if(event.kind!=='move'||event.targetNode===undefined)return;
  const cardId=event.targetCardId??event.cardId;
  if(!cardId)return;
  const source=document.querySelector<HTMLElement>(`.field-card[data-card-id="${CSS.escape(cardId)}"]`);
  const lane=document.querySelector<HTMLElement>(`[data-lane-node="${event.targetNode}"][data-lane-owner="${event.targetOwner??event.owner??0}"]`);
  if(!source||!lane)return;
  const start=source.getBoundingClientRect(),end=lane.getBoundingClientRect();
  const index=lane.querySelectorAll('.field-card').length;
  const style=getComputedStyle(lane),scale=end.width/lane.offsetWidth;
  const gapX=(parseFloat(style.columnGap)||0)*scale,gapY=(parseFloat(style.rowGap)||0)*scale;
  const x=end.left+(end.width-2*start.width-gapX)/2+(index%2)*(start.width+gapX);
  const y=end.top+(end.height-2*start.height-gapY)/2+Math.floor(index/2)*(start.height+gapY);
  const wrapper=document.createElement('div');
  wrapper.className='card-effect-flight';wrapper.dataset.movingCard=cardId;wrapper.setAttribute('aria-hidden','true');
  Object.assign(wrapper.style,{left:`${start.left}px`,top:`${start.top}px`,width:`${start.width}px`,height:`${start.height}px`});
  const copy=source.cloneNode(true) as HTMLElement;
  const originals=[source,...source.querySelectorAll<HTMLElement>('*')];
  const copies=[copy,...copy.querySelectorAll<HTMLElement>('*')];
  originals.forEach((original,i)=>{
   const computed=getComputedStyle(original);
   for(const property of computed)copies[i].style.setProperty(property,computed.getPropertyValue(property));
   copies[i].removeAttribute('data-card-id');copies[i].removeAttribute('id');copies[i].setAttribute('tabindex','-1');
  });
  Object.assign(copy.style,{position:'absolute',left:'0',top:'0',margin:'0',transform:`scale(${start.width/source.offsetWidth})`,transformOrigin:'top left',animation:'none',visibility:'visible'});
  wrapper.append(copy);document.body.append(wrapper);
  const previousVisibility=source.style.visibility;source.style.visibility='hidden';
  lane.classList.add('effect-move-destination');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation=wrapper.animate(reduced?[
   {transform:`translate(${x-start.left}px,${y-start.top}px)`,opacity:0},
   {transform:`translate(${x-start.left}px,${y-start.top}px)`,opacity:1},
  ]:[
   {transform:'translate(0,0) scale(1)'},
   {transform:`translate(${(x-start.left)*.45}px,${(y-start.top)*.45-28}px) scale(1.13)`,offset:.45},
   {transform:`translate(${x-start.left}px,${y-start.top}px) scale(1)`},
  ],{duration:duration*.45,delay:duration*.15,easing:'ease-in-out',fill:'both'});
  const timer=window.setTimeout(()=>{wrapper.remove();source.style.visibility=previousVisibility;},duration*.60);
  return()=>{clearTimeout(timer);animation.cancel();wrapper.remove();source.style.visibility=previousVisibility;lane.classList.remove('effect-move-destination');};
 },[event,duration]);
 return null;
}
