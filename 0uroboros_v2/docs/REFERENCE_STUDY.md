# Reference study — V3.1 presentation

Study date: 2026-09-23 UTC. Internal implementation guidance; no reference media is a production asset. This study changes no rules. Scope: effects, source/target comprehension, physical cards, and the deterministic/probabilistic Collapse boundary.

## Authority inspected

Read V3.1 `03_STARTER_DECK_AND_CARD_SEMANTICS.md`, `04_RUNTIME_REVEAL_PROBABILITY_COLLAPSE.md`, `07_UX_PRODUCT_CONTRACT.md`, `08_LOOKDEV_ART_DIRECTION.md`, `09_EFFECTS_AND_REFERENCE_POLICY.md`, and `10_LOOKDEV_ADDITIONS.md` in `0uroboros_v3_1_clean_start/`.

Read the full curated historical reference list at `../0uroboros/0uroboros_swarm_v2_0/06_RESOURCE_LIBRARY.md`. It is reference evidence only, never gameplay authority. Its categories cover Three.js, card/fan examples, competitive games, theme, effect techniques, video benchmarks, and fonts. The implementation recommendations below are original proposals within V3.1, not copied mechanics.

## Actual local visual inspection

Decoded each sequence with Pillow; inspected six evenly distributed frames including first and last, not filenames alone. Durations are decoded WebP metadata, not a prescription for gameplay pacing. Contact sheets were temporary `/tmp` files and are deliberately outside production assets.

- `assets/effect_animations/fx-24-occult-big-attack.webp`: 23 frames / 1532 ms. Orange/yellow skull-shaped flame thins into darkness and reforms over a reflected contact region. Lesson: clear energy concentration and a recognizable peak. Do not import skull/flame imagery into generic Drain.
- `assets/effect_animations/fx-19-quantum.webp`: 54 frames / 4532 ms. Cyan play/pause shapes morph inside a dotted triangular field with a wavy edge. Lesson: stable outer field can contain changing internal state. Do not reproduce its triangle or media-button symbols.
- `assets/effect_animations/fx-32-heal.webp`: 12 frames / 799 ms. White rounded fragments contract nearly to a point and reform into a clustered mass. Lesson: reconstruction reads through directional convergence; continuous brightness is unnecessary.
- `assets/effect_animations/fx-40-heal-occult.webp`: 27 frames / 1799 ms. Loose thin loops shed small fragments, disappear, and rebuild from a single arc. Lesson: a line can visibly complete a repair without an explosion.
- `assets/effect_animations/fx-15-destroy.webp`: 13 frames / 866 ms. Blue shell/cloud burst, sparse residual particles, bright reformation; ground reflection maintains an anchor. Lesson: impact and residual decay need distinct phases. The tag alone does not make this a gameplay destruction mechanic.
- `assets/effect_animations/fx-46-occult-quantum.webp`: 17 frames / 1132 ms. Fine concentric radial diagrams shift relative to one another around a dark center. Lesson: restrained orbital motion implies a field; never trace the actual symbols or diagram.

Inspected first-party `assets/card_art/base cards/slash-dot.png`, `dotkrawler.png`, and `assets/card_art/chaos cards/rezz-razor.png`, `rezz-blade.png`. Slash-Dot and Dotkrawler use cold gray/white objects with bright blue accents. Rezz cards use black silhouettes, gray surroundings, and vivid red/magenta linear motion. Preserve original artwork and crop deliberately; frame accents can echo these hues without tinting the illustration. No file named `vault-encryption.png` was found in the asset search; do not claim custom Vault art exists.

Rendered and visually inspected all fifteen supplied SVG icons in `assets/Icons/`: actions, attack, crypto, database, deck, discard, duration, hand, infinite, power, priority, runtime, trash, utility, volume. They use compact white linework, rounded strokes, and familiar object silhouettes. Reuse these first-party icons consistently instead of substituting unrelated symbols. Keep icon meaning paired with readable numbers or labels.

## Original source/code inspection

