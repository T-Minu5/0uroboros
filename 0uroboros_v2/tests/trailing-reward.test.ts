import { describe, expect, it } from "vitest";
import authored from "../content/authored-content.json";
import { compileForSelfPlay } from "@0uroboros/engine/ai/selfPlay";
import { validateContent, type ContentDocument } from "@0uroboros/engine/authoring/contentModel";
import { serverVPNote } from "../server/aiStrategist";
import { withTrailing } from "../src/authoring/modRewards";
import { projectedVP, starterCards, trailingPlayer, type PlayerId } from "@0uroboros/engine/game";
import { createSession, firstLegalSelection, seededRandom, type RuntimeSession } from "@0uroboros/engine/runtime";

const document = (authored as unknown as { document: ContentDocument }).document;
const trailingContent = compileForSelfPlay({ ...document, circuitRewards: document.circuitRewards.map(reward => withTrailing(reward, true)) });

function drain(session: RuntimeSession) {
  let steps = 0;
  while (session.pendingCount || session.state.choice) {
    if (session.state.choice) { session.choose(firstLegalSelection(session.state.choice)); continue; }
    session.step(); if (++steps > 500) throw new Error("Resolution did not terminate.");
  }
}
function cycleEnd(locationWinner: PlayerId, setup: (session: RuntimeSession) => void) {
  const session = createSession({ evaluationContent: true, carryover: true, priorityPreference: "higher", random: seededRandom(17), content: trailingContent });
  session.state.players.forEach(player => { player.draw = []; player.hand = []; player.discard = []; player.destroyed = []; player.rewardVP = 0; });
  session.state.turn = 3;
  session.state.nodes.forEach(node => { node.location = null; });
  for (let node = 0; node < 5; node++) session.state.nodes[node].cards[locationWinner].push({ card: { ...starterCards[0], id: `winner-${node}`, vp: undefined, onReveal: [] }, owner: locationWinner, node, order: node + 1, revealed: true });
  setup(session);
  session.endTurn(); drain(session);
  return session;
}

describe("projected VP", () => {
  it("credits the share of each standing enemy Server's destruction VP matching the health it has lost", () => {
    expect(projectedVP(3, { primary: 500, backup: 1500 }, { primary: 8, backup: 16 })).toBe(9);
    expect(projectedVP(0, { primary: 2000, backup: 1500 })).toBe(0);
    expect(projectedVP(10, { primary: 0, backup: 750 }, { primary: 8, backup: 16 })).toBe(18);
  });

  it("names the player behind, or nobody when level", () => {
    const full = { primary: 2000, backup: 1500 };
    expect(trailingPlayer([{ vp: 5, servers: full }, { vp: 4, servers: full }], { primary: 8, backup: 16 })).toBe(1);
    expect(trailingPlayer([{ vp: 0, servers: full }, { vp: 5, servers: { primary: 500, backup: 1500 } }], { primary: 8, backup: 16 })).toBe(1);
    expect(trailingPlayer([{ vp: 6, servers: { primary: 500, backup: 1500 } }, { vp: 0, servers: full }], { primary: 8, backup: 16 })).toBeNull();
  });
});

describe("Server VP change announcement", () => {
  it("tells an agent once when destruction VP changes, and stays quiet otherwise", () => {
    const now = { primary: 16, backup: 24 };
    expect(serverVPNote({ primary: 8, backup: 16 }, now)).toMatch(/Primary Server now gives \+16 VP and a Backup \+24 VP \(was 8 and 16\), 40 VP for both/);
    expect(serverVPNote({ primary: 8, backup: 16 }, now)).toMatch(/moves the score more/);
    expect(serverVPNote(now, { primary: 12, backup: 20 })).toMatch(/\(was 16 and 24\), 32 VP for both\. Server damage now moves the score less/);
    expect(serverVPNote(undefined, now)).toMatch(/now gives \+16 VP.*Plan Drain/);
    expect(serverVPNote(now, now)).toBeNull();
    expect(serverVPNote(undefined, now, true)).toBeNull();
  });
});

describe("Circuit Rewards awarded to the trailing player", () => {
  it("goes to the trailing player even when the other player won every Location", () => {
    const session = cycleEnd(0, game => { game.state.players[1].servers = { primary: 500, backup: 1500 }; game.state.players[1].rewardVP = 5; });
    expect(session.state.circuitReward.definition?.awardTrailing).toBe(true);
    expect(session.state.circuitEligible).toEqual([1]);
  });

  it("counts Server damage taken against the player who took it", () => {
    const session = cycleEnd(1, game => { game.state.players[0].rewardVP = 3; game.state.players[0].servers = { primary: 1000, backup: 1500 }; });
    expect(session.state.circuitEligible).toEqual([0]);
  });

  it("makes both players eligible when neither trails", () => {
    const session = cycleEnd(0, () => undefined);
    expect(session.state.circuitEligible).toEqual([0, 1]);
  });

  it("is stored as an optional boolean on the reward", () => {
    const flagged = { ...document, circuitRewards: document.circuitRewards.map((reward, index) => index === 0 ? withTrailing(reward, true) : reward) };
    expect(validateContent(flagged)).toEqual([]);
    expect(validateContent({ ...document, circuitRewards: document.circuitRewards.map((reward, index) => index === 0 ? { ...reward, awardTrailing: "yes" } : reward) })).toContain("circuitRewards[0].awardTrailing: expected boolean");
    expect("awardTrailing" in withTrailing(withTrailing(document.circuitRewards[0], true), false)).toBe(false);
  });
});
