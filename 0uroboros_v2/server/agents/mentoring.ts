import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sanitizeProfile, type StrategyProfile, type StrategyWeights } from '../../src/ai/strategy';
import type { ProfileChange } from '../aiStrategist';
import { clampToEnvelope, type LeagueAgentId, type StyleEnvelope } from './roster';

/**
 * Mentoring: the designer asks VP-Dog and DV-8 for their top tips on engines and economy, and hands them to
 * T-5 and Strat-G. This is the one deliberate channel between agents, and it runs through the designer: tips
 * become part of the recipient's protected baseline (playbook line plus profile change), never its learning.
 * Each change moves the recipient only part of the way toward the mentor's value and is clamped into the
 * recipient's style envelope, so T-5 stays an aggression deck and Strat-G stays balanced.
 */

export type Tip = { rank: number; text: string; change: ProfileChange };
export type MentorId = Extract<LeagueAgentId, 'vp-dog' | 'dv-8'>;
export type RecipientId = Extract<LeagueAgentId, 't-5' | 'strat-g'>;
export type AppliedTip = { from: MentorId; fromName: string; rank: number; text: string; change: ProfileChange; limited: boolean };
export type MentorTips = { name: string; label: string | null; mode: 'llm' | 'heuristic'; tips: Tip[] };
export type RecipientTips = { tips: AppliedTip[]; change: ProfileChange };
export type MentoringStore = {
  schema: 1; askedAt: string;
  mentors: Record<MentorId, MentorTips>;
  recipients: Record<RecipientId, RecipientTips>;
};
/** What a recipient's baseline takes from the hand-off. */
export type BaselineTips = { change: ProfileChange; lines: string[] };

export const MENTORS: readonly MentorId[] = ['vp-dog', 'dv-8'];
export const TIPS_PER_MENTOR = 3;
/** T-5 gets every tip; Strat-G gets each mentor's top two. */
export const ASSIGNMENTS: Record<RecipientId, number> = { 't-5': 3, 'strat-g': 2 };

const SCALARS = ['economyUntilCycle', 'chaosFromCycle', 'vpFromCycle', 'handCryptoTarget', 'minBuyScore', 'dilution'] as const;
const STEP: Record<(typeof SCALARS)[number], number> = { economyUntilCycle: 2, chaosFromCycle: 2, vpFromCycle: 2, handCryptoTarget: 2, minBuyScore: 0.3, dilution: 0.2 };
const WEIGHT_SHARE = 0.4, BIAS_STEP = 3;
const round = (value: number) => Math.round(value * 100) / 100;
const nudge = (current: number, target: number, step: number) => current + Math.max(-step, Math.min(step, target - current));

export function diffProfiles(from: StrategyProfile, to: StrategyProfile): ProfileChange {
  const change: ProfileChange = {};
  for (const field of SCALARS) if (to[field] !== from[field]) change[field] = to[field];
  for (const key of Object.keys(to.weights) as (keyof StrategyWeights)[]) if (to.weights[key] !== from.weights[key]) (change.weights ??= {})[key] = to.weights[key];
  for (const id of new Set([...Object.keys(from.cardBias), ...Object.keys(to.cardBias)])) if ((to.cardBias[id] ?? 0) !== (from.cardBias[id] ?? 0)) (change.cardBias ??= {})[id] = to.cardBias[id] ?? 0;
  return change;
}
export const emptyChange = (change: ProfileChange) => !SCALARS.some(field => change[field] !== undefined) && !Object.keys(change.weights ?? {}).length && !Object.keys(change.cardBias ?? {}).length;

/** Applies absolute values over a profile (the same shape experiments use). */
export function withChange(base: StrategyProfile, change: ProfileChange): StrategyProfile {
  const scalars: Partial<StrategyProfile> = {};
  for (const field of SCALARS) if (typeof change[field] === 'number') scalars[field] = change[field];
  return sanitizeProfile({ ...base, ...scalars, minCryptoValue: base.minCryptoValue, weights: { ...base.weights, ...(change.weights ?? {}) }, cardBias: { ...base.cardBias, ...(change.cardBias ?? {}) } }, base);
}

