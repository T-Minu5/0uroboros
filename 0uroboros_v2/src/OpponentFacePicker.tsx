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
  /** Portrait zoom; defaults to 1.35. */
  zoom?: number;
  /** Translate X in px (negative = left). */
  x?: number;
  /** Translate Y in px (positive = down). */
  y?: number;
};

/** Landing AI choices in difficulty order. Labels are card names only. */
export const PLAYABLE_FACES: readonly PlayableFace[] = [
  { id: 'dv-8', name: 'The Hag', level: 'Novice', art: '/assets/library/card_art/base cards/utility/the-heisenberg-hag.png', focus: '50% 22%', zoom: 3, x: 10, y: 0 },
  { id: 'last-2go', name: 'Cowl Obscyra', level: 'Easy', art: '/assets/card_art/base cards/action/cowl-obscyra.png', focus: '48% 18%', zoom: 2.1, x: 0, y: 0 },
  { id: 't-5', name: 'Kim Dracula', level: 'Medium', art: '/assets/card_art/chaos cards/hackers/kim-dracula.png', focus: '50% 20%', zoom: 3, x: -3, y: -3 },
  { id: 'strat-g', name: 'Kinich', level: 'Hard', art: '/assets/card_art/uploads/kinich.png', focus: '50% 20%', zoom: 2.41, x: 5, y: -7 },
  { id: 'vp-dog', name: 'Chrome Mitchell', level: 'Xtra-hard', art: '/assets/card_art/chaos cards/attack/chrome-mitchell.png', focus: '52% 18%', zoom: 3, x: -17, y: 0 },
];

const DEFAULT_ZOOM = 1.35;

/** Avatar clip proportions (from the 58px tile: 11px major cut, 2px minor cut). */
const MAJOR = 11 / 58;
const MINOR = 2 / 58;

/** Unit-square path matching the portrait clip; stretched by the SVG to the full tile. */
const TILE_PATH = [
  `M ${MAJOR * 100} 0`,
  `L ${(1 - MINOR) * 100} 0`,
  `L 100 ${MINOR * 100}`,
  `L 100 ${(1 - MAJOR) * 100}`,
  `L ${(1 - MAJOR) * 100} 100`,
  `L ${MINOR * 100} 100`,
  `L 0 ${(1 - MINOR) * 100}`,
  `L 0 ${MAJOR * 100}`,
  'Z',
].join(' ');

/** Portrait stroke path in a 58×58 viewBox. */
const PORTRAIT_PATH = [
  `M ${11} 0`,
  `L ${56} 0`,
  `L 58 2`,
  `L 58 47`,
  `L 47 58`,
  `L 2 58`,
  `L 0 56`,
  `L 0 11`,
  'Z',
].join(' ');

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
        const zoom = face.zoom ?? DEFAULT_ZOOM;
        const x = face.x ?? 0;
        const y = face.y ?? 0;
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
            <svg
              className="opponent-face-chrome"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={TILE_PATH} />
            </svg>
            <small>{face.level}</small>
            <span className="opponent-face-pic" aria-hidden="true">
              <svg className="opponent-face-ring" viewBox="0 0 58 58">
                <path d={PORTRAIT_PATH} />
              </svg>
              <span className="opponent-face-frame">
                <img
                  src={face.art}
                  alt=""
                  style={{
                    objectPosition: face.focus,
                    transform: `scale(${zoom}) translate(${x}px, ${y}px)`,
                  }}
                  draggable={false}
                />
              </span>
            </span>
            <b>{face.name}</b>
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
