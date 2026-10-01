import { mkdir, open, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isLocalRequest } from './contentApi';

export type ArtworkImage = { path: string; folder: string; name: string };
export type ArtworkApiOptions = { root?: string; urlBase?: string; maxBytes?: number };
type Next = (error?: unknown) => void;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const UPLOAD_TYPES: Record<string, { ext: string; matches: (bytes: Buffer) => boolean }> = {
  'image/png': { ext: '.png', matches: bytes => bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: '.jpg', matches: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/webp': { ext: '.webp', matches: bytes => bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' },
};
const UPLOAD_FOLDER = 'uploads';

function reply(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(value));
}

async function listImages(root: string, urlBase: string): Promise<ArtworkImage[]> {
  const images: ArtworkImage[] = [];
  async function walk(directory: string) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const rel = relative(root, full).split(sep).join('/');
        const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
        images.push({ path: `${urlBase}/${rel}`, folder, name: entry.name.slice(0, -extname(entry.name).length) });
      }
    }
  }
  await walk(root);
  return images.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
}

async function readBytes(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error(`Images must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function uploadBaseName(header: string | string[] | undefined) {
  let raw = Array.isArray(header) ? header[0] : header ?? '';
  try { raw = decodeURIComponent(raw); } catch { /* keep the raw header */ }
  const stem = raw.replace(/\.[^.]*$/, '');
  return stem.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'artwork';
}

/** Local-only Vite middleware for browsing card art and adding new images to `assets/card_art/uploads`. */
export function createArtworkApi(options: ArtworkApiOptions = {}) {
  const root = options.root ?? resolve(process.cwd(), 'assets/card_art');
  const urlBase = options.urlBase ?? '/assets/card_art';
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  return async (request: IncomingMessage, response: ServerResponse, next: Next) => {
    if ((request.url ?? '').split('?')[0] !== '/api/artwork') return next();
    if (!isLocalRequest(request)) { reply(response, 403, { error: 'Artwork API is available only from this local app.' }); return; }
    if (request.method === 'GET') {
      try { reply(response, 200, { images: await listImages(root, urlBase) }); }
      catch (error) { reply(response, 500, { error: error instanceof Error ? error.message : 'Unable to list artwork.' }); }
      return;
    }
    if (request.method !== 'POST') { response.setHeader('Allow', 'GET, POST'); reply(response, 405, { error: 'Method not allowed.' }); return; }
    const type = UPLOAD_TYPES[String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()];
    if (!type) { reply(response, 415, { error: 'Upload a PNG, JPEG or WebP image.' }); return; }
    let bytes: Buffer;
    try { bytes = await readBytes(request, maxBytes); }
    catch (error) { reply(response, (error as { status?: number }).status ?? 400, { error: error instanceof Error ? error.message : 'Invalid upload.' }); return; }
    if (!bytes.length || !type.matches(bytes)) { reply(response, 400, { error: 'The file content does not match its image type.' }); return; }
    try {
      const directory = join(root, UPLOAD_FOLDER);
      await mkdir(directory, { recursive: true });
      const base = uploadBaseName(request.headers['x-file-name']);
      for (let suffix = 1; suffix < 1000; suffix++) {
        const name = suffix === 1 ? base : `${base}-${suffix}`;
        const handle = await open(join(directory, `${name}${type.ext}`), 'wx', 0o644).catch(error => {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null;
          throw error;
        });
        if (!handle) continue;
        try { await handle.writeFile(bytes); } finally { await handle.close(); }
        reply(response, 201, { path: `${urlBase}/${UPLOAD_FOLDER}/${name}${type.ext}`, folder: UPLOAD_FOLDER, name } satisfies ArtworkImage);
        return;
      }
      reply(response, 409, { error: 'Too many images already use this name.' });
    } catch (error) { reply(response, 500, { error: error instanceof Error ? error.message : 'Unable to save the image.' }); }
  };
}
