/**
 * Neon table frame finish: the original milky edge-lit glass, flaked white car paint, clear refractive liquid glass, or
 * the original glass refracting what's behind it as the liquid glass does.
 */
export type NeonSurface = 'glass' | 'paint' | 'liquid' | 'liquidGlass';

export const NEON_SURFACES: { id: NeonSurface; label: string }[] = [
  { id: 'glass', label: 'Glass' },
  { id: 'paint', label: 'Car paint' },
  { id: 'liquid', label: 'Liquid' },
  { id: 'liquidGlass', label: 'LiquidGlass' },
];
export const DEFAULT_NEON_SURFACE: NeonSurface = 'glass';

const STORAGE_KEY = 'ouroboros.neonSurface';

export function loadNeonSurface(): NeonSurface {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return NEON_SURFACES.some(option => option.id === saved) ? saved as NeonSurface : DEFAULT_NEON_SURFACE;
  } catch {
    return DEFAULT_NEON_SURFACE;
  }
}

export function saveNeonSurface(surface: NeonSurface) {
  try { localStorage.setItem(STORAGE_KEY, surface); } catch { /* storage unavailable */ }
}