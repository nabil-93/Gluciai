/**
 * Common Foods Database — a broad, per-100 g nutrition table covering the
 * everyday items a diabetic patient scans: fruits, vegetables, staples,
 * proteins, dairy, nuts, snacks, sweets, drinks, fast food and popular
 * Arab/Mediterranean/world dishes. Complements the Moroccan DB so the
 * scanner and the "modifier l'aliment" search recognise far more foods
 * before falling through to USDA / Open Food Facts / AI estimate.
 *
 * Values are per 100 g (edible portion), rounded, from public nutrition
 * tables (USDA / CIQUAL / OFF averages). GI is a typical published value;
 * undefined when not meaningful (pure fat/protein). Educational estimates.
 */

export interface CommonFood {
  /** English/base name */
  name: string;
  /** French name */
  fr: string;
  /** Arabic name (incl. common Darija) */
  ar: string;
  emoji: string;
  /** per 100 g */
  kcal: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  /** mg / 100 g */
  sodium: number;
  gi?: number;
  /** extra spellings / darija / transliterations */
  aliases?: string[];
}

// Compact rows: [name, fr, ar, emoji, kcal, carbs, sugar, protein, fat, fiber, sodium, gi?, aliases?]
type Row = [
  string, string, string, string,
  number, number, number, number, number, number, number,
  (number | undefined)?, (string[])?
];

