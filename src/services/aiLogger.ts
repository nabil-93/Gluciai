import { isDemoMode, supabase } from '@/lib/supabase';
import { MicStreamer } from '@/services/geminiLive';
import { useAppStore } from '@/store/useAppStore';
import type {
  ActivityIntensity,
  ActivityKind,
  InsulinType,
  NutritionResult,
} from '@/types';

import {
  deleteActivity,
  deleteEvent,
  deleteGlucose,
  deleteInsulin,
  deleteMeal,
  deleteMeasure,
  logEvent,
  saveActivity,
  saveGlucose,
  saveInsulin,
  saveMeal,
  saveMeasure,
} from './data';
import { createAiReminder, markReminder, resolveFollowUps } from './reminders';

/* ────────────────────────────────────────────────────────────
 * AI LOGGER
 * The patient TELLS the assistant what they did — "rani dert 6
 * unités d'insuline", "klit tajine d lkefta", "dert 30 min de
 * marche" — and the AI turns it into a structured entry. The app
 * ALWAYS shows a confirmation before saving; once confirmed, the
 * entry goes through the normal save functions, so it lands in the
 * store, on the server, in the history screens, the day report and
 * the AI's own context. Used by: the dedicated /ai-log screen, the
 * regular chat, and the voice call (function calling).
 * ──────────────────────────────────────────────────────────── */

export type LoggerAction =
  | { type: 'insulin'; dose: number; insulin_type: InsulinType; minutes_ago?: number }
  | { type: 'glucose'; value: number; minutes_ago?: number }
  | {
      type: 'meal';
      name: string;
      portion?: string;
      calories: number;
      carbs: number;
      sugar: number;
      protein?: number;
      fat?: number;
      fiber?: number;
      glycemic_index?: number;
      meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      minutes_ago?: number;
    }
  | {
      type: 'activity';
      kind: ActivityKind;
      duration_min: number;
      intensity: ActivityIntensity;
      minutes_ago?: number;
    }
  | { type: 'measure'; kind: 'weight' | 'hba1c'; value: number; unit: string; minutes_ago?: number }
  | {
      type: 'reminder';
      message: string;
      due_in_minutes: number;
      follow_kind: 'insulin' | 'glucose' | 'meal' | 'activity' | 'measure' | 'other';
    }
  /** Anything else the patient did that doesn't fit a structured log —
   *  "I drank a glass of water", "I had a coffee", "I feel stressed". */
  | { type: 'note'; text: string; minutes_ago?: number };

export interface LoggerTurn {
  reply: string;
  action: LoggerAction | null;
  /** The patient asked to DELETE an entry ("7eyed dak tajine") — resolved
   *  against today's data and ALWAYS confirmed by the patient first. */
  remove?: DeleteRequest | null;
  /** What the patient said, when the turn was a voice note (Gemini
   *  listens to the audio directly — Darija included). */
  transcript?: string;
}

/* ────────────────────────────────────────────────────────────
 * DELETE SUPPORT
 * The AI can also REMOVE an entry (one it just added by mistake, or any
 * entry of today) — but exactly like adding, NOTHING is deleted without
 * the patient's explicit confirmation (verbal on a call, or the red
 * confirmation card in chat / on screen).
 * ──────────────────────────────────────────────────────────── */

export type DeletableKind =
  | 'insulin'
  | 'glucose'
  | 'meal'
  | 'activity'
  | 'measure'
  | 'note'
  | 'reminder';

const DELETABLE_KINDS: DeletableKind[] = [
  'insulin',
  'glucose',
  'meal',
  'activity',
  'measure',
  'note',
  'reminder',
];

/** What the model asked to delete (kind and/or free words identifying it). */
export interface DeleteRequest {
  type: 'delete';
  kind?: DeletableKind;
  query?: string;
}

/** A concrete row resolved from the store — what the patient confirms. */
export interface DeleteTarget {
  kind: DeletableKind;
  rowId: string;
  /** Human summary shown on the card and spoken by the AI. */
  summary: string;
  created_at: string;
}

export function sanitizeDeleteRequest(raw: any): DeleteRequest | null {
  if (!raw || typeof raw !== 'object' || raw.type !== 'delete') return null;
  const query =
    typeof raw.query === 'string' && raw.query.trim()
      ? raw.query.trim().slice(0, 80)
      : undefined;
  return {
    type: 'delete',
    kind: DELETABLE_KINDS.includes(raw.kind) ? raw.kind : undefined,
    query,
  };
}

/**
 * Resolve a delete request against TODAY's entries (newest first). With a
 * query, only entries whose summary contains one of its words (≥3 chars)
 * are kept — an empty result means "not found": the caller lists today's
 * entries so the AI can ask the patient which one they meant. The final
 * safety net is always the explicit confirmation of the exact entry.
 */
