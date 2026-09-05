/**
 * Server entry point.
 *
 * Phase 1 plays through boardgame.io `Local()` in a single browser, so this
 * server is not required yet. It exists so that moving to server-authoritative
 * remote multiplayer is an additive change: swap the client transport from
 * `Local()` to `SocketIO()` and run this process. No rules code changes, because
 * all authority already lives in the game definition and `playerView`.
 */

import { Server, Origins } from 'boardgame.io/server';
import { OuroborosGame } from '../game/OuroborosGame';

const PORT = Number(process.env.PORT ?? 8000);

const server = Server({
  games: [OuroborosGame],
  origins: [Origins.LOCALHOST_IN_DEVELOPMENT],
});

server.run(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`0uroboros game server listening on ${PORT}`);
});
