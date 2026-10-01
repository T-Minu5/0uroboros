import type { Card } from './game';
import { cardArtworkPath } from './cardArtwork';
import { warmCardVideos } from './cardVideos';
import { depthRenderer } from './depthArt/DepthArtRenderer';
import { depthEntry, servedArtPath } from './depthArt/depthManifest';

const isCard = (value: Record<string, unknown>) => typeof value.name === 'string' && typeof value.type === 'string' && 'effect' in value;
const cardKey = (card: Card) => card.definitionId ?? card.name;

/**
 * Every card definition reachable from `roots`: cards found anywhere in them, plus the cards those can turn into or
 * bring in (morph forms, gained cards), followed through the catalog until nothing new turns up.
 */
export function cardsInPlay(roots: unknown, catalog: readonly Card[]): Card[] {
  const byId = new Map(catalog.map(card => [card.definitionId ?? card.id, card]));
  const found = new Map<string, Card>();
  const reference = (id: unknown) => { const card = typeof id === 'string' ? byId.get(id) : undefined; if (card) walk(card); };
  function walk(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (isCard(record)) {
      const key = cardKey(record as Card);
      if (found.has(key)) return;
      found.set(key, record as Card);
    }
    for (const [key, field] of Object.entries(record)) {
      if (key === 'cardId') reference(field);
      else if (key === 'formIds' && Array.isArray(field)) field.forEach(reference);
      else walk(field);
    }
  }
  walk(roots);
  return [...found.values()];
}

const warmedArt = new Set<string>();
/** Decoded images are held here; a dropped `Image` lets the browser evict its pixels. */
const images: HTMLImageElement[] = [];

/**
 * Fetch and decode everything a card can show: its art, its clips and the depth it shows while dragged, so nothing
 * waits on the network when it is drawn, morphs, plays a clip or is lifted.
 */
export function warmCardMedia(cards: Iterable<Card>) {
  if (typeof window === 'undefined') return;
  for (const card of cards) {
    warmCardVideos(card);
    const art = cardArtworkPath(card);
    if (warmedArt.has(art)) continue;
    warmedArt.add(art);
    const image = new Image();
    image.decoding = 'async';
    image.src = servedArtPath(art);
    void image.decode().catch(() => undefined);
    images.push(image);
    const depth = depthEntry(art);
    if (depth) depthRenderer()?.warm(depth);
  }
}
