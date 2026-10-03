import { useState } from 'react';
import type { Card } from '../game';
import type { AuthoredCard } from './contentModel';
import {
  cardDefinitionId, changeRecipeCount, changeRecipeOperation, changeRecipeTarget, createRecipe, enabledCards,
  operationChoices, recipeCount, recipeCountEditable, recipeCountMaximum, recipeCountMinimum,
  recipeOperation, recipeSummary, recipeTarget, shiftDirections, transferFlows, bumpPicks, targetChoices, boardSideChoices, changeRecipeBoardSide,
  type CatalogCard, type Recipe, type RecipeScope,
} from './recipeModel';
import { NumberInput } from './NumberInput';
import { transferFlow } from '../transferText';
import { useEditorFocus } from './editorContext';
import './recipe-editor.css';

export type { Recipe, RecipeScope } from './recipeModel';
export { recipeSummary } from './recipeModel';

function CardDefinitionPicker({ cards, value, onChange }: { cards: readonly CatalogCard[]; value?: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const available = enabledCards(cards);
  const selected = cards.find(card => cardDefinitionId(card) === value);
  const allMatching = available.filter(card => `${card.name} ${cardDefinitionId(card)}`.toLowerCase().includes(search.toLowerCase()));
  const matching = allMatching.slice(0, 60);
  const selectedInList = matching.some(card => cardDefinitionId(card) === value);
  return <div className="au-recipe-catalog">
    <label className="au-recipe-field"><span>Card to gain</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search card names" aria-label="Search card definitions" /></label>
    <div className="au-recipe-catalog-choice">
      {selected?.art && <img src={selected.art} alt="" />}
      <label className="au-recipe-field"><span>Card definition</span><select aria-label="Card definition" value={value ?? ''} onChange={event => onChange(event.target.value)}>
        {!selectedInList && value && <option value={value}>{selected?.name ?? 'Unavailable saved card'}</option>}
        {!value && <option value="" disabled>Select a card</option>}
        {matching.map(card => <option key={cardDefinitionId(card)} value={cardDefinitionId(card)}>{card.name}</option>)}
      </select></label>
    </div>
    {search && matching.length === 0 && <small>No enabled cards match this search.</small>}
    {allMatching.length > matching.length && <small>Showing the first 60 matches. Search by name to find more cards.</small>}
  </div>;
}

function MorphFormPicker({ cards, values, selection, onChange, onSelectionChange }: { cards: readonly CatalogCard[]; values: readonly string[]; selection: 'sequential' | 'random'; onChange: (ids: string[]) => void; onSelectionChange: (selection: 'sequential' | 'random') => void }) {
  const [search, setSearch] = useState('');
  const available = enabledCards(cards).filter(card => card.type !== 'Crypto');
  const allMatching = available.filter(card => `${card.name} ${cardDefinitionId(card)}`.toLowerCase().includes(search.toLowerCase()));
  const matching = allMatching.slice(0, 24);
  const unknown = values.filter(id => !available.some(card => cardDefinitionId(card) === id));
  const toggle = (id: string, checked: boolean) => {
    if (checked) onChange([...values, id]);
    else onChange(values.filter(value => value !== id));
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <div className="au-morph-forms">
    <label className="au-recipe-field"><span>How forms are chosen</span><select value={selection} onChange={event => onSelectionChange(event.target.value as 'sequential' | 'random')}><option value="sequential">Sequential evolution</option><option value="random">Random selected form</option></select></label>
    <div className="au-morph-sequence"><b>{selection === 'sequential' ? 'Evolution order' : 'Selected forms'}</b>{values.length === 0 && <span className="au-morph-empty">Select at least one form before saving.</span>}{values.map((id, index) => <div className="au-morph-sequence-item" key={id}><span>{index + 1}. {cards.find(card => cardDefinitionId(card) === id)?.name ?? 'Unavailable saved form'}</span><span className="au-morph-order-actions">{selection === 'sequential' && <><button type="button" disabled={index === 0} aria-label={`Move form ${index + 1} earlier`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === values.length - 1} aria-label={`Move form ${index + 1} later`} onClick={() => move(index, 1)}>↓</button></>}<button type="button" aria-label={`Remove form ${index + 1}`} onClick={() => toggle(id, false)}>×</button></span></div>)}</div>
    <label className="au-recipe-field"><span>Forms this card can become</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Character or VP cards" aria-label="Search morph forms" /></label>
    <div className="au-morph-form-list">
      {unknown.map(id => <label className="au-morph-form" key={id}><input type="checkbox" checked onChange={() => toggle(id, false)} /><span>Unavailable saved form</span></label>)}
      {matching.map(card => {
        const id = cardDefinitionId(card);
        return <label className="au-morph-form" key={id}><input type="checkbox" checked={values.includes(id)} onChange={event => toggle(id, event.target.checked)} />{card.art && <img src={card.art} alt="" />}<span>{card.name}</span></label>;
      })}
    </div>
    {allMatching.length > matching.length && <small>Showing the first 24 matches. Search by name to find more forms.</small>}
    <small>{selection === 'sequential' ? 'Each trigger advances to the next form; the final form remains in place.' : 'Each trigger picks one selected form at random.'} Choose at least one enabled Character or VP definition.</small>
  </div>;
}

type RecipeRowsProps = {
  title: string;
  description?: string;
  /** Stable key for this recipe (`onReveal`, `schedule.0`, `effects`); steps are addressed as `${field}.${index}`. */
  field: string;
  recipes: readonly Recipe[];
  scope: RecipeScope;
  cards: readonly Card[] | readonly AuthoredCard[];
  onChange: (recipes: Recipe[]) => void;
  allowMany?: boolean;
};

const CHAIN_HELP = 'Later steps wait until this one resolves. If it is skipped, declined, or finds no target, they are cancelled.';

export function RecipeRows({ title, description, field, recipes, scope, cards, onChange, allowMany = true }: RecipeRowsProps) {
  const { activeStep, setActiveStep, invalid } = useEditorFocus();
  const choices = operationChoices(scope, cards);
  const stepKey = (index: number) => `${field}.${index}`;
  const replace = (index: number, next: Recipe) => onChange(recipes.map((recipe, at) => at === index ? next : recipe));
  const remove = (index: number) => {
    onChange(recipes.filter((_, at) => at !== index));
    if (activeStep === stepKey(index)) setActiveStep(null);
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= recipes.length) return;
    const next = [...recipes];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    if (activeStep === stepKey(index)) setActiveStep(stepKey(target));
  };
  const add = () => {
    onChange([...recipes, createRecipe(choices[0]?.value ?? 'draw', scope, cards)]);
    setActiveStep(stepKey(recipes.length));
  };
  const hasIssue = [...invalid].some(key => key === field || key.startsWith(`${field}.`));
  return <section className={`au-recipe-editor${hasIssue ? ' is-invalid' : ''}`} aria-label={title} data-field={field}>
    <div className="au-recipe-editor-heading"><div><h3>{title}{recipes.length > 0 && <span className="au-recipe-count">{recipes.length}</span>}</h3>{description && <p>{description}</p>}</div>{(allowMany || recipes.length === 0) && <button className="au-button au-button-subtle" type="button" onClick={add}>+ Add effect</button>}</div>
    {recipes.length === 0 && <p className="au-recipe-empty">No effects.</p>}
    <div className="au-recipe-editor-list">{recipes.map((recipe, index) => {
      const key = stepKey(index);
      const expanded = activeStep === key;
      const invalidStep = [...invalid].some(issue => issue === key || issue.startsWith(`${key}.`));
      const operation = recipeOperation(recipe, scope);
      const operationLabel = choices.find(choice => choice.value === operation)?.label ?? operation;
      const targets = targetChoices(recipe, scope);
      const sides = boardSideChoices(recipe, scope);
      const count = recipeCount(recipe, scope);
      const editableCount = recipeCountEditable(recipe, scope);
      const advanced = ['moveCard', 'modifyPower', 'handDiscard', 'handTrash', 'choice', 'random'].includes(recipe.kind) || recipe.then !== undefined;
      const currentOperationKnown = choices.some(choice => choice.value === operation);
      const chainable = scope === 'card';
      let waitsOn = -1;
      if (chainable) for (let at = index - 1; at >= 0; at--) if (recipes[at].chain) { waitsOn = at; break; }
      const actions = <div className="au-recipe-actions">
        {allowMany && <><button type="button" title="Move earlier" aria-label={`Move ${title} effect ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" title="Move later" aria-label={`Move ${title} effect ${index + 1} later`} disabled={index === recipes.length - 1} onClick={() => move(index, 1)}>↓</button></>}
        {(allowMany || recipes.length > 1) && <button type="button" className="au-recipe-remove" title="Remove effect" aria-label={`Remove ${title} effect ${index + 1}`} onClick={() => remove(index)}>×</button>}
      </div>;
      return <div className={`au-recipe-editor-row${expanded ? ' is-expanded' : ''}${waitsOn >= 0 ? ' au-recipe-chained' : ''}${invalidStep ? ' is-invalid' : ''}`} key={`${index}-${recipe.kind}`} data-field={key}>
        {waitsOn >= 0 && <p className="au-recipe-chain-note">Waits for step {waitsOn + 1}</p>}
        <div className="au-step-head">
          <button type="button" className="au-step-toggle" aria-expanded={expanded} aria-label={`${title} step ${index + 1}: ${operationLabel}. ${expanded ? 'Collapse' : 'Edit'}`} onClick={() => setActiveStep(expanded ? null : key)}>
            <span className="au-recipe-step">{index + 1}</span>
            <span className="au-step-text"><b>{operationLabel}</b><span>{recipeSummary(recipe, scope, cards)}</span></span>
            {invalidStep && <span className="au-step-flag" aria-hidden="true">!</span>}
            {recipe.chain && index < recipes.length - 1 && <span className="au-step-chip">Chains</span>}
            <span className="au-step-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          </button>
          {actions}
        </div>
        {expanded && <div className="au-step-body">
        <div className="au-recipe-editor-top"><div className="au-recipe-columns">
          <label className="au-recipe-field"><span>Effect</span><select aria-label="Effect" value={operation} onChange={event => { const next = changeRecipeOperation(recipe, event.target.value, scope, cards); replace(index, recipe.chain ? { ...next, chain: true } : next); }}>
            {!currentOperationKnown && <option value={operation}>{operation} (advanced)</option>}
            {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select></label>
          <label className="au-recipe-field"><span>Count</span>{editableCount ? <NumberInput aria-label="Count" min={recipeCountMinimum(recipe, scope)} max={recipeCountMaximum(recipe, scope)} step={operation === 'transferPower' ? 'any' : 1} value={count} onChange={value => { if (value !== undefined) replace(index, changeRecipeCount(recipe, value, scope)); }} /> : <span className="au-recipe-fixed">{count === null ? '—' : count}</span>}</label>
          <label className="au-recipe-field"><span>Target</span><select aria-label="Target" value={recipeTarget(recipe, scope)} disabled={targets.length === 1} onChange={event => replace(index, changeRecipeTarget(recipe, event.target.value, scope, cards))}>{targets.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
        </div></div>
        {operation === 'move' && <p className="au-recipe-help">Move 1 card to another open Node; choose the destination during play.</p>}
        {(scope === 'location' || scope === 'locationPlay') && ['move', 'gainPower', 'drainPower'].includes(operation) && recipe.kind !== 'moveSelf' && (
          <label className="au-recipe-field"><span>Card pick</span>
            <select aria-label="Card pick" value={recipe.cardPick ?? 'random'} onChange={event => replace(index, { ...recipe, cardPick: event.target.value as 'choice' | 'random' })}>
              <option value="random">At random</option>
              <option value="choice">Player choice</option>
            </select>
          </label>
        )}
        {sides.length > 0 && <label className="au-recipe-field"><span>Side</span>
          <select aria-label="Side" value={recipe.boardSide ?? 'either'} onChange={event => replace(index, changeRecipeBoardSide(recipe, event.target.value, scope))}>
            {sides.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
        </label>}
        {operation === 'transferPower' && <div className="au-recipe-advanced-fields">
          <label className="au-recipe-field"><span>Direction</span>
            <select aria-label="Direction" value={recipe.direction ?? 'choice'} onChange={event => replace(index, { ...recipe, direction: event.target.value as Recipe['direction'], flow: transferFlow(recipe) })}>
              {shiftDirections.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </label>
          <label className="au-recipe-field"><span>Push / pull</span>
            <select aria-label="Push or pull" value={transferFlow(recipe)} onChange={event => replace(index, { ...recipe, flow: event.target.value as Recipe['flow'] })}>
              {transferFlows.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </label>
          <p className="au-recipe-help">Push moves your Power out of this Location; pull draws it in from a neighbor. A Location can go negative.</p>
        </div>}
        {operation === 'bump' && <div className="au-recipe-advanced-fields">
          <label className="au-recipe-field"><span>Card pick</span>
            <select aria-label="Bump card pick" value={recipe.cardPick ?? 'choice'} onChange={event => replace(index, { ...recipe, cardPick: event.target.value as 'choice' | 'random' })}>
              {bumpPicks.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </label>
          <p className="au-recipe-help">Bumped cards go to their owner's discard pile. A bumped Effect Bank card stops its ongoing effects.</p>
        </div>}
        {operation === 'gain' && <CardDefinitionPicker key={`${index}-gain`} cards={cards} value={recipe.cardId} onChange={cardId => replace(index, { ...recipe, cardId })} />}
        {operation === 'attachModifier' && <div className="au-recipe-advanced-fields">
          <label className="au-recipe-field"><span>Modifier</span><select aria-label="Modifier" value={recipe.modifier ?? 'doublePrintedEffects'} onChange={event => {
            const modifier = event.target.value as 'doublePrintedEffects' | 'powerAuraAtLocation' | 'movableEachTurn';
            replace(index, { ...recipe, modifier, amount: modifier === 'powerAuraAtLocation' ? (recipe.amount && recipe.amount > 0 ? recipe.amount : 1) : undefined });
          }}><option value="doublePrintedEffects">Printed effects happen twice</option><option value="powerAuraAtLocation">Power aura at Location</option><option value="movableEachTurn">Movable each turn</option></select></label>
          {recipe.cardId !== undefined && <CardDefinitionPicker key={`${index}-modifier-host`} cards={enabledCards(cards).filter(card => card.type === 'Character')} value={recipe.cardId} onChange={cardId => replace(index, { ...recipe, cardId })} />}
        </div>}
        {operation === 'morph' && <MorphFormPicker key={`${index}-morph`} cards={cards} values={recipe.formIds ?? []} selection={recipe.selection ?? 'sequential'} onChange={formIds => replace(index, { ...recipe, formIds })} onSelectionChange={selection => replace(index, { ...recipe, selection })} />}
        {advanced && <details className="au-recipe-advanced"><summary>More settings</summary><div className="au-recipe-advanced-fields">
          {['moveCard', 'modifyPower', 'destroyCard', 'handDiscard', 'handTrash'].includes(recipe.kind) && <label className="au-recipe-check"><input type="checkbox" checked={Boolean(recipe.optional)} onChange={event => replace(index, { ...recipe, optional: event.target.checked })} /><span>Optional selection</span></label>}
          {['handDiscard', 'handTrash'].includes(recipe.kind) && <><label className="au-recipe-field"><span>Who chooses the cards</span><select value={recipe.chooser ?? 'owner'} onChange={event => replace(index, { ...recipe, chooser: event.target.value })}><option value="owner">You</option><option value="opponent">Opponent</option></select></label><label className="au-recipe-field"><span>Minimum selections</span><input type="number" min={0} max={Math.min(64, recipe.amount ?? 64)} value={recipe.min ?? ''} placeholder="Default" onChange={event => replace(index, { ...recipe, min: event.target.value === '' ? undefined : Number(event.target.value) })} /></label></>}
          {recipe.kind === 'choice' && <label className="au-recipe-field"><span>Choice prompt</span><input value={recipe.prompt ?? ''} onChange={event => replace(index, { ...recipe, prompt: event.target.value || undefined })} placeholder="Choose one effect" /></label>}
          {(['choice', 'random'].includes(recipe.kind) || recipe.then !== undefined) && <p className="au-recipe-help">Edit branch effects and follow-up steps in Advanced JSON below. These details remain intact when you change a setting here.</p>}
        </div></details>}
        {chainable && (() => {
          const last = index === recipes.length - 1;
          return <label className={`au-recipe-check au-recipe-chain-toggle${last ? ' is-disabled' : ''}`} title={CHAIN_HELP}><input type="checkbox" disabled={last} checked={!last && Boolean(recipe.chain)} onChange={event => { const { chain: _chain, ...rest } = recipe; replace(index, event.target.checked ? { ...rest, chain: true } : rest); }} /><span>{last ? 'Chain: add a step below to make it wait for this one' : 'Chain: later steps wait for this one'}</span></label>;
        })()}
        </div>}
      </div>;
    })}</div>
  </section>;
}