export function findDeleteTargets(req: {
  kind?: DeletableKind;
  query?: string;
}): DeleteTarget[] {
  const s = useAppStore.getState();
  const today = (iso: string) =>
    new Date(iso).toDateString() === new Date().toDateString();
  const want = (k: DeletableKind) => !req.kind || req.kind === k;
  const all: DeleteTarget[] = [];

  if (want('meal')) {
    for (const m of s.meals) {
      if (!today(m.created_at)) continue;
      const moment = m.meal_type ? ` · ${m.meal_type}` : '';
      all.push({
        kind: 'meal',
        rowId: m.id,
        created_at: m.created_at,
        summary: `🍽️ ${m.result.food_name} (≈${m.result.calories} kcal${moment})`,
      });
    }
  }
  if (want('insulin')) {
    for (const l of s.insulinLogs) {
      if (!today(l.created_at)) continue;
      all.push({
        kind: 'insulin',
        rowId: l.id,
        created_at: l.created_at,
        summary: `💉 ${l.dose} U ${l.insulin_type}`,
      });
    }
  }
  if (want('glucose')) {
    for (const l of s.glucoseLogs) {
      if (!today(l.created_at)) continue;
      all.push({
        kind: 'glucose',
        rowId: l.id,
        created_at: l.created_at,
        summary: `🩸 ${l.value} mg/dL`,
      });
    }
  }
  if (want('activity')) {
    for (const a of s.activityLogs) {
      if (!today(a.created_at)) continue;
      all.push({
        kind: 'activity',
        rowId: a.id,
        created_at: a.created_at,
        summary: `🏃 ${a.kind} ${a.duration_min} min`,
      });
    }
  }
  if (want('measure')) {
    for (const m of s.measureLogs) {
      if (!today(m.created_at)) continue;
      all.push({
        kind: 'measure',
        rowId: m.id,
        created_at: m.created_at,
        summary: `📏 ${m.kind === 'hba1c' ? 'HbA1c' : m.kind} ${m.value} ${m.unit}`,
      });
    }
  }
  if (want('note')) {
    for (const e of s.eventLogs) {
      if (e.kind !== 'note' || !today(e.created_at)) continue;
      all.push({
        kind: 'note',
        rowId: e.id,
        created_at: e.created_at,
        summary: `📝 ${String(e.payload?.text ?? '').slice(0, 80)}`,
      });
    }
  }
  if (want('reminder')) {
    for (const r of s.aiReminders) {
      if (r.status !== 'pending' && r.status !== 'fired') continue;
      all.push({
        kind: 'reminder',
        rowId: r.id,
        created_at: r.created_at,
        summary: `⏰ ${r.message}`,
      });
    }
  }

  all.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const q = (req.query ?? '').toLowerCase().trim();
  if (!q) return all;
  const tokens = q.split(/[\s,;:·'"()]+/).filter((t) => t.length >= 3);
  if (!tokens.length) return all;
  return all.filter((t) => {
    const hay = t.summary.toLowerCase();
    return tokens.some((tok) => hay.includes(tok));
  });
}

/** Delete a CONFIRMED target (store + server). Reminders are closed, not
 *  erased, so their history stays consistent. */
export async function applyDeleteTarget(target: DeleteTarget): Promise<void> {
  switch (target.kind) {
    case 'meal':
      deleteMeal(target.rowId);
      return;
    case 'insulin':
      deleteInsulin(target.rowId);
      return;
    case 'glucose':
      deleteGlucose(target.rowId);
      return;
    case 'activity':
      deleteActivity(target.rowId);
      return;
    case 'measure':
      deleteMeasure(target.rowId);
      return;
    case 'note':
      deleteEvent(target.rowId);
      return;
    case 'reminder':
      markReminder(target.rowId, 'done');
      return;
  }
}

const INSULIN_TYPES: InsulinType[] = ['rapid', 'long', 'mixed'];
const ACTIVITY_KINDS: ActivityKind[] = ['walk', 'run', 'bike', 'gym', 'other'];
const INTENSITIES: ActivityIntensity[] = ['low', 'medium', 'high'];

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Defensive normalization of whatever the model returned. */
export function sanitizeAction(raw: any): LoggerAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const ago =
    raw.minutes_ago != null && num(raw.minutes_ago) > 0
      ? Math.min(720, Math.round(num(raw.minutes_ago)))
      : undefined;

  switch (raw.type) {
    case 'insulin': {
      const dose = num(raw.dose);
      if (dose <= 0 || dose > 100) return null;
      return {
        type: 'insulin',
        dose: Math.round(dose * 10) / 10,
        insulin_type: INSULIN_TYPES.includes(raw.insulin_type) ? raw.insulin_type : 'rapid',
        minutes_ago: ago,
      };
    }
    case 'glucose': {
      const value = Math.round(num(raw.value));
      if (value < 20 || value > 900) return null;
      return { type: 'glucose', value, minutes_ago: ago };
    }
    case 'meal': {
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) return null;
      const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
      return {
        type: 'meal',
        name,
        portion: typeof raw.portion === 'string' ? raw.portion : undefined,
        calories: Math.max(0, Math.round(num(raw.calories))),
        carbs: Math.max(0, Math.round(num(raw.carbs))),
        sugar: Math.max(0, Math.round(num(raw.sugar))),
        protein: Math.max(0, Math.round(num(raw.protein))),
        fat: Math.max(0, Math.round(num(raw.fat))),
        fiber: Math.max(0, Math.round(num(raw.fiber))),
        glycemic_index: Math.min(110, Math.max(0, Math.round(num(raw.glycemic_index, 50)))),
        meal_type: MEALS.includes(raw.meal_type) ? raw.meal_type : undefined,
        minutes_ago: ago,
      };
    }
    case 'activity': {
      const duration = Math.round(num(raw.duration_min));
      if (duration <= 0 || duration > 600) return null;
      return {
        type: 'activity',
        kind: ACTIVITY_KINDS.includes(raw.kind) ? raw.kind : 'other',
        duration_min: duration,
        intensity: INTENSITIES.includes(raw.intensity) ? raw.intensity : 'medium',
        minutes_ago: ago,
      };
    }
    case 'measure': {
      const value = num(raw.value);
      if (value <= 0) return null;
      const kind = raw.kind === 'hba1c' ? 'hba1c' : 'weight';
      return {
        type: 'measure',
        kind,
        value: Math.round(value * 10) / 10,
        unit: typeof raw.unit === 'string' && raw.unit ? raw.unit : kind === 'weight' ? 'kg' : '%',
        minutes_ago: ago,
      };
    }
    case 'reminder': {
      const message = typeof raw.message === 'string' ? raw.message.trim() : '';
      const due = Math.round(num(raw.due_in_minutes));
      if (!message || due < 1 || due > 10_080) return null; // max 7 days
      const FOLLOW = ['insulin', 'glucose', 'meal', 'activity', 'measure', 'other'];
      return {
        type: 'reminder',
        message,
        due_in_minutes: due,
        follow_kind: FOLLOW.includes(raw.follow_kind) ? raw.follow_kind : 'other',
      };
    }
    case 'note': {
      const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 300) : '';
      if (!text) return null;
      return { type: 'note', text, minutes_ago: ago };
    }
    default:
      return null;
  }
}

