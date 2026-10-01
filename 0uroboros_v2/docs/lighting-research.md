# Lighting research — 0uroboros v2 board (R3F, WebGL, OrthographicCamera)

Scope: three 0.186 / R3F 9 / drei 10.7.8, `WebGLRenderer`, ortho camera at roughly (0, 18, 13.8) looking
down ~52°. Pipeline in `BoardFinish` (`src/BoardAtmosphere.tsx`): `RenderPass → [scan ShaderPass] →
UnrealBloomPass → OutputPass`, HalfFloat MSAA target, ACES. Sources read: three `dev` examples
(`webgpu_lights_rectarealight`, `webgl_lights_rectarealight`, `RectAreaLightHelper.js`,
`webgpu_postprocessing_bloom_emissive` incl. its first version `460efde132`, `webgpu_postprocessing_bloom_selective`,
`webgl_postprocessing_unreal_bloom_selective`, `UnrealBloomPass.js`, `OutputPass.js`, `Reflector.js`),
drei `MeshReflectorMaterial.js`, and `0beqz/realism-effects` (readme + `src/`).

## 0. Two facts about the current pipeline that drive everything below

1. **`toneMapped={false}` is a no-op in this pipeline.** `WebGLPrograms` only applies tone mapping when
   `currentRenderTarget === null` (see `node_modules/three/src/renderers/webgl/WebGLPrograms.js:177-185`).
   `RenderPass` renders into the composer's HalfFloat target, so *every* material writes linear HDR, and
   `OutputPass` applies ACES to the whole frame once. The flag is harmless but it's not what makes things bloom.
2. **Bloom selection happens only through linear luminance against `threshold`.** `UnrealBloomPass` runs
   `LuminosityHighPassShader`: `alpha = smoothstep(threshold, threshold+0.01, luminance(rgb))` with
   `luminance = dot(rgb, (0.2126, 0.7152, 0.0722))`. Idle threshold is `0.72`. Measured palette (linear
   luminance × current emissiveIntensity):

   - rail magenta `#ff0ba1` L=0.241 ×3.1 → **0.75** (just barely blooms)
   - rail cyan `#27e2ff` L=0.620 ×2.4 → 1.49 (blooms)
   - socket orange `#ff8a1f` L=0.395 ×2.6 → 1.03 (blooms)
   - socket violet `#b24cff` L=0.219 ×2.6 → **0.57 (never blooms)** — opponent's winning chevron is dead
   - GLB magenta→`#b24cff` ×2.1 → **0.46**, GLB orange ×1.65 → **0.65**, GLB red ×0.65 → **0.14** (none bloom)
   - DC tints used as raw colour (×≤1 in the additive shell): cyan 0.60, gold 0.64, **red `#fa0048` 0.21**

   So when a tube turns red on drain, its glow *drops out of bloom*, the opposite of what the moment needs.
   Rule of thumb: **emissive multiplier ≈ targetL / L(colour)**. Aim for targetL ≈ 1.2–1.6 for "neon", 2.5–4 for
   "event flash", < 0.6 for "lit but not glowing".

## 1. Key techniques per source

### 1a. `webgl/webgpu_lights_rectarealight` + `RectAreaLightHelper`

What the example does: three 4×10 `RectAreaLight`s (red, green, blue, intensity 5) at y=6 spinning on Y over a
2000×0.1 floor, with a `TorusKnot` (white, roughness 0, metalness 0). The floor has a **checker roughness map**
(repeat 400), so you can see the LTC reflection sharpen on the smooth cells and smear on the rough cells.
WebGL needs `RectAreaLightUniformsLib.init()` (already done at the top of `ServerLights.tsx`); WebGPU uses
`THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`.

```js
RectAreaLightUniformsLib.init();                           // LTC1/LTC2 lookup textures, once
const rect = new THREE.RectAreaLight(0xff0000, 5, 4, 10);   // color, intensity (nits), width, height
rect.position.set(-5, 6, 5); scene.add(rect);
scene.add(new RectAreaLightHelper(rect));                   // docs recommend rect.add(helper)
rect.rotation.y += -delta;                                  // animation is just transform
```

