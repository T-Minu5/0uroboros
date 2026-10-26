import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import authored from "../content/authored-content.json";
import { DEFAULT_STRATEGY, type StrategyProfile } from "@0uroboros/engine/ai/strategy";
import { serverMaximums } from "@0uroboros/engine/game";
import { createStrategist, type LeagueOutcome, type Snapshot } from "../server/aiStrategist";
import { createLeague, eloUpdate, expectedScore, kFactor, leagueGameCount, sampleOpponent, trialGamesPerLearner, type ActiveRun, type LeagueMember } from "../server/agents/league";
import { clampToEnvelope, DV_8, STRAT_G, T_5, VP_DOG, type StrategistIdentity, type StyleEnvelope } from "../server/agents/roster";
import type { GameEvidence } from "../server/agents/evidence";
import type { SelfPlayResult } from "@0uroboros/engine/ai/selfPlay";

const onlineMember = (
  identity: { id: string; name: string },
  agent: { start: () => Promise<void>; leagueSnapshots: () => readonly { label: string; savedAt: string; profile: StrategyProfile }[]; leagueTrialArms: LeagueMember["trialArms"]; concludeLeagueTrial: LeagueMember["concludeTrial"] },
  extra: Partial<LeagueMember> = {},
): LeagueMember => ({
  id: identity.id, name: identity.name, active: () => true, online: () => true,
  start: agent.start, snapshots: agent.leagueSnapshots, trialArms: agent.leagueTrialArms, concludeTrial: agent.concludeLeagueTrial, ...extra,
});

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "league-"));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "content/authored-content.json"), JSON.stringify(authored));
  return root;
}
const contentFile = (root: string) => join(root, "content/authored-content.json");
const agentFor = (root: string, identity: StrategistIdentity, extra: Partial<Parameters<typeof createStrategist>[0]> = {}) =>
  createStrategist({ root: join(root, identity.id), contentFile: contentFile(root), identity, league: true, log: () => undefined, ...extra });
const listAll = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? listAll(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
};
const folderText = async (dir: string) => (await Promise.all((await listAll(dir)).map(file => readFile(file, "utf8")))).join("\n");
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

