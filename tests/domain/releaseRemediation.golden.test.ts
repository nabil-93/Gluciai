import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { directionRestartRequired, isRTL } from '@/i18n/direction';
// The pure leaf, not '@/lib/permissions' — the latter imports react-native's
// Linking, whose Flow entry point the node runner cannot parse.
import { permissionAction } from '@/lib/permissionAction';
import { MOROCCAN_FOODS } from '@/data/moroccanFoods';

/**
 * REGRESSION FIXTURES for the engineering defects found in
 * docs/FINAL-STRICT-ANDROID-IOS-GENERAL-AUDIT.md (B-1 … B-4, C-9, N-8).
 *
 * Every one of these defects lives in a code path the WEB build cannot
 * exercise — native layout direction, OS notification scheduling, a permission
 * the browser re-prompts for, and a storage bucket. That is precisely why they
 * survived a green test suite, a clean typecheck and a working web deployment.
 * So several fixtures below assert against the SOURCE rather than a return
 * value: the wiring is the defect, and the wiring is what must not regress.
 *
 * Nothing here asserts that a clinical rule is correct. Where a fixture pins a
 * nutrition value it pins TODAY'S value so a change is visible, exactly like
 * the `ru11Baseline` fixtures.
 */

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const LOCALES = ['fr', 'en', 'de', 'ar'] as const;
const locale = (l: string): Record<string, any> =>
  JSON.parse(src(`src/i18n/locales/${l}.json`));

/* ══════════════ B-1 — RTL needs a native restart, and says so ══════════════ */

