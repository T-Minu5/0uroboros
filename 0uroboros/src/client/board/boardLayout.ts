/**
 * Shared board-space numbers.
 *
 * The 2D Node headers and the 3D columns both derive from these, so a card
 * dropped on a platform lands in the same column the HUD is labelling.
 */

export const NODE_SPACING = 2.35;
export const CARD_DEPTH_STEP = 0.42;

/** Portrait card in hand, facing the camera. */
export const HAND_CARD_WIDTH = 1.08;
export const HAND_CARD_HEIGHT = 1.5;

/**
 * Sit closer to the camera than the Node platforms (which end near z = 2.3)
 * so the hand is a separate band and its meshes win the raycast.
 */
export const HAND_Z = 3.55;
export const HAND_Y = 0.22;

export const CAMERA_POSITION: [number, number, number] = [0, 7.4, 8.6];

/** Lean the standing hand cards back so they face the elevated camera. */
export const HAND_PITCH = -Math.atan2(CAMERA_POSITION[1], CAMERA_POSITION[2]);

export const SPRING_FOLLOW = { mass: 1.15, tension: 170, friction: 26 } as const;
export const SPRING_SNAP = { mass: 0.9, tension: 220, friction: 24 } as const;

export const MAX_PITCH = 0.55;
export const MAX_YAW = 0.7;
export const MAX_ROLL = 0.42;

export const DRAG_THRESHOLD_PX = 8;

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
