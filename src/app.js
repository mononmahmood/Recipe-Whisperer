'use strict';

/* ============================================================
   Recipe Whisperer — app shell

   All state below lives in memory for this tab only. There is no
   localStorage, sessionStorage, cookie, IndexedDB or service worker.
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const plural = (n, one, many) => n === 1 ? one : many;

function formatMinutes(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 999) return 'Any time';
  if (n >= 60) {
    const h = Math.floor(n / 60);
    const m = n % 60;
    return `${h} hr${h === 1 ? '' : 's'}${m ? ` ${m} min` : ''}`;
  }
  return `${Math.round(n)} min`;
}

const state = {
  ingredients: [],
  minutes: 999,
  cuisine: 'all',
  diet: 'all',
  pantry: new Set(DEFAULT_PANTRY),
  catalog: null,
  catalogLoading: false,
  catalogError: '',
  results: [],
  rejected: [],
  scanned: 0,
  totalCandidates: 0,
  nextOffset: null,
  hasScanned: false,
  scanMode: 'ingredients',
  scanPending: false,
  scanning: false,
  scanProgress: { done: 0, total: 0 },
  scanToken: 0,
  scanError: '',
  lastScan: null,
  list: [],
  current: null,
  detailTarget: 4,
  detailBase: 4,
  checkedIngs: new Set(),
  sideMode: 'list',
  lastFocus: null,
  activeTimer: null,
  cookSteps: [],
  cookIdx: 0,
  cookReturnFocus: null,
  wakeLock: null,
  toastTimer: null
};

let scanTimer = null;
let audioCtx = null;

/* ============================================================
   rendering: controls
   ============================================================ */
