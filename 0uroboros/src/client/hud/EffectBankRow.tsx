/**
 * Effect Bank.
 *
 * Public for both players. Slot count comes from configuration, and Duration is
 * shown per card because it determines when the slot frees up.
 */

import type { BankSlotView } from '../selectors';

export interface EffectBankRowProps {
  slots: BankSlotView[];
  label: string;
}

export function EffectBankRow({ slots, label }: EffectBankRowProps) {
  return (
    <div className="bank">
      <span className="bank__label">{label}</span>
      <div className="bank__slots">
        {slots.map((slot) => (
          <div key={slot.slot} className="bank__slot" data-filled={Boolean(slot.card)}>
            {slot.definition ? (
              <>
                <span>{slot.definition.name}</span>
                {slot.durationLabel ? <span className="dur">{slot.durationLabel}</span> : null}
              </>
            ) : (
              <span>Empty</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
