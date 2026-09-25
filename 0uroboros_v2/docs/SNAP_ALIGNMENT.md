# Snap alignment study — observed evidence and original adaptation

Date: 2026-09-23 UTC. Research only; no production source changes. Reviewed current `docs/evidence/runtime-initial.png` and both first-party `assets/board/game-board_without cards.png` and `game-board_with cards.png`. Read `06A_CANONICAL_CONTENT_CATALOG.md`: all missing specific content remains **SOURCE_REQUIRED**. Nothing here supplies Location rules, rewards, nonstarter definitions or Circuit Reward values.

## Exact primary evidence inspected

The [official Steam store](https://store.steampowered.com/app/1997040/MARVEL_SNAP/) identifies Second Dinner as developer. Retrieved its [public gallery metadata](https://store.steampowered.com/api/appdetails?appids=1997040), opened all six official screenshots, then inspected gameplay screenshots 1 and 2 at full resolution. Temporary study copies were kept only under `/tmp`, never in the production asset tree.

- Gallery 0: [ss_7f1670ed0cc90cb56894f0652c7185b2f87d18a5.1920x1080.jpg](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/7f1670ed0cc90cb56894f0652c7185b2f87d18a5/ss_7f1670ed0cc90cb56894f0652c7185b2f87d18a5.1920x1080.jpg?t=1782145280).
- Gallery 1: [ss_d47d1038edc8a0c2d0fe121008050d4c01adfe0d.1920x1080.jpg](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/d47d1038edc8a0c2d0fe121008050d4c01adfe0d/ss_d47d1038edc8a0c2d0fe121008050d4c01adfe0d.1920x1080.jpg?t=1782145280).
- Gallery 2: [ss_19ca9629dd7846507d6fe0f8374fda8f290d19d8.1920x1080.jpg](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/19ca9629dd7846507d6fe0f8374fda8f290d19d8/ss_19ca9629dd7846507d6fe0f8374fda8f290d19d8.1920x1080.jpg?t=1782145280).
- Gallery 3: [ss_43b137d737d6cc805da7f5477c1ad00e75ffaf21.1920x1080.jpg](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/43b137d737d6cc805da7f5477c1ad00e75ffaf21/ss_43b137d737d6cc805da7f5477c1ad00e75ffaf21.1920x1080.jpg?t=1782145280).
- Gallery 4: [ss_012149a12287c8458e878d60188eba8360386e2d.1920x1080.jpg](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/012149a12287c8458e878d60188eba8360386e2d/ss_012149a12287c8458e878d60188eba8360386e2d.1920x1080.jpg?t=1782145280).
- Gallery 5: [ss_8f9802427a4f58cfa157e2eace993f27e70666e5.1920x1080.jpg](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1997040/8f9802427a4f58cfa157e2eace993f27e70666e5/ss_8f9802427a4f58cfa157e2eace993f27e70666e5.1920x1080.jpg?t=1782145280).

Also inspected 20 sampled frames from the first 60 seconds of the official Steam trailer **How to play**, movie ID `256964418`, one frame per three seconds. Exact [official HLS source](https://video.akamai.steamstatic.com/store_trailers/1997040/598543/7c5061fb6121997d5dedbf24c3ef83808706fd11/1750744104/hls_264_master.m3u8?t=1777781342). A 3-second interval supports broad visual comparison, not precise beat timing; timestamps in the temporary contact sheet are approximate frame-bin centers. No transcript or audio was analyzed. Previous YouTube failures were not retried; this is a distinct working primary source.

The [official media page](https://marvelsnap.com/media/) and [official PC launch article](https://marvelsnap.com/marvel-snap-is-better-than-ever-on-pc/) were checked for source discovery. Their text alone is not motion evidence.

## What was visibly observed

Gallery 1: an open Location has imagery, rule text and scores attached above/below; a neighboring closed face says it will reveal next turn without naming its rule. Gallery 2: portrait cards form 2×2 groups; corner Power stays readable; a winning-side rim meets a large score badge. Galleries 0–2 show locally concentrated effects. Gallery 4 separates deliberate full-card inspect from the board. Trailer samples near 49.5 and 58.5 seconds show enlarged, tilted active cards (Sabretooth/Wolverine), while other cards remain small. Promotional effects sometimes cover large areas; that is not a recommendation to obscure 0uroboros Power.

## Five actionable changes for this build

1. **Make a closed Node a different object state.** Current Node 4/5 primarily change text while preserving the open plate silhouette and visual weight. Put a quiet opaque shutter/sigil face over the existing bridge, with a large Node number and one opening-turn line. At opening, separate two original mechanical halves or sweep a thin scan edge to reveal the same underlying plate. Keep hidden Location identity, rule and reward out of text, accessible labels and DOM before reveal. With SOURCE_REQUIRED content, opening exposes a neutral unassigned state; it must not invent a reward. This is an original shell treatment, not a copied Snap Location frame.

2. **Connect the score to the Node's physical socket.** Replace the small toolbar impression with an uncluttered circular numeral over the first-party ring. Target roughly 22–26 px digits at a 1600 px desktop viewport; use the supplied Power icon more quietly. Join winner emphasis to the corresponding player's socket/half-rim with cyan for local and restrained pink/red for opponent. Ties remain neutral and explicit. Keep probability on its separate lower plinth, avoiding confusion with Power. The first-party concept already supports circular sockets and large numbers.

3. **Preserve portrait card identity at board scale.** Current 54×56 field tiles crop the art into near-squares. Test approximately 58×74 or 62×78 cards in the existing 2×2 wells, reserving an unclipped corner badge. Keep title/art/Power at board scale; full effect prose belongs to deliberate inspect. The newly enlarged hand is substantially better than the earlier build; keep its stable text strip and fan clearance rather than copying Snap's illustrated logo typography. Inspect must remain click/tap, never a hover surprise.

4. **Give the active reveal a physical identity beat.** Temporarily lift and enlarge the actual source card about 1.25–1.4× inside its own region, preserving its anchor and owner. Rotate through a face-down midpoint, expose the first-party art and Power, then settle before starting its consequential path. Reuse the existing authoritative event queue and contact-delayed snapshot. Proposed timings are ours (for example 180 ms anticipation, 360 ms turn, 200 ms settle, 300 ms read); they are not measured Snap timings. Do not add a second floating duplicate that remains after the source settles.

5. **Use contrast to focus one local story.** During a tactical event, brighten only the source, path and target; slightly dim adjacent wells while leaving their scores readable. Keep source narration on that player's half. Center UI announces only global phase or final selection. Suppress constant competing ring motion when no event is active. The current board has large uniformly empty wells and repeated status text, so a bounded moving focus will improve readability more than adding global glow. Preserve a quiet interval after the result before advancing.

## Verification targets and limits

Capture closed Node 4/5 beside open Node 1–3, then the opening transition; verify that hidden names/rules/rewards are absent from the rendered and accessible interface. Capture four cards in each side of one Node, nonzero winning/tied scores, and a reveal at its peak. Confirm the source remains identifiable and Power/probability remain unobstructed. Check a 3-, 5-, and 7-card hand. No game-content proposal is authorized by this study, and none of the external artwork, frame geometry, logos, sound or screenshot media may ship.