function renderChips() {
  const wrap = $('#chips');
  if (!state.ingredients.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = state.ingredients.map(i => `
    <span class="chip">
      <span>${esc(i.raw || i.name)}</span>
      <button type="button" data-remove="${esc(i.family)}" aria-label="Remove ${esc(i.name)}">
        <svg class="icon"><use href="#i-x"/></svg>
      </button>
    </span>
  `).join('') + '<button type="button" class="chip-clear" id="clearChips">Clear all</button>';
}

function renderQuickAdd() {
  const wrap = $('#quickAdd');
  const have = new Set(state.ingredients.map(i => i.family));
  wrap.innerHTML = QUICK_ADD.map(([key, label]) => {
    const family = LiveAPI.familyOf(key);
    const on = have.has(family);
    return `<button type="button" class="quick-chip" data-quick="${esc(label)}" ${on ? 'disabled' : ''}>${on ? '✓ ' : '+ '}${esc(label)}</button>`;
  }).join('');
}

function renderTime() {
  $('#timeChips').innerHTML = TIME_OPTIONS.map(option => `
    <button type="button" class="${state.minutes === option.min ? 'is-on' : ''}" data-min="${option.min}" aria-pressed="${state.minutes === option.min}">
      ${esc(option.label)}
    </button>
  `).join('');
}

function renderDiet() {
  const select = $('#dietSelect');
  const current = DIET_OPTIONS.some(d => d.key === state.diet) ? state.diet : 'all';
  state.diet = current;
  select.innerHTML = DIET_OPTIONS.map(d =>
    `<option value="${esc(d.key)}" ${d.key === current ? 'selected' : ''}>${esc(d.label)}</option>`
  ).join('');
}

function renderCuisineSelect() {
  const select = $('#cuisineSelect');
  if (!state.catalog) {
    select.innerHTML = '<option value="all">All cuisines</option>';
    return;
  }
  const cuisines = state.catalog.cuisines || [];
  const current = state.cuisine === 'all' || cuisines.includes(state.cuisine) ? state.cuisine : 'all';
  state.cuisine = current;
  select.innerHTML = '<option value="all">All cuisines</option>' +
    cuisines.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

function renderPantryLine() {
  const n = state.pantry.size;
  const text = n
    ? `Assuming ${n} pantry basics (salt, oil, spices and more)`
    : 'No pantry basics assumed';
  $('#pantryText').textContent = text;
}

function renderBadges() {
  const open = state.list.filter(x => !x.checked).length;
  const badge = $('#listBadge');
  badge.hidden = open === 0;
  badge.textContent = open;
}

function renderScoreParts() {
  const sp = $('#scoreParts'); if(!sp) return; sp.innerHTML = SCORE_PARTS.map(part => `
    <div class="score-row">
      <span>${esc(part.label)}</span><strong>${part.max} pts</strong>
      <span class="score-bar"><span style="width:${part.max}%"></span></span>
    </div>
  `).join('');
}

/* ============================================================
   catalog
   ============================================================ */
async function loadCatalog() {
  state.catalogLoading = true;
  state.catalogError = '';
  updateScanUI();
  try {
    const catalog = await LiveAPI.loadCatalog(({ done, total }) => {
      const copy = $('#scanCopy');
      if (copy) copy.innerHTML = `Loading recipes… <strong>${done}/${total}</strong> categories checked.`;
      const sc=$('#statCatalog'); if(sc) sc.textContent='…';
    });
    state.catalog = catalog;
    state.catalogLoading = false;
    renderCuisineSelect();
    const sc=$('#statCatalog'), su=$('#statCuisines'); if(sc) sc.textContent=catalog.meals.length; if(su) su.textContent=catalog.cuisines.length;
    updateScanUI();
    // Warm the ingredient index in the background. It is still memory-only.
    LiveAPI.loadIngredients().catch(() => {});
  } catch (err) {
    state.catalogLoading = false;
    state.catalogError = err && err.message ? err.message : 'Could not load the recipes.';
    updateScanUI();
  }
}

/* ============================================================
   scan state
   ============================================================ */
function resetScan() {
  state.scanToken++;
  state.scanning = false;
  state.scanPending = false;
  state.results = [];
  state.rejected = [];
  state.scanned = 0;
  state.totalCandidates = 0;
  state.nextOffset = null;
  state.hasScanned = false;
  state.scanProgress = { done: 0, total: 0 };
  state.scanError = '';
  state.lastScan = null;
}

function scheduleScan(delay = 120) {
  if (!state.ingredients.length && state.scanMode !== 'browse') {
    resetScan();
    updateScanUI();
    renderResults();
    return;
  }
  clearTimeout(scanTimer);
  resetScan();
  state.scanPending = true;
  updateScanUI();
  renderResults();
  scanTimer = setTimeout(() => {
    state.scanPending = false;
    runScan({ append: false });
  }, delay);
}

function scheduleFilterScan(delay = 80) {
  if (!state.ingredients.length) state.scanMode = 'browse';
  scheduleScan(delay);
}

async function runScan(opts = {}) {
  const append = !!opts.append;
  if (state.scanning) return;

  if (!append && !state.ingredients.length && state.scanMode !== 'browse') {
    return;
  }

  state.scanMode = state.ingredients.length ? 'ingredients' : 'browse';
  state.scanning = true;
  state.scanPending = false;
  state.scanError = '';
  const token = ++state.scanToken;

  if (!append) {
    state.results = [];
    state.rejected = [];
    state.scanned = 0;
    state.totalCandidates = 0;
    state.nextOffset = null;
    state.hasScanned = false;
  }
  state.scanProgress = { done: 0, total: 0 };
  updateScanUI();
  renderResults();

  try {
    const result = await LiveAPI.scan({
      ingredients: state.ingredients,
      cuisine: state.cuisine,
      minutes: state.minutes,
      diet: state.diet,
      pantryFamilies: [...state.pantry],
      offset: append ? (state.nextOffset || 0) : 0,
      limit: 36,
      onProgress: (progress) => {
        if (token !== state.scanToken) return;
        state.scanProgress = progress;
        updateScanUI();
      }
    });

    if (token !== state.scanToken) return;

    if (append) {
      const seen = new Set(state.results.map(r => r.id));
      for (const recipe of result.results) {
        if (!seen.has(recipe.id)) {
          state.results.push(recipe);
          seen.add(recipe.id);
        }
      }
      state.rejected = [...state.rejected, ...result.rejected].sort((a, b) => b.score - a.score).slice(0, 30);
      state.scanned += result.scanned;
    } else {
      state.results = result.results;
      state.rejected = result.rejected;
      state.scanned = result.scanned;
    }

    state.results.sort((a, b) => {
      if (state.ingredients.length) {
        return (b.canMakeNow ? 1 : 0) - (a.canMakeNow ? 1 : 0) ||
          (a.missingCount || 0) - (b.missingCount || 0) ||
          b.usedFamilies.length - a.usedFamilies.length ||
          b.score - a.score ||
          a.time - b.time ||
          a.title.localeCompare(b.title);
      }
      return b.score - a.score || a.time - b.time || a.title.localeCompare(b.title);
    });
    state.totalCandidates = result.totalCandidates;
    state.nextOffset = result.nextOffset;
    state.hasScanned = true;
    state.lastScan = result;
  } catch (err) {
    if (token !== state.scanToken) return;
    state.scanError = err && err.message ? err.message : 'The scan failed. Check your connection and try again.';
    state.hasScanned = true;
  } finally {
    if (token === state.scanToken) {
      state.scanning = false;
      updateScanUI();
      renderResults();
    }
  }
}

/* ============================================================
   rendering: scan panel + results
   ============================================================ */
function updateScanUI() {
  const sc=$('#statCatalog'), su=$('#statCuisines'), ss=$('#statScanned'), sp=$('#statPassed');
  if(sc) sc.textContent = state.catalog ? state.catalog.meals.length : (state.catalogLoading ? '…' : '—');
  if(su) su.textContent = state.catalog ? state.catalog.cuisines.length : '—';
  if(ss) ss.textContent = state.scanned;
  if(sp) sp.textContent = state.results.length;

  let pct = 0;
  if (state.scanning && state.scanProgress.total) {
    pct = Math.round((state.scanProgress.done / state.scanProgress.total) * 100);
  } else if (state.totalCandidates > 0 && state.scanned > 0) {
    pct = Math.round((state.scanned / state.totalCandidates) * 100);
  }
  const sm=$('#scanMeterFill'); if(sm) sm.style.width = `${Math.max(0, Math.min(100, pct))}%`;

  const copy = $('#scanCopy');
  if (state.catalogError) {
    copy.innerHTML = `${esc(state.catalogError)} <button type="button" class="chip-clear" data-act="retry-catalog">Retry</button>`;
  } else if (state.catalogLoading) {
    copy.innerHTML = 'Loading recipes…';
  } else if (state.scanError) {
    copy.innerHTML = `${esc(state.scanError)} <button type="button" class="chip-clear" data-act="rescan">Try again</button>`;
  } else if (state.scanning) {
    const done = state.scanProgress.done;
    const total = state.scanProgress.total;
    copy.innerHTML = `Searching recipes… <strong>${done}/${total || '…'}</strong> checked.`;
  } else if (state.scanPending) {
    copy.innerHTML = 'Updating results…';
  } else if (state.hasScanned) {
    if (state.results.length) {
      const makeNow = state.results.filter(r => r.canMakeNow).length;
      let text = `Found <strong>${state.results.length}</strong> recipes from ${state.totalCandidates} matches.`;
      if (state.ingredients.length && makeNow) text += ` <strong>${makeNow}</strong> can be made with what you have.`;
      if (state.lastScan && state.lastScan.detailFailures) text += ` ${state.lastScan.detailFailures} could not be loaded.`;
      if (state.nextOffset != null) text += ' More below.';
      copy.innerHTML = text;
    } else {
      copy.innerHTML = `No matches yet. Try another ingredient, pick a cuisine, or open up the time.`;
    }
  } else {
    copy.innerHTML = state.catalog
      ? `Ready: <strong>${state.catalog.meals.length}</strong> recipes across <strong>${state.catalog.cuisines.length}</strong> cuisines. Add ingredients to search instantly.`
      : 'Loading recipes…';
  }

  $('#scanBtn').textContent = state.scanning ? 'Scanning…' : 'Find recipes';
  const catalogReady = !!state.catalog || !!state.catalogError;
  $('#scanBtn').disabled = state.scanning || !catalogReady;
  $('#browseBtn').disabled = state.scanning || !catalogReady;

  const canScanMore = state.hasScanned && state.nextOffset != null && !state.scanning && !state.scanPending;
  $('#scanMoreWrap').hidden = !canScanMore;
  $('#scanMore').disabled = state.scanning;

  const meta = $('#resultsMeta');
  if (state.scanning) {
    meta.innerHTML = `Searching <strong>${state.scanProgress.done}</strong> / ${state.scanProgress.total || '…'}…`;
  } else if (state.scanPending) {
    meta.textContent = 'Updating…';
  } else if (state.hasScanned) {
    const makeNow = state.results.filter(r => r.canMakeNow).length;
    meta.innerHTML = `<strong>${state.results.length}</strong> found${state.ingredients.length ? ` · <strong>${makeNow}</strong> ready now` : ''}`;
  } else {
    meta.textContent = 'No search yet.';
  }

  const title = $('#resultsTitle');
  const eyebrow = $('#resultsEyebrow');
  if (state.scanError) {
    eyebrow.textContent = 'Search failed';
    title.textContent = 'The search did not finish.';
  } else if (state.scanning || state.scanPending) {
    eyebrow.textContent = 'Searching';
    title.textContent = 'Finding recipes…';
  } else if (!state.hasScanned) {
    eyebrow.textContent = 'Results';
    title.textContent = state.ingredients.length ? 'Ready to search.' : 'Add ingredients or browse.';
  } else if (state.results.length) {
    eyebrow.textContent = state.ingredients.length ? 'Best matches' : 'Recipes';
    const makeNow = state.results.filter(r => r.canMakeNow).length;
    title.textContent = state.ingredients.length && makeNow
      ? `${makeNow} you can make now${state.results.length > makeNow ? `, plus ${state.results.length - makeNow} with a few more ingredients` : ''}.`
      : `${state.results.length} ${plural(state.results.length, 'recipe', 'recipes')} found.`;
  } else {
    eyebrow.textContent = 'No matches';
    title.textContent = 'Nothing matched those ingredients yet.';
  }
}

function cardHTML(recipe, index) {
  const scoreClass = recipe.score >= 85 ? 'excellent' : recipe.score >= 75 ? 'strong' : 'good';
  const fit = state.ingredients.length
    ? recipe.canMakeNow || recipe.missingCount === 0
      ? `You can make this now · uses ${recipe.usedFamilies.length} of yours`
      : `Uses <strong>${recipe.usedFamilies.length}</strong> of yours · add ${recipe.missingCount} more`
    : `${esc(recipe.sourceName || 'Recipe')} · ${esc(recipe.scoreLabel)}`;
  const fitClass = state.ingredients.length
    ? ((recipe.canMakeNow || recipe.missingCount === 0) ? 'card-fit is-complete' : 'card-fit is-missing')
    : 'card-fit';

  const fallbackPhoto = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2E6B53"/><stop offset="100%" stop-color="#1B4332"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><circle cx="320" cy="210" r="92" fill="#FBF7EC" opacity=".14"/><text x="320" y="228" text-anchor="middle" font-family="Georgia,serif" font-size="72" fill="#FBF7EC" opacity=".9">🍽</text></svg>');
  const media = `<img src="${esc(recipe.thumb || fallbackPhoto)}" alt="${esc(recipe.title)}" loading="${index < 3 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackPhoto}'">`;

  return `<button type="button" class="recipe-card" data-open="${esc(recipe.id)}" style="--i:${index}">
    <span class="card-media">
      ${media}
      <span class="score-badge ${scoreClass}">${recipe.score}<small>/100</small></span>
    </span>
    <span class="card-body">
      <span class="card-eyebrow">${esc(recipe.cuisine || 'Recipe')} · ${esc(recipe.category)}</span>
      <strong class="card-title">${esc(recipe.title)}</strong>
      <span class="card-facts">
        <span class="fact"><svg class="icon"><use href="#i-clock"/></svg>~${esc(formatMinutes(recipe.time))}</span>
        <span class="fact"><svg class="icon"><use href="#i-users"/></svg>makes ${recipe.serves}</span>
      </span>
      <span class="${fitClass}">${fit}</span>
    </span>
  </button>`;
}

function emptyAction(action, label, style = 'primary') {
  return `<button type="button" class="btn ${style}" data-act="${action}">${esc(label)}</button>`;
}

function emptyHTML() {
  if (state.catalogLoading) {
    return `<div class="empty-icon"><svg class="icon"><use href="#i-refresh"/></svg></div>
      <h3>Loading the catalog</h3>
      <p>Fetching recipes, cuisines and ingredient names. The cookbook shelf is already bundled, so it loads with the page.</p>`;
  }
  if (state.catalogError) {
    return `<div class="empty-icon"><svg class="icon"><use href="#i-refresh"/></svg></div>
      <h3>The catalog did not load</h3>
      <p>${esc(state.catalogError)}</p>
      <div class="empty-actions">${emptyAction('retry-catalog', 'Retry catalog')}${emptyAction('sources', 'Data sources', 'ghost')}</div>`;
  }
  if (state.scanPending || state.scanning) {
    const progress = state.scanProgress.total
      ? `${state.scanProgress.done} of ${state.scanProgress.total} recipes checked.`
      : 'Looking through recipes that use what you have.';
    return `<div class="empty-icon"><svg class="icon"><use href="#i-refresh"/></svg></div>
      <h3>Searching recipes</h3>
      <p>${esc(progress)}</p>`;
  }
  if (state.scanError) {
    return `<div class="empty-icon"><svg class="icon"><use href="#i-refresh"/></svg></div>
      <h3>The scan did not finish</h3>
      <p>${esc(state.scanError)}</p>
      <div class="empty-actions">${emptyAction('rescan', 'Try again')}${emptyAction('browse', 'Browse the catalog', 'ghost')}</div>`;
  }
  if (!state.hasScanned) {
    return `<div class="empty-icon"><svg class="icon"><use href="#i-search"/></svg></div>
      <h3>Add ingredients or browse the catalog.</h3>
      <p>Start with what is in the fridge. The whole catalog is searched unless you pick a cuisine, time or diet. Every recipe is checked for ingredient fit, source trust, method detail, completeness and practicality. Only the ones that clear the gate are shown.</p>
      <div class="empty-actions">
        ${emptyAction('demo', 'Try 3 eggs & 40 minutes')}
        ${emptyAction('browse', 'Browse picks', 'ghost')}
        ${emptyAction('sources', 'See data sources', 'ghost')}
      </div>`;
  }

  const failures = state.lastScan && state.lastScan.detailFailures ? state.lastScan.detailFailures : 0;
  const failureNote = failures ? ` ${failures} could not be loaded.` : '';
  if (state.ingredients.length) {
    return `<div class="empty-icon"><svg class="icon"><use href="#i-search"/></svg></div>
      <h3>No matching recipes found.</h3>
      <p>Nothing in the catalog uses those ingredients with the current filters.${failureNote} Try removing one ingredient, picking another cuisine, or giving it more time.</p>
      <div class="empty-actions">
        ${emptyAction('more-time', 'Open up the time')}
        ${emptyAction('clear-cuisine', 'All cuisines', 'ghost')}
        ${emptyAction('browse', 'Browse picks', 'ghost')}
      </div>`;
  }

  return `<div class="empty-icon"><svg class="icon"><use href="#i-globe"/></svg></div>
    <h3>No recipes matched those filters.</h3>
    <p>The catalog has recipes, but this mix of cuisine, time and diet left nothing. Try another cuisine or clear the filter.</p>
    <div class="empty-actions">
      ${emptyAction('clear-cuisine', 'Clear cuisine')}
      ${emptyAction('browse', 'Browse picks', 'ghost')}
      ${emptyAction('sources', 'See data sources', 'ghost')}
    </div>`;
}

function renderResults() {
  const cards = $('#cards');
  const empty = $('#empty');

  if (state.results.length) {
    cards.innerHTML = state.results.map((recipe, index) => cardHTML(recipe, index)).join('');
    empty.hidden = true;
    empty.innerHTML = '';
  } else {
    cards.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = emptyHTML();
  }
  updateScanUI();
}

/* ============================================================
   ingredient actions
   ============================================================ */
function addIngredientText(text) {
  const parsed = LiveAPI.parseIngredientInput(text);
  if (!parsed.length) {
    toast('Type an ingredient, for example “eggs” or “canned tomatoes”.');
    return;
  }
  let added = 0;
  let duplicate = 0;
  let pantryOnly = 0;
  for (const item of parsed) {
    if (state.ingredients.some(i => i.family === item.family)) {
      duplicate++;
      continue;
    }
    state.ingredients.push(item);
    added++;
    if (state.pantry.has(item.family)) pantryOnly++;
  }

  state.scanMode = 'ingredients';
  renderChips();
  renderQuickAdd();

  if (added) {
    if (added === pantryOnly) {
      toast('That is already a pantry basic. Add a main ingredient for a better match.');
      updateScanUI();
      return;
    }
    toast(`Added ${added === 1 ? parsed[0].name : `${added} ingredients`}.`);
    scheduleScan(60);
  } else if (duplicate) {
    toast('That ingredient is already in your list.');
  }
}

function removeIngredient(family) {
  state.ingredients = state.ingredients.filter(i => i.family !== family);
  renderChips();
  renderQuickAdd();
  if (!state.ingredients.length) {
    resetScan();
    state.scanMode = 'ingredients';
    updateScanUI();
    renderResults();
    return;
  }
  scheduleScan(60);
}

/* ============================================================
   recipe detail
   ============================================================ */
function selectedRecipe() {
  if (!state.current) return null;
  return state.current;
}

function openRecipe(id) {
  const found = state.results.find(r => r.id === id);
  if (!found) return;
  if ($('#sideSheet').classList.contains('is-open')) closeSide();
  state.current = LiveAPI.scoreRecipe(found, {
    userFamilies: new Set(state.ingredients.map(i => i.family)),
    pantryFamilies: state.pantry,
    minutes: state.minutes,
    diet: state.diet
  });
  state.detailBase = state.current.serves;
  state.detailTarget = state.current.serves;
  state.checkedIngs = new Set();
  renderRecipe();
  openLayer('#recipeSheet', '#scrim');
}

function closeRecipe() {
  if (!$('#recipeSheet').classList.contains('is-open')) return;
  stopTimer();
  closeLayer('#recipeSheet', '#scrim');
  state.current = null;
  state.checkedIngs = new Set();
}

function scoreBreakdownHTML(recipe) {
  return recipe.scoreParts.map(part => `
    <div class="score-line">
      <span>${esc(part.label)}</span><strong>${part.value}/${part.max}</strong>
      <span class="score-bar"><span style="width:${Math.round((part.value / part.max) * 100)}%"></span></span>
    </div>
  `).join('');
}

function sourceRowHTML(recipe) {
  const items = [];
  if (recipe.source) {
    const sourceNote = recipe.sourceType === 'cookbook'
      ? (recipe.sourceHost === 'based.cooking' ? 'Public domain dedication · original page'
        : recipe.sourceName === 'open-recipe-corpus' ? 'CC BY-SA 4.0 · provenance and source link'
        : 'CC BY-SA 4.0 · original page and edit history')
      : (recipe.sourceHost || 'Open the publisher');
    items.push(`<a class="source-card" href="${esc(recipe.source)}" target="_blank" rel="noopener noreferrer">
      <svg class="icon"><use href="#i-external"/></svg>
      <span class="source-copy"><strong>${esc(recipe.sourceName || 'Original recipe')}</strong><small>${esc(sourceNote)}</small></span>
    </a>`);
  }
  if (recipe.youtube) {
    items.push(`<a class="source-card" href="${esc(recipe.youtube)}" target="_blank" rel="noopener noreferrer">
      <svg class="icon"><use href="#i-play"/></svg>
      <span class="source-copy"><strong>YouTube walkthrough</strong><small>Video attached to this recipe</small></span>
    </a>`);
  }
  if (!items.length) {
    return `<div class="callout warn"><strong>No publisher or video is attached.</strong> This record has instructions only. Treat the timings as estimates.</div>`;
  }
  return `<div class="source-row">${items.join('')}</div>`;
}

function ingredientListHTML(recipe, factor) {
  return recipe.ingredients.map((ing, index) => {
    const amount = ing.measure ? LiveAPI.scaleMeasure(ing.measure, factor) : '';
    const checked = state.checkedIngs.has(index);
    const pantry = state.pantry.has(ing.family);
    return `<li>
      <button type="button" class="ing-row ${checked ? 'is-checked' : ''}" data-act="ing" data-key="${index}" aria-pressed="${checked}" aria-label="Tick off ${esc(ing.name)}">
        <span class="ing-check"><svg class="icon"><use href="#i-check"/></svg></span>
        <span class="ing-text">${amount ? `<strong>${esc(amount)}</strong> ` : ''}${esc(ing.name)}${pantry ? '<span class="ing-pantry">pantry</span>' : ''}</span>
      </button>
    </li>`;
  }).join('');
}

function stepsHTML(recipe) {
  if (!recipe.steps.length) {
    return `<div class="callout warn"><strong>The live record has no usable method text.</strong> ${recipe.source ? 'Open the original publisher for the full instructions.' : 'Try another recipe or scan again.'}</div>`;
  }
  return `<ol class="steps">${recipe.steps.map(text => {
    const timer = stepTimer(text);
    return `<li>${esc(text)}${timer ? `<br><button type="button" class="timer-btn" data-act="timer" data-sec="${timer.sec}" aria-label="${esc(timer.label)}"><svg class="icon"><use href="#i-clock"/></svg><span>${esc(timer.label)}</span></button>` : ''}</li>`;
  }).join('')}</ol>`;
}

function renderRecipe() {
  const recipe = selectedRecipe();
  if (!recipe) return;
  stopTimer();

  const factor = state.detailTarget / state.detailBase;
  const missing = recipe.missing || [];
  const fitText = state.ingredients.length
    ? (missing.length
      ? `Uses ${recipe.usedFamilies.length} of ${recipe.mainCount} main ingredients.`
      : 'You listed every main ingredient.')
    : `A good pick from the ${recipe.cuisine || 'recipe'} shelf.`;

  $('#sheetKicker').textContent = `${recipe.category} · ${recipe.cuisine || 'Recipe'}`;
  const top = $('#sheetSourceTop');
  if (recipe.source) {
    top.href = recipe.source;
    top.hidden = false;
    top.setAttribute('aria-label', `Open original source for ${recipe.title}`);
  } else {
    top.hidden = true;
    top.removeAttribute('href');
  }

  const fallbackHero = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2E6B53"/><stop offset="100%" stop-color="#1B4332"/></linearGradient></defs><rect width="960" height="520" fill="url(#g)"/><circle cx="480" cy="260" r="110" fill="#FBF7EC" opacity=".14"/><text x="480" y="282" text-anchor="middle" font-family="Georgia,serif" font-size="88" fill="#FBF7EC" opacity=".9">🍽</text></svg>');
  const photoCredit = recipe.photoCredit
    ? (recipe.photoPage ? `<a href="${esc(recipe.photoPage)}" target="_blank" rel="noreferrer noopener">Photo: ${esc(recipe.photoCredit)}</a>` : `Photo: ${esc(recipe.photoCredit)}`)
    : (recipe.sourceType === 'cookbook' ? 'Photo: recipe source' : 'Photo: TheMealDB');
  const hero = `<div class="detail-hero"><img src="${esc(recipe.thumb || fallbackHero)}" alt="${esc(recipe.title)}" loading="eager" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fallbackHero}'"><span class="hero-credit">${photoCredit}</span></div>`;

  const missingHTML = !state.ingredients.length
    ? `<div class="callout warn" style="background:var(--sage-soft);border-color:#CFDFD2;color:#345D47"><strong>Browsing without an ingredient list.</strong> Add ingredients to see what you already have and what you would need to buy.</div>`
    : missing.length ? `<div class="callout missing">
    <div><strong>${missing.length} main ingredient${missing.length === 1 ? '' : 's'} missing.</strong> ${esc(fitText)}</div>
    <div class="miss-line">${missing.map(item => `<span class="miss-chip">${esc(item.name)}</span>`).join('')}</div>
    <button type="button" class="btn small primary" data-act="add-missing">Add missing to list</button>
  </div>` : `<div class="callout warn" style="background:var(--sage-soft);border-color:#CFDFD2;color:#345D47"><strong>You have everything main.</strong> Pantry basics are assumed separately.</div>`;

  $('#sheetBody').innerHTML = `
    ${hero}
    <p class="detail-kicker">${esc(recipe.category)} <span class="sep"></span> ${esc(recipe.cuisine || 'Recipe')} <span class="sep"></span> ${esc(recipe.scoreLabel)}</p>
    <h2 class="detail-title" id="sheetTitle">${esc(recipe.title)}</h2>
    <div class="detail-meta">
      <span class="meta-chip"><svg class="icon"><use href="#i-clock"/></svg>~${esc(formatMinutes(recipe.time))}</span>
      <span class="meta-chip"><svg class="icon"><use href="#i-users"/></svg>makes ${recipe.serves} as written</span>
      <span class="meta-chip saffron"><svg class="icon"><use href="#i-shield"/></svg>${recipe.score}/100</span>
    </div>

    <div class="score-card">
      <div class="score-head">
        <div class="score-head-left">
          <span class="score-number">${recipe.score}<small>/100</small></span>
          <span class="score-label">${esc(recipe.scoreLabel)}</span>
        </div>
        <span class="gate-note">Gate ${QUALITY_GATE} · ${recipe.score >= QUALITY_GATE ? 'passed' : 'below'}</span>
      </div>
      <div class="score-breakdown">${scoreBreakdownHTML(recipe)}</div>
    </div>

    ${sourceRowHTML(recipe)}

    <div class="scale-box">
      <div class="scale-side">
        <strong>Scale to ${state.detailTarget} serving${state.detailTarget === 1 ? '' : 's'}</strong>
        <small>${factor === 1 ? 'Original quantities' : `${LiveAPI.fmtAmount(factor)}× the original`}</small>
        <div class="stepper" role="group" aria-label="Target servings">
          <button type="button" data-act="serv" data-dir="-1" aria-label="Fewer servings" ${state.detailTarget <= 1 ? 'disabled' : ''}><svg class="icon"><use href="#i-minus"/></svg></button>
          <output aria-live="polite">${state.detailTarget}</output>
          <button type="button" data-act="serv" data-dir="1" aria-label="More servings" ${state.detailTarget >= 24 ? 'disabled' : ''}><svg class="icon"><use href="#i-plus"/></svg></button>
        </div>
      </div>
      <div class="scale-side">
        <strong>Recipe makes ${state.detailBase}</strong>
        <small>Change this if the estimate is off.</small>
        <div class="stepper" role="group" aria-label="Recipe base servings">
          <button type="button" data-act="base" data-dir="-1" aria-label="Fewer base servings" ${state.detailBase <= 1 ? 'disabled' : ''}><svg class="icon"><use href="#i-minus"/></svg></button>
          <output>${state.detailBase}</output>
          <button type="button" data-act="base" data-dir="1" aria-label="More base servings" ${state.detailBase >= 24 ? 'disabled' : ''}><svg class="icon"><use href="#i-plus"/></svg></button>
        </div>
      </div>
    </div>
    <p class="scale-note"><svg class="icon"><use href="#i-info"/></svg>Quantities scale. Cooking times are estimates from the method and stay roughly the same.</p>

    ${missingHTML}

    <h3 class="section-h">Ingredients <small>${state.detailTarget === state.detailBase ? `serves ${state.detailTarget}` : `scaled from ${state.detailBase}`}</small></h3>
    <ul class="ing-list">${ingredientListHTML(recipe, factor)}</ul>

    <h3 class="section-h">Method <small>${recipe.steps.length} step${recipe.steps.length === 1 ? '' : 's'} · tap a timer to start</small></h3>
    ${stepsHTML(recipe)}

    <div class="tip-box">
      <h4><svg class="icon"><use href="#i-shield"/></svg>Why this recipe scored ${recipe.score}</h4>
      <p>${esc(recipe.scoreLabel)} at ${recipe.score}/100. ${state.ingredients.length
        ? `It uses ${recipe.usedFamilies.length || 0} of ${recipe.mainCount} main ingredients.`
        : 'No ingredient list was set, so ingredient fit is not counted against it.'} The score adds ingredient fit, source trust, method detail, record completeness and time practicality. Times and servings are estimates.</p>
    </div>

    <div class="detail-actions">
      ${missing.length && state.ingredients.length ? '<button type="button" class="btn ghost-btn" data-act="add-missing">Add missing</button>' : ''}
      <button type="button" class="btn primary" data-act="cook"><svg class="icon"><use href="#i-play"/></svg>Start cooking</button>
    </div>
    <p class="recipe-note">${recipe.sourceType === 'cookbook'
      ? (recipe.sourceHost === 'based.cooking'
        ? 'From based.cooking (public domain dedication). The source link opens the original page.'
        : recipe.sourceName === 'open-recipe-corpus'
          ? 'From open-recipe-corpus (CC BY-SA 4.0), based on Wikibooks/Wikisource sources. Some English text may be machine-translated; the source link has provenance.'
          : 'From the Wikibooks Cookbook (CC BY-SA 4.0). The source link carries attribution and edit history.')
      : 'From TheMealDB. Publisher and video links open the original pages.'} Nothing here is saved.</p>
  `;
  $('#sheetBody').scrollTop = 0;
}

function onSheetClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || !state.current) return;
  const act = btn.dataset.act;

  if (act === 'serv') {
    state.detailTarget = clamp(state.detailTarget + Number(btn.dataset.dir), 1, 24);
    renderRecipe();
  } else if (act === 'base') {
    const old = state.detailBase;
    state.detailBase = clamp(state.detailBase + Number(btn.dataset.dir), 1, 24);
    if (state.detailTarget === old) state.detailTarget = state.detailBase;
    renderRecipe();
  } else if (act === 'ing') {
    const key = Number(btn.dataset.key);
    if (state.checkedIngs.has(key)) state.checkedIngs.delete(key);
    else state.checkedIngs.add(key);
    const on = state.checkedIngs.has(key);
    btn.classList.toggle('is-checked', on);
    btn.setAttribute('aria-pressed', String(on));
  } else if (act === 'timer') {
    startTimer(Number(btn.dataset.sec), btn);
  } else if (act === 'add-missing') {
    addMissingToShoppingList();
  } else if (act === 'cook') {
    openCook();
  }
}

