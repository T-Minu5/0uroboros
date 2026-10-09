import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

vi.mock('../src/BoardScene', () => ({ Icon: () => null }));
import { renderToStaticMarkup } from 'react-dom/server';
import { EffectChoice, confirmLabel, declineLabel } from '../src/EffectChoice';
import { starterCards } from '@0uroboros/engine/game';
import type { SessionView } from '@0uroboros/engine/runtime';

type Choice = NonNullable<SessionView['choice']>;
const card = (id: string) => ({ id, label: id, card: { ...starterCards[0], id } });
const render = (choice: Partial<Choice>) => renderToStaticMarkup(createElement(EffectChoice, {
  choice: { id: 1, owner: 0, prompt: 'Pick', sourceName: 'Test', options: [], ...choice } as Choice, choose: () => {},
}));

describe('choice modal buttons', () => {
  it('name the action and its count', () => {
    expect(confirmLabel('Trash', { min: 3, max: 3 }, 0)).toBe('Trash 3 cards');
    expect(confirmLabel('Discard', { min: 1, max: 1 }, 0)).toBe('Discard a card');
    expect(confirmLabel('Select', { min: 1, max: 1 }, 1)).toBe('Select a card');
    expect(confirmLabel('Select', { min: 0, max: 3 }, 0)).toBe('Select cards');
    expect(confirmLabel('Select', { min: 0, max: 3 }, 2)).toBe('Select 2 cards');
    expect(confirmLabel('Select', { min: 2, max: 2 }, 0, 'option')).toBe('Select 2 options');
  });

  it('say how to decline', () => {
    expect(declineLabel('Trash', 3)).toBe("Don't trash cards");
    expect(declineLabel('Discard', 1)).toBe("Don't discard");
    expect(declineLabel('Select', 2)).toBe('Select none');
  });

  it('confirms single card picks and offers the decline beside the verb button', () => {
    const single = render({ verb: 'Destroy', options: [card('a'), card('b'), { id: 'skip', label: 'Skip' }] });
    expect(single).toContain('>Destroy a card</button>');
    expect(single).toContain(">Don&#x27;t destroy</button>");
    expect(single).not.toContain('>Skip<');
    const hand = render({ verb: 'Discard', options: [card('a'), card('b'), card('c')], select: { min: 0, max: 2 } });
    expect(hand).toContain('>Discard cards</button>');
    expect(hand).toContain(">Don&#x27;t discard cards</button>");
    const required = render({ options: [card('a'), card('b')] });
    expect(required).toContain('>Select a card</button>');
    expect(required).not.toContain('data-choice-decline');
  });

  it('turns an optional payment into a primary button with a decline', () => {
    const payment = render({ verb: 'Discard', options: [{ id: 'decline', label: 'Decline' }, { id: 'pay', label: 'Discard 2 cards' }] });
    expect(payment).toContain('class="choice-confirm" data-choice-option="pay">Discard 2 cards</button>');
    expect(payment).toContain(">Don&#x27;t discard</button>");
  });
});