/**
 * Moves `profile` toward a mentor's values: timing and the Crypto target by at most 2, the buy bar by 0.3,
 * dilution by 0.2, weights by 40% and card biases by 3 points, then clamps into the recipient's envelope.
 */
export function translateTip(profile: StrategyProfile, change: ProfileChange, envelope: StyleEnvelope): { profile: StrategyProfile; change: ProfileChange; limited: boolean } {
  const start = clampToEnvelope(profile, envelope);
  const target = { ...start, weights: { ...start.weights }, cardBias: { ...start.cardBias } };
  for (const field of SCALARS) {
    const value = change[field];
    if (typeof value === 'number' && Number.isFinite(value)) target[field] = round(nudge(start[field], value, STEP[field]));
  }
  for (const [key, value] of Object.entries(change.weights ?? {})) {
    if (!(key in start.weights) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    const weight = start.weights[key as keyof StrategyWeights];
    target.weights[key as keyof StrategyWeights] = round(nudge(weight, value, Math.max(0.2, weight * WEIGHT_SHARE)));
  }
  for (const [id, value] of Object.entries(change.cardBias ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) target.cardBias[id] = round(nudge(start.cardBias[id] ?? 0, value, BIAS_STEP));
  }
  const shaped = clampToEnvelope(target, envelope);
  const applied = diffProfiles(start, shaped);
  return { profile: shaped, change: applied, limited: emptyChange(applied) };
}

/** Which tips each recipient gets, best first and alternating mentors: VP-Dog #1, DV-8 #1, VP-Dog #2, ... */
export function assignedTips(mentors: Record<MentorId, MentorTips>, recipient: RecipientId): { from: MentorId; tip: Tip }[] {
  const ranks = ASSIGNMENTS[recipient], picked: { from: MentorId; tip: Tip }[] = [];
  for (let rank = 1; rank <= ranks; rank++) for (const from of MENTORS) {
    const tip = mentors[from]?.tips.find(item => item.rank === rank);
    if (tip) picked.push({ from, tip });
  }
  return picked;
}

/** Translates each recipient's tips against its current best, once, so the stored result is stable across boots. */
export function handOff(mentors: Record<MentorId, MentorTips>, recipients: Record<RecipientId, { profile: StrategyProfile; envelope: StyleEnvelope }>, askedAt = new Date().toISOString()): MentoringStore {
  const translated = {} as Record<RecipientId, RecipientTips>;
  for (const [id, { profile, envelope }] of Object.entries(recipients) as [RecipientId, { profile: StrategyProfile; envelope: StyleEnvelope }][]) {
    const start = clampToEnvelope(profile, envelope);
    let current = start;
    const tips: AppliedTip[] = [];
    for (const { from, tip } of assignedTips(mentors, id)) {
      const step = translateTip(current, tip.change, envelope);
      current = step.profile;
      tips.push({ from, fromName: mentors[from].name, rank: tip.rank, text: tip.text, change: step.change, limited: step.limited });
    }
    translated[id] = { tips, change: diffProfiles(start, current) };
  }
  return { schema: 1, askedAt, mentors, recipients: translated };
}

export function baselineTips(store: MentoringStore | null, recipient: RecipientId): BaselineTips | null {
  const entry = store?.recipients[recipient];
  if (!entry?.tips.length) return null;
  return {
    change: entry.change,
    lines: entry.tips.map(tip => `Tip from ${tip.fromName} (#${tip.rank}): ${tip.text}${tip.limited ? ' (limited by my style: no change to my profile)' : ''}`),
  };
}

export function createMentoringStore(file: string) {
  async function read(): Promise<MentoringStore | null> {
    try {
      const saved = JSON.parse(await readFile(file, 'utf8')) as MentoringStore;
      return saved?.schema === 1 ? saved : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async function write(store: MentoringStore) {
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temp, file);
  }
  return { file, read, write };
}
