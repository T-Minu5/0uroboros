/**
 * Headless AI-vs-AI sessions for evaluation. Both seats are driven by the runtime's own AI
 * (`aiSeats: [0, 1]`) under normal rules; nothing here changes cards, costs or rewards.
 */
import { compileContent, type CompiledContent, type ContentDocument } from "../authoring/contentModel";
import { createSession, seededRandom, type MatchReport, type RuntimeSession } from "../runtime";
import type { StrategyProfile } from "./strategy";

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

/** `seatStrategies` gives each seat its own profile (Strat-G's experiments); otherwise both play `strategy`. */
export function playSelfPlayGame(options: { content: CompiledContent; seed: number; strategy: StrategyProfile; seatStrategies?: [StrategyProfile, StrategyProfile]; recordDecisions?: boolean }): SelfPlayResult {
  const started = Date.now();
  let session: RuntimeSession | null = null;
  try {
    session = createSession({
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
