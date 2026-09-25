import { useEffect, useMemo, useRef, useState } from 'react';
import type { EvaluationEffect } from '../game';
import type { LocationRewardEffect, CircuitRewardDefinition } from '../content';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from '../cardArtwork';
import {
  validateContent,
  materializeItemRecipes,
  type AuthoredCard,
  type AuthoredCircuitReward,
  type AuthoredLocation,
  type ContentDocument,
} from './contentModel';
import { getBundledDocument } from './contentStore';
import { RecipeRows } from './RecipeEditor';
import { CardFace } from '../CardFace';
import { type Recipe } from './recipeModel';
import { cardFilters, cardClasses, cardClassOf, cardCategoryLabel, matchesCardFilter, newCardCategory, sortCards, type CardFilter, type CardSort } from './cardBrowser';
import './authoring.css';
import './authoring-workbench.css';
import '../card-surfaces.css';

type Section = 'cards' | 'locations' | 'circuitRewards';
type Item = AuthoredCard | AuthoredLocation | AuthoredCircuitReward;
type SaveStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'conflict' | 'offline';

const sections: { key: Section; label: string; singular: string; description: string }[] = [
  { key: 'cards', label: 'Cards', singular: 'card', description: 'Card catalog, market pools, art, and triggers' },
  { key: 'locations', label: 'Locations', singular: 'location', description: 'Node rules and collapse rewards' },
  { key: 'circuitRewards', label: 'Circuit rewards', singular: 'circuit reward', description: 'Draft rewards earned by the winner' },
];

function slug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-item';
}

function nextId(base: string, existing: readonly { id: string }[]) {
  const ids = new Set(existing.map(item => item.id));
  let id = slug(base);
  if (!ids.has(id)) return id;
  let suffix = 2;
  while (ids.has(`${id}-${suffix}`)) suffix += 1;
  return `${id}-${suffix}`;
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

function isDocument(value: unknown): value is ContentDocument {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.version === 1 && Array.isArray(record.cards) && Array.isArray(record.locations) && Array.isArray(record.circuitRewards) && Array.isArray(record.effects);
}

function NumberField({ label, value, onChange, min, step, hint, disabled = false }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void; min?: number; step?: number; hint?: string; disabled?: boolean }) {
  return <label className="au-field"><span>{label}</span><input aria-label={label} type="number" value={value ?? ''} min={min} step={step ?? 1} disabled={disabled} onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />{hint && <small>{hint}</small>}</label>;
}

function TextField({ label, value, onChange, hint, multiline = false, placeholder, disabled = false }: { label: string; value: string; onChange: (value: string) => void; hint?: string; multiline?: boolean; placeholder?: string; disabled?: boolean }) {
  return <label className="au-field"><span>{label}</span>{multiline ? <textarea disabled={disabled} aria-label={label} rows={3} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /> : <input disabled={disabled} aria-label={label} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />}{hint && <small>{hint}</small>}</label>;
}

function SelectField<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void; hint?: string }) {
  return <label className="au-field"><span>{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value as T)}>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>{hint && <small>{hint}</small>}</label>;
}

function Toggle({ label, checked, onChange, hint, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string; disabled?: boolean }) {
  return <label className="au-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span><b>{label}</b>{hint && <small>{hint}</small>}</span></label>;
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="au-section-title"><div>{eyebrow && <span className="au-eyebrow">{eyebrow}</span>}<h3>{title}</h3>{description && <p>{description}</p>}</div>{action}</div>;
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
  return <details className="au-advanced"><summary>Advanced JSON <span>Schedules, choice options, and every underlying property</span></summary><p>Apply replaces this item with the JSON shown here. Use Save at the top to write changes to disk.</p><textarea aria-label="Advanced item JSON" spellCheck={false} value={draft} onChange={event => changeDraft(event.target.value)} rows={18} /><div className="au-advanced-footer"><button type="button" className="au-button au-button-subtle" onClick={() => { setDraft(JSON.stringify(item, null, 2)); setError(''); onPendingChange(false); }}>Reset editor</button><button type="button" className="au-button" onClick={apply}>Apply JSON</button></div>{draft !== JSON.stringify(item, null, 2) && <p className="au-advanced-pending">Apply or reset this JSON draft before saving or switching items.</p>}{error && <p className="au-field-error" role="alert">{error}</p>}</details>;
}

