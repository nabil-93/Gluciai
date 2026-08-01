import type { NutrientKnown } from '@/services/nutrition/nutrientProvenance';

export type DiabetesType = 'type1' | 'type2' | 'gestational' | 'prediabetes';
export type InsulinType = 'rapid' | 'long' | 'mixed';

export interface Profile {
  user_id: string;
  name: string;
  /** Public URL of the avatar in the profile-images storage bucket */
  avatar_url?: string;
  birth_date?: string;
  gender?: 'male' | 'female' | 'other';
  height?: number;
  weight?: number;
  diabetes_type: DiabetesType;
  insulin_types: InsulinType[];
  language: string;
  target_low: number;
  target_high: number;
  /** Daily "time in range" goal the patient sets for themselves (percentage
   *  Absolute glucose objective in mg/dL the patient sets for themselves
   *  (e.g. 180). Drives the objective ring on the glycémie page — the ring
   *  fills a full circle when the day's glucose reaches this value. */
  daily_glucose_goal?: number;
  carb_ratio?: number;
  correction_factor?: number;
  /** Units of MEAL (rapid) insulin per 10 g of carbs — one per meal, as
   *  prescribed by the doctor. The bolus engine and the AI use these
   *  exact numbers; carb_ratio stays as the legacy/global fallback. */
  insulin_per_10g_breakfast?: number;
  insulin_per_10g_lunch?: number;
  insulin_per_10g_dinner?: number;
  /** Name of the meal (rapid/bolus) insulin, e.g. "NovoRapid". */
  bolus_insulin_name?: string;
  /** Name of the basal (slow/lente) insulin, e.g. "Lantus". */
  basal_insulin_name?: string;
  /** Daily basal dose in units. */
  basal_dose?: number;
  /** When the basal insulin is injected. */
  basal_time?: 'morning' | 'evening' | 'both';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  doctor_name?: string;
  doctor_phone?: string;
  /** Home address shown on the SOS screen (opens Google Maps) so a
   *  bystander can bring the patient home. */
  home_address?: string;
}

/** Where the nutrition values came from — always shown to the user. */
export type NutritionSource =
  | 'moroccan_db'
  | 'usda'
  | 'openfoodfacts'
  | 'fatsecret'
  | 'edamam'
  | 'ai_estimate'
  /** Our own shared barcode catalogue (`product_catalog`). Kept distinct from
   *  the database that first supplied the row — see `ProductProvenance`. */
  | 'product_catalog'
  /** The patient read the figures off the packaging on this device. The most
   *  authoritative source there is, and never to be labelled as a database. */
  | 'user_label';

/** Which `source` a `product_catalog` row was written under (migration 0026). */
export type CatalogSource =
  | 'openfoodfacts'
  | 'usda'
  | 'upcitemdb'
  | 'user'
  | 'label-photo';

/**
 * Where a barcode product's numbers came from, and whether that origin may be
 * treated as authoritative for a DOSE.
 *
 * The shared catalogue is writable by any signed-in patient (P2-003), so "our
 * catalogue said so" is not by itself a reason to dose from a figure. This
 * record travels with the scan so the screen and the saved meal can both say
 * what they actually know — the alternative, which this replaces, was filing
 * every barcode meal as `openfoodfacts` whatever its real origin.
 *
 * It carries no clinical decision of its own: whether a carbohydrate may seed
 * a bolus is still answered by `carbs_known` alone (Step 10's channel).
 */
export interface ProductProvenance {
  origin: Extract<
    NutritionSource,
    'openfoodfacts' | 'usda' | 'product_catalog' | 'user_label'
  >;
  /** Present when `origin` is `product_catalog`: the row's own `source`. */
  catalog_source?: CatalogSource;
  /** Present when `origin` is `product_catalog`: the row's `verified` flag. */
  verified?: boolean;
  /**
   * False for an unverified patient-contributed catalogue row, and for a
   * product whose fields are still empty. The values stay visible; the
   * carbohydrate reaches the dosing boundary UNKNOWN until the patient
   * confirms it against the packaging.
   */
  trusted_for_dosing: boolean;
}

/**
 * High-level food category from the vision model. Used for grouping,
 * meal-composition highlights ("balanced_meal") and icons — NOT nutrition.
 */
export type FoodCategory =
  | 'Protein'
  | 'Vegetable'
  | 'Fruit'
  | 'Rice'
  | 'Bread'
  | 'Pasta'
  | 'Soup'
  | 'Sauce'
  | 'Dessert'
  | 'Drink'
  | 'Snack'
  | 'Fast Food'
  | 'Seafood'
  | 'Legumes'
  | 'Dairy'
  | 'Egg'
  | 'Unknown';

