/**
 * HEALTHY FOODS DATABASE — diabetes-friendly meals the AI coach can
 * recommend and the patient can browse (list + detail screens).
 *
 * Every entry: nutrition per serving, glycemic index, WHY it suits a
 * diabetic (fr + darija/ar), and simple preparation steps (fr + ar).
 * The UI shows ar for the Arabic app language and fr otherwise; names
 * exist in fr/ar/en for search. Compiled for patient education — to be
 * refined with a registered dietitian.
 *
 * The AI chat receives a compact index of this list and links entries
 * with [[food:id]] tokens the chat renders as tappable cards.
 */

export type HealthyCategory =
  | 'breakfast'
  | 'salad'
  | 'soup'
  | 'main'
  | 'seafood'
  | 'snack'
  | 'drink'
  | 'dessert';

export interface HealthyFood {
  id: string;
  name_fr: string;
  name_ar: string;
  name_en: string;
  category: HealthyCategory;
  emoji: string;
  /** Human label of one serving, e.g. "1 assiette (300 g)" */
  serving: string;
  grams: number;
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  /** Glycemic index (low < 55) */
  gi: number;
  why_fr: string;
  why_ar: string;
  steps_fr: string[];
  steps_ar: string[];
  aliases?: string[];
}

export const HEALTHY_CATEGORIES: {
  key: HealthyCategory;
  emoji: string;
  colors: [string, string];
}[] = [
  { key: 'breakfast', emoji: '🌅', colors: ['#fef3c7', '#fde68a'] },
  { key: 'salad', emoji: '🥗', colors: ['#dcfce7', '#bbf7d0'] },
  { key: 'soup', emoji: '🍲', colors: ['#ffedd5', '#fed7aa'] },
  { key: 'main', emoji: '🍽️', colors: ['#e0e7ff', '#c7d2fe'] },
  { key: 'seafood', emoji: '🐟', colors: ['#cffafe', '#a5f3fc'] },
  { key: 'snack', emoji: '🥜', colors: ['#fae8ff', '#f5d0fe'] },
  { key: 'drink', emoji: '🍵', colors: ['#d1fae5', '#a7f3d0'] },
  { key: 'dessert', emoji: '🍓', colors: ['#ffe4e6', '#fecdd3'] },
];

