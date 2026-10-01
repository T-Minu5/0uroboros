import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';

/**
 * Bumping this regenerates every depth asset. File names carry it, so a browser never
 * pairs a cached colour image with a depth map from a different run.
 */
export const PIPELINE_VERSION = 2;
/**
 * Passed straight to `depth_core.EncodeSettings`. The smallest settings that hold luma SSIM
 * >= 0.99 against lossless across nine parallax views (`tools/depth/quality.py`); set both
 * `*_lossless` to true for reference-quality assets.
 */
export const ENCODE_SETTINGS = { color_lossless: false, color_quality: 92, depth_lossless: false, depth_quality: 90, depth_scale: 1 };

export type DepthEntry = { sha: string; v: number; color: string; depth: string; width: number; height: number; focus: number };
export type DepthManifest = { version: number; entries: Record<string, DepthEntry> };
export type DepthStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type DepthPaths = { root: string; assets: string; cardArt: string; depthDir: string; manifest: string };
export function depthPaths(root = process.cwd()): DepthPaths {
  const assets = resolve(root, 'assets'), cardArt = resolve(assets, 'card_art'), depthDir = resolve(cardArt, 'depth');
  return { root, assets, cardArt, depthDir, manifest: resolve(depthDir, 'manifest.json') };
}

const DEPTH_HOME = process.env.DEPTH_HOME ?? join(homedir(), '.cache', '0uroboros-depth');
export const PYTHON = process.env.DEPTH_PYTHON ?? join(DEPTH_HOME, 'venv', 'bin', 'python');

/** `/assets/card_art/x.png` to an absolute file, or null when it falls outside the card art folder. */
export function artFile(paths: DepthPaths, url: string): string | null {
  if (!url.startsWith('/assets/')) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(url.split('?')[0]!); } catch { return null; }
  const file = resolve(paths.assets, decoded.slice('/assets/'.length));
  if (!file.startsWith(paths.cardArt + sep) || file.startsWith(paths.depthDir + sep)) return null;
  return file;
}
export const artUrl = (paths: DepthPaths, file: string) => `/assets/${relative(paths.assets, file).split(sep).join('/')}`;

/** Card art is recognised by its bytes: some files, such as a card back, carry no extension. */
export async function isImageFile(file: string): Promise<boolean> {
  const handle = await open(file, 'r').catch(() => null);
  if (!handle) return false;
  try {
    const head = Buffer.alloc(12);
    const { bytesRead } = await handle.read(head, 0, 12, 0);
    if (bytesRead < 12) return false;
    return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      || (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
      || (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP');
  } finally { await handle.close(); }
}

async function walk(dir: string, skip: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.name.startsWith('.') || path === skip) continue;
    if (entry.isDirectory()) found.push(...await walk(path, skip));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

function collectArt(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) { for (const item of value) collectArt(item, into); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'art' && typeof item === 'string') into.add(item);
    else collectArt(item, into);
  }
}
/** Every `art` path an authored document refers to. */
export function documentArt(document: unknown): string[] {
  const found = new Set<string>(); collectArt(document, found); return [...found];
}

/**
 * Every piece of card art in the project: the default mapping, the authored content, and
 * every image file in the card art folder (uploads and card backs included).
 */
export async function allArtUrls(paths: DepthPaths): Promise<string[]> {
  const urls = new Set<string>();
  const mapping = JSON.parse(await readFile(resolve(paths.root, 'src/cardArtwork.json'), 'utf8')) as { placeholder: string; byId: Record<string, string>; byName: Record<string, string> };
  urls.add(mapping.placeholder);
  for (const url of [...Object.values(mapping.byId), ...Object.values(mapping.byName)]) urls.add(url);
  const content = await readFile(resolve(paths.root, 'content/authored-content.json'), 'utf8').catch(() => null);
  if (content) for (const url of documentArt(JSON.parse(content).document)) urls.add(url);
  for (const file of await walk(paths.cardArt, paths.depthDir)) if (await isImageFile(file)) urls.add(artUrl(paths, file));
  const usable: string[] = [];
  for (const url of urls) {
    const file = artFile(paths, url);
    if (file && existsSync(file) && await isImageFile(file)) usable.push(url);
  }
  return usable.sort();
}

