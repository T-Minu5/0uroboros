import { expect, it } from 'vitest';
import catalog from '../assets/card_art/cards.json';
import artwork from '@0uroboros/engine/cardArtwork.json';
import { cardArtworkPath, CARD_ART_PLACEHOLDER } from '@0uroboros/engine/cardArtwork';
import { starterCards } from '@0uroboros/engine/game';

it('covers every supplied catalog image in the normalized artwork registry',()=>{
 expect(catalog.cards).toHaveLength(catalog.cardCount);
 expect(Object.keys(artwork.byId)).toHaveLength(catalog.cards.length);
 for(const card of catalog.cards){
  // Shipped art lives in card_art; art no pack card uses waits in library/card_art and never reaches the client build.
  expect(card.artwork).toMatch(/^\/assets\/(library\/)?card_art\//);
  expect(Object.values(artwork.byId),card.id).toContain(card.artwork);
 }
});

it('uses real starter Crypto and VP art without changing their canonical effects',()=>{
 for(const [name,suffix,effect] of [
  ['Byte-Coin','crypto/byte-coin.png','+2 Crypto.'],
  ['Kilo-Coin','crypto/kilo-coin.png','+3 Crypto.'],
  ['Vault Encryption','volume/2vp-b.png','Restore 100.'],
 ]){
  const card=starterCards.find(card=>card.name===name)!;
  expect(cardArtworkPath(card)).toBe(`/assets/card_art/${suffix}`);
  expect(card.effect).toBe(effect);
 }
 expect(starterCards.find(card=>card.name==='Dash-Dot')!.effect).toBe('+1 Card. +2 Actions.');
 expect(starterCards.find(card=>card.name==='Dotkrawler')!.cost).toBe(4);
});

it('handles punctuation aliases and missing artwork using the supplied fallback',()=>{
 expect(cardArtworkPath({name:'Rezz-Razor'})).toBe(artwork.byId['rezz-razor']);
 expect(cardArtworkPath({name:'Glitch'})).toBe(CARD_ART_PLACEHOLDER);
 expect(cardArtworkPath({name:'Unknown evaluation card',art:''})).toBe(CARD_ART_PLACEHOLDER);
});
