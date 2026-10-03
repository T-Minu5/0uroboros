import { chromium } from 'playwright';

// Quick look-dev capture: node scripts/neon-v3-shot.mjs <neon|classic> <out.png> [width] [height] [--probe]
const [style = 'neon', out = '/tmp/neon-v3.png', w = '1600', h = '1000'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const probe = process.argv.includes('--probe');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
await page.addInitScript(s => localStorage.setItem('ouroboros.boardStyle', s), style);
await page.goto(`http://127.0.0.1:5173/?boardStats=1${process.argv.includes('--no-lanes') ? '&neonNoLanes=1' : ''}`);
await page.getByRole('button', { name: 'Enter evaluation build' }).click();
await page.waitForFunction(() => !!document.querySelector('.end-turn') && !document.querySelector('.end-turn').disabled, null, { timeout: 60000 });
if (process.argv.includes('--hide-hand')) await page.addStyleTag({ content: '.hand-card,.hand{visibility:hidden!important}' });
await page.waitForTimeout(3500);
const railArg = process.argv.find(a => a.startsWith('--rail-pulse'));
if (railArg) {
  const [owner, hold] = (railArg.split('=')[1] ?? '0,.5').split(',').map(Number);
  await page.evaluate(([o, h]) => window.__neonRailPulse?.(o, h), [owner, hold]);
  await page.waitForTimeout(300);
}
const glintArg = process.argv.find(a => a.startsWith('--glint'));
if (glintArg) {
  await page.evaluate(p => window.__neonGlint?.(p), Number(glintArg.split('=')[1] ?? .5));
  await page.waitForTimeout(300);
}
await page.screenshot({ path: out });
if (probe) {
  const points = await page.evaluate(() => {
    const finish = window.__boardFinish;
    const pass = finish?.composer?.passes?.find(p => p.camera);
    if (!pass) return null;
    const cam = pass.camera, canvas = document.querySelector('.board-canvas canvas'), r = canvas.getBoundingClientRect();
    const V = cam.position.constructor;
    const at = (x, y, z) => { const v = new V(x, y, z).project(cam); return [Math.round(r.x + (v.x + 1) / 2 * r.width), Math.round(r.y + (1 - v.y) / 2 * r.height)]; };
    const out = {};
    for (const z of [-7, -6.5, -6, -5.5, -5, -4.5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7]) out[`z${z}`] = [at(-8.5, 0, z), at(0, 0, z), at(8.5, 0, z)];
    out.front = [at(0, -.6, 6.53), at(0, .1, 6.53)];
    return out;
  });
  console.log(JSON.stringify(points));
}
console.log(JSON.stringify({ errors }));
await browser.close();
