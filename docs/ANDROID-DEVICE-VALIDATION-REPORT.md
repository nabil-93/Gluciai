# Android validation report

**All results below are EMULATOR results.** Nothing here was run on physical
hardware, and nothing is claimed to have been. Every row was produced by
executing the flow and reading the screen — no status was inferred from source.

| | |
|---|---|
| **Device** | Android emulator `emulator-5554` — Pixel 6, **Android 14 (API 34)**, x86_64, Google APIs |
| **App** | `com.nabil.glucoai` v1.0.0, versionCode 3 |
| **Build** | EAS `0e58b458-a3fa-4f1b-9f4d-a9b7e9c61623`, profile `preview`, internal APK |
| **Code** | `7adb267` + the uncommitted BUG-A1 fix (EAS uploads the working tree) |
| **Backend** | **real** Supabase `ftqyzpkzqeudzfztataz` — not Demo mode |
| **Crashes** | **0 FATAL EXCEPTION** across the whole session |

---

## Totals

```
PASS        : 20
FAIL        :  0
BLOCKED     : 23
UNVERIFIED  :  2
```

**Second pass (BUG-A3).** The failing flow was fixed, rebuilt
(`626b2b02-e0b1-40e3-86dc-f377cd2d8372`) and re-verified on the emulator in two
languages. Suite grew 1305 → **1319**.

## ACCOUNT CREATION LIFECYCLE

**Architecture changed. Device verification NOT completed — see the honest
status at the end of this section.**

### What changed

`auth.tsx` used to call `supabase.auth.signUp()` the moment the registration
form was submitted, then send the patient into a twelve-step wizard. Every
abandonment in between — closing the app, pressing back, losing network, simply
changing their mind — left a real `auth.users` row with **no profile attached**:
an account the patient does not know exists, cannot complete, and which blocks
their own email from being registered again.

| | Before | After |
|---|---|---|
| Registration form submitted | **account created** | held in memory only |
| During the 12 wizard steps | account exists, no profile | **nothing on the backend** |
| Abandon / back / crash | **orphaned auth user** | nothing to clean up |
| Final onboarding step | profile saved onto existing account | **account created, then profile saved** |
| Final step fails | — | no account, answers kept, localized error, stays put |

`src/services/pendingRegistration.ts` holds the form. It is **module state, not
the persisted store**, because it holds a password: zustand persists to
AsyncStorage, which is plaintext on a rooted device and survives a crash, while
module state dies with the process. A patient who abandons registration leaves
**nothing on disk**. The cost — an app killed mid-wizard means re-entering the
form — is deliberate.

### Required properties, and how each is enforced

| Property | Mechanism |
|---|---|
| No account before the final step | `auth.tsx` contains **no `signUp` call at all** (asserted by fixture) |
| Exactly one account on submit | `if (saving) return` double-tap guard |
| Failure creates nothing | `signUp` throws → localized error → `return` **before** `saveProfile` and before navigation |
| Retry works | `getPendingRegistration()` is non-consuming; cleared only after confirmed success |
| Duplicate email | Surfaces through the same BUG-A3 mapping → `authError.emailTaken` |
| No plaintext password at rest | No `AsyncStorage` / `persist` / `SecureStore` in the module (asserted) |
| Credential dropped on sign-out | `account.ts` calls `clearPendingRegistration()` |

### Verification status — read carefully

**Unit/source: PASS.** 20 dedicated fixtures in
`tests/domain/registrationLifecycle.golden.test.ts`, including ordering
assertions proving `signUp` precedes `saveProfile`, that the clear sits after
the throw, and that the failure path returns before navigation. Full suite
**1339 PASS**, typecheck PASS, lint 6/6.

**Device / real backend: NOT VERIFIED — BLOCKED (environment).**

The required end-to-end proof — *start registration → complete some steps →
query Supabase → confirm no auth user → submit final step → confirm exactly one
user and one profile* — was **not obtained**, across two sessions.

**Cause, diagnosed rather than assumed.** The emulator boots correctly every
time (`emu6.log`: *"Boot completed in 35899 ms"*) and is then killed as soon as
the launching shell exits. Five independent launch strategies were tried and
all were reaped:

| Strategy | Result |
|---|---|
| background `&` | reaped |
| `nohup … &` | reaped |
| PowerShell `Start-Process -WindowStyle Hidden` | reaped |
| Windows Scheduled Task (`Register-ScheduledTask` + `schtasks /run`) | failed to start (0x80070002) |
| `cmd /c start "" /b` | reaped |

A process check immediately afterwards shows **no `emulator*` / `qemu*` process
alive**. This is a sandbox process-lifetime limitation, not a fault in the AVD,
the APK or the app.

**What the backend does show.** `lifecycle-qa%@example.com` = **0 users**, and
`auth.users` = 15 with `profiles` = 15 — a clean 1:1 with **no orphaned auth
rows**. That is *consistent* with the new behaviour and rules out the old defect
having fired during these attempts, but it is **not proof**, because the flow
never reached the final submit.

**This section must not be read as evidence that the lifecycle works on
device.** It is an architecture change with unit-level proof and no
device-level proof.

**To unblock:** run an emulator outside the agent sandbox — Android Studio's AVD
Manager, or `emulator -avd glucoai_test` in your own terminal — and leave it
running. `adb` will attach to it and the twelve lifecycle checks can be executed
in one pass.

---

## Critical flows

| ID | Flow | Status | Method | Evidence |
|---|---|---|---|---|
| **AF-15** | Arabic RTL | **PASS** | EMULATOR | Language chip, cards, progress bars, tab bar all mirrored after restart; no clipping |
| **AF-13** | Glucose `18` | **PASS** | EMULATOR | Arabic warning "≈ 324 mg/dL", **no conversion**, CTA visibly disabled |
| **AF-04** | Camera denied twice | **PASS** | EMULATOR | Arabic rationale + Gallery fallback; permanent denial opens **App info** |
| **AF-17** | Localized notifications | **BLOCKED** | — | Permission denied in-flow; scheduling not exercised |

**AF-13 is the most consequential result.** A patient thinking in mmol/L typing
their real `18.0` would previously have had it read as 18 mg/dL — tripping the
hypo guard and returning **0 U to someone at 324 mg/dL**. On device the app now
warns, offers the mg/dL equivalent to retype, converts nothing, and **blocks the
calculate button**.

## Flows executed

| ID | Flow | Status | Notes |
|---|---|---|---|
| AF-01 | Launch | PASS | `MainActivity` resumed, no fatals |
| AF-02 | Language selector | PASS | All four locales listed and rendered |
| AF-03 | Login screen | PASS | Full Arabic RTL |
| AF-05 | **Signup (real backend)** | PASS | Account created; **confirmed in `auth.users` by SQL** |
| AF-06 | Onboarding wizard | PASS | 12 steps, Arabic, correctly gated |
| AF-07 | Consent screen | PASS | 4 independent checkboxes; Next disabled until all accepted |
| AF-08 | Profile persistence | PASS | 175 cm / 70 kg / 70–180 mg/dL / Type 1 saved and re-read |
| AF-09 | Profile screen | PASS | Arabic RTL, sections intact |
| AF-10 | Security screen | PASS | Password change + delete account |
| AF-11 | Bolus screen | PASS | Reached by deep link `glucoai://bolus`, Arabic |
| AF-12 | Bolus fallback disclosure | PASS | `1U/10g · ISF 50` shown; ratio-not-set warning displayed |
| AF-14 | Free-tier modal | PASS | Arabic (Darija) |
| AF-16 | Notification permission prompt | PASS | Appears, handled, app not trapped |
| AF-18 | **Account deletion** | **PASS** | See below — verified server-side |
| AF-19 | Logout after deletion | PASS | Returned to auth screen |
| AF-20 | Deleted account re-login | **FAIL** | Correctly rejected, but error is English — **BUG-A3** |
| AF-21 | Deep links | PASS | `glucoai://bolus`, `glucoai://scan` both resolve |

## Account deletion — PASS, verified end-to-end

