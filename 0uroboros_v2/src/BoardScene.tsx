import { Suspense, useMemo, useRef, useEffect, useLayoutEffect, useState, createContext, useContext, type RefObject, type ReactNode, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF, Environment, Lightformer, RoundedBox, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { Card } from './game';
import { CardFace, type CardFaceProps } from './CardFace';
import './board-ritual.css';
import { CARD_ART_PLACEHOLDER, CARD_BACK, cardArtworkPath } from './cardArtwork';
import { servedArtPath } from './depthArt/depthManifest';
import { PLACEMENT_CLIP_DELAY_MS, PLACEMENT_CLIP_RATE, cardEffectVideo, effectVideoOnPlacement } from './cardVideos';
import { LOCATION_TRIGGERS, splitLocationTriggers } from './locationTriggers';
import { boardMaterial, boardDepth, isBoardDepth, boardWashUniforms, boardSideHealth, DAMAGED_LIGHT, inlayMaterial, neonIntensity, PERIMETER_DIM, sideLightScale } from './boardMaterials';
import { PlayerColorsProvider, usePlayerColors, type ResolvedColorTheme } from './playerTheme';
import { BoardStage, BoardFinish, BoardSideEdges, useBoardScanPass } from './BoardAtmosphere';
import { ServerLights, serverGlow, serverIndex, type ServerValues } from './ServerLights';
import { MATCAP_URL, NodeSealOrigami, sealWarmupScene } from './NodeSealOrigami';
import { NeonHorizonScan, BOARD_SCAN_MS, boardScanTotalMs, type BoardScanTone } from './NeonHorizonScan';
import { BOARD_EXPOSURE, BoardLightingProvider, lightingNow, pulseDuration, pulseEnvelope, useBoardLighting } from './boardLighting';
import { LaneRewardGlow } from './LaneRewardGlow';
import { LANE_FIT, LANE_SEAL_Y, PATTERN_LANES, PATTERN_W, laneSealEdgeZ, laneSealProgress, laneSinkOverlay } from './laneSeal';
import { DEFAULT_LANE_PATTERN, type LanePattern } from './lanePatterns';
import { DEFAULT_SERVER_STYLE, type ServerStyle } from './serverStyles';
import { Singularity, SingularityContext, useSingularityPass, useSingularityField, singularityTransform, type SingularityField } from './Singularity';
import { AUTHORED_NODE_X, FAR_SHIFT, LANE_MARK_DX, LANE_MARK_HALF, LANE_MARK_Z, LANE_RIM, LANE_RIM_HX, LANE_RIM_RADIUS, LANE_SCALE, NODE_GROW, NODE_X, boardZ, warpFarZ, warpX } from './boardLayout';

export { BOARD_SCAN_MS, boardScanTotalMs, NODE_X };
export type BoardCard = {id:string; card?:Card; revealed:boolean;planned?:boolean;movable?:boolean};
export type BoardNode = {cards:[BoardCard[],BoardCard[]]; powers:[number,number]; weight:number; title:string; text:string; reward?:string};
export type BoardEffect = {id:number;kind:string;text:string;node?:number;player?:number;source?:string;sourceCardId?:string;targetCardId?:string;target?:string;targetOwner?:number;before?:number;after?:number};
export type BoardProps = {
 closedNodes:number[]; collapseNode:number|null; awardNode:number|null; selectionNode:number|null; openNodes:number[];servers:[ServerValues,ServerValues];nodes:BoardNode[];turn:number;phase:string;priority:number;dragged:Card|null;hoveredNode:number|null;
 cycle?:number;
 /** Collapses the board into the end-of-session singularity. */
 gameover?:boolean;
 /** Session winner, whose colour tints the singularity's glow; null for a tie. */
 winner?:0|1|null;
 boardScan?:boolean;
 boardScanTone?:BoardScanTone;
 boardScanDuration?:number;
 floorBackground:string;
 /** Etched line pattern on open lanes, from Settings › Visuals. */
 lanePattern?:LanePattern;
 /** Server tube look, from Settings › Visuals. */
 serverStyle?:ServerStyle;
 /** Each player's chosen base colour, already resolved from the Settings theme. */
 playerColors:ResolvedColorTheme;
 /** Card clips play with their audio; otherwise they play muted. */
 videoSound?:boolean;
 legal:(node:number)=>string|null;drop:(node:number)=>void;inspect:(card:Card)=>void;
 planning?:boolean; onLocationInspect?:(index:number)=>void; onReady?:()=>void; effect:BoardEffect|null; selectedNode:number|null; hudAnchors?:{id:string;position:[number,number,number];content:ReactNode}[];
 onFieldDrag?:(event:ReactPointerEvent<HTMLButtonElement>,card:Card)=>void;
 /** Nodes a pending choice lets the player pick; they pulse until one is chosen. */
 choiceNodes?:number[]; chooseNode?:(node:number)=>void;
};
function CameraFit(){const {camera,size}=useThree();useEffect(()=>{if(camera instanceof THREE.OrthographicCamera){camera.zoom=Math.min(size.width/22.7,size.height/14);camera.position.set(0,18,13.8);const shift=new THREE.Vector3(0,-13.1,18).normalize().multiplyScalar(Math.min(60,size.height*.07)/camera.zoom);camera.position.add(shift);camera.lookAt(shift.x,shift.y,shift.z+.7);camera.updateProjectionMatrix();}},[camera,size]);return null;}
/**
 * Authored `*_duration_*` bay rims (mirrored at ±z0..±z1), lifted out of their side accent batch so each
 * one can carry its owner's Effect Bank inlay.
 */
const BANK_BAYS={x0:-9.72,x1:-6.42,y0:-.09,y1:-.015,z0:5.20,z1:6.60};
/**
 * The local Effect Bank module sits 40 anchor px (51.74px per world unit along z) nearer the player than authored.
 * The module is freestanding from z 5.0; the draw/discard module in front of it is graphite and stays put.
 */
export const NEAR_BANK_DROP=40/51.74;
const NEAR_BANK={x0:-9.9,x1:-5.8,z0:5.0};
/**
 * The opponent's Effect Bank and draw/discard modules slide toward the camera along its view ray (see CameraFit), so they
 * sit above the far frame corner (up to y .62) while staying at the same spot on screen.
 */
const FAR_BANK_RAISE=new THREE.Vector3(0,18,13.1).setLength(1.1);
/** The opponent's Effect Bank module (and its HUD) sits 6 anchor px further from the player than authored. */
export const FAR_BANK_LIFT=6/51.74;
/** The bays are authored per side: cyan for the near half, magenta for the far one. */
const BAY_BATCH=/Data Center core|magenta inlay/;
/** The two neon trim batches; each spans both halves of the board. The `cyan Server core` tubes are separate. */
const isTrimBatch=(name:string)=>name.includes('magenta')||(name.includes('cyan')&&!name.includes('Server'));
function Table(){
 const {scene}=useGLTF('/assets/models/ouroboros-board-v4.glb');
 const surface=useTexture('/assets/materials/titanium-surface.png');
 const colors=usePlayerColors();
 const bankMaterials=useMemo(()=>[0,1].map(owner=>inlayMaterial(BANK_BAYS.x0,BANK_BAYS.x1,colors[owner].inlay)),[colors]);
 useEffect(()=>()=>bankMaterials.forEach(material=>material.dispose()),[bankMaterials]);
 const {tuned,bankInlays}=useMemo(()=>{
  const inlay=[0,1].map(()=>({positions:[] as number[],normals:[] as number[]}));
  const clone=scene.clone(true);
  clone.traverse(object=>{
   if(!(object instanceof THREE.Mesh))return;
   // Remove obsolete numerical shoulder plaques and small authored power shells.
   // Work in world coordinates so the joined material batches retain exact placement.
   object.updateWorldMatrix(true,false);
   const originalGeometry=object.geometry;
   const geometry=originalGeometry.index?originalGeometry.toNonIndexed():originalGeometry.clone();
   const attr=geometry.getAttribute('position');const normal=geometry.getAttribute('normal');
   const kept:number[]=[],normals:number[]=[],uvs:number[]=[];const uv=geometry.getAttribute('uv');
   const inverse=object.matrixWorld.clone().invert();
   const worldNormal=new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
   const cyanBatch=(Array.isArray(object.material)?object.material:[object.material]).some(m=>m.name.includes('cyan Server core'));
   const bayBatch=(Array.isArray(object.material)?object.material:[object.material]).some(m=>BAY_BATCH.test(m.name));
   const gunmetal=(Array.isArray(object.material)?object.material:[object.material]).some(m=>m.name.includes('milled gunmetal'));
   const graphite=(Array.isArray(object.material)?object.material:[object.material]).some(m=>m.name.includes('graphite titanium'));
   const trim=!Array.isArray(object.material)&&isTrimBatch(object.material.name);
   /** Per kept triangle: 0 for the near half, 1 for the far half. */
   const sides:number[]=[];
   for(let i=0;i<attr.count;i+=3){
    const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(attr,i+k).applyMatrix4(object.matrixWorld));
    const plaque=points.every(v=>v.y>.37&&v.z>3.48&&v.z<4.28&&AUTHORED_NODE_X.some(x=>Math.abs(v.x-x)<.72));
    const socket=points.every(v=>v.y>.24&&Math.abs(v.z)>.64&&Math.abs(v.z)<1.34&&AUTHORED_NODE_X.some(x=>Math.abs(v.x-x)<.48));
    // Both players' Effect Bank modules keep their authored depth; the draw/discard modules are replaced by the HUD piles.
    const fixedPeripheral=points.every(v=>v.x>-9.9&&v.x<-6.25&&v.y<.035&&Math.abs(v.z)>5.10&&Math.abs(v.z)<6.70);
    const pileModule=points.every(v=>v.x>-9.72&&v.x<-6.58&&v.y<-.075&&Math.abs(v.z)>4.50&&Math.abs(v.z)<5.10);
    const wallet=points.every(v=>v.x>6.05&&v.x<8.95&&v.z>6.65&&v.z<8.65);
    const endTurn=points.every(v=>v.x>9.20&&v.x<11.40&&v.z>6.92&&v.z<7.98);
    // Drop the old ridged side armor so procedural sleek rails can replace it.
    const sideRidge=points.every(v=>Math.abs(v.x)>7.48&&Math.abs(v.x)<8.72&&Math.abs(v.z)<4.15);
    const cyanCore=cyanBatch&&points.every(v=>Math.abs(v.x)>2.8&&Math.abs(v.x)<6.4&&Math.abs(v.z)>4.4&&Math.abs(v.z)<5.1);
    const bankBay=bayBatch&&points.every(v=>v.x>BANK_BAYS.x0&&v.x<BANK_BAYS.x1&&v.y>BANK_BAYS.y0&&v.y<BANK_BAYS.y1&&Math.abs(v.z)>BANK_BAYS.z0&&Math.abs(v.z)<BANK_BAYS.z1);
    const nearBank=!gunmetal&&!graphite&&points.every(v=>v.x>NEAR_BANK.x0&&v.x<NEAR_BANK.x1&&v.z>=NEAR_BANK.z0);
    if(bankBay){
     const far=points[0].z<0, bay=inlay[far?1:0];
     points.forEach((v,k)=>{
      if(far)v.add(FAR_BANK_RAISE);
      bay.positions.push(v.x,v.y,v.z+(nearBank?NEAR_BANK_DROP:0)-(far?FAR_BANK_LIFT:0));
      if(normal)bay.normals.push(...new THREE.Vector3(normal.getX(i+k),normal.getY(i+k),normal.getZ(i+k)).applyMatrix3(worldNormal).normalize().toArray());
     });
     continue;
    }
    if(plaque||socket||cyanCore||wallet||endTurn||sideRidge||pileModule)continue;
    const nearBar=gunmetal&&points.every(v=>v.y<.23&&Math.abs(boardDepth(v.z)-AUTHORED_NEAR_BAR_Z)<.04&&AUTHORED_NODE_X.some(x=>Math.abs(Math.abs(v.x-x)-AUTHORED_LANE_MARK_DX)<.12));
    const farPeripheral=fixedPeripheral&&points[0].z<0;
    points.forEach(v=>{v.x=warpX(v.x,v.z);if(!fixedPeripheral)v.z=boardZ(v.x,v.z);if(nearBank)v.z+=NEAR_BANK_DROP;if(farPeripheral){v.add(FAR_BANK_RAISE);v.z-=FAR_BANK_LIFT;}});
    if(trim)sides.push(points[0].z+points[1].z+points[2].z<0?1:0);
    points.forEach((v,k)=>{if(nearBar)v.z+=LANE_MARK_Z[0][0]-AUTHORED_NEAR_BAR_Z;v.applyMatrix4(inverse);kept.push(v.x,v.y,v.z);if(normal)normals.push(normal.getX(i+k),normal.getY(i+k),normal.getZ(i+k));if(uv)uvs.push(uv.getX(i+k),uv.getY(i+k));});
   }
   // Trim triangles are regrouped near-then-far so each half can take its owner's colour.
   const bySide=(values:number[],stride:number)=>trim?[0,1].flatMap(side=>sides.flatMap((s,t)=>s===side?values.slice(t*stride*3,(t+1)*stride*3):[])):values;
   const clean=new THREE.BufferGeometry();clean.setAttribute('position',new THREE.Float32BufferAttribute(bySide(kept,3),3));if(normals.length)clean.setAttribute('normal',new THREE.Float32BufferAttribute(bySide(normals,3),3));if(uvs.length)clean.setAttribute('uv',new THREE.Float32BufferAttribute(bySide(uvs,2),2));clean.computeBoundingSphere();object.geometry=clean;geometry.dispose();
   // The dynamic glass reservoirs replace the old flat cyan slabs.

   object.castShadow=true; object.receiveShadow=true;
   const adjust=(original:THREE.Material)=>boardMaterial(original,surface);
   object.material=Array.isArray(object.material)?object.material.map(adjust):adjust(object.material);
   if(trim&&object.material instanceof THREE.MeshStandardMaterial){
    const near=sides.filter(side=>side===0).length*3;
    clean.addGroup(0,near,0);clean.addGroup(near,sides.length*3-near,1);
    object.material=[object.material,object.material.clone()].map((material,owner)=>{
     material.userData.trim={owner,color:material.color.getHex(),emissive:material.emissive.getHex(),intensity:material.emissiveIntensity};
     return material;
    });
   }
  });
  const bankInlays=inlay.map(bay=>{
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute('position',new THREE.Float32BufferAttribute(bay.positions,3));
   if(bay.normals.length)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(bay.normals,3));
   geometry.computeBoundingSphere();
   return geometry;
  });
  return {tuned:clone,bankInlays};
 },[scene,surface]);
 useEffect(()=>()=>{bankInlays.forEach(geometry=>geometry.dispose());tuned.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material.dispose());}});},[tuned,bankInlays]);
 // Classic keeps the authored orange and violet trim; a chosen colour retints that owner's half of both batches.
 // Retinting in place keeps a theme change off the scene-clone path, which is far too costly to repeat.
 useEffect(()=>{
  tuned.traverse(object=>{
   if(!(object instanceof THREE.Mesh))return;
   // The authored red trace under the local stats takes the local player's accent, lit like the trim beside it.
   if(object.material instanceof THREE.MeshStandardMaterial&&object.material.name.includes('restrained red traces')){
    const {accent,shadow}=colors[0];
    object.material.color.set(shadow);object.material.emissive.set(accent);
    object.material.emissiveIntensity=neonIntensity(accent,1.2)*PERIMETER_DIM;
    return;
   }
   if(!Array.isArray(object.material))return;
   for(const material of object.material){
    const trim=material.userData.trim as {owner:0|1;color:number;emissive:number;intensity:number}|undefined;
    if(!trim||!(material instanceof THREE.MeshStandardMaterial))continue;
    const color=colors[trim.owner];
    if(color.id==='classic'){material.color.setHex(trim.color);material.emissive.setHex(trim.emissive);material.emissiveIntensity=trim.intensity;continue;}
    material.color.set(color.shadow);
    material.emissive.set(color.accent);
    material.emissiveIntensity=neonIntensity(color.accent,material.name.includes('magenta')?1:1.2)*PERIMETER_DIM;
   }
  });
 },[tuned,colors]);
 return <><primitive object={tuned}/>{bankInlays.map((geometry,owner)=><mesh key={owner} geometry={geometry} material={bankMaterials[owner]}/>)}</>;
}

