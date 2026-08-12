# FINAL STRICT AUDIT — ANDROID · iOS · GENERAL

**Audit date:** 2026-08-09
**Repository state:** `main` @ `43da9f1`, working tree clean, `main == origin/main`
**Method:** independent verification. No previous audit finding was accepted without
re-checking it against source, a running production system, or a recomputation.
**Nothing in the application was modified.** No commit, no push, no deploy, no migration.

---

## 0 · WHAT WAS ACTUALLY EXECUTED FOR THIS AUDIT

Every claim below is traceable to one of these. Where a claim could not be
grounded in one of them, it is marked **UNVERIFIED** and says why.

| # | Action | Result |
|---|---|---|
| E1 | `npx vitest run` (full suite) | **1183/1183 passed, 47 files** |
| E2 | `npx tsc --noEmit` | **clean, exit 0** |
| E3 | `node scripts/ci/check-edge-imports.mjs` | **OK — 23 shared symbols** |
| E4 | `npx vitest run --config vitest.security.config.ts` | **DID NOT RUN** — local Supabase stack not started |
| E5 | Supabase production — `list_migrations` | **29 applied; repo has 33** |
| E6 | Supabase production — `pg_policy` on `product_catalog` | **N-12 hole confirmed LIVE** |
| E7 | Supabase production — `pg_constraint` on `profiles`/`meal_scans` | **0031/0032 constraints ABSENT** |
| E8 | Supabase production — `pg_proc` on `upsert_product` | **SECURITY INVOKER + override branch, LIVE** |
| E9 | Supabase production — `get_advisors(security)` | 18 lints (1 INFO, 17 WARN) |
| E10 | Supabase production — `list_edge_functions` + source fetch | 12 functions; **v2/v6/v42 deployed 2026-08-09T19:57Z** |
| E11 | Vercel — `list_deployments` | production = `43da9f1`, READY, 2026-08-09T19:46Z |
| E12 | `git log origin/main..main` | **empty — nothing unpushed** |
| E13 | Independent bolus matrix, **35 cases**, own reference implementation | 0 mismatches vs app's own model; **6 divergences vs pump convention** |
| E14 | Independent nutrition/GI/GL/score matrix, **60+ cases** | GL identity exact; **6 scoring contradictions** |
| E15 | Internal food DB — Atwater energy coherence, 60 entries | 0 above 20 % deviation; **7 alias collisions** |
| E16 | i18n parity, 4 locales, 2153 keys each | **0 missing, 0 extra, 0 empty** |
| E17 | Static source analysis — permissions, RTL, web-only APIs, secrets | see §10, §11 |
| E18 | Android / iOS device execution | **NOT EXECUTED — no device connected** |

Harness files were written to the session scratchpad only, never to the repository.

---

## 1 · EXECUTIVE SUMMARY

**Final verdict: NOT READY.**

The engineering quality of this codebase is genuinely high. The arithmetic is
correct, the provenance discipline is real and enforced by 1183 passing
fixtures, i18n parity is perfect, and the crash-reporting privacy layer is
better than most production medical apps. That is not the problem.

The problem is a **three-way split between the repository, production, and the
project's own documentation** — and a set of defects that live specifically in
the code paths the web build cannot exercise, which is exactly where a
web-reviewed, device-untested release goes wrong.

Four things decide the verdict:

1. **Production is running a database the repository does not describe.**
   Migrations `0030`–`0033` exist on disk and have never been applied. `0033`
   closes an exploitable RLS hole (N-12). I confirmed against the live
   `pg_policy` catalogue that the hole is open right now. See **A-1**.

2. **The project's own blocker document is materially wrong about release
   state — in both directions.** It says Vercel, three Edge Functions and four
   commits are undeployed; all three are in fact done. It says the catalogue
   write boundary "was closed by migration 0033"; it is not closed in
   production. A release decision taken from that document today would be taken
   on false information. See **§18**.

3. **Three defects are Android/iOS-only and invisible to the web review the
   project relies on**: Arabic never becomes RTL without a manual app restart
   (**B-1**), every scheduled OS notification is hardcoded French (**B-2**), and
   a camera permission denied once locks the scanner permanently with a button
   that does nothing (**B-3**).

4. **No flow has been executed on a real Android or iOS device.** Not one. The
   entire Part 2E / Part 3F matrix is NOT TESTED, and iOS cannot even be built.

The clinical picture is unchanged and honestly documented: the bolus engine is
**mathematically consistent** — I verified it independently across 35 cases and
found zero disagreement with its own specification — but it is **not clinically
validated**, and my independent recomputation quantifies the IOB divergence at
up to **+1.5 U in the exercise-plus-stacking case**, in the unsafe direction.

**Nothing here should be read as "the app is bad".** It is a well-built
application that is not yet in a releasable *state*.

### Counts

| | |
|---|---|
| New bugs found this audit | **21** (3 critical · 6 high · 12 normal) |
| Previous bugs verified still open | **9** |
| Previous blockers verified **resolved** (doc was wrong) | **3** (B-15, B-16, B-17) |
| Clinical blockers | **6** |
| Product decisions | **8** |
| Android device tests executed | **0 of 20** |
| iOS device tests executed | **0 of 20** (build impossible) |
| Security issues | **5** (2 exploitable) |
| Release/config issues | **9** |
| Documentation issues | **4** |

---

## 2 · ENTIRE APPLICATION AUDIT

### 2.1 Surface inventory

55 routes, 68 components, 64 services, 33 migrations, 12 Edge Functions,
4 locales × 2153 keys.

| Area | Routes | Static review | Numeric verification | Device |
|---|---|---|---|---|
| Onboarding / auth | `welcome`, `onboarding`, `auth`, `wizard`, `index` | done | n/a | **NOT TESTED** |
| Profile / personal / diabetes data | `profile`, `profile-edit`, `doctor-code`, `integrations` | done | partial | **NOT TESTED** |
| Home / dashboard | `(tabs)/index`, `activity-status` | done | n/a | **NOT TESTED** |
| Programme | `program*` ×6 | done | fixtures only | **NOT TESTED** |
| Scanner chain | `scan`, `scan-result`, `barcode`, `menu-scan`, `foods` | done | **done — §6** | **NOT TESTED** |
| Glucose / insulin / bolus | `glucose`, `log-glucose`, `insulin`, `log-insulin`, `bolus` | done | **done — §7** | **NOT TESTED** |
| Journal / calendar / day | `(tabs)/journal`, `calendar`, `day`, `timeline` | done | fixtures only | **NOT TESTED** |
| Reports / PDF | `report`, weekly | done | fixtures only | **NOT TESTED** |
| AI assistant / chat / call | `ai-chat`, `ai-call`, `ai-log`, `ai-journal`, `support-ai` | done | n/a | **NOT TESTED** |
| Healthy foods / world | `healthy-food(s)`, `world-recipe(s)` | done | n/a | **NOT TESTED** |
| Emergency | `emergency` | done | n/a | **NOT TESTED** |
| Settings / language / deletion | `profile-edit`, `subscription`, `usage-limits` | done | n/a | **NOT TESTED** |

**Honest coverage statement.** Static review means the route's source, its state
handling and its error paths were read. It does **not** mean the screen was
rendered. No screen in this application was rendered on a device during this
audit, and no screenshot exists. Where a defect is asserted below, its evidence
is a file and line, not an observation.

### 2.2 Per-flow state handling — what is genuinely good

Verified present and correct in source:

- **Empty / unknown is never zero.** `carbProvenance.ts` distinguishes `known` /
  `unknown` / `indeterminate`, and the legacy rule (a non-zero legacy value
  cannot have come from a zero-fill) is sound. This is unusually careful.
- **Unusable portions.** `isUsablePortion` + `scale()` return an all-unknown
  record rather than `NaN`, closing the path where `scoreMeal` awarded 100/100
  because every `NaN` comparison is false.
- **Empty plate does not throw.** `aggregateItems` handles `[]` (P8-006).
- **Quality verdict is evidence-gated.** `qualityEvidence` withholds the score,
  the word and the A–E letter when the plate has no energy or a floor
  carbohydrate. **I verified this actually fires**: a 0-kcal plate scores 100/A
  internally but the screen shows no verdict (`scan-result.tsx:572`).
- **Bolus hand-off is not in the URL.** `bolusHandoff.ts` keeps the carbohydrate
  in a module-level value; not persisted, not query-string, not logged.
- **AI never invents the dose.** The engine produces it; the AI narrates it.
- **Only one TODO in the entire source tree** — the medical-review one.

### 2.3 Flows where the state matrix is NOT covered

The following were requested and cannot be answered from source alone. Each
needs a device (§16):

session expiration mid-scan · app killed during upload · WiFi↔LTE switch
mid-AI-request · duplicate submit under latency · back-navigation out of a
half-saved meal · cold start with an expired refresh token · offline queue drain
after 24 h offline · low-memory kill during camera preview.

The offline queue design (Step 14, idempotent re-push) is sound **on paper** and
its interaction with migration `0032` is explicitly reasoned about in the
migration header — but since `0032` is not applied, that reasoning is currently
moot (see A-1).

---

## 3 · ANDROID AUDIT

### 3.A Build

| Item | Value | Status |
|---|---|---|
| Application ID | `com.nabil.glucoai` | ✅ |
| Version name | `1.0.0` (`app.json`) | ✅ |
| `versionCode` | not in `app.json`; `eas.json` → `appVersionSource: "remote"` + `autoIncrement: true` | ✅ managed by EAS |
| Release profile | `production`, channel `production` | ⚠️ channel is **inert** (no `expo-updates`) |
| Debug vs release | `preview` = APK/internal; `production` = AAB | ✅ |
| Env vars | `EXPO_PUBLIC_*` only; no secrets client-side | ✅ verified |
| Production API URLs | Supabase URL/anon key are `EXPO_PUBLIC_`; no hardcoded prod URL in `src/` | ✅ |
| Signing / keystore | not in repo (`*.jks`, `*.p12`, `*.key` gitignored) | ✅ correct; **EAS-managed, UNVERIFIED** |
| ProGuard / R8 | no `expo-build-properties`; template defaults | **UNVERIFIED** |
| Hermes | Expo SDK 57 default | **UNVERIFIED** |
| ABI / 64-bit | Expo SDK 57 default (arm64-v8a + armeabi-v7a) | **UNVERIFIED** |
| **min / target / compile SDK** | **not declarable from the repo** | **UNVERIFIED — see G-4** |
| Native modules | 22 Expo modules + Sentry + reanimated + screens + svg | ✅ all Expo-SDK-57-pinned |
| Dependency compatibility | all `~57.0.x`, RN 0.86.0, React 19.2.3 | ✅ consistent |

