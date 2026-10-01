/**
 * Client playback of recorded effect beats.
 *
 * The engine has already applied every op. This hook holds displayed numbers at
 * their pre-beat values, then releases each change with the card text that
 * caused it. Collapse waits until the current reveal sequence finishes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { DataCenterId, FxEvent, PlayerID } from '../game/types';

export const FX_STEP_MS = 900; // Snap local sequencing: one effect beat before the next.

export interface FxGroup {
  id: number;
  sourceInstanceId?: string;
  events: FxEvent[];
}

export function groupFxEvents(queue: FxEvent[]): FxGroup[] {
  const groups: FxGroup[] = [];
  for (const event of queue) {
    const last = groups[groups.length - 1];
    const sameSource =
      last &&
      last.sourceInstanceId &&
      last.sourceInstanceId === event.sourceInstanceId &&
      last.events[0].chapter === event.chapter;
    if (sameSource && last) {
      last.events.push(event);
    } else {
      groups.push({
        id: event.id,
        sourceInstanceId: event.sourceInstanceId,
        events: [event],
      });
    }
  }
  return groups;
}

export function groupHoldMs(group: FxGroup, minimumReadMs: number): number {
  return Math.round(minimumReadMs * (1 + 0.2 * Math.max(0, group.events.length - 1)));
}

export interface FxView {
  active: FxEvent | null;
  activeGroup: FxEvent[];
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
  advanceNow: () => void;
}

const EMPTY: FxView = {
  active: null,
  activeGroup: [],
  playing: false,
  dcHealth: () => undefined,
  vpPending: () => 0,
  walletPending: () => 0,
  chance: () => undefined,
  power: () => undefined,
  hitCardIds: new Set(),
  hitDcKey: null,
  focusNode: null,
  advanceNow: () => undefined,
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
  minimumReadMs = 2800,
): FxView & { activeGroup: FxEvent[]; advanceNow: () => void } {
  const seen = useRef(queue.length === 0 ? 0 : queue[queue.length - 1].id);
  const [playedId, setPlayedId] = useState(seen.current);
  const [active, setActive] = useState<FxEvent | null>(null);
  const [activeGroup, setActiveGroup] = useState<FxEvent[]>([]);
  const skip = useRef<(() => void) | null>(null);

  useEffect(() => {
    const groups = groupFxEvents(queue);
    const next = groups.find((group) =>
      group.events.every((event) => eventReady(event, visuallyRevealed, revealDone)) &&
      group.events.some((event) => event.id > playedId),
    );
    if (!next) {
      setActive(null);
      setActiveGroup([]);
      skip.current = null;
      return;
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = reduce ? 80 : groupHoldMs(next, minimumReadMs);
    setActive(next.events[0]);
    setActiveGroup(next.events);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setPlayedId(next.events[next.events.length - 1].id);
      setActive(null);
      setActiveGroup([]);
    };
    skip.current = finish;
    const id = window.setTimeout(finish, delay);
    return () => window.clearTimeout(id);
  }, [queue, playedId, visuallyRevealed, revealDone, minimumReadMs]);

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
    for (const event of activeGroup) {
      if (event.kind === 'hitCard' && event.instanceId) hitCardIds.add(event.instanceId);
      if (event.kind === 'power' && (event.amount ?? 0) < 0 && event.instanceId) {
        hitCardIds.add(event.instanceId);
      }
      if (event.sourceInstanceId) hitCardIds.add(event.sourceInstanceId);
    }

    return {
      active,
      activeGroup,
      playing: unplayed.length > 0 || Boolean(active),
      advanceNow: () => skip.current?.(),
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
  }, [queue, playedId, active, activeGroup]);
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

export function formatFxChain(event: FxEvent, sourceName?: string | null): string {
  const source = sourceName?.trim() || 'Effect';
  const text = event.text?.trim() || event.kind;
  if (event.kind === 'damageDc' || event.kind === 'healDc') {
    const pool = event.dataCenter === 'backup' ? 'Backup' : 'Primary';
    const who = event.player === undefined ? '' : `P${event.player} `;
    const span =
      event.before !== undefined && event.after !== undefined
        ? `${event.before} → ${event.after}`
        : formatFxDelta(event) ?? '';
    return `${source} · ${text} · ${who}${pool} · ${span}`.replace(/ · $/u, '');
  }
  if (event.kind === 'chance') {
    const from = event.fromNode !== undefined ? `N${event.fromNode + 1}` : 'Node';
    const to = event.toNode !== undefined ? `N${event.toNode + 1}` : 'Node';
    return `${source} · ${text} · ${from} → ${to}`;
  }
  const delta = formatFxDelta(event);
  return delta ? `${source} · ${text} · ${delta}` : `${source} · ${text}`;
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
  if (event.kind === 'draw') return `+${amount} Cards`;
  if (event.kind === 'actions') return amount === 1 ? '+1 Action' : `+${amount} Actions`;
  return null;
}
