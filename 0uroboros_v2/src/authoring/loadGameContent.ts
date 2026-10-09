import { MIN_STARTING_DECK_SIZE } from '@0uroboros/engine/game';
import { compileContent, deckSize, upgradeDocument, validateContent, withStartingDecks, type ContentDocument, type CompiledContent } from '@0uroboros/engine/authoring/contentModel';
import { getBundledDocument } from './contentStore';
import { setBuiltinModDetails } from '@0uroboros/engine/builtinMods';

/** A starting deck as the setup screen lists it; `playable` decks have enough cards for the opening hand. */
export type DeckOption = { id: string; name: string; size: number; cards: { name: string; count: number }[]; playable: boolean };
export type GameContentSource = { document: ContentDocument; decks: DeckOption[]; defaultDeckId: string };

async function fetchDocument(): Promise<ContentDocument> {
 const document=await fetchSavedDocument();
 setBuiltinModDetails(document.builtinMods);
 return document;
}

async function fetchSavedDocument(): Promise<ContentDocument> {
 const response=await fetch('/api/content',{cache:'no-store'});
 // A static production host has no local authoring API; use its built content.
 if(response.status===404||response.ok&&!response.headers.get('content-type')?.includes('application/json'))return getBundledDocument();
 if(!response.ok)throw new Error('Saved content could not be loaded. Check the authoring app before starting a game.');
 const stored=await response.json() as {document:unknown};
 const document=upgradeDocument(stored.document) as ContentDocument;
 const errors=validateContent(document);
 if(errors.length)throw new Error(`Saved content needs correction: ${errors[0]}`);
 return document;
}

export function deckOptions(document: ContentDocument): GameContentSource {
 const doc=withStartingDecks(document);
 const names=new Map(doc.cards.map(card=>[card.definitionId??card.id,card.name]));
 const decks=doc.startingDecks!.map(deck=>{
  const size=deckSize(deck);
  return {id:deck.id,name:deck.name,size,playable:size>=MIN_STARTING_DECK_SIZE,cards:deck.cards.filter(entry=>entry.count>0).map(entry=>({name:names.get(entry.cardId)??entry.cardId,count:entry.count}))};
 });
 return {document,decks,defaultDeckId:doc.activeStartingDeckId!};
}

/** Compiles the document with the chosen starting deck dealt to both players; an unknown or short deck falls back to the saved one. */
export function compileForDeck(document: ContentDocument, deckId?: string): CompiledContent {
 const doc=withStartingDecks(document);
 const deck=doc.startingDecks!.find(entry=>entry.id===deckId);
 return compileContent(deck&&deckSize(deck)>=MIN_STARTING_DECK_SIZE?{...doc,activeStartingDeckId:deck.id}:doc);
}

export const loadGameSource = async () => deckOptions(await fetchDocument());

/** Each new game gets a snapshot. Saving in the editor never changes a live match. */
export async function loadGameContent(deckId?: string): Promise<CompiledContent> {
 return compileForDeck(await fetchDocument(), deckId);
}
