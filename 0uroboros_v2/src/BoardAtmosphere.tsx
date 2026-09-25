import { useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { surfaceMaterial, boardDepth } from './boardMaterials';

const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

export function BoardStage(){
 const surface=useTexture('/assets/materials/resin-surface.png');
 const material=useMemo(()=>surfaceMaterial(new THREE.MeshStandardMaterial({color:'#111722',metalness:.12,roughness:.9}),surface,.22,.035),[surface]);
 useEffect(()=>()=>material.dispose(),[material]);
 return <group>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.96,0]} material={material}><planeGeometry args={[110,110]}/></mesh>
  <ContactShadows position={[0,-.95,0]} opacity={.72} scale={26} blur={2.5} far={2.8} resolution={512} frames={1} color='#02040a'/>
  {/* Ground spill belongs to the physical rail; it stays clear of the card wells. */}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.942,.1]}>
   <planeGeometry args={[25,18]}/>
   <shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} vertexShader={vertex} fragmentShader={`varying vec2 vUv;void main(){vec2 p=(vUv-.5)*vec2(25.,18.);float side=exp(-pow(abs(abs(p.x)-8.)*1.15,2.))*exp(-pow(abs(p.y)/4.7,6.));float front=exp(-pow(abs(p.y-4.8)*.74,2.))*exp(-pow(abs(p.x)/7.5,6.));vec3 color=mix(vec3(.20,.012,.085),vec3(.012,.14,.18),smoothstep(-3.,3.,p.x));gl_FragColor=vec4(color,side*.25+front*.24);}`}/>
  </mesh>
 </group>;
}

export function FieldEngravings(){
 const map=useTexture('/assets/materials/field-engraving.png');
 map.anisotropy=8;
 return <>{[-5.6,-2.8,0,2.8,5.6].flatMap(x=>[-1,1].map(side=><mesh key={`${x}-${side}`} position={[x,.222,side===1?boardDepth(2.4):-2.4]} rotation={[-Math.PI/2,0,side===1?0:Math.PI]}>
  <planeGeometry args={[2.29,side===1?3.3:2.79]}/><meshBasicMaterial map={map} transparent opacity={.58} depthWrite={false} color='#dbc6da' toneMapped={false}/>
 </mesh>))}</>;
}

/** Linear HDR bloom is thresholded before the single output tone-map step. */
export function BoardFinish(){
 const {gl,scene,camera,size}=useThree();
 const pipeline=useMemo(()=>{
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
  const composer=new EffectComposer(gl,target);
  const render=new RenderPass(scene,camera);
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.26,.4,.72);
  const output=new OutputPass();
  composer.addPass(render);composer.addPass(bloom);composer.addPass(output);
  return {composer,render,bloom,output};
 },[gl,scene,camera]);
 useEffect(()=>{pipeline.composer.setPixelRatio(Math.min(gl.getPixelRatio(),1.5));pipeline.composer.setSize(size.width,size.height);},[gl,pipeline,size]);
 useEffect(()=>()=>{pipeline.render.dispose();pipeline.bloom.dispose();pipeline.output.dispose();pipeline.composer.dispose();},[pipeline]);
 useFrame((_,delta)=>pipeline.composer.render(delta),1);
 return null;
}

/** Fine angular rails and etched ritual geometry occupy the chassis margins. */
export function CircuitArchitecture(){
 const geometry=useMemo(()=>{
  const points:number[]=[];
  const segment=(a:number[],b:number[])=>points.push(...a,...b);
  const path=(vertices:number[][],closed=false)=>{vertices.slice(1).forEach((v,i)=>segment(vertices[i],v));if(closed)segment(vertices.at(-1)!,vertices[0]);};
  [-1,1].forEach(side=>{
   const far=side<0?-5.55:5.98;
   path([[-7.8,.19,side*3.8],[-7.8,.19,far-side*.7],[-7.1,.19,far],[7.1,.19,far],[7.8,.19,far-side*.7],[7.8,.19,side*3.8]]);
   [-7.15,7.15].forEach(x=>{
    const z=side<0?-2.65:boardDepth(2.65);
    [0.48,.68].forEach(radius=>{const ring=Array.from({length:33},(_,i)=>[x+Math.cos(i*Math.PI/16)*radius,.25,z+Math.sin(i*Math.PI/16)*radius]);path(ring);});
    path([[x,.25,z-.86],[x+.72,.25,z],[x,.25,z+.86],[x-.72,.25,z]],true);
    path([[x,.25,z-.56],[x+.48,.25,z+.28],[x-.48,.25,z+.28]],true);
   });
  });
  [-4.2,-1.4,1.4,4.2].forEach(x=>{[-1,1].forEach(side=>{const end=side<0?-3.9:4.6;path([[x-.10,.28,side*1.45],[x-.10,.28,end-side*.22],[x,.28,end],[x+.10,.28,end-side*.22],[x+.10,.28,side*1.45]]);});});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));return g;
 },[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <lineSegments geometry={geometry}><lineBasicMaterial color='#fc3c9d' transparent opacity={.63} toneMapped={false}/></lineSegments>;
}
