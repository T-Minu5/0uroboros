import { useState } from 'react';
import type { AuthoredCard } from '@0uroboros/engine/authoring/contentModel';
import { CARD_CLASSES, type CardClass } from '@0uroboros/engine/game';
import {
  MULTIPLY_MAX, MULTIPLY_MIN, REFLECT_PERCENTS, describeTrigger,
  type CardTrigger, type ListenWhose, type TriggerEvent,
} from '@0uroboros/engine/effects/triggers';
import { StepList } from './StepEditor';

type Props = {
  card: AuthoredCard;
  cards: readonly AuthoredCard[];
  onChange: (triggers: CardTrigger[] | undefined) => void;
};

const KINDS: { id: CardTrigger['kind']; label: string }[] = [
  { id: 'mirrorCrypto', label: 'Mirror crypto' },
  { id: 'reflectDrain', label: 'Reflect Drain' },
  { id: 'protectPower', label: 'Protect power' },
  { id: 'protectCrypto', label: 'Protect Crypto' },
  { id: 'protectDestroy', label: 'Protect from destroy' },
  { id: 'protectDeckAccess', label: 'Protect deck access' },
  { id: 'multiplyNode', label: 'Multiply node power' },
  { id: 'listenAccess', label: 'Listen (deck access)' },
  { id: 'whenPlayed', label: 'To me my X-men (when played)' },
  { id: 'when', label: 'When (resource formula)' },
];

const WHEN_EVENTS: { id: TriggerEvent; label: string }[] = [
  { id: 'anyCardDestroyed', label: 'Any card destroyed' },
  { id: 'enemyDraws', label: 'Enemy draws' },
  { id: 'enemyDrainsYou', label: 'Enemy Drains you' },
  { id: 'enemyDrainsBackup', label: 'Enemy Drains your Backup' },
  { id: 'serverRepaired', label: 'Server repaired' },
  { id: 'cardTrashedHere', label: 'Card trashed here' },
  { id: 'cardTrashedThisCycle', label: 'Card trashed this Cycle' },
  { id: 'cardMoved', label: 'Card moved' },
  { id: 'cardMovedHere', label: 'Card moved here' },
  { id: 'handDiscarded', label: 'Hand discarded' },
];

const ACTOR_EVENTS = new Set<TriggerEvent>(['serverRepaired', 'cardTrashedThisCycle', 'cardMoved', 'handDiscarded']);

const LISTEN: { id: ListenWhose; label: string }[] = [
  { id: 'enemyAccessesYours', label: 'Enemy accesses your deck' },
  { id: 'youAccessYours', label: 'You access your deck' },
  { id: 'youAccessEnemy', label: 'You access enemy deck' },
];

const definitionId = (card: AuthoredCard) => card.definitionId ?? card.id;

function defaultTrigger(kind: CardTrigger['kind']): CardTrigger {
  switch (kind) {
    case 'mirrorCrypto': return { kind };
    case 'protectPower': return { kind };
    case 'protectCrypto': return { kind };
    case 'protectDestroy': return { kind };
    case 'protectDeckAccess': return { kind };
    case 'reflectDrain': return { kind, percent: 25, random: false };
    case 'multiplyNode': return { kind, min: MULTIPLY_MIN, max: MULTIPLY_MAX, random: true };
    case 'listenAccess': return { kind, whose: 'enemyAccessesYours', then: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }] };
    case 'whenPlayed': return { kind, match: {}, scope: 'thisNode', then: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }] };
    case 'when': return { kind, event: 'anyCardDestroyed', then: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }] };
  }
}

type WhenPlayed = Extract<CardTrigger, { kind: 'whenPlayed' }>;

