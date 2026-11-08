import { useMemo, useState, type CSSProperties } from 'react';
import { Icon } from './BoardScene';
import { CardFace } from './CardFace';
import type { Card, CardClass, PlayerId } from '@0uroboros/engine/game';
import { EVALUATION_ALL_CARDS } from '@0uroboros/engine/evaluationMarket';
import type { CompiledContent } from '@0uroboros/engine/authoring/contentModel';
import { CARD_STYLE_COLORS, CARD_STYLE_ICONS, type CardStyle } from './cardPresentation';
import './card-catalog.css';

type Props = {
  content?: CompiledContent;
  canTest: boolean;
  inspect: (card: Card) => void;
  add: (id: string, owner: PlayerId) => boolean;
  close: () => void;
};

type GalleryFilter = 'All' | CardClass | 'Crypto';

const FILTERS: readonly { id: GalleryFilter; label: string; style?: CardStyle }[] = [
  { id: 'All', label: 'All' },
  { id: 'Action', label: 'Action', style: 'action' },
  { id: 'Utility', label: 'Utility', style: 'utility' },
  { id: 'Runtime', label: 'Runtime', style: 'runtime' },
  { id: 'Attack', label: 'Attack', style: 'attack' },
  { id: 'Hacker', label: 'Hacker', style: 'hacker' },
  { id: 'Horror', label: 'Horror', style: 'horror' },
  { id: 'Volume', label: 'Volume', style: 'vp' },
  { id: 'Solar-monk', label: 'Solar-monk', style: 'solar' },
  { id: 'Crypto', label: 'Crypto', style: 'crypto' },
];

const identity = (card: Card) => card.definitionId ?? card.id;

type GalleryCard = Card & { enabled?: boolean; generated?: boolean; cardClass?: CardClass };

function isDraftEligible(card: GalleryCard) {
  return card.enabled !== false && card.generated !== true;
}

function matchesFilter(card: GalleryCard, filter: GalleryFilter) {
  if (filter === 'All') return true;
  if (filter === 'Crypto') return card.type === 'Crypto';
  if (filter === 'Volume') return card.type === 'VP' && card.cardClass !== 'Solar-monk';
  if (filter === 'Solar-monk') return card.cardClass === 'Solar-monk';
  return card.cardClass === filter;
}

/** Player-facing gallery of draft-eligible cards (generated definitions excluded). */
export function CardCatalog({ content, canTest, inspect, add, close }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<GalleryFilter>('All');
  const [owner, setOwner] = useState<PlayerId>(0);
  const [added, setAdded] = useState<string | null>(null);
  const all = (content?.cards ?? EVALUATION_ALL_CARDS) as GalleryCard[];
  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter(isDraftEligible)
      .filter(card => matchesFilter(card, filter))
      .filter(card => !q || `${card.name} ${card.effect}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, filter, query]);

  return <div className='catalog-backdrop' onClick={close}>
    <section className='card-catalog' role='dialog' aria-modal='true' aria-label='The Card Gallery' onClick={e => e.stopPropagation()}>
      <header>
        <div>
          <small>CIRCUIT LIBRARY</small>
          <h1>The Card Gallery</h1>
          <p>Draft-eligible cards only. Generated definitions stay out of the gallery.</p>
        </div>
        <button className='close' aria-label='Close The Card Gallery' onClick={close}>×</button>
      </header>
      <div className='catalog-sticky'>
        <div className='catalog-tools'>
          <label>
            <span>Find a card</span>
            <input autoFocus type='search' placeholder='Name or effect…' value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          {canTest && <label>
            <span>Add test cards to</span>
            <select value={owner} onChange={event => setOwner(Number(event.target.value) as PlayerId)}>
              <option value={0}>Your hand</option>
              <option value={1}>Opponent&apos;s hand</option>
            </select>
          </label>}
        </div>
        <div className='catalog-filters' role='tablist' aria-label='Card subtype'>
          {FILTERS.map(entry => {
            const color = entry.style ? CARD_STYLE_COLORS[entry.style] : '#9fb8c5';
            const icon = entry.style ? CARD_STYLE_ICONS[entry.style] : undefined;
            return <button
              key={entry.id}
              type='button'
              role='tab'
              aria-selected={filter === entry.id}
              className={filter === entry.id ? 'selected' : undefined}
              style={{ '--tone': color } as CSSProperties}
              onClick={() => setFilter(entry.id)}
            >
              {icon && <i className='catalog-filter-icon' style={{ backgroundColor: color, WebkitMaskImage: `url(${icon})`, maskImage: `url(${icon})` }} aria-hidden='true' />}
              <span>{entry.label}</span>
            </button>;
          })}
        </div>
        <div className='catalog-feedback' role='status'>{added ?? `${cards.length} cards shown`}</div>
      </div>
      {canTest && <p className='catalog-hint'>Add a card directly to a test hand before placing cards this turn. This evaluation tool is separate from market purchases.</p>}
      {!canTest && <p className='catalog-hint'>Browse every card the Draft can offer. Start a Runtime turn with no placements to add test cards from Settings.</p>}
      <div className='catalog-grid'>{cards.map(card => {
        const cost = card.cost ?? 0;
        return <article key={identity(card)} data-catalog-id={identity(card)}>
          <button className='catalog-art' aria-label={`Inspect ${card.name}`} onClick={() => inspect(card)}>
            <CardFace card={card} context='preview' />
          </button>
          <div className='catalog-copy'>
            <p className='catalog-cost' aria-label={`Cost ${cost} Crypto`}>
              <span>Cost</span>
              <Icon name='crypto'/>
              <b>{cost}</b>
              <span>Crypto</span>
            </p>
            <p>{card.effect}</p>
          </div>
          {canTest && <button className='catalog-add' onClick={() => {
            if (add(identity(card), owner)) setAdded(`${card.name} added to ${owner === 0 ? 'your' : "the opponent's"} test hand.`);
            else setAdded('This turn is resolving. Add test cards at the next planning window.');
          }}>Add to test hand</button>}
        </article>;
      })}</div>
      {!cards.length && <p className='catalog-empty'>No cards match this search.</p>}
    </section>
  </div>;
}
