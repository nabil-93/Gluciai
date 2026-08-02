import { healthyFoodAIIndex } from '@/data/healthyFoods';
import { searchMoroccanFood } from '@/data/moroccanFoods';
import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { FoodItemResult, NutritionResult, Profile } from '@/types';

import { buildAIDayJournal } from './dayLog';
import { guessMealTime, ratioForMeal } from './bolusEngine';
import { asQuotaError } from './usage';
import { analyzePlate, resolveFood } from './nutrition/engine';
import { applyPortionLearning } from './nutrition/learning';
import { knownFrom } from './nutrition/nutrientProvenance';
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

/**
 * The number an edge payload actually carries, or null.
 *
 * Deliberately strict, and deliberately local: `null`, `undefined`, `''`,
 * `true`, text and non-finite values are all "no number". This is the single
 * place the client decides whether the vision function stated a nutrient — see
 * `carbProvenance.ts` for what that decision then protects.
 */
function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Raw detection as returned by the edge function (before per100g mapping).
 *
 * Every nutrient is `number | null`: since Step 11b the function reports what
 * the model did NOT state as `null` instead of `0`, so a missing carbohydrate
 * arrives as missing. Older deployments send plain numbers and are read
 * identically — `null` and a number are both handled below, which is what lets
 * the client run against either contract without a coordinated deploy.
 */
interface RawDetection extends DetectedFood {
  nutrition_per_100g?: {
    calories: number | null;
    carbs: number | null;
    sugar: number | null;
    protein: number | null;
    fat: number | null;
    fiber: number | null;
    sodium?: number | null;
  };
  /** False when the function had to default the portion (finding N-3). */
  portion_grams_stated?: boolean;
  /** True when a stated portion was outside the possible range and bounded. */
  portion_grams_clamped?: boolean;
  /** False when the function had to default the confidence (finding N-3). */
  confidence_stated?: boolean;
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
      // A genuine zero-carb food: the estimate really does say 0 g, and that
      // must stay a usable value rather than read as missing data.
      per100g: { calories: 165, carbs: 0, carbs_known: true, sugar: 0, protein: 31, fat: 3.6, fiber: 0, sodium: 74 },
    },
    {
      name: 'White Rice',
      search_name: 'white rice',
      category: 'Rice',
      portion_grams: 200,
      confidence: 0.82,
      bounding_box: { x: 0.563, y: 0.375, width: 0.328, height: 0.417 },
      per100g: { calories: 130, carbs: 28, carbs_known: true, sugar: 0, protein: 2.7, fat: 0.3, fiber: 0.4, sodium: 1, glycemic_index: 73 },
    },
  ],
];

/** What the vision step returned, plus whether the model's answer was cut off
 *  and reassembled — an incomplete plate is missing carbohydrate, so it must
 *  never reach the screen looking like a complete one (finding N-4). */
interface DetectionBatch {
  detections: VisionDetection[];
  incomplete: boolean;
}