function addMissingToShoppingList() {
  const recipe = selectedRecipe();
  if (!recipe) return;
  const factor = state.detailTarget / state.detailBase;
  const items = recipe.missing.map(item => ({
    name: item.name,
    note: item.measure ? LiveAPI.scaleMeasure(item.measure, factor) : ''
  }));
  const added = addToShoppingList(items, recipe.title);
  if (!added) toast('Those items are already on your list.');
}

/* ============================================================
   shopping list + pantry + sources
   ============================================================ */
function addToShoppingList(items, source) {
  let added = 0;
  for (const item of items) {
    const name = typeof item === 'string' ? item : item.name;
    if (!name) continue;
    const cleanName = name.toLowerCase().trim();
    if (state.list.some(x => x.name.toLowerCase().trim() === cleanName)) continue;
    state.list.push({
      id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: String(name).trim(),
      note: typeof item === 'string' ? '' : (item.note || ''),
      source: source || '',
      checked: false
    });
    added++;
  }
  renderBadges();
  if (state.sideMode === 'list' && $('#sideSheet').classList.contains('is-open')) renderSide(true);
  if (added) toast(`Added ${added} ${plural(added, 'item', 'items')} to the session list.`);
  return added;
}

function openSide(mode) {
  state.sideMode = mode;
  renderSide(false);
  openLayer('#sideSheet', '#sideScrim');
}