The one flow where the UI could plausibly lie, so it was checked against the
database rather than the screen.

1. Entry point: Profile → **الأمان** (Security) → **حذف الحساب**, red.
2. Confirmation dialog, **fully Arabic**: *"Delete account permanently? All your
   data (glucose, meals, profile) will be erased. This action cannot be
   undone."* — Cancel + Delete. **Single accidental tap cannot delete.**
3. After confirming: user logged out to the auth screen.
4. **Server-side proof** for user `56156855-…`:

```
auth_user_rows : 0
profile_rows   : 0   (was 1 before deletion)
glucose_rows   : 0
meal_rows      : 0
insulin_rows   : 0
```

5. The deleted account **cannot authenticate** — login rejected.

**The UI did not falsely report success: the backend deletion genuinely
happened.**

## Bugs

### BUG-A1 — FIXED and verified on device
RTL restart dialog appeared in **English** after choosing العربية. All four
translations already existed; `t` came from the component's *previous* render,
so it resolved in the old language. Fixed with `t(key, { lng: code })` in
`welcome.tsx` and `profile-edit.tsx`. On device the dialog now reads
*"أعد تشغيل التطبيق…"*. **+6 regression fixtures.**

### BUG-A2 — FIXED and verified end-to-end
Preview APK ran in **Demo mode**: `.env` is gitignored, EAS builds from the git
archive, and `eas.json`'s `preview.env` carried only `SENTRY_DISABLE_AUTO_UPLOAD`,
so `EXPO_PUBLIC_SUPABASE_ANON_KEY` never reached the build (`eas env:list` was
empty). Fixed by pushing the two vars as **EAS project environment variables** —
no secrets in git, no hardcoding, no source change. Verified: build log loaded
both → JWT present in the new APK (`false` → `true`) → Demo banner gone → real
signup succeeded.

### BUG-A3 — FIXED and verified on device
| | |
|---|---|
| **Flow** | AF-20, auth error |
| **Was** | **"Invalid login credentials"** in English on a fully Arabic screen |
| **Root cause** | `auth.tsx` rendered `e.message` — the raw Supabase string, always English |
| **Fix** | New `src/services/authErrors.ts` maps the condition to one of eight vetted i18n keys; `auth.tsx` renders `t(authErrorKey(e))`. The original error is still logged in dev |
| **Now** | **AR:** «البريد الإلكتروني أو كلمة المرور غير صحيحة.» · **DE:** «E-Mail oder Passwort ist falsch.» — both verified on the emulator after rebuild |
| **Also closed** | A raw backend message can carry provider detail a patient should not see. Only vetted wording can now reach the screen |
| **Security note** | Wrong password and unknown/deleted account deliberately share ONE key — Supabase answers both identically, and separating them would reveal which emails are registered. The vagueness is the property, not a shortcoming |
| **Behaviour** | Authentication itself is unchanged: same calls, same failures, same security semantics |
| **Tests** | **+14 fixtures**, including one asserting no locale ships the English backend sentence and one asserting the Arabic message is in Arabic script |

## Notifications localization — BLOCKED

FR / EN / DE / AR all **BLOCKED**. Notification permission was denied during the
flow and the account was then deleted, so no scheduled notification could be
produced. **No language row may be marked PASS**, and none is.
Notification detail localization: **BLOCKED**. Language persistence: **PARTIAL** —
Arabic survived app restart and a full reinstall cycle (observed repeatedly),
but the dedicated FR/EN/DE persistence matrix was not run.

## Scanner

- **FUNCTIONALITY: PARTIAL.** The scanner route loads, and with camera revoked
  it shows a correct Arabic rationale plus a Gallery fallback.
- **NUTRITIONAL ACCURACY: UNVERIFIED.** No real camera, no controlled reference
  meals. Not claimed, and will not be claimed without them.

## Bolus

- **DEVICE VERIFICATION: PARTIAL PASS.** Unit safety verified end-to-end
  (AF-13); the `1U/10g · ISF 50` fallback is disclosed on screen; the
  ratio-not-set warning appears.
- **CLINICAL VALIDATION: REQUIRED.** **P7-002**, **P7-011** and **D-1…D-6**
  are untouched and unanswered. The calculator is **not** clinically validated.

## Real phone still required for

1. **Real-camera scanner accuracy** — capture → AI → nutrition vs reference values.
2. **Notification delivery** — real scheduling, boot restore, per-locale content.
3. **Hardware behaviour** — biometrics, real permission-manager states,
   performance, battery, background lifecycle.

---

# FINAL STATUS

```
REGISTRATION LIFECYCLE
  architecture / code : PASS      (auth.tsx has no signUp; wizard commits once)
  automated tests     : PASS      (20 fixtures, incl. ordering + failure path)
  device proof        : BLOCKED   (emulator reaped by sandbox — 5 strategies)
  backend proof       : BLOCKED   (flow never reached final submit)

ANDROID
  20 / 45  PASS
   0 / 45  FAIL
  23 / 45  BLOCKED
   2 / 45  UNVERIFIED

NOTIFICATIONS
  FR : BLOCKED     EN : BLOCKED     DE : BLOCKED     AR : BLOCKED

ACCOUNT DELETION            : PASS  (server-side verified, earlier session)

SCANNER
  FUNCTIONAL                : PARTIAL   (route, rationale, gallery fallback)
  REAL ACCURACY             : UNVERIFIED (no camera, no reference meals)

BOLUS
  SOFTWARE VERIFICATION     : PARTIAL PASS (unit safety AF-13, fallback shown)
  CLINICAL VALIDATION       : REQUIRED

iOS
  BUILD                     : BLOCKED — "No Apple teams found for account tsuhel"
  DEVICE / SIMULATOR        : NONE AVAILABLE
  VALIDATION                : NOT STARTED
  Config ready              : bundle id set · all 3 usage strings present
  Still required            : Apple Developer Program membership · interactive
                              `eas credentials --platform ios` · one registered
                              device (`eas device:create`) ·
                              ITSAppUsesNonExemptEncryption declaration (ASC)

GATES
  TESTS 1339 PASS (53 files) · TYPECHECK PASS · LINT 6/6 PASS
```

## Release blockers — evidence-backed only

| # | Blocker | Evidence |
|---|---|---|
| 1 | Registration lifecycle unproven on device/backend | Emulator reaped; five launch strategies logged above |
| 2 | 23 Android flows never executed | Report rows marked BLOCKED |
| 3 | Notifications unvalidated in all four locales | No scheduled notification ever produced |
| 4 | Scanner nutritional accuracy unverified | No camera, no reference meals with ground truth |
| 5 | Bolus not clinically validated | P7-002, P7-011, D-1…D-6 open in the decision pack |
| 6 | iOS entirely unvalidated | `eas device:list` → no Apple team |

**Not release-ready.** Blockers 1–4 are unblocked by an externally hosted
emulator or a physical phone; blocker 5 needs a diabetologist; blocker 6 needs
an Apple Developer account.

---

# Blocked flows — precise blocker classification

The 23 blocked flows are **not** blocked by defects. Each is a runtime
behavioural assertion that static analysis cannot substitute for.

| Flow group | Status | Blocker | What is required |
|---|---|---|---|
| AF-17 notification delivery (FR/EN/DE/AR) | BLOCKED | `NOTIFICATION_RUNTIME_REQUIRED` | A live device/emulator with POST_NOTIFICATIONS granted and the app scheduling a real reminder |
| Notification detail + modal localization | BLOCKED | `NOTIFICATION_RUNTIME_REQUIRED` | Same, plus a delivered notification to open |
| Language persistence matrix FR/EN | BLOCKED | `PERSISTENT_EMULATOR_REQUIRED` | An emulator surviving force-stop → relaunch (AR/DE already observed) |
| Scanner capture → AI → result | BLOCKED | `CAMERA_RUNTIME_REQUIRED` | A real camera; the emulator has no usable sensor |
| Barcode scan | BLOCKED | `CAMERA_RUNTIME_REQUIRED` | Same |
| Glucose / insulin / meal entry + history | BLOCKED | `PERSISTENT_EMULATOR_REQUIRED` | A live session that survives between steps |
| Reports / PDF export | BLOCKED | `PERSISTENT_EMULATOR_REQUIRED` | Same, with logged data present |
| Network loss / recovery | BLOCKED | `DEVICE_REQUIRED` | Airplane-mode toggling on a live device |
| Background / foreground / restart lifecycle | BLOCKED | `PERSISTENT_EMULATOR_REQUIRED` | A process that is not reaped between steps |
| Biometrics, performance, battery | BLOCKED | `HARDWARE_REQUIRED` | Physical hardware — an emulator cannot prove these |
| Registration lifecycle E2E (12 checks) | BLOCKED | `PERSISTENT_EMULATOR_REQUIRED` | An externally hosted emulator or a phone |

