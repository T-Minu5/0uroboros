/**
 * Original 0uroboros FX marks. Effect webps in assets/effect_animations are
 * references only and are not imported here.
 *
 * Sigil: geometric glyph draw (occult tag). Interference: nested hex scan
 * (quantum tag). Burst/slash/swirl remain the general language.
 */

export type FxMarkKind = 'burst' | 'slash' | 'swirl' | 'sigil' | 'interference';
export type FxTheme = 'occult' | 'quantum' | 'general';

export function themeTagOf(name?: string | null): FxTheme {
  const n = (name ?? '').toLowerCase();
  if (n.includes('occult')) return 'occult';
  if (n.includes('entangle') || n.includes('quantum')) return 'quantum';
  return 'general';
}

export function fxKindOf(family: string, theme: FxTheme = 'general'): FxMarkKind {
  if (theme === 'occult') return 'sigil';
  if (theme === 'quantum') return 'interference';
  if (family === 'drain' || family === 'hit') return 'slash';
  if (family === 'chance' || family === 'focus' || family === 'draw') return 'swirl';
  return 'burst';
}

export function FxMark({
  kind,
  className = '',
}: {
  kind: FxMarkKind;
  className?: string;
}) {
  return (
    <svg
      className={`fx-mark fx-mark--${kind} ${className}`.trim()}
      viewBox="0 0 80 80"
      aria-hidden="true"
    >
      {kind === 'slash' ? (
        <SlashMark />
      ) : kind === 'swirl' ? (
        <SwirlMark />
      ) : kind === 'sigil' ? (
        <SigilMark />
      ) : kind === 'interference' ? (
        <InterferenceMark />
      ) : (
        <BurstMark />
      )}
    </svg>
  );
}

function BurstMark() {
  return (
    <g className="fx-mark__burst">
      <circle className="fx-mark__core" cx="40" cy="40" r="10" />
      <circle className="fx-mark__ring" cx="40" cy="40" r="16" />
      <circle className="fx-mark__ring fx-mark__ring--late" cx="40" cy="40" r="28" />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={40 + Math.cos(a) * 6}
            y1={40 + Math.sin(a) * 6}
            x2={40 + Math.cos(a) * 36}
            y2={40 + Math.sin(a) * 36}
          />
        );
      })}
    </g>
  );
}

function SlashMark() {
  return (
    <g className="fx-mark__slash">
      <path d="M6 62 C 24 14, 50 8, 74 20" />
      <path d="M10 68 C 28 20, 54 14, 76 26" />
      <path d="M16 54 C 32 24, 52 16, 70 24" />
    </g>
  );
}

function SwirlMark() {
  return (
    <g className="fx-mark__swirl">
      {Array.from({ length: 8 }, (_, i) => {
        const r = 7 + i * 4;
        return (
          <circle
            key={i}
            cx="40"
            cy="40"
            r={r}
            pathLength="100"
            strokeDasharray={`${22 + i * 5} ${78 - i * 5}`}
            strokeDashoffset={i * 10}
          />
        );
      })}
    </g>
  );
}

/** Original occult glyph. Dual-bar axis + hex — principle from fx-12, not a copy. */
function SigilMark() {
  return (
    <g className="fx-mark__sigil">
      <polygon points="40,8 68,24 68,56 40,72 12,56 12,24" />
      <circle cx="40" cy="40" r="18" />
      <line x1="40" y1="10" x2="40" y2="70" />
      <line x1="24" y1="46" x2="56" y2="46" />
      <line x1="28" y1="56" x2="52" y2="56" />
      <circle cx="40" cy="40" r="4" className="fx-mark__core" />
    </g>
  );
}

/** Original quantum scan. Nested hex tunnel + phase offset — principle from fx-11. */
function InterferenceMark() {
  return (
    <g className="fx-mark__interference">
      {[32, 24, 16, 8].map((r, i) => (
        <polygon
          key={r}
          points={hexPoints(40, 40, r)}
          pathLength="100"
          strokeDashoffset={i * 12}
        />
      ))}
      <circle cx="40" cy="40" r="3" className="fx-mark__core" />
    </g>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 6) + (i * Math.PI) / 3;
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(' ');
}
