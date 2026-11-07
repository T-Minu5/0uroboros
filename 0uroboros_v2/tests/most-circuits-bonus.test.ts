import { describe, expect, it } from "vitest";
import authored from "../content/authored-content.json";
import { compileForSelfPlay } from "@0uroboros/engine/ai/selfPlay";
import { createSession, seededRandom, type RuntimeSession, type SessionConfig } from "@0uroboros/engine/runtime";

const content = compileForSelfPlay((authored as unknown as { document: Parameters<typeof compileForSelfPlay>[0] }).document);

function play(options: Partial<SessionConfig>, seed: number, cycles: number): RuntimeSession {
  const session = createSession({
    content, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: "higher",
    random: seededRandom(seed), aiSeats: [0, 1], recordDecisions: false, midCycleDraw: false, ...options,
  });
  for (let guard = 0; guard < 20_000 && session.state.phase !== "gameover" && session.state.cycle <= cycles; guard++) {
    if (session.state.choice) session.choose(session.state.choice.options[0].id);
    else if (session.pendingCount) session.step();
    else if (session.state.phase === "runtime") session.endTurn();
    else if (session.state.phase === "draft") {
      session.endDraft(0); session.endDraft(1); session.nextCycle();
    } else break;
  }
  return session;
}

function circuitTally(session: RuntimeSession): { wins: [number, number]; ties: number } {
  const wins: [number, number] = [0, 0];
  let ties = 0;
  for (const record of session.cycleHistory()) {
    const [a, b] = record.locationsWon;
    if (a > b) wins[0]++;
    else if (b > a) wins[1]++;
    else ties++;
  }
  return { wins, ties };
}

describe("mostCircuitsBonusVP", () => {
  it("awards the Configure bonus once to the seat with more Circuit wins", () => {
    const bonus = 6;
    let awarded: RuntimeSession | null = null;
    let control: RuntimeSession | null = null;
    let leader: 0 | 1 = 0;
    let tally = { wins: [0, 0] as [number, number], ties: 0 };
    for (const seed of [1, 2, 3, 5, 7, 8, 11, 13, 17, 19, 23, 29, 31, 37, 41]) {
      const candidate = play({ mostCircuitsBonusVP: bonus }, seed, 5);
      tally = circuitTally(candidate);
      if (tally.wins[0] === tally.wins[1]) continue;
      awarded = candidate;
      control = play({ mostCircuitsBonusVP: 0 }, seed, 5);
      expect(tally).toEqual(circuitTally(control));
      leader = tally.wins[0] > tally.wins[1] ? 0 : 1;
      break;
    }
    expect(awarded).not.toBeNull();
    expect(control).not.toBeNull();
    expect(awarded!.view().players.map(player => player.totalVP)).toEqual(control!.view().players.map(player => player.totalVP));

    const event = awarded!.endSessionNow();
    control!.endSessionNow();
    const scoreline = `${tally.wins[leader]}–${tally.wins[1 - leader]}${tally.ties ? ` with ${tally.ties} tie${tally.ties === 1 ? "" : "s"}` : ""}`;
    expect(event.text).toMatch(new RegExp(`most Circuits won \\(${scoreline}\\)`));
    expect(awarded!.state.endedReason).toContain(`most Circuits won (${scoreline})`);
    expect(tally.wins[0] + tally.wins[1] + tally.ties).toBe(awarded!.cycleHistory().length);
    expect(awarded!.view().finalScore![leader].circuitVP).toBe(control!.view().finalScore![leader].circuitVP + bonus);
    expect(awarded!.view().players[leader].totalVP).toBe(control!.view().players[leader].totalVP + bonus);
    expect(awarded!.view().finalScore![1 - leader].circuitVP).toBe(control!.view().finalScore![1 - leader].circuitVP);
  });

  it("does nothing when the bonus is 0 or Locations are off", () => {
    const seed = 21;
    const off = play({ mostCircuitsBonusVP: 0 }, seed, 3);
    const none = play({ mostCircuitsBonusVP: 6, noLocations: true }, seed, 3);
    const beforeOff = off.view().players.map(player => player.totalVP);
    const beforeNone = none.view().players.map(player => player.totalVP);
    off.endSessionNow();
    none.endSessionNow();
    expect(off.view().players.map(player => player.totalVP)).toEqual(beforeOff);
    expect(none.view().players.map(player => player.totalVP)).toEqual(beforeNone);
  });
});
