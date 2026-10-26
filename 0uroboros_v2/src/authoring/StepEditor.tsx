import { createContext, useContext, useState, type ReactNode } from 'react';
import { CARD_CLASSES, VP_CLASSES, type Card, type CardType } from '@0uroboros/engine/game';
import { builtinMod } from '@0uroboros/engine/builtinMods';
import {
  ACTIONS, COST_ACTIONS, DESTINATION_LABELS, EDITOR_ENTRIES, EDITOR_GROUPS, MAX_DEPTH, PICK_LABELS, RELATION_LABELS, SERVER_LABELS,
  TARGET_TYPE_LABELS, WHERE_LABELS, ZONE_LABELS,
  actionsFor, applyEditorEntry, applyTargetChoice, clampAmount, currentTargetChoice, editorEntryFor, targetChoicesFor, createStep, defaultTarget, describeStep, matchTargetSpec, targetsFor, whoChoices, whoLabel,
  type TargetSpec,
} from '@0uroboros/engine/effects/catalog';
import {
  BUILTIN_MODIFIERS, DECK_ENDS, filterClasses, isBuiltinModifier, scopedWho,
  type CardClass, type CardFilter, type ChoiceOption, type EffectStep, type ModDefinition, type PickMode, type Relation, type Scope, type Target, type Who,
} from '@0uroboros/engine/effects/types';
import { NumberInput } from './NumberInput';
import { useEditorFocus } from './editorContext';
import './recipe-editor.css';

type CatalogCard = Card & { enabled?: boolean; generated?: boolean };
const definitionId = (card: CatalogCard) => card.definitionId ?? card.id;
const enabledCards = (cards: readonly CatalogCard[]) => cards.filter(card => card.enabled !== false);
const CARD_TYPES: readonly CardType[] = ['Character', 'VP', 'Crypto'];
const THEN_HELP = 'Runs only after this step resolves. If it is skipped, declined, or finds no target, these are cancelled.';

/** Enabled authored mods, offered by Attach and Remove steps and named in step summaries. */
export const ModsContext = createContext<readonly ModDefinition[]>([]);

/* ---------------------------------------------------------------- small controls */