/** Small context so the model can pick the insulin type, personalize, and
 *  know which meals of TODAY are already logged (to ask about the rest). */
function loggerContext(): string {
  const s = useAppStore.getState();
  const { profile, meals } = s;
  const now = new Date();
  const isToday = (iso: string) =>
    new Date(iso).toDateString() === now.toDateString();
  const todayMeals = meals.filter((m) => isToday(m.created_at));
  const logged = new Set(
    todayMeals.map((m) => m.meal_type).filter(Boolean) as string[]
  );
  const mealsLine =
    todayMeals.length === 0
      ? 'No meals logged today yet.'
      : `Meals already logged today: ${todayMeals
          .map((m) => `${m.meal_type ?? 'meal'} (${m.result.food_name})`)
          .join(', ')}. Meal moments still MISSING today: ${
          ['breakfast', 'lunch', 'dinner'].filter((k) => !logged.has(k)).join(', ') ||
          'none'
        }.`;

  const base = profile
    ? `Patient: ${profile.name || '?'}; diabetes ${profile.diabetes_type}; ` +
      `insulin types [${(profile.insulin_types ?? []).join(', ') || 'unknown'}]; ` +
      `target ${profile.target_low}-${profile.target_high} mg/dL; ` +
      `carb ratio ${profile.carb_ratio ?? '?'} g/U. `
    : 'No profile. ';
  return base + `Local time now: ${now.toLocaleString('fr-FR')}. ${mealsLine}`;
}

/** One turn of the logging conversation. Throws on network/API failure.
 *  `audio` (base64 WAV + mime) sends a voice note — Gemini hears it
 *  directly, in any language or dialect, and returns the transcript. */
export async function sendLoggerMessage(
  history: { role: 'user' | 'assistant'; content: string }[],
  language: string,
  audio?: { mimeType: string; data: string }
): Promise<LoggerTurn> {
  if (isDemoMode || !supabase) {
    return { reply: '…', action: null };
  }
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      mode: 'logger',
      language,
      messages: history,
      healthData: loggerContext(),
      ...(audio ? { audio } : {}),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const result = data?.result ?? {};
  return {
    reply: typeof result.reply === 'string' ? result.reply : '',
    action: sanitizeAction(result.action),
    remove: sanitizeDeleteRequest(result.action),
    transcript: typeof result.transcript === 'string' ? result.transcript : '',
  };
}

/** Timestamp for the entry ("30 min ago" → backdated). */
export function actionCreatedAt(action: { minutes_ago?: number }): string | undefined {
  if (!action.minutes_ago) return undefined;
  return new Date(Date.now() - action.minutes_ago * 60_000).toISOString();
}

/* Typical hour windows of each meal moment + the representative hour an
 * entry is filed at when it's logged OUTSIDE its window ("klit f lghda"
 * said at night → the entry lands at 13:00, not 23:00). */
const MEAL_WINDOWS: Record<
  'breakfast' | 'lunch' | 'dinner',
  { start: number; end: number; rep: number }
> = {
  breakfast: { start: 5, end: 11, rep: 8 },
  lunch: { start: 11, end: 16, rep: 13 },
  dinner: { start: 16, end: 23, rep: 20 },
};

/**
 * When the patient logs a meal AFTER the fact ("klit tajine f lghda" said
 * in the evening) the entry must carry the time of the MEAL MOMENT they
 * confirmed, not the time they happened to tell the AI — otherwise every
 * hour-based view (home slots, carb chart, doctor dashboard) files it
 * under the wrong meal. Returns undefined when "now" is already fine
 * (logging during the meal's own window, snacks, or a moment further than
 * ~12 h back — those are refused upstream anyway).
 */
