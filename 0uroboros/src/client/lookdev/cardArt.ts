/**
 * First-party card art lookup.
 *
 * Filenames are slugs of the printed name. Identity art is never replaced with
 * generated placeholders. Cards without a matching file keep a quiet frame.
 */

const modules = {
  ...import.meta.glob('../../../assets/card_art/base cards/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
  ...import.meta.glob('../../../assets/card_art/chaos cards/*.png', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
} as Record<string, string>;

const bySlug = new Map<string, string>();
for (const [path, url] of Object.entries(modules)) {
  const file = path.split('/').pop()?.replace(/\.png$/i, '') ?? '';
  bySlug.set(file.toLowerCase(), url);
}

const ID_ALIASES: Record<string, string> = {
  byte_coin: 'alchemic-byte',
  kilo_coin: 'alchemic-kilo',
};

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function cardArtUrl(cardDefId: string, name?: string): string | null {
  const alias = ID_ALIASES[cardDefId];
  if (alias && bySlug.has(alias)) return bySlug.get(alias) ?? null;
  const fromId = cardDefId.replace(/_/g, '-');
  if (bySlug.has(fromId)) return bySlug.get(fromId) ?? null;
  if (name) {
    const fromName = slugFromName(name);
    if (bySlug.has(fromName)) return bySlug.get(fromName) ?? null;
  }
  return null;
}