export async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function loadManifest(paths: DepthPaths): Promise<DepthManifest> {
  try {
    const value = JSON.parse(await readFile(paths.manifest, 'utf8')) as DepthManifest;
    if (value && typeof value === 'object' && value.entries && typeof value.entries === 'object') return value;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return { version: PIPELINE_VERSION, entries: {} };
}

export async function saveManifest(paths: DepthPaths, manifest: DepthManifest) {
  await mkdir(dirname(paths.manifest), { recursive: true });
  const sorted: DepthManifest = { version: PIPELINE_VERSION, entries: Object.fromEntries(Object.entries(manifest.entries).sort(([a], [b]) => a.localeCompare(b))) };
  const temp = `${paths.manifest}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    const handle = await open(temp, 'wx', 0o644);
    try { await handle.writeFile(`${JSON.stringify(sorted, null, 2)}\n`, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temp, paths.manifest);
  } catch (error) { await unlink(temp).catch(() => undefined); throw error; }
}

const assetName = (sha: string) => `${sha.slice(0, 20)}-v${PIPELINE_VERSION}`;
const depthUrl = (name: string) => `/assets/card_art/depth/${name}`;

/** An entry is current when it matches the source bytes and this pipeline version, and both files exist. */
export function isCurrent(paths: DepthPaths, entry: DepthEntry | undefined, sha: string): entry is DepthEntry {
  if (!entry || entry.sha !== sha || entry.v !== PIPELINE_VERSION) return false;
  return [entry.color, entry.depth].every(url => existsSync(resolve(paths.assets, url.slice('/assets/'.length))));
}

type Pending = { resolve: (value: WorkerReply) => void; reject: (error: Error) => void };
type WorkerReply = { id: string; ok: boolean; width?: number; height?: number; focus?: number; error?: string };

/** The Python worker, started on first use and restarted if it dies. The model stays loaded between jobs. */
export class DepthWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private next = 0;
  private paths: DepthPaths;
  private log: (line: string) => void;
  constructor(paths: DepthPaths, log: (line: string) => void = () => {}) { this.paths = paths; this.log = log; }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    const script = resolve(this.paths.root, 'tools/depth/depth_worker.py');
    if (!existsSync(PYTHON)) return Promise.reject(new Error(`Depth toolchain missing (${PYTHON}). Run npm run depth:setup.`));
    const child = spawn(PYTHON, [script], { cwd: dirname(script), stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.ready = new Promise((resolveReady, rejectReady) => {
      let started = false;
      createInterface({ input: child.stdout }).on('line', line => {
        let message: WorkerReply & { ready?: boolean };
        try { message = JSON.parse(line); } catch { this.log(line); return; }
        if (message.ready) { started = true; resolveReady(); return; }
        const waiter = this.pending.get(message.id);
        if (waiter) { this.pending.delete(message.id); waiter.resolve(message); }
      });
      createInterface({ input: child.stderr }).on('line', line => { if (!/xFormers not available/.test(line)) this.log(line); });
      child.on('exit', code => {
        const error = new Error(`Depth worker exited (${code ?? 'signal'}).`);
        if (!started) rejectReady(error);
        for (const waiter of this.pending.values()) waiter.reject(error);
        this.pending.clear(); this.child = null; this.ready = null;
      });
      child.on('error', error => { if (!started) rejectReady(error); });
    });
    return this.ready;
  }

  async run(src: string, color: string, depth: string): Promise<WorkerReply> {
    await this.start();
    const id = String(++this.next);
    const reply = new Promise<WorkerReply>((resolveJob, rejectJob) => this.pending.set(id, { resolve: resolveJob, reject: rejectJob }));
    this.child!.stdin.write(`${JSON.stringify({ id, src, color, depth, encode: ENCODE_SETTINGS })}\n`);
    return reply;
  }

  stop() { this.child?.stdin.end(); this.child = null; this.ready = null; }
}

/**
 * Bring one art path up to date. Identical source bytes share one pair of files, so a
 * picture used by several cards is only processed once.
 */
export async function processArt(paths: DepthPaths, worker: DepthWorker, manifest: DepthManifest, url: string, force = false): Promise<'skipped' | 'reused' | 'generated'> {
  const file = artFile(paths, url);
  if (!file || !existsSync(file)) throw new Error(`Art not found: ${url}`);
  const sha = await sha256(file);
  if (!force && isCurrent(paths, manifest.entries[url], sha)) return 'skipped';
  if (!force) {
    const twin = Object.values(manifest.entries).find(entry => isCurrent(paths, entry, sha));
    if (twin) { manifest.entries[url] = { ...twin }; return 'reused'; }
  }
  const name = assetName(sha);
  const color = join(paths.depthDir, `${name}.color.webp`), depth = join(paths.depthDir, `${name}.depth.webp`);
  const reply = await worker.run(file, color, depth);
  if (!reply.ok) throw new Error(reply.error ?? `Depth failed for ${url}`);
  manifest.entries[url] = { sha, v: PIPELINE_VERSION, color: depthUrl(`${name}.color.webp`), depth: depthUrl(`${name}.depth.webp`), width: reply.width!, height: reply.height!, focus: reply.focus! };
  return 'generated';
}

/** Delete depth files no manifest entry points at, such as outputs of an older pipeline version. */
export async function pruneDepthFiles(paths: DepthPaths, manifest: DepthManifest): Promise<number> {
  const keep = new Set(Object.values(manifest.entries).flatMap(entry => [entry.color, entry.depth].map(url => url.split('/').pop())));
  let removed = 0;
  for (const name of await readdir(paths.depthDir).catch(() => [] as string[])) {
    if (!name.endsWith('.webp') || keep.has(name)) continue;
    await unlink(join(paths.depthDir, name)); removed++;
  }
  return removed;
}

export async function fileBytes(file: string) { return (await stat(file)).size; }
