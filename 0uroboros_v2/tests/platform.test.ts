/** Platform layer: achievements and presence derived from server results, independent of the host. */
import { describe, expect, it } from "vitest";
import type { GameResult } from "@0uroboros/protocol/messages";
import { ACHIEVEMENTS, achievementsFor, presenceText } from "../src/platform/achievements";

const result = (patch: Partial<GameResult> = {}): GameResult => ({ winner: 0, endedReason: "Cycle 16 final Draft complete.", outcome: "complete", finalVP: [14, 9], ...patch });

describe("achievements", () => {
  it("awards participation to both seats and wins only to the winner, by physical seat", () => {
    expect(achievementsFor(result(), 0, "pvp")).toEqual([ACHIEVEMENTS.FIRST_ONLINE_GAME, ACHIEVEMENTS.FIRST_ONLINE_WIN, ACHIEVEMENTS.FULL_SIXTEEN]);
    expect(achievementsFor(result(), 1, "pvp")).toEqual([ACHIEVEMENTS.FIRST_ONLINE_GAME]);
    expect(achievementsFor(result({ winner: 1 }), 1, "pvp")).toContain(ACHIEVEMENTS.FIRST_ONLINE_WIN);
  });
  it("recognises the ending and a shutout, and ignores AI tables and abandoned games", () => {
    expect(achievementsFor(result({ endedReason: "Both Servers destroyed", finalVP: [10, 0] }), 0, "pvp")).toEqual([ACHIEVEMENTS.FIRST_ONLINE_GAME, ACHIEVEMENTS.FIRST_ONLINE_WIN, ACHIEVEMENTS.SERVERS_DESTROYED, ACHIEVEMENTS.SHUTOUT]);
    expect(achievementsFor(result({ outcome: "concession", endedReason: "Bo concedes.", finalVP: [3, 0] }), 0, "pvp")).toEqual([ACHIEVEMENTS.FIRST_ONLINE_GAME, ACHIEVEMENTS.FIRST_ONLINE_WIN]);
    expect(achievementsFor(result(), 0, "ai")).toEqual([]);
    expect(achievementsFor(result({ outcome: "abandoned", winner: null }), 0, "pvp")).toEqual([]);
  });
});

describe("presence", () => {
  it("describes the lobby state for the friends list", () => {
    expect(presenceText({ status: "idle", mode: null })).toBe("In the menu");
    expect(presenceText({ status: "waiting", mode: "pvp" })).toBe("Waiting for a friend to join");
    expect(presenceText({ status: "playing", mode: "pvp" }, 3)).toBe("In an online match · Cycle 3");
    expect(presenceText({ status: "playing", mode: "ai" })).toBe("Playing the AI");
    expect(presenceText({ status: "finished", mode: "pvp" })).toBe("Reviewing a finished match");
  });
});
