/**
 * Finds the rings in a flat HUD drawing whose ellipses are all circles seen tilted the same way: upright ellipses with
 * one width-to-height ratio, centred on one horizontal axis. Points are in drawing units, y down.
 */
export type HudPath = { points: readonly (readonly [number, number])[]; style: string };
export type HudRing = { cx: number; radius: number; paths: number[] };
export type HudRings = { aspect: number; axisY: number; rings: HudRing[]; loose: number[] };

type Fit = { c: number; r: number; res: number };

/** Least-squares circle with its centre on the axis, in unsquashed units (x / aspect). */
function axisCircle(points: readonly (readonly [number, number])[], aspect: number, axisY: number): Fit {
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (const [x, y] of points) {
    const u = x / aspect, w = y - axisY, rhs = -(u * u + w * w), a = -2 * u;
    s11 += a * a; s12 += a; s22 += 1; t1 += a * rhs; t2 += rhs;
  }
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-9) return { c: 0, r: 0, res: Infinity };
  const c = (t1 * s22 - t2 * s12) / det, b = (s11 * t2 - s12 * t1) / det, r = Math.sqrt(Math.max(c * c - b, 0));
  let e = 0;
  for (const [x, y] of points) e += (Math.hypot(x / aspect - c, y - axisY) - r) ** 2;
  return { c, r, res: r > 0 ? Math.sqrt(e / points.length) / r : Infinity };
}

/** General upright ellipse through the points: centre and radii. */
function ellipse(points: readonly (readonly [number, number])[]) {
  // A x^2 + C y^2 + D x + E y = 1, solved by Gaussian elimination.
  const m = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
  for (const [x, y] of points) {
    const row = [x * x, y * y, x, y];
    for (let a = 0; a < 4; a++) { for (let c = 0; c < 4; c++) m[a][c] += row[a] * row[c]; m[a][4] += row[a]; }
  }
  for (let col = 0; col < 4; col++) {
    const pivot = m.slice(col).reduce((best, row, i) => Math.abs(row[col]) > Math.abs(m[best][col]) ? col + i : best, col);
    [m[col], m[pivot]] = [m[pivot], m[col]];
    if (Math.abs(m[col][col]) < 1e-12) return null;
    for (let row = 0; row < 4; row++) if (row !== col) { const f = m[row][col] / m[col][col]; for (let k = col; k < 5; k++) m[row][k] -= f * m[col][k]; }
  }
  const [A, C, D, E] = m.map((row, i) => row[4] / row[i]);
  const cx = -D / (2 * A), cy = -E / (2 * C), g = 1 + A * cx * cx + C * cy * cy;
  return g / A > 0 && g / C > 0 ? { cx, cy, rx: Math.sqrt(g / A), ry: Math.sqrt(g / C) } : null;
}

const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** Angle covered by the points around the centre, in degrees: the circle minus its largest gap. */
function coverage(points: readonly (readonly [number, number])[], aspect: number, axisY: number, c: number) {
  const angles = points.map(([x, y]) => Math.atan2(y - axisY, x / aspect - c)).sort((a, b) => a - b);
  let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
  return 360 - gap * 180 / Math.PI;
}

/** How round the outline is: major over minor spread. Straight strokes (lines, ticks) are long and thin. */
function elongation(points: readonly (readonly [number, number])[]) {
  let mx = 0, my = 0;
  for (const [x, y] of points) { mx += x; my += y; }
  mx /= points.length; my /= points.length;
  let a = 0, b = 0, c = 0;
  for (const [x, y] of points) { a += (x - mx) ** 2; b += (x - mx) * (y - my); c += (y - my) ** 2; }
  const half = (a + c) / 2, root = Math.sqrt(Math.max(half * half - (a * c - b * b), 0));
  return Math.sqrt((half + root) / Math.max(half - root, 1e-9));
}

/** Thick bands fit their circle looser than hairlines, so `res` allows a band about a sixth of the radius. */
const RING = { res: .08, deviation: .1, coverage: 30, minRadius: 4 } as const;
/** Small rings drawn as a few thick arcs are bands too wide for `RING.res`; neighbouring pieces that close most of a circle count. */
const COMPACT = { res: .25, coverage: 240, minPaths: 3 } as const;

