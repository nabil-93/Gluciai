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
  carb_ratio?: number;
  correction_factor?: number;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  doctor_name?: string;
}

/** Where the nutrition values came from — always shown to the user. */
export type NutritionSource =
  | 'moroccan_db'
  | 'usda'
  | 'openfoodfacts'
  | 'fatsecret'
  | 'edamam'
  | 'ai_estimate';

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
  /** Dominant source of the values (per-item detail in `items`) */
  source?: NutritionSource;
  /** Per-food breakdown when the plate contains multiple foods */
  items?: FoodItemResult[];
  /** Meal quality 0..100 for a diabetic patient (from mealScore.ts) */
  meal_score?: number;
  /** Estimated glycemic load bucket for the whole plate */
  glycemic_load?: 'Low' | 'Medium' | 'High';
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

export interface MealScan {
  id: string;
  user_id: string;
  image_url?: string;
  result: NutritionResult;
  /** Breakfast / lunch / dinner / snack — asked after a scan or in chat. */
  meal_type?: MealType;
  created_at: string;
}

export interface GlucoseLog {
  id: string;
  user_id: string;
  value: number;
  unit: 'mg/dL' | 'mmol/L';
  source: 'manual' | 'device';
  notes?: string;
  created_at: string;
}

export interface InsulinLog {
  id: string;
  user_id: string;
  insulin_type: InsulinType;
  dose: number;
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

export interface ActivityLog {
  id: string;
  user_id: string;
  kind: ActivityKind;
  duration_min: number;
  intensity: ActivityIntensity;
  notes?: string;
  created_at: string;
}

export type MeasureKind = 'weight' | 'hba1c' | 'bp_systolic' | 'bp_diastolic';

export interface MeasureLog {
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
