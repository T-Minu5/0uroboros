import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import authored from '../content/authored-content.json';
import { applyCardPatch, runContentAb } from '../packages/engine/src/ai/contentAb';
import { compileForSelfPlay, playSelfPlayGame } from '../packages/engine/src/ai/selfPlay';
import { DEFAULT_STRATEGY } from '../packages/engine/src/ai/strategy';
import type { ContentDocument } from '../packages/engine/src/authoring/contentModel';
import { scoreCard } from '../packages/engine/src/authoring/cardBudget';
import { TARGET_BOTH_DESTROYED_RATE } from '../server/agents/ecoMetrics';
import { enrichDemandWithBudget } from '../server/agents/ecoBudgetJoin';
import { cardDemand } from '../server/agents/ecoMetrics';
import type { BudgetCard } from '../packages/engine/src/authoring/cardBudget';
import { createEcoStrat } from '../server/agents/ecoStrat';
import { runContentAbExperiment } from '../server/agents/contentAbRunner';

const document = (authored as unknown as { document: ContentDocument }).document;
const harness = {
  compileForSelfPlay,
  playSelfPlayGame,
};

describe('TARGET_BOTH_DESTROYED_RATE', () => {
  it('is a 40% floor for mutual enemy Server kills', () => {
    expect(TARGET_BOTH_DESTROYED_RATE).toBe(0.4);
  });
});

describe('applyCardPatch', () => {
  it('keeps definitionId and applies field changes', () => {
    const patched = applyCardPatch(document, {
      definitionId: 'byte-coin',
      changes: { cost: 99, enabled: false },
    });
    const card = patched.cards.find(entry => (entry.definitionId ?? entry.id) === 'byte-coin');
    expect(card?.cost).toBe(99);
    expect(card?.enabled).toBe(false);
    expect(card?.definitionId ?? card?.id).toBe('byte-coin');
    const original = document.cards.find(entry => (entry.definitionId ?? entry.id) === 'byte-coin');
    expect(original?.cost).not.toBe(99);
  });
});

describe('runContentAb', () => {
  it('plays paired control vs patch seeds and returns arm stats', () => {
    const patch = applyCardPatch(document, {
      definitionId: 'slash-dot',
      changes: { cost: 20 },
    });
    const report = runContentAb({
      control: document,
      patch,
      strategy: DEFAULT_STRATEGY,
      seeds: [5101],
      harness,
      cardId: 'slash-dot',
      recordDecisions: true,
    });
    expect(report.games).toHaveLength(2);
    expect(report.games.map(game => game.arm).sort()).toEqual(['control', 'patch']);
    expect(report.control.invalid + report.patch.invalid).toBeLessThan(2);
    const controlBuys = report.games.find(game => game.arm === 'control')?.result.report?.purchases
      .filter(item => item.definitionId === 'slash-dot').length ?? 0;
    const patchBuys = report.games.find(game => game.arm === 'patch')?.result.report?.purchases
      .filter(item => item.definitionId === 'slash-dot').length ?? 0;
    // Cost 20 makes Slash-Dot effectively unaffordable under normal wallets.
    expect(patchBuys).toBeLessThanOrEqual(controlBuys);
  }, 60_000);
});

describe('enrichDemandWithBudget', () => {
  it('joins scoreCard E onto demand by definitionId and surfaces soft flags', () => {
    const content = compileForSelfPlay(document);
    const result = playSelfPlayGame({ content, seed: 5201, strategy: DEFAULT_STRATEGY, recordDecisions: true });
    expect(result.report).toBeTruthy();
    const catalog = document.cards as unknown as BudgetCard[];
    const demand = cardDemand([{ id: 'g', report: result.report! }], catalog.map(card => ({
      id: card.definitionId ?? card.id,
      name: card.name,
      cost: card.cost ?? 0,
      pool: (card as { pool?: string }).pool ?? 'Base',
    })));
    const rows = enrichDemandWithBudget(catalog, demand, 0.5);
    const night = rows.find(row => row.definitionId === 'night-scythe');
    if (night) {
      const scored = scoreCard(catalog.find(card => (card.definitionId ?? card.id) === 'night-scythe')!);
      expect(night.efficiency).toBe(scored.efficiency);
      expect(night.softCount).toBe(scored.soft.length);
      if (scored.soft.length) expect(['soft-only', 'high-E-high-win', 'high-E-low-pick', 'low-E-high-pick', null]).toContain(night.flag);
    }
    const crypto = rows.find(row => row.definitionId === 'byte-coin');
    if (crypto) {
      const scored = scoreCard(catalog.find(card => (card.definitionId ?? card.id) === 'byte-coin')!);
      expect(crypto.efficiency).toBe(scored.efficiency);
    }
  }, 30_000);
});

describe('contentAbRunner + Eco arms', () => {
  it('tags cohorts with arm metadata and writes an arm-compare report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'content-ab-'));
    await mkdir(join(root, 'content'), { recursive: true });
    await writeFile(join(root, 'content/authored-content.json'), JSON.stringify(authored));
    await mkdir(join(root, 'ai-strategist'), { recursive: true });
    await writeFile(join(root, 'ai-strategist/memory.json'), JSON.stringify({
      schema: 1, version: 1, mode: 'heuristic', plan: 'test', profile: DEFAULT_STRATEGY, theories: [],
    }));
    const eco = createEcoStrat({
      root: join(root, 'ai-agents/eco-strat'),
      projectRoot: root,
      stratGRoot: join(root, 'ai-strategist'),
      log: () => undefined,
      loadFacts: async () => ({ cards: [], locations: [], circuitRewards: [], startingDeck: [] }),
      settings: () => ({ active: true, observeHumanGames: false, continuous: false, reportEvery: 99, baselineGames: 2 }),
    });
    await eco.load();
    const result = await runContentAbExperiment({
      eco,
      harness: async () => ({ compileForSelfPlay, playSelfPlayGame }),
      control: async () => document,
      patch: { definitionId: 'slash-dot', changes: { cost: 20 } },
      stratG: { profile: DEFAULT_STRATEGY, version: 1, mode: 'heuristic', plan: 'test' },
      seedCount: 1,
      seedBase: 5301,
      experimentId: 'test-cab-slash',
    });
    expect(result.status).toBe('complete');
    expect(result.controlCohortId).toBeTruthy();
    expect(result.patchCohortId).toBeTruthy();
    const journal = eco.journal();
    const control = journal.cohorts.find(cohort => cohort.id === result.controlCohortId);
    const patch = journal.cohorts.find(cohort => cohort.id === result.patchCohortId);
    expect(control?.arm?.role).toBe('control');
    expect(patch?.arm?.role).toBe('patch');
    expect(control?.arm?.cardId).toBe('slash-dot');
    expect(control?.arm?.experimentId).toBe('test-cab-slash');
    expect(result.compare?.arms.experimentId).toBe('test-cab-slash');
    expect(result.compare?.arms.cardId).toBe('slash-dot');
    expect(journal.reports.some(report => report.id.includes('ab'))).toBe(true);
  }, 90_000);
});
