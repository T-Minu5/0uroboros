import { describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import authored from "../content/authored-content.json";
import { compileForSelfPlay, DEFAULT_SELF_PLAY_RULES, diffSelfPlayRules, playSelfPlayGame, sanitizeSelfPlayRules, selfPlayRulesHash, type SelfPlayRules } from "@0uroboros/engine/ai/selfPlay";
import { DEFAULT_STRATEGY } from "@0uroboros/engine/ai/strategy";
import type { ContentDocument } from "@0uroboros/engine/authoring/contentModel";
import { addToTally, compareTallies, createEpochStore, emptyTally, MIN_COMPARABLE_GAMES, targetDistance, type EpochTally } from "../server/agents/leagueEpochs";
import { gameMetrics } from "../server/agents/ecoMetrics";
import { createSettingsStore, sanitizeSettings } from "../server/agents/settings";
import { createAgentSystem } from "../server/agents";

const content = compileForSelfPlay((authored as unknown as { document: ContentDocument }).document);
const rules = (patch: Partial<SelfPlayRules> = {}): SelfPlayRules => ({ ...structuredClone(DEFAULT_SELF_PLAY_RULES), ...patch });

describe("league ruleset", () => {
  it("sanitizes rules: clamps VP, keeps flags, and turns trailing rewards off without Circuit rewards", () => {
    const clean = sanitizeSelfPlayRules({ serverVP: { primary: 999, backup: -4 }, nodeWinVP: "3", noLocations: true, noCircuitRewards: true, noTrailingRewards: false, endGameAwards: { mostDestroyed: { enabled: false, vp: 80 } } });
    expect(clean.serverVP).toEqual({ primary: 50, backup: 0 });
    expect(clean.noLocations).toBe(true);
    expect(clean.noTrailingRewards).toBe(true);
    expect(clean.endGameAwards.mostDestroyed).toEqual({ enabled: false, vp: 50 });
    expect(sanitizeSelfPlayRules(null)).toEqual(DEFAULT_SELF_PLAY_RULES);
    expect(sanitizeSelfPlayRules({ noCircuitRewards: false, noTrailingRewards: false })).toMatchObject({ noCircuitRewards: false, noTrailingRewards: false });
  });

  it("diffs and hashes rules by value", () => {
    const before = rules();
    const after = rules({ noCircuitRewards: false, serverVP: { ...before.serverVP, primary: before.serverVP.primary + 4 } });
    expect(diffSelfPlayRules(before, after)).toEqual([
      { key: "serverVP.primary", label: expect.any(String), from: before.serverVP.primary, to: before.serverVP.primary + 4 },
      { key: "circuitRewards", label: "Circuit rewards", from: false, to: true },
    ]);
    expect(diffSelfPlayRules(before, structuredClone(before))).toEqual([]);
    expect(selfPlayRulesHash(before)).toMatch(/^[0-9a-f]{8}$/);
    expect(selfPlayRulesHash(structuredClone(before))).toBe(selfPlayRulesHash(before));
    expect(selfPlayRulesHash(after)).not.toBe(selfPlayRulesHash(before));
  });

  it("plays self-play games under the ruleset", () => {
    const seeds = [3, 5];
    const play = (seed: number, set: SelfPlayRules) => playSelfPlayGame({ content, seed, strategy: DEFAULT_STRATEGY, recordDecisions: false, rules: set }).report!;
    const claims = (set: SelfPlayRules) => seeds.map(seed => gameMetrics(play(seed, set))).reduce((sum, m) => sum + m.circuitClaims[0] + m.circuitClaims[1], 0);
    expect(claims(rules({ noCircuitRewards: true, noTrailingRewards: true }))).toBe(0);
    const outcome = (set: SelfPlayRules) => seeds.map(seed => { const report = play(seed, set); return `${report.finalVP}|${report.cycle}`; }).join(";");
    expect(outcome(rules({ nodeWinVP: 12, mostCircuitsBonusVP: 0 }))).not.toBe(outcome(rules({ nodeWinVP: 0, mostCircuitsBonusVP: 0 })));
  }, 60_000);
});

describe("league epochs", () => {
  it("scores metrics by distance to their target", () => {
    expect(targetDistance({ kind: "band", min: 0.45, max: 0.55 }, 0.5)).toBe(0);
    expect(targetDistance({ kind: "band", min: 0.45, max: 0.55 }, 0.6)).toBeCloseTo(0.05);
    expect(targetDistance({ kind: "max", max: 0.25 }, 0.1)).toBe(0);
    expect(targetDistance({ kind: "min", min: 0.4 }, 0.3)).toBeCloseTo(0.1);
    expect(targetDistance({ kind: "info" }, 3)).toBeNull();
  });

  it("calls a change closer or further only with enough games on both sides", () => {
    const tally = (patch: Partial<EpochTally>): EpochTally => ({ ...emptyTally(), games: 20, decisive: 20, ...patch });
    const before = tally({ cycle16Ends: 10, seat0Wins: 10 });
    const after = tally({ cycle16Ends: 2, seat0Wins: 16 });
    const rows = compareTallies(before, after);
    expect(rows.find(row => row.id === "cycle16Ends")).toMatchObject({ before: 0.5, after: 0.1, verdict: "closer" });
    expect(rows.find(row => row.id === "seat0Wins")).toMatchObject({ verdict: "further" });
    expect(rows.find(row => row.id === "margin")!.verdict).toBe("n/a");
    const thin = compareTallies(tally({ games: MIN_COMPARABLE_GAMES - 1 }), after);
    expect(thin.every(row => row.verdict === "n/a")).toBe(true);
    expect(compareTallies(null, after).every(row => row.before === null && row.verdict === "n/a")).toBe(true);
  });

  it("tallies real games", () => {
    const tally = emptyTally();
    for (const seed of [2, 4]) addToTally(tally, playSelfPlayGame({ content, seed, strategy: DEFAULT_STRATEGY, recordDecisions: false }).report!);
    expect(tally.games).toBe(2);
    expect(tally.cycles).toBeGreaterThan(0);
    expect(tally.destructionEnds + tally.cycle16Ends).toBeLessThanOrEqual(2);
  }, 30_000);

  it("opens epochs with a diff, counts games and keeps standings", async () => {
    const root = await mkdtemp(join(tmpdir(), "epochs-"));
    try {
      const file = join(root, "league/epochs.json");
      const store = createEpochStore(file, () => rules());
      expect((await store.current()).id).toBe(1);
      await store.recordGame(playSelfPlayGame({ content, seed: 2, strategy: DEFAULT_STRATEGY, recordDecisions: false }).report!);
      await store.finishRun([{ agent: "strat-g", elo: 1210, games: 1, wins: 1, losses: 0, ties: 0 }]);
      const next = await store.begin(rules({ nodeWinVP: 3 }), { eloWiped: true, note: "Does a bigger Node win help?" });
      expect(next).toMatchObject({ id: 2, eloWiped: true, note: "Does a bigger Node win help?", changes: [{ key: "nodeWinVP", to: 3 }], standings: null });
      expect((await store.previousWithGames(2))?.id).toBe(1);
      const saved = JSON.parse(await readFile(file, "utf8")) as { epochs: { id: number; tally: { games: number }; standings: unknown }[] };
      expect(saved.epochs.map(epoch => epoch.id)).toEqual([1, 2]);
      expect(saved.epochs[0]).toMatchObject({ tally: { games: 1 }, standings: [{ agent: "strat-g", elo: 1210 }] });
      const reopened = createEpochStore(file, () => rules());
      expect((await reopened.current()).id).toBe(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});

describe("league rules settings and routes", () => {
  it("stores one sanitized ruleset and replaces it whole", async () => {
    expect(sanitizeSettings({}).leagueRules).toEqual(DEFAULT_SELF_PLAY_RULES);
    expect(sanitizeSettings({ leagueRules: { serverVP: { primary: 70, backup: 2 } } }).leagueRules.serverVP).toEqual({ primary: 50, backup: 2 });
    const root = await mkdtemp(join(tmpdir(), "league-settings-"));
    try {
      const store = createSettingsStore(join(root, "settings.json"));
      store.write({ leagueRules: rules({ nodeWinVP: 4, noLocations: true }) });
      expect(store.read().leagueRules).toMatchObject({ nodeWinVP: 4, noLocations: true });
      store.write({ t5: { enabled: false } });
      expect(store.read().leagueRules.nodeWinVP).toBe(4);
      store.write({ leagueRules: rules() });
      expect(store.read().leagueRules).toEqual(DEFAULT_SELF_PLAY_RULES);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("applies rules as a new epoch through the API and keeps them out of the plain settings route", async () => {
    const root = await mkdtemp(join(tmpdir(), "league-routes-"));
    await mkdir(join(root, "content"), { recursive: true });
    await writeFile(join(root, "content/authored-content.json"), JSON.stringify(authored));
    for (const file of ["packages/engine/src/game.ts", "packages/engine/src/runtime.ts", "packages/engine/src/evaluationMarket.ts", "packages/engine/src/content.ts"]) await cp(resolve(file), join(root, file), { recursive: true });
    await mkdir(join(root, "ai-strategist"), { recursive: true });
    await writeFile(join(root, "ai-strategist/memory.json"), JSON.stringify({ schema: 1, version: 4, mode: "heuristic", plan: "test plan", profile: DEFAULT_STRATEGY, theories: [] }));
    try {
      const system = createAgentSystem({ cwd: root, env: {}, loadModule: async path => import(/* @vite-ignore */ resolve(`.${path}`)), log: () => undefined });
      const call = async (method: string, url: string, body?: unknown) => {
        const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
        Object.assign(request, { method, url, headers: { host: "127.0.0.1:5173" }, socket: { remoteAddress: "127.0.0.1" } });
        const result = { status: 0, body: "" };
        const res = { statusCode: 0, setHeader: () => undefined, end(text: string) { result.status = res.statusCode; result.body = text; } };
        await system.middlewares.at(-1)!(request, res as unknown as ServerResponse, () => undefined);
        return { status: result.status, json: result.body ? JSON.parse(result.body) : null };
      };
      const first = await call("GET", "/api/agents/league/rules");
      expect(first).toMatchObject({ status: 200, json: { rules: DEFAULT_SELF_PLAY_RULES, epoch: 1 } });
      expect((await call("PUT", "/api/agents/settings", { leagueRules: rules({ nodeWinVP: 9 }) })).json.settings.leagueRules.nodeWinVP).toBe(DEFAULT_SELF_PLAY_RULES.nodeWinVP);
      expect((await call("POST", "/api/agents/league/epoch", { rules: rules(), wipeElo: false })).status).toBe(409);
      const applied = await call("POST", "/api/agents/league/epoch", { rules: rules({ nodeWinVP: 3 }), note: "bigger Node wins" });
      expect(applied.status).toBe(200);
      expect(applied.json.status.rules.current.nodeWinVP).toBe(3);
      expect(applied.json.status.rules.hash).toBe(selfPlayRulesHash(rules({ nodeWinVP: 3 })));
      expect(applied.json.epochs[0]).toMatchObject({ id: 2, eloWiped: true, note: "bigger Node wins", changes: [{ key: "nodeWinVP", to: 3 }], comparedWith: null });
      expect(system.settings.read().leagueRules.nodeWinVP).toBe(3);
      const history = await call("GET", "/api/agents/league/epochs");
      expect(history.json.map((epoch: { id: number }) => epoch.id)).toEqual([2, 1]);
      expect(history.json[1].rules).toEqual(DEFAULT_SELF_PLAY_RULES);
      expect(applied.json.status.clientRules).toEqual({ appliedAt: null, epochId: null });
      const client = await call("POST", "/api/agents/league/apply-client");
      expect(client.status).toBe(200);
      expect(client.json.clientRules).toMatchObject({ epochId: 2, appliedAt: expect.any(String) });
      const written = JSON.parse(await readFile(join(root, "content/client-rules.json"), "utf8"));
      expect(written).toMatchObject({ epochId: 2, rules: { nodeWinVP: 3, serverVP: DEFAULT_SELF_PLAY_RULES.serverVP, noCircuitRewards: true, noTrailingRewards: true } });
      expect(written.rules).not.toHaveProperty("noLocations");
      expect(written.rules).not.toHaveProperty("middleNodesOnly");
      system.settings.write({ agentsEnabled: false });
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 }); }
  }, 60_000);
});
