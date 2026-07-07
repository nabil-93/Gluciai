/**
 * Food-name knowledge for normalization & matching. Pure data + helpers,
 * no I/O. Powers `normalizeSearchName()` and `matchScore()` in match.ts.
 *
 * The goal: turn a rich display label ("Moroccan Grilled Chicken Breast")
 * into the best generic database query ("chicken breast") WITHOUT destroying
 * meaningful multi-word foods ("brown rice", "sweet potato", "olive oil").
 */

/* ─────────────── Words to DROP (carry no nutritional meaning) ─────────── */

/** Cooking methods / preparation verbs. */
export const COOKING_WORDS = new Set([
  // English
  'grilled', 'roasted', 'roast', 'cooked', 'baked', 'fried', 'deep-fried',
  'boiled', 'steamed', 'raw', 'fresh', 'homemade', 'organic', 'traditional',
  'style', 'served', 'sauteed', 'sautéed', 'poached', 'braised', 'smoked',
  'toasted', 'crispy', 'creamy', 'stewed', 'pan-fried', 'seared', 'marinated',
  // French
  'grillé', 'grillée', 'grillee', 'grille', 'rôti', 'rotie', 'roti', 'cuit',
  'cuite', 'frais', 'fraiche', 'fraîche', 'maison', 'traditionnel',
  'traditionnelle', 'poêlé', 'poele', 'fumé', 'fume', 'mijoté', 'mijote',
  'pané', 'pane',
  // German
  'gegrillt', 'gebraten', 'gekocht', 'frisch', 'hausgemacht', 'gebacken',
  'geräuchert', 'geraeuchert', 'paniert',
  // Cut / form qualifiers (a "salmon fillet" is nutritionally just "salmon")
  'fillet', 'fillets', 'filet', 'filets', 'boneless', 'skinless', 'chopped',
  'diced', 'sliced', 'minced', 'shredded', 'whole', 'half', 'mini',
  // French qualifiers (accent-stripped — tokenize removes accents first)
  'frit', 'frite', 'frits', 'croustillant', 'croustillante', 'croustillants',
  'cremeux', 'cremeuse', 'epice', 'epicee', 'noir', 'noire', 'noires',
  'blanc', 'blanche',
]);

/** Country / regional qualifiers that don't change the food's nutrition. */
export const COUNTRY_WORDS = new Set([
  'moroccan', 'marocain', 'marocaine', 'arabic', 'arab', 'lebanese',
  'turkish', 'greek', 'grec', 'grecque', 'italian', 'italien', 'italienne',
  'french', 'français', 'francais', 'française', 'spanish', 'espagnol',
  'mexican', 'mexicain', 'indian', 'indien', 'chinese', 'chinois',
  'japanese', 'japonais', 'thai', 'thaï', 'american', 'américain',
  'american-style', 'german', 'allemand', 'english', 'anglais', 'asian',
  'asiatique', 'oriental', 'orientale', 'mediterranean', 'méditerranéen',
]);

/** Generic filler / connective words. */
export const FILLER_WORDS = new Set([
  'with', 'and', 'the', 'a', 'an', 'of', 'in', 'on', 'plate', 'dish',
  'portion', 'serving', 'piece', 'pieces', 'slice', 'slices', 'bowl',
  'au', 'aux', 'de', 'des', 'du', 'à', 'la', 'le', 'les', 'et', 'avec',
  'en', 'poudre', 'grain', 'grains', 'morceau', 'morceaux',
  'mit', 'und', 'der', 'die', 'das', 'von',
]);

/** Everything droppable in one set (order of removal doesn't matter). */
export const DROP_WORDS = new Set<string>([
  ...COOKING_WORDS,
  ...COUNTRY_WORDS,
  ...FILLER_WORDS,
]);

/* ─────────── Protected phrases (NEVER split or reduce) ─────────── */

/**
 * Multi-word foods whose qualifier is nutritionally meaningful. If a name
 * contains one of these phrases, we keep the phrase intact and skip
 * per-token qualifier removal for its words.
 */
