import { describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import authored from "../content/authored-content.json";
import { compileForSelfPlay, playSelfPlayGame } from "../src/ai/selfPlay";
import { DEFAULT_STRATEGY } from "../src/ai/strategy";
import type { ContentDocument } from "../src/authoring/contentModel";
import { splitTabs } from "../src/miniMarkdown";
import { cohortMetrics } from "../server/agents/ecoMetrics";
import { emptyJournal, renderJournal, retractCardVerdicts, topRecommendations, type Journal, type Recommendation } from "../server/agents/ecoJournal";
import { createEcoStrat, JOURNAL_RESETS } from "../server/agents/ecoStrat";
import { sealEvidence, type GameEvidence } from "../server/agents/evidence";

const content = compileForSelfPlay((authored as unknown as { document: ContentDocument }).document);
const game = (seed: number) => playSelfPlayGame({ content, seed, strategy: DEFAULT_STRATEGY });
const evidence = (seed: number): GameEvidence => {
  const result = game(seed);
  return { id: `test-s${seed}`, source: "self-play", recordedAt: new Date().toISOString(), seed, valid: result.valid, report: result.report!, stratG: null };
};
const AT = "2026-10-07T12:00:00.000Z";
const rec = (id: string, reportId: string, title: string, adjustment: string, buildId = "b1"): Recommendation => ({
  id, at: AT, buildId, reportId, title, observed: "", evidence: "", likelyCause: "", adjustment, expectedEffect: "", risks: "", confidence: "moderate", test: "", status: "candidate",
});
const journalWith = (change: (journal: Journal) => void) => { const journal = emptyJournal(AT); journal.currentBuild = "b1"; change(journal); return journal; };

async function project() {
  const root = await mkdtemp(join(tmpdir(), "eco-summary-"));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "content/authored-content.json"), JSON.stringify(authored));
  for (const file of ["src/game.ts", "src/runtime.ts", "src/evaluationMarket.ts", "src/content.ts"]) await cp(resolve(file), join(root, file), { recursive: true });
  await mkdir(join(root, "ai-strategist"), { recursive: true });
  await writeFile(join(root, "ai-strategist/memory.json"), JSON.stringify({ schema: 1, version: 1, mode: "heuristic", plan: "", profile: DEFAULT_STRATEGY, theories: [] }));
  return root;
}
const ecoFor = (root: string, extra: Partial<Parameters<typeof createEcoStrat>[0]> = {}) => createEcoStrat({
  root: join(root, "ai-agents/eco-strat"), projectRoot: root, stratGRoot: join(root, "ai-strategist"), log: () => undefined,
  loadFacts: async () => ({ cards: [], locations: [], circuitRewards: [], startingDeck: [] }),
  settings: () => ({ active: true, observeHumanGames: true, continuous: false, reportEvery: 10, baselineGames: 10 }),
  ...extra,
});

describe("retracting verdicts about a starting-deck card", () => {
  it("withdraws recommendations that change the card, retires hypotheses and answers questions, but keeps reward mentions", () => {
    const journal = journalWith(item => {
      item.recommendations.push(
        rec("r1", "rep-1", "Nerf Rezz Blade", "Rezz Blade: +2 Actions to +1."),
        rec("r2", "rep-1", "Trim action attackers", "Remove +Actions on Rezz Blade/Razor."),
        rec("r3", "rep-1", "Defang Circuit rewards", "Replace The Rezz (free Rezz Blade) with +1 VP; replace The Rezz (gain Rezz Blade) too."),
        rec("r4", "rep-1", "Raise Kilo-Coin cost", "Kilo-Coin 5 to 6."),
      );
      item.hypotheses.push({ id: "h1", topic: "Cards", statement: "A mid-cost attacker like Rezz-Blade dominates damage.", origin: "game", createdAt: AT, createdBuild: "b1", status: "open", evidence: [] });
      item.questions.push({ id: "q1", at: AT, buildId: "b1", text: "Why is rezz blade played without purchases?", status: "open" });
      item.pointOfView = { at: AT, buildId: "b1", reportId: "rep-1", model: null, summary: "", basedOn: [], principles: [
        { principle: "Avoid nexus cards", why: "", here: "Rezz Blade frequently top Drain; Bushido.io 216 Drain/play" },
        { principle: "Only Rezz", why: "", here: "Rezz Blade leads Drain" },
      ] };
    });
    const taken = retractCardVerdicts(journal, "Rezz Blade", "It starts in every deck.", AT);
    expect(taken).toEqual({ recommendations: 2, hypotheses: 1, questions: 1, principles: 2 });
    expect(journal.recommendations.map(item => item.status)).toEqual(["withdrawn", "withdrawn", "candidate", "candidate"]);
    expect(journal.recommendations[0].withdrawn).toEqual({ at: AT, reason: "It starts in every deck." });
    expect(journal.hypotheses[0]).toMatchObject({ status: "retired", retiredReason: "It starts in every deck." });
    expect(journal.questions[0]).toMatchObject({ status: "answered", answer: "It starts in every deck." });
    expect(journal.pointOfView!.principles.map(item => item.here)).toEqual(["Bushido.io 216 Drain/play", "It starts in every deck."]);
  });
});