describe('B-1 · layout direction across a language change', () => {
  it('Arabic is the RTL language and the other three are not', () => {
    expect(isRTL('ar')).toBe(true);
    for (const l of ['fr', 'en', 'de']) expect(isRTL(l)).toBe(false);
  });

  it('a native LTR→Arabic switch requires a restart', () => {
    expect(directionRestartRequired(false, 'ar', false)).toBe(true);
  });

  it('a native Arabic→LTR switch requires a restart too', () => {
    expect(directionRestartRequired(true, 'fr', false)).toBe(true);
  });

  it('a switch that does NOT change direction must not nag', () => {
    // fr → de is LTR → LTR, and re-selecting the active language changes
    // nothing at all. A restart prompt here would be noise.
    expect(directionRestartRequired(false, 'de', false)).toBe(false);
    expect(directionRestartRequired(false, 'en', false)).toBe(false);
    expect(directionRestartRequired(true, 'ar', false)).toBe(false);
  });

  it('web never requires a restart — the direction flips live', () => {
    expect(directionRestartRequired(false, 'ar', true)).toBe(false);
    expect(directionRestartRequired(true, 'fr', true)).toBe(false);
  });

  it('setAppLanguage reports restartRequired, and BOTH callers act on it', () => {
    // The defect was not the missing reload — it was the silence. If a future
    // edit drops either call site, Arabic renders left-to-right again with no
    // explanation, and only a device would catch it.
    expect(src('src/i18n/index.ts')).toMatch(/restartRequired/);
    for (const screen of ['src/app/profile-edit.tsx', 'src/app/welcome.tsx']) {
      expect(src(screen)).toMatch(/restartRequired/);
      expect(src(screen)).toMatch(/common\.restartTitle/);
    }
  });

  it('the restart copy exists and is non-empty in all four locales', () => {
    for (const l of LOCALES) {
      const c = locale(l).common;
      expect(c.restartTitle?.trim().length ?? 0).toBeGreaterThan(0);
      expect(c.restartBody?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

/* ══════════════ B-2 — scheduled notifications are localized ══════════════ */

describe('B-2 · the OS notification speaks the patient’s language', () => {
  const notifications = () => src('src/services/notifications.ts');

  it('refreshSmartReminders contains no hardcoded French literal', () => {
    // The five strings that used to be inline. Any of them reappearing means
    // a German or Arabic patient is receiving French on their lock screen.
    const gone = [
      'Contrôle glycémie 🩸',
      "Pensez à mesurer votre glycémie aujourd'hui.",
      'Petit-déjeuner 🍽️',
      'Bilan du jour 📊',
      'Jetez un œil à votre journée',
    ];
    const body = notifications();
    for (const literal of gone) expect(body).not.toContain(literal);
  });

  it('it schedules through i18n instead', () => {
    const body = notifications();
    expect(body).toMatch(/i18n\.t\.bind\(i18n\)/);
    expect(body).toMatch(/reminders\.notifyGlucoseTitle/);
    expect(body).toMatch(/reminders\.notifyEveningBody/);
  });

  it('every notification key exists and is non-empty in all four locales', () => {
    const keys = [
      'notifyGlucoseTitle',
      'notifyGlucoseLearned',
      'notifyGlucoseDefault',
      'notifyInsulinTitle',
      'notifyInsulinBody',
      'notifyBreakfastTitle',
      'notifyBreakfastBody',
      'notifyEveningTitle',
      'notifyEveningBody',
    ];
    for (const l of LOCALES) {
      const r = locale(l).reminders;
      for (const k of keys) {
        expect(r[k], `${l}.reminders.${k}`).toBeTruthy();
        expect(String(r[k]).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('the French values are unchanged, so French output does not move', () => {
    const r = locale('fr').reminders;
    expect(r.notifyGlucoseTitle).toBe('Contrôle glycémie 🩸');
    expect(r.notifyGlucoseDefault).toBe("Pensez à mesurer votre glycémie aujourd'hui.");
    expect(r.notifyEveningBody).toBe(
      'Jetez un œil à votre journée : glycémie, repas et injections.'
    );
  });

  it('the hour placeholder survives translation in every locale', () => {
    for (const l of LOCALES) {
      const r = locale(l).reminders;
      expect(r.notifyGlucoseLearned, `${l}`).toContain('{{hour}}');
      expect(r.notifyInsulinBody, `${l}`).toContain('{{hour}}');
    }
  });

  it('reminders are rescheduled when the language changes', () => {
    // Notification text is resolved at SCHEDULING time, so without this the
    // patient keeps the previous language until the next cold start.
    expect(src('src/app/(tabs)/_layout.tsx')).toMatch(/\[i18n\.language\]/);
  });
});

/* ══════════════ B-3 — a denied camera permission has a way back ══════════════ */

describe('B-3 · permanently denied permission routes to Settings', () => {
  it('asks the OS while the OS is still willing', () => {
    expect(permissionAction({ granted: false, canAskAgain: true })).toBe('request');
  });

  it('routes to Settings once the OS refuses to prompt again', () => {
    // Android "Don't ask again"; iOS after any single denial.
    expect(permissionAction({ granted: false, canAskAgain: false })).toBe('settings');
  });

  it('an unresolved permission takes the request path, not Settings', () => {
    expect(permissionAction(null)).toBe('request');
    expect(permissionAction(undefined)).toBe('request');
  });

  it('a granted permission never routes to Settings', () => {
    expect(permissionAction({ granted: true, canAskAgain: false })).toBe('request');
    expect(permissionAction({ granted: true, canAskAgain: true })).toBe('request');
  });

  it('every camera screen with a grant button uses the shared helper', () => {
    // A screen calling `requestPermission` directly is a button that does
    // nothing once the permission is permanently denied — the whole defect.
    for (const screen of [
      'src/app/scan.tsx',
      'src/app/barcode.tsx',
      'src/components/ScanAddSheet.tsx',
    ]) {
      expect(src(screen), screen).toMatch(/requestOrOpenSettings/);
    }
  });

  it('the Settings copy exists in all four locales', () => {
    for (const l of LOCALES) {
      const s = locale(l).scanner;
      expect(s.openSettings?.trim().length ?? 0).toBeGreaterThan(0);
      expect(s.permissionBlocked?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

/* ══════════════ B-4 — the dosing screen refuses an implausible reading ══════ */

describe('B-4 · the bolus glucose field carries the P7-005 guard', () => {
  const bolus = () => src('src/app/bolus.tsx');

  it('imports the same guard log-glucose uses — not a second one', () => {
    const body = bolus();
    expect(body).toMatch(/isPlausibleTypedMgdl/);
    expect(body).toMatch(/looksLikeMmol/);
  });

  it('withholds a refused reading from the engine instead of asserting it', () => {
    // Feeding 18 (a mmol/L reading) as 18 mg/dL trips the hypo guard and
    // returns 0 U — telling a patient at 324 mg/dL that they are hypo.
    const body = bolus();
    expect(body).toMatch(/const engineGlucose = glucoseUnitWarning \? null :/);
    // …and that withheld value is what actually reaches the engine.
    expect(body).toMatch(/glucose: engineGlucose/);
  });

  it('disables the calculate action while the reading is refused', () => {
    expect(bolus()).toMatch(/disabled=\{\(!carbs && !glucose\) \|\| glucoseUnitWarning\}/);
  });

  it('calculate() refuses even if the CTA is somehow reachable', () => {
    expect(bolus()).toMatch(/if \(glucoseUnitWarning\) return;/);
  });

  it('reuses the log screen’s wording rather than inventing a second refusal', () => {
    const body = bolus();
    expect(body).toMatch(/log\.unitLooksMmol/);
    expect(body).toMatch(/log\.unitOutOfRange/);
  });
});

/* ══════════════ C-9 — deletion removes the patient’s files ══════════════ */

describe('C-9 · account deletion erases stored objects', () => {
  const fn = () => src('supabase/functions/delete-account/index.ts');

  it('removes objects from every per-user bucket', () => {
    const body = fn();
    for (const bucket of ['profile-images', 'meal-images', 'medical-reports']) {
      expect(body, bucket).toContain(bucket);
    }
  });

  it('never touches the shared dish artwork', () => {
    // `dish-images` is app-owned and not keyed by uid — deleting from it would
    // remove artwork every other patient sees.
    expect(fn()).not.toContain("'dish-images'");
  });

  it('scopes the deletion to the caller’s own uid', () => {
    expect(fn()).toMatch(/\.list\(uid/);
    expect(fn()).toMatch(/\$\{uid\}\/\$\{f\.name\}/);
  });

  it('does not report success when a file could not be removed', () => {
    const body = fn();
    expect(body).toMatch(/storageErrors/);
    // The auth user must still exist so the patient can retry.
    expect(body.indexOf('storageErrors.length > 0')).toBeLessThan(
      body.indexOf('admin.auth.admin.deleteUser')
    );
  });
});

/* ══════════════ N-8 — colliding food aliases, pinned not decided ══════════ */

describe('N-8 · one dish name must not mean two nutrition profiles', () => {
  /** Every alias/name that resolves to more than one distinct record. */
  const collisions = (): Map<string, string[]> => {
    const byKey = new Map<string, Set<string>>();
    for (const f of MOROCCAN_FOODS) {
      for (const a of [f.name_en, f.name_fr, f.name_ar, ...(f.aliases ?? [])]) {
        const k = String(a).toLowerCase().trim();
        if (!k) continue;
        if (!byKey.has(k)) byKey.set(k, new Set());
        byKey.get(k)!.add(f.id);
      }
    }
    const out = new Map<string, string[]>();
    for (const [k, ids] of byKey) if (ids.size > 1) out.set(k, [...ids].sort());
    return out;
  };

  /**
   * KNOWN-BAD BASELINE — N-8.
   *
   * Seven names each resolve to two records with materially different
   * nutrition (`zmita`'s carbohydrate differs by 53 %). `searchMoroccanFood`
   * keeps the FIRST match on a tie, so the winner is deterministic but
   * arbitrary, and nothing tells the patient another record exists.
   *
   * WHICH RECORD IS RIGHT FOR EACH NAME IS A NUTRITION-DATA DECISION, not an
   * engineering one — resolving it means knowing whether "عدس" should mean the
   * 300 g plate or the 350 g stew. So this fixture PINS the current set rather
   * than changing it, and the test below stops a NEW collision appearing.
   *
   * Owning remediation: RU-3 / product data review. NOT FIXED.
   */
  const KNOWN = [
    'loubia (white bean stew)', // loubia      / loubia_zit
    'sfouf', //                    sellou      / zmita
    'zmita', //                    sellou      / zmita
    'اللوبيا', //                   loubia      / loubia_zit
    'العدس', //                    adass       / adas
    'سفة', //                      seffa       / seffa_sucree
    'عدس', //                      adass       / adas
  ].sort();

  it('the collision set is exactly the seven already recorded', () => {
    expect([...collisions().keys()].sort()).toEqual(KNOWN);
  });

  it('no NEW colliding alias has been introduced', () => {
    const found = [...collisions().keys()].sort();
    const added = found.filter((k) => !KNOWN.includes(k));
    expect(added, `new alias collisions: ${added.join(', ')}`).toEqual([]);
  });

  it('the arbitrary winner for each collision is pinned', () => {
    // If a record is reordered, renamed or removed, these change — which is
    // the point: the nutrition behind a scanned dish must not move silently.
    const c = collisions();
    expect(c.get('عدس')).toEqual(['adas', 'adass']);
    expect(c.get('سفة')).toEqual(['seffa', 'seffa_sucree']);
    expect(c.get('zmita')).toEqual(['sellou', 'zmita']);
  });

  it('records the size of the disagreement, so it cannot be called cosmetic', () => {
    const per100 = (id: string, field: 'carbs' | 'calories') => {
      const f = MOROCCAN_FOODS.find((x) => x.id === id)!;
      return Math.round((f[field] / f.serving_grams) * 1000) / 10;
    };
    // Both answer to "sfouf" and to "zmita", and they disagree by 53 % on the
    // one number a bolus is computed from.
    expect(per100('sellou', 'carbs')).toBeCloseTo(36.0, 1);
    expect(per100('zmita', 'carbs')).toBeCloseTo(55.0, 1);
  });
});
