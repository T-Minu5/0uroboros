import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { SVGLoader, type SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { findHudRings } from './hudRings';
import { LAYER_DEPTH, type HudLook } from './hudLook';

export const HUD_TEST_URL = '/assets/HUDs/Elipse_test.svg';

type Piece = { geometry: THREE.BufferGeometry; material: THREE.Material; order: number };
type FillStyle = { fill?: string; opacity?: number; fillOpacity?: number };
const styleOf = (path: THREE.ShapePath) => (path.userData?.style ?? {}) as FillStyle;
/** `lift` is the ring's depth in front of the largest ring, as a share of the full layer depth; negative is behind. */
type Ring = { cx: number; pieces: Piece[]; speed: number; lift: number };

/** Draws in the drawing's own stacking order, like the flat SVG. */
const RENDER_ORDER = 1000;

function fillMaterial(color: THREE.Color, opacity: number) {
  return new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
}

/**
 * A flat HUD drawing of tilted circles, rebuilt in 3D: each ring is unsquashed into a true circle, gathered onto one
 * shared centre line (its order across the drawing becoming depth) and spun about it. Everything else stays flat on
 * z = 0. It is centred on its largest ring, of radius `radius`, which stays on z = 0 too; `look` turns it and sets how
 * far the other rings stand out in front of and behind it: at spread 0 it is the flat drawing.
 */
export function HudHologram({ url = HUD_TEST_URL, radius, look }: { url?: string; radius: number; look: HudLook }) {
  const svg = useLoader(SVGLoader, url) as SVGResult;
  const root = useRef<THREE.Group>(null);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const built = useMemo(() => {
    const element = svg.xml as unknown as Element;
    const view = element.getAttribute('viewBox')?.split(/[\s,]+/).map(Number) ?? [0, 0, 300, 200];
    const [, , w, h] = view;
    const paths = svg.paths.map(path => ({ style: `${styleOf(path).fill}|${styleOf(path).opacity}|${styleOf(path).fillOpacity}`, points: path.subPaths.flatMap(sub => sub.getPoints(16).map(v => [v.x, v.y] as const)) }));
    const { aspect, axisY, rings, loose } = findHudRings(paths);
    const largest = rings.reduce((big, ring) => Math.max(big, ring.radius), 0);
    const scale = radius / (largest || h / 2);

    /** One path's geometry: around (cx, axisY) unsquashed when it belongs to a ring, else in place. */
    const piece = (index: number, cx: number | null): Piece | null => {
      const path = svg.paths[index], style = styleOf(path);
      const fill = style.fill ?? '';
      const opacity = (style.opacity ?? 1) * (style.fillOpacity ?? 1);
      const toLocal = (x: number, y: number) => cx === null
        ? new THREE.Vector3((x - w / 2) * scale, -(y - h / 2) * scale, 0)
        : new THREE.Vector3((x - cx) / aspect * scale, -(y - axisY) * scale, 0);
      // Pattern fills are embedded raster images; the HUD keeps only its vector shapes.
      if (!fill || fill === 'none' || fill.startsWith('url(')) return null;
      const shapes = path.toShapes();
      if (!shapes.length) return null;
      const geometry = new THREE.ShapeGeometry(shapes, 12);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) { const v = toLocal(position.getX(i), position.getY(i)); position.setXYZ(i, v.x, v.y, 0); }
      geometry.deleteAttribute('uv');
      geometry.deleteAttribute('normal');
      return { geometry, material: fillMaterial(path.color, opacity), order: index };
    };

    /** Consecutive paths sharing a look merge into one draw, keeping the drawing's stacking order. */
    const merged = (indices: number[], cx: number | null) => {
      const out: Piece[] = [];
      let run = null as { key: string; pieces: Piece[] } | null;
      const flush = () => {
        if (!run) return;
        const [first] = run.pieces;
        if (run.pieces.length === 1) out.push(first);
        else {
          out.push({ geometry: mergeGeometries(run.pieces.map(p => p.geometry))!, material: first.material, order: first.order });
          run.pieces.forEach(p => { p.geometry.dispose(); if (p !== first) p.material.dispose(); });
        }
        run = null;
      };
      for (const index of [...indices].sort((a, b) => a - b)) {
        const p = piece(index, cx);
        if (!p) continue;
        const key = paths[index].style;
        if (run?.key !== key) flush();
        if (!run) run = { key, pieces: [] };
        run.pieces.push(p);
      }
      flush();
      return out;
    };

    const flat = merged(loose, null);
    const drawn = rings.map(ring => ({ ring, pieces: merged(ring.paths, ring.cx) })).filter(({ pieces }) => pieces.length);
    const hub = drawn.reduce((big, { ring }) => ring.radius > big.radius ? ring : big, drawn[0]?.ring ?? { cx: w / 2, radius: 0 }).cx;
    // Left in the drawing is nearer, right further.
    const near = Math.min(...drawn.map(({ ring }) => ring.cx)), far = Math.max(...drawn.map(({ ring }) => ring.cx));
    const spun: Ring[] = drawn.map(({ ring, pieces }, k) => ({
      cx: ring.cx,
      pieces,
      // Smaller rings turn faster; neighbours alternate direction.
      speed: (k % 2 ? -1 : 1) * (.18 + 6 / (ring.radius + 12)),
      lift: far > near ? (hub - ring.cx) / (far - near) : 0,
    }));
    return { w, h, scale, aspect, axisY, hub, flat, spun };
  }, [svg, radius]);

  useEffect(() => () => {
    const pieces = [...built.flat, ...built.spun.flatMap(ring => ring.pieces)];
    new Set(pieces.map(p => p.geometry)).forEach(g => g.dispose());
    new Set(pieces.map(p => p.material)).forEach(m => m.dispose());
  }, [built]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, .05);
    root.current?.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    built.spun.forEach((ring, k) => {
      const spin = spins.current[k];
      if (!spin) return;
      spin.position.z = ring.lift * LAYER_DEPTH * radius * look.spread;
      if (!reduced) spin.rotation.z += ring.speed * dt;
    });
  });

  const { w, h, scale, axisY, hub, flat, spun } = built;
  // Every ring shares the largest ring's centre, set along the depth axis (per frame, by spread) by its place across
  // the drawing. The flat artwork keeps its place relative to that ring.
  return <group ref={root}>
   <group position={[-(hub - w / 2) * scale, (axisY - h / 2) * scale, 0]}>
    {flat.map((p, i) => <mesh key={`flat-${i}`} geometry={p.geometry} material={p.material} renderOrder={RENDER_ORDER + p.order}/>)}
   </group>
   {spun.map((ring, k) => <group key={k} ref={el => { spins.current[k] = el; }}>
    {ring.pieces.map((p, i) => <mesh key={i} geometry={p.geometry} material={p.material} renderOrder={RENDER_ORDER + p.order}/>)}
   </group>)}
  </group>;
}
