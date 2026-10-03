import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { NEON_BEVEL, NEON_LANE_CHAMFER, NEON_LANE_DEPTH, NEON_LANE_MAX_POINTS, neonLaneDimensions, neonLanePolygon, neonLaneShape } from './neonGeometry';
import { boardSideHealth, neonIntensity, WINNER_FILL } from './boardMaterials';
import { usePlayerColors } from './playerTheme';
import { lightingNow, pulseDuration, pulseEnvelope, useBoardLighting } from './boardLighting';
import type { LanePattern } from './lanePatterns';
import { NeonGlassMaterial } from './neonMaterials';
import { SINK_OPACITY, laneSinkOverlay } from './laneSeal';

const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const PATTERN_URL = '/assets/patterns/hex-maze-sdf.png';
const HOVER = new THREE.Color('#e6fffb'), CHOICE = new THREE.Color('#ffcc12');
const DRAIN = new THREE.Color('#fa0048').multiplyScalar(neonIntensity('#fa0048', .75));
const RESTORE = CHOICE.clone().multiplyScalar(neonIntensity(CHOICE, .75));
/** Lane glass keeps a fifth of the etched frost noise, so the beds read clean under cards. */
const LANE_GRAIN = .2;

// Widths are half-widths in world units; at the play camera one unit is about 64 px across, 52 px deep.
const fragment = `
varying vec2 vUv;
uniform vec2 uHalf,uOrigin;
uniform vec3 uTint,uSignal,uFillColor;
uniform sampler2D tPattern;
uniform vec2 uPoly[${NEON_LANE_MAX_POINTS}];
uniform int uCount;
uniform float uRimCore,uPower,uActive,uTime,uOpen,uPattern,uClosed,uSide,uFill;

// Screen footprint of one pixel in lane units, set once in main: fwidth inside the loops below
// returns garbage on the plane's triangle seam and paints a dotted diagonal.
float gAA;
float line(float d,float w){float aa=max(gAA,.0012);return 1.-smoothstep(w-aa,w+aa,abs(d));}
float fill(float d){float aa=max(gAA,.0012);return 1.-smoothstep(-aa,aa,d);}
float box(vec2 p,vec2 c,vec2 h){vec2 q=abs(p-c)-h;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}

float polyDist(vec2 p){
 float d=1e5;bool inside=false;
 for(int i=0;i<${NEON_LANE_MAX_POINTS};i++){
  if(i>=uCount)break;
  vec2 a=uPoly[i],b=uPoly[i+1<uCount?i+1:0];
  d=min(d,seg(p,a,b));
  if((a.y>p.y)!=(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside?-d:d;
}

float hash(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}

// Etched HUD marks at lane-plane point p: x = their weighted brightness, y = how much is cut there.
// Header bar along the outer end, slanted bar group sitting on its top edge, tick ladder by the
// notch, brackets, callout. Slanted edges run parallel to the outer-end chamfers.
vec2 hudAt(vec2 p){
 // Lane-local frame: u across, o toward the owner's outer end (mirrors neonLanePolygon).
 vec2 l=uSide<.5?vec2(p.x,-p.y):vec2(-p.x,p.y);
 float W=uHalf.x,D=uHalf.y;
 float k=1./${NEON_LANE_CHAMFER.slope.toFixed(3)};
 float headerTop=D-.17-.022;
 float header=fill(box(l,vec2((W-.24+.22)*.5,D-.17),vec2((W-.24-.22)*.5,.022)));
 header*=step(.22+(l.y-(D-.17))*k,l.x+.02);
 float slants=0.,slantZ=headerTop-.05;
 for(int i=0;i<5;i++){
  float s=l.x-(l.y-slantZ)*k-(.2+float(i)*.11);
  slants+=line(s,.022)*step(abs(l.y-slantZ),.05);
 }
 float ticks=0.;
 for(int j=0;j<5;j++){
  ticks+=line(l.y-(-D+.905-float(j)*.065),.009)*step(W-.24,l.x)*step(l.x,W-.15);
 }
 vec2 bc=vec2(abs(l.x),l.y);
 float bracket=(line(bc.x-(W-.11),.009)*step(-D+.11,l.y)*step(l.y,-D+.34)
               +line(l.y-(-D+.11),.009)*step(W-.34,bc.x)*step(bc.x,W-.11));
 // The callout drops down the left side, turns along the chamfer and trails off in three dashes.
 vec2 cBend=vec2(-W+.15,D-.31-.35/k),cRun=vec2(.35,.35/k);
 float callout=line(seg(l,cBend,vec2(-W+.15,D-1.30)),.008)
              +line(seg(l,cBend,cBend+cRun*.42),.008);
 for(int m=0;m<3;m++){
  float t=.51+float(m)*.17;
  callout+=line(seg(l,cBend+cRun*t,cBend+cRun*(t+.08)),.008);
 }
 return vec2(header*.50+slants*.34+ticks*.30+bracket*.32+callout*.26,min(header+slants+ticks+bracket+callout,1.));
}

// On screen +p.y is up: etched walls throw their shadow up-left and catch light on the lower-right lip.
const vec2 SHADOW_OFFSET=vec2(-.007,.024),LIP_OFFSET=vec2(.004,-.014);

void main(){
 vec2 p=(vUv-.5)*(uHalf*2.+.08);
 vec2 fp=fwidth(p);gAA=.7*length(fp);
 float d=polyDist(p);
 float mask=1.-smoothstep(-.004,.004,d);

 float aa=max(gAA,.001);
 float cw=.013*(1.+.6*min(uActive,1.));
 float rim=(1.-smoothstep(cw-aa,cw+aa,abs(d)))*uRimCore;
 float innerCut=line(d+.085,.006);
 float inner=innerCut*(.30+.25*min(uActive,1.))*uRimCore;

 float depth=max(-d,0.);

 vec2 pw=uOrigin+p;
 float frost=.62+.7*(vnoise(pw*38.)*.6+hash(floor(pw*140.))*.4);
 vec2 hud=hudAt(p);
 float hudLevel=(.35+.55*uActive)*uPower*(1.-uClosed*.85);
 vec3 color=min(uTint*hud.x*hudLevel*frost,vec3(.5));
 float cut=max(hud.y,innerCut);
 float shadow=clamp(max(hudAt(p-SHADOW_OFFSET).y,line(polyDist(p-SHADOW_OFFSET)+.085,.006))-cut,0.,1.);
 float lip=clamp(max(hudAt(p-LIP_OFFSET).y,line(polyDist(p-LIP_OFFSET)+.085,.006))-cut,0.,1.);
 color+=vec3(.8,.92,1.)*lip*.05*uPower;
 inner*=frost;

 float pattern;
 if(uPattern<1.5){
  vec2 hp=pw*4.,r=vec2(1.,1.7320508),h=r*.5;
  vec2 a=mod(hp,r)-h,b=mod(hp-h,r)-h;
  vec2 g=abs(dot(a,a)<dot(b,b)?a:b);
  float e=.5-max(dot(g,vec2(.5,.8660254)),g.x);
  float paa=max(fwidth(e)*.75,.0001);
  pattern=1.-smoothstep(.024-paa,.024+paa,e);
 }else{
  float pd=texture2D(tPattern,pw/vec2(2.2517,1.3)).r*8.;
  float paa=max(fwidth(pd)*.6,.15);
  pattern=1.-smoothstep(.45-paa,.45+paa,pd);
 }
 color+=uTint*pattern*.045*uActive*uOpen*step(.5,uPattern)*step(.09,depth);
 color+=uSignal*exp(-depth*18.)*.11*uPower;
 color+=uTint*(rim+inner)*uPower;
 // Winner fill, a radial opacity from the lane centre to its edge, laid under the etching and pattern (premultiplied "over").
 float winFill=mix(${WINNER_FILL.centre.toFixed(3)},${WINNER_FILL.edge.toFixed(3)},clamp(length(p/uHalf),0.,1.))*uFill*mask;
 float alpha=shadow*.45*mask*(1.-uClosed*.6);
 gl_FragColor=vec4(color*mask*(1.-uClosed*.88)+uFillColor*winFill*(1.-alpha),alpha+winFill*(1.-alpha));
}`;

