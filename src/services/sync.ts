import { currentUserId, isDemoMode, supabase } from '@/lib/supabase';
import { mirrorColumn } from '@/services/nutrition/nutrientProvenance';
import { useAppStore } from '@/store/useAppStore';
import { useProgramStore } from '@/store/useProgramStore';
import type {
  ActivityLog,
  AiReminder,
  AppEvent,
  ChatMessage,
  GlucoseLog,
  InsulinLog,
  LabReport,
  MealScan,
  MeasureLog,
  Profile,
} from '@/types';

/* ────────────────────────────────────────────────────────────
 * SERVER SYNC
 * The store is local-first (AsyncStorage) but the SERVER is the
 * source of truth: every save mirrors to Supabase, and this module
 * pulls everything back — so logging in on a fresh install (or a
 * new phone) restores the full history: meals with photos, insulin,
 * glucose, activity, measures and the chat.
 *
 * hydrateFromServer() runs after login and on every app open:
 *   1. pull all tables for the signed-in user;
 *   2. re-push local rows the server never saw (offline saves — a
 *      local timestamp id instead of a server uuid), deduplicated
 *      against the pulled rows so nothing is inserted twice;
 *   3. atomically replace the store (guarding account switches on a
 *      shared device so users never see each other's data).
 * ──────────────────────────────────────────────────────────── */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when the row carries a uuid — which is now what a DEVICE mints for every
 * clinical event it records (`newEventId` in `data.ts`), not only what the
 * server hands back.
 *
 * The name is kept because the check is unchanged; what changed is its meaning
 * for the caller: a uuid no longer implies "already synced", it implies "has a
 * durable identity". Membership in the pull answers the sync question now.
 */
export function isServerId(rowId: string): boolean {
  return UUID_RE.test(rowId);
}

const httpOnly = (url?: string) => (url && /^https?:/i.test(url) ? url : null);

/** LEGACY rows only — see `missingOnServer`. Rows written before Step 14 kept a
 *  local timestamp id while the server's copy drifted by the insert round-trip,
 *  so "same data ± 2 min" was the only way to recognize them. */
const near = (a: string, b: string) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 120_000;

/**
 * Which local rows the server has never seen (findings P5-005 / RC-4).
 *
 * TWO POPULATIONS, deliberately handled differently:
 *
 *  · A row with a uuid was given its identity by the device that recorded it,
 *    and that identity is what the server stores. So the question is exact set
 *    membership — is this id in the pull? — and it answers correctly in both
 *    directions the old heuristic got wrong: two 6 U injections a minute apart
 *    carry two different ids and stay TWO events, while the same event seen
 *    twice is one id and stays ONE.
 *
 *  · A row with a local timestamp id predates Step 14. Its server copy (if any)
 *    carries an unrelated uuid, so identity cannot match it and the ±120 s +
 *    equal-data heuristic is still the only thing available. It is kept EXACTLY
 *    as it was, for those rows only: replacing it there would re-push every
 *    legacy row and duplicate a patient's entire history.
 */
function missingOnServer<L extends { id: string; created_at: string }>(
  localRows: L[],
  serverRows: { id?: string; created_at: string }[],
  sameData: (local: L, server: any) => boolean
): L[] {
  const serverIds = new Set(
    serverRows.map((s) => s.id).filter((v): v is string => typeof v === 'string')
  );
  return localRows.filter((l) =>
    isServerId(l.id)
      ? !serverIds.has(l.id)
      : !serverRows.some((s) => near(l.created_at, s.created_at) && sameData(l, s))
  );
}

/**
 * Carry a row's own identity into its push payload — and only its own.
 *
 * A uuid is the key the device minted, so sending it is what makes the push
 * idempotent. A legacy timestamp id is NOT a uuid and the column will not take
 * it, so the field is omitted and the server mints a key exactly as before.
 */
function withId(row: { id: string }): { id?: string } {
  return isServerId(row.id) ? { id: row.id } : {};
}

const desc = (a: { created_at: string }, b: { created_at: string }) =>
  b.created_at < a.created_at ? -1 : 1;

/** PostgREST's max-rows cap on this project — one response never holds more. */
const PAGE = 1000;

