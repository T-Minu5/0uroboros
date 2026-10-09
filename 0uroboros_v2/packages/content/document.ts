/**
 * The published content pack as compiled rules: the same `content/authored-content.json` the client bundles, read by
 * the game server so both sides play one revision. The studio's `/api/content` route serves live edits in dev; this
 * module is the committed snapshot.
 */
import saved from '../../content/authored-content.json';
import { MIN_STARTING_DECK_SIZE } from '@0uroboros/engine/game';
import { compileContent, createDefaultContent, deckSize, upgradeDocument, validateContent, withStartingDecks, type CompiledContent, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { setBuiltinModDetails } from '@0uroboros/engine/builtinMods';
import { packHash } from './hash';

type StoredContent = { revision: number; document: ContentDocument | null };
const stored = saved as unknown as StoredContent;

export const PACK_REVISION: number = stored.revision;
/** Hash of the published document (see hash.ts); announced to clients so they can fetch this exact pack. */
export const PACK_HASH: string = packHash(stored.document);

let cached: ContentDocument | null = null;
/** The upgraded, validated document; built-in mod details are registered on first use. */
export function publishedDocument(): ContentDocument {
  if (cached) return cached;
  const document = stored.document === null ? createDefaultContent() : (upgradeDocument(structuredClone(stored.document)) as ContentDocument);
  const errors = validateContent(document);
  if (errors.length) throw new Error(`Published content is invalid: ${errors.join('; ')}`);
  setBuiltinModDetails(document.builtinMods);
  cached = document;
  return document;
}

/** Compiles the pack with `deckId` dealt as both seats' starting deck; unknown or short decks fall back to the saved one. */
export function publishedContent(deckId?: string): CompiledContent {
  const doc = withStartingDecks(publishedDocument());
  const deck = doc.startingDecks!.find(entry => entry.id === deckId);
  return compileContent(deck && deckSize(deck) >= MIN_STARTING_DECK_SIZE ? { ...doc, activeStartingDeckId: deck.id } : doc);
}

/** The raw stored document, as served to clients by hash. */
export function publishedRawDocument(): unknown { return stored.document; }