export function NeonLane({ x, side, lit, open, closed, pattern }: { x: number; side: number; lit: 0 | 1 | 2 | 3; open: boolean; closed: boolean; pattern: LanePattern }) {
  const colors = usePlayerColors(), lighting = useBoardLighting();
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const dimensions = neonLaneDimensions(side);
  const polygon = useMemo(() => neonLanePolygon(side), [side]);
  const geometry = useMemo(() => new THREE.ExtrudeGeometry(neonLaneShape(side), { depth: NEON_LANE_DEPTH, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: NEON_BEVEL, bevelThickness: NEON_BEVEL }), [side]);
  const base = useMemo(() => new THREE.Color(colors[side].accent), [colors, side]);
  const etching = useTexture(PATTERN_URL);
  useLayoutEffect(() => {
    etching.wrapS = etching.wrapT = THREE.RepeatWrapping; etching.colorSpace = THREE.NoColorSpace;
    etching.generateMipmaps = false; etching.minFilter = etching.magFilter = THREE.LinearFilter; etching.needsUpdate = true;
  }, [etching]);
  const uniforms = useMemo(() => ({
    uHalf: { value: new THREE.Vector2(dimensions.halfWidth, dimensions.halfDepth) },
    uOrigin: { value: new THREE.Vector2(x, -dimensions.z) },
    tPattern: { value: etching },
    uTint: { value: new THREE.Color() },
    uSignal: { value: new THREE.Color() },
    uPoly: { value: Array.from({ length: NEON_LANE_MAX_POINTS }, (_, i) => new THREE.Vector2(...(polygon[i] ?? [0, 0]))) },
    uCount: { value: polygon.length },
    uRimCore: { value: .8 },
    uPower: { value: 1 },
    uActive: { value: 0 },
    uTime: { value: 0 },
    uOpen: { value: 0 },
    uPattern: { value: 0 },
    uClosed: { value: 0 },
    uSide: { value: side },
    uFill: { value: 0 },
    uFillColor: { value: new THREE.Color() },
  }), [side, x, dimensions.halfWidth, dimensions.halfDepth, dimensions.z, polygon, etching]);
  const glow = useRef<THREE.ShaderMaterial>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // The pattern darkens with the closing plate's travel, in step with the sinking cards; a lane mounted closed starts dark.
  const closeStart = useRef(closed ? -Infinity : 0), wasClosed = useRef(closed);
  useLayoutEffect(() => {
    if (closed && !wasClosed.current) closeStart.current = performance.now() / 1000;
    wasClosed.current = closed;
  }, [closed]);
  useFrame((frame, delta) => {
    if (!glow.current) return;
    const u = glow.current.uniforms as typeof uniforms;
    const dt = Math.min(delta, .05), health = side === 0 ? boardSideHealth.x : boardSideHealth.y;
    let targetActive = 0, rimCore = .8;
    if (lit === 1) { targetActive = 1; rimCore = 1.75; }
    else if (lit === 2) { targetActive = 1.35; rimCore = 2.0; }
    else if (lit === 3) {
      const wave = Math.sin(frame.clock.elapsedTime * 2.6);
      targetActive = reduced ? 1 : .75 + .25 * wave;
      rimCore = reduced ? 1.65 : 1.55 + .35 * wave;
    }
    u.uActive.value = reduced ? targetActive : THREE.MathUtils.damp(u.uActive.value, targetActive, 10, dt);
    u.uRimCore.value = reduced ? rimCore : THREE.MathUtils.damp(u.uRimCore.value, rimCore, 12, dt);
    u.uTint.value.copy(base);
    if (lit === 2) u.uTint.value.lerp(HOVER, .52);
    if (lit === 3) u.uTint.value.copy(CHOICE);
    const tint = u.uTint.value;
    tint.multiplyScalar(.88 / Math.max(.05, tint.r * .2126 + tint.g * .7152 + tint.b * .0722));
    u.uPower.value = (.48 + .52 * health) * (lit === 0 ? .92 : 1);
    u.uTime.value = reduced ? 0 : frame.clock.elapsedTime;
    u.uOpen.value = open ? 1 : 0;
    u.uClosed.value = closed ? laneSinkOverlay(side, reduced ? Infinity : performance.now() / 1000 - closeStart.current, true).opacity / SINK_OPACITY : 0;
    u.uPattern.value = pattern === 'none' ? 0 : pattern === 'hexagons' ? 1 : 2;
    u.uFillColor.value.copy(base);
    u.uFill.value = reduced ? (lit === 1 ? 1 : 0) : THREE.MathUtils.damp(u.uFill.value, lit === 1 ? 1 : 0, lit === 1 ? 6 : 4, dt);
    const pulse = lighting.current.pulse;
    const amount = pulse?.owner === side ? pulseEnvelope(pulse.startedAt, lightingNow(), pulseDuration(pulse.kind)) : 0;
    u.uSignal.value.copy(pulse?.kind === 'drain' ? DRAIN : RESTORE).multiplyScalar(amount);
  });
  return <group name={`neon-lane-${side}-${x}`}>
    <mesh position={[x, .12, dimensions.z]} rotation={[-Math.PI / 2, 0, 0]} geometry={geometry} receiveShadow>
      <NeonGlassMaterial variant="lane" side={side} outline={polygon} space="model" grain={LANE_GRAIN} />
    </mesh>
    <mesh position={[x, .208, dimensions.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[dimensions.halfWidth * 2 + .08, dimensions.halfDepth * 2 + .08]} />
      <shaderMaterial ref={glow} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} blending={THREE.CustomBlending} blendEquation={THREE.AddEquation} blendSrc={THREE.OneFactor} blendDst={THREE.OneMinusSrcAlphaFactor} blendSrcAlpha={THREE.ZeroFactor} blendDstAlpha={THREE.OneFactor} toneMapped={false} />
    </mesh>
  </group>;
}
