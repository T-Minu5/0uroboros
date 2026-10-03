import { chromium } from 'playwright';

// Server and Stats layout in world X/Z at 1920x1080: node scripts/server-layout-probe.mjs [neon|classic]
const style = process.argv[2] ?? 'neon';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.addInitScript(s => localStorage.setItem('ouroboros.boardStyle', s), style);
await page.goto('http://127.0.0.1:5173/?boardStats=1');
await page.getByRole('button', { name: 'Enter evaluation build' }).click();
await page.waitForFunction(() => !!document.querySelector('.end-turn') && !document.querySelector('.end-turn').disabled, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const out = await page.evaluate(() => {
  const pass = window.__boardFinish?.composer?.passes?.find(p => p.camera);
  const cam = pass.camera, canvas = document.querySelector('.board-canvas canvas'), r = canvas.getBoundingClientRect();
  const V = cam.position.constructor;
  const at = (x, y, z) => { const v = new V(x, y, z).project(cam); return [r.x + (v.x + 1) / 2 * r.width, r.y + (1 - v.y) / 2 * r.height]; };
  const [x0, z0] = at(0, 0, 0), [x1] = at(1, 0, 0), [, z1] = at(0, 0, 1);
  const world = (px, py) => [+((px - x0) / (x1 - x0)).toFixed(3), +((py - z0) / (z1 - z0)).toFixed(3)];
  const box = el => { const b = el.getBoundingClientRect(); return { x: [world(b.left, 0)[0], world(b.right, 0)[0]], z: [world(0, b.top)[1], world(0, b.bottom)[1]] }; };
  const rows = { pxPerX: +(x1 - x0).toFixed(2), pxPerZ: +(z1 - z0).toFixed(2), canvas: [r.width, r.height] };
  for (const sel of ['.local-console', '.opponent-console']) { const el = document.querySelector(sel); if (el) rows[sel] = box(el); }
  for (const el of document.querySelectorAll('[data-server]')) rows[el.dataset.server] = box(el);
  return rows;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