function Select<T extends string>({ label, value, options, labels, onChange, disabled }: { label: string; value: T; options: readonly T[]; labels?: Partial<Record<T, string>>; onChange: (value: T) => void; disabled?: boolean }) {
  return <label className="au-recipe-field"><span>{label}</span>
    <select aria-label={label} value={value} disabled={disabled || options.length < 2} onChange={event => onChange(event.target.value as T)}>
      {!options.includes(value) && <option value={value}>{labels?.[value] ?? value} (not allowed here)</option>}
      {options.map(option => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
    </select>
  </label>;
}

function ModifierPicker({ step, onChange }: { step: EffectStep; onChange: (changes: Partial<EffectStep>) => void }) {
  const mods = useContext(ModsContext);
  const removing = step.action === 'removeModifier';
  const value = step.modifier ?? (removing ? '' : 'doublePrintedEffects');
  const known = value === '' || isBuiltinModifier(value) || mods.some(mod => mod.id === value);
  const pick = (next: string) => onChange(removing ? { modifier: next || undefined } : { modifier: next, amount: next === 'powerAuraAtLocation' ? step.amount ?? 1 : undefined });
  const label = removing ? 'Mods to remove' : 'Mod';
  return <div className="au-step-grid"><label className="au-recipe-field"><span>{label}</span>
    <select aria-label={label} value={value} onChange={event => pick(event.target.value)}>
      {!known && <option value={value}>Unavailable mod ({value})</option>}
      {removing && <option value="">Every mod</option>}
      {mods.length > 0 && <optgroup label="Card mods">{mods.map(mod => <option key={mod.id} value={mod.id}>{mod.name}</option>)}</optgroup>}
      <optgroup label="Built-in">{BUILTIN_MODIFIERS.map(kind => <option key={kind} value={kind}>{builtinMod(kind).name}</option>)}</optgroup>
    </select>
    {!removing && !mods.length && <small>Author your own in the Card mods section.</small>}
  </label></div>;
}

function CardDefinitionPicker({ label, cards, value, onChange }: { label: string; cards: readonly CatalogCard[]; value?: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const selected = cards.find(card => definitionId(card) === value);
  const allMatching = cards.filter(card => `${card.name} ${definitionId(card)}`.toLowerCase().includes(search.toLowerCase()));
  const matching = allMatching.slice(0, 60);
  return <div className="au-recipe-catalog">
    <label className="au-recipe-field"><span>{label}</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search card names" aria-label={`Search ${label.toLowerCase()}`} /></label>
    <div className="au-recipe-catalog-choice">
      {selected?.art && <img src={selected.art} alt="" />}
      <label className="au-recipe-field"><span>Card definition</span><select aria-label={label} value={value ?? ''} onChange={event => onChange(event.target.value)}>
        {value && !matching.some(card => definitionId(card) === value) && <option value={value}>{selected?.name ?? 'Unavailable saved card'}</option>}
        {!value && <option value="" disabled>Select a card</option>}
        {matching.map(card => <option key={definitionId(card)} value={definitionId(card)}>{card.name}</option>)}
      </select></label>
    </div>
    {search && matching.length === 0 && <small>No enabled cards match this search.</small>}
    {allMatching.length > matching.length && <small>Showing the first 60 matches. Search by name to find more cards.</small>}
  </div>;
}

function MorphFormPicker({ cards, values, selection, cycleForms, onChange, onSelectionChange, onCycleFormsChange }: { cards: readonly CatalogCard[]; values: readonly string[]; selection: 'sequential' | 'random'; cycleForms?: boolean; onChange: (ids: string[]) => void; onSelectionChange: (selection: 'sequential' | 'random') => void; onCycleFormsChange: (cycle: boolean) => void }) {
  const [search, setSearch] = useState('');
  const available = enabledCards(cards).filter(card => card.type !== 'Crypto');
  const allMatching = available.filter(card => `${card.name} ${definitionId(card)}`.toLowerCase().includes(search.toLowerCase()));
  const matching = allMatching.slice(0, 24);
  const unknown = values.filter(id => !available.some(card => definitionId(card) === id));
  const toggle = (id: string, checked: boolean) => onChange(checked ? [...values, id] : values.filter(value => value !== id));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <div className="au-morph-forms">
    <Select label="How forms are chosen" value={selection} options={['sequential', 'random']} labels={{ sequential: 'Evolve after play (cleanup)', random: 'Random morph on resolve' }} onChange={onSelectionChange} />
    <div className="au-morph-sequence"><b>{selection === 'sequential' ? 'Evolution order' : 'Selected forms'}</b>{values.length === 0 && <span className="au-morph-empty">Select at least one form before saving.</span>}{values.map((id, index) => <div className="au-morph-sequence-item" key={id}><span>{index + 1}. {cards.find(card => definitionId(card) === id)?.name ?? 'Unavailable saved form'}</span><span className="au-morph-order-actions">{selection === 'sequential' && <><button type="button" disabled={index === 0} aria-label={`Move form ${index + 1} earlier`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === values.length - 1} aria-label={`Move form ${index + 1} later`} onClick={() => move(index, 1)}>↓</button></>}<button type="button" aria-label={`Remove form ${index + 1}`} onClick={() => toggle(id, false)}>×</button></span></div>)}</div>
    <label className="au-recipe-field"><span>Forms this card can become</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Character or VP cards" aria-label="Search morph forms" /></label>
    <div className="au-morph-form-list">
      {unknown.map(id => <label className="au-morph-form" key={id}><input type="checkbox" checked onChange={() => toggle(id, false)} /><span>Unavailable saved form</span></label>)}
      {matching.map(card => <label className="au-morph-form" key={definitionId(card)}><input type="checkbox" checked={values.includes(definitionId(card))} onChange={event => toggle(definitionId(card), event.target.checked)} />{card.art && <img src={card.art} alt="" />}<span>{card.name}</span></label>)}
    </div>
    {allMatching.length > matching.length && <small>Showing the first 24 matches. Search by name to find more forms.</small>}
    {selection === 'sequential' && <label className="au-recipe-check"><input type="checkbox" checked={Boolean(cycleForms)} onChange={event => onCycleFormsChange(event.target.checked)} /><span>Cycle forms: after the last form, return to the first</span></label>}
    <small>{selection === 'sequential' ? 'After this card is played, it advances one form at cleanup. Later forms keep evolving from the same recipe — they do not need their own Morph effect.' : 'Transforms immediately; the new form resolves On Reveal as if played.'} Power changes carry over.</small>
  </div>;
}

function GainCardPicker({ cards, values, selection, onChange, onSelectionChange }: { cards: readonly CatalogCard[]; values: readonly string[]; selection: 'sequential' | 'random'; onChange: (ids: string[]) => void; onSelectionChange: (selection: 'sequential' | 'random') => void }) {
  const [search, setSearch] = useState('');
  const available = enabledCards(cards);
  const allMatching = available.filter(card => `${card.name} ${definitionId(card)}`.toLowerCase().includes(search.toLowerCase()));
  const matching = allMatching.slice(0, 24);
  const unknown = values.filter(id => !available.some(card => definitionId(card) === id));
  const toggle = (id: string, checked: boolean) => onChange(checked ? [...values, id] : values.filter(value => value !== id));
  return <div className="au-morph-forms">
    <Select label="How the gained card is chosen" value={selection} options={['sequential', 'random']} labels={{ sequential: 'Always the first selected card', random: 'Random from selected cards' }} onChange={onSelectionChange} />
    <div className="au-morph-sequence"><b>{values.length <= 1 ? 'Card to gain' : 'Gain pool'}</b>{values.length === 0 && <span className="au-morph-empty">Select at least one card before saving.</span>}{values.map((id, index) => <div className="au-morph-sequence-item" key={id}><span>{index + 1}. {cards.find(card => definitionId(card) === id)?.name ?? 'Unavailable saved card'}</span><span className="au-morph-order-actions"><button type="button" aria-label={`Remove card ${index + 1}`} onClick={() => toggle(id, false)}>×</button></span></div>)}</div>
    <label className="au-recipe-field"><span>Cards that can be gained</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search card names" aria-label="Search cards to gain" /></label>
    <div className="au-morph-form-list">
      {unknown.map(id => <label className="au-morph-form" key={id}><input type="checkbox" checked onChange={() => toggle(id, false)} /><span>Unavailable saved card</span></label>)}
      {matching.map(card => <label className="au-morph-form" key={definitionId(card)}><input type="checkbox" checked={values.includes(definitionId(card))} onChange={event => toggle(definitionId(card), event.target.checked)} />{card.art && <img src={card.art} alt="" />}<span>{card.name}</span></label>)}
    </div>
    {allMatching.length > matching.length && <small>Showing the first 24 matches. Search by name to find more cards.</small>}
    <small>{selection === 'random' && values.length > 1 ? 'Each copy picks one selected card at random.' : values.length > 1 ? 'Always gains the first selected card.' : 'Gains a copy of the selected card.'}</small>
  </div>;
}

/* ---------------------------------------------------------------- target builder */

/** Who a cost may name: only the player paying it. */
const allyWho = (scope: Scope) => whoChoices({ type: 'player', roles: ['ally'] }, scope);

function TargetBuilder({ step, scope, asCost, cards, onStep }: { step: EffectStep; scope: Scope; asCost: boolean; cards: readonly CatalogCard[]; onStep: (step: EffectStep) => void }) {
  const entry = editorEntryFor(step);
  const specs = targetsFor(step.action, scope);
  const choices = entry?.targets ? targetChoicesFor(entry, step, scope) : [];
  if (entry?.fixedTarget || (!specs.length && !choices.length)) return null;
  const onChange = (target: Target) => onStep({ ...step, target });
  const fields: ReactNode[] = [];
  if (entry?.targets) {
    const labels = Object.fromEntries([['', 'Unlisted target'], ...choices.map(choice => [choice.key, choice.label])]) as Record<string, string>;
    fields.push(<Select key="target" label="Target" value={currentTargetChoice(step, choices)?.key ?? ''} options={choices.map(choice => choice.key)} labels={labels} onChange={key => onStep(applyTargetChoice(step, choices.find(choice => choice.key === key)!, scope))} />);
  }
  if (!specs.length) return <div className="au-step-grid">{fields}</div>;
  const target = step.target ?? defaultTarget(specs[0], scope);
  const spec: TargetSpec = matchTargetSpec(step.action, target, scope) ?? specs[0];
  const whoOptions = spec.type === 'node' ? [] : whoChoices(spec, scope).filter(who => !asCost || allyWho(scope).includes(who));
  const whoLabels = Object.fromEntries(whoOptions.map(who => [who, whoLabel(who, scope, target.type === 'player' ? 'player' : 'card')])) as Record<Who, string>;
  if (specs.length > 1 && !entry?.targets) fields.push(<Select key="type" label="Target" value={target.type} options={specs.map(entry => entry.type)} labels={TARGET_TYPE_LABELS} onChange={type => onChange(defaultTarget(specs.find(entry => entry.type === type)!, scope))} />);
  if (target.type !== 'node') fields.push(<Select key="who" label={target.type === 'card' ? 'Whose cards' : target.type === 'player' ? 'Which player' : 'Whose'} value={target.who} options={whoOptions} labels={whoLabels} onChange={who => onChange({ ...target, who })} />);
  if (entry?.targets) {
    if (target.type === 'card' && target.relation === undefined) fields.push(...cardFilters(target, onChange, step.action === 'attachModifier'));
    return <div className="au-step-grid">{fields}</div>;
  }
  if (target.type === 'server' && spec.type === 'server') fields.push(<Select key="server" label="Server" value={target.server} options={spec.servers} labels={SERVER_LABELS} onChange={server => onChange({ ...target, server })} />);
  if (target.type === 'zone' && spec.type === 'zone') fields.push(<Select key="zone" label="Zone" value={target.zone} options={spec.zones} labels={ZONE_LABELS} onChange={zone => onChange({ ...target, zone })} />);
  if (target.type === 'node' && spec.type === 'node') fields.push(<Select key="which" label="Nodes" value={target.which} options={spec.which} labels={{ this: 'This Node', neighbours: 'Neighbouring Nodes', any: 'Any Node' }} onChange={which => onChange({ ...target, which })} />);
  if (target.type === 'card' && spec.type === 'card') {
    const onBoard = target.where === 'board' || target.where === 'thisNode';
    fields.push(<Select key="where" label="Where" value={target.where} options={spec.where} labels={WHERE_LABELS} onChange={where => {
      const next = { ...target, where };
      if (where !== 'board' && where !== 'thisNode') delete next.relation;
      onChange(next);
    }} />);
    if (spec.relations?.length && onBoard) {
      const relation = target.relation ?? 'any';
      fields.push(<Select key="relation" label="Which card" value={relation as Relation | 'any'} options={['any', ...spec.relations]} labels={{ any: 'Picked from candidates', ...RELATION_LABELS }} onChange={value => {
        const next = { ...target };
        if (value === 'any') delete next.relation; else next.relation = value;
        onChange(next);
      }} />);
    }
    if (target.relation === undefined) fields.push(...cardFilters(target, onChange, step.action === 'attachModifier'));
  }
  return <div className="au-step-grid">{fields}</div>;
}

/** Classes a card type can have; any type offers them all. */
const classesFor = (cardType?: CardType): readonly CardClass[] =>
  cardType === 'Crypto' ? [] : cardType === 'VP' ? VP_CLASSES : cardType === 'Character' ? CARD_CLASSES.filter(item => !VP_CLASSES.includes(item)) : CARD_CLASSES;

function cardFilters(target: Extract<Target, { type: 'card' }>, onChange: (target: Target) => void, multiClass = false): ReactNode[] {
  const classes = filterClasses(target.filter);
  const save = (cardType: CardType | undefined, picked: readonly CardClass[]) => {
    const kept = picked.filter(item => classesFor(cardType).includes(item));
    const filter: CardFilter = {
      ...(cardType ? { cardType } : {}),
      ...(kept.length === 1 ? { cardClass: kept[0] } : kept.length ? { cardClass: kept } : {}),
    };
    onChange({ ...target, filter: Object.keys(filter).length ? filter : undefined });
  };
  const offered = classesFor(target.filter?.cardType);
  const typeField = <Select key="cardType" label="Card type" value={target.filter?.cardType ?? 'any'} options={['any', ...CARD_TYPES]} labels={{ any: 'Any type' }} onChange={value => save(value === 'any' ? undefined : value, classes)} />;
  if (!offered.length) return [typeField];
  if (!multiClass && classes.length <= 1) return [typeField,
    <Select key="cardClass" label="Card class" value={classes[0] ?? 'any'} options={['any', ...offered]} labels={{ any: 'Any class' }} onChange={value => save(target.filter?.cardType, value === 'any' ? [] : [value])} />];
  const toggle = (item: CardClass, checked: boolean) => save(target.filter?.cardType, checked ? offered.filter(entry => entry === item || classes.includes(entry)) : classes.filter(entry => entry !== item));
  return [typeField,
    <fieldset key="cardClass" className="au-class-checks au-step-wide">
      <legend>Card class <small>{classes.length ? '' : '(none ticked: any class)'}</small></legend>
      {offered.map(item => <label key={item} className="au-recipe-check"><input type="checkbox" checked={classes.includes(item)} onChange={event => toggle(item, event.target.checked)} /><span>{item}</span></label>)}
    </fieldset>];
}

/* ---------------------------------------------------------------- step body */

const stripUndefined = (step: EffectStep): EffectStep => {
  const next = { ...step } as Record<string, unknown>;
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  return next as EffectStep;
};

function newOptionId(options: readonly ChoiceOption[]) {
  const ids = new Set(options.map(option => option.id));
  let index = options.length + 1;
  while (ids.has(`option-${index}`)) index++;
  return `option-${index}`;
}

function OptionsEditor({ step, field, scope, cards, depth, onChange }: { step: EffectStep; field: string; scope: Scope; cards: readonly CatalogCard[]; depth: number; onChange: (options: ChoiceOption[]) => void }) {
  const options = step.options ?? [];
  const random = step.action === 'random';
  const replace = (index: number, option: ChoiceOption) => onChange(options.map((entry, at) => at === index ? option : entry));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => onChange([...options, { id: newOptionId(options), label: `Option ${options.length + 1}`, effects: [createStep('gainCrypto', scope, cards)] }]);
  return <div className="au-step-options" data-field={`${field}.options`}>
    <div className="au-step-options-heading"><b>Options</b>{options.length < 12 && <button type="button" className="au-button au-button-subtle" onClick={add}>+ Add option</button>}</div>
    {options.map((option, index) => <div className="au-step-option" key={option.id} data-field={`${field}.options.${index}`}>
      <div className="au-step-option-head">
        <span className="au-recipe-step">{String.fromCharCode(65 + index)}</span>
        <label className="au-recipe-field"><span>Label shown to the player</span><input aria-label={`Option ${index + 1} label`} value={option.label} onChange={event => replace(index, { ...option, label: event.target.value })} /></label>
        <div className="au-recipe-actions">
          <button type="button" title="Move earlier" aria-label={`Move option ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
          <button type="button" title="Move later" aria-label={`Move option ${index + 1} later`} disabled={index === options.length - 1} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="au-recipe-remove" title="Remove option" aria-label={`Remove option ${index + 1}`} disabled={options.length <= 2} onClick={() => onChange(options.filter((_, at) => at !== index))}>×</button>
        </div>
      </div>
      {!random && <StepList title="Cost" description="Paid first. The option is shown but unavailable when the player can’t pay." field={`${field}.options.${index}.cost`} steps={option.cost ?? []} scope={scope} cards={cards} depth={depth + 1} asCost addLabel="+ Add cost"
        onChange={cost => { const { cost: _previous, ...rest } = option; replace(index, cost.length ? { ...rest, cost } : rest); }} />}
      <StepList title="Effects" field={`${field}.options.${index}.effects`} steps={option.effects} scope={scope} cards={cards} depth={depth + 1} onChange={effects => replace(index, { ...option, effects })} />
    </div>)}
  </div>;
}

function StepBody({ step, field, scope, cards, depth, asCost, onChange }: { step: EffectStep; field: string; scope: Scope; cards: readonly CatalogCard[]; depth: number; asCost: boolean; onChange: (step: EffectStep) => void }) {
  const spec = ACTIONS[step.action];
  const patch = (changes: Partial<EffectStep>) => onChange(stripUndefined({ ...step, ...changes }));
  const available = asCost ? actionsFor(scope).filter(entry => COST_ACTIONS.includes(entry.id)) : actionsFor(scope);
  const hasRelation = step.target?.type === 'card' && step.target.relation !== undefined;
  const atDeckEnd = step.target?.type === 'card' && DECK_ENDS.includes(step.target.where);
  const offBoard = step.target?.type === 'card' && step.target.where !== 'board' && step.target.where !== 'thisNode';
  const amountShown = spec.amount && (step.action !== 'attachModifier' || step.modifier === 'powerAuraAtLocation');
  const entry = editorEntryFor(step);
  const entries = EDITOR_ENTRIES.filter(item => available.some(action => action.id === item.action));
  const fixedPick = entry?.targets ? currentTargetChoice(step, entry.targets)?.pick : undefined;
  const changeTo = (key: string) => {
    const next = applyEditorEntry(step, EDITOR_ENTRIES.find(item => item.key === key)!, scope, cards);
    if (asCost && next.target && 'who' in next.target && !allyWho(scope).includes(next.target.who)) next.target = { ...next.target, who: scopedWho('self', scope) } as Target;
    onChange(next);
  };
  const amountField = () => {
    const amount = spec.amount!, sign = entry?.sign;
    const value = step.amount ?? amount.default;
    return <label className="au-recipe-field"><span>{amount.label}</span><NumberInput aria-label={amount.label} min={sign ? 0 : amount.min} max={amount.max} step={amount.integer === false ? 0.5 : 1} value={sign ? Math.abs(value) : value}
      onChange={next => { if (next !== undefined) patch({ amount: sign ? sign * Math.abs(clampAmount(amount, Math.abs(next))) : clampAmount(amount, next) }); }} /></label>;
  };
  return <div className="au-step-body">
    <div className="au-step-grid">
      <label className="au-recipe-field"><span>Effect</span><select aria-label="Effect" value={entry?.key ?? ''} onChange={event => changeTo(event.target.value)}>
        {(!entry || !entries.includes(entry)) && <option value={entry?.key ?? ''}>{entry?.label ?? spec.label} (not allowed here)</option>}
        {EDITOR_GROUPS.map(group => {
          const items = entries.filter(item => item.group === group);
          return items.length ? <optgroup key={group} label={group}>{items.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup> : null;
        })}
      </select></label>
      {amountShown && spec.amount && amountField()}
    </div>
    <p className="au-recipe-help">{spec.help}</p>
    <TargetBuilder step={step} scope={scope} asCost={asCost} cards={cards} onStep={next => onChange(stripUndefined(next))} />
    {spec.picks && !hasRelation && <div className="au-step-grid">
      {!atDeckEnd && !fixedPick && <Select label="Pick" value={step.pick?.mode ?? spec.picks[0]} options={spec.picks} labels={offBoard ? { ...PICK_LABELS, first: 'First in order' } : PICK_LABELS} onChange={mode => patch({ pick: { ...step.pick, mode: mode as PickMode, ...(mode === 'choose' ? {} : { chooser: undefined }) } })} />}
      {spec.pickCount && (atDeckEnd || step.pick?.mode !== 'all') && <label className="au-recipe-field"><span>How many cards</span><NumberInput aria-label="How many cards" min={1} max={10} value={step.pick?.count ?? 1} onChange={value => { if (value !== undefined) patch({ pick: { mode: step.pick?.mode ?? spec.picks![0], ...step.pick, count: Math.min(10, Math.max(1, Math.round(value))) === 1 ? undefined : Math.min(10, Math.max(1, Math.round(value))) } }); }} /></label>}
      {spec.chooser && !atDeckEnd && (step.pick?.mode ?? spec.picks[0]) === 'choose' && <Select label="Who chooses" value={step.pick?.chooser ?? 'self'} options={['self', 'opponent']} labels={{ self: whoLabel(scopedWho('self', scope), scope), opponent: whoLabel(scopedWho('opponent', scope), scope) }} onChange={chooser => patch({ pick: { mode: step.pick?.mode ?? 'choose', ...step.pick, chooser: chooser === 'self' ? undefined : chooser } })} />}
    </div>}
    {spec.destinations && <div className="au-step-grid"><Select label="Destination" value={step.destination ?? spec.destinations[0]} options={spec.destinations} labels={DESTINATION_LABELS} onChange={destination => patch({ destination })} /></div>}
    {step.action === 'gainCard' && <GainCardPicker
      cards={cards}
      values={step.cardIds?.length ? step.cardIds : step.cardId ? [step.cardId] : []}
      selection={step.selection ?? (step.cardIds && step.cardIds.length > 1 ? 'random' : 'sequential')}
      onChange={cardIds => patch({ cardIds: cardIds.length ? cardIds : undefined, cardId: undefined, selection: cardIds.length > 1 ? (step.selection ?? 'random') : undefined })}
      onSelectionChange={selection => patch({ selection: selection === 'sequential' && !(step.cardIds && step.cardIds.length > 1) ? undefined : selection })}
    />}
    {step.action === 'attachModifier' && <>
      <ModifierPicker step={step} onChange={patch} />
      {step.target?.type === 'card' && step.target.where === 'collection' && <>
        <label className="au-recipe-check"><input type="checkbox" checked={step.cardId !== undefined} onChange={event => patch({ cardId: event.target.checked ? definitionId(enabledCards(cards).find(card => card.type === 'Character') ?? cards[0]) : undefined })} /><span>Attach to a specific Character instead of a random one</span></label>
        {step.cardId !== undefined && <CardDefinitionPicker label="Host card" cards={enabledCards(cards).filter(card => card.type === 'Character')} value={step.cardId} onChange={cardId => patch({ cardId })} />}
      </>}
    </>}
    {step.action === 'removeModifier' && <ModifierPicker step={step} onChange={patch} />}
    {step.action === 'morph' && <>
      <MorphFormPicker
        cards={cards}
        values={step.formIds ?? []}
        selection={step.selection ?? 'sequential'}
        cycleForms={step.cycleForms}
        onChange={formIds => patch({ formIds })}
        onSelectionChange={selection => patch({ selection, cycleForms: selection === 'random' ? undefined : step.cycleForms })}
        onCycleFormsChange={cycle => patch({ cycleForms: cycle || undefined })}
      />
      <label className="au-recipe-check"><input type="checkbox" checked={Boolean(step.resetAfterCycle)} onChange={event => patch({ resetAfterCycle: event.target.checked || undefined })} /><span>Reset after Cycle: return to the original form during end-of-Cycle cleanup</span></label>
    </>}
    {step.action === 'choice' && <div className="au-step-grid">
      <label className="au-recipe-field au-step-wide"><span>Prompt</span><input aria-label="Choice prompt" value={step.prompt ?? ''} placeholder="Choose one effect" onChange={event => patch({ prompt: event.target.value || undefined })} /></label>
      <label className="au-recipe-field"><span>Options picked</span><NumberInput aria-label="Options picked" min={1} max={Math.max(1, step.options?.length ?? 2)} value={step.choose?.count ?? 1} onChange={value => { if (value === undefined) return; const count = Math.max(1, Math.round(value)); patch({ choose: count === 1 && (step.choose?.chooser ?? 'self') === 'self' ? undefined : { count, chooser: step.choose?.chooser ?? 'self' } }); }} /></label>
      <Select label="Who picks" value={step.choose?.chooser ?? 'self'} options={['self', 'opponent']} labels={{ self: whoLabel(scopedWho('self', scope), scope), opponent: whoLabel(scopedWho('opponent', scope), scope) }} onChange={chooser => { const count = step.choose?.count ?? 1; patch({ choose: count === 1 && chooser === 'self' ? undefined : { count, chooser } }); }} />
    </div>}
    {(step.action === 'choice' || step.action === 'random') && <OptionsEditor step={step} field={field} scope={scope} cards={cards} depth={depth} onChange={options => patch({ options })} />}
    {(spec.optional || spec.min) && <div className="au-step-grid">
      {spec.optional && <label className="au-recipe-check"><input type="checkbox" checked={Boolean(step.optional)} onChange={event => patch({ optional: event.target.checked || undefined })} /><span>Optional: the player may skip it</span></label>}
      {spec.min && <label className="au-recipe-field"><span>Minimum for follow-ups</span><NumberInput aria-label="Minimum for follow-ups" min={0} max={Math.min(20, step.amount ?? 20)} value={step.min} onChange={min => patch({ min })} /></label>}
    </div>}
    {depth < MAX_DEPTH && !asCost && <StepList title="Then" description={THEN_HELP} field={`${field}.then`} steps={step.then ?? []} scope={scope} cards={cards} depth={depth + 1} addLabel="+ Add follow-up" nested
      onChange={then => patch({ then: then.length ? then : undefined })} />}
  </div>;
}

/* ---------------------------------------------------------------- step list */

type StepListProps = {
  title: string;
  description?: string;
  /** `data-field` key of this list (`onReveal`, `schedule.0`, `onReveal.1.options.0.effects`); steps are `${field}.${index}`. */
  field: string;
  steps: readonly EffectStep[];
  scope: Scope;
  cards: readonly Card[] | readonly CatalogCard[];
  onChange: (steps: EffectStep[]) => void;
  depth?: number;
  /** Choice option costs: payable actions aimed at the player choosing. */
  asCost?: boolean;
  addLabel?: string;
  /** Nested lists (`then`) render compactly inside their parent step. */
  nested?: boolean;
};

export function StepList({ title, description, field, steps, scope, cards: rawCards, onChange, depth = 0, asCost = false, addLabel = '+ Add effect', nested = false }: StepListProps) {
  const cards = rawCards as readonly CatalogCard[];
  const mods = useContext(ModsContext);
  const { activeStep, setActiveStep, invalid } = useEditorFocus();
  const key = (index: number) => `${field}.${index}`;
  const within = (path: string | null, prefix: string) => path !== null && (path === prefix || path.startsWith(`${prefix}.`));
  const replace = (index: number, next: EffectStep) => onChange(steps.map((step, at) => at === index ? next : step));
  const remove = (index: number) => {
    onChange(steps.filter((_, at) => at !== index));
    if (within(activeStep, key(index))) setActiveStep(null);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    if (within(activeStep, key(index))) setActiveStep(key(target));
  };
  const add = () => {
    let step = createStep(asCost ? 'payCrypto' : 'draw', scope, cards);
    if (asCost && step.target && 'who' in step.target) step = { ...step, target: { ...step.target, who: scopedWho('self', scope) } as Target };
    onChange([...steps, step]);
    setActiveStep(key(steps.length));
  };
  const hasIssue = [...invalid].some(issue => within(issue, field));
  if (nested && !steps.length) return <div className="au-step-then-empty" data-field={field}><button type="button" className="au-button au-button-subtle" title={description} onClick={add}>{addLabel}</button></div>;
  return <section className={`au-recipe-editor${nested ? ' au-step-nested' : ''}${depth ? ' au-step-depth' : ''}${hasIssue ? ' is-invalid' : ''}`} aria-label={title} data-field={field}>
    <div className="au-recipe-editor-heading"><div><h3>{title}{steps.length > 0 && <span className="au-recipe-count">{steps.length}</span>}</h3>{description && <p>{description}</p>}</div><button className="au-button au-button-subtle" type="button" onClick={add}>{addLabel}</button></div>
    {steps.length === 0 && <p className="au-recipe-empty">{asCost ? 'Free.' : 'No effects.'}</p>}
    <div className="au-recipe-editor-list">{steps.map((step, index) => {
      const stepKey = key(index);
      const expanded = within(activeStep, stepKey);
      const invalidStep = [...invalid].some(issue => within(issue, stepKey));
      const label = editorEntryFor(step)?.label ?? ACTIONS[step.action]?.label ?? step.action;
      return <div className={`au-recipe-editor-row${expanded ? ' is-expanded' : ''}${invalidStep ? ' is-invalid' : ''}`} key={`${index}-${step.action}`} data-field={stepKey}>
        <div className="au-step-head">
          <button type="button" className="au-step-toggle" aria-expanded={expanded} aria-label={`${title} step ${index + 1}: ${label}. ${expanded ? 'Collapse' : 'Edit'}`} onClick={() => setActiveStep(expanded ? (depth ? field.replace(/\.(then|options\.\d+\.(effects|cost))$/, '') : null) : stepKey)}>
            <span className="au-recipe-step">{index + 1}</span>
            <span className="au-step-text"><b>{label}</b><span>{describeStep(step, scope, cards, mods)}</span></span>
            {invalidStep && <span className="au-step-flag" aria-hidden="true">!</span>}
            {step.then?.length ? <span className="au-step-chip">Then {step.then.length}</span> : null}
            {step.optional && <span className="au-step-chip">Optional</span>}
            <span className="au-step-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          </button>
          <div className="au-recipe-actions">
            <button type="button" title="Move earlier" aria-label={`Move ${title} step ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" title="Move later" aria-label={`Move ${title} step ${index + 1} later`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className="au-recipe-remove" title="Remove step" aria-label={`Remove ${title} step ${index + 1}`} onClick={() => remove(index)}>×</button>
          </div>
        </div>
        {expanded && <StepBody step={step} field={stepKey} scope={scope} cards={cards} depth={depth} asCost={asCost} onChange={next => replace(index, next)} />}
      </div>;
    })}</div>
  </section>;
}
