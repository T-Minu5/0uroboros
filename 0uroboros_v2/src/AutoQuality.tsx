import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createQualityMonitor, isSoftwareRenderer, sampleQuality, type QualityLevel } from './graphicsQuality';

function rendererName(gl: WebGL2RenderingContext | WebGLRenderingContext) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
}

/** Steps the board's graphics quality down when frames run slow and back up when there is headroom. */
export function AutoQuality({ level, onChange }: { level: QualityLevel; onChange: (level: QualityLevel) => void }) {
  const gl = useThree(state => state.gl);
  const monitor = useRef(createQualityMonitor(level));
  const latest = useRef({ level, onChange });
  latest.current = { level, onChange };
  useEffect(() => {
    if (!isSoftwareRenderer(rendererName(gl.getContext()))) return;
    monitor.current = createQualityMonitor('low', 'low');
    if (latest.current.level !== 'low') latest.current.onChange('low');
  }, [gl]);
  useEffect(() => {
    if (monitor.current.level !== level) monitor.current = createQualityMonitor(level, monitor.current.ceiling);
  }, [level]);
  useFrame((_, delta) => {
    const next = sampleQuality(monitor.current, delta);
    if (next) latest.current.onChange(next);
  });
  return null;
}
