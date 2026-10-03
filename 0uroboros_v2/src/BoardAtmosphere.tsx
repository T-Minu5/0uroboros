import { Suspense, useMemo, useEffect, useState, useCallback, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { BoardContactShadow } from './BoardContactShadow';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { boardSideHealth, DAMAGED_LIGHT, PERIMETER_DIM, sideLightScale } from './boardMaterials';
import { ENGRAVING_LANES, ENGRAVING_W, FAR_SHIFT, NODE_X, warpFarZ } from './boardLayout';
import { isBoardBackgroundVideo, NO_BOARD_BACKGROUND } from './boardBackgrounds';
import { FLOOR_BASE_D, FLOOR_BASE_W, configureFloorMap, useFloorScale } from './floorPlane';
import { RealLightingFloor } from './RealLightingFloor';
import { NeonFloorSpill } from './NeonFloorSpill';
import { DEFAULT_REAL_LIGHTING, useNeonRig, type RealLightingSettings } from './realLighting';
import { BackdropScan, backdropScanMaterialProps } from './BackdropScan';
import { BOARD_EXPOSURE, lightingNow, pulseDuration, pulseEnvelope, useBoardLighting } from './boardLighting';
import { applyLightTuning, boardTuning } from './boardTuning';
import { useBoardStyle } from './boardStyles';
import { NEON_HALO_REACH, neonGain, neonTubeGlsl, neonTubeVertex, withTubeAxis } from './neonTubeShading';

const BACKDROP_TINT = new THREE.Color().setScalar(1 / BOARD_EXPOSURE);
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

function FloorImage({ url, floorRef }: { url: string; floorRef: RefObject<THREE.Mesh | null> }) {
  const texture = useTexture(url);
  useEffect(() => {
    configureFloorMap(texture);
  }, [texture]);
  useFloorScale(floorRef);
  return (
    <mesh ref={floorRef} key={url} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0.35]} userData={{ skipScanDepth: true, scanBackground: true }}>
      <planeGeometry args={[FLOOR_BASE_W, FLOOR_BASE_D]} />
      <meshBasicMaterial map={texture} color={BACKDROP_TINT} toneMapped={false} fog={false} depthWrite {...backdropScanMaterialProps} />
    </mesh>
  );
}

function FloorVideo({ url, floorRef }: { url: string; floorRef: RefObject<THREE.Mesh | null> }) {
  // CanvasTexture (drawImage each frame) — VideoTexture often stays black in Chromium/WebGL
  // even when the HTMLVideoElement decodes and plays correctly.
  const [map, setMap] = useState<THREE.CanvasTexture | null>(null);
  const drawRef = useRef<{ video: HTMLVideoElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } | null>(null);
  useFloorScale(floorRef);

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    video.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0.01;pointer-events:none;left:0;top:0';
    document.body.appendChild(video);

    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) {
      console.error('[BoardStage] floor video: 2d canvas unavailable');
      return;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = true;

    const arm = () => {
      if (cancelled || drawRef.current) return;
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      drawRef.current = { video, ctx, texture };
      setMap(texture);
      void video.play().catch(() => undefined);
    };

    const onError = () => {
      console.error('[BoardStage] floor video failed to load', url, video.error);
    };

    video.addEventListener('loadeddata', arm);
    video.addEventListener('canplay', arm);
    video.addEventListener('error', onError);
    video.src = url;
    video.load();

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', arm);
      video.removeEventListener('canplay', arm);
      video.removeEventListener('error', onError);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      drawRef.current = null;
      texture.dispose();
      setMap(null);
    };
  }, [url]);

  useFrame(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const { video, ctx, texture } = draw;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.paused) void video.play().catch(() => undefined);
    ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
    texture.needsUpdate = true;
  });

  if (!map) {
    return (
      <mesh ref={floorRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0.35]} userData={{ skipScanDepth: true, scanBackground: true }}>
        <planeGeometry args={[FLOOR_BASE_W, FLOOR_BASE_D]} />
        <meshBasicMaterial color="#111722" toneMapped={false} depthWrite />
      </mesh>
    );
  }

  return (
    <mesh ref={floorRef} key={url} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0.35]} userData={{ skipScanDepth: true, scanBackground: true }}>
      <planeGeometry args={[FLOOR_BASE_W, FLOOR_BASE_D]} />
      <meshBasicMaterial map={map} color={BACKDROP_TINT} toneMapped={false} fog={false} depthWrite {...backdropScanMaterialProps} />
    </mesh>
  );
}