export function mealMomentBackdate(
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
): string | undefined {
  if (!mealType || mealType === 'snack') return undefined;
  const win = MEAL_WINDOWS[mealType];
  const now = new Date();
  const h = now.getHours();
  if (h >= win.start && h < win.end) return undefined; // logged in-window → keep now
  const cand = new Date(now);
  cand.setHours(win.rep, 0, 0, 0);
  // "l3cha" said at 2 am → yesterday's dinner 20:00.
  if (cand.getTime() > now.getTime()) cand.setDate(cand.getDate() - 1);
  // Never invent an entry more than ~12 h in the past.
  if (now.getTime() - cand.getTime() > 12 * 3_600_000) return undefined;
  return cand.toISOString();
}

/**
 * Persist a CONFIRMED action through the normal save pipeline (store +
 * Supabase) so it shows up everywhere: history, per-topic screens, the
 * day report, the doctor dashboard and the AI's own context.
 */
export async function applyLoggerAction(action: LoggerAction): Promise<void> {
  const at = 'minutes_ago' in action ? actionCreatedAt(action) : undefined;
  switch (action.type) {
    case 'insulin':
      await saveInsulin(action.dose, action.insulin_type, undefined, at);
      resolveFollowUps('insulin');
      return;
    case 'glucose':
      await saveGlucose(action.value, undefined, at);
      resolveFollowUps('glucose');
      return;
    case 'activity':
      await saveActivity(action.kind, action.duration_min, action.intensity, undefined, at);
      resolveFollowUps('activity');
      return;
    case 'measure':
      await saveMeasure(action.kind, action.value, action.unit, at);
      resolveFollowUps('measure');
      return;
    case 'reminder':
      await createAiReminder(
        action.message,
        new Date(Date.now() + action.due_in_minutes * 60_000),
        action.follow_kind
      );
      return;
    case 'note':
      await logEvent('note', { text: action.text }, at);
      return;
    case 'meal': {
      const result: NutritionResult = {
        food_name: action.name,
        estimated_portion: action.portion || '1 portion',
        calories: action.calories,
        carbohydrates: action.carbs,
        sugar: action.sugar,
        protein: action.protein ?? 0,
        fat: action.fat ?? 0,
        fiber: action.fiber ?? 0,
        glycemic_index: action.glycemic_index ?? 50,
        confidence: 0.6,
        nutrition_confidence: 0.5,
        source: 'ai_estimate',
        warnings: [],
      };
      // An explicit "30 min ago" from the patient wins; otherwise file the
      // entry at the hour of the CONFIRMED meal moment ("f lghda" said at
      // night → 13:00), so time-based views agree with what they chose.
      const mealAt = at ?? mealMomentBackdate(action.meal_type);
      await saveMeal(result, undefined, undefined, mealAt, action.meal_type);
      resolveFollowUps('meal');
      return;
    }
  }
}

/**
 * Cheap local pre-filter for the REGULAR chat: only when the message
 * plausibly states a loggable event do we spend an extra AI call on
 * extraction. Covers French / English / German / Arabic script / Darija
 * in Latin letters.
 */
const LOGGABLE_RE = new RegExp(
  [
    // insulin
    'insulin', 'nsulin', 'أنسولين', 'انسولين', 'الانسولين',
    // doses / units
    'unit[ée]s?', 'وحدات', 'وحدة', '\\bU\\b', 'einheiten',
    // eating
    'klit', 'klina', 'mang[ée]', 'gegessen', '\\bate\\b', 'eaten', 'كليت', 'أكلت', 'tajine', 'couscous', 'harira',
    // glucose
    'glyc[ée]mie', 'sokar', 'sokkar', 'سكر', 'blutzucker', 'glucose', 'mg/dl',
    // sport
    'sport', 'marche', 'mchit', 'jrit', 'course', 'v[ée]lo', 'gym', 'الرياضة', 'مشيت', 'جريت', 'gelaufen',
    // "I did / I took" (Darija & co.)
    '\\bdert\\b', '\\bdrt\\b', 'khdit', 'درت', 'خديت', 'قست', '9est\\b',
    // measures
    'poids', 'wazn', 'وزن', 'gewicht', 'weight', 'hba1c',
    // reminders
    'rappel', 'rappelle', 'fekerni', 'fakarni', 'fekkerni', 'remind', 'erinner', 'ذكرني', 'فكرني', 'تذكير',
    // explicit "add/save it for me" requests — the patient asks the AI
    // to record something ("zid liya...", "ajoute...", "sejjel...")
    'ajout', '\\bzid', 'zidi', 'sejjel', 'sajjel', 'sjjel', 'enregistr',
    'sauvegard', '\\badd\\b', '\\bsave\\b', '\\blog\\b', 'hinzufüg', 'notier',
    'زيد', 'سجل', 'ضيف', 'أضف',
    // meal-moment answers (the logger asks "which meal was it?" — the
    // reply alone must re-trigger extraction)
    'ftour', 'fdour', 'lghda', '\\bghda\\b', 'l3cha', '\\b3cha\\b',
    'petit[- ]?d[ée]j', 'd[ée]jeuner', 'd[îi]ner', 'souper', 'collation',
    '\\bsnack\\b', 'breakfast', '\\blunch\\b', '\\bdinner\\b',
    'fr[üu]hst[üu]ck', 'mittagessen', 'abendessen', 'فطور', 'غداء', 'عشاء',
    // free-text notes: drinking, feelings, routine — anything that can
    // affect glucose/insulin and that the patient wants recorded
    'chrbt', 'chrebt', 'شربت', 'bu\\b', 'getrunken', 'drank', 'drunk',
    'lma\\b', "l'?ma", 'الما', 'ماء', 'eau', 'wasser', 'water',
    'caf[ée]', '9ahwa', 'قهوة', 'kaffee', 'coffee', 'th[ée]\\b', 'atay', 'أتاي', 'شاي',
    'stress', 'fatigu', '3yan', '3ayan', 'عيان', 'متعب', 'm[üu]de', 'tired',
    'dokht', 'دخت', 'malade', '3endi', 'nervous', '9le9',
    // delete requests — the patient asks to REMOVE an entry the AI (or
    // they) added ("7eyedha", "mse7 dak tajine", "supprime", "احذف")
    '7ey+ed', '7iy+ed', 'hay+ed', '7ayed', 'mse7', 'msse7', '\\bms7\\b',
    'supprim', 'efface', 'retire', 'enl[eè]ve', 'annul',
    '\\bdelete\\b', '\\bremove\\b', '\\berase\\b', 'l[öo]sch', 'entfern',
    'امسح', 'احذف', 'حذف', 'حيد', 'أزل',
  ].join('|'),
  'i'
);

