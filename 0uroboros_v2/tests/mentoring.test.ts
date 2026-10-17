import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import authored from "../content/authored-content.json";
import { compileForSelfPlay, playSelfPlayGame } from "@0uroboros/engine/ai/selfPlay";
import { DEFAULT_STRATEGY, type StrategyProfile } from "@0uroboros/engine/ai/strategy";
import type { ContentDocument } from "@0uroboros/engine/authoring/contentModel";
import { baselineOf, createStrategist, fallbackTips, type StratGGameRecord } from "../server/aiStrategist";
import { createEcoStrat } from "../server/agents/ecoStrat";
import { sealEvidence, type GameEvidence } from "../server/agents/evidence";
import { catchUpAgents, leagueGameCount } from "../server/agents/league";
import { assignedTips, baselineTips, handOff, translateTip, type MentorTips } from "../server/agents/mentoring";
import { clampToEnvelope, DV_8, STRAT_G, T_5, VP_DOG, type StrategistIdentity, type StyleEnvelope } from "../server/agents/roster";

const document = (authored as unknown as { document: ContentDocument }).document;
const content = compileForSelfPlay(document);
const designed = (identity: StrategistIdentity) => clampToEnvelope({ ...identity.baseline, cardBias: {} }, identity.envelope);

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "mentoring-"));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "content/authored-content.json"), JSON.stringify(authored));
  return root;
}
const agentFor = (root: string, identity: StrategistIdentity, extra: Partial<Parameters<typeof createStrategist>[0]> = {}) =>
  createStrategist({ root: join(root, identity.id), contentFile: join(root, "content/authored-content.json"), identity, league: true, log: () => undefined, ...extra });

function inside(profile: StrategyProfile, envelope: StyleEnvelope) {
  for (const field of ["economyUntilCycle", "chaosFromCycle", "vpFromCycle", "handCryptoTarget", "minBuyScore", "dilution"] as const) {
    const range = envelope[field];
    if (range) { expect(profile[field]).toBeGreaterThanOrEqual(range[0]); expect(profile[field]).toBeLessThanOrEqual(range[1]); }
  }
  for (const [key, range] of Object.entries(envelope.weights ?? {})) {
    expect(profile.weights[key as keyof StrategyProfile["weights"]]).toBeGreaterThanOrEqual(range![0]);
    expect(profile.weights[key as keyof StrategyProfile["weights"]]).toBeLessThanOrEqual(range![1]);
  }
}

const mentorsFrom = (): Record<"vp-dog" | "dv-8", MentorTips> => ({
  "vp-dog": { name: "VP-Dog", label: "vp-dog@v1.0", mode: "heuristic", tips: fallbackTips(designed(VP_DOG), 3) },
  "dv-8": { name: "DV-8", label: "dv-8@v1.1", mode: "heuristic", tips: fallbackTips(designed(DV_8), 3) },
});

function request(method: string, url: string, body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(stream, { method, url, headers: { host: "127.0.0.1:5173" }, socket: { remoteAddress: "127.0.0.1" } });
  return stream;
}
function response() {
  const result = { status: 0, body: "" };
  const res = { statusCode: 0, setHeader: () => undefined, end(text: string) { result.status = res.statusCode; result.body = text; } };
  return { res: res as unknown as ServerResponse, result };
}

