# Asset and Source Manifest

This is a semantic manifest. Astra must replace placeholder/historical assumptions with actual paths after inspecting the new repository.

## Required source categories
- canonical game rules
- canonical card data
- Locations
- Circuit Rewards
- approved UX contract
- Base card art
- Chaos card art
- board concept art (including `assets/board` layout authority images)
- icons
- UI/reference visual assets
- effects reference media
- competitive/reference library
- code-based Three.js URLs

Historical inventory previously included approximately 43 Base PNGs, 34 Chaos PNGs, and 17 SVG icons. Count the new folder rather than trusting those totals.

Known prior art names included Slash-Dot, Dotkrawler, Rezz-Razor, Glitch-Witch.exe. Do not assume completeness.

## Vault Encryption
Historical builds lacked an obvious matched first-party identity-art file. Search the new assets. If absent, record `ART_ASSET_MISSING`; do not invent permanent canon art without Mel.

## Icons
Create an icon semantics map. High-confidence concepts include priority, Actions, Crypto, Data Centers/database, deck, discard, hand, Power. Ambiguous icon meaning remains unresolved until evidence clarifies it.

## References
Locate Examples of Good/Great, Marvel Snap, Hearthstone, Slay the Spire, Shards of Infinity, other strategic-card references, Three.js effects URLs, and effect-animation media.

## Obsidian
If connected: first-party world/story source, read-only, not gameplay rules.

## Generated inventory
Astra should create a machine-readable inventory such as `docs/generated/SOURCE_INVENTORY.json` with source ID, path, source class, authority class, media type, tags, visual-inspection status, and notes.


## Board concept art
The `assets/board` folder now contains two first-party board concept images:
- one with cards in hand
- one without cards in hand

These are not moodboard references. They are layout-authority images.

Astra must identify the exact filenames and record them in the generated inventory with tags such as:
- `FIRST_PARTY_LAYOUT_AUTHORITY`
- `BOARD_CONCEPT`
- `HAND_LAYOUT_REFERENCE` or `BASE_LAYOUT_REFERENCE`

## Blender MCP
If Blender MCP tooling is available in the new environment, record it as a production-capable board-building tool. The expected use is to create a 3D board/table closely matching the first-party board concept art.

If Blender MCP is not available, inventory that as a tooling constraint rather than silently downgrading the board plan.
