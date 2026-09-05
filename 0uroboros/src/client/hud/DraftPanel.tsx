/**
 * Draft interface.
 *
 * Simultaneous and public. Wallet, remaining supply, and opponent progress are
 * all visible. Undo End Draft is offered only while it is legal, which the
 * engine decides.
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

const ORDER: MarketCategory[] = ['base', 'victoryPoint', 'crypto', 'chaos'];

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

      <div className="draft__body">
        {reward.definition ? (
          <div className="draft__group">
            <div className="draft__groupname">Circuit Reward</div>
            <div className="draft__grid">
              <div className="reward">
                <div className="reward__name">{reward.definition.name}</div>
                <div className="reward__text">{reward.definition.text}</div>
                <button
                  type="button"
                  className="act"
                  style={{ marginTop: 8 }}
                  onClick={onClaimReward}
                  disabled={!reward.eligible || reward.claimed || endedDraft}
                >
                  {reward.claimed ? 'Claimed' : reward.eligible ? 'Claim' : 'Not eligible'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {ORDER.map((category) => {
          const slots = market.filter((slot) => slot.category === category);
          if (slots.length === 0) return null;
          return (
            <div key={category} className="draft__group">
              <div className="draft__groupname">{CATEGORY_LABELS[category]}</div>
              <div className="draft__grid">
                {slots.map((slot) => (
                  <CardFace
                    key={`${slot.category}-${slot.slotIndex}`}
                    definition={slot.definition}
                    showCost
                    playable={slot.blockedReason === null && !endedDraft}
                    blockedReason={slot.blockedReason}
                    supplyLabel={`${slot.supply} left`}
                    onClick={() => onBuy(slot.category, slot.slotIndex)}
                  />
                ))}
              </div>
            </div>
          );
        })}
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
