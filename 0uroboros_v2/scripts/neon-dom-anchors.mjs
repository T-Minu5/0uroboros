import { chromium } from 'playwright';

// Prints Server label icons and Effect Bank panels in world X/Z (play camera, 1600x1000).
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.addInitScript(() => localStorage.setItem('ouroboros.boardStyle', 'neon'));
await page.goto('http://127.0.0.1:5173/?boardStats=1');
await page.getByRole('button', { name: 'Enter evaluation build' }).click();
await page.waitForFunction(() => !!document.querySelector('.end-turn') && !document.querySelector('.end-turn').disabled, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const out = await page.evaluate(() => {
  const pass = window.__boardFinish?.composer?.passes?.find(p => p.camera);
  const cam = pass.camera, canvas = document.querySelector('.board-canvas canvas'), r = canvas.getBoundingClientRect();
  const V = cam.position.constructor;
  const at = (x, z) => { const v = new V(x, 0, z).project(cam); return [r.x + (v.x + 1) / 2 * r.width, r.y + (1 - v.y) / 2 * r.height]; };
  const [x0, z0] = at(0, 0), [x1] = at(1, 0), [, z1] = at(0, 1);
  const world = (px, py) => [+((px - x0) / (x1 - x0)).toFixed(3), +((py - z0) / (z1 - z0)).toFixed(3)];
  const rows = [];
  for (const el of document.querySelectorAll('body *')) {
    const t = (el.textContent || '').trim();
    if (el.children.length > 3) continue;
    if (/^(BACKUP|PRIMARY|Backup|Primary)$/.test(t) || /effect bank/i.test(t) && el.children.length === 0) {
      const b = el.getBoundingClientRect();
      const icon = [...(el.parentElement?.querySelectorAll('svg, img, i, [class*="icon"]') ?? [])][0];
      const ib = icon?.getBoundingClientRect();
      rows.push({ text: t, cls: el.className?.baseVal ?? el.className, topLeft: world(b.left, b.top), bottomRight: world(b.right, b.bottom), icon: ib ? world(ib.left, ib.top) : null, iconTag: icon?.tagName });
    }
  }
  for (const el of document.querySelectorAll('[class*="effect"], [class*="bank"]')) {
    const b = el.getBoundingClientRect();
    if (b.width < 40) continue;
    rows.push({ panel: el.className, topLeft: world(b.left, b.top), bottomRight: world(b.right, b.bottom) });
  }
  return rows;
});
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