Semantics that matter here:
- **Materials:** only `MeshStandardMaterial` / `MeshPhysicalMaterial`. `MeshBasic` (floor image,
  `FieldEngravings`), Lambert/Phong and every custom `shaderMaterial` glow in this repo ignore it.
- **Direction:** it emits from one side only, down its local −Z axis (the direction `lookAt` points it). With `rotation-x = -π/2` it faces down.
  Object `scale` is ignored; use `width`/`height`. No shadows.
- **Units:** `intensity` is luminance (nits); `power` (lumens) is `intensity · width · height · π`, so
  resizing the light changes its total output unless you set `power`. The tube light is 3.2×0.5, so power = I·5.03.
- **Cost:** every Standard/Physical fragment evaluates every rect light (two LTC texture fetches plus polygon
  integration). 4 is fine; don't add a new one per effect.
- **Helper:** a `Line` outline plus a `BackSide` `MeshBasicMaterial` quad, scaled `0.5·width × 0.5·height`,
  colour `light.color × intensity` **normalised so max channel ≤ 1** ("prevent hue shift"). So the helper is LDR
  and will never bloom. It's a debug aid. The visible emitter has to be your own HDR mesh (here, the tube).

### 1b. `webgpu_postprocessing_bloom_emissive` (and its selective sibling)

Worth correcting the brief: **this example has no animated shapes, in either version.** It is the
`DamagedHelmet.gltf` on the `moonless_golf_1k.hdr` environment (`scene.environment` = background), ACES,
OrbitControls. Nothing animates. The "illuminated shapes" are the helmet's **`emissiveMap` texels** (visor
and panel lights). The selective technique is an MRT attachment that contains *only emissive*:

```js
const mrtNode = mrt({ output, emissive: vec4(emissive, output.a) });
mrtNode.setBlendMode('emissive', new THREE.BlendMode(THREE.NormalBlending));
scenePass.setMRT(mrtNode);
scenePass.getTexture('emissive').type = THREE.UnsignedByteType;  // LDR 8-bit: emissive clamped 0..1
const bloomPass = bloom(scenePass.getTextureNode('emissive'), 2.5, .5);  // strength 2.5, radius .5, threshold 0
renderPipeline.outputNode = scenePass.getTextureNode().add(bloomPass);
```

Takeaways: (1) bloom input is *emissive only*, so lit albedo and env reflections never bloom however bright they
get; (2) threshold is 0, so any emissive blooms; (3) emissive is stored 8-bit, so intensity above 1 doesn't widen
the halo, and strength 2.5 does the work.
`webgpu_postprocessing_bloom_selective` is where the shapes are: **50 `IcosahedronGeometry(1, 15)` spheres**,
`color.setHSL(random, 0.7, 0.05–0.25)` (dark, saturated), scale 0.5–1.5, positioned on a shell of radius 2–6, each
with a per-material `mrt({ bloomIntensity: uniform(0|1) })`; bloom input = `output * bloomIntensity`;
NeutralToneMapping; clicking toggles the uniform. They're unlit `MeshBasicNodeMaterial` and don't animate.

### 1c. WebGL selective bloom options (what we can actually use)

- **A. HDR threshold (current approach, recommended).** Keep one composer and push "should glow" surfaces
  above `threshold` in linear space while everything lit stays below it. It's free, but you have to manage
  luminance (section 0). Raise threshold toward 0.85–1.0 so specular highlights on metal stop bleeding in.
- **B. Layers + darken non-bloomed** (`webgl_postprocessing_unreal_bloom_selective`). A second
  composer renders the scene with non-bloom meshes swapped to a black `MeshBasicMaterial` → `UnrealBloomPass`
  (threshold 0) → a mix `ShaderPass` adds `bloomComposer.renderTarget2.texture` onto the normal render.
  Cost: a **second full scene render** plus a material swap traversal every frame. Additive/transparent glow
  shaders (tubes, `LaneLight`, `PulseField`) must be made *invisible* rather than blackened, or they'll
  occlude. Not worth it here.