**One action unblocks most of this:** an emulator started outside the agent
sandbox (Android Studio AVD Manager, or `emulator -avd glucoai_test` in your own
terminal), left running. `adb` attaches to it and the flows execute in one pass.
Only the camera, network-toggle and hardware rows additionally need a phone.

---

# CONSOLIDATED FINAL STATUS

```
AUTOMATED:
  Tests                 : PASS — 1340 (53 files); clinical suite 222 unchanged
  Typecheck             : PASS
  Lint                  : PASS — 6/6 ratchet

REGISTRATION:
  Code                  : PASS   — auth.tsx has no signUp; wizard is the sole commit
  Tests                 : PASS   — 21 fixtures incl. ordering + failure path
  Device proof          : BLOCKED — emulator reaped by sandbox (5 strategies)
  Backend E2E proof     : BLOCKED — flow never reached final submit

AUTH LOCALIZATION (BUG-A3):
  FR : PASS (code+tests)    EN : PASS (code+tests)
  DE : PASS (device-verified) AR : PASS (device-verified)

NOTIFICATIONS:
  Code                  : PASS   — t() bound at schedule time, 12 keys × 4 locales
  Tests                 : PASS   — locale parity + distinctness asserted
  Runtime delivery      : BLOCKED — never delivered on a device

ACCOUNT DELETION:
  Code                  : PASS   — confirm dialog, localized, cancel path
  Tests                 : PASS
  Backend evidence      : PASS   — all row counts 0, re-login rejected (SQL)

ANDROID:
  PASS 20 / FAIL 0 / BLOCKED 23 / UNVERIFIED 2

SCANNER:
  Functional            : PARTIAL — route, rationale, gallery fallback
  Real accuracy         : UNVERIFIED — no camera, no reference meals

BOLUS:
  Software              : PARTIAL PASS — AF-13 unit safety device-verified
  Clinical              : REQUIRED

iOS:
  Configuration         : READY — bundle id, all 3 usage strings
  Build                 : BLOCKED — no Apple team
  Device                : NONE
  Validation            : NOT STARTED

CLINICAL (unresolved — no decision exists in the repository):
  P7-002 : activity factor scales the IOB deduction (2.3 U vs 1.5 U)
  P7-011 : premixed insulin contributes nothing to IOB
  D-1    : mixed-meal GI validity — gates every other GI/GL decision
  D-2    : RU-11 Q1–Q14 dosing arrangement
  D-3    : glucose plausibility bound (no physiological guard exists)
  D-4    : hypo first-aid wording in ar/de/en (emergency.tsx TODO)
  D-5    : RU-3 scoring model (D10 bands first, then D5 sodium)
  D-6    : band unification across four disagreeing sets
```

## Release blockers — evidence-backed

1. **Registration lifecycle unproven on device/backend** — emulator reaped; five launch strategies logged.
2. **23 Android flows never executed** — classified above; none is a known defect.
3. **Notifications never delivered** — code verified, runtime unproven.
4. **Scanner nutritional accuracy unverified** — no camera, no ground-truth meals.
5. **Bolus not clinically validated** — P7-002, P7-011, D-1…D-6 open.
6. **iOS entirely unvalidated** — no Apple team, no device.

**Not release-ready.**

---

# EMULATOR RUN — 2026-08-16 (supersedes the BLOCKED status above)

The earlier passes recorded the emulator as BLOCKED. **That was wrong in one
respect and right in another:** the sandbox did reap emulator processes, but the
SDK itself was never found because it is installed on **D:**, not under
`%LOCALAPPDATA%`. Discovering it changed the outcome — a real emulator ran, and
the flows below were executed on it.

```
DEVICE            : Android Emulator (AVD `glucoai34`, created this session)
EMULATOR NAME     : sdk_gphone64_x86_64
ANDROID VERSION   : 14
API LEVEL         : 34
ARCHITECTURE      : x86_64
SERIAL            : emulator-5554 / EMULATOR37X1X11X0
ACCELERATION      : WHPX (Windows Hypervisor Platform) — operational
APP VERSION       : 1.0.0 (versionCode 3)
PACKAGE           : com.nabil.glucoai
BUILD             : af180e98-493e-420e-adc4-2d9e38c69f5d
APK SHA-256       : 43E700E3F26F471618BDFE6EA5FE9F3A08FFCF8C40309ADA956EBFA6F63C4B41
COMMIT            : 7adb267
SDK               : D:\android-sdk\android-sdk
```

**Environment blocker found and solved:** the first boot died with
`FATAL | Not enough space to create userdata partition. Available: 3388.50 MB …
need 7372.80 MB.` C: had 3.31 GB free. The AVD was relocated to `D:\android-avd`
(45 GB free) with a 2 GB data partition, and booted. **All hypervisor, system and
GPU compatibility checks passed** — the earlier failures were never a CPU or
virtualization limitation.

## CRITICAL FLOWS

| Flow | Status | Evidence |
|---|---|---|
| **AF-15 — Arabic RTL** | **PASS** | After selecting العربية and restarting, the whole layout mirrors: language pill moves right→left, the "تقدم اليوم"/"نتيجة اليوم" cards swap sides, progress bars fill RTL, and the Track/Improve/Achieve row reverses. Carousel dots and arrows mirror too. Screenshots 03, 05, 13 |
| **AF-13 — glucose 18** | **PASS** | Entering `18` in the bolus screen raised the Arabic unit-confusion guard: "هذه القيمة تبدو بوحدة mmol/L. هذا التطبيق يسجل بوحدة mg/dL — أي حوالي **324 mg/dL**". Correct conversion, correct language. Screenshot 10 |
| **AF-04 — camera denied twice** | **PASS** | OS state driven to `USER_FIXED` (the real "don't ask again"). A fresh app process then routed the grant button to **`com.android.settings/.spa.SpaActivity`** — GluciAI's own App info page. The B-3 recovery works on a device. Screenshot 08 |
| **AF-17 — localized notifications** | **FAIL (partial)** | Permission granted and a notification channel exists, but `dumpsys alarm` shows **no alarms registered** for the package, so nothing was ever scheduled. See BUG-D2 |

## OTHER FLOWS EXECUTED

| ID | Flow | Status | Evidence |
|---|---|---|---|
| AF-01 | Launch / no crash | **PASS** | MainActivity resumed, PID stable, empty crash buffer |
| AF-02 | Language selector | **PASS** | All four locales listed, active one ticked (screenshot 02) |
| AF-03 | Registration screen | **PASS** | Full Arabic RTL, icons mirrored (screenshot 14) |
| AF-06 | Onboarding wizard | **PASS** | "الخطوة 1 من 12", Arabic, progress bar fills RTL (screenshot 15) |
| AF-11 | Bolus screen | **PASS** | Reached via `glucoai://bolus`, Arabic RTL, mg/dL shown (screenshot 09) |
| AF-12 | Bolus fallback disclosure | **PASS** | Arabic ratio-not-set warning rendered |
| AF-21 | Deep links | **PARTIAL** | `glucoai://bolus` and `glucoai://scan` resolve; **`glucoai://rappels` does not** (BUG-D3) |
| — | Registration deferral | **PASS** | Tapping "إنشاء حساب" produced **no Supabase traffic** and went straight to the wizard — the account really is deferred to the final step |
| — | Language persistence (AR) | **PASS** | Survived `force-stop` → relaunch |
| — | Background / foreground | **PASS** | HOME then relaunch, process healthy |
| — | Back navigation | **PASS** | Returns to launcher without crashing |
| — | Network loss | **PASS** | wifi+data disabled → host unresolvable; app launches and runs, **no crash** |
| — | Network recovery | **PASS** | Re-enabled, 0% packet loss to Supabase |
| — | Scanner permission UI | **PASS** | Arabic, with a **gallery fallback** so a denied camera is not a dead end (screenshot 06) |

