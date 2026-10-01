import type { DepthEntry } from './depthManifest';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './parallaxShader';

/**
 * One WebGL2 context renders every card. Each card owns a plain 2D canvas and receives its
 * frame by a blit from the shared context, so cards keep their DOM stacking, clipping and
 * transforms (overlapping hand fans, board anchors, modals, the drag ghost) and the page never
 * runs into the browser's cap on live WebGL contexts.
 *
 * Only a dragged card shows depth; its lean moves the eye.
 */

/** Where the eye sits relative to a card, in -1..1 per axis (screen space, y down). */
export type Eye = { x: number; y: number };

/** Parallax travel for a unit of depth at full eye offset, as a fraction of the card width. */
export const BASE_SHIFT = 0.055;
const MAX_DPR = 2;
const MAX_BACKING = 1400;
/**
 * The eye chases its lean on a damped spring (stiffness 1/s², damping as a ratio of critical), slower and
 * bouncier than the card's own lean, so the scene inside trails the card's turn and settles a beat after it.
 */
const EYE_STIFFNESS = 130;
const EYE_DAMPING = 0.5;

type Textures = { color: WebGLTexture; depth: WebGLTexture; refs: number; loaded: boolean; failed: boolean; waiters: Set<View> };
type View = {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; entry: DepthEntry; key: string;
  intensity: number; verticalGain: number; lean: Eye; eye: Eye; eyeSpeed: Eye; visible: boolean;
  drawnEye: Eye | null; drawnSize: string;
};
export type DepthArtHandle = { setIntensity(value: number): void; setLean(eye: Eye): void; detach(): void };

const clamp1 = (value: number) => Math.max(-1, Math.min(1, value));

/**
 * Advance the eye by `dtMs` toward `target` (F = -k·x - c·v), in short substeps so a slow frame stays stable.
 * Speed is in eye units per second. The eye stays within ±1, which the crop margin covers.
 */
export function stepEye(eye: Eye, speed: Eye, target: Eye, dtMs: number) {
  const k = EYE_STIFFNESS, c = 2 * EYE_DAMPING * Math.sqrt(k);
  let { x, y } = eye, vx = speed.x, vy = speed.y;
  for (let left = Math.min(dtMs, 100); left > 0; left -= 8) {
    const dt = Math.min(left, 8) / 1000;
    vx += (k * (target.x - x) - c * vx) * dt; vy += (k * (target.y - y) - c * vy) * dt;
    x += vx * dt; y += vy * dt;
    if (Math.abs(x) > 1) { x = clamp1(x); vx = 0; }
    if (Math.abs(y) > 1) { y = clamp1(y); vy = 0; }
  }
  return { eye: { x, y }, speed: { x: vx, y: vy } };
}

export function coverCrop(canvasAspect: number, imageAspect: number) {
  return canvasAspect < imageAspect ? { sx: canvasAspect / imageAspect, sy: 1 } : { sx: 1, sy: imageAspect / canvasAspect };
}

/**
 * Crop and per-depth shift, in texture coordinates. `verticalGain` scales the up/down shift
 * against the side-to-side one. The crop zooms in just far enough that the largest shift on
 * either axis (eye at ±1) never exposes the edge of the image.
 */
export function viewUniforms(canvasAspect: number, entry: Pick<DepthEntry, 'width' | 'height' | 'focus'>, intensity: number, eye: Eye, verticalGain = 1) {
  const { sx, sy } = coverCrop(canvasAspect, entry.width / entry.height);
  const margin = BASE_SHIFT * intensity * Math.max(entry.focus, 1 - entry.focus);
  const zoom = Math.min(1, 1 / (sx * (1 + 2 * margin)), 1 / (sy * (1 + 2 * margin * verticalGain * canvasAspect)));
  const shift = BASE_SHIFT * intensity;
  return { crop: [sx * zoom, sy * zoom] as const, shift: [eye.x * shift * sx * zoom, eye.y * shift * verticalGain * canvasAspect * sy * zoom] as const, zoom };
}

