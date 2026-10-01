# Effect technique library

Techniques learned from Mel's curated 3JS references. Implementation notes for 0uroboros, not copies of those repos.

## FX-SCAN-CLIP

- Source: ScanEffect samples
- Summary: a moving clip plane or band reveals a mesh as if scanned.
- Approach: shader discard or opacity by world-Y / world-Z versus a timed threshold.
- Performance: low. One extra uniform per card.
- Theatrical tier: 2
- Mechanics: reveal, Duration enter
- Combinable-with: FX-LINE-TRACE, FX-BLOOM-LOCAL
- Avoid: stacking with FX-SINGULARITY on the same card
- Status: implemented as a source-card scan band during the active effect.

## FX-LINE-TRACE

- Source: GeometryPainter samples
- Summary: GPU lines or ribbons draw a path from source to target.
- Approach: short-lived tube or Line2 along a computed arc. Recycle a small pool.
- Performance: medium if bounded (max 8 live)
- Theatrical tier: 2
- Mechanics: Drain, Restore, probability transfer
- Combinable-with: FX-SCAN-CLIP, FX-PARTICLE-IN
- Avoid: one unique curve style per mechanic
- Status: implemented as `SpatialFx` CatmullRom tubes plus particle streams. Drain is a thicker hostile ribbon. Restore is a coherent cyan/green tube. Probability is a thinner purple filament with source/target ring scale.

## FX-PARTICLE-IN

- Source: singularity / particle explorations
- Summary: points fall inward to a focus, then stop.
- Approach: instanced points, age in a shader, attractor at Node world position.
- Performance: medium. Cap 400 points.
- Theatrical tier: 3–4
- Mechanics: Wave Collapse, weighted selection
- Combinable-with: FX-SINGULARITY, FX-WAVE-LIFT
- Avoid: using the same burst for Draw
- Status: planned. First pass is a collapsing ring.

## FX-SINGULARITY

- Source: singularity concepts
- Summary: radial distortion around a point. The field bends, then a Node breaks through.
- Approach: full-screen or table-plane shader with a single attractor. HUD stays undistorted.
- Performance: high if full-screen. Prefer a table-sized plane.
- Theatrical tier: 4
- Mechanics: final weighted Node, game-ending Collapse
- Combinable-with: FX-PARTICLE-IN, FX-WAVE-LIFT, FX-CHROMA-BRIEF
- Avoid: permanent camera distortion
- Status: implemented as a collapsing ring plus table-plane wave. Distortion stays off the HUD.

## FX-WAVE-LIFT

- Source: liquid-wave concepts
- Summary: a traveling displacement across the table surface.
- Approach: vertex offset on the table plane from a sine + envelope.
- Performance: low on a modest grid
- Theatrical tier: 3–4
- Mechanics: Collapse Node progression 1→5
- Combinable-with: FX-SINGULARITY
- Avoid: waving during ordinary Runtime
- Status: implemented as a vertex-displaced table plane during Node focus and measurement.

## FX-COMPOSER-GRADE

- Source: EffectComposer samples
- Summary: bloom, brief chromatic aberration, vignette.
- Approach: `@react-three/postprocessing` later. Quality High/Medium/Low.
- Performance: high. Off on Low.
- Theatrical tier: 1–4 as a modifier, never the effect itself
- Mechanics: any tier, scaled
- Combinable-with: all
- Avoid: HUD inside the composer
- Status: not installed. Emissive materials stand in.

## FX-ORIGAMI-FOLD

- Source: Origami samples
- Summary: mesh folds as a page or card.
- Approach: skinned or morphed card for Trash / Destroy only.
- Performance: medium
- Theatrical tier: 2–3
- Mechanics: Trash, Destroy
- Combinable-with: FX-LINE-TRACE
- Avoid: using fold as the default reveal
- Status: unused. Reveal stays a flip.
