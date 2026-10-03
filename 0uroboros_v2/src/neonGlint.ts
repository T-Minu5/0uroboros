import * as THREE from 'three';

/**
 * The band of light sweeping the Neon table's white glass frame, shared by every glass material.
 * uGlint: a point on the band (world x/z) and the band's unit normal (x/z).
 * uGlintB: level 0..1, sparkle clock.
 */
export const glintUniforms = {
  uGlint: { value: new THREE.Vector4(0, 0, 1, 0) },
  uGlintB: { value: new THREE.Vector2(0, 0) },
};

/** Each diamond glint's size, and how long it takes to fade in and out, relative to the original look. */
const SPARKLE_SIZE = 1.1, SPARKLE_FADE = 1.1;

export const glintGlsl = /* glsl */`
uniform vec4 uGlint;
uniform vec2 uGlintB;

float glintAcross(vec2 p) { return dot(p - uGlint.xy, uGlint.zw); }

// A soft gradient of shine with a brighter crest; catchLight lets scratches and specks flare as it passes.
vec3 glassGlint(vec2 p, float catchLight) {
  if (uGlintB.x <= 0.0) return vec3(0.0);
  float s = glintAcross(p);
  vec3 prism = .5 + .5 * cos(6.2831 * (s * .3 + vec3(0.0, .33, .67)));
  vec3 tint = mix(vec3(.86, .95, 1.0), prism, .22);
  return tint * (exp(-s * s / 2.6) * .12 + exp(-s * s / .06) * .28) * (1.0 + catchLight * 6.0) * uGlintB.x;
}

// Diamond glints strung along the frame's bevelled edges, firing where the band crosses them. depth is the distance
// in from the nearest edge, crest the depth of the bevel's highlight line the glints sit on.
vec3 edgeSparkles(vec2 p, float depth, float crest) {
  vec2 dDepth = vec2(dFdx(depth), dFdy(depth));
  mat2 J = mat2(dFdx(p), dFdy(p));
  if (uGlintB.x <= 0.0) return vec3(0.0);
  float s = glintAcross(p);
  float near = exp(-s * s / .5);
  if (near < .01 || depth > .2 || abs(determinant(J)) < 1e-12) return vec3(0.0);
  vec2 g = inverse(transpose(J)) * dDepth;
  if (dot(g, g) < 1e-6) return vec3(0.0);
  g = normalize(g);
  float along = dot(p, vec2(-g.y, g.x)) * 3.5;
  float cell = floor(along);
  float h = hash(vec2(cell, 5.0));
  if (h < .45) return vec3(0.0);
  float da = (fract(along) - (.25 + .5 * hash(vec2(cell, 9.0)))) / 3.5, dc = depth - crest;
  float phase = uGlintB.y * (5.0 + h * 9.0) / ${SPARKLE_FADE.toFixed(2)} + h * 60.0;
  float twinkle = pow(max(0.0, sin(phase)), 4.0);
  // Each glint turns as it fades in and out.
  float spin = phase * .35, cs = cos(spin), sn = sin(spin);
  vec2 r = vec2(cs * da - sn * dc, sn * da + cs * dc) / ${SPARKLE_SIZE.toFixed(2)}, a = abs(r);
  vec2 b = abs(vec2(r.x + r.y, r.x - r.y)) * .7071;
  float star = exp(-length(r) / .02)
    + (exp(-a.y / .008) * exp(-a.x / .11) + exp(-a.x / .008) * exp(-a.y / .09)) * .9
    + (exp(-b.y / .006) * exp(-b.x / .045) + exp(-b.x / .006) * exp(-b.y / .045)) * .4;
  return vec3(.95, .98, 1.0) * star * twinkle * near * 4.2 * uGlintB.x;
}`;
