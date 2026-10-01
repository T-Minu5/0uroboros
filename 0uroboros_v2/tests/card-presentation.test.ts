import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardFace } from '../src/CardFace';
import { cardPresentation } from '../src/cardPresentation';
import { HISTORIC_CARDS } from '../src/historicCatalog';
import type { Card } from '../src/game';

const historic = (id: string) => HISTORIC_CARDS.find(card => card.id === id)!;
const sample: Card = { id: 'sample', name: 'Sample Card', type: 'Character', cost: 3, power: 2, art: '/sample.png', effect: '' };

describe('shared card presentation', () => {
  it('uses authored classes and historic printed tags for all six styles', () => {
    expect(cardPresentation(historic('sudo-demiurge')).style).toBe('horror');
    expect(cardPresentation(historic('atomic-unit')).style).toBe('action');
    expect(cardPresentation(historic('rezz-razor')).style).toBe('attack');
    expect(cardPresentation(historic('night-scythe')).style).toBe('utility');
    expect(cardPresentation(historic('byte-coin')).style).toBe('crypto');
    expect(cardPresentation(historic('basic-encryption')).style).toBe('vp');
    expect(cardPresentation({ ...sample, cardClass: 'Runtime' }).style).toBe('runtime');
    expect(cardPresentation({ ...sample, cardClass: 'Hacker', generated: true }).style).toBe('hacker');
    expect(cardPresentation({ ...sample, type: 'Crypto', cardClass: 'Hacker', generated: true }).style).toBe('crypto');
    expect(cardPresentation({ ...sample, onReveal: [{ kind: 'drain', amount: 50 }] }).style).toBe('utility');
    expect(cardPresentation({ ...sample, cardClass: 'Action' }).icon).toBe('/assets/Icons/icon-runtime.svg');
    expect(cardPresentation({ ...sample, cardClass: 'Runtime' })).toEqual({ style: 'runtime', icon: '/assets/Icons/icon-runtime-new.svg' });
  });

  it('preserves art and shows cost only in Draft', () => {
    const runtime = renderToStaticMarkup(createElement(CardFace, { card: sample }));
    expect(runtime).toContain('src="/sample.png"');
    expect(runtime).toContain('data-card-style="utility"');
    expect(runtime).toContain('data-card-context="runtime"');
    expect(runtime).toContain('class="cf-title card-name"');
    expect(runtime).toContain('data-title-fit="exact"');
    expect(runtime).not.toContain('data-card-cost');
    const draft = renderToStaticMarkup(createElement(CardFace, { card: sample, context: 'draft' }));
    expect(draft).toContain('data-card-cost="3"');
    expect(draft).toContain('/assets/Icons/icon-crypto.svg');
    const compact = renderToStaticMarkup(createElement(CardFace, { card: sample, compact: true }));
    expect(compact).toContain('cf-card--compact');
    expect(compact).not.toContain('card-name');
    const badged = renderToStaticMarkup(createElement(CardFace, {
      card: { ...sample, modifiers: [
        { id: 'a', kind: 'doublePrintedEffects' },
        { id: 'b', kind: 'powerAuraAtLocation', amount: 1 },
        { id: 'c', kind: 'movableEachTurn' },
      ] },
      movableCue: true,
    }));
    expect(badged).toContain('[x2]');
    expect(badged).toContain('[+1]');
    expect(badged).toContain('[↔]');
    expect(badged).toContain('cf-card--movable');
  });

  it('uses explicit remaining Duration including zero and distinguishes changed Power', () => {
    const infinite = renderToStaticMarkup(createElement(CardFace, { card: { ...sample, duration: 99, basePower: 1 } }));
    expect(infinite).toContain('data-card-duration="99"');
    expect(infinite).toContain('>∞</b>');
    expect(infinite).toContain('data-card-power="2"');
    expect(infinite).toContain('boosted');
    const zero = renderToStaticMarkup(createElement(CardFace, { card: { ...sample, duration: 99, power: 0, basePower: 2 }, remainingDuration: 0, powerChanging: true }));
    expect(zero).toContain('data-card-duration="0"');
    expect(zero).toContain('reduced power-changing');
    expect(renderToStaticMarkup(createElement(CardFace, { card: sample, remainingDuration: 0 }))).not.toContain('data-card-duration');
  });
});
