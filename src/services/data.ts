import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type {
  ActivityIntensity,
  ActivityKind,
  ActivityLog,
  ActivityStatus,
  AppEvent,
  GlucoseLog,
  InsulinLog,
  InsulinType,
  LabReport,
  MealScan,
  MealType,
  MeasureKind,
  MeasureLog,
  NutritionResult,
  Profile,
} from '@/types';

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function currentUserId(): Promise<string> {
  if (isDemoMode || !supabase) return 'demo-user';
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? 'demo-user';
}

/**
 * Insert a row and return its server id + timestamp so the local copy uses
 * THEM — that's what lets deletes reach the server and lets the sync layer
 * tell synced rows (uuid) from offline ones (local timestamp id). Returns
 * null offline / in demo mode; the caller falls back to a local id and the
 * row is re-pushed by hydrateFromServer() on the next app open.
 */
async function insertReturning(
  table: string,
  payload: Record<string, unknown>
): Promise<{ id: string; created_at: string } | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select('id, created_at')
      .single();
    if (error || !data) return null;
    return data as { id: string; created_at: string };
  } catch {
    return null;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Best-effort server delete — only rows that actually live there (uuid). */
function remoteDelete(table: string, rowId: string) {
  if (isDemoMode || !supabase || !UUID_RE.test(rowId)) return;
  supabase
    .from(table)
    .delete()
    .eq('id', rowId)
    .then(
      () => {},
      () => {}
    );
}

/** Base64 → Uint8Array (atob is available on RN/Hermes and web). */
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Upload the scanned photo to the meal-images bucket (under the user's
 * folder, as the storage RLS requires) and return its public URL — that's
 * what the doctor/admin dashboard displays. Returns null on any failure;
 * the meal is saved without a server-side photo in that case.
 */
async function uploadMealPhoto(user_id: string, base64: string): Promise<string | null> {
  if (isDemoMode || !supabase || user_id === 'demo-user') return null;
  try {
    const path = `${user_id}/meal-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('meal-images')
      .upload(path, decodeBase64(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) return null;
    return supabase.storage.from('meal-images').getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function saveMeal(
  result: NutritionResult,
  imageUri?: string,
  imageBase64?: string,
  /** Optional backdated timestamp (AI logger: "I ate an hour ago"). */
  createdAt?: string,
  /** Breakfast / lunch / dinner / snack. */
  mealType?: MealType
) {
  const user_id = await currentUserId();

  // A local blob:/file: URI dies with the session — upload the photo so the
  // dashboard (and future devices) can render it, keep the local URI as a
  // fallback for immediate display.
  let remoteUrl: string | null = null;
  if (imageBase64) remoteUrl = await uploadMealPhoto(user_id, imageBase64);

  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    const httpUrl =
      remoteUrl ?? (imageUri && /^https?:/i.test(imageUri) ? imageUri : null);
    row = await insertReturning('meal_scans', {
      user_id,
      image_url: httpUrl,
      result,
      calories: result.calories,
      carbs: result.carbohydrates,
      sugar: result.sugar,
      protein: result.protein,
      fat: result.fat,
      fiber: result.fiber,
      glycemic_index: result.glycemic_index,
      confidence: result.confidence,
      ...(mealType ? { meal_type: mealType } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }

  const meal: MealScan = {
    id: row?.id ?? id(),
    user_id,
    image_url: remoteUrl ?? imageUri,
    result,
    meal_type: mealType,
    created_at: row?.created_at ?? createdAt ?? new Date().toISOString(),
  };
  useAppStore.getState().addMeal(meal);
  return meal;
}

export async function saveGlucose(value: number, notes?: string, createdAt?: string) {
  const user_id = await currentUserId();
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    row = await insertReturning('glucose_logs', {
      user_id,
      value,
      unit: 'mg/dL',
      source: 'manual',
      notes: notes ?? null,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: GlucoseLog = {
    id: row?.id ?? id(),
    user_id,
    value,
    unit: 'mg/dL',
    source: 'manual',
    notes,
    created_at: row?.created_at ?? createdAt ?? new Date().toISOString(),
  };
  useAppStore.getState().addGlucoseLog(log);
  return log;
}

export async function saveInsulin(
  dose: number,
  insulinType: InsulinType,
  notes?: string,
  createdAt?: string,
  /** Which meal this injection was for (optional). */
  mealType?: MealType
) {
  const user_id = await currentUserId();
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    row = await insertReturning('insulin_logs', {
      user_id,
      insulin_type: insulinType,
      dose,
      notes: notes ?? null,
      ...(mealType ? { meal_type: mealType } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: InsulinLog = {
    id: row?.id ?? id(),
    user_id,
    insulin_type: insulinType,
    dose,
    meal_type: mealType,
    notes,
    created_at: row?.created_at ?? createdAt ?? new Date().toISOString(),
  };
  useAppStore.getState().addInsulinLog(log);
  return log;
}

/* ─────────────────────── ACCOUNT EVENTS ───────────────────────
 * Status changes and parameter edits are part of the patient's story:
 * they land in the history/day report and in the AI's context, so the
 * assistant always knows the full current situation. */

export async function logEvent(
  kind: AppEvent['kind'],
  payload: Record<string, any>,
  createdAt?: string
) {
  const user_id = await currentUserId();
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    row = await insertReturning('event_logs', {
      user_id,
      kind,
      payload,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const event: AppEvent = {
    id: row?.id ?? id(),
    user_id,
    kind,
    payload,
    created_at: row?.created_at ?? createdAt ?? new Date().toISOString(),
  };
  useAppStore.getState().addEventLog(event);
  return event;
}

/** Change the activity status AND record it (sick/injured/paused/active). */
export async function changeActivityStatus(status: ActivityStatus) {
  const prev = useAppStore.getState().activityStatus;
  useAppStore.getState().setActivityStatus(status);
  if (prev !== status) {
    await logEvent('status', { from: prev, to: status });
  }
}

/** Medical fields whose edits must be visible in the history + to the AI. */
const TRACKED_PROFILE_FIELDS: (keyof Profile)[] = [
  'diabetes_type',
  'insulin_types',
  'target_low',
  'target_high',
  'carb_ratio',
  'correction_factor',
  'insulin_per_10g_breakfast',
  'insulin_per_10g_lunch',
  'insulin_per_10g_dinner',
  'bolus_insulin_name',
  'basal_insulin_name',
  'basal_dose',
  'basal_time',
  'weight',
  'height',
];

/**
 * Persist the profile. Updates the local store immediately (so the app and
 * the dose engine reflect the change at once), then upserts to Supabase.
 * Returns `{ ok:false }` when the server REJECTS the write (bad value vs a
 * CHECK constraint, RLS, network) so the settings screen can tell the patient
 * it did NOT save — instead of the old behaviour where the error was swallowed
 * and the change silently reverted on the next hydrate. Callers that don't
 * care (avatar, language…) can ignore the result.
 */
export async function saveProfile(profile: Profile): Promise<{ ok: boolean }> {
  const before = useAppStore.getState().profile;
  useAppStore.getState().setProfile(profile);
  if (!isDemoMode && supabase && profile.user_id !== 'demo-user') {
    const { error } = await supabase.from('profiles').upsert({
      ...profile,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false };
  }

  // Record what actually changed (skip the wizard's very first save).
  if (before && before.user_id === profile.user_id) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of TRACKED_PROFILE_FIELDS) {
      const a = JSON.stringify(before[f] ?? null);
      const b = JSON.stringify(profile[f] ?? null);
      if (a !== b) changes[f] = { from: before[f] ?? null, to: profile[f] ?? null };
    }
    if (Object.keys(changes).length) {
      await logEvent('profile', { changes });
    }
  }
  return { ok: true };
}

export async function saveActivity(
  kind: ActivityKind,
  durationMin: number,
  intensity: ActivityIntensity,
  notes?: string,
  createdAt?: string
) {
  const user_id = await currentUserId();
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    row = await insertReturning('activity_logs', {
      user_id,
      kind,
      duration_min: durationMin,
      intensity,
      notes: notes ?? null,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: ActivityLog = {
    id: row?.id ?? id(),
    user_id,
    kind,
    duration_min: durationMin,
    intensity,
    notes,
    created_at: row?.created_at ?? createdAt ?? new Date().toISOString(),
  };
  useAppStore.getState().addActivityLog(log);
  return log;
}

export async function saveMeasure(
  kind: MeasureKind,
  value: number,
  unit: string,
  createdAt?: string
) {
  const user_id = await currentUserId();
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    row = await insertReturning('measure_logs', {
      user_id,
      kind,
      value,
      unit,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: MeasureLog = {
    id: row?.id ?? id(),
    user_id,
    kind,
    value,
    unit,
    created_at: row?.created_at ?? createdAt ?? new Date().toISOString(),
  };
  useAppStore.getState().addMeasureLog(log);
  return log;
}

/**
 * Save a freshly-analyzed lab report (store + Supabase mirror). The report
 * arrives fully built by the labs screen (values extracted, options chosen).
 */
export async function saveLabReport(
  report: Omit<LabReport, 'id' | 'user_id' | 'created_at'>
): Promise<LabReport> {
  const user_id = await currentUserId();
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    row = await insertReturning('lab_reports', {
      user_id,
      lab_name: report.lab_name ?? null,
      report_date: report.report_date ?? null,
      summary: report.summary ?? null,
      values: report.values,
      medical_report: report.medical_report ?? null,
      voice_script: report.voice_script ?? null,
      has_graphs: report.has_graphs ?? true,
      image_thumb: report.image_thumb ?? null,
    });
  }
  const saved: LabReport = {
    ...report,
    id: row?.id ?? id(),
    user_id,
    created_at: row?.created_at ?? new Date().toISOString(),
  };
  useAppStore.getState().addLabReport(saved);
  return saved;
}

/** Patch a lab report locally + on the server (medical report / voice script
 *  generated after the initial save). */
export function updateLabReport(rowId: string, patch: Partial<LabReport>) {
  useAppStore.getState().updateLabReport(rowId, patch);
  if (isDemoMode || !supabase || !UUID_RE.test(rowId)) return;
  const server: Record<string, unknown> = {};
  if (patch.medical_report !== undefined) server.medical_report = patch.medical_report;
  if (patch.voice_script !== undefined) server.voice_script = patch.voice_script;
  if (patch.has_graphs !== undefined) server.has_graphs = patch.has_graphs;
  if (patch.summary !== undefined) server.summary = patch.summary;
  if (patch.values !== undefined) server.values = patch.values;
  if (!Object.keys(server).length) return;
  supabase
    .from('lab_reports')
    .update(server)
    .eq('id', rowId)
    .then(
      () => {},
      () => {}
    );
}

/**
 * Re-file a meal already in the journal under a different slot (the patient
 * saved it as lunch but it was dinner). Patches in place — the entry keeps its
 * id and its original timestamp, so the history still shows when they actually
 * ate; only the label moves.
 */
export function updateMealType(rowId: string, mealType: MealType) {
  useAppStore.getState().updateMeal(rowId, { meal_type: mealType });
  if (isDemoMode || !supabase || !UUID_RE.test(rowId)) return;
  supabase
    .from('meal_scans')
    .update({ meal_type: mealType })
    .eq('id', rowId)
    .then(
      () => {},
      () => {}
    );
}

export function deleteLabReport(rowId: string) {
  useAppStore.getState().removeLabReport(rowId);
  remoteDelete('lab_reports', rowId);
}

/* ─────────────────────────── DELETES ───────────────────────────
 * Removing an entry must also remove it on the server, otherwise the
 * next sync would resurrect it (and the doctor dashboard would keep
 * showing it). Local removal is instant; the server delete is
 * fire-and-forget. */

export function deleteGlucose(rowId: string) {
  useAppStore.getState().removeGlucoseLog(rowId);
  remoteDelete('glucose_logs', rowId);
}

export function deleteInsulin(rowId: string) {
  useAppStore.getState().removeInsulinLog(rowId);
  remoteDelete('insulin_logs', rowId);
}

export function deleteMeal(rowId: string) {
  useAppStore.getState().removeMeal(rowId);
  remoteDelete('meal_scans', rowId);
}

export function deleteActivity(rowId: string) {
  useAppStore.getState().removeActivityLog(rowId);
  remoteDelete('activity_logs', rowId);
}

export function deleteMeasure(rowId: string) {
  useAppStore.getState().removeMeasureLog(rowId);
  remoteDelete('measure_logs', rowId);
}

/** Notes logged via the AI ("I drank a coffee") live in event_logs. */
export function deleteEvent(rowId: string) {
  useAppStore.getState().removeEventLog(rowId);
  remoteDelete('event_logs', rowId);
}

/**
 * Bolus estimation from the medical profile:
 * meal bolus = carbs / carb_ratio
 * correction = max(0, glucose - target_high) / correction_factor
 * Rounded to the nearest 0.5 U. Educational estimate — not medical advice.
 */
export function computeBolus(
  carbs: number,
  glucose: number | null,
  profile: Profile | null
) {
  const ratio = profile?.carb_ratio || 10;
  const correctionFactor = profile?.correction_factor || 50;
  const targetHigh = profile?.target_high || 180;
  const targetLow = profile?.target_low || 70;
  const targetMid = Math.round((targetHigh + targetLow) / 2);

  const mealBolus = carbs > 0 ? carbs / ratio : 0;
  const correction =
    glucose && glucose > targetHigh
      ? (glucose - targetMid) / correctionFactor
      : 0;
  const total = Math.max(0, Math.round((mealBolus + correction) * 2) / 2);
  return {
    mealBolus: Math.round(mealBolus * 10) / 10,
    correction: Math.round(correction * 10) / 10,
    total,
    ratio,
    correctionFactor,
    targetMid,
    isLow: glucose !== null && glucose < targetLow,
  };
}