describe("mentor tips", () => {
  it("moves the recipient part of the way toward the mentor and keeps it inside its style", () => {
    const t5 = designed(T_5);
    const step = translateTip(t5, { handCryptoTarget: 16, economyUntilCycle: 7, weights: { crypto: 1.9, vp: 3.8 } }, T_5.envelope);
    expect(step.change.handCryptoTarget).toBe(t5.handCryptoTarget + 2);
    // T-5's economy is locked at Cycle 4 for the shared early opener; the tip cannot move it.
    expect(step.change.economyUntilCycle).toBeUndefined();
    expect(step.change.weights?.crypto).toBeCloseTo(t5.weights.crypto * 1.4, 2);
    expect(step.change.weights?.vp).toBeLessThanOrEqual(2);
    expect(step.limited).toBe(false);
    inside(step.profile, T_5.envelope);
    expect(step.profile.chaosFromCycle).toBeGreaterThan(step.profile.economyUntilCycle);
  });

  it("marks a tip the style envelope blocks entirely", () => {
    const atEdge = { ...designed(T_5), vpFromCycle: 9 };
    const step = translateTip(atEdge, { vpFromCycle: 6 }, T_5.envelope);
    expect(step.limited).toBe(true);
    expect(step.change).toEqual({});
  });

  it("draws fallback tips from where the mentor's own profile leans hardest", () => {
    const vp = fallbackTips(designed(VP_DOG), 3), dv = fallbackTips(designed(DV_8), 3);
    expect(vp.map(tip => tip.rank)).toEqual([1, 2, 3]);
    expect(vp.some(tip => tip.change.weights?.vp === VP_DOG.baseline.weights.vp)).toBe(true);
    expect(dv.some(tip => tip.change.weights?.thin === DV_8.baseline.weights.thin)).toBe(true);
    for (const tip of [...vp, ...dv]) expect(tip.text.length).toBeGreaterThan(20);
  });

  it("gives T-5 all six tips and Strat-G each mentor's top two, alternating mentors", () => {
    const mentors = mentorsFrom();
    expect(assignedTips(mentors, "t-5").map(item => `${item.from}#${item.tip.rank}`)).toEqual(["vp-dog#1", "dv-8#1", "vp-dog#2", "dv-8#2", "vp-dog#3", "dv-8#3"]);
    expect(assignedTips(mentors, "strat-g").map(item => `${item.from}#${item.tip.rank}`)).toEqual(["vp-dog#1", "dv-8#1", "vp-dog#2", "dv-8#2"]);
    const store = handOff(mentors, { "t-5": { profile: designed(T_5), envelope: T_5.envelope }, "strat-g": { profile: designed(STRAT_G), envelope: STRAT_G.envelope } });
    expect(store.recipients["t-5"].tips).toHaveLength(6);
    expect(store.recipients["strat-g"].tips).toHaveLength(4);

    const tips = baselineTips(store, "t-5")!;
    expect(tips.lines[0]).toMatch(/^Tip from VP-Dog \(#1\): /);
    const baseline = baselineOf(T_5, tips);
    expect(baseline.playbook).toEqual(expect.arrayContaining([...T_5.playbook!, ...tips.lines]));
    expect(baseline.playbook[0]).toMatch(/Cycles 1-4/);
    inside(baseline.profile, T_5.envelope);
    expect(baseline.profile.handCryptoTarget).toBeGreaterThan(designed(T_5).handCryptoTarget);
    expect(baseline.profile.weights.drain).toBe(designed(T_5).weights.drain);
    inside(baselineOf(STRAT_G, baselineTips(store, "strat-g")).profile, STRAT_G.envelope);
  });
});

describe("mentoring in the strategist", () => {
  it("shares tips, folds received tips into the baseline on reboot, and replaces adopted values they move", async () => {
    const root = await workspace();
    try {
      const mentor = agentFor(root, VP_DOG);
      const shared = await mentor.shareTips(3);
      expect(shared).toMatchObject({ mode: "heuristic", label: "vp-dog@v1.0" });
      expect(shared.tips).toHaveLength(3);
      expect(mentor.memory().sharedTips?.tips).toEqual(shared.tips);
      expect(await readFile(join(root, "vp-dog", "NOTEBOOK.md"), "utf8")).toContain("## Tips I shared");

      let received: ReturnType<typeof baselineTips> = null;
      const t5 = agentFor(root, T_5, { mentorTips: async () => received });
      await t5.ready;
      const before = t5.memory().snapshots!.at(-1)!.label;
      const memoryFile = join(root, "t-5", "memory.json");
      const saved = JSON.parse(await readFile(memoryFile, "utf8"));
      await writeFile(memoryFile, JSON.stringify({ ...saved, adopted: { weights: { crypto: 0.7, power: 1.5 } } }));

      const store = handOff({ "vp-dog": { name: "VP-Dog", ...shared }, "dv-8": mentorsFrom()["dv-8"] }, { "t-5": { profile: t5.memory().profile, envelope: T_5.envelope }, "strat-g": { profile: designed(STRAT_G), envelope: STRAT_G.envelope } });
      received = baselineTips(store, "t-5");
      expect(received!.change.weights?.crypto).toBeDefined();
      await t5.reboot();

      const memory = t5.memory();
      expect(memory.baseline.playbook.slice(-6)).toEqual(received!.lines);
      expect(memory.adopted.weights?.crypto).toBeUndefined();
      expect(memory.adopted.weights?.power).toBe(1.5);
      expect(memory.profile.weights.crypto).toBe(received!.change.weights!.crypto);
      expect(memory.profile.weights.power).toBe(1.5);
      inside(memory.profile, T_5.envelope);
      expect(memory.notes.some(note => /6 designer hand-offs \(mentor tips or coaching\), which replace my adopted crypto weight/.test(note.text))).toBe(true);
      expect(memory.snapshots!.at(-1)!.label).not.toBe(before);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);
});

describe("playing any agent", () => {
  it("answers only its own agent's routes and publishes the finished game", async () => {
    const root = await workspace();
    try {
      const published: StratGGameRecord[] = [];
      const t5 = agentFor(root, T_5, { enabled: () => false, onGameRecorded: record => published.push(record) });
      let passed = 0;
      await t5.middleware(request("GET", "/api/ai/strategy"), response().res, () => { passed++; });
      await t5.middleware(request("GET", "/api/ai/strategy?agent=dv-8"), response().res, () => { passed++; });
      expect(passed).toBe(2);
      const get = response();
      await t5.middleware(request("GET", "/api/ai/strategy?agent=t-5"), get.res, () => { passed++; });
      expect(passed).toBe(2);
      expect(JSON.parse(get.result.body)).toMatchObject({ disabled: true });
      const report = playSelfPlayGame({ content, seed: 61, strategy: DEFAULT_STRATEGY }).report!;
      const post = response();
      await t5.middleware(request("POST", "/api/ai/game?agent=t-5", { gameId: "g1", report }), post.res, () => { passed++; });
      expect(JSON.parse(post.result.body)).toMatchObject({ ignored: true });
      expect(published).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("lets Eco-Strat watch a human game against T-5 and label it by the agent", async () => {
    const root = await workspace();
    try {
      let watch = true;
      const eco = createEcoStrat({
        root: join(root, "ai-agents/eco-strat"), projectRoot: root, stratGRoot: join(root, "ai-strategist"), log: () => undefined,
        loadFacts: async () => ({ cards: [], locations: [], circuitRewards: [], startingDeck: [] }),
        settings: () => ({ active: true, observeHumanGames: watch, continuous: false, reportEvery: 10, baselineGames: 10 }),
      });
      const result = playSelfPlayGame({ content, seed: 62, strategy: DEFAULT_STRATEGY });
      const human = (id: string): GameEvidence => ({ id, source: "human-vs-agent", agent: "t-5", seats: ["human", "t-5"], recordedAt: new Date().toISOString(), valid: true, report: result.report!, stratG: null });
      watch = false;
      await eco.observe(sealEvidence(human("human-t-5-off")));
      watch = true;
      await eco.observe(sealEvidence(human("human-t-5-g1")));
      const report = await eco.report("manual");
      expect(report!.games).toBe(1);
      const markdown = await readFile(join(root, "ai-agents/eco-strat", report!.markdown), "utf8");
      expect(markdown).toContain("human vs T-5");
      const stored = JSON.parse(await readFile(join(root, "ai-agents/eco-strat", report!.json), "utf8"));
      expect(stored.archetypes.agents.map((agent: { archetype: string }) => agent.archetype).sort()).toEqual(["Human", "Pure aggression"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);
});

describe("catch-up learning", () => {
  it("gives agents far below the leader a second trial each round", () => {
    expect(catchUpAgents([{ agent: "dv-8", elo: 1576 }, { agent: "vp-dog", elo: 1565 }, { agent: "strat-g", elo: 1170 }, { agent: "t-5", elo: 838 }])).toEqual(["strat-g", "t-5"]);
    expect(catchUpAgents([{ agent: "a", elo: 1200 }, { agent: "b", elo: 1100 }, { agent: "c", elo: null }])).toEqual([]);
    expect(leagueGameCount(4, { rounds: 1, seedsPerBlock: 2 }, 3, 2)).toBe(leagueGameCount(4, { rounds: 1, seedsPerBlock: 2 }, 3) + 2 * 3 * 2 * 4);
  });
});
