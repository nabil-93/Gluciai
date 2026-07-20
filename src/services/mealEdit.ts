import { isDemoMode, supabase } from '@/lib/supabase';
import { buildHealthContext } from '@/services/ai';
import { reidentifyItem, rescaleItem, resolveFood } from '@/services/nutrition/engine';
import type { Per100g } from '@/services/nutrition/types';
import { asQuotaError } from '@/services/usage';
import type { FoodItemResult } from '@/types';

/**
 * One edit the meal assistant asks the app to apply to the scanned plate.
 * The AI only decides WHAT changes (by 1-based index / name + grams); the
 * app resolves the real nutrition from its own databases and recomputes the
 * totals — the AI never sets the final numbers.
 */
export interface MealEditAction {
  op: 'add' | 'remove' | 'portion' | 'rename';
  index?: number; // 1-based position in the plate the AI was shown
  name?: string;
  grams?: number;
  per100g?: Per100g; // AI fallback estimate for `add` (used only if no DB match)
}

/**
 * A single food the assistant suggests adding (from a photo, or when it is
 * unsure) — shown as a confirm card; added only when the patient taps ✓.
 */
export interface MealProposal {
  name: string;
  grams: number;
  per100g?: Per100g;
}

export interface MealEditResult {
  reply: string;
  transcript: string;
  actions: MealEditAction[];
  proposal: MealProposal | null;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Optional media for a turn: a voice note or a photo of a food to add. */
export interface MealEditMedia {
  audio?: { mimeType: string; data: string };
  /** Bare base64 JPEG of a food photo the patient sent in the chat. */
  image?: string;
}

/**
 * Ask the assistant to edit the current plate. Returns the assistant's reply,
 * the structured edit actions, and an optional confirm proposal. Accepts text,
 * a voice note, or a food photo (Gemini identifies it directly).
 */
export async function sendMealEdit(
  items: FoodItemResult[],
  messages: ChatTurn[],
  language: string,
  media?: MealEditMedia
): Promise<MealEditResult> {
  if (isDemoMode || !supabase) {
    await new Promise((r) => setTimeout(r, 700));
    return { reply: '', transcript: '', actions: [], proposal: null };
  }
  const mealItems = items.map((it) => ({
    name: it.name,
    grams: Math.round(it.portion_grams),
  }));
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: {
      mode: 'meal_edit',
      messages,
      language,
      mealItems,
      healthData: buildHealthContext(),
      ...(media?.audio ? { audio: media.audio } : {}),
      ...(media?.image ? { image: media.image } : {}),
    },
  });
  const quota = await asQuotaError(error, data);
  if (quota) throw quota;
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const r = (data?.result ?? {}) as Partial<MealEditResult>;
  const p = r.proposal;
  return {
    reply: typeof r.reply === 'string' ? r.reply : '',
    transcript: typeof r.transcript === 'string' ? r.transcript : '',
    actions: Array.isArray(r.actions) ? r.actions : [],
    proposal:
      p && typeof p.name === 'string' && Number(p.grams) > 0
        ? { name: p.name, grams: Number(p.grams), per100g: p.per100g }
        : null,
  };
}

/** Human-readable recap of what an apply changed, for the chat bubble. */
export interface AppliedChanges {
  items: FoodItemResult[];
  added: string[];
  removed: string[];
  changed: string[];
}

/**
 * Apply the AI's edit actions to the plate and return the new item list.
 * Index-based ops (portion/rename/remove) resolve against the ORIGINAL plate
 * the AI was shown; adds are appended last. Nutrition comes from the same
 * provider chain as a manual edit, so totals stay database-accurate.
 */
export async function applyMealActions(
  items: FoodItemResult[],
  actions: MealEditAction[]
): Promise<AppliedChanges> {
  let next = [...items];
  const removeIdx = new Set<number>();
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  // Pass 1 — portion / rename / mark removals, all against the original index.
  for (const a of actions) {
    const i = (a.index ?? 0) - 1;
    if (a.op === 'portion' && next[i] && a.grams) {
      next[i] = rescaleItem(next[i], Math.max(5, a.grams));
      changed.push(next[i].name);
    } else if (a.op === 'rename' && next[i] && a.name) {
      next[i] = await reidentifyItem(next[i], a.name);
      changed.push(next[i].name);
    } else if (a.op === 'remove' && next[i]) {
      removed.push(next[i].name);
      removeIdx.add(i);
    }
  }
  next = next.filter((_, idx) => !removeIdx.has(idx));

  // Pass 2 — additions (resolved through the DB chain, AI estimate fallback).
  for (const a of actions) {
    if (a.op === 'add' && a.name && a.grams) {
      const resolved = await resolveFood(
        {
          name: a.name,
          search_name: a.name,
          portion_grams: Math.max(5, a.grams),
          confidence: 1,
          is_main_food: false,
          is_estimated: !!a.per100g,
        },
        a.per100g
      );
      if (resolved) {
        next.push(resolved);
        added.push(a.name);
      }
    }
  }

  return { items: next, added, removed, changed };
}

/** Apply a confirmed proposal (the patient tapped ✓) as a single add. */
export async function applyProposal(
  items: FoodItemResult[],
  proposal: MealProposal
): Promise<AppliedChanges> {
  return applyMealActions(items, [
    { op: 'add', name: proposal.name, grams: proposal.grams, per100g: proposal.per100g },
  ]);
}
