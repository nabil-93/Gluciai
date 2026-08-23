# GlucoAI — Final Release Readiness

**Date:** 2026-08-16 · **HEAD:** `7adb267` (+16 uncommitted files)
**Verdict: NOT READY FOR RELEASE.** Six evidence-backed blockers, listed in §H.

Everything below is either a gate that was actually run in this session, or a
blocker with the exact requirement that would lift it. Nothing here is
projected, estimated, or inferred from a passing test to a claim about a
device. Where proof is missing, the row says so.

---

## A. CODE

### Gates — all run this session

| Gate | Result |
|---|---|
| Full test suite | **1340 passed / 1340** (53 files) |
| Clinical suite (`tests/clinical`) | **222 passed / 222** — unchanged |
| Typecheck (`tsc --noEmit`) | **PASS** (exit 0) |
| Lint ratchet | **PASS** — 6 findings, 6 in baseline, none new |

### Bugs fixed in this remediation phase

| ID | Defect | Fix |
|---|---|---|
| **BUG-A1** | Language-restart dialog resolved with the *previous* language — a patient choosing العربية got an English dialog, at the one moment they showed they may not read English | `t(key, { lng: code })` in `welcome.tsx` + `profile-edit.tsx` |
| **BUG-A3** | Backend error text shown verbatim: always English, and can leak provider detail | `authErrors.ts` maps conditions → 8 vetted i18n keys × 4 locales |
| **Orphan accounts** | `auth.signUp` ran before onboarding, so every abandoned wizard left a real `auth.users` row with no profile — blocking the patient's own email | Registration deferred; account created as the final onboarding commit |
| **Phone regression** | *Self-inflicted during the lifecycle change.* Moving the sign-up deleted the block that wrote `phone`/`name` to `profiles`. The `handle_new_user` trigger (migration 0013) inserts only `user_id/email/role`, and `saveProfile` has no phone field — so the dashboard would have silently lost the number it reaches patients on | Best-effort `profiles` update after sign-up + regression test |

Account-enumeration note: wrong-password and unknown-account deliberately share
**one** key (`authError.invalidCredentials`), so the error cannot be used to
discover which emails are registered.

### Known remaining code issues

| Issue | Severity | Status |
|---|---|---|
| `profile-edit.tsx` showed raw `r.error` on **deletion AND password change** | Low | ✅ **FIXED** — `accountErrors.ts`, 7 keys × 4 locales, 23 tests |
| `ITSAppUsesNonExemptEncryption` absent from `app.json` | Blocks smooth submission | ⛔ **DECISION REQUIRED** — see §C. Not set: it is a declaration about the product, not an engineering value |
| `expo-updates` not installed | Channels inert | Known — `preview`/`production` channels in `eas.json` cannot deliver OTA updates |
| 6 baseline lint findings | Accepted | Pinned in `.github/lint-baseline.json` |

No other defect was found in this audit.

**Note on the deletion fix scope.** The audit flagged one leak; auditing the
whole path found **two** — `changePassword` rendered `r.error` the same way at
line 159. Both are closed by the same mapper. `ActionResult.error` still
carries the original so `__DEV__` logging keeps the technical detail.

---

## B. ANDROID

**20 PASS / 0 FAIL / 23 BLOCKED / 2 UNVERIFIED** (45 flows)

All 20 passes are real device observations recorded in
`ANDROID-DEVICE-VALIDATION-REPORT.md`, including AF-05 signup confirmed in
`auth.users` by SQL and AF-18 deletion confirmed server-side.

The 23 blocked flows were **not executed**. The emulator was reaped by the
sandbox after each launch (five strategies attempted, boot confirmed at
35 899 ms with no surviving process). They are blocked by environment, not by
a defect.

### Blocker matrix

