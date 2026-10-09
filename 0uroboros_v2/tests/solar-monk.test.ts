import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent, validateContent, type AuthoredCard } from '../src/authoring/contentModel';
import { cardCategoryLabel, matchesCardFilter } from '../src/authoring/cardBrowser';
import { cardPresentation } from '../src/cardPresentation';
import { createStrategicMarket, draftOffer } from '../src/evaluationMarket';
import { canDeploy, isCharacterCard, starterCards, type Card } from '../src/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';
import type { EffectStep } from '../src/effects/types';
import { describeCard, targetsFor, whoChoices, whoLabel } from '../src/effects/catalog';

const reset = (who: 'self' | 'opponent'): EffectStep => ({ action: 'restoreCard', target: { type: 'card', who, where: 'thisNode' }, pick: { mode: 'all' } });
const monk = (extra: Partial<Card> = {}): Card => ({
  ...starterCards[0], id: 'apollo', definitionId: 'apollo-ascii', name: 'Apollo Ascii', type: 'VP', cardClass: 'Solar-monk',
  cost: 8, vp: 4, power: 1, onReveal: [reset('self'), reset('opponent')], ...extra,
});
const authoredMonk = (): AuthoredCard => ({ ...(monk() as unknown as AuthoredCard), id: 'apollo-ascii', pool: 'VP', enabled: true, art: '/assets/card_art/solar_monks/Apollo-Ascii.png', effect: 'Reset all revealed Power here.' });

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 400) throw new Error('stalled');
  }
  return events;
}

