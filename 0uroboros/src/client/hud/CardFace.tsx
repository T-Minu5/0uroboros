/**
 * Card presentation.
 *
 * Communicates name, type, cost, Power, rules text, ownership, and legality, and
 * nothing more. Placeholder chrome only. The component is structured so final
 * art, frames, rarity treatments, and animations layer in without changing the
 * props contract.
 */

import type { CardDefinition, CardInstance } from '../../game/types';
import { cardPowerOf } from '../selectors';

const KIND_LABELS: Record<CardDefinition['kind'], string> = {
  character: 'Character',
  crypto: 'Crypto',
  victoryPoint: 'Victory Point',
  base: 'Base',
  chaos: 'Chaos',
};

export interface CardFaceProps {
  definition: CardDefinition;
  /** Present for cards that exist in play, absent for market offerings. */
  card?: CardInstance;
  selected?: boolean;
  /** False renders the explicit unplayable state. */
  playable?: boolean;
  /** Shown in place of the footer when the card cannot be used. */
  blockedReason?: string | null;
  /** Overrides the footer with market information. */
  supplyLabel?: string | null;
  showCost?: boolean;
  onClick?: () => void;
}

export function CardFace({
  definition,
  card,
  selected = false,
  playable = true,
  blockedReason = null,
  supplyLabel = null,
  showCost = false,
  onClick,
}: CardFaceProps) {
  // Live Power includes accumulated modifiers, so the board and the card agree.
  const power = card ? cardPowerOf(card) : definition.power;
  const modified = card ? card.powerMods !== 0 : false;
  const rulesText = definition.effects.map((effect) => effect.text).join(' ');

  return (
    <button
      type="button"
      className="card"
      data-selected={selected}
      data-playable={playable}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
    >
      <div className="card__top">
        <span className="card__cost">{showCost ? `${definition.cost}c` : ''}</span>
        {definition.deployable ? (
          <span
            className="card__power"
            style={modified ? { color: 'var(--heal)' } : undefined}
            title={modified ? 'Power has been modified' : undefined}
          >
            {power}
          </span>
        ) : null}
      </div>

      <div className="card__name">{definition.name}</div>
      <div className="card__kind">
        {KIND_LABELS[definition.kind]}
        {definition.duration ? ' · Duration' : ''}
      </div>

      {rulesText ? <div className="card__text">{rulesText}</div> : null}

      <div className="card__foot">
        {blockedReason ? (
          <span className="card__block">{blockedReason}</span>
        ) : supplyLabel ? (
          <span>{supplyLabel}</span>
        ) : (
          <>
            {definition.victoryPoints ? <span>{definition.victoryPoints} VP</span> : <span />}
            {definition.cryptoValue ? <span>{definition.cryptoValue}c</span> : null}
          </>
        )}
      </div>
    </button>
  );
}
