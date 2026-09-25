import { describe, expect, it } from "vitest";
import { EVALUATION_LOCATIONS, EVALUATION_CIRCUIT_REWARDS } from "../src/content";
import { createSession, seededRandom, type RuntimeSession } from "../src/runtime";
import { starterCards } from "../src/game";

const make = (seed = 17) => createSession({ evaluationContent: true, carryover: true, priorityPreference: "higher", random: seededRandom(seed) });
function drain(session: RuntimeSession) {
  const output = [];
  while (session.pendingCount) { output.push(session.step()!); if (output.length > 500) throw new Error("Resolution did not terminate."); }
  return output;
}
function clear(session: RuntimeSession) {
  session.state.players.forEach(player => { player.draw = []; player.hand = []; player.discard = []; player.destroyed = []; });
  session.state.turn = 3;
}
function locationOnly(session: RuntimeSession, id: string, index = 0) {
  session.state.nodes.forEach(node => { node.location = null; });
  session.state.nodes[index].location = structuredClone(EVALUATION_LOCATIONS.find(location => location.id === id)!);
}
function winNode(session: RuntimeSession, index: number, owner: 0 | 1) {
  session.state.nodes[index].cards[owner].push({ card: { ...starterCards[0], id: `winner-${index}` }, owner, node: index, order: index + 1, revealed: true });
}
function draftFixture(rewardId: string, eligible: (0 | 1)[] = [0, 1]) {
  const session = make();
  session.state.phase = "draft";
  session.state.draftEndsAt = Date.now() + 90000;
  session.state.circuitEligible = eligible;
  session.state.circuitReward.definition = structuredClone(EVALUATION_CIRCUIT_REWARDS.find(reward => reward.id === rewardId)!);
  return session;
}

