/**
 * Internal Moroccan Nutrition Database.
 * Searchable exactly like USDA — first stop of the nutrition provider
 * chain for Moroccan meals. Values are per standard serving; the
 * nutrition engine rescales them by detected portion (grams).
 *
 * Estimations compiled for diabetic patient education — to be refined
 * with a registered dietitian. Mirror of the Supabase `moroccan_foods`
 * table (see supabase/migrations/0002_moroccan_foods.sql).
 */

export type FoodCategory =
  | 'breakfast'
  | 'soup'
  | 'salad'
  | 'main'
  | 'seafood'
  | 'snack'
  | 'dessert'
  | 'drink';

export interface MoroccanFood {
  id: string;
  name_en: string;
  name_fr: string;
  name_ar: string;
  category: FoodCategory;
  /** Human label of one serving, e.g. "1 assiette (350 g)" */
  serving_size: string;
  /** Grams of one serving — used for per-100 g rescaling */
  serving_grams: number;
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  /** mg per serving */
  sodium: number;
  /** undefined = not available */
  glycemic_index?: number;
  description?: string;
  image_url?: string;
  emoji: string;
  /** Extra spellings/transliterations to improve matching */
  aliases?: string[];
}

export const MOROCCAN_FOODS: MoroccanFood[] = [
  // ── Breakfast ──
  { id: 'msemen', name_en: 'Msemen', name_fr: 'Msemen', name_ar: 'المسمن', category: 'breakfast', serving_size: '1 pièce (100 g)', serving_grams: 100, calories: 240, carbs: 30, sugar: 2, protein: 5, fat: 11, fiber: 1, sodium: 210, glycemic_index: 65, emoji: '🫓', aliases: ['msemmen', 'rghaif', 'مسمن'] },
  { id: 'baghrir', name_en: 'Baghrir with honey', name_fr: 'Baghrir au miel', name_ar: 'البغرير بالعسل', category: 'breakfast', serving_size: '1 pièce + miel (80 g)', serving_grams: 80, calories: 180, carbs: 35, sugar: 12, protein: 4, fat: 3, fiber: 1, sodium: 120, glycemic_index: 70, emoji: '🥞', aliases: ['beghrir', 'بغرير', 'crêpe mille trous'] },
  { id: 'harcha', name_en: 'Harcha', name_fr: 'Harcha', name_ar: 'الحرشة', category: 'breakfast', serving_size: '1 pièce (90 g)', serving_grams: 90, calories: 260, carbs: 34, sugar: 3, protein: 6, fat: 11, fiber: 2, sodium: 240, glycemic_index: 65, emoji: '🌕', aliases: ['harsha', 'حرشة'] },
  { id: 'khobz', name_en: 'Moroccan bread (khobz)', name_fr: 'Pain marocain (khobz)', name_ar: 'الخبز المغربي', category: 'breakfast', serving_size: '¼ de pain (80 g)', serving_grams: 80, calories: 160, carbs: 32, sugar: 1, protein: 5, fat: 1, fiber: 2, sodium: 300, glycemic_index: 70, emoji: '🍞', aliases: ['pain', 'bread', 'خبز'] },
  { id: 'butter', name_en: 'Butter', name_fr: 'Beurre', name_ar: 'الزبدة', category: 'breakfast', serving_size: '1 c. à soupe (14 g)', serving_grams: 14, calories: 100, carbs: 0, sugar: 0, protein: 0, fat: 11, fiber: 0, sodium: 90, glycemic_index: 0, emoji: '🧈', aliases: ['zebda', 'زبدة'] },
  { id: 'honey', name_en: 'Honey', name_fr: 'Miel', name_ar: 'العسل', category: 'breakfast', serving_size: '1 c. à soupe (21 g)', serving_grams: 21, calories: 64, carbs: 17, sugar: 17, protein: 0, fat: 0, fiber: 0, sodium: 1, glycemic_index: 58, emoji: '🍯', aliases: ['aassal', 'عسل'] },
  { id: 'olive-oil', name_en: 'Olive oil', name_fr: "Huile d'olive", name_ar: 'زيت الزيتون', category: 'breakfast', serving_size: '1 c. à soupe (14 g)', serving_grams: 14, calories: 119, carbs: 0, sugar: 0, protein: 0, fat: 14, fiber: 0, sodium: 0, glycemic_index: 0, emoji: '🫒', aliases: ['zit', 'زيت'] },

  // ── Soups ──
  { id: 'harira', name_en: 'Harira soup', name_fr: 'Harira', name_ar: 'الحريرة', category: 'soup', serving_size: '1 bol (300 ml)', serving_grams: 300, calories: 220, carbs: 32, sugar: 5, protein: 9, fat: 5, fiber: 5, sodium: 780, glycemic_index: 55, emoji: '🍲', description: 'Soupe de tomates, lentilles et pois chiches', aliases: ['hrira', 'حريرة'] },
  { id: 'bissara', name_en: 'Bissara (fava bean soup)', name_fr: 'Bissara', name_ar: 'البيصارة', category: 'soup', serving_size: '1 bol (300 ml)', serving_grams: 300, calories: 250, carbs: 35, sugar: 3, protein: 14, fat: 6, fiber: 9, sodium: 620, glycemic_index: 45, emoji: '🫘', aliases: ['bessara', 'بيصارة'] },

  // ── Salads ──
  { id: 'salade-marocaine', name_en: 'Moroccan salad', name_fr: 'Salade marocaine', name_ar: 'الشلاضة المغربية', category: 'salad', serving_size: '1 assiette (200 g)', serving_grams: 200, calories: 90, carbs: 10, sugar: 6, protein: 2, fat: 5, fiber: 3, sodium: 320, glycemic_index: 25, emoji: '🥗', aliases: ['chlada', 'شلاضة'] },
  { id: 'zaalouk', name_en: 'Zaalouk (eggplant salad)', name_fr: 'Zaalouk', name_ar: 'الزعلوك', category: 'salad', serving_size: '1 portion (200 g)', serving_grams: 200, calories: 120, carbs: 12, sugar: 6, protein: 3, fat: 7, fiber: 5, sodium: 380, glycemic_index: 30, emoji: '🍆', aliases: ['zaalouk aubergine', 'زعلوك'] },
  { id: 'taktouka', name_en: 'Taktouka (pepper & tomato salad)', name_fr: 'Taktouka', name_ar: 'التكتوكة', category: 'salad', serving_size: '1 portion (200 g)', serving_grams: 200, calories: 110, carbs: 11, sugar: 7, protein: 2, fat: 7, fiber: 4, sodium: 360, glycemic_index: 30, emoji: '🫑', aliases: ['تكتوكة'] },

  // ── Main meals ──
  { id: 'couscous', name_en: 'Couscous with vegetables and meat', name_fr: 'Couscous aux légumes et viande', name_ar: 'كسكس بالخضر واللحم', category: 'main', serving_size: '1 assiette (400 g)', serving_grams: 400, calories: 550, carbs: 75, sugar: 10, protein: 25, fat: 15, fiber: 8, sodium: 720, glycemic_index: 65, emoji: '🥘', aliases: ['kesksou', 'seksu', 'كسكس'] },
  { id: 'couscous-poulet', name_en: 'Chicken couscous', name_fr: 'Couscous au poulet', name_ar: 'كسكس بالدجاج', category: 'main', serving_size: '1 assiette (400 g)', serving_grams: 400, calories: 520, carbs: 70, sugar: 9, protein: 30, fat: 12, fiber: 7, sodium: 700, glycemic_index: 65, emoji: '🍗', aliases: ['كسكس بالدجاج'] },
  { id: 'couscous-boeuf', name_en: 'Beef couscous', name_fr: 'Couscous au bœuf', name_ar: 'كسكس باللحم البقري', category: 'main', serving_size: '1 assiette (400 g)', serving_grams: 400, calories: 580, carbs: 72, sugar: 9, protein: 32, fat: 18, fiber: 7, sodium: 740, glycemic_index: 65, emoji: '🥩', aliases: [] },
  { id: 'couscous-legumes', name_en: 'Vegetable couscous', name_fr: 'Couscous aux légumes', name_ar: 'كسكس بالخضر', category: 'main', serving_size: '1 assiette (380 g)', serving_grams: 380, calories: 430, carbs: 72, sugar: 9, protein: 12, fat: 9, fiber: 8, sodium: 640, glycemic_index: 65, emoji: '🥕', aliases: [] },
  { id: 'couscous-7-legumes', name_en: 'Seven vegetable couscous', name_fr: 'Couscous aux sept légumes', name_ar: 'كسكس بسبع خضاري', category: 'main', serving_size: '1 assiette (400 g)', serving_grams: 400, calories: 460, carbs: 74, sugar: 11, protein: 14, fat: 10, fiber: 10, sodium: 660, glycemic_index: 62, emoji: '🥬', aliases: ['sept légumes'] },
  { id: 'tajine-poulet-olives', name_en: 'Chicken tagine with olives', name_fr: 'Tajine de poulet aux olives', name_ar: 'طاجين الدجاج بالزيتون', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 380, carbs: 18, sugar: 5, protein: 35, fat: 18, fiber: 4, sodium: 850, glycemic_index: 40, emoji: '🍗', aliases: ['tajine poulet', 'طاجين'] },
  { id: 'tajine-boeuf', name_en: 'Beef tagine', name_fr: 'Tajine de bœuf', name_ar: 'طاجين اللحم', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 450, carbs: 20, sugar: 8, protein: 38, fat: 24, fiber: 4, sodium: 800, glycemic_index: 40, emoji: '🍖', aliases: ['tajine viande', 'tajine pruneaux'] },
  { id: 'tajine-kefta', name_en: 'Kefta tagine with eggs', name_fr: 'Tajine de kefta aux œufs', name_ar: 'طاجين الكفتة بالبيض', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 480, carbs: 12, sugar: 6, protein: 34, fat: 32, fiber: 3, sodium: 880, glycemic_index: 30, emoji: '🍳', aliases: ['kefta oeuf', 'كفتة'] },
  { id: 'tajine-poisson', name_en: 'Fish tagine', name_fr: 'Tajine de poisson', name_ar: 'طاجين السمك', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 340, carbs: 16, sugar: 5, protein: 36, fat: 14, fiber: 4, sodium: 760, glycemic_index: 35, emoji: '🐟', aliases: ['tajine hout', 'الحوت'] },
  { id: 'rfissa', name_en: 'Rfissa', name_fr: 'Rfissa', name_ar: 'الرفيسة', category: 'main', serving_size: '1 assiette (400 g)', serving_grams: 400, calories: 620, carbs: 65, sugar: 6, protein: 32, fat: 24, fiber: 5, sodium: 820, glycemic_index: 60, emoji: '🍛', description: 'Msemen émietté, poulet, lentilles et fenugrec', aliases: ['رفيسة'] },
  { id: 'seffa', name_en: 'Seffa medfouna', name_fr: 'Seffa medfouna', name_ar: 'السفة المدفونة', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 600, carbs: 80, sugar: 18, protein: 20, fat: 18, fiber: 4, sodium: 480, glycemic_index: 65, emoji: '🍚', aliases: ['سفة'] },
  { id: 'trid', name_en: 'Trid', name_fr: 'Trid', name_ar: 'التريد', category: 'main', serving_size: '1 assiette (380 g)', serving_grams: 380, calories: 560, carbs: 55, sugar: 5, protein: 30, fat: 24, fiber: 4, sodium: 760, glycemic_index: 60, emoji: '🥙', aliases: ['تريد'] },
  { id: 'tanjia', name_en: 'Tanjia marrakchia', name_fr: 'Tanjia marrakchia', name_ar: 'الطنجية المراكشية', category: 'main', serving_size: '1 portion (300 g)', serving_grams: 300, calories: 450, carbs: 8, sugar: 2, protein: 40, fat: 28, fiber: 1, sodium: 720, glycemic_index: 25, emoji: '🏺', aliases: ['tangia', 'طنجية'] },
  { id: 'adass', name_en: 'Lentils (Moroccan style)', name_fr: 'Lentilles à la marocaine', name_ar: 'العدس', category: 'main', serving_size: '1 assiette (300 g)', serving_grams: 300, calories: 300, carbs: 40, sugar: 4, protein: 16, fat: 6, fiber: 10, sodium: 560, glycemic_index: 35, emoji: '🥣', aliases: ['lentilles', 'lentils', 'عدس'] },
  { id: 'loubia', name_en: 'Loubia (white bean stew)', name_fr: 'Loubia (haricots blancs)', name_ar: 'اللوبيا', category: 'main', serving_size: '1 assiette (300 g)', serving_grams: 300, calories: 320, carbs: 45, sugar: 5, protein: 15, fat: 8, fiber: 12, sodium: 640, glycemic_index: 40, emoji: '🍛', aliases: ['haricots', 'لوبيا'] },
  { id: 'hommos', name_en: 'Chickpeas (stewed)', name_fr: 'Pois chiches mijotés', name_ar: 'الحمص', category: 'main', serving_size: '1 assiette (300 g)', serving_grams: 300, calories: 340, carbs: 46, sugar: 6, protein: 16, fat: 10, fiber: 11, sodium: 600, glycemic_index: 35, emoji: '🫛', aliases: ['pois chiche', 'chickpea', 'حمص'] },

  // ── Seafood ──
  { id: 'sardines', name_en: 'Grilled sardines', name_fr: 'Sardines grillées', name_ar: 'السردين المشوي', category: 'seafood', serving_size: '4 sardines (200 g)', serving_grams: 200, calories: 320, carbs: 2, sugar: 0, protein: 38, fat: 18, fiber: 0, sodium: 520, glycemic_index: 5, emoji: '🐟', aliases: ['sardine', 'سردين'] },
  { id: 'poisson-grille', name_en: 'Grilled fish', name_fr: 'Poisson grillé', name_ar: 'السمك المشوي', category: 'seafood', serving_size: '1 portion (250 g)', serving_grams: 250, calories: 300, carbs: 1, sugar: 0, protein: 42, fat: 14, fiber: 0, sodium: 420, glycemic_index: 5, emoji: '🎣', aliases: ['hout', 'fish', 'حوت'] },

  // ── Snacks ──
  { id: 'dattes', name_en: 'Dates', name_fr: 'Dattes', name_ar: 'التمر', category: 'snack', serving_size: '3 dattes (60 g)', serving_grams: 60, calories: 200, carbs: 54, sugar: 48, protein: 1, fat: 0, fiber: 4, sodium: 1, glycemic_index: 55, emoji: '🌴', aliases: ['tmar', 'dates', 'تمر'] },
  { id: 'olives', name_en: 'Olives', name_fr: 'Olives', name_ar: 'الزيتون', category: 'snack', serving_size: '10 olives (40 g)', serving_grams: 40, calories: 60, carbs: 2, sugar: 0, protein: 0, fat: 6, fiber: 1, sodium: 620, glycemic_index: 0, emoji: '🫒', aliases: ['zitoun', 'زيتون'] },
  { id: 'briouat', name_en: 'Briouat (savory)', name_fr: 'Briouate salée', name_ar: 'البريوات', category: 'snack', serving_size: '2 pièces (80 g)', serving_grams: 80, calories: 260, carbs: 22, sugar: 2, protein: 10, fat: 15, fiber: 1, sodium: 380, glycemic_index: 55, emoji: '🥟', aliases: ['briouate', 'بريوات'] },

  // ── Desserts ──
  { id: 'chebakia', name_en: 'Chebakia', name_fr: 'Chebakia', name_ar: 'الشباكية', category: 'dessert', serving_size: '1 pièce (40 g)', serving_grams: 40, calories: 190, carbs: 22, sugar: 14, protein: 3, fat: 10, fiber: 1, sodium: 45, glycemic_index: 70, emoji: '🍯', aliases: ['شباكية', 'mkharka'] },
  { id: 'sellou', name_en: 'Sellou', name_fr: 'Sellou', name_ar: 'السلو', category: 'dessert', serving_size: '2 c. à soupe (50 g)', serving_grams: 50, calories: 220, carbs: 18, sugar: 10, protein: 6, fat: 14, fiber: 3, sodium: 20, glycemic_index: 55, emoji: '🥜', aliases: ['sfouf', 'zmita', 'سلو'] },
  { id: 'kaab-ghzal', name_en: 'Kaab el ghzal (gazelle horns)', name_fr: 'Cornes de gazelle', name_ar: 'كعب الغزال', category: 'dessert', serving_size: '1 pièce (30 g)', serving_grams: 30, calories: 120, carbs: 14, sugar: 8, protein: 3, fat: 6, fiber: 1, sodium: 15, glycemic_index: 60, emoji: '🥐', aliases: ['corne de gazelle', 'كعب غزال'] },
  { id: 'ghriba', name_en: 'Ghriba', name_fr: 'Ghriba', name_ar: 'الغريبة', category: 'dessert', serving_size: '1 pièce (35 g)', serving_grams: 35, calories: 160, carbs: 18, sugar: 10, protein: 3, fat: 9, fiber: 1, sodium: 40, glycemic_index: 65, emoji: '🍪', aliases: ['غريبة'] },
  { id: 'fekkas', name_en: 'Fekkas', name_fr: 'Fekkas', name_ar: 'الفقاص', category: 'dessert', serving_size: '3 pièces (45 g)', serving_grams: 45, calories: 190, carbs: 28, sugar: 12, protein: 4, fat: 7, fiber: 1, sodium: 60, glycemic_index: 65, emoji: '🥖', aliases: ['fekkas amandes', 'فقاص'] },

  // ── Drinks ──
  { id: 'the-menthe', name_en: 'Mint tea (sweetened)', name_fr: 'Thé à la menthe sucré', name_ar: 'أتاي بالنعناع', category: 'drink', serving_size: '1 verre (150 ml)', serving_grams: 150, calories: 60, carbs: 15, sugar: 15, protein: 0, fat: 0, fiber: 0, sodium: 2, glycemic_index: 65, emoji: '🍵', aliases: ['atay', 'thé menthe', 'أتاي'] },
  { id: 'jus-orange', name_en: 'Fresh orange juice', name_fr: "Jus d'orange frais", name_ar: 'عصير البرتقال', category: 'drink', serving_size: '1 verre (250 ml)', serving_grams: 250, calories: 110, carbs: 25, sugar: 22, protein: 1, fat: 0, fiber: 0, sodium: 2, glycemic_index: 50, emoji: '🍊', aliases: ['orange juice', 'عصير'] },
  { id: 'jus-avocat', name_en: 'Avocado juice', name_fr: "Jus d'avocat", name_ar: 'عصير الأفوكادو', category: 'drink', serving_size: '1 verre (250 ml)', serving_grams: 250, calories: 250, carbs: 28, sugar: 24, protein: 4, fat: 13, fiber: 4, sodium: 30, glycemic_index: 45, emoji: '🥑', description: 'Avocat mixé avec lait et sucre', aliases: ['avocado', 'أفوكادو'] },

  // ── More Moroccan dishes ──
  { id: 'tajine-kefta-oeuf', name_en: 'Kefta tagine with egg', name_fr: 'Tajine kefta aux œufs', name_ar: 'طاجين كفتة بالبيض', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 420, carbs: 12, sugar: 6, protein: 30, fat: 28, fiber: 3, sodium: 820, glycemic_index: 35, emoji: '🍳', aliases: ['tajine kefta', 'kefta', 'طاجين كفتة'] },
  { id: 'tajine-poisson', name_en: 'Fish tagine', name_fr: 'Tajine de poisson', name_ar: 'طاجين الحوت', category: 'seafood', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 320, carbs: 14, sugar: 5, protein: 34, fat: 14, fiber: 3, sodium: 760, glycemic_index: 35, emoji: '🐟', aliases: ['tajine hout', 'طاجين السمك'] },
  { id: 'tajine-legumes', name_en: 'Vegetable tagine', name_fr: 'Tajine de légumes', name_ar: 'طاجين الخضر', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 240, carbs: 32, sugar: 10, protein: 8, fat: 9, fiber: 8, sodium: 620, glycemic_index: 45, emoji: '🥘', aliases: ['tajine khodra', 'طاجين الخضرة'] },
  { id: 'tajine-pruneaux', name_en: 'Lamb tagine with prunes', name_fr: 'Tajine aux pruneaux', name_ar: 'طاجين بالبرقوق', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 480, carbs: 30, sugar: 22, protein: 30, fat: 26, fiber: 4, sodium: 700, glycemic_index: 45, emoji: '🍖', aliases: ['lham bberkouk', 'طاجين لحم بالبرقوق'] },
  { id: 'rfissa', name_en: 'Rfissa', name_fr: 'Rfissa', name_ar: 'الرفيسة', category: 'main', serving_size: '1 assiette (400 g)', serving_grams: 400, calories: 520, carbs: 60, sugar: 6, protein: 28, fat: 18, fiber: 5, sodium: 780, glycemic_index: 60, emoji: '🍲', aliases: ['trid', 'رفيسة'] },
  { id: 'pastilla', name_en: 'Pastilla (chicken/pigeon)', name_fr: 'Pastilla', name_ar: 'البسطيلة', category: 'main', serving_size: '1 part (200 g)', serving_grams: 200, calories: 640, carbs: 56, sugar: 20, protein: 28, fat: 36, fiber: 4, sodium: 800, glycemic_index: 55, emoji: '🥧', aliases: ['bastila', 'pastela', 'بسطيلة'] },
  { id: 'tanjia', name_en: 'Tanjia (Marrakchi)', name_fr: 'Tanjia', name_ar: 'الطنجية', category: 'main', serving_size: '1 portion (300 g)', serving_grams: 300, calories: 540, carbs: 4, sugar: 2, protein: 42, fat: 40, fiber: 0, sodium: 900, glycemic_index: 5, emoji: '🍖', aliases: ['tangia', 'طنجية'] },
  { id: 'mechoui', name_en: 'Méchoui (roast lamb)', name_fr: 'Méchoui', name_ar: 'المشوي', category: 'main', serving_size: '1 portion (250 g)', serving_grams: 250, calories: 640, carbs: 0, sugar: 0, protein: 58, fat: 45, fiber: 0, sodium: 720, glycemic_index: 5, emoji: '🍖', aliases: ['choua', 'مشوي'] },
  { id: 'lham-hlou', name_en: 'Sweet lamb with prunes & almonds', name_fr: "Lham m'hamer / hlou", name_ar: 'اللحم الحلو', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 560, carbs: 38, sugar: 30, protein: 30, fat: 30, fiber: 4, sodium: 640, glycemic_index: 50, emoji: '🍖', aliases: ['lham hlou', 'اللحم بالبرقوق واللوز'] },
  { id: 'seffa', name_en: 'Seffa (sweet couscous)', name_fr: 'Seffa medfouna', name_ar: 'السفة', category: 'main', serving_size: '1 assiette (300 g)', serving_grams: 300, calories: 540, carbs: 80, sugar: 30, protein: 14, fat: 18, fiber: 4, sodium: 220, glycemic_index: 60, emoji: '🍚', aliases: ['seffa', 'medfouna', 'سفة'] },
  { id: 'loubia', name_en: 'Loubia (white bean stew)', name_fr: 'Loubia', name_ar: 'اللوبيا', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 320, carbs: 44, sugar: 6, protein: 18, fat: 8, fiber: 12, sodium: 720, glycemic_index: 35, emoji: '🫘', aliases: ['loubia bزيت', 'لوبية'] },
  { id: 'adas', name_en: 'Lentil stew (adas)', name_fr: 'Lentilles (plat)', name_ar: 'العدس', category: 'main', serving_size: '1 assiette (350 g)', serving_grams: 350, calories: 300, carbs: 44, sugar: 5, protein: 20, fat: 6, fiber: 14, sodium: 700, glycemic_index: 30, emoji: '🍲', aliases: ['3ades', 'عدس'] },
  { id: 'batbout', name_en: 'Batbout (Moroccan pita)', name_fr: 'Batbout', name_ar: 'البطبوط', category: 'breakfast', serving_size: '1 pièce (80 g)', serving_grams: 80, calories: 200, carbs: 40, sugar: 1, protein: 6, fat: 2, fiber: 2, sodium: 320, glycemic_index: 70, emoji: '🫓', aliases: ['matlou3', 'بطبوط'] },
  { id: 'meloui', name_en: 'Meloui', name_fr: 'Meloui', name_ar: 'الملوي', category: 'breakfast', serving_size: '1 pièce (90 g)', serving_grams: 90, calories: 250, carbs: 34, sugar: 2, protein: 5, fat: 11, fiber: 1, sodium: 230, glycemic_index: 65, emoji: '🌀', aliases: ['melwi', 'ملوي'] },
  { id: 'khringo', name_en: 'Bread with olive oil & tea', name_fr: 'Petit-déjeuner khobz-zit', name_ar: 'خبز وزيت', category: 'breakfast', serving_size: '1 portion (120 g)', serving_grams: 120, calories: 320, carbs: 45, sugar: 2, protein: 7, fat: 13, fiber: 3, sodium: 380, glycemic_index: 68, emoji: '🫓', aliases: ['khobz zit'] },
  { id: 'zmita', name_en: 'Zmita / Sfouf', name_fr: 'Zmita', name_ar: 'الزميتة', category: 'snack', serving_size: '2 c. à soupe (40 g)', serving_grams: 40, calories: 190, carbs: 22, sugar: 8, protein: 5, fat: 9, fiber: 3, sodium: 15, glycemic_index: 50, emoji: '🥣', aliases: ['sfouf', 'زميتة'] },
  { id: 'amlou', name_en: 'Amlou (argan-almond spread)', name_fr: 'Amlou', name_ar: 'أملو', category: 'breakfast', serving_size: '1 c. à soupe (20 g)', serving_grams: 20, calories: 120, carbs: 5, sugar: 3, protein: 2, fat: 10, fiber: 2, sodium: 4, glycemic_index: 30, emoji: '🥜', aliases: ['amlo', 'أملو'] },
  { id: 'msemen-farci', name_en: 'Stuffed msemen', name_fr: 'Msemen farci', name_ar: 'مسمن معمر', category: 'breakfast', serving_size: '1 pièce (120 g)', serving_grams: 120, calories: 320, carbs: 34, sugar: 2, protein: 9, fat: 16, fiber: 2, sodium: 360, glycemic_index: 65, emoji: '🫓', aliases: ['msemen m3amer'] },
  { id: 'hssoua', name_en: 'Hssoua (semolina soup)', name_fr: 'Hssoua / Soupe de semoule', name_ar: 'الحسوة', category: 'soup', serving_size: '1 bol (300 ml)', serving_grams: 300, calories: 180, carbs: 30, sugar: 6, protein: 6, fat: 4, fiber: 2, sodium: 500, glycemic_index: 60, emoji: '🥣', aliases: ['hsoua', 'حسوة'] },
  { id: 'douida', name_en: 'Chaariya / Vermicelli', name_fr: 'Chaariya (vermicelles)', name_ar: 'الشعرية', category: 'main', serving_size: '1 assiette (300 g)', serving_grams: 300, calories: 380, carbs: 70, sugar: 12, protein: 10, fat: 6, fiber: 3, sodium: 200, glycemic_index: 60, emoji: '🍜', aliases: ['chaariya', 'douiyda', 'شعرية'] },
  { id: 'krachel', name_en: 'Krachel (sweet buns)', name_fr: 'Krachel', name_ar: 'الكراشل', category: 'breakfast', serving_size: '1 pièce (60 g)', serving_grams: 60, calories: 210, carbs: 34, sugar: 10, protein: 5, fat: 6, fiber: 1, sodium: 180, glycemic_index: 65, emoji: '🥐', aliases: ['كراشل'] },
  { id: 'harira-ramadan', name_en: 'Harira with dates & chebakia', name_fr: 'Harira + dattes + chebakia', name_ar: 'حريرة رمضان', category: 'soup', serving_size: '1 repas (450 g)', serving_grams: 450, calories: 480, carbs: 72, sugar: 30, protein: 12, fat: 14, fiber: 7, sodium: 900, glycemic_index: 62, emoji: '🌙', aliases: ['ftour ramadan'] },
];

