# Current revision — Location control and full historic catalog

2026-09-24: the current build has **74 playable definitions: 65 historic cards and 9 distinct retained evaluation cards**. Forty-one morph/generative definitions remain explicitly deferred. A searchable Card Catalog can add any active definition to either test hand before planning placements; normal Draft keeps its 4 persistent Base + 2 rotating Base + 3 Chaos + 3 VP + 3 Crypto structure. Historic identity, costs, art, descriptions and original effect arrays are preserved, with clarified adaptations for Power, neighboring Power transfer, and Runtime schedules. See `CIRCUIT_CONTROL_REVISION.md` and `EVALUATION_MARKET.md`.

Circuit eligibility and reveal priority now use Location control counts. Tied Circuit counts reward both players. Percentages and weighted Circuit selection are gone from active play. Unopened Nodes accept cards; their opening window reveals committed cards before new planning. Current-turn local cards remain face up until End Turn; Undo restores all current placements and Action spending.

The board now has animated glass/gel Server tubes, integrity-dependent lighting, angular ritual inlays, longer local lanes, integrated diamond Power sockets, and aligned wallet/Effect Bank/pile controls. Source-side award ripples include a narrow laser sweep and never run on an already closed Node.

Validation: **185 tests pass**, including all 74 active definitions exercised through four Cycles each with card-conservation, timing, choice and resource checks. Production build passes with the existing bundle-size advisory. Browser verification at 1014×803 confirms sealed-node face-up planning, Undo restoration, End Turn concealment/lock, deferred opening reveals, neighboring Power conservation, catalog injection, a complete 2–2 tied Circuit award, purchases by both players, and five-card dealing into Cycle 2. This browser run includes a deliberate catalog-injected Quantum Telemetry card; it is an evaluation fixture, not an unmodified starting-deck run.

Source caveat: Zenith Worx/Wetware artwork contains “10 VP,” while the supplied JSON effects specify 8 VP. The build preserves that supplied art and follows the JSON's 8 VP. Full-bank displacement remains unspecified; existing behavior rejects a new Duration entry when all four slots are occupied. Online multiplayer remains outside this local evaluator.

The entries below are historical checkpoints and are superseded where they conflict with this current revision.

# Supplied catalog integration update

`assets/card_art/cards.json` now provides 106 source definitions. All artwork paths are normalized: 105 exact image matches and one supplied-placeholder fallback. The game displays real starter Crypto/VP art and resolves catalog artwork independently from mechanics. Source Mega-Cache (cost 9, +5 Crypto) replaces the provisional Alchemic Mega Crypto market identity. Existing starter rules remain intact.

80 automated tests, the build and the focused artwork browser check pass. The broader catalog's gameplay activation awaits Node Power, Duration-unit and conflicting-text decisions; see `CARD_CATALOG_ADAPTATION.md`. The earlier source-missing statements below are historical: the source now exists, but adaptation is not complete.

# Strategic evaluation update

The current client now enables the strategic market as a 4+2+3 structure: four persistent Base piles, two rotating Base offers each Cycle, three VP piles, three Crypto piles and three of thirteen Chaos offerings each Draft. The opponent buys cards and both players have independent readiness. The rotating pools are now broad enough to produce meaningfully different shops between games, and the Draft UI separates rotating Base tech, Chaos rotation, the core Base market, VP vaults and the Crypto cache. The former Power line is now organized as Horrors under `assets/card_art/chaos cards/horrors` (Hacker art lives in `chaos cards/hackers`), and the live Chaos roster now includes playable Horror cards such as Sudo Demiurge, Cicada 3301, Subroutine Succubus, Node Feratu and Veil of Cthulhu alongside the attack cards. Byte-Coin, Kilo-Coin and Mega-Cache remain the active Crypto trio. Duration/Effect Bank, open-Node movement, probability transfer, imported scripted choices, deck mill, restoration swings and backup-targeting attacks are implemented for this provisional content. See `STRATEGIC_EVALUATION.md` and `EVALUATION_MARKET.md` for current scope and verification.

Validation: 80 automated tests and the production build pass. The final four-Cycle browser run reaches Cycle 5 with 16 local and 12 opponent purchases, acquired-card reveals on both sides and zero browser errors. Independent authority review verified the queued-claim progression fix.

This supersedes historical statements below that the market is starter-only, the opponent never purchases, or all Duration/movement/Trash/choice systems are absent. Production catalog approval, online authority, Mods and broader interactions remain incomplete. The board model is still V4. Earlier sections retain dated evidence and are not the current acceptance result.

# Current evaluation update

