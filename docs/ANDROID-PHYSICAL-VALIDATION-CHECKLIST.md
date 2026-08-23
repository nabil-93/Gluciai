# GluciAI — Android Physical-Device Validation Checklist

**Date:** 2026-08-17 · **Build to use:** `65caf89c-…` (SHA `DD24BC95…`), the
backend-configured preview APK · **Account fixture:** create a disposable one; the
previous test accounts were deleted during validation.

**This file contains ONLY items that genuinely require a real Android phone.** Anything
fixable in software has been fixed and lives in
[`PRE-ANDROID-RELEASE-CHECKLIST.md`](./PRE-ANDROID-RELEASE-CHECKLIST.md). If an item here
turns out to be reproducible on an emulator, it belongs in that file instead.

**Why an emulator is not enough.** Documented across sessions 4–7: the emulator dies
15–30 s after GluciAI's process starts (idle emulators survive indefinitely — the control
run is in session 7). Disabling the emulated cameras reduced the failure rate enough for
one ~25-minute run but did not remove it. Cameras are also disabled on that AVD by
construction, so capture is untestable there regardless.

---

## 1 · Notification delivery — the largest gap

Scheduling is already **DEVICE VERIFIED** (session 2: two `RTC_WAKEUP` alarms registered,
times matching the UI). Delivery never has been. Clock manipulation does **not** work —
Android rebases `RTC_WAKEUP` alarms rather than firing them — so these need the phone to
reach the real scheduled time.

| # | Item | How | Expected |
|---|---|---|---|
| 1.1 | Reminder actually arrives | Activate reminders, leave the phone to 09:00 | Notification appears in the shade |
| 1.2 | Title and body | Read the shade entry | Matches `reminders.notify*` for the active language |
| 1.3 | Timestamp and channel | Long-press the notification | Correct time; GluciAI channel |
| 1.4 | **Tap → destination** | Tap a **glucose** reminder | Opens `/glucose` (payload `{kind:'reminder',type:'glucose'}`) |
| 1.5 | Tap → insulin | Tap an **insulin-long** reminder | Opens `/insulin` |
| 1.6 | Tap → breakfast / evening | Tap either | Opens `/(tabs)` — **NO DEDICATED DESTINATION**, by design |
| 1.7 | **Foreground tap** | App open when it fires | Routes without restarting the app |
| 1.8 | **Background tap** | App backgrounded | Routes on resume |
| 1.9 | **Cold-start tap** | Force-stop, then tap when it fires | Routes on launch (`getLastNotificationResponseAsync`) |
| 1.10 | Language at tap time | Schedule in FR, switch to AR, then tap | Destination screen renders in **AR** — text resolves at tap, not at scheduling |

*Routing logic is automated-verified (40 tests); what is unverified is that Android
delivers the notification and hands the response back.*

## 2 · Notification localization at delivery

| # | Item | Expected |
|---|---|---|
| 2.1 | **FR** notification title + body | French, no mixed language |
| 2.2 | **EN** | English |
| 2.3 | **DE** | German |
| 2.4 | **AR** | Arabic, RTL correct in the shade *(in-app AR screen already PASS, session 2)* |
| 2.5 | Language switch → reschedule | Change language, wait for the next fire | New language, no stale text |

## 3 · Camera — untestable on any emulator here

| # | Item | Expected |
|---|---|---|
| 3.1 | Real meal capture | Camera opens, photo taken, sent for analysis |
| 3.2 | Preview geometry | 4:3 sensor shape preserved, no ~40 % crop |
| 3.3 | Gallery import | Real photo selected and analysed |
| 3.4 | **Barcode camera capture** | A real barcode on real packaging is read |
| 3.5 | Poor light / blur | Fails honestly via `scanErrorKey`, never a fabricated result |

*Barcode **lookup** (OFF → UPCitemdb → USDA GTIN) is already backend-verified against
live FDC; only the camera half remains.*

## 4 · OS permission behaviour

Software handling is verified (`permissionAction`, Settings recovery, AF-04 on the
emulator). What needs a phone is the OEM's real dialog sequence.

| # | Item | Expected |
|---|---|---|
| 4.1 | Camera: first prompt | System dialog appears once |
| 4.2 | Camera: deny → re-enter | In-app rationale, not a dead end |
| 4.3 | Camera: **deny twice / "don't ask again"** | Button routes to App info (verified on emulator; confirm on a real OEM build) |
| 4.4 | Notifications: deny | Rappels screen shows the localized denial + Open Settings |
| 4.5 | Grant from Settings → return | App picks up the new permission without a restart |

## 5 · Physical lifecycle

| # | Item | Expected |
|---|---|---|
| 5.1 | Background during a scan | Returns without losing the in-flight analysis |
| 5.2 | OS kills the app under memory pressure | Restores to a sane screen |
| 5.3 | Rotation / fold, if applicable | No layout break |
| 5.4 | Battery-optimisation restrictions | Reminders still fire under OEM battery saver |
| 5.5 | Doze mode overnight | 09:00 reminder still arrives |

## 6 · In-session network loss

Offline **launch** and recovery are already device-verified (session 2). What is missing
is loss *during* an operation.

| # | Item | Expected |
|---|---|---|
| 6.1 | Airplane mode mid-scan | Fails gracefully, offers retry, no corrupted meal |
| 6.2 | Airplane mode mid-sync | No data loss; resumes on reconnect |
| 6.3 | Flaky/2G network | Provider timeout (2 s) + one retry behaves as designed |
| 6.4 | Reconnect | Pending writes reach Supabase |

*Automated network resilience is **VERIFIED** (24 direct tests + mutation-checked); this
row is only about real radio behaviour.*

## 7 · Scanner nutritional accuracy — also needs reference meals

| # | Item | Requirement |
|---|---|---|
| 7.1 | Carbohydrate accuracy | Photograph meals with **independently known** values (lab-analysed or manufacturer-declared) |
| 7.2 | Moroccan dishes | The app's target cuisine specifically |
| 7.3 | Portion estimation | Known weights |

**No reference values may be invented.** Without controlled meals this stays
**UNVERIFIED** whatever the device shows.

## 8 · Hardware-only

| # | Item |
|---|---|
| 8.1 | Biometric unlock, if enabled |
| 8.2 | Performance / thermal on a mid-range phone |
| 8.3 | Battery drain over a normal day |
| 8.4 | Real-device install from the APK |

---

## Not on this list — and why

| Item | Why it is elsewhere |
|---|---|
| Notification payload + routing logic | **Automated-verified**, 40 tests |
| Network timeout / retry / fallback | **Automated-verified**, 24 tests, mutation-checked |
| Localization key coverage | **2240 keys × 4 locales**, automated |
| Account creation lifecycle | **Device + backend verified** (sessions 3/6) |
| Account deletion | **Device + backend verified** (session 6) |
| Barcode lookup | Backend-verified against live FDC |
| Unknown deep link | `+not-found` route added and tested this pass |
| Exercise/insulin dosing | **CLINICAL DECISION REQUIRED** — frozen, not a device question |
