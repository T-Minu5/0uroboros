import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isLocalRequest } from './contentApi';
import { DepthWorker, artFile, depthPaths, documentArt, isCurrent, loadManifest, processArt, saveManifest, sha256, type DepthPaths, type DepthStatus } from './depthPipeline';

type Next = (error?: unknown) => void;
type Job = { status: DepthStatus; error?: string };
export type DepthApiOptions = { paths?: DepthPaths; worker?: Pick<DepthWorker, 'run' | 'stop'>; idleMs?: number; log?: (line: string) => void };

function reply(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 64 * 1024) throw new Error('Body too large.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/**
 * Generates depth assets after authored content is saved. Jobs run one at a time on a
 * single worker that is shut down after a quiet period, so the model is not held in memory
 * while nobody is authoring.
 */
export function createDepthApi(options: DepthApiOptions = {}) {
  const paths = options.paths ?? depthPaths();
  const log = options.log ?? (line => console.log(`[depth] ${line}`));
  const worker = options.worker ?? new DepthWorker(paths, log);
  const idleMs = options.idleMs ?? 5 * 60_000;
  const jobs = new Map<string, Job>();
  let chain: Promise<unknown> = Promise.resolve();
  let idle: ReturnType<typeof setTimeout> | undefined;

  function schedule(url: string, force: boolean) {
    if (jobs.get(url)?.status === 'queued') return;
    jobs.set(url, { status: 'queued' });
    clearTimeout(idle);
    chain = chain.then(async () => {
      jobs.set(url, { status: 'processing' });
      try {
        const manifest = await loadManifest(paths);
        const outcome = await processArt(paths, worker as DepthWorker, manifest, url, force);
        if (outcome !== 'skipped') await saveManifest(paths, manifest);
        jobs.set(url, { status: 'ready' });
        log(`${outcome} ${url}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        jobs.set(url, { status: 'failed', error: message });
        log(`failed ${url}: ${message}`);
      }
      if (![...jobs.values()].some(job => job.status === 'queued' || job.status === 'processing')) {
        clearTimeout(idle); idle = setTimeout(() => worker.stop(), idleMs); idle.unref?.();
      }
    });
    return chain;
  }

  /** Queue every art path in the document whose depth assets are missing or stale. */
  async function enqueue(document: unknown): Promise<string[]> {
    const manifest = await loadManifest(paths);
    const queued: string[] = [];
    for (const url of documentArt(document)) {
      const file = artFile(paths, url);
      if (!file || !existsSync(file)) continue;
      if (isCurrent(paths, manifest.entries[url], await sha256(file))) continue;
      schedule(url, false); queued.push(url);
    }
    return queued;
  }

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: Next) => {
    const path = (request.url ?? '').split('?')[0];
    if (path !== '/api/depth/status' && path !== '/api/depth/regenerate') return next();
    if (!isLocalRequest(request)) { reply(response, 403, { error: 'Depth API is available only from this local app.' }); return; }
    if (path === '/api/depth/status' && request.method === 'GET') {
      const manifest = await loadManifest(paths).catch(() => ({ entries: {} }));
      reply(response, 200, { entries: manifest.entries, jobs: Object.fromEntries(jobs) });
      return;
    }
    if (path === '/api/depth/regenerate' && request.method === 'POST') {
      let body: unknown;
      try { body = await readJson(request); } catch { reply(response, 400, { error: 'Expected JSON.' }); return; }
      const art = (body as { art?: unknown })?.art;
      const file = typeof art === 'string' ? artFile(paths, art) : null;
      if (!file || !existsSync(file)) { reply(response, 400, { error: 'Unknown card art path.' }); return; }
      schedule(art as string, true);
      reply(response, 202, { art, status: 'queued' });
      return;
    }
    response.setHeader('Allow', path === '/api/depth/status' ? 'GET' : 'POST');
    reply(response, 405, { error: 'Method not allowed.' });
  };

  return { middleware, enqueue, jobs, idle: () => chain };
}
