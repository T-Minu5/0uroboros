/**
 * Guide acceptance gate for networked play: two browsers at one table through three Cycles, hidden information
 * enforced by the server (checked on the wire), a mid-Draft reload that resumes the seat, and both seats agreeing on
 * the public score. Real UI only. Writes docs/evidence/online-report.json and screenshots.
 *
 *   npm run test:online            # builds the server bundle, starts server + Vite, runs the gate
 *   ONLINE_CYCLES=3 ONLINE_HEADED=1 npm run test:online
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const cycles = Number(process.env.ONLINE_CYCLES || 3);
const serverPort = 8800 + Math.floor(Math.random() * 100);
const vitePort = 5300 + Math.floor(Math.random() * 100);
const prefix = 'docs/evidence/online';
mkdirSync('docs/evidence', { recursive: true });
const report = { cycles: [], wire: { framesChecked: 0, hiddenInfoViolations: [] }, log: {}, errors: [], reconnect: null, coverage: {} };

console.log('building server bundle');
execSync('npx vite build -c vite.server.config.ts --logLevel error', { stdio: 'inherit' });
// Sign-in is on with the console mailer: magic links appear in the server log, where the gate reads them.
const webOrigin = `http://127.0.0.1:${vitePort}`;
const server = spawn('node', ['dist/server/main.mjs'], { env: { ...process.env, PORT: String(serverPort), HOST: '127.0.0.1', OUROBOROS_AUTH: 'on', OUROBOROS_PUBLIC_URL: `http://127.0.0.1:${serverPort}`, OUROBOROS_WEB_ORIGIN: webOrigin }, stdio: ['ignore', 'pipe', 'inherit'] });
const magicLinks = [];
server.stdout.on('data', chunk => {
  if (process.env.ONLINE_VERBOSE) process.stdout.write(chunk);
  for (const line of String(chunk).split('\n')) { try { const entry = JSON.parse(line); if (entry.event === 'magic-link') magicLinks.push(entry.link); } catch { /* not JSON */ } }
});
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(vitePort), '--strictPort', '--logLevel', 'error'], { env: { ...process.env, VITE_GAME_SERVER_URL: `ws://127.0.0.1:${serverPort}` }, stdio: ['ignore', 'pipe', 'inherit'] });
const cleanup = () => { server.kill(); vite.kill(); };
process.on('exit', cleanup);

async function waitFor(url, label) {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ } await new Promise(r => setTimeout(r, 200)); }
  throw new Error(`${label} did not come up at ${url}`);
}
await waitFor(`http://127.0.0.1:${serverPort}/healthz`, 'game server');
await waitFor(`http://127.0.0.1:${vitePort}/`, 'vite');

const browser = await chromium.launch({ headless: !process.env.ONLINE_HEADED, channel: 'chrome' });
const seats = [];
for (const name of ['Ada', 'Bo']) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(`${name}: ${error.stack || error}`));
  page.on('console', message => { if (message.type() === 'error') void Promise.all(message.args().map(arg => arg.jsonValue().catch(() => '?'))).then(args => report.errors.push(`${name}: ${message.text()} ${args.slice(1).map(String).join(' ').slice(0, 600)}`)); });
  // Hidden information is enforced by the server: nothing the seat may not know ever arrives on the wire.
  page.on('websocket', socket => socket.on('framereceived', frame => {
    try {
      const message = JSON.parse(frame.payload);
      const view = message.view;
      if (!view) return;
      report.wire.framesChecked++;
      const them = view.players[1];
      if (them.hand.some(card => !card.hidden) || them.draw.some(card => !card.hidden) || view.players[0].draw.some(card => !card.hidden)) report.wire.hiddenInfoViolations.push({ seat: name, type: message.type, eventId: message.event?.id });
      for (const node of view.nodes) for (const placement of node.cards[1]) if (!placement.revealed && !('hidden' in placement.card)) report.wire.hiddenInfoViolations.push({ seat: name, type: message.type, faceDown: placement.card.id });
    } catch { /* not JSON */ }
  }));
  await page.goto(`http://127.0.0.1:${vitePort}/`);
  await page.getByRole('button', { name: 'Create table' }).waitFor();
  seats.push({ name, page, context });
}
const [ada, bo] = seats;
const shot = (seat, label) => seat.page.screenshot({ path: `${prefix}-${seat.name.toLowerCase()}-${label}.png` });

// Sign-in: Ada asks for a magic link, follows it, and comes back signed in; the seat then carries her account name.
await ada.page.getByLabel('E-mail for sign-in link').fill('ada.lovelace@example.com');
await ada.page.getByRole('button', { name: 'E-mail me a sign-in link' }).click();
await ada.page.getByRole('status').filter({ hasText: 'Check your e-mail' }).waitFor();
for (let i = 0; i < 50 && !magicLinks.length; i++) await new Promise(r => setTimeout(r, 100));
if (!magicLinks.length) throw new Error('The server logged no magic link');
await ada.page.goto(magicLinks[0]);
await ada.page.waitForURL(url => url.origin === webOrigin && !url.hash.includes('session='));
await ada.page.locator('[data-signed-in]').waitFor();
report.coverage.signIn = (await ada.page.locator('.online-account b').innerText());
if (report.coverage.signIn !== 'Ada Lovelace') throw new Error(`Signed in as "${report.coverage.signIn}", expected the account name`);