/* ───────────────────────── Search ───────────────────────── */

/** Lowercase + strip accents/diacritics for tolerant matching. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٟ]/g, '') // Arabic diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search the Moroccan database across en/fr/ar names and aliases.
 * Returns the best match (exact > starts-with > contains > token overlap),
 * or null — never invents food.
 */
export function searchMoroccanFood(query: string): MoroccanFood | null {
  const q = normalize(query);
  if (!q) return null;

  let best: { food: MoroccanFood; score: number } | null = null;

  for (const food of MOROCCAN_FOODS) {
    const candidates = [
      food.name_en,
      food.name_fr,
      food.name_ar,
      ...(food.aliases ?? []),
    ].map(normalize);

    let score = 0;
    for (const c of candidates) {
      if (!c) continue;
      if (c === q) score = Math.max(score, 100);
      else if (c.startsWith(q) || q.startsWith(c)) score = Math.max(score, 80);
      else if (c.includes(q) || q.includes(c)) score = Math.max(score, 60);
      else {
        // Token overlap — at least TWO shared tokens required to match
        // (a single word like "chicken" must not match "chicken couscous").
        const qt = q.split(' ');
        const ct = c.split(' ');
        const common = qt.filter((t) => t.length > 2 && ct.includes(t)).length;
        if (common >= 2) {
          score = Math.max(score, 35 + common * 10);
        }
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { food, score };
    }
  }

  return best && best.score >= 45 ? best.food : null;
}

/** Filtered list for the browse screen. */
export function filterMoroccanFoods(query: string): MoroccanFood[] {
  const q = normalize(query);
  if (!q) return MOROCCAN_FOODS;
  return MOROCCAN_FOODS.filter((f) =>
    [f.name_en, f.name_fr, f.name_ar, ...(f.aliases ?? [])].some((n) =>
      normalize(n).includes(q)
    )
  );
}
