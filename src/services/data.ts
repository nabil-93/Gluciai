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
  imageBase64?: string
) {
  const user_id = await currentUserId();

  // A local blob:/file: URI dies with the session — upload the photo so the
  // dashboard (and future devices) can render it, keep the local URI as a
  // fallback for immediate display.
  let remoteUrl: string | null = null;
  if (imageBase64) remoteUrl = await uploadMealPhoto(user_id, imageBase64);

  const meal: MealScan = {
    id: id(),
    user_id,
    image_url: remoteUrl ?? imageUri,
    result,
    created_at: new Date().toISOString(),
  };
  useAppStore.getState().addMeal(meal);

  if (!isDemoMode && supabase && user_id !== 'demo-user') {
    const httpUrl =
      remoteUrl ?? (imageUri && /^https?:/i.test(imageUri) ? imageUri : null);
    await supabase.from('meal_scans').insert({
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