- **C. MRT emissive in WebGL** (a port of 1b). `WebGLRenderTarget({ count: 2 })` plus `onBeforeCompile`
  on every material to write `layout(location=1)` emissive. It's possible but invasive; every custom shader needs
  editing. Skip.

### 1d. `0beqz/realism-effects`

It's built on the `postprocessing` npm lib (`EffectPass`, `Effect.mainImage`). The readme states that
**`OrthographicCamera` isn't supported.** SSGI/SSR, HBAO/SSAO, TRAA and motion blur all rebuild world position
from depth with perspective assumptions, reproject with a velocity pass, and rely on temporal accumulation. Don't
add it. These ideas transfer:
- **AO as a multiply, tinted:** `ao_compose.frag` does `mix(aoColor, vec3(1), pow(ao, power)) * input`. We
  can get the same look from *static* sources: the existing `ContactShadows` (frames=1) and a baked AO/cavity
  term in the triplanar `surfaceMaterial` (e.g. multiply `diffuseColor` by a darkening near sockets and tubes).
  A tinted AO colour (`#0a0620`, not black) keeps neon shadows from going grey.
- **Temporal accumulation when still:** `taa.frag` blends `mix(accum, color, 1/(framesStill+1))`. The board
  camera never moves, so a small history blend (≤0.2) on *noise-based* effects (grain, spark dither, flicker)
  can remove shimmer. Don't apply it to the whole frame, because animated shaders would ghost.
- **Blue-noise dithering** (`blue_noise.glsl`): use it for grain and for thresholding spark and scanline alpha
  instead of `fract(sin())`.
- **Sparkle effect:** adds `pow(color, 4) · sparkle` where noise × luminance × facing is high. It's a good model
  for glints on the chrome caps and rails. It works in a material or a screen pass without depth.
- **Lens distortion + aberration** (`LensDistortionEffect`): three taps, R/G/B offset. Section 3 uses a radial
  version.
- **SSR/SSGI: no.** Under ortho, use the planar/fake options in section 2.

## 2. Reflections under an OrthographicCamera (WebGL)

**Why env/Lightformer reflections look flat on the board top.** Under an ortho camera, three uses a constant
view direction (`isOrthographic → vec3(0,0,1)`). A flat plane has a constant normal, so its reflection vector is
identical at every pixel. With our camera it's ≈ (0, 0.79, −0.61) in world space. The whole flat board top
samples **one texel** of the PMREM env. That gives a uniform sheen with no gradient or streak. The second
Lightformer (`#9cabc5` at [2, 8, −5], facing down) sits close to that direction, which is where the current
board-top sheen colour comes from. Structure only appears where the **normal varies**: bevels, rails, tube
cylinders, caps, and the triplanar relief bump in `surfaceMaterial`.

- **drei `MeshReflectorMaterial` (10.7.8): not recommended under ortho.** Its `virtualCamera` is always a
  `PerspectiveCamera` with the ortho projection matrix copied in. The oblique near-plane clip uses the
  *perspective* formula (`q.w = (1+P[10])/P[14]`, `P[10] = clipPlane.z + 1`), which is wrong for an ortho matrix.
  Expect geometry under the plane (floor video at y=−0.96, table underside) to leak in, or reflections to clip.
  Shader passes also see `isOrthographic=false`. Each instance is one extra scene render plus a blur. If you
  try it anyway, use a single plane, `resolution≈512`, `mixStrength≤0.6`, and check for leakage visually.
- **three `Reflector` addon: works under ortho in 0.186.** `getReflectionCamera` clones the real camera, so
  the reflection camera is ortho, and there is an explicit ortho branch for the oblique clip (`Reflector.js`
  lines 179–215). Cost is one extra scene render per frame (shadow map not re-rendered). **Cheap trick:**
  after the first frame, set `reflector.getReflectionCamera(camera).layers.set(NEON_LAYER)` and enable that layer
  on rails, tubes, lane glows and chevrons. The mirror then renders only neon, which is cheap and bloom-friendly. You need
  a custom `shader` (or render the Reflector underneath a translucent board top) to blend at 10–25%. It is not
  PBR-aware, so fake roughness by rendering at low res (e.g. 384×216).