describe("league ratings", () => {
  it("follows the Elo example from the self-play article", () => {
    expect(expectedScore(2600, 2300)).toBeCloseTo(0.849, 3);
    expect(expectedScore(2300, 2600)).toBeCloseTo(0.151, 3);
    expect(eloUpdate(2600, 2300, 1, 16).map(Math.round)).toEqual([2602, 2298]);
    expect(eloUpdate(2600, 2300, 0, 16).map(Math.round)).toEqual([2586, 2314]);
    expect(kFactor(0)).toBe(32);
    expect(kFactor(29)).toBe(32);
    expect(kFactor(30)).toBe(16);
  });

  it("samples the latest opponents half the time and otherwise the last five snapshots, never the learner's current self", () => {
    const snap = (label: string): Snapshot => ({ label, savedAt: "", profile: DEFAULT_STRATEGY });
    const pools = {
      "strat-g": [1, 2, 3, 4, 5, 6, 7].map(n => snap(`strat-g@v${n}`)),
      "t-5": [snap("t-5@v1"), snap("t-5@v2")],
      "dv-8": [snap("dv-8@v1")],
    };
    const sequence = (...values: number[]) => () => values.shift() ?? 0;
    expect(sampleOpponent("t-5", "t-5@v2", pools, sequence(0.1, 0))!.label).toBe("strat-g@v7");
    expect(sampleOpponent("t-5", "t-5@v2", pools, sequence(0.1, 0.99))!.label).toBe("dv-8@v1");
    expect(sampleOpponent("t-5", "t-5@v2", pools, sequence(0.9, 0))!.label).toBe("strat-g@v3");

    let state = 7;
    const lcg = () => (state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const seen = new Map<string, number>();
    for (let i = 0; i < 4000; i++) { const label = sampleOpponent("t-5", "t-5@v2", pools, lcg)!.label; seen.set(label, (seen.get(label) ?? 0) + 1); }
    expect(seen.has("t-5@v2")).toBe(false);
    expect(seen.has("strat-g@v1") || seen.has("strat-g@v2")).toBe(false);
    expect(seen.get("t-5@v1")).toBeGreaterThan(0);
    const latest = (seen.get("strat-g@v7") ?? 0) + (seen.get("dv-8@v1") ?? 0);
    expect(latest / 4000).toBeGreaterThan(0.5);
    expect(latest / 4000).toBeLessThan(0.75);
  });

  it("counts the games of a run", () => {
    expect(leagueGameCount(3, { rounds: 1, seedsPerBlock: 4 }, 3)).toBe(3 * 4 * 2 + 3 * 3 * 4 * 4);
    expect(leagueGameCount(2, { rounds: 2, seedsPerBlock: 2 }, 1)).toBe(2 * (1 * 2 * 2 + 2 * 1 * 2 * 4));
  });
});

describe("league agents", () => {
  it("keeps each style inside its envelope, from baseline to experiment", async () => {
    const shaped = clampToEnvelope({ ...DEFAULT_STRATEGY, economyUntilCycle: 9, chaosFromCycle: 11, weights: { ...DEFAULT_STRATEGY.weights, drain: 1, restore: 3 } }, T_5.envelope);
    inside(shaped, T_5.envelope);
    expect(shaped.chaosFromCycle).toBeGreaterThan(shaped.economyUntilCycle);
    const root = await workspace();
    try {
      for (const identity of [T_5, DV_8, VP_DOG, STRAT_G]) {
        const agent = agentFor(root, identity);
        await agent.ready;
        inside(agent.memory().profile, identity.envelope);
        const asked = await agent.leagueTrialArms();
        expect(asked.ok).toBe(true);
        if (!asked.ok) continue;
        inside(asked.arms.control, identity.envelope);
        inside(asked.arms.experiment, identity.envelope);
        expect(asked.arms.control.plan).toBe("");
        expect(asked.arms.label).toBe(`${identity.id}@v1.0`);
        expect(agent.leagueSnapshots().map(item => item.label)).toEqual([`${identity.id}@v1.0`]);
        expect(await readdir(join(root, identity.id, "snapshots"))).toEqual([`${identity.id}@v1.0.json`]);
      }
      expect(agentFor(root, T_5).memory().profile.economyUntilCycle).toBeLessThan(agentFor(root, DV_8).memory().profile.economyUntilCycle);
      expect(agentFor(root, VP_DOG).memory().profile.vpFromCycle).toBeLessThan(agentFor(root, DV_8).memory().profile.vpFromCycle);
      expect(agentFor(root, VP_DOG).memory().profile.weights.drain).toBeLessThan(agentFor(root, T_5).memory().profile.weights.drain);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("takes the designer's new baseline on boot and keeps what it learned", async () => {
    const root = await workspace();
    try {
      const old: StrategistIdentity = { ...T_5, baseline: { ...T_5.baseline, plan: "Old rush plan.", vpFromCycle: 10 }, playbook: ["Old playbook line."] };
      const before = agentFor(root, old);
      await before.ready;
      expect(before.memory().baseline.plan).toBe("Old rush plan.");
      const after = agentFor(root, T_5);
      await after.ready;
      expect(after.memory().baseline.plan).toBe(T_5.baseline.plan);
      expect(after.memory().baseline.playbook).toEqual(expect.arrayContaining(T_5.playbook!));
      expect(after.memory().baseline.playbook[0]).toMatch(/Cycles 1-4/);
      expect(after.memory().profile.vpFromCycle).toBe(T_5.baseline.vpFromCycle);
      expect(after.memory().notes.some(item => /designer updated my baseline/.test(item.text))).toBe(true);
      const again = agentFor(root, T_5);
      await again.ready;
      expect(again.memory().notes.filter(item => /designer updated my baseline/.test(item.text))).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("adopts a change that wins its league trial and snapshots it; rejects one that loses", async () => {
    const root = await workspace();
    try {
      const agent = agentFor(root, T_5);
      await agent.ready;
      const first = await agent.leagueTrialArms();
      if (!first.ok) throw new Error(first.reason);
      const seeds = [1, 2, 3, 4];
      const outcome = (experimentPoints: number, controlPoints: number, marginGain: number): LeagueOutcome => ({ opponents: ["dv-8@v1"], seeds, games: 16, invalid: 0, pairs: 8, experimentPoints, controlPoints, experimentWins: experimentPoints, controlWins: controlPoints, ties: 0, marginGain });
      expect(await agent.concludeLeagueTrial(first.arms.experimentId, outcome(7, 3, 4.5))).toMatch(/promising/);
      const memory = agent.memory();
      expect(memory.experiments.at(-1)).toMatchObject({ id: first.arms.experimentId, stage: "adopted" });
      expect(memory.profile).toMatchObject(first.arms.experiment.weights ? { weights: first.arms.experiment.weights } : {});
      expect(agent.leagueSnapshots().map(item => item.label)).toEqual(["t-5@v1.0", "t-5@v1.1"]);
      expect(agent.status().snapshot).toBe("t-5@v1.1");

      const second = await agent.leagueTrialArms();
      if (!second.ok) throw new Error(second.reason);
      expect(second.arms.label).toBe("t-5@v1.1");
      expect(await agent.concludeLeagueTrial(second.arms.experimentId, outcome(2, 6, -3))).toMatch(/rejected/);
      expect(agent.memory().experiments.at(-1)).toMatchObject({ id: second.arms.experimentId, stage: "rejected" });
      expect(agent.leagueSnapshots()).toHaveLength(2);
      expect(await agent.concludeLeagueTrial("x999-gone", outcome(8, 0, 9))).toMatch(/no longer running/);
      expect(await readFile(join(root, "t-5/NOTEBOOK.md"), "utf8")).toContain("league adversary");
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("puts only the agent's own style in its model prompt", async () => {
    const root = await workspace();
    try {
      const prompts: string[] = [];
      const fetchImpl = (async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init!.body)) as { messages: { content: string }[] };
        prompts.push(body.messages.map(message => message.content).join("\n"));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ plan: "Rush the Servers." }) } }] }), { status: 200 });
      }) as typeof fetch;
      const agent = agentFor(root, T_5, { apiKey: "test", fetchImpl });
      await agent.ready;
      expect(prompts.length).toBeGreaterThan(0);
      for (const prompt of prompts) {
        expect(prompt).toContain("You are T-5");
        expect(prompt).toContain(T_5.persona);
        expect(prompt).toContain("Your goal is Server destruction");
        expect(prompt).toContain(`currently Primary ${serverMaximums.primary}, Backup ${serverMaximums.backup}`);
        expect(prompt).toContain("rather than a fixed damage number");
        expect(prompt).not.toMatch(/3,500/);
        for (const foreign of [DV_8.persona, DV_8.playbook![0], VP_DOG.persona, "DV-8", "VP-Dog", "Strat-G"]) expect(prompt).not.toContain(foreign);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("gives VP-Dog the rules and its objective", async () => {
    const root = await workspace();
    try {
      const prompts: string[] = [];
      const fetchImpl = (async (_url: string, init?: RequestInit) => {
        prompts.push((JSON.parse(String(init!.body)) as { messages: { content: string }[] }).messages.map(message => message.content).join("\n"));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ plan: "Buy VP." }) } }] }), { status: 200 });
      }) as typeof fetch;
      const agent = agentFor(root, VP_DOG, { apiKey: "test", fetchImpl });
      await agent.ready;
      expect(prompts.length).toBeGreaterThan(0);
      for (const prompt of prompts) {
        expect(prompt).toContain("You are VP-Dog");
        expect(prompt).toContain(VP_DOG.persona);
        expect(prompt).toMatch(/16 Cycles/);
        expect(prompt).toMatch(/most VP still wins/);
        expect(prompt).toMatch(/draftCrypto/);
        expect(prompt).toMatch(/weaker than older builds/);
        expect(prompt).toMatch(/1 rotating Solar-monk|Solar-monk/);
        for (const foreign of [T_5.persona, DV_8.persona, "T-5", "DV-8", "Strat-G"]) expect(prompt).not.toContain(foreign);
      }
      expect(await readFile(join(root, "vp-dog/NOTEBOOK.md"), "utf8")).toContain("pure economy");
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});

