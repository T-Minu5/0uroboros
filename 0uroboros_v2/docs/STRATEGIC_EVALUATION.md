# Strategic evaluation milestone

## Purpose and authority

Mel requested a strategically representative evaluation with enough market content to exercise the missing systems and meaningful purchasing on both sides. This milestone adds a provisional evaluation catalog; it does not claim that missing historical definitions were recovered or that production balance is approved. The canonical ten-card opening, core Runtime rules, existing evaluation Locations and Circuit Rewards remain the foundation.

Exact card definitions and content scope: `EVALUATION_MARKET.md`, `src/evaluationMarket.ts`. Current authorization: `USER_DECISIONS.md`.

## Player experience

- Draft presents nine persistent Base piles, three VP piles, three Crypto piles, and three rotating Chaos offerings. The tabs separate those categories; every offer shows its cost, effect, remaining supply, Power where applicable, and Duration or scoring value.
- Shared piles compete for supply. Chaos allows each player two independent copies of each offer per Draft.
- The local opponent purchases from its own Wallet and builds a deck. Its choices consider its owned cards and public state; it is a deterministic heuristic opponent, not a claim of strong competitive AI.
- Both players have independent End Draft states. A player may resume while the other has not finished and time remains. Both ready, or expiry, completes Draft. The recent-acquisition feed identifies each buyer.
- Bought cards enter Discard, participate in real reshuffles and appear in later Cycles. No evaluation cards are inserted into the starting hand or deck.
- Duration cards occupy the four-slot Effect Bank. Slots show their art and remaining Cycles, allow inspection, and identify an active source during resolution.
- Mandatory effect choices pause resolution and present only legal options. The dialog supports keyboard focus and prevents tabbing behind it. Generic choice duration remains unspecified; the engine exposes a random-legal timeout fallback without inventing a countdown.
- Movement and probability effects show source-to-destination paths before committing the displayed result. Draws selected through a choice use the same physical hand/Crypto animation as queued draws.
- Shared Trash is inspectable from the header. Trash and recovery effects update the proper zone; cards in Trash are not active owned scoring cards.

## Evaluation questions

1. Can a player distinguish investing in future income from buying immediate Power or VP?
2. Does a Duration card repay its Action and purchase cost across its lifetime?
3. Does moving a card or transferring probability produce an understandable tactical advantage?
4. Does a one-use Crypto card plus shared recovery create an interesting contested resource?
5. Are the market and opponent's purchases readable before the Draft deadline?

## Scope limits

This remains a local evaluator. New values need playtesting and tuning. It does not implement online authority, remote purchase races or disconnect handling. Mods, arbitrary content scripting, movement into unopened Nodes, and the full production catalog remain outside this pack. The existing large production renderer bundle remains a performance concern; broad device certification is not claimed.

## Verification

The initial four-Cycle browser run reached Cycle 5 with 15 local and 10 opponent purchases and acquired-card reveals on both sides. It exposed duplicate React keys on global event presentation; those keys were namespaced before the final rerun. Independent review found that expiry could bypass a queued Circuit claim; authority guards and a natural-flow regression now prevent that sequence. All 77 automated tests pass, including the original regressions, three seeded four-Cycle matches, lethal card Collapse ordering, cross-owner VP recovery and final-Draft scoring. The 21 pointer/layout checks pass at 1600×1000 and 1366×900. Final integrated browser run: **PASS**, four full Cycles alternating normal and fast pace, reaching Cycle 5. It recorded 24 local deployments, 16 local purchases, 12 opponent purchases, eight deployments of acquired local cards and 19 acquired-card reveal events across both owners. Four local effect choices completed, including the draw option. There were zero browser exceptions or console errors.

Additional browser gates passed: early End Draft/resume, exact 9/3/3/3 offered category counts, category filters, pinned controls while scrolling, Effect Bank persistence and inspection, acquired-card play on both sides, and VP/Crypto purchases. The run uses real UI actions and seeded randomness; it does not inject hands, Wallets or acquisitions.

Evidence: `docs/evidence/strategic-browser.json`. Screenshots include `strategic-draft-1.png`, `strategic-draft-scrolled.png`, `strategic-bank.png`, `strategic-bank-inspect.png`, `strategic-choice.png`, and `strategic-final.png`. The previous warning-bearing exploratory run is retained as `strategic-browser-first-run.json` and is superseded by the passing report.

The production build passes; its existing renderer bundle-size warning remains. The browser scenario uses actual UI interactions and a seeded shuffle, without injecting hands, Wallets or acquired cards. Focused rules tests may construct edge-case states to validate supply, expiry, ownership and resolution barriers.

Reproduction: start the local game, then run `npm run test:strategic`. Standard checks remain `npm test`, `npm run build`, and `npm run test:pointer`.

## Review and implementation evidence

Native task specialists handled engine/content and deterministic tests (`rules_audit`), UI-driven browser verification (`reference_study`), and an independent read-only authority/interaction review (`board_build`). Astra integrated Draft, choice, bank and effect presentation. The independent reviewer reproduced the queued-claim progression bug, then verified the fix with the same natural game sequence. No remaining concrete blocker was found in that scoped review; this is not certification of every possible future card interaction.

The project did not add a paid external agent runner or direct paid API calls. Native tool history records the specialist work; model-specific token/cost totals were not exposed and are not invented here.

Final presentation check after the Crypto Wallet color correction: **PASS** at 1600×1000 and 1366×900. All 18 market offers render without horizontal overflow; Wallet/timer/End Draft remain visible while scrolling, the Wallet number uses the approved green, and no browser errors occur. Evidence: `docs/evidence/strategic-draft-layout.json`, `strategic-draft-layout-1600.png`, `strategic-draft-layout-1366.png`, and their `strategic-draft-scrolled-*` companions. Run `npm run test:draft-layout` to reproduce.
