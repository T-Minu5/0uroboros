/**
 * Shared board-space numbers.
 *
 * Five location pads sit in a row on the table. Overlay Power gems and
 * Location plaques project onto the same X slots the 3D cards occupy.
 */

export const NODE_SPACING = 2.5;
export const CARD_DEPTH_STEP = 0.28;

/** Width of a location pad along X. */
export const NODE_PLATFORM_WIDTH = 2.05;
/** Depth of each player's card field along Z. */
export const NODE_HALF_DEPTH = 1.18;
/** Gap along Z reserved for the Location tile. */
export const NODE_CENTER_GAP = 1.08;
/** Center-Z of each player's card field. */
export const NODE_HALF_Z = NODE_CENTER_GAP / 2 + NODE_HALF_DEPTH / 2;
/** First card on the local player's half, toward the camera. */
export const SELF_LANE_Z = NODE_CENTER_GAP / 2 + 0.28;
export const RIVAL_LANE_Z = -SELF_LANE_Z;

/** Portrait card in hand, facing the camera. */
export const HAND_CARD_WIDTH = 1.08;
export const HAND_CARD_HEIGHT = 1.5;

/** Portrait cards standing slightly off the table. */
export const BOARD_CARD_WIDTH = 0.9;
export const BOARD_CARD_HEIGHT = 1.24;
export const BOARD_CARD_TILT = -0.48;

/**
 * Sit closer to the camera than the Node wells (which end near z = 2.0)
 * so the hand is a separate band and its meshes win the raycast.
 */
export const HAND_Z = 3.35;
export const HAND_Y = 0.22;

export const CAMERA_POSITION: [number, number, number] = [0, 7.8, 6.7];
export const CAMERA_FOV = 34;
export const CAMERA_LOOK_AT: [number, number, number] = [0, 0, 0.12];

/** Lean the standing hand cards back so they face the elevated camera. */
export const HAND_PITCH = -Math.atan2(CAMERA_POSITION[1], CAMERA_POSITION[2]);

export const SPRING_FOLLOW = { mass: 1.15, tension: 170, friction: 26 } as const;
export const SPRING_SNAP = { mass: 0.9, tension: 220, friction: 24 } as const;

export const MAX_PITCH = 0.55;
export const MAX_YAW = 0.7;
export const MAX_ROLL = 0.42;

export const DRAG_THRESHOLD_PX = 8;

/** Click/tap vs drag. Taps never count as drags. */
export function isDragGesture(
  mx: number,
  my: number,
  tap: boolean,
  threshold = DRAG_THRESHOLD_PX,
): boolean {
  if (tap) return false;
  return Math.hypot(mx, my) >= threshold;
}

/** Overlay Node column under a pointer. Used when the 3D ray misses. */
export function nodeIndexFromPoint(clientX: number, clientY: number): number | null {
  if (typeof document === 'undefined') return null;
  const el = document.elementFromPoint(clientX, clientY);
  const head = el?.closest<HTMLElement>('[data-node]');
  if (!head) return null;
  const index = Number(head.getAttribute('data-node'));
  return Number.isInteger(index) ? index : null;
}

/** Lane under a drag pointer using projected column boxes, ignoring the flight card. */
export function nodeIndexFromLaneBoxes(
  clientX: number,
  clientY: number,
  boxes: { index: number; left: number; width: number }[] | null | undefined,
): number | null {
  if (!boxes?.length || typeof document === 'undefined') return null;
  const board = document.querySelector('.board');
  if (!board) return null;
  const rect = board.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (y < 0 || y > rect.height) return null;
  const hit = boxes.find((box) => x >= box.left && x <= box.left + box.width);
  return hit?.index ?? null;
}

export function nodeWorldX(index: number, nodeCount: number): number {
  return (index - (nodeCount - 1) / 2) * NODE_SPACING;
}

export function nodeIndexAtX(x: number, nodeCount: number): number | null {
  const mid = (nodeCount - 1) / 2;
  const index = Math.round(x / NODE_SPACING + mid);
  if (index < 0 || index >= nodeCount) return null;
  if (Math.abs(x - nodeWorldX(index, nodeCount)) > NODE_SPACING / 2) return null;
  return index;
}

export function frustumHalfWidth(nodeCount: number): number {
  return (nodeCount * NODE_SPACING) / 2 + 0.6;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
