import { SERVER_X } from './boardLayout';

/**
 * The look of the Aqua-era Apple glass, laid over each bar of the frame and each wall: a dark band along its top
 * edge, a soft gloss across its upper half, light gathered into a glowing lower rim, and a thin violet neon strip
 * inside the glass along the board's outer edge and up its vertical corners.
 * Widths are world units; gloss positions are fractions of the bar's width from its top edge.
 */
const TOP_BAND = .05, TOP_DARK = .65;
const GLOSS_START = .15, GLOSS_SOFT = .05, GLOSS = .4;
/** Screen gap in pixels between the gloss and the bar's inner edge, and how far before that the gloss starts fading. */
const GLOSS_GAP_PX = 12, GLOSS_TAIL_PX = 26;
const RIM = .022, RIM_GLOW = .09, RIM_BRIGHT = 1.6, RIM_SOFT = .3;
/** Near bar gloss flip: half-width of the switch-over, centred under each near Server readout (which is ~3.5 wide). */
const FLIP_SOFT = .3;
/** Frame past this z (and between the near Servers) is the near bar; the deck's near ledge is at 5.29. */
const NEAR_BAR_Z = 3;
/**
 * The strip: its distance in from the edge, about 2px wide on screen whatever the distance, with a faint halo. `reach`
 * is how far behind a surface (along the view) a corner's vertical line may be and still show through it.
 */
const STRIP = { inset: .025, color: [.66, .5, 1], bright: .88, glow: .035, halo: .16, reach: .15 } as const;

const f = (x: number) => x.toFixed(4);

/**
 * GLSL for `liquidLook(color, world, wall, onWall, accent, amount, lightScale)`. Expects outlineGlsl's sdSegment and
 * uPoly/uPolyCount/uHoleStart declared before it: the frame's outer contour and its hole, or on walls (onWall 1) the
 * table outline, whose corners place the strip; `wall` is the walls' world top and bottom.
 * Call from uniform control flow (the strip takes screen derivatives). `amount` fades the whole look and `lightScale` scales only the light it adds
 * (a translucent pane divides by its opacity).
 */