async function detectFoods(
  imageBase64: string,
  language: string
): Promise<DetectionBatch> {
  if (isDemoMode || !supabase) {
    await new Promise((r) => setTimeout(r, 1500));
    return {
      detections: DEMO_PLATES[Math.floor(Math.random() * DEMO_PLATES.length)],
      incomplete: false,
    };
  }

  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { image_base64: imageBase64, language, mode: 'detect' },
  });
  const quota = await asQuotaError(error, data);
  if (quota) throw quota;
  if (error) {
    /* THE SERVER'S EXPLANATION WAS BEING THROWN AWAY.
       supabase-js turns any non-2xx into a FunctionsHttpError whose `message`
       is the generic "Edge Function returned a non-2xx status code" and whose
       `data` is null — the JSON body, which carries our real reason, is only
       reachable through `context`, the raw Response. So the function could
       answer 503 `code: 'ai_unavailable'` and the app would still show
       "vérifiez votre connexion", because nothing ever read it.

       Read the body, attach the code and the server's message to the thrown
       error, and let the screen decide from a CODE rather than from a
       sentence. A body that will not parse changes nothing — the original
       error is rethrown exactly as before. */
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json().catch(() => null);
      if (body && typeof body === 'object') {
        const e = error as Error & { code?: string; serverMessage?: string };
        if (typeof body.code === 'string') e.code = body.code;
        if (typeof body.error === 'string') e.serverMessage = body.error;
        // A 503 IS the busy case even when the function could not label it.
        if (!e.code && ctx.status === 503) e.code = 'ai_unavailable';
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);

  // New contract: { detections: [{ name, portion_grams, confidence, ... }] }
  if (Array.isArray(data.detections)) {
    const detections = (data.detections as RawDetection[]).map((d) => {
      // Map the model's per-100g nutrition estimate onto `per100g`, the
      // field the engine uses ONLY as a fallback when every database misses
      // (so sauces/spices/regional foods get AI-estimated values, not 0).
      const n = d.nutrition_per_100g;
      // The model is asked for a carbohydrate figure but is not bound to
      // return one. Since Step 11b the function reports that absence as
      // `null`; before, it sent `0`, and an even older contract sent nothing
      // at all (which used to become NaN in `scale()`). All three are read
      // here, once, strictly: is there a number, or is there not?
      const carbs = numOrNull(n?.carbs);
      const carbsKnown = carbs !== null;
      // An estimate with no energy is a record the model did not fill in, not a
      // zero-calorie food — the function drops it for exactly that reason, and
      // has in every version. The same rule is applied here so a payload that
      // arrives with an all-zero object (an older contract, a proxy, a mangled
      // response) cannot turn a placeholder into a KNOWN 0 g of carbohydrate
      // that then seeds a bolus. Dropping it leaves the food on the plate,
      // visible and explicitly unknown, which is what the live path already
      // does today.
      const calories = numOrNull(n?.calories);
      // The sibling macros are still coerced to a number because the engine,
      // the score and the bounds layer all take numbers — an absent sibling
      // reads 0 exactly as before. Since Step 22B their ABSENCE travels beside
      // them in `known`, so a field the model left out is no longer shown to
      // the patient as a measured 0 g.
      const sugar = numOrNull(n?.sugar);
      const protein = numOrNull(n?.protein);
      const fat = numOrNull(n?.fat);
      const fiber = numOrNull(n?.fiber);
      const sodium = numOrNull(n?.sodium);
      const per100g = n && calories !== null && calories > 0
        ? {
            calories,
            carbs: carbs ?? 0,
            carbs_known: carbsKnown,
            sugar: sugar ?? 0,
            protein: protein ?? 0,
            fat: fat ?? 0,
            fiber: fiber ?? 0,
            sodium: sodium ?? 0,
            known: knownFrom({
              calories,
              carbs,
              sugar,
              protein,
              fat,
              fiber,
              sodium,
            }),
          }
        : undefined;
      // A portion or confidence the function had to default is not an
      // observation of this plate, so the food is marked estimated — the flag
      // the UI already uses for an uncertain portion. The numbers themselves
      // are untouched: changing them would change which foods survive the
      // engine's detection gate.
      const inferred =
        d.portion_grams_stated === false ||
        d.portion_grams_clamped === true ||
        d.confidence_stated === false;
      return {
        ...d,
        per100g,
        is_estimated: d.is_estimated === true || inferred,
      } as VisionDetection;
    });
    return { detections, incomplete: data.incomplete === true };
  }

  // Legacy contract: { result: NutritionResult } → wrap as one detection
  if (data.result) {
    const r = data.result as NutritionResult;
    const grams = 350;
    const f = 100 / grams;
    const legacyCarbs = numOrNull(r.carbohydrates);
    return {
      detections: [
        {
          name: r.food_name,
          portion_grams: grams,
          confidence: r.confidence ?? 0.7,
          // The 350 g is this function's own assumption, not an observation.
          is_estimated: true,
          per100g: {
            calories: (numOrNull(r.calories) ?? 0) * f,
            carbs: (legacyCarbs ?? 0) * f,
            // The legacy shape has no provenance channel, so trust the figure
            // only when it actually is one.
            carbs_known: legacyCarbs !== null,
            sugar: (numOrNull(r.sugar) ?? 0) * f,
            protein: (numOrNull(r.protein) ?? 0) * f,
            fat: (numOrNull(r.fat) ?? 0) * f,
            fiber: (numOrNull(r.fiber) ?? 0) * f,
            glycemic_index: r.glycemic_index,
          },
        },
      ],
      incomplete: data.incomplete === true,
    };
  }
  return { detections: [], incomplete: data.incomplete === true };
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
  const { detections: raw, incomplete } = await detectFoods(imageBase64, language);
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
    // Stored as a translation key (localized in scan-result localizeWarning).
    result.warnings.push(`warn:portions_adjusted|${adjusted.join(', ')}`);
  }
  if (result && incomplete) {
    // The model's answer was cut off and reassembled, so foods it listed after
    // the cut are missing from this plate — and missing foods mean missing
    // carbohydrate. The patient has to be told the total is not the whole meal;
    // silently showing a shorter plate as complete is what this warning stops.
    result.warnings.push('warn:plate_incomplete');
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

/** What the menu scanner read, plus whether the model's answer was cut off and
 *  reassembled — dishes listed after the cut are missing from the list, and a
 *  short list must not look like the whole menu (finding N-4). */
export interface MenuScanResult {
  dishes: FoodItemResult[];
  incomplete: boolean;
}

/**
 * Menu scanner pipeline: vision reads the dish names on the menu,
 * then EVERY dish goes through the nutrition provider chain at its
 * typical serving. Unrecognized dishes are skipped — never invented.
 */
export async function analyzeMenu(
  imageBase64: string,
  language: string
): Promise<MenuScanResult> {
  let dishNames: string[];
  let incomplete = false;
  if (isDemoMode || !supabase) {
    await new Promise((r) => setTimeout(r, 1700));
    dishNames = DEMO_MENUS[Math.floor(Math.random() * DEMO_MENUS.length)];
  } else {
    const { data, error } = await supabase.functions.invoke('analyze-meal', {
      body: { image_base64: imageBase64, language, mode: 'menu' },
    });
    const quota = await asQuotaError(error, data);
    if (quota) throw quota;
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    dishNames = Array.isArray(data.dishes) ? (data.dishes as string[]) : [];
    incomplete = data.incomplete === true;
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
  return {
    dishes: resolved.filter((r): r is FoodItemResult => r !== null),
    incomplete,
  };
}

/* ──────────────────────── AI CHAT ──────────────────────── */

/**
 * Snapshot of EVERYTHING the app knows about the patient, formatted for
 * the assistant's system prompt: profile & therapy parameters, today's
 * glucose readings, insulin doses, scanned meals, activity, and 7-day
 * stats. Built from the local store so chat AND voice calls can
 * personalize every answer ("what did I eat?", "how much insulin left?").
 */
export function buildHealthContext(): string {
  const s = useAppStore.getState();
  const { profile, glucoseLogs, insulinLogs, meals, activityLogs, activityStatus, eventLogs } = s;
  const now = new Date();
  const isToday = (iso: string) =>
    new Date(iso).toDateString() === now.toDateString();
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  const lines: string[] = [];

  lines.push(`Now: ${now.toISOString()} (local ${now.toLocaleString('fr-FR')})`);

  if (profile) {
    const p = profile;
    lines.push(
      `Profile: name ${p.name || '?'}; diabetes ${p.diabetes_type}; ` +
        `insulin types [${(p.insulin_types ?? []).join(', ') || 'none'}]; ` +
        `target ${p.target_low}-${p.target_high} mg/dL; ` +
        `carb ratio ${p.carb_ratio ?? '?'} g/U; correction ${p.correction_factor ?? '?'} mg/dL per U; ` +
        `height ${p.height ?? '?'} cm; weight ${p.weight ?? '?'} kg; gender ${p.gender ?? '?'}.`
    );
    // Per-meal insulin plan — the numbers the patient entered from their
    // doctor's prescription. Any dose talk MUST use these, never generics.
    const ratios: string[] = [];
    if (p.insulin_per_10g_breakfast) {
      ratios.push(`breakfast ${p.insulin_per_10g_breakfast} U per 10 g carbs`);
    }
    if (p.insulin_per_10g_lunch) {
      ratios.push(`lunch ${p.insulin_per_10g_lunch} U per 10 g carbs`);
    }
    if (p.insulin_per_10g_dinner) {
      ratios.push(`dinner ${p.insulin_per_10g_dinner} U per 10 g carbs`);
    }
    const hasPlan =
      ratios.length > 0 || p.bolus_insulin_name || p.basal_insulin_name || p.basal_dose;
    lines.push(
      hasPlan
        ? `INSULIN PLAN (entered by the patient from their doctor's prescription — ` +
            `for ANY dose question use the ratio of the RIGHT meal, these exact numbers): ` +
            (ratios.length
              ? `meal ratios: ${ratios.join('; ')}. `
              : 'meal ratios: NOT SET — ask the patient for them (or Profile → Medical). ') +
            `Meal (rapid) insulin: ${p.bolus_insulin_name || 'not set'}. ` +
            `Basal (slow) insulin: ${p.basal_insulin_name || 'not set'}` +
            (p.basal_dose ? ` ${p.basal_dose} U/day` : '') +
            (p.basal_time ? `, injected ${p.basal_time === 'both' ? 'morning and evening' : `in the ${p.basal_time}`}` : '') +
            `. The per-meal ratios apply ONLY to the meal (rapid) insulin, never to the basal.`
        : `INSULIN PLAN: not configured yet — when doses come up, ask the patient to fill ` +
            `Profile → Medical settings (units per 10 g of carbs for breakfast/lunch/dinner, ` +
            `insulin names, basal dose) so calculations are exact.`
    );
  } else {
    lines.push('Profile: not filled in yet.');
  }

  // Today's glucose readings
  const todayG = glucoseLogs
    .filter((g) => isToday(g.created_at))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  lines.push(
    todayG.length
      ? `Glucose today (${todayG.length}): ` +
          todayG.map((g) => `${time(g.created_at)}→${g.value} mg/dL`).join(', ') +
          `. Latest: ${todayG[todayG.length - 1].value} mg/dL.`
      : 'Glucose today: no readings yet.'
  );

  // 7-day glucose stats
  const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  const weekG = glucoseLogs.filter(
    (g) => new Date(g.created_at).getTime() >= weekAgo
  );
  if (weekG.length && profile) {
    const vals = weekG.map((g) => g.value);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const inRange = weekG.filter(
      (g) => g.value >= profile.target_low && g.value <= profile.target_high
    ).length;
    lines.push(
      `Glucose 7 days: ${weekG.length} readings, avg ${avg} mg/dL, min ${Math.min(...vals)}, max ${Math.max(...vals)}, ${Math.round((inRange / weekG.length) * 100)}% in target.`
    );
  }

  // Today's insulin
  const todayI = insulinLogs
    .filter((l) => isToday(l.created_at))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  lines.push(
    todayI.length
      ? `Insulin today (total ${todayI.reduce((s2, l) => s2 + l.dose, 0)} U): ` +
          todayI
            .map((l) => `${time(l.created_at)}→${l.dose} U ${l.insulin_type}`)
            .join(', ') +
          '.'
      : 'Insulin today: no injections logged.'
  );

  // Today's meals (from the scanner)
  const todayM = meals
    .filter((m) => isToday(m.created_at))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (todayM.length) {
    const total = todayM.reduce(
      (acc, m) => ({
        carbs: acc.carbs + m.result.carbohydrates,
        kcal: acc.kcal + m.result.calories,
      }),
      { carbs: 0, kcal: 0 }
    );
    lines.push(
      `Meals today (${todayM.length}, total ${Math.round(total.carbs)} g carbs / ${Math.round(total.kcal)} kcal): ` +
        todayM
          .map((m) => {
            const foods = (m.result.items ?? [])
              .map((f) => f.name)
              .slice(0, 4)
              .join(' + ');
            return `${time(m.created_at)}→${foods || 'meal'} (${Math.round(m.result.carbohydrates)} g carbs, ${Math.round(m.result.calories)} kcal)`;
          })
          .join('; ') +
        '.'
    );
  } else {
    lines.push('Meals today: none scanned yet.');
  }

  // Recent meals (context for eating habits)
  const recentM = meals
    .filter((m) => !isToday(m.created_at))
    .slice(0, 5)
    .map((m) => {
      const d = new Date(m.created_at);
      const foods = (m.result.items ?? []).map((f) => f.name).slice(0, 3).join(' + ');
      return `${d.toLocaleDateString('fr-FR')} ${foods || 'meal'} (${Math.round(m.result.carbohydrates)} g)`;
    });
  if (recentM.length) lines.push(`Previous meals: ${recentM.join('; ')}.`);

  // Today's activity
  const todayA = activityLogs.filter((a) => isToday(a.created_at));
  lines.push(
    todayA.length
      ? `Activity today: ` +
          todayA
            .map((a) => `${a.kind} ${a.duration_min} min (${a.intensity})`)
            .join(', ') +
          '.'
      : 'Activity today: none logged.'
  );

  // Current status + recent account changes — the assistant must know the
  // patient's FULL situation (sick? new targets? new ratio?) before advising.
  const statusNote =
    activityStatus === 'sick'
      ? 'ILLNESS raises glucose and insulin resistance — expect roughly +10–15% insulin needs.'
      : activityStatus === 'injured'
        ? 'REDUCED activity (injury): less exercise lowers insulin sensitivity — the app already adds ~+8% to the calculated dose.'
        : activityStatus === 'paused'
          ? 'training PAUSED, so less daily activity than usual — the app already adds ~+8% to the calculated dose.'
          : 'usual activity level — no status adjustment.';
  lines.push(
    `Patient status right now: ${activityStatus} — ${statusNote} ` +
      `ALWAYS take this status into account BEFORE proposing any insulin dose, ` +
      `and state how it changed the number.`
  );
  // Free-text notes the patient told the assistant ("drank water", "had a
  // coffee", "feeling stressed") — these can affect glucose/insulin, so the
  // AI MUST read them. Today's notes are highlighted; older ones summarized.
  const notes = (eventLogs ?? []).filter((e) => e.kind === 'note');
  const todayNotes = notes.filter((e) => isToday(e.created_at));
  if (todayNotes.length) {
    lines.push(
      `Notes today (things the patient reported — consider them for advice ` +
        `and dosing): ` +
        todayNotes
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((e) => `${time(e.created_at)}→"${e.payload.text}"`)
          .join('; ') +
        '.'
    );
  }
  const olderNotes = notes.filter((e) => !isToday(e.created_at)).slice(0, 4);
  if (olderNotes.length) {
    lines.push(
      `Earlier notes: ` +
        olderNotes
          .map((e) => `${new Date(e.created_at).toLocaleDateString('fr-FR')} "${e.payload.text}"`)
          .join('; ') +
        '.'
    );
  }

  const recentEvents = (eventLogs ?? [])
    .filter((e) => e.kind !== 'note')
    .slice(0, 5)
    .map((e) => {
      const when = `${new Date(e.created_at).toLocaleDateString('fr-FR')} ${time(e.created_at)}`;
      if (e.kind === 'status') {
        return `${when}: status ${e.payload.from ?? '?'} → ${e.payload.to ?? '?'}`;
      }
      const ch = Object.entries(e.payload.changes ?? {})
        .map(([f, v]: [string, any]) => `${f} ${JSON.stringify(v?.from)}→${JSON.stringify(v?.to)}`)
        .join(', ');
      return `${when}: settings changed (${ch})`;
    });
  if (recentEvents.length) {
    lines.push(`Recent account changes: ${recentEvents.join('; ')}.`);
  }

  // Latest lab (blood test) report — so the assistant can discuss the
  // patient's analyses in the chat and on the call ("I saw your results…").
  const lab = (s.labReports ?? [])[0];
  if (lab) {
    const abnormal = lab.values.filter((v) => v.status !== 'ok');
    const okCount = lab.values.length - abnormal.length;
    lines.push(
      `LAB REPORT (latest, ${lab.report_date ?? lab.created_at.slice(0, 10)}` +
        (lab.lab_name ? `, ${lab.lab_name}` : '') +
        `): ${lab.summary ?? ''} ${okCount}/${lab.values.length} values normal.` +
        (abnormal.length
          ? ` Out-of-range values: ` +
            abnormal
              .slice(0, 12)
              .map(
                (v) =>
                  `${v.label} ${v.value} ${v.unit} [ref ${v.refMin ?? '?'}-${v.refMax ?? '?'}] (${v.status})`
              )
              .join('; ') +
            '.'
          : ' All values are within range.')
    );
  }

  return lines.join('\n');
}

/** Health snapshot + the healthy-food index so the chat AI can coach the
 *  patient and deep-link entries with [[food:id]] tokens. */
function chatHealthData(): string {
  return (
    buildHealthContext() +
    '\n\nHEALTHY FOOD LIST (the app has a detail page for EACH entry — photo, nutrition, cooking steps. Link one with a [[food:id]] token on its own line):\n' +
    healthyFoodAIIndex()
  );
}

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
  profile: Profile | null,
  /** 'voice' asks Gemini for short spoken sentences (live call mode). */
  mode: 'chat' | 'voice' = 'chat'
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
    body: { messages, language, profile, mode, healthData: chatHealthData() },
  });
  const quota = await asQuotaError(error, data);
  if (quota) throw quota;
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const reply = data.reply as string;

  // Mirror the chat exchange server-side so the doctor/admin dashboard can
  // follow what the patient asked (fire-and-forget, never blocks the UI).
  if (mode === 'chat' && lastUser) {
    void (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) return;
        await supabase.from('chat_history').insert([
          { user_id: uid, role: 'user', message: lastUser.content, language },
          { user_id: uid, role: 'assistant', message: reply, language },
        ]);
      } catch {
        // history sync is best-effort
      }
    })();
  }

  return reply;
}