**G-4 — target SDK cannot be verified from this repository.** `/android` is
gitignored (CNG), no `expo-build-properties` plugin is configured, and the
prebuild template is fetched from npm at build time. The effective
`targetSdkVersion` therefore exists only inside an EAS build. Google Play's
target-API requirement is a hard submission gate. **This must be read off an EAS
build log or a local `expo prebuild` before submission** — I did not run
`prebuild` because it writes `/android` into the working tree.

### 3.B Permissions

Declared in `app.json`: `CAMERA`, `RECORD_AUDIO`.
Merged from library manifests (verified in `node_modules`):
`POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` (expo-notifications),
`CAMERA` (expo-camera).

| Permission | Declared | Requested at right moment | Rationale shown | Denial handled | "Don't ask again" | Revoked-after-grant |
|---|---|---|---|---|---|---|
| Camera | ✅ | ✅ on scanner open, gated on `canAskAgain` (`scan.tsx:156`) | ✅ `scanner.grantPermission` | ✅ | ❌ **B-3** | **NOT TESTED** |
| Microphone | ✅ | ❌ **never requested on native** | ✅ plist/plugin string exists | n/a | n/a | n/a |
| Photo library | ✅ implicit (Android 13+ photo picker needs none) | ✅ | ✅ | ✅ | n/a | **NOT TESTED** |
| Notifications | ✅ merged | ⚠️ on tab-layout mount (`refreshSmartReminders`) | ❌ **no pre-permission rationale screen** | ✅ returns early | ❌ no re-prompt path | **NOT TESTED** |
| Storage / location / biometric | not used | n/a | n/a | n/a | n/a | n/a |

**B-3 (HIGH) — permanent camera lockout.** `scan.tsx:156` only auto-requests when
`permission.canAskAgain`. The manual button at `scan.tsx:445` calls
`requestPermission()` unconditionally — but once Android has recorded "Don't ask
again" (or iOS has recorded any denial), that call resolves `denied` instantly
and **nothing happens**. `Linking.openSettings()` appears nowhere in the
codebase (verified: zero matches across `src/`). The patient sees a button that
does nothing, forever. The same pattern is in `barcode.tsx:314`,
`ScanAddSheet.tsx:277`, `AddedSugarCard.tsx:316`.
*This does not reproduce on web*, where the browser re-prompts.

**C-7 (NORMAL) — `RECORD_AUDIO` declared for a feature that does not exist on
Android.** The voice path is `navigator.mediaDevices.getUserMedia`
(`geminiLive.ts:423`) — a browser API absent in React Native. `ai-call.tsx:686`
correctly returns `false` when `Platform.OS !== 'web'`, so it degrades safely
rather than crashing. But the AI voice call, a headline feature, **does not work
in the Android app at all**, while the app still asks Play for microphone
access. Both the permission declaration and the store listing need to match
reality.

### 3.C Android UI

| Item | Finding |
|---|---|
| Safe areas | `react-native-safe-area-context` used throughout ✅ |
| Status/navigation bar | `expo-status-bar`, `userInterfaceStyle: "dark"`, `backgroundColor: #101014` ✅ |
| Predictive back | `predictiveBackGestureEnabled: false` — deliberate ✅ |
| Keyboard covering inputs | **NOT TESTED** — no `KeyboardAvoidingView` audit performed at render |
| Long German strings | locale parity ✅; **overflow behaviour NOT TESTED** (a known past problem area per project memory) |
| **Arabic RTL** | ❌ **B-1 — broken on native, see below** |
| `textAlign: 'left'` | ❌ **C-6** — `foods.tsx:330` will not mirror in RTL |
| Physical vs logical edges | 223 `marginLeft`/`paddingRight`/`left:` vs 12 `marginStart`/`end` — **high RTL risk, NOT TESTED** |
| Charts / SVG / camera preview / PDF | **NOT TESTED** |

**B-1 (HIGH) — Arabic never becomes RTL on Android or iOS without a manual
restart.**
`src/i18n/index.ts:35` calls `I18nManager.forceRTL(rtl)` and returns. React
Native applies `forceRTL` only at the **next native launch**. The code comment
admits this ("native needs a reload to fully apply") — but:

- there is **no reload**: `Updates.reloadAsync` does not exist because
  `expo-updates` is **not installed** (verified: `node_modules/expo-updates`
  absent);
- there is **no restart prompt**: `setAppLanguage` is called from
  `profile-edit.tsx:167` and `welcome.tsx:307`, neither of which shows one, and
  no locale contains a "restart the app" string (verified across all four
  files);
- on first launch in Arabic the same applies — `initI18n` sets `forceRTL` after
  the JS context is already up.

**Net effect on a real phone:** the patient selects العربية, every string turns
Arabic, and the entire layout stays left-to-right. On web this is invisible
because the web branch sets `document.documentElement.dir` live. This is the
single clearest example of a defect the web review structurally cannot find.

### 3.D Android lifecycle

Cold start · warm start · background/foreground · killed-and-reopened ·
low memory · interrupted scan · interrupted upload · interrupted AI request ·
WiFi↔mobile switch · offline→online · session expiration · notification deep
link · deep links — **ALL NOT TESTED.**

Static observations worth carrying into the device pass:
- `scheme: "glucoai"` is set; `expo-linking` present. No deep-link route map was
  found — notification tap-through target is **unverified**.
- `refreshSmartReminders()` runs on `(tabs)/_layout` mount, i.e. on every warm
  foreground into the tab stack. It calls
  `cancelAllScheduledNotificationsAsync()` then reschedules — cheap, but it
  means a permission prompt can appear on an ordinary navigation.

### 3.E Android real-device flows — all 20

**No device was connected. No flow was executed. No result is claimed.**

Per instruction, every row is `NOT TESTED`. Preconditions and steps are given so
the pass can be run without re-deriving them.

| ID | Name | Preconditions | Steps | Expected | Actual | Verdict | Evidence | Severity |
|---|---|---|---|---|---|---|---|---|
| AF-01 | Cold start → welcome | fresh install | launch | welcome, language picker | — | **NOT TESTED** | none | High |
| AF-02 | Sign-up → wizard → home | AF-01 | create account, complete wizard | profile persisted, home renders | — | **NOT TESTED** | none | High |
| AF-03 | Camera permission grant | AF-02 | open scanner, Allow | live preview, 4:3 uncropped | — | **NOT TESTED** | none | High |
| AF-04 | Camera permission **deny + don't ask again** | AF-02 | deny twice, tap grant button | route to system settings | **predicted FAIL — B-3** | **NOT TESTED** | `scan.tsx:445` | **Critical** |
| AF-05 | Scan a real meal | AF-03 | photograph a plate | foods + carbs + score | — | **NOT TESTED** | none | Critical |
| AF-06 | Scan retry on AI 503 | AF-03, throttled net | scan during provider load | 3 attempts, `ai_unavailable` copy, no "check your connection" | — | **NOT TESTED** | none | High |
| AF-07 | Scan interrupted by background | AF-03 | home button mid-upload | resumes or fails cleanly | — | **NOT TESTED** | none | High |
| AF-08 | Edit plate → re-resolve | AF-05 | change a food, change portion | rescale from `per100g_base` | — | **NOT TESTED** | none | High |
| AF-09 | Save meal offline → drain | airplane mode | save, re-enable network | exactly one row, idempotent | — | **NOT TESTED** | none | Critical |
| AF-10 | Log glucose, unit guard | AF-02 | type `5.6` | refusal + "did you mean 101?" | — | **NOT TESTED** | `log-glucose.tsx:74` | High |
| AF-11 | Bolus, normal case | AF-02, ratios set | 60 g, BG 120 | 6.0 U | — | **NOT TESTED** | matches B01 §7 | Critical |
| AF-12 | Bolus, hypo | AF-02 | BG 60, 60 g | 0 U, no dose narration | — | **NOT TESTED** | matches B02 §7 | **Critical** |
| AF-13 | Bolus, unit confusion on the **bolus** field | AF-02 | type `5.6` into bolus glucose | should refuse | **predicted FAIL — B-4** | **NOT TESTED** | `bolus.tsx:207` | **Critical** |
| AF-14 | Bolus with IOB + exercise | AF-02 | 60 g, 3 U IOB, intense sport | 2.3 U (engine) | — | **NOT TESTED** | matches B17 §7 | **Critical** |
| AF-15 | **Arabic RTL** | AF-02 | switch to العربية | full mirrored layout | **predicted FAIL — B-1** | **NOT TESTED** | `i18n/index.ts:35` | **Critical** |
| AF-16 | German long strings | AF-02 | switch to Deutsch, visit all tabs | no clipping/overlap | — | **NOT TESTED** | none | High |
| AF-17 | **Scheduled notification language** | AF-02, ar or de | wait for daily reminder | reminder in patient's language | **predicted FAIL — B-2** | **NOT TESTED** | `notifications.ts:167` | High |
| AF-18 | Notification tap → correct screen | AF-17 | tap the notification | correct route | — | **NOT TESTED** | none | High |
| AF-19 | Doctor PDF generate + share | ≥7 days data | generate, share | correct period, no French on ar/de | — | **NOT TESTED** | none | High |
| AF-20 | Account deletion | AF-02 | delete account | signed out, rows gone, **storage gone?** | **partial FAIL predicted — C-9** | **NOT TESTED** | `delete-account/index.ts:45` | High |

**To execute AF-01…AF-20 you need:** a physical Android device (API 33+ to
exercise `POST_NOTIFICATIONS`, plus one API 26–28 device for the low end), USB
debugging, the existing internal-distribution APK installed, a throttling proxy
or Android Studio network profile for AF-06/AF-09, and a test account per
locale. No Google Play account is needed for any of the twenty.

---

## 4 · iOS AUDIT

### 4.A Build

| Item | Value | Status |
|---|---|---|
| Bundle identifier | `com.nabil.glucoai` | ✅ |
| Version / build number | `1.0.0` / remote autoIncrement | ✅ |
| `supportsTablet` | `false` | ✅ deliberate |
| Deployment target | Expo SDK 57 default | **UNVERIFIED** (same cause as G-4) |
| Signing / provisioning / certificates | — | ❌ **G-1 — blocked** |
| Entitlements / capabilities | none declared beyond defaults | ✅ consistent with feature set |
| Native plugins | expo-camera, secure-store, localization, font, splash, sharing, Sentry | ✅ |
| `Info.plist` — camera | ✅ `NSCameraUsageDescription` | ✅ |
| `Info.plist` — photo library | ✅ `NSPhotoLibraryUsageDescription` | ✅ |
| `Info.plist` — microphone | ✅ `NSMicrophoneUsageDescription` | ⚠️ **for a feature iOS cannot run — C-7** |
| `ITSAppUsesNonExemptEncryption` | **absent** | ❌ **G-2** |
| Privacy manifest (`PrivacyInfo.xcprivacy`) | none in repo; Expo auto-generates for its own modules | **UNVERIFIED — G-3** |