/**
 * A card with an `_onFX` clip plays it once, starting with the first effect it resolves. The clip outlasts the
 * individual effect events, so later effects from the same resolution do not restart it. The clip is mounted idle
 * as soon as the face shows, so it starts decoded rather than loading while it plays.
 * Placement clips instead play when the player's card face mounts as `placed`, as it is set down. The card goes face
 * down between committing and its reveal, so its face mounts again then, unplaced. The clip waits out the landing
 * flip and a short hold, then plays sped up. The opponent's placement cards play no clip.
 */
function FieldCardFace({card,effect,placed,opponent,sound,...face}:CardFaceProps&{card:Card;effect:BoardEffect|null;placed:boolean;opponent:boolean;sound?:boolean}){
 const onPlacement=useMemo(()=>effectVideoOnPlacement(card),[card.name,card.definitionId]);
 const clip=useMemo(()=>opponent&&onPlacement?undefined:cardEffectVideo(card),[card.name,card.definitionId,opponent,onPlacement]);
 const trigger=clip&&!onPlacement&&effect?.source==='card'&&effect.sourceCardId===card.id?effect.id:null;
 const [playing,setPlaying]=useState(false);
 const [landing]=useState(()=>Boolean(clip&&onPlacement&&placed));
 useEffect(()=>{if(trigger!==null)setPlaying(true);},[trigger]);
 useEffect(()=>{
  if(!landing)return;
  const timer=window.setTimeout(()=>setPlaying(true),REVEAL_FLIP_MS+PLACEMENT_CLIP_DELAY_MS);
  return()=>clearTimeout(timer);
 },[landing]);
 return <CardFace {...face} card={card} className={playing?'cf-card--fx':''} video={clip?{src:clip,sound,playing,rate:onPlacement?PLACEMENT_CLIP_RATE:1,onEnd:()=>setPlaying(false)}:undefined}/>;
}
/** Length of the `card-reveal` flip a field card plays as its face appears (styles.css). */
const REVEAL_FLIP_MS=500;