/**
 * Where a detected food sits in the photo, as 0-1 FRACTIONS of the image
 * (origin top-left): x=0.5 is the horizontal middle, width=0.25 is a
 * quarter of the image wide. Resolution-independent, so the overlay scales
 * them onto whatever size the photo is displayed at — like Cal AI /
 * SnapCalorie.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One food detected on the plate, resolved against a nutrition database. */
export interface FoodItemResult {
  /** Human-friendly label shown to the user (e.g. "Grilled Salmon") */
  name: string;
  /** Generic query used to search the databases (e.g. "salmon") */
  search_name?: string;
  /** Vision model's food category (Protein, Vegetable, Rice…) — never nutrition */
  category?: FoodCategory;
  portion_grams: number;
  calories: number;
  carbohydrates: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  sodium?: number;
  glycemic_index?: number;
  source: NutritionSource;
  /** Which database actually produced the values (provenance) */
  matched_database?: NutritionSource;
  /** The record name that matched inside that database */
  matched_food?: string;
  /** The matched record's id in that database (for corrections/debugging) */
  food_id?: string;
  /** Fuzzy similarity between search_name and matched_food (0..100) */
  match_score?: number;
  /** Where the food is in the photo, if the vision model returned it */
  bounding_box?: BoundingBox;
  /** True when this is the plate's main dish (vs a side/garnish/drink) */
  is_main_food?: boolean;
  /** True when the vision model was unsure about the gram estimate */
  is_estimated?: boolean;
  /** Other foods this could be (generic search names) for low-confidence UX */
  alternatives?: string[];
  /** How sure the vision model is that this food is on the plate (0..1) */
  detection_confidence: number;
  /** How reliable the nutrition values are (0..1, DB > AI) */
  nutrition_confidence: number;
  /**
   * Whether `carbohydrates` is a real value rather than a stand-in for
   * missing data. `true` includes a genuine 0 (water); `false` means unknown,
   * and the 0 must not be shown or dosed from. Absent on items persisted
   * before this field existed — `carbProvenance.ts` owns that rule.
   */
  carbs_known?: boolean;
  /**
   * Which of the OTHER six nutrients this food actually declared (Step 22B,
   * finding NUTR-B1). The values never move — an unknown nutrient keeps its
   * placeholder 0 so every consumer still reads a number — this only says which
   * of them are real. `carbs` answers through `carbs_known` above.
   */
  nutrients_known?: NutrientKnown;
  /**
   * False when this food's portion is not a usable quantity at all (NaN,
   * Infinity, ≤ 0 — finding NUTR-B2). Its nutrition is then unknown rather than
   * zero, and nothing derived from grams may count it.
   */
  portion_valid?: boolean;
  /**
   * Which per-100 g figures this food arrived with that are physically
   * impossible (`'carbs'`, `'sodium'`, `'macro_sum'`…). Present so the plate
   * can NAME the food in its warning; the figures themselves are left as they
   * came, except the carbohydrate, which becomes unknown rather than being
   * clamped into a smaller wrong number. See `plausibility.ts`.
   */
  implausible_fields?: string[];
  /**
   * True when `glycemic_index` is a category-based ESTIMATE rather than a
   * database value (USDA/OFF/FatSecret/Edamam publish no GI). The UI must
   * label it as approximate — we never present a guess as a measurement.
   */
  glycemic_index_estimated?: boolean;
  /**
   * Untouched per-100 g values this item was built from. Rescaling a portion
   * always recomputes from THIS base instead of the already-rounded current
   * values, so repeated edits never drift.
   */
  per100g_base?: {
    calories: number;
    carbs: number;
    sugar: number;
    protein: number;
    fat: number;
    fiber: number;
    sodium?: number;
    /** Carried here too, so a portion edit cannot launder an unknown into a
     *  value: rescaling 0 unknown grams still yields 0 unknown grams. */
    carbs_known?: boolean;
    /** Same reason, for the other six nutrients (Step 22B). */
    known?: NutrientKnown;
  };
}

/** Stable, translatable meal-quality highlight keys. */
export type MealHighlight =
  | 'high_protein'
  | 'high_fiber'
  | 'balanced_meal'
  | 'low_glycemic_load'
  | 'low_sugar'
  | 'vegetable_rich'
  | 'high_sugar'
  | 'high_glycemic_load'
  | 'carb_heavy'
  | 'low_protein'
  | 'low_fiber'
  | 'high_sodium';

