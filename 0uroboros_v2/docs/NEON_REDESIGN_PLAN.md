# Neon glass-table redesign

## Baseline audit — September 30, 2026

The current working tree includes the previous, uncommitted Neon pass. It changes lane bodies and etching but retains the imported table deck, shell, straight side rails, and original field-glass panels. Those panels extend outside the new clipped lane corners and cause the dark mismatched backing visible in the live build. The seal animation also has an independent rectangular darkening plane that needs a Neon-specific shape.

Rendering uses React Three Fiber and Three.js with an orthographic camera, a material-batched GLB that is filtered and warped at load time, DOM card/HUD anchors, and a shared HDR bloom/grade/output pipeline. `boardLayout.ts` defines the live footprint, including wider lanes and the longer opponent half. Servers, Node hardware, lighting reactions, background image/video, lane patterns, and the persisted Classic/Neon setting already exist. No source Blender asset needs to be overwritten.

Baseline screenshots: `evidence/neon-v2-before-classic.png` and `evidence/neon-v2-before.png`.

## Art direction

A faceted frosted-glass deck held by an interrupted, angular frame. The complete deck, silhouette, side seams, and player-facing fascia share one construction language. Thin luminous edges and fine etched rhombi/radial details draw from both sets of user references. The field stays calm behind cards; ornament belongs mainly in margins and the front fascia. Glass diffuses the selected background image or video; colored light remains contained and readable. Existing player colors carry ownership and Server state.

## Phases and ownership

1. **Audit and baseline (complete):** read current history, settings, geometry, materials, light rig, and post-processing; capture live Classic and Neon. Read-only audit delegated to a lower-cost agent.
2. **Build:** geometry agent owns the new Neon deck, faceted shell, segmented side structures and front detail. Materials agent owns background-diffusing glass, contained emission and refined lane finishes. Astra owns old-geometry removal, style integration and seal compatibility. Geometry/material APIs are agreed before integration to keep edits separate.
3. **Independent review:** agents who did not build the changes review code and regressions, reference alignment, and populated gameplay readability. Builders may compile/debug but cannot approve their work. Review findings return to builders or Astra for correction, then to independent review.
4. **Evidence:** capture the same populated state in both styles; exercise drag/hover, winning lanes, Server damage/healing, all three turns, closure, Draft and the next Cycle. Measure frame pacing and resource counts with the existing diagnostics. Verify style persistence, repeated switching, backgrounds, reduced motion and two viewport sizes.

## Acceptance criteria

- Neon replaces the whole deck and shell treatment; old lane backing and generic rails are absent.
- Glass frost visibly diffuses the background without obscuring game information.
- Lane bounds, Node positions, Server behavior, card anchors and gameplay state remain stable.
- Front fascia and side structures use deliberate segmented shapes and etched details.
- Colored winning/hover/reward states and readable power values remain distinct.
- Classic retains its existing appearance and behavior; both styles remain independently selectable.
- No shader errors, disposed-texture use or steadily growing resources during style switches.
- Final evidence states measured performance and remaining visual gaps honestly.
