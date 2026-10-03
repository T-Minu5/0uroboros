/// <reference types="vite/client" />
import { cardNameKey } from './cardArtwork';

/**
 * Clips are named after their card. A plain name plays in the inspect view; the `_onFX` suffix marks the clip
 * played on the board card while its effects resolve. `Board` holds table backdrops, not card clips.
 */
const files = import.meta.glob(['/assets/videos/**/*.mp4', '!/assets/videos/Board/**'], {query: '?url', import: 'default', eager: true}) as Record<string, string>;
const ON_FX = /_onfx$/i;
const inspectClips = new Map<string, string>(), effectClips = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
 const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.mp4$/i, '');
 (ON_FX.test(stem) ? effectClips : inspectClips).set(cardNameKey(stem.replace(ON_FX, '')), url);
}

/**
 * Cards whose effect clip plays as the local player sets the card down in a lane, rather than when its effects
 * resolve. The opponent's copies play no clip.
 */
const PLAYS_ON_PLACEMENT = new Set(([] as string[]).map(cardNameKey));
/** Playback speed and the hold after the landing flip, for clips that play on placement. */
export const PLACEMENT_CLIP_RATE = 1.5;
export const PLACEMENT_CLIP_DELAY_MS = 200;

type VideoCard = {name: string; definitionId?: string};
const keys = (card: VideoCard) => [cardNameKey(card.name), ...(card.definitionId ? [cardNameKey(card.definitionId)] : [])];

/**
 * A card's clips are held in memory once it is in the game. Streaming one on first use stalls its opening frames,
 * which made whichever side resolved first look choppier than the other.
 */
const held = new Set<string>();
export function warmCardVideos(card: VideoCard) {
 if (typeof window === 'undefined' || typeof fetch !== 'function') return;
 for (const clips of [effectClips, inspectClips]) for (const key of keys(card)) {
  const url = clips.get(key);
  if (!url || held.has(url)) continue;
  held.add(url);
  void fetch(url).then(response => response.ok ? response.blob() : Promise.reject())
   .then(blob => { if (clips.get(key) === url) clips.set(key, URL.createObjectURL(blob)); })
   .catch(() => undefined);
 }
}

const lookup = (clips: Map<string, string>, card: VideoCard) =>
 clips.get(cardNameKey(card.name)) ?? (card.definitionId ? clips.get(cardNameKey(card.definitionId)) : undefined);
export const cardInspectVideo = (card: VideoCard) => lookup(inspectClips, card);
export const cardEffectVideo = (card: VideoCard) => lookup(effectClips, card);
export const effectVideoOnPlacement = (card: VideoCard) => keys(card).some(key => PLAYS_ON_PLACEMENT.has(key));