/**
 * A user's rows, newest first, PAGED (store audit D-02).
 *
 * `.limit(5000)` looked like five thousand readings but the server answers
 * at most PAGE rows per request, so a patient with more than ~1000 glucose
 * readings silently lost everything older from the phone at the next sync.
 * Pages are ordered by (created_at, id) so a page boundary that falls inside
 * a run of equal timestamps neither repeats nor skips a row.
 */
async function fetchPaged(
  table: string,
  cols: string,
  uid: string,
  cap: number
): Promise<{ data: any[] | null; error: unknown }> {
  if (!supabase) return { data: null, error: new Error('offline') };
  const out: any[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const to = Math.min(from + PAGE, cap) - 1;
    const { data, error } = await supabase
      .from(table)
      .select(cols)
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) return { data: null, error };
    out.push(...(data ?? []));
    if (!data || data.length < to - from + 1) break;
  }
  return { data: out, error: null };
}

/** Tables a tombstone may name — it comes back from device storage. */
const DELETABLE = new Set([
  'glucose_logs',
  'insulin_logs',
  'meal_scans',
  'activity_logs',
  'measure_logs',
  'event_logs',
  'lab_reports',
]);

/**
 * Replay the deletes this device could not confirm (store audit F-07). A
 * delete of a row that is already gone succeeds too, so every confirmed
 * tombstone is cleared; one that still fails stays for the next sync.
 */
async function replayPendingDeletes(): Promise<void> {
  const client = supabase;
  if (!client) return;
  const pending = useAppStore.getState().pendingDeletes ?? [];
  await Promise.all(
    pending.map(async (d) => {
      if (!DELETABLE.has(d.table)) {
        useAppStore.getState().clearPendingDelete(d.id);
        return;
      }
      try {
        const { error } = await client.from(d.table).delete().eq('id', d.id);
        if (!error) useAppStore.getState().clearPendingDelete(d.id);
      } catch {
        /* offline — kept for the next sync */
      }
    })
  );
}

/**
 * The onboarding profile kept on the phone while the account awaited e-mail
 * confirmation (store audit S-05 / F-02) — pushed by the first authenticated
 * sync, before the pull, so the empty row the sign-up trigger created cannot
 * overwrite the patient's answers. A failure leaves the flag set: the next
 * sync tries again, and meanwhile the local profile is kept (see runHydrate).
 */
async function pushPendingProfile(uid: string): Promise<void> {
  const client = supabase;
  const state = useAppStore.getState();
  const pending = state.pendingProfilePush;
  if (!client || !pending || !state.profile || state.profile.user_id !== uid) return;
  try {
    const { error } = await client.from('profiles').upsert({
      ...state.profile,
      ...(pending.phone ? { phone: pending.phone } : {}),
      updated_at: new Date().toISOString(),
    });
    if (error) return;
    if (pending.promo) {
      try {
        await client.rpc('redeem_promo_code', { p_code: pending.promo });
      } catch {
        // Non-fatal: the code can still be entered from Profile → Doctor.
      }
    }
    useAppStore.getState().setPendingProfilePush(null);
  } catch {
    /* offline — kept for the next sync */
  }
}

/**
 * Rows the patient added WHILE the sync was in flight (store audit D-01).
 *
 * The snapshot replaces the lists, and the offline push above only knows the
 * rows that existed when the sync started. A reading saved during the pull
 * was in neither — and was wiped by the replace (for good, if it was saved
 * offline). Anything now on the device that was not there at the start and
 * did not come back from the server is kept.
 */
function addedDuringSync<T extends { id: string }>(
  current: T[],
  atStart: T[],
  fromServer: { id: string }[]
): T[] {
  const seen = new Set<string>();
  for (const r of atStart) seen.add(r.id);
  for (const r of fromServer) seen.add(r.id);
  return current.filter((r) => !seen.has(r.id));
}

/**
 * Insert offline-created rows (their original timestamps preserved) and return
 * the server copies so the caller can merge them into the pull.
 *
 * IDEMPOTENT since Step 14: rows carry their own primary key, so a push that
 * races another device — or a push whose response was lost after the server had
 * already committed — collides with itself. `ignoreDuplicates` makes that
 * collision a no-op (`ON CONFLICT DO NOTHING`) instead of either duplicating the
 * event or failing the whole batch, and deliberately does NOT overwrite: the
 * row already on the server wins, because it may have been edited there.
 *
 * A conflicting row simply isn't returned; it is already in the pull the caller
 * is merging into. Legacy rows without a uuid still insert normally and the
 * server mints their key, exactly as before.
 */