- **Roughness/metalness tuning for ortho:** high metalness on *flat* tops just shows that single env texel
  (grey slab). For flat board tops use metalness 0.35–0.6, roughness 0.3–0.45, and let the rect/point lights and
  the wash (section 4) carry the read. Keep metalness 0.85–0.95 and roughness 0.18–0.28 on bevels, rails, caps and
  plinths where normals vary. Raising `boardSurfaceRelief` a little (0.018 → 0.025) breaks up the uniform sheen.
- **Fake glossy strips (recommended for lane strips):** an additive plane just above each lane (as `LaneLight`
  already does) with a slow diagonal highlight band, masked by the lane SDF, drifting with time and brighter
  near active neon:

```glsl
// uv in lane space; uTime seconds; uGloss 0..1; uTint = nearest neon colour
float band = exp(-pow((vUv.x*0.7 + vUv.y*0.35 - fract(uTime*0.04)*1.6 + 0.3) * 9.0, 2.0));
float edge = smoothstep(0.5, 0.42, abs(vUv.x-0.5));           // stay inside lane rails
gl_FragColor = vec4(uTint * 0.35, band * edge * uGloss * 0.10);  // additive, stays < threshold
```

**Recommendation:** board top uses tuned roughness/metalness, the relief bump and the shader wash (4c), with
**no reflector**. Lane strips get the fake glossy band (low cost, art-directable). An optional stretch item is one
low-res `Reflector` limited to the neon layer, placed just under a 15% translucent lane surface so tubes and rails
mirror into the lanes.

## 3. Cinematic grading (slots in before `OutputPass`)

The input is **linear HDR after bloom**. `OutputPass` then applies ACES and sRGB. Work in linear, and make masks
from a compressed luminance `L/(1+L)` so HDR neon doesn't saturate them. Keep every effect subtle, because ACES
amplifies saturation shifts.

```ts
// src/boardGrade.ts (new) — ShaderPass(BoardGradeShader); insert after bloom, before output.
import * as THREE from 'three';
export const BoardGradeShader = {
  name: 'BoardGrade',
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.28 }, uSplit: { value: 0.10 }, uAberration: { value: 0.0022 }, uGrain: { value: 0.03 },
    uShadowTint: { value: new THREE.Color('#0d5a66') },  // teal
    uHighTint: { value: new THREE.Color('#ff3fb4') },    // magenta
    uWashNear: { value: new THREE.Vector4(0, 0, 0, 0) }, // rgb, strength — local player (screen bottom)
    uWashFar: { value: new THREE.Vector4(0, 0, 0, 0) },  // opponent (screen top)
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uResolution; uniform float uTime,uVignette,uSplit,uAberration,uGrain;
  uniform vec3 uShadowTint,uHighTint; uniform vec4 uWashNear,uWashFar; varying vec2 vUv;
  const vec3 W=vec3(.2126,.7152,.0722);
  float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
  void main(){
    vec2 c=vUv-.5; vec2 ca=c*vec2(uResolution.x/uResolution.y,1.); float r2=dot(ca,ca);
    vec2 off=c*r2*uAberration*6.;                              // radial CA, zero at centre
    vec3 col=vec3(texture2D(tDiffuse,vUv+off).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-off).b);
    float L=dot(col,W), t=L/(1.+L);
    vec3 teal=uShadowTint-dot(uShadowTint,W), mag=uHighTint-dot(uHighTint,W);  // zero-luminance chroma
    col+=teal*(1.-smoothstep(.05,.35,t))*uSplit*(L+.015) + mag*smoothstep(.45,.85,t)*uSplit*L;
    float near=smoothstep(.55,0.,vUv.y), far=smoothstep(.45,1.,vUv.y);        // side washes read as light
    col+=uWashNear.rgb*uWashNear.a*near*near*(.04+L*.6) + uWashFar.rgb*uWashFar.a*far*far*(.04+L*.6);
    col*=1.-uVignette*smoothstep(.12,.62,r2);
    float n=hash(vUv*uResolution+fract(uTime*7.13)*vec2(97.,57.))-.5;
    col=max(col*(1.+n*uGrain)+n*uGrain*.004,0.);               // luminance-proportional grain
    gl_FragColor=vec4(col,1.);
  }`,
};
```

Hook-up in `BoardFinish`: create `new ShaderPass(BoardGradeShader)` in the `pipeline` memo, re-add it in the
pass-order effect (`render → scan? → bloom → grade → output`), set `uResolution` in the resize effect, and in
the `useFrame` (priority 1) set `uTime` and the washes from `useBoardLighting()`:
`env = pulseEnvelope(pulse.startedAt)`; drain → `rgb=#ff1040, a=env*0.9` on `pulse.owner`'s side; restore →
`#ffc040, a=env*0.7`. Owner 0 is near, which is the bottom of the screen.