/** Authored shutters: no Location data enters this sealed presentation. */
function NodeShutters({x,open,closed}:{x:number;open:boolean;closed:boolean}){
 const doors=useRef<THREE.Group>(null);const progress=useRef(open?1:0);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 useFrame((_,delta)=>{
  const target=open?1:0;
  progress.current=reduced?target:THREE.MathUtils.damp(progress.current,target,5,Math.min(delta,.05));
  if(!doors.current)return;
  doors.current.visible=progress.current<.995;
  doors.current.children.forEach((child,i)=>{
   const sign=i===0?-1:1;
   child.position.x=sign*(.57+progress.current*1.1)*LANE_SCALE;
   child.position.y=.5+Math.sin(progress.current*Math.PI)*.28;
   child.scale.x=1-progress.current*.95;
  });
 });
 return <group position={[x,0,0]}>
  {!open&&!closed&&[0,1].map(side=><mesh key={side} geometry={LANE_FACE_GEOMETRY[side]} position={[0,LANE_SEAL_Y,(LANE_FIT[side].z0+LANE_FIT[side].z1)/2]} rotation={[-Math.PI/2,0,0]} receiveShadow><meshStandardMaterial color='#0a0e16' metalness={.72} roughness={.38} emissive='#1a0a22' emissiveIntensity={0.18}/></mesh>)}
  <group ref={doors} position={[0,0,PLATE_Z]}>{[-1,1].map(sign=><group key={sign} position={[sign*.57*LANE_SCALE,.5,0]}><RoundedBox args={[1.13*LANE_SCALE,.16,1.26+NODE_GROW]} radius={.075} smoothness={3} castShadow receiveShadow><meshStandardMaterial color='#303c50' metalness={.85} roughness={.32}/></RoundedBox><mesh position={[sign*.44*LANE_SCALE,.085,0]}><boxGeometry args={[.018,.02,.82+NODE_GROW]}/><meshStandardMaterial color='#7c8aa3' metalness={.8} roughness={.25}/></mesh></group>)}</group>
 </group>;
}
/**
 * Compiles, while the setup card is up, the programs for pieces that first draw mid-session: hidden lane seal plates
 * and markers, and the Node seals. A first compile mid-Collapse stalls the frame. A plain render target is bound so
 * the programs match the composer's (no tone mapping, linear output). The stand-ins stay alive, because disposing
 * their materials would release the programs.
 */
function ShaderWarmup(){
 const {gl,scene,camera}=useThree();
 const matcap=useTexture(MATCAP_URL);
 useEffect(()=>{
  const seals=sealWarmupScene(matcap), target=new THREE.WebGLRenderTarget(1,1), previous=gl.getRenderTarget();
  gl.setRenderTarget(target);
  // The lane seal's clipped materials only compile to their live programs with local clipping on.
  gl.localClippingEnabled=true;
  void gl.compileAsync(scene,camera);
  void gl.compileAsync(seals,camera,scene);
  gl.setRenderTarget(previous);
  target.dispose();
  return()=>seals.traverse(object=>{if(object instanceof THREE.Mesh)object.material.dispose();});
 },[gl,scene,camera,matcap]);
 return null;
}
const HudPortal=createContext<RefObject<HTMLDivElement>|undefined>(undefined);
function BoardReady({onReady}:{onReady?:()=>void}){
 const reported=useRef(false);
 useFrame(()=>{if(!reported.current){reported.current=true;onReady?.();}},2);
 return null;
}
const _anchor=new THREE.Vector3();
/** Html HUD sits in the DOM, so the lensing shader cannot reach it directly. Normally the
 *  collapse rasterises the whole layer and warps it in the shader; this CSS displacement is
 *  the fallback for when that rasterisation fails. */