describe('Solar-monks', () => {
  it('are Characters as well as VP cards, so they need an Action to deploy', () => {
    const volume: Card = { ...monk(), cardClass: 'Volume' };
    expect(isCharacterCard(monk())).toBe(true);
    expect(isCharacterCard(volume)).toBe(false);
    expect(canDeploy(monk(), 0, 1, 0, 0)).toBe('Insufficient Actions.');
    expect(canDeploy(volume, 0, 1, 0, 0)).toBeNull();
  });

  it('print with the solar frame and list as Solar-monk · VP', () => {
    expect(cardPresentation(monk())).toEqual({ style: 'solar', icon: '/assets/Icons/icon-solar.svg' });
    const volume = createDefaultContent().cards.find(card => card.type === 'VP')!;
    expect(cardCategoryLabel(volume)).toBe('Volume · VP');
    expect(matchesCardFilter(volume, 'Volume')).toBe(true);
    expect(cardCategoryLabel(authoredMonk())).toBe('Solar-monk · VP');
    expect(matchesCardFilter(authoredMonk(), 'Solar-monk')).toBe(true);
    expect(matchesCardFilter(authoredMonk(), 'Volume')).toBe(false);
  });

  it('only take VP subtypes on VP cards', () => {
    const document = createDefaultContent();
    document.cards.push(authoredMonk());
    expect(validateContent(document)).toEqual([]);
    document.cards.find(card => card.type === 'Character')!.cardClass = 'Solar-monk';
    expect(validateContent(document).some(error => error.includes('Solar-monk is a VP subtype'))).toBe(true);
  });

  it('rotate one into each Draft offer and are never a game pile', () => {
    const content = compileContent(createDefaultContent());
    const plain = { ...content, vpCards: content.vpCards.filter(card => card.cardClass !== 'Solar-monk') };
    const withMonks = { ...plain, vpCards: [...plain.vpCards, monk(), monk({ id: 'dama', definitionId: 'dama-de-fuego', name: 'Dama de Fuego' })] };
    for (let seed = 1; seed <= 10; seed++) {
      const market = createStrategicMarket(seededRandom(seed), withMonks);
      expect(market.filter(pile => pile.category === 'VP')).toHaveLength(3);
      expect(market.some(pile => pile.card.cardClass === 'Solar-monk')).toBe(false);
      const offer = draftOffer(seededRandom(seed), withMonks, new Set(market.map(pile => pile.card.definitionId ?? pile.card.id)));
      expect(offer.filter(pile => pile.card.cardClass === 'Solar-monk')).toEqual([expect.objectContaining({ category: 'VP', rotating: true, supply: 4, remaining: [2, 2] })]);
      const next = draftOffer(seededRandom(seed + 50), withMonks, new Set(), new Set(offer.map(pile => pile.card.definitionId ?? pile.card.id)));
      expect(next.find(pile => pile.card.cardClass === 'Solar-monk')!.id).not.toBe(offer.find(pile => pile.card.cardClass === 'Solar-monk')!.id);
    }
    expect(draftOffer(seededRandom(1), plain).some(pile => pile.category === 'VP')).toBe(false);
  });

  it('spend an Action when played, and Apollo Ascii resets Power on both sides here', () => {
    const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(5), content: compileContent(createDefaultContent()) });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    game.state.players[1].actions = 0;
    const ally: Card = { ...starterCards[0], id: 'ally', name: 'ally', type: 'Character', power: 2, powerDelta: 3, onReveal: [] };
    const enemy: Card = { ...starterCards[0], id: 'enemy', name: 'enemy', type: 'Character', power: 2, powerDelta: -1, onReveal: [] };
    game.state.nodes[0].cards[0].push({ card: ally, owner: 0, node: 0, order: 1, revealed: true });
    game.state.nodes[0].cards[1].push({ card: enemy, owner: 1, node: 0, order: 2, revealed: true });
    game.state.players[0].hand = [monk()];
    const actions = game.state.players[0].actions;
    game.deploy('apollo', 0);
    expect(game.state.players[0].actions).toBe(actions - 1);
    game.endTurn();
    finish(game);
    expect(ally.powerDelta ?? 0).toBe(0);
    expect(enemy.powerDelta ?? 0).toBe(0);
  });

  it('get printed wording from recurring and scheduled steps, not only reveal and collapse', () => {
    const heal: EffectStep = { action: 'healCard', amount: 1, target: { type: 'card', who: 'self', where: 'board' }, pick: { mode: 'random' } };
    const text = describeCard({ recurring: [heal], duration: 2, durationPeriod: 'runtime' });
    expect(text).toBe('Restore a revealed card of yours +1, for the next 2 turns.');
    expect(describeCard({ recurring: [heal], duration: 3, durationPeriod: 'cycle' })).toMatch(/, for the next 3 Cycles\.$/);
    expect(describeCard({ recurring: [heal], duration: 99, durationPeriod: 'runtime' })).toMatch(/, every turn\.$/);
    expect(describeCard({ schedule: [{ at: 2, effects: [heal] }], duration: 2, durationPeriod: 'runtime' })).toMatch(/Lasts 2 turns\.$/);
    expect(describeCard({ schedule: [{ at: 1, timing: 'end', effects: [heal] }], duration: 99, durationPeriod: 'runtime' })).toMatch(/^End of the next Runtime turn: Restore[^]*\.$/);
    expect(describeCard({ recurring: [heal], duration: 99, durationPeriod: 'cycle' })).toMatch(/, every Cycle\.$/);
    expect(describeCard({ schedule: [{ at: 2, effects: [heal] }], duration: 2, durationPeriod: 'cycle' })).toMatch(/^In 2 Cycles: Restore[^]*Lasts 2 Cycles\.$/);
    expect(describeCard({ onReveal: [reset('self')], onCollapse: [reset('opponent')] })).toMatch(/\. On collapse: /);
  });
});

describe('Location effects', () => {
  it('can target both players for card and zone effects, not just the winner or loser', () => {
    for (const action of ['healCard', 'restoreCard', 'attachModifier', 'removeModifier', 'changePower', 'scry', 'bump', 'draw'] as const) {
      expect(whoChoices(targetsFor(action, 'location')[0], 'location')).toEqual(expect.arrayContaining(['winner', 'loser', 'both']));
    }
    expect(whoLabel('both', 'location')).toBe('Both');
    expect(whoLabel('winner', 'location', 'card')).toBe('Winning');
    expect(whoLabel('winner', 'location')).toBe('Winning player');
  });
});
