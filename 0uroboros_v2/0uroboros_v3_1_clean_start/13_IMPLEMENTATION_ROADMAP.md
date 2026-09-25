# Implementation Roadmap

Astra may reorder based on dependency evidence. This is an outcome roadmap, not a mandatory task script.

1. **Source/rules foundation** — inventory, canonical structures, deprecated placeholders excluded, starter deck correct, core tests.
2. **Core game state** — players, decks/hands/discards, Nodes, Locations, Data Centers, VP, probability, Actions, Wallet/Crypto, zones, server-authoritative randomness.
3. **Runtime loop** — three turns, Node opening, Actions, deployment, reveal, priority, effects, advancement.
4. **Wave Collapse** — Node 1-5 sequence, Location/card ordering, Power, winner/tie, Location Reward, Effect Bank, weighted selection, Circuit eligibility, game-ending stop.
5. **Draft** — Wallet, supply, purchases, Chaos, Circuit Reward, End Draft, next Cycle.
6. **Multi-cycle stability** — draw/discard/reshuffle, resets, stable barriers, no first-Cycle assumptions, browser smoke.
7. **Player-facing UX** — Node hierarchy, hand/deploy, inspect, target preview, Power/Location, Data Centers, probability, log, Draft, accessibility.
8. **LookDev / first-party identity** — board concept authority, Blender MCP board/table build where available, card art/icons, table/camera/material/lighting, card/Location objects, visual density/negative space.
9. **Effect language** — original reference-informed effects, local source-target storytelling, SVG/R3F/shader as appropriate, theatrical tiers, signature Collapse.
10. **Effect/content coverage** — coverage matrix, enough demo content for supported primitives/edges, Locations/Circuit Rewards, no rule invention.
11. **Demo hardening** — multi-cycle browser play, tests, performance, timing, errors/disconnects where in scope, benchmark review, launch instructions.

Stop before production-polish obsession for the human direction checkpoint.
