import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_STRATEGY, draftScore, effectTotal, handValue, optionValue, planDraft, sanitizeProfile, thinningPicks, type StrategyContext } from "@0uroboros/engine/ai/strategy";
import { createSession, firstLegalSelection, seededRandom, type MatchReport, type RuntimeSession } from "@0uroboros/engine/runtime";
import { canDeploy, legalNodes, type Card } from "@0uroboros/engine/game";
import { createStrategist } from "../server/aiStrategist";
import { playSelfPlayGame } from "@0uroboros/engine/ai/selfPlay";
import { emptyTelemetry } from "@0uroboros/engine/ai/telemetry";
import { compileContent, type ContentDocument } from "@0uroboros/engine/authoring/contentModel";
import authored from "../content/authored-content.json";

const cards = (authored as unknown as { document: { cards: (Card & { pool: string })[] } }).document.cards;
const byId = (id: string): Card => structuredClone(cards.find(card => card.id === id)!);
const starter = ["slash-dot", "dash-dot", "dotkrawler", "rezz-razor", "rezz-blade", "byte-coin", "byte-coin", "kilo-coin", "vault-encryption", "vault-encryption"].map(byId);
const context = (cycle: number, owned: Card[] = starter, extra: Partial<StrategyContext> = {}): StrategyContext => ({ cycle, finalCycle: 16, owned, ownServers: 3500, ownServersMax: 3500, enemyServers: 3500, enemyServersMax: 3500, ...extra });
const option = (id: string, available = 8) => ({ id, card: byId(id), available });