/** Checkbox list of cards that fire whenPlayed (OR). Empty = any / subtype only. */
function WhenPlayedCardPicker({
  trigger, cards, onChange,
}: {
  trigger: WhenPlayed;
  cards: readonly AuthoredCard[];
  onChange: (match: WhenPlayed['match']) => void;
}) {
  const [search, setSearch] = useState('');
  const available = cards.filter(card => card.enabled !== false);
  const values = [
    ...(trigger.match.definitionId ? [trigger.match.definitionId] : []),
    ...(trigger.match.definitionIds ?? []),
  ];
  const matching = available
    .filter(card => `${card.name} ${definitionId(card)}`.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 48);
  const write = (ids: readonly string[], keepClass = false) => {
    const unique = [...new Set(ids)];
    if (!unique.length) {
      onChange(keepClass
        ? { cardClass: trigger.match.cardClass, cardType: trigger.match.cardType }
        : {});
      return;
    }
    onChange(unique.length === 1
      ? { definitionId: unique[0] }
      : { definitionIds: unique });
  };
  const toggle = (id: string, checked: boolean) => write(checked ? [...values, id] : values.filter(value => value !== id));
  return <div className="au-morph-forms au-step-wide" data-field="whenPlayed-cards">
    <p className="au-recipe-help">Tick every card that should fire this Ongoing (e.g. each Glitch and Liaison). Leave empty to use subtype / any card.</p>
    <div className="au-morph-sequence">
      <b>{values.length ? `Watching ${values.length} card${values.length === 1 ? '' : 's'}` : 'Named cards (optional)'}</b>
      {values.map(id => {
        const entry = available.find(card => definitionId(card) === id);
        return <div className="au-morph-sequence-item" key={id}>
          <span>{entry?.name ?? id}</span>
          <button type="button" aria-label={`Remove ${entry?.name ?? id}`} onClick={() => toggle(id, false)}>×</button>
        </div>;
      })}
    </div>
    <label className="au-recipe-field au-step-wide"><span>Find cards</span>
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or id" />
    </label>
    <div className="au-morph-grid">
      {matching.map(card => <label className="au-morph-form" key={definitionId(card)}>
        <input type="checkbox" checked={values.includes(definitionId(card))} onChange={event => toggle(definitionId(card), event.target.checked)} />
        {card.art && <img src={card.art} alt="" />}
        <span>{card.name}</span>
      </label>)}
    </div>
  </div>;
}