type Box = [number, number, number, number];
const boxOf = (points: readonly (readonly [number, number])[]): Box => points.reduce<Box>(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity]);
/** `b` touches `a` grown by half its size. */
const touches = (a: Box, b: Box) => { const pad = Math.max(a[2] - a[0], a[3] - a[1]) / 2; return b[0] <= a[2] + pad && b[2] >= a[0] - pad && b[1] <= a[3] + pad && b[3] >= a[1] - pad; };

export function findHudRings(paths: readonly HudPath[]): HudRings {
  // The shared tilt and axis, from the paths that are whole upright ellipses on their own.
  const whole = paths.map(path => path.points.length >= 12 ? ellipse(path.points) : null)
    .filter((e): e is NonNullable<ReturnType<typeof ellipse>> => !!e && e.ry > 10 && e.rx < e.ry * .95);
  if (!whole.length) return { aspect: 1, axisY: 0, rings: [], loose: paths.map((_, i) => i) };
  const aspect = median(whole.map(e => e.rx / e.ry)), axisY = median(whole.map(e => e.cy));

  // Rings are exported as runs of consecutive same-style paths; a run breaks where the next path leaves the circle.
  type Segment = { style: string; paths: number[]; points: (readonly [number, number])[]; fit: Fit };
  const segments: Segment[] = [];
  paths.forEach((path, i) => {
    const current = segments[segments.length - 1];
    if (current && current.style === path.style) {
      const points = [...current.points, ...path.points], fit = axisCircle(points, aspect, axisY);
      // Until a few paths pin the circle down, judge the newcomer against the joint fit.
      const against = current.paths.length < 3 ? fit : current.fit;
      const off = Math.max(...path.points.map(([x, y]) => Math.abs(Math.hypot(x / aspect - against.c, y - axisY) - against.r))) / against.r;
      if (fit.res < RING.res && off < RING.deviation) { current.paths.push(i); current.points = points; current.fit = fit; return; }
    }
    segments.push({ style: path.style, paths: [i], points: [...path.points], fit: axisCircle(path.points, aspect, axisY) });
  });

  // No ring reaches past the drawing's vertical extent from the axis.
  const reach = Math.max(...paths.flatMap(path => path.points.map(([, y]) => Math.abs(y - axisY)))) * 1.05;
  const rings: HudRing[] = [], leftover: number[] = [];
  const addRing = (members: number[], fit: Fit) => {
    const cx = fit.c * aspect;
    // Pieces of one ring split by other paths in between share its centre and radius.
    const same = rings.find(other => Math.abs(other.cx - cx) < 1 && Math.abs(other.radius - fit.r) < fit.r * .04);
    if (same) same.paths.push(...members);
    else rings.push({ cx, radius: fit.r, paths: members });
  };
  for (const { paths: members, points, fit } of segments) {
    const ring = fit.res < RING.res && fit.r > RING.minRadius && fit.r < reach
      && coverage(points, aspect, axisY, fit.c) >= RING.coverage
      && (members.length > 1 || elongation(points) < 8);
    if (ring) addRing(members, fit);
    else leftover.push(...members);
  }

  const loose: number[] = [];
  let cluster = null as { style: string; paths: number[]; points: (readonly [number, number])[]; box: Box } | null;
  const settle = () => {
    if (!cluster) return;
    const fit = axisCircle(cluster.points, aspect, axisY);
    const ring = cluster.paths.length >= COMPACT.minPaths && fit.res < COMPACT.res && fit.r > RING.minRadius && fit.r < reach
      && coverage(cluster.points, aspect, axisY, fit.c) >= COMPACT.coverage;
    if (ring) addRing(cluster.paths, fit);
    else loose.push(...cluster.paths);
    cluster = null;
  };
  for (const i of leftover) {
    const { style, points } = paths[i], box = boxOf(points);
    if (cluster?.style === style && touches(cluster.box, box)) {
      cluster.paths.push(i);
      cluster.points.push(...points);
      cluster.box = [Math.min(cluster.box[0], box[0]), Math.min(cluster.box[1], box[1]), Math.max(cluster.box[2], box[2]), Math.max(cluster.box[3], box[3])];
      continue;
    }
    settle();
    cluster = { style, paths: [i], points: [...points], box };
  }
  settle();
  return { aspect, axisY, rings, loose };
}
