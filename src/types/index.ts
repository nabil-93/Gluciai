export type DiabetesType = 'type1' | 'type2' | 'gestational' | 'prediabetes';
export type InsulinType = 'rapid' | 'long' | 'mixed';

export interface Profile {
  user_id: string;
  name: string;
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
  | 'ai_estimate';

/** One food detected on the plate, resolved against a nutrition database. */
export interface FoodItemResult {
  name: string;
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
  /** How sure the vision model is that this food is on the plate (0..1) */
  detection_confidence: number;
  /** How reliable the nutrition values are (0..1, DB > AI) */
  nutrition_confidence: number;
}

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
  warnings: string[];
}

export interface MealScan {
  id: string;
  user_id: string;
  image_url?: string;
  result: NutritionResult;
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
  field: 'portion' | 'name' | 'carbs' | 'calories';
  ai_value: string;
  user_value: string;
  created_at: string;
}