export function looksLoggable(text: string): boolean {
  return LOGGABLE_RE.test(text);
}

/* ────────────────────────────────────────────────────────────
 * VOICE CALL (Gemini Live function calling)
 * STRICT two-step protocol: every log_* / delete_entry call is only a
 * PROPOSAL — the app shows a confirmation card and answers
 * confirmation_required. Nothing is saved or deleted until the patient
 * either SAYS yes (→ the model calls confirm_entry) or TAPS the button
 * on screen (→ the app tells the model via a system text turn).
 * ──────────────────────────────────────────────────────────── */

export const LIVE_LOG_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'log_insulin',
        description:
          'PROPOSE saving an insulin dose the patient says they injected. Saves NOTHING yet: a confirmation card appears and the patient must confirm (verbally → then call confirm_entry, or by tapping the card).',
        parameters: {
          type: 'OBJECT',
          properties: {
            dose: { type: 'NUMBER', description: 'Units of insulin' },
            insulin_type: { type: 'STRING', enum: ['rapid', 'long', 'mixed'] },
            minutes_ago: {
              type: 'NUMBER',
              description: 'How many minutes ago; omit if just now',
            },
          },
          required: ['dose', 'insulin_type'],
        },
      },
      {
        name: 'log_glucose',
        description:
          'PROPOSE saving a blood-glucose reading the patient reports, in mg/dL. Saves nothing until the patient confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            value: { type: 'NUMBER', description: 'Glucose in mg/dL' },
            minutes_ago: { type: 'NUMBER' },
          },
          required: ['value'],
        },
      },
      {
        name: 'log_meal',
        description:
          'PROPOSE saving a meal the patient ate, with your realistic nutrition estimate for the described portion (you know Moroccan dishes). BEFORE calling, ask: which meal of the day it was, whether they ate/drank anything with it (bread, tea…), and the portion size. ONE combined entry including the sides. Saves nothing until the patient confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description:
                'Short dish name incl. sides, WRITTEN IN THE APP LANGUAGE (dish proper names stay), e.g. German app: "Tajine Kefta + halbes Brot"',
            },
            portion: {
              type: 'STRING',
              description: 'In the app language, e.g. "1 mittlerer Teller" / "1 assiette moyenne"',
            },
            calories: { type: 'NUMBER' },
            carbs: { type: 'NUMBER', description: 'grams of carbohydrates' },
            sugar: { type: 'NUMBER', description: 'grams of sugar' },
            protein: { type: 'NUMBER' },
            fat: { type: 'NUMBER' },
            fiber: { type: 'NUMBER' },
            glycemic_index: { type: 'NUMBER' },
            meal_type: {
              type: 'STRING',
              enum: ['breakfast', 'lunch', 'dinner', 'snack'],
            },
            minutes_ago: { type: 'NUMBER' },
          },
          required: ['name', 'calories', 'carbs', 'sugar', 'meal_type'],
        },
      },
      {
        name: 'log_activity',
        description:
          'PROPOSE saving a sport/exercise session the patient reports. Ask the duration first. Saves nothing until the patient confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            kind: { type: 'STRING', enum: ['walk', 'run', 'bike', 'gym', 'other'] },
            duration_min: { type: 'NUMBER' },
            intensity: { type: 'STRING', enum: ['low', 'medium', 'high'] },
            minutes_ago: { type: 'NUMBER' },
          },
          required: ['kind', 'duration_min'],
        },
      },
      {
        name: 'log_measure',
        description:
          'PROPOSE saving a body measure (weight in kg or HbA1c in %) the patient reports. Saves nothing until the patient confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            kind: { type: 'STRING', enum: ['weight', 'hba1c'] },
            value: { type: 'NUMBER' },
            unit: { type: 'STRING', enum: ['kg', '%'] },
            minutes_ago: { type: 'NUMBER' },
          },
          required: ['kind', 'value'],
        },
      },
      {
        name: 'set_reminder',
        description:
          'PROPOSE a reminder the patient asked for ("rappelle-moi dans 1h de prendre mon insuline"). The app will alert them at the right time and follow up. Nothing is set until the patient confirms.',
        parameters: {
          type: 'OBJECT',
          properties: {
            message: {
              type: 'STRING',
              description: 'Short reminder text, written in the APP language',
            },
            due_in_minutes: {
              type: 'NUMBER',
              description: 'Minutes from now (max 10080 = 7 days)',
            },
            follow_kind: {
              type: 'STRING',
              enum: ['insulin', 'glucose', 'meal', 'activity', 'measure', 'other'],
            },
          },
          required: ['message', 'due_in_minutes'],
        },
      },
      {
        name: 'log_note',
        description:
          "PROPOSE recording ANYTHING the patient did that doesn't fit the other tools but may matter for their diabetes — drank water/coffee/tea/alcohol, felt stressed/tired, skipped a meal, had a hypo snack, changed routine. Saves nothing until the patient confirms.",
        parameters: {
          type: 'OBJECT',
          properties: {
            text: {
              type: 'STRING',
              description:
                'Short description of what happened, written in the APP language (never in the spoken dialect)',
            },
            minutes_ago: { type: 'NUMBER' },
          },
          required: ['text'],
        },
      },
      {
        name: 'delete_entry',
        description:
          'PROPOSE DELETING one of today\'s entries when the patient asks to remove something ("7eyedha", "mse7 dak tajine", "supprime-le", "احذفها") — including an entry that was just added by mistake. Deletes NOTHING yet: the app finds the entry, shows a red confirmation card and answers confirmation_required. If it answers not_found, read the todays_entries list to the patient and ask which one they mean.',
        parameters: {
          type: 'OBJECT',
          properties: {
            kind: {
              type: 'STRING',
              enum: ['insulin', 'glucose', 'meal', 'activity', 'measure', 'note', 'reminder'],
              description: 'Type of entry to delete',
            },
            query: {
              type: 'STRING',
              description:
                'Words identifying the entry — use the words of the entry AS STORED in PATIENT DATA (stored names are in the app language), not the dialect words the patient just spoke',
            },
          },
        },
      },
      {
        name: 'confirm_entry',
        description:
          'EXECUTE the pending proposal (save or delete) — call it ONLY after the patient clearly said YES out loud ("ah", "wah", "oui", "yes", "ok") to the proposal you just read back to them. Never call it in the same turn as the proposal itself.',
        parameters: {
          type: 'OBJECT',
          properties: {
            pending_id: {
              type: 'STRING',
              description: 'The pending_id returned by the proposal call',
            },
          },
          required: ['pending_id'],
        },
      },
      {
        name: 'cancel_entry',
        description:
          'DISCARD the pending proposal — call it when the patient says no, hesitates, or wants to change something. You can then re-propose a corrected entry.',
        parameters: {
          type: 'OBJECT',
          properties: {
            pending_id: {
              type: 'STRING',
              description: 'The pending_id returned by the proposal call',
            },
          },
          required: ['pending_id'],
        },
      },
      {
        name: 'end_call',
        description:
          "Hang up and END the phone call — the call can ONLY end through this function; it never ends by itself. Call it when the patient clearly wants to end the call or says goodbye — e.g. \"bslama\", \"beslama\", \"thala f rassek\", \"au revoir\", \"tschüss\", \"bye\", \"salam bye\", \"that's all thanks\", \"c'est bon merci\", \"يالله بسلامة\", \"مع السلامة\". Say one short warm goodbye out loud AND call end_call in the SAME turn — never say goodbye without calling it. Do NOT call it while the patient is still talking or only thanking you mid-conversation.",
        parameters: { type: 'OBJECT', properties: {} },
      },
    ],
  },
];