function Anchor({position,children,mapDepth=true}:{position:[number,number,number];children:React.ReactNode;mapDepth?:boolean}){
 const portal=useContext(HudPortal);const field=useSingularityField();const {size,camera}=useThree();
 const scale=Math.min(size.width/22.7,size.height/14)/64;
 const el=useRef<HTMLDivElement>(null);
 const z=mapDepth?boardZ(position[0],position[2]):position[2];
 useFrame(()=>{
  const node=el.current;if(!node)return;
  const f=field?.current;
  if(!f||f.progress<=0||f.snapshot){if(node.dataset.lensed){node.style.transform=`scale(${scale})`;node.style.opacity='';node.style.filter='';delete node.dataset.lensed;}return;}
  _anchor.set(position[0],position[1],z).project(camera);
  const t=singularityTransform(f,(_anchor.x*.5+.5)*size.width,(1-(_anchor.y*.5+.5))*size.height);
  if(!t)return;
  node.dataset.lensed='1';
  node.style.transform=`translate(${t.dx}px,${t.dy}px) scale(${scale*t.scale})`;
  node.style.opacity=String(t.opacity);
  node.style.filter=t.blur>.05?`blur(${t.blur}px)`:'';
 });
 return <Html portal={portal} position={[position[0],position[1],z]} center zIndexRange={[30,10]}><div ref={el} className='world-anchor' style={{transform:`scale(${scale})`}}>{children}</div></Html>;
}
/** Centre of the Node housing, which grows only away from the player; the plate's near edge stays put. */
const PLATE_Z=-NODE_GROW/2;
function NodeRegion({node,index,p}:{node:BoardNode;index:number;p:BoardProps}){
 const x=NODE_X[index],closed=p.closedNodes.includes(index),open=p.openNodes.includes(index)&&!closed;
 const awarding=p.awardNode===index, scanning=p.collapseNode===index, selecting=p.selectionNode===index;
 const legal=p.dragged?p.legal(index):null;
 const active=p.effect?.node===index;
 const hovered=!!p.dragged&&p.hoveredNode===index;
 const accepted=hovered&&!legal;
 const tied=node.powers[0]===node.powers[1];
 const winnerSide:0|1|'tie'=tied?'tie':node.powers[0]>node.powers[1]?0:1;
 const unresolved=!node.title||node.title==='Location pending';
 const choosable=open&&!!p.chooseNode&&!!p.choiceNodes?.includes(index);
 const wasOpen=useRef(open);const [opening,setOpening]=useState(false);
 useEffect(()=>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  if(open&&!wasOpen.current){setOpening(true);timeout=setTimeout(()=>setOpening(false),1100);}
  if(!open)setOpening(false);
  wasOpen.current=open;return()=>clearTimeout(timeout);
 },[open]);
 const laneLit=(side:number)=>{
  if(closed)return 0;
  if(choosable)return 3;
  if(side===0&&accepted)return 2;
  const winning=node.powers[side]>node.powers[side===0?1:0];
  return !p.dragged&&(winning||(scanning&&tied))?1:0;
 };
 const lit:[LaneLit,LaneLit]=[laneLit(0) as LaneLit,laneLit(1) as LaneLit];
 return <group>
  <NodeShutters x={x} open={open} closed={closed}/>
  <PowerSocket x={x} side={0} winning={node.powers[0]>node.powers[1]}/><PowerSocket x={x} side={1} winning={node.powers[1]>node.powers[0]}/>
  <NodeLight x={x} lit={lit}/>
  <Anchor position={[x,.24,COLUMN_DROP_Z]} mapDepth={false}>
   {choosable
    ?<button type='button' className='lane-drop-target node-choice-target' data-lane-drop={index} data-node-choice={index} style={{height:COLUMN_DROP_PX}} aria-label={`Select Node ${index+1}${unresolved?'':`: ${node.title}`}`} onClick={()=>p.chooseNode?.(index)}/>
    :<div className={`lane-drop-target ${open?'':'sealed'} ${hovered?(accepted?'lane-hovered':'lane-rejected'):''}`} data-lane-drop={index} style={{height:COLUMN_DROP_PX}} aria-hidden='true'/>}
  </Anchor>
  {[1,0].map(side=>{
   const winning=node.powers[side]>node.powers[side===0?1:0];
   const sourceActive=active&&p.effect?.player===side;
   return <group key={side}>
    <LaneLight x={x} index={index} side={side} lit={lit[side]} open={open} closed={closed} pattern={p.lanePattern??DEFAULT_LANE_PATTERN}/>
    <LaneMarkers x={x} side={side} winning={winning&&!closed}/>
    <LaneTurnover x={x} index={index} side={side} turning={closed}/>
    <Anchor position={[x,.35,side===1?-2.65:2.2]}>
     <div className={`deployment-grid ${closed?'lane-closed':''} ${side===0?'local-drop':''} ${accepted&&side===0?'hovered-placement':''} ${open?'':'sealed'} ${sourceActive?'resolving-source':''}`} data-lane-node={index} data-lane-owner={side} data-node-drop={side===0?index:undefined} data-collapse-winner={!closed&&scanning&&(winning||tied)?'true':undefined} data-lane-lit={accepted&&side===0?'hover':!p.dragged&&winning?'winner':undefined}>
      {node.cards[side].map(c=><button key={c.id} data-card-id={c.id} className={`field-card ${c.revealed||(side===0&&p.planning&&c.planned)?'revealed':'hidden-card'} ${c.movable?'movable-card':''} ${sourceActive&&p.effect?.sourceCardId===c.id?'active-source':''}`} aria-label={c.card&&(c.revealed||side===0)?`Inspect ${c.card.name}${c.movable?' · drag to relocate':''}`:'Face-down card'} draggable={false} onDragStart={event=>event.preventDefault()} onPointerDown={event=>{if(c.movable&&c.card&&p.onFieldDrag)p.onFieldDrag(event,c.card);}} onClick={()=>{if(c.card&&(c.revealed||side===0))p.inspect(c.card);}}>
       {(c.revealed||(side===0&&p.planning&&c.planned))&&c.card?<FieldCardFace card={c.card} effect={c.revealed?p.effect:null} placed={!c.revealed} opponent={side===1} sound={p.videoSound} compact movableCue={Boolean(c.movable)} powerChanging={p.effect?.kind==='power'&&p.effect.targetCardId===c.id}/>:<img src={servedArtPath(CARD_BACK)} alt='Face-down card'/>}
      </button>)}
     </div>
    </Anchor>
    <Anchor position={[x,side===1?.735:.49,side===1?-.98:.98]}>
     <div className={`power-badge ${side===0?'local':'opponent'} ${winning?'winning':tied?'tied':'trailing'} ${sourceActive&&!awarding?'score-active':''}`} aria-label={`${side===0?'Your':'Opponent'} Node ${index+1} Power ${node.powers[side]}, ${tied?'tied':winning?'leading':'trailing'}${p.priority===side?', priority':''}`}>
      <b key={node.powers[side]}>{node.powers[side]}</b>
     </div>
    </Anchor>
   </group>;
  })}
  <Anchor position={[x,.76,PLATE_Z]} mapDepth={false}>
   {open?<button type='button' data-location-node={index} className={`location-plate ${active&&!awarding?'active':''} ${selecting?'selection-focus':''} ${accepted?'drop-highlight':''} ${opening?'location-opening':''} ${unresolved?'unassigned':''} ${choosable?'node-choice':''}`} onClick={()=>choosable?p.chooseNode?.(index):p.onLocationInspect?.(index)} aria-label={`${choosable?'Select':'Inspect'} Node ${index+1}${unresolved?'':`: ${node.title}`}`} disabled={!choosable&&!p.onLocationInspect}>
    <small>N{index+1}</small>
    <PlateTitle text={unresolved?'Open circuit':node.title}/>
    {!unresolved&&node.reward?<span className='location-reward'><TriggerText text={node.reward}/></span>:<span className='location-rule'>{unresolved?'Location source required':<TriggerText text={node.text}/>}</span>}
   </button>:closed?<span className='node-closed-marker' data-location-node={index} data-node-sealed={index} data-node-closed={index} aria-label={`Node ${index+1} resolved`}/>:<div className={`sealed-location ${selecting?'selection-focus':''}`} data-location-node={index} data-node-sealed={index} aria-label={`Node ${index+1} sealed. Location unrevealed.`}><b>N{index+1}</b></div>}
  </Anchor>
  {closed&&<NodeSealOrigami x={x} z={PLATE_Z} nodeIndex={index} cycle={p.cycle??1} winner={winnerSide}/>}
  <LaneRewardGlow x={x} index={index} awarding={awarding} closed={closed} reward={node.reward} winnerSide={winnerSide}/>

 </group>;
}
const SOCKET_HALF_W=.46, SOCKET_BEVEL=.025;
function PowerSocket({x,side,winning}:{x:number;side:number;winning:boolean}){
 const geometry=useMemo(()=>{const shape=new THREE.Shape();shape.moveTo(-SOCKET_HALF_W,0);shape.lineTo(0,side===0?.39:.3);shape.lineTo(SOCKET_HALF_W,0);shape.lineTo(0,side===0?-.39:-.3);shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:SOCKET_BEVEL,bevelThickness:.025});},[side]);
 const chevron=useMemo(()=>{
  // Primary: tip toward screen bottom. Secondary: tip toward screen top (opponent).
  // Arms follow the socket's edges, with the stroke centred on its bevelled outline so half of it overhangs.
  const socketTip=side===0?-0.39:0.3;
  const outward=side===0?1:-1;
  const slope=Math.abs(socketTip)/SOCKET_HALF_W, sec=Math.hypot(1,slope);
  const stroke=0.055,reach=0.22,rise=reach*slope,thick=stroke*sec;
  const tipY=socketTip-outward*(SOCKET_BEVEL*sec+thick/2);
  const shape=new THREE.Shape();
  shape.moveTo(-reach, tipY+outward*rise);
  shape.lineTo(0, tipY);
  shape.lineTo(reach, tipY+outward*rise);
  shape.lineTo((rise-thick)/slope, tipY+outward*rise);
  shape.lineTo(0, tipY+outward*thick);
  shape.lineTo(-(rise-thick)/slope, tipY+outward*rise);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:false});
 },[side]);
 useEffect(()=>()=>{geometry.dispose();chevron.dispose();},[geometry,chevron]);
 const {accent,shadow}=usePlayerColors()[side];
 // Winning spill comes from the node's pooled NodeLight; the chevron itself is luminance-normalised so violet blooms like orange.
 return <group position={[x,side===0?.38:.62,side===0?.98:warpFarZ(-.98)]} rotation={[-Math.PI/2,0,0]}>
  <mesh position={[0,side===0?.36:-.30,-.035]} castShadow><boxGeometry args={[.26,.40,.085]}/><meshStandardMaterial color='#314253' metalness={.88} roughness={.24}/></mesh>
  {/* The local NodeLight hangs just above this socket, so a glossy top mirrors it as a second hot spot inside the chevron's V. */}
  <mesh geometry={geometry} castShadow><meshPhysicalMaterial color='#263a4b' metalness={.85} roughness={side===0?.7:.24} clearcoat={side===0?0:.5}/></mesh>
  <mesh geometry={geometry} position={[0,0,.081]} scale={[.82,.82,.1]}><meshStandardMaterial color='#050813' roughness={.23} metalness={.65} emissive={shadow} emissiveIntensity={0.35}/></mesh>
  <mesh geometry={chevron} position={[0,0,.092]} castShadow>
   <meshStandardMaterial color={winning?accent:'#4a5564'} metalness={.55} roughness={.28} emissive={winning?accent:'#000000'} emissiveIntensity={winning?neonIntensity(accent,1.4):0}/>
  </mesh>
 </group>;
}
const _sealEdge=new THREE.Vector3();
/** Between the engraving panel (y .226) and the reward sweep (y .232). */
const SINK_Y=.228;
/**
 * Lane seal on Node close: a fitted metal plate slides out from the Node over the lane while the
 * placed cards shrink as a group. The cards are DOM, so the plate's projected leading edge clips them.
 * A dark layer on the pattern's footprint darkens under the cards until the plate covers it, so they sink into the lane.
 */