**Per-state bloom** (same `useFrame`, damp toward targets):
- idle: strength 0.30, radius 0.42, threshold 0.85 (after luminance-normalising neon, item 1)
- scan: keep `BLOOM_SCAN` (1.0 / 0.5 / 0.9)
- drain: strength +0.25·env, and tint the two widest mips red:
  `bloom.bloomTintColors[3|4].set(1, .35+.65*(1-env), .45+.55*(1-env))` gives a red outer halo without touching
  materials
- restore: strength +0.2·env, outer mips warm `(1, .85, .55)`
- award: strength +0.35·env, radius +0.1·env
Reset the tints to `(1,1,1)` when env reaches 0. `bloomTintColors` is read every render (`UnrealBloomPass.js:345`).

## 4. Servers (`src/ServerLights.tsx`)

The current tube: glass `MeshPhysical` (transmission 0.18) + additive shell shader + liquid cylinder shader +
additive floor glow + one down-facing 3.2×0.5 `RectAreaLight` per tube at world y≈0.73. Positions: x = ±4.6;
z = −4.75 (owner 1) and `boardDepth(4.75)` = 5.40 (owner 0).

**4a. Keep the glow in bloom when hue changes.** Add a `gain` uniform so luminance, not hue, sets brightness:
`gain = targetL / max(0.05, dot(tintLinear, W))`, with targetL around 1.3 idle, 2.2 drain, 1.8 restore. Multiply
`energy` and `filledGlow` by it. Red then blooms as hard as cyan.

**4b. Animated energy material (liquid + shell), one shader, cheap:**

```glsl
// uniforms: fill, time, tint, gain, power, uFlow(+1 restore/idle, -1 drain), uHealth, uFlicker, uHeat
float bands   = smoothstep(.35,.0,abs(fract(axis*6. - time*.55*uFlow) - .5)) * .45;  // flowing bands
float scan    = .5+.5*sin(axis*220. - time*9.);  scan = mix(1., .82+.18*scan, .6);   // fine scanlines
float spine   = pow(max(0.,1.-abs(vUv.x-.5)*6.),3.)*.35;                               // bright core
float menisc  = smoothstep(.9,1.,axis/fill)*1.3;                                        // hot surface line
float e = (.35 + bands + spine + menisc) * scan * gain * power * (1. - uFlicker*.75);
gl_FragColor = vec4(tint*e, .98*power);
```

Band speed `.55` can scale with `uHealth` (a sick core flows slowly). `uFlow = -1` during drain makes energy
visibly pour out.

**4c. LED rack arrays on the plinth** (the 3.16×0.10×0.48 box): one additive plane on its top face (local
y≈−0.055) with a grid of cells, so there is no extra geometry per LED:

```glsl
vec2 g = vec2(32., 2.); vec2 cell = floor(vUv*g), f = fract(vUv*g);
float led = smoothstep(.36,.26,max(abs(f.x-.5),abs(f.y-.5)*.8));
float lit = step(cell.x/g.x, fill);                                   // bar = health
float blink = step(.18, hash(cell + floor(time*(4.+cell.y*3.))));     // server chatter
vec3 c = mix(vec3(1.,.08,.2), tint, step(.25, fill));                 // rack goes red under 25%
gl_FragColor = vec4(c*gain*1.6, led*(.08 + .92*lit*blink)*power);
```