export function BoardStage({ backgroundUrl, real = false, realLighting = DEFAULT_REAL_LIGHTING }: { backgroundUrl: string; real?: boolean; realLighting?: RealLightingSettings }) {
  const floorRef = useRef<THREE.Mesh>(null);
  const video = isBoardBackgroundVideo(backgroundUrl);
  // Where the neon rig lights the scene, the floor glow is its spill and the contact shadow follows the Real lighting settings.
  const rig = useNeonRig();
  return (
    <group userData={{ skipScanDepth: true }}>
      {backgroundUrl === NO_BOARD_BACKGROUND ? null
        : real ? <Suspense fallback={null}><RealLightingFloor url={backgroundUrl} settings={realLighting} floorRef={floorRef} /></Suspense>
        : video ? <FloorVideo url={backgroundUrl} floorRef={floorRef} /> : <FloorImage url={backgroundUrl} floorRef={floorRef} />}
      <BackdropScan floorRef={floorRef} />
      <BoardContactShadow y={-0.95} size={26} far={2.8} blur={2.5} opacity={rig ? rig.contactShadow : 0.38} color="#02040a" />
      {rig ? <NeonFloorSpill glow={rig.glow} /> : <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.942, 0.1]} userData={{ skipScanDepth: true }}>
        <planeGeometry args={[25, 18]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          vertexShader={vertex}
          fragmentShader={`varying vec2 vUv;void main(){vec2 p=(vUv-.5)*vec2(25.,18.);float side=exp(-pow(abs(abs(p.x)-7.9)*1.35,2.))*exp(-pow(abs(p.y)/4.9,6.));float front=exp(-pow(abs(p.y-4.8)*.74,2.))*exp(-pow(abs(p.x)/7.5,6.));vec3 color=mix(vec3(.22,.01,.09),vec3(.01,.16,.2),smoothstep(-3.,3.,p.x));gl_FragColor=vec4(color,side*.32+front*.24);}`}
        />
      </mesh>}
    </group>
  );
}

export function FieldEngravings(){
 const map=useTexture('/assets/materials/field-engraving.png');
 map.anisotropy=8;
 return <>{NODE_X.flatMap(x=>[0,1].map(owner=><mesh key={`${x}-${owner}`} position={[x,.222,ENGRAVING_LANES[owner].z]} rotation={[-Math.PI/2,0,owner===0?0:Math.PI]}>
  <planeGeometry args={[ENGRAVING_W,ENGRAVING_LANES[owner].d]}/><meshBasicMaterial map={map} transparent opacity={.58} depthWrite={false} color='#dbc6da' toneMapped={false}/>
 </mesh>))}</>;
}

const BLOOM_IDLE={strength:.30,radius:.28,threshold:.85} as const;
const BLOOM_IDLE_NEON={strength:.24,radius:.1,threshold:.88} as const;
/** Under the neon rig the glass's escaping light and the tubes carry the glow, so bloom reaches lower and wider. */
const BLOOM_NEON_RIG={strength:.6,radius:.35,threshold:.8} as const;
const BLOOM_SCAN={strength:.7,radius:.36,threshold:.9} as const;
/** Additive bloom-strength bumps at envelope peak; award holds for as long as the award is set. */
const BLOOM_DRAIN=.25, BLOOM_RESTORE=.15, BLOOM_AWARD=.15, BLOOM_AWARD_RADIUS=.07;
/** Peak grade-wash hue shift; the tube's own red/gold glow should lead, not a screen tint. */
const GRADE_WASH_DRAIN=.5, GRADE_WASH_RESTORE=.2625;
const GRADE_DRAIN=new THREE.Color('#ff1040'), GRADE_RESTORE=new THREE.Color('#ffc040');

