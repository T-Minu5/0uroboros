import saved from '../../content/authored-content.json';
import { compileContent, createDefaultContent, validateContent, type ContentDocument } from './contentModel';

export type StoredContent = { revision: number; document: ContentDocument | null };
const savedContent = saved as StoredContent;

/** The checked-in file is part of the production bundle. A newly saved document takes effect after reload/rebuild. */
export function getBundledDocument(): ContentDocument {
  if (savedContent.document === null) return createDefaultContent();
  const errors = validateContent(savedContent.document);
  if (errors.length) throw new Error(`Saved content is invalid: ${errors.join('; ')}`);
  return structuredClone(savedContent.document);
}

export const bundledContent = compileContent(getBundledDocument());
export const bundledRevision = savedContent.revision;
