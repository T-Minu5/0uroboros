import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from './game';

export type CardOrigin = {x:number;y:number;width:number;height:number;angle?:number};
type Callbacks = {
 enabled:boolean;
 onStart:(card:Card)=>void;
 onHover:(node:number|null)=>void;
 onEnd:()=>void;
 onDrop:(node:number,card:Card,origin:CardOrigin)=>void;
 canDrop:(node:number,card:Card)=>boolean;
};
type Gesture = {
 card:Card; element:HTMLButtonElement; pointer:number; x:number;y:number;
 ghost:HTMLButtonElement|null; matrix:string; left:number;top:number; node:number|null;
};

// Preserve the fan/hover transform and the exact grab point when lifting a card.
function pose(element:HTMLElement){
 const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
 const matrix=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);
 const [ox,oy]=style.transformOrigin.split(' ').map(Number.parseFloat);
 const corners=[[0,0],[element.offsetWidth,0],[0,element.offsetHeight],[element.offsetWidth,element.offsetHeight]].map(([x,y])=>({
  x:matrix.a*(x-ox)+matrix.c*(y-oy)+matrix.e+ox,
  y:matrix.b*(x-ox)+matrix.d*(y-oy)+matrix.f+oy,
 }));
 return {left:rect.left-Math.min(...corners.map(p=>p.x)),top:rect.top-Math.min(...corners.map(p=>p.y)),matrix:style.transform,origin:style.transformOrigin};
}

export function useCardPointerDrag(callbacks:Callbacks){
 const latest=useRef(callbacks);latest.current=callbacks;
 const gesture=useRef<Gesture|null>(null);
 const suppressClick=useRef(false);
 const returning=useRef(new Set<{ghost:HTMLElement;element:HTMLElement;animation:Animation}>());

 function end(cancel=false){
  const drag=gesture.current;if(!drag)return;
  gesture.current=null;
  if(drag.element.hasPointerCapture(drag.pointer))drag.element.releasePointerCapture(drag.pointer);
  document.documentElement.classList.remove('card-dragging');
  if(!drag.ghost)return;
  const ghost=drag.ghost;
  latest.current.onHover(null);
  const accepted=!cancel&&drag.node!==null&&latest.current.canDrop(drag.node,drag.card);
  if(accepted){
   const rect=ghost.getBoundingClientRect(),matrix=new DOMMatrixReadOnly(getComputedStyle(ghost).transform);
   const width=ghost.offsetWidth,height=ghost.offsetHeight;
   latest.current.onDrop(drag.node!,drag.card,{x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height,angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI});
   ghost.remove();drag.element.style.removeProperty('opacity');latest.current.onEnd();
  }else{
   latest.current.onEnd();
   const target=pose(drag.element);
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   const animation=ghost.animate([{left:ghost.style.left,top:ghost.style.top,transform:ghost.style.transform},{left:`${target.left}px`,top:`${target.top}px`,transform:target.matrix}],{duration:reduced?1:180,easing:'cubic-bezier(.2,.75,.2,1)',fill:'forwards'});
   const item={ghost,element:drag.element,animation};returning.current.add(item);
   animation.onfinish=()=>{ghost.remove();drag.element.style.removeProperty('opacity');returning.current.delete(item);};
  }
 }

 useEffect(()=>{if(!callbacks.enabled&&gesture.current)end(true);},[callbacks.enabled]);

 useEffect(()=>{
  const move=(event:PointerEvent)=>{
   const drag=gesture.current;if(!drag||drag.pointer!==event.pointerId)return;
   const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
   if(!drag.ghost&&Math.hypot(dx,dy)<5)return;
   if(!latest.current.enabled){end(true);return;}
   event.preventDefault();
   if(!drag.ghost){
    const current=pose(drag.element);drag.left=current.left;drag.top=current.top;drag.matrix=current.matrix;
    const ghost=drag.element.cloneNode(true) as HTMLButtonElement;
    ghost.classList.remove('dragging');ghost.classList.add('pointer-card');
    ghost.removeAttribute('data-card-id');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.draggable=false;
    Object.assign(ghost.style,{left:`${drag.left}px`,top:`${drag.top}px`,width:`${drag.element.offsetWidth}px`,height:`${drag.element.offsetHeight}px`,transformOrigin:current.origin});
    document.body.appendChild(ghost);drag.ghost=ghost;drag.element.style.opacity='0';
    document.documentElement.classList.add('card-dragging');suppressClick.current=true;latest.current.onStart(drag.card);
   }
   drag.ghost.style.transform=`translate3d(${dx}px,${dy}px,0) ${drag.matrix==='none'?'':drag.matrix}`;
   const lane=[...document.querySelectorAll<HTMLElement>('[data-lane-drop]')].find(element=>{
    const r=element.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
   });
   const node=lane?Number(lane.dataset.laneDrop):null;
   if(node!==drag.node){drag.node=node;latest.current.onHover(node);}
   drag.ghost.dataset.dropAllowed=String(node!==null&&latest.current.canDrop(node,drag.card));
  };
  const up=(event:PointerEvent)=>{if(gesture.current?.pointer===event.pointerId)end();};
  const cancel=(event:PointerEvent)=>{if(gesture.current?.pointer===event.pointerId)end(true);};
  const blur=()=>end(true);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&gesture.current){event.preventDefault();end(true);}};
  const click=(event:MouseEvent)=>{if(event.detail&&suppressClick.current){event.preventDefault();event.stopImmediatePropagation();suppressClick.current=false;}};
  const down=()=>{suppressClick.current=false;};
  window.addEventListener('click',click,true);window.addEventListener('pointerdown',down,true);
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',blur);window.addEventListener('keydown',escape);
  return()=>{
   window.removeEventListener('click',click,true);window.removeEventListener('pointerdown',down,true);
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',blur);window.removeEventListener('keydown',escape);
   const current=gesture.current;current?.ghost?.remove();current?.element.style.removeProperty('opacity');gesture.current=null;
   returning.current.forEach(item=>{item.animation.cancel();item.ghost.remove();item.element.style.removeProperty('opacity');});returning.current.clear();document.documentElement.classList.remove('card-dragging');
  };
 },[]);

 return (event:ReactPointerEvent<HTMLButtonElement>,card:Card)=>{
  if(!latest.current.enabled||card.type==='Crypto'||!event.isPrimary||event.button!==0||gesture.current)return;
  const element=event.currentTarget;
  // A quick retry can grab the card before its previous return animation ends.
  for(const item of returning.current){
   if(item.element!==element)continue;
   item.animation.cancel();item.ghost.remove();element.style.removeProperty('opacity');returning.current.delete(item);
  }
  element.setPointerCapture(event.pointerId);
  gesture.current={card,element,pointer:event.pointerId,x:event.clientX,y:event.clientY,ghost:null,matrix:'none',left:0,top:0,node:null};
 };
}
