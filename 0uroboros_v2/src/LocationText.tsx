import { type CSSProperties, type ReactNode } from 'react';
import { CARD_CLASSES, type CardClass } from '@0uroboros/engine/game';
import { splitLocationText } from '@0uroboros/engine/locationTriggers';
import { CARD_STYLE_COLORS, CARD_STYLE_ICONS, styleForCardClass } from './cardPresentation';

/** Longest first so `Solar-monk` wins over a bare `Solar`. */
const CLASS_NAMES = [...CARD_CLASSES].sort((a, b) => b.length - a.length);
const CLASS_PATTERN = new RegExp(`\\b(${CLASS_NAMES.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');

/** CardClass tokens in prose that LocationText swaps for icons (tests + callers). */
export function cardClassesInText(text: string): CardClass[] {
  return [...text.matchAll(CLASS_PATTERN)].map(match => match[1] as CardClass);
}

function SubtypeIcon({ cardClass }: { cardClass: CardClass }) {
  const style = styleForCardClass(cardClass);
  return (
    <span
      className='location-subtype-icon'
      role='img'
      aria-label={cardClass}
      title={cardClass}
      style={{
        '--tone': CARD_STYLE_COLORS[style],
        WebkitMaskImage: `url(${CARD_STYLE_ICONS[style]})`,
        maskImage: `url(${CARD_STYLE_ICONS[style]})`,
      } as CSSProperties}
    />
  );
}

/** Swap CardClass tokens for inline subtype icons; leave effect-coloured phrases alone (e.g. +1 Action). */
export function withSubtypeIcons(text: string, keyPrefix = 'st'): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CLASS_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    nodes.push(<SubtypeIcon key={`${keyPrefix}-${index}`} cardClass={match[1] as CardClass} />);
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

/** Location copy in white, with trigger prefixes in bold, effect phrases in their colour, and subtypes as icons. */
export function LocationText({ text }: { text: string }) {
  return <>{splitLocationText(text).map((part, index) => {
    if (part.trigger) {
      return <span key={index} className='location-trigger' data-trigger={part.trigger} style={{ color: part.color }}>{part.text}</span>;
    }
    if (part.effect) {
      return <span key={index} className='location-effect' data-effect={part.effect} style={{ color: part.color }}>{part.text}</span>;
    }
    return <span key={index}>{withSubtypeIcons(part.text, `p${index}`)}</span>;
  })}</>;
}
