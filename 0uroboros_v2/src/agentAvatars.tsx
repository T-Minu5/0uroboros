import type { ReactElement } from 'react';

export type AgentId = 'strat-g' | 'eco-strat' | 't-5' | 'dv-8' | 'vp-dog';

/** Eco-Strat: a monocled piggy-bank robot in a top hat, counting everyone else's coins. */
function EcoStratFace() {
  return <>
    <rect x='15' y='3' width='18' height='10' rx='1.5' fill='#1b2a24' stroke='#1fffb1' strokeWidth='1.2'/>
    <rect x='11' y='12' width='26' height='3' rx='1.5' fill='#1b2a24' stroke='#1fffb1' strokeWidth='1.2'/>
    <rect x='19' y='6.5' width='10' height='1.6' rx='.8' fill='#1fffb1' opacity='.8'/>
    <ellipse cx='24' cy='29' rx='16' ry='13' fill='#ffb3c8' stroke='#ff7aa2' strokeWidth='1.4'/>
    <path d='M11 21 L8 15 L15 18 Z M37 21 L40 15 L33 18 Z' fill='#ffb3c8' stroke='#ff7aa2' strokeWidth='1.2' strokeLinejoin='round'/>
    <ellipse cx='24' cy='33' rx='6' ry='4.4' fill='#ff8fb0' stroke='#e5638a' strokeWidth='1'/>
    <circle cx='21.8' cy='33' r='1.1' fill='#7a2440'/><circle cx='26.2' cy='33' r='1.1' fill='#7a2440'/>
    <circle cx='17.5' cy='25' r='2.2' fill='#2b1420'/>
    <circle cx='30.5' cy='25' r='4.6' fill='#ffffff2a' stroke='#ffd36b' strokeWidth='1.4'/>
    <circle cx='30.5' cy='25' r='2.2' fill='#2b1420'/><circle cx='31.3' cy='24.2' r='.7' fill='#fff'/>
    <path d='M35 28 Q37 33 34 38' fill='none' stroke='#ffd36b' strokeWidth='.9'/>
    <circle cx='24' cy='17' r='1.6' fill='#ffd36b'/>
  </>;
}

/** Strat-G: a chess knight with googly eyes and a crown it awarded itself. */
function StratGFace() {
  return <>
    <path d='M14 44 L14 38 Q10 30 15 21 Q19 12 28 9 L30 5 L33 10 Q40 15 39 25 L33 23 Q30 27 34 34 L36 44 Z' fill='#2a2050' stroke='#9fe8ff' strokeWidth='1.4' strokeLinejoin='round'/>
    <path d='M17 25 Q13 30 14 34' fill='none' stroke='#9fe8ff' strokeWidth='1' opacity='.6'/>
    <path d='M31 13 L34 6.5 L36.5 10.5 L39.5 5 L41 12 Z' fill='#ffd36b' stroke='#b8892a' strokeWidth='.9' strokeLinejoin='round' transform='rotate(14 36 9)'/>
    <circle cx='25' cy='18' r='4.6' fill='#fff' stroke='#1b1430' strokeWidth='1'/><circle cx='26.6' cy='19.6' r='2' fill='#120c22'/>
    <circle cx='33' cy='17' r='3.4' fill='#fff' stroke='#1b1430' strokeWidth='1'/><circle cx='32' cy='15.6' r='1.5' fill='#120c22'/>
    <circle cx='37.2' cy='24' r='.9' fill='#9fe8ff'/>
    <path d='M30 27 Q33 29 36 26.5' fill='none' stroke='#9fe8ff' strokeWidth='1.1' strokeLinecap='round'/>
    <path d='M16 22 Q20 16 24 13' fill='none' stroke='#c08bff' strokeWidth='2.4' strokeLinecap='round' strokeDasharray='1 3'/>
  </>;
}

