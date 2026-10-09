import { describe, expect, it } from "vitest";
import { createSession, firstLegalSelection, mirrorEvent, redactEvent, seededRandom, type RuntimeEvent, type RuntimeSession, type SessionView } from "@0uroboros/engine/runtime";
import type { PlayerId } from "@0uroboros/engine/game";

/** Two humans at the table: no AI seat, the evaluation market and Locations, and a clock the test controls. */
function twoHumans(seed = 11, options: { seatNames?: [string, string]; clock?: { now: number } } = {}) {
  const clock = options.clock ?? { now: 1_000_000 };
  const session = createSession({
    carryover: true, priorityPreference: "higher", random: seededRandom(seed),
    strategicMarket: true, evaluationContent: true, aiSeats: [], recordDecisions: false,
    now: () => clock.now, ...(options.seatNames ? { seatNames: options.seatNames } : {}),
  });
  return { session, clock };
}

/** Advances the queue, answering every choice for whichever seat it belongs to. */
function drain(session: RuntimeSession): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (let guard = 0; session.state.choice || session.pendingCount; guard++) {
    if (guard > 5000) throw new Error("Resolution failed to terminate.");
    const choice = session.state.choice;
    if (choice) { events.push(session.choose(firstLegalSelection(choice), choice.owner)); continue; }
    events.push(session.step()!.event);
  }
  return events;
}

/** Each seat places its first affordable non-Crypto card on the first open Node that accepts it. */
function placeOne(session: RuntimeSession, seat: PlayerId): string | null {
  const player = session.state.players[seat];
  const open = session.view(0).openNodes;
  for (const card of player.hand) {
    if (card.type === "Crypto") continue;
    for (const node of open) {
      try { session.deploy(card.id, node, seat); return card.id; } catch { /* try the next Node */ }
    }
  }
  return null;
}

/** One Runtime turn: both seats plan, then commit in `order`. */
function playTurn(session: RuntimeSession, order: [PlayerId, PlayerId]) {
  placeOne(session, 0); placeOne(session, 1);
  const first = session.endTurn(order[0]);
  expect(first?.kind).toBe("turn");
  expect(session.state.phase).toBe("runtime");
  const second = session.endTurn(order[1]);
  expect(second).toBeNull();
  return drain(session);
}

function playCycle(session: RuntimeSession, order: [PlayerId, PlayerId] = [0, 1]) {
  const events: RuntimeEvent[] = [];
  while (session.state.phase === "runtime") events.push(...playTurn(session, order));
  if (session.state.phase === "gameover") return events;
  expect(session.state.phase).toBe("draft");
  events.push(session.endDraft(order[0]), session.endDraft(order[1]));
  expect(session.state.draftEnded).toBe(true);
  events.push(session.nextCycle(), ...drain(session));
  return events;
}

const ids = (cards: { id: string }[]) => cards.map(card => card.id);
/** A view serialised as a client would receive it must not mention these card ids anywhere. */
const mentionsNone = (view: SessionView, secret: string[]) => { const json = JSON.stringify(view); return secret.every(id => !json.includes(`"${id}"`)); };

describe("two human seats", () => {
  it("plays scripted Cycles with both seats committing, and either seat can take its commit back", () => {
    const { session } = twoHumans();
    expect(session.state.turnReady).toEqual([false, false]);
    placeOne(session, 1);
    const waiting = session.endTurn(1)!;
    expect(waiting.text).toMatch(/Opponent commits the turn; waiting for You\./);
    expect(session.state.turnReady).toEqual([false, true]);
    expect(() => session.deploy(session.state.players[1].hand[0].id, 0, 1)).toThrow(/committed/);
    expect(session.view(1).canUndoPlanning).toBe(false);
    expect(session.undoEndTurn(1).text).toMatch(/resumes planning/);
    expect(session.state.turnReady).toEqual([false, false]);
    expect(session.view(1).canUndoPlanning).toBe(true);

    for (let cycle = 1; cycle <= 3; cycle++) {
      expect(session.state.cycle).toBe(cycle);
      playCycle(session, cycle % 2 ? [0, 1] : [1, 0]);
    }
    expect(session.state.cycle).toBe(4);
    expect(session.state.phase).toBe("runtime");
    expect(session.state.turnReady).toEqual([false, false]);
    // Both seats have been through the Draft on their own; nothing was auto-readied for them.
    expect(session.state.draftReady).toEqual([false, false]);
  });

  it("rejects AI-seat commands and keeps the headless clock for all-AI tables", () => {
    const solo = createSession({ carryover: true, priorityPreference: "higher", random: seededRandom(3), strategicMarket: true, evaluationContent: true });
    expect(() => solo.endTurn(1)).toThrow(/played by the AI/);
    expect(() => solo.deploy(solo.state.players[1].hand[0].id, 0, 1)).toThrow(/played by the AI/);
    expect(solo.endTurn(0)).toBeNull();
    expect(solo.state.phase).toBe("reveal");
    const headless = createSession({ carryover: true, priorityPreference: "higher", random: seededRandom(3), strategicMarket: true, evaluationContent: true, aiSeats: [0, 1] });
    expect(headless.endTurn()).toBeNull();
    expect(headless.state.phase).toBe("reveal");
  });
});