const R: Row[] = [
  // ── Fruits ──
  ['Apple', 'Pomme', 'تفاحة', '🍎', 52, 14, 10, 0.3, 0.2, 2.4, 1, 36, ['teffah', 'tofah']],
  ['Banana', 'Banane', 'موز', '🍌', 89, 23, 12, 1.1, 0.3, 2.6, 1, 51, ['banan', 'mouz']],
  ['Orange', 'Orange', 'برتقالة', '🍊', 47, 12, 9, 0.9, 0.1, 2.4, 0, 43, ['limoun', 'burtuqal', 'tchina']],
  ['Grapes', 'Raisin', 'عنب', '🍇', 69, 18, 16, 0.7, 0.2, 0.9, 2, 53, ['3ineb', 'raisins']],
  ['Strawberry', 'Fraise', 'فراولة', '🍓', 32, 8, 5, 0.7, 0.3, 2, 1, 40, ['toot', 'frez']],
  ['Watermelon', 'Pastèque', 'دلاح', '🍉', 30, 8, 6, 0.6, 0.2, 0.4, 1, 72, ['dellah', 'batikh']],
  ['Melon', 'Melon', 'شمام', '🍈', 34, 8, 8, 0.8, 0.2, 0.9, 16, 65, ['chmam', 'swihla']],
  ['Peach', 'Pêche', 'خوخة', '🍑', 39, 10, 8, 0.9, 0.3, 1.5, 0, 42, ['khokh']],
  ['Apricot', 'Abricot', 'مشماش', '🍑', 48, 11, 9, 1.4, 0.4, 2, 1, 34, ['mechmach']],
  ['Pear', 'Poire', 'إجاصة', '🍐', 57, 15, 10, 0.4, 0.1, 3.1, 1, 38, ['boiwa', 'lingas']],
  ['Pineapple', 'Ananas', 'أناناس', '🍍', 50, 13, 10, 0.5, 0.1, 1.4, 1, 59],
  ['Mango', 'Mangue', 'مانجو', '🥭', 60, 15, 14, 0.8, 0.4, 1.6, 1, 51],
  ['Kiwi', 'Kiwi', 'كيوي', '🥝', 61, 15, 9, 1.1, 0.5, 3, 3, 50],
  ['Fig', 'Figue', 'كرموس', '🫐', 74, 19, 16, 0.8, 0.3, 2.9, 1, 61, ['karmous', 'ficus']],
  ['Date', 'Datte', 'تمر', '🌴', 282, 75, 63, 2.5, 0.4, 8, 2, 55, ['tmar', 'dates']],
  ['Pomegranate', 'Grenade', 'رمان', '🍎', 83, 19, 14, 1.7, 1.2, 4, 3, 53, ['romman']],
  ['Lemon', 'Citron', 'حامض', '🍋', 29, 9, 2.5, 1.1, 0.3, 2.8, 2, 20, ['hamed', 'laymoun']],
  ['Cherry', 'Cerise', 'حب الملوك', '🍒', 63, 16, 13, 1.1, 0.2, 2.1, 0, 22, ['hab lmlouk']],
  ['Plum', 'Prune', 'برقوق', '🫐', 46, 11, 10, 0.7, 0.3, 1.4, 0, 40, ['barqoq']],
  ['Avocado', 'Avocat', 'أفوكادو', '🥑', 160, 9, 0.7, 2, 15, 7, 7, 15],
  ['Prickly pear', 'Figue de barbarie', 'الهندية', '🌵', 41, 10, 8, 0.7, 0.5, 3.6, 5, 40, ['hendia', 'karmous nssara']],

  // ── Vegetables ──
  ['Tomato', 'Tomate', 'طماطم', '🍅', 18, 3.9, 2.6, 0.9, 0.2, 1.2, 5, 30, ['matecha', 'tamatim']],
  ['Potato', 'Pomme de terre', 'بطاطا', '🥔', 77, 17, 0.8, 2, 0.1, 2.2, 6, 78, ['btata', 'patata']],
  ['Sweet potato', 'Patate douce', 'بطاطا حلوة', '🍠', 86, 20, 4.2, 1.6, 0.1, 3, 55, 63, ['btata hloua']],
  ['Onion', 'Oignon', 'بصلة', '🧅', 40, 9, 4.2, 1.1, 0.1, 1.7, 4, 15, ['bsla']],
  ['Carrot', 'Carotte', 'خيزو', '🥕', 41, 10, 4.7, 0.9, 0.2, 2.8, 69, 39, ['khizou', 'jazar']],
  ['Cucumber', 'Concombre', 'خيار', '🥒', 15, 3.6, 1.7, 0.7, 0.1, 0.5, 2, 15, ['khyar', 'khiar']],
  ['Bell pepper', 'Poivron', 'فلفلة', '🫑', 26, 6, 4.2, 1, 0.3, 2.1, 4, 15, ['felfla']],
  ['Zucchini', 'Courgette', 'قرع أخضر', '🥒', 17, 3.1, 2.5, 1.2, 0.3, 1, 8, 15, ['gr3a']],
  ['Eggplant', 'Aubergine', 'باذنجان', '🍆', 25, 6, 3.5, 1, 0.2, 3, 2, 15, ['denjal', 'badinjan']],
  ['Pumpkin', 'Potiron', 'قرع أحمر', '🎃', 26, 7, 2.8, 1, 0.1, 0.5, 1, 75, ['gr3a hamra']],
  ['Green beans', 'Haricots verts', 'لوبيا خضراء', '🫛', 31, 7, 3.3, 1.8, 0.2, 2.7, 6, 30, ['loubia khadra']],
  ['Peas', 'Petits pois', 'جلبانة', '🟢', 81, 14, 5.7, 5.4, 0.4, 5, 5, 48, ['jelbana']],
  ['Cabbage', 'Chou', 'كرنب', '🥬', 25, 6, 3.2, 1.3, 0.1, 2.5, 18, 10, ['kromb']],
  ['Cauliflower', 'Chou-fleur', 'قرنبيط', '🥦', 25, 5, 1.9, 1.9, 0.3, 2, 30, 15, ['chiflor']],
  ['Broccoli', 'Brocoli', 'بروكلي', '🥦', 34, 7, 1.7, 2.8, 0.4, 2.6, 33, 15],
  ['Lettuce', 'Laitue', 'خس', '🥬', 15, 2.9, 0.8, 1.4, 0.2, 1.3, 28, 15, ['khass']],
  ['Spinach', 'Épinard', 'سبانخ', '🥬', 23, 3.6, 0.4, 2.9, 0.4, 2.2, 79, 15, ['sbanekh']],
  ['Beetroot', 'Betterave', 'بربة', '🟣', 43, 10, 7, 1.6, 0.2, 2.8, 78, 64, ['barba']],
  ['Garlic', 'Ail', 'ثوم', '🧄', 149, 33, 1, 6.4, 0.5, 2.1, 17, 30, ['touma']],
  ['Turnip', 'Navet', 'لفت', '🥬', 28, 6, 3.8, 0.9, 0.1, 1.8, 39, 30, ['left']],
  ['Okra', 'Gombo', 'ملوخية', '🌿', 33, 7, 1.5, 1.9, 0.2, 3.2, 7, 20, ['mloukhia', 'gnawiya']],
  ['Mushroom', 'Champignon', 'فطر', '🍄', 22, 3.3, 2, 3.1, 0.3, 1, 5, 15, ['champignon']],
  ['Corn', 'Maïs', 'ذرة', '🌽', 86, 19, 3.2, 3.3, 1.2, 2.7, 15, 55, ['dra']],

  // ── Staples / grains / bread ──
  ['White rice cooked', 'Riz blanc cuit', 'رز أبيض', '🍚', 130, 28, 0.1, 2.7, 0.3, 0.4, 1, 73, ['rouz', 'riz']],
  ['Brown rice cooked', 'Riz complet cuit', 'رز أسمر', '🍚', 111, 23, 0.4, 2.6, 0.9, 1.8, 5, 50],
  ['Pasta cooked', 'Pâtes cuites', 'معكرونة', '🍝', 131, 25, 0.6, 5, 1.1, 1.8, 1, 50, ['makarona', 'pates', 'spaghetti']],
  ['White bread', 'Pain blanc', 'خبز أبيض', '🍞', 265, 49, 5, 9, 3.2, 2.7, 490, 75, ['khobz']],
  ['Whole wheat bread', 'Pain complet', 'خبز أسمر', '🍞', 247, 41, 6, 13, 3.4, 7, 450, 55, ['khobz kamel']],
  ['Baguette', 'Baguette', 'باغيت', '🥖', 274, 55, 3, 9, 1.5, 2.7, 540, 72],
  ['Couscous cooked', 'Couscous cuit', 'كسكس', '🥣', 112, 23, 0.1, 3.8, 0.2, 1.4, 5, 65, ['seksou']],
  ['Bulgur cooked', 'Boulgour cuit', 'برغل', '🥣', 83, 19, 0.1, 3, 0.2, 4.5, 5, 48],
  ['Oats', 'Flocons d\'avoine', 'شوفان', '🥣', 379, 67, 1, 13, 7, 10, 6, 55, ['avoine', 'chofan']],
  ['Cornflakes', 'Corn flakes', 'رقائق الذرة', '🥣', 357, 84, 8, 7, 0.4, 3, 660, 81],
  ['Flour', 'Farine', 'دقيق', '🌾', 364, 76, 0.3, 10, 1, 2.7, 2, 70, ['farina', 'daqiq']],
  ['Semolina', 'Semoule', 'سميدة', '🌾', 360, 73, 0.6, 12, 1, 3.9, 1, 66, ['smida']],
  ['Lentils cooked', 'Lentilles cuites', 'عدس', '🫘', 116, 20, 1.8, 9, 0.4, 8, 2, 30, ['3ads', 'lentilles']],
  ['Chickpeas cooked', 'Pois chiches cuits', 'حمص', '🫘', 164, 27, 4.8, 9, 2.6, 8, 7, 33, ['hommos', '7immez']],
  ['White beans cooked', 'Haricots blancs cuits', 'لوبيا بيضاء', '🫘', 139, 25, 0.3, 9.7, 0.5, 6.3, 6, 35, ['loubia']],
  ['Fava beans cooked', 'Fèves cuites', 'فول', '🫘', 110, 18, 1.6, 8, 0.4, 5.4, 5, 40, ['foul']],
  ['Quinoa cooked', 'Quinoa cuit', 'كينوا', '🥣', 120, 21, 0.9, 4.4, 1.9, 2.8, 7, 53],

  // ── Proteins: meat / poultry / eggs ──
  ['Chicken breast cooked', 'Poulet (blanc)', 'دجاج', '🍗', 165, 0, 0, 31, 3.6, 0, 74, undefined, ['djaj', 'poulet', 'ferrouj']],
  ['Chicken thigh', 'Cuisse de poulet', 'فخذ الدجاج', '🍗', 209, 0, 0, 26, 11, 0, 88],
  ['Beef', 'Bœuf', 'لحم بقري', '🥩', 250, 0, 0, 26, 15, 0, 72, undefined, ['lham begri', 'viande']],
  ['Ground beef', 'Viande hachée', 'كفتة', '🍖', 254, 0, 0, 26, 17, 0, 75, undefined, ['kefta', 'lham mfroum']],
  ['Lamb', 'Agneau', 'لحم الغنم', '🍖', 294, 0, 0, 25, 21, 0, 72, undefined, ['lham ghenmi', 'mouton']],
  ['Merguez', 'Merguez', 'مرقاز', '🌭', 290, 2, 1, 16, 24, 0, 900, undefined, ['mergaz']],
  ['Liver', 'Foie', 'كبدة', '🍖', 135, 3.9, 0, 20, 3.6, 0, 70, undefined, ['kebda']],
  ['Turkey', 'Dinde', 'ديك رومي', '🦃', 189, 0, 0, 29, 7, 0, 103, undefined, ['bibi']],
  ['Egg', 'Œuf', 'بيضة', '🥚', 155, 1.1, 1.1, 13, 11, 0, 124, undefined, ['bayd', 'oeuf']],
  ['Boiled egg', 'Œuf dur', 'بيض مسلوق', '🥚', 155, 1.1, 1.1, 13, 11, 0, 124],
  ['Sausage', 'Saucisse', 'نقانق', '🌭', 300, 2, 1, 12, 27, 0, 800, undefined, ['sujouk']],

  // ── Fish / seafood ──
  ['Sardine', 'Sardine', 'سردين', '🐟', 208, 0, 0, 25, 11, 0, 307, undefined, ['sardin']],
  ['Tuna', 'Thon', 'تونة', '🐟', 132, 0, 0, 28, 1.3, 0, 47, undefined, ['tون', 'ton']],
  ['Canned tuna', 'Thon en boîte', 'تونة معلبة', '🥫', 116, 0, 0, 26, 0.8, 0, 320],
  ['Salmon', 'Saumon', 'سلمون', '🐟', 208, 0, 0, 20, 13, 0, 59, undefined, ['saumon']],
  ['White fish', 'Poisson blanc', 'حوت أبيض', '🐟', 105, 0, 0, 23, 1, 0, 78, undefined, ['hout', 'merlan', 'daurade']],
  ['Shrimp', 'Crevette', 'قمرون', '🦐', 99, 0.2, 0, 24, 0.3, 0, 111, undefined, ['gambas', 'crevettes']],
  ['Calamari', 'Calamar', 'كلمار', '🦑', 92, 3, 0, 16, 1.4, 0, 44, undefined, ['calmar']],

  // ── Dairy ──
  ['Milk', 'Lait', 'حليب', '🥛', 61, 4.8, 4.8, 3.2, 3.3, 0, 43, 30, ['halib', 'lben']],
  ['Skim milk', 'Lait écrémé', 'حليب خالي الدسم', '🥛', 34, 5, 5, 3.4, 0.1, 0, 42, 32],
  ['Yogurt', 'Yaourt', 'زبادي', '🥣', 61, 4.7, 4.7, 3.5, 3.3, 0, 46, 35, ['yaghourt', 'danone', 'raib']],
  ['Greek yogurt', 'Yaourt grec', 'زبادي يوناني', '🥣', 97, 4, 4, 9, 5, 0, 35, 11],
  ['Cheese', 'Fromage', 'جبن', '🧀', 350, 2, 0.5, 25, 27, 0, 620, undefined, ['jben', 'fromaj']],
  ['Laughing cow cheese', 'Vache qui rit', 'البقرة الضاحكة', '🧀', 265, 7, 6, 10, 22, 0, 900],
  ['Fresh cheese', 'Jben (fromage frais)', 'جبن بلدي', '🧀', 98, 3, 3, 11, 4, 0, 350, undefined, ['jben beldi']],
  ['Butter', 'Beurre', 'زبدة', '🧈', 717, 0.1, 0.1, 0.9, 81, 0, 11, undefined, ['zebda']],
  ['Cream', 'Crème', 'كريمة', '🥛', 340, 3, 3, 2, 36, 0, 30, undefined, ['crema']],

  // ── Nuts / seeds / oils ──
  ['Almonds', 'Amandes', 'لوز', '🌰', 579, 22, 4, 21, 50, 12, 1, 15, ['louz']],
  ['Walnuts', 'Noix', 'جوز', '🌰', 654, 14, 2.6, 15, 65, 7, 2, 15, ['gerga3']],
  ['Peanuts', 'Cacahuètes', 'فول سوداني', '🥜', 567, 16, 4, 26, 49, 9, 18, 14, ['kaw kaw']],
  ['Cashew', 'Noix de cajou', 'كاجو', '🥜', 553, 30, 6, 18, 44, 3.3, 12, 25],
  ['Pistachio', 'Pistache', 'فستق', '🌰', 560, 28, 8, 20, 45, 10, 1, 15, ['fostok']],
  ['Sunflower seeds', 'Graines de tournesol', 'زريعة', '🌻', 584, 20, 2.6, 21, 51, 9, 9, 15, ['zri3a']],
  ['Olive', 'Olive', 'زيتون', '🫒', 115, 6, 0, 0.8, 11, 3.2, 735, 15, ['zitoun']],
  ['Olive oil', 'Huile d\'olive', 'زيت الزيتون', '🫒', 884, 0, 0, 0, 100, 0, 2, undefined, ['zit l3oud']],
  ['Vegetable oil', 'Huile', 'زيت', '🛢️', 884, 0, 0, 0, 100, 0, 0, undefined, ['zit']],
  ['Argan oil', 'Huile d\'argan', 'زيت أركان', '🛢️', 884, 0, 0, 0, 100, 0, 0, undefined, ['argan']],
  ['Amlou', 'Amlou', 'أملو', '🥜', 600, 25, 15, 12, 50, 8, 20, 30, ['amlo']],

  // ── Sweets / desserts / snacks ──
  ['Sugar', 'Sucre', 'سكر', '🍬', 387, 100, 100, 0, 0, 0, 0, 65, ['sokar']],
  ['Chocolate', 'Chocolat', 'شوكولا', '🍫', 546, 61, 48, 5, 31, 7, 24, 40, ['chocolat']],
  ['Dark chocolate', 'Chocolat noir', 'شوكولا داكنة', '🍫', 598, 46, 24, 8, 43, 11, 20, 23],
  ['Cookies', 'Biscuits', 'بسكويت', '🍪', 480, 64, 30, 6, 22, 2, 350, 55, ['biscota']],
  ['Cake', 'Gâteau', 'حلوى', '🍰', 350, 50, 32, 5, 15, 1, 300, 55, ['gato', 'halwa']],
  ['Croissant', 'Croissant', 'كرواسون', '🥐', 406, 46, 11, 8, 21, 2.6, 420, 67],
  ['Chebakia', 'Chebakia', 'الشباكية', '🍯', 460, 55, 35, 6, 22, 3, 60, 65, ['chebbakia', 'griwech']],
  ['Sellou', 'Sellou', 'سلو', '🥣', 550, 45, 25, 12, 35, 6, 30, 45, ['sfouf', 'zmita']],
  ['Ice cream', 'Glace', 'مثلجات', '🍨', 207, 24, 21, 3.5, 11, 0.7, 80, 50, ['glace']],
  ['Honey', 'Miel', 'عسل', '🍯', 304, 82, 82, 0.3, 0, 0.2, 4, 58, ['3sel']],
  ['Jam', 'Confiture', 'مربى', '🍓', 278, 69, 60, 0.4, 0.1, 1, 32, 65, ['confiture']],
  ['Chips', 'Chips', 'رقائق البطاطس', '🥔', 536, 53, 0.6, 7, 34, 4.4, 525, 70, ['chips']],
  ['Popcorn', 'Popcorn', 'فشار', '🍿', 387, 78, 0.9, 12, 4.5, 15, 8, 65],
  ['Peanut butter', 'Beurre de cacahuète', 'زبدة الفول السوداني', '🥜', 588, 20, 9, 25, 50, 6, 476, 40],

  // ── Fast food / prepared ──
  ['Pizza', 'Pizza', 'بيتزا', '🍕', 266, 33, 3.6, 11, 10, 2.3, 598, 60],
  ['Hamburger', 'Hamburger', 'همبرغر', '🍔', 254, 30, 6, 13, 9, 1.5, 490, 65, ['burger']],
  ['French fries', 'Frites', 'بطاطا مقلية', '🍟', 312, 41, 0.3, 3.4, 15, 3.8, 210, 75, ['frites']],
  ['Shawarma', 'Chawarma', 'شاورما', '🌯', 245, 15, 2, 18, 12, 1.5, 600, 55, ['chawarma']],
  ['Sandwich', 'Sandwich', 'سندويش', '🥪', 250, 30, 3, 12, 9, 2, 500, 60, ['sandwich', 'kaskrout']],
  ['Panini', 'Panini', 'بانيني', '🥪', 280, 33, 3, 13, 11, 2, 520, 60],
  ['Tacos', 'Tacos', 'طاكوس', '🌮', 300, 30, 3, 14, 14, 2, 600, 55, ['taco']],
  ['Briouat', 'Briouate', 'بريوات', '🥟', 320, 28, 6, 9, 19, 2, 300, 60, ['briwat']],
  ['Bocadillo', 'Bocadillo', 'بوكاديو', '🥖', 260, 33, 3, 11, 9, 2, 520, 60],

  // ── Arab / world dishes ──
  ['Hummus', 'Houmous', 'حمص بالطحينة', '🥣', 166, 14, 0.3, 8, 10, 6, 379, 25, ['homos']],
  ['Falafel', 'Falafel', 'فلافل', '🧆', 333, 32, 1, 13, 18, 5, 294, 40],
  ['Tabbouleh', 'Taboulé', 'تبولة', '🥗', 130, 17, 2, 3, 6, 3, 300, 35, ['taboula']],
  ['Kebab', 'Kebab', 'كباب', '🍢', 215, 5, 1, 20, 13, 0.5, 550, undefined, ['brochette']],
  ['Rfissa', 'Rfissa', 'رفيسة', '🍲', 250, 30, 3, 15, 8, 3, 500, 60, ['trid']],
  ['Pastilla', 'Pastilla', 'بسطيلة', '🥧', 320, 28, 10, 14, 18, 2, 400, 55, ['bastila', 'pastela']],
  ['Tanjia', 'Tanjia', 'طنجية', '🍖', 260, 2, 1, 24, 18, 0, 600, undefined, ['tangia']],
  ['Mechoui', 'Méchoui', 'مشوي', '🍖', 294, 0, 0, 25, 21, 0, 400, undefined, ['choua']],
  ['Loubia dish', 'Loubia (plat)', 'طبق اللوبيا', '🍲', 140, 20, 2, 8, 4, 6, 500, 35, ['loubia bزيت']],
  ['Adas dish', 'Lentilles (plat)', 'طبق العدس', '🍲', 130, 20, 2, 9, 2, 7, 480, 30, ['3ades']],
  ['Omelette', 'Omelette', 'عجة', '🍳', 154, 1, 1, 11, 12, 0, 155, undefined, ['ejja', 'khagi3a']],
  ['Fried egg', 'Œuf au plat', 'بيض مقلي', '🍳', 196, 0.8, 0.4, 14, 15, 0, 207],

  // ── Drinks ──
  ['Water', 'Eau', 'ماء', '💧', 0, 0, 0, 0, 0, 0, 2, undefined, ['lma']],
  ['Coffee (black)', 'Café noir', 'قهوة', '☕', 2, 0, 0, 0.1, 0, 0, 2, undefined, ['9ahwa', 'kahwa']],
  ['Tea (mint, sweet)', 'Thé à la menthe', 'أتاي', '🍵', 45, 11, 11, 0, 0, 0, 3, 60, ['atay', 'chay', 'the']],
  ['Orange juice', 'Jus d\'orange', 'عصير البرتقال', '🧃', 45, 10, 8, 0.7, 0.2, 0.2, 1, 50, ['3assir limoun']],
  ['Soda', 'Soda', 'مشروب غازي', '🥤', 42, 11, 11, 0, 0, 0, 4, 63, ['coca', 'boisson gazeuse', 'monada']],
  ['Fruit juice', 'Jus de fruit', 'عصير', '🧃', 50, 12, 11, 0.4, 0.1, 0.2, 3, 50, ['3assir']],
  ['Energy drink', 'Boisson énergisante', 'مشروب الطاقة', '🥤', 45, 11, 11, 0, 0, 0, 105, 65, ['red bull']],
  ['Beer', 'Bière', 'جعة', '🍺', 43, 3.6, 0, 0.5, 0, 0, 4, undefined],

  // ── Common condiments / extras ──
  ['Ketchup', 'Ketchup', 'كاتشب', '🍅', 112, 26, 22, 1.3, 0.4, 0.3, 907, 55],
  ['Mayonnaise', 'Mayonnaise', 'مايونيز', '🥚', 680, 1, 1, 1, 75, 0, 635, undefined, ['mayo']],
  ['Harissa', 'Harissa', 'هريسة', '🌶️', 70, 12, 5, 3, 2, 4, 1500, undefined, ['harisa']],
  ['Tomato sauce', 'Sauce tomate', 'صلصة الطماطم', '🍅', 32, 7, 5, 1.3, 0.3, 1.5, 430, 40],
  ['Couscous with milk', 'Seffa', 'سفة', '🍚', 200, 35, 12, 6, 4, 2, 100, 60, ['seffa', 'sfa']],
];

