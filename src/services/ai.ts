import { healthyFoodAIIndex } from '@/data/healthyFoods';
import { searchMoroccanFood } from '@/data/moroccanFoods';
import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { FoodItemResult, NutritionResult, Profile } from '@/types';

import { buildAIDayJournal } from './dayLog';
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
  lines.push(
    `Patient status right now: ${activityStatus}` +
      (activityStatus === 'sick'
        ? ' (illness can RAISE glucose and change insulin needs — factor it in).'
        : activityStatus === 'injured'
          ? ' (reduced activity — factor it in).'
          : '.')
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
  if (error) throw error;
  if (data.error) throw new Error(data.error);
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
  if (error) throw error;
  if (data.error) throw new Error(data.error);
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
