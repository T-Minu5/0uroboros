import { sanitizeProfile, type StrategyProfile } from '@0uroboros/engine/ai/strategy';
import { pickOpponent, type AuthoredOpponent } from '@0uroboros/engine/ai/opponents';
import type { MatchReport } from '@0uroboros/engine/runtime';
import { STUDIO_TOOLS } from '../studioTools';

/**
 * Opponents come from the content pack (`CompiledContent.opponents`), so a shipped client plays exactly the profiles
 * that were published. In the studio build the local agents can override a pack profile with the agent's current
 * plan or an experiment, and they take notes on the game; none of that exists in a client build.
 */

/** `disabled` means the agent is switched off in the Agents page and the opponent plays its published pack profile. */
/** `experiment` is set when `profile` is the arm of an experiment rather than the agent's current best. */
export type StrategistBrief = { version: number; mode: 'llm' | 'heuristic'; plan: string; profile: StrategyProfile; theories: string[]; disabled?: boolean; recordDecisions?: boolean; experiment?: { id: string; hypothesis: string } | null };

export type OpponentId = string;
/** The pack's first opponent is the default; a saved choice that the pack no longer offers falls back to it. */
export const resolveOpponent = (opponents: readonly AuthoredOpponent[], id: string | null | undefined): AuthoredOpponent | null => pickOpponent(opponents, id);
export const opponentName = (opponents: readonly AuthoredOpponent[], id: OpponentId) => resolveOpponent(opponents, id)?.name ?? id;

/** The agents status field that carries each league agent's on/off switch (studio build only). */
export const AGENT_FLAG_KEYS: Record<string, string> = { 'strat-g': 'stratG', 't-5': 't5', 'dv-8': 'dv8', 'vp-dog': 'vpDog' };

const route = (path: string, agent: OpponentId) => `${path}?agent=${encodeURIComponent(agent)}`;

/** The local agent's current plan for this opponent; null in client builds, or when no dev server is running it. */
export async function loadStrategist(agent: OpponentId): Promise<StrategistBrief | null> {
  if (!STUDIO_TOOLS) return null;
  try {
    const response = await fetch(route('/api/ai/strategy', agent), { cache: 'no-store' });
    if (!response.ok) return null;
    const brief = await response.json() as StrategistBrief;
    return { ...brief, profile: sanitizeProfile(brief.profile) };
  } catch { return null; }
}

function post(path: string, agent: OpponentId, gameId: string, report: MatchReport) {
  return fetch(route(path, agent), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, report }) });
}

/** In-game notes after each Draft (studio build only); failures never interrupt play. */
export function reportCycle(gameId: string, report: MatchReport, agent: OpponentId): void {
  if (!STUDIO_TOOLS) return;
  post('/api/ai/observe', agent, gameId, report).catch(() => undefined);
}

/** Final report (studio build only); the agent debriefs and returns the plan the next game will use. */
export async function reportGame(gameId: string, report: MatchReport, agent: OpponentId): Promise<StrategistBrief | null> {
  if (!STUDIO_TOOLS) return null;
  try {
    const response = await post('/api/ai/game', agent, gameId, report);
    return response.ok ? await response.json() as StrategistBrief : null;
  } catch { return null; }
}
