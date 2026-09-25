# LookDev Additions — Mel Editable

## Purpose
Reserved for new, more specific LookDev guidance Mel adds after publication. This keeps art direction extensible without contaminating canonical gameplay docs.

## Authority
Approved additions here outrank generic creative interpretation and competitive-reference suggestions, but do not override canonical gameplay or locked UX unless Mel explicitly changes those decisions.

## Recommended directive format
### Directive title
**Status:** Approved / Experimental / Reference-only

**Goal:** What the player should perceive or feel.

**Applies to:** Board / cards / Locations / Draft / Collapse / Data Centers / HUD / etc.

**Required:** Non-negotiable characteristics.

**Avoid:** Known failure modes.

**References:** Optional asset names/links/concept art.

**Notes:** Implementation freedom.

---

## Current additions

### Directive: Board concept art is layout authority for the 3D gameboard
**Status:** Approved

**Goal:**
Use the two concept images in `assets/board` as the primary layout authority for the gameboard. The in-engine board should closely match their spatial organization, information grouping, and major visual zones.

**Applies to:**
Board / table / HUD integration / player status zones / hand zone / Duration storage / Data Centers / End Turn button / Crypto Cache / pile placement

**Required:**
1. Inspect both images in `assets/board`:
   - one image with cards in hand
   - one image without cards in hand
2. Treat these images as first-party visual authority for:
   - overall board layout
   - player/opponent information placement
   - Duration storage location
   - Primary and Backup Data Center display
   - displayed Data Center power/integrity
   - Actions, Crypto, VP/points, draw pile, discard pile, hand, and Crypto Cache placement
3. Use the image without cards in hand as the clearest source for the underlying board layout.
4. Use the image with cards in hand as the authority for hand placement, spacing/fanning, and how the board should read while cards are in hand.
5. Preserve the End Turn button concept:
   - it appears visually as two sections because one section represents the countdown/timer depletion
   - this is similar in concept to Marvel Snap's turn timer treatment
   - do not misinterpret the split as two unrelated buttons
6. Treat the Crypto Cache as a dedicated board area where drawn Crypto cards in the player's hand sit.
7. Use Blender through the Blender MCP server to create a 3D gameboard that closely matches the concept-art layout whenever that tooling is available.
8. The board must feel like a cohesive 3D game surface, not HUD panels pasted onto a generic environment.
9. Existing approved gameplay and UX rules still apply:
   - Power must remain unobstructed
   - Location belongs to its Node
   - local effects resolve locally
   - drag targets must feel attached to the board
   - readability comes before spectacle

**Avoid:**
- generic sci-fi table substitutions
- ignoring the provided layout art
- moving board zones into arbitrary positions
- turning the End Turn timer split into a separate unrelated control
- treating the Crypto Cache as ordinary hand space
- covering Power values with effects or decorative overlays
- making the board beautiful but strategically unclear

**References:**
- `assets/board/*` (board concept images)

**Notes:**
This directive controls the board's spatial layout and presentation hierarchy. It does not change any approved game rules.
