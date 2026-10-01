/**
 * Card presentation. Art is the object. Stats sit on the frame.
 */

import type { CardDefinition, CardInstance } from '../../game/types';
import { cardArtUrl } from '../lookdev/cardArt';
import { cardPowerOf } from '../selectors';
import { GameIcon } from '../visual/icons';

const KIND_LABELS: Record<CardDefinition['kind'], string> = {
  character: 'Character',
  crypto: 'Crypto',
  victoryPoint: 'Victory Point',
  base: 'Base',
  chaos: 'Chaos',
};

export interface CardFaceProps {
  definition: CardDefinition;
  card?: CardInstance;
  selected?: boolean;
  playable?: boolean;
  blockedReason?: string | null;
  supplyLabel?: string | null;
  showCost?: boolean;
  density?: 'compact' | 'full';
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
  density = 'full',
  onClick,
}: CardFaceProps) {
  const power = card ? cardPowerOf(card) : definition.power;
  const modified = card ? card.powerMods !== 0 : false;
  const rulesText = definition.effects.map((effect) => effect.text).join(' ');
  const art = cardArtUrl(definition.id, definition.name);
  const compact = density === 'compact';

  return (
    <button
      type="button"
      className="card"
      data-selected={selected}
      data-playable={playable}
      data-art={art ? 'true' : 'false'}
      data-kind={definition.kind}
      data-density={density}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
    >
      <div
        className="card__art"
        style={art ? { backgroundImage: `url(${art})` } : undefined}
        aria-hidden="true"
      />
      <div className="card__veil" aria-hidden="true" />
      <div className="card__top">
        {showCost || definition.cryptoValue || definition.cost ? (
          <span className="card__cost">
            <GameIcon name="crypto" />
            {showCost ? definition.cost : definition.cryptoValue || definition.cost}
          </span>
        ) : (
          <span />
        )}
        {definition.deployable ? (
          <span
            className="card__power"
            data-modified={modified}
            title={modified ? 'Power has been modified' : 'Power'}
          >
            <GameIcon name="power" />
            {power}
          </span>
        ) : null}
      </div>
      <div className="card__meta">
        <div className="card__name">{definition.name}</div>
        <div className="card__kind">
          {KIND_LABELS[definition.kind]}
          {definition.duration ? ' · Duration' : ''}
        </div>
      </div>
      {!compact && rulesText ? <div className="card__text">{rulesText}</div> : null}
      <div className="card__foot">
        {blockedReason ? (
          <span className="card__block">{blockedReason}</span>
        ) : supplyLabel ? (
          <span>{supplyLabel}</span>
        ) : compact ? null : (
          <>
            {definition.victoryPoints ? <span>{definition.victoryPoints} VP</span> : <span />}
            {definition.cryptoValue ? <span>{definition.cryptoValue}c</span> : null}
          </>
        )}
      </div>
    </button>
  );
}