## BUGS

**BUG-D1 — P0 — the tested APK runs in DEMO MODE.**
The auth screen shows "وضع تجريبي — اربط Supabase لحفظ بياناتك" (*demo mode — connect
Supabase to save your data*), and account creation generated **zero Supabase
traffic**. The `af180e98` build was produced without
`EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`. **Consequence: every backend-dependent flow
(real signup, login, sync, account deletion, report data) could NOT be exercised on
this build** — they are not failures, they were unreachable. A rebuild with the env
vars is required before those flows can be validated.

**BUG-D2 — P1 — no reminders are scheduled with the OS.**
`dumpsys alarm` lists no alarms for the package. `refreshSmartReminders` runs from
`(tabs)/_layout.tsx`, which is only mounted once the dashboard is reached — and the
dashboard is unreachable in demo mode (BUG-D1). Whether this is a genuine scheduling
defect or purely a consequence of BUG-D1 **cannot be decided from this run**.
Re-test on a Supabase-configured build.

**BUG-D3 — P2 — `glucoai://rappels` deep link unregistered.**
`glucoai://bolus` and `glucoai://scan` resolve; `rappels` silently stays on the
current screen.

**BUG-A1 REPRODUCED (already fixed in the working tree, not in this APK).**
Choosing العربية produced an **English** "Restart the app" dialog. `git show
HEAD:src/app/welcome.tsx` confirms the built commit still has the unfixed
`notify(t('common.restartTitle'), …)`; the `{ lng: code }` fix is uncommitted. This
run is therefore a **confirmation of the original defect and of the fix's target**,
not a new regression.

## STATUS

```
NOTIFICATIONS   CODE: VERIFIED     RUNTIME DELIVERY: FAIL (BUG-D2 / blocked by BUG-D1)
SCANNER         FUNCTIONAL (permission + gallery UI): EMULATOR VERIFIED
                REAL NUTRITIONAL ACCURACY: UNVERIFIED — controlled reference meals required
BOLUS           DEVICE TEST: screen + unit guard + fallback disclosure PASS
                CLINICAL VALIDATION: REQUIRED (P7-002, P7-011, D-1…D-6) — untouched
```

**Physical-device-only (emulator genuinely cannot cover):** real camera capture and
barcode scanning against physical packaging, biometrics, battery/thermal behaviour.

---

# SESSION 2 — BLOCKER FIXES + CONTINUED VALIDATION (2026-08-17)

## BUG-D1 — ROOT CAUSE FOUND AND FIXED

**Not a missing value — a missing binding.** `eas env:list --environment preview`
shows `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` were **already
stored on EAS**. But no build profile in `eas.json` declared `"environment"`, so EAS
never injected them; `src/lib/supabase.ts` read `''` and `isDemoMode` became true.
`.env` is gitignored (`.gitignore:63`), so it is never uploaded either.

**Fix:** added `"environment": "preview"` / `"environment": "production"` to the two
profiles. One line each. **No secret in source, nothing hardcoded, no service_role or
USDA key anywhere near the client.**

**Verified at build time** — EAS now reports:
`Environment variables … loaded from the "preview" environment on EAS:
EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SUPABASE_URL.`

New build: `65caf89c-f7d2-4111-93e8-56fdae00f78d`.

## BUG-D3 — DOES NOT EXIST (my earlier testing error)

`glucoai://rappels` works correctly on a **cold start**. The earlier failure happened
because the app was already running with the bolus screen on top: `am start` reported
*"intent delivered to currently running top-most instance"* and the router did not
re-navigate. All three links (`bolus`, `scan`, `rappels`) return `Status: ok`.
**Withdrawn — no code change made.** Screenshot 17 shows the reminders screen in
Arabic RTL, reached by deep link.

## BUG-D2 / AF-17 — ROOT CAUSE FOUND, PARTIALLY RESOLVED

**Reminders are not auto-scheduled: the patient must tap "تفعيل الإشعارات".**
Before the tap `dumpsys alarm` shows nothing; immediately after, **two `RTC_WAKEUP`
alarms** appear for `com.nabil.glucoai`, decoding to **09:00 and 21:00 GMT** — exactly
the times the screen displays. So the earlier "no alarms" observation was correct but
its cause was not a defect; it was an un-exercised opt-in.

```
SCHEDULING : PASS (device-verified — RTC_WAKEUP alarms registered, times match UI)
DELIVERY   : UNVERIFIED — could not be forced on the emulator
```

Delivery could not be proven: Android **rebases** `RTC_WAKEUP` alarms when the clock is
moved manually (`whenElapsed` recalculated instead of firing), and a forced
`BOOT_COMPLETED` broadcast produced no notification. **Not marked PASS.** Proving
delivery needs the emulator left running to the real 09:00/21:00, or a debug build
exposing a manual trigger.

## AF-17 LOCALIZATION — reminders screen

Reached by deep link in Arabic: title **تذكيرات ذكية**, subtitle, both reminder cards
(**فحص سكر الدم** 09:00, **حصيلة اليوم** 21:00), the "كل يوم" badges, the reason lines
and the CTA **تفعيل الإشعارات** all render in Arabic with correct RTL. **No mixed-language
content on this screen.** Screenshot 17.

## PHASE 8 — EXERCISE → DOSE MATRIX (executed against the real engine)

Identical inputs (glucose 180, carbs 60, ratio 10, ISF 50, target 100); only the named
field varies.

| Variable | Value | activityFactor | Dose |
|---|---|---|---|
| **kind** | walking | 0.85 | **5.1 U** |
| **kind** | running | 0.85 | **5.1 U** |
| **kind** | cycling | 0.85 | **5.1 U** |
| **kind** | strength | 0.85 | **5.1 U** |
| **kind** | other | 0.85 | **5.1 U** |
| intensity | low / medium / high | 0.92 / 0.85 / 0.75 | changes |
| duration | 15 / 30 / 45 / 60 / 90 min | 0.91 / 0.85 / 0.85 / 0.85 / 0.81 | changes |
| timing | done / planned | 0.85 / 0.85 | no change to the factor |

**Finding: SPORT TYPE IS IGNORED BY THE CALCULATION.** `bolusEngine.ts:643-652`
derives the reduction from `intensity` and `durationMin` only; `s.kind` is copied into
`recentActivity` for **display** and never multiplies anything. Duration steps at the
documented `<30` and `>60` thresholds, which is why 30/45/60 coincide.

**Classification: (D) CLINICAL DECISION REQUIRED.** No approved specification in this
repository defines sport-specific insulin adjustment, so this is **not** a bug to fix —
inventing per-sport coefficients would be inventing medicine. The UI asks *"Which
sport?"* / *"أي رياضة؟"*, which does not literally claim the dose changes, but a patient
may reasonably infer it does.

**The clinician must decide one of:**
1. sport type is informational only → keep, and consider a note that intensity and
   duration drive the adjustment; or
2. sport type should modulate the factor → supply the coefficients; or
3. remove the selector.

**Nothing was changed.** No formula, threshold, or coefficient touched.

## AUTOMATED SUITES (this session)

Full **1451/1451** · Clinical **222/222 unchanged** · Security **18/18** ·
TypeScript **PASS** · Lint **PASS** (6/6 baseline).

## BUG-D1 — FIXED AND DEVICE-VERIFIED

