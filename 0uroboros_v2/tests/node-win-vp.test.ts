import { describe, expect, it } from "vitest";
import { createSession, firstLegalSelection, seededRandom, type RuntimeSession } from "@0uroboros/engine/runtime";
import { starterCards } from "@0uroboros/engine/game";
import { EVALUATION_LOCATIONS } from "@0uroboros/engine/content";

function make(nodeWinVP = 1) {
  return createSession({
    evaluationContent: true, carryover: true, priorityPreference: "higher",
    random: seededRandom(17), nodeWinVP, midCycleDraw: false,
  });
}

function drain(session: RuntimeSession) {
  const output = [];
  while (session.pendingCount || session.state.choice) {
    if (session.state.choice) { session.choose(firstLegalSelection(session.state.choice)); continue; }
    output.push(session.step()!);
    if (output.length > 500) throw new Error("Resolution did not terminate.");
  }
  return output;
}

function clear(session: RuntimeSession) {
  session.state.players.forEach(player => { player.draw = []; player.hand = []; player.discard = []; player.destroyed = []; });
  session.state.turn = 3;
}

describe("nodeWinVP", () => {
  it("awards Configure VP to the Node controller on Collapse and nothing on a tie", () => {
    const session = make(1);
    clear(session);
    session.state.nodes.forEach(node => { node.location = null; });
    session.state.nodes[0].cards[0].push({
      card: { ...starterCards[0], id: "control-0", power: 3 }, owner: 0, node: 0, order: 1, revealed: true,
    });
    // Node 1 stays empty → Power 0–0 tie.
    session.endTurn();
    const events = drain(session).map(step => step.event);
    const control = events.find(event => event.kind === "vp" && event.node === 0 && /controlling Node 1/.test(event.text));
    expect(control).toMatchObject({ owner: 0, amount: 1, target: "vp" });
    expect(events.some(event => event.kind === "vp" && event.node === 1 && /controlling/.test(event.text ?? ""))).toBe(false);
    expect(session.state.players[0].rewardVP).toBe(1);
    expect(session.state.players[1].rewardVP).toBe(0);
    expect(session.view().finalScore?.[0].locationVP ?? session.state.players[0].rewardVP).toBeGreaterThanOrEqual(1);
  });

  it("stacks with Location reward VP and stays off when configured to 0", () => {
    const off = make(0);
    clear(off);
    off.state.nodes.forEach(node => { node.location = null; });
    off.state.nodes[0].cards[0].push({
      card: { ...starterCards[0], id: "alone", power: 2 }, owner: 0, node: 0, order: 1, revealed: true,
    });
    off.endTurn(); drain(off);
    expect(off.state.players[0].rewardVP).toBe(0);

    const on = make(1);
    clear(on);
    const archive = structuredClone(EVALUATION_LOCATIONS.find(location => location.id === "occult_archive")!);
    on.state.nodes.forEach(node => { node.location = null; });
    on.state.nodes[0].location = archive;
    on.state.nodes[0].cards[0].push({
      card: { ...starterCards[0], id: "winner", power: 2 }, owner: 0, node: 0, order: 1, revealed: true,
    });
    on.endTurn();
    const events = drain(on).map(step => step.event);
    expect(events.some(event => event.kind === "vp" && /controlling Node 1/.test(event.text))).toBe(true);
    expect(on.state.players[0].rewardVP).toBeGreaterThanOrEqual(1);
  });
});
