import { expect, it } from 'vitest';
import catalog from '../assets/card_art/cards.json';
import artwork from '../src/cardArtwork.json';
import { cardArtworkPath, CARD_ART_PLACEHOLDER } from '../src/cardArtwork';
import { starterCards } from '../src/game';

it('covers every supplied catalog image in the normalized artwork registry',()=>{
 expect(catalog.cards).toHaveLength(catalog.cardCount);
 expect(Object.keys(artwork.byId)).toHaveLength(catalog.cards.length);
 for(const card of catalog.cards){
  expect(card.artwork).toMatch(/^\/assets\/card_art\//);
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
 expect(starterCards.find(card=>card.name==='Dash Relay')!.effect).toBe('+1 Card. +1 Action.');
 expect(starterCards.find(card=>card.name==='Cache Crawler')!.cost).toBe(3);
});

it('handles punctuation aliases and missing artwork using the supplied fallback',()=>{
 expect(cardArtworkPath({name:'Rezz-Razor'})).toBe(artwork.byId['rezz-razor']);
 expect(cardArtworkPath({name:'Glitch'})).toBe(CARD_ART_PLACEHOLDER);
 expect(cardArtworkPath({name:'Unknown evaluation card',art:''})).toBe(CARD_ART_PLACEHOLDER);
});
