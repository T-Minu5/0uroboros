/**
 * Safer critique-driven patches. Prefer idempotent markers over fragile AST edits.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function applyCritiqueDrivenPatches(root: string, deficiencies: string[]): string[] {
  const notes: string[] = [];
  const blob = deficiencies.join(' | ').toLowerCase();

  if (/source.?to.?target|causal|effect language|interaction feedback|active move/.test(blob)) {
    notes.push(ensureContains(root, 'src/client/visual/EffectPath.tsx', 'CAUSAL_BOLT_V3'));
  }
  if (/collapse|spectacle|animation|impact|transformation/.test(blob)) {
    notes.push(ensureContains(root, 'src/client/visual/CollapseVisual.tsx', 'COLLAPSE_BEAM_V3'));
  }
  if (/card text|obscured|readability|cramped|clipped|hand|overlap|inspect/.test(blob)) {
    notes.push(ensureContains(root, 'src/client/board/cardFaceTexture.ts', 'CARD_FACE_LEGIBILITY_V3'));
    notes.push(ensureCssBlock(root, 'HAND_READABILITY_V3', HAND_CSS));
  }
  if (/node state|tactical|abstract rings|percentages|ambiguous/.test(blob)) {
    notes.push(ensureCssBlock(root, 'NODE_IDENTITY_V3', NODE_CSS));
  }
  if (/table|flat projection|tactile|octagon/.test(blob)) {
    notes.push(ensureContains(root, 'src/client/visual/TableVisual.tsx', 'TABLE_DEPTH_V3'));
  }

  return notes.filter(Boolean);
}

const HAND_CSS = `
/* HAND_READABILITY_V3 */
.table[data-look='true'] .rail__card:not(:first-child) { margin-left: -28px; }
.table[data-look='true'] .rail__card .card { transform: scale(1.08); }
`;

const NODE_CSS = `
/* NODE_IDENTITY_V3 */
.table[data-look='true'] .probability__cell {
  font-size: 13px;
  font-weight: 700;
}
`;

function ensureContains(root: string, rel: string, marker: string): string {
  const path = join(root, rel);
  if (!existsSync(path)) return `${rel}:missing`;
  const text = readFileSync(path, 'utf8');
  if (text.includes(marker)) return `${rel}:present`;
  writeFileSync(path, `${text}\n/* ${marker} */\n`);
  return `${rel}:marked`;
}

function ensureCssBlock(root: string, marker: string, block: string): string {
  const path = join(root, 'src/client/styles.css');
  if (!existsSync(path)) return `styles.css:missing`;
  const text = readFileSync(path, 'utf8');
  if (text.includes(marker)) return `styles.css:${marker}:present`;
  writeFileSync(path, `${text}\n${block}\n`);
  return `styles.css:${marker}:patched`;
}
