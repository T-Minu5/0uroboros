import * as THREE from 'three';
import { NEON_FAR_RAISE } from './boardLayout';

/** X/Z coordinates on the horizontal table plane. */
export type TablePoint = readonly [x: number, z: number];
export type TablePath = readonly TablePoint[];

const mirrorZ = (path: TablePath): TablePath => path.map(([x, z]) => [x, -z] as TablePoint).reverse();
const mirrorX = (path: TablePath): TablePath => path.map(([x, z]) => [-x, z] as TablePoint).reverse();

/** Joins a right half and a left half (the left given as its own mirror image, x >= 0), both listed far to near. */
function halves(right: TablePath, left: TablePath): TablePath {
  return [...right, ...left.filter(([x]) => x > 0).map(([x, z]) => [-x, z] as TablePoint).reverse()];
}

/**
 * Far edge and sides down to the near corner chamfer. The far edge behind the Servers rises with them; past each far
 * Server readout it runs parallel to the deck's edge, widened in depth so it looks as wide on screen as the side rails.
 */
const FAR_AND_SIDE: TablePath = ([
  [0, -6.53], [.3, -6.53], [.45, -6.68], [3.03, -6.68], [3.15, -6.8],
  [5.098, -6.8], [6.591, -5.829], [7.767, -5.829],
  [8.55, -4.87], [8.55, -1.75], [9.35, -1.05], [9.35, -0.32],
  [9.12, 0], [9.35, 0.32], [9.35, 1.05], [8.55, 1.75],
] as TablePath).map(([x, z]) => [x, z < -6.5 ? z - NEON_FAR_RAISE : z] as TablePoint);
/** Slope (dz/dx) of the near diagonals: parallel to the deck's corner chamfer, 45° on screen. */
export const NEAR_SLOPE = 1.296;
const NEAR_BOTTOM = 7.85;
/** The notch cut up into the bottom edge, centred under the local stats panel. */
const STATS_NOTCH = { bottomHalf: .82, topHalf: .68, z: 7.55 } as const;
/** x where the step down from the ledge, passing behind the near Server readout, reaches depth z. */
const stepX = (z: number) => 4.71 - (z - 6.23) / NEAR_SLOPE;
/** Near corner: a chamfer parallel to the deck's, a level ledge, a parallel step down to the bottom edge, then the notch. */
const nearCorner = (ledgeZ: number): TablePath => [
  [8.55, 4.73], [8.55 - (ledgeZ - 4.73) / NEAR_SLOPE, ledgeZ], [stepX(ledgeZ), ledgeZ], [stepX(NEAR_BOTTOM), NEAR_BOTTOM],
  [STATS_NOTCH.bottomHalf, NEAR_BOTTOM], [STATS_NOTCH.topHalf, STATS_NOTCH.z], [0, STATS_NOTCH.z],
];

/**
 * Reliquary silhouette. The far edge recesses between the Servers with a notch under the Stats housing, runs level
 * over each far Server readout, and from beside each readout follows the deck's edge toward the far Effect Bank. Near corners follow the deck's long corner chamfer, run level, then step down behind each near Server
 * readout to the bottom edge, which is notched under the stats panel. Both halves match.
 */
const TABLE_HALF: TablePath = [...FAR_AND_SIDE, ...nearCorner(6.23)];
export const TABLE_OUTLINE: TablePath = halves(TABLE_HALF, TABLE_HALF);

/** Chassis top; every glass pane is laid into it from here. */
export const NEON_CHASSIS_TOP = -.03;
/** Underside of the chassis: the bottom of the table's glass. */
export const NEON_TABLE_BOTTOM = NEON_CHASSIS_TOP - .295;
/** Top of the white glass frame; frame etching sits just above it. */
export const NEON_FRAME_TOP = .04;

/**
 * Far deck edge: level beside the far Servers (its corner chamfer runs up from `cornerZ` on the side), it turns 45°
 * up toward each raised Server to the apex, then runs straight across in front of the far Servers and stats panel,
 * level on screen with the far neon line.
 */
export const GLASS_FAR_EDGE = { z: -4.84, cornerZ: -4.46 } as const;
export const GLASS_SERVER_CUT = { x: 6.35, apex: [5.56, -5.254 - NEON_FAR_RAISE] } as const;
/**
 * Near deck corners: one long chamfer (45° on screen) from the side down to a ledge that lines the side rail up with
 * the near Server tube on screen; the ledge runs straight across in front of the near Servers and stats panel.
 */
