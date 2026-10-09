/**
 * Neon table frame finish: the original milky edge-lit glass (Frosted), flaked white car paint (Pearl), or the original
 * glass refracting what's behind it (Glossy). Ids keep their original names so saved choices survive the labels.
 */
export type NeonSurface = 'glass' | 'paint' | 'liquidGlass';

export const NEON_SURFACES: { id: NeonSurface; label: string }[] = [
  { id: 'glass', label: 'Frosted' },
  { id: 'paint', label: 'Pearl' },
  { id: 'liquidGlass', label: 'Glossy' },
];
export const DEFAULT_NEON_SURFACE: NeonSurface = 'glass';

const STORAGE_KEY = 'ouroboros.neonSurface';

/** A retired finish (such as the old clear liquid) loads as the default. */
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
