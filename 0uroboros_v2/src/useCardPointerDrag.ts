import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Card } from './game';
import { depthRenderer, type DepthArtHandle } from './depthArt/DepthArtRenderer';
import { depthEntry } from './depthArt/depthManifest';
import { SIDE_GAIN, VERTICAL_GAIN, leanFraction, restingTilt, sampleVelocity, stepTilt, tiltEye, type DragTilt } from './depthArt/dragTilt';
import { springRelease, type Release } from './cardSpring';

/** `release` carries the drop's momentum and lean into whatever animates the landing; absent under reduced motion. */
export type CardOrigin = {x:number;y:number;width:number;height:number;angle?:number;release?:Release&{perspective:number}};
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
 ghost:HTMLButtonElement|null; matrix:string; origin:string; left:number;top:number; node:number|null;
 dx:number;dy:number; lastX:number;lastY:number;lastT:number; tilt:DragTilt; pivot:{x:number;y:number}; perspective:number; frame:number;
};

/** Viewing distance in card widths. Close enough that a lean visibly foreshortens the far edge. */
const PERSPECTIVE_WIDTHS = 5;
/** Depth strength of the lifted card's art: 2.3× the base counter-move, with the same axis gains as the lean. */
const DRAG_DEPTH_BOOST = 2.3 * 1.3 * SIDE_GAIN;
const DRAG_DEPTH_VERTICAL = VERTICAL_GAIN / SIDE_GAIN;
const ghostDepth = new WeakMap<HTMLElement,DepthArtHandle[]>();

/**
 * The lifted card leans into its motion about its own centre. `pivot` is that centre relative
 * to the transform origin after the card's fan/scale matrix, so the lean never shifts the card.
 */
function ghostTransform(drag:Gesture){
 const base=drag.matrix==='none'?'':drag.matrix,move=`translate3d(${drag.dx}px,${drag.dy}px,0)`;
 const {rx,ry,rz}=drag.tilt;
 if(Math.abs(rx)+Math.abs(ry)+Math.abs(rz)<.01)return `${move} ${base}`;
 const {x,y}=drag.pivot;
 return `${move} translate(${x}px,${y}px) perspective(${drag.perspective}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) translate(${-x}px,${-y}px) ${base}`;
}
/** Straight blend of two 2D transforms; the hand's fan and hover poses differ only by small turns and scales. */
function blendMatrix(from:string,to:string,t:number){
 const a=new DOMMatrixReadOnly(from==='none'?undefined:from),b=new DOMMatrixReadOnly(to==='none'?undefined:to);
 const mix=(p:number,q:number)=>p+(q-p)*t;
 return `matrix(${mix(a.a,b.a)},${mix(a.b,b.b)},${mix(a.c,b.c)},${mix(a.d,b.d)},${mix(a.e,b.e)},${mix(a.f,b.f)})`;
}
/** Shadow and sheen follow the lean: -1..1 per axis, plus overall strength. */
function paintLean(ghost:HTMLElement,tilt:DragTilt){
 const {x,y}=leanFraction(tilt);
 ghost.style.setProperty('--lean-x',x.toFixed(3));
 ghost.style.setProperty('--lean-y',y.toFixed(3));
 ghost.style.setProperty('--lean',Math.min(1,Math.hypot(x,y)).toFixed(3));
 const eye=tiltEye(tilt);
 ghostDepth.get(ghost)?.forEach(handle=>handle.setLean(eye));
}
/** Cards show their flat art; only a card lifted from the hand gets a depth layer, faded in over the image. Played cards stay flat. */
function attachGhostDepth(element:HTMLElement,ghost:HTMLElement){
 if(element.closest('.world-anchor'))return;
 const renderer=depthRenderer();if(!renderer)return;
 const handles=[...ghost.querySelectorAll<HTMLElement>('[data-depth-art-src]')].flatMap(wrap=>{
  const entry=depthEntry(wrap.dataset.depthArtSrc);if(!entry)return [];
  const canvas=document.createElement('canvas');canvas.className='cf-art cf-art-depth';canvas.dataset.depthArt='';canvas.setAttribute('aria-hidden','true');
  const image=wrap.querySelector('img.cf-art');if(image)image.after(canvas);else wrap.prepend(canvas);
  return [renderer.attach(canvas,entry,Number(wrap.dataset.depthIntensity??1)*DRAG_DEPTH_BOOST,DRAG_DEPTH_VERTICAL)];
 });
 if(handles.length)ghostDepth.set(ghost,handles);
}
function pivotOf(element:HTMLElement,matrix:string,origin:string){
 const m=new DOMMatrixReadOnly(matrix==='none'?undefined:matrix);
 const [ox=0,oy=0]=origin.split(' ').map(Number.parseFloat);
 const cx=element.offsetWidth/2-ox,cy=element.offsetHeight/2-oy;
 return {x:m.a*cx+m.c*cy+m.e,y:m.b*cx+m.d*cy+m.f};
}
// Preserve the fan/hover transform and the exact grab point when lifting a card.
// Board cards also inherit their World Anchor's projection scale, which the lifted ghost must keep.
function pose(element:HTMLElement){
 const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
 const own=new DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);
 const [ox,oy]=style.transformOrigin.split(' ').map(Number.parseFloat);
 const box=[[0,0],[element.offsetWidth,0],[0,element.offsetHeight],[element.offsetWidth,element.offsetHeight]];
 const project=(m:DOMMatrixReadOnly)=>box.map(([x,y])=>({x:m.a*(x-ox)+m.c*(y-oy)+m.e+ox,y:m.b*(x-ox)+m.d*(y-oy)+m.f+oy}));
 const ownXs=project(own).map(p=>p.x),ownWidth=Math.max(...ownXs)-Math.min(...ownXs);
 const inherited=ownWidth>0?rect.width/ownWidth:1,k=Math.abs(inherited-1)<.01?1:inherited;
 const matrix=k===1?own:new DOMMatrixReadOnly([k*own.a,k*own.b,k*own.c,k*own.d,k*own.e,k*own.f]);
 const corners=project(matrix);
 return {left:rect.left-Math.min(...corners.map(p=>p.x)),top:rect.top-Math.min(...corners.map(p=>p.y)),matrix:k===1?style.transform:matrix.toString(),origin:style.transformOrigin};
}

