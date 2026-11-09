#!/usr/bin/env python3
"""Build bundled recipes from based.cooking (Unlicense/public domain dedication).

Source: https://github.com/LukeSmithxyz/based.cooking
Site:   https://based.cooking/

Run:
    python3 tools/build_basedcooking.py
    python3 tools/build_basedcooking.py --refresh
"""

import argparse, hashlib, json, os, re, time, urllib.request

API = 'https://api.github.com/repos/LukeSmithxyz/based.cooking/git/trees/master?recursive=1'
RAW = 'https://raw.githubusercontent.com/LukeSmithxyz/based.cooking/master/'
SITE = 'https://based.cooking/'
UA = 'RecipeWhispererBasedCooking/1.0'
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.basedcooking-cache')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'data', 'basedcooking-data.js')
DELAY = 0.05

TAG_CUISINE = {
    'bangladeshi': 'Bangladeshi', 'bengali': 'Bangladeshi',
    'indian': 'Indian', 'pakistani': 'Pakistani', 'sri-lankan': 'Sri Lankan', 'sri lankan': 'Sri Lankan',
    'chinese': 'Chinese', 'japanese': 'Japanese', 'korean': 'Korean', 'thai': 'Thai',
    'vietnamese': 'Vietnamese', 'malaysian': 'Malaysian', 'indonesian': 'Indonesian', 'filipino': 'Filipino',
    'italian': 'Italian', 'french': 'French', 'spanish': 'Spanish', 'greek': 'Greek', 'turkish': 'Turkish',
    'middle-eastern': 'Middle Eastern', 'middle eastern': 'Middle Eastern', 'lebanese': 'Lebanese',
    'moroccan': 'Moroccan', 'egyptian': 'Egyptian', 'tunisian': 'Moroccan', 'algerian': 'Moroccan',
    'ethiopian': 'Ethiopian', 'nigerian': 'Nigerian', 'kenyan': 'Kenyan', 'african': 'African',
    'mexican': 'Mexican', 'american': 'American', 'caribbean': 'Caribbean', 'jamaican': 'Jamaican', 'cuban': 'Caribbean',
    'brazilian': 'Brazilian', 'peruvian': 'Peruvian', 'argentinian': 'Argentine', 'argentine': 'Argentine', 'colombian': 'Brazilian',
    'british': 'British', 'english': 'British', 'irish': 'Irish', 'scottish': 'British', 'welsh': 'British',
    'russian': 'Russian', 'ukrainian': 'Russian', 'polish': 'Russian',
    'german': 'British', 'austrian': 'French', 'swiss': 'French', 'dutch': 'British', 'belgian': 'French',
    'portuguese': 'Spanish', 'hungarian': 'Mediterranean', 'swedish': 'British', 'danish': 'British', 'norwegian': 'British', 'finnish': 'British',
    'israeli': 'Middle Eastern', 'persian': 'Middle Eastern', 'iranian': 'Middle Eastern',
    'mediterranean': 'Mediterranean', 'australian': 'American', 'canadian': 'American',
    'uzbek': 'Middle Eastern', 'serbian': 'Mediterranean', 'romanian': 'Mediterranean', 'bulgarian': 'Mediterranean', 'croatian': 'Mediterranean',
    'dominican': 'Caribbean', 'puerto rican': 'Caribbean', 'haitian': 'Caribbean',
    'cajun': 'American', 'creole': 'American', 'southern': 'American', 'tex-mex': 'Mexican',
}


def get(url, cache_key=None, binary=False):
    if cache_key:
        os.makedirs(CACHE, exist_ok=True)
        cp = os.path.join(CACHE, cache_key)
        if os.path.exists(cp):
            with open(cp, 'rb') as f: return f.read() if binary else f.read().decode('utf-8', 'ignore')
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    if cache_key:
        with open(cp, 'wb') as f: f.write(data)
    time.sleep(DELAY)
    return data if binary else data.decode('utf-8', 'ignore')


def parse_front(text):
    meta = {}
    if not text.startswith('---'):
        return meta, text
    parts = text.split('---', 2)
    if len(parts) < 3:
        return meta, text
    for line in parts[1].splitlines():
        if ':' not in line: continue
        k, v = line.split(':', 1)
        meta[k.strip().lower()] = v.strip().strip('"').strip("'")
    return meta, parts[2]


def parse_tags(meta):
    raw = meta.get('tags', '')
    # tags: ['a', 'b'] or tags: [a, b]
    raw = raw.strip('[]')
    tags = []
    for t in raw.split(','):
        t = t.strip().strip("'\" ")
        if t: tags.append(t)
    return tags


def parse_time(meta, body):
    for key in ('time', 'cook time', 'prep time', 'prep_time', 'cook_time'):
        v = meta.get(key) or ''
        m = re.search(r'(\d+)', v)
        if m: return max(5, min(600, int(m.group(1))))
    m = re.search(r'cook time[:\s~]*([^\n]+)', body, re.I)
    if m:
        mins = 0
        for h in re.finditer(r'(\d+)\s*(?:hour|hr)', m.group(1), re.I): mins += int(h.group(1))*60
        for n in re.finditer(r'(\d+)\s*(?:min)', m.group(1), re.I): mins += int(n.group(1))
        if not mins:
            n = re.search(r'(\d+)', m.group(1));
            if n: mins = int(n.group(1))
        if mins: return max(5, min(600, mins))
    return None