/** T-5: an angry countdown alarm clock on legs, with a rocket strapped to its back. */
function T5Face() {
  return <>
    <g transform='rotate(-32 8 32)'>
      <path d='M8 21 Q11.5 25 11.5 33 L4.5 33 Q4.5 25 8 21 Z' fill='#e8eef5' stroke='#9fb3c8' strokeWidth='.8'/>
      <circle cx='8' cy='27' r='1.4' fill='#9fe8ff' stroke='#5a7186' strokeWidth='.5'/>
      <path d='M4.5 30 L2 34.5 L4.5 33 Z M11.5 30 L14 34.5 L11.5 33 Z' fill='#ff6b3d'/>
      <path d='M5.5 33.5 Q8 42 10.5 33.5 Z' fill='#ffd36b'/><path d='M6.8 33.5 Q8 38 9.2 33.5 Z' fill='#fff6d0'/>
    </g>
    <path d='M15 39 L12 45.5 M33 39 L36 45.5' stroke='#ff6b3d' strokeWidth='2.2' strokeLinecap='round'/>
    <circle cx='13.5' cy='10' r='4.6' fill='#ff6b3d' stroke='#ffd36b' strokeWidth='1'/>
    <circle cx='34.5' cy='10' r='4.6' fill='#ff6b3d' stroke='#ffd36b' strokeWidth='1'/>
    <rect x='22.6' y='5' width='2.8' height='5.5' rx='1' fill='#ffd36b'/>
    <circle cx='24' cy='26' r='15' fill='#2a1210' stroke='#ff6b3d' strokeWidth='1.6'/>
    <circle cx='24' cy='26' r='11.2' fill='#120807' stroke='#ff6b3d' strokeOpacity='.35'/>
    <path d='M24 15.6 V17.4 M34.4 26 H32.6 M24 36.4 V34.6 M13.6 26 H15.4' stroke='#ffd36b' strokeWidth='1' strokeLinecap='round'/>
    <path d='M16.2 19.4 L22 21 M31.8 19.4 L26 21' stroke='#ffd36b' strokeWidth='1.3' strokeLinecap='round'/>
    <rect x='16.6' y='21.8' width='5' height='3' rx='1' fill='#ff3d2e'/><rect x='26.4' y='21.8' width='5' height='3' rx='1' fill='#ff3d2e'/>
    <path d='M18.5 30.5 H29.5' stroke='#ff3d2e' strokeWidth='2.2' strokeDasharray='2.2 1.2'/>
  </>;
}

/** DV-8: a sly gremlin bot in shades, with a crooked antenna and one fang. */
function DV8Face() {
  return <>
    <path d='M24 11.5 Q24.5 7 28.5 6 L32.6 3.4' fill='none' stroke='#b6ff4d' strokeWidth='1.3' strokeLinecap='round'/>
    <circle cx='33.4' cy='3' r='2' fill='#ff4dd2'/>
    <path d='M11.5 22 L1.5 15 L9.5 29 Z' fill='#2b1f3a' stroke='#b6ff4d' strokeWidth='1.2' strokeLinejoin='round'/>
    <path d='M36.5 22 L46.5 17 L38.5 29 Z' fill='#2b1f3a' stroke='#b6ff4d' strokeWidth='1.2' strokeLinejoin='round'/>
    <path d='M9.6 22.4 L4.6 18 L9.2 25.8 Z M38.4 22.6 L43.4 19.6 L38.8 25.8 Z' fill='#ff4dd2' opacity='.6'/>
    <path d='M11 18 Q12 11 24 11 Q36 11 37 18 L38 32 Q37 41.5 24 42 Q11 41.5 10 32 Z' fill='#2b1f3a' stroke='#b6ff4d' strokeWidth='1.4'/>
    <circle cx='13.4' cy='35' r='1' fill='#b6ff4d'/><circle cx='34.6' cy='35' r='1' fill='#b6ff4d'/>
    <g transform='rotate(-7 24 24)'>
      <path d='M11.5 21 H36.5 V23 Q36 28.6 30.4 28.6 Q25.6 28.6 25 23.6 H23 Q22.4 28.6 17.6 28.6 Q12 28.6 11.5 23 Z' fill='#0b0b10' stroke='#b6ff4d' strokeWidth='.8'/>
      <path d='M14.6 23.2 L17.4 23.2 M28 23.2 L30.4 23.2' stroke='#fff' strokeWidth='.9' strokeLinecap='round' opacity='.8'/>
    </g>
    <path d='M16.5 34 Q23.5 37.6 31.5 31.6' fill='none' stroke='#b6ff4d' strokeWidth='1.3' strokeLinecap='round'/>
    <path d='M26.4 35.4 L27.6 38.4 L28.7 34.7 Z' fill='#fff'/>
  </>;
}

