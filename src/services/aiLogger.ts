import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type {
  ActivityIntensity,
  ActivityKind,
  InsulinType,
  NutritionResult,
} from '@/types';

import {
  saveActivity,
  saveGlucose,
  saveInsulin,
  saveMeal,
  saveMeasure,
} from './data';

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
      minutes_ago?: number;
    }
  | {
      type: 'activity';
      kind: ActivityKind;
      duration_min: number;
      intensity: ActivityIntensity;
      minutes_ago?: number;
    }
  | { type: 'measure'; kind: 'weight' | 'hba1c'; value: number; unit: string; minutes_ago?: number };

export interface LoggerTurn {
  reply: string;
  action: LoggerAction | null;
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
    default:
      return null;
  }
}

/** Small context so the model can pick the insulin type & personalize. */
function loggerContext(): string {
  const { profile } = useAppStore.getState();
  if (!profile) return 'No profile.';
  return (
    `Patient: ${profile.name || '?'}; diabetes ${profile.diabetes_type}; ` +
    `insulin types [${(profile.insulin_types ?? []).join(', ') || 'unknown'}]; ` +
    `target ${profile.target_low}-${profile.target_high} mg/dL; ` +
    `carb ratio ${profile.carb_ratio ?? '?'} g/U. ` +
    `Local time now: ${new Date().toLocaleString('fr-FR')}.`
  );
}

/** One turn of the logging conversation. Throws on network/API failure. */
export async function sendLoggerMessage(
  history: { role: 'user' | 'assistant'; content: string }[],
  language: string
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
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const result = data?.result ?? {};
  return {
    reply: typeof result.reply === 'string' ? result.reply : '',
    action: sanitizeAction(result.action),
  };
}

/** Timestamp for the entry ("30 min ago" → backdated). */
export function actionCreatedAt(action: LoggerAction): string | undefined {
  if (!action.minutes_ago) return undefined;
  return new Date(Date.now() - action.minutes_ago * 60_000).toISOString();
}

/**
 * Persist a CONFIRMED action through the normal save pipeline (store +
 * Supabase) so it shows up everywhere: history, per-topic screens, the
 * day report, the doctor dashboard and the AI's own context.
 */
export async function applyLoggerAction(action: LoggerAction): Promise<void> {
  const at = actionCreatedAt(action);
  switch (action.type) {
    case 'insulin':
      await saveInsulin(action.dose, action.insulin_type, undefined, at);
      return;
    case 'glucose':
      await saveGlucose(action.value, undefined, at);
      return;
    case 'activity':
      await saveActivity(action.kind, action.duration_min, action.intensity, undefined, at);
      return;
    case 'measure':
      await saveMeasure(action.kind, action.value, action.unit, at);
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
      await saveMeal(result, undefined, undefined, at);
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
    // measures
    'poids', 'wazn', 'وزن', 'gewicht', 'weight', 'hba1c',
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
          'Save a meal the patient says they ate, with your realistic nutrition estimate for the described portion (you know Moroccan dishes). Confirm verbally first.',
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
    ],
  },
];

/** Rules appended to the call's system instruction. */
export const LIVE_LOG_INSTRUCTION = `
LOGGING (function calling): when the patient says they DID something —
took insulin, ate a meal, measured their glucose, did sport, weighed
themselves — and it is not yet in their data, offer to log it for them
("do you want me to add it to the app?"). Collect any missing detail
(dose, value, duration…) by asking. Then REPEAT the exact entry back and
ask for a clear yes. ONLY after the patient agrees, call the matching
log_* function. When the tool answers ok, tell them briefly it's saved
in the app. If they decline, don't call anything.`;

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
    default:
      return null;
  }
}

/** Short human summary of an applied action (call toast + AI journal). */
export function actionSummary(action: LoggerAction): string {
  switch (action.type) {
    case 'insulin':
      return `💉 ${action.dose} U`;
    case 'glucose':
      return `🩸 ${action.value} mg/dL`;
    case 'meal':
      return `🍽️ ${action.name} (≈${action.calories} kcal)`;
    case 'activity':
      return `🏃 ${action.kind} ${action.duration_min} min`;
    case 'measure':
      return `📏 ${action.value} ${action.unit}`;
  }
}
