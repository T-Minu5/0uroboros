import { DISC_RADIUS, TUBE_LENGTH } from './pulseOrigami';

/** Shield sleeve around the Pulse Origami: between the discs and the glass. */
export const SHIELD_RADIUS = DISC_RADIUS + .04;
export const SHIELD_HITS = 4;
/** Seconds a hit ripple lives; the ring travels at RING_SPEED units/s up to RING_MAX units from the impact. */
export const SHIELD_HIT_S = 1.8;
const RING_SPEED = 1.75, RING_MAX = 1.5, RING_WIDTH = .12, IMPACT_RADIUS = .3;
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/**
 * JS twin of the shader's hit ripple (without the edge noise): glow at `d` tube units from an impact `el` seconds old.
 * The travelling ring is scaled by `motion`, so reduced motion keeps only the impact flash.
 */
export function hitGlow(d: number, el: number, motion: number) {
  if (el < 0 || el > SHIELD_HIT_S) return 0;
  const r = Math.min(el * RING_SPEED, RING_MAX);
  const ring = (1 - smooth(0, RING_WIDTH, Math.abs(d - r))) * (1 - smooth(SHIELD_HIT_S * .5, SHIELD_HIT_S, el)) * (1 - smooth(RING_MAX * .75, RING_MAX, r)) * motion;
  const zone = (1 - smooth(0, IMPACT_RADIUS, d)) * (1 - smooth(0, SHIELD_HIT_S * .35, el));
  return ring * 1.6 + zone * 1.2;
}
/** Hex cells around the circumference; a whole number keeps the unwrapped grid seamless. */
const HEX_AROUND = 6;
const HEX_ALONG = TUBE_LENGTH * HEX_AROUND / (2 * Math.PI * SHIELD_RADIUS);
/** Flow and ripple noise keep their own finer grain, independent of the hex size. */
const NOISE_AROUND = 18;
const NOISE_ALONG = TUBE_LENGTH * NOISE_AROUND / (2 * Math.PI * SHIELD_RADIUS);

export const shieldVertex = `varying vec2 vUv;varying vec3 vN;
void main(){vUv=uv;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

const glslNoise = `vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
 const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
 vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
 vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
 i=mod289v3(i);
 vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
 float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
 vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
 vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
 vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
 vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
 vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
 vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
 p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
 vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
 return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;

const glslHex = `const vec2 HEX_S=vec2(1.,1.7320508);
vec4 hexCell(vec2 p){vec4 hC=floor(vec4(p,p-vec2(.5,1.))/HEX_S.xyxy)+.5;vec4 h=vec4(p-hC.xy*HEX_S,p-(hC.zw+.5)*HEX_S);
 return dot(h.xy,h.xy)<dot(h.zw,h.zw)?vec4(h.xy,hC.xy):vec4(h.zw,hC.zw+.5);}
float hexEdge(vec2 cell){cell=abs(cell);return smoothstep(.44,.5,max(dot(cell,HEX_S*.5),cell.x));}`;

/**
 * Transparent hex force-shield over the powered part of the tube (tube fraction 0 → fill), with the tube's end-point
 * glow at fill. Hits ripple along the tube from their impact point in their own colour; the travelling pulses light
 * the hexes as they pass. `cap3` and `pulseAt` come from the tube's shared shader snippets. With `hexes` at 0 only the
 * end-point glow is drawn.
 */
export function shieldFragment(glslCap: string, glslPulses: string) {
  return `varying vec2 vUv;varying vec3 vN;
uniform float fill,gain,power,flicker,cap,health,shieldTime,motion,hexes;uniform vec3 tint;
uniform float hitA[${SHIELD_HITS}],hitT[${SHIELD_HITS}];uniform vec3 hitCol[${SHIELD_HITS}];
${glslCap}${glslPulses}${glslNoise}${glslHex}
void main(){
 float a=vUv.y,edge=fill-a;
 if(fill<.001||edge<-.03)discard;
 float cover=smoothstep(-.006,.008,edge);
 vec2 p=vec2(vUv.x*${NOISE_AROUND.toFixed(1)},a*${NOISE_ALONG.toFixed(3)});
 vec2 hp=vec2(vUv.x*${HEX_AROUND.toFixed(1)},a*${HEX_ALONG.toFixed(3)});
 float t=shieldTime*motion;
 float fres=pow(max(1.-abs(vN.z),0.),1.8)*1.75;
 float flow=(snoise(vec3(p*.35,t*1.13))*.6+snoise(vec3(p*.7+7.,-t*.8))*.4)*.5+.5;
 vec4 hc=hexCell(hp);float hex=hexEdge(hc.xy);
 float rnd=fract(sin(dot(hc.zw,vec2(127.1,311.7)))*43758.5453);
 float flash=smoothstep(.6,1.,sin(t*.6*(.5+rnd*1.5)+rnd*6.2831))*.11*motion;
 float zone=0.;vec3 hit=vec3(0.);
 for(int i=0;i<${SHIELD_HITS};i++){
  float el=shieldTime-hitT[i],on=step(0.,hitT[i])*step(0.,el)*step(el,${SHIELD_HIT_S.toFixed(2)});
  float d=abs(a-hitA[i])*${TUBE_LENGTH.toFixed(2)};
  float r=min(el*${RING_SPEED.toFixed(2)},${RING_MAX.toFixed(2)});
  float n=snoise(vec3(p*.5,el*2.))*.05;
  float ring=(1.-smoothstep(0.,${RING_WIDTH.toFixed(2)},abs(d+n-r)))*(1.-smoothstep(${(SHIELD_HIT_S * .5).toFixed(2)},${SHIELD_HIT_S.toFixed(2)},el))*(1.-smoothstep(${(RING_MAX * .75).toFixed(3)},${RING_MAX.toFixed(2)},r))*on*motion;
  float z=(1.-smoothstep(0.,${IMPACT_RADIUS.toFixed(2)},d))*(1.-smoothstep(0.,${(SHIELD_HIT_S * .35).toFixed(3)},el))*on;
  zone+=z;hit+=hitCol[i]*(ring*1.6+z*(.25+hex*2.));
 }
 zone=min(zone,1.);
 vec3 life=mix(vec3(1.,.08,.04)*2.4,tint*gain,smoothstep(0.,.6,health));
 float intensity=hex*(.13+zone*1.2)*(.3+fres*.7)+fres*.4+flash;
 float band=pulseAt(a);
 float dim=power*(1.-flicker*.75);
 vec3 shield=life*(intensity*1.1+flow*fres*.35+band*(.2+hex*1.1))*dim;
 float menisc=exp(-edge*edge*4900.);
 gl_FragColor=vec4((cap3(shield,cap)+cap3(hit*dim,4.))*cover*hexes+cap3(tint*gain*menisc*1.4*dim,cap*.5),1.);
}`;
}
