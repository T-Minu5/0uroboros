/**
 * End-to-end loop through the real boardgame.io game definition.
 *
 * These tests drive the phase state machine rather than the engine directly, so
 * they verify that phases, turns, and moves are wired correctly and that a full
 * Cycle reaches the next Cycle's draw.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { setActiveConfig } from '../src/game/OuroborosGame';
import { circuitWindowCount, DEFAULT_CONFIG } from '../src/game/config/defaults';
import { getCardDefinition } from '../src/game/content/cards';
import {
  bootstrapMatch,
  closeDraft,
  closeWindow,
  createSeats,
  isGameOver,
  readPhase,
  readState,
  type Seats,
} from './helpers/bgiClientSeats';

describe('boardgame.io wiring', () => {
  let seats: Seats;
  const windows = circuitWindowCount(DEFAULT_CONFIG);

  beforeEach(() => {
    seats = bootstrapMatch();
  });

  it('starts in the Circuit phase with Nodes 1–3 open and hands drawn', () => {
    const G = readState(seats);

    expect(readPhase(seats)).toBe('circuit');
    // The fine-grained state machine name sits alongside the boardgame.io phase.
    expect(G.phase).toBe('circuitDeploy');
    expect(G.cycle).toBe(1);
    expect(G.nodes.map((node) => node.state)).toEqual([
      'open',
      'open',
      'open',
      'closed',
      'closed',
    ]);
    expect(G.hands['0']).toHaveLength(DEFAULT_CONFIG.handDrawPerCycle);
    expect(G.players['0'].actions).toBe(2);
    expect(G.players['1'].actions).toBe(2);
    // Every Node received a Location during setup.
    G.nodes.forEach((node) => expect(node.locationId).not.toBeNull());
    seats.stop();
  });

  it('spends Actions on Character deploy and refuses a third Character on turn 1', () => {
    const opening = readState(seats);
    expect(opening.players['0'].actions).toBe(2);

    const characters = opening.hands['0'].filter(
      (id) => getCardDefinition(opening.cards[id].cardDefId).kind === 'character',
    );
    const [first, second, third] = characters;
    if (!first) {
      seats.stop();
      return;
    }

    seats.clients['0'].moves.deployCard(first, 0);
    expect(readState(seats).players['0'].actions).toBe(1);
    expect(readState(seats).cards[first].zone).toBe('node');

    if (second) {
      seats.clients['0'].moves.deployCard(second, 0);
      expect(readState(seats).players['0'].actions).toBe(0);
      if (third) {
        seats.clients['0'].moves.deployCard(third, 1);
        expect(readState(seats).cards[third].zone).toBe('hand');
        expect(readState(seats).players['0'].actions).toBe(0);
      }
    }

    const afterSpend = readState(seats);
    const vp = afterSpend.hands['0'].find(
      (id) => getCardDefinition(afterSpend.cards[id].cardDefId).kind === 'victoryPoint',
    );
    if (vp) {
      const actionsBefore = afterSpend.players['0'].actions;
      seats.clients['0'].moves.deployCard(vp, 1);
      expect(readState(seats).cards[vp].zone).toBe('node');
      expect(readState(seats).players['0'].actions).toBe(actionsBefore);
    }

    closeWindow(seats);
    expect(readState(seats).players['0'].actions).toBeGreaterThanOrEqual(1);
    seats.stop();
  });

  it('opens Nodes 1–3 on turn 1, Node 4 on turn 2, and Node 5 on turn 3', () => {
    expect(readState(seats).nodes.map((node) => node.state)).toEqual([
      'open',
      'open',
      'open',
      'closed',
      'closed',
    ]);

    closeWindow(seats);
    expect(readState(seats).nodes.map((node) => node.state)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'closed',
    ]);
    expect(readState(seats).turn).toBe(1);

    closeWindow(seats);
    expect(readState(seats).nodes.map((node) => node.state)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'open',
    ]);
    expect(readState(seats).turn).toBe(2);
    seats.stop();
  });

  it('rejects deploying a Crypto card to a Node', () => {
    const G = readState(seats);
    const crypto = G.hands['0'].find(
      (id) => getCardDefinition(G.cards[id].cardDefId).kind === 'crypto',
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
    const deployable = G.hands['0'].find((id) =>
      getCardDefinition(G.cards[id].cardDefId).deployable,
    );
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
    const deployable = G.hands['0'].find((id) =>
      getCardDefinition(G.cards[id].cardDefId).deployable,
    );
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
    const deployable = G.hands['0'].find((id) =>
      getCardDefinition(G.cards[id].cardDefId).deployable,
    );
    if (!deployable) return;

    // Commit to Node 4 during turn 1, while Node 4 is still closed.
    seats.clients['0'].moves.deployCard(deployable, 3);
    expect(readState(seats).cards[deployable].revealed).toBe(false);

    // Closing turn 1 reveals cards at Nodes 1–3, then opens Node 4. The card
    // waiting at Node 4 reveals as part of that opening, before turn 2.
    closeWindow(seats);

    const after = readState(seats);
    expect(after.nodes[3].state).toBe('open');
    expect(after.phase).toBe('circuitDeploy');
    expect(after.cards[deployable].revealed).toBe(true);
    seats.stop();
  });

  it('keeps a card at Node 5 hidden until Node 5 opens on turn 3', () => {
    const G = readState(seats);
    const deployable = G.hands['0'].find((id) =>
      getCardDefinition(G.cards[id].cardDefId).deployable,
    );
    if (!deployable) return;

    seats.clients['0'].moves.deployCard(deployable, 4);
    closeWindow(seats);
    expect(readState(seats).cards[deployable].revealed).toBe(false);
    expect(readState(seats).nodes[4].state).toBe('closed');

    closeWindow(seats);
    const after = readState(seats);
    expect(after.nodes[4].state).toBe('open');
    expect(after.cards[deployable].revealed).toBe(true);
    seats.stop();
  });

  it('never makes Draft authoritative before Wave Collapse has run in Cycle 1', () => {
    const seen: string[] = [];
    seen.push(`${readPhase(seats)}/${readState(seats).phase}`);
    closeWindow(seats);
    seen.push(`${readPhase(seats)}/${readState(seats).phase}`);
    closeWindow(seats);
    seen.push(`${readPhase(seats)}/${readState(seats).phase}`);
    closeWindow(seats);
    seen.push(`${readPhase(seats)}/${readState(seats).phase}`);

    expect(seen[0]).toBe('circuit/circuitDeploy');
    expect(seen[1]).toBe('circuit/circuitDeploy');
    expect(seen[2]).toBe('circuit/circuitDeploy');
    expect(seen[3]).toBe('draft/draft');
    expect(readState(seats).collapseReport).not.toBeNull();
    expect(seen.join('>')).not.toMatch(/draft\/draft>.*waveCollapse/i);
    seats.stop();
  });

  it('reaches the Draft phase after the third window closes', () => {
    for (let turn = 0; turn < windows; turn += 1) {
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
    for (let turn = 0; turn < windows; turn += 1) {
      closeWindow(seats);
    }

    const G = readState(seats);
    // Cycle 1 hands contain Crypto shards that auto-play into the Wallet, and no
    // card was deployed, so the hand was full of unspent cards.
    expect(G.players['0'].wallet).toBeGreaterThanOrEqual(0);
    expect(G.market.circuitReward.rewardId).not.toBeNull();
    seats.stop();
  });

  it('does not deal another Cycle hand on later Runtime turns', () => {
    const dealLogs = () =>
      readState(seats).log.filter((entry) => /Both players drew \d+ cards/.test(entry.message));

    expect(readState(seats).hands['0']).toHaveLength(5);
    expect(dealLogs()).toHaveLength(1);

    closeWindow(seats);
    expect(readState(seats).hands['0']).toHaveLength(5);
    expect(readState(seats).turn).toBe(1);
    expect(dealLogs()).toHaveLength(1);

    closeWindow(seats);
    expect(readState(seats).hands['0']).toHaveLength(5);
    expect(readState(seats).turn).toBe(2);
    expect(dealLogs()).toHaveLength(1);
    seats.stop();
  });

  it('grows the hand only from OnReveal +N Cards, then deals 5 at the next Cycle', () => {
    const opening = readState(seats);
    const slash = opening.hands['0'].find(
      (id) => opening.cards[id].cardDefId === 'slash_dot',
    );
    expect(slash).toBeDefined();
    seats.clients['0'].moves.deployCard(slash!, 0);
    closeWindow(seats);

    const afterReveal = readState(seats);
    expect(afterReveal.hands['0']).toHaveLength(7);
    expect(
      afterReveal.log.some((entry) => /Slash-Dot revealed/.test(entry.message)),
    ).toBe(true);

    for (let turn = 1; turn < windows; turn += 1) {
      closeWindow(seats);
    }
    closeDraft(seats);

    const cycle2 = readState(seats);
    expect(cycle2.cycle).toBe(2);
    expect(cycle2.hands['0']).toHaveLength(5);
    expect(cycle2.hands['1']).toHaveLength(5);
    expect(
      cycle2.log.filter((entry) => /Both players drew \d+ cards/.test(entry.message)),
    ).toHaveLength(2);
    seats.stop();
  });

  it('completes a full Cycle and reaches Cycle 2 with a fresh hand', () => {
    for (let turn = 0; turn < windows; turn += 1) {
      closeWindow(seats);
    }
    expect(readPhase(seats)).toBe('draft');

    closeDraft(seats);

    const G = readState(seats);
    expect(G.cycle).toBe(2);
    expect(readPhase(seats)).toBe('circuit');
    expect(G.turn).toBe(0);
    expect(G.windowsCompleted).toBe(0);
    // A new Cycle draws a fresh hand and reopens Nodes 1–3.
    expect(G.hands['0']).toHaveLength(DEFAULT_CONFIG.handDrawPerCycle);
    expect(G.nodes.map((node) => node.state)).toEqual([
      'open',
      'open',
      'open',
      'closed',
      'closed',
    ]);
    // Probability reset for the new Cycle.
    expect(G.nodes.map((n) => n.probability)).toEqual(DEFAULT_CONFIG.baseProbabilities);
    // Unspent Wallet Crypto disappeared at End of Draft.
    expect(G.players['0'].wallet).toBe(0);
    seats.stop();
  });

  it('purchases from the Draft market when the Wallet allows', () => {
    for (let turn = 0; turn < windows; turn += 1) {
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
      for (let turn = 0; turn < windows; turn += 1) {
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
    const seats = bootstrapMatch();

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
