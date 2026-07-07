import { searchMoroccanFood } from '@/data/moroccanFoods';
import { isDemoMode, supabase } from '@/lib/supabase';
import type { FoodItemResult, NutritionResult, Profile } from '@/types';

import { analyzePlate, resolveFood } from './nutrition/engine';
import { applyPortionLearning } from './nutrition/learning';
import type { DetectedFood, Per100g } from './nutrition/types';

/* ────────────────────────────────────────────────────────────
 * HYBRID FOOD ANALYSIS PIPELINE
 *
 *   Camera → Vision (detection ONLY: names + portions + confidence)
 *          → Nutrition Engine (Moroccan DB → USDA → OFF → AI fallback)
 *          → Totals per plate
 *
 * The AI never provides final nutrition values when a database
 * knows the food — it only identifies what is on the plate.
 * ──────────────────────────────────────────────────────────── */

interface VisionDetection extends DetectedFood {
  /** The vision model's own per-100g estimate — used as last resort */
  per100g?: Per100g;
}

/** Raw detection as returned by the edge function (before per100g mapping). */
interface RawDetection extends DetectedFood {
  nutrition_per_100g?: {
    calories: number;
    carbs: number;
    sugar: number;
    protein: number;
    fat: number;
    fiber: number;
    sodium?: number;
  };
}

/** Demo detections: exercises every branch of the provider chain.
 *  Includes search_name + bounding_box so the result UI can be tested
 *  offline exactly as it renders with real Gemini output. */
const DEMO_PLATES: VisionDetection[][] = [
  [
    {
      name: 'Couscous au poulet',
      search_name: 'couscous',
      category: 'Protein',
      portion_grams: 380,
      confidence: 0.93,
      bounding_box: { x: 0.141, y: 0.250, width: 0.469, height: 0.542 },
      is_main_food: true,
    },
    {
      name: 'Salade marocaine',
      search_name: 'salade marocaine',
      category: 'Vegetable',
      portion_grams: 150,
      confidence: 0.62, // low → triggers the "Did you mean?" sheet
      bounding_box: { x: 0.625, y: 0.625, width: 0.281, height: 0.313 },
      is_estimated: true,
      alternatives: ['tomato salad', 'cucumber salad', 'coleslaw'],
    },
  ],
  [
    {
      name: 'Tajine de poulet aux olives',
      search_name: 'chicken tagine',
      category: 'Protein',
      portion_grams: 340,
      confidence: 0.91,
      bounding_box: { x: 0.172, y: 0.188, width: 0.531, height: 0.625 },
    },
    {
      name: 'Khobz',
      search_name: 'bread',
      category: 'Bread',
      portion_grams: 70,
      confidence: 0.86,
      bounding_box: { x: 0.734, y: 0.542, width: 0.219, height: 0.271 },
    },
  ],
  [
    {
      name: 'Harira',
      search_name: 'harira',
      category: 'Soup',
      portion_grams: 300,
      confidence: 0.9,
      bounding_box: { x: 0.234, y: 0.271, width: 0.438, height: 0.500 },
    },
    {
      name: 'Dattes',
      search_name: 'dates',
      category: 'Fruit',
      portion_grams: 40,
      confidence: 0.84,
      bounding_box: { x: 0.703, y: 0.708, width: 0.203, height: 0.229 },
    },
  ],
  [
    // Generic dish → falls through Moroccan DB to USDA (or AI offline)
    {
      name: 'Grilled Chicken Breast',
      search_name: 'chicken breast',
      category: 'Protein',
      portion_grams: 180,
      confidence: 0.87,
      bounding_box: { x: 0.188, y: 0.313, width: 0.344, height: 0.375 },
      per100g: { calories: 165, carbs: 0, sugar: 0, protein: 31, fat: 3.6, fiber: 0, sodium: 74 },
    },
    {
      name: 'White Rice',
      search_name: 'white rice',
      category: 'Rice',
      portion_grams: 200,
      confidence: 0.82,
      bounding_box: { x: 0.563, y: 0.375, width: 0.328, height: 0.417 },
      per100g: { calories: 130, carbs: 28, sugar: 0, protein: 2.7, fat: 0.3, fiber: 0.4, sodium: 1, glycemic_index: 73 },
    },
  ],
];