export const COMMON_FOODS: CommonFood[] = R.map((r) => ({
  name: r[0],
  fr: r[1],
  ar: r[2],
  emoji: r[3],
  kcal: r[4],
  carbs: r[5],
  sugar: r[6],
  protein: r[7],
  fat: r[8],
  fiber: r[9],
  sodium: r[10],
  gi: r[11],
  aliases: r[12],
}));

/* ───────────────────────── Search ───────────────────────── */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٟ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best match across name/fr/ar/aliases, or null. Same scoring style as
 *  the Moroccan DB so results are comparable in the provider chain. */
export function searchCommonFood(query: string): CommonFood | null {
  const q = normalize(query);
  if (!q) return null;

  let best: { food: CommonFood; score: number } | null = null;

  for (const food of COMMON_FOODS) {
    const candidates = [food.name, food.fr, food.ar, ...(food.aliases ?? [])].map(
      normalize
    );
    let score = 0;
    for (const c of candidates) {
      if (!c) continue;
      if (c === q) score = Math.max(score, 100);
      else if (c.startsWith(q) || q.startsWith(c)) score = Math.max(score, 82);
      else if (c.includes(q) || q.includes(c)) score = Math.max(score, 62);
      else {
        const qt = q.split(' ');
        const ct = c.split(' ');
        const common = qt.filter((t) => t.length > 2 && ct.includes(t)).length;
        if (common >= 1 && (qt.length === 1 || ct.length === 1)) {
          // single-word foods (fruits, veg) should match a one-word query
          score = Math.max(score, 55 + common * 8);
        } else if (common >= 2) {
          score = Math.max(score, 40 + common * 10);
        }
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { food, score };
  }

  return best && best.score >= 55 ? best.food : null;
}
