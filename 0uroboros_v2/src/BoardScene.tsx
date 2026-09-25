import { Suspense, useMemo, useRef, useEffect, useState, createContext, useContext, type RefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF, Environment, Lightformer, RoundedBox, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { Card } from './game';
import { CardFace } from './CardFace';
import './board-ritual.css';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from './cardArtwork';
import { boardMaterial, boardDepth, isBoardDepth } from './boardMaterials';
import { BoardStage, BoardFinish, CircuitArchitecture } from './BoardAtmosphere';
import { DataCenterLights, type CenterValues } from './DataCenterLights';

export const NODE_X = [-5.6, -2.8, 0, 2.8, 5.6];
export type BoardCard = {id:string; card?:Card; revealed:boolean;planned?:boolean};
export type BoardNode = {cards:[BoardCard[],BoardCard[]]; powers:[number,number]; weight:number; title:string; text:string; reward?:string};
export type BoardEffect = {id:number;kind:string;text:string;node?:number;player?:number;sourceCardId?:string;targetCardId?:string;target?:string;targetOwner?:number;before?:number;after?:number};
export type BoardProps = {
 closedNodes:number[]; collapseNode:number|null; awardNode:number|null; selectionNode:number|null; openNodes:number[];centers:[CenterValues,CenterValues];nodes:BoardNode[];turn:number;phase:string;priority:number;dragged:Card|null;hoveredNode:number|null;
 legal:(node:number)=>string|null;drop:(node:number)=>void;inspect:(card:Card)=>void;
 planning?:boolean; onLocationInspect?:(index:number)=>void; onReady?:()=>void; effect:BoardEffect|null; selectedNode:number|null; hudAnchors?:{id:string;position:[number,number,number];content:ReactNode}[];
};
function CameraFit(){const {camera,size}=useThree();useEffect(()=>{if(camera instanceof THREE.OrthographicCamera){camera.zoom=Math.min(size.width/22.7,size.height/14);camera.position.set(0,18,13.8);const shift=new THREE.Vector3(0,-13.1,18).normalize().multiplyScalar(Math.min(60,size.height*.07)/camera.zoom);camera.position.add(shift);camera.lookAt(shift.x,shift.y,shift.z+.7);camera.updateProjectionMatrix();}},[camera,size]);return null;}
function Table(){
 const {scene}=useGLTF('/assets/models/ouroboros-board-v4.glb');
 const surface=useTexture('/assets/materials/titanium-surface.png');
 const tuned=useMemo(()=>{
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
   for(let i=0;i<attr.count;i+=3){
    const points=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(attr,i+k).applyMatrix4(object.matrixWorld));
    const plaque=points.every(v=>v.y>.37&&v.z>3.48&&v.z<4.28&&NODE_X.some(x=>Math.abs(v.x-x)<.72));
    const socket=points.every(v=>v.y>.24&&Math.abs(v.z)>.64&&Math.abs(v.z)<1.34&&NODE_X.some(x=>Math.abs(v.x-x)<.48));
    const fixedPeripheral=points.every(v=>v.x>-9.9&&v.x<-6.25&&v.y<.035&&v.z>5.10&&v.z<6.70)||points.every(v=>v.x>-9.72&&v.x<-6.58&&v.y<-.075&&v.z>4.50&&v.z<5.10);
    const wallet=points.every(v=>v.x>6.05&&v.x<8.95&&v.z>6.65&&v.z<8.65);
    const endTurn=points.every(v=>v.x>9.20&&v.x<11.40&&v.z>6.92&&v.z<7.98);
    const cyanCore=(Array.isArray(object.material)?object.material:[object.material]).some(m=>m.name.includes('cyan Data Center core'))&&points.every(v=>Math.abs(v.x)>2.8&&Math.abs(v.x)<6.4&&Math.abs(v.z)>4.4&&Math.abs(v.z)<5.1);
    if(plaque||socket||cyanCore)continue;
    if(wallet)points.forEach(v=>{v.x+=.15;v.z-=.8;});
    if(endTurn)points.forEach(v=>{v.x-=.6;v.z-=.45;});
    points.forEach((v,k)=>{if(!fixedPeripheral&&isBoardDepth(v.x,v.z))v.z=boardDepth(v.z);v.applyMatrix4(inverse);kept.push(v.x,v.y,v.z);if(normal)normals.push(normal.getX(i+k),normal.getY(i+k),normal.getZ(i+k));if(uv)uvs.push(uv.getX(i+k),uv.getY(i+k));});
   }
   const clean=new THREE.BufferGeometry();clean.setAttribute('position',new THREE.Float32BufferAttribute(kept,3));if(normals.length)clean.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));if(uvs.length)clean.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));clean.computeBoundingSphere();object.geometry=clean;geometry.dispose();
   // The dynamic glass reservoirs replace the old flat cyan slabs.

   object.castShadow=true; object.receiveShadow=true;
   const adjust=(original:THREE.Material)=>boardMaterial(original,surface);
   object.material=Array.isArray(object.material)?object.material.map(adjust):adjust(object.material);
  });return clone;
 },[scene,surface]);
 useEffect(()=>()=>{tuned.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material.dispose());}});},[tuned]);
 return <primitive object={tuned}/>;
}

