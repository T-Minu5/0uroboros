/**
 * Selected-card detail. Board-scale 3D text is not the reading surface.
 */

import type { CardDefinition } from '../../game/types';
import { CardFace } from './CardFace';

export function InspectPlate({
  definition,
  blockedReason,
  legalCount,
  actions,
  actionCost,
}: {
  definition: CardDefinition;
  blockedReason: string | null;
  legalCount: number;
  actions: number;
  actionCost: number;
}) {
  const after = Math.max(0, actions - actionCost);
  return (
    <div className="inspect" data-inspect="true" aria-label={`Selected ${definition.name}`}>
      <CardFace definition={definition} selected playable={blockedReason === null} density="compact" />
      <div className="inspect__copy">
        <div className="inspect__name">{definition.name}</div>
        <div className="inspect__meta">
          {`${definition.kind} · Power ${definition.power}${
            definition.deployable ? ` · Action cost ${actionCost}` : ''
          }`}
        </div>
        {definition.effects.map((effect) => (
          <p key={effect.text} className="inspect__text">
            {effect.text}
          </p>
        ))}
        {definition.kind === 'crypto' ? (
          <div className="inspect__ok">Wallet</div>
        ) : blockedReason ? (
          <div className="inspect__block">{blockedReason}</div>
        ) : (
          <div className="inspect__ok">
            {`${legalCount} legal Nodes · Actions ${actions} → ${after}`}
          </div>
        )}
      </div>
    </div>
  );
}
