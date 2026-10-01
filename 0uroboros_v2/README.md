# 0uroboros: The Circuit and the Serpent

Local Runtime evaluation build built against `0uroboros_v3_1_clean_start`, with current user decisions in `docs/USER_DECISIONS.md`.

Run `npm install`, then `npm run dev`. Open http://127.0.0.1:5173 and choose **Enter evaluation build**. Optionally configure Runtime countdown seconds on entry; no standard Runtime duration is preselected.

Drag Character or VP cards anywhere in a player-side lane, including an unrevealed Node. The hovered lane lights up and the card settles into its placement grid. Click to inspect; Escape cancels a drag. Planning cards stay face up until End Turn, then reveal when their Node is open. After turn three, follow Wave Collapse into Draft. Buy cards, End Draft, then Next Cycle. Crypto enters the hand before moving to its cache and redeeming at Draft.

## Content Studio

Open [Content Studio](http://127.0.0.1:5173/author) or use the link in the game. Cards, Locations, and Circuit Rewards each support creation, duplication, editing, and deletion. Compose each item's unique effects directly in its editor; there is no shared effect library to attach. Duplicates receive independent copies of their recipes. Existing shared references are converted to local recipes when loaded.

The card workbench has a top search and New Card control, category tabs (including Hacker and Generated), and a thumbnail list sortable by name, cost, or Power. The selected card's live preview and properties sit to its right. Fields include artwork, text, cost, Power, VP, Crypto value, class, pool, duration, and executable effects. Generated cards can be used by gain and Morph recipes and tested from the in-game catalog, but never appear in Draft.

Card faces follow the six Figma templates: purple Hacker, blue Action, red Attack, cyan Utility, green Crypto, and gold VP. Runtime cards use the Action frame; Generated cards retain their underlying class. The face preserves authored artwork, shows Duration only when present, and shows the cost badge only in Draft. The editor's **In play / Draft** switch previews both contexts. Names fit between 22px and 14pt (18⅔px), then truncate with an ellipsis; the full name remains available in inspection and the title tooltip. Board and bank miniatures omit the name strip instead of shrinking it below that limit. Effects remain readable in the properties, catalog, Draft descriptions, and inspector.

Click **Save to disk** to persist the complete validated pack to `content/authored-content.json`. The server retains the previous version in `.bak`, rejects invalid references and conflicting saves, and reports errors in the editor. Starting-deck references and minimum game pools must remain valid. Text and executable recipes are separate; changing a description alone does not change behavior.

New games load the latest saved content; a running match keeps its own snapshot. Production builds include the saved pack. Disk authoring requires the local development server; a static production host cannot save files. JSON import/export is also available.

Four new evaluation cards exercise friendly movement, opposing movement, Power boosts, and Power reductions. Select a revealed card when prompted. Movement preserves its owner and respects open Nodes and lane capacity. Power changes update its badge and Node total, follow it when moved, and clear when it leaves deployment. Use the in-game **Card catalog** to add these directly to either test hand.

Effect recipes use **Effect · Count · Target**, with searchable card pickers for Gain Card and Morph. Cards have On Reveal, On Collapse, Recurring, and Scheduled recipes; Locations have On Closure recipes; Circuit Rewards have ordered On Claim recipes. Gain Card supports multiple copies into either player's hand, draw pile, or discard. Morph can evolve through an ordered sequence (holding the final form) or randomly choose a selected form. Each activation changes one physical card, preserving its owner and instance while updating its artwork, properties, Power, and VP. Use a Runtime duration with a Recurring Morph recipe for repeated evolution. Advanced JSON exposes nested choices and underlying properties. Historical bespoke Morph/generator families remain outside the seeded catalog.

`npm run test:authoring` checks filters, numeric sorting, independent item recipes, save/reload/conflicts, a live transformation into an authored Generated form, a complete multi-step Circuit Reward, and responsive layout against an isolated save file on port 5174. `npm run test:card-effects` checks movement animations and Power badges against the running game on port 5173. Both require Google Chrome. Task ownership and acceptance checks: `docs/AUTHORING_MILESTONE.md`.

`npm run test:card-styles` checks all six styled faces, original art, conditional badges, the title-size floor, truncation, mobile preview, dragging, deployment, and a complete Cycle into Draft. It makes no saved content changes. Add `-- --quick` to repeat only preview and Runtime presentation checks.

`npm test` checks the deterministic engine/session. `npm run build` creates `dist`. `npm run test:browser` plays through two full Cycles with the local dev server running and Google Chrome installed, saving screenshots and interaction results to `docs/evidence`. `npm run test:pointer` checks full-lane dragging, cancellation, hover/winner lighting and board spacing. `npm run preview` serves the production build.

## Current scope

The default evaluation market has four fixed Base piles, two rotating Base offers, three VP piles, three Crypto piles and three rotating Chaos offerings. Both players purchase with their own Wallet; ordinary piles share supply, while Chaos limits are per player. Separate End Draft and resume controls are active. Acquired cards enter Discard and return through real reshuffles.

The ten-card starter deck, mirrored five-card opening, draw/discard/reshuffle, alternating chronological reveal, Actions, Crypto, Drain, Restore, DC destruction scoring, repeated Cycles and Cycle 16 scoring remain implemented. Actions carry within a Cycle. Location win counts decide Circuit eligibility and next reveal priority; equal win counts reward both players and retain priority. Node percentages have been removed. Vault Encryption scores 2 VP in the default pack.

Evaluation content exercises Duration/Effect Bank expiry, movement between open Nodes, Power transfers between neighboring Locations, individual card Power changes, shared Trash/recovery, scoring cards and mandatory choices. Historical milestone scope: `docs/STRATEGIC_EVALUATION.md`. Run `npm run test:strategic` for several full browser Cycles with both players buying.

This remains **an evaluation build, not complete Runtime V1**. The five Locations and three Circuit Rewards remain the user-approved historical evaluation pack. The new market is authorized provisional evaluation content, not restored historical or final production canon. Online authority, remote supply races, disconnect handling, Mods and arbitrary full-content interactions remain outside scope. Runtime and generic choice durations have no invented default; Draft defaults to 90 seconds. Some identity artwork remains missing.

## Board and presentation

The current V4 pass adds physical card draws and Crypto deposits, staged Node turnover/closure, a visible Circuit scan, matching Servers, matte stat screens, and a configurable End Turn countdown. See `docs/CYCLE_MOTION_V4.md` for behavior and verification.

Blender MCP produced the versioned `assets/models/ouroboros-board-v4.blend` and `ouroboros-board-v4.glb` now loaded by the client. V3 adds rhombus Power mounts, peaked percentage plates, lower local Servers, clean lane surfaces and pointer-driven full-lane dragging; see `docs/BOARD_INTERACTION_V3.md`. The retained V2 perimeter, original procedural surface maps, rectangular Server lighting and restrained postprocessing are documented in `docs/BOARD_LOOKDEV_V2.md`. The supplied concept layout controls the table geometry and UI anchors. First-party cards/icons are reused. Missing identity art is labeled rather than substituted with unrelated named character artwork. Original SVG source-to-Server paths, reveal/deployment motion and localized shader fields provide sequenced presentation. The renderer never imports reference WebP animations.

Evidence and limitations: `docs/DEVELOPMENT_STATE.md`, `docs/RULES_AUDIT.md`, `docs/BOARD_BUILD.md`, `docs/REFERENCE_STUDY.md`, `docs/VISUAL_CRITIQUE.md`, `docs/generated/SOURCE_INVENTORY.json`.