// Lobby: Ada creates (her name field was filled from the account), Bo joins by code.
await ada.page.getByRole('button', { name: 'Create table' }).click();
const code = await ada.page.locator('[data-room-code]').first().getAttribute('data-room-code');
if (!/^[A-Z0-9]{6}$/.test(code ?? '')) throw new Error(`Bad invite code: ${code}`);
await shot(ada, 'lobby');
await bo.page.getByPlaceholder('Name at the table').fill('Bo');
await bo.page.getByPlaceholder('Invite code').fill(code.toLowerCase());
await bo.page.getByRole('button', { name: 'Join' }).click();
report.code = code;

const phase = seat => seat.page.locator('.phase-label').innerText();
const endTurn = seat => seat.page.locator('.turn-dock > .end-turn');
/** Answers whatever choice the seat is shown; a dialog that resolves or re-renders mid-click is simply retried on the next loop. */
async function handleChoice(seat) {
  try { return await answerChoice(seat); } catch (error) { if (error?.name === 'TimeoutError') return false; throw error; }
}
async function answerChoice(seat) {
  // A recover effect chooses inside the Trash drawer: pick the first card, then confirm.
  const recovering = seat.page.locator('.zone-drawer.recovering');
  if (await recovering.count()) {
    const pick = recovering.locator('.zone-pick .zone-card').first();
    if (await pick.count()) { await pick.click({ timeout: 3000 }); await recovering.locator('.zone-confirm').click({ timeout: 3000 }); report.coverage.recoverChoice = (report.coverage.recoverChoice ?? 0) + 1; return true; }
  }
  const choice = seat.page.locator('[data-pending-choice], .choice-dialog[role="dialog"], .choice-overlay, .choice-panel').first();
  if (!await choice.count()) return false;
  const mode = await choice.getAttribute('data-choice-mode');
  if (mode === 'groups' || mode === 'select') {
    const picks = mode === 'groups' ? choice.locator('.choice-group-actions button[data-choice-option]:first-child') : choice.locator('button[data-choice-option]');
    const confirm = choice.locator('.choice-confirm');
    for (let i = 0; i < await picks.count() && !(mode === 'select' && await confirm.isEnabled()); i++) await picks.nth(i).click({ timeout: 3000 });
    await confirm.click({ timeout: 3000 });
  } else {
    const buttons = choice.locator('button[data-choice-option]:not(:disabled)');
    if (!await buttons.count()) return false;
    await buttons.first().click({ timeout: 3000 });
  }
  report.coverage.choice = (report.coverage.choice ?? 0) + 1;
  return true;
}
/** Waits until `test(phaseText)` holds on this seat, answering any choices it is asked on the way. */
async function until(seat, test, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await handleChoice(seat);
    const text = await phase(seat);
    if (text.includes('GAMEOVER')) throw new Error(`${seat.name}: game ended before the gate finished (${label})`);
    if (await test(text)) return;
    await seat.page.waitForTimeout(150);
  }
  await shot(seat, 'stuck');
  const state = await seat.page.evaluate(() => ({
    notice: document.querySelector('.status-bar span:nth-child(2)')?.textContent, endTurn: document.querySelector('.turn-dock > .end-turn')?.getAttribute('aria-label'),
    event: { ...document.querySelector('main.app')?.dataset }, choice: document.querySelector('[data-pending-choice], .choice-dialog, .choice-overlay, .choice-panel')?.textContent?.slice(0, 200),
    arena: document.querySelector('.arena')?.className, log: [...document.querySelectorAll('.log-events li')].slice(-3).map(el => el.textContent),
  }));
  throw new Error(`${seat.name}: timed out waiting for ${label}; phase is "${await phase(seat)}"; ${JSON.stringify(state)}`);
}
const runtimeLabel = (cycle, turn) => `CYCLE ${String(cycle).padStart(2, '0')} / RUNTIME ${turn} OF 3`;
const planning = async (seat, cycle, turn) => (await phase(seat)).includes(runtimeLabel(cycle, turn)) && await endTurn(seat).isEnabled() && !(await endTurn(seat).getAttribute('class'))?.includes('turn-waiting');

