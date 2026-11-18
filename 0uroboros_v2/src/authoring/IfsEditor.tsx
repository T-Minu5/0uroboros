import type { AuthoredCard } from '@0uroboros/engine/authoring/contentModel';
import { CARD_CLASSES, type CardClass, type CardType } from '@0uroboros/engine/game';
import {
  CARD_IF_KINDS, describeCardIf, type CardIf, type IfRevealScope, type NodeOutcome,
} from '@0uroboros/engine/effects/cardIfs';
import { StepList } from './StepEditor';

type Props = {
  card: AuthoredCard;
  cards: readonly AuthoredCard[];
  onChange: (ifs: CardIf[] | undefined) => void;
};

const KIND_LABELS: Record<CardIf['kind'], string> = {
  firstRevealed: 'First revealed',
  lastRevealed: 'Last revealed this Cycle',
  enemyPlayedHere: 'Enemy played here',
  twoAtLocation: 'Second copy at this Location',
  nodeOutcome: 'Node outcome',
};

type MatchShape = { definitionId?: string; cardClass?: CardClass; cardType?: CardType; this?: boolean };

function defaultIf(kind: CardIf['kind']): CardIf {
  const then = [{ action: 'gainCrypto' as const, amount: 1, target: { type: 'player' as const, who: 'self' as const } }];
  switch (kind) {
    case 'firstRevealed': return { kind, scope: 'cycle', then };
    case 'lastRevealed': return { kind, scope: 'cycle', then };
    case 'enemyPlayedHere': return { kind, match: {}, then };
    case 'twoAtLocation': return { kind, match: { this: true }, then };
    case 'nodeOutcome': return { kind, outcome: 'win', then };
  }
}

function matchSelectValue(kind: CardIf['kind'], match: MatchShape | undefined): string {
  if (kind === 'twoAtLocation' && (match?.this || (!match?.definitionId && !match?.cardClass && !match?.cardType))) {
    return 'this';
  }
  if (match?.cardType === 'Crypto') return 'Crypto';
  if (match?.cardClass) return match.cardClass;
  return 'any';
}

/** Card-level If bus editor (parallel to Ongoing). */
export function IfsEditor({ card, cards, onChange }: Props) {
  const rules = [...(card.ifs ?? [])];
  const replace = (index: number, next: CardIf) => {
    onChange(rules.map((entry, at) => at === index ? next : entry));
  };
  const remove = (index: number) => {
    const next = rules.filter((_, at) => at !== index);
    onChange(next.length ? next : undefined);
  };
  return <div className="au-triggers" data-field="ifs">
    <div className="au-schedule-heading">
      <h3>If</h3>
      <p className="au-recipe-help">Moment checks on this card (reveal / Collapse). Parallel to Ongoing.</p>
      <select aria-label="Add If" defaultValue="" onChange={event => {
        const kind = event.target.value as CardIf['kind'];
        if (!kind) return;
        onChange([...rules, defaultIf(kind)]);
        event.target.value = '';
      }}>
        <option value="">+ Add If…</option>
        {CARD_IF_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
      </select>
    </div>
    {rules.map((rule, index) => <div className="au-schedule" key={index} data-field={`ifs.${index}`}>
      <div className="au-schedule-fields au-field-grid">
        <label><span>Rule</span><strong>{describeCardIf(rule)}</strong></label>
        {rule.kind === 'firstRevealed' && <label><span>Scope</span>
          <select value={rule.scope} onChange={event => replace(index, { ...rule, scope: event.target.value as IfRevealScope })}>
            <option value="turn">This turn</option>
            <option value="cycle">This Cycle</option>
            <option value="thisNode">This Location</option>
          </select>
        </label>}
        {rule.kind === 'nodeOutcome' && <label><span>Outcome</span>
          <select value={rule.outcome} onChange={event => replace(index, { ...rule, outcome: event.target.value as NodeOutcome })}>
            <option value="win">Win</option>
            <option value="lose">Lose</option>
            <option value="tie">Tie</option>
          </select>
        </label>}
        {(rule.kind === 'enemyPlayedHere' || rule.kind === 'twoAtLocation') && <>
          <label><span>Which card</span>
            <select
              value={matchSelectValue(rule.kind, rule.match)}
              onChange={event => {
                const value = event.target.value;
                if (rule.kind === 'twoAtLocation' && value === 'this') {
                  replace(index, { ...rule, match: { this: true } });
                  return;
                }
                if (value === 'any') {
                  replace(index, { ...rule, match: {} });
                  return;
                }
                if (value === 'Crypto') {
                  replace(index, { ...rule, match: { cardType: 'Crypto' } });
                  return;
                }
                replace(index, { ...rule, match: { cardClass: value as CardClass } });
              }}
            >
              {rule.kind === 'twoAtLocation' && <option value="this">This card</option>}
              <option value="any">{rule.kind === 'enemyPlayedHere' ? 'Any enemy card' : 'Any / use card id'}</option>
              {CARD_CLASSES.map(value => <option key={value} value={value}>{value}</option>)}
              <option value="Crypto">Crypto</option>
            </select>
          </label>
          <label><span>Or specific card id</span>
            <input
              value={rule.match?.definitionId ?? ''}
              onChange={event => {
                const definitionId = event.target.value.trim() || undefined;
                if (!definitionId) {
                  // Clearing the id returns to any (enemy) or this-card (two at Location).
                  if (rule.kind === 'enemyPlayedHere') replace(index, { ...rule, match: {} });
                  else if (rule.kind === 'twoAtLocation') replace(index, { ...rule, match: { this: true } });
                  return;
                }
                replace(index, { ...rule, match: { definitionId } });
              }}
              placeholder="Leave empty for any / subtype"
            />
          </label>
        </>}
        <button type="button" className="au-button au-button-subtle au-schedule-remove" onClick={() => remove(index)}>Remove</button>
      </div>
      <StepList
        field={`ifs.${index}.then`}
        title="Then"
        description="Benefit when the If matches."
        steps={rule.then}
        scope="card"
        cards={cards}
        onChange={then => replace(index, { ...rule, then })}
      />
    </div>)}
  </div>;
}
