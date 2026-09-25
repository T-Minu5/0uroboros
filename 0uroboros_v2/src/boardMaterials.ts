import * as THREE from 'three';

/** World projection keeps brushed scale consistent across the joined Blender parts. */
export function surfaceMaterial(material: THREE.MeshStandardMaterial, texture: THREE.Texture, scale = .7, relief = .018) {
 texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
 texture.anisotropy = 4;
 material.onBeforeCompile = shader => {
  shader.uniforms.boardSurface = {value:texture};
  shader.uniforms.boardSurfaceScale = {value:scale};
  shader.uniforms.boardSurfaceRelief = {value:relief};
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
    normal = normalize(abs(determinant)*normal - gradient*boardSurfaceRelief);`);
 };
 material.customProgramCacheKey = () => 'ouroboros-world-surface-v2';
 return material;
}

export function boardMaterial(original: THREE.Material, surface: THREE.Texture) {
 if (!(original instanceof THREE.MeshStandardMaterial)) return original.clone();
 const name = original.name;
 let material:THREE.MeshStandardMaterial;
 if (/graphite|gunmetal|wine-black/.test(name)) {
  material = new THREE.MeshPhysicalMaterial({color:original.color, metalness:.76, roughness:.38, clearcoat:.22, clearcoatRoughness:.3});
  if(name.includes('graphite')) { material.color.set('#202939'); material.roughness=.33; material.metalness=.82; }
  if(name.includes('gunmetal')) { material.color.set('#596477'); material.roughness=.25; material.metalness=.88; }
  if(name.includes('wine-black')) { material.color.set('#100c20'); material.roughness=.22; material.metalness=.42; (material as THREE.MeshPhysicalMaterial).clearcoat=.3; }
  surfaceMaterial(material,surface,name.includes('wine-black')?.9:1.1,name.includes('wine-black')?.008:.021);
 } else {
  material=original.clone();
  if(name.includes('obsidian')) { material.color.set('#090d16'); material.roughness=.74; material.metalness=.14; surfaceMaterial(material,surface,1.6,.016); }
  if(name.includes('violet')) {material.color.set('#271a38'); material.roughness=.28;}
  if(name.includes('magenta')) {material.color.set('#591032'); material.emissive.set('#ff0ba1'); material.emissiveIntensity=2.25;}
  if(name.includes('cyan')) {material.color.set('#073345'); material.emissive.set('#0aa9c7'); material.emissiveIntensity=.35;}
  if(name.includes('red')) {material.color.set('#39111a'); material.emissive.set('#fa0048'); material.emissiveIntensity=.65;}
 }
 material.name=name;
 material.envMapIntensity=name.includes('wine-black')?.24:name.includes('obsidian')?.4:.85;
 return material;
}

/** The local deployment half gets more physical depth; peripheral docks stay fixed. */
export function boardDepth(z:number){return z<=1?z:z+Math.min(.65,(z-1)*.2);}
export function isBoardDepth(x:number,z:number){return Math.abs(x)<=8.5&&z>1&&z<=5.6;}
