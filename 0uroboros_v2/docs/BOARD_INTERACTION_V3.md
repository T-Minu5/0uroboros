# Board interaction and layout V3

This pass implements the user's full-lane dragging and composition feedback. The approved rules, card placement capacity, opening sequence, Location copy and effects remain unchanged.

## Pointer interaction

The card lifts from its actual hand pose and retains the grab point as it follows the pointer. Pointer capture replaces the native browser drag image, keeping a full-opacity card face under the mouse. Its original hand space stays reserved. A short movement threshold preserves click-to-inspect.

Each player-side lane has a separate full-height hit region below its Location. Placement still lands in the existing compact grid. Only the valid lane under the pointer and its Location illuminate. Closed, full or unaffordable lanes do not advertise a legal drop. Releasing elsewhere, Escape, pointer cancellation or window blur returns the card to the hand. A quick re-grab cancels an unfinished return cleanly. On a valid drop, the placement flight starts at the release pose and turns the same card face down as it reaches its slot.

After resolution, the leading player's half of a Location has a soft surface glow. Ties stay neutral. These standing glows temporarily recede during a drag so the hovered destination is unambiguous.

## Composition and geometry

- The camera shifts the board upward by approximately 60 screen pixels while preserving its angle and scale. Hand and stats have more clearance.
- The local Server housings and shader cores are lower and narrower. Their integrity readouts sit below the bank, clear of the probability shoulders.
- The percentages use larger slanted cream lettering on peaked physical plates, following the first-party no-card board concept.
- All ten circular Power housings are replaced with rhombus mounts. Numbers remain a simple overlay with no icon or duplicate bezel.
- Resolution keeps the rhombus unobscured; a leftover square score outline is removed.
- Ten red lane assemblies are removed. The V2 perimeter, original material maps and restrained Server lighting are retained.

The native source is `assets/models/ouroboros-board-v3.blend`; runtime loads `ouroboros-board-v3.glb`. The GLB has 78,964 triangles, nine material meshes, and is 4,767,772 bytes. All 51 semantic anchor names and metadata survive. Exactly 17 intended positions change: ten Power anchors, five probability anchors and two local integrity anchors. The other 34 positions are unchanged. `scripts/verify-board-v3.py` verifies this contract and writes `assets/models/board-v3-geometry-report.json`.

## Validation and evidence

All 56 existing engine/session tests pass. The TypeScript/Vite production build passes; its existing renderer chunk-size warning remains. Geometry-contract verification also passes.

The pointer regression is `npm run test:pointer`, with the local server running. It checks pointer tracking, lane-edge hover, closed-lane rejection, immediate re-grab, Escape, release-flight continuity, a successful drop below the compact grid, click inspection, winning-lane illumination and layout at 1600×1000 and 1366×900. Results are saved in `evidence/board-pointer-qa.json`.

The final run passed all 21 checks with zero console or page errors. Standing winning-lane lights return after dragging; during the drag, only the hovered valid lane is lit.

The complete-Cycle browser test now reads an effect's presence and color in the same browser operation. The earlier separate queries could read a detached effect between fast animation beats and report an empty computed color. The assertion still checks the exact resource palette.

The final two-Cycle playthrough passes at normal and fast pace: 15 deployments, two purchases, two free privilege claims, both Collapse/Draft transitions and entry into Cycle 3, with zero browser exceptions. Five-card opening and Crypto conservation pass; opening intervals are 797 and 799 ms. All four observed effect colors match the approved palette, and populated cards clear the percentages. Full results: `evidence/browser-play.json`; populated and effect captures: `evidence/populated-board-final.png` and `evidence/drain-in-play.png`.

The screenshot review covers `evidence/pointer-lane-hover.png`, `evidence/board-interaction-1600.png`, `evidence/board-interaction-1366.png`, and `evidence/winning-lanes.png`. Measured clearances in the two viewport checks are at least 44 px between the raised hand card and player stats; Power numerals clear the Location plaques by at least 2.9 px. Probability labels do not overlap local Server regions.

Implementation: `src/useCardPointerDrag.ts`, `src/board-interaction.css`, `src/App.tsx`, `src/BoardScene.tsx`, `src/ServerLights.tsx`. Geometry reproduction: `scripts/build-board-v3-base.py` followed by `scripts/refine-board-v3.py` through Blender MCP. Production packaging includes the V3 GLB; authoring files and reference art remain excluded.
