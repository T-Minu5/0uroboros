/**
 * World-space causal effects.
 *
 * Idle board is quiet. When an effect resolves, the source already glows and
 * the target answers with a short impact. Distant hops get a brief solid arc.
 * No dashed filaments, no looping shards.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Line, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import * as THREE from 'three';

import type { FxEvent, PlayerID } from '../../game/types';
import type { NodeView } from '../selectors';
import { fxKindOf, FxMark, themeTagOf } from './FxMark';
import {
  cardWorld,
  dcWorld,
  familyColor,
  nodeAnchorWorld,
  spatialPlanOf,
  type SpatialAnchor,
  type SpatialFamily,
} from '../board/spatialGrammar';

export function SpatialFx({
  event,
  nodes,
  viewer,
  sourceName,
  measuring: _measuring,
  focusNode: _focusNode,
}: {
  event: FxEvent | null;
  nodes: NodeView[];
  viewer: PlayerID;
  sourceName?: string | null;
  measuring?: boolean;
  focusNode?: number | null;
}) {
  const plan = event ? spatialPlanOf(event, viewer, sourceName) : null;
  const nodeCount = nodes.length;
  const from = plan ? worldOf(plan.source, nodes, viewer, nodeCount) : null;
  const to = plan ? worldOf(plan.target, nodes, viewer, nodeCount) : null;
  const [echo, setEcho] = useState<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    family: SpatialFamily;
    label: string;
    hudTarget: boolean;
  } | null>(null);

  useEffect(() => {
    if (plan && from && to) {
      setEcho({
        from: from.clone(),
        to: to.clone(),
        family: plan.family,
        label: plan.label,
        hudTarget: plan.target.kind === 'hud',
      });
      return;
    }
    const id = window.setTimeout(() => setEcho(null), 1400);
    return () => window.clearTimeout(id);
  }, [event?.id]);

  const live =
    plan && from && to
      ? {
          from,
          to,
          family: plan.family,
          label: plan.label,
          hudTarget: plan.target.kind === 'hud',
        }
      : echo;

  if (!live || live.hudTarget) return null;

  return (
    <EffectBurst
      from={live.from}
      to={live.to}
      family={live.family}
      label={live.label}
      theme={themeTagOf(sourceName)}
    />
  );
}

function worldOf(
  anchor: SpatialAnchor,
  nodes: NodeView[],
  viewer: PlayerID,
  nodeCount: number,
): THREE.Vector3 | null {
  if (anchor.kind === 'card' && anchor.instanceId) {
    const pos = cardWorld(nodes, anchor.instanceId, nodeCount);
    return pos ? new THREE.Vector3(...pos) : fallbackNode(anchor.nodeIndex, nodeCount);
  }
  if (anchor.kind === 'dc' && anchor.player && anchor.dataCenter) {
    return new THREE.Vector3(...dcWorld(anchor.player, viewer, anchor.dataCenter, nodeCount));
  }
  if (anchor.kind === 'node' && anchor.nodeIndex != null) {
    return new THREE.Vector3(...nodeAnchorWorld(anchor.nodeIndex, nodeCount, anchor.slot));
  }
  if (anchor.kind === 'hud') {
    return fallbackNode(anchor.nodeIndex, nodeCount);
  }
  return fallbackNode(anchor.nodeIndex, nodeCount);
}

function fallbackNode(index: number | undefined, nodeCount: number): THREE.Vector3 {
  return new THREE.Vector3(...nodeAnchorWorld(index ?? 2, nodeCount, 'location'));
}

function EffectBurst({
  from,
  to,
  family,
  label,
  theme,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  family: SpatialFamily;
  label: string;
  theme: ReturnType<typeof themeTagOf>;
}) {
  // FX_STORYTELLING_V3: source glow, causal arc, target reaction. Original, not a copied webp.
  const color = familyColor(family);
  const span = from.distanceTo(to);
  const drawArc = span > 0.55 && family !== 'focus';
  const points = useMemo(() => (drawArc ? arcPoints(from, to, 20) : null), [from, to, drawArc]);
  const sprite = fxKindOf(family, theme);
  const lineWidth = family === 'drain' ? 7 : family === 'restore' ? 5.5 : family === 'chance' ? 3.5 : 5;

  return (
    <group>
      {/* Source activation pulse — no diagnostic FROM label. */}
      <mesh position={from.toArray()} userData={{ causal: 'source' }}>
        <sphereGeometry args={[family === 'drain' ? 0.16 : 0.13, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh position={from.toArray()} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.32, 28]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <CausalBolt from={from} to={to} color={color} hostile={family === 'drain'} />
      {points ? (
        <Line
          points={points}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={0.96}
          depthWrite={false}
        />
      ) : null}
      <TargetImpact to={to} color={color} hostile={family === 'drain'} />
      <Html position={[to.x, to.y + 0.22, to.z]} center distanceFactor={6.2} style={{ pointerEvents: 'none', color }}>
        <FxMark kind={sprite} />
      </Html>
      {label ? (
        <Html position={[to.x, to.y + 0.55, to.z]} center distanceFactor={6.8} style={{ pointerEvents: 'none' }}>
          <span
            className="fx-world"
            data-causal="source-path-target"
            data-family={family}
            style={{
              font: '700 13px Orbitron, sans-serif',
              textShadow: '0 0 10px rgba(0,0,0,0.95)',
              letterSpacing: '0.06em',
              color,
            }}
          >
            {label}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

function CausalBolt({
  from,
  to,
  color,
  hostile = false,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  hostile?: boolean;
}) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    const t = (performance.now() / (hostile ? 480 : 640)) % 1;
    const pos = from.clone().lerp(to, t);
    pos.y += Math.sin(t * Math.PI) * (hostile ? 0.52 : 0.38);
    mesh.current.position.copy(pos);
    const s = hostile ? 1.15 : 1;
    mesh.current.scale.setScalar(s * (0.85 + Math.sin(t * Math.PI) * 0.35));
  });
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[hostile ? 0.12 : 0.09, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  );
}

/** Contact beat at the target — Hearthstone-weight principle: impact then settle. */
function TargetImpact({
  to,
  color,
  hostile,
}: {
  to: THREE.Vector3;
  color: string;
  hostile: boolean;
}) {
  const ring = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const born = useRef(performance.now());
  useFrame(() => {
    const age = (performance.now() - born.current) / 1000;
    if (ring.current) {
      const t = Math.min(1, age / 0.55);
      const scale = 0.6 + t * (hostile ? 1.8 : 1.35);
      ring.current.scale.setScalar(scale);
      const mat = ring.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.95 * (1 - t));
    }
    if (burst.current) {
      const t = Math.min(1, age / 0.35);
      burst.current.scale.setScalar(0.4 + t * 1.6);
      const mat = burst.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.7 * (1 - t));
    }
  });
  return (
    <group position={to.toArray()}>
      <mesh ref={burst}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.28, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function arcPoints(from: THREE.Vector3, to: THREE.Vector3, segments: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) out.push(sampleArc(from, to, i / segments));
  return out;
}

function sampleArc(from: THREE.Vector3, to: THREE.Vector3, t: number): THREE.Vector3 {
  const mid = from.clone().lerp(to, 0.5);
  // Higher arc so source→target reads as a directed hop, not a floor scribble.
  mid.y += Math.max(0.55, from.distanceTo(to) * 0.28);
  const a = from.clone().lerp(mid, t);
  const b = mid.clone().lerp(to, t);
  return a.lerp(b, t);
}