/**
 * Send a VOICE MESSAGE to the regular chat: Gemini listens to the audio
 * directly (Darija included), returns its transcript + a normal answer.
 * Mirrors the exchange to chat_history like sendChatMessage does.
 */
export async function sendChatVoice(
  history: { role: 'user' | 'assistant'; content: string }[],
  language: string,
  profile: Profile | null,
  audio: { mimeType: string; data: string }
): Promise<{ reply: string; transcript: string }> {
  if (isDemoMode || !supabase) {
    return { reply: DEMO_REPLIES[language] ?? DEMO_REPLIES.en, transcript: '' };
  }
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      messages: history,
      language,
      profile,
      mode: 'chat',
      healthData: chatHealthData(),
      audio,
    },
  });
  const quota = await asQuotaError(error, data);
  if (quota) throw quota;
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const reply = data.reply as string;
  const transcript = (data.transcript as string) ?? '';

  void (async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      await supabase.from('chat_history').insert([
        {
          user_id: uid,
          role: 'user',
          message: transcript || '[voice message]',
          language,
        },
        { user_id: uid, role: 'assistant', message: reply, language },
      ]);
    } catch {
      // history sync is best-effort
    }
  })();

  return { reply, transcript };
}

/* ── AI bolus report + modified-dose safety check ──
 * The clinical engine (bolusEngine.ts) computes the dose; these calls make
 * Gemini explain it in the app language and vet patient edits. */

