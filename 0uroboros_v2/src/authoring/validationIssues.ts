import type { ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { builtinMod } from '@0uroboros/engine/builtinMods';
import type { ModifierKind } from '@0uroboros/engine/effects/types';

export type IssueSection = 'cards' | 'locations' | 'circuitRewards' | 'mods' | 'startingDecks';
/** One save-blocking problem from `validateContent`, located on an item, field and recipe step where possible. */
export type Issue = {
  section: IssueSection | null;
  itemId: string | null;
  itemName: string;
  /** `data-field` key of the control to focus: a property (`cost`), a recipe (`onReveal`) or a step (`onReveal.1`, `onReveal.0.options.1.effects.0`). */
  field: string | null;
  label: string;
  message: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', art: 'Artwork', cost: 'Cost', power: 'Power', vp: 'Victory points', cryptoValue: 'Crypto value',
  duration: 'Duration', durationPeriod: 'Duration period', cardClass: 'Card class', pool: 'Card type', type: 'Card type',
  effect: 'Printed text', storyText: 'Story text', powerSource: 'Power bonus', aura: 'Power aura', selfMove: 'Moves itself', enabled: 'Enabled', generated: 'Generated',
  id: 'ID', definitionId: 'Definition ID', rule: 'Location text', reward: 'Location text', text: 'Reward text',
};
const BUILTIN_FIELD_LABELS: Record<string, string> = { name: 'Name', badge: 'Badge', text: 'Mod text' };
const HOOK_LABELS: Record<IssueSection, Record<string, string>> = {
  cards: { onReveal: 'On reveal', onCollapse: 'On collapse', recurring: 'Recurring' },
  locations: { effects: 'On collapse', ongoing: 'Ongoing', onPlay: 'On reveal', startTurn2: 'Start of turn 2', startTurn3: 'Start of turn 3', conditions: 'Conditions' },
  circuitRewards: { effects: 'On claim' },
  mods: { onReveal: 'When revealed', onCollapse: 'When its Location collapses', recurring: 'Each later Runtime turn' },
  startingDecks: {},
};
const STEP_LABELS: Record<string, string> = {
  action: 'Effect', amount: 'Amount', target: 'Target', pick: 'Pick', cardId: 'Card', formIds: 'Morph forms', selection: 'How forms are chosen',
  optional: 'Optional', min: 'Minimum selections', prompt: 'Choice prompt', choose: 'How many and who picks', destination: 'Destination',
  direction: 'Direction', flow: 'Flow', modifier: 'Mod', options: 'Choice options', then: 'Then', label: 'Option label', id: 'Option ID',
};
const SECTION_NOUN: Record<IssueSection, string> = { cards: 'card', locations: 'Location', circuitRewards: 'Circuit reward', mods: 'card mod', startingDecks: 'starting deck' };
const SECTION_TITLE: Record<IssueSection, string> = { cards: 'Cards', locations: 'Locations', circuitRewards: 'Circuit rewards', mods: 'Card mods', startingDecks: 'Starting decks' };

type Segment = { key: string; index?: number };

function segments(path: string): Segment[] {
  return path.split('.').filter(Boolean).map(part => {
    const match = /^([A-Za-z][A-Za-z0-9]*)(?:\[(\d+)\])?$/.exec(part);
    return match ? { key: match[1], index: match[2] === undefined ? undefined : Number(match[2]) } : { key: part };
  });
}

function humanize(message: string) {
  return message
    .replace(/^required text, at most (\d+) characters$/, 'can’t be empty (up to $1 characters)')
    .replace(/^expected integer from (-?\d+) to (-?\d+)$/, 'use a whole number from $1 to $2')
    .replace(/^must be a finite number from (-?\d+) to (-?\d+)$/, 'use a number from $1 to $2')
    .replace(/^unknown card (.+)$/, 'points to a card that is missing or disabled ($1)')
    .replace(/^unknown or disabled form card (.+)$/, 'uses a form that is missing or disabled ($1)')
    .replace(/^unknown or disabled mod (.+)$/, 'points to a mod that is missing or disabled ($1)')
    .replace(/^use 1–80 letters/, 'must use 1–80 letters');
}

/** Follows `options[1].effects[0].then[2]…` below a step, building the step's `data-field` key and label. */
function nestedStep(field: string, label: string[], rest: Segment[]): { field: string; label: string } {
  let at = 0;
  while (at < rest.length) {
    const segment = rest[at];
    if (segment.key === 'then' && segment.index !== undefined) { field += `.then.${segment.index}`; label.push(`then step ${segment.index + 1}`); at++; continue; }
    if (segment.key === 'options' && segment.index !== undefined) {
      const list = rest[at + 1];
      if ((list?.key === 'effects' || list?.key === 'cost') && list.index !== undefined) {
        field += `.options.${segment.index}.${list.key}.${list.index}`;
        label.push(`option ${segment.index + 1}`, `${list.key === 'cost' ? 'cost' : ''} step ${list.index + 1}`.trim());
        at += 2; continue;
      }
      label.push(`option ${segment.index + 1}`, ...(list ? [STEP_LABELS[list.key] ?? list.key] : []));
      return { field, label: label.join(' · ') };
    }
    label.push(STEP_LABELS[segment.key] ?? segment.key);
    break;
  }
  return { field, label: label.join(' · ') };
}

function locate(section: IssueSection, path: Segment[]): { field: string | null; label: string } {
  const [first, second] = path;
  if (!first) return { field: null, label: '' };
  const hooks = HOOK_LABELS[section];
  if (section === 'startingDecks' && first.key === 'cards') return first.index === undefined ? { field: 'cards', label: 'Cards' } : { field: `cards.${first.index}`, label: `Card ${first.index + 1}${second?.key === 'count' ? ' · Copies' : ''}` };
  if (first.key === 'schedule' && first.index !== undefined) {
    const scheduleName = `Schedule ${first.index + 1}`;
    if (second?.key === 'effects' && second.index !== undefined) return nestedStep(`schedule.${first.index}.${second.index}`, [scheduleName, `step ${second.index + 1}`], path.slice(2));
    if (second?.key === 'effects') return { field: `schedule.${first.index}`, label: scheduleName };
    return { field: `schedule.${first.index}.${second?.key ?? 'at'}`, label: `${scheduleName} · ${second?.key === 'timing' ? 'Timing' : 'Turn'}` };
  }
  if (hooks[first.key]) {
    if (first.index !== undefined) return nestedStep(`${first.key}.${first.index}`, [hooks[first.key], `step ${first.index + 1}`], path.slice(1));
    return { field: first.key, label: hooks[first.key] };
  }
  return { field: first.key, label: FIELD_LABELS[first.key] ?? first.key };
}

/** Turns `cards[57].schedule[0].effects[1].amount: ...` into "Iterative Incubus · Schedule 1 · step 2 · Count". */
export function describeIssues(document: ContentDocument, errors: readonly string[]): Issue[] {
  return errors.map(error => {
    const itemMatch = /^(cards|locations|circuitRewards|mods|startingDecks)\[(\d+)\]((?:\.[^:\s]+)?): (.*)$/.exec(error);
    if (itemMatch) {
      const section = itemMatch[1] as IssueSection;
      const item = document[section]?.[Number(itemMatch[2])];
      const { field, label } = locate(section, segments(itemMatch[3]));
      return { section, itemId: item?.id ?? null, itemName: item?.name || `Untitled ${SECTION_NOUN[section]}`, field, label, message: humanize(itemMatch[4]) };
    }
    const requiredCard = /^cards: (\S+) is (used by the default starting deck|a Draft currency) and must remain enabled/.exec(error);
    if (requiredCard) {
      const card = document.cards.find(candidate => (candidate.definitionId ?? candidate.id) === requiredCard[1]);
      const currency = requiredCard[2] === 'a Draft currency';
      return { section: 'cards', itemId: card?.id ?? null, itemName: card?.name ?? requiredCard[1], field: card ? 'enabled' : null, label: currency ? 'Draft currency' : 'Starting deck', message: currency ? 'must stay an enabled, non-Generated Crypto card because every Draft sells it' : 'must stay enabled because the starting deck uses it' };
    }
    const builtin = /^builtinMods\.([A-Za-z]+)\.(name|badge|text): (.*)$/.exec(error);
    if (builtin) return { section: 'mods', itemId: builtin[1], itemName: builtinMod(builtin[1] as ModifierKind).name, field: `builtinMods.${builtin[1]}.${builtin[2]}`, label: BUILTIN_FIELD_LABELS[builtin[2]], message: humanize(builtin[3]) };
    if (error.startsWith('activeStartingDeckId: ')) return { section: 'startingDecks', itemId: null, itemName: 'Starting decks', field: null, label: '', message: error.slice('activeStartingDeckId: '.length) };
    const sectionMatch = /^(cards|locations|circuitRewards|mods|startingDecks): (.*)$/.exec(error);
    const section = sectionMatch ? sectionMatch[1] as IssueSection : null;
    return { section, itemId: null, itemName: section ? SECTION_TITLE[section] : 'Content', field: null, label: '', message: sectionMatch ? sectionMatch[2] : error };
  });
}
