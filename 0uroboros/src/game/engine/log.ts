/**
 * Game log.
 *
 * The log must be sufficient to reconstruct why a match reached its current
 * state, so playtesters never reverse-engineer state from animations.
 */

import type { LogEntryKind, OuroborosState } from '../types';

export function addLog(
  state: OuroborosState,
  kind: LogEntryKind,
  message: string,
): void {
  state.logSeq += 1;
  state.log.push({
    seq: state.logSeq,
    kind,
    message,
    cycle: state.cycle,
    turn: state.turn,
  });
}
