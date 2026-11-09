# memory.md

Dev notes for Recipe Whisperer. Keeping this rough on purpose so I can look back and remember what actually happened, not a polished changelog.

## 2026-11-04 — getting the shape right

- Started from the idea: pick ingredients, get real recipes fast. Early mistake was thinking a stored/local-only catalog would feel good enough. It didn't. People expect "search" to mean "go find it now", not "here are the 40 things I cached".
- Trade-off I kept coming back to: browser-only app, so I can't scrape random publisher sites directly (CORS, keys, ToS mess). Settled on live TheMealDB at runtime + bundled open-license shelves for instant/offline coverage. Not perfect coverage, but honest and deployable.
- The scan/checks side panel looked technical but ate space on mobile and didn't help anyone cook. Pulled it out. Replaced with a small mood animation (drifting color blobs + steam lines). Had to respect `prefers-reduced-motion` or it gets annoying fast.
- Logo flip-flopped. Tried an "R" monogram; it felt generic. Went back to the plate + steam mark. Sometimes the first pass was fine and I just needed to stop fiddling.

## 2026-11-08 — Bangladeshi results, search behavior, fewer fake filters

- Bug report: Bangladeshi recipes "still not found". Root cause wasn't only missing data — cuisine normalization/mapping and filter behavior were part of it. Fixed the mapping path (Bangladesh/Bangladeshi/India/Indian consistency) and made ingredient search actually check bundled cookbook/based shelves locally instead of waiting on API luck.
- Changed search priority to match the real ask:
  1. makeable now with what user has
  2. uses their ingredients, needs a few more
  No "add more ingredients before you can search" nonsense.
- Trimmed the cuisine list hard. A giant list of places with zero/near-zero recipes is worse than a focused list. Kept Bangladeshi and Indian prominent.
- Manual check against bundled data confirmed Bangladeshi dishes show up (Bhuna Khichuri, Mishti Doi, Borhani, Rosogulla etc.).

## 2026-11-09 — more data, photo-everywhere, and a dumb bug I caused

- Added two more bundled sources:
  - **based.cooking** (412 recipes, Unlicense/public domain dedication) via `tools/build_basedcooking.py`.
  - **open-recipe-corpus** English texts joined with metadata (1561 recipes, CC BY-SA 4.0, provenance links; some English text in that corpus is machine-translated at source). Built with `tools/build_opencorpus.py`.
  Total bundled count is much healthier now, and TheMealDB still fills gaps live.
- Every result needs a photo. Used source thumbnails where present; for missing images, tried a quick Wikipedia/Wikimedia pageimage lookup (keyless, short timeout), then fell back to a generated SVG card. Added `onerror` fallback too because hotlinking/external images break at the worst time.
- Animations: staggered card reveal, gentle image hover zoom, shimmer on progress. Kept them soft. If motion looks like a slot machine, I missed the point.
- Broke search after the photo change: `clean(...).toLower is not a function`. I typed `toLower()` instead of `toLowerCase()` in `live-api.js` (`ensurePhoto`). Mocked tests didn't catch it because fixture/TheMealDB recipes already had thumbnails and the missing-thumb branch never ran. Real bundled data did run it and blew up. Caught by a manual sanity script, fixed, re-ran tests. Note to self: mocked green != exercised all branches.

## 2026-11-09 — repo structure cleanup

- Restructured into `src/`, `assets/` (data/icons/manifest), `tools/`, `tests/`, `legacy/` with `index.html` kept at root for easy static serving.
- Updated script/style/manifest paths, build output paths, and tests (route globs still matched; fixed the one direct `require('../assets/data/cookbook-data.js')` in the bundled-data test).
- `tests/test.js` still passes after the move (15/15). Need to keep `OPENCORPUS_RECIPES`/`BASEDCOOKING_RECIPES` stubbed in tests or catalog counts go nondeterministic.

## Open trade-offs / watch list

- Wikipedia image lookup is best-effort and not licensed/curated as "the" recipe photo. It's better than empty cards, but a proper image strategy would need clearer source/rights handling per image.
- open-recipe-corpus gives volume; translation quality varies because of the upstream corpus. Provenance links are there, which matters.
- Ingredient matching is still family/alias based. Good enough for common cases, weird on edge ingredients and regional names.
- GitHub-ready != hosted. Static files are fine; live TheMealDB calls depend on network/CORS/API availability at runtime.
