import { appendFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isLocalRequest } from './contentApi';

type Next = (error?: unknown) => void;
const MAX_BYTES = 256 * 1024;

/** Appends each played game's events and board snapshots to `logs/games/<gameId>.jsonl` for debugging. */
export function createGameLogApi(root = resolve('logs/games')) {
  return async (request: IncomingMessage, response: ServerResponse, next: Next) => {
    if ((request.url ?? '').split('?')[0] !== '/api/game-log') return next();
    const done = (status: number) => { response.statusCode = status; response.end(); };
    if (request.method !== 'POST') return done(405);
    if (!isLocalRequest(request)) return done(403);
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > MAX_BYTES) return done(413);
    }
    try {
      const { gameId, entry } = JSON.parse(body) as { gameId?: unknown; entry?: unknown };
      if (typeof gameId !== 'string' || !/^[\w-]{1,64}$/.test(gameId) || !entry) return done(400);
      await mkdir(root, { recursive: true });
      await appendFile(join(root, `${gameId}.jsonl`), `${JSON.stringify(entry)}\n`, 'utf8');
      done(204);
    } catch {
      done(400);
    }
  };
}
