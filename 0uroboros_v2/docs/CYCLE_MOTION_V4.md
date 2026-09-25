# Cycle motion V4

The board now shows card and resource movement rather than simply replacing counts. This pass preserves the approved deck, reward values, randomized Node openings and authoritative event order.

## Card and resource travel

- Opening and earned cards slide into the local hand from the left. Earned Crypto remains visible in the hand after arrival, pauses, then flies into the Crypto Wallet. Opponent draws use anonymous card backs; their identities stay private.
- The Crypto Wallet is the presentation of held Crypto cards, while the Crypto stat remains the spendable total. At Draft, each stored card physically travels to that stat. Its amount appears at contact, and the consumed card leaves the visible stack exactly once.
- The wallet uses green framing, a clear label and stacked faces. Its top tracks the resting hand when the viewport changes. Wider hands tighten their fan to preserve clearance. The wallet and End Turn housing move with the V4 layout.
- Both players' Data Centers use the same housing dimensions and core elevation. Attacked centers flash red; healing remains gold. Their animated integrity fill remains intact.
- Resource screen surfaces are matte, with opaque text backing; the reflective wash behind the stats is removed.

## Node resolution

Collapse visibly visits Nodes 1 through 5. The winning half highlights; both halves highlight on ties. Both lane panels turn right around their vertical screen axis while awards resolve. Their cards turn with them. A Node closes only after its award events complete; lethal Collapse also closes the current Node before ending the game.

Circuit selection then scans across the closed Node plaques and percentages before landing on the engine's already-selected result. The result message and final selection field wait until the scan lands. Selection probabilities and reward eligibility remain unchanged.

## Runtime timer contract

There is **no predefined Runtime duration**. The entry screen optionally configures a duration in seconds, shared by Turns 1–3. Blank means manual End Turn without a fabricated countdown. With a duration set, the single End Turn control contains the depleted/remaining color treatment and supports early completion.

A no-input expiry ends the turn normally. The next decision countdown runs at 1.25× until input clears the inactivity streak. A second consecutive no-input Runtime expiry concedes to the opponent, regardless of VP. Input during Draft also clears inactivity. Resolution and animation clocks never use this multiplier. Holding a card cannot keep a drag active once Runtime input closes.

This remains an offline local session, not network authority. The user-restated disconnect policy (first: 20-second pause then forfeit; second: no pause; third: forfeit), mandatory-choice server fallback, and request-arrival handling remain requirements for future network/choice systems. The existing configurable 90-second Draft deadline is retained; no Runtime default is inferred from it.

## Implementation and verification

- V4 model: `assets/models/ouroboros-board-v4.glb` and `.blend`; the source scripts are `scripts/build-board-v4-base.py` and `scripts/refine-board-v4.py`. The model retains 51 semantic anchors and 49 perimeter assemblies. Eleven material batches include separate matte stat screens and green wallet trim. V1–V3 authoring assets remain preserved.
- Card travel, staged view updates and reward closure: `src/App.tsx`, `src/presentation.ts`, `src/runtime.ts`, `src/cycle-motion.css`.
- Physical lane turnover and Data Center feedback: `src/BoardScene.tsx`, `src/DataCenterLights.tsx`.
- Configurable local timer: `src/decisionClock.ts`, `src/EndTurnControl.tsx`.
- Responsive wallet alignment: `src/useWalletAlignment.ts`.

All 62 rules/session/timer tests pass. The production build passes (the existing renderer chunk-size warning remains). Live timer checks cover no predefined duration, a configured test deadline, 1.25× next-turn depletion, automatic concession, returning a held card on expiry and working inspection on the next turn. The 21 pointer/layout checks also pass, including exact wallet-to-hand alignment at both viewport sizes. A normal-speed Cycle and a fast-speed Cycle both complete through Draft and the next Cycle without page errors. Motion observation confirms real Crypto arrivals in the hand, three physical deposits, all five closures in order, tied winner highlights, and scanning through all Node indices. Four measured Data Center overlay heights match at 18.04 px in the 1600×1000 viewport. A separate 1366×900 pass confirms control bounds, hand/wallet clearance and that the Circuit result is not revealed during the scan.

Evidence: `evidence/cycle-motion-qa.json`, `evidence/cycle-motion-fast-qa.json`, `evidence/selection-qa.json`, `evidence/timer-qa.json`, and `evidence/board-pointer-qa.json`. Screenshots include `motion-board-initial.png`, `motion-board-1366.png`, `motion-draw.png`, `motion-flip.png`, `motion-cash.png`, `motion-attack.png`, and `circuit-node-scan.png`. Run the local server before `npm run test:motion`, `npm run test:motion -- --fast`, `npm run test:timer`, or `npm run test:pointer`.