/** Rules appended to the call's system instruction. `langName` is the APP
 *  language — the language every saved value must be WRITTEN in, whatever
 *  dialect the conversation itself is in. */
export const liveLogInstruction = (langName: string) => `
LOGGING — ABSOLUTE RULE: you NEVER save, change or delete ANYTHING in the
patient's account without their EXPLICIT confirmation, entry by entry.
Every log_*, set_reminder and delete_entry call is only a PROPOSAL: it
saves NOTHING — the app shows a confirmation card on the patient's screen
and answers you {status:"confirmation_required", pending_id:"..."}.

THE FLOW (always, no exception):
1. The patient mentions they DID something (insulin, meal, glucose,
   sport, drink…) → FIRST check PATIENT DATA above:
   - already logged there → tell them it's already saved; do NOT propose
     it again;
   - not there → tell them you don't see it and ask if they want you to
     add it ("ma-l9itch hadchi msejjel lyoum, wach bghiti nzido?").
2. COLLECT the details by asking (see MEAL DETAILS below; insulin → exact
   dose and type; glucose → exact value; sport → duration). NEVER invent
   a missing critical number.
3. PROPOSE: call the matching log_* function. It answers
   confirmation_required with a pending_id, and a green card appears on
   the patient's screen.
4. ASK OUT LOUD: read the entry back in the patient's own language and
   ask them to confirm — e.g. "ghanzid lik: tajine dial lghda m3a ness
   khobza, taqriban 520 kcal — wach n'confirmiha? goul liya wah, wla
   wrek 3la l'bouton lakhder". The patient can EITHER answer with their
   voice OR tap the button on screen. WAIT for their answer — never call
   confirm_entry in the same turn as the proposal.
5. RESOLVE:
   - patient says YES ("ah","wah","oui","yes","ja","ok","confirmi") →
     call confirm_entry with the pending_id. ONLY when it answers
     {saved:true} (or {deleted:true}) say it's done ("safi, zedtha lik").
   - patient says NO or corrects something → call cancel_entry, then
     re-propose the corrected entry if needed.
   - patient TAPS the card instead: you receive a system message in
     parentheses telling you what happened — acknowledge it briefly out
     loud and do NOT call confirm_entry or re-propose.
NEVER say "it's added / saved / deleted" unless the function really
answered saved:true or deleted:true. SPEAKING IS NOT SAVING.

DATA LANGUAGE (critical): this patient's app runs in ${langName}. EVERY
value you WRITE into a tool call — meal "name" and "portion", note
"text", reminder "message" — MUST be written in ${langName}, no matter
what language or dialect you are SPEAKING with the patient. You talk
Darija, you write ${langName}: patient says "chrebt kass dial lma" →
log_note text (if the app is German) "Ein Glas Wasser getrunken", (if
French) "A bu un verre d'eau". Keep proper dish names as names (tajine,
harira, couscous stay tajine, harira, couscous) and translate the rest
("… m3a ness khobza" → "… mit einem halben Brot"). For delete_entry,
"query" must use the words of the entry AS STORED in PATIENT DATA (they
are in ${langName}), not the dialect words the patient just used.

MEAL DETAILS — before proposing a meal, make sure you know ALL of this
(ask naturally, 1-2 short questions at a time; skip what they already
said):
- WHICH MEAL of the day: breakfast, lunch, dinner or snack ("hadi f
  lghda wla f l3cha?") — required.
- WHAT ELSE with it: did they eat or drink anything alongside — bread,
  salad, fruit, sweet tea, soda… ("wach klit wla chrebti chi 7aja
  m3aha? khobz, atay?"). Fold EVERYTHING into ONE single meal entry:
  mention the sides in the name and include them in the nutrition
  estimate. Never create a second entry for the sides.
- PORTION SIZE for carb-heavy items (khobz, tajine, couscous, rice,
  msemen…): ask HOW MUCH — "ch7al klit men khobz: rob3, ness, wla
  khobza kamla?", small/medium/large plate — and scale your estimate.
If the patient hasn't mentioned the day's other main meals and it's
plausible they've eaten them, gently ask about the missing ones, one at
a time (never nag; ask each meal only once), each as its OWN proposal.

DELETING: when the patient asks to remove something ("7eyedha", "mse7
dak tajine", "supprime", "احذفها") — including an entry that was just
added by mistake — call delete_entry with the kind and identifying
words. If it answers not_found, read them the todays_entries list from
the answer and ask which one they mean. Deleting follows the SAME
confirmation flow: red card + verbal yes (confirm_entry) or tap. Never
say you can't delete an entry.

DUPLICATES: propose each thing ONCE. Once confirm_entry answered (or the
system message said the patient tapped confirm), the entry IS handled —
do NOT propose or confirm it again, even if the patient says "yes" again
or repeats themselves. If the patient adds detail to an ALREADY SAVED
meal (e.g. now mentions the bread), do not create a new entry — offer to
delete the old one and re-add it complete, or just acknowledge.

REMINDERS: when the patient asks to be reminded of something later
("fekerni men daba sa3a bach nakhod l'insuline"), collect the time and
propose set_reminder — same confirmation flow. The app WILL alert them
at that time and follow up. Never say you can't set reminders.
NOTES: anything else the patient did that doesn't fit the tools but may
matter (drank water/coffee/tea/alcohol, felt stressed/tired/ill, skipped
a meal…) → propose log_note, same confirmation flow. Never say you can't
record it.
HANG UP: the call does NOT end by itself — hanging up ONLY happens
through the end_call function. When the patient says goodbye or clearly
wants to stop ("bslama", "beslama", "thala f rassek", "au revoir",
"tschüss", "bye", "that's all thanks", "بسلامة", "مع السلامة"): say ONE
short warm goodbye sentence AND call end_call IN THAT SAME TURN. Never
skip end_call after your goodbye — without it the line stays open and
keeps billing the patient. Never call it while the patient is still
talking or only thanking you in the middle of the call. end_call and
cancel_entry/confirm_entry are the only functions exempt from the
confirmation flow.`;

