# Evaluation pass update

The approved five-Location/three-Circuit pack is now playable; earlier Location source-block statements below describe the pre-approval build. Official Snap screenshots and sampled gameplay were reviewed (SNAP_ALIGNMENT.md). Sealed Nodes now use opaque covers and omit hidden content, open Locations have concise summaries plus full click inspection, and the Draft has a distinct free Circuit privilege.

Populated-board review found card/score/probability crowding. The final pass reduces field cards and adjusts projected anchors to preserve marker clearance, with matching card-flight destinations. This deliberately favors readable outcomes over larger field art at the current board proportions. Full card inspection remains available. Missing Vault/Crypto identity art and the full nonstarter catalog remain visible limitations. This is an evaluation improvement, not final visual parity or the full Runtime V1 checkpoint.

# Independent integrated visual critique

Reviewed the actual `docs/evidence/current-build.png` captured September 22 at 17:54, both first-party board concepts, the final Blender Cycles review render, and all 79 valid image files in `assets/card_art` through four contact sheets. This is a visual direction critique, not gameplay acceptance or proof of multi-Cycle completion. The reviewer authored the Blender mesh but did not author the frontend composition, so the integration critique is independent of frontend implementation; the mesh assessment is self-review.

## Highest-priority corrections

1. **P1: Restore dark material hierarchy.** The integrated screenshot renders the graphite perimeter and wine-black wells as pale white/lavender. The same asset's Blender render reads dark metal and quiet glass as intended. In the browser the surface competes with every label and card, while red traces lose hierarchy. Investigate renderer tone mapping, lighting, material overrides and environment before changing the asset palette. Acceptance: quiet dark wells, readable red lines, cyan reservoirs and magenta perimeter; no broad white table area.

2. **P1: Attach status UI to physical regions.** The screenshot shows three tiny Duration rectangles at far left and a separate set of four large model bays to their right; the lower bank repeats this duplication. The opponent pile counters are far upper-right although concept piles are grouped below left Duration. Crypto Cache content floats right of its visibly empty modeled tray. Far Data Center readouts hover above and lateral to their banks. Bind these to the model anchors or consolidate the projection into one label system. Acceptance: one apparent Duration area per player, one cache containing its drawn Crypto, counters near their intended piles, values clearly attached to each corresponding bank.

3. **P1: Make hand identity readable.** At 1600 × 1000 the three-card hand is narrow and small relative to the table, leaving a large amount of unused foreground. Dotkrawler's name/effect region crosses the bright illustration and becomes hard to distinguish. Both Vault cards are dominated by a generic database symbol and `IDENTITY ART PENDING`. The concept hand has substantial foreground presence and immediately recognizable art. Increase hand scale and stable art/title separation, then verify 3/5/7-card fans without hiding Power, Probability, console or cache. The source Dotkrawler image does not contain the displayed effect copy: that collision is runtime layout.

4. **P2: Improve strategic text scale.** The five Node bridges and power sockets are physically aligned and identifiable, which is a strong structural match. However, Location copy is tiny, and the generic `Location pending / No approved Location content` repeated five times makes the central band read like implementation diagnostics. Keep the honest missing-content status but present it once globally; on each bridge retain Node identity and opening state with enough text size to read. Do not invent Location effects. Power zeroes are visible, though compact; inspect with nonzero/tied/high values and live effects before calling this accepted.

5. **P2: Reduce detached rectangle layering.** The local resource console partly covers the center probability plinth and several dark overlays obscure the physical bank details. Bind resource text to the existing front console and keep its vertical footprint below probability. Prefer transparent/simple anchored typography where geometry already provides a bezel. The current physical architecture should do more of the grouping work.

## What is already working

The actual browser uses the modeled board, with five unmistakable longitudinal paired wells and integrated central Location plates. Opponent and local Power occupy opposite shoulders rather than hiding in card stacks. Magenta perimeter, cyan DC banks and front utility placement visibly reference the concepts. The foreground hand stays separate from Crypto Cache. End Turn is visually one control. First-party icons appear in resources and pile counters. These are real composition strengths, not evidence that rules, dragging or Collapse are fully accepted.

## Complete card-art visual inspection

Evidence: `docs/evidence/card-contact-1.jpg` through `card-contact-4.jpg`. All 79 valid images opened successfully, including the extensionless `card backs/cardback_01_swordSnake`; two `.DS_Store` files were excluded as filesystem metadata. No new art was generated or substituted.

The base set's white/gray machinery, cyan/blue energy, technical annotations and occult diagrams are consistent across named characters. Chaos art shifts to hot magenta/red and violet against the same gray engineered language; examples include Rezz-Razor's red sword stroke, Tihkal Hound's violet turbines, and Subroutine Succubus's ritual halo. These saturated subjects need quiet dark frames and quiet board surfaces. The pale browser board weakens that intended separation.

Exact identity gaps and cautions:

- `alchemic-byte.png`, `alchemic-kilo.png`, `alchemic-mega.png`, and `alchemic-shyte.png` visibly depict cyan crypto rings with baked numerals **2, 3, 5, 1**, respectively. They are strong visual candidates for currency identities, but image appearance alone does not authorize a canonical name mapping. Confirm source authority before promoting them to Byte-Coin/Kilo-Coin/etc. Never use their baked numerals for changing Power or other dynamic values.
- Current catalog entries point Byte-Coin at `byte-heist.png` (a rifle-bearing character), Kilo-Coin at `kilo-cycle.png` (a rider), and Vault Encryption at `chronos-cache.png` (a gunner). `CardArt` intentionally suppresses non-Character art, so these wrong identity associations are not currently displayed. The data should explicitly record missing/confirmed identity art rather than keeping misleading underlying paths.
- No filename or clearly labeled illustration in the inspected set establishes a Vault Encryption identity. Keep that content gap explicit; do not relabel Chronos Cache as Vault.
- The card-back choices are richly authored portrait images. Sword/serpent reinforces the actual game's title; the silicone back supplies a circuit sigil. Use a consistent approved back for hidden cards and verify that no face or identifying Power leaks.
- `image_placeHolder.png` is a standalone dark serpent on a light field, not a generic approved card illustration. It should not silently fill unrelated identities.
- Some source images visibly repeat or closely match: `screen-scryer.png` / `superpositioning.png`; `bloodlet-drone.png` / `bloodlet-flux.png`; `delta-wave.png` / `∆-wave.png`. Treat these as potential aliases or intentionally shared art requiring source reconciliation; do not deduplicate distinct game identities from visual similarity alone.
- Many assets contain decorative annotation and tiny pseudo-technical markings. Crop carefully to preserve the central figure and faction accent; avoid relying on those source markings as readable UI labels.

## Next visual verification

Capture a new browser frame after lighting and anchoring corrections, plus a populated Node, expanded/hovered hand, deliberate inspection and active local resolution. Compare material contrast against `assets/models/board-review.png`; compare geometry/grouping against both first-party concepts. This review has not watched motion or exercised gameplay and therefore makes no claim about Snap sequencing, Hearthstone motion weight, legal deployment, hidden information correctness or full acceptance.

## Final bounded iteration assessment — 18:03 capture

Independently opened and inspected the corrected `docs/evidence/runtime-initial.png` (file timestamp 18:03). This supersedes the earlier screenshot for present-state visual judgments.

The major integration corrections are visibly effective. The surface is dark, red longitudinal traces are readable, both Duration groups now use the actual four-slot bays, pile counters sit with the left storage region, both DC readout pairs align with their cyan banks, and resources occupy the central console. The cache is inside its dedicated housing and End Turn remains one control. The larger four-card hand is materially closer to the concept's foreground occupation; three first-party character illustrations are recognizable, titles and effect lines no longer collide with the image, and the fan clears local Power. Open/sealed Node labels are more useful and readable than the former repeated implementation warning.

Unresolved visual flaws, in priority order:

1. **Board material depth remains weak.** Darker is an improvement, but the wells still read as uniform matte gray/violet panels and the chassis is largely flat navy. The Blender review has richer edge light, bevel separation and metal/black-glass response. Restore selective physical lighting and restrained emissive spill without returning to the overexposed first pass. This is a LookDev gap, not a layout failure.
2. **Probability and bank grouping are tight.** The five gold probabilities sit immediately above the front rail, with outer labels crowded by DC housings. All values can be inferred in this still, but their lower edges visually merge into black bezels. Give probability a small guaranteed vertical clearance, then test multi-digit values and selection motion. Avoid lifting resource panels back across this band.
3. **VP identity art is visibly unfinished.** Vault Encryption still occupies a substantial hand area with a generic database symbol and `IDENTITY ART PENDING`. This is honest source handling; it is also a conspicuous identity gap. Approved source art and canonical mapping are required, not an arbitrary substitute. Full catalog/Location gaps now explicitly marked `SOURCE_REQUIRED` remain product limitations rather than cosmetic work to conceal.
4. **Strategic microcopy remains small.** Priority markers, pile sublabels, Location secondary copy and card effect lines are legible only with close attention at this 1600 × 1000 capture. Power/priority should remain readable during populated-board play. No static empty-board screenshot proves this under effects, card stacks, or smaller windows.
5. **Composition is cleaner than the concept but less tactile.** The concept has deeper foreground chassis, denser reservoir construction and heavier card presence. Current geometry preserves the important layout and is coherent, but browser shading and card contact shadows need refinement to make it feel like a physical collectible table rather than a clean interface on a shallow model.

This is a substantially improved supported-starter direction build. It is not the requested full canonical Runtime V1 or an 80%-direction human checkpoint, and this bounded static review supplies no independent acceptance of motion, full content, repeated Cycles, timers or rule correctness. Parent regression evidence should be reported separately from these visual findings.
