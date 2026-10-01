import { createContext, createElement, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { ServerValues } from './ServerLights';

export const SERVER_MAX = { primary: 2000, backup: 1500 } as const;
/** Scene-wide exposure, applied linearly before tone mapping; backdrop art divides it back out so only lighting dims. */
export const BOARD_EXPOSURE = 0.85;
export const LIGHT_PULSE_S = 1.5;
export const RESTORE_PULSE_S = 2.2;
export const pulseDuration = (kind: 'drain' | 'restore') => (kind === 'restore' ? RESTORE_PULSE_S : LIGHT_PULSE_S);

export type LightingPulse = {
  id: number;
  owner: number;
  target: 'primary' | 'backup';
  kind: 'drain' | 'restore';
  /** Seconds on the `performance.now()` clock. */
  startedAt: number;
};

export type LightingAward = { node: number; startedAt: number };

/**
 * Mutable, per-frame lighting state. Read it inside `useFrame` — it never triggers React renders.
 * `sideHealth[owner]` is combined primary+backup integrity, 0..1. Owner 0 = local (near), 1 = opponent (far).
 */
export type BoardLightingState = {
  sideHealth: [number, number];
  centerHealth: [Record<'primary' | 'backup', number>, Record<'primary' | 'backup', number>];
  pulse: LightingPulse | null;
  award: LightingAward | null;
};

export const lightingNow = () => performance.now() / 1000;

/** 0..1 envelope for a pulse: fast attack, eased decay; 0 once `duration` has elapsed. */
export function pulseEnvelope(startedAt: number | undefined, now = lightingNow(), duration = LIGHT_PULSE_S): number {
  if (startedAt === undefined) return 0;
  const t = (now - startedAt) / duration;
  if (t < 0 || t >= 1) return 0;
  const attack = Math.min(1, t / 0.12);
  const decay = 1 - Math.pow(Math.max(0, t - 0.12) / 0.88, 1.6);
  return attack * decay;
}

const BoardLightingContext = createContext<{ current: BoardLightingState } | null>(null);

type EffectLike = { id: number; kind: string; target?: string; targetOwner?: number; player?: number } | null | undefined;

function sideHealthOf(server: ServerValues) {
  return (Math.max(0, server.primary) + Math.max(0, server.backup)) / (SERVER_MAX.primary + SERVER_MAX.backup);
}

export function BoardLightingProvider({
  servers,
  effect,
  awardNode,
  children,
}: {
  servers: [ServerValues, ServerValues];
  effect: EffectLike;
  awardNode: number | null;
  children: ReactNode;
}) {
  const state = useRef<BoardLightingState>({
    sideHealth: [sideHealthOf(servers[0]), sideHealthOf(servers[1])],
    centerHealth: [
      { primary: servers[0].primary / SERVER_MAX.primary, backup: servers[0].backup / SERVER_MAX.backup },
      { primary: servers[1].primary / SERVER_MAX.primary, backup: servers[1].backup / SERVER_MAX.backup },
    ],
    pulse: null,
    award: null,
  });

  useEffect(() => {
    const s = state.current;
    s.sideHealth = [sideHealthOf(servers[0]), sideHealthOf(servers[1])];
    s.centerHealth = [
      { primary: servers[0].primary / SERVER_MAX.primary, backup: servers[0].backup / SERVER_MAX.backup },
      { primary: servers[1].primary / SERVER_MAX.primary, backup: servers[1].backup / SERVER_MAX.backup },
    ];
  }, [servers[0].primary, servers[0].backup, servers[1].primary, servers[1].backup]);

  useEffect(() => {
    if (!effect || (effect.kind !== 'drain' && effect.kind !== 'restore')) return;
    if (effect.target !== 'primary' && effect.target !== 'backup') return;
    const owner = effect.targetOwner ?? effect.player ?? 0;
    state.current.pulse = { id: effect.id, owner, target: effect.target, kind: effect.kind, startedAt: lightingNow() };
  }, [effect?.id, effect?.kind]);

  useEffect(() => {
    state.current.award = awardNode === null ? null : { node: awardNode, startedAt: lightingNow() };
  }, [awardNode]);

  useEffect(() => {
    if (!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) return;
    const w = window as unknown as { __boardLighting?: unknown };
    w.__boardLighting = {
      state: state.current,
      drain: (owner = 0, target: 'primary' | 'backup' = 'primary') =>
        (state.current.pulse = { id: Date.now(), owner, target, kind: 'drain', startedAt: lightingNow() }),
      restore: (owner = 0, target: 'primary' | 'backup' = 'primary') =>
        (state.current.pulse = { id: Date.now(), owner, target, kind: 'restore', startedAt: lightingNow() }),
      award: (node = 2) => (state.current.award = { node, startedAt: lightingNow() }),
      clearAward: () => (state.current.award = null),
      health: (owner: number, primary: number, backup: number) => {
        state.current.centerHealth[owner] = { primary, backup };
        state.current.sideHealth[owner] = (primary * SERVER_MAX.primary + backup * SERVER_MAX.backup) / (SERVER_MAX.primary + SERVER_MAX.backup);
      },
    };
    return () => {
      delete w.__boardLighting;
    };
  }, []);

  const value = useMemo(() => state, []);
  return createElement(BoardLightingContext.Provider, { value }, children);
}

/** Returns the live lighting ref. Outside a provider it returns a static full-health state. */
export function useBoardLighting(): { current: BoardLightingState } {
  const ctx = useContext(BoardLightingContext);
  const fallback = useRef<BoardLightingState>({
    sideHealth: [1, 1],
    centerHealth: [{ primary: 1, backup: 1 }, { primary: 1, backup: 1 }],
    pulse: null,
    award: null,
  });
  return ctx ?? fallback;
}