def parse_servings(meta, body):
    for key in ('servings', 'yield'):
        v = meta.get(key) or ''
        m = re.search(r'(\d+)', v)
        if m:
            n=int(m.group(1));
            if 1 <= n <= 40: return n
    m = re.search(r'servings?[:\s~]*(\d+)', body, re.I)
    if m: return int(m.group(1))
    return None


def clean_text(s):
    s = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', s)
    s = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', s)
    s = re.sub(r'[*_`#>]+', ' ', s)
    s = s.replace('&amp;','&').replace('&nbsp;',' ')
    return re.sub(r'\s+', ' ', s).strip(' -:.')


def section(body, names):
    for name in names:
        m = re.search(r'^##+\s*' + re.escape(name) + r'\s*$(.*?)(?=^##|\Z)', body, re.I|re.S|re.M)
        if m: return m.group(1)
    return ''


def parse_list(text):
    items = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('!') or line.startswith('<!--'): continue
        m = re.match(r'^[-*]\s+(.*)', line) or re.match(r'^\d+[.)]\s+(.*)', line)
        if m:
            item = clean_text(m.group(1))
            if len(item) > 1: items.append(item)
    return items[:40]


def cuisine_from_tags(tags):
    for t in tags:
        c = TAG_CUISINE.get(t.lower().strip())
        if c: return c
    return 'Other'


def parse_recipe(path, raw):
    meta, body = parse_front(raw)
    title = clean_text(meta.get('title') or path.rsplit('/',1)[-1].replace('.md','').replace('-',' ').title())
    if not title or title.lower() in ('example','template','index'): return None
    tags = parse_tags(meta)
    ingredients = parse_list(section(body, ['Ingredients']))
    steps = parse_list(section(body, ['Directions','Instructions','Method','Steps','Preparation','Procedure']))
    if len(ingredients) < 2 or len(steps) < 1: return None
    # extract image
    img = ''
    im = re.search(r'!\[[^\]]*\]\((/pix/[^\)\s]+)', body)
    if im: img = SITE.rstrip('/') + im.group(1)
    slug = path.rsplit('/',1)[-1].replace('.md','')
    cuisine = cuisine_from_tags(tags)
    category = 'Recipe'
    for t in tags:
        if t.lower() in ('breakfast','dessert','salad','soup','bread','drink','beverage','side','snack','sauce','pasta','rice'):
            category = t.capitalize(); break
    return {
        'id': 'bc-' + slug[:60],
        'title': title,
        'cuisine': cuisine,
        'category': category,
        'ingredients': ingredients,
        'steps': steps,
        'time': parse_time(meta, body),
        'servings': parse_servings(meta, body),
        'image': img,
        'source': SITE + slug,
        'page': slug,
        'tags': tags,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true')
    args = ap.parse_args()
    if args.refresh and os.path.isdir(CACHE):
        for n in os.listdir(CACHE): os.remove(os.path.join(CACHE,n))
    tree = json.loads(get(API, 'tree.json'))
    files = [t['path'] for t in tree.get('tree',[]) if t['path'].startswith('content/') and t['path'].endswith('.md') and not t['path'].endswith('_index.md')]
    print('files:', len(files))
    recipes = []
    for i, path in enumerate(files):
        key = 'f-' + hashlib.md5(path.encode()).hexdigest()[:16] + '.md'
        try:
            raw = get(RAW + path, key)
        except Exception as e:
            print('  skip', path, e); continue
        r = parse_recipe(path, raw)
        if r: recipes.append(r)
        if (i+1) % 50 == 0: print(' ', i+1, '/', len(files), 'recipes', len(recipes))
    recipes.sort(key=lambda r: (r['cuisine'], r['title'].lower()))
    header = """'use strict';

/* ============================================================
   Recipes from based.cooking (Unlicense / public domain dedication).

   Source: https://github.com/LukeSmithxyz/based.cooking
   Site:   https://based.cooking/
   Built by tools/build_basedcooking.py. Each record links back to
   its source page.
   ============================================================ */

const BASEDCOOKING_LICENSE = {
  name: 'based.cooking',
  license: 'Unlicense (public domain dedication)',
  url: 'https://based.cooking/',
  repo: 'https://github.com/LukeSmithxyz/based.cooking'
};

const BASEDCOOKING_RECIPES = """
    with open(OUT,'w',encoding='utf-8') as f:
        f.write(header); json.dump(recipes,f,ensure_ascii=False,separators=(',',':')); f.write(';\n')
        f.write("\nif (typeof module !== 'undefined') module.exports = { BASEDCOOKING_RECIPES, BASEDCOOKING_LICENSE };\n")
    from collections import Counter
    print('recipes:', len(recipes))
    for c,n in Counter(r['cuisine'] for r in recipes).most_common(): print(' ',c,n)
    print('wrote', OUT, os.path.getsize(OUT)//1024, 'KB')

if __name__ == '__main__':
    main()