New build `65caf89c-f7d2-4111-93e8-56fdae00f78d`
APK SHA-256 `DD24BC95CEE5D937022FEF1734A962E6CAD3C1988FA46F654067B544BC6A43CC`
(the demo build was `43E700E3…` — different artifact).

Installed after `adb uninstall` so no state carried over.

| Check | Old build | New build |
|---|---|---|
| Demo-mode banner on auth screen | **present** ("وضع تجريبي — اربط Supabase") | **ABSENT** |
| EAS env injection at build time | — | `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_URL` loaded from the `preview` environment |

Screenshot 23 — "Create your account" with **no** demo warning.

## PHASE 5 — ACCOUNT CREATION LIFECYCLE — **PASS (device + backend)**

The strongest evidence in this whole validation, because it is checked against the
real database rather than the UI:

1. Registration form filled on the emulator (name, phone, email `af17+26344@example.com`,
   password) on the **backend-configured** build.
2. "Create account" tapped → app advanced to **"Step 1 of 12"** (screenshot 25).
3. `select email from auth.users where email like 'af17+%'` on project
   `ftqyzpkzqeudzfztataz` → **`[]` — no rows.**

**No auth identity exists while onboarding is in progress.** The product requirement
("a real account must not be created at the beginning of onboarding") holds on a real
device against the real backend. This upgrades the registration lifecycle from
CODE VERIFIED to **DEVICE + BACKEND VERIFIED**.

Not yet exercised on device: completing all 12 steps to observe the single final
`signUp`, duplicate-email handling, and network failure at the final commit.

---

# SESSION 3 — ONBOARDING LIFECYCLE PROVEN END-TO-END (2026-08-17)

Same emulator (`glucoai34`, Android 14 / API 34) and the **backend-configured** APK
`65caf89c` (SHA `DD24BC95…`). All evidence below is device action cross-checked against
the **production Supabase database**, not the UI alone.

## PHASE 2 — COMPLETE ONBOARDING — **PASS (device + backend, end to end)**

All 12 steps were completed on the emulator with `auth.users` queried at four points:

| Moment | `count(*) where email like 'af17+%'` |
|---|---|
| After "Create account" tapped, wizard at **Step 1/12** | **0** |
| At **Step 8/12** (target glucose range) | **0** |
| At **Step 11/12** (consents) | **0** |
| **Immediately before** tapping "Open dashboard" (Step 12/12) | **0** |
| **After** tapping "Open dashboard" | **1** |

Then, one row — and the profile written with it:

```
id            94ea8753-aba2-46cf-862f-fa2090c794e5
email         af17+26344@example.com
created_at    2026-08-16 22:38:21+00
name          QA
phone         +212600000000
diabetes_type type1
height 175    weight 70    target_low 70    target_high 180
```

**Exactly one account, created only at the final step, with the complete profile
persisted.** The product requirement is satisfied on a real device against the real
backend.

**The phone-persistence fix is now device-verified.** `phone = +212600000000` is present.
That column is written by neither the `handle_new_user` trigger (user_id/email/role only)
nor `saveProfile`; it exists solely because of the best-effort `profiles` update added
after the lifecycle change. Had that regression not been caught, this cell would be empty.

Dashboard reached as **"Hello QA"** with an authenticated session (screenshot 38).

## OTHER FLOWS CONFIRMED THIS SESSION

| ID | Flow | Status | Evidence |
|---|---|---|---|
| AF-07 | Consent gating | **PASS** | 4 independent checkboxes; with 3 of 4 ticked "Next" stayed **disabled** (screenshot 36) |
| AF-08 | Profile persistence | **PASS** | 175 cm / 70 kg / type1 / 70–180 read back **from the database**, not the UI |
| AF-16 | Notification permission prompt | **PASS** | System dialog appeared on first dashboard entry (screenshot 38) |
| — | Wizard step validation | **PASS** | Step 2 "Next" disabled until a diabetes type is chosen |
| — | Backend configuration | **PASS** | No demo-mode banner; real rows written to Supabase |

## EMULATOR STABILITY — the limiting factor

After the dashboard was reached the emulator process was **reaped by the sandbox**
(no fatal line in its log; `qemu` process count → 0). It was restarted once and reaped
again within a minute. This is the same environment limitation recorded in earlier
sessions — **not** an app defect, and it did not affect the results above, which were
captured before the loss and are backed by database rows that persist independently.

**Consequently NOT completed this session:** account deletion on device, notification
delivery, FR/EN/DE notification localization, and the remaining flow sweep. They are
**UNVERIFIED**, not failed.

---

# SESSION 4 — ATTEMPTED CONTINUATION (2026-08-17)

**Outcome: no new flows executed. The emulator could not be kept alive long enough
to drive the UI.** No result below is inferred, and nothing already recorded changes.

## What was attempted

The instruction was explicit — restart and reconnect rather than stop at the first
death. That was done **five times**, varying the configuration each time:

| # | Configuration | Boot | Survival |
|---|---|---|---|
| 1 | windowed, `swiftshader_indirect`, 2048 MB | ✅ `boot=1` | died before the app launched |
| 2 | same, launch+capture in ONE tool call | ✅ | died ~27 s after `am start` |
| 3 | headless `-no-window -gpu off`, **idle** (no app) | ✅ | **survived 120 s+** across the whole poll |
| 4 | headless, then `am start` | ✅ | died within ~25 s of the app starting |
| 5 | headless, RAM reduced 2048 → 1536 MB | ✅ | alive at t+15 s, **dead at t+30 s** |

## The pattern, stated precisely

**An idle emulator survives indefinitely. Launching GluciAI kills it within ~15–30 s.**
Run 3 is the control: the same headless emulator, left alone, was still answering
`adb devices` after two minutes of polling. The variable that changes the outcome is
the app process starting, not time, not the window, not the GPU mode.

Host memory was checked and is **not** the cause: 15.7 GB total, **5.5 GB free**, with
the largest consumer at 1.2 GB. Reducing the guest to 1536 MB did not help either, so
this is the sandbox reaping the process tree once the emulator's working set grows
under a React-Native/Hermes launch — the same class of limitation recorded in earlier
sessions, now characterised more sharply.

**This is an execution-environment limit, not an application defect.** GluciAI itself
launched cleanly every time (`Starting: Intent { cmp=com.nabil.glucoai/.MainActivity }`,
no crash buffer output) in the earlier sessions where the emulator did stay up.

## Status of the priorities for this session

| Priority | Status | Why |
|---|---|---|
| 1 — Account deletion | **UNVERIFIED** | Needs an authenticated session driven through Profile → Delete; the emulator dies before Settings can be reached. The disposable account (`af17+26344@example.com`) is deliberately **left in place** as the fixture. |
| 2 — Notification delivery | **UNVERIFIED** | Already impossible to force by clock manipulation (Android rebases `RTC_WAKEUP`); now the app cannot be kept running to a scheduled time either. |
| 3 — FR/EN/DE notification localization | **UNVERIFIED** | Requires switching language in the running app. AR remains **PASS** from session 2. |
| 4 — Remaining 22 flows | **UNVERIFIED** | All require sustained UI interaction. |
| 5 — Scanner | functionality **PASS** (session 2), accuracy **UNVERIFIED** | Unchanged; no reference meals. |

**Nothing was marked PASS without evidence, and no result was fabricated to fill a gap.**

## What would unblock this

Running the emulator **outside this sandbox** — a terminal the agent does not own, or
Android Studio's AVD Manager started by hand. The AVD (`glucoai34`), the SDK
(`D:\android-sdk\android-sdk`) and the backend-configured APK
(`65caf89c`, SHA `DD24BC95…`) are all already in place, so validation can resume
immediately once the process is allowed to live.

---

# SESSION 5 — EXTERNAL EMULATOR (2026-08-17)

The emulator was started **outside the agent sandbox** by the owner, to remove the
process-reaping hypothesis. **It did not help, and that is the significant finding.**

## Connection — healthy before launch

```
emulator-5554   device   product:sdk_gphone64_x86_64  device:emu64xa
sys.boot_completed = 1     dev.bootcomplete = 1
Android 14   API 34   x86_64
com.nabil.glucoai   versionName 1.0.0  versionCode 3
lastUpdateTime 2026-08-16 22:28:01   ← the backend-configured build 65caf89c
```

