/**
 * Player-facing phase. The engine jumps through Wave Collapse into Draft in
 * one hook. Presentation must not show Draft until the Collapse report for
 * the current Cycle has been acknowledged by the presentation queue.
 */

export type DisplayedPhaseKind = 'runtime' | 'reveal' | 'collapse' | 'draft' | 'endgame';

export interface PresentationPhaseInput {
  ctxPhase: string;
  gPhase: string;
  revealDone: boolean;
  collapseSerial: number;
  collapsePresentedSerial: number;
  hasCollapseReport: boolean;
  collapseReportId?: string | null;
  presentedReportComplete?: boolean;
}

/**
 * Collapse theater may start once the engine is in Draft, even if a leftover
 * revealQueue has not been marked played. Those reveals already resolved.
 * Waiting on them hid Draft forever.
 */
export function collapseTheaterReady(
  ctxPhase: string,
  gPhase: string,
  revealDone: boolean,
): boolean {
  if (ctxPhase === 'draft' || gPhase === 'endgame') return true;
  return revealDone && (gPhase === 'waveCollapse' || ctxPhase === 'draft');
}

export function collapseIsBlocking(input: PresentationPhaseInput): boolean {
  const inCollapseContext =
    input.ctxPhase === 'draft' ||
    input.gPhase === 'waveCollapse' ||
    input.gPhase === 'endgame';
  if (!inCollapseContext || !input.hasCollapseReport) return false;
  if (input.presentedReportComplete === false) return true;
  if (input.presentedReportComplete === true) return false;
  return input.collapsePresentedSerial < input.collapseSerial;
}

export function displayedPhaseKind(input: PresentationPhaseInput): DisplayedPhaseKind {
  if (collapseIsBlocking(input)) return 'collapse';
  if (input.gPhase === 'endgame') return 'endgame';
  if (input.ctxPhase === 'draft') return 'draft';
  if (!input.revealDone || input.gPhase === 'reveal') return 'reveal';
  return 'runtime';
}

export function displayedPhaseTitle(kind: DisplayedPhaseKind, turn: number): string {
  if (kind === 'runtime') return `Runtime · Turn ${turn + 1}`;
  if (kind === 'reveal') return `Runtime · Reveal`;
  if (kind === 'collapse') return 'Wave Collapse';
  if (kind === 'draft') return 'Draft';
  return 'Endgame';
}

export function displayedPhaseSubtitle(
  kind: DisplayedPhaseKind,
  cycle: number,
  turn: number,
  windowCount: number,
): string {
  if (kind === 'runtime' || kind === 'reveal') {
    return `Cycle ${cycle} · Window ${turn + 1} of ${windowCount}`;
  }
  return `Cycle ${cycle}`;
}