/** Map a Live-API function call to a validated LoggerAction. */
export function actionFromFunctionCall(
  name: string,
  args: Record<string, unknown>
): LoggerAction | null {
  switch (name) {
    case 'log_insulin':
      return sanitizeAction({ type: 'insulin', ...args });
    case 'log_glucose':
      return sanitizeAction({ type: 'glucose', ...args });
    case 'log_meal':
      return sanitizeAction({ type: 'meal', ...args });
    case 'log_activity':
      return sanitizeAction({ type: 'activity', intensity: 'medium', ...args });
    case 'log_measure':
      return sanitizeAction({ type: 'measure', ...args });
    case 'set_reminder':
      return sanitizeAction({ type: 'reminder', follow_kind: 'other', ...args });
    case 'log_note':
      return sanitizeAction({ type: 'note', ...args });
    default:
      return null;
  }
}

/* ────────────────────────────────────────────────────────────
 * VOICE NOTES
 * Records the mic as 16 kHz PCM (the same battle-tested pipeline as
 * the live call) and packages it as a WAV that Gemini listens to
 * DIRECTLY — no browser speech-to-text, so Darija and mixed dialects
 * are understood exactly like typed text.
 * ──────────────────────────────────────────────────────────── */

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Wrap raw 16 kHz 16-bit mono PCM in a WAV container (44-byte header). */
function pcmToWav(pcm: Uint8Array): Uint8Array {
  const wav = new Uint8Array(44 + pcm.length);
  const dv = new DataView(wav.buffer);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) wav[off + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, 16000, true); // sample rate
  dv.setUint32(28, 32000, true); // byte rate (16000 × 2)
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  dv.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