export interface BolusAIReport {
  sections: { icon: string; title: string; body: string }[];
  conclusion: string;
  warnings: string[];
}

export async function requestBolusReport(
  engine: unknown,
  language: string
): Promise<BolusAIReport | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        mode: 'bolus',
        language,
        bolus: engine,
        // Health snapshot + the FULL chronological journal of today and
        // yesterday: every injection (rapid AND long), every meal with its
        // carbs/sugars, sport, measures — the AI grounds the proposal on
        // the complete day, not just the current numbers.
        healthData: buildHealthContext() + '\n\n' + buildAIDayJournal(),
      },
    });
    if (error || !data?.result?.sections) return null;
    return data.result as BolusAIReport;
  } catch {
    return null;
  }
}

export async function checkModifiedDoseAI(
  engine: unknown,
  modifiedDose: number,
  language: string
): Promise<{ risk: 'ok' | 'caution' | 'danger'; message: string } | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        mode: 'bolus_check',
        language,
        bolus: engine,
        modifiedDose,
        // The safety check also sees the whole day (doses already taken,
        // meals, sport) to judge whether the edited dose is dangerous.
        healthData: buildAIDayJournal(),
      },
    });
    if (error || !data?.result?.risk) return null;
    return data.result;
  } catch {
    return null;
  }
}

/**
 * Informational insulin estimate from carbs + profile ratios.
 * Formula-based (never AI): carbs / ratio. The full calculation with glucose
 * correction lives in `services/bolusEngine.ts` (`computeSmartBolus`) — the
 * only dose calculation in this codebase since Step 14 removed a dead
 * duplicate that used to sit in `services/data.ts`.
 * NEVER presented as a prescription — the UI always shows the disclaimer.
 */
export function estimateInsulin(
  carbs: number,
  profile: Profile | null
): number | null {
  // Per-meal plan first (U per 10 g at the current meal moment), then the
  // legacy global carb_ratio. No plan at all → null (never a made-up dose).
  const r = ratioForMeal(profile, guessMealTime(new Date()));
  if (r.source === 'default') return null;
  return Math.round((carbs / r.gPerU) * 10) / 10;
}