/** VP-Dog: a floppy-eared robot hound with its tongue out and a gold VP tag on its collar. */
function VPDogFace() {
  return <>
    <path d='M13 13 Q4 13 4.5 24 Q5 33 10.5 34 Q13 27 14.5 18 Z' fill='#5a3a22' stroke='#ffd36b' strokeWidth='1.1' strokeLinejoin='round'/>
    <path d='M35 13 Q44 13 43.5 24 Q43 33 37.5 34 Q35 27 33.5 18 Z' fill='#5a3a22' stroke='#ffd36b' strokeWidth='1.1' strokeLinejoin='round'/>
    <path d='M13 18 Q13 8 24 8 Q35 8 35 18 L35 28 Q35 36 24 36 Q13 36 13 28 Z' fill='#c48a4f' stroke='#ffd36b' strokeWidth='1.4'/>
    <path d='M24 8.5 V14' stroke='#8a5a2e' strokeWidth='1' strokeLinecap='round'/>
    <circle cx='19' cy='19.5' r='3' fill='#1a1208'/><circle cx='29' cy='19.5' r='3' fill='#1a1208'/>
    <circle cx='19.9' cy='18.6' r='1' fill='#9fe8ff'/><circle cx='29.9' cy='18.6' r='1' fill='#9fe8ff'/>
    <ellipse cx='24' cy='28' rx='7.5' ry='5.5' fill='#e8c79a' stroke='#8a5a2e' strokeWidth='.9'/>
    <ellipse cx='24' cy='25.4' rx='2.8' ry='2' fill='#1a1208'/>
    <path d='M20.5 29.5 Q24 32 27.5 29.5' fill='none' stroke='#1a1208' strokeWidth='1' strokeLinecap='round'/>
    <path d='M24.6 30.6 Q25 35 27.2 34.6 Q28.6 34 27.4 30.2 Z' fill='#ff7aa2' stroke='#e5638a' strokeWidth='.7'/>
    <path d='M14 37.5 Q24 41.5 34 37.5' fill='none' stroke='#ff3d2e' strokeWidth='2.4' strokeLinecap='round'/>
    <circle cx='24' cy='42.6' r='4.4' fill='#ffd36b' stroke='#b8892a' strokeWidth='1'/>
    <text x='24' y='44.4' textAnchor='middle' fontSize='4.6' fontWeight='800' fontFamily='sans-serif' fill='#5a3a22'>VP</text>
  </>;
}

export const AGENT_NAMES: Record<AgentId, string> = { 'strat-g': 'Strat-G', 'eco-strat': 'Eco-Strat', 't-5': 'T-5', 'dv-8': 'DV-8', 'vp-dog': 'VP-Dog' };
const FACES: Record<AgentId, () => ReactElement> = { 'strat-g': StratGFace, 'eco-strat': EcoStratFace, 't-5': T5Face, 'dv-8': DV8Face, 'vp-dog': VPDogFace };

export function AgentAvatar({ agent, size = 28 }: { agent: AgentId; size?: number }) {
  const Face = FACES[agent] ?? StratGFace;
  return <svg className={`agent-avatar agent-avatar-${agent}`} width={size} height={size} viewBox='0 0 48 48' aria-hidden='true'>
    <Face/>
  </svg>;
}
