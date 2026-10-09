/**
 * Pulls finished online games from the hosted game server's `/evidence` route into the evidence bus, so Eco-Strat
 * observes real human-vs-human play (`source: 'online-pvp'`) beside self-play and league games.
 *
 * The cursor (`endedAt` of the newest game seen) lives in `ai-agents/online-evidence.json`; a game is published once.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MatchReport } from '@0uroboros/engine/runtime';
import type { GameEvidence } from './evidence';

export type OnlineResult = {
  code: string; mode: 'pvp' | 'ai'; seatNames: [string, string]; aiSeats: number[]; startedAt: number; endedAt: number; cycles: number;
  result: { winner: number | null; endedReason: string | null; outcome: 'complete' | 'concession' | 'forfeit' | 'abandoned'; finalVP: [number, number] };
  signedIn: boolean[]; report: MatchReport | null;
};

export type OnlineEvidenceOptions = {
  /** Base URL of the game server, e.g. https://api.0uroboros.example */
  url: string;
  adminToken: string;
  cursorFile: string;
  publish: (evidence: GameEvidence) => void;
  /** Poll interval; the hosted server keeps results, so a long interval loses nothing. */
  everyMs?: number;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
};

type Cursor = { since: number; seen: string[] };

/** Shapes one hosted result as evidence. AI tables are skipped: the server AI is not one of the studio's agents. */
export function evidenceFromOnline(result: OnlineResult): GameEvidence | null {
  if (result.mode !== 'pvp' || !result.report) return null;
  const valid = result.result.outcome === 'complete';
  return {
    id: `online-${result.code}-${result.endedAt}`, source: 'online-pvp', recordedAt: new Date(result.endedAt).toISOString(),
    durationMs: result.endedAt - result.startedAt, valid, ...(valid ? {} : { invalidReason: `ended by ${result.result.outcome}${result.result.endedReason ? `: ${result.result.endedReason}` : ''}` }),
    report: result.report, stratG: null, seats: ['human', 'human'],
  };
}

export function createOnlineEvidence(options: OnlineEvidenceOptions) {
  const log = options.log ?? (() => undefined);
  const fetchImpl = options.fetchImpl ?? fetch;
  let timer: NodeJS.Timeout | null = null;
  let cursor: Cursor | null = null;

  async function loadCursor(): Promise<Cursor> {
    if (cursor) return cursor;
    try { cursor = JSON.parse(await readFile(options.cursorFile, 'utf8')) as Cursor; } catch { cursor = { since: 0, seen: [] }; }
    return cursor;
  }
  async function saveCursor(next: Cursor) {
    cursor = next;
    await mkdir(dirname(options.cursorFile), { recursive: true });
    await writeFile(options.cursorFile, `${JSON.stringify(next, null, 2)}\n`);
  }

  /** One pull; returns how many games were published. */
  async function pull(): Promise<number> {
    const current = await loadCursor();
    const response = await fetchImpl(`${options.url.replace(/\/$/, '')}/evidence?since=${current.since}&limit=200`, { headers: { authorization: `Bearer ${options.adminToken}` } });
    if (!response.ok) throw new Error(`evidence route answered ${response.status}`);
    const { results } = (await response.json()) as { results: OnlineResult[] };
    let published = 0, since = current.since;
    const seen = new Set(current.seen);
    for (const result of results) {
      since = Math.max(since, result.endedAt);
      const evidence = evidenceFromOnline(result);
      if (!evidence || seen.has(evidence.id)) continue;
      seen.add(evidence.id);
      options.publish(evidence);
      published++;
    }
    // Keep only ids at the cursor's edge: anything older can no longer be returned.
    await saveCursor({ since, seen: [...seen].filter(id => Number(id.split('-').pop()) >= since).slice(-500) });
    if (published) log(`published ${published} online game${published === 1 ? '' : 's'}`);
    return published;
  }

  return {
    pull,
    start() {
      if (timer) return;
      const tick = () => { pull().catch(error => log(`pull failed: ${error instanceof Error ? error.message : String(error)}`)); };
      tick();
      timer = setInterval(tick, options.everyMs ?? 5 * 60_000);
      timer.unref?.();
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