function closeSide() {
  if (!$('#sideSheet').classList.contains('is-open')) return;
  closeLayer('#sideSheet', '#sideScrim');
}

function sideTitles() {
  return { list: 'Shopping list', pantry: 'Pantry basics', sources: 'Sources & data' };
}

function listRowHTML(item) {
  return `<div class="list-row ${item.checked ? 'is-checked' : ''}">
    <button type="button" class="list-check" data-act="check-item" data-id="${esc(item.id)}" aria-label="Check ${esc(item.name)}" aria-pressed="${item.checked}">
      <svg class="icon"><use href="#i-check"/></svg>
    </button>
    <div class="list-main">
      <div class="list-name">${esc(item.name)}${item.note ? ` <span class="hint">${esc(item.note)}</span>` : ''}</div>
      ${item.source ? `<div class="list-source">for ${esc(item.source)}</div>` : ''}
    </div>
    <button type="button" class="mini-remove" data-act="remove-item" data-id="${esc(item.id)}" aria-label="Remove ${esc(item.name)}">
      <svg class="icon"><use href="#i-trash"/></svg>
    </button>
  </div>`;
}

function renderSide(preserveScroll) {
  const body = $('#sideBody');
  const scrollTop = body.scrollTop;
  $('#sideTitle').textContent = sideTitles()[state.sideMode] || 'Shopping list';

  if (state.sideMode === 'list') {
    const unchecked = state.list.filter(x => !x.checked);
    const checked = state.list.filter(x => x.checked);
    body.innerHTML = `<h2 class="side-title">Shopping list</h2>
      <p class="side-sub">Missing ingredients you choose to keep for this session. The list resets when you reload.</p>
      ${state.list.length
        ? `${unchecked.map(listRowHTML).join('')}${checked.map(listRowHTML).join('')}`
        : '<div class="side-empty">Your list is empty. Open a recipe and tap “Add missing to list”.</div>'}
      <form class="add-item-row" id="manualItemForm" autocomplete="off">
        <input id="manualItem" type="text" placeholder="Add an item, e.g. eggs" aria-label="Add shopping list item" enterkeyhint="done">
        <button class="btn small primary" type="submit">Add</button>
      </form>
      <div class="list-tools">
        <small>${unchecked.length} to buy · ${checked.length} checked</small>
        <button type="button" class="btn small ghost-btn" data-act="clear-checked" ${checked.length ? '' : 'disabled'}>Clear checked</button>
      </div>
      <p class="list-note">Session only. Reload the tab and the list is gone.</p>`;
  }

  if (state.sideMode === 'pantry') {
    body.innerHTML = `<h2 class="side-title">Pantry basics</h2>
      <p class="side-sub">These are assumed to be in your kitchen. They do not count as missing and do not count as one of your main ingredients.</p>
      <p class="side-sub">${state.pantry.size} assumed.</p>
      ${PANTRY_GROUPS.map(group => `<div class="settings-group">
        <h3>${esc(group.title)}</h3>
        <div class="staple-grid">
          ${group.items.map(([key, label]) => {
            const on = state.pantry.has(key);
            return `<button type="button" class="staple-toggle ${on ? 'is-on' : ''}" data-act="staple" data-key="${esc(key)}" aria-pressed="${on}">
              <span class="tick"><svg class="icon"><use href="#i-check"/></svg></span>${esc(label)}
            </button>`;
          }).join('')}
        </div>
      </div>`).join('')}
      <div class="settings-group">
        <h3>Reset</h3>
        <p>Put the pantry back to the default list.</p>
        <button type="button" class="danger-btn" data-act="reset-pantry">Reset pantry basics</button>
      </div>
      <p class="list-note">Pantry changes affect the next scan.</p>`;
  }

  if (state.sideMode === 'sources') {
    const query = state.ingredients.map(item => item.name).join(' ').trim();
    const q = encodeURIComponent(query);
    const searchGroup = query ? `<div class="source-group">
      <h3>Search your list elsewhere</h3>
      <p class="source-note">These open each site's own search in a new tab. They are not scraped or merged into the scan.</p>
      <a class="source-item" href="https://www.bbcgoodfood.com/search?q=${q}" target="_blank" rel="noopener noreferrer"><strong>BBC Good Food search</strong><small>Publisher recipes for: ${esc(query)}</small></a>
      <a class="source-item" href="https://www.seriouseats.com/search?q=${q}" target="_blank" rel="noopener noreferrer"><strong>Serious Eats search</strong><small>Tested techniques and recipes for: ${esc(query)}</small></a>
      <a class="source-item" href="https://www.recipetineats.com/?s=${q}" target="_blank" rel="noopener noreferrer"><strong>RecipeTin Eats search</strong><small>Practical home recipes for: ${esc(query)}</small></a>
      <a class="source-item" href="https://www.youtube.com/results?search_query=${q}%20recipe" target="_blank" rel="noopener noreferrer"><strong>YouTube search</strong><small>Video walkthroughs for: ${esc(query)}</small></a>
      <a class="source-item" href="https://www.reddit.com/search/?q=${q}%20recipe" target="_blank" rel="noopener noreferrer"><strong>Reddit search</strong><small>Community threads for: ${esc(query)}</small></a>
    </div>` : '';
    body.innerHTML = `<h2 class="side-title">Sources &amp; data</h2>
      <div class="policy-box">
        <h3>Two shelves, plus links</h3>
        <p>Live records come from <strong>TheMealDB</strong> when you scan. The community shelf is the <strong>Wikibooks Cookbook</strong>, bundled with the app so it works offline. Its recipe text is reused under CC BY-SA 4.0, and every cookbook recipe links back to its page and edit history.</p>
        <p>BBC Good Food, Serious Eats, NYT Cooking, YouTube and Reddit are linked for a second look. They are not scraped or copied into the scan; most either need a key or block browser requests.</p>
      </div>
      ${searchGroup}
      ${SOURCE_DIRECTORY.map(group => `<div class="source-group">
        <h3>${esc(group.title)}</h3>
        <p class="source-note">${esc(group.note)}</p>
        ${group.items.map(item => `<a class="source-item" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
          <strong>${esc(item.name)}</strong>${item.note ? `<small>${esc(item.note)}</small>` : ''}
        </a>`).join('')}
      </div>`).join('')}
      <p class="list-note">One live catalog, one open cookbook, and links for when you want another opinion.</p>`;
  }

  if (preserveScroll) body.scrollTop = scrollTop;
  else body.scrollTop = 0;
}

function onSideClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === 'check-item') {
    const item = state.list.find(x => x.id === btn.dataset.id);
    if (item) {
      item.checked = !item.checked;
      renderBadges();
      renderSide(true);
    }
  } else if (act === 'remove-item') {
    state.list = state.list.filter(x => x.id !== btn.dataset.id);
    renderBadges();
    renderSide(true);
  } else if (act === 'clear-checked') {
    state.list = state.list.filter(x => !x.checked);
    renderBadges();
    renderSide(true);
  } else if (act === 'staple') {
    const key = btn.dataset.key;
    if (state.pantry.has(key)) state.pantry.delete(key);
    else state.pantry.add(key);
    renderPantryLine();
    renderSide(true);
    scheduleScan(120);
  } else if (act === 'reset-pantry') {
    state.pantry = new Set(DEFAULT_PANTRY);
    renderPantryLine();
    renderSide(true);
    scheduleScan(120);
  }
}

/* ============================================================
   layers
   ============================================================ */
function syncLock() {
  const open = $('.sheet.is-open, .cook.is-open');
  document.body.classList.toggle('locked', !!open);
}

function openLayer(sheetSel, scrimSel) {
  state.lastFocus = document.activeElement;
  const sheet = $(sheetSel);
  sheet.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
  if (scrimSel) $(scrimSel).classList.add('is-on');
  syncLock();
  setTimeout(() => {
    const close = sheet.querySelector('.sheet-top .icon-btn');
    if (close) close.focus();
  }, 70);
}