describe("league runs", () => {
  it("rates every pairing, rotates one learner at a time, and hands each agent only labels and results", async () => {
    const root = await workspace();
    try {
      const outcomes: LeagueOutcome[] = [];
      const published: GameEvidence[] = [];
      const agents = [STRAT_G, T_5, DV_8].map(identity => ({ identity, agent: agentFor(root, identity) }));
      const members: LeagueMember[] = agents.map(({ identity, agent }) => onlineMember(identity, agent, {
        concludeTrial: (id, outcome) => { outcomes.push(structuredClone(outcome)); return agent.concludeLeagueTrial(id, outcome); },
      }));
      const league = createLeague({
        root: join(root, "league"), members, blocksPerTrial: 1, log: () => undefined, autoResume: false,
        harness: async () => await import("@0uroboros/engine/ai/selfPlay") as never,
        document: async () => (authored as unknown as { document: unknown }).document,
        settings: () => ({ rounds: 1, seedsPerBlock: 1, ecoObserves: true }),
        publish: evidence => published.push(evidence),
      });
      expect(league.run()).toEqual({ ok: true });
      expect(league.run()).toMatchObject({ ok: false, reason: expect.stringMatching(/already running/) });
      await league.idle();

      const status = league.status();
      expect(status.error).toBeNull();
      expect(status.running).toBe(false);
      expect(status.lastRun).toMatchObject({ games: leagueGameCount(3, { rounds: 1, seedsPerBlock: 1 }, 1), stopped: false });
      expect(status.lastRun!.trials.map(trial => trial.agent)).toEqual(["strat-g", "t-5", "dv-8"]);
      expect(status.table.every(row => row.elo !== null && row.label)).toBe(true);
      expect(status.headToHead).toHaveLength(3);
      expect(published.length).toBeGreaterThan(0);
      expect(published.length).toBeLessThanOrEqual(3);
      expect(published.every(item => item.source === "league" && item.stratG === null)).toBe(true);
      expect(published.every(item => item.seats?.length === 2 && item.seats[0] !== item.seats[1] && item.seats.every(id => ["strat-g", "t-5", "dv-8"].includes(id)))).toBe(true);

      expect(outcomes).toHaveLength(3);
      for (const outcome of outcomes) {
        expect(Object.keys(outcome).sort()).toEqual(["controlPoints", "controlWins", "experimentPoints", "experimentWins", "games", "invalid", "marginGain", "opponents", "pairs", "seeds", "ties"]);
        expect(JSON.stringify(outcome)).not.toMatch(/weights|plan|cardBias/);
      }
      const ratings = await readFile(join(root, "league/ratings.json"), "utf8");
      expect(ratings).not.toMatch(/weights|plan"/);

      const own: Record<string, string[]> = {
        "strat-g": [T_5.persona, T_5.playbook![0], DV_8.persona, DV_8.playbook![0], DV_8.baseline.plan, T_5.baseline.plan],
        "t-5": [DV_8.persona, DV_8.playbook![0], DV_8.baseline.plan, DV_8.foundingNotes![0]],
        "dv-8": [T_5.persona, T_5.playbook![0], T_5.baseline.plan, T_5.foundingNotes![0]],
      };
      for (const [folder, foreign] of Object.entries(own)) {
        const text = await folderText(join(root, folder));
        expect(text.length).toBeGreaterThan(0);
        for (const phrase of foreign) expect(text).not.toContain(phrase);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 120_000);

  it("orders an agent's ratings by when they were first rated, not by the number in the label", async () => {
    const root = await workspace();
    try {
      await mkdir(join(root, "league"), { recursive: true });
      await writeFile(join(root, "league/ratings.json"), JSON.stringify({ schema: 1, nextSeed: 50_000, games: 0, runs: [], headToHead: {}, ratings: {
        "t-5@v88": { agent: "t-5", elo: 900, games: 50, wins: 10, losses: 40, ties: 0 },
        "t-5@v1.1": { agent: "t-5", elo: 1300, games: 50, wins: 40, losses: 10, ties: 0, since: "2026-10-08T00:00:00.000Z" },
      } }));
      const member: LeagueMember = { id: "t-5", name: "T-5", active: () => true, online: () => true, start: async () => undefined, snapshots: () => [{ label: "t-5@v1.2", savedAt: "", profile: DEFAULT_STRATEGY }], trialArms: async () => ({ ok: false, reason: "unused" }), concludeTrial: async () => "" };
      const league = createLeague({ root: join(root, "league"), members: [member], log: () => undefined, autoResume: false, harness: async () => await import("@0uroboros/engine/ai/selfPlay") as never, document: async () => null, settings: () => ({ rounds: 1, seedsPerBlock: 1, ecoObserves: false }) });
      await new Promise(done => setTimeout(done, 20));
      expect(league.status().table[0]).toMatchObject({ agent: "t-5", label: "t-5@v1.2", elo: 1300 });
      const cleared = await league.resetRatings();
      expect(cleared).toEqual({ ok: true });
      expect(league.status().table[0]).toMatchObject({ agent: "t-5", elo: null, wins: 0, losses: 0, ties: 0 });
      expect(league.status().ratedSnapshots).toBe(0);
      const saved = JSON.parse(await readFile(join(root, "league/ratings.json"), "utf8")) as { ratings: object; headToHead: object; games: number };
      expect(saved).toMatchObject({ ratings: {}, headToHead: {}, games: 0 });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("stops mid-run and concludes the partial trial as inconclusive", async () => {
    const root = await workspace();
    try {
      const concluded: { id: string; outcome: LeagueOutcome }[] = [];
      const agents = [T_5, DV_8].map(identity => ({ identity, agent: agentFor(root, identity) }));
      const members: LeagueMember[] = agents.map(({ identity, agent }) => onlineMember(identity, agent, {
        concludeTrial: (id, outcome) => { concluded.push({ id, outcome }); return agent.concludeLeagueTrial(id, outcome); },
      }));
      const league = createLeague({ root: join(root, "league"), members, log: () => undefined, autoResume: false, harness: async () => await import("@0uroboros/engine/ai/selfPlay") as never, document: async () => (authored as unknown as { document: unknown }).document, settings: () => ({ rounds: 3, seedsPerBlock: 2, ecoObserves: false }) });
      league.run();
      // One pairing × 2 seeds × 2 seats of rating games, then stop two games into the first trial.
      while (!(league.status().phase === "trial" && league.status().games >= 6)) await new Promise(done => setTimeout(done, 10));
      league.stop();
      expect(league.status().stopping).toBe(true);
      await league.idle();
      expect(league.status()).toMatchObject({ running: false, stopping: false });
      expect(league.status().lastRun).toMatchObject({ stopped: true });
      expect(league.status().lastRun!.games).toBeLessThan(leagueGameCount(2, { rounds: 3, seedsPerBlock: 2 }));
      expect(concluded).toHaveLength(1);
      expect(concluded[0].outcome.pairs).toBeLessThan(concluded[0].outcome.seeds.length * 2);
      expect(agents[0].agent.memory().experiments.at(-1)?.stage).toBe("inconclusive");
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("shrinks total when every trial is skipped and finishes without marking stopped", async () => {
    const root = await workspace();
    try {
      const snap = (id: string) => [{ label: `${id}@v1`, savedAt: "", profile: DEFAULT_STRATEGY }];
      const members: LeagueMember[] = [
        { id: "a", name: "A", active: () => true, online: () => true, start: async () => undefined, snapshots: () => snap("a"), trialArms: async () => ({ ok: false, reason: "no experiment" }), concludeTrial: async () => "" },
        { id: "b", name: "B", active: () => true, online: () => true, start: async () => undefined, snapshots: () => snap("b"), trialArms: async () => ({ ok: false, reason: "no experiment" }), concludeTrial: async () => "" },
      ];
      const settings = { rounds: 1, seedsPerBlock: 1, ecoObserves: false };
      const ratingOnly = 1 * 1 * 2; // one pair × seeds × seats
      const league = createLeague({
        root: join(root, "league"), members, blocksPerTrial: 1, log: () => undefined, autoResume: false,
        harness: async () => await import("@0uroboros/engine/ai/selfPlay") as never,
        document: async () => (authored as unknown as { document: unknown }).document,
        settings: () => settings,
      });
      expect(league.run()).toEqual({ ok: true });
      await league.idle();
      const status = league.status();
      expect(status.lastRun).toMatchObject({ stopped: false, games: ratingOnly, trialsSkipped: 2 });
      expect(status.games).toBe(ratingOnly);
      expect(status.total).toBe(ratingOnly);
      expect(status.trialsSkipped).toBe(2);
      expect(status.total).toBe(leagueGameCount(2, settings, 1) - 2 * trialGamesPerLearner(settings, 1));
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("continues the run when playSelfPlayGame throws", async () => {
    const root = await workspace();
    try {
      const real = await import("@0uroboros/engine/ai/selfPlay");
      let calls = 0;
      const members: LeagueMember[] = [
        { id: "a", name: "A", active: () => true, online: () => true, start: async () => undefined, snapshots: () => [{ label: "a@v1", savedAt: "", profile: DEFAULT_STRATEGY }], trialArms: async () => ({ ok: false, reason: "skip" }), concludeTrial: async () => "" },
        { id: "b", name: "B", active: () => true, online: () => true, start: async () => undefined, snapshots: () => [{ label: "b@v1", savedAt: "", profile: DEFAULT_STRATEGY }], trialArms: async () => ({ ok: false, reason: "skip" }), concludeTrial: async () => "" },
      ];
      const league = createLeague({
        root: join(root, "league"), members, blocksPerTrial: 1, log: () => undefined, autoResume: false,
        harness: async () => ({
          compileForSelfPlay: real.compileForSelfPlay as never,
          playSelfPlayGame: (options) => {
            calls++;
            if (calls === 1) throw new Error("simulated play crash");
            return real.playSelfPlayGame(options as never) as SelfPlayResult;
          },
        }),
        document: async () => (authored as unknown as { document: unknown }).document,
        settings: () => ({ rounds: 1, seedsPerBlock: 1, ecoObserves: false }),
      });
      expect(league.run()).toEqual({ ok: true });
      await league.idle();
      expect(league.status().running).toBe(false);
      expect(league.status().lastRun?.stopped).toBe(false);
      expect(league.status().playErrors).toBe(1);
      expect(league.status().lastRun!.games).toBeGreaterThanOrEqual(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("resumes from an activeRun checkpoint at the saved round and nextSeed", async () => {
    const root = await workspace();
    try {
      await mkdir(join(root, "league"), { recursive: true });
      const settings = { rounds: 2, seedsPerBlock: 1, ecoObserves: false };
      const checkpoint: ActiveRun = {
        startedAt: "2026-10-15T00:00:00.000Z", settings, memberIds: ["a", "b"], round: 2, phase: "rating",
        ratedPairs: [], finishedLearners: [], games: 4, total: 20, trialsSkipped: 2, playErrors: 0, trials: [], nextSeed: 50_100,
      };
      await writeFile(join(root, "league/ratings.json"), JSON.stringify({
        schema: 1, nextSeed: 50_050, games: 4, runs: [], headToHead: {}, ratings: {
          "a@v1": { agent: "a", elo: 1200, games: 2, wins: 1, losses: 1, ties: 0, since: "2026-10-15T00:00:00.000Z" },
          "b@v1": { agent: "b", elo: 1200, games: 2, wins: 1, losses: 1, ties: 0, since: "2026-10-15T00:00:00.000Z" },
        }, activeRun: checkpoint,
      }));
      const members: LeagueMember[] = [
        { id: "a", name: "A", active: () => true, online: () => true, start: async () => undefined, snapshots: () => [{ label: "a@v1", savedAt: "", profile: DEFAULT_STRATEGY }], trialArms: async () => ({ ok: false, reason: "skip" }), concludeTrial: async () => "" },
        { id: "b", name: "B", active: () => true, online: () => true, start: async () => undefined, snapshots: () => [{ label: "b@v1", savedAt: "", profile: DEFAULT_STRATEGY }], trialArms: async () => ({ ok: false, reason: "skip" }), concludeTrial: async () => "" },
      ];
      const league = createLeague({
        root: join(root, "league"), members, blocksPerTrial: 1, log: () => undefined, autoResume: true,
        harness: async () => await import("@0uroboros/engine/ai/selfPlay") as never,
        document: async () => (authored as unknown as { document: unknown }).document,
        settings: () => settings,
      });
      while (!league.status().running) await new Promise(done => setTimeout(done, 10));
      expect(league.status().resuming).toBe(true);
      expect(league.status().lastRun).toMatchObject({ interrupted: true, games: 4 });
      await league.idle();
      const status = league.status();
      expect(status.running).toBe(false);
      expect(status.lastRun?.interrupted).not.toBe(true);
      expect(status.lastRun?.rounds).toBe(2);
      expect(status.lastRun!.games).toBeGreaterThan(4);
      const saved = JSON.parse(await readFile(join(root, "league/ratings.json"), "utf8")) as { activeRun: null; nextSeed: number };
      expect(saved.activeRun).toBeNull();
      expect(saved.nextSeed).toBeGreaterThan(50_100);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("refuses to start when an active member is offline", async () => {
    const root = await workspace();
    try {
      const members: LeagueMember[] = [
        { id: "a", name: "A", active: () => true, online: () => true, start: async () => undefined, snapshots: () => [], trialArms: async () => ({ ok: false, reason: "" }), concludeTrial: async () => "" },
        { id: "b", name: "B", active: () => true, online: () => false, start: async () => undefined, snapshots: () => [], trialArms: async () => ({ ok: false, reason: "" }), concludeTrial: async () => "" },
      ];
      const league = createLeague({ root: join(root, "league"), members, autoResume: false, log: () => undefined, harness: async () => await import("@0uroboros/engine/ai/selfPlay") as never, document: async () => null, settings: () => ({ rounds: 1, seedsPerBlock: 1, ecoObserves: false }) });
      expect(league.run()).toMatchObject({ ok: false, reason: expect.stringMatching(/online.*B/) });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe("league fallback experiments", () => {
  it("proposes an envelope-clamped fallback when the menu is exhausted", async () => {
    const root = await workspace();
    try {
      const agent = agentFor(root, T_5);
      await agent.ready;
      const seeds = [1, 2];
      const reject = (): LeagueOutcome => ({ opponents: ["dv-8@v1"], seeds, games: 8, invalid: 0, pairs: 4, experimentPoints: 1, controlPoints: 3, experimentWins: 1, controlWins: 3, ties: 0, marginGain: -2 });
      for (let i = 0; i < 24; i++) {
        const asked = await agent.leagueTrialArms();
        if (!asked.ok) throw new Error(asked.reason);
        await agent.concludeLeagueTrial(asked.arms.experimentId, reject());
      }
      const fallback = await agent.leagueTrialArms();
      expect(fallback.ok).toBe(true);
      if (!fallback.ok) return;
      expect(fallback.arms.experimentId).toMatch(/fallback/);
      inside(fallback.arms.experiment, T_5.envelope);
      inside(fallback.arms.control, T_5.envelope);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);
});
