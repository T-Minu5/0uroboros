# Phase 1 handoff — first playable build

Status of the first playable build, the assumptions baked into it, the product
decisions it deliberately did not make, and what Phase 2 should pick up.

Source of truth for every rule referenced here is `0uroboros_agent_docs_v0.1/`.

## What is playable

Two seats in one browser can play Runtime Mode end to end: five deployment
windows with one Node opening per window, simultaneous secret deployment,
alternating reveal by controlled weight, Wave Collapse across Nodes 1–5 plus the
Effect Bank, probabilistic Circuit Reward selection, Draft, and the Cycle 2 draw.

- `npm run dev` — playtest shell, hot seat or split view
- `npm test` — 170 rules tests, no browser required
- `npm run build` — production bundle

Placeholder content exercises deployment, Power modification, on-play / on-reveal
/ on-collapse timing, Crypto income, Victory Points, drafting, deck growth, Trash
versus Destroyed, probability transfer, Effect Bank durations, and Data Center
damage and healing.

## Contradictions found against the docs, and how they were resolved

Four behaviors diverged from the documentation and were corrected. Each now has a
test that fails if the behavior regresses.

**Starting deck composition.** The deck held 5 Character, 4 Crypto, and 1 Victory
Point card. `01_PROJECT_BRIEF.md` specifies 2 Victory Point cards, so the deck is
now 4 Character, 4 Crypto, and 2 Victory Point.

**Location rewards resolved too early.** Winner-dependent Location text resolved
at step 1 of the per-Node Collapse order, before card `onCollapse` effects could
change the outcome. `02_CORE_RULES_CIRCUIT_COLLAPSE.md` grants Location rewards at
step 5, after the winner is determined. Rewards now resolve after the final Power
comparison, so a card that trashes itself on collapse can hand the Node and its
reward to the opponent.

**Crypto deleted before it could be spent.** End-of-Cycle cleanup discarded the
entire hand, including Crypto, before the Draft transition auto-played it. Every
Crypto card left in hand was silently lost income. Cleanup now leaves Crypto for
the Draft transition, which credits the Wallet, fires `onDraftStart` effects, and
then sends the card to Discard under normal destination rules.

**Cards did not reveal when their Node opened.** A card committed to a still-closed
Node stayed hidden until the end of the *following* window, so players deployed
into that window without seeing it. The docs reveal such cards as the Node opens,
before the new deployment window. There are now two reveal moments per window:
eligible cards reveal when the window closes, then the newly opened Node runs its
own opening reveal sequence.

## Assumptions made where the docs were ambiguous

**Local multiplayer for Phase 1.** boardgame.io `Local()` with two `playerID`
seats in one browser. `playerView` already enforces the public/private boundary
per seat, so moving to `SocketIO` plus `Server` is additive.

**Location text versus Location reward.** Both come from Location text, but the
docs resolve text at step 1 and rewards at step 5. The split is derived from the
data rather than authored twice: any effect whose target references the Node
winner or loser is treated as a reward and waits for the final outcome, and
everything else resolves at step 1. Content authors get the documented ordering
without a second timing field to keep in sync.

**Card `onCollapse` effects receive no winner context.** The winner is not yet
determined at step 2 of the per-Node order, so a card referencing the winner
resolves as "no valid target" and is logged rather than guessing at a pre-effect
outcome. No placeholder card relies on this. If cards need winner references, the
docs need a per-Node ordering decision first.

**Typed effect ops instead of a keyword grammar.** Effects are structured ops
(`addPower`, `transferProbability`, `damageDataCenter`, and so on) rather than
parsed prose. The final keyword grammar is still an open product decision, and
ops are what the grammar would compile to anyway.

**Reveal priority is fixed once per window.** Controlled weight is evaluated once
when a window closes, not recalculated between individual reveals within the
window, so the reveal order cannot shift while it is being played out.

**Chaos offerings may repeat between Drafts,** behind a config flag, matching the
docs' allowance for early development.

## Deferred, with hooks in place

- Google / email auth, matchmaking, Membership, private games
- Turn and Draft timers: values live in config but nothing counts down or
  auto-ends a window. Every window ends on explicit player action
- Short-Circuit Mode: the engine runs it as a single deployment window via
  `mode`, but no UI entry point exists
- Disconnect, reconnect, and AFK production behavior
- Final card art, frames, rarity treatments; card components take placeholder
  chrome only and are structured so art can be layered in
- Animation queue: phase changes announce through a simple overlay

## Open product decisions, unchanged from the plan

- Exact effect keyword grammar
- Chaos repeat policy for later development
- Whether the default Cycle limit of 16 survives playtesting; short limits are
  already configurable for smoke tests

## Recommended Phase 2 order

1. Swap `Local()` for `SocketIO` plus `Server`, which makes purchase atomicity
   and Wallet authority real rather than simulated
2. Enforce turn and Draft timers server-side, including the AFK path
3. Author real content volume against the systems the placeholders exposed
4. Build the animation and resolution queue so reveal and Collapse read as
   sequenced beats instead of instant state changes
5. Auth and matchmaking
6. Short-Circuit Mode UI
