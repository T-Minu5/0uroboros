# UX, LookDev, and Effects Direction

## Mandatory visual reset

The current visual frontend is not the quality baseline.

Evaluate it against:
- approved game UX
- first-party board concept art
- first-party card art/icons
- named competitive references
- effects reference library

Preserve useful implementation. Sunk cost is not authority.

## Goal

Make the game feel like an intentional strategic card-game product, not a debug interface with effects.

The desired experience combines:
- strong board comprehension
- collectible card presence
- clear spatial causality
- tactile interaction
- quiet strategic moments
- dramatic but readable spectacle
- unmistakable 0uroboros identity

## Board and camera

Develop a genuinely spatial table/arena with modest perspective tilt.

Hierarchy:
- foreground: local hand/player
- midground: Nodes/Locations/cards
- far side: opponent

Board, camera, Node geometry, and drop-target layout must be designed together.

## Gestalt and grouping

Apply:
- common region
- proximity
- continuity
- common fate
- figure/ground
- similarity
- simplicity/Prägnanz

Concrete use:
- each Node is one perceptual region
- cards belong clearly to the correct Node/player side
- Location belongs to its Node
- Power belongs to the correct side and stays unobstructed
- source-target paths create continuity
- one causal event shares motion/timing
- active resolution becomes figure while unrelated areas recede

## Central UI

Use center/global space for macro state:
- phase
- turn
- board-wide transition

Do not use it as the primary narrator for local card/Location resolution.

## Card treatment

Cards should feel like premium physical objects built around first-party art.

Develop:
- frame
- edges/thickness
- art crop
- title
- type
- Power
- effect information
- selected state
- face-down state
- hover
- drag
- reveal
- board placement
- click inspect

## Local effect grammar

`SOURCE -> ACTIVATION -> PATH -> TARGET -> REACTION -> RESULT`

The causal chain must remain legible.

## Motion tiers

Tier 1: Draw, Action, Crypto, small Power.

Tier 2: Drain, Restore, probability movement, move, Trash, reveal.

Tier 3: Node result, large Location reward, Server destruction.

Tier 4: Wave Collapse final selection, game-ending event.

Do not make every event Tier 4.

## Snap sequencing

During resolution:
- one active event at a time
- source first
- consequence second
- readable beat
- next event only after comprehension

## Hearthstone weight

Physical card motion should use:
- anticipation
- acceleration
- contact/arrival
- follow-through
- settle/recovery

## Reference translation

For each production effect:
1. inspect relevant references
2. extract motion/geometry/thematic principle
3. choose implementation medium
4. author an original effect
5. attach it to gameplay source/target coordinates
6. validate comprehension
7. validate performance
8. preserve provenance

## Technique families

Occult/esoteric:
- original SVG sigils
- geometric diagrams
- ritual lines
- layered symbol construction
- controlled rotations/orbits

Quantum:
- interference
- field lines
- displacement
- wave deformation
- particle convergence
- spatial distortion

Cyberpunk/systemic:
- scans
- traces
- circuit routes
- data streams
- controlled holographic projection

Blend selectively.

## Wave Collapse ambition

Evaluate combinations such as:
- active-Node focus
- probability rings/fields
- board quieting
- wave deformation
- inward particles
- singularity/convergence
- controlled post-processing
- selected-Node breakthrough

The selected treatment must preserve Node 1-5 resolution, Power readability, and final weighted-selection clarity.

## Draft

Draft should belong to the 0uroboros world, not look like a generic store overlay.

Usability remains primary.

## Critique standard

Independent critique should be willing to say:
- too flat
- too generic
- too HUD-heavy
- weak card presence
- weak Node grouping
- arbitrary glow
- no visual hierarchy
- effects lack causality
- motion lacks weight
- Collapse lacks anticipation
- first-party art underused

Evaluate against the target and references, not merely the previous build.