export const GLASS_NEAR_LEDGE = { cornerZ: 4.24, chamferX: 6.93, z: 5.29 } as const;
/** Deck shader and lane layout depend on these edges. */
export const GLASS_OUTLINE: TablePath = [
  [-7.43, GLASS_FAR_EDGE.z], [-GLASS_SERVER_CUT.x, GLASS_FAR_EDGE.z], [-GLASS_SERVER_CUT.apex[0], GLASS_SERVER_CUT.apex[1]],
  [GLASS_SERVER_CUT.apex[0], GLASS_SERVER_CUT.apex[1]], [GLASS_SERVER_CUT.x, GLASS_FAR_EDGE.z], [7.43, GLASS_FAR_EDGE.z],
  [7.74, GLASS_FAR_EDGE.cornerZ], [7.74, GLASS_NEAR_LEDGE.cornerZ], [GLASS_NEAR_LEDGE.chamferX, GLASS_NEAR_LEDGE.z],
  [-GLASS_NEAR_LEDGE.chamferX, GLASS_NEAR_LEDGE.z], [-7.74, GLASS_NEAR_LEDGE.cornerZ], [-7.74, GLASS_FAR_EDGE.cornerZ],
];

/** Edge bevel on the glass frame, deck and Server bases. */
export const GLASS_BEVEL = .018;
/** One white glass frame laid flush over the chassis around the deck, with the side rails inside it. */
export const FRAME_OUTER: TablePath = TABLE_OUTLINE;
export const FRAME_HOLE: TablePath = offsetOutline(GLASS_OUTLINE, .12);

function tableShape(points: TablePath) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  return shape;
}

/** Steps in each rounded bevel; their shading is blended so the edge reads as one smooth roll. */
const BEVEL_SEGMENTS = 12;

/**
 * Per-corner normals averaged over every face meeting at that point within `creaseDeg` of the corner's own face,
 * so bevel steps shade as a continuous curve while the outline's real corners stay crisp. Keeps uvs intact.
 */
