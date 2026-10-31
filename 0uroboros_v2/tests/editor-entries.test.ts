import { describe, expect, it } from 'vitest';
import {
  EDITOR_ENTRIES, EDITOR_GROUPS, applyEditorEntry, applyTargetChoice, createStep, currentTargetChoice, describeStep, editorEntryFor, targetChoicesFor,
} from '@0uroboros/engine/effects/catalog';
import type { EffectStep } from '@0uroboros/engine/effects/types';

const entry = (key: string) => EDITOR_ENTRIES.find(item => item.key === key)!;
const choice = (key: string, choiceKey: string) => entry(key).targets!.find(item => item.key === choiceKey)!;

describe('effect editor entries', () => {
  it('groups every menu item in the content sheet order', () => {
    expect(EDITOR_GROUPS).toEqual(['Resources', 'Servers', 'Cards', 'Deck', 'Node Power', 'Mods', 'Flow']);
    expect(EDITOR_ENTRIES.every(item => EDITOR_GROUPS.includes(item.group))).toBe(true);
    expect(new Set(EDITOR_ENTRIES.map(item => item.key)).size).toBe(EDITOR_ENTRIES.length);
  });

  it('stores Add, Steal and Remove power as one signed Power change and reads the sign back', () => {
    const start = createStep('changePower', 'card');
    const stolen = applyEditorEntry({ ...start, amount: 3 }, entry('stealPower'), 'card');
    expect(stolen).toMatchObject({ action: 'changePower', amount: -3, transfer: true });
    expect(editorEntryFor(stolen)?.key).toBe('stealPower');
    const removed = applyEditorEntry(stolen, entry('removePower'), 'card');
    expect(removed).toMatchObject({ action: 'changePower', amount: -3, transfer: false });
    expect(editorEntryFor(removed)?.key).toBe('removePower');
    const added = applyEditorEntry(removed, entry('addPower'), 'card');
    expect(added.amount).toBe(3);
    expect(added.transfer).toBeUndefined();
    expect(editorEntryFor(added)?.key).toBe('addPower');
  });

  it('maps Push, Pull and Player’s choice onto the transfer flow and Node targets onto its direction', () => {
    const start = createStep('transferPower', 'card');
    const push = applyEditorEntry(start, entry('push'), 'card');
    expect(push).toMatchObject({ action: 'transferPower', flow: 'push' });
    expect(editorEntryFor(push)?.key).toBe('push');
    const pull = applyEditorEntry(push, entry('pull'), 'card');
    expect(pull.flow).toBe('pull');
    expect(editorEntryFor(pull)?.key).toBe('pull');
    const either = applyEditorEntry(pull, entry('pushOrPull'), 'card');
    expect(either.flow).toBeUndefined();
    expect(editorEntryFor(either)?.key).toBe('pushOrPull');
    const between = applyTargetChoice(either, choice('push', 'split'), 'card');
    expect(between.direction).toBe('split');
    expect(currentTargetChoice(between, entry('push').targets!)?.label).toBe('Between');
  });

  it('turns a card Target into a place or play order, including this card and a revealed card here', () => {
    const heal = createStep('healCard', 'card');
    const self = applyTargetChoice(heal, choice('healCard', 'self'), 'card');
    expect(self.target).toMatchObject({ type: 'card', where: 'board', relation: 'self' });
    expect(currentTargetChoice(self, entry('healCard').targets!)?.label).toBe('This card');
    const here = applyTargetChoice(self, choice('healCard', 'thisNode'), 'card');
    expect(here.target).toMatchObject({ type: 'card', where: 'thisNode' });
    expect(here.target?.type === 'card' && here.target.relation).toBeFalsy();
    expect(currentTargetChoice(here, entry('healCard').targets!)?.label).toBe('Revealed card here');
    const hand = applyTargetChoice(here, choice('healCard', 'hand'), 'card');
    expect(hand.target).toMatchObject({ type: 'card', where: 'hand' });
  });

  it('lets every Card action that picks cards reach a random deck card and the Effect Bank', () => {
    for (const key of ['addPower', 'stealPower', 'removePower', 'healCard', 'restoreCard', 'trashCard', 'destroyCard']) {
      const step = applyEditorEntry(createStep(entry(key).action, 'card'), entry(key), 'card');
      const keys = targetChoicesFor(entry(key), step, 'card').map(item => item.key);
      expect(keys, key).toEqual(expect.arrayContaining(['deck', 'bank']));
    }
    const heal = { ...createStep('healCard', 'card'), pick: { mode: 'weakest' as const, count: 2 } };
    const deck = applyTargetChoice(heal, choice('healCard', 'deck'), 'card');
    expect(deck).toMatchObject({ target: { type: 'card', where: 'deck' }, pick: { mode: 'random', count: 2 } });
    expect(currentTargetChoice(deck, entry('healCard').targets!)?.label).toBe('Deck (random)');
    expect(describeStep(deck, 'card')).toBe('Restore 2 cards in your deck +1');
    const bank = applyTargetChoice(deck, choice('healCard', 'bank'), 'card');
    expect(bank.target).toMatchObject({ type: 'card', where: 'bank' });
    expect(currentTargetChoice(bank, entry('healCard').targets!)?.label).toBe('Effect Bank');
    expect(describeStep({ action: 'destroyCard', target: { type: 'card', who: 'opponent', where: 'bank' }, pick: { mode: 'random' } }, 'card')).toBe('Destroy a card in enemy Effect Bank');
  });

  it('offers only the Targets each scope can reach', () => {
    const keys = (key: string, scope: Parameters<typeof targetChoicesFor>[2]) => targetChoicesFor(entry(key), applyEditorEntry(createStep(entry(key).action, scope), entry(key), scope), scope).map(item => item.key);
    expect(keys('healCard', 'card')).toEqual(expect.arrayContaining(['board', 'thisNode', 'self', 'next', 'previous', 'hand']));
    expect(keys('healCard', 'circuit')).not.toContain('board');
    expect(keys('damageServer', 'card')).toEqual(['auto', 'both', 'backup']);
  });

  it('keeps Deck Trash with random deck cards a bulk Trash, separate from Trash a card', () => {
    const start = applyEditorEntry({ ...createStep('trashCards', 'card'), amount: 2 }, entry('trashCards'), 'card');
    expect(start.action).toBe('trashCards');
    const random = applyTargetChoice(start, choice('trashCards', 'deck'), 'card');
    expect(random).toMatchObject({ action: 'trashCards', amount: 2, target: { type: 'card', where: 'deck' }, pick: { mode: 'random' } });
    expect(editorEntryFor(random)?.key).toBe('trashCards');
    expect(currentTargetChoice(random, entry('trashCards').targets!)?.label).toBe('Deck (random)');
    expect(describeStep(random, 'card')).toBe('Trash 2 cards from your deck at random');
    const trashOne = applyTargetChoice(createStep('trashCard', 'card'), choice('trashCard', 'deck'), 'card');
    expect(trashOne).toMatchObject({ action: 'trashCard', target: { where: 'deck' }, pick: { mode: 'random' } });
    expect(editorEntryFor(trashOne)?.key).toBe('trashCard');
  });

  it('fixes Destroy your backup onto your own Backup server', () => {
    const step = applyEditorEntry(createStep('destroyServer', 'card'), entry('destroyServer'), 'card');
    expect(step.target).toEqual({ type: 'server', who: 'self', server: 'backup' });
    expect(describeStep(step, 'card')).toBe('Destroy your backup server');
  });

  it('prints the short vocabulary', () => {
    expect(describeStep({ action: 'healCard', amount: 1, target: { type: 'card', who: 'self', where: 'board', relation: 'self' } }, 'card')).toBe('Restore this card +1');
    expect(describeStep({ action: 'healCard', amount: 1, target: { type: 'card', who: 'self', where: 'board' }, pick: { mode: 'choose' } }, 'card')).toBe('Choose a revealed card of yours to Restore +1');
    expect(describeStep({ action: 'repairServer', amount: 100, target: { type: 'server', who: 'self', server: 'auto' } }, 'card')).toBe('Repair +100');
    expect(describeStep({ action: 'gainVP', amount: 2, target: { type: 'player', who: 'self' } }, 'card')).toBe('+2 VP');
    const glitch = [{ id: 'glitch', name: 'Glitch', type: 'VP', cost: 0, art: '', effect: '' }] as const;
    const gain = (amount: number, zone: 'hand' | 'discard' | 'deck') => describeStep({ action: 'gainCard', cardId: 'glitch', amount, target: { type: 'zone', who: 'self', zone } }, 'card', glitch as never);
    expect(gain(1, 'hand')).toBe('Gain a Glitch');
    expect(gain(2, 'discard')).toBe('Gain 2 Glitches in your Discard');
    expect(gain(1, 'deck')).toBe('Gain a Glitch on top of your deck');
  });
});
