import { describe, expect, it } from "vitest";
import authored from "../content/authored-content.json";
import { compileForSelfPlay } from "@0uroboros/engine/ai/selfPlay";
import { createSession, seededRandom, type RuntimeEvent } from "@0uroboros/engine/runtime";
import { summarizeEvents } from "../src/logSummary";

let id = 0;
const ev = (event: Omit<RuntimeEvent, "id">): RuntimeEvent => ({ id: ++id, phase: "reveal", cycle: 1, turn: 1, ...event });
const names = ["Tom", "Bo"] as const;

describe("log summary", () => {
  it("groups each player's revealed cards with what they did", () => {
    const events = [
      ev({ kind: "turn", text: "Runtime turn 1." }),
      ev({ kind: "reveal", owner: 0, node: 3, cardId: "0:rezz", text: "Rezz Blade reveals." }),
      ev({ kind: "drain", owner: 0, node: 3, cardId: "0:rezz", source: "card", sourceName: "Rezz Blade", target: "primary", targetOwner: 1, amount: 100, text: "Rezz Blade: Drain 100 at primary Server." }),
      ev({ kind: "draw", owner: 0, node: 3, cardId: "0:rezz", source: "card", target: "hand", targetOwner: 0, amount: 1, text: "Rezz Blade: draw 1." }),
      ev({ kind: "actions", owner: 0, node: 3, cardId: "0:rezz", source: "card", target: "actions", targetOwner: 0, amount: 2, text: "Rezz Blade: +2 Actions next Runtime turn." }),
      ev({ kind: "reveal", owner: 1, node: 0, cardId: "1:scythe", text: "Nyte Scythe reveals." }),
      ev({ kind: "trash", owner: 1, node: 0, cardId: "1:scythe", source: "card", amount: 0, text: "Nyte Scythe: No target." }),
      ev({ kind: "choice", owner: 1, node: 0, cardId: "1:scythe", text: "Bo chooses: nothing." }),
    ];
    expect(summarizeEvents(events, names)).toEqual([
      { owner: 0, lines: ["Plays Rezz Blade at N4, Draining 100 from Bo's Server. Gaining 1 card and 2 actions."] },
      { owner: 1, lines: ["Plays Nyte Scythe at N1, Trashing 0 cards."] },
    ]);
  });

  it("names Location effects and Draft purchases, and leaves out the end-of-Cycle Crypto already in the table", () => {
    const events = [
      ev({ kind: "power", owner: 0, node: 0, cardId: "location:wing", source: "location", sourceName: "Wing clip", targetOwner: 1, amount: -1, phase: "collapse", text: "Wing clip: Bushido.io Power 2 → 1." }),
      ev({ kind: "crypto", owner: 0, cardId: "0:coin", source: "card", sourceName: "Byte-Coin", target: "wallet", targetOwner: 0, amount: 2, phase: "collapse", text: "Byte-Coin auto-resolves: +2 Crypto for Draft." }),
      ev({ kind: "purchase", owner: 1, cardId: "1:acq", target: "wallet", targetOwner: 1, amount: 3, phase: "draft", text: "Bo acquires Zenith Worx to Discard for 3 Crypto." }),
    ];
    expect(summarizeEvents(events, names)).toEqual([
      { owner: 0, lines: ["Wing clip (Location), Cutting 1 Power from Bo's card."] },
      { owner: 1, lines: ["Buys Zenith Worx for 3 Crypto."] },
    ]);
  });

  it("summarises a real game without the raw event chatter", () => {
    const content = compileForSelfPlay((authored as unknown as { document: Parameters<typeof compileForSelfPlay>[0] }).document);
    const session = createSession({ content, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: "higher", random: seededRandom(7), aiSeats: [0, 1], recordDecisions: false });
    const events: RuntimeEvent[] = [];
    for (let guard = 0; guard < 2000 && (session.state.phase === "runtime" || session.state.phase === "reveal"); guard++) {
      if (session.state.choice) session.choose(session.state.choice.options[0].id);
      else if (session.pendingCount) events.push(session.step()!.event);
      else session.endTurn();
    }
    const turn2 = events.filter(event => event.turn === 2 && event.phase !== "collapse");
    const lines = summarizeEvents(turn2, names).flatMap(group => group.lines);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every(line => /^(Plays .+ at N\d|.+ \((Location|Circuit Reward)\)|.+ triggers)/.test(line))).toBe(true);
    expect(lines.some(line => / reveals\.| No target\./.test(line))).toBe(false);
  });
});
