#!/usr/bin/env python3
"""Build bundled recipes from Rippy1911/open-recipe-corpus (CC BY-SA 4.0).

Uses the English text layer (data/text/en.jsonl) joined with
data/recipes.jsonl for measures, time, servings, cuisine, and provenance.

Source: https://github.com/Rippy1911/open-recipe-corpus
Data license: CC BY-SA 4.0

Run:
    python3 tools/build_opencorpus.py
    python3 tools/build_opencorpus.py --refresh
"""

import argparse, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://raw.githubusercontent.com/Rippy1911/open-recipe-corpus/main/data/'
CACHE = os.path.join(ROOT, '..', '.opencorpus-cache')
OUT = os.path.join(ROOT, '..', 'assets', 'data', 'opencorpus-data.js')
UA = 'RecipeWhispererOpenCorpus/1.0'

CUISINE_MAP = {
    'polish': 'European', 'german': 'British', 'french': 'French', 'italian': 'Italian',
    'spanish': 'Spanish', 'greek': 'Greek', 'turkish': 'Turkish', 'russian': 'Russian',
    'ukrainian': 'Russian', 'british': 'British', 'irish': 'Irish', 'american': 'American',
    'mexican': 'Mexican', 'chinese': 'Chinese', 'japanese': 'Japanese', 'korean': 'Korean',
    'thai': 'Thai', 'vietnamese': 'Vietnamese', 'indian': 'Indian', 'bangladeshi': 'Bangladeshi',
    'pakistani': 'Pakistani', 'middle eastern': 'Middle Eastern', 'middle_eastern': 'Middle Eastern',
    'lebanese': 'Lebanese', 'moroccan': 'Moroccan', 'egyptian': 'Egyptian', 'ethiopian': 'Ethiopian',
    'african': 'African', 'brazilian': 'Brazilian', 'peruvian': 'Peruvian', 'argentinian': 'Argentine',
    'argentine': 'Argentine', 'caribbean': 'Caribbean', 'mediterranean': 'Mediterranean',
    'hungarian': 'European', 'czech': 'European', 'austrian': 'French', 'swiss': 'French',
    'portuguese': 'Spanish', 'romanian': 'European', 'bulgarian': 'European', 'serbian': 'European',
    'croatian': 'European', 'lithuanian': 'European', 'latvian': 'European', 'scandinavian': 'European',
    'swedish': 'European', 'norwegian': 'European', 'danish': 'European', 'finnish': 'European',
    'dutch': 'European', 'belgian': 'French', 'jewish': 'Middle Eastern', 'persian': 'Middle Eastern',
    'indonesian': 'Indonesian', 'malaysian': 'Malaysian', 'filipino': 'Filipino', 'other': 'Other',
    'international': 'Other', 'european': 'European',
}

UNIT_FMT = {
    'g': 'g', 'kg': 'kg', 'ml': 'ml', 'l': 'l', 'pcs': '', 'tsp': 'tsp', 'tbsp': 'tbsp',
    'pinch': 'pinch', 'clove': 'clove', 'cloves': 'cloves', 'slice': 'slice', 'slices': 'slices',
    'bunch': 'bunch', 'to_taste': 'to taste', 'cup': 'cup', 'cups': 'cups',
}