function closeLayer(sheetSel, scrimSel) {
  const sheet = $(sheetSel);
  sheet.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  if (scrimSel) $(scrimSel).classList.remove('is-on');
  syncLock();
  if (state.lastFocus && document.contains(state.lastFocus)) {
    try { state.lastFocus.focus(); } catch (err) { /* noop */ }
  }
}

/* ============================================================
   cook mode + timers
   ============================================================ */
function openCook() {
  if (!state.current) return;
  if (!state.current.steps.length) {
    toast('This live record has no usable method text. Open the original source instead.');
    return;
  }
  state.cookSteps = state.current.steps;
  state.cookIdx = 0;
  state.cookReturnFocus = document.activeElement;
  $('#cookOverlay').classList.add('is-open');
  $('#cookOverlay').setAttribute('aria-hidden', 'false');
  syncLock();
  renderCook();
  requestWakeLock();
  setTimeout(() => $('#cookClose').focus(), 80);
}

function closeCook() {
  const overlay = $('#cookOverlay');
  if (!overlay.classList.contains('is-open')) return;
  stopTimer();
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  syncLock();
  releaseWakeLock();
  if (state.cookReturnFocus && document.contains(state.cookReturnFocus)) {
    try { state.cookReturnFocus.focus(); } catch (err) { /* noop */ }
  }
}

