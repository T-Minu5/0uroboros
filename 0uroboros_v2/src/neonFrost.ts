import * as THREE from 'three';

const WIDTH = 256;
const HEIGHT = 144;
const VIDEO_INTERVAL = 1 / 24;

const vertex = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Five bilinear samples approximate a wide nine-weight Gaussian. The first pass
// filters the source horizontally while downsampling; the second filters vertically.
const fragment = /* glsl */`
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uStep;
void main() {
  vec3 color = texture2D(tInput, vUv).rgb * .227027;
  color += (texture2D(tInput, vUv + uStep * 1.384615).rgb
          + texture2D(tInput, vUv - uStep * 1.384615).rgb) * .316216;
  color += (texture2D(tInput, vUv + uStep * 3.230769).rgb
          + texture2D(tInput, vUv - uStep * 3.230769).rgb) * .070270;
  gl_FragColor = vec4(color, 1.0);
}`;

type FrostResource = {
  refs: number;
  renderer: THREE.WebGLRenderer;
  horizontal: THREE.WebGLRenderTarget;
  vertical: THREE.WebGLRenderTarget;
  material: THREE.ShaderMaterial;
  geometry: THREE.PlaneGeometry;
  passScene: THREE.Scene;
  passCamera: THREE.OrthographicCamera;
  source: THREE.Texture | null;
  version: number;
  updatedAt: number;
};

const resources = new WeakMap<THREE.Scene, FrostResource>();
const viewport = new THREE.Vector4();
const scissor = new THREE.Vector4();

function target() {
  const result = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  result.texture.generateMipmaps = false;
  return result;
}

export function acquireNeonFrost(scene: THREE.Scene, renderer: THREE.WebGLRenderer): FrostResource {
  let resource = resources.get(scene);
  if (!resource) {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { tInput: { value: null }, uStep: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const passScene = new THREE.Scene();
    const quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
    passScene.add(quad);
    const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    passCamera.position.z = 1;
    resource = {
      refs: 0, renderer, horizontal: target(), vertical: target(),
      material, geometry, passScene, passCamera,
      source: null, version: -1, updatedAt: -Infinity,
    };
    resources.set(scene, resource);
  }
  resource.refs++;
  return resource;
}

export function releaseNeonFrost(scene: THREE.Scene, resource: FrostResource) {
  if (--resource.refs > 0) return;
  resource.horizontal.dispose();
  resource.vertical.dispose();
  resource.material.dispose();
  resource.geometry.dispose();
  resources.delete(scene);
}

/** Returns the shared blurred source texture, or null when no floor art exists. */
export function neonFrostTexture(resource: FrostResource, source: THREE.Texture | null, now: number): THREE.Texture | null {
  if (!source) {
    resource.source = null;
    resource.version = -1;
    return null;
  }
  const changed = source !== resource.source;
  const dynamic = source instanceof THREE.CanvasTexture || source instanceof THREE.VideoTexture;
  const versionChanged = source.version !== resource.version;
  if (!changed && (!versionChanged || (dynamic && now - resource.updatedAt < VIDEO_INTERVAL))) {
    return resource.vertical.texture;
  }

  const gl = resource.renderer;
  const previousTarget = gl.getRenderTarget();
  const previousViewport = gl.getViewport(viewport).clone();
  const previousScissor = gl.getScissor(scissor).clone();
  const previousScissorTest = gl.getScissorTest();
  try {
    resource.material.uniforms.tInput.value = source;
    resource.material.uniforms.uStep.value.set(3 / WIDTH, 0);
    resource.material.uniformsNeedUpdate = true;
    gl.setRenderTarget(resource.horizontal);
    gl.setScissorTest(false);
    gl.render(resource.passScene, resource.passCamera);

    resource.material.uniforms.tInput.value = resource.horizontal.texture;
    resource.material.uniforms.uStep.value.set(0, 3 / HEIGHT);
    resource.material.uniformsNeedUpdate = true;
    gl.setRenderTarget(resource.vertical);
    gl.render(resource.passScene, resource.passCamera);
    resource.source = source;
    resource.version = source.version;
    resource.updatedAt = now;
  } finally {
    gl.setRenderTarget(previousTarget);
    gl.setViewport(previousViewport);
    gl.setScissor(previousScissor);
    gl.setScissorTest(previousScissorTest);
  }
  return resource.vertical.texture;
}
