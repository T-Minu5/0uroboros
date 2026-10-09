# @0uroboros/server

The authoritative game server. One `Room` per table owns a `RuntimeSession` from the engine, the two seats, every timer and the command log that becomes the replay. Clients only ever receive `view(seat)` and redacted, mirrored Log events; `state` never leaves the process.

## Files

- `room.ts`: seats, join/resume/disconnect, command application, server-owned timers (Draft 90 s from the engine, turn timer, mandatory-choice timeout, reconnect grace), guide-06 disconnect rules, results and replays.
- `lobby.ts`: rooms by invite code (6 characters, no 0/O/1/I), room creation with validated `RoomSettings`.
- `gameServer.ts`: `node:http` + `ws`; `/healthz`; one socket = one seat at most; per-connection message budget.
- `replay.ts`: rebuilds a game from `{ seed, settings, seatNames, aiSeats, commands }`; the rebuilt Log matches the original text for text.
- `store.ts`: `MemoryStore` and `SqliteStore` (`node:sqlite`, no native module) for results and replays.
- `scheduler.ts`: injectable clock; `ManualScheduler` drives the tests.
- `main.ts`: entry point. `PORT`, `HOST`, `OUROBOROS_DB`, `OUROBOROS_MAX_ROOMS`.

## Rules the server enforces

- First disconnect: timers pause for up to 20 s; the opponent is told the seat is away; no return means forfeit.
- Second disconnect: no pause; the seat has 120 s to return before forfeiting.
- Third disconnect: immediate forfeit.
- Turn timer (when the table sets `turnSeconds`): an unready seat's plan is committed as it stands; the next countdown runs 1.25x faster while a seat has been silent; two silent turns concede.
- Mandatory choices resolve to a random legal option after `choiceSeconds`.
- A Draft that both seats end, or that expires, moves to the next Cycle after 1.5 s.
- Both seats gone for 60 s mid-game: the game is recorded as abandoned.

## Running

```sh
npm run server:build          # dist/server/main.mjs (Vite SSR bundle; externals: ws, zod, node:*)
PORT=8787 OUROBOROS_DB=.data/0uroboros.sqlite npm run server:start
```

Tests: `tests/game-server.test.ts` (two seats through three Cycles with replay parity, reconnect mid-Draft, forfeits, turn timer, AI table, 50 rooms in-process and over sockets, SQLite store).