describe("opponent draft strategy", () => {
  it("never buys Shyte-Coin and prefers one big Crypto over a pile of small ones", () => {
    expect(draftScore(byId("shyte-coin"), DEFAULT_STRATEGY, context(2))).toBe(-Infinity);
    const plan = planDraft([option("shyte-coin", 16), option("byte-coin", 16), option("mega-cache", 16)], 9, DEFAULT_STRATEGY, context(2));
    expect(plan).not.toContain("shyte-coin");
    expect(plan).toContain("mega-cache");
  });

  it("values deck-cycling Characters over low Crypto after the shared early economy", () => {
    expect(draftScore(byId("slash-dot"), DEFAULT_STRATEGY, context(5))).toBeGreaterThan(draftScore(byId("byte-coin"), DEFAULT_STRATEGY, context(5)));
    expect(draftScore(byId("shiva-of-cern"), DEFAULT_STRATEGY, context(5))).toBeGreaterThan(draftScore(byId("kilo-coin"), DEFAULT_STRATEGY, context(5)));
  });

  it("opens Cycles 1-4 on Kilo then Mega-Cache, and Byte when Kilo is out of reach", () => {
    const standard = ["byte-coin", "byte-coin", "shyte-coin", "shyte-coin", "basic-encryption", "basic-encryption", "dotkrawler", "slash-dot", "rezz-blade", "night-scythe"].map(byId);
    const unique = (list: Card[], tag: string) => list.map((card, index) => ({ ...card, id: `${card.id}#${tag}${index}` }));
    const deck = unique(standard, "std");
    expect(deck.reduce((sum, card) => sum + (card.cryptoValue ?? 0), 0)).toBe(6);
    expect(planDraft([option("kilo-coin"), option("byte-coin"), option("slash-dot"), option("h3x1-d3x1")], 6, DEFAULT_STRATEGY, context(1, deck))).toEqual(["kilo-coin"]);
    expect(planDraft([option("byte-coin"), option("slash-dot"), option("h3x1-d3x1")], 5, DEFAULT_STRATEGY, context(1, deck))).toEqual(["byte-coin"]);
    const withKilo = [...deck, { ...byId("kilo-coin"), id: "kilo#owned" }];
    expect(planDraft([option("mega-cache"), option("kilo-coin"), option("slash-dot")], 9, DEFAULT_STRATEGY, context(2, withKilo))).toContain("mega-cache");
    expect(planDraft([option("basic-encryption"), option("vault-encryption")], 10, DEFAULT_STRATEGY, context(2, deck))).toEqual([]);
  });

  it("trashes Basic Encryption first, keeps Crypto until a Kilo, then trashes Shyte", () => {
    const unique = (list: Card[], tag: string) => list.map((card, index) => ({ ...card, id: `${card.id}#${tag}${index}` }));
    const standard = unique(["byte-coin", "byte-coin", "shyte-coin", "shyte-coin", "basic-encryption", "basic-encryption", "dotkrawler", "slash-dot", "rezz-blade", "night-scythe"].map(byId), "e");
    const pick = (...names: string[]) => names.map(name => standard.find(card => card.name === name)!);
    const hand = pick("Basic Encryption", "Basic Encryption", "Shyte-Coin", "Byte-Coin", "Slash-Dot");
    const beforeKilo = thinningPicks(hand, DEFAULT_STRATEGY, context(2, standard), 3).map(card => card.name);
    expect(beforeKilo[0]).toBe("Basic Encryption");
    expect(beforeKilo).not.toContain("Shyte-Coin");
    expect(beforeKilo).not.toContain("Byte-Coin");
    const withKilo = [...standard, { ...byId("kilo-coin"), id: "kilo#1" }];
    const afterKilo = thinningPicks(hand, DEFAULT_STRATEGY, context(2, withKilo), 4).map(card => card.name);
    expect(afterKilo.filter(name => name === "Basic Encryption").length).toBeGreaterThan(0);
    expect(afterKilo).toContain("Shyte-Coin");
    expect(afterKilo).not.toContain("Byte-Coin");
  });

  it("stays within the wallet and skips purchases that only dilute the deck", () => {
    const options = ["slash-dot", "root-rune", "kilo-coin", "night-scythe", "basic-encryption"].map(id => option(id));
    for (const wallet of [0, 3, 7, 12, 20]) {
      const plan = planDraft(options, wallet, DEFAULT_STRATEGY, context(5));
      expect(plan.reduce((sum, id) => sum + byId(id).cost, 0)).toBeLessThanOrEqual(wallet);
    }
    expect(planDraft([option("basic-encryption")], 10, DEFAULT_STRATEGY, context(3))).toEqual([]);
  });

  it("pivots into Chaos for the endgame and buys only VP in the final Draft", () => {
    const blade = byId("h3x1-d3x1"), slash = byId("slash-dot");
    const early = draftScore(blade, DEFAULT_STRATEGY, context(4)) - draftScore(slash, DEFAULT_STRATEGY, context(4));
    const late = draftScore(blade, DEFAULT_STRATEGY, context(10)) - draftScore(slash, DEFAULT_STRATEGY, context(10));
    expect(late).toBeGreaterThan(early);
    const final = planDraft(["delta-wave", "shiva-of-cern", "mega-cache", "zenith-worx", "vault-encryption"].map(id => option(id)), 20, DEFAULT_STRATEGY, context(16));
    expect(final.length).toBeGreaterThan(0);
    expect(final.every(id => byId(id).type === "VP")).toBe(true);
  });

  it("trashes starting cards once better cards replace them, keeping VP, Crypto it needs and a working deck", () => {
    const unique = (list: Card[], tag: string) => list.map((card, index) => ({ ...card, id: `${card.id}#${tag}${index}` }));
    const deck = unique(starter, "s");
    const profile = { ...DEFAULT_STRATEGY, dilution: 1 };
    const characters = deck.filter(card => card.type !== "VP" && card.type !== "Crypto");
    expect(thinningPicks([...characters, unique([byId("shyte-coin")], "j")[0]], profile, context(5, deck), 5).map(card => card.name)).toEqual(["Shyte-Coin"]);
    const strong = unique(cards.filter(card => card.type !== "VP" && card.type !== "Crypto" && !starter.some(item => item.id === card.id))
      .sort((a, b) => handValue(b, profile, context(5)) - handValue(a, profile, context(5))).slice(0, 10), "m");
    const upgraded = [...deck, ...strong];
    const picks = thinningPicks(deck, profile, context(5, upgraded), 10);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every(card => card.type !== "VP")).toBe(true);
    expect(thinningPicks(deck, { ...profile, handCryptoTarget: 20 }, context(5, upgraded), 10).filter(card => card.type === "Crypto")).toEqual([]);
    expect(thinningPicks(deck, profile, context(5, deck.slice(0, 8)), 10)).toEqual([]);
    expect(thinningPicks(deck, { ...profile, handCryptoTarget: 2 }, context(5, upgraded), 10).some(card => card.type === "Crypto")).toBe(true);
  });

  it("clamps untrusted profiles", () => {
    const profile = sanitizeProfile({ economyUntilCycle: 40, chaosFromCycle: -3, minCryptoValue: 0, weights: { draw: 99 }, cardBias: { "slash-dot": 50, junk: "x" } });
    expect(profile.economyUntilCycle).toBe(12);
    expect(profile.chaosFromCycle).toBeGreaterThan(profile.economyUntilCycle);
    expect(profile.minCryptoValue).toBe(1);
    expect(profile.weights.draw).toBe(5);
    expect(profile.cardBias).toEqual({ "slash-dot": 6 });
  });
});

