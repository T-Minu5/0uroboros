import { cardArtworkPath } from '@0uroboros/engine/cardArtwork';
import type { Card } from '@0uroboros/engine/game';
import { PLAYABLE_FACES } from './OpponentFacePicker';

const GUEST_AVATAR_KEY = 'ouroboros.guestAvatar';
const ACCOUNT_AVATAR_KEY = 'ouroboros.accountAvatar';

export type SeatAvatar = {
  src: string;
  focus: string;
  label: string;
  /** Landing-face crop; when set, matches the setup-screen portrait. */
  zoom?: number;
  x?: number;
  y?: number;
};

type GalleryCard = Card & { enabled?: boolean; generated?: boolean; cardClass?: string };

/** Draft-eligible Character (and Solar-monk) faces for guest avatar assignment. */
export function draftableFaces(cards: readonly GalleryCard[]): SeatAvatar[] {
  return cards
    .filter(card => card.enabled !== false && card.generated !== true && (card.type === 'Character' || card.cardClass === 'Solar-monk'))
    .map(card => ({ src: cardArtworkPath(card), focus: '50% 20%', label: card.name }));
}

/** Published AI face art for the chosen opponent id — same crop as the landing picker. */
export function opponentSeatAvatar(opponentId: string): SeatAvatar | null {
  const face = PLAYABLE_FACES.find(entry => entry.id === opponentId);
  if (!face) return null;
  return {
    src: face.art,
    focus: face.focus,
    label: face.name,
    ...(face.zoom !== undefined ? { zoom: face.zoom } : {}),
    ...(face.x !== undefined ? { x: face.x } : {}),
    ...(face.y !== undefined ? { y: face.y } : {}),
  };
}

/** Optional account portrait (localStorage until accounts grow an avatar field). */
export function accountSeatAvatar(): SeatAvatar | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_AVATAR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeatAvatar;
    if (parsed?.src && parsed.label) return { src: parsed.src, focus: parsed.focus || '50% 20%', label: parsed.label };
  } catch { /* ignore */ }
  return null;
}

/** Landing/online picker selection (same storage as account portrait for now). */
export function loadPlayerAvatar(): SeatAvatar | null {
  return accountSeatAvatar();
}

/** Persist the player's chosen landing avatar for board consoles and return trips. */
export function savePlayerAvatar(avatar: SeatAvatar) {
  const payload = JSON.stringify({
    src: avatar.src,
    focus: avatar.focus || '50% 20%',
    label: avatar.label,
    ...(avatar.zoom !== undefined ? { zoom: avatar.zoom } : {}),
    ...(avatar.x !== undefined ? { x: avatar.x } : {}),
    ...(avatar.y !== undefined ? { y: avatar.y } : {}),
  });
  try {
    localStorage.setItem(ACCOUNT_AVATAR_KEY, payload);
    localStorage.setItem(GUEST_AVATAR_KEY, payload);
  } catch { /* ignore */ }
}

/** Stable guest portrait: remember the pick so the board face doesn't reshuffle every game. */
export function guestSeatAvatar(cards: readonly GalleryCard[]): SeatAvatar {
  try {
    const raw = localStorage.getItem(GUEST_AVATAR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SeatAvatar;
      if (parsed?.src && parsed.label) return { src: parsed.src, focus: parsed.focus || '50% 20%', label: parsed.label };
    }
  } catch { /* ignore */ }
  const pool = draftableFaces(cards);
  const pick = pool[Math.floor(Math.random() * Math.max(1, pool.length))]
    ?? { src: cardArtworkPath({ name: 'Placeholder' }), focus: '50% 20%', label: 'Operative' };
  try { localStorage.setItem(GUEST_AVATAR_KEY, JSON.stringify(pick)); } catch { /* ignore */ }
  return pick;
}

/** Local human: account avatar when present, otherwise a random draftable Character. */
export function localSeatAvatar(cards: readonly GalleryCard[]): SeatAvatar {
  return accountSeatAvatar() ?? guestSeatAvatar(cards);
}

/** Another draftable face that preferably differs from `avoid` (online PvP / fallback). */
export function pickOtherFace(cards: readonly GalleryCard[], avoid?: SeatAvatar | null): SeatAvatar {
  const pool = draftableFaces(cards).filter(face => !avoid || face.src !== avoid.src || face.label !== avoid.label);
  if (!pool.length) return avoid ?? guestSeatAvatar(cards);
  return pool[Math.floor(Math.random() * pool.length)]!;
}