| Flow | Status | Requirement | Emulator OK? | Physical? | Camera | Network toggle | Notif. runtime | Hardware |
|---|---|---|---|---|---|---|---|---|
| Registration lifecycle E2E (12 checks) | BLOCKED | `PERSISTENT_EMULATOR` | ✅ | — | — | — | — | — |
| AF-17 notification delivery FR/EN/DE/AR | BLOCKED | `NOTIFICATION_RUNTIME` | ✅ | — | — | — | ✅ | — |
| Notification detail + modal localization | BLOCKED | `NOTIFICATION_RUNTIME` | ✅ | — | — | — | ✅ | — |
| Language persistence FR/EN (AR/DE observed) | BLOCKED | `PERSISTENT_EMULATOR` | ✅ | — | — | — | — | — |
| Glucose / insulin / meal entry + history | BLOCKED | `PERSISTENT_EMULATOR` | ✅ | — | — | — | — | — |
| Reports / PDF export | BLOCKED | `PERSISTENT_EMULATOR` | ✅ | — | — | — | — | — |
| Background / foreground / restart lifecycle | BLOCKED | `PERSISTENT_EMULATOR` | ✅ | — | — | — | — | — |
| Scanner capture → AI → result | BLOCKED | `CAMERA_RUNTIME` | ❌ | ✅ | ✅ | — | — | — |
| Barcode scan | BLOCKED | `CAMERA_RUNTIME` | ❌ | ✅ | ✅ | — | — | — |
| Network loss / recovery | BLOCKED | `DEVICE` | ❌ | ✅ | — | ✅ | — | — |
| Biometrics | BLOCKED | `HARDWARE` | ❌ | ✅ | — | — | — | ✅ |
| Performance / battery | BLOCKED | `HARDWARE` | ❌ | ✅ | — | — | — | ✅ |

**A persistent emulator alone lifts 7 of the 12 rows.** Only camera, network
toggling, biometrics and performance genuinely require a physical phone.

---

## C. iOS

| Item | Status |
|---|---|
| Bundle identifier | ✅ `com.nabil.glucoai` |
| `NSCameraUsageDescription` | ✅ Present |
| `NSMicrophoneUsageDescription` | ✅ Present |
| `NSPhotoLibraryUsageDescription` | ✅ Present |
| `ITSAppUsesNonExemptEncryption` | ❌ **Absent** — forces a manual export-compliance answer on every upload |
| EAS profiles | ⚠️ `development`/`preview`/`production` exist, none has an `ios` block |
| Apple team | ❌ `eas device:list` → *"No Apple teams found for account tsuhel"* |
| Credentials | ❌ Cannot be provisioned without a team |
| Registered device | ❌ None |

```
CONFIGURATION : NEARLY READY — 3 usage strings present; encryption
                declaration missing, no iOS build profile
BUILD         : BLOCKED — no Apple Developer team
DEVICE        : NOT AVAILABLE
VALIDATION    : NOT STARTED — 0 of 45 flows
```

### IOS COMPLIANCE DECISION REQUIRED

`ITSAppUsesNonExemptEncryption` was investigated for automatic configuration
and **deliberately left unset**.

**What is missing.** No authoritative value exists anywhere in the repository.
There is no `app.config.js/ts`; `eas.json` has no `ios` block in any of the
three profiles; and no document states an intended value.

**Why it cannot safely be inferred.** The repository is genuinely ambiguous,
and the ambiguity points both ways:

- The app ships **`expo-secure-store ~57.0.0`** as a dependency. It is *not
  imported anywhere in `src/`* — but a dependency that ships in the binary is
  exactly the kind of fact an export declaration turns on, and whether it
  counts is a compliance judgement, not a `grep` result.
- Traffic is HTTPS to Supabase/Gemini, which is normally the exempt case — but
  "normally" is not a determination anyone but the owner may record.

Two existing documents already reached this conclusion independently:
`FINAL-BLOCKER-PACK.md` (B-14) and `REMEDIATION-PLAN.md` both state it is a
*"declaration about the product, answered in App Store Connect — engineering
must not assert it."* Setting it now would contradict a decision this project
has already made twice.

A wrong value here is not a bug — it is a **false legal declaration to Apple
and to US export authorities**. `true` and `false` are both actively harmful if
guessed.

