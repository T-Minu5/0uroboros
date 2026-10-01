import type { ContentDocument } from './contentModel';

export type IssueSection = 'cards' | 'locations' | 'circuitRewards';
/** One save-blocking problem from `validateContent`, located on an item, field and recipe step where possible. */
export type Issue = {
  section: IssueSection | null;
  itemId: string | null;
  itemName: string;
  /** `data-field` key of the control to focus: a property (`cost`), a recipe (`onReveal`) or a step (`onReveal.1`). */
  field: string | null;
  label: string;
  message: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', art: 'Artwork', cost: 'Cost', power: 'Power', vp: 'Victory points', cryptoValue: 'Crypto value',
  duration: 'Duration', durationPeriod: 'Duration period', cardClass: 'Card class', pool: 'Card type', type: 'Card type',
  effect: 'Printed text', storyText: 'Story text', powerSource: 'Power bonus', enabled: 'Enabled', generated: 'Generated',
  id: 'ID', definitionId: 'Definition ID', rule: 'Location text', reward: 'Location text', text: 'Reward text',
};
const HOOK_LABELS: Record<IssueSection, Record<string, string>> = {
  cards: { onReveal: 'On reveal', onCollapse: 'On collapse', recurring: 'Recurring' },
  locations: { effects: 'On collapse', ongoing: 'Ongoing', onPlay: 'On reveal' },
  circuitRewards: { effects: 'On claim', effect: 'On claim' },
};
const STEP_LABELS: Record<string, string> = {
  kind: 'Effect', amount: 'Count', target: 'Target', cardId: 'Card', formIds: 'Morph forms', selection: 'How forms are chosen',
  min: 'Minimum selections', prompt: 'Choice prompt', chooser: 'Who chooses', destination: 'Destination', boardSide: 'Side',
  cardPick: 'Card pick', direction: 'Direction', modifier: 'Modifier', options: 'Choice options', then: 'Follow-up steps',
};
const SECTION_NOUN: Record<IssueSection, string> = { cards: 'card', locations: 'Location', circuitRewards: 'Circuit reward' };

type Segment = { key: string; index?: number };

function segments(path: string): Segment[] {
  return path.split('.').filter(Boolean).map(part => {
    const match = /^([A-Za-z]+)(?:\[(\d+)\])?$/.exec(part);
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
    .replace(/^use 1–80 letters/, 'must use 1–80 letters');
}

function locate(section: IssueSection, path: Segment[]): { field: string | null; label: string } {
  const [first, second, third] = path;
  if (!first) return { field: null, label: '' };
  const hooks = HOOK_LABELS[section];
  const stepDetail = (segment?: Segment) => segment ? STEP_LABELS[segment.key] ?? segment.key : '';
  if (first.key === 'schedule' && first.index !== undefined) {
    const scheduleName = section === 'locations' ? `After-turn schedule ${first.index + 1}` : `Schedule ${first.index + 1}`;
    if (second?.key === 'effects' && second.index !== undefined) {
      return { field: `schedule.${first.index}.${second.index}`, label: [scheduleName, `step ${second.index + 1}`, stepDetail(third)].filter(Boolean).join(' · ') };
    }
    if (second?.key === 'effects') return { field: `schedule.${first.index}`, label: scheduleName };
    return { field: `schedule.${first.index}.${second?.key ?? 'at'}`, label: `${scheduleName} · ${second?.key === 'timing' ? 'Timing' : 'Turn'}` };
  }
  if (hooks[first.key]) {
    const hook = first.key === 'effect' ? 'effects' : first.key;
    if (first.index !== undefined) return { field: `${hook}.${first.index}`, label: [hooks[first.key], `step ${first.index + 1}`, stepDetail(second)].filter(Boolean).join(' · ') };
    return { field: hook, label: hooks[first.key] };
  }
  if (first.key === 'effectRefs' || first.key === 'effectIds' || first.key === 'effectId') return { field: null, label: 'Legacy shared recipe' };
  return { field: first.key, label: FIELD_LABELS[first.key] ?? first.key };
}

/** Turns `cards[57].schedule[0].effects[1].amount: ...` into "Iterative Incubus · Schedule 1 · step 2 · Count". */
export function describeIssues(document: ContentDocument, errors: readonly string[]): Issue[] {
  return errors.map(error => {
    const itemMatch = /^(cards|locations|circuitRewards)\[(\d+)\]((?:\.[^:\s]+)?): (.*)$/.exec(error);
    if (itemMatch) {
      const section = itemMatch[1] as IssueSection;
      const item = document[section][Number(itemMatch[2])];
      const { field, label } = locate(section, segments(itemMatch[3]));
      return { section, itemId: item?.id ?? null, itemName: item?.name || `Untitled ${SECTION_NOUN[section]}`, field, label, message: humanize(itemMatch[4]) };
    }
    const deckMatch = /^cards: (\S+) is referenced by the starting deck and must remain enabled as (\w+)$/.exec(error);
    if (deckMatch) {
      const card = document.cards.find(candidate => (candidate.definitionId ?? candidate.id) === deckMatch[1]);
      return { section: 'cards', itemId: card?.id ?? null, itemName: card?.name ?? deckMatch[1], field: card ? 'enabled' : null, label: 'Starting deck', message: `must stay enabled as a ${deckMatch[2]} card because the starting deck uses it` };
    }
    const sectionMatch = /^(cards|locations|circuitRewards): (.*)$/.exec(error);
    const section = sectionMatch ? sectionMatch[1] as IssueSection : null;
    return { section, itemId: null, itemName: section ? { cards: 'Cards', locations: 'Locations', circuitRewards: 'Circuit rewards' }[section] : 'Content', field: null, label: '', message: sectionMatch ? sectionMatch[2] : error };
  });
}
