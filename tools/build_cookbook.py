#!/usr/bin/env python3
"""Build the bundled Cookbook recipes.

The recipe text comes from the Wikibooks Cookbook, which is published
under CC BY-SA 4.0. This script downloads the pages, keeps the useful
parts (ingredients, steps, time, servings, image) and writes a plain
JavaScript data file for the site.

Run it again whenever you want to refresh the cookbook:

    python3 tools/build_cookbook.py --refresh

No API key. No third-party Python packages.
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://en.wikibooks.org/w/api.php'
UA = 'RecipeWhispererCookbook/1.0 (offline catalog build)'
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.cookbook-cache')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'data', 'cookbook-data.js')
DELAY = 1.1

# Specific cuisines come before broad ones so a recipe's main cuisine wins.
CATEGORIES = [
    ('Indian recipes', 'Indian'),
    ('Pakistani recipes', 'Pakistani'),
    ('Bangladeshi recipes', 'Bangladeshi'),
    ('Sri Lankan recipes', 'Sri Lankan'),
    ('Nepalese recipes', 'Nepalese'),
    ('Thai recipes', 'Thai'),
    ('Vietnamese recipes', 'Vietnamese'),
    ('Chinese recipes', 'Chinese'),
    ('Japanese recipes', 'Japanese'),
    ('Korean recipes', 'Korean'),
    ('Indonesian recipes', 'Indonesian'),
    ('Malaysian recipes', 'Malaysian'),
    ('Filipino recipes', 'Filipino'),
    ('Italian recipes', 'Italian'),
    ('French recipes', 'French'),
    ('Spanish recipes', 'Spanish'),
    ('Greek recipes', 'Greek'),
    ('Turkish recipes', 'Turkish'),
    ('Moroccan recipes', 'Moroccan'),
    ('Lebanese recipes', 'Middle Eastern'),
    ('Iranian recipes', 'Middle Eastern'),
    ('Israeli recipes', 'Middle Eastern'),
    ('Middle Eastern recipes', 'Middle Eastern'),
    ('Egyptian recipes', 'African'),
    ('African recipes', 'African'),
    ('Mexican recipes', 'Mexican'),
    ('American recipes', 'American'),
    ('Caribbean recipes', 'Caribbean'),
    ('Jamaican recipes', 'Caribbean'),
    ('Cuban recipes', 'Caribbean'),
    ('British recipes', 'British'),
    ('Mediterranean recipes', 'Mediterranean'),
    ('German recipes', 'European'),
    ('Portuguese recipes', 'European'),
    ('Polish recipes', 'European'),
    ('Russian recipes', 'European'),
    ('Brazilian recipes', 'South American'),
    ('Peruvian recipes', 'South American'),
    ('Argentine recipes', 'South American'),
    ('Australian recipes', 'Oceanian'),
    ('New Zealand recipes', 'Oceanian'),
]

# A few pages that are not filed under an obvious cuisine category.
EXTRA_PAGES = [
    ('Cookbook:Bangladesh Curry', 'Bangladeshi'),
    ('Cookbook:Pudina Hilsa (Bengali Fish with Mint)', 'Bangladeshi'),
    ('Cookbook:Mishti Doi (Bengali Sweetened Yogurt)', 'Bangladeshi'),
    ('Cookbook:Rosogulla (Bengali Milk Balls in Syrup)', 'Bangladeshi'),
    ('Cookbook:Bhuna Khichuri (Bengali Rice and Lentils)', 'Bangladeshi'),
    ('Cookbook:Dahi Baingana (Fried Eggplant in Yogurt)', 'Bangladeshi'),
    ('Cookbook:Borhani (Spiced Yogurt Drink)', 'Bangladeshi'),
    ('Cookbook:Chicken Curry', 'Indian'),
]

# These pages sit in the broad Indian category but are Bengali dishes.
# Keep them with the Bangladeshi shelf so the cuisine menu is useful.
CUISINE_OVERRIDES = {
    'Cookbook:Pudina Hilsa (Bengali Fish with Mint)': 'Bangladeshi',
    'Cookbook:Mishti Doi (Bengali Sweetened Yogurt)': 'Bangladeshi',
    'Cookbook:Rosogulla (Bengali Milk Balls in Syrup)': 'Bangladeshi',
    'Cookbook:Bhuna Khichuri (Bengali Rice and Lentils)': 'Bangladeshi',
    'Cookbook:Dahi Baingana (Fried Eggplant in Yogurt)': 'Bangladeshi',
    'Cookbook:Borhani (Spiced Yogurt Drink)': 'Bangladeshi',
    'Cookbook:Bangladesh Curry': 'Bangladeshi',
}

INGREDIENT_HEADS = ('ingredients', 'ingredient list')
METHOD_HEADS = ('procedure', 'directions', 'method', 'instructions', 'preparation', 'steps')


def get_json(params, cache_key=None):
    """POST to the MediaWiki API, with an optional on-disk cache."""
    if cache_key:
        os.makedirs(CACHE_DIR, exist_ok=True)
        cache_path = os.path.join(CACHE_DIR, cache_key + '.json')
        if os.path.exists(cache_path):
            with open(cache_path, 'r', encoding='utf-8') as fh:
                return json.load(fh)
    body = urllib.parse.urlencode(params).encode('utf-8')
    for attempt in range(7):
        req = urllib.request.Request(API, data=body, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=40) as res:
                data = json.load(res)
            break
        except urllib.error.HTTPError as err:
            if err.code not in (429, 503, 504):
                raise
            wait = int(err.headers.get('Retry-After') or 0) or (4 * (attempt + 1))
            print('  busy, waiting %ds' % wait)
            time.sleep(wait)
    else:
        raise SystemExit('The Wikibooks API kept refusing requests. Try again later.')
    if cache_key:
        with open(cache_path, 'w', encoding='utf-8') as fh:
            json.dump(data, fh)
    time.sleep(DELAY)
    return data


def category_members(category):
    out, cont = [], None
    while True:
        params = {
            'action': 'query',
            'list': 'categorymembers',
            'cmtitle': 'Category:' + category,
            'cmlimit': '500',
            'cmtype': 'page',
            'format': 'json',
        }
        if cont:
            params['cmcontinue'] = cont
        key = 'cat-' + hashlib.md5((category + '|' + str(cont)).encode()).hexdigest()[:16]
        data = get_json(params, key)
        out += [m['title'] for m in data.get('query', {}).get('categorymembers', [])]
        cont = data.get('continue', {}).get('cmcontinue')
        if not cont:
            break
    return [t for t in out if t.startswith('Cookbook:')]


def page_contents(titles):
    out = {}
    for start in range(0, len(titles), 20):
        batch = titles[start:start + 20]
        key = 'pages-' + hashlib.md5('|'.join(batch).encode()).hexdigest()[:16]
        data = get_json({
            'action': 'query',
            'prop': 'revisions',
            'rvslots': 'main',
            'rvprop': 'content',
            'formatversion': '2',
            'titles': '|'.join(batch),
            'format': 'json',
        }, key)
        for page in data.get('query', {}).get('pages', []):
            if 'missing' in page:
                continue
            try:
                out[page['title']] = page['revisions'][0]['slots']['main']['content']
            except (KeyError, IndexError, TypeError):
                continue
        print('  pages %d/%d' % (min(start + 20, len(titles)), len(titles)))
    return out


def image_urls(files):
    """Resolve File: names to a usable 800px thumbnail."""
    files = sorted(set(files))
    out = {}
    for start in range(0, len(files), 40):
        batch = files[start:start + 40]
        key = 'img-' + hashlib.md5('|'.join(batch).encode()).hexdigest()[:16]
        data = get_json({
            'action': 'query',
            'titles': '|'.join('File:' + f for f in batch),
            'prop': 'imageinfo',
            'iiprop': 'url',
            'iiurlwidth': '800',
            'format': 'json',
        }, key)
        page_list = data.get('query', {}).get('pages', [])
        if isinstance(page_list, dict):
            page_list = list(page_list.values())
        for page in page_list:
            info = (page.get('imageinfo') or [{}])[0]
            url = info.get('thumburl') or info.get('url')
            if url:
                name = page.get('title', '').replace('File:', '', 1)
                out[name] = url.split('?')[0]
    return out


def strip_markup(text):
    text = re.sub(r'<ref[^>]*>.*?</ref>', '', text, flags=re.S | re.I)
    text = re.sub(r'<ref[^>]*/>', '', text, flags=re.I)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    text = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', text)
    text = re.sub(r'\[https?://[^\s\]]+\s+([^\]]+)\]', r'\1', text)
    text = re.sub(r'\[https?://[^\]]+\]', '', text)
    text = re.sub(r"'{2,}", '', text)
    text = re.sub(r'\{\{[^{}]*\}\}', '', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&')
    return re.sub(r'\s+', ' ', text).strip(' .,;:')


def find_section(text, names):
    for name in names:
        match = re.search(
            r'^==+\s*' + re.escape(name) + r'\s*==+\s*$(.*?)(?=^==[^=]|\Z)',
            text, flags=re.I | re.S | re.M
        )
        if match:
            return match.group(1)
    return ''


def ingredient_lines(section):
    items = []
    for line in section.split('\n'):
        line = line.strip()
        if not line.startswith('*'):
            continue
        item = strip_markup(line.lstrip('*').strip())
        if len(item) > 1:
            items.append(item)
    return items[:40]


def method_steps(section):
    steps = []
    for line in section.split('\n'):
        line = line.strip()
        if not line.startswith('#') and not line.startswith('*'):
            continue
        step = strip_markup(line.lstrip('#*').strip())
        if len(step) > 12:
            steps.append(step)
    return steps[:40]


def parse_duration(value):
    value = strip_markup(value or '')
    if not value:
        return None
    total = 0
    for match in re.finditer(r'(\d+(?:\.\d+)?)\s*(?:[–-]|to)?\s*(\d+(?:\.\d+)?)?\s*(?:hours?|hrs?)', value, re.I):
        total += max(float(match.group(1)), float(match.group(2) or 0)) * 60
    for match in re.finditer(r'(\d+(?:\.\d+)?)\s*(?:[–-]|to)?\s*(\d+(?:\.\d+)?)?\s*(?:minutes?|mins?)', value, re.I):
        total += max(float(match.group(1)), float(match.group(2) or 0))
    if not total:
        return None
    return int(max(10, min(600, round(total / 5) * 5)))


def parse_servings(value):
    value = strip_markup(value or '')
    match = re.search(r'\d+', value)
    if not match:
        return None
    servings = int(match.group(0))
    return servings if 1 <= servings <= 40 else None


def summary_value(text, keys):
    for key in keys:
        match = re.search(r'\|\s*' + key + r'\s*=\s*([^|}\n]+)', text, re.I)
        if match:
            return match.group(1).strip()
    return ''


def parse_recipe(title, text, cuisine, images):
    if not text or len(text) < 300:
        return None
    name = title.replace('Cookbook:', '').strip()
    if re.search(r'^(Cuisine|Recipes|Ingredients|Equipment|Techniques)\b', name, re.I):
        return None

    ingredients = ingredient_lines(find_section(text, INGREDIENT_HEADS))
    steps = method_steps(find_section(text, METHOD_HEADS))
    if len(ingredients) < 3 or len(steps) < 2:
        return None

    summary = text[:4000]
    image = ''
    match = re.search(r'(?:image|Image)\s*=\s*\[\[(?:File|Image):([^|\]\n]+)', summary)
    if not match:
        match = re.search(r'\[\[(?:File|Image):([^|\]\n]+)', summary)
    if match:
        image = match.group(1).strip()

    time_value = parse_duration(summary_value(summary, ['time', 'cooking time', 'prep time']))
    servings = parse_servings(summary_value(summary, ['servings', 'serves', 'yield']))
    category = strip_markup(summary_value(summary, ['category'])) or 'Recipe'

    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:60]
    return {
        'id': 'cb-' + (slug or hashlib.md5(title.encode()).hexdigest()[:10]),
        'title': name,
        'cuisine': cuisine,
        'category': category,
        'ingredients': ingredients,
        'steps': steps,
        'time': time_value,
        'servings': servings,
        'image': images.get(image, ''),
        'source': 'https://en.wikibooks.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'), safe=':()_,-'),
        'page': title,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true', help='ignore the local API cache')
    args = parser.parse_args()
    if args.refresh and os.path.isdir(CACHE_DIR):
        for name in os.listdir(CACHE_DIR):
            if name.endswith('.json'):
                os.remove(os.path.join(CACHE_DIR, name))

    queue, seen_categories = [], {}
    for category, cuisine in CATEGORIES:
        if category in seen_categories:
            continue
        seen_categories[category] = cuisine
        print('category', category)
        members = category_members(category)
        print('  %d pages' % len(members))
        for title in members:
            queue.append((title, cuisine))
    for title, cuisine in EXTRA_PAGES:
        queue.append((title, cuisine))

    # De-duplicate titles, keeping the first (most specific) cuisine.
    ordered, seen = [], set()
    for title, cuisine in queue:
        if title in seen:
            continue
        seen.add(title)
        ordered.append((title, cuisine))
    print('unique pages:', len(ordered))

    pages = page_contents([t for t, _ in ordered])

    files = []
    for title, _ in ordered:
        text = pages.get(title) or ''
        match = re.search(r'(?:image|Image)\s*=\s*\[\[(?:File|Image):([^|\]\n]+)', text[:4000])
        if match:
            files.append(match.group(1).strip())
        else:
            match = re.search(r'\[\[(?:File|Image):([^|\]\n]+)', text[:4000])
            if match:
                files.append(match.group(1).strip())
    images = image_urls(files)

    recipes, seen_ids = [], set()
    for title, cuisine in ordered:
        cuisine = CUISINE_OVERRIDES.get(title, cuisine)
        recipe = parse_recipe(title, pages.get(title), cuisine, images)
        if not recipe:
            continue
        base = recipe['id']
        suffix = 2
        while recipe['id'] in seen_ids:
            recipe['id'] = base + '-' + str(suffix)
            suffix += 1
        seen_ids.add(recipe['id'])
        recipes.append(recipe)

    recipes.sort(key=lambda r: (r['cuisine'], r['title'].lower()))
    header = """'use strict';

