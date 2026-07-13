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
  logEvent,
  saveActivity,
  saveGlucose,
  saveInsulin,
  saveMeal,
  saveMeasure,
} from './data';
import { createAiReminder, resolveFollowUps } from './reminders';

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
  /** What the patient said, when the turn was a voice note (Gemini
   *  listens to the audio directly — Darija included). */
  transcript?: string;
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
    transcript: typeof result.transcript === 'string' ? result.transcript : '',
  };
}

/** Timestamp for the entry ("30 min ago" → backdated). */
export function actionCreatedAt(action: { minutes_ago?: number }): string | undefined {
  if (!action.minutes_ago) return undefined;
  return new Date(Date.now() - action.minutes_ago * 60_000).toISOString();
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
      await saveMeal(result, undefined, undefined, at, action.meal_type);
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
  ].join('|'),
  'i'
);

export function looksLoggable(text: string): boolean {
  return LOGGABLE_RE.test(text);
}

/* ────────────────────────────────────────────────────────────
 * VOICE CALL (Gemini Live function calling)
 * The call declares log_* tools; the model confirms VERBALLY with the
 * patient first, then invokes the tool — the app saves and answers so
 * the model can confirm out loud.
 * ──────────────────────────────────────────────────────────── */

export const LIVE_LOG_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'log_insulin',
        description:
          'Save an insulin dose the patient says they injected. Call ONLY after the patient verbally confirmed the exact dose.',
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
          'Save a blood-glucose reading the patient reports, in mg/dL. Confirm the value verbally first.',
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
          'Save a meal the patient says they ate, with your realistic nutrition estimate for the described portion (you know Moroccan dishes). Ask which meal of the day it was (breakfast/lunch/dinner/snack) if unclear, then confirm verbally before calling.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Short dish name' },
            portion: { type: 'STRING', description: 'e.g. "1 assiette"' },
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
          required: ['name', 'calories', 'carbs', 'sugar'],
        },
      },
      {
        name: 'log_activity',
        description:
          'Save a sport/exercise session the patient reports. Confirm duration verbally first.',
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
          'Save a body measure (weight in kg or HbA1c in %) the patient reports. Confirm verbally first.',
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
          'Set a reminder the patient asked for ("rappelle-moi dans 1h de prendre mon insuline"). The app will alert them at the right time and follow up. Confirm the time verbally first.',
        parameters: {
          type: 'OBJECT',
          properties: {
            message: { type: 'STRING', description: 'Short reminder text' },
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
          "Record ANYTHING the patient did that doesn't fit the other tools but may matter for their diabetes — drank water/coffee/tea/alcohol, felt stressed/tired, skipped a meal, had a hypo snack, changed routine. Confirm verbally first.",
        parameters: {
          type: 'OBJECT',
          properties: {
            text: { type: 'STRING', description: 'Short description of what happened' },
            minutes_ago: { type: 'NUMBER' },
          },
          required: ['text'],
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

/** Rules appended to the call's system instruction. */
export const LIVE_LOG_INSTRUCTION = `
LOGGING (function calling): when the patient says they DID something —
took insulin, ate a meal, measured their glucose, did sport, drank
something, weighed themselves — FIRST check PATIENT DATA above:
- Already logged there → tell them it's already saved; do NOT log again.
- NOT in their data → tell them you don't see it in the app today and ask
  if they want you to add it ("ma-l9itch hadchi msejjel lyoum, wach bghiti
  nzido?"). Collect any missing detail (dose, value, duration, which meal
  of the day…) by asking, then repeat the entry back and ask for a clear
  yes.
WHEN THE PATIENT CONFIRMS ("ah", "wah", "oui", "yes", "ja"): you MUST
invoke the matching log_* function IMMEDIATELY, IN THAT SAME TURN, while
saying one short line that you're adding it right now ("sber chwiya,
ghanzidha daba…"). SPEAKING IS NOT SAVING: the entry is saved ONLY when
you actually call the function and it answers ok. NEVER say "it's added"
or "it's saved" unless the function really returned ok. NEVER end a turn
after the patient's yes without having called the function.
After the tool answers ok: tell them it's done ("safi, zedtha lik") and
naturally CONTINUE the conversation.
CRITICAL — never log the same thing twice: call each log function ONE
time per entry. Once the tool has answered (ok/already_saved), the entry
IS saved — do NOT call it again, even if the patient says "yes" again,
repeats themselves, asks a follow-up question about it, or a moment
passes. If the patient adds detail to the SAME entry (e.g. now mentions
the bread that came with the meal), do not create a new entry — just
acknowledge; treat it as the same already-saved item.
REMINDERS: when the patient asks to be reminded of something later
("fekerni men daba sa3a bach nakhod l'insuline"), confirm the time and
call set_reminder — the app WILL alert them at that time and follow up.
Never say you can't set reminders.
MEALS: when logging a meal, always find out which meal of the day it was
(breakfast/lunch/dinner/snack) — ask if unclear — and pass meal_type. If
the patient hasn't mentioned the day's other main meals and it's
plausible they've eaten them, gently ask what they had for the missing
ones, one at a time, and log each (never nag; ask each meal only once).
NOTES: anything else the patient did that doesn't fit the tools but may
matter (drank water/coffee/tea/alcohol, felt stressed/tired/ill, skipped
a meal…) → confirm and call log_note. Never say you can't record it.
HANG UP: the call does NOT end by itself — hanging up ONLY happens
through the end_call function. When the patient says goodbye or clearly
wants to stop ("bslama", "beslama", "thala f rassek", "au revoir",
"tschüss", "bye", "that's all thanks", "بسلامة", "مع السلامة"): say ONE
short warm goodbye sentence AND call end_call IN THAT SAME TURN. Never
skip end_call after your goodbye — without it the line stays open and
keeps billing the patient. Never call it while the patient is still
talking or only thanking you in the middle of the call.`;

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
