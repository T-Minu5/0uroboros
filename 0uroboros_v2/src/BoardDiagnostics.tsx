import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { BoardStyle } from './boardStyles';

/** Opt-in development measurement: ?boardStats=1. Counts the entire post-processing frame. */
export function BoardDiagnostics({ style, phase }: { style: BoardStyle; phase: string }) {
  const { gl } = useThree();
  const samples = useRef({ since: 0, warmup: 2, frames: [] as number[], calls: [] as number[], triangles: [] as number[] });
  useEffect(() => {
    samples.current = { since: 0, warmup: 2, frames: [], calls: [], triangles: [] };
  }, [style, phase]);
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = previous; };
  }, [gl]);
  useFrame(() => gl.info.reset(), -1000);
  useFrame((_, delta) => {
    const s = samples.current;
    if (document.hidden) { s.warmup = 2; return; }
    if (s.warmup > 0) { s.warmup -= delta; return; }
    s.frames.push(delta * 1000); s.calls.push(gl.info.render.calls); s.triangles.push(gl.info.render.triangles);
    s.since += delta;
    if (s.since < 5) return;
    const percentile = (values: number[], fraction: number) => {
      values.sort((a, b) => a - b);
      return Math.round(values[Math.min(values.length - 1, Math.floor(values.length * fraction))] * 100) / 100;
    };
    console.info('BOARD_STATS', JSON.stringify({
      style, phase, frames: s.frames.length, fps: Math.round(s.frames.length / s.since * 10) / 10,
      frameMs: { p50: percentile(s.frames, .5), p95: percentile(s.frames, .95) },
      drawCalls: percentile(s.calls, .5), triangles: percentile(s.triangles, .5),
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length,
      viewport: [gl.domElement.clientWidth, gl.domElement.clientHeight], pixelRatio: gl.getPixelRatio(),
    }));
    s.since = 0; s.frames.length = s.calls.length = s.triangles.length = 0;
  }, 1000);
  return null;
}
