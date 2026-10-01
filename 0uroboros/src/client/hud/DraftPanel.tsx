/**
 * Draft interface.
 *
 * Takes over the board. Character piles stay large and front. VP and Crypto
 * stay visible but smaller, with the Circuit Reward between them.
 */

import { CardFace } from './CardFace';
import { CATEGORY_LABELS, type MarketSlotView } from '../selectors';
import type { MarketCategory } from '../../game/engine/draft';
import type { CircuitRewardDefinition } from '../../game/types';

export interface DraftPanelProps {
  wallet: number;
  market: MarketSlotView[];
  reward: {
    definition: CircuitRewardDefinition | null;
    eligible: boolean;
    claimed: boolean;
  };
  endedDraft: boolean;
  canUndoEndDraft: boolean;
  opponentEndedDraft: boolean;
  onBuy: (category: MarketCategory, slotIndex: number) => void;
  onClaimReward: () => void;
  onEndDraft: () => void;
  onUndoEndDraft: () => void;
}

export function DraftPanel({
  wallet,
  market,
  reward,
  endedDraft,
  canUndoEndDraft,
  opponentEndedDraft,
  onBuy,
  onClaimReward,
  onEndDraft,
  onUndoEndDraft,
}: DraftPanelProps) {
  const base = market.filter((slot) => slot.category === 'base');
  const chaos = market.filter((slot) => slot.category === 'chaos');
  const vp = market.filter((slot) => slot.category === 'victoryPoint');
  const crypto = market.filter((slot) => slot.category === 'crypto');
  const heroes = [...base, ...chaos];

  return (
    <div className="draft">
      <div className="draft__head">
        <span className="draft__title">Draft</span>
        <div className="metric metric--wallet">
          <span className="metric__label">Wallet</span>
          <span className="metric__value">{wallet}</span>
        </div>
        <span className="badge" data-kind={opponentEndedDraft ? 'ended' : 'waiting'}>
          {opponentEndedDraft ? 'Opponent ended' : 'Opponent drafting'}
        </span>
      </div>

      <div className="draft__stage">
        <section className="draft__heroes">
          <div className="draft__hero-legend">
            <span>{CATEGORY_LABELS.base}</span>
            <span>{CATEGORY_LABELS.chaos}</span>
          </div>
          <div className="draft__heroes-grid">
            {heroes.map((slot) => (
              <CardFace
                key={`${slot.category}-${slot.slotIndex}`}
                definition={slot.definition}
                showCost
                density="compact"
                playable={slot.blockedReason === null && !endedDraft}
                blockedReason={slot.blockedReason}
                supplyLabel={`${slot.supply} left`}
                onClick={() => onBuy(slot.category, slot.slotIndex)}
              />
            ))}
          </div>
        </section>

        <section className="draft__supply">
          <PileRow
            kind="vp"
            label={CATEGORY_LABELS.victoryPoint}
            slots={vp}
            endedDraft={endedDraft}
            onBuy={onBuy}
          />
          <div className="draft__reward">
            {reward.definition ? (
              <div className="reward">
                <div className="draft__groupname">Circuit Reward</div>
                <div className="reward__name">{reward.definition.name}</div>
                <div className="reward__text">{reward.definition.text}</div>
                <button
                  type="button"
                  className="act"
                  onClick={onClaimReward}
                  disabled={!reward.eligible || reward.claimed || endedDraft}
                >
                  {reward.claimed ? 'Claimed' : reward.eligible ? 'Claim' : 'Not eligible'}
                </button>
              </div>
            ) : (
              <div className="reward" data-empty="true">
                <div className="draft__groupname">Circuit Reward</div>
                <div className="reward__text">No Circuit Reward this Cycle</div>
              </div>
            )}
          </div>
          <PileRow
            kind="crypto"
            label={CATEGORY_LABELS.crypto}
            slots={crypto}
            endedDraft={endedDraft}
            onBuy={onBuy}
          />
        </section>
      </div>

      <div className="draft__foot">
        <button
          type="button"
          className="act"
          data-primary="true"
          onClick={onEndDraft}
          disabled={endedDraft}
        >
          {endedDraft ? 'Draft ended' : 'End Draft'}
        </button>
        {endedDraft ? (
          <button
            type="button"
            className="act"
            onClick={onUndoEndDraft}
            disabled={!canUndoEndDraft}
          >
            Resume drafting
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PileRow({
  kind,
  label,
  slots,
  endedDraft,
  onBuy,
}: {
  kind: 'vp' | 'crypto';
  label: string;
  slots: MarketSlotView[];
  endedDraft: boolean;
  onBuy: (category: MarketCategory, slotIndex: number) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div className="draft__piles" data-kind={kind}>
      <div className="draft__groupname">{label}</div>
      <div className="draft__pile-row">
        {slots.map((slot) => (
          <CardFace
            key={`${slot.category}-${slot.slotIndex}`}
            definition={slot.definition}
            showCost
            density="compact"
            playable={slot.blockedReason === null && !endedDraft}
            blockedReason={slot.blockedReason}
            supplyLabel={`${slot.supply} left`}
            onClick={() => onBuy(slot.category, slot.slotIndex)}
          />
        ))}
      </div>
    </div>
  );
}
