# Neon v3 — design brief and build contract

Supersedes the art direction in `NEON_REDESIGN_PLAN.md`. The v2 code (procedural shell, Gaussian frost) is kept as infrastructure only; its shell geometry, seams and deck look are replaced.

## Reference reading (13 user references + concept board)

| Reference | What we take |
| --- | --- |
| Glowing tiles on dark machinery (purple/cyan) | Lanes are lit glass tiles set into dark hardware: bright contained neon rim, inner second line, inner glow, darker interior. Circuit traces run between tiles. |
| Corridor of tall HUD panels + floor | Cyan laser strips with angled ends in the floor; bottom-centre console with ring + digits; clipped-corner panel frames. |
| Clipped panels, bracket frames, bar HUDs | Asymmetric chamfers, header tabs, corner brackets, tick ladders (`||||`), slanted bars (`////`). |
| Stepped line with jogs | Side neon is a thin line that steps diagonally at the silhouette flare, never a straight bar. |
| Holographic glass screens / glass table | Frosted glass lit from its edges; concentric segmented rings etched in glass; internal diffusion. |
| HUD ring diagrams (radial ticks, dotted rings, flower of life) | Occult/sacred geometry: broken concentric rings, dotted rings, hexagram, rhombus centres, radial ticks. |
| HUD line kits | Circle terminators on line ends, chevron runs (`>>>>`), L brackets with stepped edges. |
| Concept board (`assets/board/game-board_without cards.png`) | Physical table: thick bevelled shell, glowing perimeter tube, front console with lit segments. |

## Camera facts (1600 × 1000)

Orthographic, about 64 px per world unit in x and about 52 px in z. The vertical front face (y −0.6 → 0.1) is about 26 px tall, so it **is** visible: detail there must be ≥ 0.04 units tall. Any line narrower than 0.02 units is sub-pixel; etched lines use 0.022–0.035 width, laser seams 0.05–0.08 strip width (visible core about a third of that).

DOM overlays to avoid with bright detail: Server labels (x ±2.9 … ±6.4, z ±4.4 … ±5.4), resource readout (x ±1.65, z 4.1 … 5.9 near, mirrored far), left near corner Effect Bank (x < −6.4, z > 5.3), hand fan (centre bottom, z > 6.9).

## Fixed coordinates (do not change)

- `NODE_X = [-6.025, -3.012, 0, 3.012, 6.025]`; lane half-width `LANE_RIM_HX = 1.3433`; lane gutters centred at x ±1.506, ±4.519 (0.326 wide); outer gutter x ±7.37 … ±7.74.
- Lanes: near z 0.69 … 4.34, far z −4.581 … −1.29 (`LANE_RIM`). Lane footprint (`neonLaneShape`) is fixed.
- Glass deck: `GLASS_OUTLINE` (x ±7.74, z −4.84 … 4.72) is fixed and shared by geometry and the deck shader.
- Retained GLB hardware: Node bridges (|x − node| < 1.36, |z| < 0.74), Server beds (x ±4.6 ± 1.74, near z 4.35 … 5.15, far shifted −0.81), resource housings (x ±1.64), Effect Bank outriggers.
- Y stack: chassis top ≈ −0.2; bezel top ≈ 0.10; glass top 0.045; lane glass 0.12 … 0.2; lane light 0.208; Node bridges above 0.065.

## Board construction