async function pushRows(
  table: string,
  rows: Record<string, unknown>[],
  select: string
): Promise<any[]> {
  if (!rows.length || !supabase) return [];
  try {
    const { data } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      .select(select);
    return (data as any[]) ?? [];
  } catch {
    return [];
  }
}

function mapProfile(row: any): Profile {
  return {
    user_id: row.user_id,
    name: row.name ?? '',
    avatar_url: row.avatar_url ?? undefined,
    birth_date: row.birth_date ?? undefined,
    gender: row.gender ?? undefined,
    height: row.height ?? undefined,
    weight: row.weight ?? undefined,
    diabetes_type: row.diabetes_type ?? 'type2',
    insulin_types: row.insulin_types ?? [],
    language: row.language ?? 'en',
    target_low: row.target_low ?? 70,
    target_high: row.target_high ?? 180,
    // Fall back to the local value if a legacy server row predates the
    // column (migration 0024), so a hydrate never wipes the patient's goal.
    daily_glucose_goal:
      row.daily_glucose_goal ?? useAppStore.getState().profile?.daily_glucose_goal ?? undefined,
    carb_ratio: row.carb_ratio ?? undefined,
    correction_factor: row.correction_factor ?? undefined,
    insulin_per_10g_breakfast: row.insulin_per_10g_breakfast ?? undefined,
    insulin_per_10g_lunch: row.insulin_per_10g_lunch ?? undefined,
    insulin_per_10g_dinner: row.insulin_per_10g_dinner ?? undefined,
    bolus_insulin_name: row.bolus_insulin_name ?? undefined,
    basal_insulin_name: row.basal_insulin_name ?? undefined,
    basal_dose: row.basal_dose ?? undefined,
    basal_time: row.basal_time ?? undefined,
    emergency_contact_name: row.emergency_contact_name ?? undefined,
    emergency_contact_phone: row.emergency_contact_phone ?? undefined,
    doctor_name: row.doctor_name ?? undefined,
    doctor_phone: row.doctor_phone ?? undefined,
    home_address: row.home_address ?? undefined,
  };
}

const GLUCOSE_COLS = 'id,user_id,value,unit,source,notes,created_at';
const INSULIN_COLS = 'id,user_id,insulin_type,dose,meal_type,notes,created_at';
const MEAL_COLS = 'id,user_id,image_url,result,meal_type,created_at';
const ACTIVITY_COLS = 'id,user_id,kind,duration_min,intensity,notes,created_at';
const MEASURE_COLS = 'id,user_id,kind,value,unit,created_at';
const REMINDER_COLS = 'id,user_id,message,due_at,follow_kind,status,created_at';
const EVENT_COLS = 'id,user_id,kind,payload,created_at';
const LAB_COLS =
  'id,user_id,lab_name,report_date,summary,values,medical_report,voice_script,has_graphs,image_thumb,created_at';

const mapGlucose = (r: any): GlucoseLog => ({
  id: r.id,
  user_id: r.user_id,
  value: Number(r.value),
  unit: r.unit === 'mmol/L' ? 'mmol/L' : 'mg/dL',
  source: r.source === 'device' ? 'device' : 'manual',
  notes: r.notes ?? undefined,
  created_at: r.created_at,
});

const mapInsulin = (r: any): InsulinLog => ({
  id: r.id,
  user_id: r.user_id,
  insulin_type: r.insulin_type,
  dose: Number(r.dose),
  meal_type: r.meal_type ?? undefined,
  notes: r.notes ?? undefined,
  created_at: r.created_at,
});

const mapMeal = (r: any): MealScan => ({
  id: r.id,
  user_id: r.user_id,
  image_url: r.image_url ?? undefined,
  result: r.result,
  meal_type: r.meal_type ?? undefined,
  created_at: r.created_at,
});

