import { describe, expect, it, vi } from 'vitest';

/**
 * CHARACTERIZATION — `sanitizeAction`.
 *
 * The trust boundary between the AI and the patient's health record. Every tool
 * call the model emits passes through here before it can become a stored
 * insulin dose, glucose reading or meal. These tests record exactly what it
 * accepts, what it silently rewrites, and what it rejects.
 *
 * Rewriting matters as much as rejecting: a value the model got wrong that is
 * quietly replaced by a default reaches the confirmation card looking like a
 * value the model chose.
 *
 * `aiLogger.ts` imports Supabase, the Zustand store, a Web-Audio mic streamer
 * and the persistence layer at module load. `sanitizeAction` itself touches
 * none of them, so they are stubbed. Nothing outside `tests/` is changed.
 */

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } },
  isDemoMode: () => false,
}));

vi.mock('@/services/geminiLive', () => ({ MicStreamer: class {} }));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ profile: null, meals: [] }) },
}));

vi.mock('@/services/data', () => ({
  deleteActivity: vi.fn(),
  deleteEvent: vi.fn(),
  deleteGlucose: vi.fn(),
  deleteInsulin: vi.fn(),
  deleteMeal: vi.fn(),
  deleteMeasure: vi.fn(),
  logEvent: vi.fn(),
  saveActivity: vi.fn(),
  saveGlucose: vi.fn(),
  saveInsulin: vi.fn(),
  saveMeal: vi.fn(),
  saveMeasure: vi.fn(),
}));

vi.mock('@/services/reminders', () => ({
  createAiReminder: vi.fn(),
  markReminder: vi.fn(),
  resolveFollowUps: vi.fn(),
}));

const { sanitizeAction } = await import('@/services/aiLogger');

type LoggerAction = NonNullable<ReturnType<typeof sanitizeAction>>;

/**
 * `sanitizeAction` returns a discriminated union, so reading a branch-specific
 * field needs narrowing. This wrapper infers the branch from the `type` in the
 * fixture and changes nothing about the call — tests that only assert on the
 * whole result, or expect null, call `sanitizeAction` directly.
 */
function act<T extends LoggerAction['type']>(
  raw: { type: T } & Record<string, unknown>
): Extract<LoggerAction, { type: T }> | null {
  return sanitizeAction(raw) as Extract<LoggerAction, { type: T }> | null;
}

describe('sanitizeAction — non-objects and unknown types', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'insulin'],
    ['a number', 5],
    ['false', false],
  ])('rejects %s', (_label, raw) => {
    expect(sanitizeAction(raw)).toBeNull();
  });

  it('rejects an unrecognised type', () => {
    expect(sanitizeAction({ type: 'bolus' })).toBeNull();
    expect(sanitizeAction({ type: undefined })).toBeNull();
    expect(sanitizeAction({})).toBeNull();
  });

  it('accepts an array, because typeof [] is object — the type switch rejects it', () => {
    expect(sanitizeAction([])).toBeNull();
  });
});

describe('sanitizeAction — insulin', () => {
  it('accepts a plausible dose and rounds to 0.1 U', () => {
    expect(sanitizeAction({ type: 'insulin', dose: 6.44 })).toEqual({
      type: 'insulin',
      dose: 6.4,
      insulin_type: 'rapid',
      minutes_ago: undefined,
    });
  });

  it('parses a numeric string', () => {
    expect(act({ type: 'insulin', dose: '6.5' })?.dose).toBe(6.5);
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['above 100 U', 101],
    ['NaN', Number.NaN],
    ['a non-numeric string', 'six'],
    ['null', null],
    ['missing', undefined],
  ])('rejects a %s dose', (_label, dose) => {
    expect(sanitizeAction({ type: 'insulin', dose })).toBeNull();
  });

  it('accepts the boundary dose of 100 U', () => {
    expect(act({ type: 'insulin', dose: 100 })?.dose).toBe(100);
  });

  it('keeps a valid insulin type and falls back to rapid otherwise', () => {
    expect(act({ type: 'insulin', dose: 5, insulin_type: 'long' })?.insulin_type).toBe(
      'long'
    );
    expect(act({ type: 'insulin', dose: 5, insulin_type: 'mixed' })?.insulin_type).toBe(
      'mixed'
    );
    expect(act({ type: 'insulin', dose: 5, insulin_type: 'basal' })?.insulin_type).toBe(
      'rapid'
    );
  });

  /**
   * KNOWN-BAD BASELINE — P10-004
   * The 100 U ceiling is an absolute bound, not a patient-relative one. A model
   * that emits 60 U for someone whose largest recorded dose is 8 U passes
   * unchanged and unflagged; `sanitizeAction` has no access to the profile or
   * the dose history. The confirmation card is the only remaining barrier.
   * Owning remediation: RU-7 (AI consent boundary) + RU-2.
   */
  it('KNOWN-BAD BASELINE — P10-004: a wildly out-of-character dose passes unflagged', () => {
    expect(sanitizeAction({ type: 'insulin', dose: 60 })).toEqual({
      type: 'insulin',
      dose: 60,
      insulin_type: 'rapid',
      minutes_ago: undefined,
    });
  });
});