/** Cinematic grade in linear HDR after bloom (OutputPass applies ACES + sRGB afterwards). Masks use L/(1+L). */
export const BoardGradeShader={
 name:'BoardGrade',
 uniforms:{
  tDiffuse:{value:null as THREE.Texture|null}, uTime:{value:0}, uResolution:{value:new THREE.Vector2(1,1)},
  uVignette:{value:.24}, uSplit:{value:.08}, uAberration:{value:0}, uGrain:{value:.025},
  uHighTint:{value:new THREE.Color('#ff3fb4')},
  /** rgb + strength; near = local player (screen bottom), far = opponent (screen top). */
  uWashNear:{value:new THREE.Vector4(0,0,0,0)}, uWashFar:{value:new THREE.Vector4(0,0,0,0)},
 },
 vertexShader:vertex,
 fragmentShader:/* glsl */`
 uniform sampler2D tDiffuse;uniform vec2 uResolution;uniform float uTime,uVignette,uSplit,uAberration,uGrain;
 uniform vec3 uHighTint;uniform vec4 uWashNear,uWashFar;varying vec2 vUv;
 const vec3 W=vec3(.2126,.7152,.0722);
 float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
 void main(){
  vec2 c=vUv-.5;vec2 ca=c*vec2(uResolution.x/uResolution.y,1.);float r2=dot(ca,ca);
  vec2 off=c*r2*uAberration*6.;
  vec4 base=texture2D(tDiffuse,vUv);
  vec3 col=vec3(texture2D(tDiffuse,vUv+off).r,base.g,texture2D(tDiffuse,vUv-off).b);
  float L=dot(col,W),t=L/(1.+L);
  vec3 mag=uHighTint-dot(uHighTint,W);
  col+=mag*smoothstep(.45,.85,t)*uSplit*L;
  // Side washes shift hue toward the wash colour at the pixel's own luminance, so bright pixels tint instead of whitening.
  float near=smoothstep(.55,0.,vUv.y),far=smoothstep(.45,1.,vUv.y);
  float Lw=dot(col,W);
  col=mix(col,Lw*uWashNear.rgb/max(dot(uWashNear.rgb,W),1e-3),clamp(uWashNear.a*near*near*.7,0.,1.));
  col=mix(col,Lw*uWashFar.rgb/max(dot(uWashFar.rgb,W),1e-3),clamp(uWashFar.a*far*far*.7,0.,1.));
  col*=1.-uVignette*smoothstep(.12,.62,r2);
  float n=hash(vUv*uResolution+fract(uTime*7.13)*vec2(97.,57.))-.5;
  col=max(col*(1.+n*uGrain)+n*uGrain*.004,0.);
  gl_FragColor=vec4(col,base.a);
 }`,
};

/** Linear HDR bloom is thresholded before the single output tone-map step.
 *  Optional Neon Horizon scan pass sits between render and bloom so depth contours bloom.
 *  The end-of-session singularity sits *after* bloom instead: bloom's wide radius would
 *  otherwise smear the accretion disk back across the event horizon and grey it out, so the
 *  disk carries its own halo. Pass order: render → [scan] → bloom → [singularity] → grade → output. */