const mapActivity = (r: any): ActivityLog => ({
  id: r.id,
  user_id: r.user_id,
  kind: r.kind ?? 'other',
  duration_min: Number(r.duration_min ?? 0),
  intensity: r.intensity ?? 'medium',
  notes: r.notes ?? undefined,
  created_at: r.created_at,
});

const mapMeasure = (r: any): MeasureLog => ({
  id: r.id,
  user_id: r.user_id,
  kind: r.kind,
  value: Number(r.value),
  unit: r.unit ?? '',
  created_at: r.created_at,
});

const mapReminder = (r: any): AiReminder => ({
  id: r.id,
  user_id: r.user_id,
  message: r.message ?? '',
  due_at: r.due_at,
  follow_kind: r.follow_kind ?? 'other',
  status: r.status ?? 'pending',
  created_at: r.created_at,
});

const mapEvent = (r: any): AppEvent => ({
  id: r.id,
  user_id: r.user_id,
  kind: r.kind,
  payload: r.payload ?? {},
  created_at: r.created_at,
});

const mapLabReport = (r: any): LabReport => ({
  id: r.id,
  user_id: r.user_id,
  lab_name: r.lab_name ?? undefined,
  report_date: r.report_date ?? undefined,
  summary: r.summary ?? undefined,
  values: Array.isArray(r.values) ? r.values : [],
  medical_report: r.medical_report ?? undefined,
  voice_script: r.voice_script ?? undefined,
  has_graphs: r.has_graphs ?? true,
  image_thumb: r.image_thumb ?? undefined,
  created_at: r.created_at,
});

/**
 * The pull in flight, if any.
 *
 * Two places ask for a hydrate on the way into the app and they can overlap.
 * Running it twice means twice the ten queries, twice the offline re-push,
 * and two writers racing to replace the same store. A second caller joins the
 * run that is already going instead.
 */
let inFlight: Promise<boolean> | null = null;

/**
 * Pull the signed-in user's complete history from Supabase and replace the
 * local store with it. Returns true when the store was hydrated. Safe to
 * call anytime: it no-ops offline / signed out, never runs twice at once, and
 * never partially wipes local data (all fetches must succeed before the store
 * is touched).
 */