export const HEALTHY_FOODS: HealthyFood[] = [
  /* ───────────── Petit-déjeuner ───────────── */
  {
    id: 'oeufs-avocat',
    name_fr: 'Œufs durs & avocat', name_ar: 'بيض مسلوق مع الأفوكادو', name_en: 'Boiled eggs & avocado',
    category: 'breakfast', emoji: '🥑', serving: '2 œufs + ½ avocat (180 g)', grams: 180,
    calories: 300, carbs: 7, sugar: 1, protein: 15, fat: 24, fiber: 5, gi: 15,
    why_fr: "Presque zéro sucre : la glycémie reste stable toute la matinée. Les bonnes graisses de l'avocat et les protéines des œufs coupent la faim et évitent le grignotage.",
    why_ar: 'تقريباً بلا سكر: السكر فالدم كيبقى مستقر الصباح كامل. الدهون الصحية ديال الأفوكادو والبروتين ديال البيض كيشبعو وكيمنعو التسناك.',
    steps_fr: ['Faites bouillir 2 œufs 9 minutes, puis écalez-les.', 'Coupez ½ avocat en tranches.', 'Ajoutez une pincée de sel, du poivre et un filet de citron.', "Servez avec quelques feuilles de salade ou tomates cerises."],
    steps_ar: ['سلق جوج بيضات 9 دقايق وقشرهم.', 'قطع نص أفوكادو شرائح.', 'زيد شوية ملح وإبزار وعصير الحامض.', 'قدمهم مع شوية خس ولا طماطم صغيرة.'],
    aliases: ['oeuf avocat', 'بيض أفوكادو'],
  },
  {
    id: 'flocons-avoine',
    name_fr: "Flocons d'avoine au lait", name_ar: 'الشوفان بالحليب', name_en: 'Oatmeal with milk',
    category: 'breakfast', emoji: '🥣', serving: '1 bol (250 g)', grams: 250,
    calories: 220, carbs: 32, sugar: 6, protein: 9, fat: 6, fiber: 5, gi: 50,
    why_fr: "L'avoine libère ses glucides LENTEMENT (IG 50) : pas de pic de glycémie comme le pain blanc. Ses fibres bêta-glucane aident aussi à baisser le cholestérol.",
    why_ar: 'الشوفان كيطلق السكريات بشوية بشوية (IG 50): ما كيديرش الطلعة السريعة ديال السكر بحال الخبز الأبيض. الألياف ديالو كينقصو حتى الكوليسترول.',
    steps_fr: ["Versez 40 g de flocons d'avoine dans 200 ml de lait (ou eau).", 'Chauffez 3-4 min à feu doux en remuant.', 'Ajoutez cannelle et quelques noix — PAS de sucre ni miel.', 'Complétez avec quelques fraises ou ½ pomme si envie de sucré.'],
    steps_ar: ['خلط 40 غرام ديال الشوفان مع 200 مل ديال الحليب.', 'سخنو 3-4 دقايق على نار هادية مع التحريك.', 'زيد القرفة وشوية ديال الكركاع — بلا سكر وبلا عسل.', 'إلا بغيتي الحلاوة زيد شوية فريز ولا نص تفاحة.'],
    aliases: ['avoine', 'oats', 'شوفان'],
  },
  {
    id: 'yaourt-noix',
    name_fr: 'Yaourt nature aux noix', name_ar: 'دانون طبيعي بالكركاع', name_en: 'Plain yogurt with walnuts',
    category: 'breakfast', emoji: '🥛', serving: '1 yaourt + 5 noix (160 g)', grams: 160,
    calories: 210, carbs: 10, sugar: 8, protein: 9, fat: 15, fiber: 2, gi: 30,
    why_fr: "Yaourt NATURE (pas aromatisé !) : 3× moins de sucre qu'un yaourt aux fruits. Les noix apportent des oméga-3 qui protègent le cœur — essentiel pour un diabétique.",
    why_ar: 'دانون طبيعي (ماشي معطر!): فيه 3 مرات أقل من السكر من دانون بالفواكه. الكركاع فيه أوميغا 3 اللي كيحمي القلب — مهم بزاف للسكري.',
    steps_fr: ['Prenez un yaourt nature (vérifiez : moins de 6 g de sucre).', 'Concassez 5 cerneaux de noix par-dessus.', 'Ajoutez de la cannelle — jamais de sucre ni confiture.'],
    steps_ar: ['خود دانون طبيعي (تأكد: أقل من 6 غرام سكر).', 'كسر 5 حبات ديال الكركاع فوقو.', 'زيد القرفة — عمرك تزيد سكر ولا كونفيتور.'],
    aliases: ['yaourt', 'danone', 'دانون'],
  },
  {
    id: 'pain-complet-olive',
    name_fr: "Pain complet & huile d'olive", name_ar: 'خبز كامل بزيت الزيتون', name_en: 'Whole-grain bread & olive oil',
    category: 'breakfast', emoji: '🫒', serving: '¼ pain complet + 1 c.s. (95 g)', grams: 95,
    calories: 260, carbs: 30, sugar: 2, protein: 6, fat: 14, fiber: 5, gi: 55,
    why_fr: "Le pain COMPLET (d'orge ou de blé entier) a 2× plus de fibres que le pain blanc : le sucre monte moins vite. L'huile d'olive ralentit encore l'absorption.",
    why_ar: 'الخبز الكامل (ديال الشعير ولا القمح الكامل) فيه ضعف الألياف ديال الخبز الأبيض: السكر كيطلع بشوية. زيت الزيتون كتبطئ الامتصاص أكثر.',
    steps_fr: ['Choisissez un pain complet ou pain d’orge (chaïr).', 'Prenez ¼ de pain maximum, pas plus.', "Trempez dans 1 cuillère d'huile d'olive extra-vierge.", 'Accompagnez de thé SANS sucre ou verre de lben.'],
    steps_ar: ['اختار خبز كامل ولا خبز الشعير.', 'خود غير ربع خبزة، ماشي أكثر.', 'غمسو فمعلقة ديال زيت الزيتون البكر.', 'شرب معاه أتاي بلا سكر ولا كاس ديال اللبن.'],
    aliases: ['khobz chair', 'pain orge', 'خبز الشعير'],
  },
  {
    id: 'fromage-concombre',
    name_fr: 'Fromage frais & concombre', name_ar: 'جبن طري مع الخيار', name_en: 'Fresh cheese & cucumber',
    category: 'breakfast', emoji: '🧀', serving: '100 g fromage + ½ concombre', grams: 200,
    calories: 160, carbs: 8, sugar: 6, protein: 12, fat: 9, fiber: 1, gi: 20,
    why_fr: 'Petit-déjeuner salé quasi sans glucides : idéal quand la glycémie du matin est déjà haute. Protéines rassasiantes, fraîcheur du concombre.',
    why_ar: 'فطور مالح تقريباً بلا نشويات: مثالي ملي كيكون السكر ديال الصباح مرتفع. البروتين كيشبع والخيار منعش.',
    steps_fr: ['Étalez 100 g de fromage frais (type jben) dans une assiette.', 'Coupez ½ concombre en rondelles.', "Arrosez d'huile d'olive, saupoudrez de zaatar ou menthe séchée."],
    steps_ar: ['حط 100 غرام ديال الجبن الطري فطبسيل.', 'قطع نص خيارة دوائر.', 'زيد زيت الزيتون ورش الزعتر ولا النعناع اليابس.'],
    aliases: ['jben', 'جبن'],
  },
  {
    id: 'msemen-complet-light',
    name_fr: 'Msemen à la farine complète (léger)', name_ar: 'مسمن بالدقيق الكامل (خفيف)', name_en: 'Whole-wheat msemen (light)',
    category: 'breakfast', emoji: '🫓', serving: '1 pièce fine (70 g)', grams: 70,
    calories: 170, carbs: 22, sugar: 1, protein: 5, fat: 7, fiber: 3, gi: 55,
    why_fr: 'La version complète et FINE du msemen : moitié moins de gras, fibres doublées. Un plaisir marocain qui reste possible — une seule pièce, sans miel.',
    why_ar: 'النسخة الكاملة والرقيقة ديال المسمن: نص الدهون وضعف الألياف. متعة مغربية ممكنة — وحدة برك، وبلا عسل.',
    steps_fr: ['Préparez la pâte avec ⅔ farine complète, ⅓ semoule fine.', "Étalez très fin, pliez, cuisez à la poêle avec très peu d'huile.", 'Mangez UNE pièce, avec fromage frais ou œuf — jamais miel + beurre.'],
    steps_ar: ['وجد العجين ب ⅔ دقيق كامل و ⅓ سميدة رقيقة.', 'رققو مزيان، طويه، طيبو فالمقلة بشوية ديال الزيت.', 'كول وحدة برك، مع جبن ولا بيضة — عمرك مع عسل وزبدة.'],
    aliases: ['msemen sain'],
  },

  {
    id: 'harcha-avoine',
    name_fr: "Harcha à l'avoine", name_ar: 'حرشة بالشوفان', name_en: 'Oat harcha',
    category: 'breakfast', emoji: '🌕', serving: '1 pièce (80 g)', grams: 80,
    calories: 190, carbs: 24, sugar: 2, protein: 6, fat: 8, fiber: 4, gi: 50,
    why_fr: "La harcha revisitée : moitié semoule, moitié flocons d'avoine. Même goût du bled, mais l'IG chute de 65 à 50 et les fibres doublent. Avec jben, pas avec miel.",
    why_ar: 'الحرشة بطريقة جديدة: نص سميدة ونص شوفان. نفس ذوق البلاد، ولكن المؤشر كيهبط من 65 ل50 والألياف كتضاعف. مع الجبن، ماشي مع العسل.',
    steps_fr: ["Mélangez 60 g de semoule + 60 g de flocons d'avoine mixés.", "Ajoutez 1 c.s. d'huile d'olive, sel, levure et lait pour lier.", 'Cuisez à la poêle à feu doux, 4 min par face.', 'Servez avec fromage frais — jamais miel + beurre.'],
    steps_ar: ['خلط 60 غ سميدة مع 60 غ شوفان مطحون.', 'زيد معلقة زيت زيتون، ملح، خميرة وحليب باش يتلم.', 'طيبها فالمقلة على نار هادية، 4 دقايق لكل جهة.', 'كولها مع الجبن الطري — عمرك مع العسل والزبدة.'],
    aliases: ['harcha', 'حرشة صحية'],
  },
  {
    id: 'batbout-complet',
    name_fr: 'Batbout complet (mini)', name_ar: 'بطبوط بالقمح الكامل (صغير)', name_en: 'Whole-wheat mini batbout',
    category: 'breakfast', emoji: '🫓', serving: '1 mini (50 g)', grams: 50,
    calories: 120, carbs: 22, sugar: 1, protein: 4, fat: 1.5, fiber: 3, gi: 55,
    why_fr: 'Le batbout cuit à la poêle (sans friture) en version farine complète et format MINI : le plaisir du pain marocain chaud, en portion qui ne fait pas exploser la glycémie.',
    why_ar: 'البطبوط مطيب فالمقلة (بلا قلي) بالدقيق الكامل وبحجم صغير: متعة الخبز المغربي السخون، بكمية ما كتفجرش السكر.',
    steps_fr: ['Pétrissez farine complète + levure + sel + eau tiède.', 'Formez des MINI boules (50 g), laissez lever 45 min.', 'Cuisez à la poêle sèche en retournant souvent.', 'Farcissez de légumes, œuf ou fromage — 1 seul mini.'],
    steps_ar: ['عجن دقيق كامل مع الخميرة والملح والماء الدافي.', 'دير كريات صغار (50 غ) وخليهم يخمرو 45 دقيقة.', 'طيبهم فمقلة ناشفة مع التقليب.', 'عمرو بالخضرة ولا البيض ولا الجبن — واحد صغير برك.'],
    aliases: ['batbout', 'بطبوط'],
  },

  /* ───────────── Salades ───────────── */
  {
    id: 'zaalouk',
    name_fr: "Zaalouk d'aubergines", name_ar: 'زعلوك الدنجال', name_en: 'Eggplant zaalouk',
    category: 'salad', emoji: '🍆', serving: '1 portion (200 g)', grams: 200,
    calories: 120, carbs: 12, sugar: 6, protein: 3, fat: 7, fiber: 5, gi: 30,
    why_fr: "Star marocaine anti-diabète : IG très bas, riche en fibres qui freinent le sucre. L'aubergine est l'un des légumes les plus recommandés aux diabétiques.",
    why_ar: 'النجم المغربي ضد السكري: مؤشر جلايسيمي منخفض بزاف، عامر بالألياف اللي كتوقف السكر. الدنجال من أحسن الخضرة للسكري.',
    steps_fr: ['Faites cuire 2 aubergines et 3 tomates à la vapeur ou au four.', "Écrasez-les avec 2 gousses d'ail, cumin, paprika.", "Faites revenir 5 min avec 1 c.s. d'huile d'olive.", 'Terminez par coriandre hachée et un filet de citron.'],
    steps_ar: ['طيب جوج دنجالات و3 طماطمات فالبخار ولا الفرن.', 'هرسهم مع جوج حبات ثوم، كامون وتحميرة.', 'قليهم 5 دقايق مع معلقة زيت الزيتون.', 'زيد القزبر المقطع وعصرة ديال الحامض.'],
    aliases: ['زعلوك', 'zaalouk aubergine'],
  },
  {
    id: 'salade-marocaine',
    name_fr: 'Salade marocaine (tomate-concombre)', name_ar: 'شلاضة مغربية', name_en: 'Moroccan tomato-cucumber salad',
    category: 'salad', emoji: '🥗', serving: '1 assiette (200 g)', grams: 200,
    calories: 90, carbs: 10, sugar: 6, protein: 2, fat: 5, fiber: 3, gi: 25,
    why_fr: 'À VOLONTÉ : presque pas de glucides. Commencez chaque repas par cette salade — les fibres mangées en premier réduisent le pic de glycémie du plat qui suit.',
    why_ar: 'كول منها بلا حساب: تقريباً بلا نشويات. بدا كل ماكلة بهاد الشلاضة — الألياف اللي كتاكل الأول كتنقص طلعة السكر ديال الماكلة اللي موراها.',
    steps_fr: ['Coupez en petits dés : 2 tomates, 1 concombre, ½ oignon.', 'Ajoutez persil et coriandre hachés.', "Assaisonnez : huile d'olive, citron, sel, cumin."],
    steps_ar: ['قطع مكعبات صغار: جوج طماطمات، خيارة، نص بصلة.', 'زيد المعدنوس والقزبر مقطعين.', 'تبل: زيت الزيتون، الحامض، الملح والكامون.'],
    aliases: ['chlada', 'شلاضة'],
  },
  {
    id: 'taktouka',
    name_fr: 'Taktouka (poivrons-tomates)', name_ar: 'تكتوكة', name_en: 'Taktouka (peppers & tomatoes)',
    category: 'salad', emoji: '🫑', serving: '1 portion (200 g)', grams: 200,
    calories: 110, carbs: 11, sugar: 7, protein: 2, fat: 7, fiber: 4, gi: 30,
    why_fr: 'Poivrons grillés + tomates : vitamine C, fibres, très peu de calories. Parfaite en entrée ou en accompagnement à la place des frites ou du riz blanc.',
    why_ar: 'فلفلة مشوية مع الطماطم: فيتامين C، ألياف، وكالوري قليلة. مثالية كمقبلات ولا بلاصة الفريت والروز الأبيض.',
    steps_fr: ['Grillez 3 poivrons verts, pelez-les et coupez-les.', 'Faites fondre 3 tomates pelées avec ail et épices.', "Mélangez le tout 10 min à feu doux avec 1 c.s. d'huile d'olive."],
    steps_ar: ['شوي 3 فلفلات خضرين، قشرهم وقطعهم.', 'ذوب 3 طماطمات مقشرين مع الثوم والعطرية.', 'خلط كلشي 10 دقايق على نار هادية مع معلقة زيت زيتون.'],
    aliases: ['تكتوكة'],
  },
  {
    id: 'salade-carottes',
    name_fr: 'Salade de carottes au cumin', name_ar: 'شلاضة الخيزو بالكامون', name_en: 'Carrot salad with cumin',
    category: 'salad', emoji: '🥕', serving: '1 portion (180 g)', grams: 180,
    calories: 95, carbs: 14, sugar: 8, protein: 2, fat: 4, fiber: 5, gi: 35,
    why_fr: 'Les carottes CUITES puis refroidies ont un IG plus bas qu’on ne croit (35). Beta-carotène pour les yeux — les diabétiques doivent protéger leur rétine.',
    why_ar: 'الخيزو المطيب والمبرد عندو مؤشر جلايسيمي منخفض (35). فيه بيتا كاروتين اللي كيحمي العينين — السكري خاصو يحافظ على الشبكية ديالو.',
    steps_fr: ['Faites cuire 4 carottes en rondelles 10 min à la vapeur.', 'Laissez refroidir (important pour l’IG bas).', 'Assaisonnez : cumin, paprika, ail, citron, huile d’olive, persil.'],
    steps_ar: ['طيب 4 خيزوات دوائر 10 دقايق فالبخار.', 'خليهم يبردو (مهم باش ينقص المؤشر الجلايسيمي).', 'تبل: كامون، تحميرة، ثوم، حامض، زيت الزيتون والمعدنوس.'],
    aliases: ['khizou', 'خيزو'],
  },
  {
    id: 'salade-lentilles',
    name_fr: 'Salade de lentilles froide', name_ar: 'شلاضة العدس الباردة', name_en: 'Cold lentil salad',
    category: 'salad', emoji: '🥙', serving: '1 assiette (250 g)', grams: 250,
    calories: 230, carbs: 30, sugar: 3, protein: 14, fat: 6, fiber: 9, gi: 25,
    why_fr: 'Les lentilles refroidies développent de l’amidon résistant : IG encore plus bas (25). Protéines végétales + fibres = repas complet qui ne fait pas monter le sucre.',
    why_ar: 'العدس المبرد كيطور نشا مقاوم: المؤشر الجلايسيمي كينقص أكثر (25). بروتين نباتي مع الألياف = ماكلة كاملة ما كتطلعش السكر.',
    steps_fr: ['Faites cuire 150 g de lentilles 20 min, égouttez, laissez refroidir.', 'Ajoutez tomate, oignon rouge et persil en petits dés.', 'Vinaigrette : huile d’olive, citron, cumin, sel.'],
    steps_ar: ['طيب 150 غرام ديال العدس 20 دقيقة، صفيه وخليه يبرد.', 'زيد طماطم، بصلة حمراء ومعدنوس مقطعين.', 'التتبيلة: زيت الزيتون، الحامض، الكامون والملح.'],
    aliases: ['lentilles froides'],
  },
  {
    id: 'salade-avocat-thon',
    name_fr: 'Salade avocat-thon', name_ar: 'شلاضة الأفوكادو بالطون', name_en: 'Avocado tuna salad',
    category: 'salad', emoji: '🥑', serving: '1 assiette (250 g)', grams: 250,
    calories: 320, carbs: 9, sugar: 3, protein: 24, fat: 22, fiber: 7, gi: 15,
    why_fr: 'Repas complet quasi sans glucides : parfait le soir quand la glycémie de la journée était haute. Rassasie longtemps grâce aux protéines du thon et aux fibres de l’avocat.',
    why_ar: 'ماكلة كاملة تقريباً بلا نشويات: مثالية فالليل ملي كيكون السكر ديال النهار مرتفع. كتشبع مدة طويلة بفضل بروتين الطون وألياف الأفوكادو.',
    steps_fr: ['Coupez 1 avocat, 1 tomate et ½ concombre en dés.', 'Ajoutez 1 boîte de thon au naturel égoutté.', 'Citron, huile d’olive, sel, poivre — mélangez doucement.'],
    steps_ar: ['قطع أفوكادو، طماطم ونص خيارة مكعبات.', 'زيد علبة طون مصفية (فالماء ماشي الزيت).', 'حامض، زيت زيتون، ملح وإبزار — خلط بشوية.'],
    aliases: ['thon avocat'],
  },

  {
    id: 'bakoula',
    name_fr: 'Bakoula (mauve sautée)', name_ar: 'البقولة', name_en: 'Bakoula (sautéed mallow)',
    category: 'salad', emoji: '🌿', serving: '1 portion (200 g)', grams: 200,
    calories: 110, carbs: 9, sugar: 2, protein: 4, fat: 7, fiber: 6, gi: 20,
    why_fr: 'Le trésor vert des grands-mères : quasi zéro glucide, bourrée de fibres, fer et vitamines. Un des plats marocains les PLUS adaptés au diabète — mangez-en souvent.',
    why_ar: 'الكنز الأخضر ديال الجدات: تقريباً بلا نشويات، عامرة بالألياف والحديد والفيتامينات. من أحسن الماكلات المغربية للسكري — كول منها بزاف.',
    steps_fr: ['Faites cuire la mauve (ou épinards) à la vapeur, hachez-la.', "Faites revenir ail, persil, coriandre dans l'huile d'olive.", 'Ajoutez la bakoula, cumin, paprika, olives et citron confit.', 'Laissez mijoter 10 min à feu doux.'],
    steps_ar: ['طيب البقولة (ولا السبانخ) فالبخار وقطعها.', 'قلي الثوم والمعدنوس والقزبر فزيت الزيتون.', 'زيد البقولة والكامون والتحميرة والزيتون والحامض المصير.', 'خليها تطيب 10 دقايق على نار هادية.'],
    aliases: ['khoubiza', 'بقولة', 'خبيزة'],
  },
  {
    id: 'foul-cumin',
    name_fr: 'Fèves bouillies au cumin (foul)', name_ar: 'الفول المسلوق بالكامون', name_en: 'Boiled fava beans with cumin',
    category: 'salad', emoji: '🫛', serving: '1 bol (200 g)', grams: 200,
    calories: 180, carbs: 24, sugar: 3, protein: 12, fat: 4, fiber: 8, gi: 30,
    why_fr: 'Le foul du souk, version santé : protéines végétales, IG bas, ultra rassasiant. En plat ou en entrée — avec cumin et huile d’olive, sans pain blanc à côté.',
    why_ar: 'الفول ديال السوق، بالنسخة الصحية: بروتين نباتي، مؤشر منخفض، وكيشبع بزاف. طبق ولا مقبلات — بالكامون وزيت الزيتون، بلا خبز أبيض معاه.',
    steps_fr: ['Faites bouillir 200 g de fèves fraîches ou trempées 25 min.', 'Égouttez, arrosez d’huile d’olive et citron.', 'Saupoudrez généreusement de cumin et sel.', 'Mangez chaud, à la cuillère — pas de pain blanc.'],
    steps_ar: ['سلق 200 غرام فول طري ولا منقوع 25 دقيقة.', 'صفيه وزيد زيت الزيتون والحامض.', 'رش الكامون والملح بلا حساب.', 'كولو سخون بالمعلقة — بلا خبز أبيض.'],
    aliases: ['foul', 'fèves', 'الفول'],
  },
  {
    id: 'loubia-khadra-ail',
    name_fr: "Haricots verts sautés à l'ail", name_ar: 'اللوبيا الخضراء المقلية بالثوم', name_en: 'Garlic green beans',
    category: 'salad', emoji: '🫛', serving: '1 portion (200 g)', grams: 200,
    calories: 90, carbs: 10, sugar: 4, protein: 4, fat: 5, fiber: 5, gi: 20,
    why_fr: "L'accompagnement marocain parfait : remplace frites, riz et pâtes à côté de n'importe quel tajine ou grillade. Quasi zéro impact sur la glycémie.",
    why_ar: 'المرافق المغربي المثالي: كيعوض الفريت والروز والمعكرونة مع أي طاجين ولا مشوي. تقريباً بلا تأثير على السكر.',
    steps_fr: ['Équeutez 300 g de haricots verts, cuisez 8 min vapeur.', "Faites revenir 3 gousses d'ail dans l'huile d'olive.", 'Ajoutez les haricots, cumin, paprika, 3 min à feu vif.', 'Filet de citron avant de servir.'],
    steps_ar: ['نقي 300 غرام لوبيا خضراء وطيبها 8 دقايق فالبخار.', 'قلي 3 حبات ثوم فزيت الزيتون.', 'زيد اللوبيا والكامون والتحميرة، 3 دقايق على نار قوية.', 'عصرة حامض قبل التقديم.'],
    aliases: ['haricots verts', 'لوبيا خضرا'],
  },

  /* ───────────── Soupes ───────────── */
  {
    id: 'harira-legere',
    name_fr: 'Harira légère (sans vermicelles)', name_ar: 'حريرة خفيفة (بلا شعرية)', name_en: 'Light harira (no vermicelli)',
    category: 'soup', emoji: '🍲', serving: '1 bol (300 ml)', grams: 300,
    calories: 160, carbs: 22, sugar: 4, protein: 8, fat: 4, fiber: 6, gi: 40,
    why_fr: 'La harira SANS vermicelles ni farine garde tout le bon (lentilles, pois chiches, tomates) et perd ce qui fait grimper la glycémie. Jamais avec dattes + chebakia.',
    why_ar: 'الحريرة بلا شعرية وبلا دقيق كتحتفظ بكل ما هو مزيان (عدس، حمص، طماطم) وكتخسر اللي كيطلع السكر. عمرها مع التمر والشباكية.',
    steps_fr: ['Faites revenir oignon, céleri, coriandre et épices.', 'Ajoutez tomates mixées, 100 g lentilles, 100 g pois chiches trempés.', "Couvrez d'eau, cuisez 40 min — SANS ajouter vermicelles ni farine.", 'Servez avec un filet de citron.'],
    steps_ar: ['قلي البصلة، الكرافس، القزبر والعطرية.', 'زيد الطماطم المطحونة، 100 غ عدس و100 غ حمص منقوع.', 'غطي بالماء وطيب 40 دقيقة — بلا شعرية وبلا تدويرة.', 'قدمها مع عصرة ديال الحامض.'],
    aliases: ['hrira', 'حريرة صحية'],
  },
  {
    id: 'bissara-legere',
    name_fr: 'Bissara (portion raisonnable)', name_ar: 'بيصارة (كمية معقولة)', name_en: 'Bissara (moderate portion)',
    category: 'soup', emoji: '🫘', serving: '1 bol (250 ml)', grams: 250,
    calories: 210, carbs: 28, sugar: 2, protein: 12, fat: 5, fiber: 8, gi: 40,
    why_fr: "Fèves = protéines végétales + fibres, IG modéré. Le piège c'est le PAIN qu'on trempe dedans : limitez-vous à ¼ de pain d'orge et 1 filet d'huile d'olive.",
    why_ar: 'الفول = بروتين نباتي وألياف، مؤشر معتدل. الفخ هو الخبز اللي كنغمسو فيها: اكتفي بربع خبزة شعير وخيط ديال زيت الزيتون.',
    steps_fr: ['Faites cuire 200 g de fèves sèches trempées avec ail et cumin.', 'Mixez avec un peu de leur eau de cuisson.', "Servez avec cumin, paprika et 1 c.c. d'huile d'olive seulement.", "Accompagnez de ¼ de pain d'orge maximum."],
    steps_ar: ['طيب 200 غرام فول يابس منقوع مع الثوم والكامون.', 'اطحنو مع شوية من ماء الطيب.', 'قدمها مع الكامون والتحميرة ومعلقة صغيرة ديال زيت الزيتون.', 'كولها مع ربع خبزة شعير على الأكثر.'],
    aliases: ['bessara', 'بيصارة'],
  },
  {
    id: 'soupe-legumes',
    name_fr: 'Soupe de légumes maison', name_ar: 'صوبة الخضرة ديال الدار', name_en: 'Homemade vegetable soup',
    category: 'soup', emoji: '🥕', serving: '1 bol (300 ml)', grams: 300,
    calories: 110, carbs: 16, sugar: 6, protein: 4, fat: 3, fiber: 5, gi: 30,
    why_fr: 'Le dîner parfait quand la journée a été trop sucrée : chaude, rassasiante, presque sans glucides. Évitez les pommes de terre, gardez courgettes-carottes-poireaux.',
    why_ar: 'العشا المثالي ملي يكون النهار عامر بالسكر: سخونة، كتشبع، وتقريباً بلا نشويات. تجنب البطاطا، خلي القرعة والخيزو والبورو.',
    steps_fr: ['Coupez courgette, carotte, poireau, céleri, tomate.', 'Couvrez d’eau, ajoutez sel, poivre, gingembre.', 'Cuisez 25 min puis mixez (ou laissez en morceaux).', 'Ajoutez coriandre fraîche au moment de servir.'],
    steps_ar: ['قطع القرعة، الخيزو، البورو، الكرافس والطماطم.', 'غطي بالماء وزيد الملح والإبزار والسكينجبير.', 'طيب 25 دقيقة وطحن (ولا خليها قطع).', 'زيد القزبر الطري ملي تقدمها.'],
    aliases: ['soupe khodra'],
  },
  {
    id: 'chorba-poisson',
    name_fr: 'Chorba de poisson', name_ar: 'شوربة الحوت', name_en: 'Fish chorba',
    category: 'soup', emoji: '🐠', serving: '1 bol (300 ml)', grams: 300,
    calories: 170, carbs: 12, sugar: 4, protein: 18, fat: 6, fiber: 3, gi: 25,
    why_fr: 'Protéines de la mer + légumes, presque pas de glucides. Le poisson 2×/semaine est prouvé bénéfique pour le cœur des diabétiques.',
    why_ar: 'بروتين البحر مع الخضرة، تقريباً بلا نشويات. الحوت جوج مرات فالسيمانة مثبت علمياً أنه مفيد لقلب السكري.',
    steps_fr: ['Faites revenir oignon, ail, tomate et épices.', 'Ajoutez 300 g de poisson blanc en morceaux et 1 L d’eau.', 'Ajoutez carotte et céleri, cuisez 20 min.', 'Coriandre et citron pour finir.'],
    steps_ar: ['قلي البصلة والثوم والطماطم والعطرية.', 'زيد 300 غرام حوت أبيض مقطع ولتر ماء.', 'زيد الخيزو والكرافس وطيب 20 دقيقة.', 'كمل بالقزبر والحامض.'],
    aliases: ['soupe poisson', 'شوربة'],
  },

  {
    id: 'tchicha-belboula',
    name_fr: "Tchicha (soupe d'orge)", name_ar: 'التشيشة (حساء الشعير)', name_en: 'Tchicha (barley soup)',
    category: 'soup', emoji: '🌾', serving: '1 bol (300 ml)', grams: 300,
    calories: 170, carbs: 28, sugar: 3, protein: 6, fat: 4, fiber: 6, gi: 45,
    why_fr: "L'orge est la céréale marocaine à l'IG le plus bas : bien meilleure que la semoule de blé. La tchicha du matin ou du soir cale sans faire grimper le sucre.",
    why_ar: 'الشعير هو الحبوب المغربية بأقل مؤشر جلايسيمي: أحسن بكثير من سميدة القمح. تشيشة الصباح ولا العشية كتشبع بلا ما تطلع السكر.',
    steps_fr: ["Faites revenir tomate râpée, ail et épices dans un peu d'huile d'olive.", "Ajoutez 60 g d'orge concassée (tchicha) et 500 ml d'eau.", 'Cuisez 25 min à feu doux en remuant.', 'Cumin et coriandre pour servir.'],
    steps_ar: ['قلي الطماطم المحكوكة والثوم والعطرية فشوية زيت زيتون.', 'زيد 60 غرام تشيشة و500 مل ماء.', 'طيب 25 دقيقة على نار هادية مع التحريك.', 'الكامون والقزبر فالتقديم.'],
    aliases: ['belboula', 'dchicha', 'تشيشة', 'بلبولة'],
  },

  /* ───────────── Plats principaux ───────────── */
  {
    id: 'tajine-poulet-legumes',
    name_fr: 'Tajine de poulet aux légumes', name_ar: 'طاجين الدجاج بالخضرة', name_en: 'Chicken & vegetable tagine',
    category: 'main', emoji: '🍗', serving: '1 assiette (350 g)', grams: 350,
    calories: 330, carbs: 15, sugar: 6, protein: 34, fat: 15, fiber: 5, gi: 35,
    why_fr: "LE plat marocain idéal pour un diabétique : protéines du poulet, légumes à IG bas, cuisson douce. Le secret : beaucoup de légumes, peu d'huile, et ¼ de pain seulement.",
    why_ar: 'الطاجين المغربي المثالي للسكري: بروتين الدجاج، خضرة بمؤشر منخفض، وطيب هادئ. السر: خضرة بزاف، زيت قليلة، وربع خبزة برك.',
    steps_fr: ['Faites dorer 4 morceaux de poulet avec oignon, ail, gingembre, curcuma.', 'Ajoutez courgettes, carottes, haricots verts et tomate.', "Un demi-verre d'eau, couvrez, 45 min à feu doux.", 'Olives et citron confit pour le goût — servez avec ¼ pain.'],
    steps_ar: ['حمر 4 قطع ديال الدجاج مع البصلة والثوم والسكينجبير والخرقوم.', 'زيد القرعة والخيزو واللوبيا الخضراء والطماطم.', 'نص كاس ماء، غطي، و45 دقيقة على نار هادية.', 'الزيتون والحامض المصير للذوق — كول مع ربع خبزة.'],
    aliases: ['tajine djaj', 'طاجين دجاج'],
  },
  {
    id: 'poisson-four',
    name_fr: 'Poisson au four aux légumes', name_ar: 'حوت فالفرن بالخضرة', name_en: 'Oven-baked fish with vegetables',
    category: 'main', emoji: '🐟', serving: '1 portion (350 g)', grams: 350,
    calories: 310, carbs: 14, sugar: 5, protein: 38, fat: 12, fiber: 4, gi: 20,
    why_fr: 'Zéro glucide dans le poisson, cuisson au four sans friture. La chermoula marocaine (coriandre, ail, cumin, citron) donne le goût sans une calorie de trop.',
    why_ar: 'الحوت بلا نشويات، وطيب فالفرن بلا قلي. الشرمولة المغربية (قزبر، ثوم، كامون، حامض) كتعطي الذوق بلا كالوري زايدة.',
    steps_fr: ['Préparez une chermoula : coriandre, ail, cumin, paprika, citron.', 'Badigeonnez 1 dorade ou merlan entier, laissez mariner 30 min.', 'Disposez sur tomates, poivrons et oignons en rondelles.', "Four 200°C pendant 30-35 min."],
    steps_ar: ['وجد الشرمولة: قزبر، ثوم، كامون، تحميرة وحامض.', 'دهن دورادة ولا ميرلان كامل، وخليه يتشرمل 30 دقيقة.', 'حطو فوق طماطم وفلفلة وبصلة دوائر.', 'الفرن 200 درجة لمدة 30-35 دقيقة.'],
    aliases: ['hout four', 'حوت الفرن'],
  },
  {
    id: 'poulet-grille-salade',
    name_fr: 'Poulet grillé & grande salade', name_ar: 'دجاج مشوي مع شلاضة كبيرة', name_en: 'Grilled chicken & big salad',
    category: 'main', emoji: '🥗', serving: '150 g poulet + salade (350 g)', grams: 350,
    calories: 340, carbs: 10, sugar: 5, protein: 40, fat: 16, fiber: 4, gi: 15,
    why_fr: 'Le réflexe "glycémie haute ce midi" : protéines grillées + légumes crus, quasi zéro glucide. La glycémie redescend tranquillement dans l’après-midi.',
    why_ar: 'الحل ملي يكون السكر طالع فالغدا: بروتين مشوي مع خضرة خضراء، تقريباً بلا نشويات. السكر كيهبط بشوية فالعشية.',
    steps_fr: ['Marinez un blanc de poulet : citron, ail, paprika, huile d’olive.', 'Grillez 6-7 min par face.', 'Servez sur une grande salade tomate-concombre-laitue.', 'Pas de pain si la glycémie est haute — la salade suffit.'],
    steps_ar: ['شرمل صدر دجاج: حامض، ثوم، تحميرة وزيت زيتون.', 'شويه 6-7 دقايق على كل جهة.', 'قدمو فوق شلاضة كبيرة: طماطم، خيار وخس.', 'بلا خبز إلا كان السكر طالع — الشلاضة كافية.'],
    aliases: ['poulet grillé'],
  },
  {
    id: 'loubia-light',
    name_fr: 'Loubia à la marocaine (portion contrôlée)', name_ar: 'لوبيا مغربية (كمية مضبوطة)', name_en: 'Moroccan white beans (controlled portion)',
    category: 'main', emoji: '🫘', serving: '1 petite assiette (250 g)', grams: 250,
    calories: 270, carbs: 36, sugar: 4, protein: 13, fat: 7, fiber: 10, gi: 35,
    why_fr: 'Les haricots blancs ont un IG bas (35) malgré leurs glucides : les fibres freinent tout. La règle : petite assiette, pas de pain avec (le plat EST le féculent).',
    why_ar: 'اللوبيا عندها مؤشر منخفض (35) رغم النشويات: الألياف كتوقف كلشي. القاعدة: طبسيل صغير، وبلا خبز معاها (هي بوحدها النشويات).',
    steps_fr: ['Trempez 200 g de haricots blancs la veille.', 'Cuisez avec tomate, ail, cumin, paprika et 1 c.s. d’huile d’olive.', '1 h à feu doux — la sauce doit rester légère.', 'Une PETITE assiette, sans pain, avec salade en entrée.'],
    steps_ar: ['نقع 200 غرام لوبيا الليلة اللي قبل.', 'طيبها مع الطماطم والثوم والكامون والتحميرة ومعلقة زيت زيتون.', 'ساعة على نار هادية — الصلصة تبقى خفيفة.', 'طبسيل صغير، بلا خبز، مع شلاضة قبل منها.'],
    aliases: ['loubia', 'لوبيا'],
  },
  {
    id: 'adass-marocain',
    name_fr: 'Lentilles à la marocaine', name_ar: 'العدس المغربي', name_en: 'Moroccan lentils',
    category: 'main', emoji: '🥣', serving: '1 assiette (280 g)', grams: 280,
    calories: 280, carbs: 38, sugar: 4, protein: 16, fat: 5, fiber: 11, gi: 30,
    why_fr: 'IG 30 seulement : les lentilles sont LE féculent du diabétique. Fer, protéines, fibres — un plat complet qui stabilise la glycémie pendant des heures.',
    why_ar: 'مؤشر 30 برك: العدس هو النشويات ديال السكري. حديد، بروتين، ألياف — ماكلة كاملة كتثبت السكر ساعات.',
    steps_fr: ['Faites revenir oignon, ail, tomate râpée et épices.', 'Ajoutez 200 g de lentilles et couvrez d’eau.', 'Cuisez 30 min ; ajoutez coriandre en fin de cuisson.', 'Servez sans pain ou avec ¼ de pain d’orge.'],
    steps_ar: ['قلي البصلة والثوم والطماطم المحكوكة والعطرية.', 'زيد 200 غرام عدس وغطي بالماء.', 'طيب 30 دقيقة؛ وزيد القزبر فالآخر.', 'كول بلا خبز ولا مع ربع خبزة شعير.'],
    aliases: ['adass', '3ades', 'عدس'],
  },
  {
    id: 'tajine-kefta-dinde',
    name_fr: 'Tajine de kefta de dinde (léger)', name_ar: 'طاجين كفتة البيبي (خفيف)', name_en: 'Light turkey kefta tagine',
    category: 'main', emoji: '🍳', serving: '1 assiette (300 g)', grams: 300,
    calories: 320, carbs: 10, sugar: 5, protein: 32, fat: 18, fiber: 3, gi: 25,
    why_fr: 'La kefta de DINDE a 2× moins de gras saturé que le bœuf haché gras. Même plaisir, sauce tomate maison, un œuf — et le cœur vous dit merci.',
    why_ar: 'كفتة البيبي فيها نص الدهون المشبعة ديال الكفتة الحمراء. نفس البنة، صلصة طماطم ديال الدار، وبيضة — والقلب كيشكرك.',
    steps_fr: ['Mélangez 300 g de dinde hachée avec persil, cumin, paprika.', 'Formez des boulettes, dorez-les rapidement.', 'Plongez dans une sauce tomate-ail-oignon, 20 min à feu doux.', 'Cassez 1-2 œufs dessus en fin de cuisson.'],
    steps_ar: ['خلط 300 غرام بيبي مفروم مع المعدنوس والكامون والتحميرة.', 'دير كريات وحمرهم دغيا.', 'حطهم فصلصة طماطم وثوم وبصلة، 20 دقيقة نار هادية.', 'كسر بيضة ولا جوج فوقهم فالآخر.'],
    aliases: ['kefta dinde'],
  },
  {
    id: 'brochettes-poulet',
    name_fr: 'Brochettes de poulet marinées', name_ar: 'قطبان الدجاج المشرملين', name_en: 'Marinated chicken skewers',
    category: 'main', emoji: '🍢', serving: '3 brochettes (200 g)', grams: 200,
    calories: 280, carbs: 4, sugar: 2, protein: 40, fat: 12, fiber: 1, gi: 10,
    why_fr: 'Le grill = zéro friture. Protéines pures, presque pas de glucides. Accompagnez de salade ou légumes grillés — pas de frites.',
    why_ar: 'الشوي = بلا قلي. بروتين صافي وتقريباً بلا نشويات. كول معاهم شلاضة ولا خضرة مشوية — ماشي فريت.',
    steps_fr: ['Coupez 2 blancs de poulet en cubes.', 'Marinez 1 h : yaourt nature, citron, ail, cumin, paprika.', 'Enfilez sur brochettes, grillez 10-12 min en tournant.', 'Servez avec taktouka ou salade — jamais de frites.'],
    steps_ar: ['قطع جوج صدور دجاج مكعبات.', 'شرملهم ساعة: دانون طبيعي، حامض، ثوم، كامون وتحميرة.', 'دخلهم فالقطبان وشويهم 10-12 دقيقة مع التقليب.', 'كولهم مع تكتوكة ولا شلاضة — عمرك مع الفريت.'],
    aliases: ['qotban', 'قطبان'],
  },
  {
    id: 'courgettes-farcies',
    name_fr: 'Courgettes farcies à la viande maigre', name_ar: 'قرعة معمرة باللحم المزوق', name_en: 'Zucchini stuffed with lean meat',
    category: 'main', emoji: '🥒', serving: '2 courgettes (350 g)', grams: 350,
    calories: 290, carbs: 14, sugar: 7, protein: 28, fat: 14, fiber: 4, gi: 25,
    why_fr: 'La courgette remplace le riz ou les pâtes comme "contenant" : mêmes saveurs, 4× moins de glucides. Le plat familial qui ne fait pas exploser la glycémie.',
    why_ar: 'القرعة كتعوض الروز والمعكرونة: نفس البنة، بأربع مرات أقل نشويات. الماكلة العائلية اللي ما كتفجرش السكر.',
    steps_fr: ['Évidez 4 demi-courgettes.', 'Farcissez de viande hachée maigre + oignon + persil + épices.', 'Rangez dans un plat, sauce tomate légère par-dessus.', 'Four 180°C pendant 35 min.'],
    steps_ar: ['خوي 4 نصاص ديال القرعة.', 'عمرهم بلحم مفروم مزوق مع البصلة والمعدنوس والعطرية.', 'رتبهم فطبق، وزيد صلصة طماطم خفيفة فوقهم.', 'الفرن 180 درجة لمدة 35 دقيقة.'],
    aliases: ['courgette farcie'],
  },
  {
    id: 'omelette-legumes',
    name_fr: 'Omelette aux légumes', name_ar: 'أملیت بالخضرة', name_en: 'Vegetable omelet',
    category: 'main', emoji: '🍳', serving: '3 œufs + légumes (250 g)', grams: 250,
    calories: 290, carbs: 8, sugar: 4, protein: 21, fat: 20, fiber: 3, gi: 15,
    why_fr: 'Dîner express (10 min) sans glucides : les œufs ne font PAS monter la glycémie. Poivrons, tomates et oignons pour les vitamines.',
    why_ar: 'عشا سريع (10 دقايق) بلا نشويات: البيض ما كيطلعش السكر. الفلفلة والطماطم والبصلة للفيتامينات.',
    steps_fr: ['Faites revenir poivron, tomate et oignon 5 min.', 'Battez 3 œufs, versez sur les légumes.', 'Cuisez à feu doux, repliez. Herbes fraîches par-dessus.'],
    steps_ar: ['قلي الفلفلة والطماطم والبصلة 5 دقايق.', 'خفق 3 بيضات وصبهم فوق الخضرة.', 'طيب على نار هادية وطوي. زيد الأعشاب الطرية فوق.'],
    aliases: ['omelette'],
  },
  {
    id: 'quinoa-legumes',
    name_fr: 'Quinoa aux légumes (alternative au couscous)', name_ar: 'الكينوا بالخضرة (بديل الكسكس)', name_en: 'Quinoa with vegetables (couscous alternative)',
    category: 'main', emoji: '🌾', serving: '1 assiette (300 g)', grams: 300,
    calories: 320, carbs: 42, sugar: 6, protein: 12, fat: 10, fiber: 7, gi: 40,
    why_fr: 'Le "couscous" nouvelle génération : IG 40 contre 65 pour la semoule. Mêmes légumes, même vapeur, mais une glycémie beaucoup plus douce le vendredi.',
    why_ar: '"الكسكس" ديال الجيل الجديد: مؤشر 40 مقابل 65 ديال السميدة. نفس الخضرة ونفس البخار، ولكن سكر هادئ بزاف نهار الجمعة.',
    steps_fr: ['Rincez 150 g de quinoa, cuisez 12 min dans 2 volumes d’eau.', 'Préparez les légumes du couscous : carottes, courgettes, navets, pois chiches.', 'Servez le quinoa en dôme avec les légumes et leur bouillon dessus.'],
    steps_ar: ['غسل 150 غرام كينوا وطيبها 12 دقيقة فجوج كيسان ماء.', 'وجد خضرة الكسكس: خيزو، قرعة، لفت وحمص.', 'قدم الكينوا بحال الكسكس مع الخضرة والمرقة فوقها.'],
    aliases: ['quinoa'],
  },
  {
    id: 'steak-haricots-verts',
    name_fr: 'Steak grillé & haricots verts', name_ar: 'ستيك مشوي مع اللوبيا الخضراء', name_en: 'Grilled steak & green beans',
    category: 'main', emoji: '🥩', serving: '150 g steak + 200 g haricots', grams: 350,
    calories: 360, carbs: 9, sugar: 4, protein: 42, fat: 17, fiber: 5, gi: 15,
    why_fr: 'Viande rouge MAIGRE 1-2×/semaine, c’est permis : fer et B12. Les haricots verts sautés à l’ail remplacent parfaitement frites et purée.',
    why_ar: 'اللحم الأحمر المزوق مرة ولا جوج فالسيمانة مسموح: حديد وB12. اللوبيا الخضراء المقلية بالثوم كتعوض الفريت والبطاطا.',
    steps_fr: ['Sortez le steak 15 min avant, salez-poivrez.', 'Grillez 2-3 min par face selon l’épaisseur.', 'Faites sauter les haricots verts vapeur avec ail et huile d’olive.', 'Laissez reposer la viande 3 min avant de servir.'],
    steps_ar: ['خرج الستيك 15 دقيقة قبل، وزيد الملح والإبزار.', 'شويه 2-3 دقايق على كل جهة.', 'قلي اللوبيا الخضراء المبخرة مع الثوم وزيت الزيتون.', 'خلي اللحم يرتاح 3 دقايق قبل التقديم.'],
    aliases: ['steak'],
  },

  {
    id: 'couscous-belboula',
    name_fr: "Couscous d'orge (belboula) aux légumes", name_ar: 'كسكس بلبولة بالخضرة', name_en: 'Barley couscous with vegetables',
    category: 'main', emoji: '🥘', serving: '1 assiette moyenne (300 g)', grams: 300,
    calories: 380, carbs: 55, sugar: 8, protein: 13, fat: 9, fiber: 9, gi: 50,
    why_fr: "Le vendredi reste sacré ! La belboula (orge) a un IG bien plus bas que la semoule blanche (50 vs 65), et 2× plus de fibres. Assiette MOYENNE, beaucoup de légumes, peu de grains.",
    why_ar: 'الجمعة كتبقى مقدسة! البلبولة (الشعير) عندها مؤشر أقل بكثير من السميدة البيضاء (50 مقابل 65)، وضعف الألياف. طبسيل متوسط، خضرة بزاف، وشوية ديال الكسكس.',
    steps_fr: ["Cuisez la belboula à la vapeur comme un couscous classique (2 passages).", 'Préparez un bouillon riche en légumes : courgettes, carottes, navets, chou, pois chiches.', 'Servez : ⅓ de grains, ⅔ de légumes — arrosez de bouillon.', 'Évitez le sucre-oignons caramélisés (tfaya) et le raisin sec.'],
    steps_ar: ['بخر البلبولة بحال الكسكس العادي (جوج تبخيرات).', 'وجد مرقة عامرة بالخضرة: قرعة، خيزو، لفت، كرومب وحمص.', 'التقديم: ثلث كسكس وثلثين خضرة — وزيد المرقة.', 'تجنب التفاية بالسكر والزبيب.'],
    aliases: ['belboula', 'couscous orge', 'بلبولة'],
  },
  {
    id: 'kebda-mchermla',
    name_fr: 'Foie mchermel (kebda)', name_ar: 'الكبدة المشرملة', name_en: 'Chermoula liver (kebda)',
    category: 'main', emoji: '🥩', serving: '1 portion (150 g)', grams: 150,
    calories: 240, carbs: 6, sugar: 2, protein: 32, fat: 10, fiber: 1, gi: 10,
    why_fr: "La kebda est une bombe de fer et de vitamine B12 — parfaite contre la fatigue du diabétique — avec quasi zéro glucide. Poêlée, pas frite, 1×/semaine.",
    why_ar: 'الكبدة قنبلة ديال الحديد وفيتامين B12 — مثالية ضد التعب ديال السكري — وتقريباً بلا نشويات. فالمقلة، ماشي مقلية فالزيت، مرة فالسيمانة.',
    steps_fr: ['Coupez 200 g de foie en lamelles.', 'Marinez 20 min : ail, cumin, paprika, coriandre, citron.', "Saisissez 3-4 min dans 1 c.s. d'huile d'olive — le foie doit rester rosé.", 'Servez avec salade ou légumes, pas de frites.'],
    steps_ar: ['قطع 200 غرام كبدة شرائح.', 'شرملها 20 دقيقة: ثوم، كامون، تحميرة، قزبر وحامض.', 'اقليها 3-4 دقايق فمعلقة زيت زيتون — الكبدة تبقى وردية.', 'كولها مع شلاضة ولا خضرة، بلا فريت.'],
    aliases: ['kebda', 'foie', 'كبدة'],
  },
  {
    id: 'poulet-roti-four',
    name_fr: 'Poulet rôti au four (sans peau)', name_ar: 'دجاج محمر فالفرن (بلا جلدة)', name_en: 'Oven-roasted chicken (skinless)',
    category: 'main', emoji: '🍗', serving: '1 cuisse + légumes (300 g)', grams: 300,
    calories: 310, carbs: 9, sugar: 4, protein: 38, fat: 14, fiber: 3, gi: 15,
    why_fr: "Le djaj m'hamer des fêtes, version santé : au four avec citron confit et olives, SANS la peau (là où se cache le gras). Le goût du Maroc, la glycémie en paix.",
    why_ar: 'دجاج محمر ديال الأعراس، بالنسخة الصحية: فالفرن مع الحامض المصير والزيتون، بلا الجلدة (فين مخبية الدهون). ذوق المغرب، والسكر هاني.',
    steps_fr: ['Frottez le poulet : ail, gingembre, curcuma, citron, un peu de smen ou huile d’olive.', 'Entourez d’oignons, citron confit et olives.', 'Four 200°C environ 1 h en arrosant.', 'RETIREZ la peau avant de manger ; légumes ou salade à côté.'],
    steps_ar: ['دلك الدجاج: ثوم، سكينجبير، خرقوم، حامض وشوية سمن ولا زيت زيتون.', 'حوطو بالبصلة والحامض المصير والزيتون.', 'الفرن 200 درجة حوالي ساعة مع السقي.', 'حيد الجلدة قبل الماكلة؛ وخضرة ولا شلاضة معاه.'],
    aliases: ['djaj mhamer', 'دجاج محمر'],
  },
  {
    id: 'choufleur-mchermel',
    name_fr: 'Chou-fleur rôti mchermel', name_ar: 'الشيفلور المحمر المشرمل', name_en: 'Roasted chermoula cauliflower',
    category: 'main', emoji: '🥦', serving: '1 portion (250 g)', grams: 250,
    calories: 140, carbs: 12, sugar: 5, protein: 5, fat: 8, fiber: 6, gi: 15,
    why_fr: 'Rôti au four avec chermoula, le chou-fleur devient doré et savoureux — un "faux couscous" ou un accompagnement à volonté, avec 5× moins de glucides que le riz.',
    why_ar: 'محمر فالفرن بالشرمولة، الشيفلور كيولي مذهب وبنين — "كسكس مزور" ولا مرافق بلا حساب، ب5 مرات أقل نشويات من الروز.',
    steps_fr: ['Détaillez un chou-fleur en bouquets.', 'Enrobez de chermoula (ail, cumin, paprika, coriandre, huile d’olive).', 'Four 210°C, 25-30 min jusqu’à coloration.', 'En accompagnement, ou mixé cru en "semoule" vapeur 5 min.'],
    steps_ar: ['قطع الشيفلور زهرات.', 'غلفو بالشرمولة (ثوم، كامون، تحميرة، قزبر وزيت زيتون).', 'الفرن 210 درجة، 25-30 دقيقة حتى يتحمر.', 'مرافق، ولا مطحون خضر بحال السميدة ومبخر 5 دقايق.'],
    aliases: ['choufleur', 'شيفلور'],
  },

  /* ───────────── Poissons & mer ───────────── */
  {
    id: 'sardines-grillees',
    name_fr: 'Sardines grillées', name_ar: 'سردين مشوي', name_en: 'Grilled sardines',
    category: 'seafood', emoji: '🐟', serving: '4 sardines (200 g)', grams: 200,
    calories: 320, carbs: 2, sugar: 0, protein: 38, fat: 18, fiber: 0, gi: 5,
    why_fr: 'Le trésor marocain : oméga-3 au plus haut niveau, prix mini. Protège le cœur et les vaisseaux — exactement ce que le diabète attaque. 2×/semaine, grillées pas frites.',
    why_ar: 'الكنز المغربي: أوميغا 3 فأعلى مستوى وبثمن رخيص. كيحمي القلب والشرايين — بالضبط اللي كيهاجم السكري. جوج مرات فالسيمانة، مشوي ماشي مقلي.',
    steps_fr: ['Videz et rincez les sardines fraîches.', 'Frottez de chermoula légère (coriandre, ail, cumin, citron).', 'Grillez 3-4 min par face sur braise ou plancha.', 'Servez avec salade marocaine et citron.'],
    steps_ar: ['نقي وغسل السردين الطري.', 'دهنو بشرمولة خفيفة (قزبر، ثوم، كامون وحامض).', 'شويه 3-4 دقايق على كل جهة فوق الجمر ولا البلانشة.', 'قدمو مع شلاضة مغربية والحامض.'],
    aliases: ['sardine', 'سردين'],
  },
  {
    id: 'sardines-chermoula-four',
    name_fr: 'Sardines chermoula au four', name_ar: 'سردين بالشرمولة فالفرن', name_en: 'Oven chermoula sardines',
    category: 'seafood', emoji: '🔥', serving: '1 portion (220 g)', grams: 220,
    calories: 300, carbs: 4, sugar: 1, protein: 36, fat: 16, fiber: 1, gi: 10,
    why_fr: 'La version "sans odeur de friture" : même oméga-3, moins de gras ajouté. En papillote, le poisson reste moelleux sans une goutte d’huile de friture.',
    why_ar: 'النسخة بلا ريحة القلي: نفس الأوميغا 3 بدهون أقل. فالبابيوط، الحوت كيبقى رطب بلا قطرة زيت قلي.',
    steps_fr: ['Ouvrez les sardines en portefeuille, tartinez de chermoula.', 'Refermez deux par deux, posez sur papier cuisson.', 'Four 200°C, 15 min.', 'Citron et salade verte pour accompagner.'],
    steps_ar: ['حل السردين، ودهنو بالشرمولة.', 'سدهم جوج بجوج وحطهم فوق ورق الفرن.', 'الفرن 200 درجة، 15 دقيقة.', 'الحامض وشلاضة خضراء معاهم.'],
    aliases: ['sardine four'],
  },
  {
    id: 'maquereau-grille',
    name_fr: 'Maquereau grillé', name_ar: 'الكابايلا المشوية', name_en: 'Grilled mackerel',
    category: 'seafood', emoji: '🎣', serving: '1 poisson (250 g)', grams: 250,
    calories: 340, carbs: 1, sugar: 0, protein: 40, fat: 20, fiber: 0, gi: 5,
    why_fr: 'Encore plus riche en oméga-3 que la sardine. Zéro glucide : la glycémie ne bouge pas. Vitamine D en bonus, souvent basse chez les diabétiques.',
    why_ar: 'فيه أوميغا 3 أكثر من السردين. بلا نشويات: السكر ما كيتحركش. وفيتامين D زيادة، اللي غالباً ناقص عند السكري.',
    steps_fr: ['Entaillez le maquereau, salez et citronnez.', 'Grillez 5-6 min par face.', 'Servez avec zaalouk ou légumes grillés.'],
    steps_ar: ['شرط الكابايلا وزيد الملح والحامض.', 'شويها 5-6 دقايق على كل جهة.', 'قدمها مع الزعلوك ولا خضرة مشوية.'],
    aliases: ['maquereau', 'كابايلا'],
  },
  {
    id: 'crevettes-ail',
    name_fr: "Crevettes sautées à l'ail", name_ar: 'القمرون المقلي بالثوم', name_en: 'Garlic sautéed shrimp',
    category: 'seafood', emoji: '🦐', serving: '1 portion (200 g)', grams: 200,
    calories: 200, carbs: 3, sugar: 0, protein: 32, fat: 7, fiber: 0, gi: 5,
    why_fr: 'Ultra-protéinées, ultra-légères : 200 kcal le plat. Prêtes en 5 minutes, elles dépannent les soirs pressés sans toucher à la glycémie.',
    why_ar: 'بروتين عالي وخفاف بزاف: 200 كالوري فالطبق. واجدين ف5 دقايق، كيسدو الحاجة فليالي الزربة بلا ما يهزو السكر.',
    steps_fr: ["Chauffez 1 c.s. d'huile d'olive avec 3 gousses d'ail émincées.", 'Ajoutez 250 g de crevettes décortiquées.', 'Sautez 4-5 min, paprika et persil pour finir.', 'Servez avec salade ou légumes vapeur.'],
    steps_ar: ['سخن معلقة زيت زيتون مع 3 حبات ثوم مقطعين.', 'زيد 250 غرام قمرون مقشر.', 'قليهم 4-5 دقايق، وكمل بالتحميرة والمعدنوس.', 'قدمهم مع شلاضة ولا خضرة مبخرة.'],
    aliases: ['crevettes', 'قمرون'],
  },
  {
    id: 'thon-salade-complete',
    name_fr: 'Assiette complète au thon', name_ar: 'طبق كامل بالطون', name_en: 'Complete tuna plate',
    category: 'seafood', emoji: '🥫', serving: '1 assiette (300 g)', grams: 300,
    calories: 290, carbs: 12, sugar: 4, protein: 34, fat: 12, fiber: 5, gi: 20,
    why_fr: 'Le déjeuner de secours : une boîte de thon AU NATUREL, des légumes, un œuf dur. Zéro cuisine, zéro pic de glycémie au travail.',
    why_ar: 'غدا الإنقاذ: علبة طون فالماء، خضرة، وبيضة مسلوقة. بلا طياب وبلا طلعة سكر فالخدمة.',
    steps_fr: ['Égouttez une boîte de thon au naturel (pas à l’huile).', 'Ajoutez tomates, concombre, ½ poivron, olives.', '1 œuf dur, filet d’huile d’olive et citron.'],
    steps_ar: ['صفي علبة طون فالماء (ماشي فالزيت).', 'زيد الطماطم والخيار ونص فلفلة والزيتون.', 'بيضة مسلوقة، خيط زيت زيتون والحامض.'],
    aliases: ['thon'],
  },

  {
    id: 'tajine-kwar-sardine',
    name_fr: 'Tajine de boulettes de sardines', name_ar: 'طاجين كوار السردين', name_en: 'Sardine ball tagine',
    category: 'seafood', emoji: '🍲', serving: '1 assiette (300 g)', grams: 300,
    calories: 310, carbs: 12, sugar: 6, protein: 30, fat: 16, fiber: 3, gi: 25,
    why_fr: "Le plat doukkali par excellence : les oméga-3 de la sardine dans une sauce tomate épicée, presque sans glucides. Un des meilleurs tajines possibles pour un diabétique.",
    why_ar: 'الطبق الدكالي بامتياز: أوميغا 3 ديال السردين فصلصة طماطم حارة، تقريباً بلا نشويات. من أحسن الطواجن الممكنة للسكري.',
    steps_fr: ['Hachez la chair de sardines avec riz TRÈS réduit ou sans, ail, cumin, paprika, coriandre.', 'Formez des boulettes (kwar).', 'Plongez dans une sauce tomate-poivron-ail qui mijote.', '15 min à feu doux — piment selon le goût.'],
    steps_ar: ['اطحن لحم السردين مع الثوم والكامون والتحميرة والقزبر (بلا روز ولا شوية برك).', 'دير الكوار.', 'حطهم فصلصة طماطم وفلفلة وثوم كتغلي.', '15 دقيقة على نار هادية — والفلفلة الحارة على حسب الذوق.'],
    aliases: ['kwar sardine', 'boulettes sardine', 'كوار'],
  },

  /* ───────────── Collations ───────────── */
  {
    id: 'amandes',
    name_fr: "Poignée d'amandes", name_ar: 'قبضة ديال اللوز', name_en: 'Handful of almonds',
    category: 'snack', emoji: '🌰', serving: '15 amandes (20 g)', grams: 20,
    calories: 120, carbs: 4, sugar: 1, protein: 4, fat: 10, fiber: 3, gi: 15,
    why_fr: 'LA collation du diabétique : coupe la faim sans toucher la glycémie, magnésium qui améliore la sensibilité à l’insuline. 15 amandes, pas le paquet !',
    why_ar: 'السناك ديال السكري: كيقطع الجوع بلا ما يهز السكر، وفيه المغنيزيوم اللي كيحسن حساسية الأنسولين. 15 حبة، ماشي الكيس كامل!',
    steps_fr: ['Choisissez des amandes NATURE, ni salées ni grillées au sucre.', 'Comptez-en 15 (une petite poignée).', 'Idéal vers 11 h ou 17 h quand la faim arrive.'],
    steps_ar: ['اختار اللوز الطبيعي، لا مملح لا محمر بالسكر.', 'حسب 15 حبة (قبضة صغيرة).', 'مثالي مع 11 ولا 5 ملي كيجي الجوع.'],
    aliases: ['amande', 'لوز'],
  },
  {
    id: 'pomme-beurre-cacahuete',
    name_fr: 'Pomme & purée de cacahuètes', name_ar: 'تفاحة مع زبدة الكاوكاو', name_en: 'Apple & peanut butter',
    category: 'snack', emoji: '🍎', serving: '1 pomme + 1 c.s. (170 g)', grams: 170,
    calories: 180, carbs: 25, sugar: 18, protein: 4, fat: 8, fiber: 4, gi: 38,
    why_fr: 'La pomme ENTIÈRE (jamais en jus !) a un IG bas grâce à ses fibres. La purée de cacahuète sans sucre ralentit encore l’absorption. Le goûter parfait.',
    why_ar: 'التفاحة الكاملة (ماشي عصير!) عندها مؤشر منخفض بفضل الألياف. زبدة الكاوكاو بلا سكر كتبطئ الامتصاص أكثر. اللمجة المثالية.',
    steps_fr: ['Coupez 1 pomme en quartiers, avec la peau.', 'Tartinez chaque quartier d’un peu de purée de cacahuètes 100 % (sans sucre ajouté).'],
    steps_ar: ['قطع تفاحة أرباع، بالجلدة ديالها.', 'دهن كل ربع بشوية ديال زبدة الكاوكاو 100% (بلا سكر مزيود).'],
    aliases: ['pomme'],
  },
  {
    id: 'hoummos-batonnets',
    name_fr: 'Houmous & bâtonnets de légumes', name_ar: 'حمص متحون مع عيدان الخضرة', name_en: 'Hummus & veggie sticks',
    category: 'snack', emoji: '🥕', serving: '3 c.s. + légumes (150 g)', grams: 150,
    calories: 160, carbs: 14, sugar: 4, protein: 6, fat: 9, fiber: 5, gi: 25,
    why_fr: 'Pois chiches mixés = IG 25. Trempez carottes et concombres dedans au lieu du pain : croquant, rassasiant, glycémie plate.',
    why_ar: 'الحمص المطحون = مؤشر 25. غمس الخيزو والخيار فيه بلاصة الخبز: مقرمش، مشبع، والسكر مستقر.',
    steps_fr: ['Mixez 200 g de pois chiches cuits avec citron, ail, 1 c.s. tahina.', 'Détendez avec un peu d’eau, huile d’olive et cumin dessus.', 'Servez avec bâtonnets de carotte, concombre et poivron.'],
    steps_ar: ['طحن 200 غرام حمص مطيب مع الحامض والثوم ومعلقة طحينة.', 'رطبو بشوية ماء، وزيد زيت الزيتون والكامون فوقو.', 'قدمو مع عيدان الخيزو والخيار والفلفلة.'],
    aliases: ['houmous', 'حمص'],
  },
  {
    id: 'oeuf-dur-snack',
    name_fr: 'Œuf dur (encas)', name_ar: 'بيضة مسلوقة (لمجة)', name_en: 'Hard-boiled egg (snack)',
    category: 'snack', emoji: '🥚', serving: '1 œuf (50 g)', grams: 50,
    calories: 78, carbs: 0.5, sugar: 0.5, protein: 6, fat: 5, fiber: 0, gi: 0,
    why_fr: 'Zéro glucide, 78 kcal, rassasiant : l’encas de secours à toujours avoir au frigo. Aucune excuse pour les biscuits.',
    why_ar: 'بلا نشويات، 78 كالوري، وكيشبع: لمجة الإنقاذ اللي خاصها تكون ديما فالتلاجة. ما بقاش عذر للبيسكوي.',
    steps_fr: ['Faites bouillir 6 œufs 9 min le dimanche.', 'Gardez-les au frigo dans leur coquille (1 semaine).', '1 œuf + pincée de sel-cumin quand la faim frappe.'],
    steps_ar: ['سلق 6 بيضات 9 دقايق نهار الحد.', 'خبيهم فالتلاجة بالقشرة (سيمانة).', 'بيضة مع شوية ملح وكامون ملي يضربك الجوع.'],
    aliases: ['oeuf dur'],
  },
  {
    id: 'fruits-rouges-yaourt',
    name_fr: 'Fruits rouges & yaourt grec', name_ar: 'التوت مع الياغورت اليوناني', name_en: 'Berries & Greek yogurt',
    category: 'snack', emoji: '🫐', serving: '100 g fruits + 100 g yaourt', grams: 200,
    calories: 150, carbs: 14, sugar: 10, protein: 10, fat: 6, fiber: 4, gi: 25,
    why_fr: 'Fraises, framboises, myrtilles : les fruits les MOINS sucrés qui existent. Avec le yaourt grec protéiné, le dessert-plaisir sans remords.',
    why_ar: 'الفريز والتوت: الفواكه الأقل سكر اللي كاينين. مع الياغورت اليوناني الغني بالبروتين، حلوى بلا ندم.',
    steps_fr: ['Versez 100 g de yaourt grec nature dans un bol.', 'Ajoutez 100 g de fraises ou myrtilles.', 'Cannelle ou quelques amandes effilées pour finir.'],
    steps_ar: ['صب 100 غرام ياغورت يوناني طبيعي فبول.', 'زيد 100 غرام فريز ولا توت.', 'كمل بالقرفة ولا شوية لوز مقطع.'],
    aliases: ['fruits rouges'],
  },
  {
    id: 'lben-verre',
    name_fr: 'Verre de lben', name_ar: 'كاس ديال اللبن', name_en: 'Glass of lben (buttermilk)',
    category: 'snack', emoji: '🥛', serving: '1 verre (250 ml)', grams: 250,
    calories: 95, carbs: 12, sugar: 12, protein: 8, fat: 2, fiber: 0, gi: 30,
    why_fr: 'Le lben traditionnel est naturellement pauvre en gras et son lactose a un IG bas. Bien meilleur que n’importe quel jus ou soda avec le repas.',
    why_ar: 'اللبن التقليدي قليل الدهون طبيعياً والسكر ديالو عندو مؤشر منخفض. أحسن بكثير من أي عصير ولا مونادا مع الماكلة.',
    steps_fr: ['Choisissez un lben nature, sans sucre ajouté.', 'Un verre avec le repas remplace jus et sodas.'],
    steps_ar: ['اختار لبن طبيعي بلا سكر مزيود.', 'كاس مع الماكلة كيعوض العصير والمونادا.'],
    aliases: ['lben', 'لبن', 'raib'],
  },

  {
    id: 'zitoun',
    name_fr: 'Olives (poignée)', name_ar: 'الزيتون (قبضة)', name_en: 'Olives (handful)',
    category: 'snack', emoji: '🫒', serving: '10 olives (40 g)', grams: 40,
    calories: 60, carbs: 2, sugar: 0, protein: 0, fat: 6, fiber: 1, gi: 0,
    why_fr: "Zéro sucre, bonnes graisses méditerranéennes : l'apéritif marocain qui ne touche pas la glycémie. Attention seulement au sel si tension élevée.",
    why_ar: 'بلا سكر، ودهون متوسطية صحية: المقبلات المغربية اللي ما كتقيسش السكر. رد البال غير من الملح إلا كانت التونسيو مرتفعة.',
    steps_fr: ['10 olives vertes ou violettes, rincées si très salées.', 'Avec un thé sans sucre ou en entrée du repas.'],
    steps_ar: ['10 حبات زيتون خضر ولا مسلوقين، مغسولين إلا كانو مالحين بزاف.', 'مع أتاي بلا سكر ولا فبداية الماكلة.'],
    aliases: ['olives', 'زيتون'],
  },

  /* ───────────── Boissons ───────────── */
  {
    id: 'the-menthe-sans-sucre',
    name_fr: 'Thé à la menthe SANS sucre', name_ar: 'أتاي بالنعناع بلا سكر', name_en: 'Mint tea WITHOUT sugar',
    category: 'drink', emoji: '🍵', serving: '1 verre (150 ml)', grams: 150,
    calories: 2, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0, gi: 0,
    why_fr: "Le thé vert lui-même est un ALLIÉ (antioxydants). Le problème, c'est les 3 sucres par verre : 15 g de sucre pur. Sans sucre ou avec stevia, buvez-en toute la journée.",
    why_ar: 'الأتاي الأخضر براسو صديق (مضادات الأكسدة). المشكل هو 3 قوالب سكر فالكاس: 15 غرام سكر صافي. بلا سكر ولا بستيفيا، شرب منو النهار كامل.',
    steps_fr: ['Préparez le thé vert et la menthe comme d’habitude.', 'NE mettez PAS de sucre — ou 1 stevia si besoin les premières semaines.', 'Astuce : ajoutez plus de menthe fraîche et 1 feuille de verveine, le goût compense.'],
    steps_ar: ['وجد أتاي والنعناع كيف العادة.', 'ما تزيدش السكر — ولا حبة ستيفيا فالسيمانات الأولى إلا خاصك.', 'نصيحة: زيد النعناع الطري ولويزة، الذوق كيعوض.'],
    aliases: ['atay', 'أتاي'],
  },
  {
    id: 'eau-citron-menthe',
    name_fr: 'Eau citron-menthe', name_ar: 'ماء بالحامض والنعناع', name_en: 'Lemon-mint water',
    category: 'drink', emoji: '🍋', serving: '1 grand verre (300 ml)', grams: 300,
    calories: 8, carbs: 2, sugar: 1, protein: 0, fat: 0, fiber: 0, gi: 0,
    why_fr: 'L’hydratation aide les reins à éliminer l’excès de sucre. Cette eau parfumée fait oublier les sodas — 0 calorie contre 35 g de sucre par canette.',
    why_ar: 'الماء كيعاون الكلاوي يخرجو السكر الزايد. هاد الماء المعطر كينسيك فالمونادا — 0 كالوري مقابل 35 غرام سكر فالكانيط.',
    steps_fr: ['Remplissez une carafe d’eau fraîche.', 'Ajoutez ½ citron en rondelles et une poignée de menthe.', 'Laissez infuser 1 h au frigo, buvez toute la journée.'],
    steps_ar: ['عمر غراف بالماء البارد.', 'زيد نص حامضة دوائر وقبضة نعناع.', 'خليه ساعة فالتلاجة وشرب منو النهار كامل.'],
    aliases: ['eau citron'],
  },
  {
    id: 'infusion-cannelle',
    name_fr: 'Infusion de cannelle', name_ar: 'منقوع القرفة', name_en: 'Cinnamon infusion',
    category: 'drink', emoji: '☕', serving: '1 tasse (200 ml)', grams: 200,
    calories: 5, carbs: 1, sugar: 0, protein: 0, fat: 0, fiber: 0, gi: 0,
    why_fr: 'Des études suggèrent que la cannelle aide modestement à réguler la glycémie. Au minimum : une boisson chaude réconfortante à 0 sucre pour remplacer le thé sucré du soir.',
    why_ar: 'دراسات كتقول أن القرفة كتعاون شوية فتنظيم السكر. على الأقل: مشروب سخون بلا سكر كيعوض أتاي الليل المسكر.',
    steps_fr: ['Faites frémir 1 bâton de cannelle dans 250 ml d’eau, 10 min.', 'Laissez tiédir, ajoutez un filet de citron si envie.', 'Le soir après le dîner, à la place du thé sucré.'],
    steps_ar: ['غلي عود القرفة ف250 مل ماء، 10 دقايق.', 'خليه يدفا وزيد عصرة حامض إلا بغيتي.', 'فالليل بعد العشا، بلاصة أتاي المسكر.'],
    aliases: ['cannelle', 'قرفة'],
  },
  {
    id: 'smoothie-vert',
    name_fr: 'Smoothie vert sans sucre', name_ar: 'سموذي أخضر بلا سكر', name_en: 'Green smoothie (no sugar)',
    category: 'drink', emoji: '🥬', serving: '1 verre (250 ml)', grams: 250,
    calories: 90, carbs: 14, sugar: 9, protein: 3, fat: 3, fiber: 4, gi: 30,
    why_fr: 'Contrairement aux jus de fruits (du sucre liquide !), ce smoothie garde les FIBRES : concombre + épinards + ½ pomme verte + citron. Fraîcheur sans pic.',
    why_ar: 'عكس عصير الفواكه (سكر سائل!)، هاد السموذي كيحتفظ بالألياف: خيار وسبانخ ونص تفاحة خضراء وحامض. انتعاش بلا طلعة سكر.',
    steps_fr: ['Mixez : 1 concombre, 1 poignée d’épinards, ½ pomme verte.', 'Ajoutez jus de ½ citron et 150 ml d’eau froide.', 'Buvez immédiatement, sans filtrer (gardez les fibres !).'],
    steps_ar: ['طحن: خيارة، قبضة سبانخ، ونص تفاحة خضراء.', 'زيد عصير نص حامضة و150 مل ماء بارد.', 'شربو دغيا وبلا تصفية (خلي الألياف!).'],
    aliases: ['smoothie'],
  },

  {
    id: 'louiza',
    name_fr: 'Infusion de verveine (louiza)', name_ar: 'اللويزة', name_en: 'Verbena infusion (louiza)',
    category: 'drink', emoji: '🌿', serving: '1 tasse (200 ml)', grams: 200,
    calories: 2, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0, gi: 0,
    why_fr: "La louiza du soir : apaise, aide à digérer et à dormir — sans une goutte de sucre. Le stress et le mauvais sommeil font monter la glycémie ; la louiza travaille pour vous.",
    why_ar: 'لويزة الليل: كتهدن، كتعاون على الهضم والنعاس — بلا قطرة سكر. الستريس والنعاس الخايب كيطلعو السكر؛ اللويزة كتخدم معاك.',
    steps_fr: ['Infusez une poignée de feuilles de verveine fraîche ou séchée 5 min.', 'Sans sucre — le parfum suffit.', 'Chaque soir après le dîner.'],
    steps_ar: ['خمر قبضة ديال ورق اللويزة الطرية ولا اليابسة 5 دقايق.', 'بلا سكر — الريحة كافية.', 'كل ليلة من بعد العشا.'],
    aliases: ['verveine', 'لويزة'],
  },

  /* ───────────── Desserts légers ───────────── */
  {
    id: 'salade-fruits-cannelle',
    name_fr: 'Salade de fruits frais à la cannelle', name_ar: 'شلاضة الفواكه بالقرفة', name_en: 'Fresh fruit salad with cinnamon',
    category: 'dessert', emoji: '🍓', serving: '1 bol (180 g)', grams: 180,
    calories: 90, carbs: 20, sugar: 16, protein: 1, fat: 0, fiber: 4, gi: 35,
    why_fr: 'Fruits ENTIERS à IG bas (fraise, orange, pomme, kiwi) — jamais de sirop ni sucre ajouté. La cannelle donne le goût "dessert" sans une calorie.',
    why_ar: 'فواكه كاملة بمؤشر منخفض (فريز، ليمون، تفاح، كيوي) — بلا سيرو وبلا سكر مزيود. القرفة كتعطي ذوق الحلوى بلا كالوري.',
    steps_fr: ['Coupez : 5 fraises, 1 kiwi, ½ orange, ½ pomme.', 'Ajoutez le jus de l’orange pressée restante.', 'Saupoudrez de cannelle. Servez frais.'],
    steps_ar: ['قطع: 5 حبات فريز، كيوي، نص ليمونة ونص تفاحة.', 'زيد عصير نص الليمونة الباقية.', 'رش القرفة وقدمها باردة.'],
    aliases: ['salade fruits'],
  },
  {
    id: 'compote-sans-sucre',
    name_fr: 'Compote de pommes sans sucre', name_ar: 'كومبوت التفاح بلا سكر', name_en: 'No-sugar apple compote',
    category: 'dessert', emoji: '🍏', serving: '1 pot (120 g)', grams: 120,
    calories: 70, carbs: 16, sugar: 14, protein: 0, fat: 0, fiber: 2, gi: 35,
    why_fr: 'Cuite avec cannelle et zéro sucre ajouté, la compote calme l’envie de sucré à 70 kcal. À faire maison : la version industrielle "sans sucres ajoutés" reste la meilleure alternative aux pâtisseries.',
    why_ar: 'مطيبة بالقرفة وبلا سكر مزيود، الكومبوت كتهدن الرغبة فالحلو ب70 كالوري برك. أحسن بديل للحلويات.',
    steps_fr: ['Pelez 4 pommes, coupez en morceaux.', 'Cuisez 15 min avec 2 c.s. d’eau et 1 bâton de cannelle.', 'Écrasez à la fourchette. Se garde 4 jours au frigo.'],
    steps_ar: ['قشر 4 تفاحات وقطعهم.', 'طيبهم 15 دقيقة مع جوج معالق ماء وعود قرفة.', 'هرسهم بالفورشيطة. كيتخبى 4 أيام فالتلاجة.'],
    aliases: ['compote'],
  },
  {
    id: 'oranges-cannelle',
    name_fr: 'Oranges à la cannelle (dessert fassi)', name_ar: 'الليمون بالقرفة', name_en: 'Cinnamon oranges (Fassi dessert)',
    category: 'dessert', emoji: '🍊', serving: '1 orange (150 g)', grams: 150,
    calories: 70, carbs: 17, sugar: 14, protein: 1, fat: 0, fiber: 3, gi: 40,
    why_fr: 'Le dessert marocain traditionnel le PLUS adapté au diabète : l’orange entière garde ses fibres (contrairement au jus), la cannelle et la fleur d’oranger font le reste.',
    why_ar: 'الحلوى المغربية التقليدية الأنسب للسكري: الليمونة الكاملة كتحتفظ بأليافها (عكس العصير)، والقرفة وماء الزهر كيكملو.',
    steps_fr: ['Pelez 2 oranges à vif, coupez en rondelles.', 'Disposez sur assiette, saupoudrez de cannelle.', 'Quelques gouttes d’eau de fleur d’oranger — sans sucre glace.'],
    steps_ar: ['قشر جوج ليمونات وقطعهم دوائر.', 'رتبهم فطبسيل ورش القرفة.', 'شي قطرات ديال ماء الزهر — بلا سكر كلاصي.'],
    aliases: ['orange cannelle'],
  },
  {
    id: 'dattes-noix',
    name_fr: '2 dattes fourrées aux noix', name_ar: 'جوج تمرات معمرين بالكركاع', name_en: '2 dates stuffed with walnuts',
    category: 'dessert', emoji: '🌴', serving: '2 dattes + noix (30 g)', grams: 30,
    calories: 110, carbs: 20, sugar: 17, protein: 2, fat: 3, fiber: 2, gi: 45,
    why_fr: 'Les dattes sont sucrées, oui — mais DEUX dattes avec des noix (les graisses ralentissent le sucre) restent un plaisir gérable. La règle absolue : 2, pas 10.',
    why_ar: 'التمر مسكر، صحيح — ولكن جوج تمرات بالكركاع (الدهون كتبطئ السكر) كيبقاو متعة ممكنة. القاعدة: جوج، ماشي عشرة.',
    steps_fr: ['Ouvrez 2 dattes, retirez le noyau.', 'Glissez ½ cerneau de noix dans chacune.', 'Savourez lentement avec un thé sans sucre. STOP à 2.'],
    steps_ar: ['حل جوج تمرات وحيد النوى.', 'دخل نص حبة كركاع فكل وحدة.', 'تلذذ بشوية مع أتاي بلا سكر. حبس ف2.'],
    aliases: ['dattes'],
  },
];