export interface NutritionResult {
  food_name: string;
  estimated_portion: string;
  calories: number;
  carbohydrates: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  sodium?: number;
  glycemic_index: number;
  confidence: number;
  /** Aggregated nutrition reliability (0..1) */
  nutrition_confidence?: number;
  /**
   * Whether the plate's `carbohydrates` total is a real total.
   *
   * `false` when ANY food's carbohydrate is unknown — the total is then a
   * LOWER BOUND, not a total, and no bolus may be seeded from it. One unknown
   * food is enough: "most of the plate is known" is not a dosable number.
   */
  carbs_known?: boolean;
  /**
   * Plate-level twin of `FoodItemResult.nutrients_known` (Step 22B): a nutrient
   * is `true` only when EVERY food behind the total declared it — one unknown
   * food makes the sum a floor, exactly as `carbs_known` already says for the
   * carbohydrate. Absent on rows written before Step 22B.
   */
  nutrients_known?: NutrientKnown;
  /** Dominant source of the values (per-item detail in `items`) */
  source?: NutritionSource;
  /**
   * BARCODE path only: what `source` above is short for, and whether that
   * origin is authoritative for a dose. A barcode meal carries no `items`, so
   * this sits on the result — where `aggregateItems` cannot drop it (N-10).
   * Photo-scan plates answer the same question per item, via `source`.
   */
  product_provenance?: ProductProvenance;
  /** Per-food breakdown when the plate contains multiple foods */
  items?: FoodItemResult[];
  /** Meal quality 0..100 for a diabetic patient (from mealScore.ts) */
  meal_score?: number;
  /** Estimated glycemic load bucket for the whole plate */
  glycemic_load?: 'Low' | 'Medium' | 'High';
  /** Numeric glycemic load (GI x available carbs / 100) — moves with portions,
   *  unlike the glycemic index, so it is the figure a patient acts on. */
  glycemic_load_value?: number;
  /** True when at least part of the plate GI came from category estimates. */
  glycemic_index_estimated?: boolean;
  /** Share (0..1) of the plate's carbs backed by a real or estimated GI —
   *  lets the UI say how representative the displayed index actually is. */
  gi_carb_coverage?: number;
  /**
   * Rule-based coaching as STABLE KEYS (e.g. "high_protein", "high_fiber",
   * "balanced_meal", "low_glycemic_load"). Computed locally from the
   * database-sourced totals — never from Gemini. The UI localizes each key
   * via t(`insights.highlights.${key}`), so persisted scans re-translate.
   */
  highlights?: MealHighlight[];
  warnings: string[];
}

/** Which meal of the day a scanned food belongs to. */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * A clinical event the device recorded but the server has not confirmed.
 *
 * CLIENT-SIDE ONLY — every insert payload is built field by field, so this is
 * never sent anywhere. It exists because a write that FAILED used to be
 * indistinguishable from one that succeeded (finding DATA-1): both produced a
 * local row and a "saved" message. The row is still kept and still re-pushed by
 * `hydrateFromServer()` — offline-first is unchanged — but now something knows.
 *
 * Absent on a row that is on the server, and on every row read back from it.
 */
export interface PendingSync {
  pending_sync?: true;
  /**
   * WHY the row is pending, for the screen that just saved it (DATA-1's UI
   * half). `pending_sync` says "the server does not have this"; this says
   * whether it was never asked or asked and refused:
   *
   *   'local'   no attempt was made — demo mode, or no client configured.
   *   'failed'  an attempt WAS made and did not confirm.
   *
   * LOCAL-ONLY and never persisted anywhere: `sync.ts` builds every push
   * payload from an explicit field list, so this field is not sent to the
   * server and no column exists for it. Absent on a confirmed row.
   */
  sync_state?: 'local' | 'failed';
}

export interface MealScan extends PendingSync {
  id: string;
  user_id: string;
  image_url?: string;
  result: NutritionResult;
  /** Breakfast / lunch / dinner / snack — asked after a scan or in chat. */
  meal_type?: MealType;
  created_at: string;
}

export interface GlucoseLog extends PendingSync {
  id: string;
  user_id: string;
  value: number;
  unit: 'mg/dL' | 'mmol/L';
  source: 'manual' | 'device';
  notes?: string;
  created_at: string;
}

