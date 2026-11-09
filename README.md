# Recipe Whisperer

Recipe Whisperer is a static web tool that finds recipes from the ingredients you already have. Add ingredients, pick a cuisine and time, and get matching recipes right away. Dishes you can make now come first; options that use what you have but need a few more things come next.

## Features

- **Ingredient-first search** — results update from your ingredient list. Recipes are matched by ingredient families (for example, “red onion” counts as onion).
- **Prioritized results** — makeable-now recipes first, then recipes that need fewer extra ingredients.
- **Multiple recipe sources** — live records from [TheMealDB](https://www.themealdb.com/) plus bundled shelves that work after the page loads: [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Recipes), [based.cooking](https://based.cooking/), and English entries from [open-recipe-corpus](https://github.com/Rippy1911/open-recipe-corpus).
- **Cuisine and time filters** — focused list of well-known cuisines (including Bangladeshi and Indian) and practical time limits.
- **Photo on every result** — uses recipe/source images when available; tries a best-effort online image lookup for missing photos and falls back to a generated image so results never render without a visual.
- **Recipe detail tools** — source links, scaling, shopping list for missing items, cook mode, step timers, and screen wake lock while cooking.
- **No saved data** — no `localStorage`, `sessionStorage`, cookies, IndexedDB, or service worker. Pantry and list choices stay in memory for the current tab only.

## Project structure

```text
.
├── index.html                 # App entry (root, static-host friendly)
├── src/
│   ├── app.js                 # UI state, rendering, detail/cook/list behavior
│   ├── live-api.js            # Catalog merge, search/scoring, scaling, photo handling
│   ├── data-core.js           # Cuisines, aliases, pantry defaults, scoring, source directory
│   └── styles.css             # Layout, components, motion
├── assets/
│   ├── data/
│   │   ├── cookbook-data.js   # Bundled Wikibooks Cookbook recipes (CC BY-SA 4.0)
│   │   ├── basedcooking-data.js # Bundled based.cooking recipes (Unlicense/PD dedication)
│   │   └── opencorpus-data.js # Bundled open-recipe-corpus English recipes (CC BY-SA 4.0)
│   ├── icons/                 # App icons
│   └── manifest.webmanifest   # Web app manifest
├── tools/
│   ├── build_cookbook.py      # Rebuild Wikibooks bundle
│   ├── build_basedcooking.py  # Rebuild based.cooking bundle
│   ├── build_opencorpus.py    # Rebuild open-recipe-corpus English bundle
│   └── gen_icons.py           # Regenerate icons
├── tests/                     # Playwright-based UI tests and fixtures
├── legacy/                    # Previous static version archive
├── start.command              # Local launcher (macOS)
├── README.md
├── ATTRIBUTION.md             # Data/source credits and licenses
├── LICENSE                    # MIT license for app code
└── memory.md                  # Developer notes
```

## Setup

No build step is required to run the app.

**Requirements**
- Python 3 (for the local static server and data build scripts)
- Node.js (only for running tests)
- Google Chrome / Chromium available to Playwright (tests use a local Chrome path; override with `CHROME_PATH` if needed)

## Usage

### Run locally

```bash
python3 -m http.server 4173
# open http://localhost:4173/
```

Or on macOS, double-click `start.command`.

Live TheMealDB records require an internet connection. Bundled recipe shelves are included in the repository.

### View on a phone (same Wi-Fi)

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Open the LAN address shown by your machine (for example `http://192.168.1.4:4173/`) in the phone browser. On iPhone, **Share → Add to Home Screen** can install it as a standalone app.

### Run tests

```bash
cd tests
npm install      # once
node test.js     # mocked UI checks
node live-smoke.js   # optional real-network smoke test
```

Screenshots are written to `tests/shots-live/`.

### Rebuild bundled data

```bash
python3 tools/build_cookbook.py
python3 tools/build_basedcooking.py
python3 tools/build_opencorpus.py
python3 tools/gen_icons.py
```

Build scripts cache downloaded source material in local dot-cache directories (ignored by git).

## Scoring

Each recipe is scored out of 100 (ingredient fit, source trust, method detail, completeness, time/practicality). Browsing uses the quality gate; ingredient searches prioritize recipes that actually use selected ingredients (makeable now first, then fewer missing ingredients).

Times and serving counts are estimates read from recipe text. Open a recipe to correct the base serving count before scaling.

## Data sources and licenses

- **Runtime:** [TheMealDB](https://www.themealdb.com/) records/links.
- **Bundled (CC BY-SA 4.0):** Wikibooks Cookbook text and open-recipe-corpus English entries (with provenance/source links). ShareAlike/attribution obligations apply to that data when redistributed.
- **Bundled (Unlicense/public domain dedication):** based.cooking recipes.

Publisher sites, YouTube channels, and communities linked in the app are references, not copied scan sources. See [ATTRIBUTION.md](ATTRIBUTION.md).

## License

The application code is licensed under the MIT License. Bundled recipe data is covered by its respective source licenses; see `ATTRIBUTION.md`.
