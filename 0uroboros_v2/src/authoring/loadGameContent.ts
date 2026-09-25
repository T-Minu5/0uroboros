import { compileContent, validateContent, type ContentDocument, type CompiledContent } from './contentModel';
import { bundledContent } from './contentStore';

/** Each new game gets a snapshot. Saving in the editor never changes a live match. */
export async function loadGameContent(): Promise<CompiledContent> {
 const response=await fetch('/api/content',{cache:'no-store'});
 // A static production host has no local authoring API; use its built content.
 if(response.status===404||response.ok&&!response.headers.get('content-type')?.includes('application/json'))return structuredClone(bundledContent);
 if(!response.ok)throw new Error('Saved content could not be loaded. Check the authoring app before starting a game.');
 const stored=await response.json() as {document:ContentDocument};
 const errors=validateContent(stored.document);
 if(errors.length)throw new Error(`Saved content needs correction: ${errors[0]}`);
 return compileContent(stored.document);
}
