/**
 * Every Location timing hook, with the prefix its copy is written under and the colour that prefix is shown in.
 * A new hook must be added here, so it cannot reach a Location plate without a colour.
 */
export const LOCATION_TRIGGERS = {
 onReveal: {label: 'On reveal', color: '#1fffb1'},
 onCollapse: {label: 'On collapse', color: '#ff0ba1'},
 ongoing: {label: 'Ongoing', color: '#27e2ff'},
 afterTurn: {label: 'After turn', color: '#ff8a1f'},
} as const satisfies Record<string, {label: string; color: string}>;
export type LocationTrigger = keyof typeof LOCATION_TRIGGERS;

/** The printed prefix, e.g. `On collapse:` or `After turn 3:`. */
export const locationTriggerPrefix = (trigger: LocationTrigger, turn?: number) =>
 `${LOCATION_TRIGGERS[trigger].label}${turn === undefined ? '' : ` ${turn}`}:`;

const TRIGGERS = Object.entries(LOCATION_TRIGGERS) as [LocationTrigger, {label: string; color: string}][];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A prefix followed by a colon takes the colon with it; older copy that follows it with a comma leaves the comma plain. */
const PATTERN = new RegExp(`\\b(?:${TRIGGERS.map(([, t]) => escape(t.label)).join('|')})(?:\\s+\\d+)?(?:\\s*:|(?=\\s*,))`, 'gi');

export type LocationTextPart = {text: string; trigger?: LocationTrigger};
/** Splits Location copy into plain runs and trigger prefixes. */
export function splitLocationTriggers(text: string): LocationTextPart[] {
 const parts: LocationTextPart[] = [];
 let last = 0;
 for (const match of text.matchAll(PATTERN)) {
  const at = match.index ?? 0;
  if (at > last) parts.push({text: text.slice(last, at)});
  const found = TRIGGERS.find(([, t]) => match[0].toLowerCase().startsWith(t.label.toLowerCase()));
  parts.push({text: match[0], trigger: found?.[0]});
  last = at + match[0].length;
 }
 if (last < text.length) parts.push({text: text.slice(last)});
 return parts;
}
