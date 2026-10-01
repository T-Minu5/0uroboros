/**
 * Playtest shell.
 *
 * Phase 1 runs two seats through boardgame.io `Local()` in one browser. Each seat
 * is a separate client with its own `playerID`, so `playerView` filters state per
 * seat exactly as a remote server would. Moving to remote multiplayer means
 * swapping `Local()` for `SocketIO()`; nothing here encodes the transport choice
 * beyond this file.
 *
 * Two viewing modes exist because they serve different purposes. Hot seat hides
 * the opponent, which is how the game is actually played. Split view shows both
 * seats at once, which is how hidden-information bugs get found.
 */

import { useMemo, useState } from 'react';
import { setPresentationSpeed, usePresentationSpeed } from './presentation/speed';
import { Client } from 'boardgame.io/react';
import { Local } from 'boardgame.io/multiplayer';

import { OuroborosGame } from '../game/OuroborosGame';
import { GameTable } from './GameTable';
import type { PlayerID } from '../game/types';
import './styles.css';

const OuroborosClient = Client({
  game: OuroborosGame,
  board: GameTable,
  numPlayers: 2,
  multiplayer: Local(),
  debug: false,
});

export function App() {
  const [seat, setSeat] = useState<PlayerID>('0');
  const [split, setSplit] = useState(false);
  const [matchNonce, setMatchNonce] = useState(0);
  const speed = usePresentationSpeed();

  const seats: PlayerID[] = useMemo(() => (split ? ['0', '1'] : [seat]), [split, seat]);
  const matchID = `playtest-${matchNonce}`;

  return (
    <div className="shell">
      <header className="shell__bar">
        <h1 className="shell__brand">
          0<span>uroboros</span>
        </h1>

        {!split ? (
          <div className="seat-tabs" role="tablist" aria-label="Active seat">
            {(['0', '1'] as PlayerID[]).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                data-seat={id}
                data-active={seat === id}
                aria-selected={seat === id}
                onClick={() => setSeat(id)}
              >
                Player {id}
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="toggle"
          data-on={split}
          onClick={() => setSplit((value) => !value)}
        >
          {split ? 'Hot seat' : 'Split view'}
        </button>
        <button type="button" className="toggle" onClick={() => setMatchNonce((value) => value + 1)}>
          New match
        </button>
        <button
          type="button"
          className="toggle"
          data-on={speed === 'fast'}
          onClick={() => setPresentationSpeed(speed === 'fast' ? 'normal' : 'fast')}
        >
          {speed === 'fast' ? 'Pace Fast' : 'Pace Normal'}
        </button>
      </header>

      <div className="seats" data-split={split}>
        {seats.map((id) => (
          <OuroborosClient key={`${matchID}-${id}`} playerID={id} matchID={matchID} />
        ))}
      </div>
    </div>
  );
}