1. **Silhouette (new `TABLE_OUTLINE`).** Reliquary/cross plan. Ends narrow (x ±7.95) with 45° chamfers; stepped shoulders out to x ±8.55 between z ±1.75 and ±4.25; diagonal flare to **wings** at the Node row (x ±9.35, z −1.05 … 1.05) with a V-notch at z 0; near-side **prow** (x ±2.45, out to z 6.98) for the player console. Far edge stays straight at z −6.53.
2. **Shell layers.** Dark obsidian chassis (bevelled, slightly larger), a raised **bezel frame** (shape with the glass outline as a hole) whose inner lip is chamfered and catches light, recessed glass deck. No flat rectangular slabs visible.
3. **Deck glass (under lanes).** Single opaque frosted pane: diffused background, deep blue-teal pigment, **internal edge glow** from the glass perimeter, **lane bleed** (owner-coloured light spilling 0.2–0.4 units around each lane rim), faint centre glow along the Node row, micro frost grain. Everything below bloom threshold (0.85 linear).
4. **Glass perimeter seam.** A contained laser seam running just inside the glass outline, owner colour per half, crossfading through white-cyan at the Node row.
5. **Gutter etching.** Circuit traces down each gutter with circle terminators, a rhombus node mid-run, small radial ticks; 0.022–0.03 width, low strength.
6. **Lanes.** Footprint unchanged. Bright contained rim (laser core + halo inside the footprint), inner second line, inner glow gradient, darker tinted interior so cards read. HUD detailing: asymmetric outer-end chamfer + header tab notch, slanted bar group (`////`) and tick ladder at the outer end, small corner brackets. Idle rim stays just under bloom; winning, hover and choice push it over.
7. **Side arrays (per side, x 7.8 … 9.35).** Raised bevelled side blocks following the silhouette. In a recessed groove, a **stepped light blade** follows the outline at an inset of about 0.22 and jogs diagonally at the flare; circle terminators at each end. Chevron runs (4 per half) pointing toward the Node row; tick ladders (10 bars) on each half. **Wing sigil** at (±8.95, 0): broken outer ring, dotted ring, hexagram, centre rhombus — upper half in opponent colour, lower half in player colour.
8. **Player apron (near, z 4.72 … 6.98) — the artistry zone.** Twin sigils at (±2.25, 5.65), r ≈ 0.5: segmented outer ring, 24-tick inner ring, rhombus/hexagram core. Centre console on the prow at (0, 6.4): concentric arcs and a ring opening toward the player (reference console), clear of the readout. Stepped edge laser along the near edge (jogs around the prow) with circle terminators; right/left corner L-brackets with stepped edges and tick bars. **Front fascia** (vertical face): segmented light bars with angled ends (concept-board console), chevrons pointing to centre, a thin laser line with jogs, inset plates.
9. **Far apron.** Same language, simplified and dimmer (about 60%): edge laser, two small sigils, no prow.

## Light budget (linear HDR, bloom threshold 0.85, exposure 0.85)

| Element | Peak |
| --- | --- |
| Deck glass, lane bleed, edge glow | ≤ 0.35 |
| Etched lines / glyphs | 0.25 – 0.6 |
| Laser seam core (perimeter, side blade, lane rim idle) | 0.9 – 1.3 (slight bloom) |
| Lane rim winning / hover / choice | 1.5 – 2.2 |
| Halo of any seam | ≤ 0.5 |

Halos are additive and only exist inside their own strip; no wide bloom wash. Reduced motion stops all flow animation.

## Build contract (file ownership)

**Agent G — geometry** owns `src/neonTableGeometry.ts`, `src/NeonTable.tsx`, new `src/NeonSideArrays.tsx`, new `src/NeonApron.tsx`.
- Exports `TABLE_OUTLINE` (new), `GLASS_OUTLINE` (unchanged values), strip helpers. Strips keep the existing convention: `uv.x` = distance along the path (world units), `uv.y` = 0 → 1 across the width.
- Uses only `NeonSeamMaterial`, `NeonGlassMaterial`, `useNeonHardwareMaterials` from `neonMaterials.tsx`.

**Agent M — materials** owns `src/neonMaterials.tsx`, `src/NeonBoard.tsx`, `src/neonGeometry.ts` (corner detail only; footprint fixed), Neon-only constants in `src/BoardAtmosphere.tsx`.
- `NeonSeamMaterial({ side?: 0|1, strength?: number, color?: string, profile?: 'laser'|'soft'|'solid', flow?: boolean })` — additive, `depthWrite=false`, `toneMapped=false`; profile across `uv.y`.
- `NeonGlassMaterial({ variant?: 'deck'|'lane'|'apron', side?: 0|1 })` — deck adds edge glow (SDF of `GLASS_OUTLINE`), lane bleed, centre glow.
- `useNeonHardwareMaterials()` → `{ chassis, bezel, groove, fascia }`, memoised and disposed on unmount.
- `NeonEdgeMaterial` remains as a compatibility alias.

**Integrator (parent agent)** owns `src/BoardScene.tsx`, `src/neonModelFilter.ts`, `src/LaneRewardGlow.tsx`, `src/NeonHorizonScan.tsx`, tests, evidence and docs.

Classic must not change: every edit is behind `boardStyle === 'neon'` or in Neon-only files.

## Review (independent; reviewers never built the work)

1. Visual quality and reference alignment.
2. Code correctness and regressions (disposal, uniforms, Classic, shader errors, resource counts).
3. Gameplay readability in a populated Cycle.
