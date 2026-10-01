# Competitive presentation findings

Internal LookDev note for the first game-look pass. Principles only. No layouts, assets, or animations were copied.

## Table perspective

- Source: Marvel Snap board framing; Slay the Spire encounter stage
- Observed: contested space sits in midground. The player looks across a table, not down a spreadsheet.
- Why it works: depth tells ownership and importance before labels do.
- 0uroboros: five Nodes need the same seated read. Opponent far, hand near, Nodes in the middle.
- Do not copy: Snap's three-Location silhouette or energy gem chrome.
- Applied: perspective camera, seated tilt, darker table, quieter grid.

## Quiet vs spectacle

- Source: Snap turn lock-in vs location reveal; StS room vs attack
- Observed: most frames are dark and still. Color and motion arrive when the game changes.
- Why it works: the spike is readable because the rest of the board rests.
- 0uroboros: Collapse is the signature spike. Runtime should stay darker.
- Do not copy: constant neon wash.
- Applied: reserved glow for legal Nodes, focus Node, Drain, Collapse.

## Card as object

- Source: Snap / StS card treatment
- Observed: art is the object. Text is a frame, not the card.
- Why it works: identity is recognized at board scale.
- 0uroboros: first-party Base/Chaos art in the window. Power and cost stay on the frame.
- Do not copy: other games' frames or type badges.
- Applied: `cardArtUrl` plus framed 2D/3D faces.

## Hand as a held fan

- Source: Snap and Hearthstone bottom arc
- Observed: overlap plus a lift on focus. Not every card is fully readable at once.
- Why it works: the hand stays one object.
- 0uroboros: same. Inspect plate still carries full text.
- Do not copy: Snap's exact arc math.
- Applied: `--fan` rotate/lift on the rail.

## Source then target

- Source: Snap on-reveal pops; StS attack intents
- Observed: the acting card speaks first, then the board answers.
- Why it works: the player can reconstruct the event.
- 0uroboros: keep Effect plate + source highlight. Drain/Restore move toward Data Centers.
- Do not copy: anime explosions as a Drain language.
- Applied: shared line/glow grammar. Collapse uses ring compression, not a new palette.

## Phase as a single clock

- Source: Snap cube / turn banner; StS floor and encounter header
- Observed: one place answers "where am I."
- Why it works: HUD does not compete with the board.
- 0uroboros: keep the persistent clock. Do not move phase into 3D text.
- Do not copy: Snap's cube stake UI.
- Applied: HUD remains the clock. 3D owns objects and spectacle.