describe('sanitizeAction — glucose', () => {
  it('accepts a plausible reading and rounds to a whole number', () => {
    expect(sanitizeAction({ type: 'glucose', value: 142.6 })).toEqual({
      type: 'glucose',
      value: 143,
      minutes_ago: undefined,
    });
  });

  it('applies the 20–900 window at its boundaries', () => {
    expect(act({ type: 'glucose', value: 20 })?.value).toBe(20);
    expect(act({ type: 'glucose', value: 900 })?.value).toBe(900);
    expect(sanitizeAction({ type: 'glucose', value: 19 })).toBeNull();
    expect(sanitizeAction({ type: 'glucose', value: 901 })).toBeNull();
  });

  it('rejects a missing or unparseable value, which falls back to 0', () => {
    expect(sanitizeAction({ type: 'glucose' })).toBeNull();
    expect(sanitizeAction({ type: 'glucose', value: 'high' })).toBeNull();
  });

  /**
   * KNOWN-BAD BASELINE — P10-005 / P7-005
   * The window is mg/dL only and carries no unit. A patient speaking in mmol/L
   * ("my sugar is 5.6") produces a value below 20, which is rejected — so the
   * reading is silently lost rather than converted or queried. Above 20 the two
   * scales overlap in neither direction, but nothing records which was meant.
   * Owning remediation: RU-4 (unit contract).
   */
  it('KNOWN-BAD BASELINE — P10-005: an mmol/L reading is discarded, not converted', () => {
    expect(sanitizeAction({ type: 'glucose', value: 5.6 })).toBeNull();
    expect(sanitizeAction({ type: 'glucose', value: 12 })).toBeNull();
  });
});

describe('sanitizeAction — meal', () => {
  it('requires a name', () => {
    expect(sanitizeAction({ type: 'meal' })).toBeNull();
    expect(sanitizeAction({ type: 'meal', name: '   ' })).toBeNull();
    expect(sanitizeAction({ type: 'meal', name: 42 })).toBeNull();
  });

  it('trims the name and keeps the portion string when present', () => {
    const a = sanitizeAction({ type: 'meal', name: '  Tajine  ', portion: '1 assiette' });
    expect(a).toMatchObject({ name: 'Tajine', portion: '1 assiette' });
  });

  it('drops a non-string portion', () => {
    expect(act({ type: 'meal', name: 'x', portion: 250 })?.portion).toBeUndefined();
  });

  it('floors every macro at zero and rounds to whole numbers', () => {
    expect(
      sanitizeAction({
        type: 'meal',
        name: 'x',
        calories: -100,
        carbs: 45.4,
        sugar: -1,
        protein: 12.6,
        fat: 'nope',
        fiber: 3.5,
      })
    ).toMatchObject({ calories: 0, carbs: 45, sugar: 0, protein: 13, fat: 0, fiber: 4 });
  });

  it('defaults the glycemic index to 50 and clamps it to 0–110', () => {
    expect(act({ type: 'meal', name: 'x' })?.glycemic_index).toBe(50);
    expect(act({ type: 'meal', name: 'x', glycemic_index: 300 })?.glycemic_index).toBe(110);
    expect(act({ type: 'meal', name: 'x', glycemic_index: -5 })?.glycemic_index).toBe(0);
    expect(act({ type: 'meal', name: 'x', glycemic_index: 0 })?.glycemic_index).toBe(0);
  });

  it('keeps a valid meal_type and drops anything else', () => {
    expect(act({ type: 'meal', name: 'x', meal_type: 'lunch' })?.meal_type).toBe('lunch');
    expect(act({ type: 'meal', name: 'x', meal_type: 'brunch' })?.meal_type).toBeUndefined();
    expect(act({ type: 'meal', name: 'x' })?.meal_type).toBeUndefined();
  });

  /**
   * KNOWN-BAD BASELINE — P10-006
   * Carbohydrate has NO upper bound and no plausibility check, and it is the
   * one field that drives an insulin dose. A model emitting 900 g for a plate
   * of couscous is accepted verbatim; the only barrier left is the patient
   * reading the confirmation card. Compare the insulin branch, which does bound
   * its dose. Owning remediation: RU-2 (physical validation) + RU-7.
   */
  it('KNOWN-BAD BASELINE — P10-006: carbohydrate is unbounded above', () => {
    expect(act({ type: 'meal', name: 'couscous', carbs: 900 })?.carbs).toBe(900);
    expect(act({ type: 'meal', name: 'x', carbs: 1e6 })?.carbs).toBe(1_000_000);
  });

  it('does not bound the name length, unlike a note', () => {
    const long = 'a'.repeat(5000);
    expect(act({ type: 'meal', name: long })?.name).toHaveLength(5000);
  });

  /* The carbohydrate the model returns is the one field a dose is computed
     from, and the schema cannot force a model to fill it in. `num()` reads an
     omission as 0, so the omission has to be reported separately. */
  it('reports an omitted carbohydrate as unknown rather than as 0 g', () => {
    const a = act({ type: 'meal', name: 'Tajine' });
    expect(a?.carbs).toBe(0); // the number every consumer still reads
    expect(a?.carbs_known).toBe(false); // …labelled as a placeholder
  });

  it('reports a stated 0 as a known zero', () => {
    expect(act({ type: 'meal', name: 'Thé sans sucre', carbs: 0 })?.carbs_known).toBe(true);
  });

  it('accepts a numeric string as stated', () => {
    const a = act({ type: 'meal', name: 'x', carbs: '45' });
    expect(a).toMatchObject({ carbs: 45, carbs_known: true });
  });

  it('treats null, an empty string and nonsense as not stated', () => {
    expect(act({ type: 'meal', name: 'x', carbs: null })?.carbs_known).toBe(false);
    expect(act({ type: 'meal', name: 'x', carbs: '' })?.carbs_known).toBe(false);
    expect(act({ type: 'meal', name: 'x', carbs: 'beaucoup' })?.carbs_known).toBe(false);
  });
});

