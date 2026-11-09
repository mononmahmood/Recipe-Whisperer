'use strict';

/* ============================================================
   Recipe Whisperer — deterministic UI tests.

   Starts a local static server, mocks TheMealDB, then exercises
   the real app: catalog, scan, gate, filters, scaling, list,
   sources, no-storage and mobile layout.

   Run:  node test.js
   ============================================================ */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');

const fixtures = require('./fixtures');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 4174);
const APP = `http://127.0.0.1:${PORT}/`;
const SHOTS = path.join(__dirname, 'shots-live');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let server = null;
let browser = null;
const results = [];

function ok(name, extra = '') {
  results.push({ name, passed: true, extra });
  console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`);
}

function fail(name, error) {
  results.push({ name, passed: false, error });
  console.error(`  FAIL  ${name}`);
  console.error(`        ${error && error.message ? error.message : error}`);
}

async function test(name, fn) {
  console.log(`\n▸ ${name}`);
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

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

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
      cwd: ROOT,
      stdio: 'ignore'
    });
    server.on('error', reject);
    waitForServer().then(resolve, reject);
  });
}

async function newPage(viewport = { width: 1280, height: 950 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
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
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { record('localStorage'); return fakeStorage('localStorage'); }
      });
    } catch (err) { /* noop */ }
    try {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        get() { record('sessionStorage'); return fakeStorage('sessionStorage'); }
      });
    } catch (err) { /* noop */ }
    try {
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get() { record('cookie.get'); return ''; },
        set() { record('cookie.set'); }
      });
    } catch (err) { /* noop */ }
    try {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        get() { record('indexedDB'); return undefined; }
      });
    } catch (err) { /* noop */ }
    try {
      Object.defineProperty(window, 'caches', {
        configurable: true,
        get() { record('caches'); return undefined; }
      });
    } catch (err) { /* noop */ }
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

  await page.route('**/cookbook-data.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "const COOKBOOK_RECIPES=[];const COOKBOOK_LICENSE={name:'Wikibooks Cookbook',license:'CC BY-SA 4.0',url:'https://en.wikibooks.org/wiki/Cookbook:Recipes',note:''};if(typeof module!=='undefined')module.exports={COOKBOOK_RECIPES,COOKBOOK_LICENSE};"
    });
  });
  await page.route('**/basedcooking-data.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "const BASEDCOOKING_RECIPES=[];const BASEDCOOKING_LICENSE={name:'based.cooking',license:'Unlicense',url:'https://based.cooking/'};if(typeof module!=='undefined')module.exports={BASEDCOOKING_RECIPES,BASEDCOOKING_LICENSE};"
    });
  });
  await page.route('**/opencorpus-data.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "const OPENCORPUS_RECIPES=[];const OPENCORPUS_LICENSE={name:'open-recipe-corpus',license:'CC BY-SA 4.0',url:'https://github.com/Rippy1911/open-recipe-corpus'};if(typeof module!=='undefined')module.exports={OPENCORPUS_RECIPES,OPENCORPUS_LICENSE};"
    });
  });
  await page.route('https://www.themealdb.com/api/json/v1/1/**', async route => {
    const body = fixtures.responseFor(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });
  await page.route('https://en.wikipedia.org/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: { pages: {} } }) });
  });
  await page.route('https://commons.wikimedia.org/**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: { pages: {} } }) });
  });

  page._errors = errors;
  page._context = context;
  return page;
}

async function closePage(page) {
  try { await page._context.close(); } catch (err) { /* noop */ }
}

async function openApp(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await waitCatalog(page);
}

async function waitCatalog(page) {
  await page.waitForFunction(
    () => document.querySelector('#statCatalog')?.textContent === '5',
    null,
    { timeout: 20000 }
  );
}

async function addIngredients(page, text) {
  await page.fill('#ingredientInput', text);
  await page.press('#ingredientInput', 'Enter');
}

async function waitScanDone(page, scanned) {
  await page.waitForFunction(n => {
    const scannedNow = Number(document.querySelector('#statScanned')?.textContent || 0);
    const meta = document.querySelector('#resultsMeta')?.textContent || '';
    const title = document.querySelector('#resultsTitle')?.textContent || '';
    const copy = document.querySelector('#scanCopy')?.textContent || '';
    const busy = /Updating|Scanning|Searching|Reading|Finding/i.test(meta + title + copy);
    if (busy) return false;
    return n == null ? scannedNow >= 0 : scannedNow >= Number(n) || (Number(n) > 0 && scannedNow > 0);
  }, scanned, { timeout: 25000 });
  // small settle for rendering
  await page.waitForTimeout(50);
}

async function cardTitles(page) {
  return page.$$eval('#cards .card-title', els => els.map(el => el.textContent.trim()));
}

async function assertNoErrors(page) {
  assert.deepEqual(page._errors, [], `page errors: ${page._errors.join(' | ')}`);
}

async function assertNoStorage(page) {
  const calls = await page.evaluate(() => window.__storageCalls || []);
  assert.deepEqual(calls, [], `storage APIs were touched: ${calls.join(', ')}`);
}

async function scanDefault(page) {
  await page.click('#timeChips [data-min="40"]');
  await addIngredients(page, '3 eggs, half an onion, canned tomatoes');
  await waitScanDone(page, 1);
}

/* ============================================================
   tests
   ============================================================ */

async function testCatalogAndCuisine(page) {
  await openApp(page);

  assert.equal(await page.textContent('#statCatalog'), '5');
  assert.equal(await page.textContent('#statCuisines'), '5');
  assert.match(await page.title(), /Recipe Whisperer/);

  const cuisines = await page.$$eval('#cuisineSelect option', els => els.map(el => el.textContent.trim()));
  assert.deepEqual(cuisines, ['All cuisines', 'Indian', 'Italian', 'Moroccan', 'Mexican', 'American']);

  const activeTime = await page.textContent('#timeChips .is-on');
  assert.equal(activeTime.trim(), 'Any', 'browsing should start with an unrestricted time limit');

  assert.equal(await page.locator('#regionSelect, #countrySelect').count(), 0, 'country/region filters should be gone');

  const brandHTML = await page.innerHTML('.brand-mark');
  assert.match(brandHTML, /brand-plate/);
  assert.match(brandHTML, /steam/);
  assert.ok(!/<svg/i.test(brandHTML), 'old SVG logo should be gone');

  const bodyText = await page.textContent('body');
  assert.ok(!/\bAI\b|artificial intelligence|ChatGPT|Claude|OpenCode/i.test(bodyText), 'AI reference found in UI');
  assert.ok(!/Tell me what.s in your kitchen/i.test(bodyText), 'old banner copy is still present');

  await page.screenshot({ path: path.join(SHOTS, '01-home.png'), fullPage: true, animations: 'disabled' });
  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testScanGateAndDetail(page) {
  await openApp(page);
  await scanDefault(page);

  const titles = await cardTitles(page);
  assert.ok(titles.length >= 1, `expected results, got ${titles.join(', ')}`);
  assert.ok(!titles.includes('Pasta Pomodoro'), 'recipe over the time limit passed');
  // Recipes that use the selected ingredients should be prioritized.
  assert.ok(titles.includes('Shakshuka') || titles.includes('Chickpea & Spinach Curry') || titles.includes('Chicken Tacos'),
    `expected ingredient matches, got ${titles.join(', ')}`);
  assert.match(await page.textContent('#resultsTitle'), /can make now|found|recipe/i);

  await page.click('[data-open="1001"]');
  await page.waitForSelector('#recipeSheet.is-open');

  assert.equal(await page.textContent('.detail-title'), 'Shakshuka');
  assert.match(await page.textContent('.detail-kicker'), /Moroccan|Tunisian/);
  assert.match(await page.textContent('.score-number'), /^\d+\/100$/);

  const sourceHref = await page.getAttribute('#sheetSourceTop', 'href');
  assert.equal(sourceHref, 'https://www.bbcgoodfood.com/recipes/shakshuka');
  const sourceCards = await page.$$eval('#sheetBody .source-card', els => els.map(el => el.getAttribute('href')));
  assert.ok(sourceCards.includes('https://www.bbcgoodfood.com/recipes/shakshuka'));
  assert.ok(sourceCards.includes('https://www.youtube.com/watch?v=shakshuka-demo'));

  const ingText = await page.textContent('.ing-list');
  assert.match(ingText, /400g\s*Canned Tomatoes/i);
  assert.match(ingText, /4\s*Eggs/i);
  assert.match(ingText, /100g\s*Feta/i);

  for (let i = 0; i < 4; i++) await page.click('[data-act="serv"][data-dir="1"]');
  assert.match(await page.textContent('.scale-box'), /Scale to 8 servings/);
  const scaledIngredients = await page.textContent('.ing-list');
  assert.match(scaledIngredients, /800g\s*Canned Tomatoes/i);
  assert.match(scaledIngredients, /1 tsp\s*Black Pepper/i);

  await page.click('[data-act="base"][data-dir="-1"]');
  await page.click('[data-act="base"][data-dir="-1"]');
  assert.match(await page.textContent('.scale-box'), /Recipe makes 2/);
  assert.match(await page.textContent('.ing-list'), /1600g\s*Canned Tomatoes/i);
  assert.match(await page.textContent('.section-h'), /scaled from 2/);

  const missingText = await page.textContent('.callout.missing');
  assert.match(missingText, /2 main ingredient/);
  assert.match(missingText, /Garlic/);
  assert.match(missingText, /Feta/);

  await page.locator('[data-act="add-missing"]').first().click();
  assert.equal(await page.textContent('#listBadge'), '2');

  await page.screenshot({ path: path.join(SHOTS, '03-detail.png'), animations: 'disabled' });
  await page.click('#sheetClose');
  await page.waitForFunction(() => !document.querySelector('#recipeSheet').classList.contains('is-open'));

  await page.click('#btnList');
  await page.waitForSelector('#sideSheet.is-open');
  const listText = await page.textContent('#sideBody');
  assert.match(listText, /Garlic/);
  assert.match(listText, /Feta/);
  assert.match(listText, /8 cloves/);
  assert.match(listText, /400g/);
  assert.equal(await page.locator('#sideBody .list-row').count(), 2);
  await page.click('#sideClose');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitCatalog(page);
  assert.equal(await page.evaluate(() => document.querySelector('#listBadge').hidden), true);
  await page.click('#btnList');
  await page.waitForSelector('#sideSheet.is-open');
  assert.match(await page.textContent('#sideBody'), /Your list is empty/);

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testMeasurementScaling(page) {
  await openApp(page);
  const scaled = await page.evaluate(() => ({
    half: LiveAPI.scaleMeasure('½ tsp', 2),
    mixed: LiveAPI.scaleMeasure('1½ cups', 2),
    mixedSpace: LiveAPI.scaleMeasure('1 ½ cups', 2),
    asciiMixed: LiveAPI.scaleMeasure('1 1/2 cups', 2),
    range: LiveAPI.scaleMeasure('1-2 tbsp', 2),
    decimal: LiveAPI.scaleMeasure('1.5 kg', 2),
    plain: LiveAPI.scaleMeasure('2 cloves', 0.5),
    unchanged: LiveAPI.scaleMeasure('to taste', 2)
  }));
  assert.deepEqual(scaled, {
    half: '1 tsp',
    mixed: '3 cups',
    mixedSpace: '3 cups',
    asciiMixed: '3 cups',
    range: '2–4 tbsp',
    decimal: '3 kg',
    plain: '1 clove',
    unchanged: 'to taste'
  });

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testTimeFilter(page) {
  await openApp(page);
  await scanDefault(page);

  await page.click('#timeChips [data-min="15"]');
  await waitScanDone(page, 1);
  const t15 = await cardTitles(page);
  assert.ok(!t15.includes('Pasta Pomodoro'));
  // very short time may return few/no matches in this fixture
  assert.match(await page.textContent('#resultsTitle'), /match|found|Nothing|can make/i);

  await page.click('#timeChips [data-min="30"]');
  await waitScanDone(page, 1);
  assert.deepEqual(await cardTitles(page), ['Chicken Tacos']);

  await page.click('#timeChips [data-min="60"]');
  await waitScanDone(page, 1);
  assert.ok((await cardTitles(page)).includes('Pasta Pomodoro'));

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testCuisineFilter(page) {
  await openApp(page);
  await scanDefault(page);
  await page.click('#timeChips [data-min="999"]');
  await waitScanDone(page, 1);
  assert.equal((await cardTitles(page)).length, 4);

  await page.selectOption('#cuisineSelect', 'Moroccan');
  await page.waitForFunction(() => document.querySelectorAll('#cards .card-title').length===1, null, {timeout:25000});
  assert.deepEqual(await cardTitles(page), ['Shakshuka']);

  await page.selectOption('#cuisineSelect', 'Indian');
  await page.waitForFunction(() => document.querySelector('#cards .card-title')?.textContent.includes('Chickpea'), null, {timeout:25000});
  assert.deepEqual(await cardTitles(page), ['Chickpea & Spinach Curry']);

  await page.selectOption('#cuisineSelect', 'Italian');
  await page.waitForFunction(() => document.querySelector('#cards .card-title')?.textContent.includes('Pasta'), null, {timeout:25000});
  assert.deepEqual(await cardTitles(page), ['Pasta Pomodoro']);

  await page.selectOption('#cuisineSelect', 'Mexican');
  await page.waitForFunction(() => document.querySelector('#cards .card-title')?.textContent.includes('Chicken Tacos'), null, {timeout:25000});
  assert.deepEqual(await cardTitles(page), ['Chicken Tacos']);

  await page.selectOption('#cuisineSelect', 'all');
  await waitScanDone(page, 1);
  await page.screenshot({ path: path.join(SHOTS, '02-results.png'), fullPage: true, animations: 'disabled' });
  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testDietFilter(page) {
  await openApp(page);
  await scanDefault(page);

  await page.selectOption('#dietSelect', 'vegan');
  await waitScanDone(page, 1);
  assert.deepEqual(await cardTitles(page), ['Chickpea & Spinach Curry']);

  await page.selectOption('#dietSelect', 'vegetarian');
  await waitScanDone(page, 1);
  assert.deepEqual(await cardTitles(page), ['Chickpea & Spinach Curry']);

  await page.selectOption('#dietSelect', 'all');
  await waitScanDone(page, 1);
  assert.equal((await cardTitles(page)).length, 3);

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testBrowseWithoutIngredients(page) {
  await openApp(page);
  await page.click('#timeChips [data-min="40"]');
  await page.click('#browseBtn');
  await waitScanDone(page, 1);

  const titles = await cardTitles(page);
  assert.equal(titles.length, 3);
  assert.ok(!titles.includes('Weeknight Pantry Cake'));
  assert.ok(titles.every(Boolean));

  await page.click('#cards .recipe-card');
  await page.waitForSelector('#recipeSheet.is-open');
  const body = await page.textContent('#sheetBody');
  assert.match(body, /Browsing without an ingredient list/i);
  assert.ok(!/main ingredients missing/.test(body), 'browse mode wrongly reports missing ingredients');
  assert.equal(await page.locator('[data-act="add-missing"]').count(), 0, 'browse mode offers add-missing');

  await page.click('#sheetClose');

  // Picking a cuisine with no ingredient list scans it immediately.
  await page.selectOption('#cuisineSelect', 'Mexican');
  await page.waitForFunction(() => (document.querySelector('#cards')?.textContent||'').includes('Chicken Tacos'), null, {timeout:25000});
  assert.ok((await cardTitles(page)).includes('Chicken Tacos'));

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testUnknownIngredient(page) {
  await openApp(page);
  await addIngredients(page, 'dragonfruit');
  await waitScanDone(page, 1);

  assert.equal((await cardTitles(page)).length, 0);
  assert.match(await page.textContent('#empty'), /No matching recipes found|Try removing/i);

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testSingleIngredientUsesIt(page) {
  await openApp(page);
  await addIngredients(page, 'eggs');
  await waitScanDone(page, 1);

  const titles = await cardTitles(page);
  assert.ok(titles.includes('Shakshuka'), `expected Shakshuka, got ${titles.join(', ')}`);
  // Every shown result should use the selected ingredient.
  const fits = await page.$$eval('#cards .card-fit', els => els.map(el => el.textContent));
  assert.ok(fits.every(t => /uses|make this now/i.test(t)));

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testSources(page) {
  await openApp(page);
  await page.click('#btnSources');
  await page.waitForSelector('#sideSheet.is-open');

  assert.equal(await page.textContent('#sideTitle'), 'Sources & data');
  const body = await page.textContent('#sideBody');
  assert.match(body, /TheMealDB/);
  assert.match(body, /not scraped|not copied into the scan/i);
  assert.match(body, /BBC Good Food/);
  assert.match(body, /Kenji/);
  assert.match(body, /AskCulinary/);

  assert.equal(await page.locator('#sideBody a[href="https://www.themealdb.com/"]').count(), 1);
  assert.equal(await page.locator('#sideBody a[href="https://www.reddit.com/r/AskCulinary/"]').count(), 1);
  assert.equal(await page.locator('#sideBody a[href="https://www.youtube.com/@KenjiLopezAlt"]').count(), 1);

  const linkAttrs = await page.$$eval('#sideBody a', els => els.map(el => ({
    target: el.getAttribute('target'),
    rel: el.getAttribute('rel'),
    href: el.getAttribute('href')
  })));
  assert.ok(linkAttrs.length >= 15);
  assert.ok(linkAttrs.every(link => link.target === '_blank'));
  assert.ok(linkAttrs.every(link => /noopener/.test(link.rel)));

  await page.click('#sideClose');

  // With ingredients set, the sheet offers real search links for the current list.
  await scanDefault(page);
  await page.click('#btnSources');
  await page.waitForSelector('#sideSheet.is-open');
  assert.match(await page.textContent('#sideBody'), /Search your list elsewhere/);
  const bbcSearch = await page.getAttribute('#sideBody a[href*="bbcgoodfood.com/search?q="]', 'href');
  assert.equal(bbcSearch, 'https://www.bbcgoodfood.com/search?q=eggs%20onion%20canned%20tomatoes');
  const youtubeSearch = await page.getAttribute('#sideBody a[href*="youtube.com/results?search_query="]', 'href');
  assert.equal(youtubeSearch, 'https://www.youtube.com/results?search_query=eggs%20onion%20canned%20tomatoes%20recipe');
  await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('is-on'));
  await page.screenshot({ path: path.join(SHOTS, '04-sources.png'), animations: 'disabled' });
  await page.click('#sideClose');

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testIngredientChips(page) {
  await openApp(page);
  await addIngredients(page, '3 eggs, half an onion, canned tomatoes');
  await waitScanDone(page, 1);

  const chips = await page.$$eval('#chips .chip', els => els.map(el => el.textContent.trim()));
  assert.equal(chips.length, 3);
  assert.ok(chips.some(text => /eggs/i.test(text)));
  assert.ok(chips.some(text => /onion/i.test(text)));
  assert.ok(chips.some(text => /canned tomatoes/i.test(text)));

  const quick = await page.$$eval('#quickAdd .quick-chip', els => els.slice(0, 6).map(el => ({
    label: el.textContent.trim(),
    disabled: el.disabled
  })));
  assert.ok(quick.some(item => /eggs/i.test(item.label) && item.disabled));
  assert.ok(quick.some(item => /onion/i.test(item.label) && item.disabled));

  await page.click('#chips [data-remove="egg"]');
  await page.waitForFunction(() => document.querySelectorAll('#chips .chip').length === 2);
  await waitScanDone(page, 1);

  await page.click('#clearChips');
  await page.waitForFunction(() => document.querySelectorAll('#chips .chip').length === 0);
  assert.equal(await page.textContent('#statPassed'), '0');

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testCookMode(page) {
  await openApp(page);
  await scanDefault(page);
  await page.click('#cards .recipe-card');
  await page.waitForSelector('#recipeSheet.is-open');
  await page.click('[data-act="cook"]');
  await page.waitForSelector('#cookOverlay.is-open');

  const total = await page.evaluate(() => Number(document.querySelector('#cookProgress').textContent.match(/of (\d+)/)[1]));
  assert.ok(total >= 3, `cook mode only has ${total} steps`);
  assert.match(await page.textContent('#cookProgress'), /^Step 1 of \d+$/);
  assert.ok((await page.textContent('#cookStep')).length > 20);
  assert.equal(await page.isVisible('#cookTimer'), false, 'a timer is offered on a step with no time');

  await page.click('#cookNext');
  assert.match(await page.textContent('#cookProgress'), /^Step 2 of \d+$/);
  assert.equal(await page.isVisible('#cookTimer'), true, 'timer missing from a timed step');

  await page.click('#cookTimer');
  await page.waitForFunction(() => document.querySelector('#cookTimer').classList.contains('running'));
  await page.waitForTimeout(300);
  assert.match(await page.textContent('#cookTimer'), /^\d+:\d{2}$/);
  await page.click('#cookTimer');
  assert.ok(!(await page.getAttribute('#cookTimer', 'class')).includes('running'));

  await page.click('#cookIngBtn');
  assert.equal(await page.isVisible('#cookIngredients'), true);
  await page.click('#cookIngBtn');
  assert.equal(await page.isVisible('#cookIngredients'), false);

  await page.click('#cookPrev');
  assert.match(await page.textContent('#cookProgress'), /^Step 1 of \d+$/);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#cookOverlay').classList.contains('is-open'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#recipeSheet').classList.contains('is-open'));
  await page.waitForFunction(() => !document.body.classList.contains('locked'));

  await assertNoErrors(page);
  await assertNoStorage(page);
}

async function testMobile(page) {
  await openApp(page);
  await scanDefault(page);
  await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('is-on'));

  for (const [width, height, name] of [[320, 740, '05-mobile-320.png'], [390, 844, '07-mobile-390.png']]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const widths = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      inner: window.innerWidth
    }));
    assert.ok(widths.doc <= width, `${name}: document overflows (${widths.doc} > ${width})`);
    assert.ok(widths.body <= width, `${name}: body overflows (${widths.body} > ${width})`);
    await page.screenshot({ path: path.join(SHOTS, name), fullPage: true, animations: 'disabled' });
  }

  await page.setViewportSize({ width: 320, height: 740 });
  await page.click('#cards .recipe-card');
  await page.waitForSelector('#recipeSheet.is-open');
  const sheet = await page.locator('#recipeSheet').boundingBox();
  assert.ok(sheet.width <= 320, `sheet is ${sheet.width}px wide on a 320px screen`);
  const widths = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    inner: window.innerWidth
  }));
  assert.ok(widths.doc <= 320, `detail sheet overflows (${widths.doc} > 320)`);
  await page.screenshot({ path: path.join(SHOTS, '06-mobile-detail-320.png'), animations: 'disabled' });

  await assertNoErrors(page);
  await assertNoStorage(page);
}

/* ============================================================
   main
   ============================================================ */

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  await startServer();
  browser = await chromium.launch({ executablePath: CHROME, headless: true });

  const pages = [];
  const run = async (name, fn, viewport) => {
    const page = await newPage(viewport);
    pages.push(page);
    await test(name, async () => {
      await fn(page);
      await closePage(page);
    });
  };

  await run('catalog, cuisines and plate logo', testCatalogAndCuisine);
  await run('measurement scaling and fractions', testMeasurementScaling);
  await run('search, detail, scaling and session list', testScanGateAndDetail);
  await run('time filter', testTimeFilter);
  await run('cuisine filter', testCuisineFilter);
  await run('diet filter', testDietFilter);
  await run('browse without ingredients', testBrowseWithoutIngredients);
  await run('unknown ingredient empty state', testUnknownIngredient);
  await run('single ingredient uses selected ingredient', testSingleIngredientUsesIt);
  await run('source directory and data policy', testSources);
  await run('ingredient chips and quick add', testIngredientChips);
  await run('cook mode, steps and timer', testCookMode);
  await run('320px and 390px layouts', testMobile);

  await test('bundled cookbook includes Bangladeshi and Indian recipes', async () => {
    const data = require('../assets/data/cookbook-data.js');
    const recipes = data.COOKBOOK_RECIPES || [];
    assert.ok(recipes.length >= 800, `expected a large cookbook, got ${recipes.length}`);
    const cuisines = new Set(recipes.map(r => r.cuisine));
    assert.ok(cuisines.has('Bangladeshi'), 'Bangladeshi cuisine missing');
    assert.ok(cuisines.has('Indian'), 'Indian cuisine missing');
    assert.ok(recipes.some(r => r.cuisine === 'Bangladeshi'), 'no Bangladeshi recipes');
    assert.ok(recipes.some(r => r.cuisine === 'Indian'), 'no Indian recipes');
    ok('bundled cookbook includes Bangladeshi and Indian recipes', `${recipes.length} recipes`);
  });

  for (const page of pages) {
    if (!page._context.isClosed?.()) await closePage(page);
  }
  await browser.close();
  server.kill();

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n${'='.repeat(58)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log(`screenshots: ${SHOTS}`);
  console.log('='.repeat(58));
  process.exit(failed ? 1 : 0);
})().catch(async err => {
  console.error('\nTest run crashed:', err);
  try { if (browser) await browser.close(); } catch (e) { /* noop */ }
  try { if (server) server.kill(); } catch (e) { /* noop */ }
  process.exit(1);
});
