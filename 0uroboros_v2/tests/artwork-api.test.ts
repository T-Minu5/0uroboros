import { afterEach, describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArtworkApi } from '../server/artworkApi';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'ouroboros-artwork-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'chaos cards/horrors'), { recursive: true });
  await writeFile(join(root, 'chaos cards/horrors/incubus.png'), PNG);
  await writeFile(join(root, 'placeholder.webp'), PNG);
  await writeFile(join(root, 'notes.txt'), 'not art');
  await writeFile(join(root, '.hidden.png'), PNG);
  const middleware = createArtworkApi({ root, maxBytes: 64 });
  async function request(method: string, options: { body?: Buffer; type?: string; name?: string; remote?: string } = {}) {
    const incoming = Object.assign(Readable.from([options.body ?? Buffer.alloc(0)]), {
      method, url: '/api/artwork',
      headers: { host: '127.0.0.1:5173', ...(options.type ? { 'content-type': options.type } : {}), ...(options.name ? { 'x-file-name': options.name } : {}) },
      socket: { remoteAddress: options.remote ?? '127.0.0.1' },
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
  return { root, request };
}

describe('local artwork API', () => {
  it('lists images recursively as asset URLs, skipping hidden and non-image files', async () => {
    const { request } = await setup();
    const { status, body } = await request('GET');
    expect(status).toBe(200);
    expect(body.images).toEqual([
      { path: '/assets/card_art/placeholder.webp', folder: '', name: 'placeholder' },
      { path: '/assets/card_art/chaos cards/horrors/incubus.png', folder: 'chaos cards/horrors', name: 'incubus' },
    ]);
  });

  it('stores uploads under uploads/ with a safe, unique name', async () => {
    const { root, request } = await setup();
    const first = await request('POST', { body: PNG, type: 'image/png', name: encodeURIComponent('../My Card Art!.png') });
    expect(first.status).toBe(201);
    expect(first.body.path).toBe('/assets/card_art/uploads/my-card-art.png');
    expect(await readFile(join(root, 'uploads/my-card-art.png'))).toEqual(PNG);
    const second = await request('POST', { body: PNG, type: 'image/png', name: 'my card art.png' });
    expect(second.body.path).toBe('/assets/card_art/uploads/my-card-art-2.png');
  });

  it('rejects remote requests, wrong types, mismatched bytes and oversized files', async () => {
    const { request } = await setup();
    expect((await request('GET', { remote: '10.0.0.4' })).status).toBe(403);
    expect((await request('POST', { body: PNG, type: 'image/gif' })).status).toBe(415);
    expect((await request('POST', { body: Buffer.from('not a png'), type: 'image/png' })).status).toBe(400);
    expect((await request('POST', { body: Buffer.concat([PNG, Buffer.alloc(80)]), type: 'image/png' })).status).toBe(413);
    expect((await request('DELETE')).status).toBe(405);
  });
});
