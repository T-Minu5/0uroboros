import { useCallback, useEffect, useState } from 'react';
import { packHash } from '@0uroboros/content/hash';
import { DEFAULT_OPPONENTS } from '@0uroboros/engine/ai/opponents';
import type { StrategyProfile } from '@0uroboros/engine/ai/strategy';
import { upgradeDocument, validateContent, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import type { AgentDocument } from './AgentReader';

export type AgentSettings = {
  agentsEnabled: boolean;
  stratG: { enabled: boolean; recordDecisions: boolean };
  t5: { enabled: boolean };
  dv8: { enabled: boolean };
  vpDog: { enabled: boolean };
  league: { rounds: number; seedsPerBlock: number; ecoObserves: boolean };
  ecoStrat: { enabled: boolean; observeHumanGames: boolean; continuous: boolean; reportEvery: number; baselineGames: number };
};
/** Strat-G, T-5, DV-8 and VP-Dog share one learning loop and report the same status. */
export type LearnerStatus = {
  state: string; version: number; mode: string | null; record: { games: number; aiWins: number; humanWins: number; ties: number }; modelConfigured: boolean; model: string; activeTheories: number; error: string | null; paths: { notebook: string };
  experiment?: { id: string; hypothesis: string; change: string; stage: string; lab: string | null; field: string } | null; adoptedChanges?: number; experimentsConcluded?: number; ignoredGames?: number;
  agent?: { id: string; name: string; style: string | null }; snapshot?: string | null;
};
export type HeadToHead = { a: string; b: string; aWins: number; bWins: number; ties: number };
export type LeagueStatus = {
  running: boolean; stopping: boolean; phase: 'rating' | 'trial' | null; round: number; rounds: number; learner: string | null;
  games: number; total: number; startedAt: string | null; error: string | null;
  table: { agent: string; label: string | null; elo: number | null; games: number; wins: number; losses: number; ties: number }[];
  headToHead: HeadToHead[];
  lastRun: { startedAt: string; finishedAt: string; rounds: number; games: number; stopped: boolean; trials: { agent: string; experimentId: string; result: string }[] } | null;
  window: number; latestRatio: number; blocksPerTrial: number; ratedSnapshots: number;
  /** Agents this far below the leader take a second trial each round. */
  catchUpGap: number; catchUp: string[];
};
export type ProfileChange = {
  economyUntilCycle?: number; chaosFromCycle?: number; vpFromCycle?: number; handCryptoTarget?: number; minBuyScore?: number; dilution?: number;
  weights?: Record<string, number>; cardBias?: Record<string, number>;
};
export type MentorTip = { rank: number; text: string; change: ProfileChange };
export type AppliedTip = { from: string; fromName: string; rank: number; text: string; change: ProfileChange; limited: boolean };
export type MentoringStatus = {
  running: boolean; error: string | null; file: string;
  store: { askedAt: string; mentors: Record<string, { name: string; label: string | null; mode: string; tips: MentorTip[] }>; recipients: Record<string, { tips: AppliedTip[]; change: ProfileChange }> } | null;
};
export type CoachingStatus = {
  running: boolean; error: string | null; file: string;
  phases: { economyUntilCycle: number; midgameMix: number; endgameFromCycle: number };
  store: { appliedAt: string; share: number; competitors: { id: string; name: string; version: string }[]; change: ProfileChange; lines: string[] } | null;
};
export type AgentsStatus = {
  settings: AgentSettings; effective: { stratG: boolean; t5: boolean; dv8: boolean; vpDog: boolean; ecoStrat: boolean }; settingsFile: string;
  stratG: LearnerStatus;
  t5: LearnerStatus;
  dv8: LearnerStatus;
  vpDog: LearnerStatus;
  league: LeagueStatus;
  mentoring: MentoringStatus;
  coaching: CoachingStatus;
  ecoStrat: {
    state: string; modelConfigured: boolean; model: string | null; preferredModels: string[]; build: { label: string } | null;
    baseline: { status: string; valid: number; target: number; invalid: number };
    gamesObserved: { currentBuild: number; invalid: number; allBuilds: number };
    hypotheses: number; observations: number; recommendations: number; study: string | null; research: { read: number; inaccessible: number } | null;
    lastReport: { id: string; at: string; kind: string; games?: number; markdown: string } | null; nextReportIn: number | null; errors: number; lastError: string | null;
    /** A report is queued or being written. */
    reporting?: boolean; reportFailure?: { at: string; message: string } | null;
    /** League games delivered to Eco-Strat but not yet read. */
    leagueBacklog?: number; busy?: string | null;
    paths: { journal: string; reports: string };
  };
  cohort: { running: boolean; kind: 'baseline' | 'evaluation' | null; phase?: 'studying' | 'researching' | 'playing' | null; seedBase: number | null; valid: number; invalid: number; target: number; error: string | null };
};
/** What a running Eco-Strat cohort is waiting on; the first run on a new build studies and researches before any game. */
export const cohortPhaseLabel = (phase: AgentsStatus['cohort']['phase']) =>
  phase === 'studying' ? 'studying the new build first' : phase === 'researching' ? 'reading research first' : phase === 'playing' ? 'playing (Eco-Strat reads each game)' : 'starting';
export type AgentsPatch = {
  agentsEnabled?: boolean; stratG?: Partial<AgentSettings['stratG']>; t5?: Partial<AgentSettings['t5']>; dv8?: Partial<AgentSettings['dv8']>; vpDog?: Partial<AgentSettings['vpDog']>;
  league?: Partial<AgentSettings['league']>; ecoStrat?: Partial<AgentSettings['ecoStrat']>;
};
export type AgentsApi = ReturnType<typeof useAgents>;

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { error?: string; errors?: string[] };
  if (!response.ok) throw new Error(value.errors?.[0] ?? value.error ?? `Request failed (${response.status}).`);
  return value;
}