/* ============================================================
   Cookbook recipes from Wikibooks (CC BY-SA 4.0).

   Source: https://en.wikibooks.org/wiki/Cookbook:Recipes
   Built by tools/build_cookbook.py. Each record keeps its page
   link so a cook can read the original, with its edit history.

   This file is data, not code. The site treats it as a second,
   offline recipe shelf next to the live TheMealDB catalog.
   ============================================================ */

const COOKBOOK_LICENSE = {
  name: 'Wikibooks Cookbook',
  license: 'CC BY-SA 4.0',
  url: 'https://en.wikibooks.org/wiki/Cookbook:Recipes',
  note: 'Recipe text is reused under CC BY-SA 4.0. The page link on every recipe is the attribution.'
};

const COOKBOOK_RECIPES = """

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(header)
        json.dump(recipes, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
        fh.write('\nif (typeof module !== \'undefined\') module.exports = { COOKBOOK_RECIPES, COOKBOOK_LICENSE };\n')

    counts = {}
    for recipe in recipes:
        counts[recipe['cuisine']] = counts.get(recipe['cuisine'], 0) + 1
    print('recipes:', len(recipes))
    for cuisine, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print('  %-16s %d' % (cuisine, count))
    size = os.path.getsize(OUT) / 1024
    print('wrote %s (%.0f KB)' % (OUT, size))


if __name__ == '__main__':
    main()