/** Headless match: player 0 is driven by `localDraft`, the opponent by the session's strategist profile. */
function playMatch(session: RuntimeSession, localDraft: (session: RuntimeSession, time: number) => void, cycles = 16) {
  const drain = () => {
    for (let guard = 0; session.pendingCount || session.state.choice; guard++) {
      if (guard > 4000) throw new Error("Resolution stalled.");
      if (session.state.choice) session.choose(firstLegalSelection(session.state.choice), session.state.choice.owner);
      else session.step();
    }
  };
  for (let cycle = 0; cycle < cycles && session.state.phase !== "gameover"; cycle++) {
    drain();
    for (let turn = 1; turn <= 3 && session.state.phase === "runtime"; turn++) {
      for (const item of [...session.state.players[0].hand]) {
        const target = legalNodes(session.state.turn, session.state.nodeOrder).find(node => !canDeploy(item, session.state.players[0].actions, session.state.turn, node, session.state.nodes[node].cards[0].length));
        if (target !== undefined) session.deploy(item.id, target);
      }
      session.endTurn(); drain();
    }
    if (session.state.phase !== "draft") break;
    let time = Date.now();
    if (session.state.circuitEligible.includes(0) && session.state.circuitReward.definition) session.claimCircuitReward(0, time);
    drain();
    for (let beat = 0; beat < 40 && !session.state.draftEnded; beat++) {
      time += 2100;
      if (!session.state.draftReady[0]) localDraft(session, time);
      session.opponentDraftStep(time); drain();
    }
    if (!session.state.draftEnded) { session.endDraft(0); }
    session.nextCycle();
  }
  return session.matchReport();
}

/** The opponent's previous Draft policy: a flat Crypto score that happily bought Shyte-Coin. */
function legacyDraft(session: RuntimeSession, time: number) {
  const player = session.state.players[0];
  const owned = [...player.draw, ...player.hand, ...player.discard];
  const legal = session.state.market.filter(pile => (pile.remaining ? pile.remaining[0] : pile.supply) > 0 && pile.card.cost <= player.wallet);
  if (!legal.length) { session.endDraft(0); return; }
  const score = (card: Card) => {
    const count = owned.filter(item => item.name === card.name).length;
    const income = owned.filter(item => item.type === "Crypto").length;
    return (session.state.cycle >= 10 && card.vp ? card.vp * 4 : card.type === "Crypto" ? (income < 4 ? 9 : 2) : (card.power ?? 0) + (card.duration ? 4 : 0)) / (1 + count * 1.8) + card.cost * .1;
  };
  legal.sort((a, b) => score(b.card) - score(a.card));
  try { session.buy(legal[0].id, time, 0); } catch { /* pile cooldown */ }
}