describe("Evaluation Location content", () => {
  it("assigns exactly the approved five once per Cycle and masks closed Locations", () => {
    const session = make();
    const before = session.state.nodes.map(node => node.location!.id);
    expect(new Set(before).size).toBe(5);
    expect([...before].sort()).toEqual(EVALUATION_LOCATIONS.map(location => location.id).sort());
    session.view().nodes.forEach((node,index)=>{if(!session.view().openNodes.includes(index))expect(node.location).toBeNull();});
    for (let turn = 1; turn <= 3; turn++) { session.endTurn(); drain(session); }
    session.endDraft(); session.nextCycle();
    const after = session.state.nodes.map(node => node.location!.id);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after).not.toEqual(before);
  });

  it("grants both tied players Location Crypto and earned VP after each Node's final Power", () => {
    const session = make(); clear(session);
    session.endTurn(); const result = drain(session);
    expect(session.state.players[0].wallet).toBe(3);
    expect(session.state.players[0].rewardVP).toBe(3);
    expect(session.state.players[0].totalVP).toBe(3);
    const draft = result.find(step => step.event.kind === "draft")!;
    expect(draft.view.players[1].wallet).toBe(3);
    expect(draft.view.players[1].rewardVP).toBe(3);
    expect(session.state.players[0].centers.primary).toBe(2000);
    expect(session.state.players[1].centers.primary).toBe(2000);
    for (let node = 0; node < 5; node++) {
      const power = result.findIndex(step => step.event.kind === "power" && step.event.node === node);
      const gains = result.map((step, i) => ({ ...step.event, i })).filter(event => event.source === "location" && event.node === node && ["crypto", "vp", "draw", "drain"].includes(event.kind));
      expect(gains.every(event => event.i > power)).toBe(true);
    }
  });

  it("Signal tower reshuffles Discard and newly drawn Crypto resolves in the same Draft", () => {
    const session = make(); clear(session); locationOnly(session, "signal_tower"); winNode(session, 0, 0);
    session.state.players[0].discard = [{ ...starterCards[5], id: "signal-coin" }];
    session.endTurn(); const result = drain(session);
    const draw = result.find(step => step.event.kind === "draw" && step.event.source === "location")!;
    expect(draw.event.amount).toBe(1);
    expect(draw.view.players[0].hand[0].id).toBe("signal-coin");
    const coin = result.find(step => step.event.kind === "crypto" && step.event.cardId === "signal-coin")!;
    expect(coin.event.amount).toBe(2);
    expect(session.state.players[0].wallet).toBe(2);
    expect(session.state.players[0].discard.some(card => card.id === "signal-coin")).toBe(true);
    expect(result.findIndex(step => step.event.text.startsWith("End of Cycle"))).toBeLessThan(result.indexOf(coin));
  });

  it("Breach relay damages only the final loser with no spill and no tied damage", () => {
    const session = make(); clear(session); locationOnly(session, "breach_relay", 2); winNode(session, 2, 0);
    session.state.players[1].centers.primary = 100;
    session.endTurn(); const result = drain(session);
    const hit = result.find(step => step.event.kind === "drain" && step.event.source === "location")!;
    expect(hit.event).toMatchObject({ node: 2, owner: 0, targetOwner: 1, target: "primary", amount: 100, before: 100, after: 0 });
    expect(session.state.players[1].centers.backup).toBe(1500);
    expect(session.state.players[0].destructionVP).toBe(8);
  });

  it("finishes lethal Node awards then stops later Nodes, Effect Bank, Circuit selection and Draft", () => {
    const session = make(); clear(session); locationOnly(session, "breach_relay", 1); winNode(session, 1, 0);
    session.state.players[1].centers = { primary: 0, backup: 150 };
    session.endTurn(); const result = drain(session);
    expect(session.state.phase).toBe("gameover");
    expect(session.state.players[0].destructionVP).toBe(12);
    expect(session.state.players[0].totalVP).toBe(12);
    expect(session.state.winner).toBe(0);
    expect(result.some(step => step.event.node !== undefined && step.event.node > 1)).toBe(false);
    expect(result.some(step => step.event.text.startsWith("Effect Bank"))).toBe(false);
    expect(result.some(step => ["circuit", "draft"].includes(step.event.kind))).toBe(false);
    expect(session.state.selectedNode).toBeNull();
    expect(session.state.circuitReward.definition).toBeNull();
    expect(session.state.endedReason).toMatch(/Current Node awards complete/);
  });
});

describe("Evaluation Circuit claims", () => {
  it("lets tied eligible players claim free once each independently", () => {
    const session = draftFixture("quantum_dividend");
    session.state.players[0].wallet = 0; session.state.players[1].wallet = 1;
    expect(session.claimCircuitReward(0)).toMatchObject({ source: "circuit", kind: "crypto", before: 0, after: 5, amount: 5 });
    expect(session.claimCircuitReward(1)).toMatchObject({ before: 1, after: 6 });
    expect(session.state.circuitReward.claimed).toEqual([0, 1]);
    expect(() => session.claimCircuitReward(0)).toThrow(/already claimed/);
    expect(session.state.players[0].wallet).toBe(5);
  });

  it("rejects ineligible, ended and expired claims without awarding or consuming eligibility", () => {
    const session = draftFixture("serpent_crown", [1]);
    expect(session.view().circuitReward.definition).toBeNull();
    expect(() => session.claimCircuitReward(0)).toThrow(/not eligible/);
    expect(() => session.claimCircuitReward(1, session.state.draftEndsAt! + 1)).toThrow(/deadline/);
    expect(session.state.circuitReward.claimed).toEqual([]);
    session.endDraft();
    expect(() => session.claimCircuitReward(1)).toThrow(/active Draft/);
    expect(session.state.players[1].rewardVP).toBe(0);
  });

  it("adds earned VP immediately and keeps it through Cycle transitions", () => {
    const session = draftFixture("serpent_crown");
    expect(session.claimCircuitReward()).toMatchObject({ kind: "vp", target: "vp", before: 4, after: 8 });
    expect(session.state.players[0].rewardVP).toBe(4);
    session.endDraft(); session.nextCycle();
    expect(session.view().players[0].totalVP).toBe(8);
    expect(session.state.circuitReward.definition).toBeNull();
    expect(session.state.circuitReward.claimed).toEqual([]);
  });

  it("heals Primary only, clamps at maximum, and cannot revive or redirect", () => {
    const session = draftFixture("integrity_patch");
    session.state.players[0].centers = { primary: 1850, backup: 900 };
    session.state.players[1].centers = { primary: 0, backup: 900 };
    expect(session.claimCircuitReward(0)).toMatchObject({ kind: "restore", amount: 150, before: 1850, after: 2000, target: "primary" });
    expect(session.claimCircuitReward(1)).toMatchObject({ amount: 0, before: 0, after: 0, target: "primary" });
    expect(session.state.players[1].centers).toEqual({ primary: 0, backup: 900 });
    expect(session.state.players[0].centers.backup).toBe(900);
  });

  it("automatically presents the opponent's separate claim and preserves the local claim", () => {
    const session = make(); clear(session);
    session.endTurn(); const result = drain(session);
    expect(session.state.circuitEligible).toEqual([0, 1]);
    expect(session.state.circuitReward.claimed).toEqual([1]);
    const draftIndex = result.findIndex(step => step.event.kind === "draft");
    const opponentIndex = result.findIndex(step => step.event.source === "circuit" && step.event.owner === 1);
    expect(opponentIndex).toBeGreaterThan(draftIndex);
    expect(session.state.circuitReward.definition).not.toBeNull();
    session.claimCircuitReward();
    expect(session.state.circuitReward.claimed).toEqual([1, 0]);
  });
});

