/** Width the backdrop art is sampled at to build its depth map; height follows the art's aspect. */
export const BACKDROP_DEPTH_W = 320;
/** Box-blur radii as fractions of the map width: fine form, mid structures, large masses. Two passes each ≈ gaussian. */
const RELIEF_SCALES: readonly (readonly [radius: number, weight: number])[] = [[.006, .25], [.02, .4], [.055, .35]];

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / n;
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / n;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Smooth relief (1 = near) from art luminance: bright forms read as raised, dark gaps as recessed. Multi-scale blur
 * keeps it free of texture noise so a depth band traces whole shapes, then 2nd–98th percentile stretch to 0..1.
 */
export function reliefFromLuminance(lum: Float32Array, w: number, h: number): Float32Array {
  const relief = new Float32Array(lum.length);
  for (const [scale, weight] of RELIEF_SCALES) {
    const r = Math.max(1, Math.round(scale * w));
    const blurred = boxBlur(boxBlur(lum, w, h, r), w, h, r);
    for (let i = 0; i < relief.length; i++) relief[i] += blurred[i] * weight;
  }
  const sorted = Float32Array.from(relief).sort();
  const lo = sorted[Math.floor(sorted.length * .02)], hi = sorted[Math.floor(sorted.length * .98)];
  // Floor on the stretch so near-flat art doesn't amplify leftover texture into false relief.
  const span = Math.max(.15, hi - lo);
  for (let i = 0; i < relief.length; i++) relief[i] = Math.min(1, Math.max(0, (relief[i] - lo) / span));
  return relief;
}

/** Rec. 709 luminance of RGBA bytes, gamma-lifted so dark metal still carries form. */
export function luminanceFromRgba(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i++) {
    const y = (rgba[i * 4] * .2126 + rgba[i * 4 + 1] * .7152 + rgba[i * 4 + 2] * .0722) / 255;
    lum[i] = Math.pow(y, .4545);
  }
  return lum;
}
