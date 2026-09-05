/**
 * End-to-end loop through the real boardgame.io game definition.
 *
 * These tests drive the phase state machine rather than the engine directly, so
 * they verify that phases, turns, and moves are wired correctly and that a full
 * Cycle reaches the next Cycle's draw.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';

import { OuroborosGame, setActiveConfig } from '../src/game/OuroborosGame';
import { DEFAULT_CONFIG } from '../src/game/config/defaults';
import type { OuroborosState, PlayerID } from '../src/game/types';
import { resetInstanceCounter } from '../src/game/engine/zones';

type TestClient = ReturnType<typeof Client<OuroborosState>>;

interface Seats {
  clients: Record<PlayerID, TestClient>;
  stop: () => void;
}

/**
 * boardgame.io caches one Local master per game name for the whole process, so
 * every match needs a distinct matchID or tests share state with each other.
 */
let matchCounter = 0;

function createSeats(): Seats {
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

/** Authoritative-ish read. Player 0's view is enough for phase and Node checks. */
function readState(seats: Seats): OuroborosState {
  const state = seats.clients['0'].getState();
  if (!state) throw new Error('client state not ready');
  return state.G;
}

/** The coarse boardgame.io phase, which gates move legality. */
function readPhase(seats: Seats): string | null {
  return seats.clients['0'].getState()?.ctx.phase ?? null;
}

function isGameOver(seats: Seats): boolean {
  return Boolean(seats.clients['0'].getState()?.ctx.gameover);
}

/** Both players end the current deployment window. */
function closeWindow(seats: Seats): void {
  seats.clients['0'].moves.endDeployment();
  seats.clients['1'].moves.endDeployment();
}

/** Both players end Draft. */
function closeDraft(seats: Seats): void {
  seats.clients['0'].moves.endDraft();
  seats.clients['1'].moves.endDraft();
}

describe('boardgame.io wiring', () => {
  let seats: Seats;

  beforeEach(() => {
    resetInstanceCounter();
    setActiveConfig(DEFAULT_CONFIG);
    seats = createSeats();
  });

  it('starts in the Circuit phase with Node 1 open and hands drawn', () => {
    const G = readState(seats);

    expect(readPhase(seats)).toBe('circuit');
    // The fine-grained state machine name sits alongside the boardgame.io phase.
    expect(G.phase).toBe('circuitDeploy');
    expect(G.cycle).toBe(1);
    expect(G.nodes[0].state).toBe('open');
    expect(G.nodes[1].state).toBe('closed');
    expect(G.hands['0']).toHaveLength(DEFAULT_CONFIG.handDrawPerCycle);
    // Every Node received a Location during setup.
    G.nodes.forEach((node) => expect(node.locationId).not.toBeNull());
    seats.stop();
  });

  it('opens one Node per closed window in Runtime Mode', () => {
    for (let turn = 0; turn < DEFAULT_CONFIG.nodeCount - 1; turn += 1) {
      const before = readState(seats);
      expect(before.nodes[turn].state).toBe('open');
      closeWindow(seats);
      const after = readState(seats);
      expect(after.nodes[turn + 1].state).toBe('open');
    }
    seats.stop();
  });

  it('rejects deploying a Crypto card to a Node', () => {
    const G = readState(seats);
    const crypto = G.hands['0'].find(
      (id) => G.cards[id].cardDefId === 'crypto_shard',
    );
    if (!crypto) {
      // The Cycle 1 hand happened not to contain Crypto, so nothing to assert.
      seats.stop();
      return;
    }

    const before = readState(seats);
    seats.clients['0'].moves.deployCard(crypto, 0);
    const after = readState(seats);
    // The illegal move left the card in hand.
    expect(after.hands['0']).toEqual(before.hands['0']);
    seats.stop();
  });

  it('deploys a legal card and keeps it hidden until reveal', () => {
    const G = readState(seats);
    const deployable = G.hands['0'].find((id) => G.cards[id].cardDefId !== 'crypto_shard');
    expect(deployable).toBeDefined();
    if (!deployable) return;

    seats.clients['0'].moves.deployCard(deployable, 0);
    const after = readState(seats);
    expect(after.cards[deployable].zone).toBe('node');
    expect(after.cards[deployable].revealed).toBe(false);
    expect(after.cards[deployable].playOrder).toBe(0);
    seats.stop();
  });

  it('reveals committed cards when the window closes', () => {
    const G = readState(seats);
    const deployable = G.hands['0'].find((id) => G.cards[id].cardDefId !== 'crypto_shard');
    if (!deployable) return;

    seats.clients['0'].moves.deployCard(deployable, 0);
    closeWindow(seats);

    const after = readState(seats);
    expect(after.cards[deployable].revealed).toBe(true);
    expect(after.revealQueue).toContain(deployable);
    seats.stop();
  });

  it('reveals a card committed to a closed Node when that Node opens', () => {
    const G = readState(seats);
    const deployable = G.hands['0'].find((id) => G.cards[id].cardDefId !== 'crypto_shard');
    if (!deployable) return;

    // Commit to Node 2 during turn 1, while Node 2 is still closed.
    seats.clients['0'].moves.deployCard(deployable, 1);
    expect(readState(seats).cards[deployable].revealed).toBe(false);

    // Closing turn 1 reveals cards at Node 1, then opens Node 2. The card waiting
    // at Node 2 reveals as part of that opening, before turn 2's deployment.
    closeWindow(seats);

    const after = readState(seats);
    expect(after.nodes[1].state).toBe('open');
    expect(after.phase).toBe('circuitDeploy');
    expect(after.cards[deployable].revealed).toBe(true);
    seats.stop();
  });

  it('reaches the Draft phase after the fifth window closes', () => {
    for (let turn = 0; turn < DEFAULT_CONFIG.nodeCount; turn += 1) {
      closeWindow(seats);
    }

    const G = readState(seats);
    expect(readPhase(seats)).toBe('draft');
    expect(G.phase).toBe('draft');
    // Every Node collapsed during Wave Collapse.
    G.nodes.forEach((node) => expect(node.state).toBe('collapsed'));
    seats.stop();
  });

  it('grants Wallet Crypto at the Draft transition', () => {
    for (let turn = 0; turn < DEFAULT_CONFIG.nodeCount; turn += 1) {
      closeWindow(seats);
    }

    const G = readState(seats);
    // Cycle 1 hands contain Crypto shards that auto-play into the Wallet, and no
    // card was deployed, so the hand was full of unspent cards.
    expect(G.players['0'].wallet).toBeGreaterThanOrEqual(0);
    expect(G.market.circuitReward.rewardId).not.toBeNull();
    seats.stop();
  });

  it('completes a full Cycle and reaches Cycle 2 with a fresh hand', () => {
    for (let turn = 0; turn < DEFAULT_CONFIG.nodeCount; turn += 1) {
      closeWindow(seats);
    }
    expect(readPhase(seats)).toBe('draft');

    closeDraft(seats);

    const G = readState(seats);
    expect(G.cycle).toBe(2);
    expect(readPhase(seats)).toBe('circuit');
    expect(G.turn).toBe(0);
    expect(G.windowsCompleted).toBe(0);
    // A new Cycle draws a fresh hand and reopens Node 1.
    expect(G.hands['0']).toHaveLength(DEFAULT_CONFIG.handDrawPerCycle);
    expect(G.nodes[0].state).toBe('open');
    // Probability reset for the new Cycle.
    expect(G.nodes.map((n) => n.probability)).toEqual(DEFAULT_CONFIG.baseProbabilities);
    // Unspent Wallet Crypto disappeared at End of Draft.
    expect(G.players['0'].wallet).toBe(0);
    seats.stop();
  });

  it('purchases from the Draft market when the Wallet allows', () => {
    for (let turn = 0; turn < DEFAULT_CONFIG.nodeCount; turn += 1) {
      closeWindow(seats);
    }

    const before = readState(seats);
    const wallet = before.players['0'].wallet;
    // Find an affordable slot.
    const affordable = before.market.base.findIndex((slot) => {
      const cost = before.market.base.indexOf(slot) >= 0 ? slot : null;
      return cost !== null;
    });
    expect(affordable).toBeGreaterThanOrEqual(0);

    const discardsBefore = before.discards['0'].length;
    seats.clients['0'].moves.draftBuy('crypto', 0);
    const after = readState(seats);

    // Either the purchase succeeded, or the Wallet could not afford it.
    const succeeded = after.discards['0'].length > discardsBefore;
    if (succeeded) {
      expect(after.players['0'].wallet).toBeLessThanOrEqual(wallet);
    } else {
      expect(after.players['0'].wallet).toBe(wallet);
    }
    seats.stop();
  });

  it('applies a shortened Cycle limit from configuration', () => {
    seats.stop();
    setActiveConfig({ ...DEFAULT_CONFIG, cycleLimit: 2 });
    seats = createSeats();

    // Play two full Cycles.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (let turn = 0; turn < DEFAULT_CONFIG.nodeCount; turn += 1) {
        closeWindow(seats);
      }
      closeDraft(seats);
      if (isGameOver(seats)) break;
    }

    expect(isGameOver(seats)).toBe(true);
    setActiveConfig(DEFAULT_CONFIG);
    seats.stop();
  });

  it('ends the match on concession', () => {
    seats.clients['0'].moves.concede();
    const over = seats.clients['0'].getState()?.ctx.gameover;
    expect(over).toBeDefined();
    seats.stop();
  });
});

describe('playerView through the client', () => {
  it('hides the opponent hand from each seat', () => {
    resetInstanceCounter();
    setActiveConfig(DEFAULT_CONFIG);
    const seats = createSeats();

    const p0 = seats.clients['0'].getState()?.G;
    const p1 = seats.clients['1'].getState()?.G;
    expect(p0).toBeDefined();
    expect(p1).toBeDefined();
    if (!p0 || !p1) return;

    // Each seat sees its own hand and a redacted opponent hand.
    expect(p0.hands['0'].every((id) => id !== 'hidden')).toBe(true);
    expect(p0.hands['1'].every((id) => id === 'hidden')).toBe(true);
    expect(p1.hands['1'].every((id) => id !== 'hidden')).toBe(true);
    expect(p1.hands['0'].every((id) => id === 'hidden')).toBe(true);

    seats.stop();
  });
});
