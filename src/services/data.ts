import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type {
  ActivityIntensity,
  ActivityKind,
  ActivityLog,
  GlucoseLog,
  InsulinLog,
  InsulinType,
  MealScan,
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

export async function saveMeal(result: NutritionResult, imageUri?: string) {
  const user_id = await currentUserId();
  const meal: MealScan = {
    id: id(),
    user_id,
    image_url: imageUri,
    result,
    created_at: new Date().toISOString(),
  };
  useAppStore.getState().addMeal(meal);

  if (!isDemoMode && supabase && user_id !== 'demo-user') {
    await supabase.from('meal_scans').insert({
      user_id,
      image_url: imageUri ?? null,
      result,
      calories: result.calories,
      carbs: result.carbohydrates,
      sugar: result.sugar,
      protein: result.protein,
      fat: result.fat,
      fiber: result.fiber,
      glycemic_index: result.glycemic_index,
      confidence: result.confidence,
    });
  }
  return meal;
}

export async function saveGlucose(value: number, notes?: string) {
  const user_id = await currentUserId();
  const log: GlucoseLog = {
    id: id(),
    user_id,
    value,
    unit: 'mg/dL',
    source: 'manual',
    notes,
    created_at: new Date().toISOString(),
  };
  useAppStore.getState().addGlucoseLog(log);

  if (!isDemoMode && supabase && user_id !== 'demo-user') {
    await supabase.from('glucose_logs').insert({
      user_id,
      value,
      unit: 'mg/dL',
      source: 'manual',
      notes: notes ?? null,
    });
  }
  return log;
}

export async function saveInsulin(dose: number, insulinType: InsulinType, notes?: string) {
  const user_id = await currentUserId();
  const log: InsulinLog = {
    id: id(),
    user_id,
    insulin_type: insulinType,
    dose,
    notes,
    created_at: new Date().toISOString(),
  };
  useAppStore.getState().addInsulinLog(log);

  if (!isDemoMode && supabase && user_id !== 'demo-user') {
    await supabase.from('insulin_logs').insert({
      user_id,
      insulin_type: insulinType,
      dose,
      notes: notes ?? null,
    });
  }
  return log;
}

export async function saveProfile(profile: Profile) {
  useAppStore.getState().setProfile(profile);
  if (!isDemoMode && supabase && profile.user_id !== 'demo-user') {
    await supabase.from('profiles').upsert({
      ...profile,
      updated_at: new Date().toISOString(),
    });
  }
}

export async function saveActivity(
  kind: ActivityKind,
  durationMin: number,
  intensity: ActivityIntensity,
  notes?: string
) {
  const user_id = await currentUserId();
  const log: ActivityLog = {
    id: id(),
    user_id,
    kind,
    duration_min: durationMin,
    intensity,
    notes,
    created_at: new Date().toISOString(),
  };
  useAppStore.getState().addActivityLog(log);

  if (!isDemoMode && supabase && user_id !== 'demo-user') {
    await supabase.from('activity_logs').insert({
      user_id,
      kind,
      duration_min: durationMin,
      intensity,
      notes: notes ?? null,
    });
  }
  return log;
}

export async function saveMeasure(kind: MeasureKind, value: number, unit: string) {
  const user_id = await currentUserId();
  const log: MeasureLog = {
    id: id(),
    user_id,
    kind,
    value,
    unit,
    created_at: new Date().toISOString(),
  };
  useAppStore.getState().addMeasureLog(log);

  if (!isDemoMode && supabase && user_id !== 'demo-user') {
    await supabase.from('measure_logs').insert({ user_id, kind, value, unit });
  }
  return log;
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