class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms: Record<'color' | 'depth' | 'crop' | 'shift' | 'focus' | 'steps', WebGLUniformLocation | null>;
  private views = new Set<View>();
  private byCanvas = new WeakMap<HTMLCanvasElement, View>();
  private textures = new Map<string, Textures>();
  private warmed = new Set<string>();
  private observer: IntersectionObserver | null;
  private frame = 0;
  private last = 0;
  private lost = false;
  private coarse = window.matchMedia('(pointer: coarse)').matches;

  constructor(private canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = this.link();
    const at = (name: string) => gl.getUniformLocation(this.program, name);
    this.uniforms = { color: at('uColor'), depth: at('uDepth'), crop: at('uCrop'), shift: at('uShift'), focus: at('uFocus'), steps: at('uSteps') };
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      for (const item of entries) { const view = this.byCanvas.get(item.target as HTMLCanvasElement); if (view) view.visible = item.isIntersecting; }
      this.schedule();
    });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.lost = true;
      for (const view of this.views) view.canvas.removeAttribute('data-ready');
    });
    const wake = () => this.schedule();
    window.addEventListener('resize', wake, { passive: true });
    window.addEventListener('scroll', wake, { passive: true, capture: true });
  }

  private link(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader failed to compile.');
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader failed to link.');
    return program;
  }

  /** Upload a card's depth ahead of its first drag and keep it resident, so the lifted card has depth on its first frame. */
  warm(entry: DepthEntry) {
    const key = `${entry.color}|${entry.depth}`;
    if (this.warmed.has(key)) return;
    this.warmed.add(key);
    this.acquire(entry);
  }

  private acquire(entry: DepthEntry, view?: View): Textures {
    const key = `${entry.color}|${entry.depth}`;
    let textures = this.textures.get(key);
    if (textures) { textures.refs++; if (!textures.loaded && view) textures.waiters.add(view); return textures; }
    const gl = this.gl;
    textures = { color: gl.createTexture()!, depth: gl.createTexture()!, refs: 1, loaded: false, failed: false, waiters: new Set(view ? [view] : []) };
    this.textures.set(key, textures);
    const current = textures;
    const bitmap = (url: string, raw: boolean) => fetch(url).then(response => { if (!response.ok) throw new Error(url); return response.blob(); })
      .then(blob => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: raw ? 'none' : 'default' }));
    Promise.all([bitmap(entry.color, false), bitmap(entry.depth, true)]).then(([color, depth]) => {
      if (this.lost) return;
      this.upload(current.color, color, true);
      this.upload(current.depth, depth, false);
      color.close(); depth.close();
      current.loaded = true; current.waiters.clear();
      this.schedule();
    }).catch(() => { current.failed = true; });
    return textures;
  }

  private upload(texture: WebGLTexture, image: ImageBitmap, mipmaps: boolean) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, mipmaps ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmaps) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  private release(view: View) {
    const textures = this.textures.get(view.key);
    if (!textures) return;
    textures.waiters.delete(view);
    if (--textures.refs > 0) return;
    this.gl.deleteTexture(textures.color); this.gl.deleteTexture(textures.depth);
    this.textures.delete(view.key);
  }

  attach(canvas: HTMLCanvasElement, entry: DepthEntry, intensity: number, verticalGain = 1): DepthArtHandle {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return { setIntensity() {}, setLean() {}, detach() {} };
    const view: View = { canvas, ctx, entry, key: `${entry.color}|${entry.depth}`, intensity, verticalGain, lean: { x: 0, y: 0 }, eye: { x: 0, y: 0 }, eyeSpeed: { x: 0, y: 0 }, visible: true, drawnEye: null, drawnSize: '' };
    this.acquire(entry, view);
    this.views.add(view); this.byCanvas.set(canvas, view);
    this.observer?.observe(canvas);
    this.schedule();
    return {
      setIntensity: value => { if (value !== view.intensity) { view.intensity = value; view.drawnEye = null; this.schedule(); } },
      setLean: value => { view.lean = value; this.schedule(); },
      detach: () => {
        if (!this.views.delete(view)) return;
        this.observer?.unobserve(canvas); this.byCanvas.delete(canvas); this.release(view);
      },
    };
  }

  schedule() {
    if (!this.frame && !this.lost) this.frame = requestAnimationFrame(now => this.tick(now));
  }

  private tick(now: number) {
    this.frame = 0;
    const dt = this.last ? Math.min(now - this.last, 100) : 16;
    this.last = now;
    let moving = false;
    for (const view of this.views) {
      if (!view.visible || !view.canvas.isConnected) continue;
      const rect = view.canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const target = { x: clamp1(view.lean.x), y: clamp1(view.lean.y) };
      ({ eye: view.eye, speed: view.eyeSpeed } = stepEye(view.eye, view.eyeSpeed, target, dt));
      if (Math.abs(target.x - view.eye.x) + Math.abs(target.y - view.eye.y) + (Math.abs(view.eyeSpeed.x) + Math.abs(view.eyeSpeed.y)) * 0.01 > 0.0008) moving = true;
      this.render(view, rect);
    }
    if (moving) this.schedule();
    else this.last = 0;
  }

  private render(view: View, rect: DOMRect) {
    const textures = this.textures.get(view.key);
    if (!textures?.loaded || this.lost) return;
    const cw = view.canvas.clientWidth, ch = view.canvas.clientHeight;
    if (cw < 1 || ch < 1) return;
    // Board anchors scale cards with a CSS transform, so the drawn size, not the layout size, sets the resolution.
    const scale = Math.min(3, Math.max(0.5, Math.hypot(rect.width, rect.height) / Math.hypot(cw, ch)));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * scale;
    const k = Math.min(dpr, MAX_BACKING / Math.max(cw, ch));
    const w = Math.max(1, Math.round(cw * k)), h = Math.max(1, Math.round(ch * k));
    const size = `${w}x${h}`;
    const eye = view.eye, drawn = view.drawnEye;
    if (size === view.drawnSize && drawn && Math.abs(drawn.x - eye.x) + Math.abs(drawn.y - eye.y) < 0.0004) return;
    if (view.canvas.width !== w || view.canvas.height !== h) { view.canvas.width = w; view.canvas.height = h; }
    if (this.canvas.width < w || this.canvas.height < h) {
      this.canvas.width = Math.max(this.canvas.width, w); this.canvas.height = Math.max(this.canvas.height, h);
    }
    const gl = this.gl;
    const { crop, shift, zoom } = viewUniforms(cw / ch, view.entry, view.intensity, eye, view.verticalGain);
    const travel = BASE_SHIFT * view.intensity * w * Math.max(1, view.verticalGain);
    const steps = Math.round(Math.min(this.coarse ? 32 : 64, Math.max(16, travel * 1.5)));
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, textures.color); gl.uniform1i(this.uniforms.color, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures.depth); gl.uniform1i(this.uniforms.depth, 1);
    gl.uniform2f(this.uniforms.crop, crop[0], crop[1]);
    gl.uniform2f(this.uniforms.shift, shift[0], shift[1]);
    gl.uniform1f(this.uniforms.focus, view.entry.focus);
    gl.uniform1i(this.uniforms.steps, steps);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    view.ctx.drawImage(this.canvas, 0, this.canvas.height - h, w, h, 0, 0, w, h);
    view.drawnEye = { ...eye }; view.drawnSize = size;
    if (!view.canvas.hasAttribute('data-ready')) {
      view.canvas.setAttribute('data-ready', '');
      view.canvas.parentElement?.style.setProperty('--depth-zoom', String(1 / zoom));
    }
  }
}

let shared: Renderer | null | undefined;

/** The shared renderer, or null where depth art should not run (no WebGL2, reduced motion, no DOM). */
export function depthRenderer(): Renderer | null {
  if (shared !== undefined) return shared;
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return (shared = null);
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    shared = gl ? new Renderer(canvas, gl) : null;
  } catch { shared = null; }
  return shared;
}