- [Three.js EffectComposer documentation](https://threejs.org/docs/pages/EffectComposer.html) and [actual implementation](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/postprocessing/EffectComposer.js): examined ordered enabled passes, read/write target swapping, last-pass screen output, resize and disposal. Application: a restrained final Collapse pass can run only during the cinematic and dispose cleanly. UI text should sit outside distortion. No source copied.
- [three.quarks README code](https://github.com/Alchemist0823/three.quarks): examined its BatchedRenderer, ParticleSystem lifetime/size/emission setup and per-frame update, plus cleanup guidance. Application: cap particles and stop emitters; source trails should be small, time-limited systems. A new dependency is not required merely to implement this principle. Repository advertises MIT; no source copied.
- [Codrops scan demo](https://tympanus.net/Development/ScanEffect/effect1/), its [author's explanation/code snippets](https://tympanus.net/codrops/2025/03/31/webgpu-scanning-effect-with-depth-maps/), and [original repository](https://github.com/d3adrabbit/ScanningEffectWithDepthMap): inspected depth-driven UV displacement, procedural dots, moving depth mask and blending. Application: an original, localized scan band can cross a Node at reveal or selection. Preserve art and numbers; avoid continuous full-board scanning. The inspected example uses WebGPU/TSL; adapt the mechanism to the project's renderer, not its assets or code.
- [Geometry Painter](https://tympanus.net/Tutorials/GeometryPainterThreeJS/) returned a minimal page shell. No claim of visual or source study beyond identifying the page.
- [Hearthstone official site](https://hearthstone.blizzard.com/en-us) and [curated Hearthstone-web repository](https://github.com/Rymedy/hearthstone-web) loaded textual pages. Neither constitutes observation of motion timing; no timing measurement is attributed to them.

## Competitive benchmark evidence limits

The curated Marvel Snap videos are [eKrOIG5tqJ4](https://www.youtube.com/watch?v=eKrOIG5tqJ4) and [hUi0eFuTi-g](https://www.youtube.com/watch?v=hUi0eFuTi-g); another supplied benchmark is [NmkuxuKK_nU](https://www.youtube.com/watch?v=NmkuxuKK_nU). Web retrieval returned errors. The youtube-watch skill dependencies were available; a temporary frame retrieval attempt for eKrOIG5tqJ4 first encountered sandbox DNS failure, then an authorized network retry reached YouTube but returned “The page needs to be reloaded.” Computer-use fallback failed with “unsupported Codex auth method: apikey.” No frames or transcript from these videos were inspected. TranscriptAPI credentials were absent; account setup was not necessary for the independent local/code study.

Accordingly, “Marvel Snap sequencing” here means the supplied V3.1 directive: staggered resolution, one active event, source before consequence, an active-location focus and readable anticipation. “Hearthstone motion weight” means the supplied V3.1 directive: windup, acceleration, arrival, follow-through and recovery. These remain design criteria, not falsely reported observations or measured benchmark timings. Additional videos, singularity, origami, particle demos, CodePens, and theme pages from the full library were not individually inspected in this bounded study.

## Concrete original implementation plan

All times below are initial design choices for normal mode. Fast mode may shorten waits but must preserve causal order. Animate presentation snapshots; never reveal authority's final values before their scheduled visible result. Reduced motion retains highlights, labels and ordered value changes with minimal travel.

### Reveal — tactical tier

Follow the global reveal queue exactly: priority player, opponent, alternating eligible chronological cards. One card owns attention at a time. Quiet nearby cards; emphasize source for about 180 ms, lift and turn with accelerating middle motion over roughly 360 ms, land with a small overshoot and 180 ms settle, then hold identity/effect for at least 300 ms before its consequence. Keep the card's face hidden until turn midpoint; no hidden name/effect text in accessible labels. Card-local scan or edge activation may use authored SVG; physical turn/height uses R3F/Three.js. Do not obscure either Power value or the Location. Effect continuation consumes this card's source anchor, not a generic center banner.

### Drain — tactical tier

Gameplay trigger: Rezz-Razor Drain 75 or Rezz-Blade Drain 100 on reveal. Read the resolved target from the gameplay event: available enemy Primary, else available Backup; no overkill spill. Record before/after integrity in that event.

Original visual: the source card draws two short magenta angled traces that converge into a small seed (180–240 ms); a narrow arcing data filament travels from the actual card to the exact enemy Data Center (350–450 ms); the target's rim compresses/recoils on arrival (120 ms); only then interpolate its displayed integrity and show the actual lost amount (250–350 ms); fragments dissipate (250 ms). Use authored SVG activation geometry plus a Three.js curve/particle path. Color can echo inspected Rezz art; do not use the reference flame skull. Keep the old integrity during travel. Zero-effect/no-target cases receive a short local explanation and no fake hit.

### Restore — tactical tier

Gameplay trigger: Vault Encryption Restore 100 on reveal. Resolved target is owner's available Primary, else Backup. Clamp to capacity; destroyed centers cannot revive. Display actual restored amount, not unconditional +100.

Original visual: incomplete cyan/green arcs activate at source (200 ms), two fine strands travel toward the owner Data Center (400 ms), three short concentric segments align around its existing rim (250 ms), integrity fills only as the segments complete (300 ms), and the rim returns to its quiet state (200 ms). Lesson from inspected heal references is convergence and reconstructing linework, not copied loops. Use authored SVG segments and Three.js paths. A full center displays a local “Integrity full” result, without a misleading green +100.

### Wave Collapse — deterministic story followed by cinematic selection

Nodes resolve 1–5, then Effect Bank oldest first. At each Node: bring only that Node into focus; pulse its Location for its onCollapse; show each card event through the same source/target grammar; update Power; hold winner/tie for roughly 600–900 ms; show local reward before moving focus. Empty/tied Nodes remain explicit. Keep probability, both Power values and Location readable. Do not replace these steps with a global message wall. Effect Bank gets a distinct sixth-stage focus even when empty.

Only afterward present final normalized weights. Original cinematic proposal: quiet ambient motion for 350 ms; make each Node's own probability ring visible; introduce one broad wave displacement across the field for about 900 ms; draw sparse particles inward for 500 ms; light the already-selected Node with a restrained breakthrough ring and hold eligibility for 1000 ms. Limit geometry to original segmented rings and field lines, with no traced symbols. Use R3F meshes/particles and, optionally, one bounded shader/post pass. Avoid spinning roulette or rerolling: gameplay already selected exactly one Node using final weights. A tied selected Node identifies both eligible players. Draft opens only after the required presentation queue and selection hold finish.

## Acceptance/provenance handoff

Implementers should record actual original file paths in an effect provenance entry once authored; this study intentionally does not claim files have been implemented. For each effect include: gameplay event, specific references above, extracted principle, cyberpunk/quantum/occult theme tags, medium, source files, UX purpose, visual purpose, particle limits and cleanup. Recommended limits: one major effect active, at most 32–64 particles for tactical paths, no perpetual post-processing, responsive/reduced-motion fallback. Verify on real turns that the source is visible, the destination is unambiguous, old values persist until arrival, actual deltas obey caps, and Draft cannot cut off Collapse. Reference WebP files and temporary sheets must never be imported or copied into the shipping bundle.

## Implementation handoff (current starter practice)

Authored `src/Effects.tsx` implements original Drain/Restore source-to-target quadratic paths using measured DOM anchors, a narrow SVG trace, and a moving point. `src/App.tsx` holds the event's returned masked snapshot until its contact fraction; `src/styles.css` provides matching target reaction/delta and card reveal/settle. Drain uses magenta, Restore green; no reference frames, diagrams, or code were copied. These communicate actual runtime events and clamped deltas. There are no particle sprites or permanent post-processing passes. One event is active at a time, with normal/Fast timings. Reduced-motion CSS suppresses moving paths but retains ordered outcomes. Source/target positions are measured at event start; resizing during an effect can leave its path briefly misaligned until the next event. The BoardScene shader/Blender table is separately authored by the parent, not claimed as this specialist's work.

The integration refinement attaches peripheral status widgets to the Blender model's world anchors through a stable dedicated HTML portal. Card deployment now uses an original 440 ms measured-source-to-slot flight with a small windup, raised travel and settle; the face turns to the common card back before the real deployment is applied on arrival. Inputs and inspect remain suppressed during that flight. Reveal narration now follows the source owner's side. Changing presentation pace is disabled while an event runs so scheduled contact and displayed motion cannot diverge.
