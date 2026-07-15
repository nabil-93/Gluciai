/**
 * WORLD DISHES CATALOG — the "ready" database the recipe rubric browses
 * from FIRST (a local filter, zero AI tokens). Heavy Moroccan focus, plus
 * international dishes people actually eat across countries.
 *
 * Each entry is lightweight: names (fr/ar/en), a precise `search` term
 * used to resolve a DISH-SPECIFIC real photo (Wikimedia Commons) at build
 * time, the COUNTRIES where the dish is commonly eaten, and the MEAL
 * MOMENTS it suits. The full recipe (per-serving nutrition, translated
 * steps, diabetes advice) is generated once by the AI on the detail
 * screen and cached — so the catalog stays cheap to ship and browsing
 * never spends tokens.
 *
 * A dish tagged with several countries shows up for each of them: e.g.
 * pizza is eaten in Morocco AND Italy AND France, couscous across the
 * Maghreb, etc. The image map is filled by
 * scripts/fetch-world-dish-images.mjs → worldDishImages.ts.
 */

export type Moment = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface WorldDish {
  id: string;
  fr: string;
  ar: string;
  en: string;
  /** Simple ENGLISH dish name for TheMealDB photo lookup. */
  search: string;
  /** Countries where the dish is commonly eaten. */
  countries: string[];
  moments: Moment[];
}

// Handy country groups.
const MAGHREB = ['Morocco', 'Algeria', 'Tunisia'];
const MA = ['Morocco'];