describe('sanitizeAction — activity', () => {
  it('accepts a plausible session', () => {
    expect(sanitizeAction({ type: 'activity', duration_min: 45, kind: 'run', intensity: 'high' })).toEqual(
      { type: 'activity', kind: 'run', duration_min: 45, intensity: 'high', minutes_ago: undefined }
    );
  });

  it('applies the 1–600 minute window', () => {
    expect(act({ type: 'activity', duration_min: 600 })?.duration_min).toBe(600);
    expect(sanitizeAction({ type: 'activity', duration_min: 601 })).toBeNull();
    expect(sanitizeAction({ type: 'activity', duration_min: 0 })).toBeNull();
    expect(sanitizeAction({ type: 'activity', duration_min: -30 })).toBeNull();
  });

  it('falls back to other/medium for an unrecognised kind or intensity', () => {
    const a = sanitizeAction({
      type: 'activity',
      duration_min: 30,
      kind: 'swimming',
      intensity: 'extreme',
    });
    expect(a).toMatchObject({ kind: 'other', intensity: 'medium' });
  });
});

describe('sanitizeAction — measure', () => {
  it('accepts a weight and defaults the unit to kg', () => {
    expect(sanitizeAction({ type: 'measure', value: 82.46 })).toEqual({
      type: 'measure',
      kind: 'weight',
      value: 82.5,
      unit: 'kg',
      minutes_ago: undefined,
    });
  });

  it('accepts an hba1c and defaults the unit to %', () => {
    expect(sanitizeAction({ type: 'measure', kind: 'hba1c', value: 7.2 })).toMatchObject({
      kind: 'hba1c',
      unit: '%',
    });
  });

  it('treats any unrecognised kind as a weight', () => {
    expect(act({ type: 'measure', kind: 'blood_pressure', value: 120 })?.kind).toBe(
      'weight'
    );
  });

  it('keeps a caller-supplied unit string', () => {
    expect(act({ type: 'measure', value: 180, unit: 'lb' })?.unit).toBe('lb');
  });

  it('rejects a zero or negative value', () => {
    expect(sanitizeAction({ type: 'measure', value: 0 })).toBeNull();
    expect(sanitizeAction({ type: 'measure', value: -70 })).toBeNull();
  });

  /**
   * KNOWN-BAD BASELINE — P10-007
   * `measure` has a floor but no ceiling and no per-kind range, so an hba1c of
   * 800 % or a body weight of 5000 kg is accepted, stored, and — for weight —
   * flows into the program engine's BMR. The unit is a free string, so 'lb' is
   * recorded without conversion and later read as kilograms.
   * Owning remediation: RU-2 + RU-4.
   */
  it('KNOWN-BAD BASELINE — P10-007: measures have no upper bound and no unit contract', () => {
    expect(act({ type: 'measure', kind: 'hba1c', value: 800 })?.value).toBe(800);
    expect(act({ type: 'measure', value: 5000 })?.value).toBe(5000);
  });
});

