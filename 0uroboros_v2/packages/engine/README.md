# @0uroboros/engine

The authoritative rules of 0uroboros as a dependency-free TypeScript package.

- `game.ts`: card types, starter deck, Actions, Servers, reveal ordering primitives.
- `runtime.ts`: `createSession` / `RuntimeSession`, the full Cycle loop (Runtime, reveal, Wave Collapse, Draft) with masked per-seat views.
- `effects/`: the effect language (`types`, `catalog`, `migrate`).
- `evaluationMarket.ts`, `content.ts`, `historicCatalog.ts`: market setup and evaluation content.
- `authoring/contentModel.ts`: content document schema, validation and `compileContent`.
- `ai/`: strategy profiles, the headless self-play harness and system facts.

Rules:

- No imports from the client, the studio or the server. No `window`, `document`, `process` or filesystem access.
- The same module graph runs in the browser (client), in Node (server, league, Eco-Strat) and in Vitest.
- Import with subpaths: `import { createSession } from '@0uroboros/engine/runtime'`.

Seats:

- Every seat-specific call takes the acting seat (`deploy(cardId, node, seat)`, `endTurn(seat)`, `undoAllPlanning(seat)`, `choose(selection, seat)`, `buy(pileId, now, seat)`, `endDraft(seat)`…). `aiSeats` names the seats the engine plays; `[]` seats two humans, `[0, 1]` runs headless self-play.
- `view(seat)` is everything that seat may see, re-indexed so the viewer is index 0; a seat-1 view is the mirror of the table. The other seat's hand, draw order and face-down cards are never in it.
- `redactEvent(event, seat)` is the Log line a seat may read; `mirrorEvent` swaps seats for a mirrored reader. Servers send `view(seat)` and redacted events; they never send `state`.
- `endTurn(seat)` commits a plan; the reveal starts when every human seat has committed (`turnReady`). `seatNames` switches Log text to third person for shared tables; `now` injects the clock.