function renderCook() {
  stopTimer();
  const total = state.cookSteps.length;
  $('#cookProgress').textContent = `Step ${state.cookIdx + 1} of ${total}`;
  $('#cookNum').textContent = String(state.cookIdx + 1).padStart(2, '0');
  $('#cookStep').textContent = state.cookSteps[state.cookIdx] || '';

  const timer = stepTimer(state.cookSteps[state.cookIdx] || '');
  const timerBtn = $('#cookTimer');
  if (timer) {
    timerBtn.hidden = false;
    timerBtn.dataset.sec = timer.sec;
    timerBtn.dataset.label = timer.label;
    timerBtn.classList.remove('running', 'done');
    timerBtn.querySelector('span').textContent = timer.label;
    timerBtn.disabled = false;
  } else {
    timerBtn.hidden = true;
    timerBtn.dataset.sec = '';
  }

  $('#cookPrev').disabled = state.cookIdx === 0;
  $('#cookNext').innerHTML = state.cookIdx === total - 1
    ? 'Finish <svg class="icon"><use href="#i-check"/></svg>'
    : 'Next <svg class="icon"><use href="#i-right"/></svg>';

  if (!state.current) return;
  const factor = state.detailTarget / state.detailBase;
  $('#cookIngredients').innerHTML = state.current.ingredients.map(ing => {
    const amount = ing.measure ? LiveAPI.scaleMeasure(ing.measure, factor) : '';
    return `<div>${amount ? `<b>${esc(amount)}</b> ` : ''}${esc(ing.name)}</div>`;
  }).join('');
}

function cookNext() {
  if (state.cookIdx >= state.cookSteps.length - 1) {
    closeCook();
    toast('Recipe complete.');
    return;
  }
  state.cookIdx++;
  renderCook();
}

function initAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (err) { audioCtx = null; }
}

function beep() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  [0, 0.2, 0.4].forEach(offset => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.18);
  });
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function stepTimer(text) {
  const min = String(text).match(/(\d+)(?:\s*[–—-]\s*(\d+))?\s*(?:min|minute)/i);
  if (min) {
    const n = parseInt(min[2] || min[1], 10);
    if (n > 0 && n <= 240) return { sec: n * 60, label: `Start ${n} min timer` };
  }
  const sec = String(text).match(/(\d+)\s*(?:sec|second)/i);
  if (sec) {
    const n = parseInt(sec[1], 10);
    if (n > 0 && n <= 600) return { sec: n, label: `Start ${n} sec timer` };
  }
  return null;
}

function startTimer(sec, btn) {
  if (!sec || !btn) return;
  if (state.activeTimer && state.activeTimer.btn === btn) { stopTimer(); return; }
  stopTimer();
  initAudio();
  const span = btn.querySelector('span');
  const original = btn.dataset.label || (span ? span.textContent : 'Start timer');
  const end = Date.now() + sec * 1000;
  btn.dataset.label = original;
  btn.classList.add('running');
  btn.classList.remove('done');
  btn.disabled = false;

  state.activeTimer = { btn, original, id: null };
  const tick = () => {
    if (!state.activeTimer || state.activeTimer.btn !== btn) return;
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    if (span) span.textContent = fmtClock(left);
    btn.setAttribute('aria-label', `Timer running, ${fmtClock(left)} left. Tap to stop.`);
    if (left <= 0) finishTimer();
  };
  state.activeTimer.id = setInterval(tick, 250);
  tick();
}

function finishTimer() {
  if (!state.activeTimer) return;
  clearInterval(state.activeTimer.id);
  const { btn, original } = state.activeTimer;
  state.activeTimer = null;
  btn.classList.remove('running');
  btn.classList.add('done');
  const span = btn.querySelector('span');
  if (span) span.textContent = 'Done — timer!';
  btn.disabled = true;
  beep();
  setTimeout(() => {
    if (!state.activeTimer && span && btn.classList.contains('done')) {
      btn.classList.remove('done');
      btn.disabled = false;
      span.textContent = original;
    }
  }, 9000);
}