/** Card Ongoing rules editor (reactive triggers while revealed). */
export function TriggersEditor({ card, cards, onChange }: Props) {
  const triggers = [...(card.triggers ?? [])];
  const replace = (index: number, next: CardTrigger) => {
    const list = triggers.map((entry, at) => at === index ? next : entry);
    onChange(list);
  };
  const remove = (index: number) => onChange(triggers.filter((_, at) => at !== index).length ? triggers.filter((_, at) => at !== index) : undefined);
  return <div className="au-triggers" data-field="triggers">
    <div className="au-schedule-heading">
      <h3>Ongoing</h3>
      <p className="au-recipe-help">While revealed, unless the Location silences Ongoing. Separate from Recurring.</p>
      <select aria-label="Add Ongoing" defaultValue="" onChange={event => {
        const kind = event.target.value as CardTrigger['kind'];
        if (!kind) return;
        onChange([...triggers, defaultTrigger(kind)]);
        event.target.value = '';
      }}>
        <option value="">+ Add Ongoing…</option>
        {KINDS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>
    </div>
    {triggers.map((trigger, index) => <div className="au-schedule" key={index} data-field={`triggers.${index}`}>
      <div className="au-schedule-fields au-field-grid">
        <label><span>Rule</span><strong>{describeTrigger(trigger)}</strong></label>
        {trigger.kind === 'reflectDrain' && <>
          <label><span>Percent</span>
            <select value={trigger.percent} disabled={!!trigger.random} onChange={event => replace(index, { ...trigger, percent: Number(event.target.value) })}>
              {REFLECT_PERCENTS.map(value => <option key={value} value={value}>{value}%</option>)}
            </select>
          </label>
          <label className="au-recipe-check"><input type="checkbox" checked={!!trigger.random} onChange={event => replace(index, { ...trigger, random: event.target.checked })} /><span>Random each time</span></label>
        </>}
        {trigger.kind === 'multiplyNode' && <>
          <label><span>Min ×</span><input type="number" min={MULTIPLY_MIN} max={MULTIPLY_MAX} step={0.05} value={trigger.min} onChange={event => replace(index, { ...trigger, min: Math.min(MULTIPLY_MAX, Math.max(MULTIPLY_MIN, Number(event.target.value) || MULTIPLY_MIN)) })} /></label>
          <label><span>Max ×</span><input type="number" min={MULTIPLY_MIN} max={MULTIPLY_MAX} step={0.05} value={trigger.max} onChange={event => replace(index, { ...trigger, max: Math.min(MULTIPLY_MAX, Math.max(MULTIPLY_MIN, Number(event.target.value) || MULTIPLY_MAX)) })} /></label>
          <label className="au-recipe-check"><input type="checkbox" checked={trigger.random} onChange={event => replace(index, { ...trigger, random: event.target.checked })} /><span>Random in range</span></label>
        </>}
        {trigger.kind === 'listenAccess' && <label><span>When</span>
          <select value={trigger.whose} onChange={event => replace(index, { ...trigger, whose: event.target.value as ListenWhose })}>
            {LISTEN.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </label>}
        {trigger.kind === 'when' && <>
          <label><span>When</span>
            <select value={trigger.event} onChange={event => replace(index, { ...trigger, event: event.target.value as typeof trigger.event, actor: undefined, serverWhose: undefined })}>
              {WHEN_EVENTS.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          {ACTOR_EVENTS.has(trigger.event) && <label><span>Who</span>
            <select value={trigger.actor ?? 'any'} onChange={event => replace(index, { ...trigger, actor: event.target.value === 'any' ? undefined : event.target.value as 'self' | 'opponent' })}>
              <option value="any">Anyone</option>
              <option value="self">You</option>
              <option value="opponent">Enemy</option>
            </select>
          </label>}
          {trigger.event === 'serverRepaired' && <label><span>Whose Server</span>
            <select value={trigger.serverWhose ?? 'any'} onChange={event => replace(index, { ...trigger, serverWhose: event.target.value === 'any' ? undefined : event.target.value as 'self' | 'opponent' })}>
              <option value="any">Any</option>
              <option value="self">Yours</option>
              <option value="opponent">Enemy</option>
            </select>
          </label>}
        </>}
        {trigger.kind === 'whenPlayed' && <>
          <label><span>Subtype</span>
            <select
              value={trigger.match.cardType === 'Crypto' ? 'Crypto' : (trigger.match.cardClass ?? '')}
              disabled={!!(trigger.match.definitionId || trigger.match.definitionIds?.length)}
              onChange={event => {
                const value = event.target.value;
                if (value === 'Crypto') {
                  replace(index, { ...trigger, match: { cardType: 'Crypto' } });
                } else if (!value) {
                  replace(index, { ...trigger, match: {} });
                } else {
                  replace(index, { ...trigger, match: { cardClass: value as CardClass } });
                }
              }}
            >
              <option value="">Any (or pick cards below)</option>
              {CARD_CLASSES.map(value => <option key={value} value={value}>{value}</option>)}
              <option value="Crypto">Crypto</option>
            </select>
          </label>
          <label><span>Scope</span>
            <select value={trigger.scope} onChange={event => replace(index, { ...trigger, scope: event.target.value as 'thisNode' | 'cycle' })}>
              <option value="thisNode">Same Location</option>
              <option value="cycle">This Cycle</option>
            </select>
          </label>
          <WhenPlayedCardPicker
            trigger={trigger}
            cards={cards}
            onChange={match => replace(index, { ...trigger, match })}
          />
        </>}
        <button type="button" className="au-button au-button-subtle au-schedule-remove" onClick={() => remove(index)}>Remove</button>
      </div>
      {(trigger.kind === 'when' || trigger.kind === 'whenPlayed' || trigger.kind === 'listenAccess') && (
        <StepList
          field={`triggers.${index}.then`}
          title="Then"
          description="Benefit when the Ongoing fires."
          steps={trigger.then}
          scope="card"
          cards={cards}
          onChange={then => replace(index, { ...trigger, then })}
        />
      )}
    </div>)}
  </div>;
}