export function smoothBevelNormals(geometry: THREE.BufferGeometry, creaseDeg = 40) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position');
  const faces = position.count / 3;
  const faceNormals: THREE.Vector3[] = [];
  const byPoint = new Map<string, number[]>();
  const key = (i: number) => `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < faces; f++) {
    a.fromBufferAttribute(position, f * 3);
    b.fromBufferAttribute(position, f * 3 + 1);
    c.fromBufferAttribute(position, f * 3 + 2);
    faceNormals.push(new THREE.Vector3().crossVectors(c.sub(b), a.sub(b)));
    for (let k = 0; k < 3; k++) {
      const id = key(f * 3 + k), list = byPoint.get(id);
      if (list) list.push(f); else byPoint.set(id, [f]);
    }
  }
  const crease = Math.cos(THREE.MathUtils.degToRad(creaseDeg));
  const unit = faceNormals.map(n => n.clone().normalize());
  const normals = new Float32Array(position.count * 3), sum = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const own = unit[Math.floor(i / 3)];
    sum.set(0, 0, 0);
    for (const f of byPoint.get(key(i)) ?? []) if (unit[f].dot(own) >= crease) sum.add(faceNormals[f]);
    if (sum.lengthSq() === 0) sum.copy(own);
    sum.normalize().toArray(normals, i * 3);
  }
  source.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return source;
}

/** Extrusion grows upward from the mesh's Y position; the bevel adds `bevel` above, below and outward. */
export function slabGeometry(points: TablePath, thickness: number, bevel = 0, creaseDeg = 40) {
  const geometry = new THREE.ExtrudeGeometry(tableShape(points), {
    depth: thickness,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? BEVEL_SEGMENTS : 0,
    bevelThickness: bevel,
    bevelSize: bevel,
  });
  geometry.rotateX(-Math.PI / 2);
  return bevel > 0 ? smoothBevelNormals(geometry, creaseDeg) : geometry;
}

/** Flat, upward-facing face over `points` at height `y`. */
export function capGeometry(points: TablePath, y: number) {
  const geometry = new THREE.ShapeGeometry(tableShape(points));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/** Radii of the rounds on a contour's upper and lower edges; 0 leaves that edge square. */
export type EdgeRounds = { top: number; bottom: number };

/** (inset, height) steps up a contour's side: the lower round, the straight wall, then the upper round. */
function sideProfile({ top, bottom }: EdgeRounds, height: number): [number, number][] {
  const steps: [number, number][] = [];
  const arc = (r: number, cy: number, from: number) => {
    for (let s = 0; s <= BEVEL_SEGMENTS; s++) {
      const a = (from + s / BEVEL_SEGMENTS) * Math.PI / 2;
      steps.push([r - r * Math.sin(a), cy - r * Math.cos(a)]);
    }
  };
  if (bottom > 0) arc(bottom, bottom, 0); else steps.push([0, 0]);
  if (top > 0) arc(top, height - top, 1); else steps.push([0, height]);
  return steps.filter((p, i) => i === 0 || Math.hypot(p[0] - steps[i - 1][0], p[1] - steps[i - 1][1]) > 1e-7);
}

/**
 * Slab from y 0 to `height` whose `outer` contour (and optional `hole`) is its true outer extent, each contour's upper
 * and lower edges rounded by their own radii, so a square edge can sit flush on the piece below and continue it.
 * `capTop: false` leaves the top face open.
 */
export function roundedSlabGeometry(
  outer: TablePath, outerRounds: EdgeRounds, height: number,
  { hole, holeRounds = { top: 0, bottom: 0 }, capTop = true, creaseDeg = 40 }: { hole?: TablePath; holeRounds?: EdgeRounds; capTop?: boolean; creaseDeg?: number } = {},
) {
  const positions: number[] = [];
  const tri = (a: number[], b: number[], c: number[], up: number) => {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    positions.push(...a, ...(ny * up >= 0 ? [b, c] : [c, b]).flat());
  };
  const side = (contour: TablePath, rounds: EdgeRounds, inward: number) => {
    const rings = sideProfile(rounds, height).map(([d, y]) => offsetOutline(contour, inward * d).map(([x, z]) => [x, y, z]));
    const flip = (signedArea(contour) > 0) === (inward < 0);
    for (let r = 0; r + 1 < rings.length; r++) {
      const lo = rings[r], hi = rings[r + 1];
      for (let j = 0; j < lo.length; j++) {
        const k = (j + 1) % lo.length, a = lo[j], b = lo[k], c = hi[k], d = hi[j];
        if (flip) positions.push(...a, ...c, ...b, ...a, ...d, ...c);
        else positions.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
  };
  const face = (y: number, inset: 'top' | 'bottom', up: number) => {
    const contour = offsetOutline(outer, -outerRounds[inset]);
    const holes = hole ? [offsetOutline(hole, holeRounds[inset])] : [];
    const v2 = (path: TablePath) => path.map(([x, z]) => new THREE.Vector2(x, z));
    const flat = [contour, ...holes].flat();
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(v2(contour), holes.map(v2))) {
      tri([flat[a][0], y, flat[a][1]], [flat[b][0], y, flat[b][1]], [flat[c][0], y, flat[c][1]], up);
    }
  };
  side(outer, outerRounds, -1);
  if (hole) side(hole, holeRounds, 1);
  if (capTop) face(height, 'top', 1);
  face(0, 'bottom', -1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return smoothBevelNormals(geometry, creaseDeg);
}

function signedArea(points: TablePath) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % points.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

/** Offsets a closed polygon inward (negative) or outward (positive) in the XZ plane. */
export function offsetOutline(points: TablePath, delta: number): TablePath {
  const n = points.length;
  const orient = signedArea(points) > 0 ? 1 : -1;
  const out: TablePoint[] = [];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = points[(i - 1 + n) % n];
    const [x1, z1] = points[i];
    const [x2, z2] = points[(i + 1) % n];
    const l0 = Math.hypot(x1 - x0, z1 - z0) || 1;
    const l1 = Math.hypot(x2 - x1, z2 - z1) || 1;
    const n0x = (z1 - z0) / l0 * orient, n0z = -(x1 - x0) / l0 * orient;
    const n1x = (z2 - z1) / l1 * orient, n1z = -(x2 - x1) / l1 * orient;
    let nx = n0x + n1x, nz = n0z + n1z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const cos = Math.max(.35, nx * n1x + nz * n1z);
    out.push([x1 + nx * delta / cos, z1 + nz * delta / cos]);
  }
  return out;
}

export const closed = (points: TablePath): TablePath => [...points, points[0]];

export function arcPath(cx: number, cz: number, r: number, a0: number, a1: number, segments: number): TablePath {
  const pts: TablePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + (a1 - a0) * (i / segments);
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

export function ring(cx: number, cz: number, r: number, segments = 40): TablePath {
  return arcPath(cx, cz, r, 0, Math.PI * 2, segments);
}

/** `segments` evenly spaced arcs; `dash` is the lit fraction of each. */
export function dashedRing(cx: number, cz: number, r: number, segments: number, omit: readonly number[] = [], dash = .55, phase = -Math.PI / 2): TablePath[] {
  const paths: TablePath[] = [];
  const step = Math.PI * 2 / segments;
  for (let i = 0; i < segments; i++) {
    if (omit.includes(i)) continue;
    const a0 = phase + i * step + step * (1 - dash) / 2;
    paths.push(arcPath(cx, cz, r, a0, a0 + step * dash, Math.max(2, Math.ceil(24 * dash / segments))));
  }
  return paths;
}

export function polygonRing(cx: number, cz: number, r: number, sides: number, rot = -Math.PI / 2): TablePath {
  return closed(Array.from({ length: sides }, (_, i) => {
    const a = rot + i * Math.PI * 2 / sides;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as TablePoint;
  }));
}

export function hexagram(cx: number, cz: number, r: number): TablePath[] {
  return [polygonRing(cx, cz, r, 3, -Math.PI / 2), polygonRing(cx, cz, r, 3, Math.PI / 2)];
}

export function rhombus(cx: number, cz: number, rx: number, rz: number): TablePath {
  return closed([[cx, cz - rz], [cx + rx, cz], [cx, cz + rz], [cx - rx, cz]]);
}

/** A chevron whose tip points along +z (dir 1) or -z (dir -1). */
export function chevron(cx: number, cz: number, halfWidth: number, depth: number, dir: 1 | -1): TablePath {
  return [[cx - halfWidth, cz - depth * dir], [cx, cz], [cx + halfWidth, cz - depth * dir]];
}

export function tickLadder(x: number, z0: number, z1: number, bars: number, halfW: number): TablePath[] {
  return Array.from({ length: bars }, (_, i) => {
    const z = z0 + (z1 - z0) * (bars === 1 ? .5 : i / (bars - 1));
    return [[x - halfW, z], [x + halfW, z]] as TablePath;
  });
}

/** World-unit margin each side of a stroke, where its etched shadow and light catch are drawn. */
export const STROKE_ETCH_PAD = .03;

/**
 * Flat strokes with mitred joins, so additive lines stay even through corners.
 * A path whose last point repeats its first is treated as a closed loop.
 * uv.x runs along the path; uv.y spans 0..1 across `width`, and runs past that over the etch pad.
 */
export function strokeGeometry(paths: readonly TablePath[], y: number, width: number) {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const half = width / 2 + STROKE_ETCH_PAD;
  const v0 = -STROKE_ETCH_PAD / width, v1 = 1 + STROKE_ETCH_PAD / width;
  for (const raw of paths) {
    const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 1e-6);
    if (pts.length < 2) continue;
    const loop = pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6;
    if (loop) pts.pop();
    const n = pts.length;
    const dir = (i: number) => {
      const a = pts[i], b = pts[(i + 1) % n];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const count = loop ? n + 1 : n;
    const base = positions.length / 3;
    let distance = 0;
    for (let k = 0; k < count; k++) {
      const i = k % n;
      const hasPrev = loop || i > 0;
      const hasNext = loop || i < n - 1;
      const d0 = hasPrev ? dir((i - 1 + n) % n) : dir(i);
      const d1 = hasNext ? dir(i) : d0;
      const n0 = [-d0[1], d0[0]], n1 = [-d1[1], d1[0]];
      let mx = n0[0] + n1[0], mz = n0[1] + n1[1];
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const scale = half / Math.max(.3, mx * n1[0] + mz * n1[1]);
      const [px, pz] = pts[i];
      if (k > 0) {
        const prev = pts[(i - 1 + n) % n];
        distance += Math.hypot(px - prev[0], pz - prev[1]);
      }
      positions.push(px + mx * scale, y, pz + mz * scale, px - mx * scale, y, pz - mz * scale);
      uv.push(distance, v0, distance, v1);
      if (k > 0) {
        const a = base + (k - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
