import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { sanitizeSelfPlayRules, type SelfPlayRules } from '@0uroboros/engine/ai/selfPlay';

/**
 * The game client's VP and Circuit reward defaults, taken from a League epoch. Bundled into the client build
 * (`content/client-rules.json`), so static deploys pick it up; Circuit mode and timers stay player choices.
 */
export type ClientRules = Pick<SelfPlayRules, 'serverVP' | 'nodeWinVP' | 'mostCircuitsBonusVP' | 'endGameAwards' | 'noCircuitRewards' | 'noTrailingRewards'>;
export type ClientRulesFile = { appliedAt: string | null; epochId: number | null; rules: ClientRules | null };

export function clientRulesFor(epochId: number, rules: SelfPlayRules, appliedAt: string): ClientRulesFile {
  const { serverVP, nodeWinVP, mostCircuitsBonusVP, endGameAwards, noCircuitRewards, noTrailingRewards } = sanitizeSelfPlayRules(rules);
  return { appliedAt, epochId, rules: { serverVP, nodeWinVP, mostCircuitsBonusVP, endGameAwards, noCircuitRewards, noTrailingRewards } };
}

export function createClientRulesStore(file: string) {
  return {
    file,
    /** Last apply only; `{ appliedAt: null, epochId: null }` when never applied or unreadable. */
    applied(): { appliedAt: string | null; epochId: number | null } {
      try {
        const stored = JSON.parse(readFileSync(file, 'utf8')) as Partial<ClientRulesFile>;
        return { appliedAt: typeof stored.appliedAt === 'string' ? stored.appliedAt : null, epochId: typeof stored.epochId === 'number' ? stored.epochId : null };
      } catch { return { appliedAt: null, epochId: null }; }
    },
    async write(value: ClientRulesFile) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); },
  };
}
