import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StrategyProfile, StrategyWeights } from '../../src/ai/strategy';
import type { ProfileChange } from '../aiStrategist';
import { diffProfiles, type BaselineTips } from './mentoring';
import { clampToEnvelope, type LeagueAgentId, type StyleEnvelope } from './roster';

/**
 * Coaching: the designer has Strat-G play a set share closer to its competitors. Like mentoring, it runs through the
 * designer and lands in Strat-G's protected baseline; the competitors never see Strat-G and learn nothing from it.
 * Weights, the Crypto target, the buy bar, dilution and card biases move `share` of the way to the competitors'
 * average current best. Phase timing is not mirrored: Strat-G's three phases stay the designer's.
 */

export const MIRROR_SHARE = 0.25;
const MIRRORED = ['handCryptoTarget', 'minBuyScore', 'dilution'] as const;
const LABEL: Record<(typeof MIRRORED)[number], string> = { handCryptoTarget: 'Crypto target', minBuyScore: 'min buy score', dilution: 'dilution' };

export type Competitor = { id: LeagueAgentId; name: string; version: string; profile: StrategyProfile };
export type CoachingStore = {
  schema: 1; appliedAt: string; share: number;
  competitors: { id: LeagueAgentId; name: string; version: string }[];
  /** Strat-G's current best before coaching, kept so re-applying never compounds the share. */
  start: StrategyProfile;
  change: ProfileChange;
  lines: string[];
};

const round = (value: number) => Math.round(value * 100) / 100;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const toward = (from: number, to: number, share: number) => round(from + share * (to - from));

/** Moves `start` `share` of the way to the competitors' average, clamped to Strat-G's style. */
export function mirrorProfile(start: StrategyProfile, competitors: readonly StrategyProfile[], share: number, envelope: StyleEnvelope): { profile: StrategyProfile; change: ProfileChange } {
  const base = clampToEnvelope(start, envelope);
  if (!competitors.length) return { profile: base, change: {} };
  const target: StrategyProfile = { ...base, weights: { ...base.weights }, cardBias: { ...base.cardBias } };
  for (const field of MIRRORED) target[field] = toward(base[field], mean(competitors.map(profile => profile[field])), share);
  for (const key of Object.keys(base.weights) as (keyof StrategyWeights)[]) target.weights[key] = toward(base.weights[key], mean(competitors.map(profile => profile.weights[key])), share);
  for (const id of new Set(competitors.flatMap(profile => Object.keys(profile.cardBias)))) target.cardBias[id] = toward(base.cardBias[id] ?? 0, mean(competitors.map(profile => profile.cardBias[id] ?? 0)), share);
  const profile = clampToEnvelope(target, envelope);
  return { profile, change: diffProfiles(base, profile) };
}

/** Strat-G's current best with an earlier coaching taken back out, so a fresh mirror starts from its own play. */
export function withoutCoaching(current: StrategyProfile, previous: CoachingStore | null): StrategyProfile {
  if (!previous) return current;
  const start: StrategyProfile = { ...current, weights: { ...current.weights }, cardBias: { ...current.cardBias } };
  const undo = (now: number, was: number, coached: number | undefined) => coached === undefined ? now : round(now - (coached - was));
  for (const field of MIRRORED) start[field] = undo(current[field], previous.start[field], previous.change[field]);
  for (const key of Object.keys(current.weights) as (keyof StrategyWeights)[]) start.weights[key] = undo(current.weights[key], previous.start.weights[key], previous.change.weights?.[key]);
  for (const [id, coached] of Object.entries(previous.change.cardBias ?? {})) start.cardBias[id] = undo(current.cardBias[id] ?? 0, previous.start.cardBias[id] ?? 0, coached);
  return start;
}

function describe(from: StrategyProfile, change: ProfileChange): string {
  const parts = [
    ...MIRRORED.filter(field => change[field] !== undefined).map(field => `${LABEL[field]} ${from[field]}→${change[field]}`),
    ...Object.entries(change.weights ?? {}).map(([key, value]) => `${key} weight ${from.weights[key as keyof StrategyWeights]}→${value}`),
    ...Object.entries(change.cardBias ?? {}).map(([id, value]) => `${id} bias ${from.cardBias[id] ?? 0}→${value}`),
  ];
  return parts.join(', ') || 'no change (already that close)';
}

export function coach(start: StrategyProfile, competitors: readonly Competitor[], envelope: StyleEnvelope, share = MIRROR_SHARE, appliedAt = new Date().toISOString()): CoachingStore {
  const base = clampToEnvelope(start, envelope);
  const { change } = mirrorProfile(base, competitors.map(entry => entry.profile), share, envelope);
  const names = competitors.map(entry => `${entry.name} ${entry.version}`).join(', ');
  return {
    schema: 1, appliedAt, share,
    competitors: competitors.map(({ id, name, version }) => ({ id, name, version })),
    start: base, change,
    lines: [`Coaching from the designer: play ${Math.round(share * 100)}% closer to my competitors (average of ${names}): ${describe(base, change)}. My three phases stay as they are.`],
  };
}

export const coachingTips = (store: CoachingStore | null): BaselineTips | null => store ? { change: store.change, lines: store.lines } : null;

/** Folds several designer hand-offs into one; later ones win on the fields they share. */
export function combineTips(...tips: (BaselineTips | null)[]): BaselineTips | null {
  const present = tips.filter((tip): tip is BaselineTips => !!tip);
  if (!present.length) return null;
  return {
    change: present.reduce<ProfileChange>((all, tip) => ({ ...all, ...tip.change, weights: { ...all.weights, ...tip.change.weights }, cardBias: { ...all.cardBias, ...tip.change.cardBias } }), {}),
    lines: present.flatMap(tip => tip.lines),
  };
}

export function createCoachingStore(file: string) {
  async function read(): Promise<CoachingStore | null> {
    try {
      const saved = JSON.parse(await readFile(file, 'utf8')) as CoachingStore;
      return saved?.schema === 1 ? saved : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async function write(store: CoachingStore) {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temp, file);
  }
  return { file, read, write };
}
