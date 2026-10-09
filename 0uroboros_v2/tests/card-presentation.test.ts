import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardFace } from '../src/CardFace';
import { cardPresentation } from '../src/cardPresentation';
import { HISTORIC_CARDS } from '@0uroboros/engine/historicCatalog';
import type { Card } from '@0uroboros/engine/game';

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
    expect(infinite).toContain('icon-infinite.svg');
    expect(infinite).not.toContain('</b></span>');
    const turns = renderToStaticMarkup(createElement(CardFace, { card: { ...sample, duration: 3, durationPeriod: 'runtime' } }));
    expect(turns).toContain('icon-turns.svg');
    expect(turns).toContain('<b>3</b>');
    expect(renderToStaticMarkup(createElement(CardFace, { card: { ...sample, duration: 3, durationPeriod: 'cycle' } }))).toContain('icon-duration.svg');
    expect(infinite).toContain('data-card-power="2"');
    expect(infinite).toContain('boosted');
    const zero = renderToStaticMarkup(createElement(CardFace, { card: { ...sample, duration: 99, power: 0, basePower: 2 }, remainingDuration: 0, powerChanging: true }));
    expect(zero).toContain('data-card-duration="0"');
    expect(zero).toContain('reduced power-changing');
    expect(renderToStaticMarkup(createElement(CardFace, { card: sample, remainingDuration: 0 }))).not.toContain('data-card-duration');
  });

  it('shows Effect Bank cards with only their effects-left badge', () => {
    const banked = renderToStaticMarkup(createElement(CardFace, { card: { ...sample, duration: 3, durationPeriod: 'runtime' }, compact: true, remainingDuration: 2, bankEffects: 0 }));
    expect(banked).toContain('data-effects-left="0"');
    expect(banked).toContain('icon-turns.svg');
    expect(banked).not.toContain('data-card-duration');
    expect(banked).not.toContain('data-card-power');
    const endless = renderToStaticMarkup(createElement(CardFace, { card: { ...sample, duration: 99 }, compact: true, bankEffects: null }));
    expect(endless).toContain('data-effects-left="infinite"');
    expect(endless).toContain('icon-infinite.svg');
  });

  it('colours raised Power Cyan and lowered Power Pink', () => {
    const css = readFileSync('src/card-face.css', 'utf8');
    expect(css).toMatch(/\.cf-power\.card-power-value\.boosted\{[^}]*color:var\(--cyan/);
    expect(css).toMatch(/\.cf-power\.card-power-value\.reduced\{[^}]*color:var\(--pink/);
  });
});