Stability probe **before** launching the app: alive at t+10s, t+20s, t+30s.

## What happened on launch

`monkey -p com.nabil.glucoai` → within ~30 s:

```
pid=                       (app process never reported)
adb: device offline
```

then the `qemu` process disappeared from the host entirely. No recovery over 90 s of
polling, no `.dmp` crash dump, and **5.0 GB of 15.7 GB host RAM still free** — so this
is not host memory exhaustion.

## Revised conclusion — the sandbox was NOT the cause

Previous sessions attributed the death to the agent sandbox reaping the process tree.
**That hypothesis is now disproved**: the emulator was owned by the user's own shell and
died identically. The correlation that survives every configuration is narrower:

> **The emulator dies when the GluciAI app process starts — regardless of who launched
> the emulator, whether it is windowed or headless, and whether the guest has 1536 MB or
> 2048 MB.** An idle emulator is stable indefinitely (120 s+ control run, session 4).

This reframes it from "environment limitation" to **a reproducible emulator crash
triggered by this app's startup**, on this AVD.

## Most likely cause — untested hypothesis, NOT a finding

`package.json` carries native modules that are known to destabilise `qemu` on
emulated hardware, notably **`expo-camera`** (the AVD is configured
`hw.camera.back=emulated`) and **`expo-glass-effect`**; `react-native-reanimated` and
`react-native-svg` also initialise early. The app's first mounted screen tree also runs
`hydrateFromServer()`, `startPresence()` and `checkReminders()` immediately.

**This is stated as a hypothesis with a clear test, not as a result.** Nothing in this
session isolates which module is responsible, and no code was changed to find out.

### The cheap experiments that would settle it

1. Recreate the AVD with **`hw.camera.back=none` / `hw.camera.front=none`** and launch
   again. If the app survives, `expo-camera` is the trigger and every non-scanner flow
   becomes testable immediately.
2. Launch with `-gpu host` (hardware GPU) instead of `swiftshader`/`off`.
3. Try an **API 33 / Android 13** system image — API 34 x86_64 emulator regressions with
   camera init are widely reported.
4. Capture the emulator's own stderr (`-verbose -show-kernel`) at the moment of death.

## Status — unchanged, nothing fabricated

| Priority | Status |
|---|---|
| Account deletion | **UNVERIFIED** — Settings never reachable; fixture `af17+26344@example.com` still in place |
| Notification delivery | **UNVERIFIED** |
| FR / EN / DE notification localization | **UNVERIFIED** (AR remains PASS, session 2) |
| Remaining 22 flows | **UNVERIFIED** |
| Scanner accuracy | **UNVERIFIED** — no reference meals |

**No flow was marked PASS this session. No evidence was invented.**

---

# SESSION 6 — EMULATOR CRASH SOLVED + ACCOUNT DELETION PROVEN (2026-08-17)

## EMULATOR CRASH INVESTIGATION

**Test:** camera-disabled AVD (Test 1 of the diagnostic plan)
**Configuration:** disposable clone `nocam34` — identical to `glucoai34` except
`hw.camera.back=none`, `hw.camera.front=none`. The original AVD was **not modified**.

**Result:**

```
CAMERA_DISABLED:
  EMULATOR_STABLE = YES
  APP_STABLE      = YES
```

| Phase | Observation |
|---|---|
| Boot | `sys.boot_completed=1` |
| Pre-launch stability | alive at t+15/30/45/60 s |
| APK install | `Success` |
| **Post-launch** | **alive at t+15/30/45/60/75/90 s, app pid 5078 constant** |
| Across separate tool calls | still alive, **same pid 5078** |

Compare with every camera-enabled configuration, which died 15–30 s after the app
process started — including the run the owner launched outside the agent sandbox.

**Conclusion — PROVEN:** disabling the emulated cameras makes GluciAI stable on this
emulator. **LIKELY TRIGGER = CAMERA / `expo-camera` initialisation against the emulated
sensor.**

**Stated precisely, to avoid over-claiming:** what is proven is the *configuration
difference*. That `expo-camera` specifically is the faulting component is a strong
inference, not an isolated proof — no per-module bisect was run, and **no application
code, dependency or AVD-of-record was changed.** Tests 2 (GPU) and 3 (API 33) were not
needed and were not run.

**Practical consequence:** every non-camera flow is now testable. Scanner capture
remains untestable on this AVD by construction.

## PRIORITY 1 — ACCOUNT DELETION — **PASS (device + backend)**

Executed end to end on `nocam34` with the backend-configured APK, cross-checked against
production Supabase at every step.

| Step | Expected | Actual | Status |
|---|---|---|---|
| Log in as `af17+26344@example.com` | session established | dashboard "Hello QA", profile loaded from backend | **PASS** |
| Profile → Personal information | data from backend | QA / Male / 175 cm / 70 kg | **PASS** (AF-09) |
| Profile → Security | deletion reachable | **"Delete account"** in red | **PASS** |
| Tap it | confirmation, not immediate deletion | **"Permanently delete account?" — "All your data (glucose, meals, profile) will be erased. This action cannot be undone."** with CANCEL / DELETE ACCOUNT | **PASS** |
| **CANCEL** | nothing deleted | SQL: **users 1, profiles 1** — untouched | **PASS** |
| Confirm DELETE ACCOUNT | account and data removed | SQL: **users 0, profiles 0, glucose_logs 0, insulin_logs 0** | **PASS** |
| Session after deletion | signed out | returned to unauthenticated state | **PASS** |
| App restart | session must NOT restore | relaunch → **login screen**, not dashboard | **PASS** |
| Re-login with deleted credentials | rejected | **"Incorrect email or password."** | **PASS** |

**Two fixes from earlier sessions are confirmed live by that last row:** the message is
localized and vetted (BUG-A3 — no raw Supabase English), and it deliberately does not
reveal that the account no longer exists, preserving the anti-enumeration property.

Deletion policy verified as designed: `delete-account` edge function (service-role,
server-side only) removes storage objects first, then the auth user; `public.*` cascades.
**No admin credential is present in the client.**

## PRIORITY 2–3 — NOTIFICATION DELIVERY / FR-EN-DE LOCALIZATION — **UNVERIFIED**

A second disposable account (`af17b+65708@example.com`) was registered and taken through
all 12 steps to reach the dashboard, which is where `refreshSmartReminders` runs. The
account **was created** — `auth.users` shows it at `2026-08-16 23:37:38+00`, a second
independent confirmation of the onboarding lifecycle — but the emulator died moments
after the final commit, before reminders could be activated and observed.

```
NOTIFICATION DELIVERY          : UNVERIFIED
NOTIFICATION LOCALIZATION FR   : UNVERIFIED
NOTIFICATION LOCALIZATION EN   : UNVERIFIED
NOTIFICATION LOCALIZATION DE   : UNVERIFIED
NOTIFICATION LOCALIZATION AR   : PASS (session 2 — screen fully Arabic, RTL correct)
```

**Note on stability:** `nocam34` was dramatically better than any camera-enabled AVD —
it survived roughly 25 minutes of continuous UI driving (login, profile, security,
deletion, re-login, a full 12-step registration) versus 15–30 seconds previously. It is
not perfectly stable, but it is now usable for real validation.

## FLOWS ADDED THIS SESSION

| ID | Flow | Status | Evidence |
|---|---|---|---|
| AF-LOGIN | Sign in with existing account | **PASS** | Dashboard "Hello QA", profile hydrated from backend |
| AF-09 | Profile screen | **PASS** | QA / Male / 175 / 70 loaded from Supabase |
| AF-10 | Security screen | **PASS** | Change-password form + red "Delete account" |
| AF-18 | Account deletion | **PASS** | Full lifecycle, SQL-verified (see above) |
| AF-19 | Logout after deletion | **PASS** | Returned to auth screen |
| AF-20 | Deleted account re-login | **PASS** | Rejected, **localized** message (BUG-A3 fix confirmed live) |
| — | Cancel deletion | **PASS** | users 1 / profiles 1 unchanged |
| — | Session persistence after restart | **PASS** | Deleted session did **not** restore |
| — | Second full onboarding | **PASS** | `af17b+65708@…` created only at step 12 |
| — | Wizard field validation | **PASS** | Step 4 blocked "Next" until a valid insulin name was set |

