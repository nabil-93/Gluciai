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
  PendingSync,
  Profile,
} from '@/types';

import { mirrorColumn as mirror } from './nutrition/nutrientProvenance';

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * A durable identity for one clinical event, minted on the DEVICE that records
 * it (findings P5-005 / RC-4).
 *
 * Every event table's primary key is `id uuid primary key default
 * gen_random_uuid()`, and the default only applies when the column is OMITTED —
 * so a client-supplied uuid is accepted with no schema change, and RLS gates on
 * `user_id`, never on `id`. That single fact is what lets the sync layer stop
 * guessing:
 *
 *   · the same event pushed twice collides on its own key and stays ONE row;
 *   · two genuinely identical events (a split dose: 6 U, then 6 U a minute
 *     later) carry different keys and stay TWO rows.
 *
 * The old `id()` above minted a timestamp string, which the server could not
 * accept as a uuid, so the row was inserted without a key and came back with a
 * different one. Rows created before this change still carry those ids; the
 * sync layer recognizes both shapes.
 */
function newEventId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  // Hermes ships no `crypto` global, and adding a polyfill would be a new
  // dependency. A v4 laid out by hand from `Math.random` carries the same 122
  // random bits; for one patient's own rows the collision probability is not a
  // number that matters, and the value is a syntactically valid uuid either way.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function currentUserId(): Promise<string> {
  if (isDemoMode || !supabase) return 'demo-user';
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? 'demo-user';
}

/**
 * What actually happened to a write (finding DATA-1).
 *
 * The previous signature was `… | null`, and that `null` meant four different
 * things: demo mode, no network, a rejected insert, a thrown client. The caller
 * could only treat them alike — keep the row locally and report success — so a
 * write the server REFUSED looked exactly like a write it never heard about.
 *
 *   · `stored`  — the server has it. `created_at` is the server's.
 *   · `local`   — no attempt was made (demo mode, or no client configured).
 *                 Expected, not a failure.
 *   · `failed`  — an attempt WAS made and did not confirm. The row is still
 *                 kept locally and re-pushed by `hydrateFromServer()`, which is
 *                 the offline-first guarantee; what changes is that the caller
 *                 can no longer mistake this for confirmed persistence.
 */
export type WriteOutcome =
  | { state: 'stored'; id: string; created_at: string }
  | { state: 'local' }
  | { state: 'failed'; reason: string };

/**
 * Insert a row the CLIENT has already given an identity to, and report what
 * happened. The returned `created_at` is the server's, so a stored row shows
 * the same instant everywhere; the id is the one that was sent.
 */
async function insertReturning(
  table: string,
  payload: Record<string, unknown>
): Promise<WriteOutcome> {
  if (isDemoMode || !supabase) return { state: 'local' };
  try {
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select('id, created_at')
      .single();
    if (error || !data) {
      // Carried back rather than swallowed. There is deliberately no logging
      // side-effect here: crash reporting is disabled by design (Step 8) and
      // wiring an emitter would be a different remediation.
      return { state: 'failed', reason: error?.message ?? 'no row returned' };
    }
    return { state: 'stored', ...(data as { id: string; created_at: string }) };
  } catch (e) {
    return { state: 'failed', reason: e instanceof Error ? e.message : 'insert threw' };
  }
}

/** The row's own id and timestamp when the server took it, the client's when it
 *  did not — either way the LOCAL row keeps the identity the device minted. */
function rowIdentity(
  outcome: WriteOutcome,
  clientId: string,
  clientCreatedAt: string
): {
  id: string;
  created_at: string;
  pending_sync?: true;
  sync_state?: 'local' | 'failed';
} {
  // `pending_sync` is unchanged — the sync layer still reads exactly one bit,
  // and dedup, retry and identity are untouched. `sync_state` is the SECOND
  // bit, for the screen that is about to tell the patient what happened: until
  // Step 18 a write nobody attempted and a write the server REFUSED were the
  // same row, so both were announced as "saved" (DATA-1's UI half).
  return outcome.state === 'stored'
    ? { id: outcome.id, created_at: outcome.created_at }
    : {
        id: clientId,
        created_at: clientCreatedAt,
        pending_sync: true,
        sync_state: outcome.state,
      };
}

/**
 * The i18n key for what actually happened to a saved row (DATA-1's UI half).
 *
 * Kept here, beside `rowIdentity`, so every screen tells the same truth from
 * the same two fields, and pure so it can be tested without a renderer:
 *
 *   confirmed        → the server has it
 *   pending, local   → kept on this device, nothing was attempted
 *   pending, failed  → attempted and refused; still kept, retried on next sync
 *
 * Offline-first is unchanged in all three cases: the row is never dropped.
 */
export function savedStateKey(row: PendingSync | null | undefined): string {
  if (row?.sync_state === 'failed') return 'common.savedFailed';
  if (row?.pending_sync) return 'common.savedLocal';
  return 'common.savedRemote';
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

  // The identity of this meal, decided here and never reassigned: the same
  // value goes to the server and stays on the local row, so a re-push can
  // collide with itself instead of becoming a second meal.
  const eventId = newEventId();
  const at = createdAt ?? new Date().toISOString();

  let outcome: WriteOutcome = { state: 'local' };
  if (user_id !== 'demo-user') {
    const httpUrl =
      remoteUrl ?? (imageUri && /^https?:/i.test(imageUri) ? imageUri : null);
    outcome = await insertReturning('meal_scans', {
      id: eventId,
      user_id,
      image_url: httpUrl,
      result,
      // Every mirror column is a number or nothing. When a value is not
      // actually known the result holds a placeholder 0, and writing that would
      // put a fabricated figure in a column other readers — the dashboard, the
      // doctor report — treat as fact. The columns are nullable; say nothing
      // instead. (`result` keeps the full picture, including the provenance.)
      // Step 10 did this for the carbohydrate; Step 22B does it for the rest.
      calories: mirror(result, 'calories', result.calories),
      carbs: result.carbs_known === false ? null : result.carbohydrates,
      sugar: mirror(result, 'sugar', result.sugar),
      protein: mirror(result, 'protein', result.protein),
      fat: mirror(result, 'fat', result.fat),
      fiber: mirror(result, 'fiber', result.fiber),
      glycemic_index: result.glycemic_index,
      confidence: result.confidence,
      ...(mealType ? { meal_type: mealType } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }

  const meal: MealScan = {
    ...rowIdentity(outcome, eventId, at),
    user_id,
    image_url: remoteUrl ?? imageUri,
    result,
    meal_type: mealType,
  };
  useAppStore.getState().addMeal(meal);
  return meal;
}

export async function saveGlucose(value: number, notes?: string, createdAt?: string) {
  const user_id = await currentUserId();
  const eventId = newEventId();
  const at = createdAt ?? new Date().toISOString();
  let outcome: WriteOutcome = { state: 'local' };
  if (user_id !== 'demo-user') {
    outcome = await insertReturning('glucose_logs', {
      id: eventId,
      user_id,
      value,
      unit: 'mg/dL',
      source: 'manual',
      notes: notes ?? null,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: GlucoseLog = {
    ...rowIdentity(outcome, eventId, at),
    user_id,
    value,
    unit: 'mg/dL',
    source: 'manual',
    notes,
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
  // Two injections of the same dose a minute apart are real practice, and they
  // get two different ids here — which is precisely what stops the sync layer
  // from having to guess whether they are one event.
  const eventId = newEventId();
  const at = createdAt ?? new Date().toISOString();
  let outcome: WriteOutcome = { state: 'local' };
  if (user_id !== 'demo-user') {
    outcome = await insertReturning('insulin_logs', {
      id: eventId,
      user_id,
      insulin_type: insulinType,
      dose,
      notes: notes ?? null,
      ...(mealType ? { meal_type: mealType } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: InsulinLog = {
    ...rowIdentity(outcome, eventId, at),
    user_id,
    insulin_type: insulinType,
    dose,
    meal_type: mealType,
    notes,
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
  // Event logs are outside Step 14's scope (they are not clinical events and
  // carry no dose): the outcome is folded back to the previous shape so this
  // path behaves exactly as it did.
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    const outcome = await insertReturning('event_logs', {
      user_id,
      kind,
      payload,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
    row = outcome.state === 'stored' ? { id: outcome.id, created_at: outcome.created_at } : null;
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
  const eventId = newEventId();
  const at = createdAt ?? new Date().toISOString();
  let outcome: WriteOutcome = { state: 'local' };
  if (user_id !== 'demo-user') {
    outcome = await insertReturning('activity_logs', {
      id: eventId,
      user_id,
      kind,
      duration_min: durationMin,
      intensity,
      notes: notes ?? null,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: ActivityLog = {
    ...rowIdentity(outcome, eventId, at),
    user_id,
    kind,
    duration_min: durationMin,
    intensity,
    notes,
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
  const eventId = newEventId();
  const at = createdAt ?? new Date().toISOString();
  let outcome: WriteOutcome = { state: 'local' };
  if (user_id !== 'demo-user') {
    outcome = await insertReturning('measure_logs', {
      id: eventId,
      user_id,
      kind,
      value,
      unit,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  }
  const log: MeasureLog = {
    ...rowIdentity(outcome, eventId, at),
    user_id,
    kind,
    value,
    unit,
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
  // Lab reports are outside Step 14's scope; folded back to the previous shape
  // so this path is byte-for-byte unchanged.
  let row: { id: string; created_at: string } | null = null;
  if (user_id !== 'demo-user') {
    const outcome = await insertReturning('lab_reports', {
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
    row = outcome.state === 'stored' ? { id: outcome.id, created_at: outcome.created_at } : null;
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

/*
 * REMOVED IN STEP 14 — `computeBolus` (finding N-16).
 *
 * A second dose formula lived here: `carbs / (carb_ratio || 10)` plus
 * `(glucose − mid) / (correction_factor || 50)`, rounded to 0.5 U. It carried
 * every defect Step 13 had just removed from the real engine — a fabricated
 * ICR, a fabricated ISF, and the `||` guard that let a NEGATIVE correction
 * factor through — and it had no caller anywhere in the app: one stale comment
 * in `ai.ts` pointed at it, nothing imported it, no test exercised it.
 *
 * Deleted rather than repaired. `computeSmartBolus` in `services/bolusEngine.ts`
 * is the only dose calculation in this codebase, and a dead lookalike is how a
 * closed finding comes back: the next person needing "a quick bolus number"
 * would have found this one first.
 */
