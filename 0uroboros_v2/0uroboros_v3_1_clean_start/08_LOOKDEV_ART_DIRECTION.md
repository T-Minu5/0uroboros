# LookDev and Art Direction

This is the durable art-direction foundation. Add future Mel-specific detail in `10_LOOKDEV_ADDITIONS.md` rather than editing rules.

## Identity
Primary blend:
- Cyberpunk
- Quantum Physics
- Occult / Esoteric

Secondary accents may include sparse Solarpunk/Lunarpunk and moderate Cassettepunk/Dieselpunk/Psychobilly. These are accents, not the identity foundation.

## Occult language
Hidden knowledge, sacred geometry, alchemy, Tarot-like structure, celestial diagrams, ritual geometry, sigils, engineered mysticism. Use contextually and with restraint.

## Quantum language
Probability fields, interference, superposition metaphors, orbitals, wave deformation, field lines, singularity, convergence, uncertainty, geometric probability structures.

## Cyberpunk language
Circuitry, scans, data traces, controlled holography, black engineered materials, luminous embedded channels, urban future systems.

Avoid `black background + maximum neon = cyberpunk`.

## Palette
Blue #4173F2
Light Blue #31A9FF
Cyan #27E2FF
Purple #BC64FF
Pink #FF0BA1
Red #FA0048
Gold #FFCC12
Green #1FFFB1
Black #030012

Quiet dark surfaces are necessary for hierarchy.

## Typography
Inter for UI/effect copy/logs/rules. Orbitron for titles, large numerals, selected display moments. Readability wins.

## Board / table
Target a 3D table/arena with modest perspective. Foreground = local hand/player; midground = Nodes/Locations/cards; far side = opponent.

The board should feel authored and physical, not like HTML columns over generic 3D.

Board concept art in Assets is first-party evidence. Study silhouette, architecture, Node geometry, framing, materials, lighting, player/opponent relationship, and depth.

## Materials
Promising restrained family: obsidian/black glass, matte dark metal, embedded luminous circuitry, translucent quantum field, holographic projection, controlled emissive edge. Coherent few materials are better than unrelated shaders.

## Lighting
Use lighting as hierarchy: quiet base, selection/legal target, active Node/resolution, major Collapse. Do not illuminate everything at max intensity.

## Cards
Premium collectible objects around first-party art. Develop coherent frame, thickness, edge, art crop, title, Power, type, effect cues, selected/hover/reveal/face-down states, landing/settle, inspect.

## Locations
Structural game objects, not normal cards. Possible forms: embedded plate, raised plinth, holographic slab, dimensional aperture, quantum/occult artifact, integrated Location frame. Choose one coherent system.

## Data Centers
Strong anchored world/HUD objects that react to Drain/Restore/destruction without overpowering Nodes.

## Negative space
Quiet visual space is required. Do not fill every region with glow, borders, text, particles, and motion.

## First-party authority
First-party board/card/icon art outranks competitive references. Competitive references inform craft, not identity.


## Board concept art authority
The images in `assets/board` are first-party layout authority for the gameboard.

Use them to define:
- board silhouette and main table geometry
- player/opponent zone placement
- Duration storage placement
- Primary and Backup Data Center placement and displayed power
- Actions, Crypto, VP, draw pile, discard pile, and hand placement
- Crypto Cache placement
- End Turn button structure and timer treatment

If a creative board idea conflicts with the concept-art layout, the concept-art layout wins unless Mel explicitly approves a change.

## Blender board build requirement
When tooling allows, Astra should use Blender through the Blender MCP server to create the 3D board/table that will be brought into the game scene.

This is not optional exploration. It is the preferred path for turning the first-party board concept art into a coherent 3D board object.

Requirements:
- inspect both board concept images before board modeling begins
- use the image without cards in hand as the clearest source of the base layout
- use the image with cards in hand as the authority for hand placement and spatial occupation
- preserve readability and direct manipulation while translating the 2D concept into 3D
- keep drop targets visibly attached to the board columns/wells
- maintain unobstructed Power, Data Center, and Location readability
- do not silently replace this with a generic table if Blender MCP is unavailable

If Blender MCP is unavailable or blocked, Astra must report that as a tooling blocker and provide a fallback plan before substituting another approach.
