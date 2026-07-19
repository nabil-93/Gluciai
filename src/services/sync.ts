import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
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

/** True when the row already lives on the server (uuid primary key). */
export function isServerId(rowId: string): boolean {
  return UUID_RE.test(rowId);
}

const httpOnly = (url?: string) => (url && /^https?:/i.test(url) ? url : null);

/** Old mirrored rows kept a local id while the server row's timestamp
 *  drifted by the insert round-trip — treat "same data ± 2 min" as the
 *  same row so re-pushing never duplicates it. */
const near = (a: string, b: string) =>
  Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 120_000;

function missingOnServer<L extends { id: string; created_at: string }>(
  localRows: L[],
  serverRows: { created_at: string }[],
  sameData: (local: L, server: any) => boolean
): L[] {
  return localRows.filter(
    (l) =>
      !isServerId(l.id) &&
      !serverRows.some((s) => near(l.created_at, s.created_at) && sameData(l, s))
  );
}

const desc = (a: { created_at: string }, b: { created_at: string }) =>
  b.created_at < a.created_at ? -1 : 1;

/** Insert offline-created rows (their original timestamps preserved) and
 *  return the server copies so the caller can merge them into the pull. */
async function pushRows(
  table: string,
  rows: Record<string, unknown>[],
  select: string
): Promise<any[]> {
  if (!rows.length || !supabase) return [];
  try {
    const { data } = await supabase.from(table).insert(rows).select(select);
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
    carb_ratio: row.carb_ratio ?? undefined,
    correction_factor: row.correction_factor ?? undefined,
    emergency_contact_name: row.emergency_contact_name ?? undefined,
    emergency_contact_phone: row.emergency_contact_phone ?? undefined,
    doctor_name: row.doctor_name ?? undefined,
    doctor_phone: row.doctor_phone ?? undefined,
    home_address: row.home_address ?? undefined,
  };
}

const GLUCOSE_COLS = 'id,user_id,value,unit,source,notes,created_at';
const INSULIN_COLS = 'id,user_id,insulin_type,dose,notes,created_at';
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
 * Pull the signed-in user's complete history from Supabase and replace the
 * local store with it. Returns true when the store was hydrated. Safe to
 * call anytime: it no-ops offline / signed out, and never partially wipes
 * local data (all fetches must succeed before the store is touched).
 */
export async function hydrateFromServer(): Promise<boolean> {
  if (isDemoMode || !supabase) return false;

  let uid: string | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id;
  } catch {
    return false;
  }
  if (!uid) return false;

  const prevState = useAppStore.getState();
  const switched =
    prevState.accountUserId !== null && prevState.accountUserId !== uid;

  try {
    const [prof, glu, ins, meals, act, meas, chat, rem, evts, labs] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
      supabase
        .from('glucose_logs')
        .select(GLUCOSE_COLS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('insulin_logs')
        .select(INSULIN_COLS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('meal_scans')
        .select(MEAL_COLS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('activity_logs')
        .select(ACTIVITY_COLS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('measure_logs')
        .select(MEASURE_COLS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(2000),
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
      supabase
        .from('event_logs')
        .select(EVENT_COLS)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1000),
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

    let glucoseRows = glu.data ?? [];
    let insulinRows = ins.data ?? [];
    let mealRows = meals.data ?? [];
    let activityRows = act.data ?? [];
    let measureRows = meas.data ?? [];
    let reminderRows = rem.data ?? [];
    let eventRows = evts.data ?? [];
    let labRows = labs.data ?? [];

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
            user_id: uid,
            insulin_type: i.insulin_type,
            dose: i.dose,
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
            user_id: uid,
            image_url: httpOnly(m.image_url),
            result: m.result,
            calories: m.result.calories,
            carbs: m.result.carbohydrates,
            sugar: m.result.sugar,
            protein: m.result.protein,
            fat: m.result.fat,
            fiber: m.result.fiber,
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
    state.hydrateServer(
      {
        accountUserId: uid,
        // A brand-new account may not have finished the wizard yet — keep
        // whatever profile the wizard is building rather than nulling it.
        profile: prof.data
          ? mapProfile(prof.data)
          : switched
            ? null
            : state.profile,
        glucoseLogs: glucoseRows.map(mapGlucose),
        insulinLogs: insulinRows.map(mapInsulin),
        meals: mealRows.map(mapMeal),
        activityLogs: activityRows.map(mapActivity),
        measureLogs: measureRows.map(mapMeasure),
        aiReminders: reminderRows.map(mapReminder),
        eventLogs: eventRows.map(mapEvent),
        labReports: labRows.map(mapLabReport),
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