describe("what each seat may see", () => {
  it("shows a seat its own hand and face-down placements only, from either side of the table", () => {
    const { session } = twoHumans(5);
    const hand0 = ids(session.state.players[0].hand), hand1 = ids(session.state.players[1].hand);
    const placed0 = placeOne(session, 0)!, placed1 = placeOne(session, 1)!;

    const mine = session.view(0);
    expect(mine.seat).toBe(0);
    expect(ids(mine.players[0].hand)).toEqual(ids(session.state.players[0].hand));
    expect(mine.players[1].hand.every(card => card.hidden)).toBe(true);
    expect(mine.nodes.flatMap(node => node.cards[0]).map(placement => placement.card.id)).toEqual([placed0]);
    expect(mine.nodes.flatMap(node => node.cards[1]).every(placement => "hidden" in placement.card)).toBe(true);
    expect(mentionsNone(mine, [...hand1, placed1])).toBe(true);
    expect(mine.planningCardIds).toEqual([placed0]);

    const theirs = session.view(1);
    expect(theirs.seat).toBe(1);
    expect(ids(theirs.players[0].hand)).toEqual(ids(session.state.players[1].hand));
    expect(theirs.players[1].hand.every(card => card.hidden)).toBe(true);
    expect(theirs.nodes.flatMap(node => node.cards[0]).map(placement => placement.card.id)).toEqual([placed1]);
    expect(theirs.nodes.flatMap(node => node.cards[1]).every(placement => "hidden" in placement.card)).toBe(true);
    expect(mentionsNone(theirs, [...hand0, placed0])).toBe(true);
    expect(theirs.planningCardIds).toEqual([placed1]);
    expect(theirs.canUndoPlanning).toBe(true);

    // The mirror keeps the table consistent: the same Node order, swapped seats.
    expect(theirs.openNodes).toEqual(mine.openNodes);
    expect(theirs.priority).toBe(1 - mine.priority);
    expect(theirs.players[0].totalVP).toBe(session.state.players[1].totalVP);
    expect(theirs.players[1].totalVP).toBe(session.state.players[0].totalVP);
    expect(theirs.turnReady).toEqual([mine.turnReady[1], mine.turnReady[0]]);
  });

  it("names a face-down placement only to its owner, and mirrors event seats", () => {
    const { session } = twoHumans(5);
    const card = session.state.players[1].hand.find(card => card.type !== "Crypto")!;
    const event = session.deploy(card.id, session.view(0).openNodes[0], 1);
    expect(event.cardId).toBe(card.id);
    expect(event.text).toContain(card.name);
    expect(event.publicText).toBe("Opponent deployed a face-down card.");

    const forOwner = redactEvent(event, 1);
    expect(forOwner.cardId).toBe(card.id);
    expect(forOwner.text).toContain(card.name);
    expect(forOwner.publicText).toBeUndefined();

    const forOther = redactEvent(event, 0);
    expect(forOther.cardId).toBeUndefined();
    expect(forOther.text).toBe("Opponent deployed a face-down card.");
    expect(JSON.stringify(forOther)).not.toContain(card.name);

    const mirrored = mirrorEvent({ ...forOther, owner: 1, targetOwner: 0 });
    expect(mirrored.owner).toBe(0);
    expect(mirrored.targetOwner).toBe(1);
    // Public events pass through untouched.
    const plain: RuntimeEvent = { id: 1, kind: "turn", text: "Runtime turn 2 planning begins." };
    expect(redactEvent(plain, 0)).toBe(plain);
  });

  it("keeps a Circuit Reward's identity from the seat that is not eligible, on both sides", () => {
    const { session } = twoHumans(21);
    for (let guard = 0; guard < 6 && session.state.phase !== "draft"; guard++) playTurn(session, [0, 1]);
    expect(session.state.phase).toBe("draft");
    const eligible = session.state.circuitEligible;
    if (eligible.length === 1 && session.state.circuitReward.definition) {
      const seat = eligible[0], other = (1 - seat) as PlayerId;
      expect(session.view(seat).circuitReward.definition?.id).toBe(session.state.circuitReward.definition.id);
      expect(session.view(other).circuitReward.definition).toBeNull();
      expect(session.view(seat).circuitEligible).toEqual([0]);
      expect(session.view(other).circuitEligible).toEqual([1]);
    } else {
      expect(session.view(0).circuitReward.definition).toEqual(session.view(1).circuitReward.definition);
    }
  });
});