export function BoardFinish({scanPass,scanning,singularityPass}:{scanPass?:ShaderPass|null;scanning?:boolean;singularityPass?:ShaderPass|null}={}){
 const {gl,scene,camera,size}=useThree();
 const boardStyle=useBoardStyle();
 const rig=useNeonRig();
 const rigRef=useRef(rig);rigRef.current=rig;
 const lighting=useBoardLighting();
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const scanningRef=useRef(!!scanning);scanningRef.current=!!scanning;
 const award=useRef({level:0});
 const pipeline=useMemo(()=>{
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  const composer=new EffectComposer(gl,target);
  const render=new RenderPass(scene,camera);
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),BLOOM_IDLE.strength,BLOOM_IDLE.radius,BLOOM_IDLE.threshold);
  const grade=new ShaderPass(BoardGradeShader);
  const output=new OutputPass();
  composer.addPass(render);composer.addPass(bloom);composer.addPass(grade);composer.addPass(output);
  return {composer,render,bloom,grade,output};
 },[gl,scene,camera]);
 useEffect(()=>{
  const pr=Math.min(gl.getPixelRatio(),1.5);
  pipeline.composer.setPixelRatio(pr);pipeline.composer.setSize(size.width,size.height);
  pipeline.grade.uniforms.uResolution.value.set(size.width*pr,size.height*pr);
 },[gl,pipeline,size]);
 useEffect(()=>{
  const {composer,render,bloom,grade,output}=pipeline;
  composer.passes.length=0;
  composer.addPass(render);
  if(scanPass)composer.addPass(scanPass);
  composer.addPass(bloom);
  if(singularityPass)composer.addPass(singularityPass);
  composer.addPass(grade);
  composer.addPass(output);
 },[pipeline,scanPass,singularityPass]);
 useEffect(()=>{
  if(reduced)pipeline.grade.uniforms.uGrain.value=0;
  if(!(import.meta as ImportMeta&{env?:{DEV?:boolean}}).env?.DEV)return;
  const w=window as unknown as {__boardFinish?:unknown};
  w.__boardFinish={bloom:pipeline.bloom,grade:pipeline.grade,composer:pipeline.composer};
  return()=>{delete w.__boardFinish;};
 },[pipeline,reduced]);
 useEffect(()=>()=>{pipeline.render.dispose();pipeline.bloom.dispose();pipeline.grade.dispose();pipeline.output.dispose();pipeline.composer.dispose();},[pipeline]);
 useFrame((_,delta)=>{
  const {bloom,grade}=pipeline, s=lighting.current, now=lightingNow(), dt=Math.min(delta,.05);
  const pulse=s.pulse;
  const env=pulse?pulseEnvelope(pulse.startedAt,now,pulseDuration(pulse.kind)):0;
  const drain=pulse?.kind==='drain'?env:0, restore=pulse?.kind==='restore'?env:0;
  const a=award.current;
  a.level=reduced?(s.award?1:0):THREE.MathUtils.damp(a.level,s.award?1:0,s.award?9:3,dt);
  const awardFlash=s.award&&!reduced?pulseEnvelope(s.award.startedAt,now,1.8)*.5:0;
  const tints=bloom.bloomTintColors;
  if(scanningRef.current){
   bloom.strength=BLOOM_SCAN.strength;bloom.radius=BLOOM_SCAN.radius;bloom.threshold=BLOOM_SCAN.threshold;
   for(let i=0;i<tints.length;i++)tints[i].set(1,1,1);
  }else{
   const rigBloom=rigRef.current?.bloom;
   const idleBloom=rigBloom!==undefined?BLOOM_NEON_RIG:boardStyle==='neon'?BLOOM_IDLE_NEON:BLOOM_IDLE;
   const awardEnv=a.level+awardFlash;
   bloom.strength=idleBloom.strength*(rigBloom??1)+BLOOM_DRAIN*drain+BLOOM_RESTORE*restore+BLOOM_AWARD*awardEnv;
   bloom.radius=idleBloom.radius+BLOOM_AWARD_RADIUS*Math.min(1,awardEnv);
   bloom.threshold=idleBloom.threshold;
   // Tint only the two widest mips so the outer halo shifts colour without touching materials; resolves to white at env 0.
   if(drain>0)for(let i=3;i<5;i++)tints[i].set(1,.35+.65*(1-drain),.45+.55*(1-drain));
   else for(let i=3;i<5;i++)tints[i].set(1,1-.15*restore,1-.45*restore);
  }
  const u=grade.uniforms;
  if(!reduced)u.uTime.value=(u.uTime.value+dt)%1000;
  const washRgb=drain>0?GRADE_DRAIN:GRADE_RESTORE, washA=drain>0?drain*GRADE_WASH_DRAIN:restore*GRADE_WASH_RESTORE;
  const nearA=pulse&&pulse.owner===0?washA:0, farA=pulse&&pulse.owner!==0?washA:0;
  u.uWashNear.value.set(washRgb.r,washRgb.g,washRgb.b,nearA);
  u.uWashFar.value.set(washRgb.r,washRgb.g,washRgb.b,farA);
  bloom.strength*=boardTuning.bloom;
  applyLightTuning(scene);
  pipeline.composer.render(delta);
 },1);
 return null;
}

