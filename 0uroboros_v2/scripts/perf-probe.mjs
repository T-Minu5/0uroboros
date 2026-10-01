import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Production-build frame budget probe. Serves `dist/` (or PERF_URL), enters the evaluation build and samples
 * frame pacing, main-thread time per frame and WebGL draw/triangle counts across viewports and CPU throttling.
 * Set PERF_UNCAPPED=1 to lift vsync so the frame rate shows real headroom instead of the 60 Hz cap.
 */
const ABLATION = process.env.PERF_ABLATION === '1';
const BASE = process.env.PERF_URL ?? (ABLATION ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:4173');
const UNCAPPED = process.env.PERF_UNCAPPED === '1';
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS ?? 6000);
const ONLY = process.env.PERF_ONLY?.split(',');

const SCENARIOS = [
 { id: 'laptop-1x', viewport: { width: 1440, height: 900 }, dpr: 1, cpu: 1 },
 { id: 'retina-2x', viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 1 },
 { id: 'desktop-1440p-2x', viewport: { width: 2560, height: 1440 }, dpr: 2, cpu: 1 },
 { id: 'retina-2x-cpu4', viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 4 },
 { id: 'retina-2x-cpu6', viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 6 },
 { id: 'tablet-2x-cpu4', viewport: { width: 1180, height: 820 }, dpr: 2, cpu: 4, touch: true },
 { id: 'retina-2x-reduced', viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 1, reducedMotion: 'reduce' },
 { id: 'retina-2x-cpu6-reduced', viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 6, reducedMotion: 'reduce' },
 { id: 'retina-2x-collapse', viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 1, collapse: true },
 { id: 'retina-2x-cpu4-collapse', viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 4, collapse: true },
].filter(s => !ONLY || ONLY.includes(s.id));

