import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { starterCards } from '@0uroboros/engine/game';
import type { SessionView } from '@0uroboros/engine/runtime';
import { createSession, seededRandom } from '@0uroboros/engine/runtime';
import { migrateEffects } from '@0uroboros/engine/effects/migrate';

vi.mock('../src/BoardScene', () => ({ Icon: () => null }));
vi.mock('../src/CardFace', () => ({ CardFace: () => null }));

import { ZoneDrawer } from '../src/ZoneDrawer';
import { unmetEffectNotice } from '../src/presentation';

type Choice = NonNullable<SessionView['choice']>;

const view = (trash: typeof starterCards = []): SessionView => {
  const session = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(3) });
  session.state.trash = trash.map((card, index) => ({ ...card, id: `trash-${index}` }));
  return session.view();
};

describe('ZoneDrawer optional pile choices', () => {
  it('offers Skip when select.min is 0 and Examine Trash while recovering', () => {
    const choice: Choice = {
      id: 1, owner: 0, prompt: 'Destroy a discard card?', sourceName: 'Slash-ØN1', verb: 'Destroy', zone: 'discard',
      select: { min: 0, max: 1 },
      options: [{ id: 'card-a', label: 'A', card: { ...starterCards[0], id: 'a', name: 'A' } }],
    };
    const html = renderToStaticMarkup(createElement(ZoneDrawer, {
      zone: 'discard', view: view(), choice, choose: () => {}, inspect: () => {}, close: () => {},
    }));
    expect(html).toContain('data-zone-decline');
    expect(html).toContain("Don&#x27;t destroy");
    expect(html).toContain('Examine Discard');
  });

  it('offers Examine Trash for Dumpster Diver recover choices', () => {
    const trashCard = { ...starterCards[0], id: 'junk', name: 'Junk' };
    const choice: Choice = {
      id: 2, owner: 0, prompt: 'Recover one card from shared Trash.', sourceName: 'Dumpster Diver', verb: 'Recover', zone: 'trash',
      options: [{ id: 'junk', label: 'Junk', card: trashCard }],
    };
    const html = renderToStaticMarkup(createElement(ZoneDrawer, {
      zone: 'trash', view: view([trashCard]), choice, choose: () => {}, inspect: () => {}, close: () => {},
    }));
    expect(html).toContain('Examine Trash');
    expect(html).not.toContain('data-zone-decline');
  });
});

describe('optional unmet pile effects', () => {
  it('skips optional discard destroy with an empty Discard and surfaces toast copy', () => {
    const session = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(9), aiSeats: [],
    });
    session.state.nodeOrder = [0, 1, 2, 3, 4];
    session.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.actions = 4; });
    const source = {
      ...starterCards[0], id: 'slash', name: 'Slash-ØN1',
      onReveal: migrateEffects([{
        action: 'destroyCard', optional: true,
        target: { type: 'card', who: 'self', where: 'discard' },
        pick: { mode: 'choose' },
        then: [{ action: 'gainCrypto', amount: 3, target: { type: 'player', who: 'self' } }],
      }], 'card'),
    };
    session.state.players[0].hand = [source];
    session.deploy('slash', 0);
    session.endTurn(0); session.endTurn(1);
    const events = [];
    while (session.pendingCount) events.push(session.step()!.event);
    expect(session.state.choice).toBeNull();
    const unmet = events.find(event => /Not enough cards in Discard for benefit/.test(event.text));
    expect(unmet).toBeTruthy();
    expect(unmetEffectNotice(unmet!)).toBe('Not enough cards in Discard for benefit');
    expect(session.state.players[0].wallet).toBe(0);
  });
});