**What the owner must decide.** Whether GlucoAI uses non-exempt encryption:
answer once in App Store Connect, or record the answer here and set
`ios.infoPlist.ITSAppUsesNonExemptEncryption` accordingly. If the app only uses
HTTPS and platform keychain storage, the answer is usually `false` — **but that
determination is the owner's to make and record, not engineering's to assume.**

Unblock order: Apple Developer membership → **owner answers the export
declaration** → add `ios` block to the EAS profile → `eas credentials` →
register a device.

---

## D. SCANNER

**Functional (static/unit) — verified:**
camera route + `useCameraPermissions`; permission denial handled with an
"open settings" path; gallery fallback via `launchImageLibraryAsync`;
loading/success states; unidentified food → `scanner.noDetect`; retry;
errors mapped through `scanErrorKey` (`visionCapture.ts`) rather than shown
raw; nutrition parsing and rendering covered by the golden suites
(`analyzeMealNormalize`, `nutritionProvenance`, `carbProvenance*`,
`scanFailureHonesty`); meal creation via `saveMeal`; bolus handoff pinned by
`bolusHandoff.golden.test.ts`.

**REAL NUTRITIONAL ACCURACY: UNVERIFIED.**
No camera was available and no controlled reference meals exist. Whether the
AI returns *correct grams of carbohydrate for a real plate* has never been
measured. No food reference values were invented to close this gap.

Required: photographed meals with independently known nutritional values
(lab-analysed or manufacturer-declared), across the Moroccan dishes the app
targets.

---

## E. BOLUS

**Software status: PASS.** 222 clinical tests green, unchanged this phase.
Chain audited end-to-end — glucose, carbs, correction, IOB, activity,
warnings, caps, rounding, units, missing values, premix. **No formula,
threshold or clinical rule was modified.**

**Clinical status: NOT VALIDATED.** Eight questions remain open. Each is
documented in `CLINICIAN-DECISION-PACK.md` with current behaviour, existing
evidence and the quantified impact.

| ID | Current behaviour | Unresolved question | Impact |
|---|---|---|---|
| **P7-002** | Activity factor scales the IOB deduction | Should it? | **2.3 U vs 1.5 U** |
| **P7-011** | Premix contributes nothing to IOB; disclosure-only flag `mixedInsulinUncounted` (`bolusEngine.ts:611`) | Should premix count toward IOB? | Dose computed as if nothing on board |
| **D-1** | Carb-weighted mean GI describes a mixed plate | Is that a valid quantity? | **Gates every other GI/GL decision — ask first, alone** |
| **D-2** | RU-11 Q1–Q14 dosing arrangement | Whole arrangement | **+1.5 U** in exercise + stacking |
| **D-3** | No physiological upper bound on glucose | Beyond what value is a reading not real? | A typo drives a **15.5 U** correction |
| **D-4** | Correction discontinuity | Where should the step sit? | 1 mg/dL moves dose by **1.1 U** |
| **D-5** | RU-3 scoring model (D1–D20) | Model validity | Partly deleted if D-1 is "no" |
| **D-6** | Four disagreeing band sets | Unify how? | Inconsistent patient-facing bands |

I did not resolve any of these. They require a diabetologist.

---

## F. ACCOUNT

### Registration lifecycle — CODE/TEST: PASS · DEVICE E2E: BLOCKED

Proven from source and 21 fixtures (`registrationLifecycle.golden.test.ts`):

*Before final submit* — `grep` confirms **exactly one `auth.signUp` in the
entire `src/` tree**, in `wizard.tsx:538`. `auth.tsx` has none; it only calls
`setPendingRegistration` then navigates. No auth user, no profile, no backend
write. The password lives in module state — no `AsyncStorage`, no zustand
`persist`, no `SecureStore` — so it dies with the process.

*At final submit* — one `signUp`; `saving` guard blocks double-tap;
name + phone preserved (phone via explicit `profiles` update, since the
trigger does not copy it); profile saved **after** the account exists;
`clearPendingRegistration()` runs only past `if (signUpErr) throw`.

