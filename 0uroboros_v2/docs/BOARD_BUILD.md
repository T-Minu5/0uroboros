# Blender board production evidence

The board was authored in the live Blender 5.2.0 LTS application through `mcp__blender__execute_blender_code`, using `scripts/build-board.py`. This is original mesh construction, not a flat board image. The initial `Scene` with Cube, Camera and Light was inspected and preserved. The active `Ouroboros_Table_V31.001` scene contains the final production board and review lighting; the first board revision is retained separately.

## Visual authority and interpretation

Both `assets/board/game-board_without cards.png` and `game-board_with cards.png` were opened and visually inspected before modeling. V3.1 UX, LookDev, effects policy and approved board-layout addition were read. The empty-hand concept supplied the layered magenta chassis, five longitudinal paired wells, red axial circuits, central violet Location bridges, independent power sockets above/below every Location, cyan Backup banks on the left and Primary banks on the right, and front resource console. The hand concept supplied foreground clearance and separation of the lower-right Crypto Cache from the hand. A single End Turn screen is provided; runtime timer depletion belongs to the client.

Duration outriggers and pile recesses occupy the left periphery, with four portrait bays in a horizontal row at the far-left and near-left, matching the concept layout. Dynamic values, card art, rules, state and labels intentionally belong to the client and are not baked into geometry.

## Outputs

- `assets/models/ouroboros-board.glb`: self-contained glTF 2.0 board, Y-up, with semantic anchors and material batches.
- `assets/models/ouroboros-board.blend`: native scene, source mesh batches, studio lighting and camera, with original scene preserved.
- `assets/models/board-review.png`: actual Cycles render, 1600 × 1100, 40 samples. Render was opened and visually inspected: all five integrated Node bridges, ten independent power sockets, cyan banks and foreground utility areas are visible; the central hand clearance remains empty.
- `assets/models/board-regions.json`: exact gameplay integration coordinates.
- `scripts/build-board.py`: reproducible source, executed through Blender MCP. Running again creates another scene without deleting existing content.

## Integration coordinates

All values below are glTF/Three.js world coordinates: X right, Y up, positive Z toward the local player. Blender receives `(x,-z,y)` and the exporter applies Y-up conversion.

Node centers X = `[-5.6,-2.8,0,2.8,5.6]`. Location plate top Y = `.46`, Z = `0`, usable size `2.26 × .98`. Power top Y = `.405`, Z = `-.98` opponent / `+.98` local. Deployment center Y = `.24`, Z = `-2.4` opponent / `+2.4` local; width `2.32`, depth `2.55`. Render cards just above the deployment anchor to avoid depth conflicts. Power and Location sit outside the deployment rectangles.

Semantic node names are `Node_1_location`, `Node_1_local_power`, `Node_1_opponent_power`, `Node_1_local_deployment`, `Node_1_opponent_deployment`, `Node_1_probability`, and equivalents through Node 5. Probability anchors use Y `.51`, Z `3.97`.

DC centers X = `-4.6` Backup / `+4.6` Primary; Z = `±4.48`; integrity anchor Y `.65`. Resource anchors are X `0`, Y `.49`, Z `±4.60`. Cache = `[6,.04,6]`, End Turn = `[8.7,.12,6]`, hand fan origin = `[0,.4,6.05]` with width 10 clear. Duration X = `-9.3 + slot × .82`, Z = `±5.90`, Y `-.02`. Draw/discard X = `-8.95` / `-7.35`, Z = `±4.80`.

The GLB is exported before the studio floor, lights and camera are created, so no review rig enters gameplay. Nine material batches are derived from 338 individual authored parts. Binary inspection verified 60 glTF nodes, 77,992 triangles, 3,888,696 bytes and stable semantic anchor names. The client may adjust materials by name (`OB / magenta inlay`, `OB / cyan Data Center core`, etc.) to match its lighting and tone mapping. No external textures, reference animation media, paid API calls or model-generated bitmap assets are used in this board asset.

## Remaining criticism

The concepts have denser mechanical detail and brighter cyan reservoirs than this first playable asset. The current geometry deliberately protects card readability and performance, but final LookDev should assess the client camera, foreground hand occlusion and physically anchored text together. Standalone Blender rendering does not prove runtime layout correctness; browser screenshots and gameplay review remain required.

Specialist: delegated LookDev/Blender production agent. Model inherited from the parent; no separate model override was requested and an exact model identifier was not exposed to this agent. No fabricated API usage counts are reported.
