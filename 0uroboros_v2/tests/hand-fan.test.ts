import { describe, expect, it } from 'vitest';
import { HAND_BASE_OVERLAP, handOverlap, handSpill } from '../src/handFan';

const W = 120, H = 168;
/** Visible width of the fan, including the outer cards' tilt. */
function fanWidth(count: number, room: number) {
  const overlap = handOverlap(count, room, W, H);
  return (count - 1) * (W - 2 * overlap) + W + 2 * handSpill(count, W, H);
}

describe('hand fan spacing', () => {
  it('keeps natural spacing while the hand has room', () => {
    expect(handOverlap(5, 646, W, H)).toBe(HAND_BASE_OVERLAP);
  });

  it('never spans less as the hand grows', () => {
    for (const room of [500, 646, 900]) {
      let previous = 0;
      for (let count = 1; count <= 14; count++) {
        const width = fanWidth(count, room);
        expect(width).toBeGreaterThanOrEqual(previous - .01);
        previous = width;
      }
    }
  });

  it('fills but does not exceed the room once crowded', () => {
    for (const count of [7, 9, 12]) expect(fanWidth(count, 646)).toBeCloseTo(646, 5);
  });
});
