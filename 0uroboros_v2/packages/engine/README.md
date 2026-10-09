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
