import { PLAYABLE_FACES, PORTRAIT_CLIP, portraitImageStyle, type PlayableFace } from './OpponentFacePicker';

export type AgentId = 'strat-g' | 'eco-strat' | 't-5' | 'dv-8' | 'vp-dog' | 'last-2go';

export const AGENT_NAMES: Record<AgentId, string> = { 'strat-g': 'Strat-G', 'eco-strat': 'Eco-Strat', 't-5': 'T-5', 'dv-8': 'DV-8', 'vp-dog': 'VP-Dog', 'last-2go': 'Last2Go' };
/** One line on how each agent plays, so the portraits never hide which strategy is which. */
export const AGENT_STYLES: Record<AgentId, string> = {
  'strat-g': 'Balanced', 't-5': 'Pure aggression', 'vp-dog': 'Pure economy', 'last-2go': 'Reactive Location control',
  'dv-8': 'Engine and control (Novice)', 'eco-strat': 'Evaluates the economy',
};

type Face = Pick<PlayableFace, 'art' | 'focus' | 'zoom' | 'x' | 'y'> & { name: string };
const landing = (id: string): Face => {
  const face = PLAYABLE_FACES.find(entry => entry.id === id)!;
  return { name: face.name, art: face.art, focus: face.focus, zoom: face.zoom, x: face.x, y: face.y };
};
/** Each agent wears the landing portrait of the opponent it plays; Eco-Strat, who never plays, is the Crypto Alchemist. */
export const AGENT_FACES: Record<AgentId, Face> = {
  'strat-g': landing('strat-g'), 't-5': landing('t-5'), 'dv-8': landing('dv-8'), 'vp-dog': landing('vp-dog'), 'last-2go': landing('last-2go'),
  'eco-strat': { name: 'Crypto Alchemist', art: '/assets/library/card_art/base cards/utility/crypto-alchemist.png', focus: '50% 18%', zoom: 2.2, x: 0, y: 2 },
};

export function AgentAvatar({ agent, size = 28 }: { agent: AgentId; size?: number }) {
  const face = AGENT_FACES[agent] ?? AGENT_FACES['strat-g'];
  return <span className={`agent-avatar agent-avatar-${agent}`} aria-hidden='true' title={face.name}
    style={{ display: 'inline-block', flex: 'none', width: size, height: size, overflow: 'hidden', clipPath: PORTRAIT_CLIP, background: '#0a1218' }}>
    <img src={face.art} alt='' draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', transformOrigin: 'center top', ...portraitImageStyle(face, size) }}/>
  </span>;
}