async function detectFoods(
  imageBase64: string,
  language: string
): Promise<VisionDetection[]> {
  if (isDemoMode || !supabase) {
    await new Promise((r) => setTimeout(r, 1500));
    return DEMO_PLATES[Math.floor(Math.random() * DEMO_PLATES.length)];
  }

  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { image_base64: imageBase64, language, mode: 'detect' },
  });
  if (error) throw error;
  if (data.error) throw new Error(data.error);

  // New contract: { detections: [{ name, portion_grams, confidence, ... }] }
  if (Array.isArray(data.detections)) {
    return (data.detections as RawDetection[]).map((d) => {
      // Map the model's per-100g nutrition estimate onto `per100g`, the
      // field the engine uses ONLY as a fallback when every database misses
      // (so sauces/spices/regional foods get AI-estimated values, not 0).
      const n = d.nutrition_per_100g;
      const per100g = n
        ? {
            calories: n.calories,
            carbs: n.carbs,
            sugar: n.sugar,
            protein: n.protein,
            fat: n.fat,
            fiber: n.fiber,
            sodium: n.sodium,
          }
        : undefined;
      return { ...d, per100g } as VisionDetection;
    });
  }

  // Legacy contract: { result: NutritionResult } → wrap as one detection
  if (data.result) {
    const r = data.result as NutritionResult;
    const grams = 350;
    const f = 100 / grams;
    return [
      {
        name: r.food_name,
        portion_grams: grams,
        confidence: r.confidence ?? 0.7,
        per100g: {
          calories: r.calories * f,
          carbs: r.carbohydrates * f,
          sugar: r.sugar * f,
          protein: r.protein * f,
          fat: r.fat * f,
          fiber: r.fiber * f,
          glycemic_index: r.glycemic_index,
        },
      },
    ];
  }
  return [];
}

/**
 * Ordered stages of the scan pipeline — surfaced to the UI for a
 * progressive "✓ Detecting foods → ✓ Searching databases…" experience.
 */
export type ScanStage =
  | 'detecting'
  | 'portions'
  | 'searching'
  | 'calculating'
  | 'scoring'
  | 'finalizing';

export const SCAN_STAGES: ScanStage[] = [
  'detecting',
  'portions',
  'searching',
  'calculating',
  'scoring',
  'finalizing',
];

/**
 * Full pipeline. Returns null when no food can be identified
 * confidently — the UI must suggest another picture, never invent.
 *
 * `onStage` (optional) reports real pipeline progress so the scanner can
 * show step-by-step loading instead of a single spinner.
 */
export async function analyzeMealImage(
  imageBase64: string,
  language: string,
  onStage?: (stage: ScanStage) => void
): Promise<NutritionResult | null> {
  onStage?.('detecting');
  const raw = await detectFoods(imageBase64, language);
  if (raw.length === 0) return null;

  // Learning layer: apply the user's own portion habits before scaling
  onStage?.('portions');
  const { detections, adjusted } = applyPortionLearning(raw);

  onStage?.('searching');
  const result = await analyzePlate(
    detections,
    detections.map((d) => d.per100g)
  );
  onStage?.('finalizing');
  if (result && adjusted.length > 0) {
    result.warnings.push(
      `Portions ajustées selon vos habitudes : ${adjusted.join(', ')}.`
    );
  }
  return result;
}

/* ────────────────── RESTAURANT MENU SCANNER ────────────────── */

const DEMO_MENUS: string[][] = [
  [
    'Couscous au poulet',
    'Tajine de kefta aux œufs',
    'Salade marocaine',
    'Harira',
    'Rfissa',
    'Thé à la menthe sucré',
  ],
  [
    'Tajine de poulet aux olives',
    'Tajine de poisson',
    'Bissara',
    'Zaalouk',
    'Seffa medfouna',
    "Jus d'orange frais",
  ],
];

/**
 * Menu scanner pipeline: vision reads the dish names on the menu,
 * then EVERY dish goes through the nutrition provider chain at its
 * typical serving. Unrecognized dishes are skipped — never invented.
 */