describe("opponent runtime integration", () => {
  it("plays full sessions without buying Shyte-Coin and records a match report", () => {
    let aiWins = 0, games = 0;
    for (const seed of [5, 17, 29]) {
      const content = compileContent(structuredClone((authored as unknown as { document: ContentDocument }).document));
      const session = createSession({ carryover: true, priorityPreference: "higher", random: seededRandom(seed), strategicMarket: true, evaluationContent: true, content, strategy: { ...DEFAULT_STRATEGY, version: 7 } });
      const report = playMatch(session, legacyDraft);
      games++; if (report.winner === 1) aiWins++;
      expect(report.strategyVersion).toBe(7);
      expect(report.purchases.filter(item => item.owner === 1 && item.definitionId === "shyte-coin")).toHaveLength(0);
      expect(report.purchases.some(item => item.owner === 1)).toBe(true);
      expect(report.cycles.length).toBeGreaterThan(0);
      expect(report.cycles[0].locations.length).toBe(5);
    }
    expect(games).toBe(3);
    expect(aiWins).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

describe("strategist agent", () => {
  const sampleReport = (winner: 0 | 1): MatchReport => ({
    strategyVersion: 1, cycle: 16, phase: "gameover", winner, endedReason: "Cycle 16 final Draft complete.",
    finalVP: winner === 0 ? [30, 18] : [18, 30], servers: [3000, 900],
    purchases: [
      { cycle: 2, owner: 0, definitionId: "rezz-blade", name: "Rezz-Blade", category: "Chaos", cost: 4 },
      { cycle: 3, owner: 0, definitionId: "rezz-blade", name: "Rezz-Blade", category: "Chaos", cost: 4 },
      { cycle: 2, owner: 1, definitionId: "kilo-coin", name: "Kilo-Coin", category: "Crypto", cost: 6 },
      { cycle: 9, owner: 1, definitionId: "h3x1-d3x1", name: "H3x1-D3x1", category: "Chaos", cost: 5 },
    ],
    cycles: [{ cycle: 1, vp: [4, 4], servers: [3500, 3300], wallet: [5, 4], locationsWon: [3, 2], locations: [{ id: "data_exchange", name: "Data exchange", winner: 0 }], circuit: null, deckSize: [10, 10] }],
    decks: [{ "rezz-blade": 3, "shyte-coin": 0 }, { "kilo-coin": 2, "shyte-coin": 1 }],
    aiSeats: [1], telemetry: emptyTelemetry(), decisions: [],
  });

  it("restarts read the notebook, take notes and debrief without creating a new version", async () => {
    const root = await mkdtemp(join(tmpdir(), "strategist-"));
    try {
      const first = createStrategist({ root, log: () => undefined });
      await first.ready;
      expect(first.brief().version).toBe(0);
      expect(first.brief().mode).toBe("heuristic");
      await first.observe("game-a", sampleReport(0));
      const brief = await first.debrief("game-a", sampleReport(0));
      expect(brief.record).toEqual({ games: 1, aiWins: 0, humanWins: 1, ties: 0 });
      const shyte = first.memory().theories.find(theory => theory.id === "no-shyte")!;
      expect(shyte.support).toBe(1);
      // A single game never edits the profile: it stays on the baseline until an experiment earns a change.
      expect(first.memory().profile.weights).toEqual(DEFAULT_STRATEGY.weights);
      expect(first.memory().profile.cardBias).toEqual({});
      expect(first.memory().baseline.profile.weights).toEqual(DEFAULT_STRATEGY.weights);
      expect(first.memory().experiment).toBeTruthy();
      await first.idle();

      const second = createStrategist({ root, log: () => undefined });
      await second.ready;
      expect(second.brief().version).toBe(0);
      expect(second.memory().record.games).toBe(1);
      expect(second.memory().notes.filter(note => note.text.startsWith("v1.0 online (server start). Read the notebook"))).toHaveLength(2);
      expect(second.memory().history.map(entry => entry.version)).toEqual([0]);
      const notebook = await readFile(join(root, "NOTEBOOK.md"), "utf8");
      expect(notebook).toContain("Current agent: v1.0");
      expect(notebook).toContain("no-shyte");
      expect(await readdir(join(root, "versions"))).toEqual(["v1.0.json"]);
      const [game] = await readdir(join(root, "games"));
      const saved = JSON.parse(await readFile(join(root, "games", game), "utf8"));
      expect(saved.finished).toBe(true);
      expect(saved.notes.length).toBeGreaterThan(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("notices new cards and turns model advice into a bounded experiment, never a direct profile edit", async () => {
    const root = await mkdtemp(join(tmpdir(), "strategist-"));
    const contentFile = join(root, "content.json");
    try {
      const doc = structuredClone(authored) as unknown as { document: { cards: Card[] } };
      await writeFile(contentFile, JSON.stringify(doc));
      const first = createStrategist({ root, contentFile, log: () => undefined });
      await first.ready; await first.idle();
      // Only one experiment runs at a time; clear the heuristic one so the model may propose.
      const saved = JSON.parse(await readFile(join(root, "memory.json"), "utf8"));
      await writeFile(join(root, "memory.json"), JSON.stringify({ ...saved, experiment: null }));
      doc.document.cards.push({ ...byId("slash-dot"), id: "mega-slash", definitionId: undefined, name: "Mega Slash" } as Card);
      await writeFile(contentFile, JSON.stringify(doc));
      const fetchImpl = (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        plan: "Rush Mega Slash, then Drain.",
        notes: ["Mega Slash looks like a stronger Slash-Dot."],
        theories: [{ id: "mega-slash-engine", text: "Mega Slash is the best draw engine.", status: "supported", confidence: 0.9 }, { id: "no-shyte", status: "refuted", confidence: 0 }],
        experiment: { theoryId: "mega-slash-engine", observation: "Mega Slash appeared in the catalog as a stronger Slash-Dot.", hypothesis: "Mega Slash out-draws Slash-Dot.", prediction: "More wins and a better margin than the current best.", change: { chaosFromCycle: 12, minCryptoValue: 1, weights: { draw: 50 }, cardBias: { "mega-slash": 6 } } },
        cardNotes: { "mega-slash": "Draw engine; test it early." },
      }) } }] }), { status: 200 })) as typeof fetch;
      const agent = createStrategist({ root, contentFile, apiKey: "test", fetchImpl, log: () => undefined });
      await agent.ready;
      await agent.idle();
      const memory = agent.memory();
      expect(memory.mode).toBe("llm");
      expect(memory.plan).toBe(`Rush Mega Slash, then Drain. (Schedule: economy through Cycle ${DEFAULT_STRATEGY.economyUntilCycle}, Chaos from Cycle ${DEFAULT_STRATEGY.chaosFromCycle}, VP from Cycle ${DEFAULT_STRATEGY.vpFromCycle}.)`);
      expect(memory.notes.some(note => note.text.includes("New cards since last version: Mega Slash"))).toBe(true);
      expect(memory.cardNotes["mega-slash"]).toBe("Draw engine; test it early.");
      // The profile in play is untouched; the advice became an experiment.
      expect(memory.profile).toEqual({ ...DEFAULT_STRATEGY, version: memory.version, plan: memory.plan });
      const experiment = memory.experiment!;
      expect(experiment.source).toBe("model");
      expect(experiment.theoryId).toBe("mega-slash-engine");
      // Steps are bounded: two Cycles for timing, ~30% for weights, one point for card bias; the Crypto floor is not tunable.
      expect(experiment.change.chaosFromCycle).toBe(DEFAULT_STRATEGY.chaosFromCycle + 2);
      expect(experiment.change.weights!.draw).toBeLessThan(2.2);
      expect(experiment.change.cardBias!["mega-slash"]).toBe(1);
      expect(experiment.change).not.toHaveProperty("minCryptoValue");
      // Without a self-play lab it goes straight to alternating games against the human.
      expect(experiment.stage).toBe("field");
      expect(agent.brief().experiment).toEqual({ id: experiment.id, hypothesis: experiment.hypothesis });
      expect(agent.brief().profile.chaosFromCycle).toBe(DEFAULT_STRATEGY.chaosFromCycle + 2);
      // Theories are scored by evidence only: the model cannot mark them supported or refuted.
      const theory = memory.theories.find(item => item.id === "mega-slash-engine")!;
      expect([theory.status, theory.confidence, theory.support]).toEqual(["proposed", 0.5, 0]);
      expect(memory.theories.find(item => item.id === "no-shyte")!.status).toBe("proposed");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  const scratch = async () => {
    const root = await mkdtemp(join(tmpdir(), "strategist-"));
    return { root, contentFile: join(root, "content.json"), done: () => rm(root, { recursive: true, force: true }) };
  };

  it("ignores sessions that are not complete games", async () => {
    const { root, done } = await scratch();
    try {
      const agent = createStrategist({ root, log: () => undefined });
      await agent.ready; await agent.idle();
      const before = structuredClone(agent.memory());
      const shortcut: MatchReport = { ...sampleReport(1), cycle: 1, endedReason: "Session ended early for evaluation. Tie, 3 to 3 VP.", winner: null, purchases: [] };
      await agent.debrief("lookdev", shortcut);
      await agent.debrief("afk", { ...sampleReport(1), cycle: 1, endedReason: "Automatic concession after two consecutive no-input Runtime turns." });
      const after = agent.memory();
      expect(after.record).toEqual(before.record);
      expect(after.ignored.count).toBe(2);
      expect(after.profile).toEqual(before.profile);
      expect(after.theories.map(theory => [theory.id, theory.support, theory.against])).toEqual(before.theories.map(theory => [theory.id, theory.support, theory.against]));
      expect(after.experiment!.field).toEqual(before.experiment!.field);
      const files = await readdir(join(root, "games"));
      expect(JSON.parse(await readFile(join(root, "games", files[0]), "utf8")).ignored).toMatch(/ended at Cycle 1/);
    } finally { await done(); }
  });

  it("alternates field games between the experiment and the current best, then adopts a winner", async () => {
    const { root, done } = await scratch();
    try {
      const agent = createStrategist({ root, log: () => undefined });
      await agent.ready; await agent.idle();
      const experiment = agent.memory().experiment!;
      expect(experiment.stage).toBe("field");
      for (let game = 0; game < 16; game++) {
        const brief = agent.brief();
        const testing = game % 2 === 0;
        expect(brief.experiment?.id ?? null).toBe(testing ? experiment.id : null);
        await agent.debrief(`g${game}`, { ...sampleReport(testing ? 1 : 0), strategyExperiment: brief.experiment?.id ?? null });
      }
      await agent.idle();
      const memory = agent.memory();
      const concluded = memory.experiments.find(item => item.id === experiment.id)!;
      expect(concluded.stage).toBe("adopted");
      expect(concluded.field.experiment).toMatchObject({ games: 8, wins: 8 });
      expect(concluded.field.control).toMatchObject({ games: 8, losses: 8 });
      expect(memory.adopted).toEqual(expect.objectContaining(experiment.change));
      expect(memory.profile).toMatchObject(experiment.change);
      expect(memory.baseline.profile.weights).toEqual(DEFAULT_STRATEGY.weights);
      expect(memory.experiment?.id).not.toBe(experiment.id);
      expect(memory.version).toBe(1);
      expect(memory.history.map(entry => entry.version)).toEqual([0, 1]);
      expect(await readFile(join(root, "NOTEBOOK.md"), "utf8")).toContain(`**${experiment.id}** (v1.1)`);
    } finally { await done(); }
  });

  it("screens experiments in seeded self-play where each seat plays its own profile", async () => {
    const { root, contentFile, done } = await scratch();
    try {
      await writeFile(contentFile, JSON.stringify(authored));
      const agent = createStrategist({ root, contentFile, log: () => undefined, labSeeds: 2, loadSelfPlay: async () => await import("@0uroboros/engine/ai/selfPlay") as never });
      await agent.ready; await agent.idle();
      const memory = agent.memory();
      const screened = [...memory.experiments, ...(memory.experiment ? [memory.experiment] : [])].filter(item => item.lab);
      expect(screened.length).toBeGreaterThan(0);
      for (const item of screened) {
        expect(item.lab!.games).toBe(4);
        expect(item.lab!.seeds).toHaveLength(2);
        expect(["promising", "rejected", "inconclusive"]).toContain(item.lab!.verdict);
      }
      expect(memory.profile.weights).toEqual(DEFAULT_STRATEGY.weights);
    } finally { await done(); }
  }, 60_000);

  it("repairs memory written before the protected baseline from complete games only", async () => {
    const { root, done } = await scratch();
    try {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(root, "games"), { recursive: true });
      const drifted = { ...DEFAULT_STRATEGY, weights: { ...DEFAULT_STRATEGY.weights, drain: 0 }, cardBias: { "slash-dot": 4 } };
      await writeFile(join(root, "memory.json"), JSON.stringify({
        schema: 1, version: 6, mode: "llm", profile: drifted, plan: "drifted",
        theories: [{ id: "vibes", text: "Vibes win games.", status: "supported", confidence: 0.9, support: 0, against: 0, createdBy: 3, updatedBy: 3 }, { id: "vibes-2", text: "Vibes win games!", status: "supported", confidence: 0.9, support: 0, against: 0, createdBy: 4, updatedBy: 4 }],
        notes: [{ version: 2, at: "2026-10-04T20:00:00.000Z", text: "real note" }, { version: 5, at: "2026-10-04T22:00:00.000Z", text: "note drawn from a shortcut" }],
        cardNotes: {}, knownCards: [], knownLocations: [], cardStats: {}, locationStats: {}, record: { games: 9, aiWins: 3, humanWins: 1, ties: 5 }, history: [],
      }));
      await writeFile(join(root, "games", "a.json"), JSON.stringify({ version: 2, startedAt: "2026-10-04T19:00:00.000Z", finished: true, report: sampleReport(0) }));
      await writeFile(join(root, "games", "b.json"), JSON.stringify({ version: 5, startedAt: "2026-10-04T21:00:00.000Z", finished: true, report: { ...sampleReport(1), cycle: 1, endedReason: "Session ended early for evaluation. Tie, 3 to 3 VP." } }));
      const agent = createStrategist({ root, log: () => undefined });
      await agent.ready; await agent.idle();
      const memory = agent.memory();
      expect(memory.version).toBe(7);
      expect(memory.profile.weights.drain).toBe(DEFAULT_STRATEGY.weights.drain);
      expect(memory.profile.cardBias).toEqual({});
      expect(memory.record).toEqual({ games: 1, aiWins: 0, humanWins: 1, ties: 0 });
      expect(memory.ignored.count).toBe(1);
      expect(memory.theories.filter(theory => theory.id.startsWith("vibes"))).toEqual([expect.objectContaining({ id: "vibes", status: "proposed", confidence: 0.5, support: 0, against: 0 })]);
      expect(memory.notes.some(note => note.text === "real note")).toBe(true);
      expect(memory.notes.some(note => note.text === "note drawn from a shortcut")).toBe(false);
      const archive = await readdir(join(root, "archive"));
      expect(archive.some(file => file.startsWith("memory-v0006-before-baseline"))).toBe(true);
    } finally { await done(); }
  });
});

describe("per-seat self-play profiles", () => {
  it("lets each AI seat play its own strategy profile", () => {
    const content = compileContent(structuredClone((authored as unknown as { document: ContentDocument }).document));
    const vpHeavy = { ...DEFAULT_STRATEGY, vpFromCycle: 4, weights: { ...DEFAULT_STRATEGY.weights, vp: 5 } };
    const vpBuys = (report: MatchReport, owner: 0 | 1) => report.purchases.filter(item => item.owner === owner && item.category === "VP" && item.cycle < 10).length;
    const mirror = playSelfPlayGame({ content, seed: 11, strategy: DEFAULT_STRATEGY, recordDecisions: false });
    const split = playSelfPlayGame({ content, seed: 11, strategy: DEFAULT_STRATEGY, seatStrategies: [DEFAULT_STRATEGY, vpHeavy], recordDecisions: false });
    expect(mirror.valid && split.valid).toBe(true);
    expect(vpBuys(split.report!, 1)).toBeGreaterThan(vpBuys(mirror.report!, 1));
  }, 30_000);
});

describe("strategy over effect steps", () => {
  const you = { type: "player", who: "self" } as const, them = { type: "player", who: "opponent" } as const;

  it("values a card at its live Power, including persisted changes", () => {
    const base = { ...byId("slash-dot"), onReveal: [], power: 3 };
    expect(handValue({ ...base, powerDelta: 2 }, DEFAULT_STRATEGY, context(4))).toBeGreaterThan(handValue(base, DEFAULT_STRATEGY, context(4)));
    expect(handValue({ ...base, powerDelta: -2 }, DEFAULT_STRATEGY, context(4))).toBeLessThan(handValue(base, DEFAULT_STRATEGY, context(4)));
  });

  it("sums steps by action and side, reading legacy effects through migration", () => {
    const effects = [{ action: "draw", amount: 2, target: you }, { action: "draw", amount: 1, target: them }, { kind: "draw", amount: 3 }] as never;
    expect(effectTotal(effects, "draw")).toBe(5);
    expect(effectTotal(effects, "draw", true)).toBe(1);
  });

  it("ranks options by what they give the controller, net of their cost", () => {
    const gain = optionValue([{ action: "gainCrypto", amount: 3, target: you }], DEFAULT_STRATEGY);
    const paid = optionValue([{ action: "payCrypto", amount: 2, target: you }, { action: "gainCrypto", amount: 3, target: you }], DEFAULT_STRATEGY);
    const drain = optionValue([{ action: "damageServer", amount: 200, target: { type: "server", who: "opponent", server: "auto" } }], DEFAULT_STRATEGY);
    const selfDrain = optionValue([{ action: "damageServer", amount: 200, target: { type: "server", who: "self", server: "auto" } }], DEFAULT_STRATEGY);
    expect(gain).toBeGreaterThan(paid);
    expect(paid).toBeGreaterThan(0);
    expect(drain).toBeGreaterThan(0);
    expect(selfDrain).toBeLessThan(0);
  });
});
