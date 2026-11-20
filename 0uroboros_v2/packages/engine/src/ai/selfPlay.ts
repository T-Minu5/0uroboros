/**
 * Headless AI-vs-AI sessions for evaluation. Both seats are driven by the runtime's own AI
 * (`aiSeats: [0, 1]`). Cards and costs are untouched; the optional `SelfPlayRules` set the Configure options.
 */
import { compileContent, type CompiledContent, type ContentDocument } from "../authoring/contentModel";
import { defaultMostCircuitsBonusVP, defaultNodeWinVP, defaultServerVP, type Servers } from "../game";
import { createSession, DEFAULT_END_GAME_AWARDS, END_GAME_AWARD_LABELS, seededRandom, type EndGameAwardId, type EndGameAwards, type MatchReport, type RuntimeSession } from "../runtime";
import type { StrategyProfile } from "./strategy";

/** The Configure options that change the game itself (no timers, no opponent); shared by every AI self-play run. */
export type SelfPlayRules = {
  serverVP: Servers;
  noLocations: boolean;
  middleNodesOnly: boolean;
  noCircuitRewards: boolean;
  noTrailingRewards: boolean;
  mostCircuitsBonusVP: number;
  nodeWinVP: number;
  endGameAwards: EndGameAwards;
};

const RULE_VP_MAX = 50;
const clampInt = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(RULE_VP_MAX, Math.max(0, Math.round(value))) : fallback;

/** Circuit and Trailing rewards default off, matching the Configure defaults. */
export const DEFAULT_SELF_PLAY_RULES: SelfPlayRules = {
  serverVP: { ...defaultServerVP }, noLocations: false, middleNodesOnly: false, noCircuitRewards: true, noTrailingRewards: true,
  mostCircuitsBonusVP: defaultMostCircuitsBonusVP, nodeWinVP: defaultNodeWinVP, endGameAwards: structuredClone(DEFAULT_END_GAME_AWARDS),
};

export function sanitizeSelfPlayRules(raw: unknown): SelfPlayRules {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof SelfPlayRules, unknown>>;
  const servers = (value.serverVP && typeof value.serverVP === "object" ? value.serverVP : {}) as Partial<Servers>;
  const awardsIn = (value.endGameAwards && typeof value.endGameAwards === "object" ? value.endGameAwards : {}) as Partial<Record<EndGameAwardId, { enabled?: unknown; vp?: unknown }>>;
  const endGameAwards = structuredClone(DEFAULT_END_GAME_AWARDS);
  for (const id of Object.keys(endGameAwards) as EndGameAwardId[]) {
    const next = awardsIn[id];
    if (!next || typeof next !== "object") continue;
    endGameAwards[id] = { enabled: typeof next.enabled === "boolean" ? next.enabled : endGameAwards[id].enabled, vp: clampInt(next.vp, endGameAwards[id].vp) };
  }
  const flag = (key: keyof SelfPlayRules) => typeof value[key] === "boolean" ? value[key] as boolean : DEFAULT_SELF_PLAY_RULES[key] as boolean;
  const noCircuitRewards = flag("noCircuitRewards");
  return {
    serverVP: { primary: clampInt(servers.primary, defaultServerVP.primary), backup: clampInt(servers.backup, defaultServerVP.backup) },
    noLocations: flag("noLocations"), middleNodesOnly: flag("middleNodesOnly"),
    // Trailing rewards are a subset of Circuit rewards, so they cannot be on while Circuits are off.
    noCircuitRewards, noTrailingRewards: noCircuitRewards || flag("noTrailingRewards"),
    mostCircuitsBonusVP: clampInt(value.mostCircuitsBonusVP, defaultMostCircuitsBonusVP), nodeWinVP: clampInt(value.nodeWinVP, defaultNodeWinVP),
    endGameAwards,
  };
}

/** Flat, labelled view of a ruleset; the basis for hashes and diffs. */
export function flattenSelfPlayRules(rules: SelfPlayRules): { key: string; label: string; value: number | boolean }[] {
  return [
    { key: "serverVP.primary", label: "Primary Server VP", value: rules.serverVP.primary },
    { key: "serverVP.backup", label: "Backup Server VP", value: rules.serverVP.backup },
    { key: "locations", label: "Locations", value: !rules.noLocations },
    { key: "middleNodesOnly", label: "Middle Nodes only", value: rules.middleNodesOnly },
    { key: "circuitRewards", label: "Circuit rewards", value: !rules.noCircuitRewards },
    { key: "trailingRewards", label: "Trailing rewards", value: !rules.noTrailingRewards },
    { key: "mostCircuitsBonusVP", label: "Most Circuits bonus VP", value: rules.mostCircuitsBonusVP },
    { key: "nodeWinVP", label: "Node win VP", value: rules.nodeWinVP },
    ...(Object.keys(rules.endGameAwards) as EndGameAwardId[]).flatMap(id => [
      { key: `award.${id}.enabled`, label: `${END_GAME_AWARD_LABELS[id]} award`, value: rules.endGameAwards[id].enabled },
      { key: `award.${id}.vp`, label: `${END_GAME_AWARD_LABELS[id]} VP`, value: rules.endGameAwards[id].vp },
    ]),
  ];
}

