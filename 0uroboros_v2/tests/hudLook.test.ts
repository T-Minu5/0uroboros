import { describe, expect, it } from 'vitest';
import { MAX_LOOK, MAX_SPREAD, easeLook, mouseLook } from '../src/hudLook';
import { RIPPLE_OPENING_BOOST, rippleBoost } from '../src/Singularity';

describe('black hole HUD look', () => {
  it('is flat and face-on with the cursor at the centre', () => {
    const look = mouseLook(0, 0);
    expect(look.yaw).toBeCloseTo(0);
    expect(look.pitch).toBeCloseTo(0);
    expect(look.spread).toBe(0);
  });

  it('turns toward the cursor, capped at the screen edge', () => {
    expect(mouseLook(1, 0).yaw).toBeCloseTo(MAX_LOOK);
    expect(mouseLook(-3, 0).yaw).toBeCloseTo(-MAX_LOOK);
    // Cursor above: the face tips up, which is a negative turn about X.
    expect(mouseLook(0, 1).pitch).toBeCloseTo(-MAX_LOOK);
    expect(mouseLook(.5, 0).yaw).toBeGreaterThan(0);
    expect(mouseLook(.5, 0).yaw).toBeLessThan(MAX_LOOK);
  });

  it('spreads further the further the cursor is from the centre', () => {
    const spreads = [0, .25, .5, .75, 1].map(t => mouseLook(t, t).spread);
    spreads.slice(1).forEach((spread, i) => expect(spread).toBeGreaterThan(spreads[i]));
    expect(mouseLook(1, 1).spread).toBeCloseTo(MAX_SPREAD);
    expect(mouseLook(4, -4).spread).toBeCloseTo(MAX_SPREAD);
  });

  it('eases toward the target pose', () => {
    const look = { yaw: 0, pitch: 0, spread: 0 };
    easeLook(look, { yaw: 1, pitch: -1, spread: 2 }, .5);
    expect(look).toEqual({ yaw: .5, pitch: -.5, spread: 1 });
  });
});

describe('opening ripples', () => {
  it('start at 4x distortion and step down to normal', () => {
    expect(RIPPLE_OPENING_BOOST[0]).toBe(4);
    const boosts = Array.from({ length: 6 }, (_, wave) => rippleBoost(wave));
    boosts.slice(1).forEach((boost, i) => expect(boost).toBeLessThanOrEqual(boosts[i]));
    expect(boosts.slice(RIPPLE_OPENING_BOOST.length)).toEqual([1, 1, 1]);
  });
});
