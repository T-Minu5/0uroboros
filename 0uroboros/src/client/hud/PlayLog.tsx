/**
 * Compact public log. Comprehension aid, not a second rules engine.
 */

import type { LogEntry } from '../../game/types';

export function PlayLog({ entries }: { entries: LogEntry[] }) {
  const recent = entries.slice(-4);
  return (
    <aside className="playlog" aria-label="Game log">
      <div className="playlog__title">Log</div>
      {recent.length === 0 ? (
        <div className="playlog__empty">No events yet</div>
      ) : (
        <ol className="playlog__list">
          {recent.map((entry) => (
            <li key={entry.seq}>
              <span className="playlog__kind">{entry.kind}</span>
              <span>{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
