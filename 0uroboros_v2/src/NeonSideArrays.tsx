import { useEffect, useMemo } from 'react';
import { NeonSeamMaterial } from './neonMaterials';
import {
  NEON_FRAME_TOP,
  chevron,
  rhombus,
  strokeGeometry,
  tickLadder,
  type TablePath,
  type TablePoint,
} from './neonTableGeometry';

const WING_TOP = NEON_FRAME_TOP;

const flip = (paths: readonly TablePath[], sx: number, sz: number) =>
  paths.map(path => path.map(([x, z]) => [x * sx, z * sz] as TablePoint));

/** Near-right wing etching; mirrored into the other three quadrants. The blade turns along the corner chamfer. */
function wingLasers(): TablePath[] {
  return [[[7.75, 4.93], [8.27, 4.22], [8.27, 1.62], [9.07, .92], [9.07, .44]]];
}

function wingEtch(): TablePath[] {
  return [
    rhombus(7.75, 4.93, .05, .085),
    [[9.0, .44], [9.14, .44]],
    ...[2.0, 2.17, 2.34].map(z => chevron(8.125, z, .09, .07, -1)),
    ...tickLadder(8.125, 3.2, 4.15, 8, .065),
  ];
}

/** Wing etching on the white glass frame: player-coloured light blades, chevrons and tick ladders. */
export function NeonSideArrays() {
  const geom = useMemo(() => {
    const quadrant = (paths: TablePath[], near: boolean) =>
      [...flip(paths, 1, near ? 1 : -1), ...flip(paths, -1, near ? 1 : -1)];
    return {
      laserNear: strokeGeometry(quadrant(wingLasers(), true), WING_TOP + .003, .036),
      laserFar: strokeGeometry(quadrant(wingLasers(), false), WING_TOP + .003, .036),
      etchNear: strokeGeometry(quadrant(wingEtch(), true), WING_TOP + .002, .022),
      etchFar: strokeGeometry(quadrant(wingEtch(), false), WING_TOP + .002, .022),
    };
  }, []);

  useEffect(() => () => {
    [geom.laserNear, geom.laserFar, geom.etchNear, geom.etchFar].forEach(g => g.dispose());
  }, [geom]);

  return (
    <group name="neon-side-arrays">
      <mesh geometry={geom.laserNear} renderOrder={1}>
        <NeonSeamMaterial side={0} strength={1.1} profile="laser" />
      </mesh>
      <mesh geometry={geom.laserFar} renderOrder={1}>
        <NeonSeamMaterial side={1} strength={1.1} profile="laser" />
      </mesh>
      <mesh geometry={geom.etchNear} renderOrder={1}>
        <NeonSeamMaterial side={0} strength={.5} profile="soft" />
      </mesh>
      <mesh geometry={geom.etchFar} renderOrder={1}>
        <NeonSeamMaterial side={1} strength={.5} profile="soft" />
      </mesh>
    </group>
  );
}