export type PublishedOpponent = { label: string; revision: number; hash: string };
/**
 * Writes the agent's current best profile into the content pack as its opponent entry, through the studio's
 * revision-checked `/api/content` save (a concurrent studio save makes this fail rather than overwrite it). Biases on
 * cards the pack has disabled are dropped. Commit and deploy the pack to ship it.
 */
export async function publishOpponent(agent: string): Promise<PublishedOpponent> {
  const best = await readJson<{ label: string; profile: StrategyProfile }>(await fetch(`/api/agents/publishable?agent=${encodeURIComponent(agent)}`, { cache: 'no-store' }));
  const stored = await readJson<{ revision: number; document: unknown }>(await fetch('/api/content', { cache: 'no-store' }));
  const document = upgradeDocument(stored.document) as ContentDocument;
  const enabled = new Set(document.cards.filter(card => card.enabled).map(card => card.definitionId ?? card.id));
  const profile = { ...best.profile, cardBias: Object.fromEntries(Object.entries(best.profile.cardBias).filter(([id]) => enabled.has(id))) };
  const opponents = document.opponents ?? [];
  const current = opponents.find(entry => entry.id === agent) ?? DEFAULT_OPPONENTS.find(entry => entry.id === agent);
  if (!current) throw new Error(`${agent} is not an opponent.`);
  const entry = { id: agent, name: current.name, style: current.style, profile };
  const next: ContentDocument = { ...document, opponents: opponents.some(item => item.id === agent) ? opponents.map(item => item.id === agent ? entry : item) : [...opponents, entry] };
  const errors = validateContent(next);
  if (errors.length) throw new Error(errors[0]);
  const saved = await readJson<{ revision: number }>(await fetch('/api/content', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: stored.revision, document: next }),
  }));
  return { label: best.label, revision: saved.revision, hash: packHash(next) };
}

/** Polls the local agents API while `active`; keys never reach the client, only "model configured" does. */
export function useAgents(active = true) {
  const [status, setStatus] = useState<AgentsStatus | null>(null);
  const [error, setError] = useState('');
  const [docs, setDocs] = useState<AgentDocument[]>([]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/agents/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 404 ? 'Agents run only with the local dev server.' : `Status unavailable (${response.status}).`);
      setStatus(await response.json() as AgentsStatus); setError('');
      const listed = await fetch('/api/agents/documents', { cache: 'no-store' });
      if (listed.ok) setDocs(await listed.json() as AgentDocument[]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Agents unavailable.'); }
  }, []);
  useEffect(() => {
    if (!active) return;
    void refresh(); const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const send = useCallback(async (path: string, method: 'PUT' | 'POST', body?: unknown) => {
    try {
      const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json() as AgentsStatus & { error?: string };
      if (!response.ok) throw new Error(value.error ?? `Request failed (${response.status}).`);
      setStatus(value); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed.'); }
  }, []);
  const update = useCallback((patch: AgentsPatch) => send('/api/agents/settings', 'PUT', patch), [send]);
  const act = useCallback((agent: 'eco-strat' | 'league' | 'mentoring' | 'coaching', action: string) => send(`/api/agents/${agent}/${action}`, 'POST'), [send]);

  return { status, error, docs, update, act };
}
