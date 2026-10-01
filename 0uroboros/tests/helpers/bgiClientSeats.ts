/**
 * Shared boardgame.io Local client seats for integration tests and harness scripts.
 * Mirrors patterns in tests/gameLoop.test.ts.
 */

import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';

import { OuroborosGame, setActiveConfig } from '../../src/game/OuroborosGame';
import { DEFAULT_CONFIG } from '../../src/game/config/defaults';
import type { OuroborosState, PlayerID } from '../../src/game/types';
import { resetInstanceCounter } from '../../src/game/engine/zones';

export type TestClient = ReturnType<typeof Client<OuroborosState>>;

export interface Seats {
  clients: Record<PlayerID, TestClient>;
  stop: () => void;
}

let matchCounter = 0;

export function bootstrapMatch(): Seats {
  resetInstanceCounter();
  setActiveConfig(DEFAULT_CONFIG);
  return createSeats();
}

export function createSeats(): Seats {
  const multiplayer = Local();
  matchCounter += 1;
  const matchID = `test-match-${matchCounter}`;
  const clients: Record<PlayerID, TestClient> = {
    '0': Client({ game: OuroborosGame, playerID: '0', multiplayer, numPlayers: 2, matchID }),
    '1': Client({ game: OuroborosGame, playerID: '1', multiplayer, numPlayers: 2, matchID }),
  };
  clients['0'].start();
  clients['1'].start();
  return {
    clients,
    stop: () => {
      clients['0'].stop();
      clients['1'].stop();
    },
  };
}

export function readState(seats: Seats): OuroborosState {
  const state = seats.clients['0'].getState();
  if (!state) throw new Error('client state not ready');
  return state.G;
}

export function readPhase(seats: Seats): string | null {
  return seats.clients['0'].getState()?.ctx.phase ?? null;
}

export function isGameOver(seats: Seats): boolean {
  return Boolean(seats.clients['0'].getState()?.ctx.gameover);
}

export function closeWindow(seats: Seats): void {
  seats.clients['0'].moves.endDeployment();
  seats.clients['1'].moves.endDeployment();
}

export function closeDraft(seats: Seats): void {
  seats.clients['0'].moves.endDraft();
  seats.clients['1'].moves.endDraft();
}
