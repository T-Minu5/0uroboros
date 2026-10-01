import * as THREE from 'three';

/** Linear luminance weights used by the bloom high-pass; emissive multiplier ≈ targetL / luminance(colour). */
const LUMA = new THREE.Vector3(.2126, .7152, .0722);
export function neonIntensity(color: THREE.ColorRepresentation, targetL = 1.35) {
 const c = new THREE.Color(color);
 return targetL / Math.max(.05, c.r * LUMA.x + c.g * LUMA.y + c.b * LUMA.z);
}

/**
 * Shared board-wash uniforms (one object for every board surface material), fed each frame by `BoardLightRig`.
 * Tube order follows `serverIndex(owner, target)`: owner*2 + (primary ? 1 : 0).
 * `uBoardSideDim` = (near/owner 0, far/owner 1); `uBoardSideWash` = rgb·a pulse wash on the `uBoardWashSide` half (+1 near, -1 far).
 */
export const boardWashUniforms = {
 uBoardTubePos: {value: [new THREE.Vector3(-4.6, .43, 5.4), new THREE.Vector3(4.6, .43, 5.4), new THREE.Vector3(-4.6, .43, -4.75), new THREE.Vector3(4.6, .43, -4.75)]},
 uBoardTubeCol: {value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]},
 uBoardSideDim: {value: new THREE.Vector2(1, 1)},
 uBoardSideWash: {value: new THREE.Vector4(0, 0, 0, 0)},
 uBoardWashSide: {value: 1},
};

/** Damped per-side integrity (x = near/owner 0, y = far/owner 1), written once per frame by `BoardLightRig`; read in useFrame. */
export const boardSideHealth = new THREE.Vector2(1, 1);
/** Side lights dim and cool toward this as a player's servers fail. */
export const DAMAGED_LIGHT = new THREE.Color('#40587e');
/** Brightness of the perimeter neon: the field trim, the side rails and their spill lights. */
export const PERIMETER_DIM = .85;
/** Intensity scale for a side's rim/fill/rail lights at the given health. */
export const sideLightScale = (health: number) => .22 + .78 * health;

/** World projection keeps brushed scale consistent across the joined Blender parts. */
export function surfaceMaterial(material: THREE.MeshStandardMaterial, texture: THREE.Texture, scale = .7, relief = .018) {
 texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
 texture.anisotropy = 4;
 material.onBeforeCompile = shader => {
  shader.uniforms.boardSurface = {value:texture};
  shader.uniforms.boardSurfaceScale = {value:scale};
  shader.uniforms.boardSurfaceRelief = {value:relief};
  Object.assign(shader.uniforms, boardWashUniforms);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
   varying vec3 vBoardPosition;
   varying vec3 vBoardNormal;`)
   .replace('#include <begin_vertex>', `#include <begin_vertex>
    vBoardPosition = (modelMatrix * vec4(position, 1.)).xyz;
    vBoardNormal = normalize(mat3(modelMatrix) * normal);`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
   varying vec3 vBoardPosition;
   varying vec3 vBoardNormal;
   uniform sampler2D boardSurface;
   uniform float boardSurfaceScale;
   uniform float boardSurfaceRelief;
   uniform vec3 uBoardTubePos[4];
   uniform vec3 uBoardTubeCol[4];
   uniform vec2 uBoardSideDim;
   uniform vec4 uBoardSideWash;
   uniform float uBoardWashSide;
   vec3 sampleBoardSurface(){
    vec3 p = vBoardPosition * boardSurfaceScale;
    vec3 w = pow(abs(vBoardNormal), vec3(8.));
    w /= max(dot(w, vec3(1.)), .0001);
    return texture2D(boardSurface, p.zy).rgb*w.x + texture2D(boardSurface, p.xz).rgb*w.y + texture2D(boardSurface, p.xy).rgb*w.z;
   }`)
   .replace('#include <color_fragment>', `#include <color_fragment>
    vec3 boardSample = sampleBoardSurface();
    diffuseColor.rgb *= .84 + boardSample.r * .22;`)
   .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    roughnessFactor = clamp(roughnessFactor * (.64 + boardSample.g * .55), .16, 1.);`)
   .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float determinant = dot(sx, r1);
    vec3 gradient = sign(determinant) * (dFdx(boardSample.b)*r1 + dFdy(boardSample.b)*r2);
    normal = normalize(abs(determinant)*normal - gradient*boardSurfaceRelief);`)
   .replace('#include <opaque_fragment>', `
    vec3 boardWash = vec3(0.);
    for (int i = 0; i < 4; i++) {
     vec2 d = (vBoardPosition.xz - uBoardTubePos[i].xz) * vec2(.53, .905);
     boardWash += uBoardTubeCol[i] * exp(-dot(d, d));
    }
    float boardNear = smoothstep(-1.5, 1.5, vBoardPosition.z);
    float boardFacing = .35 + .65 * max(vBoardNormal.y, 0.);
    outgoingLight *= mix(uBoardSideDim.y, uBoardSideDim.x, boardNear);
    float boardWashMask = uBoardWashSide > 0. ? boardNear : 1. - boardNear;
    outgoingLight += (boardWash + uBoardSideWash.rgb * uBoardSideWash.a * boardWashMask) * (diffuseColor.rgb + .04) * boardFacing;
    #include <opaque_fragment>`);
 };
 material.customProgramCacheKey = () => 'ouroboros-world-surface-v5';
 return material;
}

