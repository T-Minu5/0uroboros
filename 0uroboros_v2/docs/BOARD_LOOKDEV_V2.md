# Board LookDev V2 — evaluation checkpoint

This pass develops the table around the approved center Nodes. Their plaques, wording, opening animation and timing remain unchanged. Gameplay definitions and the evaluation content pack are unchanged.

## Direction and result

The first-party board layouts remain layout authority. The sibling `Best Layout and design` images informed broad blue-gray housing reflections, recessed colored channels, layered armor, and quiet dark surfaces. Official Snap imagery and the available Hearthstone material informed presentation hierarchy rather than a borrowed skin. Exact sources, observations and retrieval limits are in [the independent study](LOOKDEV_MATERIAL_CRITIQUE.md).

- **Physical structure:** Blender MCP produced a versioned board with 49 additional perimeter assemblies: segmented vented rails, layered corner saddles, captive fasteners, broad front fascia and a console prow. All 51 exported semantic anchors match V1. Nine material batches, 97,084 triangles, 5.43 MB GLB. Source, native Blender file and geometry validation are retained; see [geometry evidence](BOARD_V2.md).
- **Materials:** machined graphite/titanium, darker rough polymer, and smoked wine glass now have distinct reflectance. Three original deterministic texture maps add directional microfinish, mineral-resin variation and quiet circuit/orbital engraving. No reference-image pixels or external game assets were copied. Packed material data stays in linear/non-color space and is projected in world space to avoid mismatched UV scale across joined Blender components.
- **Lighting:** broad neutral environment reflections reveal the machined facets. Pink/blue accents remain at the perimeter. Four rectangular Server lights replace circular point-light hotspots. Their illuminated cores retain animated integrity fill and gold healing, with lower average emission and darker end regions. New idle scanning respects reduced-motion preference.
- **Grounding and finish:** a matte resin stage, short soft contact shadows, restrained local spill, and thresholded HDR bloom replace long hard ground silhouettes. A single OutputPass handles output tone mapping. Card edges and the End Turn instrument receive modest physical shading.
- **Startup:** entry waits for the first completed table render, so a fresh or slower asset load cannot consume the opening sequence over an empty background.
- **Score legibility:** the smaller-window review exposed pre-existing opponent-score clipping by Location plaques (approximately 10 px). Raised physical score mounts and matching text elevation clear the unchanged plaques by at least 2 px at 1366×900. The original exported anchors and Node geometry remain intact; this is an added presentation mount.

## Iteration actually performed

The first integrated render made the glass too similar in value to metal and left circular cyan hotspots. Independent screenshot review identified both. The second pass darkened glass/polymer, replaced point lights with rectangular sources, and removed the long hard stage shadow. Engraving was then adjusted to survive minification at gameplay scale without competing with the cards. A review caught undefined negative-base GLSL `pow` expressions in the new spill shader; those expressions and the matching Server sweep now use nonnegative bases. Final viewport inspection caught and corrected the far-score overlap.

## Validation

- All 56 existing rules/session tests pass; production TypeScript/Vite build passes.
- Two full Chrome Cycles completed at normal and fast pace: 15 deployments, two purchases, one privilege claim, Collapse/Draft/next-Cycle transitions, no browser exceptions, and no card/probability overlap. Opening intervals observed at 794 and 814 ms around the intended 800 ms. Action/Crypto/draw/healing color checks passed. Results: `evidence/browser-play.json`.
- A further focused Cycle after the score-mount correction completed four deployments, a purchase, a privilege claim, Collapse/Draft and the next Cycle with zero exceptions (`evidence/board-final-cycle.json`).
- Final render checks cover 1600×1000 and 1366×900, resource requests, console/shader errors, context loss, bounds, score clearance, and reduced-motion startup: `evidence/board-visual-qa.json`.
- Local idle sampling on Apple M5 Max / ANGLE Metal measured a 16.7 ms median frame interval at both sizes, over 180 frames per size. This is a short local responsiveness check, not a claim about low-end devices or worst-case effect performance.
- Production assets include the V2 GLB and the three maps. Reference art, competitor imagery, animation references and Blender authoring files are excluded by the production asset copy list.

## Evidence and continued limits

Before: `evidence/board-lookdev-before.png`. Final idle views: `evidence/board-lookdev-1600.png`, `evidence/board-lookdev-1366.png`. Populated/effect views: `evidence/populated-board-final.png`, `evidence/drain-in-play.png`. Earlier iteration captures are also retained.

The table is more coherent and physical, but this is not a claim of Snap/Hearthstone parity. Bespoke environmental animation/audio, further card-face craft, some missing card identities, the complete market catalog, and broad device testing remain outside this material pass. The current full-scene postprocess and area-light support increase the renderer bundle; Vite still reports its existing large-chunk warning. The long-term competitive target needs further focused art and performance work, not simply more bloom.

## Reproduction and technical sources

`scripts/refine-board-v2.py` reproduces the Blender refinement through the Blender MCP session. `scripts/build-board-textures.py` reproduces the original maps with Python, Pillow and NumPy. Runtime surface projection/materials live in `src/boardMaterials.ts`; environment, stage and postprocessing live in `src/BoardAtmosphere.tsx` and `src/BoardScene.tsx`; integrity lighting lives in `src/ServerLights.tsx`.

Primary technical references actually inspected: [Three.js physical material](https://threejs.org/docs/pages/MeshPhysicalMaterial.html), [clearcoat example source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_materials_physical_clearcoat.html), [RectAreaLight](https://threejs.org/docs/pages/RectAreaLight.html), [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html), and the installed Three.js EffectComposer, OutputPass and shader chunks. The supplied [depth scan study](https://tympanus.net/codrops/2025/03/31/webgpu-scanning-effect-with-depth-maps/) was reviewed; its original assets and WebGPU implementation are not shipped.