function instrument() {
 const s = window.__perf = { recording: false, log: [], curTs: -1, cur: { cpu: 0, draws: 0, tris: 0, gpu: 0, gpuPending: 0 }, contexts: [], loaf: [] };
 const raf = window.requestAnimationFrame.bind(window);
 // GPU time per frame on the board canvas, from EXT_disjoint_timer_query_webgl2 where the browser exposes it.
 const pending = [];
 let timer = null, mainGl = null;
 const board = () => {
  if (mainGl) return mainGl;
  const found = s.contexts.find(c => c.type === 'webgl2' && c.canvas.closest?.('.board-canvas'));
  if (!found) return null;
  mainGl = found.ctx; timer = mainGl.getExtension('EXT_disjoint_timer_query_webgl2');
  return mainGl;
 };
 const poll = () => {
  const gl = mainGl;
  if (!gl || !timer) return;
  const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
  while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
   const { query, frame } = pending.shift();
   if (!disjoint) { frame.gpu += gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6; }
   frame.gpuPending--;
   gl.deleteQuery(query);
  }
 };
 const flush = ts => {
  if (ts === s.curTs) return;
  poll();
  if (s.recording && s.curTs >= 0) s.log.push(Object.assign(s.cur, { ts: s.curTs }));
  s.curTs = ts; s.cur = { cpu: 0, draws: 0, tris: 0, gpu: 0, gpuPending: 0 };
 };
 window.requestAnimationFrame = cb => raf(ts => {
  flush(ts);
  const gl = board();
  let query = null;
  if (gl && timer) { query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); }
  const t0 = performance.now();
  try { cb(ts); } finally {
   s.cur.cpu += performance.now() - t0;
   if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({ query, frame: s.cur }); s.cur.gpuPending++; }
  }
 });
 const keepAlive = ts => { flush(ts); raf(keepAlive); };
 raf(keepAlive);
 for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
  if (!proto) continue;
  for (const [name, countArg] of [['drawArrays', 2], ['drawElements', 1], ['drawArraysInstanced', 2], ['drawElementsInstanced', 1], ['drawRangeElements', 3]]) {
   const original = proto[name];
   if (!original) continue;
   proto[name] = function (mode, ...rest) {
    s.cur.draws++;
    const count = rest[countArg - 1];
    const instances = name.endsWith('Instanced') ? rest[rest.length - 1] : 1;
    if (mode === 4) s.cur.tris += (count / 3) * instances;
    return original.call(this, mode, ...rest);
   };
  }
 }
 for (const proto of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
  const link = proto?.linkProgram;
  if (link) proto.linkProgram = function (program) {
   s.cur.links = (s.cur.links ?? 0) + 1;
   const source = (this.getAttachedShaders(program) ?? []).map(shader => this.getShaderSource(shader) ?? '').join('\n');
   (s.cur.linkNames ??= []).push(/#define SHADER_NAME (\S+)/.exec(source)?.[1] ?? /#define SHADER_TYPE (\S+)/.exec(source)?.[1] ?? 'unnamed');
   return link.call(this, program);
  };
 }
 const getContext = HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext = function (type, attrs) {
  const ctx = getContext.call(this, type, attrs);
  if (ctx && /webgl/.test(type) && !s.contexts.some(c => c.ctx === ctx)) s.contexts.push({ canvas: this, ctx, type, attrs });
  return ctx;
 };
 try {
  new PerformanceObserver(list => { for (const e of list.getEntries()) s.loaf.push({ start: e.startTime, duration: e.duration, blocking: e.blockingDuration ?? 0 }); })
   .observe({ type: 'long-animation-frame', buffered: true });
 } catch { /* LoAF unsupported */ }
}

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function summarise(log, loaf, windowMs) {
 const intervals = log.slice(1).map((f, i) => f.ts - log[i].ts).sort((a, b) => a - b);
 const cpu = log.map(f => f.cpu).sort((a, b) => a - b);
 const draws = log.map(f => f.draws).filter(Boolean).sort((a, b) => a - b);
 const tris = log.map(f => f.tris).filter(Boolean).sort((a, b) => a - b);
 const gpu = log.filter(f => f.draws && !f.gpuPending).map(f => f.gpu).sort((a, b) => a - b);
 const mean = intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length);
 return {
  frames: log.length,
  fps: round(1000 / mean),
  frameMs: { p50: round(pct(intervals, .5)), p95: round(pct(intervals, .95)), p99: round(pct(intervals, .99)), max: round(intervals.at(-1) ?? 0) },
  jankPct: { over20ms: round(100 * intervals.filter(v => v > 20).length / Math.max(1, intervals.length)), over33ms: round(100 * intervals.filter(v => v > 33.4).length / Math.max(1, intervals.length)) },
  mainThreadMsPerFrame: { p50: round(pct(cpu, .5), 2), p95: round(pct(cpu, .95), 2), max: round(cpu.at(-1) ?? 0, 2) },
  gpuMsPerFrame: gpu.length ? { samples: gpu.length, p50: round(pct(gpu, .5), 2), p95: round(pct(gpu, .95), 2), max: round(gpu.at(-1) ?? 0, 2) } : null,
  drawCalls: { p50: pct(draws, .5), max: draws.at(-1) ?? 0 },
  trianglesK: { p50: round(pct(tris, .5) / 1000), max: round((tris.at(-1) ?? 0) / 1000) },
  shaderLinks: { total: log.reduce((a, f) => a + (f.links ?? 0), 0), names: log.flatMap(f => f.linkNames ?? []), worstFrameMs: round(Math.max(0, ...log.slice(0, -1).map((f, i) => f.links ? log[i + 1].ts - f.ts : 0))) },
  longAnimationFrames: { count: loaf.length, blockingMsPerSec: round(loaf.reduce((a, e) => a + e.blocking, 0) / (windowMs / 1000)) },
 };
}

async function record(page, ms) {
 await page.evaluate(() => { const s = window.__perf; s.log = []; s.loaf = []; s.recording = true; });
 await page.waitForTimeout(ms);
 return page.evaluate(() => { const s = window.__perf; s.recording = false; return { log: s.log, loaf: s.loaf }; });
}

async function waitForServer(url, timeout = 20000) {
 const deadline = Date.now() + timeout;
 while (Date.now() < deadline) {
  try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 250));
 }
 throw new Error(`Preview server did not start at ${url}`);
}

/**
 * Per-feature render cost, against the dev server (it exposes the post-processing composer as `__boardFinish`).
 * Each toggle is measured on its own against the baseline, then all of them together as a candidate low tier.
 */
