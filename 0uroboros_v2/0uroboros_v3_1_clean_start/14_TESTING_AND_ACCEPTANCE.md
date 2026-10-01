# Testing and Acceptance

Tests do not replace human visual judgment; human visual judgment does not replace deterministic tests.

## Rule tests
Cover starter deck, Actions, VP free deployment, Crypto non-deployment, draw/reshuffle, reveal order, priority, ControlledWeight, probability floors/normalization, Drain, Restore, Server destruction/VP, Wave Collapse order, Location/Circuit separation, Effect Bank, Draft, endgame.

## Browser smoke
Before checkpoint play at least:
`Cycle 1 Runtime -> Collapse -> Draft -> Cycle 2 Runtime -> Collapse -> Draft -> Cycle 3`
with real deployments/effects where possible.

Verify deploy, reveal, source/target effects, unobstructed Power, Collapse never skipped, Draft never early, purchases/End Draft, next-Cycle initialization, no presentation accumulation/stall.

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
