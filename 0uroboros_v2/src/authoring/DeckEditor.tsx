import { useState } from 'react';
import { CARD_ART_PLACEHOLDER, cardArtworkPath } from '@0uroboros/engine/cardArtwork';
import { servedArtPath } from '../depthArt/depthManifest';
import { MIN_STARTING_DECK_SIZE } from '@0uroboros/engine/game';
import { deckSize, type AuthoredCard, type StartingDeck } from '@0uroboros/engine/authoring/contentModel';
import { cardCategoryLabel } from './cardBrowser';
import { useEditorFocus } from './editorContext';

const MAX_COPIES = 40;
const TYPE_FILTERS = ['All', 'Character', 'Crypto', 'VP'] as const;
type TypeFilter = typeof TYPE_FILTERS[number];

const identity = (card: AuthoredCard) => card.definitionId ?? card.id;

function Thumb({ card }: { card?: AuthoredCard }) {
  return <img className="au-thumb" src={card ? servedArtPath(cardArtworkPath(card)) : CARD_ART_PLACEHOLDER} alt="" loading="lazy" onError={event => { if (event.currentTarget.src !== new URL(CARD_ART_PLACEHOLDER, window.location.href).href) event.currentTarget.src = CARD_ART_PLACEHOLDER; }} />;
}

