import { useState, type FormEvent } from 'react';
import type { LobbyState, SavedSeat } from './OnlineClient';
import type { RoomMode } from '@0uroboros/protocol/messages';

const NAME_KEY = 'ouroboros.playerName';

type Props = {
  lobby: LobbyState;
  saved: SavedSeat | null;
  turnSeconds: number | null;
  onCreate: (mode: RoomMode, name: string) => void;
  onJoin: (code: string, name: string) => void;
  onResume: (saved: SavedSeat) => void;
  onLeave: () => void;
  disabled?: boolean;
};

/** The setup card's online section: create a table for a friend, join one by code, or play the server's AI. */
export function OnlineLobby({ lobby, saved, turnSeconds, onCreate, onJoin, onResume, onLeave, disabled }: Props) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [code, setCode] = useState('');
  const ready = name.trim().length > 0 && !disabled && lobby.connection !== 'reconnecting';
  const keepName = (value: string) => { setName(value); localStorage.setItem(NAME_KEY, value); };
  const join = (event: FormEvent) => { event.preventDefault(); if (ready && code.trim()) onJoin(code, name.trim()); };

  if (lobby.status === 'waiting' && lobby.code) {
    return <section className='online-lobby' aria-label='Online table' data-online-status='waiting'>
      <small>ONLINE TABLE</small>
      <div className='online-code'><span>Invite code</span><b data-room-code={lobby.code}>{lobby.code}</b></div>
      <p>{lobby.mode === 'ai' ? 'Seating the server AI…' : 'Share the code. The game starts when your friend joins.'}{turnSeconds ? ` Turns of ${turnSeconds} s.` : ''}</p>
      <button type='button' onClick={onLeave}>Leave table</button>
    </section>;
  }
  return <section className='online-lobby' aria-label='Play online' data-online-status={lobby.status}>
    <small>PLAY ONLINE</small>
    <label className='online-field'><span>Your name</span><input value={name} maxLength={24} placeholder='Name at the table' onChange={event => keepName(event.target.value)} disabled={disabled}/></label>
    <div className='online-actions'>
      <button type='button' disabled={!ready} onClick={() => onCreate('pvp', name.trim())}>Create table</button>
      <button type='button' disabled={!ready} onClick={() => onCreate('ai', name.trim())}>Play the server AI</button>
      <form className='online-join' onSubmit={join}>
        <input value={code} maxLength={8} placeholder='Invite code' aria-label='Invite code' onChange={event => setCode(event.target.value.toUpperCase())} disabled={disabled}/>
        <button type='submit' disabled={!ready || !code.trim()}>Join</button>
      </form>
    </div>
    {saved && lobby.status === 'idle' && <button type='button' className='online-resume' onClick={() => onResume(saved)}>Rejoin table {saved.code}</button>}
    {lobby.status === 'connecting' && <p className='online-status'>Connecting to the game server…</p>}
    {lobby.connection === 'reconnecting' && <p className='online-status'>Reconnecting…</p>}
    {lobby.error && <p role='alert' className='online-error'>{lobby.error}</p>}
  </section>;
}