function Artwork({ card, className }: { card: AuthoredCard; className: string }) {
  return <img className={className} src={cardArtworkPath(card)} alt={className === 'au-thumb' ? '' : `Artwork for ${card.name}`} loading={className === 'au-thumb' ? 'lazy' : undefined} onError={event => { if (event.currentTarget.src !== new URL(CARD_ART_PLACEHOLDER, window.location.href).href) event.currentTarget.src = CARD_ART_PLACEHOLDER; }} />;
}

function CardPreview({ card }: { card: AuthoredCard }) {
  const [context, setContext] = useState<'runtime' | 'draft'>('runtime');
  return <aside className="au-preview-column" aria-label="Card preview">
    <span className="au-eyebrow">Live preview</span>
    <div className="au-preview-modes" role="group" aria-label="Card preview mode"><button type="button" aria-pressed={context === 'runtime'} onClick={() => setContext('runtime')}>In play</button><button type="button" aria-pressed={context === 'draft'} onClick={() => setContext('draft')}>Draft</button></div>
    <div className="au-card-face-wrap"><CardFace card={card} context={context}/></div>
    <div className="au-preview-meta"><b>{cardCategoryLabel(card)}</b><p className="au-preview-effect">{card.effect || 'Add card text to describe its effects.'}</p><div className="au-card-metrics">{card.vp !== undefined && <span>VP <b>{card.vp}</b></span>}{card.cryptoValue !== undefined && <span>Crypto <b>{card.cryptoValue}</b></span>}</div><p>{card.generated ? 'Created by card effects. Kept out of Draft.' : card.enabled ? 'Enabled for playtesting.' : 'Disabled in new games.'}</p></div>
  </aside>;
}

type EditorProps<T> = { item: T; cards: readonly AuthoredCard[]; identityLocked: boolean; update: (value: T) => void; applyAdvanced: (value: T) => void; onPendingChange: (pending: boolean) => void };

