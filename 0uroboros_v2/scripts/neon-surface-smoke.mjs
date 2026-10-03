import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { openSettings, closeSettings } from './settings-menu.mjs';

const URL = 'http://127.0.0.1:5173/?boardStats=1';
const report = { checks: [], samples: {}, resources: [], errors: [] };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

function watchErrors(page) {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
}

async function sample(page) {
  return page.evaluate(() => {
    const composer = window.__boardFinish?.composer;
    const scene = composer?.passes?.[0]?.scene;
    if (!scene) return null;
    const out = { glass: null, lane: null, edge: null, floor: null, memory: null };
    scene.traverse(object => {
      if (!object.isMesh) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const u = material?.uniforms;
      if (object.userData?.scanBackground) {
        out.floor = { map: material?.map?.uuid ?? null, canvas: Boolean(material?.map?.isCanvasTexture) };
      }
      if (!u) return;
      const glass = () => ({
        hasFloor: u.uHasFloor?.value,
        texture: u.tFloor?.value?.uuid ?? null,
        dataTexture: Boolean(u.tFloor?.value?.isDataTexture),
        renderTargetTexture: Boolean(u.tFloor?.value?.isRenderTargetTexture),
        health: u.uHealth?.value,
      });
      if (object.name === 'frosted-glass-field') out.glass = glass();
      if (object.parent?.name?.startsWith('neon-lane-0-') && u.uHasFloor && !out.lane) out.lane = glass();
      if (object.parent?.name === 'near-engraving' && u.uStrength && !out.edge) {
        out.edge = { strength: u.uStrength.value, time: u.uTime?.value };
      }
    });
    if (composer?.renderer) {
      const info = composer.renderer.info;
      out.memory = {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? null,
        programUses: info.programs?.reduce((total, program) => total + (program.usedTimes ?? 0), 0) ?? null,
      };
    }
    return out;
  });
}

async function waitForSample(page, predicate, label, timeout = 12000) {
  await page.waitForFunction(predicate, undefined, { timeout });
  const value = await sample(page);
  assert(value, `${label}: scene unavailable`);
  report.samples[label] = value;
  return value;
}

async function openBoardTab(page) {
  await openSettings(page);
  await page.getByRole('tab', { name: 'Board', exact: true }).click();
}

async function chooseStyle(page, name) {
  await openBoardTab(page);
  await page.getByRole('radiogroup', { name: 'Board style' }).getByRole('radio', { name, exact: true }).click();
  await closeSettings(page);
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.board-canvas').getAttribute('data-board-style'), name.toLowerCase());
}

async function chooseBackground(page, label) {
  for (let i = 0; i < 14; i++) {
    await openBoardTab(page);
    const current = (await page.locator('.bg-picker-label').innerText()).trim();
    if (current === label) { await closeSettings(page); return; }
    await page.getByRole('button', { name: 'Next floor background', exact: true }).click();
    await closeSettings(page);
    await page.waitForTimeout(180);
  }
  throw new Error(`Background ${label} not found`);
}

async function fieldState(page) {
  return page.evaluate(() => ({
    cards: [...document.querySelectorAll('.field-card')].map(el => [el.dataset.cardId, el.closest('[data-lane-node]')?.dataset.laneNode, el.closest('[data-lane-owner]')?.dataset.laneOwner]),
    servers: [...document.querySelectorAll('.server')].map(el => [el.dataset.server, el.querySelector('b')?.textContent]),
    locations: [...document.querySelectorAll('[data-location-node]')].map(el => [el.dataset.locationNode, Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y)]),
  }));
}

