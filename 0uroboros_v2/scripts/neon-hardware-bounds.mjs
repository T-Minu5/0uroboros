import { chromium } from 'playwright';

// Prints world-space bounds of retained GLB meshes outside the lane field: node scripts/neon-hardware-bounds.mjs [neon|classic]
const [style = 'neon'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.addInitScript(s => localStorage.setItem('ouroboros.boardStyle', s), style);
await page.goto('http://127.0.0.1:5173/?boardStats=1');
await page.getByRole('button', { name: 'Enter evaluation build' }).click();
await page.waitForFunction(() => !!document.querySelector('.end-turn') && !document.querySelector('.end-turn').disabled, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const banks = process.argv.includes('--banks');
const rows = await page.evaluate(banks => {
  const pass = window.__boardFinish?.composer?.passes?.find(p => p.scene);
  if (!pass) return null;
  const out = [];
  pass.scene.updateMatrixWorld(true);
  pass.scene.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position || !o.visible) return;
    const g = o.geometry;
    const pos = g.attributes.position, idx = g.index;
    const start = g.drawRange.start, count = Math.min(g.drawRange.count, idx ? idx.count : pos.count);
    const b = new o.position.constructor().constructor === Object ? null : { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
    const v = o.position.clone();
    for (let i = start; i < start + count; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
      for (const k of ['x', 'y', 'z']) { b.min[k] = Math.min(b.min[k], v[k]); b.max[k] = Math.max(b.max[k], v[k]); }
    }
    if (!Number.isFinite(b.min.x)) return;
    if (banks && /obsidian|gunmetal|graphite/.test(o.material?.name ?? '')) {
      for (const [label, test] of [['bankNear', p => p.x < -6.2 && p.z > 3.5], ['bankFar', p => p.x < -6.2 && p.z < -3.5], ['rightNear', p => p.x > 6.2 && p.z > 3.5], ['rightFar', p => p.x > 6.2 && p.z < -3.5], ['frontMid', p => Math.abs(p.x) < 6.2 && p.z > 5.2], ['backMid', p => Math.abs(p.x) < 6.2 && p.z < -5.2]]) {
        const c = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
        for (let i = start; i < start + count; i++) {
          v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
          if (!test(v)) continue;
          for (const k of ['x', 'y', 'z']) { c.min[k] = Math.min(c.min[k], v[k]); c.max[k] = Math.max(c.max[k], v[k]); }
        }
        if (Number.isFinite(c.min.x)) out.push({ bank: o.material.name + ' ' + label, c });
      }
    }
    if (b.max.x - b.min.x > 30) return;
    const chain = [];
    for (let p = o; p && chain.length < 4; p = p.parent) if (p.name) chain.push(p.name);
    const r = n => Math.round(n * 100) / 100;
    out.push({ name: chain.join('<') || '(anon)', mat: o.material?.name || o.material?.type, x: [r(b.min.x), r(b.max.x)], y: [r(b.min.y), r(b.max.y)], z: [r(b.min.z), r(b.max.z)] });
  });
  return out.filter(m => m.bank || Math.abs(m.z[0]) > 4.2 || Math.abs(m.z[1]) > 4.2 || Math.abs(m.x[0]) > 7.6 || Math.abs(m.x[1]) > 7.6);
}, banks);
for (const r of rows ?? []) console.log(JSON.stringify(r));
await browser.close();