export function liquidLookGlsl(maxOutline: number) {
  return /* glsl */`
// Distance from p to the outer contour and to the hole.
void liqEdges(vec2 p, out float dOuter, out float dHole) {
  dOuter = 1e6; dHole = 1e6;
  for (int i = 0; i < ${maxOutline}; i++) {
    if (i >= uPolyCount) break;
    bool outer = i < uHoleStart;
    int last = outer ? uHoleStart - 1 : uPolyCount - 1;
    vec2 a = uPoly[i], b = uPoly[i == last ? (outer ? 0 : uHoleStart) : i + 1];
    float d = sdSegment(p, a, b);
    if (outer) dOuter = min(dOuter, d);
    else dHole = min(dHole, d);
  }
}

// Screen-horizontal direction on the table plane at p.
vec2 liqAcross(vec3 p) {
  vec3 view = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(p - cameraPosition);
  vec2 ahead = normalize(view.xz);
  return vec2(-ahead.y, ahead.x);
}

// Distance across the screen, in world units, from p to the vertical strip under the nearest corner of the top strip
// that lies just behind p (1e3 if none). Under the board's camera vertical lines stay vertical on screen, so drawing
// each one where it shows through the wall and the rolled edge in front of it keeps it under the top strip's turn.
float liqVertical(vec3 p) {
  vec2 across = liqAcross(p), ahead = vec2(across.y, -across.x);
  float area = 0.0;
  for (int i = 0; i < ${maxOutline}; i++) {
    if (i >= uHoleStart) break;
    vec2 a = uPoly[i], b = uPoly[i + 1 == uHoleStart ? 0 : i + 1];
    area += a.x * b.y - b.x * a.y;
  }
  float inward = area > 0.0 ? 1.0 : -1.0;
  float d = 1e3;
  for (int i = 0; i < ${maxOutline}; i++) {
    if (i >= uHoleStart) break;
    vec2 a = uPoly[i == 0 ? uHoleStart - 1 : i - 1], v = uPoly[i], b = uPoly[i + 1 == uHoleStart ? 0 : i + 1];
    vec2 e0 = normalize(v - a), e1 = normalize(b - v);
    vec2 n0 = vec2(-e0.y, e0.x) * inward, n1 = vec2(-e1.y, e1.x) * inward;
    vec2 m = normalize(n0 + n1);
    vec2 w = v + m * ${f(STRIP.inset)} / max(dot(m, n1), .35) - p.xz;
    float t = dot(w, ahead);
    if (t >= 0.0 && t <= ${f(STRIP.reach)}) d = min(d, abs(dot(w, across)));
  }
  return d;
}

vec3 liquidLook(vec3 color, vec3 world, vec2 wall, float onWall, vec3 accent, float amount, float lightScale) {
  // Distance to the top edge and to the lower edge. The frame's outer edge is the top, except along the near bar
  // between the near Servers, which takes its inner edge, the one facing up on screen; it switches over under the
  // Server readouts, which hide the seam. The outer edge rolls straight into the wall as one piece, so no dark band
  // marks where they meet; it stays only along the near bar's inner edge.
  float dTop, dLow, seam, edgeOff = 1e3, edgePx = 1e3, vertOff;
  if (onWall > .5) {
    dTop = max(wall.x - world.y, 0.0);
    dLow = max(world.y - wall.y, 0.0);
    seam = 1.0;
    vertOff = liqVertical(world);
  } else {
    float dOuter, dHole;
    liqEdges(world.xz, dOuter, dHole);
    float nearMiddle = (1.0 - smoothstep(${f(SERVER_X - FLIP_SOFT)}, ${f(SERVER_X + FLIP_SOFT)}, abs(world.x))) * step(${f(NEAR_BAR_Z)}, world.z);
    float outerTop = 1.0 - nearMiddle;
    dTop = mix(dHole, dOuter, outerTop);
    dLow = mix(dOuter, dHole, outerTop);
    seam = outerTop;
    // Along the edge, and down the rolled edge in front of each corner where its vertical strip shows through.
    edgeOff = abs(dOuter - ${f(STRIP.inset)});
    edgePx = edgeOff / max(fwidth(dOuter), 1e-5);
    vertOff = dOuter < ${f(STRIP.inset)} ? liqVertical(world) : 1e3;
  }
  // Vertical strips are measured across the screen, so their width comes from the screen's own pixel size there rather
  // than from vertOff, which jumps where a corner passes out of view.
  float vertPx = vertOff / max(abs(dFdx(dot(world.xz, liqAcross(world)))), 1e-5);
  float strip = (1.0 - smoothstep(.6, 1.4, min(edgePx, vertPx))) * ${f(STRIP.bright)} + exp(-min(edgeOff, vertOff) / ${f(STRIP.glow)}) * ${f(STRIP.halo)};
  color += vec3(${STRIP.color.map(f).join(', ')}) * strip * amount * lightScale;
  float across = dTop / max(dTop + dLow, 1e-4);

  float topBand = smoothstep(${f(TOP_BAND)}, ${f(TOP_BAND * .25)}, dTop) * amount * (1.0 - seam);

  float lowPx = dLow / max(fwidth(dLow), 1e-5);
  float band = smoothstep(${f(GLOSS_START)}, ${f(GLOSS_START + GLOSS_SOFT)}, across) * smoothstep(${f(GLOSS_GAP_PX)}, ${f(GLOSS_GAP_PX + GLOSS_TAIL_PX)}, lowPx);
  float fade = mix(1.0, .3, clamp((across - ${f(GLOSS_START)}) / ${f(1 - GLOSS_START)}, 0.0, 1.0));
  // No gloss down the walls: squeezed into their short height its soft edges turn into hard bands.
  vec3 gloss = vec3(.9, .95, 1.0) * band * fade * ${f(GLOSS)} * (1.0 - onWall);

  vec3 rimTint = mix(vec3(.9, .96, 1.0), accent, .3);
  vec3 rim = rimTint * (exp(-dLow / ${f(RIM)}) * ${f(RIM_BRIGHT)} + exp(-dLow / ${f(RIM_GLOW)}) * ${f(RIM_SOFT)});

  return color * (1.0 - ${f(TOP_DARK)} * topBand) + (gloss * (1.0 - topBand) + rim) * amount * lightScale;
}`;
}