**G-1 (RELEASE, blocks iOS entirely).** No Apple Developer Program membership is
linked to the EAS account. `eas build --platform ios` cannot reach credential
setup. Required, in order: enrol ($99/yr) → link to EAS → `eas credentials
--platform ios` **interactively** → `eas device:create` for at least one UDID
(internal distribution installs only on registered devices). `.expo/devices.json`
currently reads `{"devices": []}` — **verified**.

**G-2 (RELEASE).** `ITSAppUsesNonExemptEncryption` is absent from
`ios.infoPlist`. This is a declaration about the product, answered by the
account holder in App Store Connect. Engineering must not assert it. Until it is
answered, every TestFlight upload will stall at the export-compliance prompt.

**G-3 (RELEASE, UNVERIFIED).** Apple requires a privacy manifest declaring
required-reason API use and third-party SDK manifests. Expo SDK 57 generates one
for its own modules at prebuild. `@sentry/react-native` ships its own. **Neither
was inspected, because `/ios` is gitignored and no prebuild was run.** Must be
confirmed on the first archive.

### 4.B iOS permissions

Same table as §3.B. Two iOS-specific consequences:

- **B-3 is worse on iOS.** iOS grants exactly one prompt per permission, ever.
  After a single "Don't Allow", `requestPermission()` is permanently a no-op and
  the app has no route to Settings. On iOS this is not an edge case — it is the
  second-most-likely first-run outcome.
- **Microphone.** Requesting a permission the app never uses, or shipping a
  usage string for an unreachable feature, invites a 2.1/5.1.1 review question.
  Either implement native audio capture or remove `NSMicrophoneUsageDescription`
  and `RECORD_AUDIO` before submission.

### 4.C App Store compliance

**No compliance claim is made. The repository does not contain the evidence for
one.** What can be stated:

| Requirement | Evidence in repo | Verdict |
|---|---|---|
| Account deletion in-app (§5.1.1(v), mandatory) | `profile-edit.tsx` → `delete-account` fn | ✅ present — but see **C-9** |
| Login requirement justified | app is account-based health tracking | ✅ defensible |
| Health data handling | Supabase-hosted, RLS-scoped | ⚠️ but see **A-1** |
| Privacy labels / data-collection declaration | **nothing in repo** | ❌ **not prepared** |
| Encryption declaration | absent | ❌ **G-2** |
| Medical disclaimer | `mealScore.ts` "not a clinical measure"; PDF note; `emergency.tsx` | ⚠️ **partial** — no app-level medical disclaimer or terms surface was found |
| Analytics / crash reporting | Sentry present, **DSN empty → disabled** | ✅ nothing transmitted |
| Third-party SDKs | Supabase, Sentry, Google Fonts, Gemini/OpenAI (server-side only) | ⚠️ must be declared |
| Subscription / payment | `subscription.tsx` exists; no IAP module installed | ⚠️ **E-8 — product decision** |

**A medical app that recommends insulin doses will attract App Review
scrutiny under guideline 1.4.1 (physical harm).** Nothing in this repository
prepares for that conversation. That is a product/regulatory work item, not an
engineering one, and it is not started.

### 4.D / 4.E iOS UI and lifecycle

Dynamic Type · notch / Dynamic Island · safe areas · keyboard · bottom sheets ·
modals · long German strings · Arabic RTL · font rendering · charts · camera ·
photo picker · notifications · PDF · dark mode · cold start · background ·
foreground · termination · interrupted request/scan/upload · session expiration ·
notification deep link · permission changes from Settings —
**ALL NOT TESTED. No iOS build exists.**

Note: `userInterfaceStyle: "dark"` is forced, so light mode is not a variable.

### 4.F iOS flows requiring a physical iPhone

All twenty AF-* flows apply unchanged, plus five iOS-specific:

| ID | Name | Blocker |
|---|---|---|
| IF-01 | Dynamic Type at accessibility sizes | needs device |
| IF-02 | Dynamic Island / notch overlap | needs device |
| IF-03 | Permission revoked in Settings while app is backgrounded | needs device |
| IF-04 | Silent-switch behaviour for TTS playback | needs device |
| IF-05 | Share-sheet PDF export | needs device |

**Exact blocker: G-1.** Until an Apple Developer Program membership exists and
is linked, none of the above can begin.

---

## 5 · BACKEND / SUPABASE AUDIT

### 5.1 The critical finding

> **A-1 — CRITICAL — production is missing four migrations, one of which closes
> an exploitable authorization hole.**

Repository: 33 migrations. Production (`list_migrations`): **29**.
Missing: `0030_privilege_baseline`, `0031_clinical_param_checks`,
`0032_meal_scans_checks`, `0033_catalog_write_trust`.

I did not take this from the migration list alone. I queried the live catalogues:

**A-2 — CRITICAL — `product_catalog` is writable by any authenticated user.**
```
polname                  using_expr        check_expr
product_catalog_update   (NOT verified)    (NOT verified)
```
No ownership predicate. Any signed-in patient can `UPDATE` **any** unverified
catalogue row — its name and every macro. `0033` replaces this with
`(not verified and contributed_by = auth.uid())`, and that migration has never
run.

*Why this is a safety issue and not just a data issue:* the catalogue feeds the
barcode scanner, the barcode result feeds `carbohydrates`, and the carbohydrate
seeds the bolus field. A rewritten `carbs` value on a popular product is a path
from an ordinary user account to another patient's insulin dose. It requires no
privilege escalation and no exploit — just a REST `PATCH`.

**A-3 — CRITICAL — `upsert_product` still launders provenance.**
```
proname          secmode             has_override_branch  has_coalesce
upsert_product   SECURITY INVOKER    true                 true
```
Production still carries the `p_source = 'user'` override branch (N-13) and does
not update the `source` column on conflict — so a user-rewritten row keeps an
`openfoodfacts` label, and the client's Step-12 trust rule goes on treating it as
authoritative.

**A-4 — HIGH — clinical and domain CHECK constraints absent.**
`pg_constraint` on `profiles` and `meal_scans` shows **no**
`profiles_carb_ratio_positive`, **no** `profiles_correction_factor_positive`,
**no** `meal_scans_nonnegative`. Present and validated are only the older
constraints (`insulin_per_10g_*`, `daily_glucose_goal`, roles, enums). So the
database will still accept a negative carb ratio, a zero ISF, and negative
calories/carbs/confidence.

