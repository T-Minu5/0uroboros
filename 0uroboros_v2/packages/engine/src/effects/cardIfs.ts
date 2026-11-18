import type { CardClass, CardType } from '../game';
import type { EffectStep } from './types';

/** Window for first/last reveal If checks. */
export type IfRevealScope = 'turn' | 'cycle' | 'thisNode';
export type NodeOutcome = 'win' | 'lose' | 'tie';

/**
 * Card-level If bus (parallel to Ongoing triggers). Host is the card that carries the rule.
 * Evaluated at natural moments: own reveal, second matching reveal, or Node Collapse.
 */
export type CardIf =
  | {
      kind: 'firstRevealed';
      scope: IfRevealScope;
      then: EffectStep[];
    }
  | {
      kind: 'lastRevealed';
      /** Only `cycle` is authored today (fires at end of the Cycle’s last reveal). */
      scope: 'cycle';
      then: EffectStep[];
    }
  | {
      kind: 'enemyPlayedHere';
      match: { definitionId?: string; cardClass?: CardClass; cardType?: CardType };
      then: EffectStep[];
    }
  | {
      kind: 'twoAtLocation';
      /** Omit / `{ this: true }` = same definition as the host. */
      match?: { this?: boolean; definitionId?: string; cardClass?: CardClass; cardType?: CardType };
      then: EffectStep[];
    }
  | {
      kind: 'nodeOutcome';
      outcome: NodeOutcome;
      then: EffectStep[];
    };

export const CARD_IF_KINDS = [
  'firstRevealed', 'lastRevealed', 'enemyPlayedHere', 'twoAtLocation', 'nodeOutcome',
] as const;
export type CardIfKind = typeof CARD_IF_KINDS[number];

export function describeCardIf(rule: CardIf): string {
  switch (rule.kind) {
    case 'firstRevealed': {
      const where = rule.scope === 'thisNode' ? 'at this Location' : `this ${rule.scope}`;
      return `If: First card revealed ${where}`;
    }
    case 'lastRevealed':
      return 'If: Last card revealed this Cycle';
    case 'enemyPlayedHere': {
      if (rule.match.definitionId) return `If: Enemy plays card ${rule.match.definitionId} here`;
      if (rule.match.cardType) return `If: Enemy plays a ${rule.match.cardType} card here`;
      if (rule.match.cardClass) return `If: Enemy plays a ${rule.match.cardClass} card here`;
      return 'If: Enemy plays any card here';
    }
    case 'twoAtLocation': {
      const m = rule.match;
      const match = !m || m.this || (!m.definitionId && !m.cardClass && !m.cardType) ? 'this card'
        : m.definitionId ? `card ${m.definitionId}`
        : m.cardType ? `${m.cardType} card`
        : m.cardClass ? `${m.cardClass} card` : 'matching card';
      return `If: When you reveal a second ${match} at this Location`;
    }
    case 'nodeOutcome':
      return `If: You ${rule.outcome === 'tie' ? 'tie' : rule.outcome} this Node`;
  }
}

export function isCardIf(value: unknown): value is CardIf {
  if (!value || typeof value !== 'object') return false;
  return CARD_IF_KINDS.includes((value as CardIf).kind as CardIfKind);
}