let page;
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  // The image, video and None floors this checks are the Studio lighting list.
  await context.addInitScript(() => { localStorage.setItem('ouroboros.boardStyle', 'neon'); localStorage.setItem('ouroboros.lightingMode', 'studio'); });
  page = await context.newPage();
  watchErrors(page);
  await page.goto(URL);
  await page.waitForFunction(() => Boolean(window.__boardFinish?.composer?.passes?.[0]?.scene));
  await page.getByRole('button', { name: 'Enter evaluation build' }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('.end-turn')) && !document.querySelector('.end-turn').disabled);

  // A real deployed card makes the style comparison a populated field-state check.
  await openSettings(page);
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await page.getByRole('button', { name: 'Card catalog', exact: true }).click();
  await page.getByRole('searchbox').fill('Rezz Razor');
  await page.getByLabel('Add test cards to').selectOption('0');
  await page.locator('[data-catalog-id="rezz-razor"]').getByRole('button', { name: 'Add to test hand', exact: true }).click();
  await page.getByRole('button', { name: 'Close card catalog', exact: true }).click();
  await page.locator('.hand-card').first().click();
  await page.getByRole('dialog').locator('.inspect-deploy').getByRole('button', { name: '1', exact: true }).click();
  await page.locator('.field-card').first().waitFor();
  const before = await fieldState(page);
  assert(before.cards.length > 0);

  const image = await waitForSample(page, () => {
    let found = false;
    window.__boardFinish?.composer?.passes?.[0]?.scene?.traverse(o => { if (o.name === 'frosted-glass-field') found = o.material?.uniforms?.uHasFloor?.value === 1; });
    return found;
  }, 'image');
  assert(image.glass && image.lane && image.edge);
  assert.equal(image.glass.hasFloor, 1);
  assert.equal(image.lane.hasFloor, 1);
  assert.equal(image.glass.dataTexture, false);
  assert(image.edge.time > 0, 'decorative time should advance under normal motion');
  report.checks.push('Static floor is connected to live glass uniforms');

  await chooseBackground(page, 'back-03');
  await page.waitForTimeout(1000);
  const image2 = await sample(page);
  report.samples.imageSwitched = image2;
  assert.equal(image2.glass.hasFloor, 1);
  assert.notEqual(image2.floor.map, image.floor.map);
  await page.screenshot({ path: 'docs/evidence/neon-v2-surfaces.png' });
  report.checks.push('Switching static images updates the floor source while glass remains live');

  await chooseBackground(page, 'background-01');
  const video = await waitForSample(page, () => {
    let glass = false, canvas = false;
    window.__boardFinish?.composer?.passes?.[0]?.scene?.traverse(o => {
      if (o.name === 'frosted-glass-field') glass = o.material?.uniforms?.uHasFloor?.value === 1;
      if (o.userData?.scanBackground) canvas = Boolean(o.material?.map?.isCanvasTexture);
    });
    return glass && canvas;
  }, 'video', 25000);
  assert.equal(video.glass.hasFloor, 1);
  assert.equal(video.floor.canvas, true);
  report.checks.push('Video background reaches the glass after decode');

  await chooseBackground(page, 'None');
  const none = await waitForSample(page, () => {
    let found = false;
    window.__boardFinish?.composer?.passes?.[0]?.scene?.traverse(o => { if (o.name === 'frosted-glass-field') found = o.material?.uniforms?.uHasFloor?.value === 0; });
    return found;
  }, 'none');
  assert.equal(none.glass.hasFloor, 0);
  assert.equal(none.glass.dataTexture, true);
  report.checks.push('None background switches the glass to its safe fallback');

  await page.evaluate(() => window.__boardLighting.health(0, .2, .2));
  await page.waitForTimeout(1300);
  const damaged = await sample(page);
  report.samples.damaged = damaged;
  assert(damaged.lane.health < image.lane.health * .8);
  assert(damaged.edge.strength < image.edge.strength * .8);
  await page.evaluate(() => window.__boardLighting.health(0, 1, 1));
  await page.waitForTimeout(1300);
  const restored = await sample(page);
  report.samples.restored = restored;
  assert(restored.lane.health > damaged.lane.health);
  assert(restored.edge.strength > damaged.edge.strength);
  report.checks.push('Local glass and edge seams dim with simulated Server damage and recover');

  await chooseStyle(page, 'Classic');
  assert.deepEqual(await fieldState(page), before);
  await chooseStyle(page, 'Neon');
  assert.deepEqual(await fieldState(page), before);
  assert.equal(await page.evaluate(() => localStorage.getItem('ouroboros.boardStyle')), 'neon');
  report.checks.push('Actual Classic and Neon radios preserve deployed cards, Servers, and Node anchors');

  for (let i = 0; i < 4; i++) {
    await chooseStyle(page, 'Classic');
    await chooseStyle(page, 'Neon');
    await page.waitForTimeout(900); // R3F releases declarative shader materials on idle.
    const entry = await sample(page);
    report.resources.push(entry.memory);
  }
  const first = report.resources[1], last = report.resources.at(-1);
  assert(last.geometries <= first.geometries + 3, 'geometry count grows across switches');
  assert(last.textures <= first.textures + 2, 'texture count grows across switches');
  assert(last.programs <= first.programs + 2, 'program count grows across switches');
  assert(last.programUses <= first.programUses + 2, 'shader program references grow across switches');
  report.checks.push('Repeated style switches do not grow renderer resource counts');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__boardFinish?.composer?.passes?.[0]?.scene));
  assert.equal(await page.locator('.board-canvas').getAttribute('data-board-style'), 'neon');
  report.checks.push('Neon radio choice persists across reload');
  await context.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' });
  await reducedContext.addInitScript(() => localStorage.setItem('ouroboros.boardStyle', 'neon'));
  const reducedPage = await reducedContext.newPage();
  watchErrors(reducedPage);
  await reducedPage.goto(URL);
  await reducedPage.waitForFunction(() => Boolean(window.__boardFinish?.composer?.passes?.[0]?.scene));
  await reducedPage.waitForTimeout(750);
  const reduced = await sample(reducedPage);
  report.samples.reducedMotion = reduced;
  assert.equal(reduced.edge.time, 0);
  report.checks.push('Reduced motion freezes decorative edge timing');
  await reducedContext.close();

  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  report.passed = false;
} finally {
  writeFileSync('docs/evidence/neon-v2-surfaces.json', JSON.stringify(report, null, 2));
  await browser.close();
}

if (!report.passed) {
  console.error(report.failure);
  if (report.errors.length) console.error(report.errors);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ passed: true, checks: report.checks, resources: report.resources }));
}
