export const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  // y runs down the image, matching the unflipped texture upload.
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * Relief mapping through a depth field (0 = at the card's window, 1 = farthest).
 * For a screen point, the ray samples the texture at base - shift * (t - focus) for layer t,
 * and the first layer whose surface is at or in front of the ray is what the eye sees.
 * Content at the focus depth stays put, deeper content slides with the eye, nearer content
 * slides against it, and nearer surfaces hide what is behind them.
 */
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uCrop;
uniform vec2 uShift;
uniform float uFocus;
uniform int uSteps;
out vec4 outColor;

float depthAt(vec2 uv) { return textureLod(uDepth, clamp(uv, 0.0, 1.0), 0.0).r; }

void main() {
  vec2 base = 0.5 + (vUv - 0.5) * uCrop;
  vec2 gx = dFdx(base), gy = dFdy(base);
  float stepSize = 1.0 / float(uSteps);
  float t = 0.0, prevT = 0.0;
  float h = depthAt(base + uShift * uFocus);
  for (int i = 0; i < 128; i++) {
    if (i >= uSteps || h <= t) break;
    prevT = t;
    t += stepSize;
    h = depthAt(base - uShift * (t - uFocus));
  }
  float a = prevT, b = min(t, 1.0);
  for (int j = 0; j < 6; j++) {
    float m = 0.5 * (a + b);
    if (depthAt(base - uShift * (m - uFocus)) <= m) b = m; else a = m;
  }
  vec2 uv = clamp(base - uShift * (b - uFocus), 0.0, 1.0);
  outColor = vec4(textureGrad(uColor, uv, gx, gy).rgb, 1.0);
}`;