async function deployOne(seat) {
  const cards = await seat.page.locator('.hand-card').evaluateAll(els => els.map(el => el.dataset.cardId));
  for (const id of cards) {
    const card = seat.page.locator(`.hand-card[data-card-id="${id}"]`);
    const targets = await seat.page.locator('.local-drop:not(.sealed)').evaluateAll(els => els.map(el => el.dataset.nodeDrop));
    for (const node of targets) {
      if (!await card.count()) break;
      await card.dragTo(seat.page.locator(`[data-node-drop="${node}"]`));
      await seat.page.waitForTimeout(700);
      if (!await card.count()) return { id, node };
    }
  }
  return null;
}
async function logTexts(seat) {
  await seat.page.getByRole('button', { name: /^Log \d+/ }).click();
  const texts = await seat.page.locator('.log-events li').evaluateAll(els => els.map(el => el.textContent ?? ''));
  await seat.page.getByRole('button', { name: 'Close panel', exact: true }).click();
  return texts;
}
const score = seat => seat.page.evaluate(() => [0, 1].map(owner => Number(document.querySelector(`[data-resource="${owner}-vp"] b`)?.textContent ?? 'NaN')));

// Both seats are dealt in.
await until(ada, () => planning(ada, 1, 1), 'Ada dealt in');
await until(bo, () => planning(bo, 1, 1), 'Bo dealt in');
await shot(ada, 'dealt'); await shot(bo, 'dealt');

for (let cycle = 1; cycle <= cycles; cycle++) {
  const record = { cycle, turns: [] };
  for (let turn = 1; turn <= 3; turn++) {
    await until(ada, () => planning(ada, cycle, turn), `Ada planning ${cycle}/${turn}`);
    await until(bo, () => planning(bo, cycle, turn), `Bo planning ${cycle}/${turn}`);
    const placedA = await deployOne(ada);
    const placedB = await deployOne(bo);
    if (cycle === 1 && turn === 1 && placedA) {
      // Bo's Log names Ada's placement without the card.
      await bo.page.waitForTimeout(600);
      const texts = await logTexts(bo);
      const seen = texts.find(text => /Ada Lovelace deployed a face-down card/.test(text));
      if (!seen) throw new Error(`Bo's Log does not show Ada's face-down placement: ${texts.slice(-5).join(' | ')}`);
      report.log.faceDownSeen = seen;
      await shot(bo, 'opponent-facedown');
    }
    await endTurn(ada).click();
    await ada.page.locator('.turn-dock > .end-turn.turn-waiting').waitFor();
    if (cycle === 1 && turn === 1) {
      // The commit can be taken back while the other seat is still planning.
      await ada.page.locator('.turn-dock > .end-turn.turn-waiting').click();
      await ada.page.locator('.turn-dock > .end-turn.turn-ready').waitFor();
      report.coverage.undoCommit = true;
      await endTurn(ada).click();
      await ada.page.locator('.turn-dock > .end-turn.turn-waiting').waitFor();
      await shot(ada, 'waiting');
    }
    await endTurn(bo).click();
    const next = turn < 3 ? text => text.includes(runtimeLabel(cycle, turn + 1)) : text => text.includes('DRAFT');
    await Promise.all([until(ada, next, `Ada after ${cycle}/${turn}`), until(bo, next, `Bo after ${cycle}/${turn}`)]);
    record.turns.push({ turn, placedA, placedB });
  }
  await Promise.all([ada, bo].map(seat => seat.page.locator('.draft-overlay').waitFor()));
  const [a, b] = await Promise.all([score(ada), score(bo)]);
  if (a[0] !== b[1] || a[1] !== b[0]) throw new Error(`Seats disagree on the score: Ada sees ${a}, Bo sees ${b}`);
  record.score = { ada: a, bo: b };
  if (cycle === 1) {
    // Bo reloads mid-Draft and reclaims the seat from the saved token.
    await bo.page.reload();
    await bo.page.getByRole('button', { name: `Rejoin table ${code}` }).click();
    await bo.page.locator('.draft-overlay').waitFor();
    report.reconnect = { cycle, ok: true, phase: await phase(bo) };
    await shot(bo, 'rejoined');
  }
  await shot(ada, `draft-${cycle}`);
  for (const seat of [ada, bo]) {
    const end = seat.page.getByRole('button', { name: 'End Draft', exact: true });
    await end.waitFor();
    await seat.page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'End Draft' && !b.disabled));
    await end.click();
  }
  if (cycle < cycles) await Promise.all([ada, bo].map(seat => until(seat, text => text.includes(runtimeLabel(cycle + 1, 1)), `${seat.name} Cycle ${cycle + 1}`)));
  report.cycles.push(record);
}

const health = await (await fetch(`http://127.0.0.1:${serverPort}/healthz`)).json();
report.health = health;
report.ok = report.errors.length === 0 && report.wire.hiddenInfoViolations.length === 0 && report.cycles.length === cycles && report.reconnect?.ok === true;
writeFileSync(`${prefix}-report.json`, JSON.stringify(report, null, 2));
await browser.close();
cleanup();
console.log(JSON.stringify({ ok: report.ok, cycles: report.cycles.length, framesChecked: report.wire.framesChecked, violations: report.wire.hiddenInfoViolations.length, choices: report.coverage.choice ?? 0, errors: report.errors.slice(0, 5) }, null, 2));
process.exit(report.ok ? 0 : 1);
