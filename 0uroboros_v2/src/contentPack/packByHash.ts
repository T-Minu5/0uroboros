/**
 * Content pack rollout by hash. The client ships one pack in its bundle; a server announces the hash of the pack it
 * plays in `welcome`. When they differ the client fetches that pack (from the CDN the server names, else the server's
 * own /pack/ route), verifies the hash, validates it and compiles it, so an older build keeps playing a newer server
 * and vice versa without a reinstall. Fetched packs are cached in localStorage by hash.
 */
import type { PackInfo } from '@0uroboros/protocol/messages';
import { PACK_HASH_PATTERN, packHash } from '@0uroboros/content/hash';
import { compileContent, upgradeDocument, validateContent, type CompiledContent, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { setBuiltinModDetails } from '@0uroboros/engine/builtinMods';
import { bundledRawDocument } from './contentStore';
import { httpTwin } from '../platform/web';

const CACHE_PREFIX = 'ouroboros.pack.';

/** The hash of the pack this build ships. */
export const bundledPackHash = packHash(bundledRawDocument);

export type ResolvedPack = { hash: string; document: ContentDocument; compiled: CompiledContent; source: 'bundled' | 'cache' | 'network' };

/** Compiles a raw stored document once its hash and validity are confirmed. */
export function compileRawPack(raw: unknown, expectedHash: string): ResolvedPack {
  if (packHash(raw) !== expectedHash) throw new Error('The content pack did not match its hash.');
  const document = upgradeDocument(structuredClone(raw)) as ContentDocument;
  const errors = validateContent(document);
  if (errors.length) throw new Error(`The content pack is invalid: ${errors[0]}`);
  setBuiltinModDetails(document.builtinMods);
  return { hash: expectedHash, document, compiled: compileContent(document), source: 'network' };
}

const cache = {
  get(hash: string): unknown { try { const raw = localStorage.getItem(CACHE_PREFIX + hash); return raw ? JSON.parse(raw) : null; } catch { return null; } },
  set(hash: string, raw: unknown) {
    try {
      // Keep only the newest two packs so the cache never grows past a rollout's worth.
      const keys = Object.keys(localStorage).filter(key => key.startsWith(CACHE_PREFIX));
      for (const key of keys.slice(0, Math.max(0, keys.length - 1))) localStorage.removeItem(key);
      localStorage.setItem(CACHE_PREFIX + hash, JSON.stringify(raw));
    } catch { /* quota or private mode: fetch again next time */ }
  },
};

/** Where to fetch `hash` from: the announced CDN, else the game server's HTTP twin. */
export function packUrl(info: PackInfo, serverUrl: string): string {
  const base = (info.url ?? `${httpTwin(serverUrl)}/pack`).replace(/\/$/, '');
  return `${base}/${info.hash}`;
}

/**
 * Returns the pack the server plays: the bundled one when hashes agree (no network), otherwise the cached or fetched
 * one. Throws when the pack cannot be obtained, so the caller can fall back to the bundled pack and warn.
 */
export async function resolvePack(info: PackInfo, serverUrl: string, fetchImpl: typeof fetch = fetch): Promise<ResolvedPack | null> {
  if (!info.hash || info.hash === bundledPackHash) return null;
  if (!PACK_HASH_PATTERN.test(info.hash)) throw new Error('The server announced a malformed pack hash.');
  const cached = cache.get(info.hash);
  if (cached) { try { return { ...compileRawPack(cached, info.hash), source: 'cache' }; } catch { /* corrupt cache: refetch */ } }
  const response = await fetchImpl(packUrl(info, serverUrl), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Content pack ${info.hash} is not available (${response.status}).`);
  const body = await response.json() as { hash?: string; document?: unknown };
  const pack = compileRawPack(body.document, info.hash);
  cache.set(info.hash, body.document);
  return pack;
}
