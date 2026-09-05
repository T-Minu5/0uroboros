/**
 * Client playback of recorded effect beats.
 *
 * The engine has already applied every op. This hook holds displayed numbers at
 * their pre-beat values, then releases each change with the card text that
 * caused it. Collapse waits until the current reveal sequence finishes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { DataCenterId, FxEvent, PlayerID } from '../game/types';

export const FX_STEP_MS = 380;

export interface FxView {
  active: FxEvent | null;
  playing: boolean;
  dcHealth: (player: PlayerID, id: DataCenterId) => number | undefined;
  /** Unplayed Victory Point and Wallet deltas still waiting to land. */
  vpPending: (player: PlayerID) => number;
  walletPending: (player: PlayerID) => number;
  chance: (index: number) => number | undefined;
  power: (instanceId: string) => number | undefined;
  hitCardIds: ReadonlySet<string>;
  hitDcKey: string | null;
  focusNode: number | null;
}

const EMPTY: FxView = {
  active: null,
  playing: false,
  dcHealth: () => undefined,
  vpPending: () => 0,
  walletPending: () => 0,
  chance: () => undefined,
  power: () => undefined,
  hitCardIds: new Set(),
  hitDcKey: null,
  focusNode: null,
};

export function eventReady(
  event: FxEvent,
  visuallyRevealed: (instanceId: string) => boolean,
  revealDone: boolean,
): boolean {
  if (event.chapter === 'collapse') return revealDone;
  if (event.chapter === 'reveal') {
    if (!event.sourceInstanceId) return revealDone;
    return visuallyRevealed(event.sourceInstanceId) || revealDone;
  }
  return true;
}

export function useResolutionPlayback(
  queue: FxEvent[],
  visuallyRevealed: (instanceId: string) => boolean,
  revealDone: boolean,
): FxView {
  const seen = useRef(queue.length === 0 ? 0 : queue[queue.length - 1].id);
  const [playedId, setPlayedId] = useState(seen.current);
  const [active, setActive] = useState<FxEvent | null>(null);

  useEffect(() => {
    const next = queue.find(
      (event) => event.id > playedId && eventReady(event, visuallyRevealed, revealDone),
    );
    if (!next) {
      setActive(null);
      return;
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reduce ? 80 : FX_STEP_MS;
    setActive(next);
    const id = window.setTimeout(() => {
      setPlayedId(next.id);
      setActive(null);
    }, delay);
    return () => window.clearTimeout(id);
  }, [queue, playedId, visuallyRevealed, revealDone]);

  return useMemo(() => {
    const unplayed = queue.filter((event) => event.id > playedId);
    if (unplayed.length === 0 && !active) return EMPTY;

    const dc = new Map<string, number>();
    const vpPending = new Map<PlayerID, number>();
    const walletPending = new Map<PlayerID, number>();
    const chance = new Map<number, number>();
    const power = new Map<string, number>();

    for (const event of [...unplayed].reverse()) {
      rewind(event, dc, chance, power);
    }
    for (const event of unplayed) {
      if (event.kind === 'vp' && event.player) {
        vpPending.set(event.player, (vpPending.get(event.player) ?? 0) + (event.amount ?? 0));
      }
      if (event.kind === 'crypto' && event.player) {
        walletPending.set(event.player, (walletPending.get(event.player) ?? 0) + (event.amount ?? 0));
      }
    }

    const hitCardIds = new Set<string>();
    if (active?.kind === 'hitCard' && active.instanceId) hitCardIds.add(active.instanceId);
    if (active?.kind === 'power' && (active.amount ?? 0) < 0 && active.instanceId) {
      hitCardIds.add(active.instanceId);
    }

    return {
      active,
      playing: unplayed.length > 0 || Boolean(active),
      dcHealth: (player, id) => dc.get(dcKey(player, id)),
      vpPending: (player) => vpPending.get(player) ?? 0,
      walletPending: (player) => walletPending.get(player) ?? 0,
      chance: (index) => chance.get(index),
      power: (instanceId) => power.get(instanceId),
      hitCardIds,
      hitDcKey:
        active && (active.kind === 'damageDc' || active.kind === 'healDc') && active.player && active.dataCenter
          ? dcKey(active.player, active.dataCenter)
          : null,
      focusNode:
        active && (active.kind === 'nodeFocus' || active.kind === 'collapseSelect')
          ? (active.nodeIndex ?? null)
          : active?.nodeIndex ?? null,
    };
  }, [queue, playedId, active]);
}

function dcKey(player: PlayerID, id: DataCenterId): string {
  return `${player}:${id}`;
}

function rewind(
  event: FxEvent,
  dc: Map<string, number>,
  chance: Map<number, number>,
  power: Map<string, number>,
): void {
  if (event.kind === 'damageDc' || event.kind === 'healDc') {
    if (event.player && event.dataCenter && event.before !== undefined) {
      dc.set(dcKey(event.player, event.dataCenter), event.before);
    }
  }
  if (event.kind === 'chance') {
    if (event.fromNode !== undefined && event.fromBefore !== undefined) {
      chance.set(event.fromNode, event.fromBefore);
    }
    if (event.toNode !== undefined && event.toBefore !== undefined) {
      chance.set(event.toNode, event.toBefore);
    }
  }
  if (event.kind === 'power' && event.instanceId && event.before !== undefined) {
    power.set(event.instanceId, event.before);
  }
}

export function formatFxDelta(event: FxEvent): string | null {
  const amount = event.amount;
  if (amount === undefined) return null;
  if (event.kind === 'damageDc') return `-${amount}`;
  if (event.kind === 'healDc' || event.kind === 'vp' || event.kind === 'crypto') {
    return amount >= 0 ? `+${amount}` : String(amount);
  }
  if (event.kind === 'power') return amount >= 0 ? `+${amount}` : String(amount);
  if (event.kind === 'chance') return `${amount}%`;
  return null;
}