**4d. Damage / flicker at low health.** Compute flicker **on the CPU** once per tube per frame and feed the
same value to the shader (`uFlicker`) and to `light.intensity`, so glass, board wash and light stutter
together. `h = health; flicker = h < .3 ? (hash(floor(t*14)+seed) < (.3-h)*2.2 ? 1 : 0) : 0`, with a second
slower brown-out `0.15*(1-h)*sin(t*1.7)²`. Keep this off under `prefers-reduced-motion`.

**4e. Heat shimmer.** Cheapest version: a thin additive plane rising 0.4 above the tube with animated
domain-warped noise alpha (`uHeat` = drain env + (1−health)·0.4), coloured `tint*0.25`. That's below threshold,
so it reads as haze rather than glow. Optional fancier version: the glass already has `transmission > 0`,
which means three renders a transmission pass. Animating a small tiling `normalMap` offset on the glass (only
while `uHeat > 0`) refracts the board behind it. If you don't use that, set `transmission = 0` to save the
pass. Opacity and clearcoat carry the look fine top-down.

**4f. Spark bursts on drain.** Use an `InstancedMesh` of about 40 thin quads per burst, one pool per tube,
additive, colour `mix(white, red, age)` × 3.5 (HDR, so it blooms). Spawn at the meniscus
(`x ± fill·1.52`, y≈0.43) on `pulse.id` change, with initial velocity random upward/outward, gravity −6,
life 0.35–0.7 s, and each quad stretched along its velocity. Don't use `THREE.Points` + `sizeAttenuation`, because
under ortho the point size doesn't attenuate, so it would need manual `camera.zoom` scaling.

**4g. Health → board lighting via `src/boardLighting.ts`.** Read `useBoardLighting()` inside `useFrame`,
never through React state.
- *Tube rect light:* `intensity = base · (0.15 + 0.85·centerHealth[owner][target]) · (1 − 0.7·flicker)
  · (1 + 1.5·env)`, colour = tint. Widen it to about 3.6 × 0.9 and lower it slightly (local y 0.2) so its
  wash reaches past the plinth onto the board edge. Remember power = I·w·h·π, so reduce I when you enlarge it.
- *Board wash (the main "area light" read):* inject into `surfaceMaterial` (it already has `vBoardPosition`)
  a shared uniform block. Four Gaussian blobs at the tube positions give coloured light on the board top,
  plus a per-player dimmer:

```glsl
// uniforms (one shared object for all board materials): uTubePos[4] (vec3), uTubeCol[4] (vec3·strength),
// uSideDim (vec2: near, far), uSideWash (vec4 rgb·a for pulse.owner side), uWashSide (+1 near / -1 far)
#include <opaque_fragment>   // insert BEFORE this chunk:
vec3 wash = vec3(0.);
for (int i=0;i<4;i++){ vec2 d=(vBoardPosition.xz-uTubePos[i].xz)*vec2(.42,1.1); wash+=uTubeCol[i]*exp(-dot(d,d)); }
float nearSide = smoothstep(-1.5, 1.5, vBoardPosition.z);             // 0 far, 1 near
outgoingLight *= mix(uSideDim.y, uSideDim.x, nearSide);
outgoingLight += (wash + uSideWash.rgb*uSideWash.a*(uWashSide>0.?nearSide:1.-nearSide)) * (diffuseColor.rgb+.04);
```

  `uSideDim = mix(0.55, 1.0, sideHealth)` per player. Drain → `uSideWash = red · env · 0.5`; restore →
  gold `#ffb640 · env · 0.35` (a warm swell). Multiplying by albedo makes it read as light rather than fog.
  Bump `customProgramCacheKey` to `'ouroboros-world-surface-v3'`.
- *Rails/fill:* scale the two `BoardSideEdges` point lights nearest each player's half by `uSideDim` of that
  player (the z≈1.8 cyan ones belong to the near half). Don't add new lights.

## 5. Lane reward glow (new `src/LaneRewardGlow.tsx`)

