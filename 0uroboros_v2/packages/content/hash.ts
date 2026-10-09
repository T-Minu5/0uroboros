/**
 * A stable identifier for a content pack: the document serialised with sorted keys, hashed. Client and server compute
 * it the same way, so a client can tell whether it holds the pack a server is playing and fetch the right one by hash.
 * Pure JS (two FNV-1a lanes, 16 hex chars) so it runs identically in browsers, Node and the wrappers; it identifies
 * content, it is not a security primitive.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function packHash(document: unknown): string {
  const text = canonicalJson(document);
  return fnv1a(text, 0x811c9dc5).toString(16).padStart(8, '0') + fnv1a(text, 0x9747b28c).toString(16).padStart(8, '0');
}

export const PACK_HASH_PATTERN = /^[0-9a-f]{16}$/;
