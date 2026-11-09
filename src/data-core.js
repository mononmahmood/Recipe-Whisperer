'use strict';

/* ============================================================
   Static data and small shared helpers for Recipe Whisperer.

   Live recipes come from TheMealDB at runtime. The community
   cookbook shelf ships with the app in cookbook-data.js. No
   recipe text is stored in this file.
   ============================================================ */

const THEMEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';
const QUALITY_GATE = 62;
const SCAN_BATCH = 32;

const TIME_OPTIONS = [
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 40, label: '40 min' },
  { min: 60, label: '60 min' },
  { min: 999, label: 'Any' }
];

const DIET_OPTIONS = [
  { key: 'all', label: 'All diets' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' }
];

const QUICK_ADD = [
  ['eggs', 'eggs'],
  ['chicken', 'chicken'],
  ['onion', 'onion'],
  ['garlic', 'garlic'],
  ['tomato', 'tomatoes'],
  ['canned tomatoes', 'canned tomatoes'],
  ['rice', 'rice'],
  ['pasta', 'pasta'],
  ['cheese', 'cheese'],
  ['bread', 'bread'],
  ['potatoes', 'potatoes'],
  ['spinach', 'spinach'],
  ['butter', 'butter'],
  ['milk', 'milk'],
  ['chickpeas', 'chickpeas'],
  ['lemon', 'lemon'],
  ['mushrooms', 'mushrooms'],
  ['carrots', 'carrots']
];

/* Pantry families are assumed to be at home unless the user
   unticks them. Everything here is a flavour basic, not a
   main ingredient. */
const PANTRY_GROUPS = [
  {
    title: 'Oils, salts & basics',
    items: [
      ['salt', 'Salt'],
      ['black pepper', 'Black pepper'],
      ['oil', 'Neutral oil'],
      ['olive oil', 'Olive oil'],
      ['sugar', 'Sugar'],
      ['water', 'Water'],
      ['flour', 'Plain flour'],
      ['baking powder', 'Baking powder'],
      ['stock', 'Stock'],
      ['soy sauce', 'Soy sauce'],
      ['vinegar', 'Vinegar']
    ]
  },
  {
    title: 'The spice rack',
    items: [
      ['paprika', 'Paprika'],
      ['cumin', 'Cumin'],
      ['turmeric', 'Turmeric'],
      ['cinnamon', 'Cinnamon'],
      ['chili flakes', 'Chilli flakes'],
      ['oregano', 'Oregano'],
      ['thyme', 'Thyme'],
      ['rosemary', 'Rosemary'],
      ['bay leaf', 'Bay leaf'],
      ['curry powder', 'Curry powder'],
      ['garam masala', 'Garam masala'],
      ['garlic powder', 'Garlic powder'],
      ['onion powder', 'Onion powder']
    ]
  }
];

const DEFAULT_PANTRY = PANTRY_GROUPS.flatMap(g => g.items.map(([key]) => key));

/* Cuisines are the only food-origin filter in the app. Countries stay
   here as an internal lookup so live TheMealDB records can be filed
   under a cuisine; they are never shown as a filter. */
// Cuisines shown in the filter. Kept to well-known cuisines that have recipes.
const CUISINE_ORDER = [
  'Bangladeshi', 'Indian', 'Pakistani', 'Sri Lankan',
  'Chinese', 'Japanese', 'Korean', 'Thai', 'Vietnamese', 'Malaysian', 'Indonesian', 'Filipino',
  'Italian', 'French', 'Spanish', 'Greek', 'Turkish',
  'Middle Eastern', 'Lebanese', 'Moroccan', 'Egyptian',
  'African', 'Ethiopian', 'Nigerian', 'Kenyan',
  'Mexican', 'American', 'Caribbean', 'Jamaican',
  'Brazilian', 'Peruvian', 'Argentine',
  'British', 'Irish', 'Russian', 'Mediterranean'
];

const CUISINE_ALIASES = {
  'South American': 'Brazilian',
  'Latin American': 'Brazilian',
  'Latin America': 'Brazilian',
  'Latin': 'Brazilian',
  'Colombian': 'Brazilian',
  'Venezuelan': 'Brazilian',
  'Nepalese': 'Indian',
  'Afghan': 'Middle Eastern',
  'Burmese': 'Thai',
  'Cambodian': 'Thai',
  'Laotian': 'Thai',
  'Singaporean': 'Malaysian',
  'Taiwanese': 'Chinese',
  'Portuguese': 'Spanish',
  'Tunisian': 'Moroccan',
  'Algerian': 'Moroccan',
  'South African': 'African',
  'Canadian': 'American',
  'Cuban': 'Caribbean',
  'German': 'British',
  'Dutch': 'British',
  'Belgian': 'French',
  'Austrian': 'French',
  'Swiss': 'French',
  'Scandinavian': 'British',
  'Polish': 'Russian',
  'Ukrainian': 'Russian',
  'Croatian': 'Mediterranean',
  'European': 'Mediterranean',
  'Oceanian': 'American',
  'USA': 'American',
  'United States': 'American',
  'UK': 'British',
  'Middle-East': 'Middle Eastern',
  'Middle East': 'Middle Eastern',
  'West African': 'African',
  'East African': 'African',
  'North African': 'African',
  'South Asian': 'Indian'
};

const COUNTRY_CUISINE = {
  Bangladesh: 'Bangladeshi', India: 'Indian', Pakistan: 'Pakistani', 'Sri Lanka': 'Sri Lankan',
  Nepal: 'Indian', Afghanistan: 'Middle Eastern', Bhutan: 'Indian', Maldives: 'Indian',
  China: 'Chinese', 'Hong Kong': 'Chinese', Japan: 'Japanese', 'South Korea': 'Korean', 'North Korea': 'Korean', Taiwan: 'Chinese',
  Thailand: 'Thai', Vietnam: 'Vietnamese', Cambodia: 'Thai', Laos: 'Thai',
  Malaysia: 'Malaysian', Singapore: 'Malaysian', Indonesia: 'Indonesian', Philippines: 'Filipino', Myanmar: 'Thai', Brunei: 'Malaysian', Mongolia: 'Chinese',
  Italy: 'Italian', France: 'French', Spain: 'Spanish', Portugal: 'Spanish', Greece: 'Greek', Turkey: 'Turkish',
  'United Kingdom': 'British', Ireland: 'Irish', Germany: 'British', Netherlands: 'British', Belgium: 'French', Austria: 'French', Switzerland: 'French',
  Denmark: 'British', Norway: 'British', Sweden: 'British', Finland: 'British', Iceland: 'British',
  Poland: 'Russian', Russia: 'Russian', Ukraine: 'Russian', Croatia: 'Mediterranean',
  Albania: 'Mediterranean', Andorra: 'Spanish', Armenia: 'Middle Eastern', Azerbaijan: 'Middle Eastern', Belarus: 'Russian',
  Bulgaria: 'Mediterranean', Cyprus: 'Greek', Czechia: 'Mediterranean', Estonia: 'Russian', Georgia: 'Middle Eastern',
  Hungary: 'Mediterranean', Kazakhstan: 'Middle Eastern', Latvia: 'Russian', Lithuania: 'Russian', Luxembourg: 'French', Malta: 'Italian',
  Moldova: 'Russian', Montenegro: 'Mediterranean', Romania: 'Mediterranean', Serbia: 'Mediterranean', Slovakia: 'Mediterranean', Slovenia: 'Mediterranean',
  'Bosnia and Herzegovina': 'Mediterranean', 'Faroe Islands': 'British',
  Lebanon: 'Lebanese', Iran: 'Middle Eastern', Israel: 'Middle Eastern', 'Saudi Arabia': 'Middle Eastern', Syria: 'Middle Eastern', Jordan: 'Middle Eastern',
  Iraq: 'Middle Eastern', Qatar: 'Middle Eastern', 'United Arab Emirates': 'Middle Eastern', Kuwait: 'Middle Eastern', Bahrain: 'Middle Eastern', Oman: 'Middle Eastern', Yemen: 'Middle Eastern', Palestine: 'Middle Eastern',
  Morocco: 'Moroccan', Tunisia: 'Moroccan', Algeria: 'Moroccan', Egypt: 'Egyptian',
  Ethiopia: 'Ethiopian', Nigeria: 'Nigerian', Kenya: 'Kenyan', 'South Africa': 'African', Ghana: 'African', Senegal: 'African',
  Angola: 'African', Botswana: 'African', Cameroon: 'African', Chad: 'African', 'DR Congo': 'African', Tanzania: 'African', Uganda: 'African', Zimbabwe: 'African', Mozambique: 'African', Namibia: 'African',
  'United States': 'American', Canada: 'American', Mexico: 'Mexican',
  'Costa Rica': 'Mexican', 'El Salvador': 'Mexican', Guatemala: 'Mexican', Honduras: 'Mexican', Nicaragua: 'Mexican', Panama: 'Mexican', Belize: 'Caribbean',
  Brazil: 'Brazilian', Argentina: 'Argentine', Chile: 'Peruvian', Colombia: 'Brazilian', Venezuela: 'Brazilian', Uruguay: 'Argentine', Peru: 'Peruvian', Ecuador: 'Peruvian', Bolivia: 'Peruvian', Paraguay: 'Argentine', Guyana: 'Caribbean', Suriname: 'Caribbean',
  Jamaica: 'Jamaican', Cuba: 'Caribbean', 'Dominican Republic': 'Caribbean', Haiti: 'Caribbean', 'Puerto Rico': 'Caribbean', Trinidad: 'Caribbean', 'Trinidad and Tobago': 'Caribbean',
  Dominica: 'Caribbean', 'Cayman Islands': 'Caribbean', Barbados: 'Caribbean', Aruba: 'Caribbean', 'Antigua and Barbuda': 'Caribbean', Bahamas: 'Caribbean', 'Saint Lucia': 'Caribbean', Grenada: 'Caribbean', Bermuda: 'Caribbean',
  Australia: 'American', 'New Zealand': 'American', Fiji: 'American', Samoa: 'American', Tonga: 'American', 'Papua New Guinea': 'American'
};

const cleanCuisine = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

function cuisineForCountry(country) {
  const key = cleanCuisine(country);
  const c = COUNTRY_CUISINE[key] || 'Other';
  return normalizeCuisine(c);
}

function normalizeCuisine(value) {
  const key = cleanCuisine(value);
  if (!key) return 'Other';
  return CUISINE_ALIASES[key] || key;
}

/* Domains we count as strong original publishers. The score is
   intentionally transparent: it measures craft signals, not taste. */
const TRUSTED_DOMAINS = {
  'bbcgoodfood.com': { name: 'BBC Good Food', weight: 20 },
  'seriouseats.com': { name: 'Serious Eats', weight: 20 },
  'nytimes.com': { name: 'NYT Cooking', weight: 20 },
  'cooking.nytimes.com': { name: 'NYT Cooking', weight: 20 },
  'bonappetit.com': { name: 'Bon Appétit', weight: 20 },
  'epicurious.com': { name: 'Epicurious', weight: 18 },
  'food52.com': { name: 'Food52', weight: 18 },
  'recipetineats.com': { name: 'RecipeTin Eats', weight: 18 },
  'kingarthurbaking.com': { name: 'King Arthur Baking', weight: 18 },
  'smittenkitchen.com': { name: 'Smitten Kitchen', weight: 17 },
  'thekitchn.com': { name: 'The Kitchn', weight: 16 },
  'jamieoliver.com': { name: 'Jamie Oliver', weight: 18 },
  'ottolenghi.co.uk': { name: 'Ottolenghi', weight: 18 },
  'nigella.com': { name: 'Nigella Lawson', weight: 17 },
  'saveur.com': { name: 'Saveur', weight: 17 },
  'foodandwine.com': { name: 'Food & Wine', weight: 16 },
  'skinnytaste.com': { name: 'Skinnytaste', weight: 14 },
  'allrecipes.com': { name: 'Allrecipes', weight: 12 },
  'allrecipes.co.uk': { name: 'Allrecipes', weight: 12 },
  'food.com': { name: 'Food.com', weight: 10 }
};

const SOURCE_DIRECTORY = [
  {
    title: 'Recipe sources',
    note: 'Live records are fetched at runtime. Bundled shelves ship with the app and work without a signal.',
    items: [
      { name: 'TheMealDB', url: 'https://www.themealdb.com/', note: 'Community recipe database. Fetched live; records often include the original publisher and a video.' },
      { name: 'Wikibooks Cookbook', url: 'https://en.wikibooks.org/wiki/Cookbook:Recipes', note: 'Bundled. Recipe text reused under CC BY-SA 4.0; every recipe links to its source page and edit history.' },
      { name: 'based.cooking', url: 'https://based.cooking/', note: 'Bundled. Recipes released into the public domain (Unlicense dedication); every recipe links to its source page.' },
      { name: 'open-recipe-corpus', url: 'https://github.com/Rippy1911/open-recipe-corpus', note: 'Bundled (English). Structured recipes from Wikibooks/Wikisource sources under CC BY-SA 4.0; each record links to provenance.' }
    ]
  },
  {
    title: 'Original recipe publishers',
    note: 'When a live recipe names its original publisher, that link is shown on the recipe.',
    items: [
      { name: 'BBC Good Food', url: 'https://www.bbcgoodfood.com/' },
      { name: 'Serious Eats', url: 'https://www.seriouseats.com/' },
      { name: 'NYT Cooking', url: 'https://cooking.nytimes.com/' },
      { name: 'Bon Appétit', url: 'https://www.bonappetit.com/' },
      { name: 'RecipeTin Eats', url: 'https://www.recipetineats.com/' },
      { name: 'King Arthur Baking', url: 'https://www.kingarthurbaking.com/' },
      { name: 'Smitten Kitchen', url: 'https://smittenkitchen.com/' }
    ]
  },
  {
    title: 'YouTube kitchens worth checking',
    note: 'Use these when you want to see a dish made, not just read the steps.',
    items: [
      { name: 'Kenji López-Alt', url: 'https://www.youtube.com/@KenjiLopezAlt' },
      { name: 'Chef John / Food Wishes', url: 'https://www.youtube.com/@foodwishes' },
      { name: 'Babish Culinary Universe', url: 'https://www.youtube.com/@babishculinaryuniverse' },
      { name: 'Helen Rennie', url: 'https://www.youtube.com/@HelenRennie' },
      { name: 'Ethan Chlebowski', url: 'https://www.youtube.com/@EthanChlebowski' },
      { name: 'Maangchi', url: 'https://www.youtube.com/@Maangchi' },
      { name: "Pailin's Kitchen", url: 'https://www.youtube.com/@PailinsKitchen' }
    ]
  },
  {
    title: 'Community',
    note: 'Good places to ask when a recipe goes sideways or you need a substitution.',
    items: [
      { name: 'r/AskCulinary', url: 'https://www.reddit.com/r/AskCulinary/' },
      { name: 'r/cooking', url: 'https://www.reddit.com/r/cooking/' },
      { name: 'r/WhatShouldICook', url: 'https://www.reddit.com/r/WhatShouldICook/' },
      { name: 'r/recipes', url: 'https://www.reddit.com/r/recipes/' },
      { name: 'r/Baking', url: 'https://www.reddit.com/r/Baking/' },
      { name: 'r/seriouseats', url: 'https://www.reddit.com/r/seriouseats/' }
    ]
  }
];

const SCORE_PARTS = [
  { key: 'match', label: 'Ingredient match', max: 35 },
  { key: 'source', label: 'Source trust', max: 20 },
  { key: 'method', label: 'Method detail', max: 25 },
  { key: 'complete', label: 'Data completeness', max: 10 },
  { key: 'practical', label: 'Time & practicality', max: 10 }
];

/* Ingredient families for matching. These are broad on purpose:
   "red onions" and "onions" both count as onion. */
const FAMILY_ALIASES = {
  egg: 'egg', eggs: 'egg',
  butter: 'butter', 'salted butter': 'butter', 'unsalted butter': 'butter',
  milk: 'milk', 'whole milk': 'milk',
  cream: 'cream', 'double cream': 'cream', 'heavy cream': 'cream', 'single cream': 'cream',
  yogurt: 'yogurt', yoghurt: 'yogurt',
  cheese: 'cheese', cheddar: 'cheese', mozzarella: 'cheese', parmesan: 'cheese',
  'parmesan cheese': 'cheese', 'parmigiano reggiano': 'cheese', 'cheddar cheese': 'cheese',
  'cream cheese': 'cream cheese', 'cottage cheese': 'cheese', gouda: 'cheese',
  'gouda cheese': 'cheese', emmentaler: 'cheese', 'swiss cheese': 'cheese',
  'monterey jack cheese': 'cheese', 'colby jack cheese': 'cheese', 'stilton cheese': 'cheese',
  feta: 'feta', 'feta cheese': 'feta', 'cubed feta cheese': 'feta',
  halloumi: 'halloumi', paneer: 'paneer', ricotta: 'ricotta', mascarpone: 'mascarpone',
  onion: 'onion', onions: 'onion', 'red onion': 'onion', 'red onions': 'onion',
  'yellow onion': 'onion', 'white onion': 'onion', 'chopped onion': 'onion',
  'brown onion': 'onion', shallot: 'shallot', shallots: 'shallot', challots: 'shallot',
  garlic: 'garlic', 'garlic clove': 'garlic', 'garlic cloves': 'garlic',
  'garlic bulb': 'garlic', 'garlic powder': 'garlic powder', 'garlic granules': 'garlic powder',
  tomato: 'tomato', tomatoes: 'tomato', 'cherry tomatoes': 'tomato',
  'baby plum tomatoes': 'tomato', 'plum tomatoes': 'tomato', 'vine tomatoes': 'tomato',
  'beef tomatoes': 'tomato', 'grape tomatoes': 'tomato',
  'canned tomatoes': 'tomato', 'chopped tomatoes': 'tomato',
  'tinned tomatoes': 'tomato', 'tinned tomatos': 'tomato',
  'diced tomatoes': 'tomato', 'canned tomato': 'tomato',
  'chopped tomato': 'tomato', 'tinned tomato': 'tomato',
  'diced tomato': 'tomato', passata: 'tomato',
  'tomato puree': 'tomato paste',
  'tomato paste': 'tomato paste', 'sun dried tomatoes': 'sun-dried tomato',
  potato: 'potato', potatoes: 'potato', 'baby potatoes': 'potato',
  'small potatoes': 'potato', 'new potatoes': 'potato', 'red potatoes': 'potato',
  'sweet potatoes': 'sweet potato', 'sweet potato': 'sweet potato',
  carrot: 'carrot', carrots: 'carrot', celery: 'celery', cucumber: 'cucumber',
  avocado: 'avocado', avocados: 'avocado', spinach: 'spinach', broccoli: 'broccoli',
  mushroom: 'mushroom', mushrooms: 'mushroom', 'chestnut mushroom': 'mushroom',
  aubergine: 'aubergine', eggplant: 'aubergine', 'egg plants': 'aubergine',
  'bell pepper': 'bell pepper', 'bell peppers': 'bell pepper',
  'red pepper': 'bell pepper', 'green pepper': 'bell pepper',
  'spring onions': 'scallion', scallion: 'scallion', scallions: 'scallion',
  'green onions': 'scallion', cilantro: 'cilantro', coriander: 'cilantro',
  'coriander leaves': 'cilantro', 'coriander leaf': 'cilantro',
  'fresh coriander': 'cilantro', 'ground coriander': 'cilantro',
  parsley: 'parsley', 'chopped parsley': 'parsley',
  'flat leaf parsley': 'parsley', 'italian parsley': 'parsley',
  basil: 'basil', 'basil leaves': 'basil',
  mint: 'mint', dill: 'dill', lemon: 'lemon', lemons: 'lemon',
  lime: 'lime', limes: 'lime', ginger: 'ginger', 'fresh ginger': 'ginger',
  lettuce: 'lettuce', 'iceberg lettuce': 'lettuce', corn: 'corn', sweetcorn: 'corn',
  peas: 'peas', 'frozen peas': 'peas', banana: 'banana', bananas: 'banana',
  berries: 'berries', strawberry: 'berries', strawberries: 'berries',
  blueberry: 'berries', blueberries: 'berries', apple: 'apple', apples: 'apple',
  chicken: 'chicken', 'chicken breast': 'chicken', 'chicken breasts': 'chicken',
  'chicken thigh': 'chicken', 'chicken thighs': 'chicken', 'chicken legs': 'chicken',
  'chicken wings': 'chicken', 'chicken drumsticks': 'chicken', 'ground chicken': 'chicken',
  beef: 'beef', 'beef brisket': 'beef', 'beef fillet': 'beef', mince: 'beef',
  'minced beef': 'beef', steak: 'beef',
  pork: 'pork', 'pork chop': 'pork', 'pork chops': 'pork', bacon: 'bacon',
  pancetta: 'bacon', sausage: 'sausage', sausages: 'sausage', chorizo: 'sausage',
  shrimp: 'shrimp', prawns: 'shrimp', prawn: 'shrimp',
  salmon: 'salmon', 'salmon fillet': 'salmon', tuna: 'tuna',
  cod: 'cod', haddock: 'haddock', fish: 'fish',
  tofu: 'tofu', chickpea: 'chickpea', chickpeas: 'chickpea',
  beans: 'beans', 'black beans': 'beans', 'cannellini beans': 'beans',
  'white beans': 'beans', 'kidney beans': 'beans', 'borlotti beans': 'beans',
  lentil: 'lentil', lentils: 'lentil', 'red lentils': 'lentil', 'brown lentils': 'lentil',
  rice: 'rice', 'white rice': 'rice', 'brown rice': 'rice', 'basmati rice': 'rice',
  'jasmine rice': 'rice', 'sushi rice': 'rice', 'paella rice': 'rice',
  'arborio rice': 'rice', pasta: 'pasta', spaghetti: 'pasta', penne: 'pasta',
  rigatoni: 'pasta', linguine: 'pasta', fusilli: 'pasta', macaroni: 'pasta',
  'bowtie pasta': 'pasta', 'penne pasta': 'pasta', 'vermicelli pasta': 'pasta',
  noodles: 'noodles', ramen: 'noodles', 'egg noodles': 'noodles',
  'rice noodles': 'noodles', 'rice stick noodles': 'noodles',
  bread: 'bread', toast: 'bread', sourdough: 'bread', baguette: 'bread',
  'crusty bread': 'bread', 'wholegrain bread': 'bread', 'white bread': 'bread',
  'rye bread': 'bread', 'bread rolls': 'bread', 'naan bread': 'bread',
  tortilla: 'tortilla', tortillas: 'tortilla', wrap: 'tortilla', wraps: 'tortilla',
  pita: 'pita', pitas: 'pita', 'pita bread': 'pita',
  couscous: 'couscous', flour: 'flour', 'plain flour': 'flour',
  'all purpose flour': 'flour', 'bread flour': 'flour', oats: 'oats',
  'rolled oats': 'oats', oatmeal: 'oats', 'baking powder': 'baking powder',
  'baking soda': 'baking soda', 'bicarbonate of soda': 'baking soda',
  chia: 'chia', 'chia seeds': 'chia', cornstarch: 'cornstarch',
  'corn starch': 'cornstarch', 'potato starch': 'cornstarch',
  'olive oil': 'olive oil', oil: 'oil', 'cooking oil': 'oil',
  'vegetable oil': 'oil', 'sunflower oil': 'oil', 'sesame oil': 'sesame oil',
  'sesame seed oil': 'sesame oil',
  'chicken bouillon powder': 'stock', bouillon: 'stock', 'stock powder': 'stock',
  'vegetable bouillon': 'stock', 'beef bouillon': 'stock',
  salt: 'salt', 'sea salt': 'salt', 'kosher salt': 'salt', 'celery salt': 'salt',
  'black pepper': 'black pepper', pepper: 'black pepper', 'ground pepper': 'black pepper',
  'chili flakes': 'chili flakes', 'chilli flakes': 'chili flakes',
  'red pepper flakes': 'chili flakes', chili: 'chili flakes', chilli: 'chili flakes',
  'red chilli': 'chili flakes', 'red chilli powder': 'chili flakes',
  'chilli powder': 'chili flakes', 'chili powder': 'chili flakes',
  cayenne: 'chili flakes', 'cayenne pepper': 'chili flakes',
  paprika: 'paprika', 'smoked paprika': 'paprika', cumin: 'cumin',
  turmeric: 'turmeric', cinnamon: 'cinnamon', 'cinnamon stick': 'cinnamon',
  'curry powder': 'curry powder', 'garam masala': 'garam masala',
  'biryani masala': 'curry powder', 'cajun': 'cajun',
  honey: 'honey', sugar: 'sugar', 'brown sugar': 'sugar', 'caster sugar': 'sugar',
  'maple syrup': 'maple syrup', 'soy sauce': 'soy sauce', tamari: 'soy sauce',
  'fish sauce': 'fish sauce', mustard: 'mustard', ketchup: 'ketchup',
  'tomato ketchup': 'ketchup', mayo: 'mayo', mayonnaise: 'mayo',
  sriracha: 'hot sauce', 'hot sauce': 'hot sauce', salsa: 'salsa', pesto: 'pesto',
  'tomato sauce': 'tomato sauce', 'coconut milk': 'coconut milk',
  'coconut cream': 'coconut milk', stock: 'stock', broth: 'stock',
  'chicken stock': 'stock', 'beef stock': 'stock', 'vegetable stock': 'stock',
  'chicken broth': 'stock', 'stock cube': 'stock', 'chicken stock cube': 'stock',
  'chicken stock concentrate': 'stock', miso: 'miso', nori: 'nori',
  seaweed: 'nori', 'sesame seeds': 'sesame seeds', water: 'water',
  vinegar: 'vinegar', 'white wine vinegar': 'vinegar', 'apple cider vinegar': 'vinegar',
  'balsamic vinegar': 'vinegar', 'rice vinegar': 'vinegar'
};

