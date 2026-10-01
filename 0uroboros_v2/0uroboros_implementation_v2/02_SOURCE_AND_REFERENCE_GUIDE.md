# Source and Reference Guide

## Source inventory

Astra must inspect the repository and build a current source map for:
- canonical rules
- game/content data
- first-party card art
- board concept art
- icons
- UI assets
- effects reference media
- effects/code URL library
- competitive Examples of Good / Great
- historical implementation docs
- tests
- current frontend
- agent/swarm infrastructure

Retrieve relevant sources per task rather than stuffing the entire repository into every context.

## First-party visual identity

The project identity is:

**Cyberpunk + Quantum Physics + Occult / Esoteric**

First-party sources control visual identity:
- board concept art
- card art
- iconography
- established UI assets
- approved palette/type
- world/story context where relevant

Competitive references are a craft benchmark, not permission to borrow their skin.

## Visual tokens

Palette:
- Blue `#4173F2`
- Light Blue `#31A9FF`
- Cyan `#27E2FF`
- Purple `#BC64FF`
- Pink `#FF0BA1`
- Red `#FA0048`
- Gold `#FFCC12`
- Green `#1FFFB1`
- Black `#030012`

Typography:
- Inter for normal UI and body copy
- Orbitron for titles, large numerals, and selected display moments

Use these deliberately. Do not make every surface neon.

## Board concept art

The game-board concept art in Assets is first-party visual evidence.

Inspect it for:
- silhouette
- perspective
- player/opponent relationship
- Node architecture
- materials
- lighting
- depth
- framing
- rhythm
- world/HUD relationship

The playable board should increasingly feel like the same product as the concept art.

## Card art

Use first-party card art wherever an identity match exists.

Inspect enough of the art library to design a frame/system that survives bright/dark images, Base/Chaos range, varied subjects, and varied composition density.

## Icons

Audit the SVG icon library.

Use confirmed semantics first.

High-confidence established areas include:
- priority
- Actions
- Crypto
- Servers
- deck
- discard
- hand
- Power

Do not assign an uncertain icon meaning because it merely looks plausible.

## Effect-animation reference assets

Assets contains animation/motion reference material.

**Reference only. Never ship or use the source animations as-is.**

They communicate:
- motion concept
- pacing
- geometry
- energy behavior
- transformation
- thematic fit
- theatrical ambition

Some filenames include thematic tags such as `occult`, `quantum`, or other art-direction terms. Those tags intentionally help match the reference to a Card, Location, or effect.

Untagged references may be applied wherever the art direction finds them appropriate.

Visually inspect the reference before use. Filename alone is not enough.

## Original effect implementation

Production effects must be newly authored.

Possible families:
- animated SVG
- R3F / Three.js geometry
- particles
- shaders
- post-processing
- combinations

UX Lead and Astra/LookDev choose based on comprehension, theme, theatrical tier, spatial need, performance, reuse, and implementation cost.

## Code-based effects URLs

The resource library contains Three.js/JavaScript effect examples.

These are technique references.

Inspect the actual implementation where possible and learn:
- rendering technique
- geometry
- shader logic
- render targets
- post-processing
- particle approach
- timing
- interaction
- performance cost
- R3F adaptation

Create original 0uroboros implementations.

## Named competitive references

### Marvel Snap — sequencing

Study specifically:
- one active event at a time
- reveal order legibility
- cause before consequence
- readable beat between events
- anticipation during resolution
- clear location focus

Transfer sequencing, not visual identity.

Use it especially for card reveal, card effects, Node resolution, and Wave Collapse.

### Hearthstone — motion weight

Study specifically:
- physical card weight
- anticipation
- impact/contact
- follow-through
- recovery/settle
- hover/idle tactility

Transfer motion craft, not Hearthstone's theme or frame design.

Use it especially for hand interaction, card deployment, attack/removal-like motion, and reveal.

### Other references

Slay the Spire, Shards of Infinity, board/interface references, interaction examples, and other curated material remain useful for systems and UX texture.

## Theme firewall

Competitive references may influence:
- interaction mechanics
- sequencing
- motion quality
- pacing
- hierarchy
- tactility
- production-value expectations

They may not control:
- palette
- iconography
- thematic voice
- card-frame identity
- world material language

## Review evidence

At the human checkpoint, show concrete chains:

`reference -> observed principle -> original implementation -> actual gameplay use`
