import { useEffect, useState, type FormEvent } from 'react';
import type { LobbyState, SavedSeat } from './OnlineClient';
import type { RoomMode } from '@0uroboros/protocol/messages';
import { platform, type Session } from '../platform';
import { Icon } from '../BoardScene';
import { PlayerAvatarPicker } from '../PlayerAvatarPicker';

const NAME_KEY = 'ouroboros.playerName';

/** The signed-in account name, else the name last typed into the lobby; empty when neither exists. */
export function savedPlayerName(): string {
  const host = platform();
  return (host.auth.session()?.account.name ?? host.storage.get(NAME_KEY) ?? '').trim();
}

type Props = {
  lobby: LobbyState;
  saved: SavedSeat | null;
  turnSeconds: number | null;
  onCreate: (mode: RoomMode, name: string) => void;
  onQuickMatch: (name: string) => void;
  onCancelQuickMatch: () => void;
  onJoin: (code: string, name: string) => void;
  onResume: (saved: SavedSeat) => void;
  onLeave: () => void;
  disabled?: boolean;
};

/** The setup card's online section: optional account status, quick match, create/join a friend table. */
export function OnlineLobby({ lobby, saved, turnSeconds, onCreate, onQuickMatch, onCancelQuickMatch, onJoin, onResume, onLeave, disabled }: Props) {
  const host = platform();
  const [session, setSession] = useState<Session | null>(() => host.auth.session());
  const [name, setName] = useState(() => host.auth.session()?.account.name ?? host.storage.get(NAME_KEY) ?? '');
  const [code, setCode] = useState('');
  const [authNote, setAuthNote] = useState<string | null>(null);

  useEffect(() => host.auth.onChange(next => { setSession(next); if (next) setName(next.account.name); }), [host]);

  const ready = name.trim().length > 0 && !disabled && lobby.connection !== 'reconnecting';
  const keepName = (value: string) => { setName(value); host.storage.set(NAME_KEY, value); };
  /** A signed-in player's name lives on the account; the server seats them under it, so push edits there. */
  const commitName = async () => {
    const value = name.trim();
    if (!session || !value || value === session.account.name) return;
    try { await host.auth.rename(value); } catch (error) { setAuthNote(error instanceof Error ? error.message : 'Could not rename.'); }
  };
  const join = (event: FormEvent) => { event.preventDefault(); if (ready && code.trim()) onJoin(code, name.trim()); };
  const signOut = async () => { await host.auth.signOut(); setAuthNote(null); };

  if (lobby.status === 'queued' && lobby.queue) {
    return <section className='online-lobby' aria-label='Quick match' data-online-status='queued'>
      <small>QUICK MATCH</small>
      <p role='status'>Looking for an opponent near {lobby.queue.rating} (±{lobby.queue.window}){lobby.queue.waiting > 1 ? `, ${lobby.queue.waiting} in the queue` : ''}…</p>
      <button type='button' onClick={onCancelQuickMatch}>Cancel</button>
    </section>;
  }
  if (lobby.status === 'waiting' && lobby.code) {
    return <section className='online-lobby' aria-label='Online table' data-online-status='waiting'>
      <small>ONLINE TABLE</small>
      <div className='online-code'><span>Invite code</span><b data-room-code={lobby.code}>{lobby.code}</b></div>
      <p>Share the code. The game starts when your friend joins.{turnSeconds ? ` Turns of ${turnSeconds} s.` : ''}</p>
      <button type='button' onClick={onLeave}>Leave table</button>
    </section>;
  }
  return <section className='online-lobby' aria-label='Play online' data-online-status={lobby.status}>
    <small>PLAY ONLINE</small>
    <div className='online-identity'>
      <PlayerAvatarPicker disabled={disabled}/>
      <div className='online-identity-fields'>
        <label className='online-field'><span>Your name</span><input value={name} maxLength={24} placeholder='Name at the table' onChange={event => keepName(event.target.value)} onBlur={() => void commitName()} disabled={disabled}/></label>
        <button type='button' className='primary-button' disabled={!ready} onClick={() => onQuickMatch(name.trim())}>
          <Icon name='actions'/><span>Quick match</span><span>↗</span>
        </button>
      </div>
    </div>
    <div className='online-actions'>
      <div className='online-table-row'>
        <button type='button' disabled={!ready} onClick={() => onCreate('pvp', name.trim())}>Create table</button>
        <form className='online-join' onSubmit={join}>
          <input value={code} maxLength={8} placeholder='Invite code' aria-label='Invite code' onChange={event => setCode(event.target.value.toUpperCase())} disabled={disabled}/>
          <button type='submit' disabled={!ready || !code.trim()}>Join</button>
        </form>
      </div>
    </div>
    {saved && lobby.status === 'idle' && <button type='button' className='online-resume' onClick={() => onResume(saved)}>Rejoin table {saved.code}</button>}
    {session && <p className='online-account' data-signed-in={session.account.id}>Signed in as <b>{session.account.name}</b>{session.account.email ? ` (${session.account.email})` : ''}.{lobby.rating ? <> Rating <b data-rating={lobby.rating.elo}>{lobby.rating.elo}</b>{lobby.rating.games < 10 ? ' (provisional)' : ''}, {lobby.rating.wins}–{lobby.rating.losses}{lobby.rating.ties ? `–${lobby.rating.ties}` : ''}.</> : ''} <button type='button' className='online-link' onClick={() => void signOut()}>Sign out</button></p>}
    {authNote && <p className='online-status' role='status'>{authNote}</p>}
    {lobby.status === 'connecting' && <p className='online-status'>Connecting to the game server…</p>}
    {lobby.connection === 'reconnecting' && <p className='online-status'>Reconnecting…</p>}
    {lobby.error && <p role='alert' className='online-error'>{lobby.error}</p>}
  </section>;
}
