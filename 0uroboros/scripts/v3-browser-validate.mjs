/**
 * V3 multi-Cycle browser validation + screenshots (plain ESM, no tsx IPC).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tools/agent-harness/delivery/evidence/v3-implementation');
const URL = 'http://127.0.0.1:5176/';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const log = [];
  const shot = async (name) => {
    const path = join(OUT, `${name}.png`);
    await page.screenshot({ path, fullPage: false });
    log.push(`shot:${name}`);
    return path;
  };

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.table', { timeout: 30000 });
  const pace = page.locator('button.toggle', { hasText: /Pace/ });
  if ((await pace.textContent())?.includes('Normal')) await pace.click();
  await shot('01-runtime-idle');

  const card = page.locator('.rail__cards .rail__card').first();
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(200);
  const node = page.locator('.node-head[data-legal="true"]').first();
  await node.click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('02-after-deploy');

  for (let window = 0; window < 12; window++) {
    if (await page.locator('.draft').count()) break;
    if (await page.locator('.collapse-show, .node-head__go, .collapse-show__go').count()) {
      await shot(`03-collapse-w${window}`);
      for (let i = 0; i < 40; i++) {
        const go = page.locator('.collapse-show__go, .node-head__go').first();
        if (await go.count()) {
          await go.click({ timeout: 2000 }).catch(() => undefined);
          await page.waitForTimeout(120);
        } else if (await page.locator('.draft').count()) {
          break;
        } else {
          await page.keyboard.press('Space');
          await page.waitForTimeout(100);
        }
        if (await page.locator('.draft').count()) break;
      }
      break;
    }

    const end0 = page.locator('button.act[data-primary="true"]', { hasText: /End turn/ });
    if (await end0.count()) {
      await end0.click();
      await page.waitForTimeout(200);
    }
    await page.locator('button[role="tab"][data-seat="1"]').click();
    await page.waitForTimeout(250);
    const p1card = page.locator('.rail__cards .rail__card').first();
    if (await p1card.count()) {
      await p1card.click().catch(() => undefined);
      await page.waitForTimeout(150);
      const legal = page.locator('.node-head[data-legal="true"]').first();
      if (await legal.count()) await legal.click().catch(() => undefined);
      await page.waitForTimeout(900);
    }
    const end1 = page.locator('button.act[data-primary="true"]', { hasText: /End turn/ });
    if (await end1.count()) {
      await end1.click();
      await page.waitForTimeout(300);
    }
    await page.locator('button[role="tab"][data-seat="0"]').click();
    await page.waitForTimeout(300);
    log.push(`window-pass:${window}`);
  }

  for (let i = 0; i < 50; i++) {
    if (await page.locator('.draft').count()) break;
    const go = page.locator('.collapse-show__go, .node-head__go').first();
    if (await go.count()) {
      await go.click().catch(() => undefined);
      await page.waitForTimeout(100);
    } else {
      await page.keyboard.press('Space');
      await page.waitForTimeout(80);
    }
  }
  await shot('04-pre-draft-or-draft');

  if (await page.locator('.draft').count()) {
    await shot('05-draft');
    await page.locator('.draft button.act[data-primary="true"]', { hasText: /End Draft/ }).click();
    await page.waitForTimeout(200);
    await page.locator('button[role="tab"][data-seat="1"]').click();
    await page.waitForTimeout(300);
    if (await page.locator('.draft button.act[data-primary="true"]', { hasText: /End Draft/ }).count()) {
      await page.locator('.draft button.act[data-primary="true"]', { hasText: /End Draft/ }).click();
    }
    await page.waitForTimeout(600);
    await page.locator('button[role="tab"][data-seat="0"]').click();
    await page.waitForTimeout(800);
    await shot('06-cycle2-runtime');
    const cycleText = await page.locator('.table').innerText().catch(() => '');
    log.push(`cycle2-surface:${cycleText.slice(0, 400)}`);
  } else {
    log.push('WARN: Draft UI not reached');
  }

  await page.goto(`${URL}?look=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  await shot('07-look-capture');

  writeFileSync(join(OUT, 'validation-log.json'), JSON.stringify({ at: new Date().toISOString(), log }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, log }, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