**Running total: 33 / 45 PASS · 0 FAIL · 12 UNVERIFIED.**

---

# SESSION 7 — ATTEMPTED NOTIFICATION DELIVERY (2026-08-17)

**Outcome: no new flows executed. `nocam34` regressed and could not sustain the app.**
Nothing already recorded changes; no result was inferred or invented.

## What happened

Session 6's camera-disabled AVD sustained ~25 minutes of continuous UI driving. In this
session the *same* AVD, unchanged, failed **four consecutive times**:

| # | Configuration | Boot | Outcome |
|---|---|---|---|
| 1 | `swiftshader_indirect`, windowed | ✅ | `error: closed` on app launch |
| 2 | headless `-no-window -gpu off` | ✅ | app pid never appeared; dead by t+50 s |
| 3 | `swiftshader_indirect`, windowed (session-6 config, verbatim) | ✅ | dead ~34 s after launch |
| 4 | **CONTROL — idle, no app launch** | ✅ | **alive through the full 120 s poll** |

Run 4 is decisive and reproduces the original signature exactly: **the emulator is
stable until GluciAI's process starts.**

## Revised conclusion — an honest correction to session 6

Session 6 recorded the camera-disabled AVD as having **solved** the crash. That was
over-stated. What the evidence actually supports is:

> Disabling the emulated cameras **substantially reduced the failure rate** — enough for
> one long productive run — but it did **not** remove the underlying fault. The crash is
> intermittent and still reproducible on the same AVD.

The session-6 results obtained during that window remain valid: they are backed by
production-database rows and screenshots, neither of which depends on emulator uptime.
Only the *diagnosis* is corrected here, not the evidence.

## Evidence gathered without launching the app

Using the live idle emulator (control run):

```
package         com.nabil.glucoai  present
notification    AppSettings: com.nabil.glucoai (10192) importance=DEFAULT userSet=true
alarms          none registered — expected: reminders are opt-in ("تفعيل الإشعارات")
```

The channel exists with `userSet=true`, carried over from the permission grant in
session 6. Delivery cannot be observed without a running app.

## Status — unchanged

```
NOTIFICATION DELIVERY : UNVERIFIED
FR / EN / DE          : UNVERIFIED
AR                    : PASS (session 2 — screen fully Arabic, RTL correct)
SCANNER CAPTURE       : UNTESTABLE ON THIS AVD (cameras intentionally disabled)
SCANNER ACCURACY      : UNVERIFIED (no controlled reference meals)
BOLUS                 : screen/guard device-verified; CLINICAL VALIDATION REQUIRED
```

**ANDROID TOTAL: 33 / 45 PASS · 0 FAIL · 12 UNVERIFIED** — unchanged from session 6.

## Still-unverified flows (12)

1. Notification delivery (AF-17 runtime) · 2. FR notification localization ·
3. EN notification localization · 4. DE notification localization ·
5. Glucose entry + history · 6. Insulin logging · 7. Bolus end-to-end with IOB ·
8. Manual meal + nutrition result · 9. Barcode lookup · 10. Reports (daily/weekly/PDF) ·
11. Network loss → recovery in-session · 12. Scanner capture *(untestable here — needs a
physical device)*.

## What would actually unblock this

The emulator path has now been pushed as far as the evidence supports. The remaining
flows need **either** a physical Android phone, **or** a longer-lived emulator host
(a CI runner or a machine where the process is not killed). Further diagnostic
experiments on this AVD are not a good use of the next session — the control run above
already isolates the trigger, and four configurations have been tried.

---

# SESSION 8 — NON-DEVICE VALIDATION (2026-08-17)

No emulator was used. This session asks a narrower question of each of the 12 remaining
flows: **what does the existing automated/backend evidence actually establish, and where
does it stop?**

**The Android device score is unchanged at 33/45. Nothing below is promoted to
DEVICE VERIFIED.** Automated evidence proves the logic behind a flow; it cannot prove the
flow works in a running Android app.

## Per-flow assessment

| # | Flow | Device | Automated | Backend | Final audit status | Evidence |
|---|---|---|---|---|---|---|
| 1 | Notification delivery | UNVERIFIED | partial | — | **UNVERIFIED** | scheduling proven on device (S2: 2×`RTC_WAKEUP`, times match UI); delivery never observed. **See NOTIF-1 below** |
| 2 | FR notification localization | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | `notificationLocalization` 26/26 — 23 `reminders.*` + 10 `rappelsPage.*` keys, `{{hour}}` parity |
| 3 | EN notification localization | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | same suite |
| 4 | DE notification localization | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | same suite |
| 5 | Glucose entry + history | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | `plausibility` + `typedGlucoseUnit` **50/50**. The 18→mmol guard is additionally **DEVICE VERIFIED** (AF-13, S2) |
| 6 | Insulin logging | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | `computeIOB` 17, `mixedInsulinDisclosure` 11 |
| 7 | Bolus end-to-end with IOB | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | `computeSmartBolus` 41, `independentBolusValidation` 33, `localDoseCheck` 13, `cappedDose` 5, `ratioForMeal` 20, `ru11Baseline` 30, `bolusContract`. Screen + unit guard + ratio warning **DEVICE VERIFIED** (AF-11/12, S2) |
| 8 | Manual meal + nutrition result | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | `nutritionScience` 48, `nutritionScaling` 49, `carbProvenance` 34, `nutritionMicros` 33, `portionUnit` 32, `nutritionClaims` 31, `nutrientCompleteness` 31, `glycemicHonesty` 11, `glycemicVocabulary` 29 |
| 9 | Barcode lookup | UNVERIFIED | **VERIFIED** | **VERIFIED** | **UNVERIFIED (device)** | `catalogTrust` 26, `carbProvenanceProviders` 25, `nutriments` 32; USDA GTIN path smoke-tested against **live FDC** through the deployed function |
| 10 | Reports | UNVERIFIED | **VERIFIED** | — | **UNVERIFIED (device)** | `reportStats` 60, `reportCalendarLocalization` 37 |
| 11 | Network loss → recovery | partial | **partial** | — | **UNVERIFIED** | offline launch + recovery **DEVICE VERIFIED** (S2); in-session loss not tested. **See NET-1 below** |
| 12 | Scanner capture | UNVERIFIED | n/a | — | **UNVERIFIED** | cameras disabled on this AVD; needs a real camera |

**Barcode statuses kept separate, as instructed:** BARCODE LOOKUP = **BACKEND/AUTOMATED
VERIFIED**; BARCODE CAMERA CAPTURE = **UNVERIFIED**.

## Two gaps found by static analysis this session

**NOTIF-1 — a reminder notification has no tap destination. (P2, real)**
`schedule()` in `services/notifications.ts` builds `content: { title, body, sound: false }`
— **no `data` payload** — and there is **no notification-response listener anywhere in
`src/`** (`addNotificationResponseReceivedListener` / `useLastNotificationResponse`:
zero matches). Tapping a reminder can therefore only cold-open the app at its default
route; it cannot route to a per-reminder screen.

Consequence for the audit: the "tap action / destination screen / detail screen"
half of flow #1 **cannot pass even on a healthy device**, because the behaviour is not
implemented. This is a product decision (is a tap destination wanted?), not a defect to
fix unilaterally — **no code was changed.**

**NET-1 — the resilience layer is not directly tested. (P2, coverage gap)**
`services/nutrition/resilience.ts` implements per-provider timeout, one retry and
never-throw→`null`. **No test file references it** — the behaviour is only exercised
indirectly through provider suites. Network failure handling is therefore *inferred*,
not pinned. Recorded, not fixed: adding tests is a coding task.

