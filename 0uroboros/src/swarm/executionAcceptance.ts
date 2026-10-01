export interface StartingDeckInspection {
  ids: string[];
  character: number;
  crypto: number;
  vp: number;
  definition_ids: string[];
  matches_rule_deck_001: boolean;
}

const CANONICAL_STARTER_NAME_RE =
  /slash-?dot|dash-?dot|dotkrawler|rezz-?razor|rezz-?blade|vault encryption|byte-?coin|kilo-?coin/i;

export function inspectStartingDeckSource(contents: string): StartingDeckInspection | null {
  const deckMatch = contents.match(/export const STARTING_DECK: string\[\] = \[([\s\S]*?)\];/);
  if (!deckMatch) return null;
  const ids = [...deckMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const definition_ids = [...contents.matchAll(/^\s{2}([a-z0-9_]+): \{/gm)].map((match) => match[1]);
  const counts = { character: 0, crypto: 0, vp: 0 };
  for (const id of ids) {
    const block = contents.match(new RegExp(`${id}:\\s*\\{[\\s\\S]*?kind:\\s*'([^']+)'`));
    const kind = block?.[1];
    if (kind === 'character') counts.character += 1;
    else if (kind === 'crypto') counts.crypto += 1;
    else if (kind === 'victoryPoint') counts.vp += 1;
  }
  return {
    ids,
    ...counts,
    definition_ids,
    matches_rule_deck_001:
      ids.length === 10 && counts.character === 5 && counts.crypto === 3 && counts.vp === 2,
  };
}

export function sourceDefinesCanonicalStarterIdentities(contents: string): boolean {
  return CANONICAL_STARTER_NAME_RE.test(contents);
}
