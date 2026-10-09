import { sanitizeProfile, type StrategyProfile } from '@0uroboros/engine/ai/strategy';
import type { MatchReport } from '@0uroboros/engine/runtime';

/** `disabled` means the agent is switched off in Settings > Agents and the opponent plays the default profile. */
/** `experiment` is set when `profile` is the arm of an experiment rather than the agent's current best. */
export type StrategistBrief = { version: number; mode: 'llm' | 'heuristic'; plan: string; profile: StrategyProfile; theories: string[]; disabled?: boolean; recordDecisions?: boolean; experiment?: { id: string; hypothesis: string } | null };

/** The agents the human can play; `key` is the agent's field in the agents status. */
export const OPPONENTS = [
  { id: 'strat-g', name: 'Strat-G', style: 'Balanced', key: 'stratG' },
  { id: 't-5', name: 'T-5', style: 'Pure aggression', key: 't5' },
  { id: 'dv-8', name: 'DV-8', style: 'Engine', key: 'dv8' },
  { id: 'vp-dog', name: 'VP-Dog', style: 'Pure economy', key: 'vpDog' },
] as const;
export type OpponentId = (typeof OPPONENTS)[number]['id'];
export const DEFAULT_OPPONENT: OpponentId = 'strat-g';
export const isOpponent = (value: unknown): value is OpponentId => OPPONENTS.some(opponent => opponent.id === value);
export const opponentName = (id: OpponentId) => OPPONENTS.find(opponent => opponent.id === id)?.name ?? id;

const route = (path: string, agent: OpponentId) => `${path}?agent=${agent}`;

/** The agent's current plan, or null when no dev server is running it (static builds, tests). */
export async function loadStrategist(agent: OpponentId = DEFAULT_OPPONENT): Promise<StrategistBrief | null> {
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

/** In-game notes after each Draft; failures never interrupt play. */
export function reportCycle(gameId: string, report: MatchReport, agent: OpponentId = DEFAULT_OPPONENT): void {
  post('/api/ai/observe', agent, gameId, report).catch(() => undefined);
}

/** Final report; the agent debriefs and returns the plan the next game will use. */
export async function reportGame(gameId: string, report: MatchReport, agent: OpponentId = DEFAULT_OPPONENT): Promise<StrategistBrief | null> {
  try {
    const response = await post('/api/ai/game', agent, gameId, report);
    return response.ok ? await response.json() as StrategistBrief : null;
  } catch { return null; }
}
