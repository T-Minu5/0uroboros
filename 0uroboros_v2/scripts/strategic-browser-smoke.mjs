import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

// Real UI only. The seeded shuffle is reproducible; no game state is injected.
const cycles = Number(process.env.STRATEGIC_CYCLES || 4);
const seed = Number(process.env.STRATEGIC_SEED || 341);
const prefix = 'docs/evidence/strategic';
mkdirSync('docs/evidence', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(12000);
const report = { seed, requestedCycles: cycles, cycles: [], deployments: [], purchases: [], events: [], choices: [], banks: [], errors: [], coverage: {} };
const seenEvents = new Set();
page.on('pageerror', error => report.errors.push(error.stack || String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.addInitScript(seed => {
  let state = seed;
  Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}, seed);

async function screenshot(name) { await page.screenshot({ path: `${prefix}-${name}.png` }); }
async function observeBank(cycle, turn) {
  const cards = await page.locator('.live-bank .bank-slot[data-card-id]').evaluateAll(els => els.map(el => ({ owner: el.closest('.live-bank').dataset.owner, id: el.dataset.cardId, label: el.getAttribute('aria-label') })));
  if (cards.length) {
    report.banks.push({ cycle, turn, cards });
    if (!report.coverage.bank) {
      await screenshot('bank');
      await page.locator('.live-bank .bank-slot[data-card-id]').first().click();
      await page.getByRole('button', { name: 'Close card inspect', exact: true }).waitFor();
      await screenshot('bank-inspect');
      await page.getByRole('button', { name: 'Close card inspect', exact: true }).click();
      report.coverage.bankInspect = true;
    }
    report.coverage.bank = true;
  }
}
async function phase() { return page.locator('.phase-label').innerText(); }
async function resources() {
  return page.evaluate(() => ({
    phase: document.querySelector('.phase-label')?.textContent,
    local: document.querySelector('.local-console .resources')?.textContent,
    opponent: document.querySelector('.opponent-console .resources')?.textContent,
    totals: [0, 1].map(owner => ({ owner, actions: document.querySelector(`[data-resource="${owner}-actions"] b`)?.textContent, wallet: document.querySelector(`[data-resource="${owner}-wallet"] b`)?.textContent, vp: document.querySelector(`[data-resource="${owner}-vp"] b`)?.textContent })),
    wallet: document.querySelector('.draft-wallet')?.textContent,
    bank: [...document.querySelectorAll('.live-bank')].map(el => ({ owner: el.dataset.owner, cards: [...el.querySelectorAll('.bank-slot')].map(card => ({ id: card.dataset.cardId, text: card.textContent })) })),
    opponentWallet: document.querySelector('.draft-opponent')?.dataset.opponentWallet,
    opponentReady: document.querySelector('.draft-opponent')?.dataset.opponentReady,
    stock: [...document.querySelectorAll('.market-card')].map(el => ({
      id: el.dataset.marketId, name: el.querySelector('h3')?.textContent,
      supply: el.dataset.stock ?? el.querySelector('small')?.textContent,
      cost: el.dataset.cost,
    })),
  }));
}
async function collectLog(cycle, turn) {
  await page.getByRole('button', { name: /^Log \d+/ }).click();
  const events = await page.locator('.side-panel li').evaluateAll(els => els.map(el => ({
    id: el.dataset.eventId, kind: el.dataset.eventKind,
    owner: el.dataset.owner, cardId: el.dataset.cardId,
    text: el.textContent,
  })));
  for (const event of events) {
    const key = event.id || `${cycle}:${event.text}`;
    if (!seenEvents.has(key)) { seenEvents.add(key); report.events.push({ cycle, turn, ...event }); }
  }
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
}
async function handleChoice(cycle, turn) {
  const choice = page.locator('[data-pending-choice], .choice-dialog, .choice-overlay, .choice-panel').first();
  if (!await choice.count()) return false;
  const text = await choice.innerText();
  if (!report.coverage.choice) await screenshot('choice');
  const buttons = choice.locator('.choice-options button[data-choice-option]:not(:disabled)');
  if (!await buttons.count()) throw new Error(`Choice has no legal option: ${text}`);
  const draw = buttons.filter({ hasText: /^\+1 Card$/ });
  const option = !report.coverage.drawChoice && await draw.count() ? draw.first() : buttons.first();
  const selected = await option.innerText();
  await option.click();
  if (selected === '+1 Card') report.coverage.drawChoice = true;
  report.choices.push({ cycle, turn, text, selected });
  report.coverage.choice = true;
  return true;
}
async function waitForRuntime(cycle, turn) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await handleChoice(cycle, turn);
    if ((await phase()).includes(`CYCLE ${String(cycle).padStart(2, '0')} / RUNTIME ${turn} OF 3`) && await page.locator('.end-turn').isEnabled()) return;
    if ((await phase()).includes('GAMEOVER')) throw new Error('Game ended before requested strategic coverage');
    await page.waitForTimeout(150);
  }
  throw new Error(`Runtime ${cycle}/${turn} did not become available`);
}
async function deployHand(cycle, turn) {
  const hand = page.locator('.hand-card');
  const cards = await hand.evaluateAll(els => els.map(el => ({ id: el.dataset.cardId, text: el.textContent })));
  // Acquisitions first, then action/draw cards, then zero-cost VP cards.
  cards.sort((a, b) => Number(b.id.includes('acquired')) - Number(a.id.includes('acquired')) || Number(/Action|Cards/.test(b.text)) - Number(/Action|Cards/.test(a.text)));
  for (const item of cards) {
    const card = page.locator(`.hand-card[data-card-id="${item.id}"]`);
    if (!await card.count()) continue;
    const targets = await page.locator('.local-drop:not(.sealed)').evaluateAll(els => els.map(el => ({ node: el.dataset.nodeDrop, count: el.querySelectorAll('.field-card').length })));
    targets.sort((a, b) => a.count - b.count || Number(a.node) - Number(b.node));
    for (const target of targets) {
      if (!await card.count()) break;
      await card.dragTo(page.locator(`[data-node-drop="${target.node}"]`));
      await page.waitForTimeout(650);
      if (await page.locator('[aria-label="Close card inspect"]').count()) throw new Error('Drag opened inspect');
      if (!await card.count()) { report.deployments.push({ cycle, turn, node: target.node, ...item }); break; }
    }
  }
}
async function finishTurn(cycle, turn) {
  await page.locator('.end-turn').click();
  const deadline = Date.now() + 180000;
  let collapse = false;
  while (Date.now() < deadline) {
    if (await handleChoice(cycle, turn)) continue;
    const current = await phase();
    if (current.includes('COLLAPSE')) collapse = true;
    if (current.includes('GAMEOVER')) throw new Error('Game ended before requested strategic coverage');
    if (turn < 3 && current.includes(`RUNTIME ${turn + 1} OF 3`) && await page.locator('.end-turn').isEnabled()) return;
    if (turn === 3 && await page.locator('.draft-overlay').count()) { if (!collapse) throw new Error('Draft reached without visible Collapse'); return; }
    await page.waitForTimeout(150);
  }
  throw new Error(`Resolution timed out at Cycle ${cycle}, turn ${turn}`);
}

function purchasePriority(name, text, already, cycle, category) {
  // Prefer new economy, Duration and movement capabilities over repeat starters.
  const planned = { 'Chronos Cache': 140, 'Temporal Rift': 130, 'Ghost Key': 120, 'Banishing Ritual': 110, 'Quantum Telemetry': 100 };
  if (cycle >= 3 && category === 'VP' && !report.purchases.some(p => p.category === 'VP')) return 190;
  if (cycle >= 2 && category === 'Crypto' && !report.purchases.some(p => p.category === 'Crypto')) return 180;
  if (planned[name]) return planned[name] - (already.has(name) ? 120 : 0);
  const novel = already.has(name) ? -30 : 30;
  return novel + (/Duration|next Cycle|next Runtime|Bank|bank|save|stored/.test(text) ? 70 : 0)
    + (/move|relocat|transfer.*Node/i.test(text) ? 60 : 0)
    + (/Crypto|Draw|Action/.test(text) ? 40 : 0);
}
async function shop(cycle) {
  const end = page.getByRole('button', { name: 'End Draft', exact: true });
  await end.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'End Draft' && !b.disabled));
  if (cycle === 1) {
    const opponentReady = await page.locator('.draft-opponent').getAttribute('data-opponent-ready');
    if (opponentReady !== 'true') {
      await end.click();
      const resume = page.getByRole('button', { name: 'Resume Draft', exact: true });
      if (await resume.count()) {
        if (await page.locator('.acquire-card:not(:disabled)').count()) throw new Error('Ready player can still acquire');
        await resume.click();
        report.coverage.endResume = true;
      } else throw new Error('Opponent completed during early-end test; Draft cannot resume');
    } else report.coverage.endResumeSkipped = 'Opponent was already ready on first Draft entry';
    const counts = await page.locator('.market-card').evaluateAll(els => Object.fromEntries(['Base', 'VP', 'Crypto', 'Chaos'].map(category => [category, els.filter(el => el.dataset.category === category).length])));
    if (JSON.stringify(counts) !== JSON.stringify({ Base: 9, VP: 3, Crypto: 3, Chaos: 3 })) throw new Error(`Market pile count mismatch: ${JSON.stringify(counts)}`);
    report.coverage.marketCounts = counts;
    for (const category of ['Base', 'VP', 'Crypto', 'Chaos']) {
      await page.getByRole('button', { name: category, exact: true }).click();
      if (await page.locator('.market-card').count() !== counts[category]) throw new Error(`${category} filter count incorrect`);
    }
    await page.getByRole('button', { name: 'All', exact: true }).click();
    report.coverage.marketFilters = true;
  }
  await page.waitForTimeout(450);
  await page.locator('.draft-overlay').evaluate(el => { el.scrollTop = 0; });
  const before = await resources();
  await screenshot(`draft-${cycle}`);
  const claim = page.getByRole('button', { name: 'Claim free privilege', exact: true });
  if (await claim.count() && await claim.isEnabled()) { await claim.click(); await page.waitForTimeout(1800); }
  const owned = new Set(report.purchases.map(p => p.name));
  for (let attempt = 0; attempt < 8; attempt++) {
    const options = await page.locator('.market-card').evaluateAll(els => els.map(el => ({
      id: el.dataset.marketId, name: el.querySelector('h3')?.textContent || '', text: el.textContent,
      enabled: !!el.querySelector('.acquire-card:not(:disabled)'), stock: el.dataset.stock, cost: el.dataset.cost, category: el.dataset.category,
    })).filter(el => el.enabled));
    options.sort((a, b) => purchasePriority(b.name, b.text, owned, cycle, b.category) - purchasePriority(a.name, a.text, owned, cycle, a.category));
    if (!options.length) break;
    const option = options[0];
    const row = option.id ? page.locator(`[data-market-id="${option.id}"]`) : page.locator('.market-card').filter({ has: page.getByRole('heading', { name: option.name, exact: true }) });
    await row.locator('.acquire-card').click();
    report.purchases.push({ cycle, owner: 0, ...option, resourcesAfter: await resources() });
    owned.add(option.name);
    await page.waitForTimeout(220);
  }
  await collectLog(cycle, 'draft');
  const after = await resources();
  if (cycle === 1) {
    await page.locator('.market-card').last().scrollIntoViewIfNeeded();
    const heading = await page.locator('.draft-heading').boundingBox();
    report.coverage.stickyDraftHeading = !!heading && heading.y >= 65 && heading.y + heading.height < 1000;
    await screenshot('draft-scrolled');
    if (!report.coverage.stickyDraftHeading) throw new Error('Draft Wallet/timer/end controls scrolled out of view');
  }
  await page.locator('.draft-overlay').evaluate(el => { el.scrollTop = 0; });
  await screenshot(`draft-${cycle}-purchased`);
  await end.click();
  await page.getByRole('button', { name: 'Next Cycle', exact: true }).waitFor({ timeout: 90000 });
  await collectLog(cycle, 'draft-ended');
  report.cycles.push({ cycle, before, after, pace: cycle % 2 ? 'normal' : 'fast' });
  await page.getByRole('button', { name: 'Next Cycle', exact: true }).click();
}