To reproduce the look of the bloom_emissive example in WebGL with the existing `UnrealBloomPass`: a
**PBR-lit panel whose emissive map glows** (helmet visor → lane engraving) plus a few **dark saturated orbs**
(selective-bloom spheres) that flare into bloom. Selection is by HDR luminance (1c-A). Only the reward
elements exceed about 2.0; everything around them stays below the 0.85 threshold.

Trigger: `useBoardLighting().current.award` (`node`, `startedAt`). `x = NODE_X[node]`; winner side from props
(`node.powers`); lane z = `side===0 ? boardDepth(2.4) : -2.4`, size 2.29 × (3.3 | 2.79), same as
`FieldEngravings`. `env = pulseEnvelope(award.startedAt, now, 1.8)`, with `t` = normalised age.

Elements (always mounted, `visible = env > 0`, so mount/unmount never happens):
1. **Emissive-map panel (helmet analogue):** `planeGeometry` at y≈0.226 with `meshStandardMaterial`
   `{ color:'#05070c', roughness:.4, metalness:.6, emissiveMap: field-engraving.png, emissive: rewardColor,
   emissiveIntensity: k·(0.25 + 1.75·env), transparent, depthWrite:false }` where `k = 2.2 / L(rewardColor)`.
   Only the engraved lines cross the threshold. The dark base still picks up rect/point light like the helmet.
2. **Orbs (selective-bloom spheres):** 7-instance `InstancedMesh(IcosahedronGeometry(1, 3))`, radius
   0.05–0.10, `meshBasicMaterial` with `color = rewardColor × (k·1.6)` (linear colours above 1 are fine into
   HalfFloat). They start at lane centre and rise `y = 0.3 + 0.9·t` with `x/z` wobble `sin(t·6 + i)·0.25`, and
   scale `(1−t)²`. Base colour is chosen dark and saturated (HSL L≈0.15, S≈0.7) as in the example, then pushed
   by the multiplier.
3. **Perimeter sweep:** reuse the `LaneLight` rounded-rect SDF with a bright head running round the edge
   (`fract(angleParam − t·1.4)`), colour × k·2.5, additive.
4. **One pooled `pointLight`** (always mounted, intensity 0 idle) at `[x, 0.8, z]`, distance 3,
   `intensity = 6·env`, rewardColor, so cards and sockets are genuinely lit.

Colours match `PulseField`: VP/restore `#ffcc12`, crypto `#1fffb1`, actions `#27e2ff`, draw `#4185ff`, fallback
`#bc64ff`. Timeline: 0–0.2 s a flash to about 1.4× (the attack in `pulseEnvelope`), 0.2–1.1 s a breathing hold
`1 + 0.15·sin(t·18)`, then decay. Under reduced motion, hold a static 0.6 env for 0.8 s. Pair it with the
award bloom bump (section 3).

## 6. Ranked change list

1. **Agent B (boardMaterials / BoardAtmosphere / BoardScene):** luminance-normalise every neon emissive to
   targetL 1.2–1.6 (magenta rail 3.1→5.5, cyan rail 2.4→2.2, GLB violet 2.1→6, GLB orange 1.65→3.5,
   PowerSocket violet 2.6→6.5, GLB red 0.65 stays sub-threshold unless intended), then raise idle threshold
   0.72→0.85. *Gain:* high — consistent neon, opponent colours finally glow, metal highlights stop blooming.
   *Perf:* low. *Risk:* global brightness shift; retune `BLOOM_IDLE.strength` (~0.30) in the same PR.
2. **Agent A (ServerLights.tsx):** add the `gain` uniform (4a) so red drain and gold heal bloom as strongly as
   cyan. *Gain:* high — the drain beat currently dims. *Perf:* low. *Risk:* none.
3. **Agent B:** stable light pool. `LaneLight` and `PowerSocket` conditionally mount `pointLight`s (up to about
   15), and every count change forces **all lit materials to recompile** (a visible hitch on first win/hover).
   Mount fixed lights per lane/socket and drive `intensity` (0 when off). *Gain:* high (smoothness). *Perf:*
   low; it removes hitches. *Risk:* permanent per-fragment loop cost, so cap it at one per lane plus one per
   socket side and drop `LaneLight`'s duplicate if the socket covers it.