export interface InsulinLog extends PendingSync {
  id: string;
  user_id: string;
  insulin_type: InsulinType;
  dose: number;
  /** Which meal this injection was for (optional, chosen when logging). */
  meal_type?: MealType;
  notes?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export type ActivityKind = 'walk' | 'run' | 'bike' | 'gym' | 'other';
export type ActivityIntensity = 'low' | 'medium' | 'high';

export interface ActivityLog extends PendingSync {
  id: string;
  user_id: string;
  kind: ActivityKind;
  duration_min: number;
  intensity: ActivityIntensity;
  notes?: string;
  created_at: string;
}

export type MeasureKind = 'weight' | 'hba1c' | 'bp_systolic' | 'bp_diastolic';

export interface MeasureLog extends PendingSync {
  id: string;
  user_id: string;
  kind: MeasureKind;
  value: number;
  unit: string;
  created_at: string;
}

export type ActivityStatus = 'active' | 'sick' | 'injured' | 'paused';

/**
 * An account event: the patient changed their activity status
 * (sick/injured/…) or edited medical parameters. Recorded like any log so
 * it shows in the history/day report and the AI always knows the full,
 * current situation.
 */
export interface AppEvent {
  id: string;
  user_id: string;
  kind: 'status' | 'profile' | 'note';
  /** status: { from, to } — profile: { changes } — note: { text } */
  payload: Record<string, any>;
  created_at: string;
}

/**
 * A reminder the patient asked the AI to set ("rappelle-moi dans 1h de
 * prendre mon insuline"). pending → fired (shown to the patient) →
 * done (they did it / logged it) or missed.
 */
export interface AiReminder {
  id: string;
  user_id: string;
  message: string;
  due_at: string;
  follow_kind: 'insulin' | 'glucose' | 'meal' | 'activity' | 'measure' | 'other';
  status: 'pending' | 'fired' | 'done' | 'missed';
  created_at: string;
}

/**
 * One entry of the AI coach journal: everything the assistant
 * detected (good or bad), recorded chronologically like a coach
 * following the patient all day long.
 */
export interface AIJournalEntry {
  id: string;
  icon: string;
  title: string;
  body: string;
  tone: 'danger' | 'warning' | 'success' | 'info';
  href?: string;
  created_at: string;
}

/** Status of one biological value against its reference range. */
export type LabValueStatus = 'ok' | 'warn' | 'danger';

/** One biological value extracted from a lab report photo by the AI. */
export interface LabValue {
  label: string;
  /** Raw value as printed on the report (string keeps "1.2", "<0.5"…). */
  value: string;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  status: LabValueStatus;
  /** Grouping ("NFS", "Bilan rénal", "Bilan lipidique"…). */
  category: string;
}

/**
 * A lab (blood test) report the patient photographed. The AI extracts
 * every value, then optionally generates a patient-friendly medical
 * report and a spoken doctor-style explanation. Mirrored to Supabase
 * (lab_reports) like every other log.
 */
export interface LabReport {
  id: string;
  user_id: string;
  lab_name?: string;
  /** Date printed on the report (YYYY-MM-DD), if readable. */
  report_date?: string;
  /** One-line AI summary of the whole report. */
  summary?: string;
  values: LabValue[];
  /** Full patient-friendly medical report (markdown-lite). */
  medical_report?: string;
  /** Short spoken doctor-style explanation (plain text for TTS). */
  voice_script?: string;
  /** The patient chose to show the charts section. */
  has_graphs?: boolean;
  /** Small base64 thumbnail of the photographed report. */
  image_thumb?: string;
  created_at: string;
}

/**
 * A user correction of an AI prediction. Stored separately —
 * official database values are NEVER overwritten. The learning
 * layer reads these to improve future predictions.
 */
export interface FoodCorrection {
  id: string;
  /** Normalized food name the correction applies to */
  food_key: string;
  field: 'portion' | 'name' | 'carbs' | 'calories' | 'identity' | 'search_name';
  ai_value: string;
  user_value: string;
  created_at: string;
}

/** The four AI features that carry a usage limit (usage_limits table). */
export type UsageFeature = 'scanner' | 'ai_chat' | 'ai_call' | 'labs';
export type UsagePeriod = 'day' | 'week' | 'month';

/**
 * One feature's live quota status for the signed-in user, as returned by the
 * `my_usage_status` RPC (migration 0020). `limit`/`remaining` are null when
 * the feature is unlimited. For `ai_call` the unit is minutes; otherwise a
 * count (scans / messages / analyses).
 */
export interface UsageStat {
  feature: UsageFeature;
  period: UsagePeriod;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  exceeded: boolean;
}