function CardEditor({ item: card, cards, identityLocked, update, applyAdvanced, onPendingChange }: EditorProps<AuthoredCard>) {
  const patch = (changes: Partial<AuthoredCard>) => update({ ...card, ...changes });
  const changeType = (type: AuthoredCard['type']) => patch({ type, pool: type === 'Character' ? 'Base' : type, cardClass: type === 'Character' ? 'Utility' : undefined, core: false, ...(type === 'Crypto' ? { cryptoValue: card.cryptoValue ?? 1, power: undefined } : { power: card.power ?? 0 }), ...(type === 'VP' ? { vp: card.vp ?? 1 } : {}) });
  const schedule = card.schedule ?? [];
  return <div className="au-card-workspace"><CardPreview card={card} /><div className="au-properties">
    <section className="au-panel">
      <SectionTitle title="Card properties" description="Changes update this card and its preview." />
      <div className="au-field-grid">
        <TextField label="Name" value={card.name} onChange={name => patch({ name })} />
        <SelectField label="Card type" value={card.type} options={['Character', 'VP', 'Crypto']} onChange={changeType} />
        <NumberField label="Cost" value={card.cost} min={0} onChange={cost => patch({ cost: cost ?? 0 })} />
        {card.type !== 'Crypto' && <NumberField label="Power" value={card.power} min={0} onChange={power => patch({ power: power ?? 0 })} />}
        {card.type === 'VP' && <NumberField label="Victory points" value={card.vp} onChange={vp => patch({ vp: vp ?? 0 })} />}
        {card.type === 'Crypto' && <NumberField label="Crypto value" value={card.cryptoValue} min={0} onChange={cryptoValue => patch({ cryptoValue: cryptoValue ?? 0 })} />}
        {card.type === 'Character' && <><SelectField label="Card class" value={cardClassOf(card)} options={cardClasses} onChange={cardClass => patch({ cardClass, ...(cardClass === 'Hacker' || cardClass === 'Attack' ? { pool: 'Chaos', core: false } : {}) })} /><SelectField label="Draft pool" value={card.pool as 'Base' | 'Chaos'} options={['Base', 'Chaos']} onChange={pool => patch({ pool, core: false, ...(pool === 'Base' && cardClassOf(card) === 'Hacker' ? { cardClass: 'Utility' } : {}) })} /></>}
      </div>
      <div className="au-toggle-row"><Toggle label="Enabled" checked={card.enabled} onChange={enabled => patch({ enabled })} /><Toggle label="Generated" checked={Boolean(card.generated)} onChange={generated => patch({ generated, ...(generated ? { core: false } : {}) })} hint="Created by an effect; never offered in Draft." /><Toggle label="Core card" checked={card.core} disabled={card.pool === 'Chaos' || card.generated} onChange={core => patch({ core })} hint="Fixed starting market pile." /></div>
      <TextField label="Card text" value={card.effect} onChange={effect => patch({ effect })} multiline />
    </section>
    <section className="au-panel au-effects-panel">
      <SectionTitle eyebrow="Unique to this card" title="Card effects" description="Build this card’s recipe below. Add, change, remove, or reorder its steps." />
      {card.type === 'Crypto' && <p className="au-recipe-help">Crypto value is paid from the wallet in Draft. Play triggers run when a deployable form is played.</p>}
      <RecipeRows title="On reveal" description="When this card turns face up." recipes={(card.onReveal ?? []) as Recipe[]} scope="card" cards={cards} onChange={onReveal => patch({ onReveal: onReveal as EvaluationEffect[] })} />
      <RecipeRows title="On collapse" description="When its Location resolves." recipes={(card.onCollapse ?? []) as Recipe[]} scope="card" cards={cards} onChange={onCollapse => patch({ onCollapse: onCollapse as EvaluationEffect[] })} />
      <div className="au-duration-fields au-field-grid"><NumberField label="Duration" value={card.duration} min={1} onChange={duration => patch({ duration })} hint="Leave empty for no duration; 99 is permanent." /><SelectField label="Duration period" value={card.durationPeriod ?? 'cycle'} options={['cycle', 'runtime']} onChange={durationPeriod => patch({ durationPeriod })} /></div>
      <RecipeRows title="Recurring" description="Every Runtime opening while active. Requires a Runtime duration." recipes={(card.recurring ?? []) as Recipe[]} scope="card" cards={cards} onChange={recurring => patch({ recurring: recurring as EvaluationEffect[] })} />
      <div className="au-schedule-heading"><h3>Scheduled steps</h3><button type="button" className="au-button au-button-subtle" onClick={() => patch({ schedule: [...schedule, { at: 2, timing: 'start', effects: [] }], durationPeriod: 'runtime', duration: Math.max(card.duration ?? 0, 2) })}>+ Add schedule</button></div>
      {schedule.map((entry, index) => <div className="au-schedule" key={index}><div className="au-field-grid"><NumberField label={`Schedule ${index + 1} turn`} value={entry.at} min={1} onChange={at => patch({ schedule: schedule.map((step, i) => i === index ? { ...step, at: at ?? 1 } : step) })} /><SelectField label={`Schedule ${index + 1} timing`} value={entry.timing ?? 'start'} options={['start', 'end']} onChange={timing => patch({ schedule: schedule.map((step, i) => i === index ? { ...step, timing } : step) })} /></div><RecipeRows title={`Schedule ${index + 1}`} scope="card" cards={cards} recipes={entry.effects as Recipe[]} onChange={effects => patch({ schedule: schedule.map((step, i) => i === index ? { ...step, effects: effects as EvaluationEffect[] } : step) })} /><button type="button" className="au-button au-button-subtle" onClick={() => patch({ schedule: schedule.filter((_, i) => i !== index) })}>Remove schedule {index + 1}</button></div>)}
    </section>
    <details className="au-property-section" open><summary>Artwork and identity</summary><div className="au-field-grid"><TextField label="Artwork path" value={card.art} onChange={art => patch({ art })} /><TextField label="ID" disabled={identityLocked} value={card.id} onChange={id => patch({ id })} /><TextField label="Definition ID" value={card.definitionId ?? ''} onChange={definitionId => patch({ definitionId: definitionId || undefined })} /></div></details>
    <AdvancedJson key={card.id} item={card} onApply={item => applyAdvanced(item as AuthoredCard)} onPendingChange={onPendingChange} />
  </div></div>;
}

