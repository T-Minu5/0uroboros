import type { CanonicalIndex } from './context';
import type { DesignToken } from './contracts';

const FALLBACK_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Blue', value: '#4173F2' },
  { name: 'Light Blue', value: '#31A9FF' },
  { name: 'Cyan', value: '#27E2FF' },
  { name: 'Purple', value: '#BC64FF' },
  { name: 'Pink', value: '#FF0BA1' },
  { name: 'Red', value: '#FA0048' },
  { name: 'Gold', value: '#FFCC12' },
  { name: 'Green', value: '#1FFFB1' },
  { name: 'Black', value: '#030012' },
];

export function resolveDesignTokens(index: CanonicalIndex): DesignToken[] {
  const colorRecord = currentText(index, 'DESIGN-COLOR-001');
  const colors = parseColors(colorRecord) ?? FALLBACK_COLORS;
  const tokens: DesignToken[] = colors.map((color) => ({
    token_id: `color-${slug(color.name)}`,
    token_type: 'COLOR',
    name: color.name,
    value: color.value,
    usage: 'Approved palette swatch. Semantic gameplay mapping is not implied.',
    constraints: color.value === '#030012' ? '#030012 is the darkest normal design color.' : '',
    canonical_id: 'DESIGN-COLOR-001',
  }));
  tokens.push({
    token_id: 'color-floor',
    token_type: 'CONSTRAINT',
    name: 'Darkest normal design color',
    value: '#030012',
    usage: currentText(index, 'DESIGN-COLOR-003') || '#030012 is darkest normal design color.',
    constraints: 'Shadows and shaders may go darker.',
    canonical_id: 'DESIGN-COLOR-003',
  });
  tokens.push({
    token_id: 'type-inter',
    token_type: 'TYPE',
    name: 'Inter',
    value: 'Thin, Regular, Medium, Bold, and corresponding italics',
    usage:
      currentText(index, 'DESIGN-TYPE-001') ||
      'Inter: primary UI/card/Location/log/modal text.',
    constraints: 'Do not add a third font without a candidate design proposal.',
    canonical_id: 'DESIGN-TYPE-001',
  });
  tokens.push({
    token_id: 'type-orbitron',
    token_type: 'TYPE',
    name: 'Orbitron Regular',
    value: 'Regular',
    usage:
      currentText(index, 'DESIGN-TYPE-002') ||
      'Orbitron Regular: card titles, game titles, subtitles, large numerals.',
    constraints: currentText(index, 'DESIGN-TYPE-003') || 'No casual third font.',
    canonical_id: 'DESIGN-TYPE-002',
  });
  return tokens;
}

function parseColors(text: string): Array<{ name: string; value: string }> | null {
  const matches = [...text.matchAll(/([A-Za-z][A-Za-z ]*?)\s+(#[0-9A-Fa-f]{6})/g)];
  if (matches.length === 0) return null;
  return matches.map((match) => ({
    name: match[1]!.trim(),
    value: match[2]!,
  }));
}

function currentText(index: CanonicalIndex, id: string): string {
  return index.items.find((item) => item.id === id && item.status === 'current')?.text ?? '';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
