/**
 * Binding presentation principles for the product reset.
 * Marvel Snap → sequencing. Hearthstone → motion weight.
 * Theme firewall: no Snap/HS palette or chrome.
 */

export const SNAP_SEQUENCING = {
  id: 'snap-sequencing',
  source: 'Marvel Snap resolution pacing',
  rules: [
    'One active presentation event at a time',
    'Cause resolves before consequence is shown',
    'Nodes resolve in order with a readable gap between them',
    'Global phases (Turn, Draft, Wave Collapse title) may announce globally',
    'Local card/Location/Drain effects resolve at their world objects',
  ],
} as const;

export const HEARTHSTONE_WEIGHT = {
  id: 'hearthstone-weight',
  source: 'Hearthstone attack / card dynamics (principle only)',
  rules: [
    'Deploy and strike use anticipation before contact',
    'Contact is a distinct beat (scale/impact), not a teleport',
    'Follow-through settles the card into rest',
    'Idle/hover may breathe lightly without stealing focus',
  ],
} as const;

/** Easing for heavy card travel (WAAPI). */
export const WEIGHT_EASE = 'cubic-bezier(0.33, 0.0, 0.2, 1)';
export const IMPACT_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