const TOGGLES = {
 'no-bloom': 'f.bloom.enabled = false;',
 'composer-no-msaa': 'for (const rt of [f.composer.renderTarget1, f.composer.renderTarget2]) { rt.samples = 0; rt.dispose(); }',
 'shadows-frozen': 'f.composer.renderer.shadowMap.autoUpdate = false;',
 'composer-dpr-1': 'const c = f.composer.renderer.domElement; f.composer.setPixelRatio(1); f.composer.setSize(c.clientWidth, c.clientHeight);',
 'point-lights-off': 'f.scene.traverse(o => { if (o.isPointLight) o.visible = false; });',
 'rect-lights-off': 'f.scene.traverse(o => { if (o.isRectAreaLight) o.visible = false; });',
};
const ABLATIONS = { baseline: '', ...TOGGLES, 'low-tier-combined': Object.values(TOGGLES).map(code => `{${code}}`).join('\n') };

async function runAblation(browser) {
 const out = { generatedAt: new Date().toISOString(), base: BASE, uncapped: UNCAPPED, viewport: '1440x900@2x', rows: [] };
 for (const [id, code] of Object.entries(ABLATIONS)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Enter evaluation build')); return b && !b.disabled; }, null, { timeout: 120000 });
  await page.getByRole('button', { name: 'Enter evaluation build' }).click();
  await page.waitForFunction(() => window.__boardFinish, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(code => {
   const finish = window.__boardFinish;
   const f = { ...finish, scene: finish.composer.passes.find(p => p.scene && p.camera).scene };
   new Function('f', code)(f);
  }, code);
  await page.waitForTimeout(2000);
  const r = await record(page, SAMPLE_MS);
  const summary = summarise(r.log, r.loaf, SAMPLE_MS);
  out.rows.push({ id, fps: summary.fps, frameMs: summary.frameMs, gpuMsPerFrame: summary.gpuMsPerFrame, mainThreadMsPerFrame: summary.mainThreadMsPerFrame, drawCalls: summary.drawCalls });
  console.log(`${id.padEnd(20)} ${summary.fps}fps frame p50 ${summary.frameMs.p50}ms | gpu p50 ${summary.gpuMsPerFrame?.p50 ?? '-'}ms p95 ${summary.gpuMsPerFrame?.p95 ?? '-'}ms | cpu p50 ${summary.mainThreadMsPerFrame.p50}ms | draws ${summary.drawCalls.p50}`);
  await context.close();
 }
 mkdirSync('docs/evidence', { recursive: true });
 writeFileSync(`docs/evidence/perf-ablation${UNCAPPED ? '-uncapped' : ''}.json`, JSON.stringify(out, null, 2));
}

let server;
if (!process.env.PERF_URL && !ABLATION) {
 server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
 await waitForServer(BASE);
}

const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'];
if (UNCAPPED) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
const browser = await chromium.launch({ headless: process.env.PERF_HEADED !== '1', channel: 'chrome', args });
const results = { generatedAt: new Date().toISOString(), base: BASE, uncapped: UNCAPPED, sampleMs: SAMPLE_MS, scenarios: [] };

try {
 if (ABLATION) await runAblation(browser);
 else for (const scenario of SCENARIOS) {
  const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: scenario.dpr, reducedMotion: scenario.reducedMotion ?? 'no-preference', hasTouch: !!scenario.touch });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (scenario.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu });
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const start = page.getByRole('button', { name: 'Enter evaluation build' });
  await start.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Enter evaluation build')); return b && !b.disabled; }, null, { timeout: 120000 });
  const boardReadyMs = Date.now() - t0;
  const load = await page.evaluate(() => {
   const entries = performance.getEntriesByType('resource');
   const by = {};
   for (const e of entries) {
    const ext = (new URL(e.name).pathname.split('.').pop() || 'other').toLowerCase();
    by[ext] = (by[ext] ?? 0) + (e.encodedBodySize || e.transferSize || 0);
   }
   const nav = performance.getEntriesByType('navigation')[0];
   return { resources: entries.length, bytesByType: by, totalBytes: Object.values(by).reduce((a, b) => a + b, 0), domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0) };
  });
  await page.waitForTimeout(1500);
  const setupIdle = summarise(...Object.values(await record(page, Math.min(SAMPLE_MS, 4000))), Math.min(SAMPLE_MS, 4000));
  await start.click();
  await page.waitForTimeout(3500);
  const idle = await record(page, SAMPLE_MS);
  const boardIdle = summarise(idle.log, idle.loaf, SAMPLE_MS);
  let resolution = null;
  const endTurn = page.locator('.end-turn');
  try {
   await page.waitForFunction(() => !document.querySelector('.end-turn')?.disabled, null, { timeout: 30000 });
   const hand = page.locator('.hand-card');
   const target = page.locator('.local-drop:not(.sealed)').first();
   if (await hand.count() && await target.count()) { await hand.first().dragTo(target).catch(() => {}); await page.waitForTimeout(400); }
   await endTurn.click();
   const r = await record(page, SAMPLE_MS);
   resolution = summarise(r.log, r.loaf, SAMPLE_MS);
  } catch (error) { resolution = { error: String(error).split('\n')[0] }; }
  let collapse = null;
  if (scenario.collapse) {
   try {
    const phase = () => page.locator('.phase-label').innerText();
    for (let turn = 2; turn <= 3; turn++) {
     await page.waitForFunction(t => document.querySelector('.phase-label')?.textContent?.includes(`RUNTIME ${t} OF 3`) && !document.querySelector('.end-turn')?.disabled, turn, { timeout: 90000 });
     if (turn === 3) await page.evaluate(() => { const s = window.__perf; s.log = []; s.loaf = []; s.recording = true; });
     await endTurn.click();
    }
    const startedAt = Date.now();
    let sawCollapse = false;
    while (Date.now() - startedAt < 60000) {
     if ((await phase()).includes('COLLAPSE')) sawCollapse = true;
     if (await page.locator('.draft-overlay').count()) break;
     await page.waitForTimeout(250);
    }
    const r = await page.evaluate(() => { const s = window.__perf; s.recording = false; return { log: s.log, loaf: s.loaf }; });
    collapse = { sawCollapse, durationMs: Date.now() - startedAt, ...summarise(r.log, r.loaf, Date.now() - startedAt) };
   } catch (error) { collapse = { error: String(error).split('\n')[0] }; }
  }
  const gpu = await page.evaluate(() => {
   const s = window.__perf;
   const main = s.contexts.filter(c => c.canvas.isConnected).sort((a, b) => b.canvas.width * b.canvas.height - a.canvas.width * a.canvas.height)[0] ?? s.contexts[0];
   if (!main) return null;
   const gl = main.ctx, info = gl.getExtension('WEBGL_debug_renderer_info');
   return {
    contexts: s.contexts.length,
    renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    drawingBuffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxSamples: gl.getParameter(gl.MAX_SAMPLES ?? 0x8D57),
    timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    cores: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null,
   };
  });
  const row = { ...scenario, boardReadyMs, load, gpu, setupIdle, boardIdle, resolution, collapse, errors };
  if (collapse) console.log(`${scenario.id.padEnd(24)} collapse ${JSON.stringify(collapse.error ?? { fps: collapse.fps, frameMs: collapse.frameMs, jank: collapse.jankPct, shaderLinks: collapse.shaderLinks, loaf: collapse.longAnimationFrames })}`);
  results.scenarios.push(row);
  console.log(`${scenario.id.padEnd(24)} ready ${String(boardReadyMs).padStart(6)}ms | idle ${boardIdle.fps}fps p95 ${boardIdle.frameMs.p95}ms cpu p50 ${boardIdle.mainThreadMsPerFrame.p50}ms gpu p50 ${boardIdle.gpuMsPerFrame?.p50 ?? '-'}ms p95 ${boardIdle.gpuMsPerFrame?.p95 ?? '-'}ms draws ${boardIdle.drawCalls.p50} tris ${boardIdle.trianglesK.p50}k | resolve ${resolution?.fps ?? '-'}fps p95 ${resolution?.frameMs?.p95 ?? '-'}ms cpu p95 ${resolution?.mainThreadMsPerFrame?.p95 ?? '-'}ms gpu p95 ${resolution?.gpuMsPerFrame?.p95 ?? '-'}ms jank>33 ${resolution?.jankPct?.over33ms ?? '-'}%`);
  await context.close();
 }
} finally {
 if (!ABLATION) {
  mkdirSync('docs/evidence', { recursive: true });
  writeFileSync(`docs/evidence/perf-probe${UNCAPPED ? '-uncapped' : ''}.json`, JSON.stringify(results, null, 2));
 }
 await browser.close();
 server?.kill();
}
