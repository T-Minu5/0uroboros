/**
 * Screen-space FX. Canvas Html sprites sit under the Node overlay, so marks
 * have to live in the HUD if the player is going to see them.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { FxEvent, PlayerID } from '../../game/types';
import { familyColor, spatialPlanOf, type SpatialAnchor } from '../board/spatialGrammar';
import { fxKindOf, FxMark, themeTagOf, type FxMarkKind } from '../visual/FxMark';

export interface LandPulse {
  key: number;
  nodeIndex: number;
}

interface Pop {
  id: string;
  kind: FxMarkKind;
  color: string;
  x: number;
  y: number;
  label: string | null;
}

export function FxOverlay({
  event,
  viewer,
  sourceName,
  land = null,
}: {
  event: FxEvent | null;
  viewer: PlayerID;
  sourceName?: string | null;
  land?: LandPulse | null;
}) {
  const [pops, setPops] = useState<Pop[]>([]);
  const plan = event ? spatialPlanOf(event, viewer, sourceName) : null;

  useEffect(() => {
    if (!plan || !event) return;
    const target = pointOf(plan.target, viewer);
    const source = pointOf(plan.source, viewer);
    const next: Pop[] = [];
    const color = familyColor(plan.family);
    const kind = fxKindOf(plan.family, themeTagOf(sourceName));
    if (target) {
      next.push({
        id: `to-${event.id}`,
        kind,
        color,
        x: target.x,
        y: target.y,
        label: plan.label || null,
      });
    }
    if (source && (!target || Math.hypot(source.x - (target.x ?? 0), source.y - (target.y ?? 0)) > 36)) {
      next.push({
        id: `from-${event.id}`,
        kind,
        color,
        x: source.x,
        y: source.y,
        label: null,
      });
    }
    if (next.length === 0) return;
    setPops((current) => [...current, ...next]);
    const hide = window.setTimeout(() => {
      setPops((current) => current.filter((pop) => !next.some((item) => item.id === pop.id)));
    }, 1300);
    return () => window.clearTimeout(hide);
  }, [event?.id, viewer, sourceName]);

  useEffect(() => {
    if (!land) return;
    const head = document.querySelector<HTMLElement>(`.node-head[data-node="${land.nodeIndex}"]`);
    const gem = head?.querySelector<HTMLElement>('.node-head__power[data-side="self"]');
    const box = (gem ?? head)?.getBoundingClientRect();
    if (!box) return;
    const pop: Pop = {
      id: `land-${land.key}`,
      kind: 'burst',
      color: '#27e2ff',
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      label: null,
    };
    setPops((current) => [...current, pop]);
    const hide = window.setTimeout(() => {
      setPops((current) => current.filter((item) => item.id !== pop.id));
    }, 1400);
    return () => window.clearTimeout(hide);
  }, [land?.key]);

  if (typeof document === 'undefined' || pops.length === 0) return null;

  return createPortal(
    <div className="fx-stage" aria-hidden="true">
      {pops.map((pop) => (
        <div
          key={pop.id}
          className="fx-pop"
          data-kind={pop.kind}
          style={{ left: pop.x, top: pop.y, color: pop.color }}
        >
          <FxMark kind={pop.kind} />
          {pop.label ? <span className="fx-pop__label">{pop.label}</span> : null}
        </div>
      ))}
    </div>,
    document.body,
  );
}

function pointOf(anchor: SpatialAnchor, viewer: PlayerID): { x: number; y: number } | null {
  if (typeof document === 'undefined') return null;
  if (anchor.kind === 'card' && anchor.instanceId) {
    const el = document.querySelector<HTMLElement>(`[data-instance-id="${anchor.instanceId}"]`);
    return centerOf(el);
  }
  if (anchor.kind === 'hud' && anchor.hud) {
    const side = (anchor.player ?? viewer) === viewer ? 'local' : 'rival';
    const el = document.querySelector<HTMLElement>(
      `[data-hud="${anchor.hud}"][data-side="${side}"], [data-hud="${anchor.hud}"]`,
    );
    return centerOf(el);
  }
  if (anchor.kind === 'node' && anchor.nodeIndex != null) {
    const head = document.querySelector<HTMLElement>(`.node-head[data-node="${anchor.nodeIndex}"]`);
    const slot =
      anchor.slot === 'self'
        ? head?.querySelector<HTMLElement>('.node-head__power[data-side="self"]')
        : anchor.slot === 'rival'
          ? head?.querySelector<HTMLElement>('.node-head__power[data-side="rival"]')
          : head?.querySelector<HTMLElement>('.node-head__mid');
    return centerOf(slot ?? head);
  }
  if (anchor.kind === 'dc') {
    const side = (anchor.player ?? viewer) === viewer ? 'local' : 'rival';
    const el = document.querySelector<HTMLElement>(
      `[data-hud="dc"][data-side="${side}"][data-pool="${anchor.dataCenter}"], [data-dc="${anchor.dataCenter}"][data-side="${side}"]`,
    );
    return centerOf(el);
  }
  return null;
}

function centerOf(el: HTMLElement | null | undefined): { x: number; y: number } | null {
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