**Root cause — and this is the important part.** `ci-database.yml` boots a
**local** stack and verifies migrations against it. It is explicitly and
correctly isolated from production ("declares no `secrets:`… every Supabase
command is `--local`"). That isolation is right — but it means **nothing in the
pipeline compares the repository to the hosted database.** There is no drift
detection. CI has been green this whole time while production diverged by four
migrations.

### 5.2 Security advisors (production, live)

| Level | Lint | Count | Assessment |
|---|---|---|---|
| INFO | `rls_enabled_no_policy` on `recipe_meta` | 1 | RLS on, zero policies → table is unreadable by anyone but service_role. Fails **closed**. Low risk, but almost certainly not intended. **C-8** |
| WARN | `function_search_path_mutable` — `touch_updated_at` | 1 | trigger function without `set search_path`. **C-10** |
| WARN | `anon_security_definer_function_executable` | 6 | `is_admin`, `is_doctor`, `is_my_patient`, `my_usage_status`, `touch_last_seen`, `usage_status` callable by `anon` |
| WARN | `authenticated_security_definer_function_executable` | 9 | same set + `redeem_promo_code`, `my_call_minutes_left`, `unlink_my_doctor` |
| WARN | `auth_leaked_password_protection` | 1 | HaveIBeenPwned check **disabled**. **S-4** |

On the SECURITY DEFINER warnings: three of them (`is_admin`, `is_doctor`,
`is_my_patient`) are a **deliberate, documented exception** — RLS policies
evaluate with the caller's privileges, so revoking EXECUTE would fail every
doctor/admin policy closed for the wrong reason. `0018` and `0030` both state
this. I agree with the reasoning. The remaining ones (`usage_status`,
`touch_last_seen`, `my_usage_status` reachable by `anon`) are not obviously
required by a policy and should be narrowed — **S-5**.

### 5.3 Edge Functions — deployed vs repository

| Function | Prod version | Last deploy (UTC) | Matches repo? |
|---|---|---|---|
| `analyze-meal` | 14 | 2026-08-09 05:06 | assumed (version post-dates fix) |
| `nutrition-search` | **2** | 2026-08-09 19:57 | assumed |
| `food-search` | **6** | 2026-08-09 19:57 | ✅ **verified by source fetch** |
| `ai-chat` | **42** | 2026-08-09 19:57 | assumed |
| `lab-analyze` | 5 | 2026-08-02 20:37 | not checked |
| `delete-account` | 1 | 2026-07-07 | ✅ small, matches |
| `live-token`, `admin-ops`, `world-recipes`, `enrich-dishes`, `gen-dish-image`, `tts` | 2/2/11/4/2/2 | Jul | not checked |

I fetched the deployed `food-search` source and confirmed byte-level presence of
the Step-15 `callerUserId(req)` guard and the shared `aiFetch` retry policy. The
other two in that batch were deployed in the same 44-second window and their
versions advanced past the values the blocker doc claims. **I verified 1 of 3 by
content and 2 of 3 by version.** That distinction is deliberate.

**⚠️ `lab-analyze` (v5) has a suspicious entrypoint:**
`file:///Users/nabil/Desktop/.../supabase/functions/lab-analyze/index.ts` — a
**local macOS filesystem path**, unlike every other function's
`/tmp/user_fn_...` path. This indicates it was deployed by a different mechanism
and its deployed content is not confidently known. **G-9 — re-deploy and
verify.**

### 5.4 Other backend items

| Item | Status |
|---|---|
| RLS / patient isolation / doctor / admin access | policies present; `is_my_patient` scoping ✅ — but **not re-tested**, because E4 could not run |
| Secrets | server-side only; `.env*` gitignored; **no service-role key in any tracked file** ✅ verified |
| AI retry / timeout | `_shared/aiFetch.ts` — one policy, 3 attempts, jittered backoff, honours Gemini `retryDelay` ≤ 8 s ✅ well done |
| Rate limiting / quotas | `usage_limits` + `usage_check`; per-feature, Casablanca tz ✅ |
| Idempotency / duplicate events | Step 14 offline queue ✅ design sound |
| Health-data leakage in logs | `logUsage` stores token counts and cost only ✅ |
| Error responses | stable `code: 'ai_unavailable'` ✅ |

---

## 6 · NUTRITION / AI AUDIT — INDEPENDENT NUMERICAL VALIDATION

### 6.A GL identity — **VERIFIED CORRECT**

12 cases, `glValue(carbs, gi)` vs independently computed `GI × carbs / 100`:

```
CARBS   GI    app      independent   match
80.4    32    25.728   25.728        yes
82      74    60.680   60.680        yes
123     41    50.430   50.430        yes
162.4   52    84.448   84.448        yes
28      73    20.440   20.440        yes
…                                    12/12
GL identity mismatches: 0
```
**MATHEMATICALLY CORRECT.** Not clinically validated (see §7.F).

### 6.B The audit brief's worked example — **the quoted figures are wrong**

The brief asks about *400 g lentils + 200 g whole-grain bread = 736 kcal, 123 g
carbs, GI 41, GL 50*. I ran that plate through the real `aggregateItems` with
USDA per-100 g references (lentils 116 kcal/20.1 C; whole-wheat bread
247 kcal/41.0 C):

```
app  : 958 kcal · 162.4 g C · GI 53 · GL 86 (High) · score 87 · grade A
indep: 958 kcal · 162.4 g C · GI 53 · GL 86.1
Δkcal 0 · Δcarb 0.0 · ΔGI 0 · ΔGL 0.07 (integer rounding)
coverage 1.00 · giEstimated false · carbs_known true
```

**The application's arithmetic is exact.** The 736/123/41/50 figures in the brief
match neither the app nor USDA — they are not reproducible and should not be
treated as an observed defect.

**But the plate exposes a real one:** 162 g of carbohydrate at GL 86 —
four times the "high" threshold — is scored **87/100, grade A, "Excellent"**.

### 6.C Scoring contradiction matrix — **6 real contradictions**

15 representative meals through the real `scoreMeal`:

| Meal | kcal | C | sugar | fat | fib | GI | **GL** | GL band | Score | Letter | Word |
|---|---|---|---|---|---|---|---|---|---|---|---|
| salad + chicken | 350 | 20 | 4 | 12 | 7 | 30 | 6.0 | low | 100 | A | Excellent |
| balanced plate | 550 | 55 | 8 | 18 | 6 | 50 | 27.5 | high | 100 | A | Excellent |
| **low GI + very high carb** | 700 | **150** | 8 | 5 | 20 | 32 | **48.0** | **high** | **95** | **A** | **Excellent** |
| **400 g lentils + 200 g bread** | 958 | **162** | 18.4 | 8 | 45.6 | 53 | **85.9** | **high** | **77** | **B** | **Good** |
| low-GI extreme carb, low fibre | 800 | **200** | 10 | 2 | 1 | 35 | **70.0** | high | 79 | B | Good |
| high-GL white rice 300 g | 390 | 84 | 0.2 | 1 | 1.2 | 73 | 61.3 | high | 57 | C | Moderate |
| high-sugar dessert | 450 | 60 | 45 | 20 | 1 | 65 | 39.0 | high | 62 | C | Moderate |
| **high-fat, low-carb** | 900 | 10 | 2 | **80** | 2 | 20 | 2.0 | low | **97** | **A** | **Excellent** |
| **PURE FAT — 100 g oil** | 884 | 0 | 0 | **100** | 0 | 0 | 0.0 | low | **92** | **A** | **Excellent** |
| 6 tbsp sugar, nothing else | 300 | 75 | **75** | 0 | 0 | 65 | 48.8 | high | 54 | C | Moderate |
| nutrient-dense carb-heavy | 780 | 120 | 12 | 12 | 18 | 45 | 54.0 | high | 95 | A | Excellent |
| salty (sodium 2400 mg) | 600 | 50 | 6 | 30 | 3 | 55 | 27.5 | high | 97 | A | Excellent |
| **same, sodium MISSING** | 600 | 50 | 6 | 30 | 3 | 55 | 27.5 | high | **100** | A | Excellent |
| zero everything | 0 | 0 | 0 | 0 | 0 | 0 | 0.0 | low | 100 | A | *(withheld ✅)* |

> **CORRECTION (remediation pass, 2026-08-10).** The lentils + bread row above
> originally read *87 · A · Excellent*. That was wrong: the matrix hand-entered
> a sugar of 12 g where the USDA figures give **18.4 g**, which crosses the
> `sugar > 15` gate and costs 10 points. The plate is **77 · B · "Good"**. The
> error was caught by the permanent fixture built during remediation
> (`tests/domain/independentNutritionValidation.golden.test.ts`), which derives
> every figure from the reference data instead of by hand. The contradiction
> below is unaffected — the clean instances are the 150 g-carbohydrate plate
> and the pure-fat plate — but the specific example was overstated.

**N-1 (HIGH) — the "LOW GI + VERY HIGH CARB + HIGH GL → A/Excellent"
contradiction the brief asked about is REAL and reproducible.** Two plates
exhibit it cleanly (150 g carbohydrate at GL 48 → 95 · A; balanced-looking
550 kcal at GL 27.5 → 100 · A); the lentil plate reaches B rather than A. Glycemic load — the one meal-level nutrition quantity that
*is* validated in the literature — is displayed prominently and **contributes
nothing to the score** (`mealScore.ts` never reads it). A diabetic patient is
shown "GL 86 · Élevé · rouge" and "A · Excellent" on the same screen.

*Partial mitigation exists and I verified it fires:* `scan-result.tsx:1340`
renders a reconciliation line when `glBand === 'high'` and `giTone !== 'high'`.
It explains the divergence in words. It does not change the letter.

**N-2 (HIGH) — fat is not scored at all, so 100 g of olive oil is "A ·
Excellent".** 884 kcal, 100 g fat → only the `calories > 800` penalty (−8) → 92.
Confirmed by `mealScore.ts`: no `m.fat` term exists anywhere in the function.
The 0-kcal empty plate is correctly withheld by the evidence gate; **the pure-fat
plate is not, because it has energy.** For a type-2 / prediabetic audience this
is a clinically wrong message.

**N-3 (NORMAL) — a missing sodium scores *better* than a healthy one.** 2400 mg
→ 97; the same meal with sodium absent → 100. `(m.sodium ?? 0) > 1000` treats
absence as 0. Confirms D12 with numbers.

**N-4 (NORMAL) — letter and word disagree in 80–84.** Score 84 → letter **A**,
word **"Good"**. Confirms D10.

**N-5 (NORMAL) — GI 70 is "high" on the chip and "moderate" to the score.**
Verified: GI 70 → score 90 (−10); GI 71 → 78 (−22); `giBand(70) === 'high'`.

**N-6 (NORMAL) — the worst possible meal scores 19, not 0.** Maximum total
penalty is 81 (22+22+15+6+8+8). The 0–100 scale never reaches its bottom fifth.

### 6.D GL rounding divergence — **CONFIRMED, two verdicts for one plate**

```
carbs 37.1 · GI 55 → raw GL 20.41
    stored bucket  glycemicLoad() UNROUNDED → "High"
    on-screen tag  glBand(round 20)         → "medium"    ← DISAGREE
carbs 20.4 · GI 100 → raw GL 20.40 → stored "High" / screen "medium"  ← DISAGREE
```
**C-1.** Documented in `glycemic.ts`'s header as known; still live. The journal
badge and the analysis card can label the identical meal differently.

### 6.E GI coverage — **N-7 (HIGH), a genuine methodological error**

When one food on the plate carries no glycemic index:

```
plate: 400 g lentils (GI 32, 80.4 g C) + 100 g unindexed sauce (10 g C)
  app GI = 32          weighted over COVERED carbs only  (correct)
  app GL = 29          computed as GI × TOTAL carbs (90.4) / 100
  independent GL over the carbs the index actually covers = 25.7
```

The index is derived from 89 % of the carbohydrate and then applied to 100 % of
it. That is not "GI × available carbohydrate"; it extrapolates a measured
subset over an unmeasured remainder. The error scales with how much carbohydrate
is unindexed, and it is **not disclosed as an extrapolation** — only the
coverage percentage is shown, in a separate footnote.

### 6.F Assumed index — disclosure verified present

Zero-index plate: `glycemic_index = 0` → `effectiveGi` → `ASSUMED_GI = 55` →
GL 33, bucket "High". At the **data** level `gi_carb_coverage = 0` and
`glycemic_index_estimated = false`, so the stored record does not say the 55 was
assumed. At the **UI** level `scan-result.tsx:1318` shows the coverage footnote
because `giCoveragePct < 100`, and `giKnown = !isAssumedGi(gi)` is false.
**Verdict: disclosed on screen ✅, not disclosed in the stored record ⚠️ (C-11)** —
which matters for the doctor panel and the PDF, which read the record.

### 6.G Internal food database — **energy coherent, identities are not**

Atwater check (4/4/9) across all 60 entries: worst deviation **9.1 %**
(`dattes`), **zero entries above 20 %**. No `sugar > carbs`, no `fibre > carbs`,
all 60 carry a GI. This is a well-maintained table.

**N-8 (NORMAL) — 7 alias collisions map one dish to two different records:**

| Alias | Records | per-100 g | GI |
|---|---|---|---|
| العدس / عدس | `adass` / `adas` | 100.0 vs 85.7 kcal · 13.3 vs 12.6 C | **35 vs 30** |
| اللوبيا / loubia | `loubia` / `loubia_zit` | 106.7 vs 91.4 kcal · 15.0 vs 12.6 C | **40 vs 35** |
| سفة | `seffa` / `seffa_sucree` | 171.4 vs 180.0 kcal · 22.9 vs 26.7 C | **65 vs 60** |
| sfouf / zmita | `sellou` / `zmita` | 440 vs 475 kcal · 36.0 vs 55.0 C | **55 vs 50** |

Which record wins is decided by `matchScore` fuzzy ranking. For `zmita` the
carbohydrate differs by **53 %** — enough to change a bolus. An Arabic-speaking
patient saying "عدس" can get either of two nutrition profiles.

### 6.H AI scan reliability

**NOT TESTED.** Repeatability across photos, lighting, angles and portions
requires live Gemini calls against real images. None were made. What can be
stated from source:

- Detections below `confidence 0.4` are dropped, never invented ✅
- Fuzzy matches below score 35 are treated as misses ✅
- Unmatched foods are kept visible with `nutrition_confidence: 0` and
  `carbs_known: false` — never silently dropped ✅
- The `warn:ai_estimate`, `warn:unmatched`, `warn:carbs_unknown` and
  `warn:implausible` channels all exist and are localized ✅
- `sanitizePer100g` turns an impossible carbohydrate into UNKNOWN rather than
  clamping it — the right choice ✅
- **`GI_BY_CATEGORY` invents an index for any food whose category is known**
  (Rice 70, Bread 70, Legumes 32…). It is flagged `glycemic_index_estimated`, so
  it is disclosed — but it means most plates carry a **category prior presented
  as the plate's index**. This is the substance of clinical blocker **D-1**.

**The uncertainty question the brief asks — "does the app present an AI estimate
as an objectively measured fact?" — answers NO for provenance and YES for
precision.** Values are labelled by source and estimated-ness throughout, which
is genuinely good. But they are rendered to 0.1 g and the score to a whole
number out of 100, and false precision on an estimate reads as measurement.
**E-3 (product decision).**

---

## 7 · CLINICAL SAFETY AUDIT — INDEPENDENT BOLUS VALIDATION

### 7.A Method

I wrote a reference implementation from the pump-therapy bolus-calculator
convention (Walsh; Scheiner), **not** from the application:

```
mealBolus  = carbs / ICR
correction = (BG − target_mid) / ISF,  only when BG > target_high
IOB        = Σ dose_i × (1 − t_i / DIA)                (linear)
dose       = (mealBolus + correction) × adjustment_factors − IOB
```
IOB is subtracted **last**, because it is insulin already in the body — a
quantity, not a requirement to be re-scaled by an exercise or illness factor.

I then ran 35 cases through the real `computeSmartBolus` and compared against
both my reference **and** the app's own documented arrangement.

### 7.B Result

```
cases = 35
mismatch with the app's OWN documented model : 0
divergence from the pump-therapy convention  : 6
```

**Every one of the 6 divergences has the same cause: `bolusEngine.ts:675` places
the IOB subtraction inside the bracket, so every multiplicative factor scales it
too.**

### 7.C The 35-case matrix

| ID | Case | App | Convention | Δ | Safety note |
|---|---|---|---|---|---|
| B01 | BG 120 + 60 g | 6.0 | 6.0 | 0 | ✅ |
| B02 | HYPO BG 60 + 60 g | 0.0 | 0.0 | 0 | ✅ hypo flag raised |
| B03 | BG == targetLow 70 | 6.0 | 6.0 | 0 | ✅ boundary is `<`, not `<=` |
| B04 | BG 69.9 | 0.0 | 0.0 | 0 | ✅ hypo |
| B05 | BG 250 + 60 g | 8.5 | 8.5 | 0 | ⚠️ **`highBG` NOT flagged at exactly 250** (`> 250`) — **C-3** |
| B06 | BG 400 + 60 g | 11.5 | 11.5 | 0 | ✅ |
| B07 | correction only, BG 250 | 2.5 | 2.5 | 0 | ✅ |
| B08 | 3 g meal | 0.3 | 0.3 | 0 | ✅ |
| B09 | 150 g meal | 15.0 | 15.0 | 0 | ✅ |
| B10 | carbs UNKNOWN + BG 250 | 2.5 | 2.5 | 0 | ✅ flagged `carbsUnknown`, no meal bolus |
| B11 | no glucose + 60 g | 6.0 | 6.0 | 0 | ✅ flagged `noGlucose` |
| B12 | no profile → fallback ICR | 6.0 | 6.0 | 0 | ⚠️ dose from parameters the patient never entered (**D-2**) |
| B13 | no ISF → fallback 50 | 2.5 | 2.5 | 0 | ⚠️ same |
| B14 | IOB 3.0 U, no factors | 3.0 | 3.0 | 0 | ✅ arrangements agree |
| B15 | insulin older than DIA | 6.0 | 6.0 | 0 | ✅ |
| B16 | IOB 17.5 U > requirement | 0.0 | 0.0 | 0 | ⚠️ floors at 0; surplus not surfaced (RU-11 Q3) |
| **B17** | **IOB 3 U + exercise 0.75** | **2.3** | **1.5** | **+0.8** | 🔴 **more insulin during exercise** |
| B18 | IOB 3 U + sick 1.15 | 3.5 | 3.9 | −0.4 | 🟠 under-doses when needs are raised |
| B19 | IOB 3 U + stress 1.1 | 3.3 | 3.6 | −0.3 | 🟠 same direction |
| B20 | IOB 3 U + alcohol | 3.8 | 3.5 | +0.3 | 🔴 alcohol = elevated hypo risk |
| B21 | PREMIX 12 U, 30 min ago | 6.0 | 6.0 | 0 | 🔴 `iob = 0`; **disclosed** ✅ but dose unchanged |
| B22 | 3 rapid doses, IOB 6 U | 0.0 | 0.0 | 0 | ✅ |
| B23 | BG 180 (at gate) | 0.0 | 0.0 | 0 | ⚠️ step discontinuity |
| B24 | BG 181 | 1.1 | 1.1 | 0 | ⚠️ 0 → 1.1 U for 1 mg/dL (**D-4**) |
| B25 | 63.4 g decimal | 6.3 | 6.3 | 0 | ✅ |
| **B26** | **BG "5.6" typed as mg/dL** | **0.0** | 0.0 | 0 | 🔴 **engine accepts it; no guard on this screen — B-4** |
| B27 | BG 5.6 mmol/L declared | 6.0 | 6.0 | 0 | ✅ → 100.9 mg/dL |
| B28 | BG 900 mg/dL | 15.5 | 15.5 | 0 | 🔴 no physiological bound (**D-3**) |
| B29 | 5000 g carbs | 20.0 | 20.0 | 0 | ✅ capped, flagged, raw 500 reported |
| B30 | exactly 20 U | 20.0 | 20.0 | 0 | ✅ not flagged (cap is `>`) |
| B31 | falling trend −1.7 | 5.4 | 5.4 | 0 | ✅ |
| B32 | negative ISF −50 | 2.5 | 2.5 | 0 | ✅ rejected → fallback, disclosed |
| B33 | inverted target 200..80 | 2.5 | 2.5 | 0 | ✅ rejected → fallback, disclosed |
| B34 | IOB 3 + exercise + sick | 2.6 | 2.2 | +0.4 | 🔴 compounding |
| **B35** | **BG 300 · 60 g · IOB 7.5 · exercise** | **1.5** | **0.0** | **+1.5** | 🔴 **worst realistic case** |

**B35 is the finding that matters.** A patient at 300 mg/dL who has 7.5 U still
active and has just exercised intensely: the app recommends **1.5 U**; the
convention recommends **0 U**. Exercise and stacked insulin are the two largest
drivers of post-meal hypoglycaemia, and the arrangement adds insulin in exactly
that state.

**This is not a new discovery** — it is P7-002, pinned by
`tests/clinical/ru11Baseline.golden.test.ts`, awaiting RU-11 Q1–Q3. What is new
is the independently derived magnitude in a realistic clinical scenario.

### 7.D IOB decay — independently recomputed

```
t=  0 min  engine=10.000  independent=10.000  MATCH
t= 30 min  engine= 8.750  independent= 8.750  MATCH
t= 60 min  engine= 7.500  independent= 7.500  MATCH
t=120 min  engine= 5.000  independent= 5.000  MATCH
t=180 min  engine= 2.500  independent= 2.500  MATCH
t=239 min  engine= 0.000  independent= 0.042  DIFFER  ← doses ≤0.05 U dropped
t=240 min  engine= 0.000  independent= 0.000  MATCH
```
**C-4 (NORMAL)** — the `remaining > 0.05` filter is a deliberate noise floor, not
a defect, but it is undocumented as a clinical choice.
Trend: engine `−1.6667`, independent `−1.6667` — **MATCH**.

### 7.E B-4 — the guard that was never extended to the dosing screen

`bolusEngine.ts:86–107` documents `MIN_TYPED_MGDL` and states the rule is
extended "to the surface that lacked it", with "The screen asks them to confirm
in mg/dL instead."

**It was not.** `isPlausibleTypedMgdl` and `looksLikeMmol` are imported in
exactly one screen — `log-glucose.tsx:11–12`. The **bolus calculator**
(`bolus.tsx`) parses its glucose field with `parseDecimal` and hands it straight
to the engine with `glucoseUnit: 'mg/dL' as const` (`bolus.tsx:207`). No
plausibility check, no mmol suggestion, no warning.

**Consequence.** A patient who thinks in mmol/L and types their real 18.0 into
the *bolus* screen is read as 18 mg/dL → hypo → **0 U**, when they actually need
a substantial correction for 324 mg/dL. The refusal direction is safe; the
*silence* is not — they are told they are hypoglycaemic when they are severely
hyperglycaemic.

### 7.F Clinical rules register

| Rule | Source | Implementation | Test coverage | Patient-facing | Doctor-facing | **Clinical status** |
|---|---|---|---|---|---|---|
| `mealBolus = carbs / ICR` | established | `bolusEngine.ts:578` | ✅ 181 fixtures | dose | PDF | **MATHEMATICALLY CONSISTENT** · clinically established |
| `correction = (BG − mid)/ISF` | established | `:582` | ✅ | dose | PDF | **MATHEMATICALLY CONSISTENT** · gate at `> targetHigh` is a **HEURISTIC — NOT CLINICALLY VALIDATED** |
| IOB linear, `DIA = 4 h` | simplification | `:463` | ✅ | dose | — | **HEURISTIC** — real rapid-analog action is curvilinear. **EVIDENCE NOT FOUND for linear + 4 h in this population — CLINICAL REVIEW REQUIRED** |
| **IOB subtracted inside the bracket** | none | `:675` | ✅ pinned as known-bad | dose | — | 🔴 **EVIDENCE NOT FOUND — CLINICAL REVIEW REQUIRED (D-2)** |
| Premix excluded from IOB | data-model limit | `:467` | ✅ + disclosure | disclosed | — | 🔴 **CLINICAL REVIEW REQUIRED** |
| Exercise 0.92/0.85/0.75 | plausible | `:627` | ✅ | dose | — | **HEURISTIC — NOT CLINICALLY VALIDATED** |
| Duration scaling ×0.6/×1.3, cap 0.35 | none | `:648` | ✅ | dose | — | **HEURISTIC — NOT CLINICALLY VALIDATED** |
| Planned == completed sport | none | `:652` | ✅ pinned | dose | — | 🔴 **CLINICAL REVIEW REQUIRED** |
| Sick 1.15 / stress 1.10 / status 1.08 | plausible | `:590–598` | ✅ | dose | — | **HEURISTIC — NOT CLINICALLY VALIDATED** |
| Alcohol: correction ÷2 **and** ×0.9 | none | `:601–604` | ✅ | dose | — | 🔴 **compound, unratified — CLINICAL REVIEW REQUIRED** |
| Trend ±10 % at ∓1/+2 mg/dL/min | plausible | `:664` | ✅ | dose | — | **HEURISTIC** |
| Hypo guard `BG < targetLow` → 0 | established | `:686` | ✅ | dose | — | **clinically established** ✅ |
| `MAX_SAFE_BOLUS = 20 U` | none | `:35` | ✅ | dose | — | **HEURISTIC — EVIDENCE NOT FOUND** |
| Fallbacks 10 g/U · ISF 50 · 70–180 | app defaults | `:68–71` | ✅ | dose | — | 🔴 **produces an injectable number for a patient who entered nothing — POLICY DECISION REQUIRED** |
| `MIN_TYPED_MGDL = 20` / `MAX 900` | internal | `:108–112` | ✅ 14 fixtures | refusal | — | **HEURISTIC** — and **not applied on the bolus screen (B-4)** |
| No physiological glucose bound | — | absent | ✅ pinned | 900 accepted | counted in stats | 🔴 **D-3** |
| `ASSUMED_GI = 55` | heuristic | `glycemic.ts:86` | ✅ | GL | PDF | **HEURISTIC — NOT CLINICALLY VALIDATED** |
| Carb-weighted mean GI for a mixed plate | contested | `engine.ts:514` | ✅ | GI card | PDF | 🔴 **D-1 — the foundational question** |
| GL bands 10/20 | single-serving derived | `glycemic.ts:106` | ✅ | tag | — | **applied to whole plates — NOT VALIDATED for that use** |
| `scoreMeal` weights | none published | `mealScore.ts` | ✅ 31 fixtures | score/letter | panel | 🔴 **D-5 — no validated per-meal diet-quality index exists** |
| Rule-of-15 hypo first aid | standard | `emergency.tsx` | locale parity only | **emergency instructions** | — | 🔴 **D-6 — code carries `TODO(medical-review)`** |

**The distinction the brief demanded, stated plainly:**
the bolus engine is **MATHEMATICALLY CONSISTENT** (35/35 against its own model).
It is **NOT CLINICALLY VALIDATED**. Passing 181 unit fixtures establishes the
first and says nothing about the second.

---

## 8 · DATA CONSISTENCY AUDIT

| Quantity | Divergence found | Where | ID |
|---|---|---|---|
| Glycemic load band | stored bucket (unrounded) vs screen tag (rounded) → "High" vs "medium" at GL 20.0–20.5 | `glycemicLoad` vs `glBand` | **C-1** |
| GI verdict | chip "high" at 70; score treats 70 as moderate | `giBand` vs `scoreMeal` | **N-5** |
| GI warning threshold | engine warns at `> 65`; chip band at `≥ 70` | `engine.ts:562` vs `giBand` | **C-12** |
| Score bands | 4 disagreeing sets: word 85/70/50 · letter 80/65/50/35 · barcode 70/50 · panel 70/45 | 4 sites | **N-4 / D10** |
| Indicator name | "Indice GluciAI" (strip) vs "Repère GluciAI" (ring), same number | `analysis.*` | **E-7** |
| **Reminder language** | screen shows it translated; the OS notification arrives in French | `getPlannedReminders(t)` vs `refreshSmartReminders()` | 🔴 **B-2** |
| Nutrition for one dish name | `عدس` → two records, GI 35 vs 30, carbs ±6 % (`zmita` ±53 %) | `moroccanFoods.ts` | **N-8** |
| Assumed-GI disclosure | shown on the analysis screen; **not in the stored record** the panel and PDF read | `engine.ts:528` | **C-11** |
| Floor vs total | patient screens enforce `carbs_known`; the doctor-facing surfaces do not | per `CONSISTENCY-CONTRADICTIONS.md` | **carried forward, not re-verified** |
| Per-day denominator | averages divide by days-with-data, not window length | `reportStats.ts` | **E-1 / R1** |
| Partial-day charting | today is in the printed totals but not in the chart | `reportStats.ts` | **E-2 / R2** |

**Not re-verified in this audit:** the 26-item register in
`CONSISTENCY-CONTRADICTIONS.md`. I verified the items above independently;
the remainder are carried forward on the previous audit's authority and are
flagged as such rather than re-asserted.

---

## 9 · i18n / RTL AUDIT

### 9.1 What is correct — and it is a lot

```
fr 2153 · en 2153 · de 2153 · ar 2153 keys
en vs fr: missing 0, extra 0
de vs fr: missing 0, extra 0
ar vs fr: missing 0, extra 0
empty values: none in any locale
```
**Perfect parity.** Values identical to French: en 69, de 30, ar 5 — I inspected
these and they are legitimate cognates and proper nouns (`Bolus`, `Normal`,
`Portion`, `Profil`, `Biologie`, `Galerie`, `HbA1c`, `GluciAI`), not
untranslated strings. Notification de-duplication by `kind` rather than by
rendered title is correctly implemented.

### 9.2 B-2 (HIGH) — scheduled notifications are French-only

`src/services/notifications.ts` has **two** reminder paths:

| Function | Purpose | Localized? |
|---|---|---|
| `getPlannedReminders(t?)` — line 61 | what the **Rappels screen previews** | ✅ takes `t`, falls back to French |
| `refreshSmartReminders()` — line 136 | what **actually schedules the OS notification** | ❌ **no `t` parameter at all** |

Hardcoded in the scheduling path:
```
notifications.ts:167  'Contrôle glycémie 🩸'
notifications.ts:170  "Pensez à mesurer votre glycémie aujourd'hui."
notifications.ts:200  'Petit-déjeuner 🍽️'
notifications.ts:201  "N'oubliez pas de scanner votre petit-déjeuner…"
notifications.ts:211  'Jetez un œil à votre journée : glycémie, repas et injections.'
```
Called from `(tabs)/_layout.tsx` on every entry into the tab stack.

**A German or Arabic patient sees the reminder translated in the app and
receives it in French on their lock screen.** Scheduling is unavailable on web,
so this is **Android/iOS-only** — again invisible to the web review.

### 9.3 RTL

| Check | Result |
|---|---|
| `isRTL()` used for per-screen logic | ✅ 20+ screens |
| Web direction | ✅ `document.documentElement.dir` set live |
| **Native direction** | ❌ **B-1 — `forceRTL` without restart** |
| Physical vs logical edges | ⚠️ 223 physical (`marginLeft`, `paddingRight`, `left:`) vs 12 logical (`marginStart`/`End`) |
| `textAlign: 'left'` | ❌ **C-6** — `foods.tsx:330`; RN does not mirror this value |
| `textAlign: 'right'` deliberate | ✅ 5 sites, all numeric columns; `emergency.tsx:369` explicitly handles `ar` |
| Chevrons | ✅ direction-aware (commit `94b6519`) |
| Charts / PDF / notifications in RTL | **NOT TESTED** |

The 223 physical edges are a **risk**, not a proven defect — Yoga's RTL handling
of physical edges differs between React Native and react-native-web, and the
difference can only be settled on a device. Given that **B-1 means native RTL
has probably never rendered at all**, none of these has been seen in RTL.

### 9.4 Medical strings in ar/de/en

`emergencyPage.hypoStep1–4` — the rule-of-15 instructions — exist in all four
locales and are **unverified translations of medical instructions**. The source
says so itself (`emergency.tsx:151`, the only TODO in the codebase). **D-6.**

---

## 10 · SECURITY / PRIVACY AUDIT

Only exploitable or materially relevant items. Theoretical noise excluded.

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **S-1** | 🔴 **Critical** | Any authenticated user can `UPDATE` any unverified `product_catalog` row — name and every macro. Those values reach the barcode scanner → carbohydrate → bolus field. | live `pg_policy`: `using (NOT verified)`, no ownership predicate. Fix exists (`0033`), unapplied. = **A-2** |
| **S-2** | 🔴 **Critical** | `upsert_product` is `SECURITY INVOKER` with the `p_source='user'` override branch and never updates `source` on conflict → a user-rewritten row keeps an authoritative label the client trusts. | live `pg_proc`. = **A-3** |
| **S-3** | 🟠 High | Database accepts clinically impossible values: negative carb ratio, zero/negative ISF, negative calories/carbs/confidence. | `pg_constraint` — `0031`/`0032` unapplied. = **A-4** |
| **S-4** | 🟡 Medium | Leaked-password protection (HaveIBeenPwned) **disabled** on a health-data account system. | `get_advisors` |
| **S-5** | 🟡 Medium | `usage_status`, `touch_last_seen`, `my_usage_status` are `SECURITY DEFINER` and callable by `anon` via `/rest/v1/rpc/*`. (`is_admin`/`is_doctor`/`is_my_patient` are a *documented, correct* exception.) | `get_advisors` |
| **S-6** | 🟡 Medium | Repo is **public** (`githubRepoVisibility: "public"`), so `/panel-x7k42m/` provides no obscurity. Admin access does rely on RLS + `is_admin()`, so this is defence-in-depth loss, not a breach — **but it must not be counted as a control**. | Vercel deployment metadata |

**What is genuinely well done — verified, not assumed:**

- **No service-role key, AI key or private credential in any tracked file.**
  I ran a pattern scan for `sk-*`, `AIza*`, service-role JWTs and Supabase
  secret keys across the whole git index. The only JWT found is the **anon**
  key in `public/panel-x7k42m/app.js:10` — publishable by design and protected
  by RLS. `.env*` is gitignored; `.mcp.json` is gitignored.
- **`src/lib/observability.ts` is exemplary.** Sensitive keys redacted by broad
  substring match, JWT/Bearer/Supabase-host patterns stripped from free text,
  identity deleted outright, navigation breadcrumbs carrying a query string
  dropped entirely (because `/program` carries body weight in params),
  `tracesSampleRate: 0` for the same reason, and the whole layer is pure so it
  is unit-tested in CI. Sentry is **disabled** (no DSN) so nothing is
  transmitted today.
- **`bolusHandoff.ts`** keeps a dose input out of the URL and off disk.
- **CI isolation** — `ci-database.yml` declares no secrets and can only reach a
  local stack. Correct.

**C-9 (NORMAL) — account deletion may orphan stored files.**
`delete-account/index.ts:45` calls `admin.auth.admin.deleteUser(uid)` and relies
on `ON DELETE CASCADE` for `public.*`. It does **not** delete Storage objects —
profile avatars and meal photos. Under GDPR erasure and App Store §5.1.1(v),
"delete my account" should remove the images too. **Not verified against live
Storage** (that would require deleting a real account).

---

## 11 · PERFORMANCE / RELIABILITY

| Area | Finding |
|---|---|
| AI retry storms | ✅ well-controlled — bounded 3 attempts, jittered backoff, provider `retryDelay` honoured ≤ 8 s, non-retryable statuses excluded |
| Provider resilience | ✅ `resilient()` wraps every nutrition provider: per-provider timeout, one retry, never throws |
| Provider chain latency | ⚠️ up to 5 sequential providers per food; early-exit only at score ≥ 90 **and** confidence ≥ 0.9. A 6-food plate can serialise many round trips. **NOT MEASURED** |
| Match cache | ✅ per-100 g, portion-independent, persisted at score ≥ 70 |
| Large images | ✅ `expo-image-manipulator` present; **compression settings NOT VERIFIED** |
| Duplicate requests | ✅ idempotent offline queue (Step 14) |
| Bundle size | `dist/` present; **NOT MEASURED** |
| Startup / cold start | **NOT MEASURED** |
| Unnecessary renders | React Compiler enabled (`experiments.reactCompiler: true`) ✅ |
| Service worker | ✅ pure passthrough, no caching — cannot serve stale API data |
| **Crash visibility in production** | ❌ **G-5** — Sentry disabled (no DSN) **and** `SENTRY_DISABLE_AUTO_UPLOAD: "true"` in both `preview` and `production`, so even if enabled, stack traces would be unsymbolicated. A medical app is shipping with **no crash telemetry at all**. |

---

## 12 · RELEASE AUDIT

| System | Expected | Actual | Verdict |
|---|---|---|---|
| GitHub | `main` pushed | `main == origin/main`, nothing ahead | ✅ **B-17 RESOLVED** |
| Vercel | production = HEAD | `43da9f1`, READY, 2026-08-09T19:46Z | ✅ **B-15 RESOLVED** |
| Supabase — Edge Functions | Step-15 code live | v2 / v6 / v42 @ 19:57Z; `food-search` verified by source | ✅ **B-16 RESOLVED** (1 of 3 by content) |
| **Supabase — migrations** | **33 applied** | **29 applied** | ❌ **A-1 — NEW CRITICAL** |
| Supabase — `lab-analyze` | tmp entrypoint | **local macOS path** | ⚠️ **G-9** |
| Android — APK | exists | `115139b3-…`, 157.6 MB, **not device-validated** | ⚠️ **F-1** |
| Android — target SDK | Play-compliant | **cannot be read from the repo** | ⚠️ **G-4** |
| iOS — build | any | **impossible** | ❌ **G-1** |
| OTA update path | some | **none** — `expo-updates` absent, channels inert | ⚠️ **G-6 / E-6** |
| Crash telemetry | on | **off** | ⚠️ **G-5** |
| Store listing / privacy labels | prepared | **nothing in repo** | ❌ **G-7** |
| Export compliance | declared | absent | ❌ **G-2** |
| Production drift detection | some | **none** | ❌ **G-8 — root cause of A-1** |

---

## 13 · ALL BUGS FOUND (NEW THIS AUDIT)

Format: **ID · SEVERITY · AREA · FILE · DESCRIPTION · EVIDENCE · REPRO · STATUS ·
TEST COVERAGE · RELEASE IMPACT · NEXT ACTION · OWNER**

### A — CRITICAL

**A-1 · A · Backend/release · `supabase/migrations/0030–0033`**
Four migrations exist in the repo and have never been applied to production.
*Evidence:* `list_migrations` → 29 rows; repo → 33 files.
*Repro:* deterministic. *Status:* OPEN. *Tests:* local CI only — no production
check exists. *Impact:* **blocks release.** *Next:*
`npx supabase --workdir glucoai db push` after reviewing `0030` (it re-grants
privileges; confirm parity with the hosted ACLs first). *Owner:* **DEVOPS**

**A-2 · A · Security/RLS · production `product_catalog_update`**
Policy is `using (NOT verified) with check (NOT verified)` — no ownership
predicate. Any authenticated patient can rewrite any unverified catalogue row,
including `carbs`, which reaches the bolus field.
*Evidence:* live `pg_policy` query, this audit. *Repro:* a single REST `PATCH`.
*Status:* OPEN, **exploitable now**. *Tests:* `tests-security/rls/` exist but
**could not run** (E4). *Impact:* **blocks release.** *Next:* apply `0033`.
*Owner:* **DEVOPS / ENGINEERING**

**A-3 · A · Security · production `upsert_product`**
`SECURITY INVOKER`, retains the `p_source='user'` override branch, never updates
`source` on conflict → provenance laundering (N-13).
*Evidence:* live `pg_proc`. *Status:* OPEN. *Next:* apply `0033`.
*Owner:* **DEVOPS**

### B — HIGH

**B-1 · B · Android+iOS / i18n · `src/i18n/index.ts:35`**
`I18nManager.forceRTL()` with no reload, no `expo-updates`, no restart prompt →
Arabic renders LTR on native until the app is manually killed.
*Evidence:* source; `expo-updates` absent from `node_modules`; no restart string
in any locale. *Repro:* switch to Arabic on a device. *Status:* OPEN.
*Tests:* none. *Impact:* **Arabic is effectively broken on both stores.**
*Next:* install `expo-updates` and call `Updates.reloadAsync()`, or show a
blocking "restart required" dialog. *Owner:* **ENGINEERING**

**B-2 · B · Android+iOS / i18n · `src/services/notifications.ts:167,200,211`**
`refreshSmartReminders()` schedules OS notifications with hardcoded French while
`getPlannedReminders(t)` previews them translated.
*Evidence:* source, both functions. *Repro:* set de/ar, wait for a reminder.
*Status:* OPEN. *Tests:* none. *Impact:* high — patient-facing, store-visible.
*Next:* pass `t` into `refreshSmartReminders`, key the five strings.
*Owner:* **ENGINEERING**

**B-3 · B · Android+iOS / permissions · `scan.tsx:445` (+3 sites)**
No recovery from a permanently denied camera permission; `Linking.openSettings`
appears **nowhere** in the codebase.
*Evidence:* zero grep matches across `src/`. *Repro:* deny twice on Android /
once on iOS. *Status:* OPEN. *Tests:* none. *Impact:* scanner permanently dead
for affected users. *Next:* when `!canAskAgain`, replace the button with
`Linking.openSettings()`. *Owner:* **ENGINEERING**

**B-4 · B · Clinical safety · `src/app/bolus.tsx:207`**
The typed-glucose plausibility guard exists only on `log-glucose`. The bolus
screen's own glucose field has none, contradicting `bolusEngine.ts:86–107`.
*Evidence:* grep — `isPlausibleTypedMgdl` imported in 1 screen; case B26.
*Repro:* type `18` into the bolus glucose field. *Status:* OPEN.
*Tests:* engine-level only. *Impact:* a hyperglycaemic patient is told they are
hypoglycaemic. *Next:* reuse `log-glucose`'s guard on `bolus.tsx`; correct the
engine comment. *Owner:* **ENGINEERING** (wording: **CLINICAL**)

**B-5 (=N-2) · B · Nutrition · `src/services/nutrition/mealScore.ts`**
Fat is not scored at all → 100 g of olive oil = 92/100, grade **A**,
"Excellent"; a 900 kcal / 80 g-fat meal = 97/A.
*Evidence:* §6.C matrix. *Repro:* deterministic. *Status:* OPEN.
*Tests:* `nutritionClaims` pins the current behaviour. *Impact:* clinically
wrong message. *Next:* **D-5** decision (D1/D2). *Owner:* **CLINICAL → ENGINEERING**

**B-6 (=N-7) · B · Nutrition · `src/services/nutrition/engine.ts:668`**
GL is computed as `GI × TOTAL carbs / 100` while `GI` is weighted over covered
carbs only — extrapolating a measured subset over an unmeasured remainder,
undisclosed as such.
*Evidence:* §6.E — app GL 29 vs 25.7 over covered carbs. *Status:* OPEN.
*Next:* either restrict GL to covered carbs, or state the extrapolation.
*Owner:* **CLINICAL → ENGINEERING**

### C — NORMAL

| ID | Area | File | Description | Owner |
|---|---|---|---|---|
| C-1 | Consistency | `interpret/glycemic.ts:121,133` | stored bucket unrounded vs screen tag rounded → "High" vs "medium" at GL 20.0–20.5 | ENGINEERING |
| C-3 | Clinical | `bolusEngine.ts:584` | `highBG` gate is `> 250`, so exactly 250 is unflagged | CLINICAL |
| C-4 | Clinical | `bolusEngine.ts:472` | IOB doses with `remaining ≤ 0.05 U` silently dropped; undocumented as a clinical choice | CLINICAL |
| C-6 | RTL | `foods.tsx:330` | `textAlign: 'left'` does not mirror in RTL | ENGINEERING |
| C-7 | Android+iOS | `app.json` / `geminiLive.ts:423` | mic permission declared for a voice feature that is **web-only** | PRODUCT + ENGINEERING |
| C-8 | Backend | `recipe_meta` | RLS enabled, zero policies — fails closed, almost certainly unintended | ENGINEERING |
| C-9 | Privacy/store | `delete-account/index.ts:45` | account deletion does not remove Storage objects (avatars, meal photos) | ENGINEERING |
| C-10 | Backend | `touch_updated_at` | `SECURITY DEFINER`-adjacent function without `set search_path` | ENGINEERING |
| C-11 | Consistency | `engine.ts:528` | assumed-GI disclosed on screen but **not in the stored record** the panel/PDF read | ENGINEERING |
| C-12 | Consistency | `engine.ts:562` vs `giBand` | engine warns at GI `> 65`; the chip band starts at 70 | CLINICAL |
| N-3 | Nutrition | `mealScore.ts:136` | a **missing** sodium scores better (100) than a healthy one (97) | CLINICAL |
| N-4 | Consistency | `mealScore.ts:59,148` | score 80–84 → letter **A**, word **"Good"** | PRODUCT |
| N-5 | Consistency | `mealScore.ts:104` | GI 70 = "high" on the chip, "moderate" to the score | CLINICAL |
| N-6 | Nutrition | `mealScore.ts` | worst achievable score is 19; the scale never reaches its bottom fifth | PRODUCT |
| N-8 | Data | `moroccanFoods.ts` | 7 alias collisions → one dish name, two nutrition profiles (`zmita` carbs differ 53 %) | ENGINEERING |

---

## 14 · PREVIOUS FINDINGS — VERIFIED STATUS

### Verified RESOLVED (the blocker document is wrong)

| Doc claim | Reality | Evidence |
|---|---|---|
| **B-15** "Vercel undeployed — the most consequential undeployed item" | **DEPLOYED** — production = `43da9f1` = HEAD | Vercel API, 2026-08-09T19:46Z |
| **B-16** "`nutrition-search` v1, `food-search` v5, `ai-chat` v41 run pre-Step-15 code" | **DEPLOYED** — v2 / v6 / v42 at 19:57Z; `food-search` source contains the `callerUserId` guard | Supabase API + source fetch |
| **B-17** "4 commits exist only on this machine" | **PUSHED** — `git log origin/main..main` is empty | git |

### Verified STILL OPEN

| ID | Finding | Verification |
|---|---|---|
| P7-002 | IOB scaled by every factor | ✅ reproduced, quantified at **+1.5 U** in B35 |
| P7-011 | Premix contributes nothing to IOB | ✅ reproduced (B21); disclosure present, dose unchanged |
| P7-010 | Correction is a step, not a ramp | ✅ reproduced (B23/B24): 180 → 0 U, 181 → 1.1 U |
| P7-004 | Meal windows / snack borrows lunch ratio | ✅ pinned in fixtures, unchanged |
| P7-003 | Fallback parameters still produce an injectable dose | ✅ reproduced (B12/B13) |
| RU-2 | No physiological glucose bound | ✅ reproduced (B28): 900 mg/dL → 15.5 U |
| D10 | Four disagreeing band sets | ✅ reproduced (N-4) |
| D12 | Absent sodium reads as 0 | ✅ reproduced with numbers (N-3) |
| D18 | Load shown when no index is known | ✅ reproduced; **disclosed on screen**, not in the record (C-11) |

### Doc claim contradicted by production

| Doc claim | Reality |
|---|---|
| `FINAL-BLOCKER-PACK.md` B-10: *"The write boundary itself was closed by migration 0033."* | **`0033` is not applied.** The boundary is open. (A-2) |
| `bolusEngine.ts:86–107`: the typed-mgdl rule *"extends it to the surface that lacked it"* | **The bolus screen still lacks it.** (B-4) |

---

## 15 · UNRESOLVED BLOCKERS

### D — Clinical / safety (a specialist must answer; engineering must not)

| ID | Question | Quantified impact |
|---|---|---|
| **D-1** | May a carbohydrate-weighted mean of GI values — many of them category estimates — describe a mixed plate? | Every GI/GL surface. **Ask first**: a "no" deletes the composite and cancels planned work. |
| **D-2** | RU-11 Q1–Q14, the dosing arrangement. | **B35: 1.5 U vs 0 U.** B17 +0.8 U, B18 −0.4 U, B34 +0.4 U |
| **D-3** | Is there a glucose value beyond which a reading must not be treated as real? | B28: 900 mg/dL → 15.5 U, and it enters every report statistic |
| **D-4** | Should the correction ramp instead of stepping at `targetHigh`? | 180 → 0 U, 181 → 1.1 U |
| **D-5** | RU-3 D1–D20, the scoring model. | **N-1** (GL 86 → "Excellent"), **N-2** (pure fat → A), N-3, N-4, N-5, N-6 |
| **D-6** | Are the rule-of-15 hypo steps correct in ar/de/en? | Instructions followed during a hypoglycaemic episode. `emergency.tsx:151` |

### E — Product decisions

E-1 per-day denominator (R1) · E-2 partial-day charting (R2) · E-3 precision and
uncertainty display on estimates · E-4 day-badge vocabulary (D13) · E-5 score in
the doctor report · E-6 `expo-updates` / OTA · E-7 one name for one indicator
(S3-1) · E-8 subscription: `subscription.tsx` exists with no IAP module —
decide whether v1 ships paid.

### F — Device verification

**F-1 — 20 Android flows, 0 executed.** **F-2 — 20+5 iOS flows, 0 executed,
build impossible (G-1).** No screenshot, log or recording exists for any flow.

### G — Release / configuration

G-1 Apple Developer Program (blocks iOS) · G-2 export compliance · G-3 privacy
manifest unverified · **G-4 target SDK unverifiable from the repo** · G-5 no
crash telemetry · G-6 no OTA path · G-7 no store listing or privacy labels ·
**G-8 no production drift detection (root cause of A-1)** · G-9 `lab-analyze`
deployed from a local path.

### H — Documentation

H-1 `FINAL-BLOCKER-PACK.md` is wrong about B-15/16/17 (resolved) and about
`0033` (not applied) · H-2 `bolusEngine.ts:86–107` describes a guard the bolus
screen does not have · H-3 no migration/deployment runbook exists, which is how
`0030–0033` were lost · H-4 no `KNOWN-BAD` entry covers the four unapplied
migrations.

---

## 16 · DEVICE TESTS — WHAT IS REQUIRED

**Android (unblocks 20 flows today, no account needed):** a physical Android 13+
device plus one Android 8–9 device, USB debugging, the existing internal APK, a
network-throttling proxy for AF-06/AF-09, and one test account per locale.
Highest value first: **AF-15 (Arabic RTL)**, **AF-13 (bolus unit guard)**,
**AF-04 (permission lockout)**, **AF-17 (notification language)** — those four
are predicted failures and each takes minutes to confirm.

**iOS (blocked):** Apple Developer Program enrolment → link to EAS →
`eas credentials --platform ios` interactively → `eas device:create` with at
least one UDID → `eas build -p ios --profile preview`. Nothing before that is
possible.

---

## 17 · MISSING EVIDENCE

1. RLS/security suite (E4) — never ran; needs `npx supabase start`.
2. All device execution (F-1, F-2).
3. Android target/min/compile SDK (G-4) — needs a prebuild or an EAS build log.
4. iOS privacy manifest and entitlements (G-3) — needs an archive.
5. AI scan repeatability (§6.H) — needs live Gemini calls on real photographs.
6. Deployed source of 10 of 12 Edge Functions — only `food-search` and
   `delete-account` verified by content.
7. Storage-object deletion on account removal (C-9).
8. Startup time, bundle size, image-compression settings, provider-chain latency.
9. The 26-item register in `CONSISTENCY-CONTRADICTIONS.md` — carried forward, not
   independently re-verified.

---

## 18 · CONTRADICTIONS BETWEEN CODE, TESTS, DOCS AND PRODUCTION

1. **Docs say undeployed; production says deployed.** B-15, B-16, B-17 are all
   done. Anyone planning from `FINAL-BLOCKER-PACK.md` today is planning against
   a state that no longer exists.
2. **Docs say a hole is closed; production says it is open.** "The write boundary
   itself was closed by migration 0033" — `0033` has never run. This is the
   inverse error of (1) and the more dangerous one.
3. **Repository says 33 migrations; production has 29.** No document mentions
   this, and no test could catch it: CI verifies only the local stack.
4. **A code comment describes a guard that does not exist on the screen it names**
   (`bolusEngine.ts` vs `bolus.tsx`).
5. **Tests are green and the release is not safe.** 1183/1183 pass, typecheck
   clean, lint ratchet clean, web build clean — while an authorization hole is
   live in production, Arabic does not work on either store target, and no flow
   has run on a phone. *This is the audit's central lesson: the suite pins
   behaviour faithfully and proves nothing about deployment state, device
   behaviour, or clinical validity.*
6. **The same reminder is translated on screen and French in the notification.**
7. **The same meal can be "High" and "medium" glycemic load** depending on which
   surface reads it.

---

## 19 · RECOMMENDED NEXT STEPS, IN ORDER

**Today — no decisions needed, nobody to ask:**
1. **Apply migrations `0030–0033`** — review `0030`'s grants against the hosted
   ACLs first, then `npx supabase --workdir glucoai db push`. This closes A-1,
   A-2, A-3, A-4 / S-1, S-2, S-3 in one action.
2. **Start the local stack and run the security suite** (E4) — it exists and has
   never gated anything.
3. **Add production drift detection** (G-8) — a scheduled job comparing
   `supabase migration list --linked` against the repo. This is the control
   whose absence caused A-1.
4. **Re-deploy `lab-analyze`** from the repository (G-9).
5. **Enable leaked-password protection** (S-4) — one dashboard toggle.
6. **Correct `FINAL-BLOCKER-PACK.md`** on B-15/16/17 and on `0033` (H-1).

**This week — engineering, no clinical input needed:**
7. **B-1** RTL restart — highest patient-visible impact.
8. **B-2** localize `refreshSmartReminders`.
9. **B-3** `Linking.openSettings()` on permanent denial, all 4 sites.
10. **B-4** apply the typed-glucose guard to `bolus.tsx`; fix the engine comment.
11. **C-9** delete Storage objects on account deletion.
12. **N-8** de-duplicate the 7 colliding food aliases.
13. **G-4** run `npx expo prebuild -p android` in a scratch clone and record the
    effective SDK levels.

**Then — run the device pass** (F-1). Start with AF-15, AF-13, AF-04, AF-17.

**In parallel — book one clinical session** covering **D-1 first**, then D-2
(all 14 RU-11 questions together), D-3, D-6 and D-5's D10 + D5. Bring §7.C and
§6.C to it: they are the worked numbers a specialist needs.

**When iOS matters:** G-1, then G-2, G-3, G-7.

---

## 20 · FINAL VERDICT

# NOT READY

**Not** because the code is poor — by most measures it is better than the median
production health app, and the provenance discipline is exceptional.

It is NOT READY because, on the criteria set for this audit:

- ❌ **Critical bugs are unresolved** — three, all from A-1, one of them an
  authorization hole that is live in production right now.
- ❌ **Clinical blockers are unresolved** — six, including the foundational
  mixed-meal GI question and a dosing arrangement quantified here at **1.5 U of
  unjustified insulin in the exercise-plus-stacking case**.
- ❌ **Required device tests have not been executed** — zero of forty.
- ❌ **Release configuration is not verified** — target SDK unknown, iOS
  unbuildable, no crash telemetry, no OTA path, no store listing.
- ❌ **Production deployment state was wrong** — and was documented as something
  other than what it is, in both directions.

**Beta readiness is closer than it looks.** Applying four migrations, fixing four
engineering defects (B-1 to B-4) and running the twenty Android flows would put
this at **BETA READY for Android** — because the arithmetic underneath is sound
and independently verified. What it cannot be, until a diabetologist answers
D-1 through D-6, is a product that tells a patient how much insulin to inject.

---

## SHORT SUMMARY

```
NEW BUGS FOUND:            21   (3 critical · 6 high · 12 normal)
PREVIOUS BUGS STILL OPEN:   9   (all independently reproduced)
PREVIOUS BLOCKERS RESOLVED: 3   (B-15, B-16, B-17 — doc was stale)
CLINICAL BLOCKERS:          6   (D-1 … D-6)
PRODUCT DECISIONS:          8   (E-1 … E-8)
ANDROID TESTS:              0 of 20 executed  (device available, not run)
IOS TESTS:                  0 of 25 executed  (build impossible — G-1)
SECURITY ISSUES:            5   (S-1, S-2 exploitable in production now)
RELEASE ISSUES:             9   (G-1 … G-9)
DOCUMENTATION ISSUES:       4   (H-1 … H-4)

FINAL STATUS:              NOT READY
```

**The single most urgent action:** apply migrations `0030–0033`. An
authorization hole with a written, reviewed, committed fix has been sitting
unapplied in production while every gate in the project reported green.