export function boardMaterial(original: THREE.Material, surface: THREE.Texture) {
 if (!(original instanceof THREE.MeshStandardMaterial)) return original.clone();
 const name = original.name;
 let material:THREE.MeshStandardMaterial;
 if (/graphite|gunmetal|wine-black/.test(name)) {
  material = new THREE.MeshPhysicalMaterial({color:original.color, metalness:.76, roughness:.38, clearcoat:.22, clearcoatRoughness:.3});
  if(name.includes('graphite')) { material.color.set('#202939'); material.roughness=.32; material.metalness=.8; }
  if(name.includes('gunmetal')) { material.color.set('#596477'); material.roughness=.22; material.metalness=.9; }
  // Flat field top: under ortho a flat plane samples one env texel, so keep it mid-metal / mid-rough and let rect lights + wash carry it.
  if(name.includes('wine-black')) { material.color.set('#100c20'); material.roughness=.34; material.metalness=.48; (material as THREE.MeshPhysicalMaterial).clearcoat=.18; }
  surfaceMaterial(material,surface,name.includes('wine-black')?.9:1.1,name.includes('wine-black')?.014:.025);
 } else {
  material=original.clone();
  if(name.includes('obsidian')) { material.color.set('#090d16'); material.roughness=.74; material.metalness=.14; surfaceMaterial(material,surface,1.6,.016); }
  if(name.includes('violet')) {material.color.set('#271a38'); material.roughness=.28;}
  if(name.includes('magenta')) {material.color.set('#3a1a5c'); material.emissive.set('#b24cff'); material.emissiveIntensity=neonIntensity('#b24cff',1.0)*PERIMETER_DIM;}
  if(name.includes('cyan') && !name.includes('Server')) {material.color.set('#4a2a0c'); material.emissive.set('#ff8a1f'); material.emissiveIntensity=neonIntensity('#ff8a1f',1.2)*PERIMETER_DIM;}
  if(name.includes('cyan') && name.includes('Server')) {material.color.set('#073345'); material.emissive.set('#0aa9c7'); material.emissiveIntensity=.35;}
  if(name.includes('red')) {material.color.set('#39111a'); material.emissive.set('#fa0048'); material.emissiveIntensity=.65;}
 }
 material.name=name;
 material.envMapIntensity=name.includes('wine-black')?.32:name.includes('obsidian')?.4:.85;
 return material;
}

/** Card-language gold (VP gradient, Figma 691:8079): lit rim into deep amber over a dark base. */
export const GOLD_GRADIENT = {rim: '#ffcc12', deep: '#94581c', base: '#44290f'} as const;

/** Emissive inlay whose gradient sweeps from world `x0` to `x1`. */
export function inlayMaterial(x0: number, x1: number, gradient: {rim: string; deep: string; base: string} = GOLD_GRADIENT) {
 const gain = neonIntensity(gradient.rim, 1.15);
 const material = new THREE.MeshStandardMaterial({color: gradient.base, metalness: .42, roughness: .28, toneMapped: false});
 material.emissive.set(gradient.rim);
 material.emissiveIntensity = gain;
 material.onBeforeCompile = shader => {
  shader.uniforms.uInlaySpan = {value: new THREE.Vector2(x0, x1)};
  shader.uniforms.uInlayRim = {value: new THREE.Color(gradient.rim)};
  shader.uniforms.uInlayDeep = {value: new THREE.Color(gradient.deep)};
  shader.uniforms.uInlayGain = {value: gain};
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
   uniform vec2 uInlaySpan;
   varying float vInlaySweep;`)
   .replace('#include <begin_vertex>', `#include <begin_vertex>
    vInlaySweep = smoothstep(uInlaySpan.x, uInlaySpan.y, (modelMatrix * vec4(position, 1.)).x);`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
   uniform vec3 uInlayRim;
   uniform vec3 uInlayDeep;
   uniform float uInlayGain;
   varying float vInlaySweep;`)
   .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    vec3 inlaySweep = mix(uInlayRim, uInlayDeep, vInlaySweep);
    totalEmissiveRadiance = inlaySweep * uInlayGain;
    diffuseColor.rgb = mix(diffuseColor.rgb, inlaySweep, .3);`);
 };
 material.customProgramCacheKey = () => 'ouroboros-inlay-v2';
 return material;
}

/** The local deployment half gets more physical depth; peripheral docks stay fixed. */
export function boardDepth(z:number){return z<=1?z:z+Math.min(.65,(z-1)*.2);}
export function isBoardDepth(x:number,z:number){return Math.abs(x)<=8.5&&z>1&&z<=5.6;}
