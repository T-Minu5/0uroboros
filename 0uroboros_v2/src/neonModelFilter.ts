/** Authored GLB coordinates, before boardLayout's gameplay-preserving warp.
 * Only these independent hardware assemblies survive the Neon shell replacement.
 * Requiring every vertex in ONE assembly avoids retaining scraps of the broad
 * chassis, lane spines or perimeter that merely cross a hardware bounding box.
 */
type Point = { x: number; y: number; z: number };
const inside = (points: readonly Point[], test: (p: Point) => boolean) => points.every(test);

export function keepNeonHardware(points: readonly Point[], materialName: string) {
  if (/wine-black|restrained red/.test(materialName)) return false;
  // The Effect Bank outrigger plates are dropped; their slot rims are lifted out separately and stay.
  // The Node bridges go too: Neon builds its own Node housings (neonNodeHousing).
  // Server mounting beds are replaced by the Neon glass plinths.
  for (const sign of [-1, 1]) {
    // Resource instrument housings and their matte readout surfaces.
    if (inside(points, p => Math.abs(p.x) < 1.64 && p.z * sign > 4.05 && p.z * sign < 5.11 && p.y > -.106)) return true;
  }
  return false;
}
