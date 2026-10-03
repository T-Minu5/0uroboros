import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HorizontalBlurShader, VerticalBlurShader } from 'three-stdlib';

/** Re-captures after mount catch geometry that streams in late; afterwards a slow refresh keeps up with layout changes. */
const CAPTURE_AT_S = [0, .4, 1.2, 3];
const REFRESH_S = 4;

type Props = { y: number; size: number; far: number; blur: number; opacity: number; color: string; resolution?: number };

/**
 * A soft shadow under the board, captured top-down from just above the floor. Floor-level stage meshes (userData.skipScanDepth)
 * are left out of the capture, and opacity is a material setting only, so dragging its slider never re-captures.
 */
export function BoardContactShadow({ y, size, far, blur, opacity, color, resolution = 1024 }: Props) {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const plane = useRef<THREE.Mesh>(null);

  const rig = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(resolution, resolution);
    const scratch = new THREE.WebGLRenderTarget(resolution, resolution);
    target.texture.generateMipmaps = scratch.texture.generateMipmaps = false;
    const camera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
    camera.position.set(0, y, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, y + 1, 0);
    camera.updateMatrixWorld();
    const depth = new THREE.MeshDepthMaterial({ depthTest: false, depthWrite: false });
    const tint = { value: new THREE.Color(color) };
    depth.onBeforeCompile = shader => {
      shader.uniforms.ucolor = tint;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {')
        .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( ucolor * fragCoordZ * 2.0, 1.0 - fragCoordZ );');
    };
    const horizontal = new THREE.ShaderMaterial(HorizontalBlurShader);
    const vertical = new THREE.ShaderMaterial(VerticalBlurShader);
    horizontal.depthTest = vertical.depthTest = false;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), horizontal);
    quad.frustumCulled = false;
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { target, scratch, camera, depth, tint, horizontal, vertical, quad, quadCamera };
  }, [resolution, size, far, y, color]);
  useEffect(() => () => {
    rig.target.dispose(); rig.scratch.dispose(); rig.depth.dispose();
    rig.horizontal.dispose(); rig.vertical.dispose(); rig.quad.geometry.dispose();
  }, [rig]);

  const schedule = useRef({ start: -1, step: 0 });
  useEffect(() => { schedule.current = { start: -1, step: 0 }; }, [rig]);

  const blurPass = (step: number) => {
    const { target, scratch, horizontal, vertical, quad, quadCamera } = rig;
    quad.material = horizontal;
    horizontal.uniforms.tDiffuse.value = target.texture;
    horizontal.uniforms.h.value = step;
    gl.setRenderTarget(scratch);
    gl.render(quad, quadCamera);
    quad.material = vertical;
    vertical.uniforms.tDiffuse.value = scratch.texture;
    vertical.uniforms.v.value = step;
    gl.setRenderTarget(target);
    gl.render(quad, quadCamera);
  };

  const capture = () => {
    const hidden: THREE.Object3D[] = [];
    scene.traverseVisible(o => { if (o.userData?.skipScanDepth && o.visible) hidden.push(o); });
    hidden.forEach(o => { o.visible = false; });
    const background = scene.background, override = scene.overrideMaterial, previous = gl.getRenderTarget();
    scene.background = null;
    scene.overrideMaterial = rig.depth;
    gl.setRenderTarget(rig.target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, rig.camera);
    scene.overrideMaterial = override;
    scene.background = background;
    hidden.forEach(o => { o.visible = true; });
    // The 9-tap blur skips texels at wide steps, which leaves stair-stepped edges; halving the step each pass fills them in.
    for (let step = blur / 256; step * resolution >= .75; step /= 2) blurPass(step);
    gl.setRenderTarget(previous);
  };

  useFrame(({ clock }) => {
    const now = clock.elapsedTime, s = schedule.current;
    if (s.start < 0) s.start = now;
    const due = s.step < CAPTURE_AT_S.length ? CAPTURE_AT_S[s.step] : CAPTURE_AT_S[CAPTURE_AT_S.length - 1] + (s.step - CAPTURE_AT_S.length + 1) * REFRESH_S;
    if (now - s.start < due) return;
    s.step++;
    const clear = new THREE.Color();
    gl.getClearColor(clear);
    const alpha = gl.getClearAlpha();
    capture();
    gl.setClearColor(clear, alpha);
  });

  return (
    // Seen from below, the capture is mirrored in x.
    <mesh ref={plane} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} scale={[-1, 1, 1]} userData={{ skipScanDepth: true }}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={rig.target.texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
