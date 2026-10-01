// Depth-parallax card art, end to end against the running dev server (npm run dev).
// Checks: cards show their flat WebP image at rest; a card dragged from the hand gets a depth layer whose
// image counter-moves its lean, and leans in 3D while cards left in the hand stay flat.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'docs/evidence/depth-art';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const result = { errors: [] };
page.on('pageerror', error => result.errors.push(String(error)));
const fail = message => { throw new Error(message); };

try {
  await page.addInitScript(() => { let seed = 341; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; });

  // Studio preview.
  await page.goto('http://127.0.0.1:5173/author');
  await page.getByRole('searchbox', { name: 'Search Cards' }).fill('Atomic Unit');
  await page.locator('[data-author-item]').first().click();
  await page.locator('.au-depth-status', { hasText: '3D depth ready' }).waitFor({ timeout: 15000 });
  await page.locator('.au-card-face-wrap img.cf-art').evaluate(image => image.decode());
  if (await page.locator('.au-card-face-wrap canvas[data-depth-art]').count()) fail('Studio preview shows depth art instead of its flat image');
  await page.locator('.au-card-face-wrap').screenshot({ path: `${OUT}/author.png` });
  result.preview = { status: await page.locator('.au-depth-status').innerText() };

  // Game hand and drag.
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: 'Enter evaluation build' }).click();
  await page.waitForFunction(() => { const button = document.querySelector('.end-turn'); return button && !button.disabled; }, null, { timeout: 30000 });
  if (await page.locator('canvas[data-depth-art]').count()) fail('Cards at rest show depth art instead of their flat images');
  result.handImages = await page.locator('.hand-card img.cf-art').evaluateAll(images => images.map(image => image.getAttribute('src')));
  if (!result.handImages.every(src => src.endsWith('.color.webp'))) fail(`Hand art is not all served as WebP: ${result.handImages.join(', ')}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/hand.png` });

  const card = page.locator('.hand > .hand-card').first();
  await card.hover(); await page.waitForTimeout(250);
  const start = await card.boundingBox();
  const grab = { x: start.x + start.width * 0.55, y: start.y + start.height * 0.38 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const ghost = page.locator('.pointer-card');
  const lean = async () => {
    const transform = await page.evaluate(() => document.querySelector('.pointer-card')?.style.transform ?? '');
    return { ry: Number(/rotateY\((-?[\d.]+)deg/.exec(transform)?.[1] ?? 0), rx: Number(/rotateX\((-?[\d.]+)deg/.exec(transform)?.[1] ?? 0) };
  };
  // Lift the card toward the middle of the board first, then sweep it each way.
  let at = { ...grab };
  for (let i = 1; i <= 6; i++) { at = { x: grab.x + i * 10, y: grab.y - i * 45 }; await page.mouse.move(at.x, at.y); }
  await ghost.waitFor();
  await page.waitForTimeout(700);
  await ghost.locator('canvas.cf-art-depth[data-ready]').waitFor({ timeout: 5000 }).catch(() => fail('A card dragged from the hand shows no depth layer'));
  const depthHash = () => ghost.locator('canvas.cf-art-depth').evaluate(canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let h = 0; for (let i = 0; i < data.length; i += 997) h = (h * 31 + data[i]) >>> 0; return h; });
  const restingDepth = await depthHash();
  result.leans = {};
  for (const [name, dx, dy] of [['right', 26, 0], ['left', -26, 0], ['up', 0, -18], ['down', 0, 18]]) {
    const peak = { rx: 0, ry: 0 };
    for (let i = 1; i <= 9; i++) {
      at = { x: at.x + dx, y: at.y + dy };
      await page.mouse.move(at.x, at.y);
      const { rx, ry } = await lean();
      if (Math.abs(ry) > Math.abs(peak.ry)) peak.ry = ry;
      if (Math.abs(rx) > Math.abs(peak.rx)) peak.rx = rx;
      if (i === 6) {
        if (name === 'right') result.depthMoved = (await depthHash()) !== restingDepth;
        const b = await ghost.boundingBox();
        await page.screenshot({ path: `${OUT}/drag-${name}.png`, clip: { x: b.x - 40, y: b.y - 30, width: b.width + 80, height: b.height + 70 } });
      }
    }
    result.leans[name] = peak;
    await page.waitForTimeout(700);
  }
  const { right, left, up, down } = result.leans;
  if (!(right.ry > 4 && left.ry < -4)) fail(`Card did not turn toward horizontal motion: ${JSON.stringify(result.leans)}`);
  if (!(up.rx > 4 && down.rx < -4)) fail(`Card did not turn toward vertical motion: ${JSON.stringify(result.leans)}`);
  if (!result.depthMoved) fail('The dragged card\'s depth image did not move with its lean');
  if (!(await ghost.locator('.pointer-card-sheen').count())) fail('Dragged card has no sheen layer');
  result.handTransforms = await page.locator('.hand > .hand-card:not(.pointer-card)').evaluateAll(cards => cards.map(card => getComputedStyle(card).transform));
  if (result.handTransforms.some(transform => transform.startsWith('matrix3d'))) fail('A card resting in the hand tilted');
  await page.waitForTimeout(500);
  result.settledTransform = await ghost.evaluate(element => element.style.transform);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  if (await page.locator('canvas[data-depth-art]').count()) fail('Depth layer outlived the drag');

  if (result.errors.length) fail(result.errors.join('\n'));
  result.passed = true;
} catch (error) { result.failure = String(error); process.exitCode = 1; }
finally {
  writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