// Board-card styles are scoped to `.world-anchor`, so their ghost rides in an unscaled host carrying that class.
function mountGhost(element:HTMLElement,ghost:HTMLElement){
 if(!element.closest('.world-anchor')){document.body.appendChild(ghost);return;}
 const host=document.createElement('div');host.className='world-anchor pointer-card-host';host.append(ghost);document.body.appendChild(host);
}
function discardGhost(ghost:HTMLElement){
 ghostDepth.get(ghost)?.forEach(handle=>handle.detach());ghostDepth.delete(ghost);
 const host=ghost.parentElement;
 if(host?.classList.contains('pointer-card-host'))host.remove();else ghost.remove();
}

export function useCardPointerDrag(callbacks:Callbacks){
 const latest=useRef(callbacks);latest.current=callbacks;
 const gesture=useRef<Gesture|null>(null);
 const suppressClick=useRef(false);
 const returning=useRef(new Set<{ghost:HTMLElement;element:HTMLElement;cancel:()=>void}>());

 function end(cancel=false){
  const drag=gesture.current;if(!drag)return;
  gesture.current=null;
  cancelAnimationFrame(drag.frame);
  if(drag.element.hasPointerCapture(drag.pointer))drag.element.releasePointerCapture(drag.pointer);
  document.documentElement.classList.remove('card-dragging');
  if(!drag.ghost)return;
  const ghost=drag.ghost;
  latest.current.onHover(null);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const release:Release={velocity:{x:drag.tilt.vx,y:drag.tilt.vy},tilt:{...drag.tilt}};
  const accepted=!cancel&&drag.node!==null&&latest.current.canDrop(drag.node,drag.card);
  if(accepted){
   // The landing angle comes from the card's own matrix; its lean travels separately in `release`.
   const rect=ghost.getBoundingClientRect(),matrix=new DOMMatrixReadOnly(drag.matrix==='none'?undefined:drag.matrix);
   const width=ghost.offsetWidth,height=ghost.offsetHeight;
   latest.current.onDrop(drag.node!,drag.card,{x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height,angle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,release:reduced?undefined:{...release,perspective:drag.perspective}});
   discardGhost(ghost);latest.current.onEnd();
   // A moved board card unmounts once the board re-renders; keep it hidden until then so it cannot flash back in its old slot.
   const element=drag.element;let frames=12;
   const reveal=()=>{if(!element.isConnected)return;if(--frames>0){requestAnimationFrame(reveal);return;}element.style.removeProperty('opacity');};
   requestAnimationFrame(reveal);
  }else{
   latest.current.onEnd();
   const element=drag.element;
   const finish=()=>{discardGhost(ghost);element.style.removeProperty('opacity');returning.current.delete(item);};
   const item={ghost,element,cancel:()=>{}};returning.current.add(item);
   if(reduced){finish();return;}
   // Spring home from the drop point: the ghost keeps its momentum and lean, and the fan pose blends in as it nears its slot.
   const home=pose(element),lifted=drag.matrix;
   item.cancel=springRelease(release,{x:drag.dx,y:drag.dy},{x:home.left-drag.left,y:home.top-drag.top},state=>{
    drag.dx=state.x;drag.dy=state.y;drag.tilt=state.tilt;
    drag.matrix=blendMatrix(lifted,home.matrix,state.progress);drag.pivot=pivotOf(element,drag.matrix,drag.origin);
    ghost.style.transform=ghostTransform(drag);paintLean(ghost,state.tilt);
   },finish,900);
  }
 }

 /** Runs for the life of a lifted card: the lean springs toward the pointer's speed and settles flat when it stops. */
 function lean(drag:Gesture,now:number,last=now){
  if(gesture.current!==drag||!drag.ghost)return;
  drag.tilt=stepTilt(drag.tilt,now-last);
  drag.ghost.style.transform=ghostTransform(drag);
  paintLean(drag.ghost,drag.tilt);
  drag.frame=requestAnimationFrame(next=>lean(drag,next,now));
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
    const current=pose(drag.element);drag.left=current.left;drag.top=current.top;drag.matrix=current.matrix;drag.origin=current.origin;
    const ghost=drag.element.cloneNode(true) as HTMLButtonElement;
    ghost.classList.remove('dragging');ghost.classList.add('pointer-card');
    ghost.removeAttribute('data-card-id');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.draggable=false;
    Object.assign(ghost.style,{left:`${drag.left}px`,top:`${drag.top}px`,width:`${drag.element.offsetWidth}px`,height:`${drag.element.offsetHeight}px`,transformOrigin:current.origin});
    mountGhost(drag.element,ghost);attachGhostDepth(drag.element,ghost);drag.ghost=ghost;drag.element.style.opacity='0';
    drag.pivot=pivotOf(drag.element,current.matrix,current.origin);
    drag.perspective=Math.round(drag.element.getBoundingClientRect().width*PERSPECTIVE_WIDTHS);
    const sheen=document.createElement('span');sheen.className='pointer-card-sheen';sheen.setAttribute('aria-hidden','true');ghost.append(sheen);
    document.documentElement.classList.add('card-dragging');suppressClick.current=true;latest.current.onStart(drag.card);
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)drag.frame=requestAnimationFrame(now=>lean(drag,now));
   }
   drag.tilt=sampleVelocity(drag.tilt,event.clientX-drag.lastX,event.clientY-drag.lastY,event.timeStamp-drag.lastT);
   drag.lastX=event.clientX;drag.lastY=event.clientY;drag.lastT=event.timeStamp;
   drag.dx=dx;drag.dy=dy;
   drag.ghost.style.transform=ghostTransform(drag);
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
   const current=gesture.current;if(current?.ghost)discardGhost(current.ghost);current?.element.style.removeProperty('opacity');gesture.current=null;
   returning.current.forEach(item=>{item.cancel();discardGhost(item.ghost);item.element.style.removeProperty('opacity');});returning.current.clear();document.documentElement.classList.remove('card-dragging');
  };
 },[]);

 return (event:ReactPointerEvent<HTMLButtonElement>,card:Card)=>{
  if(!latest.current.enabled||card.type==='Crypto'||!event.isPrimary||event.button!==0||gesture.current)return;
  const element=event.currentTarget;
  // A quick retry can grab the card before its previous return animation ends.
  for(const item of returning.current){
   if(item.element!==element)continue;
   item.cancel();discardGhost(item.ghost);element.style.removeProperty('opacity');returning.current.delete(item);
  }
  element.setPointerCapture(event.pointerId);
  gesture.current={card,element,pointer:event.pointerId,x:event.clientX,y:event.clientY,ghost:null,matrix:'none',origin:'0px 0px',left:0,top:0,node:null,
   dx:0,dy:0,lastX:event.clientX,lastY:event.clientY,lastT:event.timeStamp,tilt:restingTilt(),pivot:{x:0,y:0},perspective:800,frame:0};
 };
}
