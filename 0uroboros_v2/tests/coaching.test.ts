import { describe, expect, it } from "vitest";
import authored from "../content/authored-content.json";
import { compileForSelfPlay } from "@0uroboros/engine/ai/selfPlay";
import { DEFAULT_STRATEGY, draftScore, locationRead, locationStakes, sanitizeProfile, strategyPhase, type StrategyContext, type StrategyProfile } from "@0uroboros/engine/ai/strategy";
import { systemFacts } from "@0uroboros/engine/ai/systemFacts";
import type { ContentDocument } from "@0uroboros/engine/authoring/contentModel";
import { baselineOf } from "../server/aiStrategist";
import { coach, coachingTips, combineTips, mirrorProfile, withoutCoaching } from "../server/agents/coaching";
import { clampToEnvelope, DV_8, STRAT_G, STRAT_G_PHASES, T_5, VP_DOG } from "../server/agents/roster";

const document = (authored as unknown as { document: ContentDocument }).document;
const content = compileForSelfPlay(document);
const location = (name: string) => {
  const found = content.locations.find(entry => entry.name.trim().toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`missing Location ${name}`);
  return found;
};
const context = (cycle: number): StrategyContext => ({ cycle, finalCycle: 16, owned: content.startingDeck, ownServers: 3500, ownServersMax: 3500, enemyServers: 3500, enemyServersMax: 3500 });
const designed = (identity: typeof STRAT_G) => clampToEnvelope({ ...identity.baseline, cardBias: {} }, identity.envelope);

describe("Location valuation", () => {
  it("prices from the winner's seat: loser-paying Locations are negative, draw/Drain/VP ones positive, symmetric ones even", () => {
    for (const name of ["Login the Calvary", "Loser's Luck", "Code Cull"]) expect(locationStakes(location(name), DEFAULT_STRATEGY, context(8)).stake).toBeLessThan(0);
    for (const name of ["Signal tower", "Data Breach", "Sludge core", "Wind fall"]) expect(locationStakes(location(name), DEFAULT_STRATEGY, context(8)).stake).toBeGreaterThan(0);
    for (const name of ["Trash compactor", "Sacrificial LLM", "No Man's Land"]) expect(Math.abs(locationStakes(location(name), DEFAULT_STRATEGY, context(8)).stake)).toBeLessThan(0.5);
  });

  it("stakes are the mirror image for the two players", () => {
    for (const entry of content.locations) {
      const read = locationStakes(entry, DEFAULT_STRATEGY, context(8));
      expect(read.lose).toBeCloseTo(-read.win, 6);
    }
  });

  it("ongoing effects lose value as the Cycle's turns pass", () => {
    const ongoing = content.locations.find(entry => entry.ongoing?.length && !entry.effects?.length && Math.abs(locationStakes(entry, DEFAULT_STRATEGY, context(8), 1).stake) > 0.1);
    if (!ongoing) return;
    expect(Math.abs(locationStakes(ongoing, DEFAULT_STRATEGY, context(8), 3).stake)).toBeLessThan(Math.abs(locationStakes(ongoing, DEFAULT_STRATEGY, context(8), 1).stake));
  });

  it("reads give agents and Eco-Strat a plain verdict per Location", () => {
    expect(locationRead(location("Loser's Luck"))).toMatch(/concede/);
    expect(locationRead(location("Signal tower"))).toMatch(/^contest it/);
    const facts = systemFacts(document);
    expect(facts.rules.locations).toMatch(/winner/);
    expect(facts.locations.every(entry => entry.read.length > 0)).toBe(true);
  });
});

describe("Strat-G three phases", () => {
  const profile = designed(STRAT_G);

  it("locks the phase timing to economy 1-4, midgame 5-8, endgame 9+", () => {
    expect([1, 4, 5, 8, 9, 16].map(cycle => strategyPhase(profile, cycle))).toEqual(["economy", "economy", "build", "build", "endgame", "endgame"]);
    expect(profile.midgameMix).toBe(STRAT_G_PHASES.midgameMix);
    const moved = clampToEnvelope({ ...profile, economyUntilCycle: 6, chaosFromCycle: 7, vpFromCycle: 10 }, STRAT_G.envelope);
    expect([moved.economyUntilCycle, moved.chaosFromCycle, moved.vpFromCycle]).toEqual([4, 9, 9]);
    const tipped = baselineOf(STRAT_G, { change: { economyUntilCycle: 6, chaosFromCycle: 7 }, lines: ["tip"] }).profile;
    expect([tipped.economyUntilCycle, tipped.chaosFromCycle]).toEqual([4, 9]);
  });

  it("the midgame mix values VP and attacks more than a plain build phase, and the endgame most", () => {
    const vpCard = content.vpCards[0];
    const plain: StrategyProfile = { ...profile, midgameMix: undefined };
    expect(draftScore(vpCard, profile, context(6))).toBeGreaterThan(draftScore(vpCard, plain, context(6)));
    expect(draftScore(vpCard, profile, context(12))).toBeGreaterThan(draftScore(vpCard, profile, context(6)));
    expect(sanitizeProfile({ ...profile, midgameMix: 4 }).midgameMix).toBe(1);
    expect(sanitizeProfile(DEFAULT_STRATEGY).midgameMix).toBeUndefined();
  });
});

describe("coaching mirror", () => {
  const start = designed(STRAT_G);
  const competitors = [T_5, DV_8, VP_DOG].map(identity => ({ id: identity.id, name: identity.name, version: "v1.0", profile: designed(identity) }));

  it("moves a quarter of the way toward the competitors' average and never mirrors timing", () => {
    const { profile, change } = mirrorProfile(start, competitors.map(entry => entry.profile), 0.25, STRAT_G.envelope);
    const average = (pick: (value: StrategyProfile) => number) => competitors.reduce((sum, entry) => sum + pick(entry.profile), 0) / competitors.length;
    expect(profile.minBuyScore).toBeCloseTo(start.minBuyScore + 0.25 * (average(value => value.minBuyScore) - start.minBuyScore), 1);
    expect(profile.weights.chaos).toBeCloseTo(start.weights.chaos + 0.25 * (average(value => value.weights.chaos) - start.weights.chaos), 1);
    expect([profile.economyUntilCycle, profile.chaosFromCycle, profile.vpFromCycle, profile.midgameMix]).toEqual([4, 9, 9, 0.5]);
    expect(change.economyUntilCycle).toBeUndefined();
    expect(profile.handCryptoTarget).toBeGreaterThanOrEqual(7);
    expect(profile.handCryptoTarget).toBeLessThanOrEqual(12);
  });

  it("re-applying starts from the uncoached profile, so the share never compounds", () => {
    const first = coach(start, competitors, STRAT_G.envelope, 0.25, "2026-10-07T00:00:00Z");
    const coached = baselineOf(STRAT_G, coachingTips(first)).profile;
    const second = coach(withoutCoaching(coached, first), competitors, STRAT_G.envelope, 0.25, "2026-10-07T01:00:00Z");
    expect(second.change).toEqual(first.change);
    expect(first.lines[0]).toMatch(/25% closer/);
  });

  it("combines mentor tips and coaching, coaching winning shared fields", () => {
    const combined = combineTips({ change: { minBuyScore: 1, weights: { draw: 3 } }, lines: ["tip"] }, { change: { minBuyScore: 1.5, weights: { vp: 2.5 } }, lines: ["coach"] }, null);
    expect(combined).toEqual({ change: { minBuyScore: 1.5, weights: { draw: 3, vp: 2.5 }, cardBias: {} }, lines: ["tip", "coach"] });
    expect(combineTips(null, null)).toBeNull();
  });
});
