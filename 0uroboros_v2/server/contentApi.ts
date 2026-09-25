import { copyFile, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ContentDocument } from '../src/authoring/contentModel';

export type ContentModelModule = {
  createDefaultContent(): ContentDocument;
  validateContent(value: unknown): string[];
};
export type StoredContent = { revision: number; document: ContentDocument | null };
export type ContentApiOptions = { filePath?: string; loadModel: () => Promise<ContentModelModule>; maxBytes?: number };
type Next = (error?: unknown) => void;

const DEFAULT_FILE = resolve(process.cwd(), 'content/authored-content.json');
const DEFAULT_LIMIT = 2 * 1024 * 1024;
const loopback = (address?: string) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

export function isLocalRequest(request: IncomingMessage): boolean {
  if (!loopback(request.socket.remoteAddress)) return false;
  const host = request.headers.host;
  if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  const origin = request.headers.origin;
  if (origin !== undefined) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      if (parsed.host !== host) return false;
    } catch { return false; }
  }
  return true;
}

function reply(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(value));
}

async function readStored(filePath: string): Promise<StoredContent> {
  let value: unknown;
  try { value = JSON.parse(await readFile(filePath, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { revision: 0, document: null };
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isSafeInteger((value as StoredContent).revision) || (value as StoredContent).revision < 0 || !('document' in value)) throw new Error('Saved content wrapper is malformed.');
  return value as StoredContent;
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Content payload exceeds the size limit.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

async function atomicSave(filePath: string, value: StoredContent) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const backupTempPath = `${tempPath}.bak`;
  try {
    const handle = await open(tempPath, 'wx', 0o600);
    try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    try { await copyFile(filePath, backupTempPath); await rename(backupTempPath, `${filePath}.bak`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    await unlink(backupTempPath).catch(() => undefined);
    throw error;
  }
}

/** A local Vite middleware. PUT writes are serialized and checked against the latest revision. */
export function createContentApi(options: ContentApiOptions) {
  const filePath = options.filePath ?? DEFAULT_FILE;
  const maxBytes = options.maxBytes ?? DEFAULT_LIMIT;
  let writes: Promise<unknown> = Promise.resolve();
  return async (request: IncomingMessage, response: ServerResponse, next: Next) => {
    if ((request.url ?? '').split('?')[0] !== '/api/content') return next();
    if (!isLocalRequest(request)) { reply(response, 403, { error: 'Content API is available only from this local app.' }); return; }
    if (request.method === 'GET') {
      try {
        const stored = await readStored(filePath);
        const model = await options.loadModel();
        const document = stored.document ?? model.createDefaultContent();
        const errors = model.validateContent(document);
        if (errors.length) throw new Error(`Saved content is invalid: ${errors.join('; ')}`);
        reply(response, 200, { revision: stored.revision, document });
      } catch (error) { reply(response, 500, { error: error instanceof Error ? error.message : 'Unable to read content.' }); }
      return;
    }
    if (request.method !== 'PUT') { response.setHeader('Allow', 'GET, PUT'); reply(response, 405, { error: 'Method not allowed.' }); return; }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) { reply(response, 415, { error: 'Expected application/json.' }); return; }
    let body: unknown;
    try { body = await readBody(request, maxBytes); }
    catch (error) { reply(response, (error as { status?: number }).status ?? 400, { error: error instanceof Error ? error.message : 'Invalid request.' }); return; }
    const operation = writes.then(async () => {
      if (!body || typeof body !== 'object' || Array.isArray(body)) { reply(response, 400, { error: 'Expected { revision, document }.' }); return; }
      const proposed = body as { revision?: unknown; document?: unknown };
      if (!Number.isSafeInteger(proposed.revision) || (proposed.revision as number) < 0 || proposed.document === undefined) { reply(response, 400, { error: 'Expected a nonnegative revision and document.' }); return; }
      const current = await readStored(filePath);
      if (proposed.revision !== current.revision) { reply(response, 409, { error: 'Content changed since it was loaded.', revision: current.revision }); return; }
      const model = await options.loadModel();
      const errors = model.validateContent(proposed.document);
      if (errors.length) { reply(response, 400, { error: 'Invalid content.', errors }); return; }
      const saved = { revision: current.revision + 1, document: proposed.document as ContentDocument };
      await atomicSave(filePath, saved);
      reply(response, 200, saved);
    }).catch(error => reply(response, 500, { error: error instanceof Error ? error.message : 'Unable to save content.' }));
    writes = operation;
    await operation;
  };
}
