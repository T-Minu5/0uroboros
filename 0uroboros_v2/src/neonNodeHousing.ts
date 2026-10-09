import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE_PITCH, LANE_RIM, NODE_X } from './boardLayout';

/**
 * Neon Node housing, traced from the Figma "Node" frame, which is drawn over the board at 1600x900, where the play
 * camera shows one world unit as 57px across. Outlines are in that frame's px, origin at its top left, y toward the
 * player. Each piece is placed so its top face lands where the frame draws it. Coordinates are Node-local, inside the
 * Neon field shift.
 */
type Pt = readonly [number, number];
type Outline = readonly Pt[];

/** Across: narrowed from the frame's 1/57 so neighbouring housings keep a gap. */
const KX = (LANE_PITCH - .14) / 175;
/** Along z: one frame px of screen height, foreshortened by the camera's elevation. */
const KZ = Math.hypot(18, 13.1) / 18 / 57;
/** Raising a point by 1 moves it this far up the screen, measured in z. */
const VIEW_Z_PER_Y = 13.1 / 18;
const CX = 87.03, Y0 = 112.5, REF_Y = .4;

export const designX = (px: number) => (px - CX) * KX;
/** World z, Node-local, at which height y shows at frame row py. */
export const designZ = (py: number, y: number) => (py - Y0) * KZ + (y - REF_Y) * VIEW_Z_PER_Y;

const at = (outline: Outline, dx: number, dy: number): Outline => outline.map(([x, y]) => [x + dx, y + dy]);
const flipY = (outline: Outline, axis: number): Outline => outline.map(([x, y]) => [x, axis - y]);

/** Top faces. The deck clears the lane glass (y .207), so the hulls and points overhang the lane ends. */
export const NODE_HEIGHTS = { floor: .075, deck: .215, base: .36, hull: .4, window: .405, bezel: .425, point: .43 } as const;

/** The near corners are cut back so the base's front wall stays under the player-facing hull's chamfers. */
const BASE: Outline = [[.03, 50.5], [19.5, 29], [155, 29], [175.03, 50.5], [175.03, 133], [167.06, 141], [8, 141], [.03, 133]];
const OPPONENT_HULL: Outline = [[.3, 50], [17.5, 30.4], [20.5, 29], [62.1, 29], [87.06, 4], [112.1, 29], [153.9, 29], [156.9, 30.4], [174, 50]];
const PLAYER_HULL: Outline = [[2.1, 137], [172.1, 137], [173.7, 140.5], [161.3, 152.9], [159.8, 153.5], [110.73, 153.5], [87.32, 176.9], [63.9, 153.5], [14.4, 153.5], [12.9, 152.9], [.6, 140.6]];
/** The top-left chamfer matches the bottom-right one. */
const WINDOW: Outline = at([[0, 12.55], [.6, 11.12], [11.42, .57], [12.81, 0], [138.6, 0], [140.1, .63], [147.46, 8.47], [148, 9.84], [148, 78.45], [147.4, 79.88], [136.58, 90.43], [135.19, 91], [6.87, 91], [5.4, 90.37], [.54, 85.19], [0, 83.82]], 13.03, 37);
const BEZEL: Outline = at([[0, 16.55], [1.81, 12.26], [12.62, 1.71], [16.81, 0], [142.63, 0], [147.01, 1.89], [154.37, 9.73], [156, 13.84], [156, 82.45], [154.19, 86.74], [143.38, 97.29], [139.19, 99], [10.87, 99], [6.49, 97.11], [1.63, 91.93], [0, 87.82]], 9.03, 33);
const VENTS: Outline[] = [
  at([[46.5, .5], [3.32, .5], [2.2, 2.99], [7.05, 8.49], [8.18, 9], [53.5, 9]], 8.03, 141),
  at([[112, .5], [155.18, .5], [156.3, 2.99], [151.45, 8.49], [150.32, 9], [105, 9]], 8.03, 141),
];
const OPPONENT_POINT: Outline = at([[6, 19], [0, 19.134], [19, 0], [38, 19], [32, 19], [19, 6]], 68.03, 0);
const PLAYER_POINT = flipY(OPPONENT_POINT, 181.134);

const ring = (points: Outline, y: number) => points.map(([px, py]) => new THREE.Vector2(designX(px), -designZ(py, y)));

function prism(outline: Outline, bottom: number, top: number, { holes = [], bevel = .008 }: { holes?: Outline[]; bevel?: number } = {}) {
  const shape = new THREE.Shape(ring(outline, top));
  holes.forEach(hole => shape.holes.push(new THREE.Path(ring(hole, top))));
  return new THREE.ExtrudeGeometry(shape, { depth: top - bottom - 2 * bevel, curveSegments: 1, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2 })
    .rotateX(-Math.PI / 2).translate(0, bottom + bevel, 0);
}

/** One geometry for all five Nodes, each piece placed at its Node. */
function perNode(pieces: THREE.BufferGeometry[]) {
  const placed = NODE_X.flatMap(x => pieces.map(piece => piece.clone().translate(x, 0, 0)));
  const merged = mergeGeometries(placed)!;
  [...pieces, ...placed].forEach(geometry => geometry.dispose());
  return merged;
}

export type NodeHousingPart = 'body' | 'playerHull' | 'bezel' | 'window';
/** The player-facing hull is a thin plate: the camera looks down onto its near edge, so a tall wall reads as a dark band. */
const PLATE = .02;

/**
 * Body: base, the plinth under it (kept between the lane ends, under the lane glass) and the opponent-facing hull.
 * The player-facing hull is the lighter piece; the bezel and vents are the dark ring and slots; the window sits
 * inside the bezel, under the Location plate.
 */
export function nodeHousingGeometries(): Record<NodeHousingPart, THREE.BufferGeometry> {
  const { floor, deck, base, hull, window, bezel } = NODE_HEIGHTS;
  const near = designZ(141, base), far = LANE_RIM[1].z1 + .01;
  // Narrower than the base, so its front wall stays under the player-facing hull's flat edge.
  const plinth = new THREE.BoxGeometry(147 * KX, deck - floor, near - far).toNonIndexed()
    .translate(designX(87.53), (floor + deck) / 2, (near + far) / 2);
  return {
    body: perNode([plinth, prism(BASE, deck, base), prism(OPPONENT_HULL, deck, hull)]),
    playerHull: perNode([prism(PLAYER_HULL, hull - PLATE, hull)]),
    bezel: perNode([prism(BEZEL, base, bezel, { holes: [WINDOW] }), ...VENTS.map(vent => prism(vent, hull - .01, hull + .003, { bevel: 0 }))]),
    window: perNode([prism(WINDOW, base, window, { bevel: .004 })]),
  };
}

/** The diamond point capping each hull's peak, a flat light on its top face: side 0 is the player's, its tip toward the player. */
export function nodePointGeometry(side: number) {
  const y = NODE_HEIGHTS.hull + .002;
  return new THREE.ShapeGeometry(new THREE.Shape(ring(side === 0 ? PLAYER_POINT : OPPONENT_POINT, y)), 1)
    .rotateX(-Math.PI / 2).translate(0, y, 0);
}

const LABEL_Y = NODE_HEIGHTS.point;
/** Power numbers sit in the peaks, under each point. */
export const NODE_POWER_ANCHOR = [{ y: LABEL_Y, z: designZ(150, LABEL_Y) }, { y: LABEL_Y, z: designZ(22, LABEL_Y) }] as const;
/** The Location window: half width, depth and centre at height y. */
export const nodeWindow = (y: number) => ({ halfX: 74 * KX, depth: 91 * KZ, z: designZ(82.5, y) });
