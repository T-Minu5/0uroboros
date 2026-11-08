import type { OpponentId } from './ai/strategistClient';
import './opponent-face-picker.css';

export type PlayableFace = {
  /** Internal agent id; never shown on the landing UI. */
  id: OpponentId;
  name: string;
  level: string;
  art: string;
  /** CSS object-position for a face-forward crop. */
  focus: string;
};

/** Landing AI choices in difficulty order. Labels are card names only. */
export const PLAYABLE_FACES: readonly PlayableFace[] = [
  { id: 'dv-8', name: 'The Heisenberg Hag', level: 'Novice', art: '/assets/library/card_art/base cards/utility/the-heisenberg-hag.png', focus: '50% 22%' },
  { id: 'last-2go', name: 'Cowl Obscyra', level: 'Easy', art: '/assets/card_art/base cards/action/cowl-obscyra.png', focus: '48% 18%' },
  { id: 't-5', name: 'Kim Dracula', level: 'Medium', art: '/assets/card_art/chaos cards/hackers/kim-dracula.png', focus: '50% 20%' },
  { id: 'strat-g', name: 'Kinich', level: 'Hard', art: '/assets/card_art/uploads/kinich.png', focus: '50% 24%' },
  { id: 'vp-dog', name: 'Chrome Mitchell', level: 'Xtra-hard', art: '/assets/card_art/chaos cards/attack/chrome-mitchell.png', focus: '52% 18%' },
];

type Props = {
  value: OpponentId;
  onChange: (id: OpponentId) => void;
  disabled?: boolean;
};

/** Face-cropped AI picker for the landing screen. Does not reveal underlying agent ids. */
export function OpponentFacePicker({ value, onChange, disabled }: Props) {
  return (
    <div className="opponent-faces" role="radiogroup" aria-label="Choose opponent">
      {PLAYABLE_FACES.map(face => {
        const selected = value === face.id;
        return (
          <button
            key={face.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${face.name}, ${face.level}`}
            disabled={disabled}
            className={`opponent-face${selected ? ' selected' : ''}`}
            onClick={() => onChange(face.id)}
          >
            <span className="opponent-face-frame" aria-hidden="true">
              <img src={face.art} alt="" style={{ objectPosition: face.focus }} draggable={false} />
            </span>
            <b>{face.name}</b>
            <small>{face.level}</small>
          </button>
        );
      })}
    </div>
  );
}

export function faceNameFor(id: string): string {
  return PLAYABLE_FACES.find(face => face.id === id)?.name ?? id;
}

export function faceLevelFor(id: string): string | undefined {
  return PLAYABLE_FACES.find(face => face.id === id)?.level;
}
