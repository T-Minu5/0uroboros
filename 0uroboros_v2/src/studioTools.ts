/**
 * Build-time switch for studio-only UI inside the game client (agent panels, test games, dev game log).
 * `__STUDIO__` is defined by Vite: `true` for the dev server and the full build, `false` for `build:client`,
 * where every `STUDIO_TOOLS &&` branch and its dynamic import are removed from the bundle.
 */
declare const __STUDIO__: boolean;
export const STUDIO_TOOLS: boolean = typeof __STUDIO__ === 'undefined' ? true : __STUDIO__;
