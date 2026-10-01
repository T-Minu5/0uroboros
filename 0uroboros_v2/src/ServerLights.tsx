import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { boardDepth } from './boardMaterials';
import { warpFarZ } from './boardLayout';
import { SERVER_MAX, lightingNow, pulseDuration, pulseEnvelope, useBoardLighting } from './boardLighting';
import { usePlayerColors } from './playerTheme';
import { MATCAP_URL } from './NodeSealOrigami';
import { DISC_COUNT, DISC_RADIUS, DISC_THICKNESS, TUBE_LENGTH, advanceDiscPhases, discAt, discScale } from './pulseOrigami';
import { SHIELD_HITS, SHIELD_RADIUS, hitGlow, shieldFragment, shieldVertex } from './serverShield';
import type { ServerStyle } from './serverStyles';
RectAreaLightUniformsLib.init();
export type ServerValues = { primary:number; backup:number };
type Target='primary'|'backup';
/** `idle` is the classic tube tint; a themed board substitutes the owner's base colour, while drain and restore are fixed. */
export const SERVER_TINTS={idle:'#08dfff',drain:'#fa0048',restore:'#ffcc12'} as const;
const healColor=new THREE.Color(SERVER_TINTS.restore), idleColor=new THREE.Color(SERVER_TINTS.idle), attackColor=new THREE.Color(SERVER_TINTS.drain), sparkHot=new THREE.Color('#ffffff');
const lum=(c:THREE.Color)=>.2126*c.r+.7152*c.g+.0722*c.b;
const hash1=(n:number)=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const CAM_TILT=-Math.atan2(18,13.8), LIGHT_BASE=3.9, SPARKS=48;
// Target luminance per state and the max-channel cap that keeps red/gold on-hue through ACES (idle cap never binds).
const TARGET_L=[.975,1.2,1.05], HUE_CAP=[10,1.05,.675];
/** Overall server dimming on top of the scene exposure, and the per-state scale on the tube glow and its light: idle, drain, restore. */
const SERVER_DIM=.765;
const STATE_BRIGHTNESS=[.9,1,.75].map(k=>k*SERVER_DIM);
const GLASS_COLOR=new THREE.Color('#7d848c'), GLASS_EMISSIVE=new THREE.Color('#1c1f23');
const tubeX=(target:Target)=>target==='backup'?-4.6:4.6, tubeZ=(owner:number)=>owner===1?warpFarZ(-4.75):boardDepth(4.75);
/** Per-tube glow, refreshed every frame. `color` = linear tint; `strength` = light multiplier (~.69 idle at full health, 0 dark, ~1.2 at a drain peak). */
export type ServerGlow={owner:number;target:Target;position:THREE.Vector3;color:THREE.Color;strength:number;health:number;flicker:number;kind:'idle'|'drain'|'restore';pulse:number};
const glow:ServerGlow[]=[0,1].flatMap(owner=>(['backup','primary'] as const).map(target=>({owner,target,position:new THREE.Vector3(tubeX(target),.43,tubeZ(owner)),color:idleColor.clone(),strength:1,health:1,flicker:0,kind:'idle' as const,pulse:0})));
export const serverIndex=(owner:number,target:Target)=>owner*2+(target==='primary'?1:0);
/** Read-only view for other board systems (e.g. the board wash); read inside useFrame. */
export const serverGlow:readonly Readonly<ServerGlow>[]=glow;
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const tubeVertex=`varying vec2 vUv;varying float vFace;void main(){vUv=uv;vFace=abs(normalize(normalMatrix*normal).z);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const glslHash=`float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}`;
const glslCap=`vec3 cap3(vec3 c,float m){return c*min(1.,m/max(max(c.r,max(c.g,c.b)),1e-4));}`;
// Up to four travelling light pulses per tube; position in tube units (0 = left end), sign = travel direction, comet tail trails behind.
const glslPulses=`uniform vec4 pulses,pulseDir;float pulseAt(float a){float s=0.;for(int i=0;i<4;i++){float d=(a-pulses[i])*pulseDir[i];s+=exp(-pow(d*(d<0.?13.:45.),2.));}return s;}`;
const PULSE_OFF=-9, PULSE_SLOTS=4;
const SHIELD_FRAGMENT=shieldFragment(glslCap,glslPulses);
/** Hit ripple colours, luminance-normalised so red and gold read equally bright. */
const HIT_L=.9, HIT_DRAIN=attackColor.clone().multiplyScalar(HIT_L/lum(attackColor)), HIT_RESTORE=healColor.clone().multiplyScalar(HIT_L/lum(healColor));
/** Pulse Origami: live discs glow in the tube tint; drained discs are dark metal. The first disc is gold. */
const DISC_GLOW=1.5, DISC_PULSE_BOOST=1.6, DISC_HIT=1.4, DISC_DARK=new THREE.Color(.05,.055,.06), DISC_GOLD=new THREE.Color('#c9a227').multiplyScalar(1.5);
const pulseLevel=(a:number,pos:number[],vel:number[])=>{let s=0;for(let i=0;i<PULSE_SLOTS;i++){if(pos[i]===PULSE_OFF)continue;const d=(a-pos[i])*(Math.sign(vel[i])||1),k=d*(d<0?13:45);s+=Math.exp(-k*k);}return s;};
/** Solo 50%, pair 30%, triple 20% — never more than three back-to-back. */
const burstSize=()=>{const r=Math.random();return r<.5?1:r<.8?2:3;};
/**
 * One beam schedule per player, so both of a player's tubes fire together and race outward from the centre.
 * Whichever tube renders first in a frame advances it; `shot` counts fired beams so the partner tube picks up the same one.
 */
const ownerBeams=[0,1].map(()=>({next:.5+Math.random()*5,left:0,shot:0,speed:1}));
function advanceOwnerBeams(owner:number,clock:number){
 const s=ownerBeams[owner];
 if(clock<s.next)return s;
 if(s.left===0)s.left=burstSize();
 s.left--;s.shot++;s.speed=1+Math.random()*.4;
 s.next=clock+(s.left>0?.16+Math.random()*.12:2.8+Math.random()*9.2);
 return s;
}
const sparkVertex=`varying vec2 vUv;varying vec3 vCol;void main(){vUv=uv;vCol=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const sparkFragment=`varying vec2 vUv;varying vec3 vCol;void main(){float x=abs(vUv.x*2.-1.),y=abs(vUv.y*2.-1.);gl_FragColor=vec4(vCol*(1.-x*x)*(1.-y)*mix(.35,1.,vUv.x),1.);}`;
type SparkPool={p:Float32Array;v:Float32Array;age:Float32Array;life:Float32Array;str:Float32Array;next:number};
function spawnSparks(s:SparkPool,n:number,x:number,str:number,speed:number){
 for(let k=0;k<n;k++){const i=s.next,i3=i*3,a=Math.random()*Math.PI;s.next=(i+1)%SPARKS;
  s.p[i3]=x+(Math.random()-.5)*.06;s.p[i3+1]=Math.sin(a)*.17;s.p[i3+2]=Math.cos(a)*.17;
  s.v[i3]=(Math.random()*2-1)*1.7*speed;s.v[i3+1]=(1.3+Math.random()*2.1)*speed;s.v[i3+2]=((Math.random()*2-1)*.8+.35)*speed;
  s.age[i]=0;s.life[i]=.35+Math.random()*.35;s.str[i]=str;}
}
const _m=new THREE.Matrix4(), _c=new THREE.Vector3(), _v=new THREE.Vector3(), _s=new THREE.Vector3(), _col=new THREE.Color();
type ServerPulse = { owner:number; target:string; id?:number; before?:number; after?:number };
type TubeUniforms={fill:{value:number};power:{value:number};flicker:{value:number};gain:{value:number};tint:{value:THREE.Color};
 shieldTime:{value:number};motion:{value:number};hitA:{value:number[]};hitT:{value:number[]};hitCol:{value:THREE.Color[]}};
type TubeBeams={pos:number[];vel:number[]};
const _disc=new THREE.Object3D(), _discColor=new THREE.Color(), _discLive=new THREE.Color(), _discHit=new THREE.Color();
/**
 * Pulse Origami discs along the tube (tube-local y after the tube group's rotation); they freeze and darken past the fill
 * level. With no shield over them, the discs carry the hit ripples themselves.
 */
function PulseOrigami({uniforms,beams,reduced}:{uniforms:TubeUniforms;beams:{current:TubeBeams};reduced:boolean}){
 const matcap=useTexture(MATCAP_URL);
 const mesh=useMemo(()=>{
  const m=new THREE.InstancedMesh(new THREE.CylinderGeometry(DISC_RADIUS,DISC_RADIUS,DISC_THICKNESS,32),new THREE.MeshMatcapMaterial({matcap,toneMapped:false}),DISC_COUNT);
  m.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(DISC_COUNT*3),3);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.instanceColor.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;
  return m;
 },[matcap]);
 useEffect(()=>()=>{mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();mesh.dispose();},[mesh]);
 const discs=useMemo(()=>({phase:new Float32Array(DISC_COUNT),live:new Float32Array(DISC_COUNT)}),[]);
 useFrame((_,delta)=>{
  const dt=Math.min(delta,.05), fill=uniforms.fill.value, power=uniforms.power.value, lit=power>.02;
  if(!reduced)advanceDiscPhases(discs.phase,fill,lit,dt);
  const dim=THREE.MathUtils.clamp(power,0,1)*(1-uniforms.flicker.value*.75), {pos,vel}=beams.current;
  for(let i=0;i<DISC_COUNT;i++){
   const a=discAt(i), on=lit&&a<fill?1:0;
   discs.live[i]=reduced?on:THREE.MathUtils.damp(discs.live[i],on,6,dt);
   const s=discScale(discs.phase[i],i);
   _disc.position.set(0,(a-.5)*TUBE_LENGTH,0);_disc.scale.set(s,1,s);_disc.updateMatrix();mesh.setMatrixAt(i,_disc.matrix);
   if(i===0)_discLive.copy(DISC_GOLD).multiplyScalar(dim);
   else _discLive.copy(uniforms.tint.value).multiplyScalar(uniforms.gain.value*DISC_GLOW*dim*(1+DISC_PULSE_BOOST*pulseLevel(a,pos,vel)));
   _discColor.copy(DISC_DARK).lerp(_discLive,discs.live[i]);
   for(let k=0;k<SHIELD_HITS;k++){
    const t0=uniforms.hitT.value[k];if(t0<0)continue;
    const glow=hitGlow(Math.abs(a-uniforms.hitA.value[k])*TUBE_LENGTH,uniforms.shieldTime.value-t0,uniforms.motion.value);
    if(glow>0)_discColor.add(_discHit.copy(uniforms.hitCol.value[k]).multiplyScalar(glow*dim*DISC_HIT));
   }
   mesh.setColorAt(i,_discColor);
  }
  mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor!.needsUpdate=true;
 });
 return <primitive object={mesh}/>;
}
function IntegrityTube({owner,target,x,z,ratio,maximum,healing,attacking,power,idle,style}:{owner:number;target:Target;x:number;z:number;ratio:number;maximum:number;healing:ServerPulse|null;attacking:ServerPulse|null;power:number;idle:string;style:ServerStyle}) {
 const light=useRef<THREE.RectAreaLight>(null);
 const liquid=useRef<THREE.Mesh>(null);
 const spent=useRef<THREE.Mesh>(null);
 const glass=useRef<THREE.MeshPhysicalMaterial>(null);
 const haze=useRef<THREE.Mesh>(null);
 const lighting=useBoardLighting();
 const index=serverIndex(owner,target), seed=index*17.31;
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const idleTint=useMemo(()=>new THREE.Color(idle),[idle]);
 // Mount-time seed only: rebuilding `uniforms` would replace the shader materials, so a theme change is
 // instead carried by the per-frame tint lerp below.
 const uniforms=useMemo(()=>({fill:{value:ratio},time:{value:0},pulses:{value:new THREE.Vector4(PULSE_OFF,PULSE_OFF,PULSE_OFF,PULSE_OFF)},pulseDir:{value:new THREE.Vector4(1,1,1,1)},tint:{value:idleTint.clone()},gain:{value:TARGET_L[0]/lum(idleTint)},power:{value:power},health:{value:ratio},flicker:{value:0},heat:{value:0},cap:{value:HUE_CAP[0]},
  shieldTime:{value:0},motion:{value:reduced?0:1},hexes:{value:style==='shield'?1:0},hitA:{value:Array(SHIELD_HITS).fill(0) as number[]},hitT:{value:Array(SHIELD_HITS).fill(-1) as number[]},hitCol:{value:Array.from({length:SHIELD_HITS},()=>new THREE.Color())}}),[]);
 const hits=useRef(0);
 const initial=useRef(ratio).current;
 // R3F copies each entry of a `uniforms` prop, freezing number uniforms; constructor args keep one live object.
 const shared=useMemo(()=>[{uniforms}] as [THREE.ShaderMaterialParameters],[uniforms]);
 const ev=useRef({propId:null as number|null,storeId:null as number|null,kind:0,start:-1e9,h:ratio,flicker:0,targetL:TARGET_L[0],bright:STATE_BRIGHTNESS[0],cap:HUE_CAP[0],slot:-1});
 const beams=useRef({pos:Array(PULSE_SLOTS).fill(PULSE_OFF) as number[],vel:Array(PULSE_SLOTS).fill(0) as number[],shot:ownerBeams[owner].shot});
 const sparks=useMemo(()=>{
  const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({vertexShader:sparkVertex,fragmentShader:sparkFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),SPARKS);
  mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(SPARKS*3),3);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;
  const pool:SparkPool={p:new Float32Array(SPARKS*3),v:new Float32Array(SPARKS*3),age:new Float32Array(SPARKS).fill(1),life:new Float32Array(SPARKS),str:new Float32Array(SPARKS),next:0};
  return {mesh,pool};
 },[]);
 useEffect(()=>()=>{sparks.mesh.geometry.dispose();(sparks.mesh.material as THREE.Material).dispose();sparks.mesh.dispose();},[sparks]);
 const pulse=attacking??healing;
 const targetRatio=THREE.MathUtils.clamp((pulse?.after??ratio*maximum)/maximum,0,1);
 useEffect(()=>{
  if(!pulse||pulse.before===undefined)return;
  uniforms.fill.value=THREE.MathUtils.clamp(pulse.before/maximum,0,1);
 },[maximum,pulse?.id,pulse?.before,uniforms]);
 useFrame((state,delta)=>{
  const dt=Math.min(delta,.05), now=lightingNow(), e=ev.current, store=lighting.current, {mesh,pool}=sparks;
  let fresh=false;
  if(pulse&&pulse.id!==undefined&&pulse.id!==e.propId){e.propId=pulse.id;if(pulse.id!==e.storeId){e.kind=attacking?1:2;e.start=now;fresh=true;}}
  const lp=store.pulse;
  if(lp&&lp.owner===owner&&lp.target===target&&lp.id!==e.storeId&&now-lp.startedAt<pulseDuration(lp.kind)){e.storeId=lp.id;if(lp.id!==e.propId){e.kind=lp.kind==='drain'?1:2;e.start=lp.startedAt;fresh=true;}}
  const env=e.kind?pulseEnvelope(e.start,now,pulseDuration(e.kind===2?'restore':'drain')):0;
  const kind=attacking?1:healing?2:env>0?e.kind:0;
  const hRaw=THREE.MathUtils.clamp(store.centerHealth[owner]?.[target]??ratio,0,1);
  e.h=THREE.MathUtils.damp(e.h,hRaw,5,dt);const h=e.h;
  uniforms.shieldTime.value+=dt;
  if(fresh){
   // A drain lands where the end point was; a heal lands at the new end point.
   const k=hits.current++%SHIELD_HITS, drain=e.kind===1;
   const at=drain?(pulse?.before!==undefined?pulse.before/maximum:uniforms.fill.value):(pulse?.after!==undefined?pulse.after/maximum:hRaw);
   uniforms.hitA.value[k]=THREE.MathUtils.clamp(at,0,1);uniforms.hitT.value[k]=uniforms.shieldTime.value;uniforms.hitCol.value[k].copy(drain?HIT_DRAIN:HIT_RESTORE);
  }
  uniforms.fill.value=THREE.MathUtils.damp(uniforms.fill.value,pulse?targetRatio:hRaw,attacking?9:healing?6:5,dt);
  uniforms.power.value=THREE.MathUtils.damp(uniforms.power.value,power,8,dt);
  const lit=THREE.MathUtils.clamp(uniforms.power.value,0,1), level=THREE.MathUtils.clamp(uniforms.fill.value,0,1), meniscus=-1.48+level*2.96;
  if(liquid.current){
   liquid.current.scale.y=Math.max(level,.0001);
   liquid.current.position.y=-1.48+level*1.48;
   liquid.current.visible=level>.001&&lit>.02;
  }
  if(spent.current){
   spent.current.scale.y=Math.max(1-level,.0001);
   spent.current.position.y=level*1.48;
   spent.current.visible=level<.999;
  }
  // Damage flicker: 5 Hz slots (<= 2.5 Hz on/off), shader dims by at most 75%, light by 70%.
  let fl=0;
  if(reduced)fl=h<.03?.8:0;
  else{
   const slot=Math.floor(now*5), r=hash1(slot+seed);
   if(h<.03){fl=r<.14?.3:1;if(slot!==e.slot&&r<.14&&lit>.5)spawnSparks(pool,3,meniscus,.35,.6);}
   else if(h<.3){const s=Math.sin(now*1.7);fl=Math.max(r<(.3-h)*2.2?1:0,(.3-h)/.3*.45*s*s);}
   e.slot=slot;
  }
  e.flicker=THREE.MathUtils.damp(e.flicker,fl,28,dt);uniforms.flicker.value=e.flicker;
  if(!reduced){
   uniforms.time.value+=dt;
   const b=beams.current, P=uniforms.pulses.value, D=uniforms.pulseDir.value;
   const schedule=advanceOwnerBeams(owner,state.clock.elapsedTime);
   if(schedule.shot!==b.shot){
    b.shot=schedule.shot;
    const free=b.pos.findIndex(p=>p===PULSE_OFF);
    if(free>=0&&level>.02){b.pos[free]=-.06;b.vel[free]=schedule.speed*(.6+.4*h);}
   }
   for(let i=0;i<PULSE_SLOTS;i++){
    if(b.pos[i]===PULSE_OFF)continue;
    b.pos[i]+=b.vel[i]*dt;
    if(b.pos[i]>level+.1||b.pos[i]<-.1)b.pos[i]=PULSE_OFF;
   }
   P.set(b.pos[0],b.pos[1],b.pos[2],b.pos[3]);
   D.set(Math.sign(b.vel[0])||1,Math.sign(b.vel[1])||1,Math.sign(b.vel[2])||1,Math.sign(b.vel[3])||1);
  }
  const tint=uniforms.tint.value.lerp(kind===1?attackColor:kind===2?healColor:idleTint,Math.min(1,dt*12));
  e.targetL=THREE.MathUtils.damp(e.targetL,TARGET_L[kind],6,dt);
  e.bright=THREE.MathUtils.damp(e.bright,STATE_BRIGHTNESS[kind],6,dt);
  uniforms.gain.value=(e.targetL+.2*env)*e.bright/Math.max(.05,lum(tint));
  e.cap=HUE_CAP[kind]<e.cap?HUE_CAP[kind]:THREE.MathUtils.damp(e.cap,HUE_CAP[kind],4,dt);uniforms.cap.value=e.cap;
  uniforms.health.value=h;
  uniforms.heat.value=Math.min(1,.06+(kind===1?env:env*.35)+(1-h)*.4);
  if(haze.current)haze.current.visible=uniforms.heat.value*lit>.02;
  if(glass.current){glass.current.opacity=.2*Math.max(lit,.08)*(.45+.55*h);glass.current.emissiveIntensity=.38*SERVER_DIM*lit*(.3+.7*h)*(1-.75*e.flicker);}
  const wobble=kind===1&&!reduced?.3*env*(.5+.5*Math.sin(now*12)):0;
  const strength=(.15+.85*h)*(1-.7*e.flicker)*(1+.6*env)*(1-wobble)*lit*e.bright;
  if(light.current){light.current.intensity=LIGHT_BASE*strength;light.current.color.copy(tint);}
  const g=glow[index];g.color.copy(tint);g.strength=strength;g.health=h;g.flicker=e.flicker;g.kind=kind===1?'drain':kind===2?'restore':'idle';g.pulse=env;
  if(!reduced&&lit>.1){
   if(fresh&&e.kind===1)spawnSparks(pool,30,meniscus,1,1);
   else if(kind===1&&env>.3&&Math.random()<dt*24)spawnSparks(pool,1,meniscus,.7,.7);
  }
  state.camera.getWorldDirection(_c).negate();
  const {p,v,age,life,str}=pool;let n=0;
  for(let i=0;i<SPARKS;i++){
   if(age[i]>=life[i])continue;
   const i3=i*3;age[i]+=dt;
   if(age[i]>=life[i]||p[i3+1]<-.15){age[i]=life[i];continue;}
   v[i3+1]-=6*dt;v[i3]*=1-dt*.8;v[i3+2]*=1-dt*.8;
   p[i3]+=v[i3]*dt;p[i3+1]+=v[i3+1]*dt;p[i3+2]+=v[i3+2]*dt;
   const t=age[i]/life[i];
   _v.set(v[i3],v[i3+1],v[i3+2]);_v.addScaledVector(_c,-_v.dot(_c));const speed=_v.length();
   if(speed<1e-4)_v.set(1,0,0);else _v.multiplyScalar(1/speed);
   _s.crossVectors(_c,_v).multiplyScalar(.024*(1-t*.5));_v.multiplyScalar(.05+speed*.045);
   _m.makeBasis(_v,_s,_c).setPosition(p[i3],p[i3+1],p[i3+2]);mesh.setMatrixAt(n,_m);
   _col.copy(sparkHot).lerp(attackColor,Math.min(1,t*1.6));_col.multiplyScalar(str[i]*3.2*(1-.6*t)*lit/Math.max(.05,lum(_col)));_col.multiplyScalar(Math.min(1,4/Math.max(_col.r,_col.g,_col.b,1e-4)));mesh.setColorAt(n,_col);
   n++;
  }
  mesh.count=n;mesh.visible=n>0;
  if(n){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor!.needsUpdate=true;}
 });
 const classic=style==='classic';
 uniforms.hexes.value=style==='shield'?1:0;
 // Tube-local +x runs from the board-centre end outward, so backups (left of centre) are mirrored.
 return <group position={[x,.43,z]} scale={[target==='backup'?-1:1,1,1]}>
  <rectAreaLight ref={light} position={[0,.2,0]} rotation={[-Math.PI/2,0,0]} color={idle} intensity={0} width={3.6} height={.9}/>
  <mesh position={[0,-.11,0]} receiveShadow><boxGeometry args={[3.16,.10,.48]}/><meshStandardMaterial color='#101a28' metalness={.9} roughness={.27}/></mesh>
  <group rotation={[0,0,-Math.PI/2]}>
   <mesh><cylinderGeometry args={[.21,.21,3.04,32,1,true]}/><meshPhysicalMaterial ref={glass} color={GLASS_COLOR} transparent opacity={.2} metalness={.04} roughness={.04} clearcoat={1} clearcoatRoughness={.05} transmission={0} side={THREE.DoubleSide} depthWrite={false} emissive={GLASS_EMISSIVE} emissiveIntensity={.38}/></mesh>
   {classic?<><mesh renderOrder={1.5}><cylinderGeometry args={[.224,.224,3.08,32,1,true]}/><shaderMaterial args={shared} vertexShader={tubeVertex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} fragmentShader={`varying vec2 vUv;varying float vFace;uniform float fill,time,gain,power,flicker,cap;uniform vec3 tint;${glslCap}${glslPulses}
    void main(){float a=(vUv.y*3.08-.06)/2.96;float rim=pow(1.-vFace,2.);
    float liquid=1.-smoothstep(fill-.006,fill+.006,a);float alive=step(.001,fill)*step(.02,power);
    float bands=pulseAt(a)*.8;
    float scan=mix(1.,.82+.18*(.5+.5*sin(a*220.-time*9.)),.6);
    float menisc=exp(-pow((a-fill)*70.,2.))*alive;
    float core=(.05+bands*.12)*scan*liquid*alive,edge=rim*.5*scan*liquid*alive;
    float spent=(.006+rim*.045)*(1.-liquid);
    float dim=power*(1.-flicker*.75);vec3 k=tint*gain*dim;
    gl_FragColor=vec4(cap3(k*core,cap*.15)+cap3(k*edge,cap*2.)+cap3(k*menisc*1.1,cap*.25)+vec3(.5)*spent*dim,1.);}`}/></mesh>
   <mesh ref={liquid} position={[0,-1.48+initial*1.48,0]} scale={[1,Math.max(initial,.0001),1]}><cylinderGeometry args={[.164,.164,2.96,24,1]}/><shaderMaterial args={shared} vertexShader={tubeVertex} transparent depthWrite={false} toneMapped={false} fragmentShader={`varying vec2 vUv;varying float vFace;uniform float fill,time,gain,power,flicker,cap;uniform vec3 tint;${glslCap}${glslPulses}
    void main(){float a=vUv.y*fill;
    float bands=.05+pulseAt(a)*.425;
    float scan=mix(1.,.82+.18*(.5+.5*sin(a*220.-time*9.)),.6);
    float spine=pow(vFace,6.)*.25;
    float menisc=smoothstep(fill-.045,fill,a)*1.3;
    float filament=pow(.5+.5*sin(vUv.x*31.4+sin(a*12.-time)*.7),14.)*.3;
    vec3 k=tint*gain*power*(1.-flicker*.75);
    gl_FragColor=vec4(cap3(k*(.3+bands+spine+filament)*scan,cap)+cap3(k*menisc*scan,cap*.3),.98*power);}`}/></mesh>
   <mesh ref={spent} renderOrder={1} position={[0,initial*1.48,0]} scale={[1,Math.max(1-initial,.0001),1]}><cylinderGeometry args={[.2,.2,2.96,24,1]}/><meshBasicMaterial color='#2a2d31' transparent opacity={.96} depthWrite={false} toneMapped={false} fog={false}/></mesh></>:<>
    {style==='pulse'&&<PulseOrigami uniforms={uniforms} beams={beams} reduced={reduced}/>}
    <mesh renderOrder={1.5}><cylinderGeometry args={[SHIELD_RADIUS,SHIELD_RADIUS,TUBE_LENGTH,48,1,true]}/><shaderMaterial args={shared} vertexShader={shieldVertex} fragmentShader={SHIELD_FRAGMENT} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide}/></mesh>
   </>}
   {[-1,1].map(side=><group key={side} position={[0,side*1.54,0]}>
    <mesh castShadow><cylinderGeometry args={[.255,.255,.13,8]}/><meshStandardMaterial color='#52647a' metalness={.9} roughness={.22}/></mesh>
    <mesh position={[0,-side*.075,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.203,.018,6,24]}/><meshStandardMaterial color='#70929f' metalness={.85} roughness={.24}/></mesh>
   </group>)}
  </group>
  {classic&&<>{/* LED rack floats inside the glass, facing the camera; premultiplied blend darkens cell gaps and adds lit cells over the liquid. */}
  <mesh position={[0,-Math.sin(CAM_TILT)*.1,Math.cos(CAM_TILT)*.1]} rotation={[CAM_TILT,0,0]} renderOrder={2}><planeGeometry args={[2.96,.24]}/><shaderMaterial args={shared} vertexShader={vertex} transparent depthWrite={false} blending={THREE.CustomBlending} blendSrc={THREE.OneFactor} blendDst={THREE.OneMinusSrcAlphaFactor} toneMapped={false} fragmentShader={`varying vec2 vUv;uniform float time,fill,health,gain,power,flicker,cap;uniform vec3 tint;${glslHash}${glslCap}
   void main(){vec2 g=vec2(32.,2.),cell=floor(vUv*g),f=fract(vUv*g);
   float led=smoothstep(.36,.26,abs(f.x-.5))*smoothstep(.36,.26,abs(f.y-.5));
   float lit=step(cell.x+.5,fill*g.x);
   float blink=step(.18,hash(cell+floor(time*(4.+cell.y*3.)+hash(cell.yx)*9.)));
   float dim=power*(1.-flicker*.75);
   vec3 on=mix(vec3(1.,.08,.2)*1.35,cap3(tint*gain*.7,cap*.8),step(.25,health));
   vec3 c=led*(lit*blink*on+(1.-lit)*vec3(.035))*dim;
   gl_FragColor=vec4(c,(1.-led)*.45*lit*dim);}`}/></mesh></>}
  <mesh ref={haze} position={[0,.18,-.24]} rotation={[CAM_TILT,0,0]} visible={false}><planeGeometry args={[3.3,.6]}/><shaderMaterial args={shared} vertexShader={vertex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fragmentShader={`varying vec2 vUv;uniform float time,heat,gain,power,cap;uniform vec3 tint;${glslHash}${glslCap}
   float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
   void main(){vec2 p=vec2(vUv.x*11.,vUv.y*2.4-time*.8);p+=(vec2(vn(p*1.7+time*.35),vn(p*1.3-time*.25))-.5)*1.6;
   float n=vn(p)*.65+vn(p*2.3+4.)*.35;
   float m=smoothstep(0.,.3,vUv.y)*(1.-smoothstep(.45,1.,vUv.y))*smoothstep(0.,.1,vUv.x)*smoothstep(1.,.9,vUv.x);
   gl_FragColor=vec4(cap3(tint*gain*.24*smoothstep(.35,.85,n)*m*heat*power,cap*.35),1.);}`}/></mesh>
  <primitive object={sparks.mesh}/>
  <mesh position={[0,-.13,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[4.08,1.83]}/><shaderMaterial args={shared} vertexShader={vertex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fragmentShader={`varying vec2 vUv;uniform float fill,power,flicker;uniform vec3 tint;void main(){float glow=pow(max(0.,1.-length((vUv-.5)*2.)),3.)*(.2+fill)*power*(1.-flicker*.75);gl_FragColor=vec4(tint,glow*${(.18*SERVER_DIM).toFixed(4)});}`}/></mesh>
 </group>;
}
export function ServerLights({servers,healing,attacking,power=1,style}:{servers:[ServerValues,ServerValues];healing:ServerPulse|null;attacking:ServerPulse|null;power?:number;style:ServerStyle}) {
 const colors=usePlayerColors();
 return <>{servers.flatMap((server,owner)=>(['backup','primary'] as const).map(target=>{
  const maximum=SERVER_MAX[target];
  const activeAttack=attacking?.owner===owner&&attacking.target===target?attacking:null;
  const activeHeal=healing?.owner===owner&&healing.target===target?healing:null;
  return <IntegrityTube key={`${owner}-${target}`} owner={owner} target={target} x={tubeX(target)} z={tubeZ(owner)} maximum={maximum} attacking={activeAttack} healing={activeHeal} ratio={server[target]/maximum} power={power} idle={colors[owner].tube} style={style}/>;
 }))}
 {(['backup','primary'] as const).map(target=><ReadoutBacking key={target} x={tubeX(target)} color={colors[1].tube} power={power}/>)}</>;
}
/**
 * The opponent's server readouts sit beyond the server housing, over the backdrop; this graphite plate (the housing's
 * material) backs them the way the housing front backs the local readouts, edged with a strip in the owner's tube colour.
 */
const BACKING_Z=-6.36, BACKING_W=3.2, BACKING_D=.72;
const BACKING_MATERIAL={color:'#202939',metalness:.8,roughness:.32};
function ReadoutBacking({x,color,power}:{x:number;color:string;power:number}){
 const strip=useMemo(()=>new THREE.Color(color).multiplyScalar(SERVER_DIM),[color]);
 return <group position={[x,0,BACKING_Z]}>
  <RoundedBox args={[BACKING_W,.1,BACKING_D]} radius={.035} smoothness={3} position={[0,.05,0]} receiveShadow><meshPhysicalMaterial {...BACKING_MATERIAL}/></RoundedBox>
  <mesh position={[0,.102,-BACKING_D/2+.03]}><boxGeometry args={[BACKING_W-.16,.012,.022]}/><meshBasicMaterial color={strip} toneMapped={false} transparent opacity={THREE.MathUtils.clamp(power,0,1)}/></mesh>
 </group>;
}