export const WORLD_DISHES: WorldDish[] = [
  /* ───────────── Maroc — petit-déjeuner ───────────── */
  { id: 'msemen', fr: 'Msemen', ar: 'المسمن', en: 'Msemen (Moroccan pancake)', search: 'Msemen', countries: MA, moments: ['breakfast'] },
  { id: 'baghrir', fr: 'Baghrir (crêpe mille trous)', ar: 'البغرير', en: 'Baghrir', search: 'Baghrir', countries: MA, moments: ['breakfast'] },
  { id: 'harcha', fr: 'Harcha', ar: 'الحرشة', en: 'Harcha (semolina bread)', search: 'Harcha', countries: MA, moments: ['breakfast', 'snack'] },
  { id: 'meloui', fr: 'Meloui', ar: 'الملوي', en: 'Meloui', search: 'Meloui', countries: MA, moments: ['breakfast'] },
  { id: 'batbout', fr: 'Batbout (pain marocain)', ar: 'البطبوط', en: 'Batbout bread', search: 'Batbout bread', countries: MA, moments: ['breakfast', 'dinner'] },
  { id: 'khobz-zit', fr: "Khobz w zit (pain & huile d'olive)", ar: 'خبز وزيت', en: 'Bread with olive oil', search: 'Moroccan bread', countries: MA, moments: ['breakfast'] },
  { id: 'bissara-ma', fr: 'Bissara (soupe de fèves)', ar: 'البيصارة', en: 'Bissara fava soup', search: 'Bissara', countries: MA, moments: ['breakfast', 'lunch'] },
  { id: 'oeufs-khlii', fr: 'Œufs au khlii', ar: 'البيض بالخليع', en: 'Eggs with khlii', search: 'Khlea', countries: MA, moments: ['breakfast'] },
  { id: 'msemen-farci', fr: 'Msemen farci', ar: 'مسمن معمر', en: 'Stuffed msemen', search: 'Msemen', countries: MA, moments: ['breakfast', 'snack'] },
  { id: 'krachel', fr: 'Krachel (petits pains briochés)', ar: 'الكراشل', en: 'Krachel sweet buns', search: 'Krachel', countries: MA, moments: ['breakfast', 'snack'] },

  /* ───────────── Maroc — déjeuner / dîner ───────────── */
  { id: 'couscous', fr: 'Couscous aux sept légumes', ar: 'كسكس بسبع خضاري', en: 'Vegetable couscous', search: 'Couscous', countries: MAGHREB, moments: ['lunch'] },
  { id: 'couscous-poulet', fr: 'Couscous au poulet', ar: 'كسكس بالدجاج', en: 'Chicken couscous', search: 'Chicken couscous', countries: MAGHREB, moments: ['lunch'] },
  { id: 'couscous-boeuf', fr: 'Couscous au bœuf', ar: 'كسكس باللحم', en: 'Beef couscous', search: 'Couscous', countries: MAGHREB, moments: ['lunch'] },
  { id: 'tajine-poulet', fr: 'Tajine de poulet aux olives', ar: 'طاجين الدجاج بالزيتون', en: 'Chicken tagine with olives', search: 'Chicken tagine', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'tajine-kefta', fr: 'Tajine de kefta aux œufs', ar: 'طاجين الكفتة بالبيض', en: 'Kefta tagine', search: 'Kefta tagine', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'tajine-boeuf-pruneaux', fr: 'Tajine de bœuf aux pruneaux', ar: 'طاجين اللحم بالبرقوق', en: 'Beef tagine with prunes', search: 'Lamb tagine', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'tajine-legumes', fr: 'Tajine de légumes', ar: 'طاجين الخضر', en: 'Vegetable tagine', search: 'Vegetable tagine', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'tajine-poisson', fr: 'Tajine de poisson', ar: 'طاجين الحوت', en: 'Fish tagine', search: 'Fish tagine', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'rfissa', fr: 'Rfissa au poulet', ar: 'الرفيسة', en: 'Rfissa', search: 'Rfissa', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'pastilla', fr: 'Pastilla au poulet', ar: 'البسطيلة', en: 'Chicken pastilla', search: 'Pastilla', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'harira', fr: 'Harira', ar: 'الحريرة', en: 'Harira soup', search: 'Harira', countries: MA, moments: ['dinner', 'lunch'] },
  { id: 'loubia', fr: 'Loubia (haricots blancs)', ar: 'اللوبيا', en: 'White bean stew', search: 'Loubia', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'adass', fr: 'Lentilles à la marocaine', ar: 'العدس', en: 'Moroccan lentils', search: 'Moroccan lentils', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'sardines-farcies', fr: 'Sardines farcies', ar: 'السردين المعمر', en: 'Stuffed sardines', search: 'Stuffed sardines', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'poisson-charmoula', fr: 'Poisson à la chermoula', ar: 'السمك بالشرمولة', en: 'Chermoula fish', search: 'Chermoula fish', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'brochettes-kefta', fr: 'Brochettes de kefta', ar: 'قطبان الكفتة', en: 'Kefta skewers', search: 'Kefta kebab', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'brochettes-poulet', fr: 'Brochettes de poulet', ar: 'قطبان الدجاج', en: 'Chicken skewers', search: 'Chicken skewers', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'mechoui', fr: 'Méchoui (agneau rôti)', ar: 'المشوي', en: 'Roast lamb mechoui', search: 'Mechoui', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'tanjia', fr: 'Tanjia marrakchia', ar: 'الطنجية', en: 'Tanjia', search: 'Tanjia', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'seffa', fr: 'Seffa medfouna', ar: 'السفة', en: 'Sweet couscous seffa', search: 'Seffa', countries: MA, moments: ['dinner'] },
  { id: 'batbout-farci', fr: 'Batbout farci (sandwich marocain)', ar: 'بطبوط معمر', en: 'Stuffed batbout sandwich', search: 'Batbout sandwich', countries: MA, moments: ['lunch', 'snack'] },
  { id: 'karan', fr: 'Karan (flan de pois chiches)', ar: 'الكاران', en: 'Chickpea flan karan', search: 'Karan', countries: MA, moments: ['snack', 'lunch'] },
  { id: 'maakouda', fr: 'Maakouda (galette de pomme de terre)', ar: 'المعقودة', en: 'Potato fritter maakouda', search: 'Maakouda', countries: MAGHREB, moments: ['snack', 'lunch'] },

  /* ───────────── Maroc — salades / soupes ───────────── */
  { id: 'salade-marocaine', fr: 'Salade marocaine', ar: 'الشلاضة المغربية', en: 'Moroccan salad', search: 'Moroccan salad', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'zaalouk', fr: "Zaalouk d'aubergines", ar: 'الزعلوك', en: 'Eggplant zaalouk', search: 'Zaalouk', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'taktouka', fr: 'Taktouka', ar: 'التكتوكة', en: 'Taktouka pepper salad', search: 'Taktouka', countries: MA, moments: ['lunch', 'dinner'] },
  { id: 'bakoula', fr: 'Bakoula (mauve)', ar: 'البقولة', en: 'Bakoula mallow', search: 'Bakoula', countries: MA, moments: ['lunch', 'dinner'] },

  /* ───────────── Maroc — desserts / snacks ───────────── */
  { id: 'chebakia', fr: 'Chebakia', ar: 'الشباكية', en: 'Chebakia', search: 'Chebakia', countries: MA, moments: ['snack'] },
  { id: 'sellou', fr: 'Sellou', ar: 'السلو', en: 'Sellou', search: 'Sellou', countries: MA, moments: ['snack'] },
  { id: 'kaab-ghzal', fr: 'Cornes de gazelle', ar: 'كعب الغزال', en: 'Gazelle horns', search: 'Kaab el ghazal', countries: MA, moments: ['snack'] },
  { id: 'ghriba', fr: 'Ghriba', ar: 'الغريبة', en: 'Ghriba cookies', search: 'Ghriba', countries: MA, moments: ['snack'] },
  { id: 'briouat-amande', fr: 'Briouat aux amandes', ar: 'بريوات اللوز', en: 'Almond briouat', search: 'Briouat', countries: MA, moments: ['snack'] },

  /* ───────────── Popular internationals ALSO eaten in Morocco ───────────── */
  { id: 'pizza', fr: 'Pizza', ar: 'البيتزا', en: 'Pizza', search: 'pizza', countries: ['Italy', 'Morocco', 'France', 'USA'], moments: ['lunch', 'dinner'] },
  { id: 'pates-bolognaise', fr: 'Pâtes à la bolognaise', ar: 'مكرونة بولونيز', en: 'Spaghetti bolognese', search: 'spaghetti bolognese', countries: ['Italy', 'Morocco', 'France'], moments: ['lunch', 'dinner'] },
  { id: 'lasagnes', fr: 'Lasagnes', ar: 'اللازانيا', en: 'Lasagna', search: 'lasagne', countries: ['Italy', 'Morocco', 'France'], moments: ['lunch', 'dinner'] },
  { id: 'burger', fr: 'Burger', ar: 'البرغر', en: 'Hamburger', search: 'burger', countries: ['USA', 'Morocco', 'France'], moments: ['lunch', 'dinner'] },
  { id: 'panini', fr: 'Panini poulet', ar: 'بانيني الدجاج', en: 'Chicken panini', search: 'panini', countries: ['Italy', 'Morocco', 'France'], moments: ['lunch', 'snack'] },
  { id: 'tacos-marocain', fr: 'Tacos (marocain)', ar: 'التاكوس', en: 'Moroccan tacos', search: 'wrap', countries: ['Morocco', 'France'], moments: ['lunch', 'dinner'] },
  { id: 'shawarma', fr: 'Shawarma', ar: 'الشاورما', en: 'Shawarma', search: 'shawarma', countries: ['Lebanon', 'Turkey', 'Morocco', 'Egypt'], moments: ['lunch', 'dinner'] },
  { id: 'omelette', fr: 'Omelette aux légumes', ar: 'أومليت بالخضر', en: 'Vegetable omelette', search: 'omelette', countries: ['France', 'Morocco', 'Spain'], moments: ['breakfast', 'dinner'] },
  { id: 'salade-cesar', fr: 'Salade César', ar: 'سلطة سيزر', en: 'Caesar salad', search: 'caesar salad', countries: ['USA', 'France', 'Morocco'], moments: ['lunch', 'dinner'] },

  /* ───────────── France ───────────── */
  { id: 'ratatouille', fr: 'Ratatouille', ar: 'الراتاتوي', en: 'Ratatouille', search: 'ratatouille', countries: ['France'], moments: ['lunch', 'dinner'] },
  { id: 'poulet-roti', fr: 'Poulet rôti', ar: 'الدجاج المشوي', en: 'Roast chicken', search: 'roast chicken', countries: ['France', 'Morocco'], moments: ['lunch', 'dinner'] },
  { id: 'quiche-lorraine', fr: 'Quiche lorraine', ar: 'كيش لورين', en: 'Quiche lorraine', search: 'quiche', countries: ['France'], moments: ['lunch', 'dinner'] },
  { id: 'soupe-oignon', fr: "Soupe à l'oignon", ar: 'شوربة البصل', en: 'French onion soup', search: 'onion soup', countries: ['France'], moments: ['dinner'] },
  { id: 'nicoise', fr: 'Salade niçoise', ar: 'سلطة نيسواز', en: 'Salade nicoise', search: 'salad nicoise', countries: ['France'], moments: ['lunch'] },
  { id: 'boeuf-bourguignon', fr: 'Bœuf bourguignon', ar: 'لحم بورغينيون', en: 'Beef bourguignon', search: 'beef stew', countries: ['France'], moments: ['dinner'] },

  /* ───────────── Italie ───────────── */
  { id: 'risotto', fr: 'Risotto aux légumes', ar: 'ريزوتو الخضر', en: 'Vegetable risotto', search: 'risotto', countries: ['Italy'], moments: ['lunch', 'dinner'] },
  { id: 'minestrone', fr: 'Minestrone', ar: 'مينستروني', en: 'Minestrone soup', search: 'minestrone', countries: ['Italy'], moments: ['dinner', 'lunch'] },
  { id: 'caprese', fr: 'Salade caprese', ar: 'سلطة كابريزي', en: 'Caprese salad', search: 'caprese', countries: ['Italy'], moments: ['lunch'] },

  /* ───────────── Espagne ───────────── */
  { id: 'paella', fr: 'Paella', ar: 'الباييلا', en: 'Paella', search: 'paella', countries: ['Spain'], moments: ['lunch', 'dinner'] },
  { id: 'tortilla', fr: 'Tortilla española', ar: 'تورتيا إسبانية', en: 'Spanish tortilla', search: 'tortilla', countries: ['Spain'], moments: ['lunch', 'dinner', 'breakfast'] },
  { id: 'gazpacho', fr: 'Gazpacho', ar: 'الغازباتشو', en: 'Gazpacho', search: 'gazpacho', countries: ['Spain'], moments: ['lunch'] },

  /* ───────────── Turquie / Liban / Égypte ───────────── */
  { id: 'lentil-soup-tr', fr: 'Soupe de lentilles (mercimek)', ar: 'شوربة العدس', en: 'Turkish lentil soup', search: 'lentil soup', countries: ['Turkey'], moments: ['dinner', 'lunch'] },
  { id: 'kofte', fr: 'Köfte', ar: 'الكفتة التركية', en: 'Turkish kofte', search: 'kofta', countries: ['Turkey'], moments: ['lunch', 'dinner'] },
  { id: 'tabbouleh', fr: 'Taboulé', ar: 'التبولة', en: 'Tabbouleh', search: 'tabbouleh', countries: ['Lebanon'], moments: ['lunch', 'dinner'] },
  { id: 'hummus', fr: 'Houmous', ar: 'الحمص', en: 'Hummus', search: 'hummus', countries: ['Lebanon', 'Egypt'], moments: ['snack', 'lunch'] },
  { id: 'falafel', fr: 'Falafel', ar: 'الفلافل', en: 'Falafel', search: 'falafel', countries: ['Lebanon', 'Egypt'], moments: ['lunch', 'snack'] },
  { id: 'koshari', fr: 'Koshari', ar: 'الكشري', en: 'Koshari', search: 'rice lentils', countries: ['Egypt'], moments: ['lunch', 'dinner'] },
  { id: 'foul-medames', fr: 'Foul medames', ar: 'الفول المدمس', en: 'Ful medames', search: 'fava beans', countries: ['Egypt'], moments: ['breakfast', 'lunch'] },

  /* ───────────── Grèce / Inde / Asie / Mexique ───────────── */
  { id: 'greek-salad', fr: 'Salade grecque', ar: 'السلطة اليونانية', en: 'Greek salad', search: 'greek salad', countries: ['Greece'], moments: ['lunch', 'dinner'] },
  { id: 'souvlaki', fr: 'Souvlaki', ar: 'السوفلاكي', en: 'Souvlaki', search: 'souvlaki', countries: ['Greece'], moments: ['lunch', 'dinner'] },
  { id: 'dal', fr: 'Dal de lentilles', ar: 'دال العدس', en: 'Lentil dal', search: 'dal', countries: ['India'], moments: ['lunch', 'dinner'] },
  { id: 'chicken-curry', fr: 'Curry de poulet', ar: 'كاري الدجاج', en: 'Chicken curry', search: 'chicken curry', countries: ['India'], moments: ['lunch', 'dinner'] },
  { id: 'biryani', fr: 'Biryani de poulet', ar: 'برياني الدجاج', en: 'Chicken biryani', search: 'biryani', countries: ['India'], moments: ['lunch', 'dinner'] },
  { id: 'stir-fry', fr: 'Sauté de poulet aux légumes', ar: 'دجاج مقلي بالخضر', en: 'Chicken vegetable stir fry', search: 'stir fry', countries: ['China', 'Thailand'], moments: ['lunch', 'dinner'] },
  { id: 'pad-thai', fr: 'Pad thaï', ar: 'باد تاي', en: 'Pad thai', search: 'pad thai', countries: ['Thailand'], moments: ['lunch', 'dinner'] },
  { id: 'sushi', fr: 'Sushi', ar: 'السوشي', en: 'Sushi', search: 'sushi', countries: ['Japan'], moments: ['lunch', 'dinner'] },
  { id: 'ramen', fr: 'Ramen', ar: 'الرامن', en: 'Ramen', search: 'ramen', countries: ['Japan'], moments: ['lunch', 'dinner'] },
  { id: 'tacos-mexicain', fr: 'Tacos mexicains', ar: 'تاكوس مكسيكي', en: 'Mexican tacos', search: 'tacos', countries: ['Mexico'], moments: ['lunch', 'dinner'] },
  { id: 'guacamole', fr: 'Guacamole', ar: 'الغواكامولي', en: 'Guacamole', search: 'guacamole', countries: ['Mexico'], moments: ['snack'] },

  /* ───────────── Allemagne / USA / Grande-Bretagne ───────────── */
  { id: 'bratwurst', fr: 'Bratwurst & légumes', ar: 'براتفورست', en: 'Bratwurst', search: 'sausage', countries: ['Germany'], moments: ['lunch', 'dinner'] },
  { id: 'kartoffelsalat', fr: 'Salade de pommes de terre', ar: 'سلطة البطاطا', en: 'German potato salad', search: 'potato salad', countries: ['Germany'], moments: ['lunch', 'dinner'] },
  { id: 'schnitzel', fr: 'Schnitzel', ar: 'الشنيتزل', en: 'Schnitzel', search: 'schnitzel', countries: ['Germany'], moments: ['lunch', 'dinner'] },
  { id: 'grilled-salmon', fr: 'Saumon grillé', ar: 'سلمون مشوي', en: 'Grilled salmon', search: 'salmon', countries: ['USA', 'France'], moments: ['lunch', 'dinner'] },
];

// ── Country / moment helpers ──

/** Countries with at least one catalog dish (used for chips ordering). */
export const CATALOG_COUNTRIES = Array.from(
  new Set(WORLD_DISHES.flatMap((d) => d.countries))
);

export function dishName(d: WorldDish, lang: string): string {
  if (lang === 'ar') return d.ar;
  if (lang === 'en') return d.en;
  return d.fr;
}

/** Catalog dishes for a country + meal moment (any = all moments). */
export function filterCatalog(
  country: string,
  moment: 'any' | Moment
): WorldDish[] {
  return WORLD_DISHES.filter(
    (d) =>
      (!country || d.countries.includes(country)) &&
      (moment === 'any' || d.moments.includes(moment))
  );
}

export function getDish(id: string): WorldDish | null {
  return WORLD_DISHES.find((d) => d.id === id) ?? null;
}

/** Compact catalog index the AI receives so it can recommend READY dishes
 *  (by id) before inventing new ones — keeps token use low. */
export function catalogIndex(country?: string): string {
  const list = country
    ? WORLD_DISHES.filter((d) => d.countries.includes(country))
    : WORLD_DISHES;
  return list
    .map((d) => `${d.id}|${d.fr}|${d.moments.join(',')}`)
    .join('\n');
}