export const VOICE_NOTE_MAX_MS = 30_000;

/** Short in-app tones so the patient HEARS recording start/stop, generated
 *  with WebAudio (no asset files). Non-blocking and best-effort. */
export function playCue(kind: 'start' | 'stop') {
  if (typeof window === 'undefined') return;
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    // start = rising two-note "ding"; stop = falling two-note "dong".
    const notes =
      kind === 'start'
        ? [
            { f: 660, t: 0, d: 0.09 },
            { f: 990, t: 0.1, d: 0.13 },
          ]
        : [
            { f: 780, t: 0, d: 0.09 },
            { f: 520, t: 0.1, d: 0.14 },
          ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.f;
      const at = now + n.t;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + n.d + 0.02);
    }
    // Release the context shortly after the cue finished.
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {}
}

export class VoiceNoteRecorder {
  private mic: MicStreamer | null = null;
  private chunks: Uint8Array[] = [];
  /** Live input level 0..1 for the animated waveform (throttled ~60 ms). */
  onLevel: ((level: number) => void) | null = null;
  private lastLevelEmit = 0;

  /** Must be called from a user tap (iOS audio-context rule). */
  async start(): Promise<void> {
    this.chunks = [];
    playCue('start');
    this.mic = new MicStreamer();
    await this.mic.start((b64) => {
      const bytes = b64ToBytes(b64);
      this.chunks.push(bytes);
      this.emitLevel(bytes);
    });
  }

  /** RMS of the 16-bit PCM chunk → a normalized level for the UI meter. */
  private emitLevel(bytes: Uint8Array) {
    if (!this.onLevel) return;
    const now = Date.now();
    if (now - this.lastLevelEmit < 60) return;
    this.lastLevelEmit = now;
    const i16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length >> 1);
    let sum = 0;
    for (let i = 0; i < i16.length; i++) {
      const v = i16[i] / 32768;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / Math.max(1, i16.length));
    // Map a useful speech range (~0.01–0.3 RMS) to 0..1, lightly curved.
    const level = Math.min(1, Math.max(0, (rms - 0.008) / 0.22));
    this.onLevel(Math.pow(level, 0.6));
  }

  /** Stop and return the WAV voice note (null when too short ~<0.4 s). */
  stop(): { mimeType: string; data: string } | null {
    try {
      this.mic?.stop();
    } catch {}
    this.mic = null;
    playCue('stop');
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    if (total < 12_000) return null;
    const pcm = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    this.chunks = [];
    return { mimeType: 'audio/wav', data: bytesToB64(pcmToWav(pcm)) };
  }

  cancel() {
    try {
      this.mic?.stop();
    } catch {}
    this.mic = null;
    playCue('stop');
    this.chunks = [];
  }
}

/** Short human summary of an applied action (call toast + AI journal). */
export function actionSummary(action: LoggerAction): string {
  switch (action.type) {
    case 'insulin':
      return `💉 ${action.dose} U`;
    case 'glucose':
      return `🩸 ${action.value} mg/dL`;
    case 'meal': {
      const moment = action.meal_type
        ? { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' }[action.meal_type]
        : '';
      return `🍽️ ${moment ? moment + ' ' : ''}${action.name} (≈${action.calories} kcal)`;
    }
    case 'activity':
      return `🏃 ${action.kind} ${action.duration_min} min`;
    case 'measure':
      return `📏 ${action.value} ${action.unit}`;
    case 'reminder':
      return `⏰ ${action.message}`;
    case 'note':
      return `📝 ${action.text}`;
  }
}
