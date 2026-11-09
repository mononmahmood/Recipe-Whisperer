'use strict';

/* ============================================================
   Mock TheMealDB fixture for deterministic UI tests.

   The shape of these records matches the live endpoints the app
   calls: list.php?c=list, list.php?a=list, list.php?i=list,
   filter.php?c=, filter.php?i= and lookup.php?i=.
   ============================================================ */

const THUMB = (color) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${color}"/><circle cx="320" cy="200" r="92" fill="rgba(255,255,255,.16)"/><ellipse cx="320" cy="200" rx="140" ry="26" fill="rgba(0,0,0,.12)"/></svg>`
)}`;

const RECIPES = [
  {
    id: '1001',
    title: 'Shakshuka',
    category: 'Breakfast',
    area: 'Tunisian',
    country: 'Tunisia',
    source: 'https://www.bbcgoodfood.com/recipes/shakshuka',
    youtube: 'https://www.youtube.com/watch?v=shakshuka-demo',
    tags: 'Eggs,One Pot',
    ingredients: [
      ['Olive Oil', '2 tbsp'],
      ['Onion', '1 large'],
      ['Garlic', '2 cloves'],
      ['Canned Tomatoes', '400g'],
      ['Eggs', '4'],
      ['Feta', '100g'],
      ['Cumin', '1 tsp'],
      ['Salt', '1 tsp'],
      ['Black Pepper', '½ tsp']
    ],
    instructions: `Warm the olive oil in a wide frying pan set over medium heat.
Add the onion with a pinch of salt and cook for 8 minutes, stirring until soft and translucent.
Stir in the garlic and cumin and cook for 1 minute, just until fragrant.
Tip in the canned tomatoes, season with black pepper and simmer for 10 minutes, breaking the tomatoes down with a spoon until the sauce thickens.
Make four shallow wells in the sauce and crack an egg into each one.
Scatter the feta around the eggs, cover the pan and cook for 6 minutes, until the whites are set but the yolks are still soft.
Take the pan off the heat and rest for 2 minutes before serving with warm bread.
Serves 4.`
  },
  {
    id: '1002',
    title: 'Weeknight Pantry Cake',
    category: 'Dessert',
    area: 'American',
    country: 'United States',
    source: '',
    youtube: '',
    tags: '',
    ingredients: [
      ['Flour', '200g'],
      ['Sugar', '150g'],
      ['Butter', '100g'],
      ['Eggs', '2'],
      ['Milk', '100ml']
    ],
    instructions: `Heat the oven.
Mix everything in a bowl.
Bake until done.
Serves 8.`
  },
  {
    id: '1003',
    title: 'Pasta Pomodoro',
    category: 'Pasta',
    area: 'Italian',
    country: 'Italy',
    source: 'https://www.seriouseats.com/pasta-pomodoro',
    youtube: '',
    tags: 'Pasta,Italian',
    ingredients: [
      ['Spaghetti', '400g'],
      ['Canned Tomatoes', '800g'],
      ['Onion', '1'],
      ['Garlic', '3 cloves'],
      ['Olive Oil', '3 tbsp'],
      ['Basil', '20g'],
      ['Parmesan', '50g']
    ],
    instructions: `Bring a large pot of well-salted water to a rolling boil and cook the spaghetti for 10 minutes, until al dente. Reserve a mug of the cooking water before draining.
While the pasta cooks, warm the olive oil in a deep pan and soften the onion for 8 minutes over medium heat, stirring so it does not catch.
Add the garlic and cook for 1 minute, then tip in the canned tomatoes, season and simmer gently for 22 minutes, stirring now and then, until the sauce is thick and sweet.
Tear the basil into the sauce, add a splash of the pasta water and toss the drained spaghetti through the sauce so every strand is coated.
Serve in warm bowls with grated parmesan and a little black pepper.
Serves 4.`
  },
  {
    id: '1004',
    title: 'Chickpea & Spinach Curry',
    category: 'Vegan',
    area: 'Indian',
    country: 'India',
    source: 'https://www.bbcgoodfood.com/recipes/chickpea-spinach-curry',
    youtube: 'https://www.youtube.com/watch?v=curry-demo',
    tags: 'Vegan,Curry',
    ingredients: [
      ['Chickpeas', '400g'],
      ['Tomatoes', '400g'],
      ['Onion', '1'],
      ['Spinach', '100g'],
      ['Coconut Milk', '200ml'],
      ['Garlic', '2 cloves'],
      ['Olive Oil', '1 tbsp'],
      ['Cumin', '1 tsp']
    ],
    instructions: `Warm the olive oil in a wide pan and cook the onion for 5 minutes until soft.
