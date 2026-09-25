# Board perimeter refinement V2

Built with live Blender MCP in Blender 5.2.0 LTS. The original GLB was imported into an isolated scene, then refined without moving its meshes or gameplay anchors. Version 1 files remain intact.

Outputs:

- `assets/models/ouroboros-board-v2.glb` — production geometry, 5,433,184 bytes.
- `assets/models/ouroboros-board-v2.blend` — native file with final active scene `Ouroboros_Perimeter_V2.001` and retained prior scenes.
- `assets/models/board-v2-review.png` — actual Cycles render, 1600×1000, camera at Three.js `(0,18,13.8)` toward `(0,0,.7)`.
- `assets/models/board-v2-geometry-report.json` — verified counts and anchor preservation.
- `scripts/refine-board-v2.py` — reproducible refinement script; run through Blender MCP. Imports the immutable v1 GLB and writes only versioned v2 outputs.

The 49 new manufactured assemblies comprise three vented armor segments on each side, four raised rail catches, layered octagonal corner saddles with recessed inserts/captive fasteners, broad front and rear fascia wings, a projecting front console prow, rear service cassette, lower side armor/grooves and four underside feet. Front wings are five units wide with .52-unit vertical relief; the center prow has .58-unit relief. These broad facets produce readable highlights and contact shadows at the gameplay camera rather than depending on subpixel screw detail.

Both first-party board concepts and `docs/evidence/resource-hud-final.png` were visually inspected before construction. The refinement follows the concept's substantial layered perimeter, front mechanical depth and repeated vent language. Nothing was added inside card wells, Location bridges, Power sockets or other gameplay content regions. Cyan bank top surfaces, magenta inlay and all resource/hand/cache locations are unchanged. The review render was opened and inspected: side armor subdivisions and the broad front chamfers are visible, while the five paired wells remain visually quiet.

Binary GLB comparison confirmed all **51 anchor names, translations, rotations, scales and extras match v1** (transform tolerance 1e-5). There are still **9 material meshes and 9 materials**, with the original `OB / …` material names retained for the client's PBR tuning. Triangle count is **97,084**, up from 77,992. No render rig enters the GLB. Original geometry creation, mesh conversion, material batching and export all ran through Blender MCP; post-export JSON normalization only restores semantic names where Blender appended collision suffixes.

Integration changes only the GLB URL. The parent owns browser materials, textures, lighting and text. This file is geometry evidence, not a claim that the final integrated renderer matches the concept or that gameplay acceptance is complete.
