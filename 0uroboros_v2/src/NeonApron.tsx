import { useEffect, useMemo } from 'react';
import { NeonSeamMaterial } from './neonMaterials';
import { NEON_FRAME_TOP, strokeGeometry, type TablePath } from './neonTableGeometry';

const LINE_Y = NEON_FRAME_TOP + .003;

function farRail(): TablePath[] {
  return [[[-2.95, -6.48], [-.5, -6.48], [-.35, -6.33], [.35, -6.33], [.5, -6.48], [2.95, -6.48]]];
}

/** The one etched line on the white glass frame: along the far edge, stepping round the Stats housing. */
export function NeonApron() {
  const geom = useMemo(() => ({
    farRail: strokeGeometry(farRail(), LINE_Y + .001, .03),
  }), []);

  useEffect(() => () => Object.values(geom).forEach(g => g.dispose()), [geom]);

  return (
    <group name="neon-apron">
      <mesh geometry={geom.farRail} renderOrder={1}>
        <NeonSeamMaterial side={1} strength={.8} profile="laser" />
      </mesh>
    </group>
  );
}