export function DeckEditor({ deck, cards, active, update }: { deck: StartingDeck; cards: readonly AuthoredCard[]; active: boolean; update: (deck: StartingDeck) => void }) {
  const { invalid } = useEditorFocus();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const byId = new Map(cards.map(card => [identity(card), card]));
  const total = deckSize(deck);
  const tally = (type: AuthoredCard['type']) => deck.cards.reduce((sum, entry) => sum + (byId.get(entry.cardId)?.type === type ? entry.count : 0), 0);
  const startingVP = deck.cards.reduce((sum, entry) => sum + (byId.get(entry.cardId)?.vp ?? 0) * entry.count, 0);
  const setCount = (cardId: string, count: number) => update({ ...deck, cards: deck.cards.map(entry => entry.cardId === cardId ? { ...entry, count: Math.max(1, Math.min(MAX_COPIES, count)) } : entry) });
  const remove = (cardId: string) => update({ ...deck, cards: deck.cards.filter(entry => entry.cardId !== cardId) });
  const add = (cardId: string) => {
    const existing = deck.cards.find(entry => entry.cardId === cardId);
    if (existing) setCount(cardId, existing.count + 1);
    else update({ ...deck, cards: [...deck.cards, { cardId, count: 1 }] });
  };
  const query = search.trim().toLowerCase();
  const allMatching = cards
    .filter(card => card.enabled && (typeFilter === 'All' || card.type === typeFilter) && `${card.name} ${identity(card)}`.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const matching = allMatching.slice(0, 48);
  const nameInvalid = invalid.has('name');

  return <div className="au-properties au-standalone-properties au-deck-editor">
    <section className="au-panel">
      <div className="au-section-title"><div><h2>Deck properties</h2></div></div>
      <div className="au-field-grid">
        <label className={`au-field${nameInvalid ? ' is-invalid' : ''}`} data-field="name"><span>Name</span><input aria-label="Deck name" aria-invalid={nameInvalid || undefined} value={deck.name} onChange={event => update({ ...deck, name: event.target.value })} /></label>
      </div>
      <p className="au-deck-status" data-active={active}>{active ? 'New games deal this deck to both players.' : 'Not loaded in new games. Turn on “Load in game” above to use it.'}</p>
    </section>

    <section className={`au-panel${[...invalid].some(key => key === 'cards' || key.startsWith('cards.')) ? ' is-invalid' : ''}`} data-field="cards" aria-label="Deck list">
      <div className="au-section-title"><div><span className="au-eyebrow">{total} {total === 1 ? 'card' : 'cards'}</span><h2>Deck list</h2><p>Each player shuffles these cards at the start of the game and draws {MIN_STARTING_DECK_SIZE} as their opening hand.</p></div></div>
      <div className="au-card-metrics au-deck-metrics"><span>Characters <b>{tally('Character')}</b></span><span>Crypto <b>{tally('Crypto')}</b></span><span>VP cards <b>{tally('VP')}</b></span><span>Starting VP <b>{startingVP}</b></span></div>
      {active && total < MIN_STARTING_DECK_SIZE && <p className="au-field-warning au-deck-warning" role="status">Add at least {MIN_STARTING_DECK_SIZE - total} more {MIN_STARTING_DECK_SIZE - total === 1 ? 'card' : 'cards'}: the deck loaded in new games needs {MIN_STARTING_DECK_SIZE} for the opening hand.</p>}
      {deck.cards.length === 0 ? <p className="au-recipe-empty">No cards yet. Add some from the list below.</p> : <ul className="au-deck-list">
        {deck.cards.map((entry, index) => {
          const card = byId.get(entry.cardId);
          const rowInvalid = [...invalid].some(key => key === `cards.${index}`);
          return <li key={entry.cardId} className={`au-deck-row${rowInvalid ? ' is-invalid' : ''}`} data-field={`cards.${index}`} data-deck-card={entry.cardId}>
            <Thumb card={card} />
            <span className="au-row-title"><b>{card?.name ?? entry.cardId}</b><small>{card ? cardCategoryLabel(card) : 'Missing card'}</small></span>
            <span className="au-deck-stepper" role="group" aria-label={`Copies of ${card?.name ?? entry.cardId}`}>
              <button type="button" aria-label={`One fewer ${card?.name ?? entry.cardId}`} disabled={entry.count <= 1} onClick={() => setCount(entry.cardId, entry.count - 1)}>−</button>
              <output aria-live="polite">{entry.count}</output>
              <button type="button" aria-label={`One more ${card?.name ?? entry.cardId}`} disabled={entry.count >= MAX_COPIES} onClick={() => setCount(entry.cardId, entry.count + 1)}>+</button>
            </span>
            <button type="button" className="au-deck-remove" aria-label={`Remove ${card?.name ?? entry.cardId} from deck`} title="Remove from deck" onClick={() => remove(entry.cardId)}>×</button>
          </li>;
        })}
      </ul>}
    </section>

    <section className="au-panel" aria-label="Add cards">
      <div className="au-section-title"><div><h2>Add cards</h2><p>Any enabled card can start in a deck, including Generated ones. Click a card to add a copy.</p></div></div>
      <div className="au-deck-picker-tools">
        <label className="au-field"><span>Search</span><input type="search" aria-label="Search cards to add" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or ID" /></label>
        <div className="au-preview-modes au-deck-type-filter" role="group" aria-label="Card type">{TYPE_FILTERS.map(filter => <button type="button" key={filter} aria-pressed={typeFilter === filter} onClick={() => setTypeFilter(filter)}>{filter}</button>)}</div>
      </div>
      <div className="au-deck-picker">
        {matching.map(card => {
          const count = deck.cards.find(entry => entry.cardId === identity(card))?.count ?? 0;
          return <button type="button" key={card.id} className="au-deck-pick" data-pick-card={identity(card)} disabled={count >= MAX_COPIES} onClick={() => add(identity(card))} aria-label={`Add ${card.name}${count ? `, ${count} in deck` : ''}`}>
            <Thumb card={card} />
            <span className="au-row-title"><b>{card.name}</b><small>{cardCategoryLabel(card)}</small></span>
            {count > 0 ? <em className="au-deck-in">×{count}</em> : <span className="au-deck-plus" aria-hidden="true">+</span>}
          </button>;
        })}
      </div>
      {matching.length === 0 && <p className="au-recipe-empty">No enabled cards match.</p>}
      {allMatching.length > matching.length && <small className="au-deck-more">Showing the first {matching.length} of {allMatching.length}. Search to narrow the list.</small>}
    </section>
  </div>;
}
