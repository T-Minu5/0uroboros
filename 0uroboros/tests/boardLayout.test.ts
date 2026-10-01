/**
 * Pointer intent and board-space numbers. Presentation only.
 */

import { describe, expect, it } from 'vitest';

import { isDragGesture } from '../src/client/board/boardLayout';

describe('click versus drag', () => {
  it('treats a tap as inspect, not a drag', () => {
    expect(isDragGesture(0, 0, true)).toBe(false);
    expect(isDragGesture(12, 0, true)).toBe(false);
  });

  it('arms a drag only after the movement threshold', () => {
    expect(isDragGesture(3, 3, false)).toBe(false);
    expect(isDragGesture(8, 0, false)).toBe(true);
    expect(isDragGesture(0, 10, false)).toBe(true);
  });
});