function LocationEditor({ item: location, cards, identityLocked, update, applyAdvanced, onPendingChange }: EditorProps<AuthoredLocation>) {
  const patch = (changes: Partial<AuthoredLocation>) => update({ ...location, ...changes });
  return <div className="au-properties au-standalone-properties"><section className="au-panel"><SectionTitle title="Location properties" /><div className="au-field-grid"><TextField label="Name" value={location.name} onChange={name => patch({ name })} /><TextField label="ID" disabled={identityLocked} value={location.id} onChange={id => patch({ id })} /><TextField label="Rule text" value={location.rule} onChange={rule => patch({ rule })} multiline /><TextField label="Reward text" value={location.reward} onChange={reward => patch({ reward })} multiline /></div><Toggle label="Enabled" checked={location.enabled} onChange={enabled => patch({ enabled })} /></section>
    <section className="au-panel au-effects-panel"><SectionTitle eyebrow="Unique to this Location" title="Location effects" description="Build the recipe this Location runs on closure." /><RecipeRows title="On closure" scope="location" cards={cards} recipes={location.effects as Recipe[]} onChange={effects => patch({ effects: effects as LocationRewardEffect[] })} /></section>
    <AdvancedJson key={location.id} item={location} onApply={item => applyAdvanced(item as AuthoredLocation)} onPendingChange={onPendingChange} />
  </div>;
}

function CircuitEditor({ item: reward, cards, identityLocked, update, applyAdvanced, onPendingChange }: EditorProps<AuthoredCircuitReward>) {
  const patch = (changes: Partial<AuthoredCircuitReward>) => update({ ...reward, ...changes });
  return <div className="au-properties au-standalone-properties"><section className="au-panel"><SectionTitle title="Circuit Reward properties" /><div className="au-field-grid"><TextField label="Name" value={reward.name} onChange={name => patch({ name })} /><TextField label="ID" disabled={identityLocked} value={reward.id} onChange={id => patch({ id })} /><TextField label="Reward text" value={reward.text} onChange={text => patch({ text })} multiline /></div><Toggle label="Enabled" checked={reward.enabled} onChange={enabled => patch({ enabled })} /></section>
    <section className="au-panel au-effects-panel"><SectionTitle eyebrow="Unique to this reward" title="Reward effects" description="Create an ordered recipe for the player claiming this reward." /><RecipeRows title="On claim" scope="circuit" cards={cards} recipes={(reward.effects ?? (reward.effect ? [reward.effect] : [])) as Recipe[]} onChange={effects => patch({ effects: effects as CircuitRewardDefinition['effects'], effect: undefined })} /></section>
    <AdvancedJson key={reward.id} item={reward} onApply={item => applyAdvanced(item as AuthoredCircuitReward)} onPendingChange={onPendingChange} />
  </div>;
}