export const PROTECTED_PHRASES: readonly string[] = [
  'brown rice', 'white rice', 'wild rice', 'basmati rice', 'jasmine rice',
  'sweet potato', 'sweet potatoes', 'mashed potato', 'baked potato',
  'olive oil', 'coconut oil', 'sunflower oil', 'palm oil',
  'whole wheat bread', 'whole grain bread', 'white bread', 'brown bread',
  'whole wheat', 'whole grain', 'whole milk', 'skim milk', 'almond milk',
  'soy milk', 'oat milk', 'coconut milk', 'condensed milk',
  'green tea', 'black tea', 'green beans', 'red beans', 'black beans',
  'kidney beans', 'green pepper', 'red pepper', 'bell pepper',
  'dark chocolate', 'greek salad', 'caesar salad', 'ice cream',
  'peanut butter', 'almond butter', 'cottage cheese', 'cream cheese',
  'chicken breast', 'chicken thigh', 'chicken wing', 'ground beef',
  'egg white', 'orange juice', 'apple juice', 'maple syrup',
  'french fries', 'french fry',
];

/**
 * Whole-name reductions applied to the CLEANED string before token work.
 * Handles variety/qualifier compounds that per-token dropping can't safely
 * generalize (we must not blanket-drop "cherry" — the fruit is real).
 * Keys are cleaned (lowercase, no accents); values are the final search_name.
 */
export const PHRASE_SYNONYMS: Record<string, string> = {
  'cherry tomato': 'tomato',
  'cherry tomatoes': 'tomato',
  'roma tomato': 'tomato',
  'grape tomato': 'tomato',
  'baby spinach': 'spinach',
  'baby carrot': 'carrot',
  'baby carrots': 'carrot',
  'romaine lettuce': 'lettuce',
  'iceberg lettuce': 'lettuce',
  'greek yoghurt': 'yogurt',
  'french fries': 'french fries',
  'french fry': 'french fries',
  // French composites (keys are cleaned: lowercase, accent-stripped)
  'salade de chou': 'coleslaw',
  'graines de sesame': 'sesame seeds',
  'oignons frits': 'fried onions',
  'poudre de chili': 'chili powder',
};

/* ─────────────────────────── Synonyms ─────────────────────────── */

/**
 * Map many surface forms → one canonical database term. Applied token-wise
 * AND to protected phrases, so "yoghurt"/"yogurt", "aubergine"/"eggplant",
 * "chickpeas"/"chickpea" all converge on what the databases index best.
 */
export const SYNONYMS: Record<string, string> = {
  yoghurt: 'yogurt',
  yogourt: 'yogurt',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  capsicum: 'pepper',
  prawns: 'shrimp',
  prawn: 'shrimp',
  coriander: 'cilantro',
  rocket: 'arugula',
  maize: 'corn',
  garbanzo: 'chickpea',
  chickpeas: 'chickpea',
  poulet: 'chicken',
  boeuf: 'beef',
  bœuf: 'beef',
  poisson: 'fish',
  saumon: 'salmon',
  riz: 'rice',
  pain: 'bread',
  oeuf: 'egg',
  œuf: 'egg',
  fromage: 'cheese',
  pomme: 'apple',
  frites: 'french fries',
  mais: 'corn',
  oignon: 'onion',
  salade: 'salad',
  chou: 'cabbage',
  poivron: 'pepper',
  tomate: 'tomato',
  carotte: 'carrot',
  concombre: 'cucumber',
  champignon: 'mushroom',
  crevette: 'shrimp',
  graine: 'seed',
};

/* ─────────────────────── Singularization ─────────────────────── */

/**
 * Turn a plural token into its singular database form. Handles the cases the
 * old naive `replace(/s$/,'')` got wrong ("tomatoes" → "tomatoe").
 *   tomatoes → tomato, berries → berry, loaves → loaf, potatoes → potato.
 * Leaves already-singular / short / irregular words alone.
 */
export function singularize(word: string): string {
  if (word.length <= 3) return word; // "pea", "egg", "fig"…
  if (/(ss|us|is)$/.test(word)) return word; // "hummus", "couscous", "swiss"
  if (/ies$/.test(word)) return word.replace(/ies$/, 'y'); // berries → berry
  if (/(ches|shes|xes|zes|ses)$/.test(word)) return word.replace(/es$/, ''); // dishes → dish
  if (/oes$/.test(word)) return word.replace(/oes$/, 'o'); // tomatoes → tomato
  if (/ves$/.test(word)) return word.replace(/ves$/, 'f'); // loaves → loaf
  if (/s$/.test(word) && !/s$/.test(word.slice(0, -1))) return word.slice(0, -1); // eggs → egg
  return word;
}

/** Apply the synonym map to a single normalized token. */
export function canonicalToken(token: string): string {
  return SYNONYMS[token] ?? token;
}
