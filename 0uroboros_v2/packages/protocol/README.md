# @0uroboros/protocol

What travels between a game client and the game server.

- `messages.ts`: `ClientMessage` (lobby and `Command`s, zod-validated on the server), `ServerMessage` (seat views, redacted Log events, timers, presence, results) and `PROTOCOL_VERSION`.
- Views are `SessionView`s from `view(seat)`: the receiving seat is always index 0. Events pass through `redactEvent` and, for seat 1, `mirrorEvent`. `RuntimeSession.state` never crosses the wire.
- Depends on `zod` and engine types only; no runtime import of the engine.
