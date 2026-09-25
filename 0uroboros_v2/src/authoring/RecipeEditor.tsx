import { useState } from 'react';
import type { Card } from '../game';
import type { AuthoredCard } from './contentModel';
import {
  cardDefinitionId, changeRecipeCount, changeRecipeOperation, changeRecipeTarget, createRecipe, enabledCards,
  operationChoices, recipeCount, recipeCountEditable, recipeCountMaximum, recipeCountMinimum,
  recipeOperation, recipeSummary, recipeTarget, targetChoices,
  type CatalogCard, type Recipe, type RecipeScope,
} from './recipeModel';
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
  recipes: readonly Recipe[];
  scope: RecipeScope;
  cards: readonly Card[] | readonly AuthoredCard[];
  onChange: (recipes: Recipe[]) => void;
  allowMany?: boolean;
};

export function RecipeRows({ title, description, recipes, scope, cards, onChange, allowMany = true }: RecipeRowsProps) {
  const choices = operationChoices(scope, cards);
  const replace = (index: number, next: Recipe) => onChange(recipes.map((recipe, at) => at === index ? next : recipe));
  const remove = (index: number) => onChange(recipes.filter((_, at) => at !== index));
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= recipes.length) return;
    const next = [...recipes];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => onChange([...recipes, createRecipe(choices[0]?.value ?? 'draw', scope, cards)]);
  return <section className="au-recipe-editor" aria-label={title}>
    <div className="au-recipe-editor-heading"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{(allowMany || recipes.length === 0) && <button className="au-button au-button-subtle" type="button" onClick={add}>+ Add effect</button>}</div>
    {recipes.length === 0 && <p className="au-recipe-empty">No effects yet. Add a step and choose its effect, count, and target.</p>}
    <div className="au-recipe-editor-list">{recipes.map((recipe, index) => {
      const operation = recipeOperation(recipe, scope);
      const targets = targetChoices(recipe, scope);
      const count = recipeCount(recipe, scope);
      const editableCount = recipeCountEditable(recipe, scope);
      const advanced = ['moveCard', 'modifyPower', 'handDiscard', 'handTrash', 'choice', 'random'].includes(recipe.kind) || recipe.then !== undefined;
      const currentOperationKnown = choices.some(choice => choice.value === operation);
      return <div className="au-recipe-editor-row" key={`${index}-${recipe.kind}`}>
        <div className="au-recipe-editor-top"><span className="au-recipe-step">{String(index + 1).padStart(2, '0')}</span><div className="au-recipe-columns">
          <label className="au-recipe-field"><span>Effect</span><select aria-label="Effect" value={operation} onChange={event => replace(index, changeRecipeOperation(recipe, event.target.value, scope, cards))}>
            {!currentOperationKnown && <option value={operation}>{operation} (advanced)</option>}
            {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select></label>
          <label className="au-recipe-field"><span>Count</span>{editableCount ? <input aria-label="Count" type="number" min={recipeCountMinimum(recipe, scope)} max={recipeCountMaximum(recipe, scope)} step={operation === 'transferPower' ? 'any' : 1} value={count ?? ''} onChange={event => { if (event.target.value !== '') replace(index, changeRecipeCount(recipe, Number(event.target.value), scope)); }} /> : <span className="au-recipe-fixed">{count === null ? '—' : count}</span>}</label>
          <label className="au-recipe-field"><span>Target</span><select aria-label="Target" value={recipeTarget(recipe, scope)} disabled={targets.length === 1} onChange={event => replace(index, changeRecipeTarget(recipe, event.target.value, scope))}>{targets.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
        </div><div className="au-recipe-actions">
          {allowMany && <><button type="button" title="Move earlier" aria-label={`Move ${title} effect ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" title="Move later" aria-label={`Move ${title} effect ${index + 1} later`} disabled={index === recipes.length - 1} onClick={() => move(index, 1)}>↓</button></>}
          {(allowMany || recipes.length > 1) && <button type="button" title="Remove effect" aria-label={`Remove ${title} effect ${index + 1}`} onClick={() => remove(index)}>×</button>}
        </div></div>
        {operation === 'move' && <p className="au-recipe-help">Move 1 card to another open Node; choose the destination during play.</p>}
        {operation === 'gain' && <CardDefinitionPicker key={`${index}-gain`} cards={cards} value={recipe.cardId} onChange={cardId => replace(index, { ...recipe, cardId })} />}
        {operation === 'morph' && <MorphFormPicker key={`${index}-morph`} cards={cards} values={recipe.formIds ?? []} selection={recipe.selection ?? 'sequential'} onChange={formIds => replace(index, { ...recipe, formIds })} onSelectionChange={selection => replace(index, { ...recipe, selection })} />}
        {advanced && <details className="au-recipe-advanced"><summary>More settings</summary><div className="au-recipe-advanced-fields">
          {['moveCard', 'modifyPower', 'handDiscard', 'handTrash'].includes(recipe.kind) && <label className="au-recipe-check"><input type="checkbox" checked={Boolean(recipe.optional)} onChange={event => replace(index, { ...recipe, optional: event.target.checked })} /><span>Optional selection</span></label>}
          {['handDiscard', 'handTrash'].includes(recipe.kind) && <><label className="au-recipe-field"><span>Who chooses the cards</span><select value={recipe.chooser ?? 'owner'} onChange={event => replace(index, { ...recipe, chooser: event.target.value })}><option value="owner">You</option><option value="opponent">Opponent</option></select></label><label className="au-recipe-field"><span>Minimum selections</span><input type="number" min={0} max={Math.min(64, recipe.amount ?? 64)} value={recipe.min ?? ''} placeholder="Default" onChange={event => replace(index, { ...recipe, min: event.target.value === '' ? undefined : Number(event.target.value) })} /></label></>}
          {recipe.kind === 'choice' && <label className="au-recipe-field"><span>Choice prompt</span><input value={recipe.prompt ?? ''} onChange={event => replace(index, { ...recipe, prompt: event.target.value || undefined })} placeholder="Choose one effect" /></label>}
          {(['choice', 'random'].includes(recipe.kind) || recipe.then !== undefined) && <p className="au-recipe-help">Edit branch effects and follow-up steps in Advanced JSON below. These details remain intact when you change a setting here.</p>}
        </div></details>}
        <p className="au-recipe-summary">{recipeSummary(recipe, scope, cards)}</p>
      </div>;
    })}</div>
  </section>;
}
