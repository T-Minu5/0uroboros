/// <reference types="vite/client" />
import { servedArtPath } from './depthArt/depthManifest';
import { loadPerPlayer, savePerPlayer, type PerPlayer } from './playerSettings';
import type { PlayerColor } from './playerTheme';

const FOLDER = '/assets/card_art/card backs/';
const SOURCES = import.meta.glob('/assets/card_art/card backs/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The palette's black, which replaces the art's own near-black. */
const BACKING = '#030012';
/** The two colours the card back SVGs are drawn in. */
const ART_DARK = /#171717/gi, ART_LIGHT = /#e0e0e0/gi;
/** Card proportions, matching the original 921×1317 back. */
const W = 500, H = 700;

type Crop = readonly [x: number, y: number, width: number, height: number];
/** `crop` picks one emblem out of a sheet; `fit` is the largest share of the card's width and height the art may fill. */
type SvgBack = { id: string; label: string; file: string; crop: Crop; fit: readonly [number, number] };
type ImageBack = { id: string; label: string; image: string };

const EMBLEM_FIT = [.78, .56] as const;
/** The emblem sheets hold six emblems in three columns and two rows; crops are each emblem's measured bounds, padded for stroke and glow. */
const emblem = (id: string, label: string, file: string, crop: Crop): SvgBack => ({ id, label, file, crop, fit: EMBLEM_FIT });

export const CARD_BACKS = [
  { id: 'ouroboros', label: 'Ouroboros', file: 'Ouro-01.svg', crop: [0, 0, 500, 500], fit: [.96, .96] },
  emblem('triangle', 'Serpent triangle', 'Ouro-small-01.svg', [31, 31, 180, 187]),
  emblem('infinity', 'Infinity', 'Ouro-small-01.svg', [222, 47, 221, 154]),
  emblem('moon', 'Moon ring', 'Ouro-small-01.svg', [458, 38, 166, 174]),
  emblem('eye', 'Eye ring', 'Ouro-small-01.svg', [36, 259, 171, 185]),
  emblem('sun', 'Sun serpent', 'Ouro-small-01.svg', [220, 263, 235, 177]),
  emblem('twins', 'Twin rings', 'Ouro-small-01.svg', [465, 240, 151, 224]),
  emblem('delta', 'Delta ring', 'Ouro-small-06.svg', [36, 259, 171, 185]),
  { id: 'silicone', label: 'Silicone', image: `${FOLDER}cardback_02_silicone.png` },
] as const satisfies readonly (SvgBack | ImageBack)[];

export type CardBackId = (typeof CARD_BACKS)[number]['id'];
export const DEFAULT_CARD_BACK: CardBackId = 'ouroboros';

/** The art's markup without its own background, so the card's backing shows through. */
function artMarkup(file: string, light: string) {
  const source = SOURCES[`${FOLDER}${file}`];
  if (!source) return '';
  return source
    .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/<g id="BACKGROUND">[\s\S]*?<\/g>/, '')
    .replace(ART_DARK, BACKING).replace(ART_LIGHT, light);
}

/**
 * The art centred on a card-shaped backing, its light linework redrawn in the player's accent. The filter floods the
 * art's silhouette with the accent and blurs it twice for a tight and a wide halo; the art is drawn back over the halo,
 * so its dark knockouts stay dark and only the edges glow.
 */
function composeBack(back: SvgBack, accent: string) {
  const [x, y, width, height] = back.crop;
  const scale = Math.min(W * back.fit[0] / width, H * back.fit[1] / height), w = width * scale, h = height * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`
    + `<defs><filter id="glow" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">`
    + `<feFlood flood-color="${accent}"/><feComposite in2="SourceAlpha" operator="in" result="tint"/>`
    + `<feGaussianBlur in="tint" stdDeviation="2.5" result="near"/><feGaussianBlur in="tint" stdDeviation="9" result="far"/>`
    + `<feMerge><feMergeNode in="far"/><feMergeNode in="near"/><feMergeNode in="SourceGraphic"/></feMerge>`
    + `</filter></defs>`
    + `<rect width="${W}" height="${H}" fill="${BACKING}"/>`
    + `<g filter="url(#glow)"><svg x="${(W - w) / 2}" y="${(H - h) / 2}" width="${w}" height="${h}" viewBox="${x} ${y} ${width} ${height}">${artMarkup(back.file, accent)}</svg></g>`
    + `</svg>`;
}

const urls = new Map<string, string>();
function svgUrl(markup: string) {
  if (typeof URL.createObjectURL === 'function') return URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

const findBack = (id: CardBackId) => CARD_BACKS.find(entry => entry.id === id) ?? CARD_BACKS[0];

/** SVG markup for `id` glowing in `accent`; null for a fixed image back. */
export function cardBackMarkup(id: CardBackId, accent: string): string | null {
  const back = findBack(id);
  return 'image' in back ? null : composeBack(back, accent);
}

/** Image URL for `id` glowing in `color`; built once per back and colour, so repeated cards share one decoded image. */
export function cardBackSrc(id: CardBackId, color: PlayerColor): string {
  const back = findBack(id);
  if ('image' in back) return servedArtPath(back.image);
  const key = `${back.id}|${color.accent}`;
  let url = urls.get(key);
  if (!url) urls.set(key, url = svgUrl(composeBack(back, color.accent)));
  return url;
}

const STORAGE_KEY = 'ouroboros.cardBacks';

export function loadCardBacks(): PerPlayer<CardBackId> {
  return loadPerPlayer<CardBackId>(STORAGE_KEY, CARD_BACKS.map(back => back.id), [DEFAULT_CARD_BACK, DEFAULT_CARD_BACK]);
}

export function saveCardBacks(backs: PerPlayer<CardBackId>) {
  savePerPlayer(STORAGE_KEY, backs);
}
