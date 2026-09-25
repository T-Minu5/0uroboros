import artwork from './cardArtwork.json';

export const CARD_ART_PLACEHOLDER = artwork.placeholder;
const nameKey = (name:string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const names = new Map(Object.entries(artwork.byName).map(([name,path])=>[nameKey(name),path]));

/** Artwork lookup is separate from rules: importing an image never changes a card's effects. */
export function cardArtworkPath(card:{name:string;art?:string;definitionId?:string}):string {
 if(card.art)return card.art;
 const byId=artwork.byId as Record<string,string>;
 return (card.definitionId?byId[card.definitionId]:undefined) || names.get(nameKey(card.name)) || card.art || CARD_ART_PLACEHOLDER;
}
