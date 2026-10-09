import { useContext, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { POWER_SOURCES, type Card, type CardModifier, type PowerSource } from '@0uroboros/engine/game';
import { MOD_HOOK_LABELS, createStep, describeCard, describeLocation, describeMod, describeSteps, modBadge } from '@0uroboros/engine/effects/catalog';
import { BUILTIN_MODIFIERS, type EffectStep, type ModDefinition, type ModifierKind } from '@0uroboros/engine/effects/types';
import { BUILTIN_MOD_FIELDS, DEFAULT_BUILTIN_MODS, builtinMod, setBuiltinModDetails, type BuiltinModDetails } from '@0uroboros/engine/builtinMods';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from '@0uroboros/engine/cardArtwork';
import {
  validateContent,
  normalizeDocument,
  upgradeDocument,
  CONTENT_VERSION,
  deckSize,
  type AuthoredCard,
  type AuthoredCircuitReward,
  type AuthoredLocation,
  type AuthoredMod,
  type ContentDocument,
  type StartingDeck,
} from '@0uroboros/engine/authoring/contentModel';
import { getBundledDocument } from './contentStore';
import { ModsContext, StepList } from './StepEditor';
import { createModReward, followModRename, isModReward, withTrailing } from './modRewards';
import { DeckEditor } from './DeckEditor';
import { NumberInput } from './NumberInput';
import { ArtworkBrowser, useImageStatus } from './ArtworkPicker';
import { EditorFocusContext, useEditorFocus } from './editorContext';
import { describeIssues, type Issue } from './validationIssues';
import { CardFace } from '../CardFace';
import { CARD_STYLE_COLORS, CARD_STYLE_ICONS, type CardStyle } from '../cardPresentation';
import { refreshDepthStatus, regenerateDepth, servedArtPath, useDepthEntry, useDepthJob } from '../depthArt/depthManifest';
import { isSolarMonk } from '@0uroboros/engine/game';
import { cardClasses, vpClasses, cardClassOf, cardCategoryLabel, matchesCardFilter, newCardCategory, sortCards, primaryCardFilters, primaryFilterOf, secondaryFiltersFor, isGeneratedCard, poolForClass, type CardClass, type CardFilter, type CardSort } from './cardBrowser';
import './authoring.css';
import './authoring-workbench.css';
import '../card-surfaces.css';

const SORT_LABEL: Record<CardSort, string> = { name: 'Name', cost: 'Cost', power: 'Power', vp: 'VP' };
type Section = 'cards' | 'locations' | 'circuitRewards' | 'mods' | 'startingDecks';
/** A built-in mod shown in the Card mods list. It is not part of the document and cannot be edited. */
type BuiltinMod = { id: ModifierKind; name: string; enabled: true; builtin: true };
type Item = AuthoredCard | AuthoredLocation | AuthoredCircuitReward | AuthoredMod | StartingDeck | BuiltinMod;
type SaveStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'conflict' | 'offline';
type Notice = { text: string; restoreId?: string };

const SECTION_KEYS: readonly Section[] = ['cards', 'locations', 'circuitRewards', 'mods', 'startingDecks'];
const sections: { key: Section; label: string; singular: string }[] = [
  { key: 'cards', label: 'Cards', singular: 'card' },
  { key: 'locations', label: 'Locations', singular: 'location' },
  { key: 'circuitRewards', label: 'Circuit rewards', singular: 'circuit reward' },
  { key: 'mods', label: 'Card mods', singular: 'card mod' },
  { key: 'startingDecks', label: 'Starting decks', singular: 'starting deck' },
];
const ID_PREFIX: Record<Section, string> = { cards: 'card', locations: 'location', circuitRewards: 'reward', mods: 'mod', startingDecks: 'deck' };
const isDeck = (item: Item): item is StartingDeck => 'cards' in item;
const isBuiltin = (item: Item): item is BuiltinMod => 'builtin' in item;
const builtinModItems = (): BuiltinMod[] => BUILTIN_MODIFIERS.map(id => ({ id, name: builtinMod(id).name, enabled: true, builtin: true }));
const sectionItems = (doc: ContentDocument, key: Section) => (doc[key] ?? []) as Item[];
const listedItems = (doc: ContentDocument, key: Section): Item[] => key === 'mods' ? [...builtinModItems(), ...sectionItems(doc, key)] : sectionItems(doc, key);
/** Sets one built-in mod field; a value equal to the default is dropped so the document only keeps real edits. */
function withBuiltinModField(doc: ContentDocument, kind: ModifierKind, field: keyof BuiltinModDetails, value: string): ContentDocument {
  const overrides = { ...doc.builtinMods };
  const details = { ...overrides[kind] };
  if (value === DEFAULT_BUILTIN_MODS[kind][field]) delete details[field]; else details[field] = value;
  if (Object.keys(details).length) overrides[kind] = details; else delete overrides[kind];
  const { builtinMods: _old, ...rest } = doc;
  return Object.keys(overrides).length ? { ...rest, builtinMods: overrides } : rest;
}
const DURATION_LABELS = { cycle: 'Cycles', runtime: 'Runtime turns' } as const;
const TIMING_LABELS = { start: 'Start of turn', end: 'End of turn' } as const;
const CYCLE_TIMING_LABELS = { start: 'Start of Cycle', end: 'End of Cycle' } as const;
const FILTER_TONES: Partial<Record<CardFilter, string>> = { Base: 'base', Action: 'base', Utility: 'base', Runtime: 'base', Chaos: 'chaos', Attack: 'chaos', Horror: 'chaos', Hacker: 'hacker', VP: 'vp', Volume: 'vp', 'Solar-monk': 'vp', Crypto: 'crypto', Generated: 'generated' };
/** Display order of the top card filter row: the narrowing filters first, All last. */
const PRIMARY_TABS: readonly CardFilter[] = [...primaryCardFilters.filter(filter => filter !== 'All'), 'All'];
/** A top tab opens on its first subtype; tabs without subtypes open as themselves. */
const openingFilter = (tab: CardFilter): CardFilter => secondaryFiltersFor(primaryFilterOf(tab))?.[0] ?? tab;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

/** IDs are permanent and unrelated to the display name, so renaming never breaks decks or recipe references. */
function createId(section: Section, existing: readonly { id: string }[]) {
  const ids = new Set(existing.map(item => item.id));
  let id: string;
  do id = `${ID_PREFIX[section]}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
  while (ids.has(id));
  return id;
}

/** The frame style each subtype prints with. */
const classStyle = (cardClass: CardClass): CardStyle => cardClass === 'Volume' ? 'vp' : cardClass === 'Solar-monk' ? 'solar' : cardClass.toLowerCase() as CardStyle;
/** The frame style a card's subtype prints with; Crypto has no subtype and uses its own. */
function subtypeStyle(card: AuthoredCard): CardStyle {
  return card.type === 'Crypto' ? 'crypto' : classStyle(cardClassOf(card));
}

function cardTone(card: AuthoredCard) {
  if (isGeneratedCard(card)) return 'generated';
  if (card.type === 'Crypto') return 'crypto';
  if (card.type === 'VP') return 'vp';
  if (card.type === 'Character' && cardClassOf(card) === 'Hacker') return 'hacker';
  return card.pool === 'Chaos' ? 'chaos' : 'base';
}

function readError(value: unknown, fallback: string) {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.errors) && record.errors.length) return `${typeof record.error === 'string' ? `${record.error} ` : ''}${record.errors.map(String).join(' · ')}`;
    if (typeof record.error === 'string') return record.error;
    if (typeof record.message === 'string') return record.message;
  }
  return fallback;
}

/** A current document, or a version 1 document that `upgradeDocument` can bring forward. */
function isDocument(value: unknown): value is ContentDocument {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (record.version === CONTENT_VERSION || record.version === 1) && Array.isArray(record.cards) && Array.isArray(record.locations) && Array.isArray(record.circuitRewards);
}

const POWER_SOURCE_LABELS: Record<PowerSource | 'none', string> = {
  none: 'None', trash: '+1 per card in Trash', destroyed: '+1 per destroyed card',
  moved: '+1 per card moved this game', movedByOwner: '+1 per card its owner moved this game',
};
const POWER_SOURCE_OPTIONS = ['none', ...POWER_SOURCES] as const;
const SELF_MOVE_LABELS = { none: 'No', turn: 'Once each Runtime turn', cycle: 'Once each Cycle' } as const;

function useInvalid(field?: string) {
  const { invalid } = useEditorFocus();
  return field ? invalid.has(field) : false;
}

function NumberField({ label, field, value, onChange, min, step, hint, disabled = false }: { label: string; field?: string; value: number | undefined; onChange: (value: number | undefined) => void; min?: number; step?: number; hint?: string; disabled?: boolean }) {
  const invalid = useInvalid(field);
  return <label className={`au-field${invalid ? ' is-invalid' : ''}`} data-field={field}><span>{label}</span><NumberInput aria-label={label} aria-invalid={invalid || undefined} value={value} min={min} step={step ?? 1} disabled={disabled} onChange={onChange} />{hint && <small>{hint}</small>}</label>;
}

function TextField({ label, field, value, onChange, hint, multiline = false, placeholder, readOnly = false, className = '' }: { label: string; field?: string; value: string; onChange?: (value: string) => void; hint?: string; multiline?: boolean; placeholder?: string; readOnly?: boolean; className?: string }) {
  const invalid = useInvalid(field);
  const props = { 'aria-label': label, 'aria-invalid': invalid || undefined, readOnly, value, placeholder, onChange: (event: { target: { value: string } }) => onChange?.(event.target.value) };
  return <label className={`au-field${invalid ? ' is-invalid' : ''}${readOnly ? ' is-readonly' : ''} ${className}`} data-field={field}><span>{label}</span>{multiline ? <textarea rows={3} {...props} /> : <input {...props} />}{hint && <small>{hint}</small>}</label>;
}

function SelectField<T extends string>({ label, field, value, options, labels, onChange, hint }: { label: string; field?: string; value: T; options: readonly T[]; labels?: Partial<Record<T, string>>; onChange: (value: T) => void; hint?: string }) {
  const invalid = useInvalid(field);
  return <label className={`au-field${invalid ? ' is-invalid' : ''}`} data-field={field}><span>{label}</span><select aria-label={label} aria-invalid={invalid || undefined} value={value} onChange={event => onChange(event.target.value as T)}>{options.map(option => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}</select>{hint && <small>{hint}</small>}</label>;
}

function Toggle({ label, field, checked, onChange, hint, disabled = false }: { label: string; field?: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string; disabled?: boolean }) {
  const invalid = useInvalid(field);
  return <label className={`au-toggle${invalid ? ' is-invalid' : ''}`} data-field={field}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span><b>{label}</b>{hint && <small>{hint}</small>}</span></label>;
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="au-section-title"><div>{eyebrow && <span className="au-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

function IdentityFields({ id, definitionId }: { id: string; definitionId?: string }) {
  return <div className="au-field-grid">
    <TextField field="id" label="ID" value={id} readOnly hint="Permanent. Decks and effects point here, so renaming never changes it." />
    {definitionId !== undefined && definitionId !== id && <TextField field="definitionId" label="Definition ID" value={definitionId} readOnly hint="Set through Advanced JSON." />}
  </div>;
}

function ArtworkField({ value, onChange, onBrowse }: { value: string; onChange: (value: string) => void; onBrowse: () => void }) {
  const status = useImageStatus(value);
  const invalid = useInvalid('art');
  return <div className={`au-art-field${invalid ? ' is-invalid' : ''}`} data-field="art">
    <img className="au-art-field-thumb" src={status === 'broken' ? CARD_ART_PLACEHOLDER : value} alt="" />
    <label className="au-field"><span>Artwork path</span><input aria-label="Artwork path" aria-invalid={invalid || undefined} value={value} onChange={event => onChange(event.target.value)} />
      {status === 'broken' ? <small className="au-field-warning" role="status">This image can’t be loaded. The game will show the placeholder art.</small> : <small>Choose from the art library or upload a new image.</small>}
    </label>
    <button type="button" className="au-button au-button-subtle" onClick={onBrowse}>Browse…</button>
  </div>;
}

function AdvancedJson({ item, onApply, onPendingChange }: { item: Item; onApply: (item: Item) => void; onPendingChange: (pending: boolean) => void }) {
  const [draft, setDraft] = useState(() => JSON.stringify(item, null, 2));
  const [error, setError] = useState('');
  const previous = useRef(JSON.stringify(item, null, 2));
  useEffect(() => {
    const next = JSON.stringify(item, null, 2);
    if (draft === previous.current) { setDraft(next); onPendingChange(false); }
    previous.current = next;
    // Draft deliberately stays intact when this item changes through another control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  function changeDraft(next: string) {
    setDraft(next);
    onPendingChange(next !== JSON.stringify(item, null, 2));
    setError('');
  }
  function apply() {
    try {
      const parsed: unknown = JSON.parse(draft);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof (parsed as { id?: unknown }).id !== 'string') throw new Error('This item needs an object with a string ID.');
      onApply(parsed as Item);
      setError('');
      setDraft(JSON.stringify(parsed, null, 2));
      onPendingChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid JSON.'); }
  }
  return <details className="au-advanced"><summary>Advanced JSON <span>Every underlying property</span></summary><p>Apply replaces this item with the JSON shown here. Use Save at the top to write changes to disk.</p><textarea aria-label="Advanced item JSON" spellCheck={false} value={draft} onChange={event => changeDraft(event.target.value)} rows={18} /><div className="au-advanced-footer"><button type="button" className="au-button au-button-subtle" onClick={() => { setDraft(JSON.stringify(item, null, 2)); setError(''); onPendingChange(false); }}>Reset editor</button><button type="button" className="au-button" onClick={apply}>Apply JSON</button></div>{draft !== JSON.stringify(item, null, 2) && <p className="au-advanced-pending">Apply or reset this JSON draft before saving or switching items.</p>}{error && <p className="au-field-error" role="alert">{error}</p>}</details>;
}

function Artwork({ card }: { card: AuthoredCard }) {
  return <img className="au-thumb" src={servedArtPath(cardArtworkPath(card))} alt="" loading="lazy" onError={event => { if (event.currentTarget.src !== new URL(CARD_ART_PLACEHOLDER, window.location.href).href) event.currentTarget.src = CARD_ART_PLACEHOLDER; }} />;
}

/** Whether this art has its 3D depth pair yet. Depth is generated automatically on Save. */
function DepthStatus({ art }: { art: string }) {
  const entry = useDepthEntry(art), job = useDepthJob(art);
  const [error, setError] = useState('');
  const busy = job?.status === 'queued' || job?.status === 'processing';
  const [state, text] = busy ? ['busy', job.status === 'queued' ? 'Depth queued…' : 'Generating 3D depth…']
    : job?.status === 'failed' ? ['failed', `Depth failed: ${job.error ?? 'unknown error'}`]
    : entry ? ['ready', '3D depth ready']
    : ['missing', 'No 3D depth yet. Save to generate it.'];
  async function regenerate() {
    setError('');
    try { await regenerateDepth(art); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not regenerate depth.'); }
  }
  return <div className="au-depth-status" data-state={state} role="status">
    <span>{text}</span>
    {!busy && entry && <button type="button" className="au-button au-button-subtle" onClick={regenerate}>Regenerate</button>}
    {error && <small className="au-field-error">{error}</small>}
  </div>;
}

function CardPreview({ card, onBrowseArt }: { card: AuthoredCard; onBrowseArt: () => void }) {
  return <aside className="au-preview-column" aria-label="Card preview">
    <span className="au-eyebrow">Live preview</span>
    <div className="au-card-face-wrap"><CardFace card={card} context="runtime"/></div>
    <button type="button" className="au-button au-button-subtle au-preview-art-button" onClick={onBrowseArt}>Change artwork…</button>
    <DepthStatus art={cardArtworkPath(card)} />
    <div className="au-preview-meta" data-tone={cardTone(card)} style={{ '--tone': CARD_STYLE_COLORS[subtypeStyle(card)] } as CSSProperties}><b>{cardCategoryLabel(card)}</b><p className="au-preview-effect">{card.effect || 'Add effects below to generate printed text.'}</p><div className="au-card-metrics">{card.vp !== undefined && <span>VP <b>{card.vp}</b></span>}{card.cryptoValue !== undefined && <span>Crypto <b>{card.cryptoValue}</b></span>}</div><p>{isGeneratedCard(card) ? 'Created by card effects. Kept out of Draft.' : card.enabled ? 'Enabled for playtesting.' : 'Disabled in new games.'}</p></div>
  </aside>;
}

type EditorProps<T> = { item: T; cards: readonly AuthoredCard[]; update: (value: T) => void; applyAdvanced: (value: T) => void; onPendingChange: (pending: boolean) => void };
const asCards = (cards: readonly AuthoredCard[]) => cards as unknown as readonly Card[];
const printedText = (card: AuthoredCard, cards: readonly AuthoredCard[], mods: readonly ModDefinition[]) => describeCard(card, asCards(cards), mods);
const enabledMods = (mods: readonly AuthoredMod[] = []): ModDefinition[] => mods.filter(mod => mod.enabled).map(({ enabled: _enabled, ...mod }) => mod);

function CardEditor({ item: card, cards, update, applyAdvanced, onPendingChange }: EditorProps<AuthoredCard>) {
  const [artOpen, setArtOpen] = useState(false);
  const mods = useContext(ModsContext);
  const patch = (changes: Partial<AuthoredCard>) => update({ ...card, ...changes });
  const derivedPrinted = printedText(card, cards, mods);
  /* Recipes seed the printed text while it is still blank, then leave it alone — the generated
     wording is long-winded for a card face, so most cards end up hand-written. The derived wording stays visible underneath for comparison. */
  const syncPrinted = (next: AuthoredCard) => card.effect.trim()
    ? next
    : { ...next, effect: printedText(next, cards, mods) };
  const changeType = (type: AuthoredCard['type']) => {
    const cardClass = type === 'Character' ? 'Utility' as CardClass : type === 'VP' ? 'Volume' as CardClass : undefined;
    patch({ type, pool: poolForClass(type, cardClass), cardClass, ...(type === 'Crypto' ? { cryptoValue: card.cryptoValue ?? 1, power: undefined } : { power: card.power ?? 0 }), ...(type === 'VP' ? { vp: card.vp ?? 1 } : {}), ...(type !== 'Character' ? { powerSource: undefined, aura: undefined, selfMove: undefined } : {}) });
  };
  const changeClass = (cardClass: CardClass) => patch({ cardClass, pool: poolForClass(card.type, cardClass) });
  const schedule = card.schedule ?? [];
  return <div className="au-card-workspace"><CardPreview card={card} onBrowseArt={() => setArtOpen(true)} /><div className="au-properties">
    <section className="au-panel">
      <SectionTitle title="Card properties" />
      <div className="au-field-grid">
        <TextField field="name" label="Name" value={card.name} onChange={name => patch({ name })} />
        <SelectField field="type" label="Card type" value={card.type} options={['Character', 'VP', 'Crypto']} onChange={changeType} />
        <NumberField field="cost" label="Cost" value={card.cost} min={0} onChange={cost => patch({ cost: cost ?? 0 })} />
        {card.type !== 'Crypto' && <NumberField field="power" label="Power" value={card.power} onChange={power => patch({ power: power ?? 0 })} />}
        {card.type === 'Character' && <SelectField field="powerSource" label="Power bonus" value={card.powerSource ?? 'none'} options={POWER_SOURCE_OPTIONS} labels={POWER_SOURCE_LABELS} hint="Live bonus added to printed Power while the card is in play." onChange={source => update(syncPrinted({ ...card, powerSource: source === 'none' ? undefined : source }))} />}
        {card.type === 'Character' && <NumberField field="aura" label="Power aura" value={card.aura} min={1} onChange={aura => update(syncPrinted({ ...card, aura: aura || undefined }))} hint="This card’s own effect: +N Power to its other revealed allies at its Location. No mod badge. Leave empty for none." />}
        {card.type === 'Character' && <SelectField field="selfMove" label="Moves itself" value={card.selfMove ?? 'none'} options={['none', 'turn', 'cycle'] as const} labels={SELF_MOVE_LABELS} hint="While revealed, its owner may drag it to another open Node for free. Undo all actions puts it back." onChange={selfMove => update(syncPrinted({ ...card, selfMove: selfMove === 'none' ? undefined : selfMove }))} />}
        {card.type === 'VP' && <NumberField field="vp" label="Victory points" value={card.vp} onChange={vp => patch({ vp: vp ?? 0 })} />}
        {card.type === 'Crypto' && <NumberField field="cryptoValue" label="Crypto value" value={card.cryptoValue} min={0} onChange={cryptoValue => patch({ cryptoValue: cryptoValue ?? 0 })} />}
        {card.type === 'Character' && <SelectField field="cardClass" label="Card class" value={cardClassOf(card)} options={cardClasses} onChange={changeClass} />}
        {card.type === 'VP' && <SelectField field="cardClass" label="VP subtype" value={cardClassOf(card)} options={vpClasses} onChange={changeClass} hint={isSolarMonk(card) ? 'Also a Character: costs 1 Action to play and counts for effects that target Characters.' : 'Plays for 0 Actions.'} />}
      </div>
      <div className="au-toggle-row"><Toggle field="generated" label="Generated" checked={isGeneratedCard(card)} onChange={generated => patch({ generated: generated || undefined })} hint="Created only by card effects. Never offered in Draft." /></div>
      <div className="au-printed-field">
        <TextField field="effect" label="Printed text" value={card.effect} onChange={effect => patch({ effect })} multiline hint="Printed on the card face. Keep it short; it sets as tags under the name." />
        {derivedPrinted && derivedPrinted !== card.effect.trim() && <div className="au-derived">
          <span>Effects read as</span><p>{derivedPrinted}</p>
          <button type="button" className="au-button au-button-subtle" onClick={() => patch({ effect: derivedPrinted })}>Use this wording</button>
        </div>}
      </div>
      <TextField field="storyText" label="Story text" value={card.storyText ?? ''} onChange={storyText => patch({ storyText: storyText || undefined })} multiline hint="Flavour only. Shown in the card inspect overlay, never on the card face." />
    </section>
    <section className="au-panel au-effects-panel">
      <SectionTitle eyebrow="Unique to this card" title="Card effects" description="Select a step to edit it. The preview updates as you go." />
      {card.type === 'Crypto' && <p className="au-recipe-help">Crypto value is paid from the wallet in Draft. Play triggers run when a deployable form is played.</p>}
      <StepList field="onReveal" title="On reveal" description="When this card turns face up." steps={card.onReveal ?? []} scope="card" cards={asCards(cards)} onChange={onReveal => update(syncPrinted({ ...card, onReveal }))} />
      <StepList field="onCollapse" title="On collapse" description="When its Location resolves." steps={card.onCollapse ?? []} scope="card" cards={asCards(cards)} onChange={onCollapse => update(syncPrinted({ ...card, onCollapse }))} />
      <div className="au-duration-fields au-field-grid"><NumberField field="duration" label="Duration" value={card.duration} min={1} onChange={duration => update(syncPrinted({ ...card, duration }))} hint="Leave empty for no duration; 99 is permanent." /><SelectField field="durationPeriod" label="Duration period" value={card.durationPeriod ?? 'cycle'} options={['cycle', 'runtime']} labels={DURATION_LABELS} onChange={durationPeriod => update(syncPrinted({ ...card, durationPeriod }))} hint="The time scale for the whole card: the duration, every-turn steps and schedule all count Runtime turns or Cycles." /></div>
      <StepList field="recurring" title="Recurring" description={card.durationPeriod === 'runtime' ? 'Every Runtime turn while active, starting with the reveal turn.' : 'Every Cycle while active, starting with the reveal Cycle.'} steps={card.recurring ?? []} scope="card" cards={asCards(cards)} onChange={recurring => update(syncPrinted({ ...card, recurring }))} />
      <div className="au-schedule-heading"><h3>Scheduled steps</h3><button type="button" className="au-button au-button-subtle" onClick={() => patch({ schedule: [...schedule, { at: 2, timing: 'start', effects: [] }], duration: Math.max(card.duration ?? 0, 2) })}>+ Add schedule</button></div>
      {schedule.map((entry, index) => <div className="au-schedule" key={index}><div className="au-schedule-fields"><NumberField field={`schedule.${index}.at`} label={`Schedule ${index + 1} ${card.durationPeriod === 'runtime' ? 'turn' : 'Cycle'}`} value={entry.at} min={1} onChange={at => patch({ schedule: schedule.map((step, i) => i === index ? { ...step, at: at ?? 1 } : step) })} /><SelectField field={`schedule.${index}.timing`} label={`Schedule ${index + 1} timing`} value={entry.timing ?? 'start'} options={['start', 'end']} labels={card.durationPeriod === 'runtime' ? TIMING_LABELS : CYCLE_TIMING_LABELS} onChange={timing => patch({ schedule: schedule.map((step, i) => i === index ? { ...step, timing } : step) })} /><button type="button" className="au-button au-button-subtle au-schedule-remove" onClick={() => patch({ schedule: schedule.filter((_, i) => i !== index) })}>Remove schedule {index + 1}</button></div><StepList field={`schedule.${index}`} title={`Schedule ${index + 1}`} scope="card" cards={asCards(cards)} steps={entry.effects} onChange={effects => update(syncPrinted({ ...card, schedule: schedule.map((step, i) => i === index ? { ...step, effects } : step) }))} /></div>)}
    </section>
    <details className="au-property-section" open><summary>Artwork and identity</summary>
      <ArtworkField value={card.art} onChange={art => patch({ art })} onBrowse={() => setArtOpen(true)} />
      <IdentityFields id={card.id} definitionId={card.definitionId} />
    </details>
    <AdvancedJson key={card.id} item={card} onApply={item => applyAdvanced(item as AuthoredCard)} onPendingChange={onPendingChange} />
  </div>
  <ArtworkBrowser open={artOpen} value={card.art} onClose={() => setArtOpen(false)} onSelect={art => { patch({ art }); setArtOpen(false); }} />
  </div>;
}

function LocationEditor({ item: location, cards, update, applyAdvanced, onPendingChange }: EditorProps<AuthoredLocation>) {
  const mods = useContext(ModsContext);
  const patch = (changes: Partial<AuthoredLocation>) => update({ ...location, ...changes });
  const derived = describeLocation(location, asCards(cards), mods);
  const setText = (text: string) => patch({ rule: text, reward: text });
  /* The text follows the effects until it is edited by hand; edited text is kept, with the
     generated wording shown underneath to regenerate from. */
  const syncHooks = (changes: Partial<AuthoredLocation>) => {
    const next = { ...location, ...changes };
    const following = !location.rule.trim() || location.rule.trim() === derived;
    if (!following) { update(next); return; }
    const copy = describeLocation(next, asCards(cards), mods);
    update({ ...next, rule: copy, reward: copy });
  };
  return <div className="au-properties au-standalone-properties"><section className="au-panel"><SectionTitle title="Location properties" /><div className="au-field-grid">
    <TextField field="name" label="Name" value={location.name} onChange={name => patch({ name })} />
  </div>
    <div className="au-printed-field">
      <TextField field="rule" label="Location text" value={location.rule} onChange={setText} multiline hint="Printed on the Location plate. Shorten it as needed; timing prefixes such as On collapse: and Start of turn 2: keep their colour." />
      {derived && derived !== location.rule.trim() && <div className="au-derived">
        <span>Effects read as</span><p>{derived}</p>
        <button type="button" className="au-button au-button-subtle" onClick={() => setText(derived)}>Regenerate from effects</button>
      </div>}
    </div>
  </section>
    <section className="au-panel au-effects-panel">
      <SectionTitle eyebrow="Unique to this Location" title="Location effects" description="Select a step to edit it." />
      <StepList field="effects" title="On collapse" description="When this Node resolves during Wave Collapse. On a tie, Winner gives to each player and a random player makes any choice." scope="location" cards={asCards(cards)} steps={location.effects} onChange={effects => syncHooks({ effects })} />
      <StepList field="ongoing" title="Ongoing" description="After each Runtime reveal while this Location is open. Winner = current controller; Loser = the trailing player. Actions count for the turn that is starting." scope="location" cards={asCards(cards)} steps={location.ongoing ?? []} onChange={ongoing => syncHooks({ ongoing })} />
      <StepList field="onPlay" title="On reveal" description="When a card is played (reveals) here. Targets are relative to that card’s owner; “this card” is the card that was played." scope="locationPlay" cards={asCards(cards)} steps={location.onPlay ?? []} onChange={onPlay => syncHooks({ onPlay })} />
      <StepList field="startTurn2" title="Start of turn 2" description="When Runtime turn 2 begins. A Location with these effects is only dealt as one of the first 3 revealed, so it is always open by then. Winner = current controller; Loser = the trailing player." scope="location" cards={asCards(cards)} steps={location.startTurn2 ?? []} onChange={startTurn2 => syncHooks({ startTurn2: startTurn2.length ? startTurn2 : undefined })} />
      <StepList field="startTurn3" title="Start of turn 3" description="When Runtime turn 3 begins. A Location with these effects is only dealt as one of the first 4 revealed. Winner = current controller; Loser = the trailing player." scope="location" cards={asCards(cards)} steps={location.startTurn3 ?? []} onChange={startTurn3 => syncHooks({ startTurn3: startTurn3.length ? startTurn3 : undefined })} />
    </section>
    <details className="au-property-section"><summary>Identity</summary><IdentityFields id={location.id} /></details>
    <AdvancedJson key={location.id} item={location} onApply={item => applyAdvanced(item as AuthoredLocation)} onPendingChange={onPendingChange} />
  </div>;
}

const TRAILING_HINT = 'Goes to the player who is behind instead of whoever won more Locations. Behind means fewer VP after counting Server damage: each enemy Server still standing adds that share of its destruction VP (75% of its health gone counts as 75% of its VP). If neither player is behind, both can claim it.';

function CircuitEditor({ item: reward, cards, update, applyAdvanced, onPendingChange }: EditorProps<AuthoredCircuitReward>) {
  const mods = useContext(ModsContext);
  const patch = (changes: Partial<AuthoredCircuitReward>) => update({ ...reward, ...changes });
  const syncText = (effects: EffectStep[]) => patch({ effects, text: describeSteps(effects, 'circuit', asCards(cards), mods) });
  return <div className="au-properties au-standalone-properties"><section className="au-panel"><SectionTitle title="Circuit reward properties" /><div className="au-field-grid">
    <TextField field="name" label="Name" value={reward.name} onChange={name => patch({ name })} />
    <TextField field="text" className="au-span-all" label="Reward text (from effects)" value={reward.text} multiline readOnly hint="Written from the effects below." />
    <div className="au-span-all"><Toggle field="awardTrailing" label="Award to trailing player" checked={!!reward.awardTrailing} onChange={checked => update(withTrailing(reward, checked))} hint={TRAILING_HINT} /></div>
  </div></section>
    <section className="au-panel au-effects-panel"><SectionTitle eyebrow="Unique to this reward" title="Reward effects" description="An ordered recipe for the player claiming this reward. Select a step to edit it." /><StepList field="effects" title="On claim" scope="circuit" cards={asCards(cards)} steps={reward.effects} onChange={syncText} /></section>
    <details className="au-property-section"><summary>Identity</summary><IdentityFields id={reward.id} /></details>
    <AdvancedJson key={reward.id} item={reward} onApply={item => applyAdvanced(item as AuthoredCircuitReward)} onPendingChange={onPendingChange} />
  </div>;
}

const MOD_HOOK_HELP = {
  onReveal: 'Each time the card carrying it turns face up, after its printed reveal effects.',
  onCollapse: 'When the Location it is played at resolves in Wave Collapse.',
  recurring: 'At the start of each later Runtime turn while the card is revealed on the board.',
} as const;

/** Every card, Location, reward or mod whose effects attach or remove this mod. */
function modUsers(document: ContentDocument, id: string): string[] {
  const needle = `"modifier":${JSON.stringify(id)}`;
  return [...document.cards, ...document.locations, ...document.circuitRewards, ...(document.mods ?? [])]
    .filter(item => item.id !== id && JSON.stringify(item).includes(needle)).map(item => item.name || item.id);
}

function ModPreview({ modifier, badge, legend, cards }: { modifier: CardModifier; badge: string; legend: string; cards: readonly AuthoredCard[] }) {
  const sample = cards.find(card => card.enabled && card.type === 'Character' && !isGeneratedCard(card)) ?? cards[0];
  const host = useMemo(() => sample && { ...sample, modifiers: [modifier] }, [sample, modifier]);
  return <aside className="au-preview-column" aria-label="Mod preview">
    <span className="au-eyebrow">On a card</span>
    {host && <div className="au-card-face-wrap"><CardFace card={host as unknown as Card} context="runtime" /></div>}
    <div className="au-preview-meta"><b>Badge {badge}</b><p>{legend}</p></div>
  </aside>;
}

const usedByText = (users: readonly string[]) => users.length ? `Attached or removed by: ${users.join(', ')}.` : 'Nothing uses this mod yet. Add an “Attach a mod” effect to a card, Location or Circuit reward.';

function BuiltinModEditor({ mod, cards, document, onChange }: { mod: BuiltinMod; cards: readonly AuthoredCard[]; document: ContentDocument; onChange: (field: keyof BuiltinModDetails, value: string) => void }) {
  const custom = document.builtinMods?.[mod.id] ?? {};
  const value = (field: keyof BuiltinModDetails) => custom[field] ?? DEFAULT_BUILTIN_MODS[mod.id][field];
  const aura = mod.id === 'powerAuraAtLocation';
  const modifier = useMemo(() => ({ id: 'preview', kind: mod.id, ...(aura ? { amount: 1 } : {}) }), [mod.id, aura]);
  const nHint = aura ? ' A standalone N shows the aura amount, which the “Attach a mod” step sets (1 by default).' : '';
  return <div className="au-card-workspace"><ModPreview modifier={modifier} badge={builtinMod(mod.id, aura ? 1 : undefined).badge} legend={aura ? 'Shown here with an aura of 1.' : 'Shown on the card art while it carries this mod.'} cards={cards} /><div className="au-properties">
    <section className="au-panel"><SectionTitle eyebrow="Built into the game" title="Card mod properties" description="Its name, badge and text are yours to edit. What it does is part of the game engine, so it can’t be changed or deleted. To make your own, choose + New card mod." /><div className="au-field-grid">
      <TextField field={`builtinMods.${mod.id}.name`} label="Name" value={value('name')} onChange={next => onChange('name', next)} hint="Used in effect text and the game log." />
      <TextField field={`builtinMods.${mod.id}.badge`} label="Badge" value={value('badge')} onChange={next => onChange('badge', next)} hint="Up to 12 characters on the card art." />
      <TextField field={`builtinMods.${mod.id}.text`} className="au-span-all" label="Mod text" value={value('text')} onChange={next => onChange('text', next)} multiline hint={`Shown when inspecting a card that carries this mod.${nHint}`} />
    </div>
      <p className="au-recipe-help">{usedByText(modUsers(document, mod.id))}</p>
    </section>
    <details className="au-property-section"><summary>Identity</summary><IdentityFields id={mod.id} /></details>
  </div></div>;
}

function ModEditor({ item: mod, cards, document, update, applyAdvanced, onPendingChange, setAwardTrailing }: EditorProps<AuthoredMod> & { document: ContentDocument; setAwardTrailing: (checked: boolean) => void }) {
  const mods = useContext(ModsContext);
  const rewards = document.circuitRewards.filter(reward => isModReward(reward, mod.id));
  const patch = (changes: Partial<AuthoredMod>) => update({ ...mod, ...changes });
  const text = describeMod(mod, asCards(cards), mods);
  const badge = modBadge(mod);
  const modifier = useMemo(() => ({ id: 'preview', kind: 'authored' as const, modId: mod.id, name: mod.name, badge }), [mod.id, mod.name, badge]);
  return <div className="au-card-workspace"><ModPreview modifier={modifier} badge={badge} legend="Generated from what the mod does: ◉ when revealed, ▼ on collapse, ↻ each turn, then its first effect. … means it does more." cards={cards} /><div className="au-properties">
    <section className="au-panel"><SectionTitle title="Card mod properties" description="Mods are permanent and stack: each copy on a card runs its effects. They are not doubled by “printed effects happen twice”." /><div className="au-field-grid">
      <TextField field="name" label="Name" value={mod.name} onChange={name => patch({ name })} />
      <TextField className="au-span-all" label="Mod text (from effects)" value={text} multiline readOnly hint="Shown when inspecting a card that carries this mod." />
      <div className="au-span-all"><Toggle field="awardTrailing" label="Award to trailing player" checked={rewards.length > 0 && rewards.every(reward => reward.awardTrailing)} disabled={!rewards.length} onChange={setAwardTrailing} hint={rewards.length ? `Applies to the Circuit reward that hands out this mod (${rewards.map(reward => reward.name).join(', ')}). ${TRAILING_HINT}` : 'No Circuit reward hands out only this mod, so there is nothing to award. Add one in Circuit rewards with an “Attach a mod” effect.'} /></div>
    </div>
      <p className="au-recipe-help">{usedByText(modUsers(document, mod.id))}</p>
    </section>
    <section className="au-panel au-effects-panel">
      <SectionTitle eyebrow="While attached" title="Mod effects" description="These run as the carrying card’s own effects. “You” is that card’s owner." />
      {(['onReveal', 'onCollapse', 'recurring'] as const).map(hook => <StepList key={hook} field={hook} title={MOD_HOOK_LABELS[hook]} description={MOD_HOOK_HELP[hook]} steps={mod[hook] ?? []} scope="card" cards={asCards(cards)} onChange={steps => patch({ [hook]: steps.length ? steps : undefined })} />)}
    </section>
    <details className="au-property-section"><summary>Identity</summary><IdentityFields id={mod.id} /></details>
    <AdvancedJson key={mod.id} item={mod} onApply={item => applyAdvanced(item as AuthoredMod)} onPendingChange={onPendingChange} />
  </div></div>;
}

export function AuthoringApp() {
  const [document, setDocument] = useState<ContentDocument>(() => normalizeDocument(getBundledDocument()));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(normalizeDocument(getBundledDocument())));
  const [revision, setRevision] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('Loading saved content…');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [section, setSection] = useState<Section>('cards');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>(() => openingFilter(PRIMARY_TABS[0]));
  const [sortKey, setSortKey] = useState<CardSort>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [busy, setBusy] = useState(false);
  const [advancedPending, setAdvancedPending] = useState(false);
  const [, setHistoryTick] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  setBuiltinModDetails(document.builtinMods);
  const past = useRef<ContentDocument[]>([]);
  const future = useRef<ContentDocument[]>([]);
  const lastEdit = useRef<{ key: string; at: number } | null>(null);
  const pendingFocus = useRef<{ kind: 'field' | 'row' | 'name'; key: string } | null>(null);

  const currentJson = JSON.stringify(document);
  const savedDocument = useMemo(() => JSON.parse(savedJson) as ContentDocument, [savedJson]);
  const savedIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const key of SECTION_KEYS) for (const item of sectionItems(savedDocument, key)) index.set(`${key}:${item.id}`, JSON.stringify(item));
    return index;
  }, [savedDocument]);
  const changes = useMemo(() => {
    const modified = new Set<string>();
    const present = new Set<string>();
    for (const key of SECTION_KEYS) for (const item of sectionItems(document, key)) {
      const id = `${key}:${item.id}`;
      present.add(id);
      if (savedIndex.get(id) !== JSON.stringify(item)) modified.add(id);
    }
    for (const kind of BUILTIN_MODIFIERS) if (JSON.stringify(document.builtinMods?.[kind] ?? {}) !== JSON.stringify(savedDocument.builtinMods?.[kind] ?? {})) modified.add(`mods:${kind}`);
    let deleted = 0;
    for (const id of savedIndex.keys()) if (!present.has(id)) deleted += 1;
    return { modified, count: modified.size + deleted };
  }, [document, savedIndex, savedDocument]);
  const dirty = currentJson !== savedJson;

  const deferredDocument = useDeferredValue(document);
  const issues = useMemo(() => describeIssues(deferredDocument, validateContent(deferredDocument)), [deferredDocument]);
  const issuesByItem = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) if (issue.section && issue.itemId) {
      const key = `${issue.section}:${issue.itemId}`;
      map.set(key, [...(map.get(key) ?? []), issue]);
    }
    return map;
  }, [issues]);
  const globalIssues = issues.filter(issue => !issue.itemId);

  const activeSection = sections.find(item => item.key === section)!;
  const list = listedItems(document, section);
  const mods = useMemo(() => enabledMods(document.mods), [document.mods]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = list.filter(item => `${item.name} ${item.id} ${'effect' in item && typeof item.effect === 'string' ? item.effect : ''}`.toLowerCase().includes(query));
    return section === 'cards' ? sortCards((filtered as AuthoredCard[]).filter(card => query || matchesCardFilter(card, cardFilter)), sortKey, sortDirection) : filtered.sort((a, b) => Number(isBuiltin(b)) - Number(isBuiltin(a)) || a.name.localeCompare(b.name));
  }, [list, search, section, cardFilter, sortKey, sortDirection]);
  const selected = list.find(item => item.id === selectedId) ?? visible[0] ?? null;
  const selectedKey = selected ? `${section}:${selected.id}` : '';
  const selectedIssues = selected ? issuesByItem.get(selectedKey) ?? [] : [];
  const invalidFields = useMemo(() => new Set(selectedIssues.map(issue => issue.field).filter((field): field is string => Boolean(field))), [selectedIssues]);
  const selectedHidden = Boolean(selected) && !visible.some(item => item.id === selected?.id);
  const canRevert = Boolean(selected) && changes.modified.has(selectedKey) && savedIndex.has(selectedKey);

  useEffect(() => { if (selected && selectedId !== selected.id) setSelectedId(selected.id); }, [selected, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/content', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Content service returned ${response.status}.`);
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !Number.isSafeInteger((data as { revision?: unknown }).revision) || !isDocument((data as { document?: unknown }).document)) throw new Error('Content service returned an incomplete document.');
        if (cancelled) return;
        const incoming = (data as { revision: number; document: ContentDocument });
        const editable = normalizeDocument(incoming.document);
        setDocument(editable);
        setSavedJson(JSON.stringify(editable));
        setRevision(incoming.revision);
        setStatus('ready');
        setMessage('Saved content loaded from disk.');
      } catch (cause) {
        if (cancelled) return;
        setStatus('offline');
        setMessage(`The content service is unavailable. You can edit bundled content and export JSON, but Save to disk is disabled. ${cause instanceof Error ? cause.message : ''}`);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!dirty && !advancedPending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, advancedPending]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 9000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id, section, cardFilter]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    requestAnimationFrame(() => {
      if (target.kind === 'row') { listRef.current?.querySelector<HTMLElement>(`[data-author-item="${CSS.escape(target.key)}"]`)?.focus(); return; }
      const selector = target.kind === 'name' ? '[data-field="name"]' : `[data-field="${CSS.escape(target.key)}"]`;
      const element = window.document.querySelector<HTMLElement>(`.au-editor ${selector}`);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const control = element.querySelector<HTMLElement>('.au-step-body select, .au-step-body input, input:not([readonly]), select, textarea:not([readonly]), button') ?? element;
      control.focus({ preventScroll: true });
      if (target.kind === 'name' && control instanceof HTMLInputElement) control.select();
    });
  });

  function commit(next: ContentDocument, coalesceKey?: string) {
    const previous = documentRef.current;
    if (next === previous) return;
    const now = Date.now();
    const merge = coalesceKey !== undefined && lastEdit.current?.key === coalesceKey && now - lastEdit.current.at < 1200;
    if (!merge) { past.current.push(previous); if (past.current.length > 200) past.current.shift(); }
    future.current = [];
    lastEdit.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    documentRef.current = next;
    setDocument(next);
    setHistoryTick(tick => tick + 1);
    if (status === 'saved' || status === 'error') setStatus('ready');
    if (status !== 'offline' && status !== 'conflict') setMessage('Unsaved changes.');
  }

  function resetHistory() {
    past.current = [];
    future.current = [];
    lastEdit.current = null;
    setHistoryTick(tick => tick + 1);
  }

  function leaveJsonDraft() {
    if (!advancedPending) return true;
    if (!window.confirm('Discard the unapplied Advanced JSON draft?')) return false;
    setAdvancedPending(false);
    return true;
  }

  function selectItem(id: string | null) {
    setSelectedId(id);
    setActiveStep(null);
  }

  function travel(from: typeof past, to: typeof future, label: string) {
    if (!from.current.length || !leaveJsonDraft()) return false;
    to.current.push(documentRef.current);
    const next = from.current.pop()!;
    lastEdit.current = null;
    documentRef.current = next;
    setDocument(next);
    setHistoryTick(tick => tick + 1);
    if (status === 'saved' || status === 'error') setStatus('ready');
    setNotice({ text: label });
    return true;
  }
  const undo = () => travel(past, future, 'Undid the last change.');
  const redo = () => travel(future, past, 'Redid the change.');

  function resetBuiltinMod(kind: ModifierKind) {
    let next = documentRef.current;
    for (const field of BUILTIN_MOD_FIELDS) next = withBuiltinModField(next, kind, field, DEFAULT_BUILTIN_MODS[kind][field]);
    commit(next);
    setNotice({ text: `${DEFAULT_BUILTIN_MODS[kind].name}: name, badge and text reset to defaults.` });
  }

  function update(item: Item) {
    const oldId = selected?.id;
    const previous = documentRef.current;
    let next = { ...previous, [section]: sectionItems(previous, section).map(current => current.id === oldId ? item : current) } as ContentDocument;
    const before = section === 'mods' ? previous.mods?.find(mod => mod.id === oldId) : undefined;
    if (before) next = followModRename(next, before, item as AuthoredMod);
    commit(next, `${section}:${oldId}`);
    setSelectedId(item.id);
  }

  function setModRewardsTrailing(modId: string, checked: boolean) {
    const previous = documentRef.current;
    commit({ ...previous, circuitRewards: previous.circuitRewards.map(reward => isModReward(reward, modId) ? withTrailing(reward, checked) : reward) }, `mods:${modId}:awardTrailing`);
  }

  /** Adds a new card mod together with the Circuit reward that attaches it. */
  function addModWithReward(previous: ContentDocument, mod: AuthoredMod) {
    const withMod = { ...previous, mods: [...(previous.mods ?? []), mod] };
    const reward = createModReward(createId('circuitRewards', previous.circuitRewards), mod, withMod);
    commit({ ...withMod, circuitRewards: [...previous.circuitRewards, reward] });
    setNotice({ text: `Also created the “${reward.name}” Circuit reward, which attaches this mod to a random Character in the player’s deck.` });
  }

  function activateDeck(id: string) {
    const previous = documentRef.current;
    commit({ ...previous, activeStartingDeckId: id });
    setNotice({ text: 'New games will load this starting deck once you save.' });
  }

  function applyAdvanced(item: Item) {
    const previous = documentRef.current;
    const next = { ...previous, [section]: sectionItems(previous, section).map(current => current.id === selected?.id ? item : current) } as ContentDocument;
    const errors = validateContent(next);
    if (errors.length) throw new Error(`Cannot apply this JSON: ${describeIssues(next, errors).map(issue => [issue.label, issue.message].filter(Boolean).join(': ')).join(' · ')}`);
    update(sectionItems(normalizeDocument(next), section).find(current => current.id === item.id) as Item);
  }

  function addItem() {
    if (!leaveJsonDraft()) return;
    const name = section === 'cards' ? 'New card' : section === 'locations' ? 'New location' : section === 'startingDecks' ? 'New deck' : section === 'mods' ? 'New mod' : 'New circuit reward';
    const id = createId(section, list);
    let item: Item;
    if (section === 'cards') { const category = newCardCategory(cardFilter); item = { id, definitionId: id, name, ...category, enabled: cardFilter !== 'Disabled', cost: 0, ...(category.type !== 'Crypto' ? { power: 0 } : { cryptoValue: 1 }), ...(category.type === 'VP' ? { vp: 1 } : {}), art: CARD_ART_PLACEHOLDER, effect: '', onReveal: [] }; }
    else if (section === 'locations') item = { id, name, rule: '', reward: '', effects: [], enabled: true };
    else if (section === 'startingDecks') item = { id, name, cards: [] };
    else if (section === 'mods') item = { id, name, enabled: true, onReveal: [createStep('gainCrypto', 'card')] };
    else item = { id, name, text: '', cost: 0, effects: [], enabled: true };
    const previous = documentRef.current;
    if (section === 'mods') addModWithReward(previous, item as AuthoredMod);
    else commit({ ...previous, [section]: [...sectionItems(previous, section), item] } as ContentDocument);
    selectItem(id);
    setSearch('');
    pendingFocus.current = { kind: 'name', key: id };
  }

  function duplicateItem() {
    if (!leaveJsonDraft() || !selected) return;
    const clone = structuredClone(selected);
    clone.id = createId(section, list);
    clone.name = `${selected.name} copy`;
    if ('pool' in clone) clone.definitionId = clone.id;
    const previous = documentRef.current;
    if (section === 'mods') addModWithReward(previous, clone as AuthoredMod);
    else commit({ ...previous, [section]: [...sectionItems(previous, section), clone] } as ContentDocument);
    selectItem(clone.id);
    setSearch('');
    pendingFocus.current = { kind: 'name', key: clone.id };
  }

  function deleteItem() {
    if (!leaveJsonDraft() || !selected) return;
    const previous = documentRef.current;
    const remaining = sectionItems(previous, section).filter(item => item.id !== selected.id);
    const next = { ...previous, [section]: remaining } as ContentDocument;
    if (section === 'startingDecks' && previous.activeStartingDeckId === selected.id) {
      if (!remaining.length) { setNotice({ text: 'Keep at least one starting deck. Create another before deleting this one.' }); return; }
      next.activeStartingDeckId = remaining[0].id;
    }
    const linkedRewards = section === 'mods' ? previous.circuitRewards.filter(reward => isModReward(reward, selected.id)) : [];
    if (linkedRewards.length) next.circuitRewards = previous.circuitRewards.filter(reward => !linkedRewards.includes(reward));
    commit(next);
    selectItem(null);
    const users = section === 'mods' ? modUsers(next, selected.id) : [];
    const alsoDeleted = linkedRewards.length ? ` Also deleted its Circuit reward${linkedRewards.length > 1 ? 's' : ''} ${linkedRewards.map(reward => `“${reward.name}”`).join(', ')}.` : '';
    setNotice({ text: `Deleted “${selected.name || selected.id}”.${alsoDeleted} It’s removed from disk when you save.${users.length ? ` Still used by ${users.join(', ')}; fix those effects before saving.` : ''}`, restoreId: selected.id });
  }

  function revertItem() {
    if (!selected) return;
    const saved = sectionItems(savedDocument, section).find(item => item.id === selected.id);
    if (!saved) return;
    const previous = documentRef.current;
    commit({ ...previous, [section]: sectionItems(previous, section).map(item => item.id === selected.id ? structuredClone(saved) : item) } as ContentDocument);
    setActiveStep(null);
    setNotice({ text: `Reverted “${saved.name}” to the saved version.` });
  }

  function jumpTo(issue: Issue) {
    if (!issue.section || !issue.itemId) { setNotice({ text: `${issue.itemName}: ${issue.message}` }); return; }
    if (!leaveJsonDraft()) return;
    if (issue.section !== section) { setSection(issue.section); setSearch(''); }
    selectItem(issue.itemId);
    // Step keys end in a step index (`onReveal.1`, `schedule.0.2`, `effects.0.options.1.cost.0`); bare `schedule.N` is a schedule list.
    if (issue.field && /\.\d+$/.test(issue.field) && !/^schedule\.\d+$/.test(issue.field)) setActiveStep(issue.field);
    if (issue.field) pendingFocus.current = { kind: 'field', key: issue.field };
  }

  async function save() {
    if (revision === null || status === 'offline' || status === 'saving' || !dirty || advancedPending) return;
    const errors = validateContent(document);
    if (errors.length) {
      const described = describeIssues(document, errors);
      setStatus('error');
      setMessage(`${described.length === 1 ? 'One problem blocks' : `${described.length} problems block`} saving.`);
      jumpTo(described[0]);
      return;
    }
    const snapshot = currentJson;
    setStatus('saving');
    setMessage('Writing changes to disk…');
    try {
      const response = await fetch('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ revision, document }) });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 409) { setStatus('conflict'); setMessage(`${readError(data, 'The saved content changed elsewhere.')} Your edits are still here. Export them or reload the newer version; Save will not overwrite it.`); return; }
      if (!response.ok) throw new Error(readError(data, `Save failed (${response.status}).`));
      if (!data || typeof data !== 'object' || !Number.isSafeInteger((data as { revision?: unknown }).revision)) throw new Error('Save response did not include a revision.');
      setRevision((data as { revision: number }).revision);
      setSavedJson(snapshot);
      void refreshDepthStatus();
      if (JSON.stringify(documentRef.current) === snapshot) { setStatus('saved'); setMessage('Saved to disk.'); }
      else { setStatus('ready'); setMessage('Earlier changes saved. Newer edits are still unsaved.'); }
    } catch (cause) { setStatus('error'); setMessage(cause instanceof Error ? cause.message : 'Save failed. Your changes remain in the editor.'); }
  }

  async function reload() {
    if (!leaveJsonDraft()) return;
    if (dirty && !window.confirm('Discard your unsaved edits and load the version on disk?')) return;
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/content', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Reload failed (${response.status}).`);
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !Number.isSafeInteger((data as { revision?: unknown }).revision) || !isDocument((data as { document?: unknown }).document)) throw new Error('The content service returned an incomplete document.');
      const incoming = data as { revision: number; document: ContentDocument };
      const editable = normalizeDocument(incoming.document);
      setDocument(editable);
      setSavedJson(JSON.stringify(editable));
      setRevision(incoming.revision);
      selectItem(null);
      resetHistory();
      setStatus('ready');
      setMessage('Latest saved content loaded from disk.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Reload failed.'); }
    finally { setBusy(false); }
  }

  function exportJson() {
    if (advancedPending) { setMessage('Apply or reset the Advanced JSON draft before exporting.'); return; }
    const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = 'ouroboros-content.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDocument(parsed)) throw new Error('Expected a content document with cards, locations and circuitRewards arrays.');
      const upgraded = upgradeDocument(parsed) as ContentDocument;
      const errors = validateContent(upgraded);
      if (errors.length) throw new Error(`Imported content has problems: ${describeIssues(upgraded, errors).slice(0, 5).map(issue => `${issue.itemName}${issue.label ? ` · ${issue.label}` : ''}: ${issue.message}`).join(' · ')}`);
      if (!leaveJsonDraft()) return;
      if (dirty && !window.confirm('Replace your unsaved edits with the imported JSON?')) return;
      setDocument(normalizeDocument(upgraded));
      selectItem(null);
      resetHistory();
      setMessage('JSON imported into the editor. Review it, then Save to write it to disk.');
      if (status === 'saved') setStatus('ready');
    } catch (cause) { setStatus('error'); setMessage(cause instanceof Error ? cause.message : 'Could not import JSON.'); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }

  const actions = useRef({ save, undo, redo });
  actions.current = { save, undo, redo };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing = Boolean(target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)));
      const key = event.key.toLowerCase();
      if (mod && key === 's') { event.preventDefault(); void actions.current.save(); return; }
      if (mod && (key === 'z' || key === 'y')) {
        if (target?.closest('.au-advanced, .au-art-dialog') || (target instanceof HTMLInputElement && target.type === 'search')) return;
        event.preventDefault();
        if (key === 'y' || event.shiftKey) actions.current.redo(); else actions.current.undo();
        return;
      }
      if (event.key === '/' && !typing && !mod && !target?.closest('dialog')) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onListKey(event: ReactKeyboardEvent) {
    const index = visible.findIndex(item => item.id === selected?.id);
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(visible.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = visible.length - 1;
    else return;
    event.preventDefault();
    const item = visible[next];
    if (!item || item.id === selected?.id || !leaveJsonDraft()) return;
    selectItem(item.id);
    pendingFocus.current = { kind: 'row', key: item.id };
  }

  const statusKind = advancedPending ? 'dirty' : status === 'ready' || status === 'saved' ? (dirty ? 'dirty' : 'saved') : status;
  const statusLabel = advancedPending ? 'JSON draft' : status === 'loading' ? 'Loading' : status === 'saving' ? 'Saving' : status === 'offline' ? 'Local preview' : status === 'conflict' ? 'Conflict' : status === 'error' && issues.length === 0 ? 'Save error' : dirty ? `Unsaved · ${changes.count || 1} ${changes.count === 1 ? 'change' : 'changes'}` : 'Saved';
  const changeSection = (next: Section) => { if (!leaveJsonDraft()) return; setSection(next); selectItem(null); setSearch(''); if (listRef.current) listRef.current.scrollTop = 0; };
  const sortBy = (key: CardSort) => { setSelectedId(selected?.id ?? null); setSortDirection(key === sortKey && sortDirection === 'asc' ? 'desc' : 'asc'); setSortKey(key); };
  const entitySummary = (item: Item) => isBuiltin(item) ? `${builtinMod(item.id).badge} ${builtinMod(item.id).text}` : isDeck(item) ? `${deckSize(item)} cards · ${item.cards.length} different` : 'rule' in item ? item.reward : 'text' in item ? item.text : 'effect' in item ? item.effect : `${modBadge(item)} ${describeMod(item, asCards(document.cards), mods)}`;
  const sectionIssueCount = (key: Section) => issues.filter(issue => issue.section === key).length;
  const saveBlocked = issues.length > 0;
  const shortcutHint = `${MOD}S save · ${MOD}Z undo · / search · ↑↓ browse`;
  const primary = primaryFilterOf(cardFilter);
  const secondary = section === 'cards' ? secondaryFiltersFor(primary) : null;
  const subGroup = secondary ? [...secondary, primary] as CardFilter[] : null;
  const selectFilter = (filter: CardFilter) => {
    if (!leaveJsonDraft()) return;
    setCardFilter(filter);
    selectItem(null);
  };
  const selectTab = (tab: CardFilter) => { if (tab !== primary) selectFilter(openingFilter(tab)); };
  const rove = (event: ReactKeyboardEvent, group: readonly CardFilter[], current: CardFilter, orientation: 'horizontal' | 'vertical', select = selectFilter) => {
    const [back, forward] = orientation === 'horizontal' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    const at = group.indexOf(current);
    const next = group[(at + (event.key === forward ? 1 : -1) + group.length) % group.length];
    select(next);
    requestAnimationFrame(() => window.document.querySelector<HTMLElement>(`[data-filter="${next}"]`)?.focus());
  };

  return <div className="authoring-app au-workbench">
    <header className="au-header">
      <div className="au-brand"><a href="/" aria-label="Return to game" className="au-mark" onClick={event => { if ((dirty || advancedPending) && !window.confirm('Leave Content Studio with unsaved changes?')) event.preventDefault(); }}>◈</a><div><span>OUROBOROS</span><b>Content Studio</b></div></div>
      <nav className="au-entity-nav" aria-label="Content sections">{sections.map(item => { const count = sectionIssueCount(item.key); return <button type="button" key={item.key} className={section === item.key ? 'active' : ''} aria-current={section === item.key ? 'page' : undefined} onClick={() => changeSection(item.key)}>{item.label}{count > 0 && <span className="au-nav-issues" aria-label={`${count} problems`}>{count}</span>}</button>; })}</nav>
      <div className="au-header-actions">
        <span className={`au-save-status au-status-${statusKind}`} role="status"><i />{statusLabel}</span>
        {saveBlocked && <button type="button" className="au-issue-chip" onClick={() => jumpTo(issues[0])} title="Show the first problem">{issues.length === 1 ? '1 problem' : `${issues.length} problems`}</button>}
      </div>
    </header>
    <div className="au-workbench-tools">
      <div className="au-catalog-heading"><h1>{activeSection.label}</h1><small>{list.length} {activeSection.label.toLowerCase()}</small></div>
      <label className="au-workbench-search"><span className="au-sr-only">Search {activeSection.label}</span><input ref={searchRef} type="search" aria-label={`Search ${activeSection.label}`} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && search) { event.preventDefault(); setSearch(''); } }} placeholder={section === 'cards' ? 'Search cards by name, ID or text…' : `Search ${activeSection.label.toLowerCase()}…`} /><kbd aria-hidden="true">/</kbd></label>
      <button className="au-button au-button-primary au-create" type="button" onClick={addItem}>+ New {activeSection.singular}</button>
    </div>
    {section === 'cards' && <div className="au-filter-stack">
      <nav className="au-filter-tabs" role="tablist" aria-label="Card filters" onKeyDown={event => rove(event, PRIMARY_TABS, primary, 'horizontal', selectTab)}>
        {PRIMARY_TABS.map(filter => <button type="button" role="tab" key={filter} data-filter={filter} data-tone={FILTER_TONES[filter]} tabIndex={primary === filter ? 0 : -1} aria-label={filter} aria-selected={primary === filter} className={[primary === filter ? 'active' : '', filter === 'All' ? 'au-filter-all' : ''].filter(Boolean).join(' ')} onClick={() => selectTab(filter)}><b>{filter}</b><span>{document.cards.filter(card => matchesCardFilter(card, filter)).length}</span></button>)}
      </nav>
    </div>}
    {globalIssues.length > 0 && <div className="au-issues au-issues-global" role="region" aria-label="Problems across all content">
      <b>{globalIssues.length === 1 ? 'One content rule blocks saving' : `${globalIssues.length} content rules block saving`}</b>
      <ul>{globalIssues.map((issue, index) => <li key={index}>{issue.itemName}: {issue.message}</li>)}</ul>
    </div>}
    <div className={`au-workbench-body${subGroup ? ' au-workbench-body--rail' : ''}`}>
      {subGroup && <nav className="au-subtype-rail" role="tablist" aria-orientation="vertical" aria-label={`${primary} subtype filters`} onKeyDown={event => rove(event, subGroup, cardFilter, 'vertical')}>
        {subGroup.map(filter => {
          const label = filter === primary ? `All ${primary}` : filter;
          const style = filter === primary ? null : classStyle(filter as CardClass);
          return <button type="button" role="tab" key={filter} data-filter={filter} data-tone={FILTER_TONES[filter]} style={style ? { '--tone': CARD_STYLE_COLORS[style] } as CSSProperties : undefined} tabIndex={cardFilter === filter ? 0 : -1} title={label} aria-label={label} aria-selected={cardFilter === filter} className={[cardFilter === filter ? 'active' : '', filter === primary ? 'au-filter-all' : ''].filter(Boolean).join(' ')} onClick={() => selectFilter(filter)}>
            {style ? <i className="au-subtype-icon" aria-hidden="true" style={{ maskImage: `url(${CARD_STYLE_ICONS[style]})`, WebkitMaskImage: `url(${CARD_STYLE_ICONS[style]})` }} /> : <b aria-hidden="true">All</b>}
            <span>{document.cards.filter(card => matchesCardFilter(card, filter)).length}</span>
          </button>;
        })}
      </nav>}
      <aside className="au-catalog-list" aria-label={`${activeSection.label} catalog`}>
        <div className="au-list-caption"><span>{visible.length} shown{section === 'cards' && search.trim() ? ' · searching all cards' : ''}</span><small>{section === 'cards' ? `${SORT_LABEL[sortKey]} · ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : 'Alphabetical'}</small></div>
        {section === 'cards' && <div className="au-sort-head"><span aria-hidden="true" />{(['name', 'cost', 'power', 'vp'] as const).map(key => <button type="button" key={key} aria-label={`Sort by ${SORT_LABEL[key]}`} aria-pressed={sortKey === key} onClick={() => sortBy(key)}>{SORT_LABEL[key]}{sortKey === key && <span aria-hidden="true">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>}</button>)}</div>}
        {selectedHidden && selected && <button type="button" className="au-list-pinned" onClick={() => { setSearch(''); setCardFilter('All'); }}>Editing “{selected.name || 'Untitled'}”, hidden by the current {search ? 'search' : 'filter'}. <u>Show it</u></button>}
        <div className="au-list" role="listbox" aria-label={activeSection.label} ref={listRef} onKeyDown={onListKey}>
          {visible.map((item, index) => {
            const key = `${section}:${item.id}`;
            const isSelected = selected?.id === item.id;
            const itemIssues = issuesByItem.get(key);
            const modified = changes.modified.has(key);
            const markers = <>{modified && <i className="au-dot-modified" title="Unsaved changes" aria-label="Unsaved changes" />}{itemIssues && <i className="au-row-flag" title={itemIssues.map(issue => [issue.label, issue.message].filter(Boolean).join(': ')).join('\n')} aria-label={`${itemIssues.length} problems`}>!</i>}</>;
            return <button role="option" aria-selected={isSelected} tabIndex={isSelected || (selectedHidden && index === 0) ? 0 : -1} type="button" key={item.id} data-author-item={item.id} data-tone={'pool' in item ? cardTone(item) : undefined} className={`au-list-item ${section === 'cards' ? 'au-card-row' : 'au-entity-row'} ${isSelected ? 'active' : ''}`} onClick={() => { if (!leaveJsonDraft()) return; selectItem(item.id); }}>
              {'pool' in item ? <><Artwork card={item} /><span className="au-row-title"><b>{item.name || 'Untitled card'}{markers}</b><small><i className="au-tone-dot" aria-hidden="true" style={{ '--tone': CARD_STYLE_COLORS[subtypeStyle(item)] } as CSSProperties} />{cardCategoryLabel(item)}</small></span><span className="au-row-cost" aria-label={`Cost ${item.cost}`}>{item.cost}</span><span className="au-row-power" aria-label={item.power === undefined ? 'No Power' : `Power ${item.power}`}>{item.power ?? '—'}</span><span className="au-row-vp" aria-label={item.vp === undefined ? 'No VP' : `${item.vp} VP`}>{item.vp ?? '—'}</span></> : <><b>{item.name || 'Untitled'}{markers}{isDeck(item) ? document.activeStartingDeckId === item.id && <em className="au-row-active">In game</em> : isBuiltin(item) ? <em className="au-row-builtin">Built-in</em> : !item.enabled && <em className="au-row-disabled">Disabled</em>}</b><small>{entitySummary(item)}</small></>}
            </button>;
          })}
          {visible.length === 0 && <div className="au-empty-list">{search
            ? <><p>No {activeSection.label.toLowerCase()} match “{search}”.</p><button type="button" className="au-button au-button-subtle" onClick={() => setSearch('')}>Clear search</button></>
            : section === 'cards' && cardFilter === 'Generated' ? <p>No Generated cards yet. Create one here and use it in a Gain Card or Morph recipe.</p> : <p>Nothing in this filter yet.</p>}</div>}
        </div>
      </aside>
      <ModsContext.Provider value={mods}>
      <EditorFocusContext.Provider value={{ activeStep, setActiveStep, invalid: invalidFields }}>
      <main className="au-editor">{selected ? <>
        <div className="au-editor-toolbar"><div className="au-editor-title"><span className="au-eyebrow">Editing {activeSection.singular}{changes.modified.has(selectedKey) && <em className="au-modified-tag">{savedIndex.has(selectedKey) || isBuiltin(selected) ? 'Unsaved changes' : 'New · unsaved'}</em>}</span><h1>{selected.name || 'Untitled'}</h1></div><div className="au-item-actions">{isBuiltin(selected) ? <><em className="au-row-builtin">Built-in</em>{document.builtinMods?.[selected.id] && <button type="button" className="au-button au-button-subtle" onClick={() => resetBuiltinMod(selected.id)}>Reset to defaults</button>}</> : <>{isDeck(selected) ? <Toggle label="Load in game" checked={document.activeStartingDeckId === selected.id} disabled={document.activeStartingDeckId === selected.id} onChange={checked => { if (checked) activateDeck(selected.id); }} /> : <Toggle field="enabled" label="Enabled" checked={selected.enabled} onChange={enabled => update({ ...selected, enabled })} />}{canRevert && <button type="button" className="au-button au-button-subtle" onClick={revertItem}>Revert</button>}<button type="button" className="au-button au-button-subtle" onClick={duplicateItem}>Duplicate</button><button type="button" className="au-button au-button-danger" onClick={deleteItem}>Delete</button></>}</div></div>
        {selectedIssues.length > 0 && <div className="au-issues" role="region" aria-label="Problems blocking save">
          <b>{selectedIssues.length === 1 ? 'One problem blocks saving' : `${selectedIssues.length} problems block saving`}</b>
          <ul>{selectedIssues.map((issue, index) => <li key={index}><button type="button" onClick={() => jumpTo(issue)} disabled={!issue.field}>{issue.label && <span>{issue.label}</span>}{issue.message}</button></li>)}</ul>
        </div>}
        <div className="au-editor-content" key={selectedKey}>
          {isBuiltin(selected) ? <BuiltinModEditor mod={selected} cards={document.cards} document={document} onChange={(field, value) => commit(withBuiltinModField(documentRef.current, selected.id, field, value), `builtinMods:${selected.id}:${field}`)} /> : section === 'startingDecks' ? <DeckEditor deck={selected as StartingDeck} cards={document.cards} active={document.activeStartingDeckId === selected.id} update={value => update(value)} /> : section === 'cards' ? <CardEditor item={selected as AuthoredCard} cards={document.cards} update={value => update(value)} applyAdvanced={value => applyAdvanced(value)} onPendingChange={setAdvancedPending} /> : section === 'locations' ? <LocationEditor item={selected as AuthoredLocation} cards={document.cards} update={value => update(value)} applyAdvanced={value => applyAdvanced(value)} onPendingChange={setAdvancedPending} /> : section === 'mods' ? <ModEditor item={selected as AuthoredMod} cards={document.cards} document={document} setAwardTrailing={checked => setModRewardsTrailing(selected.id, checked)} update={value => update(value)} applyAdvanced={value => applyAdvanced(value)} onPendingChange={setAdvancedPending} /> : <CircuitEditor item={selected as AuthoredCircuitReward} cards={document.cards} update={value => update(value)} applyAdvanced={value => applyAdvanced(value)} onPendingChange={setAdvancedPending} />}
        </div>
      </> : <div className="au-empty-editor"><span>◇</span><h2>Create your next {activeSection.singular}</h2><p>{section === 'startingDecks' ? 'Name it, add cards, then choose Load in game to use it.' : section === 'mods' ? 'A mod gives the card it’s attached to extra effects for the rest of the game. Attach it with an “Attach a mod” effect.' : 'Choose properties and build its own effects recipe.'}</p><button className="au-button au-button-primary" type="button" onClick={addItem}>+ New {activeSection.singular}</button></div>}</main>
      </EditorFocusContext.Provider>
      </ModsContext.Provider>
    </div>
    <footer className={`au-footer au-footer-${status}`}>
      <span className="au-footer-message" role="status">{notice ? <>{notice.text}{notice.restoreId && <button type="button" className="au-link-button" onClick={() => { const restore = notice.restoreId; if (undo() && restore) selectItem(restore); setNotice(null); }}>Undo</button>}</> : <>{advancedPending ? 'Apply or reset the Advanced JSON draft before saving.' : message} {!dirty && revision !== null ? `Revision ${revision}` : ''}</>}</span>
      <span className="au-shortcuts">{shortcutHint}</span>
      <div className="au-file-actions"><button type="button" onClick={exportJson}>Export JSON</button><button type="button" onClick={() => importRef.current?.click()}>Import JSON</button><input ref={importRef} className="au-hidden" type="file" accept="application/json,.json" onChange={event => void importJson(event.target.files?.[0])} /></div>
      <div className="au-footer-actions">
        <div className="au-history" role="group" aria-label="History">
          <button type="button" className="au-icon-button" onClick={undo} disabled={!past.current.length} aria-label="Undo" title={`Undo (${MOD}Z)`}>↶</button>
          <button type="button" className="au-icon-button" onClick={redo} disabled={!future.current.length} aria-label="Redo" title={`Redo (${MOD}⇧Z)`}>↷</button>
        </div>
        <button type="button" className="au-button au-button-subtle" onClick={reload} disabled={busy || status === 'loading'}>Reload</button>
        <button type="button" className="au-button au-button-primary" title={saveBlocked ? 'Fix the listed problems first' : `Save (${MOD}S)`} onClick={() => void save()} disabled={!dirty || saveBlocked || revision === null || advancedPending || status === 'saving' || status === 'offline' || status === 'conflict'}>{status === 'saving' ? 'Saving…' : 'Save to disk'}</button>
      </div>
    </footer>
  </div>;
}

export default AuthoringApp;