4. **Agent B:** board wash injection in `surfaceMaterial` (4g), with shared uniforms fed from `boardLighting`
   (tube blobs, per-player dimming, drain red wash, restore warm swell). *Gain:* high — health becomes a
   board-lighting state. *Perf:* low (4 exp per fragment). *Risk:* chunk-name coupling (`opaque_fragment`),
   cache key bump required.
5. **Agent B:** `BoardGradeShader` pass before `OutputPass` (vignette, teal/magenta split, radial CA, grain,
   per-side pulse wash). *Gain:* med-high (cohesive, cinematic). *Perf:* low (one fullscreen pass, 3
   taps). *Risk:* over-grading. Keep defaults subtle and add a debug toggle.
6. **Agent A:** health-driven rect light (intensity by `centerHealth`, flicker shared with the shader, wider
   3.6×0.9 footprint, drain/restore env boost) (4g). *Gain:* med. *Perf:* low. *Risk:* rect light only hits
   Standard/Physical, so pair it with item 4 for the floor-art read.
7. **Agent A:** energy shader upgrade: flowing bands with direction by pulse kind, scanlines, core spine,
   hot meniscus (4b). *Gain:* med-high. *Perf:* low. *Risk:* none.
8. **Agent C (new LaneRewardGlow.tsx):** emissive-map panel, 7 HDR orbs, perimeter sweep and a pooled point
   light driven by `award` + `pulseEnvelope` (section 5). *Gain:* high (a clear payout moment). *Perf:*
   low-med. *Risk:* stacking with `LaneLight`/`PulseField` on the same lane. Suppress `PulseField` while `awarding`
   (already done) and keep `LaneLight` below threshold.
9. **Agent B:** per-state bloom in `BoardFinish` (drain/restore/award strength envelopes, red/warm
   `bloomTintColors` on the outer mips). *Gain:* med. *Perf:* none. *Risk:* remember to reset tints.
10. **Agent A:** LED rack plane on each plinth, health bar plus blink, red under 25% (4c). *Gain:* med (a
    readable health cue). *Perf:* low. *Risk:* none.
11. **Agent A:** low-health damage flicker plus brown-out, CPU-driven so light and shader stay in sync (4d),
    off under reduced motion. *Gain:* med. *Perf:* low. *Risk:* photosensitivity. Keep flicker ≤ 3 Hz
    effective and amplitude ≤ 75%.
12. **Agent A:** drain spark bursts, instanced velocity-stretched quads, HDR (4f). *Gain:* med. *Perf:*
    low-med (one draw per tube pool). *Risk:* the ortho point-size gotcha, so avoid `Points`.
13. **Agent B:** contrast pass on the rig: ambient 0.18→0.08, hemisphere 0.65→0.35, and compensate with key
    light plus Lightformer intensities. Flat-top materials go to metalness 0.35–0.6 (section 2). *Gain:* med
    (deeper blacks, so neon pops). *Perf:* none. *Risk:* the board may read too dark; tune together with item 1.
14. **Agent B:** fake glossy drifting band on lane strips (section 2 snippet), fed the nearest neon tint.
    *Gain:* low-med. *Perf:* low. *Risk:* none.
15. **Agent A:** heat shimmer haze plane (4e). Either drop glass `transmission` to 0 (saves a scene pass) or
    use it deliberately with an animated normal map. *Gain:* low-med. *Perf:* saves or costs one pass.
    *Risk:* the glass looks flatter without transmission.
16. **Agent B (optional stretch):** a single low-res three `Reflector` (not drei `MeshReflectorMaterial`) whose
    reflection camera renders only a `NEON_LAYER`, blended at 10–25% under the lanes. *Gain:* med. *Perf:* med
    (one extra filtered scene render). *Risk:* layer bookkeeping, and the blend shader is custom.

Coordination: Agents A and C only **read** `boardLighting.ts`. If a shared uniform block is needed (item 4),
Agent B owns it and exports it from `boardMaterials.ts`. All `useFrame` consumers should use `lightingNow()` as the
clock so the tube, board wash, grade and reward glow stay phase-locked.
