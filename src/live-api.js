'use strict';

/* ============================================================
   Live data layer for Recipe Whisperer.

   Two shelves are merged into one catalog:
   - TheMealDB records, fetched at runtime and kept in memory.
   - The Wikibooks Cookbook, bundled in cookbook-data.js so it
     works offline.

   No cookies, localStorage, sessionStorage or IndexedDB are used.
   ============================================================ */

const LiveAPI = (() => {
  const BASE = THEMEALDB_BASE;
  const FALLBACK_CATEGORIES = [
    'Beef', 'Breakfast', 'Chicken', 'Dessert', 'Goat', 'Lamb',
    'Miscellaneous', 'Pasta', 'Pork', 'Seafood', 'Side', 'Starter',
    'Vegan', 'Vegetarian'
  ];

  const cache = {
    catalog: null,
    catalogPromise: null,
    ingredients: null,
    ingredientPromise: null,
    details: new Map(),
    detailRaw: new Map(),
    ingredientFilters: new Map()
  };

  /* ------------------------------------------------------------
     small utilities
     ------------------------------------------------------------ */
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  const escAttr = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const uniq = (arr) => [...new Set(arr.filter(Boolean))];

  const singularWord = (word) => {
    const w = String(word || '').toLowerCase();
    if (!w) return '';
    if (/ies$/.test(w)) return w.replace(/ies$/, 'y');
    if (/oes$/.test(w)) return w.replace(/oes$/, 'o');
    if (/(ses|xes|zes|ches|shes)$/.test(w)) return w.replace(/es$/, '');
    if (/(us|is|ous|ss)$/.test(w)) return w;
    if (/s$/.test(w)) return w.replace(/s$/, '');
    return w;
  };

  const singularize = (name) => {
    const words = clean(name).toLowerCase().split(' ');
    if (!words.length) return '';
    words[words.length - 1] = singularWord(words[words.length - 1]);
    return words.join(' ');
  };

  const DESCRIPTORS = new Set([
    'fresh', 'large', 'small', 'medium', 'ripe', 'frozen', 'canned', 'tinned',
    'cooked', 'raw', 'baby', 'boneless', 'skinless', 'organic', 'free', 'range',
    'extra', 'virgin', 'cold', 'pressed', 'ground', 'minced', 'chopped', 'diced',
    'sliced', 'grated', 'whole', 'plain', 'all', 'purpose', 'roughly', 'finely',
    'thinly', 'peeled', 'trimmed', 'washed', 'drained', 'rinsed', 'halved',
    'quartered', 'crushed', 'dried', 'powdered', 'unsalted', 'salted', 'light',
    'dark', 'double', 'single', 'heavy', 'thick', 'thin', 'good', 'quality',
    'store', 'bought', 'homemade', 'mixed', 'assorted', 'of', 'the'
  ]);

  function stripDescriptors(name) {
    return clean(name)
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .split(' ')
      .filter(w => w && !DESCRIPTORS.has(w))
      .join(' ')
      .trim();
  }

  function cleanIngredientName(raw) {
    let s = clean(raw)
      .replace(/_/g, ' ')
      .replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4')
      .replace(/⅓/g, ' 1/3').replace(/⅔/g, ' 2/3').replace(/⅛/g, ' 1/8')
      .replace(/^[\-•*]\s*/, '')
      .replace(/\([^)]*\)/g, ' ')
      .toLowerCase();
    s = s.replace(/^\s*(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)\s*/, '');

    // Remove stacked quantity words and articles: "half an onion" -> "onion".
    const prefixes = /^(?:a|an|some|half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|cups?|tbsp|tsp|grams?|g|kg|ml|l|ounces?|oz|pounds?|lb|cans?|tins?|packs?|packets?|cloves?|slices?|sprigs?|bunch(?:es)?|handfuls?|pinches?)\s+/;
    let previous = '';
    while (s !== previous) {
      previous = s;
      s = s.replace(prefixes, '');
    }
    return clean(s).replace(/[.,;:]$/, '');
  }

  /* ------------------------------------------------------------
     bundled cookbook
     ------------------------------------------------------------ */
  const cookbookRecipes = () => {
    const out = [];
    try {
      if (typeof COOKBOOK_RECIPES !== 'undefined' && Array.isArray(COOKBOOK_RECIPES)) out.push(...COOKBOOK_RECIPES);
      if (typeof BASEDCOOKING_RECIPES !== 'undefined' && Array.isArray(BASEDCOOKING_RECIPES)) out.push(...BASEDCOOKING_RECIPES);
      if (typeof OPENCORPUS_RECIPES !== 'undefined' && Array.isArray(OPENCORPUS_RECIPES)) out.push(...OPENCORPUS_RECIPES);
    } catch (err) {}
    return out;
  };

  const COOKBOOK_QUANTITY = '(?:\\d+(?:[.,]\\d+)?\\s*[½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]|\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])';
  const COOKBOOK_UNIT = '(?:cups?|tablespoons?|tbsp|teaspoons?|tsp|grams?|g|kg|kilograms?|ml|millilit(?:er|re)s?|lit(?:er|re)s?|l|ounces?|oz|pounds?|lbs?|cloves?|slices?|sprigs?|stalks?|bunch(?:es)?|handfuls?|pinch(?:es)?|cans?|tins?|packs?|packets?|heads?|pieces?|dashes?|drops?|sheets?|wedges?|fillets?|rashers?|knobs?|sticks?|cm|inch(?:es)?|medium|large|small|whole)';
  const COOKBOOK_MEASURE = new RegExp(
    '^(' + COOKBOOK_QUANTITY + '(?:\\s*(?:-|–|to)\\s*' + COOKBOOK_QUANTITY + ')?\\s*' + COOKBOOK_UNIT + '?)\\s+(.+)$',
    'i'
  );

  function splitCookbookIngredient(raw) {
    const text = clean(raw);
    const match = text.match(COOKBOOK_MEASURE);
    if (!match) return { name: text, measure: '' };
    return { name: clean(match[2]), measure: clean(match[1]) };
  }

  function cookbookFamily(name) {
    return familyOf(clean(name).split(',')[0]);
  }

  function normalizeCookbookDetail(record) {
    const steps = (record.steps || []).map(clean).filter(Boolean);
    const instructions = steps.join('\n');
    const category = clean(record.category) || 'Recipe';
    const ingredients = (record.ingredients || []).map(raw => {
      const part = splitCookbookIngredient(raw);
      return { name: part.name, measure: part.measure, family: cookbookFamily(part.name) };
    }).filter(item => item.name);
    const src = clean(record.source);
    const isBased = /^bc-/.test(record.id || '') || /based\.cooking/.test(src);
    const isOpen = /^oc-/.test(record.id || '') || /Rippy1911\/open-recipe-corpus|open-recipe-corpus/i.test(src);
    const sourceName = isBased ? 'based.cooking' : isOpen ? 'open-recipe-corpus' : 'Wikibooks Cookbook';
    let sourceHost = 'en.wikibooks.org';
    try { if (src) sourceHost = new URL(src).hostname.replace(/^www\./, ''); } catch (e) {}
    if (isBased) sourceHost = 'based.cooking';
    if (isOpen) sourceHost = sourceHost || 'open-recipe-corpus';
    const license = isBased
      ? (typeof BASEDCOOKING_LICENSE !== 'undefined' ? BASEDCOOKING_LICENSE : { name: 'based.cooking', license: 'Unlicense', url: 'https://based.cooking/' })
      : isOpen
        ? (typeof OPENCORPUS_LICENSE !== 'undefined' ? OPENCORPUS_LICENSE : { name: 'open-recipe-corpus', license: 'CC BY-SA 4.0', url: 'https://github.com/Rippy1911/open-recipe-corpus' })
        : (typeof COOKBOOK_LICENSE !== 'undefined' ? COOKBOOK_LICENSE : null);

    return {
      id: record.id,
      title: clean(record.title) || 'Untitled recipe',
      category,
      cuisine: normalizeCuisine(record.cuisine),
      area: '',
      country: '',
      thumb: clean(record.image),
      instructions,
      steps,
      words: instructions.split(/\s+/).filter(Boolean).length,
      tags: Array.isArray(record.tags) ? record.tags : [],
      ingredients,
      serves: record.servings || inferServings(instructions, category),
      time: record.time || inferTime(instructions, category),
      source: src,
      sourceName,
      sourceHost,
      sourceWeight: 14,
      youtube: '',
      license,
      sourceType: 'cookbook',
      fetchedAt: Date.now()
    };
  }

  function cookbookSummary(record, detail) {
    return {
      id: record.id,
      title: detail.title,
      thumb: detail.thumb,
      category: detail.category,
      cuisine: detail.cuisine,
      country: '',
      sourceType: 'cookbook',
      families: uniq(detail.ingredients.map(item => item.family)),
      cookbook: record
    };
  }

  /* ------------------------------------------------------------
     ingredient families
     ------------------------------------------------------------ */
  function familyOf(raw) {
    const base = cleanIngredientName(raw);
    if (!base) return '';
    const noDesc = stripDescriptors(base);
    const variants = [
      base,
      singularize(base),
      noDesc,
      singularize(noDesc)
    ];
    const words = noDesc.split(' ').filter(Boolean);
    if (words.length > 1) {
      variants.push(words.slice(-2).join(' '));
      variants.push(singularize(words.slice(-2).join(' ')));
      variants.push(words[words.length - 1]);
      variants.push(singularWord(words[words.length - 1]));
    }
    for (const v of variants) {
      if (v && FAMILY_ALIASES[v]) return FAMILY_ALIASES[v];
    }
    return singularize(noDesc) || singularize(base) || base;
  }

  const isPantryFamily = (family, pantryFamilies) => (pantryFamilies || new Set(DEFAULT_PANTRY)).has(family);

  /* ------------------------------------------------------------
     request helpers
     ------------------------------------------------------------ */
  async function fetchJSON(path, timeout = 16000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const url = `${BASE}/${path}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`TheMealDB returned ${res.status}`);
      const text = await res.text();
      if (!text || !text.trim()) return {};
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  async function mapLimit(items, limit, fn) {
    const list = [...items];
    const out = new Array(list.length);
    let cursor = 0;
    async function worker() {
      while (cursor < list.length) {
        const index = cursor++;
        out[index] = await fn(list[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
    return out;
  }

  /* ------------------------------------------------------------
     cuisine helpers
     ------------------------------------------------------------ */
  function cuisineFor(country) {
    return cuisineForCountry(country);
  }

  function normalizeCountry(raw, area, areaMap) {
    const value = clean(raw);
    if (value) return value;
    const areaValue = clean(area);
    if (areaValue && areaMap) {
      if (areaMap.has(areaValue)) return areaMap.get(areaValue);
      const parts = areaValue.split(',').map(x => x.trim());
      for (const part of parts) {
        if (areaMap.has(part)) return areaMap.get(part);
      }
    }
    return areaValue || 'Unknown';
  }

  /* ------------------------------------------------------------
     catalog
     ------------------------------------------------------------ */
  function normalizeCatalogMeal(meal, country, fallbackCategory) {
    return {
      id: String(meal.idMeal),
      title: clean(meal.strMeal) || 'Untitled recipe',
      thumb: clean(meal.strMealThumb),
      category: clean(meal.strCategory) || fallbackCategory || 'Recipe',
      area: clean(meal.strArea),
      country: country || 'Unknown',
      cuisine: cuisineFor(country),
      sourceType: 'live'
    };
  }

  async function loadCatalog(onProgress) {
    if (cache.catalog) return cache.catalog;
    if (cache.catalogPromise) return cache.catalogPromise;

    cache.catalogPromise = (async () => {
      const [categoryResult, areaResult] = await Promise.allSettled([
        fetchJSON('list.php?c=list'),
        fetchJSON('list.php?a=list')
      ]);

      const categoryRows = categoryResult.status === 'fulfilled'
        ? (categoryResult.value.meals || []) : [];
      const categories = uniq(categoryRows.map(r => clean(r.strCategory))).length
        ? uniq(categoryRows.map(r => clean(r.strCategory)))
        : FALLBACK_CATEGORIES.slice();

      const areaMap = new Map();
      if (areaResult.status === 'fulfilled') {
        for (const row of (areaResult.value.meals || [])) {
          const country = clean(row.strCountry);
          const areas = String(row.strArea || '').split(',').map(x => x.trim()).filter(Boolean);
          for (const area of areas) if (country && area) areaMap.set(area, country);
        }
      }

      const mealMap = new Map();
      const failed = [];
      let done = 0;
      await mapLimit(categories, 5, async (category) => {
        try {
          const data = await fetchJSON(`filter.php?c=${encodeURIComponent(category)}`);
          for (const meal of (data.meals || [])) {
            if (!meal || !meal.idMeal || mealMap.has(String(meal.idMeal))) continue;
            const country = normalizeCountry(meal.strCountry, meal.strArea, areaMap);
            mealMap.set(String(meal.idMeal), normalizeCatalogMeal(meal, country, category));
          }
        } catch (err) {
          failed.push(category);
        } finally {
          done++;
          if (onProgress) onProgress({ done, total: categories.length, failed: failed.length });
        }
      });

      const liveMeals = [...mealMap.values()];
      const cookbookMeals = [];
      for (const record of cookbookRecipes()) {
        if (!record || !record.id) continue;
        const detail = normalizeCookbookDetail(record);
        cache.details.set(detail.id, detail);
        cookbookMeals.push(cookbookSummary(record, detail));
      }

      const meals = [...liveMeals, ...cookbookMeals].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
      );

      if (!meals.length) {
        throw new Error('No recipes could be loaded. Check your connection and try again.');
      }

      const countries = uniq(meals.map(m => m.country).filter(c => c && c !== 'Unknown'))
        .sort((a, b) => a.localeCompare(b));

      const presentCuisines = uniq(meals.map(m => normalizeCuisine(m.cuisine)).filter(c => c && c !== 'Other'));
      const cuisines = CUISINE_ORDER.filter(c => presentCuisines.includes(c));
      // Keep the filter focused: only show curated cuisines.

      const catalog = {
        meals,
        countries,
        cuisines,
        liveCount: liveMeals.length,
        cookbookCount: cookbookMeals.length,
        categories,
        areaMap,
        failedCategories: failed,
        fetchedAt: Date.now()
      };
      cache.catalog = catalog;
      return catalog;
    })();

    try {
      return await cache.catalogPromise;
    } catch (err) {
      cache.catalogPromise = null;
      throw err;
    }
  }

  /* ------------------------------------------------------------
     ingredient index
     ------------------------------------------------------------ */
  async function loadIngredients() {
    if (cache.ingredients) return cache.ingredients;
    if (cache.ingredientPromise) return cache.ingredientPromise;

    cache.ingredientPromise = (async () => {
      const data = await fetchJSON('list.php?i=list');
      const names = uniq((data.meals || []).map(m => clean(m.strIngredient)));
      const lookup = new Map();
      const byFamily = new Map();

      for (const name of names) {
        const lower = name.toLowerCase();
        lookup.set(lower, name);
        lookup.set(singularize(lower), name);
        const family = familyOf(name);
        if (!byFamily.has(family)) byFamily.set(family, []);
        byFamily.get(family).push(name);
      }

      for (const list of byFamily.values()) {
        list.sort((a, b) => {
          const aGeneric = /^(chicken|beef|pork|lamb|fish|cheese|tomato|onion|potato|rice|pasta|bread|egg)/i.test(a) ? 0 : 1;
          const bGeneric = /^(chicken|beef|pork|lamb|fish|cheese|tomato|onion|potato|rice|pasta|bread|egg)/i.test(b) ? 0 : 1;
          if (aGeneric !== bGeneric) return aGeneric - bGeneric;
          return a.length - b.length;
        });
      }

      cache.ingredients = { names, lookup, byFamily };
      return cache.ingredients;
    })();

    try {
      return await cache.ingredientPromise;
    } catch (err) {
      cache.ingredientPromise = null;
      throw err;
    }
  }

  function apiNamesForIngredient(userName, index) {
    const base = cleanIngredientName(userName);
    const family = familyOf(userName);
    if (!base) return [];

    const exact = index.lookup.get(base) || index.lookup.get(singularize(base));
    const baseWords = base.split(' ').filter(Boolean);
    const root = singularWord(baseWords[baseWords.length - 1] || base);
    const familyNames = index.byFamily.get(family) || [];

    const ranked = familyNames.map(name => {
      const lower = name.toLowerCase();
      let score = 0;
      if (lower === base) score += 120;
      if (singularize(lower) === singularize(base)) score += 60;
      if (root && lower.includes(root)) score += 28;
      if (baseWords.some(w => w.length > 2 && lower.includes(w))) score += 10;
      score -= lower.length * 0.02;
      return { name, score };
    }).sort((a, b) => b.score - a.score || a.name.length - b.name.length);

    return uniq([exact, ...ranked.map(item => item.name)]).slice(0, 8);
  }

  async function filterByIngredient(name) {
    const key = name.toLowerCase();
    if (cache.ingredientFilters.has(key)) return cache.ingredientFilters.get(key);
    const promise = (async () => {
      const data = await fetchJSON(`filter.php?i=${encodeURIComponent(name.replace(/\s+/g, '_'))}`);
      const ids = new Set((data.meals || []).map(m => String(m.idMeal)));
      return ids;
    })();
    cache.ingredientFilters.set(key, promise);
    try {
      return await promise;
    } catch (err) {
      cache.ingredientFilters.delete(key);
      return new Set();
    }
  }

  async function resolveIngredients(ingredients) {
    const index = await loadIngredients();
    const entries = ingredients.map(item => typeof item === 'string'
      ? { name: item, family: familyOf(item) }
      : { name: item.name, family: item.family || familyOf(item.name) });

    const nameJobs = [];
    const resolved = [];
    for (const entry of entries) {
      const names = apiNamesForIngredient(entry.name, index);
      resolved.push({ name: entry.name, family: entry.family, apiNames: names });
      for (const apiName of names) {
        if (!nameJobs.some(job => job.apiName === apiName)) {
          nameJobs.push({ apiName, family: entry.family });
        }
      }
    }

    const hits = new Map();
    await mapLimit(nameJobs, 5, async (job) => {
      const ids = await filterByIngredient(job.apiName);
      for (const id of ids) {
        const current = hits.get(id) || { count: 0, families: new Set() };
        current.count++;
        current.families.add(job.family);
        hits.set(id, current);
      }
    });

    return { hits, resolved };
  }

  function parseIngredientInput(text) {
    const pieces = String(text || '')
      .replace(/\r/g, '')
      .split(/[,;\n]+|\s+and\s+/i)
      .map(p => clean(p))
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const piece of pieces) {
      const family = familyOf(piece);
      if (!family || seen.has(family)) continue;
      seen.add(family);
      out.push({ raw: piece, name: cleanIngredientName(piece) || piece, family });
    }
    return out;
  }

  /* ------------------------------------------------------------
     instruction parsing
     ------------------------------------------------------------ */
  const TIME_DEFAULTS = {
    Beef: 75, Lamb: 75, Goat: 75, Pork: 60, Chicken: 50, Seafood: 35,
    Pasta: 35, Dessert: 55, Breakfast: 25, Starter: 25, Side: 25,
    Vegan: 40, Vegetarian: 40, Miscellaneous: 40
  };

  function rangeMax(a, b) {
    const first = parseFloat(a);
    const second = b == null || b === '' ? first : parseFloat(b);
    return Math.max(first || 0, second || 0);
  }

  function inferTime(instructions, category) {
    const text = String(instructions || '').toLowerCase();
    let minutes = 0;
    let hours = 0;

    for (const match of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d{1,3}(?:\.\d+)?)?\s*(?:minutes?|mins?)\b/g)) {
      minutes += rangeMax(match[1], match[2]);
    }
    for (const match of text.matchAll(/(\d{1,2}(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d{1,2}(?:\.\d+)?)?\s*(?:hours?|hrs?)\b/g)) {
      hours += rangeMax(match[1], match[2]);
    }

    let estimate = 8 + minutes + hours * 60;
    if (/overnight|next day|leave .* (?:hours|overnight)|chill .* (?:hours|overnight)/i.test(text)) {
      estimate = Math.max(estimate, 480);
    }
    if (estimate < 12) {
      estimate = TIME_DEFAULTS[category] || 40;
    }
    return Math.max(10, Math.min(300, Math.round(estimate / 5) * 5));
  }

  function inferServings(instructions, category) {
    const text = String(instructions || '').toLowerCase();
    const patterns = [
      /serves\s*(?:about|around)?\s*[:\-]?\s*(\d{1,2})/i,
      /servings?\s*(?:size)?\s*[:\-]?\s*(\d{1,2})/i,
      /makes\s*(?:about|around)?\s*(\d{1,2})/i,
      /yields?\s*(?:about|around)?\s*(\d{1,2})/i,
      /(\d{1,2})\s*(?:people|persons|portions)\b/i,
      /for\s+(\d{1,2})\s*(?:people|persons)\b/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n >= 1 && n <= 24) return n;
      }
    }
    if (category === 'Dessert') return 8;
    if (category === 'Starter' || category === 'Side') return 4;
    return 4;
  }

  function splitSteps(instructions) {
    let text = String(instructions || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (!text) return [];

    let blocks = text.split(/\n+/)
      .map(s => clean(s))
      .filter(Boolean)
      .filter(s => !/^(step\s*\d+|method|instructions?|preparation)[:.\s-]*$/i.test(s))
      .filter(s => !/^(serves?|servings?|makes?|yields?)\s*(?:about|around)?\s*[:\-]?\s*\d/i.test(s));

    blocks = blocks.map(s => s.replace(/^step\s*\d+\s*[:.)-]?\s*/i, '').trim());

    const longBlocks = [];
    for (const block of blocks) {
      if (block.length <= 340) {
        longBlocks.push(block);
        continue;
      }
      const sentences = block.match(/[^.!?]+[.!?]+(?:["')\]]*)|[^.!?]+$/g) || [block];
      let chunk = '';
      for (const sentence of sentences.map(s => clean(s))) {
        if (!chunk) chunk = sentence;
        else if ((chunk + ' ' + sentence).length <= 280) chunk += ' ' + sentence;
        else { longBlocks.push(chunk); chunk = sentence; }
      }
      if (chunk) longBlocks.push(chunk);
    }

    return longBlocks.slice(0, 18);
  }

  function parseTags(raw) {
    return uniq(String(raw || '').split(',').map(t => clean(t)).filter(Boolean));
  }

  function safeUrl(raw) {
    const value = clean(raw);
    if (!/^https?:\/\//i.test(value)) return '';
    try { return new URL(value).href; } catch (err) { return ''; }
  }

  function sourceInfo(url) {
    const safe = safeUrl(url);
    if (!safe) return { url: '', host: '', name: '', weight: 0 };
    let host = '';
    try { host = new URL(safe).hostname.replace(/^www\./, ''); } catch (err) { host = ''; }
    if (!host) return { url: safe, host: '', name: '', weight: 0 };

    let best = null;
    for (const [domain, info] of Object.entries(TRUSTED_DOMAINS)) {
      if (host === domain || host.endsWith('.' + domain)) {
        if (!best || domain.length > best.domain.length) best = { domain, info };
      }
    }
    if (best) return { url: safe, host, name: best.info.name, weight: best.info.weight };
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      return { url: safe, host, name: 'YouTube', weight: 6 };
    }
    return { url: safe, host, name: host, weight: 8 };
  }

  function normalizeDetail(meal, catalogMeta) {
    const id = String(meal.idMeal);
    const category = clean(meal.strCategory) || (catalogMeta && catalogMeta.category) || 'Recipe';
    const country = normalizeCountry(
      meal.strCountry,
      meal.strArea,
      cache.catalog ? cache.catalog.areaMap : null
    );
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
      const name = clean(meal[`strIngredient${i}`]);
      const measure = clean(meal[`strMeasure${i}`]);
      if (!name || /^(unknown|n\/a|null)$/i.test(name)) continue;
      ingredients.push({
        name,
        measure,
        family: familyOf(name)
      });
    }

    const instructions = String(meal.strInstructions || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .trim();

    const source = sourceInfo(meal.strSource);
    const youtube = safeUrl(meal.strYoutube);
    const steps = splitSteps(instructions);
    const tags = parseTags(meal.strTags);
    const words = instructions.split(/\s+/).filter(Boolean).length;

    return {
      id,
      title: clean(meal.strMeal) || (catalogMeta && catalogMeta.title) || 'Untitled recipe',
      category,
      area: clean(meal.strArea) || (catalogMeta && catalogMeta.area) || '',
      country: country || (catalogMeta && catalogMeta.country) || 'Unknown',
      cuisine: cuisineFor(country || (catalogMeta && catalogMeta.country)),
      thumb: clean(meal.strMealThumb) || (catalogMeta && catalogMeta.thumb) || '',
      instructions,
      steps,
      words,
      tags,
      ingredients,
      serves: inferServings(instructions, category),
      time: inferTime(instructions, category),
      source: source.url,
      sourceName: source.name,
      sourceHost: source.host,
      sourceWeight: source.weight,
      youtube,
      sourceType: 'live',
      fetchedAt: Date.now()
    };
  }

  /* ------------------------------------------------------------
     scoring
     ------------------------------------------------------------ */
  function scoreLabel(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 75) return 'Strong';
    if (score >= QUALITY_GATE) return 'Good';
    return 'Below gate';
  }

  function dietFlags(recipe) {
    const label = `${recipe.category} ${recipe.tags.join(' ')}`.toLowerCase();
    const vegan = /\bvegan\b/.test(label);
    const vegetarian = vegan || /\bvegetarian\b/.test(label);
    return { vegan, vegetarian };
  }

  function scoreRecipe(recipe, opts = {}) {
    const userFamilies = opts.userFamilies || new Set();
    const pantryFamilies = opts.pantryFamilies || new Set(DEFAULT_PANTRY);
    const minutes = typeof opts.minutes === 'number' ? opts.minutes : 999;
    const diet = opts.diet || 'all';

    const mainIngredients = [];
    const seenFamilies = new Set();
    for (const ing of recipe.ingredients) {
      if (pantryFamilies.has(ing.family)) continue;
      if (seenFamilies.has(ing.family)) continue;
      seenFamilies.add(ing.family);
      mainIngredients.push(ing);
    }

    const usedIngredients = mainIngredients.filter(i => userFamilies.has(i.family));
    const usedFamilies = uniq(usedIngredients.map(i => i.family));
    const missing = mainIngredients.filter(i => !userFamilies.has(i.family));
    const mainCount = mainIngredients.length;
    const noUserFilter = userFamilies.size === 0;
    const matchPct = mainCount
      ? usedFamilies.length / mainCount
      : (userFamilies.size ? 0 : 1);
    const match = noUserFilter
      ? 35
      : Math.round(35 * Math.min(1, matchPct));

    const source = Math.min(20, recipe.sourceWeight || 0);

    const method = Math.min(
      25,
      Math.max(0, Math.round(recipe.words / 10) + Math.min(6, recipe.steps.length))
    );

    const complete = Math.min(10,
      (recipe.source ? 4 : 0) +
      (recipe.youtube ? 2 : 0) +
      (recipe.thumb ? 2 : 0) +
      (recipe.tags.length ? 1 : 0) +
      (recipe.cuisine && recipe.cuisine !== 'Other' ? 1 : 0)
    );

    let practical = 10;
    if (recipe.time > 15) practical = 9;
    if (recipe.time > 30) practical = 8;
    if (recipe.time > 45) practical = 7;
    if (recipe.time > 60) practical = 5;
    if (recipe.time > 90) practical = 3;
    if (recipe.time > 120) practical = 2;
    if (recipe.time > 180) practical = 1;
    if (mainCount > 14) practical = Math.max(1, practical - 1);

    const total = Math.max(0, Math.min(100, match + source + method + complete + practical));
    const flags = dietFlags(recipe);

    const timePass = minutes >= 999 || recipe.time <= minutes;
    const dietPass = diet === 'all' || (diet === 'vegetarian' && flags.vegetarian) || (diet === 'vegan' && flags.vegan);
    const gatePass = total >= QUALITY_GATE;
    const ingredientPass = userFamilies.size === 0 || usedFamilies.length > 0;
    const missingCount = missing.length;
    const canMakeNow = missingCount === 0;
    // When searching by ingredients, show recipes that actually use what you have.
    // Prioritize makeable-now, then fewer missing items. Browsing uses the quality gate.
    const pass = timePass && dietPass && (userFamilies.size === 0 ? gatePass : ingredientPass);

    const parts = SCORE_PARTS.map(part => {
      const value = part.key === 'match' ? match
        : part.key === 'source' ? source
          : part.key === 'method' ? method
            : part.key === 'complete' ? complete
              : practical;
      const label = part.key === 'match' && noUserFilter
        ? 'Ingredient fit (no filter)'
        : part.label;
      return { ...part, label, value };
    });

    return {
      ...recipe,
      score: total,
      scoreLabel: scoreLabel(total),
      scoreParts: parts,
      match,
      matchPct,
      sourceScore: source,
      methodScore: method,
      completeScore: complete,
      practicalScore: practical,
      mainCount,
      usedFamilies,
      usedIngredients,
      missing,
      missingCount,
      canMakeNow,
      dietFlags: flags,
      timePass,
      dietPass,
      gatePass,
      ingredientPass,
      pass
    };
  }

  /* ------------------------------------------------------------
     detail fetching
     ------------------------------------------------------------ */
  async function fetchDetail(id, catalogMeta, onProgress) {
    if (cache.details.has(id)) {
      const cached = cache.details.get(id);
      await ensurePhoto(cached);
      if (onProgress) onProgress();
      return cached;
    }
    if (catalogMeta && catalogMeta.sourceType === 'cookbook') {
      const record = catalogMeta.cookbook;
      const detail = record ? normalizeCookbookDetail(record) : null;
      if (detail) { await ensurePhoto(detail); cache.details.set(id, detail); }
      if (onProgress) onProgress();
      return detail;
    }
    try {
      // A single retry absorbs the transient network/rate-limit failures
      // that would otherwise look like "nothing passed the gate".
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const data = await fetchJSON(`lookup.php?i=${encodeURIComponent(id)}`);
          const meal = (data.meals || [])[0];
          if (!meal) return null;
          const normalized = normalizeDetail(meal, catalogMeta);
          await ensurePhoto(normalized);
          cache.details.set(id, normalized);
          cache.detailRaw.set(id, data);
          return normalized;
        } catch (err) {
          if (attempt === 1) return null;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      return null;
    } finally {
      if (onProgress) onProgress();
    }
  }


  /* ------------------------------------------------------------
     photos (every result must show a photo)
     ------------------------------------------------------------ */
  const photoCache = new Map();
  const PHOTO_FALLBACKS = [
    ['#2E6B53','#1B4332','#D99336'], ['#8B4A3A','#5B2C22','#E8B56C'],
    ['#B5651D','#7A3E10','#F1E3B0'], ['#3D5A80','#293241','#EE6C4D'],
    ['#556B2F','#2F3E1F','#D4A373'], ['#6D597A','#355070','#EAAC8B']
  ];

  function svgPhoto(recipe) {
    const title = clean(recipe && (recipe.title || 'Recipe')) || 'Recipe';
    const sub = clean(recipe && (recipe.cuisine || recipe.category || 'Recipe')) || 'Recipe';
    const seed = Array.from(title).reduce((n, c) => n + c.charCodeAt(0), 0);
    const p = PHOTO_FALLBACKS[seed % PHOTO_FALLBACKS.length];
    const letter = title.charAt(0).toUpperCase() || 'R';
    const safeTitle = title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').slice(0, 34);
    const safeSub = sub.replace(/&/g,'&amp;').replace(/</g,'&lt;').slice(0, 28);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${p[0]}"/><stop offset="100%" stop-color="${p[1]}"/></linearGradient></defs>
  <rect width="640" height="420" fill="url(#g)"/>
  <circle cx="520" cy="90" r="140" fill="${p[2]}" opacity="0.12"/>
  <circle cx="120" cy="360" r="120" fill="#ffffff" opacity="0.06"/>
  <ellipse cx="320" cy="245" rx="132" ry="132" fill="#FBF7EC" opacity="0.13"/>
  <ellipse cx="320" cy="245" rx="108" ry="108" fill="none" stroke="#FBF7EC" stroke-width="3" opacity="0.22"/>
  <text x="320" y="268" text-anchor="middle" font-family="Georgia,serif" font-size="88" fill="#FBF7EC" opacity="0.9">${letter}</text>
  <rect x="0" y="332" width="640" height="88" fill="rgba(20,16,12,0.28)"/>
  <text x="32" y="372" font-family="system-ui,sans-serif" font-size="24" font-weight="600" fill="#FBF7EC">${safeTitle}</text>
  <text x="32" y="398" font-family="system-ui,sans-serif" font-size="15" fill="#F1E3B0" opacity="0.9">${safeSub}</text>
</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  async function fetchWikiPhoto(title, cuisine) {
    const base = clean(title);
    if (!base) return null;
    const c = clean(cuisine) && clean(cuisine) !== 'Other' ? clean(cuisine) : '';
    const queries = [ [base, c, 'food'].filter(Boolean).join(' '), `${base} dish` ];
    for (const gsrsearch of queries) {
      try {
        const url = 'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=1&prop=pageimages|info&inprop=url&pithumbsize=640&pilimit=1&format=json&origin=*' +
          '&gsrsearch=' + encodeURIComponent(gsrsearch);
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 2200) : null;
        const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
        if (timer) clearTimeout(timer);
        if (!res || !res.ok) continue;
        const data = await res.json();
        const pages = data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
        const page = pages.find(p => p && p.thumbnail && p.thumbnail.source);
        if (page) return { thumb: page.thumbnail.source, credit: 'Wikimedia', page: page.fullurl || '' };
      } catch (err) { /* fall back */ }
    }
    return null;
  }

  async function ensurePhoto(recipe) {
    if (!recipe) return recipe;
    const existing = clean(recipe.thumb);
    if (existing) {
      // normalize protocol-relative URLs; keep any valid image URL/data URI
      recipe.thumb = existing.startsWith('//') ? 'https:' + existing : existing;
      if (/^(https?:|data:image\/)/i.test(recipe.thumb)) return recipe;
    }
    const key = clean(recipe.title || recipe.id || '').toLowerCase();
    if (key && photoCache.has(key)) {
      const cached = photoCache.get(key);
      recipe.thumb = cached.thumb;
      if (cached.credit) recipe.photoCredit = cached.credit;
      if (cached.page) recipe.photoPage = cached.page;
      return recipe;
    }
    let found = null;
    try { found = await fetchWikiPhoto(recipe.title, recipe.cuisine); } catch (err) {}
    if (!found) found = { thumb: svgPhoto(recipe), credit: '' };
    if (key) photoCache.set(key, found);
    recipe.thumb = found.thumb;
    if (found.credit) recipe.photoCredit = found.credit;
    if (found.page) recipe.photoPage = found.page;
    return recipe;
  }

  /* ------------------------------------------------------------
     scanning
     ------------------------------------------------------------ */
  async function scan(opts = {}) {
    const ingredients = opts.ingredients || [];
    const cuisine = opts.cuisine || 'all';
    const minutes = typeof opts.minutes === 'number' ? opts.minutes : 999;
    const diet = opts.diet || 'all';
    const offset = Math.max(0, Number(opts.offset) || 0);
    const limit = Math.max(12, Math.min(60, Number(opts.limit) || 36));
    const pantryFamilies = new Set(opts.pantryFamilies || DEFAULT_PANTRY);
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    const userEntries = ingredients.map(item => typeof item === 'string'
      ? { name: item, family: familyOf(item) }
      : { name: item.name, family: item.family || familyOf(item.name) });
    const userFamilies = new Set(userEntries.map(i => i.family));

    const catalog = await loadCatalog();
    let liveHits = null;
    let resolved = [];
    if (ingredients.length) {
      const result = await resolveIngredients(ingredients);
      liveHits = result.hits;
      resolved = result.resolved;
    }

    let pool = catalog.meals.filter(meal => {
      const mealCuisine = normalizeCuisine(meal.cuisine);
      return cuisine === 'all' || mealCuisine === cuisine;
    });

    const poolBeforeIngredients = pool.length;
    const hitMap = new Map();
    if (liveHits) {
      for (const [id, hit] of liveHits) hitMap.set(id, { count: hit.count });
    }
    if (userFamilies.size) {
      // Cookbook recipes are local: check their ingredients now so
      // Bangladeshi and other cookbook dishes appear instantly.
      for (const meal of pool) {
        if (meal.sourceType !== 'cookbook' || !meal.families) continue;
        let count = 0;
        for (const family of meal.families) if (userFamilies.has(family)) count++;
        if (count) hitMap.set(meal.id, { count });
      }
    }

    if (hitMap.size) {
      const idSet = new Set(hitMap.keys());
      pool = pool.filter(meal => idSet.has(meal.id));
    }

    pool = pool.slice().sort((a, b) => {
      if (hitMap.size) {
        const diff = (hitMap.get(b.id)?.count || 0) - (hitMap.get(a.id)?.count || 0);
        if (diff) return diff;
      }
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    // Instant path: cookbook details are local. Fetch top live details only.
    const cookbookBatch = pool.filter(m => m.sourceType === 'cookbook');
    const livePool = pool.filter(m => m.sourceType !== 'cookbook');
    const maxLive = userFamilies.size ? 120 : (cuisine !== 'all' ? 80 : 64);
    const liveBatch = livePool.slice(0, maxLive);
    const batch = [...cookbookBatch, ...liveBatch];

    const details = [];
    let done = 0;
    const total = batch.length || 1;
    if (onProgress) onProgress({ done: 0, total, scanned: 0 });
    await mapLimit(batch, 8, async (meta) => {
      const recipe = await fetchDetail(meta.id, meta, () => {
        done++;
        if (onProgress) onProgress({ done, total, scanned: done });
      });
      if (recipe) details.push(recipe);
    });
    const detailFailures = Math.max(0, liveBatch.length - details.filter(d => d.sourceType !== 'cookbook').length);

    const all = [];
    const reasons = { gate: 0, time: 0, diet: 0, ingredient: 0 };
    for (const recipe of details) {
      const scored = scoreRecipe(recipe, { userFamilies, pantryFamilies, minutes, diet });
      if (!scored.timePass) reasons.time++;
      if (!scored.dietPass) reasons.diet++;
      if (userFamilies.size && !scored.ingredientPass) reasons.ingredient++;
      if (!scored.gatePass) reasons.gate++;
      // Ingredient search: keep recipes that use what you have (makeable now first, then need-more).
      // Browsing: keep recipes that clear the quality gate.
      const keep = scored.timePass && scored.dietPass && (
        userFamilies.size
          ? (scored.ingredientPass && (scored.gatePass || (scored.canMakeNow && scored.score >= 48) || scored.score >= 45))
          : scored.gatePass
      );
      if (keep) all.push(scored);
    }

    all.sort((a, b) => {
      if (userFamilies.size) {
        return (b.canMakeNow ? 1 : 0) - (a.canMakeNow ? 1 : 0) ||
          (a.missingCount || 0) - (b.missingCount || 0) ||
          b.usedFamilies.length - a.usedFamilies.length ||
          b.score - a.score ||
          a.time - b.time ||
          a.title.localeCompare(b.title);
      }
      return b.score - a.score || a.time - b.time || a.title.localeCompare(b.title);
    });

    const results = all.slice(offset, offset + limit);
    const rejected = all.filter(r => !r.gatePass).slice(0, 10);
    const nextOffset = offset + limit < all.length ? offset + limit : null;

    return {
      results,
      rejected,
      reasons,
      bestRejected: all.find(r => !r.canMakeNow) || all[0] || null,
      scanned: batch.length,
      detailFailures,
      totalCandidates: pool.length,
      poolBeforeIngredients,
      nextOffset,
      offset,
      resolved,
      ingredientHitCount: hitMap.size,
      catalog: {
        meals: catalog.meals.length,
        liveCount: catalog.liveCount,
        cookbookCount: catalog.cookbookCount,
        cuisines: catalog.cuisines.length,
        categories: catalog.categories.length,
        fetchedAt: catalog.fetchedAt,
        failedCategories: catalog.failedCategories
      }
    };
  }

  /* ------------------------------------------------------------
     measurement scaling
     ------------------------------------------------------------ */
  const UNICODE_FRACTIONS = {
    '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3,
    '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8, '⅕': 1 / 5,
    '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6
  };

  function parseNumberToken(token) {
    if (token == null) return null;
    let s = String(token).trim();
    if (!s) return null;
    s = s.replace(/,/g, '.');

    // Whole number plus a Unicode fraction: "1½", "1 ½", "½".
    const glyph = s.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])$/);
    if (glyph) {
      const whole = glyph[1] ? parseFloat(glyph[1]) : 0;
      return whole + UNICODE_FRACTIONS[glyph[2]];
    }

    // Mixed ASCII fraction: "1 1/2".
    let mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

    // Plain ASCII fraction: "1/2".
    let fraction = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
      const denominator = Number(fraction[2]);
      return denominator ? Number(fraction[1]) / denominator : null;
    }

    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function fmtAmount(n) {
    if (!Number.isFinite(n)) return '';
    if (n >= 100) return String(Math.round(n));
    if (n >= 10) {
      const rounded = Math.round(n * 10) / 10;
      return String(rounded).replace(/\.0$/, '');
    }
    const rounded = Math.round(n * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
    const whole = Math.floor(rounded);
    const frac = rounded - whole;
    const fractions = [
      [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'],
      [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']
    ];
    let best = fractions[0];
    let bestDiff = Infinity;
    for (const f of fractions) {
      const diff = Math.abs(frac - f[0]);
      if (diff < bestDiff) { bestDiff = diff; best = f; }
    }
    if (bestDiff <= 0.05) {
      if (best[0] === 1) return String(whole + 1);
      if (whole === 0) return best[1];
      return `${whole}${best[1]}`;
    }
    return String(rounded);
  }

  const FRACTION_GLYPHS = '½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚';

  function scaleNumberRange(rangeText, factor) {
    const text = String(rangeText || '');
    const quantity = `(?:\\d+(?:[.,]\\d+)?\\s*[${FRACTION_GLYPHS}]|\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:[.,]\\d+)?|[${FRACTION_GLYPHS}])`;
    const pattern = new RegExp(`^(${quantity})(?:\\s*(?:-|–|to)\\s*(${quantity}))?`);
    return text.replace(pattern, (full, first, second) => {
      const a = parseNumberToken(first);
      if (a == null) return full;
      const scaledA = a * factor;
      if (second == null) return fmtAmount(scaledA);
      const b = parseNumberToken(second);
      if (b == null) return fmtAmount(scaledA);
      return `${fmtAmount(scaledA)}–${fmtAmount(b * factor)}`;
    });
  }

  const UNIT_SINGULAR = {
    cloves: 'clove', slices: 'slice', sprigs: 'sprig', stalks: 'stalk',
    bunches: 'bunch', cans: 'can', tins: 'tin', packs: 'pack',
    packets: 'packet', tablespoons: 'tablespoon', teaspoons: 'teaspoon',
    cups: 'cup', ounces: 'ounce', pounds: 'pound', grams: 'gram',
    kilograms: 'kilogram', handfuls: 'handful', pinches: 'pinch',
    dashes: 'dash', drops: 'drop', rashers: 'rasher', fillets: 'fillet',
    breasts: 'breast', thighs: 'thigh', leaves: 'leaf', heads: 'head',
    knobs: 'knob', sticks: 'stick', sheets: 'sheet', wedges: 'wedge'
  };

  function singularizeScaledUnit(text) {
    return String(text).replace(/^1\s+([a-z]+)\b/i, (full, unit) => {
      const singular = UNIT_SINGULAR[unit.toLowerCase()];
      return singular ? `1 ${singular}` : full;
    });
  }

  function scaleMeasure(measure, factor) {
    const text = clean(measure);
    if (!text) return '';
    const f = Number(factor);
    if (!Number.isFinite(f) || f <= 0 || Math.abs(f - 1) < 0.0001) return text;
    if (!/\d|[½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]/.test(text)) return text;
    const scaled = scaleNumberRange(text, f);
    return singularizeScaledUnit(scaled);
  }

  /* ------------------------------------------------------------
     public surface
     ------------------------------------------------------------ */
  return {
    loadCatalog,
    loadIngredients,
    resolveIngredients,
    scan,
    sourceInfo,
    scoreRecipe,
    familyOf,
    cuisineFor,
    normalizeCuisine,
    inferTime,
    inferServings,
    splitSteps,
    parseIngredientInput,
    scaleMeasure,
    scaleNumberRange,
    fmtAmount,
    scoreLabel,
    dietFlags,
    _cache: cache,
    _fetchJSON: fetchJSON
  };
})();