try {
  await page.goto(process.env.STRATEGIC_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Enter evaluation build' }).click();
  for (let cycle = 1; cycle <= cycles; cycle++) {
    await waitForRuntime(cycle, 1);
    const desired = cycle % 2 ? 'Normal pace' : 'Fast pace';
    if (!await page.getByRole('button', { name: desired, exact: true }).count()) await page.getByRole('button', { name: /^(Normal|Fast) pace$/ }).click();
    for (let turn = 1; turn <= 3; turn++) {
      await waitForRuntime(cycle, turn);
      await observeBank(cycle, turn);
      await deployHand(cycle, turn);
      if (turn === 3) await screenshot(`board-${cycle}`);
      await collectLog(cycle, turn);
      await finishTurn(cycle, turn);
      await collectLog(cycle, `${turn}-resolved`);
    }
    await shop(cycle);
    console.log(`Strategic UI: completed Cycle ${cycle}/${cycles}`);
    writeFileSync(`${prefix}-browser.json`, JSON.stringify(report, null, 2));
  }
  const purchaseEvents = report.events.filter(e => e.kind === 'purchase');
  report.coverage.bothOwnersPurchased = [0, 1].every(owner => purchaseEvents.some(e => Number(e.owner) === owner));
  report.coverage.acquiredLocalDeployed = report.deployments.filter(e => e.id.includes('acquired'));
  const acquiredIds = new Set(purchaseEvents.filter(e => e.cardId).map(e => e.cardId));
  report.coverage.acquiredRevealed = report.events.filter(e => e.kind === 'reveal' && acquiredIds.has(e.cardId));
  report.purchaseSummary = report.cycles.map(({ cycle }) => ({ cycle, players: [0, 1].map(owner => ({ owner, purchases: purchaseEvents.filter(e => e.cycle === cycle && Number(e.owner) === owner).map(e => ({ cardId: e.cardId, text: e.text })) })) }));
  report.finalPhase = await phase();
  await screenshot('final');
  if (!report.coverage.bothOwnersPurchased) throw new Error('Both-owner purchase evidence missing');
  if (!report.coverage.acquiredLocalDeployed.length) throw new Error('No purchased local card returned to play');
  if (![0, 1].every(owner => report.coverage.acquiredRevealed.some(e => Number(e.owner) === owner))) throw new Error('New acquisitions were not observed revealing for both owners');
  if (cycles >= 3 && !['VP', 'Crypto'].every(category => report.purchases.some(p => p.category === category))) throw new Error('Local VP/Crypto buying coverage incomplete');
  if (report.errors.length) throw new Error(report.errors.join('\n'));
  report.passed = true;
} catch (error) {
  report.failure = error.stack || String(error);
  console.error(report.failure);
  await screenshot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(`${prefix}-browser.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