Add the garlic and cumin and stir for 1 minute, until the kitchen smells of spice.
Tip in the tomatoes and chickpeas, season with salt and simmer for 20 minutes, stirring occasionally, until the sauce thickens around the chickpeas.
Add the spinach a handful at a time, folding it into the sauce until it wilts.
Pour in the coconut milk and warm gently for a few minutes without letting it boil, so the sauce stays smooth.
Taste, adjust the salt and serve with rice or flatbread.
Serves 4.`
  },
  {
    id: '1005',
    title: 'Chicken Tacos',
    category: 'Chicken',
    area: 'Mexican',
    country: 'Mexico',
    source: 'https://www.seriouseats.com/chicken-tacos',
    youtube: '',
    tags: 'Mexican,Chicken',
    ingredients: [
      ['Chicken Breast', '500g'],
      ['Tortillas', '8'],
      ['Tomatoes', '2'],
      ['Onion', '1'],
      ['Lime', '1'],
      ['Coriander', '20g'],
      ['Olive Oil', '1 tbsp'],
      ['Paprika', '1 tsp']
    ],
    instructions: `Season the chicken with paprika and salt.
Warm the olive oil in a heavy pan over medium-high heat and cook the chicken for 12 minutes, turning once, until browned and cooked through. Rest for a few minutes, then shred with two forks.
While the chicken rests, dice the tomatoes and onion, chop the coriander and squeeze the lime.
Warm the tortillas in a dry pan for 2 minutes on each side, then wrap them in a clean cloth so they stay soft.
Pile the shredded chicken onto the tortillas and top with the tomato, onion, coriander and a good squeeze of lime.
Serve straight away with extra lime wedges.
Serves 4.`
  }
];

const CATEGORIES = ['Breakfast', 'Dessert', 'Pasta', 'Vegan', 'Chicken'];
const CATEGORY_ROW = [
  { strCategory: 'Beef' },
  { strCategory: 'Chicken' },
  { strCategory: 'Dessert' },
  { strCategory: 'Pasta' },
  { strCategory: 'Vegan' },
  { strCategory: 'Vegetarian' },
  { strCategory: 'Breakfast' }
];

const AREAS = [
  { strArea: 'Tunisian', strCountry: 'Tunisia' },
  { strArea: 'American', strCountry: 'United States' },
  { strArea: 'Italian', strCountry: 'Italy' },
  { strArea: 'Indian', strCountry: 'India' },
  { strArea: 'Mexican', strCountry: 'Mexico' }
];

const INGREDIENTS = [...new Set(RECIPES.flatMap(r => r.ingredients.map(([name]) => name)))].sort();

const mealStub = (r) => ({
  idMeal: r.id,
  strMeal: r.title,
  strMealThumb: THUMB(r.id === '1002' ? '#7c6652' : '#3d6b54'),
  strCategory: r.category,
  strArea: r.area,
  strCountry: r.country
});

const detail = (r) => {
  const meal = {
    idMeal: r.id,
    strMeal: r.title,
    strDrinkAlternate: null,
    strCategory: r.category,
    strArea: r.area,
    strCountry: r.country,
    strInstructions: r.instructions,
    strMealThumb: THUMB(r.id === '1002' ? '#7c6652' : '#3d6b54'),
    strTags: r.tags || null,
    strYoutube: r.youtube || '',
    strSource: r.source || '',
    strImageSource: null,
    strCreativeCommonsConfirmed: null,
    dateModified: null
  };
  for (let i = 1; i <= 20; i++) {
    const pair = r.ingredients[i - 1];
    meal[`strIngredient${i}`] = pair ? pair[0] : '';
    meal[`strMeasure${i}`] = pair ? pair[1] : '';
  }
  return { meals: [meal] };
};

function responseFor(rawUrl) {
  const url = new URL(rawUrl);
  const path = url.pathname.replace('/api/json/v1/1/', '');
  const param = (name) => url.searchParams.get(name);

  if (path === 'list.php' && param('c') === 'list') {
    return { meals: CATEGORY_ROW };
  }
  if (path === 'list.php' && param('a') === 'list') {
    return { meals: AREAS };
  }
  if (path === 'list.php' && param('i') === 'list') {
    return { meals: INGREDIENTS.map((name, i) => ({ idIngredient: String(i + 1), strIngredient: name })) };
  }
  if (path === 'filter.php' && param('c')) {
    const wanted = param('c').toLowerCase();
    return { meals: RECIPES.filter(r => r.category.toLowerCase() === wanted).map(mealStub) };
  }
  if (path === 'filter.php' && param('i')) {
    const wanted = param('i').replace(/_/g, ' ').toLowerCase();
    const ids = new Set(
      RECIPES
        .filter(r => r.ingredients.some(([name]) => name.toLowerCase() === wanted))
        .map(r => r.id)
    );
    return { meals: RECIPES.filter(r => ids.has(r.id)).map(mealStub) };
  }
  if (path === 'lookup.php' && param('i')) {
    const recipe = RECIPES.find(r => r.id === param('i'));
    return recipe ? detail(recipe) : { meals: null };
  }
  if (path === 'search.php') {
    return { meals: null };
  }
  return { meals: null };
}

module.exports = {
  RECIPES,
  CATEGORIES,
  AREAS,
  INGREDIENTS,
  responseFor,
  thumb: THUMB
};
