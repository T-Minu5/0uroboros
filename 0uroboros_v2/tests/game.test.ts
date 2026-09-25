import { describe, expect, it } from "vitest";
import { canDeploy, initialWeights, legalNodes, resolvePower, starterCards } from "../src/game";

describe("Runtime V1 rules", () => {
  it("uses the canonical 5 / 3 / 2 starter deck", () => {
    expect(starterCards).toHaveLength(10);
    expect(starterCards.filter(card => card.type === "Character")).toHaveLength(5);
    expect(starterCards.filter(card => card.type === "Crypto")).toHaveLength(3);
    expect(starterCards.filter(card => card.type === "VP")).toHaveLength(2);
  });

  it("opens three, then four, then five Nodes from the sampled order", () => {
    const order=[4,1,3,0,2];
    expect(legalNodes(1,order)).toEqual([4,1,3]);
    expect(legalNodes(2,order)).toEqual([4,1,3,0]);
    expect(legalNodes(3,order)).toEqual(order);
  });

  it("keeps Crypto out of deployment and preserves the four-card capacity", () => {
    const crypto = starterCards.find(card => card.type === "Crypto")!;
    const character = starterCards.find(card => card.type === "Character")!;
    expect(canDeploy(crypto, 2, 1, 0, 0)).toMatch(/Crypto/);
    expect(canDeploy(character, 2, 1, 0, 4)).toMatch(/full/);
    expect(canDeploy(character, 0, 1, 0, 0)).toMatch(/Actions/);
    expect(canDeploy(character, 2, 1, 0, 0)).toBeNull();
  });

  it("uses the canonical probability distribution and player-specific power", () => {
    expect(initialWeights.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(resolvePower(starterCards.filter(card => card.type !== "Crypto").slice(0, 2))).toBe(5);
  });
});

import { applyDataCenterEffect, controlledWeights, drawCards, mirroredOpening, nodeWinner, revealOrder, runtimeActions, selectCircuitNode, transferProbability, type Deployment } from "../src/game";

describe("Canonical engine primitives", () => {
  it("mirrors the five-card opening and remaining deck while keeping distinct owned instances", () => {
    const [a, b] = mirroredOpening(() => 0.31);
    expect(a.hand).toHaveLength(5);
    expect(a.draw).toHaveLength(5);
    expect(a.hand.map(card => card.name)).toEqual(b.hand.map(card => card.name));
    expect(a.draw.map(card => card.name)).toEqual(b.draw.map(card => card.name));
    expect(new Set([...a.hand, ...a.draw, ...b.hand, ...b.draw].map(card => card.id)).size).toBe(20);
  });

  it("draws through deck exhaustion, reshuffles only Discard, and stops when cards run out", () => {
    const zones = { draw: [starterCards[0]], hand: [starterCards[1]], discard: starterCards.slice(2, 5) };
    const result = drawCards(zones, 8, () => 0);
    expect(result.hand).toHaveLength(5);
    expect(result.hand[1].name).toBe("Slash-Dot");
    expect(result.draw).toEqual([]);
    expect(result.discard).toEqual([]);
    expect(zones.discard).toHaveLength(3);
    expect(new Set(result.hand.map(card => card.id)).size).toBe(5);
  });

  it.each([0, 1, 2, 3, 4])("finishes an owed five-card draw with %i cards remaining before shuffling Discard", (remaining) => {
    const draw = starterCards.slice(0, remaining);
    const discard = starterCards.slice(remaining);
    let shuffleCalls = 0;
    const result = drawCards({ draw, hand: [], discard }, 5, () => { shuffleCalls++; return 0; });
    expect(result.hand).toHaveLength(5);
    expect(result.hand.slice(0, remaining)).toEqual(draw);
    expect(result.hand.slice(remaining).every(card => discard.includes(card))).toBe(true);
    expect(shuffleCalls).toBe(discard.length - 1);
    expect(result.draw).toHaveLength(5);
    expect(result.discard).toEqual([]);
    expect(new Set([...result.hand, ...result.draw].map(card => card.id)).size).toBe(10);
  });

  it("does not shuffle Discard when the remaining deck exactly satisfies the draw", () => {
    const result = drawCards({ draw: starterCards.slice(0, 5), hand: [], discard: starterCards.slice(5) }, 5, () => { throw new Error("Unnecessary shuffle"); });
    expect(result.hand).toEqual(starterCards.slice(0, 5));
    expect(result.discard).toEqual(starterCards.slice(5));
  });

  it("compares negative Power and splits tied weight, including empty Nodes", () => {
    expect(nodeWinner([-2, -4])).toBe(0);
    expect(nodeWinner([0, -1])).toBe(0);
    expect(nodeWinner([-3, -3])).toBeNull();
    expect(controlledWeights(initialWeights, [[3, 1], [0, 0], [-2, -1], [0, 0], [0, 0]])).toEqual([55, 45]);
  });

  it("transfers in half-percent units, caps at source, and never creates weight", () => {
    expect(transferProbability(initialWeights, 0, 4, 40)).toEqual([0, 25, 20, 15, 40]);
    expect(transferProbability(initialWeights, 2, 1, 0.5)).toEqual([30, 25.5, 19.5, 15, 10]);
    expect(() => transferProbability(initialWeights, 0, 1, 0.25)).toThrow(/0.5/);
    expect(initialWeights).toEqual([30, 25, 20, 15, 10]);
  });

  it("selects exactly one weighted Node with zero-weight Nodes excluded", () => {
    expect(selectCircuitNode([0, 100, 0, 0, 0], () => 0)).toBe(1);
    expect(selectCircuitNode([0, 100, 0, 0, 0], () => 0.999999)).toBe(1);
    expect(selectCircuitNode(initialWeights, () => 0.3)).toBe(1);
    expect(selectCircuitNode([3, 2], () => 0.8)).toBe(1);
  });

  it("alternates global priority in chronological order and holds unopened cards", () => {
    const placements: Deployment[] = [
      { card: starterCards[0], owner: 0, node: 0, order: 1, revealed: false },
      { card: starterCards[1], owner: 0, node: 1, order: 2, revealed: false },
      { card: starterCards[2], owner: 1, node: 2, order: 3, revealed: false },
      { card: starterCards[3], owner: 0, node: 0, order: 4, revealed: false },
      { card: starterCards[4], owner: 1, node: 4, order: 5, revealed: false },
    ];
    expect(revealOrder(placements, 1, 0).map(card => card.order)).toEqual([1, 3, 2, 4]);
    expect(revealOrder(placements, 3, 1).map(card => card.order)).toEqual([3, 1, 5, 2, 4]);
    expect(revealOrder(placements.map(card => ({ ...card, revealed: true })), 3, 0)).toEqual([]);
  });

  it("Drains Primary without overkill spill and awards destruction only once", () => {
    const result = applyDataCenterEffect({ primary: 50, backup: 1500 }, "drain", 100);
    expect(result).toEqual({ centers: { primary: 0, backup: 1500 }, target: "primary", amount: 50, destructionVP: 8 });
    const next = applyDataCenterEffect(result.centers, "drain", 2000);
    expect(next.centers).toEqual({ primary: 0, backup: 0 });
    expect(next.destructionVP).toBe(12);
    expect(applyDataCenterEffect(next.centers, "drain", 100).destructionVP).toBe(0);
  });

  it("Restores Primary first with no overflow or resurrection, then Backup fallback", () => {
    expect(applyDataCenterEffect({ primary: 1980, backup: 1200 }, "restore", 100).centers).toEqual({ primary: 2000, backup: 1200 });
    expect(applyDataCenterEffect({ primary: 0, backup: 1400 }, "restore", 200).centers).toEqual({ primary: 0, backup: 1500 });
    expect(applyDataCenterEffect({ primary: 0, backup: 0 }, "restore", 100).target).toBeNull();
  });

  it("requires explicit carryover configuration, delays reveal Actions, and resets each Cycle", () => {
    expect(runtimeActions(2, 2, 3, true)).toBe(6);
    expect(runtimeActions(2, 2, 3, false)).toBe(4);
    expect(runtimeActions(1, 20, 20, true)).toBe(2);
    expect(canDeploy(starterCards[8], 0, 1, 0, 0)).toBeNull();
  });
});