def get(name, refresh=False):
    os.makedirs(CACHE, exist_ok=True)
    cp = os.path.join(CACHE, os.path.basename(name))
    if os.path.exists(cp) and not refresh:
        return open(cp, 'r', encoding='utf-8')
    req = urllib.request.Request(BASE + name, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r: data = r.read()
    with open(cp, 'wb') as f: f.write(data)
    return open(cp, 'r', encoding='utf-8')


def fmt_qty(q):
    if q is None: return ''
    try:
        n = float(q)
        if n.is_integer(): return str(int(n))
        return ('%.2f' % n).rstrip('0').rstrip('.')
    except Exception:
        return str(q)


def format_ingredient(amount, text):
    qty = fmt_qty((amount or {}).get('qty'))
    unit = ((amount or {}).get('unit') or '').strip()
    unit_out = UNIT_FMT.get(unit, unit.replace('_', ' '))
    name = ((text or {}).get('name') or '').strip()
    note = ((text or {}).get('note') or '').strip()
    if not name: return ''
    parts = []
    if qty and unit != 'to_taste': parts.append(qty)
    if unit_out and unit != 'to_taste':
        if unit == 'pcs': pass
        else: parts.append(unit_out)
    elif unit == 'pcs' and qty:
        pass # qty already there
    elif unit == 'to_taste':
        parts.append('to taste')
    parts.append(name)
    s = ' '.join(parts).strip()
    if note and note.lower() != name.lower():
        s += f' ({note})'
    return re.sub(r'\s+', ' ', s).strip()


def norm_cuisine(v):
    if not v: return 'Other'
    k = str(v).strip().lower().replace('-', ' ')
    return CUISINE_MAP.get(k) or CUISINE_MAP.get(k.replace(' ', '_')) or k.title() if k != 'other' else 'Other'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true')
    args = ap.parse_args()

    # index text by id
    text = {}
    with get('text/en.jsonl', args.refresh) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                obj = json.loads(line)
                if obj.get('id'): text[obj['id']] = obj
            except Exception: pass
    print('en texts:', len(text))

    recipes = []
    skipped = 0
    with get('recipes.jsonl', args.refresh) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                meta = json.loads(line)
            except Exception:
                skipped += 1; continue
            t = text.get(meta.get('id'))
            if not t: continue
            name = (t.get('name') or '').strip()
            steps = [s.strip() for s in (t.get('steps') or []) if s and str(s).strip()]
            ings_meta = meta.get('ingredients') or []
            ings_text = t.get('ingredients') or []
            ingredients = []
            for i in range(max(len(ings_meta), len(ings_text))):
                am = ings_meta[i] if i < len(ings_meta) else {}
                tx = ings_text[i] if i < len(ings_text) else {}
                s = format_ingredient(am, tx)
                if s: ingredients.append(s)
            if not name or len(steps) < 1 or len(ingredients) < 2:
                skipped += 1; continue
            time_min = meta.get('time_min') or {}
            total = None
            prep = time_min.get('prep'); cook = time_min.get('cook')
            try:
                if prep is not None or cook is not None:
                    total = int(float(prep or 0) + float(cook or 0))
                    if total <= 0: total = None
                    elif total > 600: total = 600
            except Exception: total = None
            servings = meta.get('servings')
            try:
                if servings is not None:
                    servings = int(float(servings))
                    if servings < 1 or servings > 60: servings = None
            except Exception: servings = None
            prov = meta.get('provenance') or {}
            source = prov.get('url') or ''
            cuisine = norm_cuisine(meta.get('cuisine'))
            category = (meta.get('dish_type') or meta.get('category') or 'Recipe').replace('_', ' ').strip().title()
            rid = 'oc-' + re.sub(r'[^a-zA-Z0-9]+', '-', str(meta.get('id',''))).strip('-').lower()[:60]
            recipes.append({
                'id': rid,
                'title': name,
                'cuisine': cuisine,
                'category': category,
                'ingredients': ingredients[:40],
                'steps': steps[:40],
                'time': total,
                'servings': servings,
                'image': '',
                'source': source,
                'page': prov.get('title') or rid,
            })

    recipes.sort(key=lambda r: (r['cuisine'], r['title'].lower()))
    header = """'use strict';

/* ============================================================
   Recipes from open-recipe-corpus (CC BY-SA 4.0), English text.

   Source: https://github.com/Rippy1911/open-recipe-corpus
   Includes recipes from Wikibooks and Wikisource/public-domain
   cookbooks, structured and checked. English entries may be
   machine-translated and are marked as such in the source corpus.
   Built by tools/build_opencorpus.py. Each record links back to
   its provenance URL.
   ============================================================ */

const OPENCORPUS_LICENSE = {
  name: 'open-recipe-corpus',
  license: 'CC BY-SA 4.0',
  url: 'https://github.com/Rippy1911/open-recipe-corpus',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
};

const OPENCORPUS_RECIPES = """
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(header); json.dump(recipes, f, ensure_ascii=False, separators=(',', ':')); f.write(';\n')
        f.write("\nif (typeof module !== 'undefined') module.exports = { OPENCORPUS_RECIPES, OPENCORPUS_LICENSE };\n")
    from collections import Counter
    print('recipes:', len(recipes), 'skipped:', skipped)
    for c, n in Counter(r['cuisine'] for r in recipes).most_common(15): print(' ', c, n)
    print('wrote', OUT, os.path.getsize(OUT)//1024, 'KB')


if __name__ == '__main__':
    main()
