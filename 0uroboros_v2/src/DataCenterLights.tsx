import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { boardDepth } from './boardMaterials';
RectAreaLightUniformsLib.init();
export type CenterValues = { primary:number; backup:number };
const healColor=new THREE.Color('#ffcc12'), idleColor=new THREE.Color('#08dfff'), attackColor=new THREE.Color('#fa0048');
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
type CenterPulse = { owner:number; target:string; id?:number; before?:number; after?:number };
function IntegrityTube({x,z,ratio,maximum,healing,attacking}:{x:number;z:number;ratio:number;maximum:number;healing:CenterPulse|null;attacking:CenterPulse|null}) {
 const light=useRef<THREE.RectAreaLight>(null);
 const liquid=useRef<THREE.Mesh>(null);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const uniforms=useMemo(()=>({fill:{value:ratio},time:{value:0},tint:{value:idleColor.clone()}}),[]);
 const pulse=attacking??healing;
 const targetRatio=THREE.MathUtils.clamp((pulse?.after??ratio*maximum)/maximum,0,1);
 useEffect(()=>{
  if(!pulse||pulse.before===undefined)return;
  uniforms.fill.value=THREE.MathUtils.clamp(pulse.before/maximum,0,1);
 },[maximum,pulse?.id,pulse?.before,uniforms]);
 useFrame((_,delta)=>{
  uniforms.fill.value=THREE.MathUtils.damp(uniforms.fill.value,targetRatio,attacking?9:healing?6:5,Math.min(delta,.05));
  // Change the actual liquid volume as integrity changes. A shader-only cutoff
  // disappeared into bloom and the glass shell, making damage read as a tint
  // change instead of a draining health reservoir.
  if(liquid.current){
   const level=THREE.MathUtils.clamp(uniforms.fill.value,0,1);
   liquid.current.scale.y=Math.max(level,.0001);
   liquid.current.position.y=-1.48+level*1.48;
   liquid.current.visible=level>.001;
  }
  uniforms.time.value+=reduced?0:Math.min(delta,.05);
  uniforms.tint.value.lerp(attacking?attackColor:healing?healColor:idleColor,Math.min(1,delta*12));
  if(light.current){light.current.intensity=(attacking?20:healing?16:10)*(0.12+uniforms.fill.value*.9);light.current.color.copy(uniforms.tint.value);}
 });
 return <group position={[x,.43,z]}>
  <rectAreaLight ref={light} position={[0,.3,0]} rotation={[-Math.PI/2,0,0]} color='#08dfff' intensity={8*ratio} width={3.2} height={.5}/>
  <mesh position={[0,-.11,0]} receiveShadow><boxGeometry args={[3.16,.10,.48]}/><meshStandardMaterial color='#101a28' metalness={.9} roughness={.27}/></mesh>
  <group rotation={[0,0,-Math.PI/2]}>
   <mesh><cylinderGeometry args={[.21,.21,3.04,32,1,true]}/><meshPhysicalMaterial color='#14e8ff' transparent opacity={.20} metalness={.04} roughness={.04} clearcoat={1} clearcoatRoughness={.05} transmission={.18} thickness={.18} side={THREE.DoubleSide} depthWrite={false} emissive='#0067a4' emissiveIntensity={.38}/></mesh>
   <mesh><cylinderGeometry args={[.224,.224,3.08,32,1,true]}/><shaderMaterial uniforms={uniforms} vertexShader={vertex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} fragmentShader={`varying vec2 vUv;uniform float fill;uniform float time;uniform vec3 tint;
    void main(){float axis=vUv.y;float surface=pow(abs(sin(vUv.x*3.14159)),.35);float rim=smoothstep(.78,1.,surface);float liquid=1.-smoothstep(fill-.015,fill+.015,axis);
    float alive=step(.001,fill);float upper=step(fill+.006,axis);
    float emptyGlow=(.025+rim*.14+pow(.5+.5*sin(axis*22.+time),10.)*.035)*upper;
    float filledGlow=(.34+rim*.82+pow(.5+.5*sin(axis*37.-time*2.4),14.)*.32)*liquid*alive;
    gl_FragColor=vec4(tint,max(emptyGlow*.12,filledGlow*.9));}`}/></mesh>
   <mesh ref={liquid} position={[0,-1.48+ratio*1.48,0]} scale={[1,Math.max(ratio,.0001),1]}><cylinderGeometry args={[.164,.164,2.96,24,1]}/><shaderMaterial uniforms={uniforms} vertexShader={vertex} transparent depthWrite={false} toneMapped={false} fragmentShader={`varying vec2 vUv;uniform float time;uniform vec3 tint;
    void main(){float axis=vUv.y;float body=1.;
    float ripple=sin(axis*44.-time*2.8+sin(vUv.x*19.+time)*1.3)*.07;
    float filament=pow(.5+.5*sin(vUv.x*31.4+sin(axis*12.-time)*.7),14.);
    float flow=pow(.5+.5*sin(axis*29.-time*2.+vUv.x*13.),12.);
    float meniscus=smoothstep(.82,1.,axis)*.9;
    vec3 energy=tint*(.32+ripple+filament*.72+flow*.22+meniscus*1.15);
    gl_FragColor=vec4(energy,.98);}`}/></mesh>
   {[-1,1].map(side=><group key={side} position={[0,side*1.54,0]}>
    <mesh castShadow><cylinderGeometry args={[.255,.255,.13,8]}/><meshStandardMaterial color='#52647a' metalness={.9} roughness={.22}/></mesh>
    <mesh position={[0,-side*.075,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.203,.018,6,24]}/><meshStandardMaterial color='#70929f' metalness={.85} roughness={.24}/></mesh>
   </group>)}
  </group>
  <mesh position={[0,-.13,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[4.8,2.15]}/><shaderMaterial uniforms={uniforms} vertexShader={vertex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fragmentShader={`varying vec2 vUv;uniform float fill;uniform vec3 tint;void main(){float glow=pow(max(0.,1.-length((vUv-.5)*2.)),2.)*(.2+fill);gl_FragColor=vec4(tint,glow*.24);}`}/></mesh>
 </group>;
}
export function DataCenterLights({centers,healing,attacking}:{centers:[CenterValues,CenterValues];healing:CenterPulse|null;attacking:CenterPulse|null}) {
 return <>{centers.flatMap((center,owner)=>(['backup','primary'] as const).map(target=>{
  const maximum=target==='primary'?2000:1500;
  const activeAttack=attacking?.owner===owner&&attacking.target===target?attacking:null;
  const activeHeal=healing?.owner===owner&&healing.target===target?healing:null;
  return <IntegrityTube key={`${owner}-${target}`} x={target==='backup'?-4.6:4.6} z={owner===1?-4.75:boardDepth(4.75)} maximum={maximum} attacking={activeAttack} healing={activeHeal} ratio={center[target]/maximum}/>;
 }))}</>;
}