Latest: `CYCLE_MOTION_V4.md` covers earned-card arrivals, physical Crypto deposits, responsive green wallet, equal Servers, red damage flashes, matte stats, Node turnover/closure and Circuit scanning. Runtime countdown is optional/configurable with no invented duration; inactivity behavior is implemented for the local evaluator. 62 unit tests and complete normal/fast motion checks pass.

The latest board interaction and composition pass is documented in `BOARD_INTERACTION_V3.md`: seamless pointer dragging, full-lane drop regions, single-lane hover lighting, winning-side surface glow, rhombus Power mounts, peaked percentage plates, lower local Servers and a higher board position. The client and production build use the V3 GLB. All 56 deterministic tests and 21 focused pointer/layout checks pass.

Final V3 browser regression passes two full Cycles at normal/fast pace: 15 deployments, two purchases, two privilege claims, no probability overlap and zero browser exceptions. TypeScript/Vite build and geometry-contract verification pass. The browser effect-color check now samples presence/style together to avoid reading detached fast effects.

User approved the recovered five-Location/three-Circuit-Reward pack for evaluation. Implemented in src/content.ts and src/runtime.ts, enabled in the UI. Full nonstarter catalog remains unresolved. Current build review and latest browser evidence supersede the historical progress notes below. Official Snap screenshots and sampled gameplay were inspected; see SNAP_ALIGNMENT.md.

# Recoverable development state

Mission: substantial Runtime V1, V3.1 authority; no approved rule changes. This file is working state, not a human-checkpoint pass.

Architecture: one deterministic TypeScript local session authority; immutable masked view snapshots; presentation queue gates commands and Draft. React UI, R3F/Three.js scene importing real Blender GLB. No new agent runner. Remote server, accounts and matchmaking are not implemented.

Current specialist work, native collaboration tool calls (exact model variant/token counts are not exposed):
- /root/rules_audit: engine primitives, session, deterministic tests, audit.
- /root/board_build: Blender MCP model, rendering, GLB export and geometry QA.
- /root/reference_study: primary references/local animation study, then frontend integration.
- /root: source audit, authority synthesis, inventory, R3F board integration, packaging and browser validation.

No direct paid OpenAI API requests made by project code during this work. Native delegated agent usage is recorded by the Codex task tool history; no fabricated token/cost totals. Existing astra-test.mjs was inspected but not executed (it prints key fragments).

Assets: supplied board concepts inspected. Blender geometry completed. Source inventory records actual per-file status, not historical inspection assertions.

User approved Action carryover within a Cycle; see USER_DECISIONS.md. Missing content remains explicit. Starter practice is a mechanical verification fixture and cannot satisfy full-market/Location/Reward/scoring acceptance.

Launch: npm run dev at http://127.0.0.1:5173. Build: npm run build. Tests: npm test. Assets copy whitelist excludes effect references and Blender editing sources from dist.

Outstanding: integrate UI, browser multi-Cycle validation, visual critique/iteration, resolve approved full content, verify actual competitive footage (retrieval blocked), full content test coverage. Do not label current work 80%-direction checkpoint until acceptance gates actually pass.

## Latest supported-build evidence

- User decisions resolved: carryover=true, higher ControlledWeight priority, Vault Encryption=2 scoring VP.
- Engine/session: 32 passing tests, including conservation/visibility checks across12 seeds x3 Cycles, purchase deadlines/cooldowns, and16-Cycle final scoring.
- Browser first complete run:15 drag deployments,2 purchases,2 observed Collapse/Draft sequences into Cycle3, click-inspect PASS, drag-inspect suppression PASS,0 browser errors.
- Subsequent refinement: original card flight before arrival/commit; fixed mid-effect speed toggling and queue reentrancy; world-anchored HUD, darker cloned renderer materials, larger readable hand; browser regression in progress.
- Full catalog now explicitly blocked by newly supplied06A canonical catalog SOURCE_REQUIRED status. This is a source boundary, not a valid full Runtime V1/80%-direction checkpoint.

Final regression after card-flight/timing/visual fixes: PASS.15 deployments,2 purchases,2 complete Cycles into Cycle3, inspect PASS, drag-inspect suppression PASS,0 browser errors. See docs/evidence/browser-play.json. Production build PASS; production asset whitelist verified zero reference WebPs/concepts/Blender sources. Independent final visual critique records remaining shading, probability clearance and microcopy weaknesses.

Full mission remains incomplete at genuine source boundary:06A content tables SOURCE_REQUIRED. Do not mistake this starter validation for complete content/Duration/Location/Reward/network acceptance.
