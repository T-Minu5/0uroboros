import { createContext, useContext, type CSSProperties } from 'react';
import { GOLD_GRADIENT } from './boardMaterials';

/** The colours a player may claim. */
export type PlayerColorId = 'red' | 'gold' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink';
/** One choice per `PlayerId`; index 0 is the local player. */
export type ColorTheme = [PlayerColorId, PlayerColorId];

const rgb = (hex: string) => {const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] as const;};
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
/** Toward black in sRGB. */
const shade = (color: string, k: number) => {const [r, g, b] = rgb(color); return hex(r * k, g * k, b * k);};
/** Toward white in sRGB. */
const tint = (color: string, k: number) => {const [r, g, b] = rgb(color); return hex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);};
/** `rgba()` at partial alpha, for HUD glows that sit over the dark board. */
const alpha = (color: string, a: number) => {const [r, g, b] = rgb(color); return `rgba(${r},${g},${b},${a})`;};

/** Inlay gradient stops: lit rim, mid shade, dark base — the shape `inlayMaterial` sweeps across the bay. */
export type InlayGradient = {rim: string; deep: string; base: string};
type ColorSource = {
 label: string;
 /** Headline hue: lane rim, winner chevrons, side fill light, Settings swatch. */
 accent: string;
 /** Server tube tint. Luminance is normalised in the tube shader, so only the hue carries. */
 tube: string;
 /** Pale wash for that side's rect-area light. */
 light: string;
 /** Effect Bank bay rims. */
 inlay: InlayGradient;
};
export type PlayerColor = ColorSource & {
 id: PlayerColorId;
 /** Near-black companion to `accent`, for socket insets and the side accent batches' diffuse colour. */
 shadow: string;
};

/** Deep and base stops hold the rim's hue at roughly 35% and 16% lightness, following the authored gold. */
const PALETTE: Record<PlayerColorId, ColorSource> = {
 red:    {label: 'Red',    accent: '#fa0048', tube: '#ff1f5e', light: '#ffa8c2', inlay: {rim: '#fa0048', deep: '#94002b', base: '#440014'}},
 gold:   {label: 'Gold',   accent: '#ffcc12', tube: '#ffcc12', light: '#ffe9a8', inlay: GOLD_GRADIENT},
 yellow: {label: 'Yellow', accent: '#fff700', tube: '#fff833', light: '#fffbb0', inlay: {rim: '#fff700', deep: '#948f00', base: '#444200'}},
 green:  {label: 'Green',  accent: '#1fffb1', tube: '#3affbc', light: '#b4ffe6', inlay: {rim: '#1fffb1', deep: '#1a9470', base: '#0d4433'}},
 cyan:   {label: 'Cyan',   accent: '#27e2ff', tube: '#08dfff', light: '#a8f0ff', inlay: {rim: '#27e2ff', deep: '#16788f', base: '#0a3544'}},
 blue:   {label: 'Blue',   accent: '#4185ff', tube: '#5c9bff', light: '#b8d2ff', inlay: {rim: '#4185ff', deep: '#1d4d94', base: '#0f2344'}},
 purple: {label: 'Purple', accent: '#b24cff', tube: '#bd63ff', light: '#ddb4ff', inlay: {rim: '#b24cff', deep: '#5e2694', base: '#2b1044'}},
 pink:   {label: 'Pink',   accent: '#ff0ba1', tube: '#ff2fb0', light: '#ffa8dc', inlay: {rim: '#ff0ba1', deep: '#94065e', base: '#440230'}},
};
/** Settings swatch order. */
export const PLAYER_COLOR_IDS = ['red', 'gold', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;
/** Used until a player saves their own choice. */
export const DEFAULT_THEME: ColorTheme = ['cyan', 'purple'];

const build = (id: PlayerColorId, source: ColorSource): PlayerColor => ({id, ...source, shadow: shade(source.accent, .26)});
const CHOSEN = Object.fromEntries(PLAYER_COLOR_IDS.map(id => [id, build(id, PALETTE[id])])) as Record<PlayerColorId, PlayerColor>;

/** Both sides resolved; entries are stable singletons, so they can be used directly as memo dependencies. */
export type ResolvedColorTheme = readonly [PlayerColor, PlayerColor];
export const playerColor = (choice: PlayerColorId): PlayerColor => CHOSEN[choice];
export const resolveColorTheme = (theme: ColorTheme): ResolvedColorTheme => [playerColor(theme[0]), playerColor(theme[1])];
export const DEFAULT_COLORS: ResolvedColorTheme = resolveColorTheme(DEFAULT_THEME);
export const colorChoiceLabel = (choice: PlayerColorId) => PALETTE[choice].label;
/** Two sides may not share a headline hue, or the board cannot tell them apart. */
export const colorTaken = (theme: ColorTheme, owner: 0 | 1, choice: PlayerColorId) => theme[owner ? 0 : 1] === choice;
export const withPlayerColor = (theme: ColorTheme, owner: 0 | 1, choice: PlayerColorId): ColorTheme => owner ? [theme[0], choice] : [choice, theme[1]];

const STORAGE_KEY = '0uroboros.colorTheme';
const isChoice = (value: unknown): value is PlayerColorId => (PLAYER_COLOR_IDS as readonly unknown[]).includes(value);
export function loadColorTheme(): ColorTheme {
 try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  if (Array.isArray(saved) && saved.length === 2 && saved.every(isChoice) && saved[0] !== saved[1]) return [saved[0], saved[1]];
 } catch { /* Unreadable storage falls back to the default. */ }
 return DEFAULT_THEME;
}
export function saveColorTheme(theme: ColorTheme) {
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)); } catch { /* Private mode: the choice lasts for this session only. */ }
}

/** Custom properties for a HUD instrument owned by one player, consumed by the server bar and Effect Bank. */
export function playerColorVars(color: PlayerColor) {
 return {
  '--player-base': color.accent,
  // Integrity bar: the tube hue darkened for the bar's base and lifted for its lit top.
  '--player-fill-low': shade(color.tube, .7),
  '--player-fill-high': tint(color.tube, .5),
  '--player-fill-glow': alpha(color.tube, .4),
  '--player-label': tint(color.tube, .55),
  '--player-bank-label': tint(color.accent, .5),
 } as CSSProperties;
}

const PlayerColorsContext = createContext<ResolvedColorTheme>(DEFAULT_COLORS);
export const PlayerColorsProvider = PlayerColorsContext.Provider;
/** Board-side hook; each component reads its own half with `usePlayerColors()[side]`. */
export const usePlayerColors = () => useContext(PlayerColorsContext);
