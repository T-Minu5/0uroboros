import { describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import authored from "../content/authored-content.json";
import { compileForSelfPlay, playSelfPlayGame } from "@0uroboros/engine/ai/selfPlay";
import { DEFAULT_STRATEGY } from "@0uroboros/engine/ai/strategy";
import type { ContentDocument } from "@0uroboros/engine/authoring/contentModel";
import { createStrategist } from "../server/aiStrategist";
import { archetypeResults, cardDemand, cohortMetrics, gameMetrics } from "../server/agents/ecoMetrics";
import { defaultServerVP } from "@0uroboros/engine/game";
import type { MatchReport } from "@0uroboros/engine/runtime";
import { splitTabs } from "../src/miniMarkdown";
import { confidenceOf, createGuardedWriter, type Hypothesis } from "../server/agents/ecoJournal";
import { createEcoStrat, DEFAULT_RESEARCH_URLS } from "../server/agents/ecoStrat";
import { createEvidenceBus, sealEvidence, type GameEvidence } from "../server/agents/evidence";
import { runCohort } from "../server/agents/cohortRunner";
import { createSettingsStore, sanitizeSettings } from "../server/agents/settings";
import { createAgentSystem } from "../server/agents";

const document = (authored as unknown as { document: ContentDocument }).document;
const content = compileForSelfPlay(document);
const game = (seed: number) => playSelfPlayGame({ content, seed, strategy: DEFAULT_STRATEGY });
const evidence = (seed: number, extra: Partial<GameEvidence> = {}): GameEvidence => {
  const result = game(seed);
  return { id: `test-s${seed}`, source: "self-play", recordedAt: new Date().toISOString(), seed, valid: result.valid, report: result.report!, stratG: null, ...extra };
};

async function project() {
  const root = await mkdtemp(join(tmpdir(), "agents-"));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "content/authored-content.json"), JSON.stringify(authored));
  for (const file of ["packages/engine/src/game.ts", "packages/engine/src/runtime.ts", "packages/engine/src/evaluationMarket.ts", "packages/engine/src/content.ts"]) await cp(resolve(file), join(root, file), { recursive: true });
  await mkdir(join(root, "ai-strategist"), { recursive: true });
  await writeFile(join(root, "ai-strategist/memory.json"), JSON.stringify({ schema: 1, version: 4, mode: "heuristic", plan: "test plan", profile: DEFAULT_STRATEGY, theories: [] }));
  return root;
}
const listAll = async (dir: string): Promise<string[]> => (await readdir(dir, { withFileTypes: true })).flatMap(entry => entry.isDirectory() ? [] : [join(dir, entry.name)]).concat(...await Promise.all((await readdir(dir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => listAll(join(dir, entry.name)))));
const ecoFor = (root: string, extra: Partial<Parameters<typeof createEcoStrat>[0]> = {}) => createEcoStrat({
  root: join(root, "ai-agents/eco-strat"), projectRoot: root, stratGRoot: join(root, "ai-strategist"), log: () => undefined,
  loadFacts: async () => ({ cards: [], locations: [], circuitRewards: [], startingDeck: [] }),
  settings: () => ({ active: true, observeHumanGames: true, continuous: true, reportEvery: 10, baselineGames: 10 }),
  ...extra,
});

describe("self-play and telemetry", () => {
  it("plays complete, reproducible AI-vs-AI games with telemetry and a decision log", () => {
    const first = game(4242), second = game(4242);
    expect(first.valid).toBe(true);
    expect(first.report!.phase).toBe("gameover");
    const strip = (value: typeof first) => JSON.stringify(value.report);
    expect(strip(first)).toBe(strip(second));
    const report = first.report!;
    expect(report.aiSeats).toEqual([0, 1]);
    expect(report.telemetry.events).toBeGreaterThan(50);
    expect(report.telemetry.drainDealt[0] + report.telemetry.drainDealt[1]).toBeGreaterThan(0);
    expect(Object.keys(report.telemetry.cards).length).toBeGreaterThan(3);
    expect(report.decisions.some(item => item.kind === "deploy" && item.owner === 0)).toBe(true);
    expect(report.decisions.some(item => item.kind === "draft" && item.owner === 1)).toBe(true);
    expect(report.cycles.every(cycle => cycle.deckSize[0] > 0 && cycle.circuit !== undefined)).toBe(true);
    expect(report.purchases.filter(item => item.definitionId === "shyte-coin")).toHaveLength(0);
  }, 30_000);

  it("computes per-game and cohort metrics deterministically", () => {
    const reports = [11, 12, 13].map(seed => ({ id: `g${seed}`, report: game(seed).report! }));
    const m = gameMetrics(reports[0].report);
    expect(m.cycles).toBe(reports[0].report.cycle);
    expect(m.drain).toEqual(reports[0].report.telemetry.drainDealt);
    const cohort = cohortMetrics(reports);
    expect(cohort.games).toBe(3);
    expect(cohort.endedBy.destruction + cohort.endedBy.cycle16 + cohort.endedBy.other).toBe(3);
    expect(cohortMetrics(reports)).toEqual(cohort);
    const margins = cohort.vp.margins;
    expect(margins.close + margins.competitive + margins.blowout).toBe(3);
    expect(margins.byEnding.destruction.games).toBe(cohort.endedBy.destruction);
    expect(margins.byEnding.cycle16.games).toBe(cohort.endedBy.cycle16);
    const decisive = reports.map(item => gameMetrics(item.report)).filter(item => item.winner !== null);
    const meanLead = decisive.reduce((total, item) => total + item.vpMargin, 0) / Math.max(1, decisive.length);
    expect(cohort.vp.winnerLead.fromDestruction + cohort.vp.winnerLead.fromOther).toBeCloseTo(meanLead, 1);
  }, 30_000);

  it("scores each Server destruction at the VP the destroyer actually got", () => {
    const reports = [11, 12, 13, 21, 22, 23, 24, 51, 52].map(seed => game(seed).report!);
    const kills = reports.flatMap(report => report.telemetry.destructions.filter(item => item.by !== item.victim));
    expect(kills.length).toBeGreaterThan(0);
    for (const kill of kills) expect(kill.vp).toBe(defaultServerVP[kill.server]);
    for (const report of reports) {
      const m = gameMetrics(report);
      for (const seat of [0, 1] as const) expect(m.destructionVP[seat]).toBe(report.telemetry.destructions.filter(item => item.by === seat && item.victim !== seat).reduce((total, item) => total + item.vp!, 0));
    }
  }, 60_000);

  it("splits league games by the archetype in each seat", () => {
    const vpOf = (id: string) => content.cards.find(card => (card.definitionId ?? card.id) === id)?.vp ?? 0;
    const games = [21, 22, 23, 24].map((seed, index) => ({ id: `g${seed}`, report: game(seed).report!, seats: (index % 2 ? ["vp-dog", "t-5"] : ["t-5", "vp-dog"]) as [string, string] }));
    const results = archetypeResults(games, { labels: { "t-5": "Pure aggression", "vp-dog": "Pure economy" }, vpOf, vpBought: 25, damage: 3500 });
    expect(results.games).toBe(4);
    expect(results.agents.map(agent => agent.archetype).sort()).toEqual(["Pure aggression", "Pure economy"]);
    const [aggression, economy] = ["t-5", "vp-dog"].map(id => results.agents.find(agent => agent.agent === id)!);
    for (const agent of [aggression, economy]) {
      expect(agent.wins + agent.losses + agent.ties).toBe(4);
      expect(agent.byOpponent).toHaveLength(1);
    }
    expect(aggression.wins).toBe(economy.losses);
    const seatOf = (game: (typeof games)[number], id: string) => game.seats.indexOf(id) as 0 | 1;
    const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
    expect(aggression.avgDrainDealt).toBeCloseTo(mean(games.map(game => game.report.telemetry.drainDealt[seatOf(game, "t-5")])), 1);
    expect(economy.avgVpBought).toBeCloseTo(mean(games.map(game => game.report.purchases.filter(item => item.owner === seatOf(game, "vp-dog") && item.category === "VP").reduce((total, item) => total + vpOf(item.definitionId), 0))), 1);
    for (const game of games) {
      const own = game.report.telemetry.perCycle.reduce((total, cycle) => total + cycle.drain[seatOf(game, "t-5")], 0);
      expect(own).toBe(game.report.telemetry.drainDealt[seatOf(game, "t-5")]);
    }
  }, 60_000);

  it("records each Draft's market and the AI's score for every affordable card", () => {
    const report = game(4243).report!;
    expect(report.cycles.every(cycle => (cycle.market?.length ?? 0) > 0)).toBe(true);
    const draft = report.decisions.find(item => item.kind === "draft");
    expect(draft?.kind === "draft" && draft.offered?.length).toBeGreaterThan(0);
    const demand = cardDemand([{ id: "g", report }]);
    expect(demand.gamesWithMarketData).toBe(1);
    expect(demand.cards.every(card => card.picks <= card.affordable && card.affordable <= card.offers)).toBe(true);
  }, 30_000);
});

describe("neglected-card diagnosis", () => {
  type Pile = { id: string; name: string; category: "Base" | "Chaos" | "VP" | "Crypto"; cost: number };
  const piles: Pile[] = [
    { id: "dud", name: "Dud", category: "Chaos", cost: 3 }, { id: "hit", name: "Hit", category: "Chaos", cost: 3 },
    { id: "pricey", name: "Pricey", category: "Base", cost: 9 }, { id: "banned", name: "Banned", category: "Base", cost: 2 },
    { id: "cheap", name: "Cheap", category: "Base", cost: 2 },
  ];
  const synthetic = (seed: number) => {
    const cycles = Array.from({ length: 8 }, (_, i) => ({ cycle: i + 1, wallet: [5, 5] as [number, number], market: piles.map(pile => ({ ...pile, stock: [3, 3] as [number, number] })) }));
    const purchases = cycles.flatMap(cycle => [0, 1].flatMap(owner => [
      ...(cycle.cycle % 2 === owner ? [{ cycle: cycle.cycle, owner, definitionId: "hit", name: "Hit", category: "Chaos", cost: 3 }] : []),
      { cycle: cycle.cycle, owner, definitionId: "cheap", name: "Cheap", category: "Base", cost: 2 },
    ]));
    const decisions = cycles.flatMap(cycle => [0, 1].map(owner => ({ kind: "draft", cycle: cycle.cycle, owner, wallet: 5, phase: "build", bought: "Cheap", cost: 2, plan: [], alternatives: [],
      offered: [{ id: "dud", score: 1 }, { id: "hit", score: 4 }, { id: "banned", score: null }, { id: "cheap", score: 5 }] })));
    return { id: `s${seed}`, report: { winner: seed % 2, cycles, purchases, decisions } as unknown as MatchReport };
  };

  it("separates the card itself, its price and the AI's rules", () => {
    const demand = cardDemand([synthetic(1), synthetic(2)], [...piles, { id: "ghost", name: "Ghost", category: "VP", cost: 4 }].map(pile => ({ ...pile, pool: pile.category })));
    const cause = (name: string) => demand.neglected.find(item => item.name === name);
    expect(cause("Dud")).toMatchObject({ cause: "card", blame: "the card", affordable: 32, picks: 0 });
    expect(cause("Dud")?.reason).toMatch(/picked 50% of the time \(e\.g\. Hit\).*scored it 4 below/);
    expect(cause("Pricey")).toMatchObject({ cause: "price", blame: "game dynamic" });
    expect(cause("Banned")).toMatchObject({ cause: "ai-rule", blame: "AI player" });
    expect(cause("Hit")).toBeUndefined();
    expect(demand.neverOffered).toEqual(["Ghost"]);
    expect(demand.autoPicks.map(item => item.name)).toContain("Cheap");
    expect(cardDemand([synthetic(1), synthetic(2)])).toEqual(cardDemand([synthetic(1), synthetic(2)]));
  });
});

describe("agent reader tabs", () => {
  it("splits a report at its tab markers and keeps untabbed documents whole", () => {
    expect(splitTabs("# Title\nintro\n<!-- tab: One -->\nfirst\n<!-- tab: Two -->\nsecond\n")).toEqual({ preamble: "# Title\nintro\n", tabs: [{ title: "One", text: "\nfirst\n" }, { title: "Two", text: "\nsecond\n" }] });
    expect(splitTabs("# Journal\nbody").tabs).toEqual([]);
  });
});

describe("Eco-Strat journal", () => {
  it("counts only current-build evidence toward confidence", () => {
    const hypothesis: Hypothesis = { id: "h", topic: "t", statement: "s", origin: "founding", createdAt: "", createdBuild: "old", status: "open", evidence: [
      ...Array.from({ length: 9 }, () => ({ at: "", buildId: "old", direction: "for" as const, kind: "measured" as const, note: "" })),
      { at: "", buildId: "new", direction: "for", kind: "measured", note: "" },
    ] };
    expect(confidenceOf(hypothesis, "old").level).toBe("strong");
    const current = confidenceOf(hypothesis, "new");
    expect(current.level).toBe("insufficient");
    expect(current.priorBuildEntries).toBe(9);
  });

  it("refuses writes outside its own folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "guard-"));
    try {
      const writer = createGuardedWriter(join(root, "eco"));
      await writer.write("ok.json", "{}");
      await expect(writer.write("../escape.json", "{}")).rejects.toThrow(/outside/);
      await expect(writer.write(join(root, "ai-strategist/memory.json"), "{}")).rejects.toThrow(/outside/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe("Eco-Strat isolation", () => {
  it("has no code path to Strat-G or the game runtime", async () => {
    for (const file of ["server/agents/ecoStrat.ts", "server/agents/ecoMetrics.ts", "server/agents/ecoJournal.ts", "server/agents/evidence.ts"]) {
      const source = await readFile(file, "utf8");
      expect(source).not.toMatch(/aiStrategist/);
      for (const line of source.split("\n").filter(text => /^import .*src\//.test(text))) expect(line).toMatch(/^import type /);
    }
  });

  it("observes and reports without touching Strat-G's files or anything outside its folder", async () => {
    const root = await project();
    try {
      const memoryBefore = await readFile(join(root, "ai-strategist/memory.json"), "utf8");
      const before = new Set(await listAll(root));
      const eco = ecoFor(root);
      await eco.observe(sealEvidence(evidence(21)));
      await eco.observe(sealEvidence(evidence(22)));
      await eco.observe(sealEvidence(evidence(22)));
      const report = await eco.report("manual");
      expect(report?.games).toBe(2);
      const journal = eco.journal();
      expect(journal.games).toHaveLength(2);
      expect(journal.observations.some(item => item.occurrences >= 2)).toBe(true);
      expect(journal.hypotheses.some(item => item.evidence.length > 0)).toBe(true);
      expect(journal.hypotheses.find(item => item.id === "narrow-margins")?.evidence.length).toBe(2);
      const journalPath = join(root, "ai-agents/eco-strat/journal.json");
      const stored = JSON.parse(await readFile(journalPath, "utf8"));
      Object.assign(stored.hypotheses.find((item: Hypothesis) => item.id === "narrow-margins"), { statement: "the winner leads by less than 8 VP", plain: "close (<8 VP)" });
      await writeFile(journalPath, JSON.stringify(stored));
      const reloaded = ecoFor(root);
      await reloaded.observe(sealEvidence(evidence(23)));
      const refreshed = reloaded.journal().hypotheses.find(item => item.id === "narrow-margins")!;
      expect(refreshed.statement).toMatch(/leads by 5 VP or less/);
      expect(refreshed.plain).toBeUndefined();
      expect(refreshed.evidence).toHaveLength(1);
      expect(await readFile(join(root, "ai-strategist/memory.json"), "utf8")).toBe(memoryBefore);
      const created = (await listAll(root)).filter(file => !before.has(file)).map(file => relative(root, file));
      expect(created.length).toBeGreaterThan(0);
      expect(created.every(file => file.startsWith(join("ai-agents", "eco-strat")))).toBe(true);
      const markdown = await readFile(join(root, "ai-agents/eco-strat", report!.markdown), "utf8");
      expect(markdown.indexOf("<!-- tab: Recommendations -->")).toBeLessThan(markdown.indexOf("<!-- tab: Findings -->"));
      expect(markdown.indexOf("<!-- tab: Findings -->")).toBeLessThan(markdown.indexOf("<!-- tab: Point of view -->"));
      expect(markdown).toMatch(/\| Damage vs healing \|/);
      expect(markdown).toMatch(/### Your design goals[\s\S]*\*\*Close final scores, narrow margins\.\*\*/);
      expect(markdown).toMatch(/\*\*Pure aggression destroys both Servers by Cycles 10–13\.\*\* No league games with the pure aggression deck/);
      expect(markdown).toMatch(/\| Close vs blowout \|/);
      expect(markdown).toMatch(/No model was available/);
      expect(markdown).toMatch(/### Neglected cards: the card, or the game\?/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("writes a requested report before reading a backlog of league games", async () => {
    const root = await project();
    try {
      const eco = ecoFor(root);
      await eco.observe(sealEvidence(evidence(41)));
      const league = [42, 43, 44, 45].map(seed => eco.observe(sealEvidence(evidence(seed, { id: `league-${seed}`, source: "league", seats: ["t-5", "vp-dog"] }))));
      expect(eco.status().leagueBacklog).toBe(3);
      const report = await eco.report("manual");
      expect(report?.games).toBe(2);
      expect(eco.status().leagueBacklog).toBeGreaterThan(0);
      await Promise.all(league);
      expect(eco.status().leagueBacklog).toBe(0);
      expect(eco.journal().games).toHaveLength(5);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("cancels a cohort left running by an earlier server process", async () => {
    const root = await project();
    try {
      const eco = ecoFor(root);
      const id = await eco.beginCohort({ kind: "baseline", target: 10, seeds: [], strategyHash: "abc", strategyVersion: "v1.0" });
      await eco.updateCohort(id, { seed: 1001 });
      const restarted = ecoFor(root);
      await restarted.observe(sealEvidence(evidence(31)));
      const cohort = restarted.journal().cohorts.find(item => item.id === id)!;
      expect(cohort.status).toBe("cancelled");
      expect(cohort.note).toMatch(/interrupted by a server restart after 0 valid games/);
      expect(restarted.status().baseline.status).toBe("cancelled");
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("measures league games against each archetype's design goal", async () => {
    const root = await project();
    try {
      const eco = ecoFor(root, { loadFacts: async () => ({ rules: { primaryServer: 1800, backupServer: 1200 }, cards: [], locations: [], circuitRewards: [], startingDeck: [] }) });
      await eco.observe(sealEvidence(evidence(51, { id: "league-a", source: "league", seats: ["t-5", "vp-dog"] })));
      await eco.observe(sealEvidence(evidence(52, { id: "league-b", source: "league", seats: ["strat-g", "t-5"] })));
      const report = await eco.report("manual");
      const markdown = await readFile(join(root, "ai-agents/eco-strat", report!.markdown), "utf8");
      expect(markdown).toMatch(/\*\*Pure aggression destroys both Servers by Cycles 10–13\.\*\* The pure aggression deck destroyed both Servers in \d of 2 games.* reached 3,000 \(both Servers' full integrity on this build\) in \d games/);
      expect(markdown).toMatch(/\*\*Pure economy buys 25\+ VP by Cycles 11–14\.\*\* The pure economy deck bought [\d.]+ VP from the market/);
      expect(markdown).toMatch(/The balanced deck went \d–\d(–\d)? against pure aggression and no games against pure economy/);
      expect(markdown).toMatch(/League win rates: .*Pure aggression/);
      const stored = JSON.parse(await readFile(join(root, "ai-agents/eco-strat", report!.json), "utf8"));
      expect(stored.archetypes.games).toBe(2);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("leads its report with recommendations and keeps its point of view in the journal", async () => {
    const root = await project();
    try {
      const reply = {
        headline: "Destruction decides most games; healing cannot keep up.",
        recommendations: [{ title: "Soften the top finisher", change: "Cut Iterative Incubus Drain by 20%.", why: ["It dealt 30% of all Drain.", "Its buyers won 70%."], cause: "One card carries every kill.", hypothesis: "First Server kill moves about one Cycle later and more games reach Cycle 16.", watchFor: "Chaos may feel flat.", confidence: "moderate", test: "A/B 20 seeds." }],
        findings: { working: ["Wallets are spent."], problems: ["Kills come too early."], areas: { economy: "Healthy sinks." }, neglected: [], stratG: { agree: ["Draw matters."], disagree: [], insufficient: [] }, uncertainties: ["Mirror matches only."] },
        pointOfView: { summary: "A good economy makes every purchase a real trade-off.", principles: [{ principle: "Opportunity cost should bite", why: "From the BGG study: a buy is also a card you did not buy.", here: "Here the top three cards are 12% of buys, so choices are spread." }], changed: "" },
        plainHypotheses: [{ id: "destruction-decides", plain: "Most games end with a destroyed Server." }],
      };
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        const system = JSON.parse(String(init.body)).messages[0].content as string;
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(system.includes("balance report") ? reply : {}) } }] }), { status: 200 });
      }) as unknown as typeof fetch;
      const eco = ecoFor(root, { apiKey: "sk-test", fetchImpl, models: ["gpt-4.1"] });
      await eco.observe(sealEvidence(evidence(41)));
      const report = await eco.report("manual");
      const markdown = await readFile(join(root, "ai-agents/eco-strat", report!.markdown), "utf8");
      const [recommendations, findings, view] = ["Recommendations", "Findings", "Point of view"].map(tab => markdown.indexOf(`<!-- tab: ${tab} -->`));
      expect(recommendations).toBeGreaterThan(0);
      expect(recommendations).toBeLessThan(findings);
      expect(findings).toBeLessThan(view);
      expect(markdown.slice(recommendations, findings)).toMatch(/### 1\. Soften the top finisher[\s\S]*\*\*Why:\*\*[\s\S]*- It dealt 30% of all Drain\.[\s\S]*\*\*If implemented, I expect:\*\* First Server kill moves/);
      expect(markdown.slice(view)).toMatch(/### 1\. Opportunity cost should bite[\s\S]*\*\*How 0uroboros measures up:\*\*/);
      expect(markdown).toMatch(/Most games end with a destroyed Server\./);
      const journal = eco.journal();
      expect(journal.pointOfView).toMatchObject({ reportId: report!.id, summary: reply.pointOfView.summary });
      expect(journal.recommendations[0]).toMatchObject({ status: "candidate", why: reply.recommendations[0].why, hypothesis: reply.recommendations[0].hypothesis });
      expect(await readFile(join(root, "ai-agents/eco-strat/JOURNAL.md"), "utf8")).toMatch(/## My point of view[\s\S]*Opportunity cost should bite/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("receives frozen evidence and keeps failures to itself", async () => {
    const root = await project();
    try {
      const sealed = sealEvidence(evidence(31));
      expect(() => { (sealed.report.finalVP as number[])[0] = 99; }).toThrow();
      const eco = ecoFor(root, { loadFacts: async () => { throw new Error("facts exploded"); } });
      await expect(eco.study()).resolves.toBeNull();
      await expect(eco.observe({ ...sealed, id: "broken", report: { ...sealed.report, cycles: null } } as unknown as GameEvidence)).resolves.toBeUndefined();
      expect(eco.journal().errors.map(item => item.scope)).toEqual(expect.arrayContaining(["study", "observe broken"]));
      const bus = createEvidenceBus(() => undefined);
      bus.subscribe(() => { throw new Error("listener failure"); });
      expect(() => bus.publish(evidence(32))).not.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("records model fallbacks and never logs key material", async () => {
    const root = await project();
    try {
      const calls: string[] = [];
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        const model = JSON.parse(String(init.body)).model as string;
        calls.push(model);
        if (model === "gpt-5") return new Response(JSON.stringify({ error: { message: "The model `gpt-5` does not exist or you do not have access to it." } }), { status: 404 });
        if (model === "gpt-4.1") return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "ok", economyModel: ["Crypto -> cards"], risks: [], docDiscrepancies: [], hypotheses: [], questions: [] }) } }] }), { status: 200 });
        return new Response("no", { status: 500 });
      }) as unknown as typeof fetch;
      const eco = ecoFor(root, { apiKey: "sk-test-SECRET", fetchImpl, models: ["gpt-5", "gpt-4.1"] });
      const study = await eco.study();
      expect(study?.mode).toBe("model");
      expect(calls).toEqual(["gpt-5", "gpt-4.1"]);
      expect(eco.journal().model).toMatchObject({ used: "gpt-4.1", fallbacks: [{ from: "gpt-5", to: "gpt-4.1" }] });

      const failing = ecoFor(join(root, "second"), {
        projectRoot: root, apiKey: "sk-test-SECRET", models: ["gpt-4o"],
        fetchImpl: (async () => new Response("Incorrect API key provided: sk-test-SE****CRET", { status: 401 })) as unknown as typeof fetch,
      });
      await failing.study();
      const text = JSON.stringify(failing.journal()) + await readFile(join(root, "second/ai-agents/eco-strat/JOURNAL.md"), "utf8");
      expect(text).not.toMatch(/SECRET|SE\*\*\*\*CRET/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("reads user-provided copies of sources only when the direct fetch fails, and credits them", async () => {
    const root = await project();
    try {
      const bgg = "https://boardgamegeek.com/blog/17220/blogpost/190804/a-study-of-deck-building";
      const wiki = "https://en.wikipedia.org/wiki/Deck-building_game";
      const sources = join(root, "ai-agents/eco-strat/sources");
      await mkdir(sources, { recursive: true });
      const body = "The market functions as the environment in which strategies emerge. ".repeat(12);
      await writeFile(join(sources, "bgg.md"), `---\nurl: ${bgg}\ntitle: A Study of Deck Building\nprovidedAt: 2026-10-04\n---\n${body}`);
      await writeFile(join(sources, "wiki.md"), `---\nurl: ${wiki}\n---\n${body}`);
      let sent = "";
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        if (url.includes("api.openai.com")) {
          sent = String(init?.body);
          return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ sources: [{ url: bgg, takeaways: ["A dominant card removes decisions."] }, { url: wiki, takeaways: ["Deck-building games build the deck during play."] }], concepts: ["market design"], applications: [] }) } }] }), { status: 200 });
        }
        if (url === wiki) return new Response(`<html><title>Wiki</title><body>${"Live wiki text about deck-building. ".repeat(30)}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
        return new Response("Forbidden", { status: 403 });
      }) as unknown as typeof fetch;
      const eco = ecoFor(root, { apiKey: "sk-test", fetchImpl, models: ["gpt-4.1"] });
      const research = await eco.research();
      const byUrl = new Map(research!.sources.map(source => [source.url, source]));
      expect(byUrl.get(bgg)).toMatchObject({ accessible: true, via: "provided", providedFile: "sources/bgg.md", fetchFailure: "HTTP 403", takeaways: ["A dominant card removes decisions."] });
      expect(byUrl.get(wiki)).toMatchObject({ accessible: true, via: "fetched" });
      expect(sent).toContain("Live wiki text");
      expect(research!.sources.filter(source => !source.accessible).every(source => source.reason === "HTTP 403")).toBe(true);
      expect(await readFile(join(root, "ai-agents/eco-strat/JOURNAL.md"), "utf8")).toContain("read from a copy provided by the user (direct fetch failed: HTTP 403)");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
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

describe("Strat-G gating and one-way publishing", () => {
  const finished = () => game(41).report!;

  it("stays off when disabled but still publishes finished games for observers", async () => {
    const root = await project();
    try {
      const published: unknown[] = [];
      const strategist = createStrategist({ root: join(root, "ai-strategist"), contentFile: join(root, "content/authored-content.json"), log: () => undefined, enabled: () => false, onGameRecorded: record => published.push(record) });
      const get = response();
      await strategist.middleware(request("GET", "/api/ai/strategy"), get.res, () => undefined);
      expect(JSON.parse(get.result.body)).toMatchObject({ disabled: true, version: 0 });
      const post = response();
      await strategist.middleware(request("POST", "/api/ai/game", { gameId: "g1", report: finished() }), post.res, () => undefined);
      expect(JSON.parse(post.result.body)).toMatchObject({ ignored: true });
      expect(strategist.status().state).toBe("off");
      expect(published).toHaveLength(1);
      expect((published[0] as { stratG: unknown }).stratG).toBeNull();
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("publishes a frozen copy after its debrief; mutating it cannot reach Strat-G", async () => {
    const root = await project();
    try {
      const published: { report: { finalVP: number[] }; stratG: { plan: string } | null }[] = [];
      const strategist = createStrategist({ root: join(root, "ai-strategist"), contentFile: join(root, "content/authored-content.json"), log: () => undefined, onGameRecorded: record => published.push(record as never) });
      await strategist.ready;
      await strategist.debrief("g2", finished());
      expect(published).toHaveLength(1);
      expect(Object.isFrozen(published[0].report)).toBe(true);
      expect(() => { published[0].report.finalVP[0] = 999; }).toThrow();
      expect(published[0].stratG?.plan).toBe(strategist.memory().plan);
      const snapshot = strategist.snapshot();
      expect(() => { (snapshot.profile.weights as { drain: number }).drain = 0; }).toThrow();
      expect(strategist.memory().profile.weights.drain).not.toBe(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

});

describe("agent settings", () => {
  it("sanitizes settings and never exposes keys through the status API", async () => {
    expect(sanitizeSettings({ ecoStrat: { reportEvery: 1, baselineGames: 3 }, agentsEnabled: "yes" })).toMatchObject({ agentsEnabled: true, ecoStrat: { reportEvery: 5, baselineGames: 10 } });
    const root = await project();
    try {
      const store = createSettingsStore(join(root, "ai-agents/settings.json"));
      expect(store.write({ stratG: { enabled: false } }).stratG.enabled).toBe(false);
      expect(store.read().stratG.enabled).toBe(false);
      const system = createAgentSystem({ cwd: root, env: { OPENAI_API_KEY: "sk-test-SECRET-VALUE" }, loadModule: async path => import(/* @vite-ignore */ resolve(`.${path}`)), log: () => undefined });
      const get = response();
      await system.middlewares.at(-1)!(request("GET", "/api/agents/status"), get.res, () => undefined);
      expect(get.result.status).toBe(200);
      expect(get.result.body).not.toMatch(/SECRET|sk-test/);
      expect(JSON.parse(get.result.body)).toMatchObject({ effective: { stratG: false, ecoStrat: true }, stratG: { modelConfigured: true }, ecoStrat: { modelConfigured: true } });
      const put = response();
      await system.middlewares.at(-1)!(request("PUT", "/api/agents/settings", { ecoStrat: { enabled: false } }), put.res, () => undefined);
      expect(JSON.parse(put.result.body).effective.ecoStrat).toBe(false);
      const action = response();
      await system.middlewares.at(-1)!(request("POST", "/api/agents/eco-strat/baseline"), action.res, () => undefined);
      expect(action.result.status).toBe(409);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("keeps test-game settings in range and guards the test-game routes", async () => {
    expect(sanitizeSettings({ league: { rounds: 50, seedsPerBlock: 0, ecoObserves: "no" } }).league).toEqual({ rounds: 5, seedsPerBlock: 2, ecoObserves: true });
    expect(sanitizeSettings({})).toMatchObject({ t5: { enabled: true }, dv8: { enabled: true }, vpDog: { enabled: true }, league: { rounds: 3, seedsPerBlock: 4, ecoObserves: true } });
    const root = await project();
    try {
      const system = createAgentSystem({ cwd: root, env: {}, loadModule: async path => import(/* @vite-ignore */ resolve(`.${path}`)), log: () => undefined });
      const post = async (path: string) => { const out = response(); await system.middlewares.at(-1)!(request("POST", path), out.res, () => undefined); return out.result; };
      const evaluate = await post("/api/agents/eco-strat/evaluate");
      expect(evaluate.status).toBe(409);
      expect(JSON.parse(evaluate.body).error).toMatch(/baseline/);
      system.settings.write({ t5: { enabled: false }, dv8: { enabled: false }, vpDog: { enabled: false } });
      const lonely = await post("/api/agents/league/run");
      expect(lonely.status).toBe(409);
      expect(JSON.parse(lonely.body).error).toMatch(/at least two/);
      expect((await post("/api/agents/league/stop")).status).toBe(202);
      expect(system.status().league).toMatchObject({ running: false, window: 5, latestRatio: 0.5 });
      expect(await readdir(join(root, "ai-agents"))).not.toContain("t-5");
      expect(await readdir(join(root, "ai-agents"))).not.toContain("vp-dog");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("serves only the agents' own notebook, journal and reports to the reader", async () => {
    const root = await project();
    try {
      await mkdir(join(root, "ai-agents/eco-strat/reports"), { recursive: true });
      await writeFile(join(root, "ai-agents/eco-strat/reports/2026-10-05-baseline-1.md"), "# Report\n");
      await writeFile(join(root, "ai-agents/eco-strat/reports/notes.txt"), "not a report");
      const system = createAgentSystem({ cwd: root, env: {}, loadModule: async path => import(/* @vite-ignore */ resolve(`.${path}`)), log: () => undefined });
      const route = async (path: string) => { const out = response(); await system.middlewares.at(-1)!(request("GET", path), out.res, () => undefined); return out.result; };
      const list = JSON.parse((await route("/api/agents/documents")).body) as { id: string }[];
      expect(list.map(entry => entry.id)).toContain("eco-strat-report-2026-10-05-baseline-1");
      expect(list.some(entry => entry.id.includes("notes"))).toBe(false);
      const report = await route("/api/agents/documents/eco-strat-report-2026-10-05-baseline-1");
      expect(JSON.parse(report.body)).toMatchObject({ agent: "eco-strat", markdown: "# Report\n" });
      expect((await route("/api/agents/documents/package.json")).status).toBe(404);
      expect((await route("/api/agents/documents/..%2F..%2Fpackage.json")).status).toBe(404);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe("Eco-Strat research", () => {
  it("reads articles the user pasted in even when they have no fetchable page", async () => {
    const root = await project();
    try {
      await mkdir(join(root, "ai-agents/eco-strat/sources"), { recursive: true });
      await writeFile(join(root, "ai-agents/eco-strat/sources/pasted.md"), `---\nurl: user-provided:pasted\ntitle: Pasted article\nprovidedAt: 2026-10-04\n---\n${"Zero-sum payoffs and norms. ".repeat(40)}`);
      const eco = ecoFor(root, { fetchImpl: (async () => new Response("blocked", { status: 403 })) as typeof fetch });
      await eco.research();
      const pasted = eco.journal().research!.sources.find(source => source.url === "user-provided:pasted");
      expect(pasted).toMatchObject({ accessible: true, via: "provided", title: "Pasted article", providedFile: "sources/pasted.md" });
      expect(pasted!.fetchFailure).toBeUndefined();
      expect(await readFile(join(root, "ai-agents/eco-strat/JOURNAL.md"), "utf8")).toMatch(/read from an article provided by the user · Pasted article/);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("credits takeaways by source id, so parts of one long source keep their own takeaways", async () => {
    const root = await project();
    try {
      await mkdir(join(root, "ai-agents/eco-strat/sources"), { recursive: true });
      for (const part of [1, 2]) await writeFile(join(root, `ai-agents/eco-strat/sources/thesis-${part}.md`), `---\nurl: https://example.edu/thesis.pdf#part-${part}\ntitle: Thesis part ${part}\n---\n${`Part ${part} on scarcity. `.repeat(40)}`);
      let sent: { id: string; url: string }[] = [];
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        if (!String(url).includes("api.openai.com")) return new Response("blocked", { status: 403 });
        sent = (JSON.parse(JSON.parse(String(init!.body)).messages[1].content) as { sources: { id: string; url: string }[] }).sources;
        const ids = Object.fromEntries(sent.map(source => [source.url, source.id]));
        const reply = { sources: [{ id: ids["https://example.edu/thesis.pdf#part-1"], url: "https://example.edu/thesis.pdf", takeaways: ["first"] }, { id: ids["https://example.edu/thesis.pdf#part-2"], url: "https://example.edu/thesis.pdf", takeaways: ["second"] }], concepts: ["scarcity"], applications: [] };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200 });
      }) as typeof fetch;
      const eco = ecoFor(root, { apiKey: "test", fetchImpl });
      await eco.research();
      expect(new Set(sent.map(source => source.id)).size).toBe(sent.length);
      const takeaways = Object.fromEntries(eco.journal().research!.sources.map(source => [source.url, source.takeaways]));
      expect(takeaways["https://example.edu/thesis.pdf#part-1"]).toEqual(["first"]);
      expect(takeaways["https://example.edu/thesis.pdf#part-2"]).toEqual(["second"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  const sourcesFixture = async (root: string) => {
    const dir = join(root, "ai-agents/eco-strat/sources");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "links.json"), JSON.stringify({ links: ["https://good.example/a", "https://gone.example/b", "https://flaky.example/c"] }));
    for (const name of ["useful", "empty"]) await writeFile(join(dir, `${name}.md`), `---\nurl: user-provided:${name}\ntitle: ${name} article\n---\n${`${name} words about markets. `.repeat(40)}`);
    return dir;
  };
  const pageOr = (url: string) => {
    if (url.includes("good.example")) return new Response(`<html><title>Good</title><body>${"<p>Deck-building economies reward thin decks. </p>".repeat(20)}</body></html>`, { status: 200 });
    if (url.includes("gone.example")) return new Response("gone", { status: 404 });
    throw new Error("socket hang up");
  };

  it("drops sources that give no takeaways after the model reads them, keeping transient failures", async () => {
    const root = await project();
    try {
      const dir = await sourcesFixture(root);
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        if (!String(url).includes("api.openai.com")) return pageOr(String(url));
        const sent = (JSON.parse(JSON.parse(String(init!.body)).messages[1].content) as { sources: { id: string; url: string }[] }).sources;
        const id = (url: string) => sent.find(source => source.url === url)!.id;
        const reply = { sources: [{ id: id("https://good.example/a"), takeaways: ["thin decks win"] }, { id: id("user-provided:useful"), takeaways: ["markets clear"] }, { id: id("user-provided:empty"), takeaways: [] }], concepts: [], applications: [] };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200 });
      }) as typeof fetch;
      const eco = ecoFor(root, { apiKey: "test", fetchImpl });
      await eco.research();
      expect(JSON.parse(await readFile(join(dir, "links.json"), "utf8")).links).toEqual(["https://good.example/a", "https://flaky.example/c"]);
      expect((await readdir(dir)).sort()).toEqual(["links.json", "removed", "useful.md"]);
      expect(await readdir(join(dir, "removed"))).toEqual(["empty.md"]);
      const research = eco.journal().research!;
      expect(research.removed!.map(item => item.url).sort()).toEqual(["https://gone.example/b", "user-provided:empty"]);
      expect(research.removed!.find(item => item.url === "user-provided:empty")).toMatchObject({ file: "sources/removed/empty.md", reason: "read, but gave no takeaways" });
      expect(research.sources.map(source => source.url)).toEqual(["https://good.example/a", "https://flaky.example/c", "user-provided:useful"]);
      expect(await readFile(join(root, "ai-agents/eco-strat/JOURNAL.md"), "utf8")).toContain("Removed from the reading list (no takeaways)");
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("removes nothing when no model reads the sources", async () => {
    const root = await project();
    try {
      const dir = await sourcesFixture(root);
      const eco = ecoFor(root, { fetchImpl: (async (url: string) => pageOr(String(url))) as typeof fetch });
      await eco.research();
      expect(JSON.parse(await readFile(join(dir, "links.json"), "utf8")).links).toHaveLength(3);
      expect((await readdir(dir)).sort()).toEqual(["empty.md", "links.json", "useful.md"]);
      expect(eco.journal().research!.removed ?? []).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);

  it("seeds the reading list from the default links", async () => {
    const root = await project();
    try {
      const eco = ecoFor(root, { fetchImpl: (async () => new Response("blocked", { status: 403 })) as typeof fetch });
      await eco.research();
      expect(JSON.parse(await readFile(join(root, "ai-agents/eco-strat/sources/links.json"), "utf8")).links).toEqual(DEFAULT_RESEARCH_URLS);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 30_000);
});

describe("evaluation cohorts", () => {
  it("runs a frozen-profile cohort and writes a report without involving Strat-G", async () => {
    const root = await project();
    try {
      const eco = ecoFor(root);
      const profile = structuredClone(DEFAULT_STRATEGY);
      const result = await runCohort({
        kind: "baseline", target: 2, eco, harness: async () => ({ compileForSelfPlay, playSelfPlayGame }), document: async () => document,
        stratG: { profile, version: 4, mode: "heuristic", plan: "test plan" }, seedBase: 500,
      });
      expect(result).toMatchObject({ valid: 2, invalid: 0, status: "complete" });
      const cohort = eco.journal().cohorts[0];
      expect(cohort).toMatchObject({ status: "complete", seeds: [500, 501], strategyVersion: "v1.4" });
      expect(eco.journal().reports[0].kind).toBe("baseline");
      expect(profile).toEqual(DEFAULT_STRATEGY);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);
});
