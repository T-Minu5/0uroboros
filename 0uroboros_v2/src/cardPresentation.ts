import type { Card } from './game';
import { HISTORIC_SOURCE_METADATA } from './historicCatalog';

export type CardStyle = 'hacker' | 'action' | 'runtime' | 'attack' | 'utility' | 'crypto' | 'vp' | 'horror';
export type CardWithPresentation = Card & {
  cardClass?: 'Hacker' | 'Action' | 'Runtime' | 'Attack' | 'Utility' | 'Horror';
  generated?: boolean;
};

const icons: Record<CardStyle, string> = {
  hacker: '/assets/Icons/icon-hacker.svg',
  action: '/assets/Icons/icon-runtime.svg',
  runtime: '/assets/Icons/icon-runtime-new.svg',
  attack: '/assets/Icons/icon-attack.svg',
  utility: '/assets/Icons/icon-utility.svg',
  crypto: '/assets/Icons/icon-crypto.svg',
  vp: '/assets/Icons/icon-volume.svg',
  horror: '/assets/Icons/icon-horror.svg',
};

/** Printed class and historical tags determine the frame; rules never infer it. */
export function cardPresentation(card: CardWithPresentation): { style: CardStyle; icon: string } {
  let style: CardStyle;
  if (card.type === 'Crypto') style = 'crypto';
  else if (card.type === 'VP') style = 'vp';
  else if (card.cardClass === 'Hacker') style = 'hacker';
  else if (card.cardClass === 'Horror') style = 'horror';
  else if (card.cardClass === 'Runtime') style = 'runtime';
  else if (card.cardClass === 'Action') style = 'action';
  else if (card.cardClass === 'Attack') style = 'attack';
  else if (card.cardClass === 'Utility') style = 'utility';
  else {
    const types = HISTORIC_SOURCE_METADATA[card.definitionId ?? card.id]?.types ?? [];
    style = types.includes('power') ? 'horror'
      : types.includes('action') ? 'action'
        : types.includes('attack') ? 'attack'
          : 'utility';
  }
  return { style, icon: icons[style] };
}
