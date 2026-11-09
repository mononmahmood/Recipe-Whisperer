'use strict';

/* ============================================================
   Recipe Whisperer — live smoke test.

   This one does NOT mock TheMealDB. It checks the real catalog,
   a real quality scan, a real detail record, no storage calls and
   no console errors.

   Run:  node live-smoke.js
   ============================================================ */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.LIVE_PORT || 4175);
const APP = `http://127.0.0.1:${PORT}/`;
const SHOTS = path.join(__dirname, 'shots-live');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let server = null;
let browser = null;

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(APP);
      if (res.ok) return;
    } catch (err) { /* not ready */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Local test server did not start');
}

async function waitFor(page, fn, label, timeout = 120000) {
  try {
    await page.waitForFunction(fn, null, { timeout });
  } catch (err) {
    throw new Error(`Timed out waiting for ${label}`);
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  await waitForServer();

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1360, height: 1000 },
    deviceScaleFactor: 1
  });

  await context.addInitScript(() => {
    window.__storageCalls = [];
    const record = (what) => { window.__storageCalls.push(what); };
    const fakeStorage = (name) => ({
      getItem() { record(`${name}.getItem`); return null; },
      setItem() { record(`${name}.setItem`); },
      removeItem() { record(`${name}.removeItem`); },
      clear() { record(`${name}.clear`); },
      key() { record(`${name}.key`); return null; },
      get length() { record(`${name}.length`); return 0; }
    });
    for (const key of ['localStorage', 'sessionStorage']) {
      try {
        Object.defineProperty(window, key, {
          configurable: true,
          get() { record(key); return fakeStorage(key); }
        });
      } catch (err) { /* noop */ }
    }
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get() { record('cookie.get'); return ''; },
        set() { record('cookie.set'); }
      });
    } catch (err) { /* noop */ }
    for (const key of ['indexedDB', 'caches']) {
      try {
        Object.defineProperty(window, key, {
          configurable: true,
          get() { record(key); return undefined; }
        });
      } catch (err) { /* noop */ }
    }
    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get() { record('serviceWorker'); return undefined; }
      });
    } catch (err) { /* noop */ }
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  const step = (label) => console.log(`  ${label}`);

  async function settleImages(page) {
    await page.evaluate(async () => {
      const root = document.documentElement;
      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(resolve => setTimeout(resolve, 900));
      document.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
      await Promise.all([...document.images].map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
          setTimeout(resolve, 12000);
        });
      }));
      window.scrollTo(0, 0);
      await new Promise(resolve => setTimeout(resolve, 400));
      root.style.scrollBehavior = previousBehavior;
    }).catch(() => {});
    await page.waitForTimeout(300);
  }

  console.log('\n▸ live catalog');
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => {
    const value = document.querySelector('#statCatalog')?.textContent;
    return value && value !== '—' && value !== '…';
  }, 'the live catalog');

  const catalog = await page.evaluate(() => ({
    meals: Number(document.querySelector('#statCatalog').textContent),
    cuisinesCount: Number(document.querySelector('#statCuisines').textContent),
    cuisines: [...document.querySelectorAll('#cuisineSelect option')].map(o => o.textContent.trim()),
    error: document.querySelector('#scanCopy').textContent
  }));
  assert.ok(catalog.meals >= 1200, `only ${catalog.meals} recipes in catalog`);
  assert.ok(catalog.cuisinesCount >= 15, `only ${catalog.cuisinesCount} cuisines`);
  assert.ok(catalog.cuisines.includes('Indian'));
  assert.ok(catalog.cuisines.includes('Bangladeshi'));
  assert.ok(catalog.cuisines.includes('Italian'));
  step(`${catalog.meals} recipes across ${catalog.cuisinesCount} cuisines`);
  await page.screenshot({ path: path.join(SHOTS, 'live-01-home.png'), fullPage: true, animations: 'disabled' });

  console.log('\n▸ live quality scan');
  await page.fill('#ingredientInput', '3 eggs, half an onion, canned tomatoes');
  await page.press('#ingredientInput', 'Enter');
  await waitFor(page, () => {
    const scanned = document.querySelector('#statScanned')?.textContent;
    const button = document.querySelector('#scanBtn');
    return scanned !== '0' &&
      button && !button.textContent.includes('Scanning') &&
      !document.querySelector('#resultsMeta')?.textContent.includes('Scanning');
  }, 'the live scan', 180000);

  const scan = await page.evaluate(() => ({
    scanned: Number(document.querySelector('#statScanned').textContent),
    passed: Number(document.querySelector('#statPassed').textContent),
    meta: document.querySelector('#resultsMeta').textContent,
    copy: document.querySelector('#scanCopy').textContent,
    cards: [...document.querySelectorAll('#cards .recipe-card')].map(card => ({
      title: card.querySelector('.card-title')?.textContent.trim(),
      score: parseInt(card.querySelector('.score-badge')?.textContent, 10),
      fit: card.querySelector('.card-fit')?.textContent.trim()
    }))
  }));

  assert.equal(scan.scanned, 32, `expected a 32-recipe batch, scanned ${scan.scanned}`);
  assert.ok(scan.passed >= 1, 'no live recipe passed the gate');
  assert.equal(scan.cards.length, scan.passed);
  assert.ok(scan.cards.every(card => card.score >= 62), 'a card below the gate was shown');
  assert.ok(scan.cards.every(card => card.title), 'a card is missing its title');
  step(`${scan.scanned} scanned, ${scan.passed} passed: ${scan.cards.map(c => `${c.title} (${c.score})`).join(' · ')}`);
  await settleImages(page);
  await page.screenshot({ path: path.join(SHOTS, 'live-02-results.png'), fullPage: true, animations: 'disabled' });

  console.log('\n▸ live detail and scaling');
  await page.click('#cards .recipe-card');
  await page.waitForSelector('#recipeSheet.is-open');
  await page.waitForFunction(() => document.querySelectorAll('.ing-list .ing-row').length > 0);

  const detail = await page.evaluate(() => ({
    title: document.querySelector('.detail-title')?.textContent.trim(),
    score: parseInt(document.querySelector('.score-number')?.textContent, 10),
    ingredients: [...document.querySelectorAll('.ing-text')].map(el => el.textContent.trim()),
    steps: document.querySelectorAll('.steps li').length,
    source: document.querySelector('#sheetSourceTop')?.getAttribute('href') || '',
    sourceCards: [...document.querySelectorAll('#sheetBody .source-card')].map(a => a.getAttribute('href')),
    gateNote: document.querySelector('.gate-note')?.textContent.trim()
  }));

  assert.ok(detail.title, 'live detail has no title');
  assert.ok(detail.score >= 62, `live detail score ${detail.score} is below the gate`);
  assert.ok(detail.ingredients.length >= 3, 'live detail has no ingredient list');
  assert.ok(detail.steps >= 1, 'live detail has no method steps');
  if (detail.gateNote) assert.match(detail.gateNote, /passed|gate|62/i);
  if (detail.source) assert.match(detail.source, /^https?:\/\//);
  assert.ok(detail.sourceCards.length >= 1, 'live detail has no source card');
  step(`${detail.title} — ${detail.score}/100, ${detail.ingredients.length} ingredients, ${detail.steps} steps`);

  const before = await page.textContent('.ing-list');
  await page.click('[data-act="serv"][data-dir="1"]');
  const after = await page.textContent('.ing-list');
  assert.match(await page.textContent('.scale-box'), /Scale to \d+ servings/);
  assert.notEqual(after, before, 'scaling did not change any quantity text');
  step('serving stepper changes the printed quantities');
  await settleImages(page);
  await page.screenshot({ path: path.join(SHOTS, 'live-03-detail.png'), animations: 'disabled' });

  const storage = await page.evaluate(() => window.__storageCalls || []);
  assert.deepEqual(storage, [], `storage APIs touched: ${storage.join(', ')}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  step('no storage APIs used, no console or page errors');

  await context.close();
  await browser.close();
  server.kill();

  console.log('\nLive smoke test passed.\n');
  process.exit(0);
})().catch(async err => {
  console.error('\nLive smoke test failed:', err.message);
  try { if (browser) await browser.close(); } catch (e) { /* noop */ }
  try { if (server) server.kill(); } catch (e) { /* noop */ }
  process.exit(1);
});