describe("the journal's tabs and summary", () => {
  it("opens on a summary with the top 3 recommendations, best and worst purchases, and endings split by margin", () => {
    const journal = journalWith(item => {
      item.builds.push({ id: "b1", label: "test build", contentRevision: 1, firstSeen: AT });
      item.recommendations.push(
        rec("old-1", "rep-1", "Old idea", "x"),
        rec("new-1", "rep-2", "First idea", "Cut A."), rec("new-2", "rep-2", "Withdrawn idea", "Cut B."), rec("new-3", "rep-2", "Second idea", "Cut C."),
      );
      item.recommendations[2].status = "withdrawn";
      item.recommendations[2].withdrawn = { at: AT, reason: "Starts in every deck." };
      const entry = (id: string, endedBy: string, finalVP: [number, number]) => ({ id, source: "self-play", buildId: "b1", at: AT, valid: true, winner: 0 as const, endedBy, cycles: 12, finalVP });
      item.games.push(entry("g1", "destruction", [20, 17]), entry("g2", "destruction", [30, 10]), entry("g3", "destruction", [22, 12]), entry("g4", "cycle16", [18, 18]), entry("g5", "cycle16", [40, 20]));
      item.games.push({ ...entry("g6", "destruction", [99, 0]), buildId: "old" });
      item.purchases = { at: AT, reportId: "rep-2", buildId: "b1", games: 5, minBuyerGames: 3, startingDeck: ["Rezz Blade"],
        top: [{ name: "Kilo-Coin", cost: 5, copies: 9, buyerGames: 6, buyerWinRate: 0.83 }], bottom: [{ name: "Dud", cost: 2, copies: 4, buyerGames: 4, buyerWinRate: 0.25 }] };
    });
    expect(topRecommendations(journal, 3).map(item => item.title)).toEqual(["First idea", "Second idea", "Old idea"]);
    const { preamble, tabs } = splitTabs(renderJournal(journal));
    expect(preamble).toMatch(/# Eco-Strat journal/);
    expect(tabs.map(tab => tab.title)).toEqual(["Summary", "Point of view", "Hypotheses", "Observations", "Recommendations", "Reports", "Research", "Errors"]);
    const summary = tabs[0].text;
    expect(summary).toMatch(/1\. \*\*First idea\*\* Cut A\.[\s\S]*2\. \*\*Second idea\*\*[\s\S]*3\. \*\*Old idea\*\*/);
    expect(summary).not.toMatch(/Withdrawn idea/);
    expect(summary).toMatch(/### Best purchases[\s\S]*\| Kilo-Coin \| 5 \| 9 \| 6 \| 83% \|/);
    expect(summary).toMatch(/### Worst purchases[\s\S]*\| Dud \| 2 \| 4 \| 4 \| 25% \|/);
    expect(summary).toMatch(/Starting-deck cards are left out \(Rezz Blade\)/);
    expect(summary).toMatch(/3 of 5 games on this build \(60%\) ended by Server destruction and 2 \(40%\) went the full 16 Cycles/);
    expect(summary).toMatch(/\| Server destruction \| 3 \(60%\) \| 1 \| 1 \| 1 \|/);
    expect(summary).toMatch(/\| Full 16 Cycles \| 2 \(40%\) \| 1 \| 0 \| 1 \|/);
    expect(summary).toMatch(/\| \*\*All games\*\* \| 5 \(100%\) \| 2 \| 1 \| 2 \|/);
    expect(tabs[4].text).toMatch(/### Withdrawn \(1\)[\s\S]*_Starts in every deck\._[\s\S]*- Withdrawn idea/);
  });
});

describe("Eco-Strat and the starting deck", () => {
  it("tells the model which cards start in every deck, leaves them out of the purchase summary and shows a report in progress", async () => {
    const root = await project();
    try {
      const games = [61, 62, 63, 64].map(evidence);
      const metrics = cohortMetrics(games.map(item => ({ id: item.id, report: item.report })));
      const starter = metrics.cards.filter(card => card.buyerGames > 0)[0].name;
      const prompts: { system: string; payload: string }[] = [];
      const fetchImpl = (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
        prompts.push({ system: body.messages[0].content, payload: body.messages[1].content });
        return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
      }) as unknown as typeof fetch;
      const eco = ecoFor(root, { apiKey: "sk-test", fetchImpl, models: ["gpt-4.1"], loadFacts: async () => ({ cards: [], locations: [], circuitRewards: [], startingDeck: [{ name: starter, count: 1 }] }) });
      for (const item of games) await eco.observe(sealEvidence(item));
      const observePrompt = prompts.find(prompt => prompt.system.includes("one finished game"))!;
      expect(observePrompt.system).toContain(`Starting deck: ${starter} start in both players' decks`);
      const pending = eco.report("manual");
      expect(eco.status().reporting).toBe(true);
      const entry = await pending;
      expect(entry).not.toBeNull();
      expect(eco.status().reporting).toBe(false);
      expect(eco.status().lastReport).toMatchObject({ id: entry!.id, games: 4 });
      const reportPrompt = prompts.find(prompt => prompt.system.includes("balance report"))!;
      expect(reportPrompt.system).toContain(`never call a card marked inStartingDeck overpowered`);
      expect(JSON.parse(reportPrompt.payload).metrics.cards.find((card: { name: string }) => card.name === starter)).toMatchObject({ inStartingDeck: true });
      const purchases = eco.journal().purchases!;
      expect(purchases).toMatchObject({ reportId: entry!.id, games: 4, minBuyerGames: 3, startingDeck: [starter] });
      expect([...purchases.top, ...purchases.bottom].some(line => line.name === starter)).toBe(false);
      expect(purchases.top.length).toBeGreaterThan(0);
      expect(purchases.top.every(line => line.buyerGames >= 3)).toBe(true);
      const summary = splitTabs(await readFile(join(root, "ai-agents/eco-strat/JOURNAL.md"), "utf8")).tabs[0];
      expect(summary.title).toBe("Summary");
      expect(summary.text).toMatch(new RegExp(`\\| ${purchases.top[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\|`));
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);

  it("applies each journal correction once, on load", async () => {
    const root = await project();
    try {
      const folder = join(root, "ai-agents/eco-strat");
      await mkdir(folder, { recursive: true });
      const stored = emptyJournal(AT);
      stored.recommendations.push(rec("r1", "rep-1", "Nerf Rezz Blade", "Rezz Blade: +2 Actions to +1."));
      await writeFile(join(folder, "journal.json"), JSON.stringify(stored));
      const eco = ecoFor(root);
      await eco.load();
      expect(eco.journal().recommendations[0].status).toBe("withdrawn");
      expect(eco.journal().resets).toEqual(JOURNAL_RESETS.map(reset => reset.id));
      const saved = JSON.parse(await readFile(join(folder, "journal.json"), "utf8")) as Journal;
      saved.recommendations.push(rec("r2", "rep-2", "Rezz Blade per play is high", "Rezz Blade: -100 to -90 Drain."));
      await writeFile(join(folder, "journal.json"), JSON.stringify(saved));
      const reloaded = ecoFor(root);
      await reloaded.load();
      expect(reloaded.journal().recommendations.map(item => item.status)).toEqual(["withdrawn", "candidate"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 60_000);
});