/** Authored shutters: no Location data enters this sealed presentation. */
function NodeShutters({x,open}:{x:number;open:boolean}){
 const doors=useRef<THREE.Group>(null);const progress=useRef(open?1:0);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 useFrame((_,delta)=>{
  const target=open?1:0;
  progress.current=reduced?target:THREE.MathUtils.damp(progress.current,target,5,Math.min(delta,.05));
  if(!doors.current)return;
  doors.current.visible=progress.current<.995;
  doors.current.children.forEach((child,i)=>{
   const sign=i===0?-1:1;
   child.position.x=sign*(.57+progress.current*1.1);
   child.position.y=.5+Math.sin(progress.current*Math.PI)*.28;
   child.scale.x=1-progress.current*.95;
  });
 });
 return <group position={[x,0,0]}>
  {!open&&[-1,1].map(side=><mesh key={side} position={[0,.24,side===1?boardDepth(2.43):-2.43]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[2.28,side===1?3.3:2.7]}/><shaderMaterial transparent depthWrite={false} uniforms={{}} vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`varying vec2 vUv;void main(){float stripe=step(.88,fract((vUv.x+vUv.y)*10.));float edges=step(.48,abs(vUv.x-.5));gl_FragColor=vec4(vec3(.027,.037,.057)+stripe*.025+edges*.06,.94);}`}/></mesh>)}
  <group ref={doors}>{[-1,1].map(sign=><group key={sign} position={[sign*.57,.5,0]}><RoundedBox args={[1.13,.16,1.26]} radius={.075} smoothness={3} castShadow receiveShadow><meshStandardMaterial color='#303c50' metalness={.85} roughness={.32}/></RoundedBox><mesh position={[sign*.44,.085,0]}><boxGeometry args={[.018,.02,.82]}/><meshStandardMaterial color='#7c8aa3' metalness={.8} roughness={.25}/></mesh></group>)}</group>
 </group>;
}
const HudPortal=createContext<RefObject<HTMLDivElement>|undefined>(undefined);
function BoardReady({onReady}:{onReady?:()=>void}){
 const reported=useRef(false);
 useFrame(()=>{if(!reported.current){reported.current=true;onReady?.();}},2);
 return null;
}
function Anchor({position,children,mapDepth=true}:{position:[number,number,number];children:React.ReactNode;mapDepth?:boolean}){const portal=useContext(HudPortal);const {size}=useThree();const scale=Math.min(size.width/22.7,size.height/14)/64;return <Html portal={portal} position={[position[0],position[1],mapDepth&&isBoardDepth(position[0],position[2])?boardDepth(position[2]):position[2]]} center zIndexRange={[30,10]}><div className='world-anchor' style={{transform:`scale(${scale})`}}>{children}</div></Html>;}
function NodeRegion({node,index,p}:{node:BoardNode;index:number;p:BoardProps}){
 const x=NODE_X[index],closed=p.closedNodes.includes(index),open=p.openNodes.includes(index)&&!closed;
 const awarding=p.awardNode===index, scanning=p.collapseNode===index, selecting=p.selectionNode===index;
 const legal=p.dragged?p.legal(index):null;
 const active=p.effect?.node===index;
 const hovered=!!p.dragged&&p.hoveredNode===index;
 const accepted=hovered&&!legal;
 const tied=node.powers[0]===node.powers[1];
 const unresolved=!node.title||node.title==='Location pending';
 const wasOpen=useRef(open);const [opening,setOpening]=useState(false);
 useEffect(()=>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  if(open&&!wasOpen.current){setOpening(true);timeout=setTimeout(()=>setOpening(false),1100);}
  if(!open)setOpening(false);
  wasOpen.current=open;return()=>clearTimeout(timeout);
 },[open]);
 return <group>
  <NodeShutters x={x} open={open}/>
  <PowerSocket x={x} side={0} winning={node.powers[0]>node.powers[1]}/><PowerSocket x={x} side={1} winning={node.powers[1]>node.powers[0]}/>
  <Anchor position={[x,.24,2.30]}>
   <div className={`lane-drop-target ${open?'':'sealed'} ${hovered?(accepted?'lane-hovered':'lane-rejected'):''}`} data-lane-drop={index} aria-hidden='true'/>
  </Anchor>
  {[1,0].map(side=>{
   const winning=node.powers[side]>node.powers[side===0?1:0];
   const sourceActive=active&&p.effect?.player===side;
   return <group key={side}>
    {!closed&&((!p.dragged&&(winning||(scanning&&tied)))||(side===0&&accepted))&&<LaneLight x={x} side={side} hovering={side===0&&accepted}/>}
    <LaneTurnover x={x} side={side} turning={awarding||closed}/>
    <Anchor position={[x,.35,side===1?-2.65:2.2]}>
     <div className={`deployment-grid ${awarding?'lane-flipping':''} ${closed?'lane-closed':''} ${side===0?'local-drop':''} ${accepted&&side===0?'hovered-placement':''} ${open?'':'sealed'} ${sourceActive?'resolving-source':''}`} data-lane-node={index} data-lane-owner={side} data-node-drop={side===0?index:undefined} data-collapse-winner={!closed&&scanning&&(winning||tied)?'true':undefined} data-lane-lit={accepted&&side===0?'hover':!p.dragged&&winning?'winner':undefined}>
      {node.cards[side].map(c=><button key={c.id} data-card-id={c.id} className={`field-card ${c.revealed||(side===0&&p.planning&&c.planned)?'revealed':'hidden-card'} ${sourceActive&&p.effect?.sourceCardId===c.id?'active-source':''}`} aria-label={c.card&&(c.revealed||side===0)?`Inspect ${c.card.name}`:'Face-down card'} onClick={()=>{if(c.card&&(c.revealed||side===0))p.inspect(c.card);}}>
       {(c.revealed||(side===0&&p.planning&&c.planned))&&c.card?<CardFace card={c.card} compact powerChanging={p.effect?.kind==='power'&&p.effect.targetCardId===c.id}/>:<img src='/assets/card_art/card backs/cardback_02_silicone.png' alt='Face-down card'/>}
      </button>)}
     </div>
    </Anchor>
    <Anchor position={[x,side===1?.735:.49,side===1?-.98:.98]}>
     <div className={`power-badge ${side===0?'local':'opponent'} ${winning?'winning':tied?'tied':'trailing'} ${sourceActive?'score-active':''}`} aria-label={`${side===0?'Your':'Opponent'} Node ${index+1} Power ${node.powers[side]}, ${tied?'tied':winning?'leading':'trailing'}${p.priority===side?', priority':''}`}>
      <b key={node.powers[side]}>{node.powers[side]}</b>
     </div>
    </Anchor>
   </group>;
  })}
  <Anchor position={[x,.76,0]}>
   {!open?<div className={`sealed-location ${selecting?'selection-focus':''}`} data-location-node={index} data-node-sealed={index} data-node-closed={closed?index:undefined} aria-label={`Node ${index+1} sealed. Location unrevealed.`}><b>N{index+1}</b><span>{closed?'RESOLVED':'UNREVEALED'}</span></div>:<button type='button' data-location-node={index} className={`location-plate ${active?'active':''} ${scanning?'collapse-focus':''} ${selecting?'selection-focus':''} ${accepted?'drop-highlight':''} ${opening?'location-opening':''} ${unresolved?'unassigned':''}`} onClick={()=>p.onLocationInspect?.(index)} aria-label={`Inspect Node ${index+1}${unresolved?'':`: ${node.title}`}`} disabled={!p.onLocationInspect}>
    <small>N{index+1}<i aria-hidden='true'>◇</i></small>
    <b>{unresolved?'Open circuit':node.title}</b>
    {!unresolved&&node.reward?<span className='location-reward'><RewardText text={node.reward}/></span>:<span className='location-rule'>{unresolved?'Location source required':node.text}</span>}
   </button>}
  </Anchor>
  {awarding&&p.effect&&[0,1].filter(side=>tied||node.powers[side]>node.powers[1-side]).map(side=><PulseField key={side} x={x} side={side} kind={p.effect!.kind} eventId={p.effect!.id}/>)}
  {active&&!awarding&&!closed&&p.effect?.player!==undefined&&['reveal','draw','actions','crypto','vp','drain','restore','move','probability','reward'].includes(p.effect.kind)&&<PulseField x={x} side={p.effect.player} kind={p.effect.kind} eventId={p.effect.id}/>}

 </group>;
}
function PowerSocket({x,side,winning}:{x:number;side:number;winning:boolean}){
 const geometry=useMemo(()=>{const shape=new THREE.Shape();shape.moveTo(-.46,0);shape.lineTo(0,side===0?.39:.3);shape.lineTo(.46,0);shape.lineTo(0,side===0?-.39:-.3);shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025});},[side]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const glow=side===0?'#00eaff':'#ff0b66';
 return <group position={[x,side===0?.38:.62,side===0?.98:-.98]} rotation={[-Math.PI/2,0,0]}>
  {winning&&<pointLight position={[0,0,.28]} color={glow} intensity={3.8} distance={1.85}/>}
  <mesh position={[0,side===0?.36:-.30,-.035]} castShadow><boxGeometry args={[.26,.40,.085]}/><meshStandardMaterial color={winning?'#12394a':'#314253'} metalness={.88} roughness={.24} emissive={winning?glow:'#000000'} emissiveIntensity={winning?.18:0}/></mesh>
  <mesh geometry={geometry} castShadow><meshPhysicalMaterial color={winning?'#132436':'#263a4b'} metalness={.85} roughness={.24} clearcoat={.5} emissive={winning?glow:'#000000'} emissiveIntensity={winning?.18:0}/></mesh>
  <mesh geometry={geometry} position={[0,0,.081]} scale={[.82,.82,.1]}><meshStandardMaterial color='#050813' roughness={.23} metalness={.65} emissive={winning?glow:side===0?'#124158':'#481533'} emissiveIntensity={winning?2.1:.4}/></mesh>
 </group>;
}
function LaneTurnover({x,side,turning}:{x:number;side:number;turning:boolean}){
 const mesh=useRef<THREE.Group>(null),progress=useRef(0);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 useFrame((_,delta)=>{progress.current=reduced?(turning?1:0):THREE.MathUtils.damp(progress.current,turning?1:0,5,Math.min(delta,.05));if(mesh.current){mesh.current.rotation.z=progress.current*Math.PI;mesh.current.visible=progress.current>.002;}});
 return <group ref={mesh} position={[x,.27,side===0?boardDepth(2.4):-2.4]}><mesh><boxGeometry args={[2.38,.035,side===0?3.5:2.96]}/><meshStandardMaterial color='#111923' metalness={.45} roughness={.6}/></mesh><mesh position={[0,-.022,0]} rotation={[Math.PI/2,0,0]}><planeGeometry args={[2.23,2.8]}/><shaderMaterial vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`varying vec2 vUv;void main(){float stripe=step(.9,fract((vUv.x+vUv.y)*13.));float edge=step(.48,abs(vUv.x-.5));gl_FragColor=vec4(vec3(.027,.037,.057)+stripe*.022+edge*.055,1.);}`}/></mesh></group>;
}
function LaneLight({x,side,hovering}:{x:number;side:number;hovering:boolean}){
 const color=hovering?'#8f35ff':side===0?'#00f0ff':'#ff0b66';
 const z=side===0?boardDepth(2.4):-2.4;
 return <group>
  <pointLight position={[x,.85,z]} color={color} intensity={hovering?5.8:5.2} distance={3.0}/>
  <mesh position={[x,.23,z]} rotation={[-Math.PI/2,0,0]}>
   <planeGeometry args={[2.56,side===0?3.78:3.22]}/>
   <shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} uniforms={{uColor:{value:new THREE.Color(color)},uStrength:{value:hovering?1.35:1.05}}} vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`varying vec2 vUv;uniform vec3 uColor;uniform float uStrength;void main(){vec2 p=abs(vUv-.5)*2.;float mask=(1.-smoothstep(.93,1.,p.x))*(1.-smoothstep(.95,1.,p.y));float edge=pow(p.x,7.)*.75+pow(p.y,8.)*.55;float lane=exp(-pow(abs(vUv.x-.5)*3.1,2.))*.34;float center=pow(max(0.,1.-length(p)*.58),2.)*.22;float rails=(smoothstep(.42,.48,abs(vUv.x-.5))*smoothstep(.50,.43,abs(vUv.x-.5)))*.9;gl_FragColor=vec4(uColor*(1.+edge*1.6+rails),min(1.,(lane+center+edge+rails)*mask*uStrength));}`}/>
  </mesh>
 </group>;
}
function PulseField({x,side,kind,eventId}:{x:number;side:number;kind:string;eventId:number}){
 const ref=useRef<THREE.Mesh>(null);const start=useRef(0);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const uniforms=useMemo(()=>({uTime:{value:0},uColor:{value:new THREE.Color(kind==='restore'||kind==='vp'?'#ffcc12':kind==='crypto'?'#1fffb1':kind==='draw'?'#4185ff':kind==='actions'?'#27e2ff':kind==='selection'?'#ffcc12':'#bc64ff')}}),[kind]);
 useFrame(({clock})=>{if(!start.current)start.current=clock.elapsedTime;uniforms.uTime.value=reduced?.65:clock.elapsedTime-start.current;});
 useEffect(()=>{start.current=0;},[eventId]);
 return <mesh ref={ref} position={[x,.33,side===0?boardDepth(2.4):-2.4]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2.35,side===0?3.3:2.72]}/><shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} uniforms={uniforms} vertexShader={`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`} fragmentShader={`varying vec2 vUv;uniform float uTime;uniform vec3 uColor;void main(){
 vec2 p=(vUv-.5)*vec2(1.,1.35);float r=length(p);
 float wave=exp(-65.*abs(r-mod(uTime*.48,.95)));
 float ring=pow(.5+.5*cos(r*45.-uTime*5.),18.)*.15;
 float sweep=fract(uTime*.55);float laser=exp(-abs(vUv.y-sweep)*190.);
 float halo=exp(-abs(vUv.y-sweep)*27.)*.18;
 float mask=(1.-smoothstep(.43,.50,abs(vUv.x-.5)))*(1.-smoothstep(.45,.50,abs(vUv.y-.5)));
 float energy=(wave*.5+ring+laser*.85+halo)*mask;
 gl_FragColor=vec4(uColor*(1.+laser*1.8),energy);
 }`}/></mesh>;
}
export function BoardScene(props:BoardProps){
 const portal=useRef<HTMLDivElement>(null!);
 return <div className='board-canvas'><div className='board-hud-portal' ref={portal}/>
  <Canvas orthographic shadows={{type:THREE.PCFShadowMap}} camera={{position:[0,18,13.8],zoom:55,near:.1,far:100}} dpr={[1,1.6]} gl={{antialias:true,alpha:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1}}>
   <HudPortal.Provider value={portal}>
    <CameraFit/><color attach="background" args={['#111722']}/><fog attach="fog" args={['#111722',32,68]}/><ambientLight intensity={.18}/><hemisphereLight args={['#bcc9dc','#100b1b',.65]}/>
    <directionalLight position={[-3,12,8]} intensity={3.1} color='#d8deeb' castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-bias={-.0005} shadow-normalBias={.02} shadow-radius={3}/>
    <pointLight position={[-8,2,1]} intensity={9} color='#ff0ba1' distance={12}/><pointLight position={[8,3,5]} intensity={12} color='#31a9ff' distance={15}/>
    <Suspense fallback={null}>
     <Environment frames={1} resolution={256}>
      <Lightformer form='rect' intensity={3.8} color='#e0e6f0' position={[-3,7,6]} rotation={[-Math.PI/2,0,0]} scale={[15,5,1]}/>
      <Lightformer form='rect' intensity={2.2} color='#9cabc5' position={[2,8,-5]} rotation={[Math.PI/2,0,0]} scale={[12,4,1]}/>
      <Lightformer form='rect' intensity={1.4} color='#31a9ff' position={[10,4,0]} rotation={[0,-Math.PI/2,0]} scale={[3,10,1]}/>
      <Lightformer form='rect' intensity={.8} color='#ff0ba1' position={[-10,3,-1]} rotation={[0,Math.PI/2,0]} scale={[2,9,1]}/>
     </Environment>
     <BoardStage/><CircuitArchitecture/>
     <Table/><DataCenterLights attacking={props.effect?.kind==='drain'?{owner:props.effect.targetOwner??0,target:props.effect.target??'',id:props.effect.id,before:props.effect.before,after:props.effect.after}:null} centers={props.centers} healing={props.effect?.kind==='restore'?{owner:props.effect.targetOwner??props.effect.player??0,target:props.effect.target??'',id:props.effect.id,before:props.effect.before,after:props.effect.after}:null}/>{props.nodes.map((node,i)=><NodeRegion key={i} index={i} node={node} p={props}/>)}
     {props.hudAnchors?.map(anchor=><Anchor key={anchor.id} position={anchor.position} mapDepth={anchor.id.startsWith('dc-')||anchor.id.endsWith('-console')}>{anchor.content}</Anchor>)}
     <BoardReady onReady={props.onReady}/>
    </Suspense>
    <BoardFinish/>
   </HudPortal.Provider>
  </Canvas>
 </div>;
}
export function Icon({name}:{name:string}){return <span className='icon' aria-hidden='true' style={{maskImage:`url(/assets/Icons/icon-${name}.svg)`,WebkitMaskImage:`url(/assets/Icons/icon-${name}.svg)`}}/>;}
export function CardArt({card}:{card:Card}){return <img className='card-art' src={cardArtworkPath(card)} alt={card.name} onError={event=>{if(event.currentTarget.getAttribute('src')!==CARD_ART_PLACEHOLDER)event.currentTarget.src=CARD_ART_PLACEHOLDER;}}/>;}

function RewardText({text}:{text:string}){return <>{text.split(/(\+\d+ Crypto|\+\d+ VP|Draw \d+ cards?)/g).map((part,index)=><span key={index} className={part.includes('Crypto')?'resource-crypto':part.includes('VP')?'resource-vp':part.startsWith('Draw ')?'resource-draw':''}>{part}</span>)}</>;}