export type RuleChange = { key: string; label: string; from: number | boolean; to: number | boolean };
export function diffSelfPlayRules(before: SelfPlayRules, after: SelfPlayRules): RuleChange[] {
  const old = new Map(flattenSelfPlayRules(before).map(entry => [entry.key, entry.value]));
  return flattenSelfPlayRules(after).filter(entry => old.get(entry.key) !== entry.value).map(entry => ({ key: entry.key, label: entry.label, from: old.get(entry.key)!, to: entry.value }));
}

/** Short stable FNV-1a hash of the ruleset. */
export function selfPlayRulesHash(rules: SelfPlayRules): string {
  const text = flattenSelfPlayRules(rules).map(entry => `${entry.key}=${entry.value}`).join(";");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, "0");
}

export type SelfPlayResult = {
  seed: number; valid: boolean;
  /** Why the game does not count; absent for valid games. */
  invalidReason?: string;
  report: MatchReport | null; durationMs: number;
};

/** Only these endings are complete games; concessions and evaluation shortcuts are not. */
const COMPLETE_ENDING = /^(Cycle 16 final Draft complete\.|Both Servers destroyed)/;

export function compileForSelfPlay(document: ContentDocument): CompiledContent {
  return compileContent(structuredClone(document));
}

/**
 * `seatStrategies` gives each seat its own profile (Strat-G's experiments); otherwise both play `strategy`.
 * `rules` applies the league ruleset; without it the engine defaults apply.
 */
export function playSelfPlayGame(options: { content: CompiledContent; seed: number; strategy: StrategyProfile; seatStrategies?: [StrategyProfile, StrategyProfile]; recordDecisions?: boolean; rules?: SelfPlayRules }): SelfPlayResult {
  const started = Date.now();
  let session: RuntimeSession | null = null;
  try {
    const rules = options.rules ? sanitizeSelfPlayRules(options.rules) : null;
    session = createSession({
      ...(rules ? { ...rules, serverVP: { ...rules.serverVP }, endGameAwards: structuredClone(rules.endGameAwards) } : {}),
      carryover: true, priorityPreference: "higher", random: seededRandom(options.seed),
      strategicMarket: true, evaluationContent: true, content: options.content,
      strategy: structuredClone(options.strategy), aiSeats: [0, 1], recordDecisions: options.recordDecisions ?? true,
      ...(options.seatStrategies ? { seatStrategies: { 0: structuredClone(options.seatStrategies[0]), 1: structuredClone(options.seatStrategies[1]) } } : {}),
    });
    runToEnd(session);
    const report = session.matchReport();
    const reason = session.state.endedReason ?? "";
    const valid = report.phase === "gameover" && COMPLETE_ENDING.test(reason);
    return { seed: options.seed, valid, ...(valid ? {} : { invalidReason: report.phase !== "gameover" ? `stopped in ${report.phase} at Cycle ${report.cycle}` : `ended by: ${reason}` }), report, durationMs: Date.now() - started };
  } catch (error) {
    return { seed: options.seed, valid: false, invalidReason: `crashed: ${error instanceof Error ? error.message : String(error)}`, report: safeReport(session), durationMs: Date.now() - started };
  }
}

function safeReport(session: RuntimeSession | null): MatchReport | null {
  try { return session?.matchReport() ?? null; } catch { return null; }
}

/**
 * Drives a session with the same calls a human client makes. Draft time is synthetic and
 * restarted each Draft so the 90-second deadline never decides a headless game.
 */
function runToEnd(session: RuntimeSession) {
  const resolve = () => {
    for (let guard = 0; session.pendingCount || session.state.choice; guard++) {
      if (guard > 20_000) throw new Error("Resolution stalled.");
      if (session.state.choice) throw new Error(`Unexpected open choice for seat ${session.state.choice.owner}.`);
      session.step();
    }
  };
  // Read through a function: the phase changes inside session calls, out of the type checker's sight.
  const phase = (): string => session.state.phase;
  for (let cycle = 0; cycle < 17 && phase() !== "gameover"; cycle++) {
    resolve();
    for (let turn = 1; turn <= 3 && phase() === "runtime"; turn++) { session.endTurn(); resolve(); }
    if (phase() === "gameover") return;
    if (phase() !== "draft") throw new Error(`Cycle ${session.state.cycle} did not reach Draft (phase ${phase()}).`);
    resolve();
    let time = Date.now();
    for (let beat = 0; beat < 60 && !session.state.draftEnded; beat++) {
      time += 1500;
      session.opponentDraftStep(time, 0); resolve();
      session.opponentDraftStep(time, 1); resolve();
    }
    if (!session.state.draftEnded) throw new Error(`Draft did not finish in Cycle ${session.state.cycle}.`);
    session.nextCycle();
  }
  if (phase() !== "gameover") throw new Error("Session did not finish within 16 Cycles.");
}