describe("Evaluation information and repeat-play boundaries", () => {
  it("does not disclose an opponent-only reward name in snapshots or presentation events", () => {
    const session = make(); clear(session);
    for (let node = 0; node < 5; node++) winNode(session, node, 1);
    session.endTurn(); const result = drain(session);
    const secretName = session.state.circuitReward.definition!.name;
    expect(session.state.circuitEligible).toEqual([1]);
    expect(session.view().circuitReward.definition).toBeNull();
    expect(result.every(step => step.view.circuitReward.definition === null)).toBe(true);
    expect(result.every(step => !step.event.text.includes(secretName) && step.event.sourceName !== secretName)).toBe(true);
    expect(session.state.circuitReward.claimed).toEqual([1]);
    expect(() => session.claimCircuitReward()).toThrow(/not eligible/);
  });

  it("conserves each deck through three evaluation Cycles and resets claims and Wallet", () => {
    const session = make(31);
    for (let cycle = 1; cycle <= 3; cycle++) {
      for (let turn = 1; turn <= 3; turn++) {
        for (const card of [...session.state.players[0].hand]) {
          if (card.type === "Crypto" || (card.type === "Character" && !session.state.players[0].actions)) continue;
          const node = session.state.nodes.findIndex((state, index) => session.view().openNodes.includes(index) && state.cards[0].length < 4);
          if (node !== -1) session.deploy(card.id, node);
        }
        session.endTurn(); drain(session);
      }
      expect(session.state.phase).toBe("draft");
      if (session.state.circuitEligible.includes(0)) session.claimCircuitReward();
      for (const owner of [0, 1] as const) {
        const player = session.state.players[owner];
        const cards = [...player.hand, ...player.draw, ...player.discard, ...player.destroyed];
        expect(cards).toHaveLength(10);
        expect(new Set(cards.map(card => card.id)).size).toBe(10);
        expect(player.totalVP).toBe(4 + player.rewardVP + player.destructionVP);
      }
      session.endDraft(); session.nextCycle();
      expect(session.state.circuitReward).toEqual({ definition: null, claimed: [] });
      expect(session.state.circuitEligible).toEqual([]);
      expect(session.state.players[0].wallet).toBe(0);
      expect(session.state.players[1].wallet).toBe(0);
    }
  });
});
