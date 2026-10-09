import saved from '../../content/authored-content.json';
import { setBuiltinModDetails } from '../builtinMods';
import { compileContent, createDefaultContent, upgradeDocument, validateContent, type ContentDocument } from './contentModel';

export type StoredContent = { revision: number; document: ContentDocument | null };
const savedContent = saved as unknown as StoredContent;

/** The checked-in file is part of the production bundle. A newly saved document takes effect after reload/rebuild. */
export function getBundledDocument(): ContentDocument {
  if (savedContent.document === null) return createDefaultContent();
  const document = upgradeDocument(structuredClone(savedContent.document));
  const errors = validateContent(document);
  if (errors.length) throw new Error(`Saved content is invalid: ${errors.join('; ')}`);
  return document as ContentDocument;
}

const bundledDocument = getBundledDocument();
setBuiltinModDetails(bundledDocument.builtinMods);
export const bundledContent = compileContent(bundledDocument);
export const bundledRevision = savedContent.revision;
