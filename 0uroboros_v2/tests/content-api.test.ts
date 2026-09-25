import { afterEach, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContentApi } from '../server/contentApi';
import { createDefaultContent, validateContent } from '../src/authoring/contentModel';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); });

async function setup(maxBytes?: number) {
  const directory = await mkdtemp(join(tmpdir(), 'ouroboros-content-'));
  const filePath = join(directory, 'authored-content.json');
  const middleware = createContentApi({ filePath, maxBytes, loadModel: async () => ({ createDefaultContent, validateContent }) });
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  async function request(method: string, data?: unknown, origin?: string) {
    const body = data === undefined ? '' : JSON.stringify(data);
    const incoming = Object.assign(Readable.from([Buffer.from(body)]), {
      method, url: '/api/content',
      headers: { host: '127.0.0.1:5173', ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}) },
      socket: { remoteAddress: '127.0.0.1' },
    }) as unknown as IncomingMessage;
    let status = 200;
    let output = '';
    const response = {
      get statusCode() { return status; }, set statusCode(value: number) { status = value; },
      setHeader() { return this; }, end(value?: string) { output = value ?? ''; return this; },
    } as unknown as ServerResponse;
    await middleware(incoming, response, () => { status = 404; });
    return { status, body: output ? JSON.parse(output) : null };
  }
  return { request, filePath };
}

describe('local content API', () => {
  it('serves defaults, validates writes, increments revisions and keeps the previous file', async () => {
    const { request, filePath } = await setup();
    const initial = (await request('GET')).body;
    expect(initial.revision).toBe(0);
    expect(validateContent(initial.document)).toEqual([]);

    initial.document.cards.find((card: { definitionId: string }) => card.definitionId === 'eval-signal-amplifier').name = 'Edited Amplifier';
    const first = await request('PUT', initial);
    expect(first.status).toBe(200);
    expect(first.body.revision).toBe(1);
    const persisted = JSON.parse(await readFile(filePath, 'utf8'));
    expect(persisted.document.cards.find((card: { definitionId: string }) => card.definitionId === 'eval-signal-amplifier').name).toBe('Edited Amplifier');

    expect((await request('PUT', initial)).status).toBe(409);
    const next = { revision: 1, document: persisted.document };
    next.document.cards.find((card: { definitionId: string }) => card.definitionId === 'eval-signal-amplifier').name = 'Latest Amplifier';
    expect((await request('PUT', next)).status).toBe(200);
    const backup = JSON.parse(await readFile(`${filePath}.bak`, 'utf8'));
    expect(backup.revision).toBe(1);
    expect((await request('GET')).body.revision).toBe(2);
  });

  it('rejects malformed content and cross-origin writes without changing the file', async () => {
    const { request, filePath } = await setup();
    const doc = createDefaultContent();
    doc.cards[0].cost = Number.NaN;
    const invalid = await request('PUT', { revision: 0, document: doc });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('cards[0].cost')]));
    expect((await request('PUT', { revision: 0, document: createDefaultContent() }, 'http://attacker.invalid')).status).toBe(403);
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serializes concurrent saves and rejects oversized payloads', async () => {
    const { request, filePath } = await setup();
    const proposed = { revision: 0, document: createDefaultContent() };
    const results = await Promise.all([request('PUT', proposed), request('PUT', proposed)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(JSON.parse(await readFile(filePath, 'utf8')).revision).toBe(1);

    const limited = await setup(100);
    expect((await limited.request('PUT', proposed)).status).toBe(413);
    await expect(readFile(limited.filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