function LaneTurnover({x,index,side,turning}:{x:number;index:number;side:number;turning:boolean}){
 const {gl,camera}=useThree();
 const group=useRef<THREE.Group>(null);
 const sink=useRef<THREE.Mesh>(null);
 const sinkClip=useMemo(()=>new THREE.Plane(new THREE.Vector3(0,0,side===0?1:-1),0),[side]);
 const sinkMaterial=useMemo(()=>new THREE.MeshBasicMaterial({color:'#000000',transparent:true,opacity:0,depthWrite:false,fog:false,clippingPlanes:[sinkClip]}),[sinkClip]);
 useEffect(()=>()=>sinkMaterial.dispose(),[sinkMaterial]);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const {z0,z1}=LANE_FIT[side], length=z1-z0, centre=(z0+z1)/2, dir=side===0?1:-1, powerZ=side===0?z0:z1;
 const material=useMemo(()=>{
  const clip=new THREE.Plane(new THREE.Vector3(0,0,dir),-dir*powerZ);
  const metal=laneMetalTexture();
  return new THREE.MeshPhysicalMaterial({color:'#0a0f19',metalness:.92,roughness:.34,roughnessMap:metal,bumpMap:metal,bumpScale:.35,clearcoat:.55,clearcoatRoughness:.22,envMapIntensity:1.25,clippingPlanes:[clip]});
 },[dir,powerZ]);
 useEffect(()=>{gl.localClippingEnabled=true;},[gl]);
 useEffect(()=>()=>material.dispose(),[material]);
 const seal=useRef({turning,start:turning?-Infinity:0,done:false,mounted:false});
 useEffect(()=>{
  const s=seal.current;s.turning=turning;
  if(!s.mounted){s.mounted=true;return;}
  if(turning){s.start=performance.now()/1000;s.done=false;return;}
  s.done=false;
  const grid=document.querySelector<HTMLElement>(`.deployment-grid[data-lane-node="${index}"][data-lane-owner="${side}"]`);
  if(grid){grid.style.clipPath='';grid.style.scale='';grid.style.visibility='';}
 },[turning,index,side]);
 useFrame(()=>{
  const s=seal.current, g=group.current, m=sink.current;if(!g||!m)return;
  if(!s.turning){g.visible=m.visible=false;return;}
  const t=reduced?Infinity:performance.now()/1000-s.start;
  const {slide,scale}=laneSealProgress(t);
  g.visible=slide>.001;
  g.position.z=centre-dir*(1-slide)*length;
  const overlay=laneSinkOverlay(side,t);
  m.visible=!overlay.covered&&overlay.opacity>0;
  sinkClip.constant=-dir*overlay.clipZ;
  sinkMaterial.opacity=overlay.opacity;
  if(s.done)return;
  const grid=document.querySelector<HTMLElement>(`.deployment-grid[data-lane-node="${index}"][data-lane-owner="${side}"]`);
  if(!grid)return;
  if(slide>=1){grid.style.visibility='hidden';s.done=true;return;}
  grid.style.scale=String(scale);
  // Leading edge of the plate in screen space, mapped into the grid's untransformed box.
  _sealEdge.set(x,LANE_SEAL_Y,laneSealEdgeZ(side,slide)).project(camera);
  const canvas=gl.domElement.getBoundingClientRect(), edgeY=canvas.top+(1-_sealEdge.y)/2*canvas.height;
  const box=grid.getBoundingClientRect(), h=grid.offsetHeight||1, k=box.height/h||1;
  const local=THREE.MathUtils.clamp((edgeY-(box.top+box.height/2))/k+h/2,0,h);
  grid.style.clipPath=side===0?`inset(${local}px -60px -60px -60px)`:`inset(-60px -60px ${h-local}px -60px)`;
 });
 return <>
  <mesh ref={sink} position={[x,SINK_Y,PATTERN_LANES[side].z]} rotation={[-Math.PI/2,0,0]} material={sinkMaterial} visible={false} renderOrder={2.5}>
   <planeGeometry args={[PATTERN_W,PATTERN_LANES[side].d]}/>
  </mesh>
  <group ref={group} position={[x,LANE_SEAL_Y,centre]} visible={false}>
   <mesh geometry={LANE_COVER_GEOMETRY[side]} material={material} rotation={[-Math.PI/2,0,0]} receiveShadow/>
  </group>
 </>;
}
/** 0 = off, 1 = winner / tied collapse, 2 = local drop hover, 3 = selectable for a pending Node choice. */
type LaneLit=0|1|2|3;
const LANE_HOVER='#ffbfae';
const LANE_CHOICE_COLOR=new THREE.Color('#ffd36b');
/** Selectable Nodes breathe slowly rather than flash. */
const CHOICE_PULSE_S=2.4;
const choicePulse=(elapsed:number)=>.5-.5*Math.cos(elapsed*2*Math.PI/CHOICE_PULSE_S);
const LANE_FIT_HX=1.2*LANE_SCALE;
const laneZ=(side:number)=>(LANE_RIM[side].z0+LANE_RIM[side].z1)/2;
/** Rounded lane rectangle centred on its lane; the outer edge (away from power) takes the larger radius. */
function laneShape(side:number,hx:number,hd:number,outer:number,power:number){
 // Shape +y lies along world -Z once laid flat; the local lane's outer edge is +Z.
 const low=side===0?outer:power, high=side===0?power:outer;
 const s=new THREE.Shape();
 s.moveTo(-hx+low,-hd);s.lineTo(hx-low,-hd);
 s.absarc(hx-low,-hd+low,low,-Math.PI/2,0,false);
 s.lineTo(hx,hd-high);
 s.absarc(hx-high,hd-high,high,0,Math.PI/2,false);
 s.lineTo(-hx+high,hd);
 s.absarc(-hx+high,hd-high,high,Math.PI/2,Math.PI,false);
 s.lineTo(-hx,-hd+low);
 s.absarc(-hx+low,-hd+low,low,Math.PI,Math.PI*1.5,false);
 return s;
}
const LANE_FIT_SHAPES=[0,1].map(side=>laneShape(side,LANE_FIT_HX,(LANE_FIT[side].z1-LANE_FIT[side].z0)/2,LANE_RIM_RADIUS.outer-.04,.02));
const LANE_FACE_GEOMETRY=LANE_FIT_SHAPES.map(s=>new THREE.ShapeGeometry(s,10));
const LANE_COVER_GEOMETRY=LANE_FIT_SHAPES.map(s=>new THREE.ExtrudeGeometry(s,{depth:.02,bevelEnabled:false,curveSegments:10}).translate(0,0,-.02));
let laneMetal:THREE.CanvasTexture|null=null;
/** Fine brushed streaks along the lane, shared as roughness + bump for the sealed-lane plates. */
function laneMetalTexture(){
 if(laneMetal)return laneMetal;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#8a8a8a';ctx.fillRect(0,0,256,256);
 for(let i=0;i<1600;i++){
  const v=Math.round(96+Math.random()*90), x0=Math.random()*256, y=Math.random()*256;
  ctx.strokeStyle=`rgba(${v},${v},${v},.32)`;ctx.lineWidth=.3+Math.random()*1.1;
  ctx.beginPath();ctx.moveTo(y,x0);ctx.lineTo(y+(Math.random()-.5)*1.2,x0+40+Math.random()*190);ctx.stroke();
 }
 laneMetal=new THREE.CanvasTexture(canvas);
 laneMetal.wrapS=laneMetal.wrapT=THREE.RepeatWrapping;laneMetal.repeat.set(.9,.9);laneMetal.colorSpace=THREE.NoColorSpace;
 return laneMetal;
}
/** A whole column (far lane outer rim → near lane outer rim) as a drop target: centre z and projected height in unscaled anchor px. */
const COLUMN_DROP_NEAR=LANE_RIM[0].z1+.04, COLUMN_DROP_FAR=LANE_RIM[1].z0-.04;
const COLUMN_DROP_Z=(COLUMN_DROP_NEAR+COLUMN_DROP_FAR)/2;
const COLUMN_DROP_PX=Math.round((COLUMN_DROP_NEAR-COLUMN_DROP_FAR)*64*Math.sin(Math.atan2(18,13.1)));
/** Where the four milled bars (`LANE_MARK_*`) are authored, before the scale and the near pair's move; the winner glow sits on them. */
const AUTHORED_LANE_MARK_DX=1.02;
const AUTHORED_NEAR_BAR_Z=1.504;
const markFragment=`varying vec2 vUv;uniform vec3 uColor;uniform float uStrength;
void main(){
 vec2 p=(vUv-.5)*vec2(.44,.22);
 vec2 q=abs(p)-vec2(${LANE_MARK_HALF.x},${LANE_MARK_HALF.z});
 float d=length(max(q,0.))+min(max(q.x,q.y),0.);
 float core=1.-smoothstep(0.,.006,d);
 float halo=exp(-max(d,0.)*40.)*.45*(1.-smoothstep(.3,.5,abs(vUv.x-.5)))*(1.-smoothstep(.3,.5,abs(vUv.y-.5)));
 gl_FragColor=vec4(uColor*(core+halo)*uStrength,1.);
}`;
/** Faint winner-coloured glow on the lane's four bars while that side leads the Node; held under the bloom threshold. */
function LaneMarkers({x,side,winning}:{x:number;side:number;winning:boolean}){
 const group=useRef<THREE.Group>(null);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const accent=usePlayerColors()[side].accent;
 const material=useMemo(()=>{
  const c=new THREE.Color(accent);c.multiplyScalar(.45/(c.r*.2126+c.g*.7152+c.b*.0722));
  return new THREE.ShaderMaterial({uniforms:{uColor:{value:c},uStrength:{value:0}},vertexShader:laneVertex,fragmentShader:markFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
 },[accent]);
 useEffect(()=>()=>material.dispose(),[material]);
 const winRef=useRef(winning);winRef.current=winning;
 useFrame((_,delta)=>{
  const u=material.uniforms.uStrength, target=winRef.current?1:0;
  u.value=reduced?target:THREE.MathUtils.damp(u.value,target,4,Math.min(delta,.05));
  if(group.current)group.current.visible=u.value>.002;
 });
 return <group ref={group} visible={false}>
  {LANE_MARK_Z[side].flatMap(z=>[-1,1].map(sign=><mesh key={`${z}${sign}`} material={material} position={[x+sign*LANE_MARK_DX,.226,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.44,.22]}/></mesh>))}
 </group>;
}
const LANE_HOVER_COLOR=new THREE.Color(LANE_HOVER);
/** Both sides' accents as three.js colours; identities are stable until the theme changes. */
function useLaneAccents(){
 const colors=usePlayerColors();
 return useMemo(()=>[new THREE.Color(colors[0].accent),new THREE.Color(colors[1].accent)] as const,[colors[0].accent,colors[1].accent]);
}
const laneLitColor=(accents:readonly THREE.Color[],side:number,lit:LaneLit)=>lit===3?LANE_CHOICE_COLOR:lit===2?LANE_HOVER_COLOR:accents[side];
/** Rim peaks just over the 0.85 bloom threshold for every hue; interior and gloss stay well under it. */
const LANE_RIM_L=.36;
/** Hover rim is brighter and whiter so the tight edge clears bloom without widening. */
const LANE_HOVER_L=.46;
const _laneTube=new THREE.Color();
const laneVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
/**
 * Hex-maze line pattern on open lanes, stored as a distance field (source px from the nearest line, 0–PATTERN_MAX_D
 * over 0–1) so it stays crisp at any zoom. One texture tile is one period of the pattern: √3 × 1 in PATTERN_PERIOD units.
 */
const PATTERN_URL='/assets/patterns/hex-maze-sdf.png';
useTexture.preload(PATTERN_URL);
const PATTERN_PERIOD=1.3;
const PATTERN_MAX_D=8;
/** Honeycomb: repeat along the lane and stroke half-width, world units. Cells are pointy-topped, sides along the lane. */
const HEX_PERIOD=.9;
const HEX_WIDTH=HEX_PERIOD/Math.sqrt(3);
const HEX_LINE=.008;
const LANE_PATTERN_KIND:Record<LanePattern,number>={none:0,hexagons:1,maze:2};
const laneFragment=`varying vec2 vUv;uniform vec3 uColor,uTint;uniform vec2 uSize,uHalf,uRadius,uOrigin;uniform float uStrength,uBottom,uBand,uGloss,uTight,uPattern,uPatternKind;
uniform sampler2D tPattern;
/** Distance to the nearest honeycomb edge, in cell widths. */
float hexEdge(vec2 uv){
 vec2 r=vec2(1.,1.7320508),h=r*.5;
 vec2 a=mod(uv,r)-h,b=mod(uv-h,r)-h;
 vec2 g=abs(dot(a,a)<dot(b,b)?a:b);
 return .5-max(dot(g,vec2(.5,.8660254)),g.x);
}
void main(){
 // World-unit SDF so the rim sits on the authored border with equal thickness on every edge.
 vec2 p=(vUv-.5)*uSize;
 bool outer=uBottom<.5?(p.y<0.):(p.y>0.);
 float rad=outer?uRadius.x:uRadius.y;
 vec2 q=abs(p)-uHalf+rad;
 float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-rad;
 // Glow falls off inward; outside the border it drops away quickly so it never spills past the strip.
 float width=mix(.125,.045,uTight);
 float edge=(sd<0.?pow(max(0.,1.+sd/width),mix(3.2,2.2,uTight)):pow(max(0.,1.-sd/.034),2.))*mix(.95,1.2,uTight);
 float mask=1.-smoothstep(.015,.04,sd);
 vec2 n=p/uHalf*.48;
 float interior=(exp(-pow(abs(n.x)*3.6,2.))*.28+pow(max(0.,1.-length(n*vec2(1.1,1.05))*.9),2.)*.2)*.2*(1.-.6*uTight);
 float energy=min(1.,(edge+interior)*mask*uStrength);
 vec3 lit=uColor*(1.+edge*1.4)*energy;
 // Pattern lines, in world space so they run on unbroken between a column's two lanes; kept inside the border strips.
 vec2 pw=uOrigin+p;
 float line;
 if(uPatternKind<1.5){
  float e=hexEdge(pw/${HEX_WIDTH.toFixed(4)})*${HEX_WIDTH.toFixed(4)};
  float aa=max(fwidth(e)*.75,1e-4);
  line=1.-smoothstep(${HEX_LINE.toFixed(4)}-aa,${HEX_LINE.toFixed(4)}+aa,e);
 }else{
  float d=texture2D(tPattern,pw/vec2(${(PATTERN_PERIOD*Math.sqrt(3)).toFixed(4)},${PATTERN_PERIOD.toFixed(4)})).r*${PATTERN_MAX_D.toFixed(1)};
  float aa=max(fwidth(d)*.6,.15);
  line=1.-smoothstep(.45-aa,.45+aa,d);
 }
 line*=1.-smoothstep(-.1,-.04,sd);
 // Fake glossy strip: diagonal highlight band inside the lane rails, tinted by the nearest neon; uBand is its centre.
 // On a lit lane the pattern lines cut it out.
 float band=exp(-pow((vUv.x*.7+vUv.y*.35-uBand)*9.,2.));
 float inner=(1.-smoothstep(.42,.5,abs(n.x)))*(1.-smoothstep(.44,.5,abs(n.y)));
 vec3 gloss=uTint*band*inner*uGloss*.075*(1.-line*uPattern);
 vec3 etched=line*uPattern*uColor*min(1.,uStrength)*.3;
 gl_FragColor=vec4(lit+gloss+etched,1.);
}`;
/** LaneLight plane: the rim rectangle plus a margin for the inner glow falloff. */
const LANE_LIGHT_MARGIN=.18;
/** Above the gunmetal border tops (y .23) so the stroke is never depth-fought; still below the Node housing, which half-hides the power edge. */
const LANE_LIGHT_Y=.245;
const laneLightSize=(side:number)=>[LANE_RIM_HX*2+LANE_LIGHT_MARGIN*2,LANE_RIM[side].z1-LANE_RIM[side].z0+LANE_LIGHT_MARGIN*2] as const;
/**
 * Gloss sweep schedule: the band crosses both of a column's lanes together in SWEEP_LANE_S. Columns start in the order
 * N1, N4, N2, N5, N3 with uneven 10–16s gaps (12, 15, 10, 16, then 13 back to N1), once per SWEEP_CYCLE_S.
 */
const SWEEP_LANE_S=25, SWEEP_START=[0,27,53,12,37] as const, SWEEP_CYCLE_S=66;
/** Band centre travel in the shader's diagonal coordinate (lane spans 0 → 1.05); endpoints keep it off-lane. */
const SWEEP_FROM=-.3, SWEEP_TO=1.3, SWEEP_PARKED=-1;
function laneSweep(elapsed:number,index:number){
 const t=(((elapsed-SWEEP_START[index])%SWEEP_CYCLE_S)+SWEEP_CYCLE_S)%SWEEP_CYCLE_S;
 if(t<0||t>=SWEEP_LANE_S)return SWEEP_PARKED;
 return THREE.MathUtils.lerp(SWEEP_FROM,SWEEP_TO,t/SWEEP_LANE_S);
}
/** Always-mounted lane surface: winner/hover neon outline (intensity-driven) plus a scheduled gloss sweep. */
function LaneLight({x,index,side,lit,open,closed,pattern:patternKind}:{x:number;index:number;side:number;lit:LaneLit;open:boolean;closed:boolean;pattern:LanePattern}){
 const mesh=useRef<THREE.Mesh>(null);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const accents=useLaneAccents();
 const tube=serverIndex(side,x<0?'backup':'primary');
 const pattern=useTexture(PATTERN_URL);
 useLayoutEffect(()=>{
  pattern.wrapS=pattern.wrapT=THREE.RepeatWrapping;pattern.colorSpace=THREE.NoColorSpace;
  // Mip levels average distances across neighbouring lines and erase them on the tilted lanes; the shader antialiases instead.
  pattern.generateMipmaps=false;pattern.minFilter=pattern.magFilter=THREE.LinearFilter;pattern.needsUpdate=true;
 },[pattern]);
 // uv.y=0 → world +Z (player edge). Local bottom (away from power) is low uv.y; opponent bottom is high uv.y.
 const uniforms=useMemo(()=>{
  const [w,d]=laneLightSize(side);
  return {uColor:{value:new THREE.Color()},uTint:{value:new THREE.Color()},uSize:{value:new THREE.Vector2(w,d)},uHalf:{value:new THREE.Vector2(LANE_RIM_HX,(LANE_RIM[side].z1-LANE_RIM[side].z0)/2)},uRadius:{value:new THREE.Vector2(LANE_RIM_RADIUS.outer,LANE_RIM_RADIUS.power)},uStrength:{value:0},uBottom:{value:side===1?1:0},uBand:{value:reduced?.55:SWEEP_PARKED},uGloss:{value:0},uTight:{value:0},
   // Plane-local +y is world −Z, so this keeps the pattern continuous across the column.
   uOrigin:{value:new THREE.Vector2(x,-laneZ(side))},uPattern:{value:0},uPatternKind:{value:LANE_PATTERN_KIND[DEFAULT_LANE_PATTERN]},tPattern:{value:pattern}};
 },[side,reduced,x,pattern]);
 const args=useMemo(()=>[{uniforms,vertexShader:laneVertex,fragmentShader:laneFragment}] as [THREE.ShaderMaterialParameters],[uniforms]);
 const state=useRef({lit,open,closed,hoverT:0});state.current.lit=lit;state.current.open=open;state.current.closed=closed;
 const kind=LANE_PATTERN_KIND[patternKind];
 useFrame((frame,delta)=>{
  const dt=Math.min(delta,.05), s=state.current, {lit,closed}=s, u=uniforms;
  // The lines only show on a lit lane; Off keeps them hidden. Switching between patterns swaps them outright.
  if(kind)u.uPatternKind.value=kind;
  const patternTarget=s.open&&kind&&lit?1:0;
  u.uPattern.value=reduced?patternTarget:THREE.MathUtils.damp(u.uPattern.value,patternTarget,3,dt);
  const target=lit===3?(reduced?1.1:.35+.95*choicePulse(frame.clock.elapsedTime)):lit===2?1.35:lit===1?1.05:0;
  u.uStrength.value=reduced?target:THREE.MathUtils.damp(u.uStrength.value,target,lit?14:7,dt);
  u.uTight.value=reduced?(lit===2?1:0):THREE.MathUtils.damp(u.uTight.value,lit===2?1:0,lit===2?18:6,dt);
  s.hoverT=lit===2?s.hoverT+dt:0;
  if(lit===2){
   // Hover opens near-white and settles into the soft peach pink.
   const k=reduced?1:THREE.MathUtils.smoothstep(s.hoverT,.06,.7);
   u.uColor.value.setRGB(1,1,1).lerp(LANE_HOVER_COLOR,k).multiplyScalar(LANE_HOVER_L);
  }else if(lit){const c=laneLitColor(accents,side,lit);u.uColor.value.copy(c).multiplyScalar(LANE_RIM_L/Math.max(.05,c.r*.2126+c.g*.7152+c.b*.0722));}
  const g=serverGlow[tube], h=side===0?boardSideHealth.x:boardSideHealth.y;
  _laneTube.copy(g.color).lerp(accents[side],.4);
  u.uTint.value.copy(_laneTube).lerp(u.uColor.value,Math.min(1,u.uStrength.value));
  const glossTarget=closed?0:(.35+.65*Math.min(1.6,g.strength))*(.4+.6*h)+.7*Math.min(1,u.uStrength.value);
  u.uGloss.value=THREE.MathUtils.damp(u.uGloss.value,glossTarget,4,dt);
  if(!reduced)u.uBand.value=laneSweep(frame.clock.elapsedTime,index);
  if(mesh.current)mesh.current.visible=u.uStrength.value>.002||u.uGloss.value>.002||u.uPattern.value>.002;
 });
 return <mesh ref={mesh} position={[x,LANE_LIGHT_Y,laneZ(side)]} rotation={[-Math.PI/2,0,0]} renderOrder={2}>
  <planeGeometry args={laneLightSize(side)}/>
  <shaderMaterial args={args} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} blending={THREE.AdditiveBlending} toneMapped={false}/>
 </mesh>;
}
/**
 * Single-lane NodeLight z. The glass reflection lands ~.48 toward +Z of the light (camera tilt), so the local light sits
 * near the Node for its hot spot to fall just under the chevron tip, matching where the opponent's lands mid-lane.
 */
const NODE_LIGHT_Z=[.9,laneZ(1)] as const;
/** One pooled point light per node (always mounted, intensity 0 when idle) — replaces per-lane and per-socket lights. */
function NodeLight({x,lit}:{x:number;lit:[LaneLit,LaneLit]}){
 const light=useRef<THREE.PointLight>(null);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const accents=useLaneAccents();
 const litRef=useRef(lit);litRef.current=lit;
 useFrame((frame,delta)=>{
  const l=light.current;if(!l)return;
  const [near,far]=litRef.current, dt=Math.min(delta,.05);
  let target=0;
  if(near&&far){
   target=5.2*.85;l.position.set(x,1.4,(laneZ(0)+laneZ(1))/2);l.distance=4.2;
   l.color.copy(laneLitColor(accents,0,near)).lerp(laneLitColor(accents,1,far),.5);
  }else if(near||far){
   const side=near?0:1, mode=near||far;
   target=mode===2?5.8:5.2;l.position.set(x,.85,NODE_LIGHT_Z[side]);l.distance=.69;
   l.color.copy(laneLitColor(accents,side,mode));
  }
  if(!reduced&&(near===3||far===3))target*=.3+.7*choicePulse(frame.clock.elapsedTime);
  l.intensity=reduced?target:THREE.MathUtils.damp(l.intensity,target,target?14:7,dt); });
 return <pointLight ref={light} position={[x,.85,0]} intensity={0} distance={.69}/>;
}
/** Per-player rim/fill lights; each half dims and cools with that player's server health, and takes its base colour. */
const SIDE_LIGHTS=[{fill:8,rect:1.6},{fill:9,rect:1.5}] as const;
/** Board-wash gain on the tube glow (idle cyan ≈ .25 linear on the board top near a tube, drain peak stays < bloom threshold). */
const WASH_TUBE_K=4.5, WASH_DRAIN=2, WASH_RESTORE=1.05;
const WASH_DRAIN_RGB=new THREE.Color('#ff1030'), WASH_RESTORE_RGB=new THREE.Color('#ffb640');
/**
 * Cinematic rig + health-reactive board lighting. One useFrame drives the shared board-wash uniforms
 * (tube blobs, per-side dimming, drain/restore wash) and the per-side fill/rim lights.
 */
function BoardLightRig(){
 const lighting=useBoardLighting();
 const colors=usePlayerColors();
 const sideColors=useMemo(()=>colors.map(color=>({fill:new THREE.Color(color.accent),rect:new THREE.Color(color.light)})),[colors]);
 const fills=useRef<(THREE.PointLight|null)[]>([]);
 const rects=useRef<(THREE.RectAreaLight|null)[]>([]);
 useLayoutEffect(()=>{
  rects.current[0]?.lookAt(0,0,3.2);
  rects.current[1]?.lookAt(0,0,warpFarZ(-1.2));
 },[]);
 useFrame((_,delta)=>{
  const s=lighting.current, dt=Math.min(delta,.05), now=lightingNow();
  boardSideHealth.set(
   THREE.MathUtils.damp(boardSideHealth.x,THREE.MathUtils.clamp(s.sideHealth[0],0,1),4,dt),
   THREE.MathUtils.damp(boardSideHealth.y,THREE.MathUtils.clamp(s.sideHealth[1],0,1),4,dt));
  const u=boardWashUniforms;
  u.uBoardSideDim.value.set(THREE.MathUtils.lerp(.55,1,boardSideHealth.x),THREE.MathUtils.lerp(.55,1,boardSideHealth.y));
  for(let i=0;i<4;i++){
   const g=serverGlow[i];
   u.uBoardTubePos.value[i].copy(g.position);
   u.uBoardTubeCol.value[i].set(g.color.r,g.color.g,g.color.b).multiplyScalar(g.strength*WASH_TUBE_K);
  }
  const pulse=s.pulse;
  const env=pulse?pulseEnvelope(pulse.startedAt,now,pulseDuration(pulse.kind)):0;
  if(pulse&&env>0){
   const c=pulse.kind==='drain'?WASH_DRAIN_RGB:WASH_RESTORE_RGB;
   u.uBoardSideWash.value.set(c.r,c.g,c.b,env*(pulse.kind==='drain'?WASH_DRAIN:WASH_RESTORE));
   u.uBoardWashSide.value=pulse.owner===0?1:-1;
  }else u.uBoardSideWash.value.w=0;
  for(let side=0;side<2;side++){
   const h=side===0?boardSideHealth.x:boardSideHealth.y, k=sideLightScale(h), cool=(1-h)*.65, cfg=SIDE_LIGHTS[side];
   const fill=fills.current[side], rect=rects.current[side];
   if(fill){fill.intensity=cfg.fill*k;fill.color.copy(sideColors[side].fill).lerp(DAMAGED_LIGHT,cool);}
   if(rect){rect.intensity=cfg.rect*k;rect.color.copy(sideColors[side].rect).lerp(DAMAGED_LIGHT,cool);}
  }
 });
 return <>
  <pointLight ref={l=>{fills.current[0]=l;}} position={[-8,2,3.2]} intensity={SIDE_LIGHTS[0].fill} color={sideColors[0].fill} distance={12}/>
  <pointLight ref={l=>{fills.current[1]=l;}} position={[8,3,warpFarZ(-2.6)]} intensity={SIDE_LIGHTS[1].fill} color={sideColors[1].fill} distance={15}/>
  {/* Near: soft front fill matching the rail's outer edge. Far: high back-rim whose LTC highlight sweeps the far field top. */}
  <rectAreaLight ref={l=>{rects.current[0]=l;}} position={[0,3.4,7.6]} width={15} height={1.4} intensity={SIDE_LIGHTS[0].rect} color={sideColors[0].rect}/>
  <rectAreaLight ref={l=>{rects.current[1]=l;}} position={[0,4.6,-6.8-FAR_SHIFT]} width={16} height={2} intensity={SIDE_LIGHTS[1].rect} color={sideColors[1].rect}/>
 </>;
}
function BoardEffects({
  boardScan,
  boardScanTone,
  boardScanDuration,
  gameover,
  glowTint,
  scanning,
  onScanning,
  onPower,
  overlayRef,
  field,
  portal,
}:{
  boardScan?:boolean;
  boardScanTone?:BoardScanTone;
  boardScanDuration?:number;
  gameover?:boolean;
  glowTint?:string;
  scanning:boolean;
  onScanning:(scanning:boolean)=>void;
  onPower:(power:number)=>void;
  overlayRef:RefObject<HTMLCanvasElement|null>;
  field:RefObject<SingularityField>;
  portal:RefObject<HTMLDivElement|null>;
}){
 const {scanPass,onPass}=useBoardScanPass();
 const {singularityPass,onPass:onSingularityPass}=useSingularityPass();
 return <>
  <NeonHorizonScan active={!!boardScan} tone={boardScanTone} duration={(boardScanDuration??BOARD_SCAN_MS.normal)/1000} onPass={onPass} onScanning={onScanning} onPower={onPower} overlayRef={overlayRef}/>
  <Singularity active={!!gameover} onPass={onSingularityPass} field={field} portal={portal} tint={glowTint}/>
  <BoardFinish scanPass={scanPass} scanning={scanning} singularityPass={singularityPass}/>
 </>;
}

export function BoardScene(props:BoardProps){
 const portal=useRef<HTMLDivElement>(null!);
 const overlayRef=useRef<HTMLCanvasElement>(null);
 const [scanning,setScanning]=useState(false);
 const [boardPower,setBoardPower]=useState(1);
 const singularity=useRef<SingularityField>({cx:0,cy:0,radius:0,progress:0,snapshot:false});
 return <div className={`board-canvas${scanning?' is-scanning':''}`} style={{'--scan-power':String(boardPower)} as CSSProperties}><div className='board-hud-portal' ref={portal}/>
  <Canvas orthographic shadows={{type:THREE.PCFShadowMap}} camera={{position:[0,18,13.8],zoom:55,near:.1,far:100}} dpr={[1,1.6]} gl={{antialias:true,alpha:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:BOARD_EXPOSURE}}>
   <HudPortal.Provider value={portal}><SingularityContext.Provider value={singularity}><PlayerColorsProvider value={props.playerColors}><BoardLightingProvider servers={props.servers} effect={props.effect} awardNode={props.awardNode}>
    <CameraFit/><color attach="background" args={['#111722']}/><fog attach="fog" args={['#111722',32,68]}/><ambientLight intensity={.08} color='#a9b8d6'/><hemisphereLight args={['#b4c3de','#0c0818',.35]}/>
    <directionalLight position={[-3,12,8]} intensity={3.3} color='#dce3f0' castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-bias={-.0005} shadow-normalBias={.02} shadow-radius={3}/>
    <BoardLightRig/>
    <Suspense fallback={null}>
     <Environment frames={1} resolution={256}>
      <Lightformer form='rect' intensity={4.2} color='#e0e6f0' position={[-3,7,6]} rotation={[-Math.PI/2,0,0]} scale={[15,5,1]}/>
      <Lightformer form='rect' intensity={2.2} color='#9cabc5' position={[2,8,-5]} rotation={[Math.PI/2,0,0]} scale={[12,4,1]}/>
      <Lightformer form='rect' intensity={1.2} color='#b24cff' position={[10,4,0]} rotation={[0,-Math.PI/2,0]} scale={[3,10,1]}/>
      <Lightformer form='rect' intensity={.9} color='#ff8a1f' position={[-10,3,-1]} rotation={[0,Math.PI/2,0]} scale={[2,9,1]}/>
     </Environment>
     <BoardStage backgroundUrl={props.floorBackground}/><BoardSideEdges/>
     <Table/><ServerLights power={boardPower} style={props.serverStyle??DEFAULT_SERVER_STYLE} attacking={props.effect?.kind==='drain'?{owner:props.effect.targetOwner??0,target:props.effect.target??'',id:props.effect.id,before:props.effect.before,after:props.effect.after}:null} servers={props.servers} healing={props.effect?.kind==='restore'?{owner:props.effect.targetOwner??props.effect.player??0,target:props.effect.target??'',id:props.effect.id,before:props.effect.before,after:props.effect.after}:null}/>{props.nodes.map((node,i)=><NodeRegion key={i} index={i} node={node} p={props}/>)}
     {props.hudAnchors?.map(anchor=><Anchor key={anchor.id} position={anchor.position} mapDepth={anchor.id.startsWith('server-')||anchor.id.endsWith('-console')}>{anchor.content}</Anchor>)}
     <BoardReady onReady={props.onReady}/><ShaderWarmup/>
    </Suspense>
    <BoardEffects boardScan={props.boardScan} boardScanTone={props.boardScanTone} boardScanDuration={props.boardScanDuration} gameover={props.gameover} glowTint={props.winner==null?undefined:props.playerColors[props.winner].accent} scanning={scanning} onScanning={setScanning} onPower={setBoardPower} overlayRef={overlayRef} field={singularity} portal={portal}/>
   </BoardLightingProvider></PlayerColorsProvider></SingularityContext.Provider></HudPortal.Provider>
  </Canvas>
  <canvas ref={overlayRef} className='board-scan-overlay' aria-hidden='true'/>
 </div>;
}
export function Icon({name}:{name:string}){return <span className='icon' aria-hidden='true' style={{maskImage:`url(/assets/Icons/icon-${name}.svg)`,WebkitMaskImage:`url(/assets/Icons/icon-${name}.svg)`}}/>;}
export function CardArt({card}:{card:Card}){const art=cardArtworkPath(card);return <img className='card-art' src={servedArtPath(art)} alt={card.name} onError={event=>{const current=event.currentTarget.getAttribute('src');event.currentTarget.src=current!==art&&current!==CARD_ART_PLACEHOLDER?art:CARD_ART_PLACEHOLDER;}}/>;}

/** Smallest the title may shrink to before it ellipsizes. */
const PLATE_TITLE_MIN_SCALE=.58;
/** Title letter spacing range in px; a long name gives up its spacing before its size. */
const PLATE_TITLE_SPACING={min:0,max:1} as const;
/**
 * The title is centred across the plate's full width; a long name first tightens its letter spacing, then shrinks
 * to fit. Widths are layout pixels, unaffected by the anchor's projection scale.
 */
function PlateTitle({text}:{text:string}){
 const ref=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const title=ref.current;if(!title)return;
  let active=true;
  const fit=()=>{
   if(!active||title.clientWidth<=0)return;
   title.style.setProperty('--plate-title-scale','1');
   title.style.setProperty('--plate-title-spacing',`${PLATE_TITLE_SPACING.min}px`);
   // `scrollWidth` is rounded and never reports less than the box, so the text is measured directly and taken back
   // out of the anchor's screen scale. A pixel of slack keeps a name that lands on the edge off the ellipsis.
   const box=title.getBoundingClientRect();if(box.width<=0)return;
   const range=document.createRange();range.selectNodeContents(title);
   const need=range.getBoundingClientRect().width*title.offsetWidth/box.width;
   const style=getComputedStyle(title);
   const room=title.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-1;
   // Letter spacing trails every character, so each one adds a full step of width.
   const spacing=THREE.MathUtils.clamp((room-need)/Math.max(1,[...text].length)+PLATE_TITLE_SPACING.min,PLATE_TITLE_SPACING.min,PLATE_TITLE_SPACING.max);
   title.style.setProperty('--plate-title-spacing',`${spacing}px`);
   title.style.setProperty('--plate-title-scale',String(need>room?Math.max(PLATE_TITLE_MIN_SCALE,room/need):1));
  };
  fit();void document.fonts?.ready.then(fit);
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit);observer?.observe(title);
  return()=>{active=false;observer?.disconnect();};
 },[text]);
 return <b ref={ref}>{text}</b>;
}

/** Location copy is plain white; only its trigger prefixes carry their colour. */
function TriggerText({text}:{text:string}){return <>{splitLocationTriggers(text).map((part,index)=>part.trigger?<span key={index} className='location-trigger' data-trigger={part.trigger} style={{color:LOCATION_TRIGGERS[part.trigger].color}}>{part.text}</span>:part.text)}</>;}