export async function analyzeMenu(
  imageBase64: string,
  language: string
): Promise<FoodItemResult[]> {
  let dishNames: string[];
  if (isDemoMode || !supabase) {
    await new Promise((r) => setTimeout(r, 1700));
    dishNames = DEMO_MENUS[Math.floor(Math.random() * DEMO_MENUS.length)];
  } else {
    const { data, error } = await supabase.functions.invoke('analyze-meal', {
      body: { image_base64: imageBase64, language, mode: 'menu' },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);
    dishNames = Array.isArray(data.dishes) ? (data.dishes as string[]) : [];
  }

  const resolved = await Promise.all(
    dishNames.map((name) => {
      // Typical serving: Moroccan DB serving when known, else 300 g
      const mf = searchMoroccanFood(name);
      return resolveFood({
        name,
        portion_grams: mf?.serving_grams ?? 300,
        confidence: 0.85,
      });
    })
  );
  return resolved.filter((r): r is FoodItemResult => r !== null);
}

/* ──────────────────────── AI CHAT ──────────────────────── */

const DEMO_REPLIES: Record<string, string> = {
  ar: 'هذا رد تجريبي. اربط Supabase ومفتاح الذكاء الاصطناعي للحصول على إجابات حقيقية مخصصة لك. تذكر دائمًا استشارة طبيبك في القرارات العلاجية.',
  fr: "Ceci est une réponse de démonstration. Connectez Supabase et la clé IA pour obtenir de vraies réponses personnalisées. Pensez toujours à consulter votre médecin pour les décisions médicales.",
  de: 'Dies ist eine Demo-Antwort. Verbinde Supabase und den KI-Schlüssel für echte, personalisierte Antworten. Besprich medizinische Entscheidungen immer mit deinem Arzt.',
  en: 'This is a demo reply. Connect Supabase and the AI key to get real personalized answers. Always consult your doctor for medical decisions.',
};

/**
 * The assistant knows the nutrition databases: when the user asks
 * about a food (e.g. "Puis-je manger du couscous ?"), it answers
 * from the Moroccan database with real values — even in demo mode.
 */
export async function sendChatMessage(
  messages: { role: 'user' | 'assistant'; content: string }[],
  language: string,
  profile: Profile | null
): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  if (isDemoMode || !supabase) {
    await new Promise((r) => setTimeout(r, 900));

    // Food knowledge from the Moroccan database
    const food = lastUser ? searchMoroccanFood(lastUser.content) : null;
    if (food) {
      const giNote =
        food.glycemic_index === undefined || food.glycemic_index === 0
          ? ''
          : food.glycemic_index > 65
            ? `Son index glycémique est ÉLEVÉ (${food.glycemic_index}) — portion réduite conseillée et mesurez votre glycémie 2 h après.`
            : food.glycemic_index > 55
              ? `Son index glycémique est modéré (${food.glycemic_index}).`
              : `Bon point : son index glycémique est bas (${food.glycemic_index}).`;
      const ratio = profile?.carb_ratio;
      const bolusNote = ratio
        ? ` Avec votre ratio (1 U / ${ratio} g), une portion ≈ ${Math.round((food.carbs / ratio) * 10) / 10} U.`
        : '';
      return (
        `${food.emoji} ${food.name_fr} (${food.name_ar}) — pour ${food.serving_size} : ` +
        `${food.calories} kcal, ${food.carbs} g de glucides (dont ${food.sugar} g de sucre), ` +
        `${food.protein} g de protéines, ${food.fiber} g de fibres. ${giNote}${bolusNote}\n\n` +
        `Source : Base marocaine · Estimation éducative — pas un avis médical.`
      );
    }
    return DEMO_REPLIES[language] ?? DEMO_REPLIES.en;
  }

  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { messages, language, profile },
  });
  if (error) throw error;
  if (data.error) throw new Error(data.error);
  return data.reply as string;
}

/**
 * Informational insulin estimate from carbs + profile ratios.
 * Formula-based (never AI): carbs / ratio. The full calculation with
 * glucose correction lives in services/data.ts (computeBolus).
 * NEVER presented as a prescription — the UI always shows the disclaimer.
 */
export function estimateInsulin(
  carbs: number,
  profile: Profile | null
): number | null {
  const ratio = profile?.carb_ratio;
  if (!ratio || ratio <= 0) return null;
  return Math.round((carbs / ratio) * 10) / 10;
}
