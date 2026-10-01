# Reference / evidence governance

## First-party

- Board concept: `assets/gameboard concept art/` (inspected). Runtime JPEGs: `src/client/visual/art/arena-*.jpg`
- Card art: `assets/` card paintings via `src/client/visual/cardArt.ts`
- Icons: `assets/Icons/icon-*.svg`. Live in HUD: priority, action, crypto, database, deck, discard, hand, power
- Supply pile concept: `assets/Interface Elements/Supply Piles.png` (Draft layout)
- Effect animation refs: `assets/effect_animations/` (inspiration only)

## User-curated

Examples of Great / Good and competitive videos: V2 `06_RESOURCE_LIBRARY.md` (Snap `eKrOIG5tqJ4`, `hUi0eFuTi-g`; Good `NmkuxuKK_nU`, `zosDFA7_3M4`; `https://demo.drimgar.com/`). Inspiration. Do not imitate protected expression.

3JS technique URLs in the same file. Study technique. Original implementation.

## External research

Only for a specific gap. Record provenance.

## VisualBenchmarkPacket

Bounded packet for significant visual review: board/table, hand, cards, interaction, Node grouping, effect causality, motion, spectacle, reward, hierarchy, polish, plus first-party board/card/icon evidence.

## Effect provenance

Each implemented effect stores: `effect_id`, gameplay event, theatrical tier, first-party refs, code technique refs, theme tags, implementation mode, original files, visual intent, UX intent, performance notes. See `src/client/visual/fx/provenance.json`.
