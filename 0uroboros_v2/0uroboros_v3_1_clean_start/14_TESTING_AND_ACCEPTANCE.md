# Testing and Acceptance

Tests do not replace human visual judgment; human visual judgment does not replace deterministic tests.

## Rule tests
Cover starter deck, Actions, VP free deployment, Crypto non-deployment, draw/reshuffle, reveal order, priority, ControlledWeight, probability floors/normalization, Drain, Restore, Server destruction/VP, Wave Collapse order, Location/Circuit separation, Effect Bank, Draft, endgame.

## Browser smoke
Before checkpoint play at least:
`Cycle 1 Runtime -> Collapse -> Draft -> Cycle 2 Runtime -> Collapse -> Draft -> Cycle 3`
with real deployments/effects where possible.

Verify deploy, reveal, source/target effects, unobstructed Power, Collapse never skipped, Draft never early, purchases/End Draft, next-Cycle initialization, no presentation accumulation/stall.

## Networked play gate
Before any online playtest or public build, two clients on separate machines (or two browser profiles against a real server process, never an in-memory shortcut) must complete at least three Cycles against the authoritative server:
`Lobby -> Cycle 1 Runtime -> Collapse -> Draft -> Cycle 2 -> Collapse -> Draft -> Cycle 3`.

Required evidence on the wire, not only on screen: each socket receives only its own seat's view and redacted, mirrored events; the opponent's hand, draw, and unrevealed placements never appear in any frame; illegal or stale commands are refused by ack with the server's view; one client reloads mid-Draft and rejoins by seat token without the server pausing the other seat; both seats agree on Nodes, VP and Log after every event; disconnect rules from `06_NETWORK_TIMERS_AND_FUTURE_SCOPE.md` fire on the server clock.

The automated form is `npm run test:online` (`scripts/online-two-browser-smoke.mjs`): it builds and starts the server bundle, runs two Chromium contexts, inspects every WebSocket frame for hidden information, and writes `docs/evidence/online-report.json` plus screenshots. `tests/game-server.test.ts` must pass alongside it. A checkpoint that claims networked play is invalid without a passing report from the current commit.

Hardening (roadmap step 14, last part) adds to the gate: `tests/hardening.test.ts` must pass — per-address socket and
auth limits refuse the excess with `error.code = "rate"`; two signed-in players quick-match into one rated pvp table;
`POST /errors` forwards a client crash report and refuses the eleventh in a minute; `/pack/<hash>` serves the current
and previous pack immutably and a client whose bundled hash differs loads the server's pack before playing.

## UX acceptance
Node is one perceptual region; Power belongs to player sides; Location belongs to Node; target/landing preview works; drag never opens full inspect; click/tap inspect works; face-down info hidden; phase/turn always knowable; local resolution local; important text readable.

## Visual acceptance
Compare actual current build against first-party board concept, card art/iconography, Marvel Snap sequencing, Hearthstone motion weight, relevant effect references, and broader Examples of Good/Great. File existence is not quality evidence.

## Effects acceptance
Show representative original effects. No reference animation may be used directly. For relevant implementations show `reference -> principle -> original effect -> gameplay event`.

## Performance
Observe normal desktop behavior, particle/post load, repeated-Cycle stability, memory/effect cleanup, no runaway accumulation.

## Agent evidence
If claiming agent-led work, actual API usage/tracing should prove it where supported.

## Human checkpoint
Valid checkpoint requires rule integrity PASS, multi-cycle PASS, UX PASS, presentation sequencing PASS, visual/reference review completed, meaningful first-party asset use, no catastrophic blocker. Then Astra may stop around 80% direction confidence.

Invalid reasons to stop: arbitrary iteration count, file exists, queue emptied, specialist final answer, quality score based on markers, first pass merely better than previous.