describe('sanitizeAction — reminder', () => {
  it('accepts a message with a due window inside seven days', () => {
    expect(sanitizeAction({ type: 'reminder', message: '  Contrôle  ', due_in_minutes: 90 })).toEqual({
      type: 'reminder',
      message: 'Contrôle',
      due_in_minutes: 90,
      follow_kind: 'other',
    });
  });

  it('applies the 1–10080 minute window', () => {
    expect(sanitizeAction({ type: 'reminder', message: 'x', due_in_minutes: 1 })).not.toBeNull();
    expect(sanitizeAction({ type: 'reminder', message: 'x', due_in_minutes: 10_080 })).not.toBeNull();
    expect(sanitizeAction({ type: 'reminder', message: 'x', due_in_minutes: 0 })).toBeNull();
    expect(sanitizeAction({ type: 'reminder', message: 'x', due_in_minutes: 10_081 })).toBeNull();
  });

  it('requires a non-empty message', () => {
    expect(sanitizeAction({ type: 'reminder', message: '  ', due_in_minutes: 60 })).toBeNull();
    expect(sanitizeAction({ type: 'reminder', due_in_minutes: 60 })).toBeNull();
  });

  it('keeps a known follow_kind and falls back to other', () => {
    expect(
      sanitizeAction({ type: 'reminder', message: 'x', due_in_minutes: 60, follow_kind: 'insulin' })
    ).toMatchObject({ follow_kind: 'insulin' });
    expect(
      sanitizeAction({ type: 'reminder', message: 'x', due_in_minutes: 60, follow_kind: 'bolus' })
    ).toMatchObject({ follow_kind: 'other' });
  });

  it('carries no minutes_ago — a reminder is forward-looking', () => {
    const a = sanitizeAction({
      type: 'reminder',
      message: 'x',
      due_in_minutes: 60,
      minutes_ago: 30,
    });
    expect(a).not.toHaveProperty('minutes_ago');
  });
});

describe('sanitizeAction — note', () => {
  it('trims and truncates to 300 characters', () => {
    expect(sanitizeAction({ type: 'note', text: '  hello  ' })).toEqual({
      type: 'note',
      text: 'hello',
      minutes_ago: undefined,
    });
    expect(act({ type: 'note', text: 'a'.repeat(500) })?.text).toHaveLength(300);
  });

  it('rejects an empty or non-string note', () => {
    expect(sanitizeAction({ type: 'note', text: '   ' })).toBeNull();
    expect(sanitizeAction({ type: 'note', text: 123 })).toBeNull();
    expect(sanitizeAction({ type: 'note' })).toBeNull();
  });
});

describe('sanitizeAction — minutes_ago backdating', () => {
  it('accepts a positive backdate and rounds it', () => {
    expect(act({ type: 'insulin', dose: 5, minutes_ago: 44.6 })?.minutes_ago).toBe(45);
  });

  it('clamps a backdate to twelve hours', () => {
    expect(act({ type: 'insulin', dose: 5, minutes_ago: 5000 })?.minutes_ago).toBe(720);
  });

  it('drops a zero, negative or unparseable backdate rather than rejecting the action', () => {
    expect(act({ type: 'insulin', dose: 5, minutes_ago: 0 })?.minutes_ago).toBeUndefined();
    expect(act({ type: 'insulin', dose: 5, minutes_ago: -30 })?.minutes_ago).toBeUndefined();
    expect(
      act({ type: 'insulin', dose: 5, minutes_ago: 'yesterday' })?.minutes_ago
    ).toBeUndefined();
  });

  it('applies the same rule across every backdatable type', () => {
    expect(act({ type: 'glucose', value: 120, minutes_ago: 60 })?.minutes_ago).toBe(60);
    expect(act({ type: 'meal', name: 'x', minutes_ago: 60 })?.minutes_ago).toBe(60);
    expect(
      act({ type: 'activity', duration_min: 30, minutes_ago: 60 })?.minutes_ago
    ).toBe(60);
    expect(act({ type: 'measure', value: 80, minutes_ago: 60 })?.minutes_ago).toBe(60);
    expect(act({ type: 'note', text: 'x', minutes_ago: 60 })?.minutes_ago).toBe(60);
  });
});