function stopTimer() {
  if (!state.activeTimer) return;
  clearInterval(state.activeTimer.id);
  const { btn, original } = state.activeTimer;
  state.activeTimer = null;
  btn.classList.remove('running');
  btn.disabled = false;
  const span = btn.querySelector('span');
  if (span) span.textContent = original;
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      state.wakeLock = await navigator.wakeLock.request('screen');
      state.wakeLock.addEventListener('release', () => { state.wakeLock = null; });
    }
  } catch (err) { state.wakeLock = null; }
}

function releaseWakeLock() {
  try { if (state.wakeLock) state.wakeLock.release(); } catch (err) { /* noop */ }
  state.wakeLock = null;
}

/* ============================================================
   toast / misc
   ============================================================ */
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

function scrollResults() {
  const el = $('#resultsSection');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadDemo() {
  state.ingredients = LiveAPI.parseIngredientInput('3 eggs, half an onion, canned tomatoes');
  state.minutes = 40;
  state.cuisine = 'all';
  state.diet = 'all';
  state.scanMode = 'ingredients';
  renderChips();
  renderQuickAdd();
  renderTime();
  renderCuisineSelect();
  renderDiet();
  scheduleScan(120);
  scrollResults();
}

function handleEmptyAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'demo') loadDemo();
  else if (act === 'browse') { state.scanMode = 'browse'; scheduleScan(50); }
  else if (act === 'more-time') {
    state.minutes = 999;
    renderTime();
    scheduleScan(100);
  } else if (act === 'clear-cuisine') {
    state.cuisine = 'all';
    renderCuisineSelect();
    scheduleScan(100);
  } else if (act === 'sources') openSide('sources');
  else if (act === 'retry-catalog') loadCatalog();
  else if (act === 'rescan') runScan({ append: false });
  else if (act === 'scan-more') runScan({ append: true });
}

/* ============================================================
   wiring
   ============================================================ */
function bind() {
  $('#ingredientForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#ingredientInput');
    const value = input.value.trim();
    if (!value) { input.focus(); return; }
    addIngredientText(value);
    input.value = '';
    input.focus();
  });

  $('#chips').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove]');
    if (remove) { removeIngredient(remove.dataset.remove); return; }
    if (e.target.closest('#clearChips')) {
      state.ingredients = [];
      renderChips();
      renderQuickAdd();
      resetScan();
      state.scanMode = 'ingredients';
      updateScanUI();
      renderResults();
      toast('Ingredient list cleared.');
    }
  });

  $('#quickAdd').addEventListener('click', e => {
    const btn = e.target.closest('[data-quick]');
    if (!btn || btn.disabled) return;
    addIngredientText(btn.dataset.quick);
  });

  $('#timeChips').addEventListener('click', e => {
    const btn = e.target.closest('[data-min]');
    if (!btn) return;
    state.minutes = Number(btn.dataset.min);
    renderTime();
    scheduleFilterScan(250);
  });

  $('#cuisineSelect').addEventListener('change', e => {
    state.cuisine = e.target.value;
    scheduleFilterScan(250);
  });

  $('#dietSelect').addEventListener('change', e => {
    state.diet = e.target.value;
    scheduleFilterScan(250);
  });

  $('#scanBtn').addEventListener('click', () => {
    if (!state.ingredients.length) state.scanMode = 'browse';
    runScan({ append: false });
  });
  $('#browseBtn').addEventListener('click', () => {
    state.scanMode = 'browse';
    runScan({ append: false });
  });
  $('#scanMore').addEventListener('click', () => runScan({ append: true }));

  $('#pantryLine').addEventListener('click', () => openSide('pantry'));
  $('#btnPantry').addEventListener('click', () => openSide('pantry'));
  $('#btnSources').addEventListener('click', () => openSide('sources'));
  const ssrc=$('#scanSources'); if(ssrc) ssrc.addEventListener('click', () => openSide('sources'));
  $('#footSources').addEventListener('click', () => openSide('sources'));
  $('#btnList').addEventListener('click', () => openSide('list'));
  $('#brandBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  $('#cards').addEventListener('click', e => {
    const card = e.target.closest('[data-open]');
    if (card) openRecipe(card.dataset.open);
  });

  $('#empty').addEventListener('click', handleEmptyAction);
  const scpy=$('#scanCopy'); if(scpy) scpy.addEventListener('click', handleEmptyAction);

  $('#sheetClose').addEventListener('click', closeRecipe);
  $('#sheetBody').addEventListener('click', onSheetClick);
  $('#scrim').addEventListener('click', closeRecipe);

  $('#sideClose').addEventListener('click', closeSide);
  $('#sideScrim').addEventListener('click', closeSide);
  $('#sideBody').addEventListener('click', onSideClick);

  $('#cookClose').addEventListener('click', closeCook);
  $('#cookNext').addEventListener('click', cookNext);
  $('#cookPrev').addEventListener('click', () => {
    if (state.cookIdx > 0) { state.cookIdx--; renderCook(); }
  });
  $('#cookTimer').addEventListener('click', e => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const sec = Number(btn.dataset.sec);
    if (sec) startTimer(sec, btn);
  });
  $('#cookIngBtn').addEventListener('click', () => {
    const panel = $('#cookIngredients');
    panel.hidden = !panel.hidden;
    $('#cookIngBtn').setAttribute('aria-pressed', String(!panel.hidden));
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'manualItemForm') return;
    e.preventDefault();
    const input = $('#manualItem');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;
    if (state.list.some(x => x.name.toLowerCase() === value.toLowerCase())) {
      toast('Already on your list.');
      input.value = '';
      input.focus();
      return;
    }
    state.list.push({
      id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: value,
      note: '',
      source: '',
      checked: false
    });
    renderBadges();
    renderSide(true);
    toast('Added to the session list.');
    setTimeout(() => { const fresh = $('#manualItem'); if (fresh) fresh.focus(); }, 0);
  });

  document.addEventListener('keydown', e => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
    if (e.key === 'Escape') {
      if ($('#cookOverlay').classList.contains('is-open')) closeCook();
      else if ($('#sideSheet').classList.contains('is-open')) closeSide();
      else if ($('#recipeSheet').classList.contains('is-open')) closeRecipe();
      return;
    }
    if ($('#cookOverlay').classList.contains('is-open') && !typing) {
      if (e.key === 'ArrowRight') { e.preventDefault(); cookNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (state.cookIdx > 0) { state.cookIdx--; renderCook(); } }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' &&
        $('#cookOverlay').classList.contains('is-open') &&
        !state.wakeLock) {
      requestWakeLock();
    }
  });
}

/* ============================================================
   init
   ============================================================ */
function init() {
  bind();
  renderScoreParts();
  renderDiet();
  renderCuisineSelect();
  renderTime();
  renderChips();
  renderQuickAdd();
  renderPantryLine();
  renderBadges();
  updateScanUI();
  renderResults();
  loadCatalog();
}

document.addEventListener('DOMContentLoaded', init);
