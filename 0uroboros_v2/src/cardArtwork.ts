import artwork from './cardArtwork.json';

export const CARD_ART_PLACEHOLDER = artwork.placeholder;
export const CARD_BACK = '/assets/card_art/card backs/cardback_02_silicone.png';
/** Case, spacing and punctuation are ignored, so `rezz_blade`, `rezz-blade` and `Rezz Blade` all match. */
export const cardNameKey = (name:string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const names = new Map(Object.entries(artwork.byName).map(([name,path])=>[cardNameKey(name),path]));

/** Artwork lookup is separate from rules: importing an image never changes a card's effects. */
export function cardArtworkPath(card:{name:string;art?:string;definitionId?:string}):string {
 if(card.art)return card.art;
 const byId=artwork.byId as Record<string,string>;
 return (card.definitionId?byId[card.definitionId]:undefined) || names.get(cardNameKey(card.name)) || card.art || CARD_ART_PLACEHOLDER;
}
