/**
 * Screen-space path from a board/hand source to a HUD resource.
 *
 * Used only when the target is Actions, Wallet, Victory, deck, or hand, which
 * live in the 2D chrome. Board-to-board effects stay in world space.
 */

import { useEffect, useState } from 'react';

import type { FxEvent, PlayerID } from '../../game/types';
import { familyColor, spatialPlanOf } from '../board/spatialGrammar';

export function CausalHudPath({
  event,
  viewer,
  sourceName,
}: {
  event: FxEvent | null;
  viewer: PlayerID;
  sourceName?: string | null;
}) {
  const [path, setPath] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    label: string;
    tx: number;
    ty: number;
  } | null>(null);

  const plan = event ? spatialPlanOf(event, viewer, sourceName) : null;

  useEffect(() => {
    if (!plan || plan.target.kind !== 'hud' || !plan.target.hud) {
      setPath(null);
      return;
    }
    const source =
      (plan.source.instanceId
        ? document.querySelector<HTMLElement>(`[data-instance-id="${plan.source.instanceId}"]`)
        : null) ?? document.querySelector<HTMLElement>('[data-source="true"]');
    const side = (plan.target.player ?? viewer) === viewer ? 'local' : 'rival';
    const target = document.querySelector<HTMLElement>(
      `[data-hud="${plan.target.hud}"][data-side="${side}"], [data-hud="${plan.target.hud}"]`,
    );
    if (!source || !target) {
      setPath(null);
      return;
    }
    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    setPath({
      x1: a.left + a.width / 2,
      y1: a.top + a.height / 2,
      x2: b.left + b.width / 2,
      y2: b.top + b.height / 2,
      color: familyColor(plan.family),
      label: plan.label,
      tx: b.left + b.width / 2,
      ty: b.top - 8,
    });
  }, [event?.id, viewer, sourceName]);

  if (!path) return null;

  return (
    <svg className="causal-hud" aria-hidden>
      <path
        d={`M ${path.x1} ${path.y1} Q ${(path.x1 + path.x2) / 2} ${Math.min(path.y1, path.y2) - 48} ${path.x2} ${path.y2}`}
        fill="none"
        stroke={path.color}
        strokeWidth="1.6"
        strokeOpacity="0.85"
      />
      {path.label ? (
        <text x={path.tx} y={path.ty} textAnchor="middle" className="causal-hud__label" fill={path.color}>
          {path.label}
        </text>
      ) : null}
    </svg>
  );
}
