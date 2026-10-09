/**
 * Every Location timing hook and the prefix its copy is written under. Prefixes print in white.
 * A new hook must be added here, so its prefix is recognised on the Location plate.
 */
export const LOCATION_TRIGGERS = {
 onReveal: {label: 'On reveal'},
 onCollapse: {label: 'On collapse'},
 ongoing: {label: 'Ongoing'},
 startTurn: {label: 'Start of turn'},
} as const satisfies Record<string, {label: string}>;
export type LocationTrigger = keyof typeof LOCATION_TRIGGERS;
export const LOCATION_TRIGGER_COLOR = '#ffffff';

/** The printed prefix, e.g. `On collapse:` or `Start of turn 3:`. */
export const locationTriggerPrefix = (trigger: LocationTrigger, turn?: number) =>
 `${LOCATION_TRIGGERS[trigger].label}${turn === undefined ? '' : ` ${turn}`}:`;

/** Effect phrases called out in colour on Location copy. */
export const LOCATION_EFFECT_COLORS = {
 draw: '#4185ff',
 actions: '#27e2ff',
 drain: '#fa0048',
 heal: '#ff8a1f',
 crypto: '#1fffb1',
 destroy: '#ff0ba1',
 trash: '#ff0ba1',
 powerUp: '#ffff00',
 powerDown: '#b24cff',
 victory: '#ffcc12',
 repair: '#ffcc12',
 reset: '#ffff00',
 transfer: '#ffff00',
 discard: '#c9b6ff',
 mill: '#c9b6ff',
 inspect: '#27e2ff',
 recover: '#27e2ff',
} as const;
export type LocationEffect = keyof typeof LOCATION_EFFECT_COLORS;

const NUMBER = String.raw`\d+(?:\.\d+)?`;
/** Patterns hold no capturing groups; each becomes one group of the combined matcher. */
const EFFECT_PATTERNS: Record<LocationEffect, string> = {
 draw: String.raw`\+${NUMBER} Cards?\b`,
 /* Before `heal`: older copy still words Server repair as "Restore server +N". */
 repair: String.raw`\bRepair \+${NUMBER}|\bRepair\b(?=[^.]*\+${NUMBER})|(?<=\bRepair\b[^.]*)\+${NUMBER}\b|\bRestore ${NUMBER}\b|\bRestore (?:both )?(?:your )?(?:primary |backup )?servers? \+${NUMBER}`,
 heal: String.raw`\bRestore \+${NUMBER}|\bRestore\b(?=[^.]*\+${NUMBER})|(?<=\bRestore\b[^.]*)\+${NUMBER}\b(?! (?:Power|Cards?|Actions?|Crypto|VP)\b)|\bHeal \+?${NUMBER}`,
 actions: String.raw`\+${NUMBER} Actions?\b`,
 drain: String.raw`\bDrain -?${NUMBER}`,
 crypto: String.raw`[+-]${NUMBER} Crypto\b|\bPay ${NUMBER} Crypto\b|\bSteal (?:an?|${NUMBER}) (?:random )?Crypto cards?\b`,
 destroy: String.raw`(?<!the )\bDestroy\b`,
 trash: String.raw`(?<!the |shared )\bTrash\b`,
 powerUp: String.raw`\+${NUMBER} Power\b`,
 powerDown: String.raw`-${NUMBER} Power\b|\bSteal ${NUMBER} Power\b`,
 victory: String.raw`\b(?:Give|Remove) ${NUMBER} Victory Points?\b|[+-]${NUMBER} (?:Victory Points?|VP)\b`,
 reset: String.raw`\bReset the Power of\b|\breset (?:its|their) Power\b`,
 transfer: String.raw`\b(?:Push or pull|Push|Pull|Shift) ${NUMBER} Power\b`,
 discard: String.raw`\bDiscard (?:up to )?(?:an?|${NUMBER}(?:–${NUMBER})?) cards?\b`,
 mill: String.raw`\bMill (?:an?|${NUMBER}) cards?\b`,
 inspect: String.raw`\bInspect the top (?:${NUMBER} )?cards?\b`,
 recover: String.raw`\bRecover (?:an?|${NUMBER}) (?:random )?cards?\b`,
};

const TRIGGERS = Object.entries(LOCATION_TRIGGERS) as [LocationTrigger, {label: string}][];
const EFFECTS = Object.keys(EFFECT_PATTERNS) as LocationEffect[];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A prefix followed by a colon takes the colon with it; older copy that follows it with a comma leaves the comma plain. */
const TRIGGER_PATTERN = String.raw`\b(?:${TRIGGERS.map(([, t]) => escape(t.label)).join('|')})(?:\s+\d+)?(?:\s*:|(?=\s*,))`;
const PATTERN = new RegExp([TRIGGER_PATTERN, ...EFFECTS.map(effect => EFFECT_PATTERNS[effect])].map(source => `(${source})`).join('|'), 'gi');

export type LocationTextPart = {text: string; trigger?: LocationTrigger; effect?: LocationEffect; color?: string};
/** Splits Location copy into plain runs, trigger prefixes and coloured effect phrases. */
export function splitLocationText(text: string): LocationTextPart[] {
 const parts: LocationTextPart[] = [];
 let last = 0;
 for (const match of text.matchAll(PATTERN)) {
  const at = match.index ?? 0;
  if (at > last) parts.push({text: text.slice(last, at)});
  if (match[1]) {
   const found = TRIGGERS.find(([, t]) => match[0].toLowerCase().startsWith(t.label.toLowerCase()));
   parts.push({text: match[0], trigger: found?.[0], color: LOCATION_TRIGGER_COLOR});
  } else {
   const effect = EFFECTS[match.slice(2).findIndex(Boolean)];
   parts.push({text: match[0], effect, color: LOCATION_EFFECT_COLORS[effect]});
  }
  last = at + match[0].length;
 }
 if (last < text.length) parts.push({text: text.slice(last)});
 return parts;
}
