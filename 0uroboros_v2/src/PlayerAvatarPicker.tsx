import { useEffect, useId, useRef, useState } from 'react';
import { cardArtworkPath } from '@0uroboros/engine/cardArtwork';
import { loadPlayerAvatar, savePlayerAvatar, type SeatAvatar } from './seatAvatars';

export type PlayerAvatarOption = {
  id: string;
  name: string;
  art: string;
  focus?: string;
};

/** Fixed landing/online portrait choices (card faces). */
export const PLAYER_AVATAR_OPTIONS: readonly PlayerAvatarOption[] = [
  { id: 'atomic-unit', name: 'Atomic Unit', art: cardArtworkPath({ name: 'Atomic Unit' }), focus: '50% 22%' },
  { id: 'quantum-telemetry', name: 'Quantum Telemetry', art: cardArtworkPath({ name: 'Quantum Telemetry' }), focus: '50% 20%' },
  { id: 'ghost-key', name: 'Ghost Key', art: cardArtworkPath({ name: 'Ghost Key' }), focus: '50% 22%' },
  { id: 'temporal-rift', name: 'Temporal Rift', art: cardArtworkPath({ name: 'Temporal Rift' }), focus: '50% 18%' },
  { id: 'nyx-luna', name: 'Nyx Luna', art: cardArtworkPath({ name: 'Nyx Luna' }), focus: '50% 18%' },
  { id: 'bushido-io', name: 'Bushido.io', art: cardArtworkPath({ name: 'Bushido.io' }), focus: '48% 20%' },
  { id: 'node-feratu', name: 'Node feratu', art: cardArtworkPath({ name: 'Node Feratu' }), focus: '50% 18%' },
  { id: 'sudo-demiurge', name: 'Sudo Demiurge', art: cardArtworkPath({ name: 'Sudo Demiurge' }), focus: '50% 16%' },
  { id: 'apollo-ascii', name: 'Apollo Ascii', art: '/assets/card_art/solar_monks/Apollo-Ascii.png', focus: '50% 18%' },
  { id: 'h3l105', name: 'H3l105', art: '/assets/card_art/uploads/h3l3-ios.png', focus: '50% 20%' },
];

const toSeat = (option: PlayerAvatarOption): SeatAvatar => ({
  src: option.art,
  focus: option.focus ?? '50% 20%',
  label: option.name,
  zoom: 1.35,
});

const DEFAULT = PLAYER_AVATAR_OPTIONS[0]!;

type Props = { disabled?: boolean };

/** Tall portrait control beside the name + Quick match stack; opens a face grid. */
export function PlayerAvatarPicker({ disabled }: Props) {
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<SeatAvatar>(() => loadPlayerAvatar() ?? toSeat(DEFAULT));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (option: PlayerAvatarOption) => {
    const next = toSeat(option);
    setAvatar(next);
    savePlayerAvatar(next);
    setOpen(false);
  };

  return (
    <div className='player-avatar-picker' ref={root}>
      <button
        type='button'
        className='player-avatar-trigger'
        aria-haspopup='listbox'
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Avatar: ${avatar.label}. Change avatar`}
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
      >
        <span className='player-avatar-frame'>
          <img src={avatar.src} alt='' style={{ objectPosition: avatar.focus }} />
        </span>
      </button>
      {open && (
        <div className='player-avatar-menu' id={panelId} role='listbox' aria-label='Choose avatar'>
          {PLAYER_AVATAR_OPTIONS.map(option => {
            const selected = option.name === avatar.label || option.art === avatar.src;
            return (
              <button
                key={option.id}
                type='button'
                role='option'
                aria-selected={selected}
                className={selected ? 'selected' : undefined}
                onClick={() => choose(option)}
              >
                <span className='player-avatar-frame'>
                  <img src={option.art} alt='' style={{ objectPosition: option.focus ?? '50% 20%' }} />
                </span>
                <span>{option.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
