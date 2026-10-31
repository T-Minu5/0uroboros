/**
 * Content A/B Monte Carlo: paired same-seed self-play of a control document vs a patched
 * document under a frozen strategy. Global content patches (both seats see the same pack).
 */
import type { MatchReport } from '../runtime';
import type { AuthoredCard, CompiledContent, ContentDocument } from '../authoring/contentModel';
import type { StrategyProfile } from './strategy';
import type { SelfPlayResult } from './selfPlay';

export type CardPatch = {
  definitionId: string;
  /** Fields merged onto the matching authored card (same definitionId kept). */
  changes: Partial<AuthoredCard>;
};

export type ContentAbHarness = {
  compileForSelfPlay: (document: ContentDocument) => CompiledContent;
  playSelfPlayGame: (options: {
    content: CompiledContent;
    seed: number;
    strategy: StrategyProfile;
    recordDecisions?: boolean;
  }) => SelfPlayResult;
};

export type ContentAbArmStats = {
  wins: number;
  losses: number;
  ties: number;
  invalid: number;
  meanMargin: number;
};

export type ContentAbGame = {
  seed: number;
  arm: 'control' | 'patch';
  result: SelfPlayResult;
};

export type ContentAbReport = {
  seeds: number[];
  cardId: string;
  control: ContentAbArmStats;
  patch: ContentAbArmStats;
  /** Patch arm share of paired decided outcomes favoring patch (seat-0 margin/win). */
  patchWinRate: number | null;
  pairedDecided: number;
  games: ContentAbGame[];
};

/** VP lead + Server lead (250 Server points ≈ 1 VP) from seat 0's side. */
export function contentAbMargin(report: MatchReport, seat: 0 | 1 = 0): number {
  const other = (1 - seat) as 0 | 1;
  return report.finalVP[seat] - report.finalVP[other] + (report.servers[seat] - report.servers[other]) / 250;
}

function cardKey(card: Pick<AuthoredCard, 'id' | 'definitionId'>) {
  return card.definitionId ?? card.id;
}

/** Clone `doc` and merge `changes` onto the card with matching definitionId (or id). */
export function applyCardPatch(doc: ContentDocument, patch: CardPatch): ContentDocument {
  const next = structuredClone(doc);
  const card = next.cards.find(entry => cardKey(entry) === patch.definitionId);
  if (!card) throw new Error(`applyCardPatch: no card ${patch.definitionId}`);
  Object.assign(card, patch.changes);
  // Keep the join key stable for purchase/telemetry.
  if (card.definitionId) card.definitionId = patch.definitionId;
  else card.id = patch.definitionId;
  return next;
}

function emptyArm(): ContentAbArmStats {
  return { wins: 0, losses: 0, ties: 0, invalid: 0, meanMargin: 0 };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/**
 * Play control and patch once per seed under the same frozen strategy.
 * Outcomes are from seat 0's perspective (symmetric content; absolute winner rates still comparable).
 */
export function runContentAb(options: {
  control: ContentDocument;
  patch: ContentDocument;
  strategy: StrategyProfile;
  seeds: number[];
  harness: ContentAbHarness;
  cardId: string;
  recordDecisions?: boolean;
}): ContentAbReport {
  const strategy = Object.freeze(structuredClone(options.strategy));
  const controlContent = options.harness.compileForSelfPlay(structuredClone(options.control));
  const patchContent = options.harness.compileForSelfPlay(structuredClone(options.patch));
  const recordDecisions = options.recordDecisions ?? true;
  const games: ContentAbGame[] = [];
  const control = emptyArm();
  const patch = emptyArm();
  let controlMarginSum = 0;
  let patchMarginSum = 0;
  let controlValid = 0;
  let patchValid = 0;
  let patchWinsPaired = 0;
  let controlWinsPaired = 0;
  let pairedDecided = 0;

  for (const seed of options.seeds) {
    const controlResult = options.harness.playSelfPlayGame({
      content: controlContent,
      seed,
      strategy: structuredClone(strategy),
      recordDecisions,
    });
    const patchResult = options.harness.playSelfPlayGame({
      content: patchContent,
      seed,
      strategy: structuredClone(strategy),
      recordDecisions,
    });
    games.push({ seed, arm: 'control', result: controlResult }, { seed, arm: 'patch', result: patchResult });

    const tally = (arm: ContentAbArmStats, result: SelfPlayResult, which: 'control' | 'patch') => {
      if (!result.valid || !result.report) {
        arm.invalid++;
        return;
      }
      if (which === 'control') {
        controlValid++;
        controlMarginSum += contentAbMargin(result.report, 0);
      } else {
        patchValid++;
        patchMarginSum += contentAbMargin(result.report, 0);
      }
      if (result.report.winner === 0) arm.wins++;
      else if (result.report.winner === 1) arm.losses++;
      else arm.ties++;
    };
    tally(control, controlResult, 'control');
    tally(patch, patchResult, 'patch');

    if (controlResult.valid && patchResult.valid && controlResult.report && patchResult.report) {
      const cWinner = controlResult.report.winner;
      const pWinner = patchResult.report.winner;
      // Paired compare: did seat 0 win more often under the patch pack?
      if (cWinner !== null && pWinner !== null) {
        pairedDecided++;
        if (pWinner === 0 && cWinner !== 0) patchWinsPaired++;
        else if (cWinner === 0 && pWinner !== 0) controlWinsPaired++;
        else if (pWinner === 0 && cWinner === 0) {
          /* both seat0 — compare margins */
          const cM = contentAbMargin(controlResult.report, 0);
          const pM = contentAbMargin(patchResult.report, 0);
          if (pM > cM) patchWinsPaired++;
          else if (cM > pM) controlWinsPaired++;
        }
      } else if (pWinner === 0 && cWinner !== 0) {
        pairedDecided++;
        patchWinsPaired++;
      } else if (cWinner === 0 && pWinner !== 0) {
        pairedDecided++;
        controlWinsPaired++;
      }
    }
  }

  const decidedPair = patchWinsPaired + controlWinsPaired;
  return {
    seeds: [...options.seeds],
    cardId: options.cardId,
    control: { ...control, meanMargin: controlValid ? round1(controlMarginSum / controlValid) : 0 },
    patch: { ...patch, meanMargin: patchValid ? round1(patchMarginSum / patchValid) : 0 },
    patchWinRate: decidedPair ? patchWinsPaired / decidedPair : null,
    pairedDecided: decidedPair,
    games,
  };
}
