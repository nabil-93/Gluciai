import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CHARACTERIZATION — the learned portion habit (part of finding N-6).
 *
 * When a patient corrects the same food's portion twice, the median of their
 * corrections silently REPLACES the vision estimate on every later scan of that
 * food. The estimate it replaces was bounded to 5–2000 g server-side; the
 * learned value was bounded only by `> 0`, so one mistyped 9 999 g could become
 * the standing habit — and every macro, including the one a dose is computed
 * from, scales linearly with it.
 *
 * Step 11a discards impossible corrections BEFORE the median rather than
 * clamping after it, so a single outlier cannot drag the habit at all.
 */

const { corrections } = vi.hoisted(() => ({ corrections: [] as any[] }));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ corrections }) },
}));

const { applyPortionLearning, getLearnedPortion } = await import(
  '@/services/nutrition/learning'
);

/** One recorded portion correction for `Couscous`. */
function portion(grams: string | number) {
  return {
    id: `c${grams}`,
    food_key: 'couscous',
    field: 'portion',
    ai_value: '300',
    user_value: String(grams),
    created_at: '2026-07-30T12:00:00.000Z',
  };
}

beforeEach(() => {
  corrections.length = 0;
});

describe('getLearnedPortion — only a possible habit is learned', () => {
  it('needs two corrections before it trusts a habit', () => {
    corrections.push(portion(180));
    expect(getLearnedPortion('Couscous')).toBeNull();
  });

  it('returns the median of two plausible corrections', () => {
    corrections.push(portion(180), portion(220));
    expect(getLearnedPortion('Couscous')).toBe(200);
  });

  it('discards an impossible correction instead of letting it drag the median', () => {
    // Before: (180 + 9999) / 2 → a 5 090 g habit.
    corrections.push(portion(180), portion(9999), portion(220));
    expect(getLearnedPortion('Couscous')).toBe(200);
  });

  it('learns nothing when every correction is impossible', () => {
    corrections.push(portion(9999), portion(50_000));
    expect(getLearnedPortion('Couscous')).toBeNull();
  });

  it('rejects a correction below the 5 g floor and a non-numeric one', () => {
    corrections.push(portion(1), portion('beaucoup'), portion(3));
    expect(getLearnedPortion('Couscous')).toBeNull();
  });

  it('keeps the bounds of the range itself usable', () => {
    corrections.push(portion(5), portion(2000));
    expect(getLearnedPortion('Couscous')).toBe(1003); // median of the two
  });
});

describe('applyPortionLearning — what reaches the provider chain', () => {
  const detected = { name: 'Couscous', portion_grams: 300, confidence: 0.9 };

  it('replaces the estimate with a plausible habit and reports the change', () => {
    corrections.push(portion(180), portion(180));
    const { detections, adjusted } = applyPortionLearning([detected]);
    expect(detections[0].portion_grams).toBe(180);
    expect(adjusted).toEqual(['Couscous']);
  });

  it('leaves the vision estimate alone when the habit was impossible', () => {
    corrections.push(portion(9999), portion(9999));
    const { detections, adjusted } = applyPortionLearning([detected]);
    expect(detections[0].portion_grams).toBe(300); // untouched
    expect(adjusted).toEqual([]);
  });

  it('does not report a habit within 10 g of the estimate', () => {
    // Unchanged behaviour, pinned so the new filter did not disturb it.
    corrections.push(portion(305), portion(305));
    const { detections, adjusted } = applyPortionLearning([detected]);
    expect(detections[0].portion_grams).toBe(300);
    expect(adjusted).toEqual([]);
  });
});
