import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { openSettings, closeSettings } from './settings-menu.mjs';

// Reproducible, live UI evaluation. No authoritative game state is injected.
const closureOnly = process.argv.includes('--closure');
const prefix = closureOnly ? 'neon-v2-closure' : 'neon-v2';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(30000);
const report = { errors: [], stats: [], checks: [], events: [], screenshots: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', e => {
  if (e.type() === 'error') report.errors.push(e.text());
  if (e.text().startsWith('BOARD_STATS ')) report.stats.push(JSON.parse(e.text().slice(12)));
});
await page.addInitScript(() => {
  let seed = 341;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  if (!sessionStorage.getItem('neon-review-initialized')) {
    localStorage.setItem('ouroboros.boardStyle', 'neon');
    sessionStorage.setItem('neon-review-initialized', '1');
  }
});
const shot = async name => {
  const path = `docs/evidence/${prefix}-${name}.png`;
  await page.screenshot({ path }); report.screenshots.push(path);
};
const ready = () => page.waitForFunction(() => !!document.querySelector('.end-turn') && !document.querySelector('.end-turn').disabled);
async function visuals() {
  await openSettings(page); await page.getByRole('tab', { name: 'Visuals', exact: true }).click();
}
async function style(name) {
  await visuals(); await page.getByRole('radiogroup', { name: 'Board style', exact: true }).getByRole('radio', { name, exact: true }).click(); await closeSettings(page);
  await page.waitForTimeout(1400);
}
async function snapshot() {
  return page.evaluate(() => ({
    phase: document.querySelector('.phase-label').textContent,
    cards: [...document.querySelectorAll('.field-card')].map(e => ({ id: e.dataset.cardId, owner: e.closest('[data-lane-owner]').dataset.laneOwner, node: e.closest('[data-lane-node]').dataset.laneNode })),
    servers: [...document.querySelectorAll('.server')].map(e => [e.dataset.server, e.querySelector('b').textContent]),
    locations: [...document.querySelectorAll('[data-location-node]')].map(e => ({ node: e.dataset.locationNode, x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y })),
  }));
}
async function addCard(name, id, owner = 0) {
  await openSettings(page); await page.getByRole('tab', { name: 'General', exact: true }).click();
  await page.getByRole('button', { name: 'Card catalog', exact: true }).click();
  await page.getByRole('searchbox').fill(name);
  await page.getByLabel('Add test cards to').selectOption(String(owner));
  await page.locator(`[data-catalog-id="${id}"]`).getByRole('button', { name: 'Add to test hand', exact: true }).click();
  await page.getByRole('button', { name: 'Close card catalog', exact: true }).click();
  await ready(); await page.waitForTimeout(300);
}
async function deployCard(card, node) {
  const id = await card.getAttribute('data-card-id');
  await card.click();
  const dialog = page.getByRole('dialog');
  const destination = dialog.locator('.inspect-deploy').getByRole('button', { name: String(node + 1), exact: true });
  if (!await destination.isEnabled()) { await page.keyboard.press('Escape'); return false; }
  await destination.click(); await page.waitForTimeout(650);
  return !!await page.locator(`.field-card[data-card-id="${id}"]`).count();
}
async function deployHand(turn) {
  const cards = await page.locator('.hand-card').evaluateAll(es => es.map(e => ({ id: e.dataset.cardId, name: e.getAttribute('aria-label') })));
  cards.sort((a, b) => Number(/Rezz|Vault/.test(b.name)) - Number(/Rezz|Vault/.test(a.name)));
  for (const entry of cards) {
    const card = page.locator(`.hand-card[data-card-id="${entry.id}"]`);
    if (!await card.count()) continue;
    const lanes = await page.locator('.local-drop').evaluateAll(es => es.map(e => ({ node: Number(e.dataset.nodeDrop), count: e.querySelectorAll('.field-card').length, sealed: e.classList.contains('sealed') })));
    lanes.sort((a, b) => a.count - b.count || Number(a.sealed) - Number(b.sealed) || a.node - b.node);
    for (const lane of lanes) if (await deployCard(card, lane.node)) break;
  }
  report.checks.push(`Deployed through the real UI on turn ${turn}`);
}
async function handleChoice() {
  const dialog = page.locator('.choice-dialog').first();
  if (!await dialog.count()) return false;
  const mode = await dialog.getAttribute('data-choice-mode');
  if (mode === 'groups' || mode === 'select') {
    const picks = mode === 'groups' ? dialog.locator('.choice-group-actions button[data-choice-option]:first-child') : dialog.locator('button[data-choice-option]');
    const confirm = dialog.locator('.choice-confirm');
    for (let i = 0; i < await picks.count() && !(mode === 'select' && await confirm.isEnabled()); i++) await picks.nth(i).click();
    await confirm.click();
  } else await dialog.locator('button[data-choice-option]:not(:disabled)').first().click();
  return true;
}
async function resolve(turn) {
  await page.locator('.end-turn').click();
  const deadline = Date.now() + 180000;
  const captured = new Set();
  while (Date.now() < deadline) {
    if (await handleChoice()) continue;
    const state = await page.evaluate(() => ({
      phase: document.querySelector('.phase-label')?.textContent,
      stage: document.querySelector('.app')?.dataset.eventStage,
      drain: !!document.querySelector('.server.server-drain'),
      restore: !!document.querySelector('.server.server-restore'),
      ready: !!document.querySelector('.end-turn') && !document.querySelector('.end-turn').disabled,
      draft: !!document.querySelector('.draft-overlay'),
      closed: document.querySelectorAll('[data-node-closed]').length,
    }));
    for (const key of ['drain', 'restore']) if (state[key] && !captured.has(key)) { captured.add(key); report.events.push({ turn, kind: key }); await shot(`${key}-turn-${turn}`); }
    if (state.phase.includes('COLLAPSE') && !captured.has('collapse')) { captured.add('collapse'); report.events.push({ turn, kind: 'collapse' }); await shot('collapse'); }
    if (closureOnly && state.stage === 'node-award' && !captured.has('award')) {
      captured.add('award'); await page.waitForTimeout(180); await shot('award');
    }
    if (closureOnly && state.closed >= 2 && !captured.has('settled-seal')) {
      captured.add('settled-seal'); report.events.push({ turn, kind: 'settled-seal', closed: state.closed });
      await page.waitForTimeout(500); await shot('settled-seal');
    }
    if (closureOnly && state.closed === 5 && !captured.has('all-sealed')) {
      captured.add('all-sealed'); await page.waitForTimeout(1200); await shot('all-sealed');
    }
    if (turn < 3 && state.phase.includes(`RUNTIME ${turn + 1} OF 3`) && state.ready) return;
    if (turn === 3 && state.draft) return;
    await page.waitForTimeout(140);
  }
  throw new Error(`Turn ${turn} failed to resolve`);
}
try {
  await page.goto('http://127.0.0.1:5173/?boardStats=1');
  await page.getByRole('button', { name: 'Enter evaluation build' }).click(); await ready();
  await shot('empty');
  await addCard('Rezz Razor', 'rezz-razor'); await addCard('Rezz Blade', 'rezz-blade', 1);
  // Pointer check: whole lane is a target; only the hovered Node gets the drop light.
  const hand = page.locator('.hand-card').first(), a = await hand.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 3); await page.waitForTimeout(200);
  const settled = await hand.boundingBox();
  await page.mouse.move(settled.x + settled.width / 2, settled.y + settled.height / 3); await page.mouse.down();
  await page.mouse.move(settled.x + settled.width / 2 + 10, settled.y + settled.height / 3 - 10);
  await page.locator('.pointer-card').waitFor();
  const target = await page.locator('[data-lane-drop]:not(.sealed)').first().boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height - 15, { steps: 8 });
  await page.waitForTimeout(300); assert.equal(await page.locator('.location-plate.drop-highlight').count(), 1);
  await shot('hover'); await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(600);
  report.checks.push('Whole-lane hover highlights exactly one Node; Escape cancels');
  for (let turn = 1; turn <= 3; turn++) {
    await ready();
    if (turn === 2) await addCard('Vault Encryption', 'vault-encryption');
    await deployHand(turn);
    if (turn === 3 && !closureOnly) {
      const before = await snapshot();
      assert(before.cards.some(c => c.owner === '0') && before.cards.some(c => c.owner === '1'));
      report.populatedState = before;
      await page.waitForTimeout(7000); await shot('populated');
      await style('Classic'); await page.waitForTimeout(7000); await shot('classic-populated');
      assert.deepEqual(await snapshot(), before);
      await style('Neon'); assert.deepEqual(await snapshot(), before);
      report.checks.push('Classic/Neon preserve identical populated gameplay and HUD anchors');
      for (const width of [1366, 1600]) {
        await page.setViewportSize({ width, height: width === 1366 ? 900 : 1000 }); await page.waitForTimeout(700); await shot(`populated-${width}`);
      }
      for (let i = 0; i < 3; i++) { await style('Classic'); await style('Neon'); await page.waitForTimeout(7000); }
      report.checks.push('Repeated style switches completed');
    }
    await resolve(turn);
    console.log(`Cycle evaluation: turn ${turn} resolved`);
  }
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'End Draft' && !b.disabled));
  await page.waitForTimeout(1200);
  await shot('draft');
  if (closureOnly) {
    assert(report.events.some(e => e.kind === 'settled-seal'));
    report.checks.push('Populated closure, settled seals and settled Draft captured');
  } else {
  const buy = page.locator('.market-card .acquire-card:not([aria-disabled="true"])').first();
  if (await buy.count()) { await buy.click(); report.checks.push('Draft purchase completed'); }
  await page.getByRole('button', { name: 'End Draft', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.phase-label')?.textContent?.includes('CYCLE 02'), null, { timeout: 90000 }); await ready();
  await shot('next-cycle');
  report.checks.push('Populated Cycle completed through Collapse and Draft into Cycle 2');
  await visuals();
  for (let i = 0; i < 8; i++) {
    const label = await page.locator('.bg-picker-label').innerText();
    await closeSettings(page); await page.waitForTimeout(label.includes('background') ? 1500 : 500);
    if (label === 'None' || label.includes('background')) await shot(`background-${label}`);
    await visuals(); await page.getByRole('button', { name: 'Next floor background', exact: true }).click();
  }
  await closeSettings(page); report.checks.push('All image, video and None backgrounds switch with Neon');
  assert.equal(await page.evaluate(() => localStorage.getItem('ouroboros.boardStyle')), 'neon');
  await page.reload(); await page.getByRole('button', { name: 'Enter evaluation build' }).waitFor();
  assert.equal(await page.locator('.board-canvas').getAttribute('data-board-style'), 'neon');
  report.checks.push('Neon selection persists across reload');
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ passed: true, checks: report.checks, stats: report.stats, events: report.events }));
} catch (error) {
  report.failure = String(error.stack); await shot('failure');
  console.error(report.failure); console.error((await page.locator('body').innerText()).slice(-3500)); process.exitCode = 1;
} finally {
  writeFileSync(`docs/evidence/${prefix}-review.json`, JSON.stringify(report, null, 2)); await browser.close();
}