/* ───────────────────────── Helpers ───────────────────────── */

export function getHealthyFood(id: string): HealthyFood | null {
  return HEALTHY_FOODS.find((f) => f.id === id) ?? null;
}

export function healthyCategoryColors(cat: HealthyCategory): [string, string] {
  return (
    HEALTHY_CATEGORIES.find((c) => c.key === cat)?.colors ?? ['#eef0f5', '#e2e6ef']
  );
}

/** Localized display name (names exist in fr/ar/en; de falls back to fr). */
export function healthyFoodName(f: HealthyFood, lang: string): string {
  if (lang === 'ar') return f.name_ar;
  if (lang === 'en') return f.name_en;
  return f.name_fr;
}

/** Localized "why good" / steps: ar for Arabic, fr otherwise. */
export function healthyFoodWhy(f: HealthyFood, lang: string): string {
  return lang === 'ar' ? f.why_ar : f.why_fr;
}
export function healthyFoodSteps(f: HealthyFood, lang: string): string[] {
  return lang === 'ar' ? f.steps_ar : f.steps_fr;
}

/** Search across all names + aliases. */
export function filterHealthyFoods(
  query: string,
  category: HealthyCategory | null
): HealthyFood[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  const q = norm(query);
  return HEALTHY_FOODS.filter((f) => {
    if (category && f.category !== category) return false;
    if (!q) return true;
    return [f.name_fr, f.name_ar, f.name_en, ...(f.aliases ?? [])].some((n) =>
      norm(n).includes(q)
    );
  });
}

/**
 * Compact index sent to the AI chat so it can recommend entries and link
 * them with [[food:id]] tokens. ~45 short lines — cheap in tokens.
 */
export function healthyFoodAIIndex(): string {
  return HEALTHY_FOODS.map(
    (f) =>
      `${f.id} | ${f.name_fr} / ${f.name_ar} | ${f.calories} kcal | ${f.carbs} g carbs | GI ${f.gi} | ${f.category}`
  ).join('\n');
}
