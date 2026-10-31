import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import authored from "../content/authored-content.json";
import { compileForSelfPlay } from "@0uroboros/engine/ai/selfPlay";
import { NO_MANS_LAND } from "@0uroboros/engine/content";
import { createSession, seededRandom, type RuntimeSession, type SessionConfig } from "@0uroboros/engine/runtime";
import { publishedContent, PACK_REVISION } from "@0uroboros/content/document";
import { Lobby } from "@0uroboros/server/lobby";
import { ManualScheduler } from "@0uroboros/server/scheduler";
import { MemoryStore } from "@0uroboros/server/store";
import { RoomSettingsSchema } from "@0uroboros/protocol/messages";
import { sanitizeGameSetup } from "../src/gameSetup";
import { BOARD_STYLE_KEY, DEFAULT_BOARD_STYLE, loadBoardStyle } from "../src/boardStyles";
import { DEFAULT_THEME, PLAYER_COLOR_IDS, colorChoiceLabel, loadColorTheme, playerColor } from "../src/playerTheme";

const content = compileForSelfPlay((authored as unknown as { document: Parameters<typeof compileForSelfPlay>[0] }).document);

function play(options: Partial<SessionConfig>, seed: number, cycles: number, onCycle: (session: RuntimeSession) => void) {
  const session = createSession({ content, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: "higher", random: seededRandom(seed), aiSeats: [0, 1], recordDecisions: false, ...options });
  onCycle(session);
  for (let guard = 0; guard < 20_000 && session.state.phase !== "gameover" && session.state.cycle <= cycles; guard++) {
    if (session.state.choice) session.choose(session.state.choice.options[0].id);
    else if (session.pendingCount) session.step();
    else if (session.state.phase === "runtime") session.endTurn();
    else if (session.state.phase === "draft") {
      onCycle(session);
      session.endDraft(0); session.endDraft(1); session.nextCycle();
      onCycle(session);
    } else break;
  }
  return session;
}

describe("No Locations", () => {
  it("puts No Man's Land on every Node in every Cycle", () => {
    const seen: string[][] = [];
    play({ noLocations: true }, 11, 3, session => seen.push(session.state.nodes.map(node => node.location?.name ?? "none")));
    expect(seen.length).toBeGreaterThan(2);
    for (const names of seen) expect(names).toEqual(Array(5).fill("No Man's Land"));
  });

  it("falls back to its own No Man's Land when the pack has none", () => {
    const session = createSession({ content: { ...content, locations: content.locations.filter(location => location.id !== NO_MANS_LAND.id) }, evaluationContent: true, strategicMarket: true, carryover: true, priorityPreference: "higher", random: seededRandom(3), noLocations: true });
    expect(session.state.nodes.map(node => node.location?.id)).toEqual(Array(5).fill(NO_MANS_LAND.id));
  });

  it("still deals the authored Locations when off", () => {
    const session = createSession({ content, evaluationContent: true, strategicMarket: true, carryover: true, priorityPreference: "higher", random: seededRandom(3) });
    expect(new Set(session.state.nodes.map(node => node.location?.name)).size).toBeGreaterThan(1);
  });
});

describe("No trailing rewards", () => {
  it("never draws a Circuit Reward that goes to the trailing player", () => {
    expect(content.circuitRewards.some(reward => reward.awardTrailing)).toBe(true);
    const drawn: { name: string; trailing: boolean }[] = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) play({ noTrailingRewards: true }, seed, 4, session => {
      const definition = session.state.circuitReward?.definition;
      if (session.state.phase === "draft" && definition) drawn.push({ name: definition.name, trailing: !!definition.awardTrailing });
    });
    expect(drawn.length).toBeGreaterThan(6);
    expect(drawn.filter(entry => entry.trailing)).toEqual([]);
  });
});

describe("online tables", () => {
  it("defaults no trailing rewards on and hands options to the room's session", () => {
    expect(RoomSettingsSchema.parse({})).toMatchObject({ noLocations: false, noTrailingRewards: true, midCycleDraw: true, draftCrypto: false });
    const lobby = new Lobby({ content: publishedContent(), contentRevision: PACK_REVISION, scheduler: new ManualScheduler(), store: new MemoryStore() });
    const room = lobby.createRoom("ai", { seed: 5, noLocations: true, noTrailingRewards: false, draftCrypto: true });
    expect(room.settings).toMatchObject({ noLocations: true, noTrailingRewards: false, midCycleDraw: true, draftCrypto: true });
    room.join("Ada", { send: () => undefined, close: () => undefined } as never);
    expect(room.session!.state.nodes.map(node => node.location?.name)).toEqual(Array(5).fill("No Man's Land"));
  });
});

describe("setup and look defaults", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps game options through a save, with no trailing rewards on unless include is chosen", () => {
    expect(sanitizeGameSetup(null)).toMatchObject({ noLocations: false, noTrailingRewards: true, draftCrypto: false });
    expect(sanitizeGameSetup({ noLocations: true, noTrailingRewards: false, midCycleDraw: false, draftCrypto: true })).toMatchObject({ noLocations: true, noTrailingRewards: false, draftCrypto: true });
  });

  it("defaults the board to Neon once, then keeps a saved Classic", () => {
    expect(DEFAULT_BOARD_STYLE).toBe("neon");
    store.set("ouroboros.boardStyle", "classic");
    expect(loadBoardStyle()).toBe("neon");
    store.set(BOARD_STYLE_KEY, "classic");
    expect(loadBoardStyle()).toBe("classic");
  });

  it("offers Orange at #EB9D00 in place of Gold, carrying a saved Gold over, with P1 Cyan and P2 Purple by default", () => {
    expect(PLAYER_COLOR_IDS).toContain("orange");
    expect(PLAYER_COLOR_IDS as readonly string[]).not.toContain("gold");
    expect(colorChoiceLabel("orange")).toBe("Orange");
    expect(playerColor("orange").accent).toBe("#EB9D00");
    expect(DEFAULT_THEME).toEqual(["cyan", "purple"]);
    expect(loadColorTheme()).toEqual(["cyan", "purple"]);
    store.set("0uroboros.colorTheme", JSON.stringify(["gold", "purple"]));
    expect(loadColorTheme()).toEqual(["orange", "purple"]);
  });
});