## What this session did NOT do

No flow was promoted to PASS. No emulator experiment, no AVD variant, no source change,
no test change. Exercise/dose untouched — **CLINICAL DECISION REQUIRED** stands.

---

# SESSION 9 — NOTIF-1 IMPLEMENTED: TAP ROUTING + PAYLOAD (2026-08-17)

**This was a coding task, not device validation. The Android device score is
unchanged at 33/45, and notification delivery remains UNVERIFIED.**

## The gap

`scheduleNotificationAsync` was called with `content: { title, body, sound: false }`
— no `data` — and there was **no notification-response listener anywhere in `src/`**.
A patient who tapped *"time to check your blood sugar"* landed on whatever screen the
app happened to open with. The reminder asked them to do something and then did not
take them there.

## What was implemented

**`src/services/notificationRoute.ts` (new)** — the routing RULE, import-free so it is
unit-testable in node, matching the convention of `plausibility.ts`,
`permissionAction.ts` and `i18n/direction.ts`.

**`src/services/notificationRouting.ts` (new)** — the platform wiring
(expo-notifications + expo-router), kept separate because neither loads in the test
environment.

**`src/services/notifications.ts`** — `schedule()` gained an optional `type`; the four
existing calls pass theirs. Nothing else about scheduling changed.

**`src/app/_layout.tsx`** — `useNotificationRouting()` mounted at the root, so the
handler exists for every route.

### Payload

```json
{ "kind": "reminder", "type": "glucose" }
```

Type only. **No glucose value, no insulin dose, no carbohydrate figure, no diagnosis,
no identity, no token, no key.** A payload survives in the notification shade and on a
lost or shared phone, so it says which reminder fired and nothing about the patient.
`notificationPayloadIsSafe()` is the executable form of that rule and rejects a payload
with *any* extra field — even a harmless-looking one — so the next person to add one has
to justify it there.

The four `type` values are **the scheduler's own identifiers**, not new ones: they are
the `PlannedReminder.id`s the Rappels screen already renders.

### NOTIFICATION → DESTINATION MAP

| Type | Target | Parameter | Fallback |
|---|---|---|---|
| `glucose` | `/glucose` | — | `/(tabs)` |
| `insulin-long` | `/insulin` | — | `/(tabs)` |
| `breakfast` | `/(tabs)` | — | **NO DEDICATED DESTINATION** |
| `evening` | `/(tabs)` | — | **NO DEDICATED DESTINATION** |

`breakfast` invites a meal scan and `evening` is a day recap. Opening the CAMERA
straight from a notification is an intrusive product decision, and the "daily recap"
screen *is* the dashboard — so both route to `/(tabs)` and are recorded as
NO DEDICATED DESTINATION rather than having one invented. **No new screen was created.**

### Tap handling — all three cases

| Case | Mechanism |
|---|---|
| Foreground | `addNotificationResponseReceivedListener` |
| Background | same listener, fired when Android returns the response |
| **Cold start** | `getLastNotificationResponseAsync()` read once on mount — the listener registers too late to see the tap that launched the app, and this is the common case: a reminder fires at 09:00 on a phone closed overnight |

`routeForNotification` is **total**: `undefined`, `null`, a string, a number, a foreign
payload, an unknown type — every input yields a route instead of throwing. Navigation
failures fall back to `/(tabs)`. A tap can never crash the app or strand the patient.

### Localization

The routing layer holds **no user-visible strings** and does not import i18n — asserted
by test. Notification text is still resolved at scheduling time by the bound `t`, and
`(tabs)/_layout.tsx` still reschedules on `[i18n.language]`. The destination screen
renders through `useTranslation` at TAP time, so a language changed *after* a
notification was scheduled is respected on arrival. FR/EN/DE/AR titles and bodies are
pinned present, non-empty, mutually distinct, Arabic in Arabic script, `{{hour}}`
preserved.

## Tests added — 34 (`tests/domain/notificationRouting.golden.test.ts`)

Covering all fifteen required cases: payload creation · type · reminder id · FR/EN/DE/AR
title+body · tap routing · foreground · background · cold start · invalid payload ·
unknown type · safe fallback · no sensitive data. Plus: the hook is actually *mounted*
(a hook nobody calls would leave the defect in place), and the destination screens exist.

## Validation

```
FULL      1485 / 1485   (1451 + 34 new — no existing test changed or removed)
CLINICAL   222 / 222    unchanged
SECURITY    18 / 18
NOTIF LOC   26 / 26
TSC        PASS
LINT       PASS (6/6 baseline)
```

## Device status — deliberately NOT promoted

```
NOTIFICATION SCHEDULING   : DEVICE VERIFIED (session 2)
NOTIFICATION PAYLOAD      : AUTOMATED VERIFIED
NOTIFICATION TAP ROUTING  : AUTOMATED VERIFIED
NOTIFICATION DELIVERY     : UNVERIFIED  ← unchanged; no Android notification observed
FR / EN / DE localization : UNVERIFIED (device) — AUTOMATED VERIFIED
AR localization           : PASS (device, session 2)
```

Automated tests prove the logic. They do not prove a notification arrives on a phone or
that tapping it navigates there — that still needs a device.

---

# SESSION 10 — iOS ENVIRONMENT ASSESSMENT (2026-08-17)

**Result: iOS validation is NOT POSSIBLE in this environment. No iOS result is claimed.**

## Environment probe

| Tool | Result |
|---|---|
| Host OS | **Microsoft Windows 11 Home** |
| `xcodebuild` | **NOT FOUND** |
| `xcrun` | **NOT FOUND** |
| `simctl` (iOS Simulator) | **NOT FOUND** |
| `pod` (CocoaPods) | **NOT FOUND** |
| Native `ios/` directory | absent — managed workflow, prebuild required |

**Xcode and the iOS Simulator are macOS-only and cannot be installed on Windows.** This
is not a missing dependency that could be fetched; it is a platform boundary.

## Second, independent blocker

```
$ npx eas device:list
No Apple teams found for account tsuhel.
```

Even a cloud (EAS) iOS build is unavailable: it requires an Apple Developer Program
membership to mint a distribution certificate and provisioning profile, and an
internal-distribution build installs only on registered UDIDs.

**So iOS is blocked twice over — locally (no macOS toolchain) and remotely (no Apple
team). Neither can be resolved by engineering here.**

## What WAS auditable without a Mac — iOS configuration

| Item | State | Assessment |
|---|---|---|
| `bundleIdentifier` | `com.nabil.glucoai` | ✅ present |
| `supportsTablet` | `false` | ✅ deliberate |
| `NSCameraUsageDescription` | present | ✅ |
| `NSMicrophoneUsageDescription` | present | ✅ |
| `NSPhotoLibraryUsageDescription` | present | ✅ |
| `NSPhotoLibraryAddUsageDescription` | absent | ✅ **correctly absent** — no `expo-media-library` / save-to-library API is used |
| `NSFaceIDUsageDescription` | absent | ✅ **correctly absent** — no `expo-local-authentication` usage |
| `NSLocationWhenInUseUsageDescription` | absent | ✅ **correctly absent** — no location API used |
| `ITSAppUsesNonExemptEncryption` | **ABSENT** | ⛔ **owner decision** — export-compliance declaration, unchanged |
| `eas.json` → `ios` block | absent in all three profiles | ⛔ needed before an iOS build |

The three "absent" usage strings were each checked against actual API usage rather than
assumed to be gaps. **They are correct as they stand** — adding an unused usage string
invites an App Review question about a capability the app does not have.

## iOS status — unchanged and honest

```
CONFIGURATION : partially ready (identifiers + 3 required usage strings present)
BUILD         : BLOCKED — no Apple Developer team
SIMULATOR     : BLOCKED — macOS-only toolchain, absent on this Windows host
VALIDATION    : NOT STARTED — 0 / 45 flows
```

**Unblock order:** Apple Developer membership → owner answers the export-compliance
declaration → add an `ios` block to the EAS profile → `eas credentials` → register a
device (or use a Mac for the Simulator).