export function useBoardScanPass(){
 const [scanPass,setScanPass]=useState<ShaderPass|null>(null);
 const onPass=useCallback((pass:ShaderPass|null)=>setScanPass(pass),[]);
 return {scanPass,onPass};
}

const RAIL_MAGENTA='#ff0ba1', RAIL_CYAN='#27e2ff';
/** Rail spill split per player half so each half dims/cools with that player's server health. */
const RAIL_LIGHTS=[
 {half:1,z:warpFarZ(-1.9),color:new THREE.Color(RAIL_MAGENTA),intensity:3.4*PERIMETER_DIM,distance:3.15},
 {half:0,z:2.3,color:new THREE.Color(RAIL_MAGENTA).lerp(new THREE.Color(RAIL_CYAN),.35),intensity:3.2*PERIMETER_DIM,distance:3.15},
] as const;

/** Rail centre: the near ends stay put and the far ends follow the grown opponent half. */
const RAIL_Z=.12-FAR_SHIFT/2;
/** Four neon tubes a pulse can ride: magenta inner and cyan outer, on each side. */
const RAIL_TUBES=([-1,1] as const).flatMap(side=>[
 {x:side*7.92-side*.12,y:.34,z:RAIL_Z,length:8.35+FAR_SHIFT,thick:.038,color:RAIL_MAGENTA},
 {x:side*7.92+side*.155,y:.3,z:RAIL_Z,length:8.15+FAR_SHIFT,thick:.022,color:RAIL_CYAN},
]);
const PULSE_GAP_S=[8,37] as const, PULSE_TAIL=1.5;
const pulseVertex=`varying float vK;uniform float dir;void main(){vK=dir>0.?position.z/${PULSE_TAIL.toFixed(2)}+.5:.5-position.z/${PULSE_TAIL.toFixed(2)};gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const pulseFragment=`varying float vK;uniform vec3 color;uniform float level;void main(){float head=smoothstep(.7,.95,vK)*(1.-smoothstep(.97,1.,vK));float tail=pow(clamp(vK,0.,1.),3.);gl_FragColor=vec4((color*tail*3.+mix(color,vec3(1.),.6)*head*8.)*level,1.);}`;

/** Occasional bright energy packet racing along one rail tube, at random 8–37 s intervals. */
function RailPulse(){
 const mesh=useRef<THREE.Mesh>(null), light=useRef<THREE.PointLight>(null);
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const uniforms=useMemo(()=>({color:{value:new THREE.Color()},dir:{value:1},level:{value:0}}),[]);
 const args=useMemo(()=>[{uniforms,vertexShader:pulseVertex,fragmentShader:pulseFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}] as [THREE.ShaderMaterialParameters],[uniforms]);
 const run=useRef({next:-1,start:0,duration:0,tube:0,dir:1});
 const gap=()=>PULSE_GAP_S[0]+Math.random()*(PULSE_GAP_S[1]-PULSE_GAP_S[0]);
 const fire=useCallback((now:number)=>{
  const r=run.current;
  r.tube=Math.floor(Math.random()*RAIL_TUBES.length);r.dir=Math.random()<.5?-1:1;
  r.start=now;r.duration=1.6+Math.random()*1.2;r.next=now+r.duration+gap();
  const tube=RAIL_TUBES[r.tube];
  uniforms.color.value.set(tube.color);uniforms.dir.value=r.dir;
  light.current?.color.set(tube.color);
  const girth=Math.max(tube.thick*2.6,.075);
  if(mesh.current)mesh.current.scale.set(girth,girth,1);
 },[uniforms]);
 useEffect(()=>{
  if(!(import.meta as ImportMeta&{env?:{DEV?:boolean}}).env?.DEV)return;
  const w=window as unknown as {__railPulse?:()=>void};
  w.__railPulse=()=>{run.current.next=0;};
  return()=>{delete w.__railPulse;};
 },[]);
 useFrame(({clock})=>{
  const now=clock.elapsedTime, r=run.current;
  if(r.next<0)r.next=now+gap();
  if(!reduced&&now>=r.next)fire(now);
  const t=(now-r.start)/Math.max(r.duration,1e-3), live=!reduced&&r.duration>0&&t>=0&&t<1;
  if(mesh.current)mesh.current.visible=live;
  if(!live){if(light.current)light.current.intensity=0;return;}
  const tube=RAIL_TUBES[r.tube], ease=t*t*(3-2*t);
  const span=tube.length-PULSE_TAIL*.5, z=tube.z+r.dir*(ease-.5)*span;
  const level=Math.min(1,t/.08,(1-t)/.12);
  uniforms.level.value=level*PERIMETER_DIM;
  mesh.current?.position.set(tube.x,tube.y,z);
  if(light.current){light.current.position.set(tube.x,tube.y+.35,z);light.current.intensity=3.6*PERIMETER_DIM*level;}
 });
 return <>
  <mesh ref={mesh} visible={false} renderOrder={3}><boxGeometry args={[1,1,PULSE_TAIL]}/><shaderMaterial args={args}/></mesh>
  <pointLight ref={light} intensity={0} distance={1.8} decay={2}/>
 </>;
}

const railTubeFragment=`varying vec2 vUv;varying vec3 vViewNormal,vViewTangent;uniform vec3 uColor;uniform float uLevel,uLength,uTime,uHalo;${neonTubeGlsl}
void main(){float along=vUv.y*uLength,q=neonTubeQ(vViewNormal,vViewTangent),flick=neonFlicker(along,uTime);
vec3 rgb=uHalo>.5?neonHalo(uColor,q*${NEON_HALO_REACH.toFixed(2)},${NEON_HALO_REACH.toFixed(2)},.3*uLevel*flick):neonTube(uColor,q,uLevel*flick);
gl_FragColor=vec4(rgb,1.);}`;

const Y_AXIS=new THREE.Vector3(0,1,0);
/** One rail neon tube running along z: pale core saturating to its edges, uneven brightness and a thin glow sheath. */
function RailNeonTube({position,radius,length,color}:{position:[number,number,number];radius:number;length:number;color:string}){
 const reduced=useMemo(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,[]);
 const materials=useMemo(()=>[0,1].map(halo=>new THREE.ShaderMaterial({
  uniforms:{uColor:{value:new THREE.Color(color)},uLevel:{value:.95*PERIMETER_DIM},uLength:{value:length},uTime:{value:0},uHalo:{value:halo},uNeonGain:neonGain},
  vertexShader:neonTubeVertex,fragmentShader:railTubeFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
 })),[color,length]);
 const geometries=useMemo(()=>[NEON_HALO_REACH,1].map(scale=>withTubeAxis(new THREE.CylinderGeometry(radius*scale,radius*scale,length,scale>1?20:16,1,true),()=>Y_AXIS)),[radius,length]);
 useEffect(()=>()=>materials.forEach(m=>m.dispose()),[materials]);
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
 useFrame(({clock})=>{for(const m of materials)m.uniforms.uTime.value=reduced?0:clock.elapsedTime;});
 return <group position={position} rotation={[Math.PI/2,0,0]}>
  <mesh geometry={geometries[0]} material={materials[1]} renderOrder={2}/>
  <mesh geometry={geometries[1]} material={materials[0]} renderOrder={2}/>
 </group>;
}

/** Sleek L/R chassis rails — magenta inner neon + cyan outer edge, no industrial ridges. */
export function BoardSideEdges(){
 const lights=useRef<(THREE.PointLight|null)[]>([]);
 useFrame(()=>{
  for(let i=0;i<lights.current.length;i++){
   const l=lights.current[i];if(!l)continue;
   const cfg=RAIL_LIGHTS[i%2], h=cfg.half===0?boardSideHealth.x:boardSideHealth.y;
   l.intensity=cfg.intensity*sideLightScale(h);
   l.color.copy(cfg.color).lerp(DAMAGED_LIGHT,(1-h)*.65);
  }
 });
 return <group>
  {([-1,1] as const).map((side,s)=>{
   const x=side*7.92;
   return <group key={side}>
    <mesh position={[x,.14,RAIL_Z]} castShadow receiveShadow>
     <boxGeometry args={[.18,.42,8.85+FAR_SHIFT]}/>
     <meshStandardMaterial color='#121820' metalness={.92} roughness={.26}/>
    </mesh>
    <mesh position={[x+side*.11,.26,RAIL_Z]}>
     <boxGeometry args={[.05,.14,8.55+FAR_SHIFT]}/>
     <meshStandardMaterial color='#1a2230' metalness={.96} roughness={.18}/>
    </mesh>
    <RailNeonTube position={[x-side*.12,.34,RAIL_Z]} radius={.018} length={8.35+FAR_SHIFT} color={RAIL_MAGENTA}/>
    <RailNeonTube position={[x+side*.155,.3,RAIL_Z]} radius={.011} length={8.15+FAR_SHIFT} color={RAIL_CYAN}/>
    <mesh position={[x-side*.02,.36,RAIL_Z]} rotation={[-Math.PI/2,0,0]}>
     <planeGeometry args={[.25,8.5+FAR_SHIFT]}/>
     <meshBasicMaterial color={RAIL_MAGENTA} transparent opacity={.12*PERIMETER_DIM} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending}/>
    </mesh>
    {RAIL_LIGHTS.map((cfg,i)=><pointLight key={i} ref={l=>{lights.current[s*2+i]=l;}} position={[x-side*.7,1.6,cfg.z]} color={cfg.color} intensity={cfg.intensity} distance={cfg.distance}/>)}
   </group>;
  })}
  <RailPulse/>
 </group>;
}

/** Fine angular rails — kept available; not mounted (outer red lines removed from board). */
export function CircuitArchitecture(){
 const geometry=useMemo(()=>{
  const points:number[]=[];
  const segment=(a:number[],b:number[])=>points.push(...a,...b);
  const path=(vertices:number[][],closed=false)=>{vertices.slice(1).forEach((v,i)=>segment(vertices[i],v));if(closed)segment(vertices.at(-1)!,vertices[0]);};
  [-1,1].forEach(side=>{
   const far=side<0?-5.55:5.98;
   path([[-7.72,.32,side*3.8],[-7.72,.32,far-side*.7],[-7.05,.32,far],[7.05,.32,far],[7.72,.32,far-side*.7],[7.72,.32,side*3.8]]);
  });
  [-4.2,-1.4,1.4,4.2].forEach(x=>{[-1,1].forEach(side=>{const end=side<0?-3.9:4.6;path([[x-.10,.28,side*1.45],[x-.10,.28,end-side*.22],[x,.28,end],[x+.10,.28,end-side*.22],[x+.10,.28,side*1.45]]);});});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));return g;
 },[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <lineSegments geometry={geometry}><lineBasicMaterial color='#fc3c9d' transparent opacity={.72} toneMapped={false}/></lineSegments>;
}