export function hydrateFromServer(): Promise<boolean> {
  if (isDemoMode || !supabase) return Promise.resolve(false);
  if (inFlight) return inFlight;
  inFlight = runHydrate().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runHydrate(): Promise<boolean> {
  if (!supabase) return false;

  const uid = await currentUserId();
  if (!uid) return false;

  const prevState = useAppStore.getState();
  const switched =
    prevState.accountUserId !== null && prevState.accountUserId !== uid;

  // "Mon Programme" keeps its own store, so it is not covered by the hydrate
  // below. Claim it for this user first: on a shared phone the previous
  // account's parcours must be gone before anything renders, not after.
  useProgramStore.getState().adoptUser(uid);

  // Another account's tombstones were wiped by claimAccount; this account's
  // unconfirmed deletes go first, so the pull below already reflects them.
  if (!switched) await replayPendingDeletes();
  if (!switched) await pushPendingProfile(uid);
  // Still unpushed → the server only has the empty sign-up row; keep ours.
  const keepLocalProfile = !switched && !!useAppStore.getState().pendingProfilePush;

  try {
    const [prof, glu, ins, meals, act, meas, chat, rem, evts, labs] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      fetchPaged('glucose_logs', GLUCOSE_COLS, uid, 5000),
      fetchPaged('insulin_logs', INSULIN_COLS, uid, 5000),
      fetchPaged('meal_scans', MEAL_COLS, uid, 2000),
      fetchPaged('activity_logs', ACTIVITY_COLS, uid, 2000),
      fetchPaged('measure_logs', MEASURE_COLS, uid, 2000),
      supabase
        .from('chat_history')
        .select('id,role,message,created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(120),
      supabase
        .from('ai_reminders')
        .select(REMINDER_COLS)
        .eq('user_id', uid)
        .order('due_at', { ascending: false })
        .limit(200),
      fetchPaged('event_logs', EVENT_COLS, uid, 1000),
      supabase
        .from('lab_reports')
        .select(LAB_COLS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    // Never replace local data from a partial read (flaky network / RLS
    // hiccup) — that could silently erase a table.
    if (
      prof.error ||
      glu.error ||
      ins.error ||
      meals.error ||
      act.error ||
      meas.error ||
      chat.error ||
      rem.error ||
      evts.error ||
      labs.error
    ) {
      return false;
    }

    // A row deleted here whose server delete is still unconfirmed must not
    // come back with the snapshot (F-07).
    const tomb = new Set((useAppStore.getState().pendingDeletes ?? []).map((d) => d.id));
    const live = <R extends { id: string }>(rows: R[] | null): R[] =>
      (rows ?? []).filter((r) => !tomb.has(r.id));

    let glucoseRows = live(glu.data);
    let insulinRows = live(ins.data);
    let mealRows = live(meals.data);
    let activityRows = live(act.data);
    let measureRows = live(meas.data);
    let reminderRows = rem.data ?? [];
    let eventRows = live(evts.data);
    let labRows = live(labs.data);

    // Offline saves from THIS account get pushed before the store is
    // replaced (another account's leftovers are wiped, never re-pushed).
    // Dedup against the pull so nothing lands on the server twice.
    if (!switched) {
      const [g2, i2, m2, a2, x2, r2, e2, l2] = await Promise.all([
        pushRows(
          'glucose_logs',
          missingOnServer(
            prevState.glucoseLogs,
            glucoseRows,
            (l, s) => Number(s.value) === l.value
          ).map((g) => ({
            ...withId(g),
            user_id: uid,
            value: g.value,
            unit: g.unit,
            source: g.source,
            notes: g.notes ?? null,
            created_at: g.created_at,
          })),
          GLUCOSE_COLS
        ),
        pushRows(
          'insulin_logs',
          missingOnServer(
            prevState.insulinLogs,
            insulinRows,
            (l, s) =>
              Number(s.dose) === l.dose && s.insulin_type === l.insulin_type
          ).map((i) => ({
            ...withId(i),
            user_id: uid,
            insulin_type: i.insulin_type,
            dose: i.dose,
            // Which meal the dose covered — the per-meal views key off it and
            // the offline path used to drop it (store audit D-04).
            meal_type: i.meal_type ?? null,
            notes: i.notes ?? null,
            created_at: i.created_at,
          })),
          INSULIN_COLS
        ),
        pushRows(
          'meal_scans',
          missingOnServer(
            prevState.meals,
            mealRows,
            (l, s) => s.result?.food_name === l.result?.food_name
          ).map((m) => ({
            ...withId(m),
            user_id: uid,
            image_url: httpOnly(m.image_url),
            result: m.result,
            // Same rule as `saveMeal` (data.ts), through the same helper: a
            // mirror column is a number or nothing, and a meal whose nutrient
            // was never known holds a placeholder 0. This is the OFFLINE path —
            // without the gate a meal saved with no connection would land on
            // the server carrying fabricated zeros the online path refuses to
            // write. Step 10 covered the carbohydrate; Step 22B the rest.
            calories: mirrorColumn(m.result, 'calories', m.result.calories),
            carbs: m.result.carbs_known === false ? null : m.result.carbohydrates,
            sugar: mirrorColumn(m.result, 'sugar', m.result.sugar),
            protein: mirrorColumn(m.result, 'protein', m.result.protein),
            fat: mirrorColumn(m.result, 'fat', m.result.fat),
            fiber: mirrorColumn(m.result, 'fiber', m.result.fiber),
            glycemic_index: m.result.glycemic_index,
            confidence: m.result.confidence,
            meal_type: m.meal_type ?? null,
            created_at: m.created_at,
          })),
          MEAL_COLS
        ),
        pushRows(
          'activity_logs',
          missingOnServer(
            prevState.activityLogs,
            activityRows,
            (l, s) =>
              s.kind === l.kind && Number(s.duration_min) === l.duration_min
          ).map((a) => ({
            ...withId(a),
            user_id: uid,
            kind: a.kind,
            duration_min: a.duration_min,
            intensity: a.intensity,
            notes: a.notes ?? null,
            created_at: a.created_at,
          })),
          ACTIVITY_COLS
        ),
        pushRows(
          'measure_logs',
          missingOnServer(
            prevState.measureLogs,
            measureRows,
            (l, s) => s.kind === l.kind && Number(s.value) === l.value
          ).map((m) => ({
            ...withId(m),
            user_id: uid,
            kind: m.kind,
            value: m.value,
            unit: m.unit,
            created_at: m.created_at,
          })),
          MEASURE_COLS
        ),
        pushRows(
          'ai_reminders',
          missingOnServer(
            prevState.aiReminders,
            reminderRows,
            (l, s) => s.message === l.message && s.due_at === l.due_at
          ).map((r) => ({
            user_id: uid,
            message: r.message,
            due_at: r.due_at,
            follow_kind: r.follow_kind,
            status: r.status,
            created_at: r.created_at,
          })),
          REMINDER_COLS
        ),
        pushRows(
          'event_logs',
          missingOnServer(
            prevState.eventLogs,
            eventRows,
            (l, s) => s.kind === l.kind
          ).map((e) => ({
            user_id: uid,
            kind: e.kind,
            payload: e.payload,
            created_at: e.created_at,
          })),
          EVENT_COLS
        ),
        pushRows(
          'lab_reports',
          missingOnServer(
            prevState.labReports,
            labRows,
            (l, s) => (s.summary ?? '') === (l.summary ?? '')
          ).map((r) => ({
            user_id: uid,
            lab_name: r.lab_name ?? null,
            report_date: r.report_date ?? null,
            summary: r.summary ?? null,
            values: r.values,
            medical_report: r.medical_report ?? null,
            voice_script: r.voice_script ?? null,
            has_graphs: r.has_graphs ?? true,
            image_thumb: r.image_thumb ?? null,
            created_at: r.created_at,
          })),
          LAB_COLS
        ),
      ]);

      glucoseRows = [...glucoseRows, ...g2].sort(desc);
      insulinRows = [...insulinRows, ...i2].sort(desc);
      mealRows = [...mealRows, ...m2].sort(desc);
      activityRows = [...activityRows, ...a2].sort(desc);
      measureRows = [...measureRows, ...x2].sort(desc);
      reminderRows = [...reminderRows, ...r2];
      eventRows = [...eventRows, ...e2].sort(desc);
      labRows = [...labRows, ...l2].sort(desc);
    }

    const state = useAppStore.getState();
    // D-01 — keep what was saved while this sync was running (and is not a
    // row that was deleted meanwhile).
    const during = <T extends { id: string; created_at: string }>(
      current: T[],
      atStart: T[],
      mapped: T[]
    ): T[] => {
      if (switched) return mapped;
      const extra = addedDuringSync(current, atStart, mapped).filter((r) => !tomb.has(r.id));
      return extra.length ? [...extra, ...mapped].sort(desc) : mapped;
    };
    state.hydrateServer(
      {
        accountUserId: uid,
        // A brand-new account may not have finished the wizard yet — keep
        // whatever profile the wizard is building rather than nulling it.
        profile: keepLocalProfile
          ? state.profile
          : prof.data
            ? mapProfile(prof.data)
            : switched
              ? null
              : state.profile,
        glucoseLogs: during(state.glucoseLogs, prevState.glucoseLogs, glucoseRows.map(mapGlucose)),
        insulinLogs: during(state.insulinLogs, prevState.insulinLogs, insulinRows.map(mapInsulin)),
        meals: during(state.meals, prevState.meals, mealRows.map(mapMeal)),
        activityLogs: during(
          state.activityLogs,
          prevState.activityLogs,
          activityRows.map(mapActivity)
        ),
        measureLogs: during(state.measureLogs, prevState.measureLogs, measureRows.map(mapMeasure)),
        aiReminders: reminderRows.map(mapReminder),
        eventLogs: during(state.eventLogs, prevState.eventLogs, eventRows.map(mapEvent)),
        labReports: during(state.labReports, prevState.labReports, labRows.map(mapLabReport)),
        chatMessages: (chat.data ?? [])
          .reverse()
          .map(
            (r): ChatMessage => ({
              id: r.id,
              role: r.role,
              content: r.message,
              created_at: r.created_at,
            })
          ),
      },
      switched
    );
    return true;
  } catch {
    return false;
  }
}