export function AuthoringApp() {
  const [document, setDocument] = useState<ContentDocument>(() => materializeItemRecipes(getBundledDocument()));
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(materializeItemRecipes(getBundledDocument())));
  const [revision, setRevision] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [message, setMessage] = useState('Loading saved content…');
  const [section, setSection] = useState<Section>('cards');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('All');
  const [sortKey, setSortKey] = useState<CardSort>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [busy, setBusy] = useState(false);
  const [advancedPending, setAdvancedPending] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  const currentJson = JSON.stringify(document);
  const dirty = currentJson !== savedJson;
  const activeSection = sections.find(item => item.key === section)!;
  const list = document[section] as Item[];
  const visible = useMemo(() => {
    const filtered = list.filter(item => `${item.name} ${item.id} ${'effect' in item && typeof item.effect === 'string' ? item.effect : ''}`.toLowerCase().includes(search.trim().toLowerCase()));
    return section === 'cards' ? sortCards((filtered as AuthoredCard[]).filter(card => matchesCardFilter(card, cardFilter)), sortKey, sortDirection) : filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [list, search, section, cardFilter, sortKey, sortDirection]);
  const selected = list.find(item => item.id === selectedId) ?? visible[0] ?? null;

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
        const editable = materializeItemRecipes(incoming.document);
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

  function leaveJsonDraft() {
    if (!advancedPending) return true;
    if (!window.confirm('Discard the unapplied Advanced JSON draft?')) return false;
    setAdvancedPending(false);
    return true;
  }

  function update(item: Item) {
    const oldId = selected?.id;
    setDocument(previous => ({ ...previous, [section]: (previous[section] as Item[]).map(current => current.id === oldId ? item : current) }));
    setSelectedId(item.id);
    if (status === 'saved') setStatus('ready');
    if (status !== 'offline' && status !== 'conflict') setMessage('Unsaved changes.');
  }

  function applyAdvanced(item: Item) {
    const next = { ...document, [section]: (document[section] as Item[]).map(current => current.id === selected?.id ? item : current) } as ContentDocument;
    const errors = validateContent(next);
    if (errors.length) throw new Error(`Cannot apply this JSON: ${errors.join(' · ')}`);
    update(materializeItemRecipes(next)[section].find(current => current.id === item.id) as Item);
  }

  function addItem() {
    if (!leaveJsonDraft()) return;
    const id = nextId(`new-${activeSection.singular}`, list);
    let item: Item;
    if (section === 'cards') { const category = newCardCategory(cardFilter); item = { id, definitionId: id, name: 'New card', ...category, enabled: cardFilter !== 'Disabled', core: false, cost: 0, ...(category.type !== 'Crypto' ? { power: 0 } : { cryptoValue: 1 }), ...(category.type === 'VP' ? { vp: 1 } : {}), art: CARD_ART_PLACEHOLDER, effect: '', onReveal: [] }; }
    else if (section === 'locations') item = { id, name: 'New location', rule: '', reward: '', effects: [], enabled: true };
    else item = { id, name: 'New circuit reward', text: '', cost: 0, effects: [], enabled: true };
    setDocument(previous => ({ ...previous, [section]: [...previous[section], item] }));
    setSelectedId(id);
    setSearch('');
    setMessage('Unsaved changes.');
  }

  function duplicateItem() {
    if (!leaveJsonDraft()) return;
    if (!selected) return;
    const clone = structuredClone(selected);
    clone.id = nextId(`${selected.id}-copy`, list);
    clone.name = `${selected.name} copy`;
    if ('pool' in clone) { clone.definitionId = clone.id; clone.core = false; }
    setDocument(previous => ({ ...previous, [section]: [...previous[section], clone] }));
    setSelectedId(clone.id);
    setSearch('');
    setMessage('Unsaved changes.');
  }

  function deleteItem() {
    if (!leaveJsonDraft()) return;
    if (!selected || !window.confirm(`Delete ${selected.name || selected.id}? This change is saved only when you click Save.`)) return;
    const next = list.filter(item => item.id !== selected.id);
    setDocument(previous => ({ ...previous, [section]: next }));
    setSelectedId(null);
    setMessage('Unsaved changes.');
  }

  async function save() {
    if (revision === null || status === 'offline' || status === 'saving' || !dirty || advancedPending) return;
    const errors = validateContent(document);
    if (errors.length) { setStatus('error'); setMessage(`Fix these fields before saving: ${errors.join(' · ')}`); return; }
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
      const editable = materializeItemRecipes(incoming.document);
      setDocument(editable);
      setSavedJson(JSON.stringify(editable));
      setRevision(incoming.revision);
      setSelectedId(null);
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
      if (!isDocument(parsed)) throw new Error('Expected a version 1 content document with cards, locations, circuitRewards, and effects arrays.');
      const errors = validateContent(parsed);
      if (errors.length) throw new Error(`Imported content is invalid: ${errors.join(' · ')}`);
      if (!leaveJsonDraft()) return;
      if (dirty && !window.confirm('Replace your unsaved edits with the imported JSON?')) return;
      setDocument(materializeItemRecipes(parsed));
      setSelectedId(null);
      setMessage('JSON imported into the editor. Review it, then Save to write it to disk.');
      if (status === 'saved') setStatus('ready');
    } catch (cause) { setStatus('error'); setMessage(cause instanceof Error ? cause.message : 'Could not import JSON.'); }
    finally { if (importRef.current) importRef.current.value = ''; }
  }

  const statusLabel = advancedPending ? 'JSON draft' : status === 'loading' ? 'Loading' : status === 'saving' ? 'Saving' : status === 'offline' ? 'Local preview' : status === 'conflict' ? 'Conflict' : status === 'error' ? 'Save error' : dirty ? 'Unsaved changes' : 'Saved';
  const changeSection = (next: Section) => { if (!leaveJsonDraft()) return; setSection(next); setSelectedId(null); setSearch(''); };
  const sortBy = (key: CardSort) => { setSelectedId(selected?.id ?? null); setSortDirection(key === sortKey && sortDirection === 'asc' ? 'desc' : 'asc'); setSortKey(key); };
  const entitySummary = (item: Item) => 'rule' in item ? item.reward : 'text' in item ? item.text : item.effect;
  return <div className="authoring-app au-workbench">
    <header className="au-header">
      <div className="au-brand"><a href="/" aria-label="Return to game" className="au-mark" onClick={event => { if ((dirty || advancedPending) && !window.confirm('Leave Content Studio with unsaved changes?')) event.preventDefault(); }}>◈</a><div><span>OUROBOROS</span><b>Content Studio</b></div></div>
      <nav className="au-entity-nav" aria-label="Content sections">{sections.map(item => <button type="button" key={item.key} className={section === item.key ? 'active' : ''} aria-current={section === item.key ? 'page' : undefined} onClick={() => changeSection(item.key)}>{item.label}</button>)}</nav>
      <div className="au-header-actions"><span className={`au-save-status au-status-${status}`}><i />{statusLabel}</span><button type="button" className="au-button au-button-subtle" onClick={reload} disabled={busy || status === 'loading'}>Reload</button><button type="button" className="au-button au-button-primary" onClick={() => void save()} disabled={!dirty || revision === null || advancedPending || status === 'saving' || status === 'offline' || status === 'conflict'}>{status === 'saving' ? 'Saving…' : 'Save to disk'}</button></div>
    </header>
    <div className="au-workbench-tools">
      <div className="au-catalog-heading"><h1>{activeSection.label}</h1><small>{list.length} {activeSection.label.toLowerCase()} · Select an item to build its recipe</small></div>
      <label className="au-workbench-search"><span className="au-sr-only">Search {activeSection.label}</span><input type="search" aria-label={`Search ${activeSection.label}`} value={search} onChange={event => { if (!leaveJsonDraft()) return; setSearch(event.target.value); setSelectedId(null); }} placeholder={section === 'cards' ? 'Search cards by name or text…' : `Search ${activeSection.label.toLowerCase()}…`} /></label>
      <button className="au-button au-button-primary au-create" type="button" onClick={addItem}>+ New {activeSection.singular}</button>
    </div>
    {section === 'cards' && <nav className="au-filter-tabs" role="tablist" aria-label="Card filters">{cardFilters.map(filter => <button type="button" role="tab" key={filter} aria-label={filter} aria-selected={cardFilter === filter} className={cardFilter === filter ? 'active' : ''} onClick={() => { if (!leaveJsonDraft()) return; setCardFilter(filter); setSelectedId(null); }}><b>{filter}</b><span>{document.cards.filter(card => matchesCardFilter(card, filter)).length}</span></button>)}</nav>}
    <div className="au-workbench-body">
      <aside className="au-catalog-list" aria-label={`${activeSection.label} catalog`}>
        <div className="au-list-caption"><span>{visible.length} shown</span><small>{section === 'cards' ? `${sortKey === 'name' ? 'Name' : sortKey === 'cost' ? 'Cost' : 'Power'} · ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : 'Alphabetical'}</small></div>
        {section === 'cards' && <div className="au-sort-head"><span aria-hidden="true" />{(['name', 'cost', 'power'] as const).map(key => <button type="button" key={key} aria-label={`Sort by ${key}`} aria-pressed={sortKey === key} onClick={() => sortBy(key)}>{key === 'name' ? 'Name' : key === 'cost' ? 'Cost' : 'Power'}{sortKey === key && <span aria-hidden="true">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>}</button>)}</div>}
        <div className="au-list" role="listbox" aria-label={activeSection.label}>
          {visible.map(item => <button role="option" aria-selected={selected?.id === item.id} type="button" key={item.id} data-author-item={item.id} className={`au-list-item ${section === 'cards' ? 'au-card-row' : 'au-entity-row'} ${selected?.id === item.id ? 'active' : ''}`} onClick={() => { if (!leaveJsonDraft()) return; setSelectedId(item.id); }}>
            {'pool' in item ? <><Artwork card={item} className="au-thumb" /><span className="au-row-title"><b>{item.name || 'Untitled card'}</b><small>{cardCategoryLabel(item)}</small></span><span className="au-row-cost" aria-label={`Cost ${item.cost}`}>{item.cost}</span><span className="au-row-power" aria-label={item.power === undefined ? 'No Power' : `Power ${item.power}`}>{item.power ?? '—'}</span></> : <><b>{item.name || 'Untitled'}</b><small>{entitySummary(item)}</small></>}
          </button>)}
          {visible.length === 0 && <div className="au-empty-list">{section === 'cards' && cardFilter === 'Generated' && !search ? 'No Generated cards yet. Create one here and use it in a Gain Card or Morph recipe.' : 'No matches. Change a filter or create a new item.'}</div>}
        </div>
      </aside>
      <main className="au-editor">{selected ? <>
        <div className="au-editor-toolbar"><div><span className="au-eyebrow">Editing {activeSection.singular}</span><h1>{selected.name || 'Untitled'}</h1></div><div className="au-item-actions"><button type="button" className="au-button au-button-subtle" onClick={duplicateItem}>Duplicate</button><button type="button" className="au-button au-button-danger" onClick={deleteItem}>Delete</button></div></div>
        <div className="au-editor-content">
          {section === 'cards' ? <CardEditor item={selected as AuthoredCard} cards={document.cards} identityLocked={advancedPending} update={value => update(value)} applyAdvanced={value => applyAdvanced(value)} onPendingChange={setAdvancedPending} /> : section === 'locations' ? <LocationEditor item={selected as AuthoredLocation} cards={document.cards} identityLocked={advancedPending} update={value => update(value)} applyAdvanced={value => applyAdvanced(value)} onPendingChange={setAdvancedPending} /> : <CircuitEditor item={selected as AuthoredCircuitReward} cards={document.cards} identityLocked={advancedPending} update={value => update(value)} applyAdvanced={value => applyAdvanced(value)} onPendingChange={setAdvancedPending} />}
        </div>
      </> : <div className="au-empty-editor"><span>◇</span><h2>Create your next {activeSection.singular}</h2><p>Choose properties and build its own effects recipe.</p><button className="au-button au-button-primary" type="button" onClick={addItem}>+ New {activeSection.singular}</button></div>}</main>
    </div>
    <footer className={`au-footer au-footer-${status}`}><span role="status">{advancedPending ? 'Apply or reset the Advanced JSON draft before saving or changing the ID.' : message} {!dirty && revision !== null ? `Revision ${revision}` : ''}</span><div className="au-file-actions"><button type="button" onClick={exportJson}>Export JSON</button><button type="button" onClick={() => importRef.current?.click()}>Import JSON</button><input ref={importRef} className="au-hidden" type="file" accept="application/json,.json" onChange={event => void importJson(event.target.files?.[0])} /></div></footer>
  </div>;
}

export default AuthoringApp;