describe("narration and clock", () => {
  it("speaks to seat 0 by default and names both seats when asked", () => {
    const solo = twoHumans(2).session;
    playTurn(solo, [0, 1]); playTurn(solo, [0, 1]); playTurn(solo, [0, 1]);
    expect(solo.state.phase).toBe("draft");
    expect(solo.endDraft(0).text).toBe("You ended Draft.");
    expect(solo.endDraft(1).text).toBe("Both players ended Draft.");

    const named = twoHumans(2, { seatNames: ["Ada", "Bo"] }).session;
    expect(named.endTurn(1)?.text).toBe("Bo commits the turn; waiting for Ada.");
    expect(named.undoEndTurn(1).text).toBe("Bo resumes planning.");
    const card = named.state.players[0].hand.find(card => card.type !== "Crypto")!;
    expect(named.deploy(card.id, named.view(0).openNodes[0], 0).publicText).toBe("Ada deployed a face-down card.");
    named.undoAllPlanning(0);
    playTurn(named, [0, 1]); playTurn(named, [0, 1]); playTurn(named, [0, 1]);
    expect(named.endDraft(1).text).toBe("Bo ended Draft.");
    expect(named.endDraft(0).text).toBe("Both players ended Draft.");
    named.endSessionNow();
    expect(named.state.endedReason).toMatch(/(Ada|Bo) wins|Tie/);
  });

  it("reads Draft deadlines and cooldowns from the injected clock", () => {
    const { session, clock } = twoHumans(2);
    playTurn(session, [0, 1]); playTurn(session, [0, 1]); playTurn(session, [0, 1]);
    expect(session.state.phase).toBe("draft");
    expect(session.state.draftEndsAt).toBe(clock.now + 90_000);
    expect(session.expireDraft()).toBeNull();
    clock.now += 90_001;
    expect(() => session.endDraft(0)).not.toThrow();
    expect(session.undoEndDraft.bind(session, 0)).toThrow(/no longer/);
    expect(session.expireDraft()?.text).toMatch(/Draft time expired/);
    expect(session.state.draftEnded).toBe(true);
  });
});

describe("commit order parity", () => {
  it("resolves the same table whichever seat commits first", () => {
    const outcome = (order: [PlayerId, PlayerId]) => {
      const { session } = twoHumans(13);
      for (let cycle = 0; cycle < 3 && session.state.phase !== "gameover"; cycle++) playCycle(session, order);
      const { players, nodes, cycle, turn, phase, weights, priority } = session.state;
      const deck = (seat: PlayerId) => [...players[seat].draw, ...players[seat].hand, ...players[seat].discard].map(card => card.id).sort();
      return { cycle, turn, phase, weights, priority, vp: players.map(player => player.totalVP), servers: players.map(player => player.servers), decks: [deck(0), deck(1)], nodes: nodes.map(node => node.location?.id ?? null) };
    };
    expect(outcome([1, 0])).toEqual(outcome([0, 1]));
  });
});