*On failure* — localized error via `authErrorKey`, `setSaving(false)`,
early `return` before `saveProfile` and before `router.replace('/(tabs)')`.
No fake success, no navigation, no orphan account. Held registration is
non-consuming on read, so retry works without retyping.

*On abandon* — no account, because nothing was ever sent.

**DEVICE E2E: BLOCKED.** The 12-check backend proof was never executed. Not
fabricated.

### Account deletion — PASS (server-verified)

UI: `confirmAsync` with destructive styling, localized title/body/confirm/
cancel (all 4 keys present in fr/en/de/ar), cancel returns cleanly,
navigation only on success.

Backend (`delete-account` edge function): caller identified from their own
JWT — self-deletion only; storage removed **before** the auth user across
`profile-images`, `meal-images`, `medical-reports`; `dish-images` correctly
excluded as app-owned; a storage failure returns 500 and leaves the account
usable rather than reporting a false erasure; `public.*` cascades from
`auth.users`.

Previously verified on device: AF-18 all row counts 0 by SQL, AF-19 logout,
AF-20 re-login correctly rejected.

**Failure messaging — FIXED.** Both failing paths (`deleteAccount` and
`changePassword`) mapped through `accountErrors.ts` → 7 vetted keys, translated
in all four locales, Arabic distinct and in Arabic script. The edge function's
`detail` array — which names storage buckets — can no longer reach the screen.
`storageCleanupFailed` has its own wording because it is the one failure where
the account still exists and retrying is correct. Security model untouched and
pinned by tests: self-only via JWT, storage removed before the auth user, a
storage failure still aborts before deletion.

---

## G. NOTIFICATIONS

**Localization code: PASS. Tests: PASS. Runtime delivery: BLOCKED.**

Audited this session, no defect found:

- `refreshSmartReminders` binds `const t = i18n.t.bind(i18n)` **inside** the
  scheduling function, so the locale resolves at content-generation time, not
  at module load.
- All **23** `reminders.*` keys present in **fr/en/de/ar** (26 total each);
  Arabic genuinely translated, not transliterated
  (`notifyGlucoseTitle` = "قياس السكر 🩸").
- All 7 `rappelsPage.*` keys present in all four locales.
- No hardcoded French/English strings in notification code or the reminders UI.

One finding investigated and **dismissed**: `(tabs)/index.tsx:1638` calls
`getPlannedReminders()` without `t`, so it falls back to French literals — but
the result is immediately reduced to `.length` for a badge count. The
untranslated strings are never rendered. The two callers that *do* display
text (`rappels.tsx`, `ai-journal.tsx`) both pass `t`.

**RUNTIME DELIVERY: BLOCKED** for all four languages. Notification permission
was denied during the device pass, so scheduling was never exercised and no
notification was ever delivered. Correct code is not proof of delivery.

---

## H. FINAL RELEASE BLOCKERS

Only blockers backed by evidence in this repository.

| # | Blocker | Evidence | Lifted by |
|---|---|---|---|
| 1 | Registration lifecycle never proven end-to-end | Flow never reached final submit; emulator reaped | Persistent emulator or phone |
| 2 | 23 Android flows never executed | Report rows marked BLOCKED | Persistent emulator (7) + physical phone (5) |
| 3 | Notifications never delivered on a device | Permission denied in-flow | Emulator with `POST_NOTIFICATIONS` granted |
| 4 | Scanner nutritional accuracy unverified | No camera, no reference meals | Controlled reference meals |
| 5 | Bolus not clinically validated | P7-002, P7-011, D-1…D-6 open | Diabetologist |
| 6 | iOS entirely unvalidated | "No Apple teams found for account tsuhel" | Apple Developer membership |

**Blockers 1–3, and most of 2, are lifted by one persistent Android
emulator running outside this sandbox.** That is the highest-leverage
action available.

Blockers 4, 5 and 6 cannot be closed by engineering at all. They need
reference meals, a clinician, and an Apple account respectively.
