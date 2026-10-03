import * as THREE from 'three';

/** Scratched-glass photos laid over the Neon glass; only their white marks add light. */
export const GLASS_SCRATCH_TEXTURES = [
  { id: 'none', label: 'Off', url: null },
  { id: 'scratch-01', label: 'Scratch 1', url: '/assets/board/glass/scratch-01.jpg' },
  { id: 'scratch-02', label: 'Scratch 2', url: '/assets/board/glass/scratch-02.jpg' },
] as const;
export type GlassScratchId = typeof GLASS_SCRATCH_TEXTURES[number]['id'];

/** Width over height of the source photos. */
export const GLASS_SCRATCH_ASPECT = 6016 / 4016;

export const DEFAULT_GLASS_SCRATCH = {
  texture: 'scratch-01' as GlassScratchId,
  /** Brightness of the white marks. */
  strength: 1,
  /** World units one texture width spans; the table is about 18.7 wide. */
  scale: 19,
  /** Source brightness below which the photo shows nothing. */
  cutoff: .18,
  /** Texture rotation in degrees. */
  rotation: 0,
};
export type GlassScratchSettings = typeof DEFAULT_GLASS_SCRATCH;

const STORAGE_KEY = 'ouroboros.glassScratch.v1';
export const glassScratch: GlassScratchSettings = { ...DEFAULT_GLASS_SCRATCH };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<GlassScratchSettings>;
  Object.assign(glassScratch, saved);
  if (!GLASS_SCRATCH_TEXTURES.some(t => t.id === glassScratch.texture)) glassScratch.texture = DEFAULT_GLASS_SCRATCH.texture;
} catch { /* storage unavailable */ }

export function setGlassScratch(next: Partial<GlassScratchSettings>) {
  Object.assign(glassScratch, next);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(glassScratch)); } catch { /* storage unavailable */ }
}

const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

/** Shared texture for the selected photo, or null when off. Loads on first request and stays cached. */
export function glassScratchTexture(id: GlassScratchId): THREE.Texture | null {
  const url = GLASS_SCRATCH_TEXTURES.find(t => t.id === id)?.url;
  if (!url) return null;
  let texture = textures.get(url);
  if (!texture) {
    texture = loader.load(url);
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    textures.set(url, texture);
  }
  return texture.image ? texture : null;
}
