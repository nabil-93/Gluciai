# RU-11 — clinical decision package

**Status: awaiting specialist authorization. Nothing in this document has been
implemented.**

This file exists so that the insulin/IOB work can be authorized **without anyone
guessing a clinical value**. Every number below was read from the running code
and is pinned by a fixture, so a reviewer can check any claim in one command:

```bash
npx vitest run tests/clinical
```

Baseline: `tests/clinical/ru11Baseline.golden.test.ts` (30 fixtures, Step 19B-1),
`tests/clinical/computeIOB.golden.test.ts`, `computeSmartBolus.golden.test.ts`,
`localDoseCheck.golden.test.ts`, `ratioForMeal.golden.test.ts`,
`bolusContract.golden.test.ts`.

**The engine is unmodified.** `bolusEngine.ts` has not been touched since Step 13.

## The assembly, as it runs today

`src/services/bolusEngine.ts:559-568`:

```
mealBolus  = carbsKnown && carbs > 0 ? carbs / gPerU : 0
correction = glucose > targetHigh ? (glucose − targetMid) / isf : 0     // halved first if alcohol
iob        = Σ remaining, rapid doses only, linear decay over DIA_HOURS (4 h)

raw   = (mealBolus + correction − iob)
        × activity × trend × sick × stress × status × alcohol
raw   = max(0, raw)
if glucose < targetLow → raw = 0, flag 'hypo'
total = round(raw, 0.1); if total > 20 → total = 20, flag 'capped'
```

Factor values in force (unchanged, not under review as *values* — only their
placement and interaction are): activity 0.75 / 0.85 / 0.92 (logged) or
1 − reduction (declared, capped at 0.35) · trend 0.9 falling, 1.1 rising · sick
1.15 · stress 1.1 · injured-or-paused 1.08 · alcohol 0.9.

---

## 1. P7-002 — factor placement vs the IOB deduction  🔴 release blocker #6

| | |
|---|---|
| **Current rule** | `raw = (mealBolus + correction − iob) × f`, where `f` is the product of all six factors |
| **Alternative** | `raw = (mealBolus + correction) × f − iob` |
| **Difference** | exactly `iob × (1 − f)` |
| **Can change a dose** | **YES**, both directions |
| **Depends on** | P7-011 (adding premix to IOB enlarges `iob` and amplifies this) |

**Worked cases** (all from `ru11Baseline.golden.test.ts`, ICR 10 g/U):

| Case | Inputs | Current | Subtract-IOB-last | Δ |
|---|---|---|---|---|
| Exercise, factor **0.75** | 60 g, 3 U active | **2.3 U** | 1.5 U | +0.8 U |
| Exercise, more IOB | 120 g, 6 U active | **4.5 U** | 3.0 U | +1.5 U |
| Exercise, **no IOB** | 60 g, 0 U active | **4.5 U** | 4.5 U | **0** |
| Sick, factor **1.15** | 60 g, 3 U active | **3.5 U** | 3.9 U | −0.4 U |
| Stress **1.1** | 60 g, 3 U active | **3.3 U** | 3.6 U | −0.3 U |
| Injured/paused **1.08** | 60 g, 3 U active | **3.2 U** | 3.5 U | −0.3 U |
| Compounded **0.75 × 1.15** | 60 g, 3 U active | **2.6 U** | 2.2 U | +0.4 U |

**Failure mode.** With `f < 1` the deduction shrinks with the requirement, so
less active insulin is subtracted than is actually on board — the dose is
**raised in exactly the states that already carry hypo risk** (exercise, falling
glucose, alcohol). With `f > 1` the reverse: more IOB is subtracted than exists.

**What engineering can determine safely.** That the two formulas differ by
`iob × (1 − f)`; that they are identical when `iob = 0`; that either can be
implemented deterministically; that the factors are already reported separately
in `BolusResult` so any arrangement is displayable without new data.

**Question for the specialist — see checklist Q1–Q3.**

**Minimum implementation after authorization.** One expression change in
`computeSmartBolus`, plus updating the six P7-002 fixtures with the newly
authorized numbers recorded beside the old ones. No new inputs, no schema, no UI.

**Required tests.** The six existing fixtures inverted in place; a fixture per
factor proving the sign of the change; an `iob = 0` fixture proving both
arrangements still agree; a compounded-factor fixture; and a regression proving
the hypo guard and the cap still apply after the change.

---

## 2. P7-011 — mixed/premix insulin excluded from IOB  🔴 release blocker #5

| | |
|---|---|
| **Current rule** | `computeIOB` (`bolusEngine.ts:377`): `if (l.insulin_type !== 'rapid') continue;` |
| **Included** | `rapid` only — linear decay over `DIA_HOURS = 4`, entries older than DIA or in the future dropped, remainder must exceed 0.05 U |
| **Excluded** | `long` (clinically intended) and **`mixed`** |
| **Can change a dose** | **YES** — it would introduce a deduction that does not exist today |
| **Depends on** | a data-model change (below) **and** P7-002 (they interact) |

**Worked cases.**

| Case | Result |
|---|---|
| 12 U `mixed`, 30 min ago | **0 U of IOB** |
| Same 12 U logged as `rapid` | **10.5 U** of active insulin |
| Premix-only patient, 60 g meal, 12 U `mixed` 30 min ago | full **6.0 U** recommended, `flags: ['noGlucose']` — no flag, no field, nothing a screen could warn from |
| `mixed` beside a `rapid` dose | the mixed one is dropped; only the rapid contributes |

**Why this reaches patients.** The onboarding wizard treats premix as
meal-covering insulin (`wizard.tsx:450`: *"Rapid or mixed insulin covers meals →
per-meal ratios + correction apply"*), so a premix-only patient is given per-meal
ratios and the bolus calculator — with an IOB that is permanently zero.

**Why the data model cannot fix this today.** An `insulin_logs` row carries one
`dose` and `insulin_type in ('rapid','long','mixed')` (`0001_init.sql:62`). There
is **no composition anywhere** — not on the row, not on the profile, not in the
UI. The rapid fraction of a premixed dose is therefore not derivable, and its
action profile is not the same as a rapid analogue's.

### Minimum data-model proposal (NOT implemented, no migration written)

**No split is assumed — not 30/70, not 25/75, not 50/50, not any other.**

1. **Product, per profile.** A premix product entry holding a name and its
   **declared** rapid-acting percentage, entered by the patient or their doctor
   **from the pen's label**. Never inferred, never defaulted, never guessed from
   the product name.
2. **Reference from the event.** A nullable `premix_rapid_pct` (or product
   reference) on the `mixed` log row, **resolved at log time** so that changing
   the product later cannot retroactively rewrite past doses.
3. **Legacy stays unknown.** Rows written before this exists carry `null`, and
   `null` must never be read as "assume a split". They remain **explicitly
   unknown** — the same precedent as Step 10's `indeterminate` carbohydrate,
   which is what makes this safe with **no backfill and no data migration**.
4. **Dosing gated separately.** Even with a declared percentage, whether the
   rapid fraction may enter IOB — and on which action curve and duration — is a
   clinical decision. The capture must be shippable **without changing any dose**.
5. **Interim, non-dosing option** (also unauthorized): when a patient's logged
   `mixed` insulin is recent enough to be active, state on the bolus screen that
   it is **not** counted. Presentation only, changes no dose.

**Question for the specialist — see checklist Q4–Q7.**

**Required tests.** Premix with a declared percentage contributes its rapid
fraction on the authorized curve; premix with `null` contributes **nothing** and
says so; a legacy row is never silently assumed; the premix-only end-to-end path
produces a deduction; the existing five P7-011 fixtures inverted in place.

---

## 3. P7-003 — a dose from parameters the patient never entered  🔴 blocker #3

**Already fixed (engineering, Step 13):** an unusable ratio, ISF or target
(0, negative, NaN, ±Infinity, inverted pair) can no longer reach the formula; it
takes the same explicit fallback path as a missing value. Every parameter reports
its provenance (`ratioSource`, `isfSource`, `targetSource`) and the UI names each
fallback. A negative correction is impossible and the hypo guard cannot vanish.

**Remaining, and clinical only:** the fallback **values** still produce an
actionable dose. With `profile: null`: ratio 10 g/U, ISF 50, target 70–180 →
**6.0 U** for 60 g, and **2.5 U** of correction at 250 mg/dL. Three flags are
raised (`noRatio`, `defaultIsf`, `defaultTarget`) and nothing refuses to dose.

| Can change a dose | **YES** — any refusal rule suppresses doses that exist today |
|---|---|

**Question — see checklist Q8.**

---

## 4. P7-004 — meal windows and the snack ratio

**Current rule** (`guessMealTime`, device-local hours): 04:00–10:59 breakfast ·
11:00–15:59 lunch · **16:00–17:59 snack** · 18:00–03:59 dinner. `snack` reads the
**lunch** ratio (`ratioForMeal:170`).

**Worked case** (breakfast 1.5, lunch 1.0, dinner 2.0 U/10 g, 50 g of carbs):
**17:59 → snack → lunch ratio → 5.0 U**; **18:00 → dinner → 10.0 U**. One minute
apart, twice the dose. The patient *can* override the slot on screen, which is
why this is medium rather than high.

| Can change a dose | **YES** wherever the per-meal ratios differ |
|---|---|

**Question — see checklist Q9–Q10.**

---

## 5. P7-010 — the correction step at target-high

**Current rule:** correction runs only when `glucose > targetHigh`, but is
computed to `targetMid = (targetLow + targetHigh) / 2`.

**Worked case** (ISF 50, target 70–180 → mid 125): **180 → 0 U**;
**181 → 1.1 U** `((181 − 125)/50 = 1.12)`. The step size follows the target range
and the ISF, not the excess: with a 80–200 range, 201 mg/dL → 1.2 U.

| Can change a dose | **YES** |
|---|---|

**Question — see checklist Q11.**

---

## 6. SPORT-1 — planned vs completed activity *(new, Step 19A)*

**Current rule.** The calculator collects intensity, duration and **timing**
(`done` / `planned`). Timing is carried into the result as `sportTiming` and
displayed — and takes **no part in the arithmetic**. `declared = 1 − reduction`,
where reduction is 0.25 / 0.15 / 0.08 by intensity, ×0.6 under 30 min, ×1.3 over
60 min, capped at 0.35.

**Worked case.** 45 min high-intensity: `done` → factor 0.75 → **4.5 U**;
`planned` → factor 0.75 → **4.5 U**. Identical, although in one case the glucose
has already been spent and in the other it has not.

| Can change a dose | **YES** if the two are separated |
|---|---|

**Question — see checklist Q12.**

---

## 7. ALC-1 — alcohol applies twice *(new, Step 19A)*

**Current rule.** A declared intake (a) **halves the correction** before the
bracket and (b) multiplies the assembled dose by **0.9**. Because (a) happens
inside the bracket, the correction is effectively **×0.45**.

**Worked case** (250 mg/dL, 60 g, ISF 50, target 70–180): sober correction 2.5 U,
total **8.5 U**. With alcohol: correction 1.25 U, ×0.9 → total **6.5 U** — of
which the correction contributes 1.125 U, i.e. **45 %** of its sober value. With
no correction to halve, only the 0.9 applies: 60 g → **5.4 U**. One `alcohol`
flag covers both effects, so no surface can separate them.

| Can change a dose | **YES** if either effect is altered |
|---|---|

**Question — see checklist Q13.**

---

## 8. P7-009 remainder — a ceiling classified as `ok`

**Fixed in Step 19B-1 (presentation only):** the bolus screen now shows
*"Dose limited to the app's maximum (20 U) — the calculation came to 500 U …
this ceiling is a limit of the app, not a dose recommended for you"* in all four
locales. The dose, the threshold, `rawTotal` and the rounding are unchanged.

**Still open, verified again in Step 19B-2:**

- `localDoseCheck(20, cappedEngine)` returns `{risk: 'ok', reasons: []}` — pinned
  by `localDoseCheck.golden.test.ts`;
- `bolus.tsx:314` short-circuits `verifyAndSave` when `dose === engine.total`, so
  for an **accepted** ceiling the check is not even called.

**Smallest non-dose-changing remediations** (for a later step, not implemented):

- **(a) preferred** — `localDoseCheck` reads the existing `capped` flag and adds
  an informational reason (e.g. `cappedRecommendation`) **without changing
  `risk`**. No gate moves, no dose moves; a message becomes available.
- **(b)** — stop short-circuiting `verifyAndSave` when `capped` is set, so the
  confirmation path runs for a ceiling. Changes flow, not arithmetic.

Neither needs a clinical *number*, but both change what a safety surface says, so
RU-2/RU-6 should sign off. **Dose impact: none.**

---

## Clinical Decisions Required — checklist for the reviewing specialist

Each question is answerable from the app's current behaviour, which is stated
with it. **Please answer with the arrangement you want, not with a general
principle** — the implementation will follow the answer literally.

**Insulin on board and modifying factors**

- **Q1.** When the activity factor is **0.75** and **3 U** of rapid insulin
  remains active on a 60 g meal (6.0 U requirement), should the factor apply to
  *meal + correction only, before subtracting IOB* (→ **1.5 U**), or *also scale
  the IOB deduction* as it does today (→ **2.3 U**)?
- **Q2.** Should the same answer apply to factors **above** 1 — sick 1.15, stress
  1.1, injured/paused 1.08, rising trend 1.1 — where today's arrangement
  subtracts *more* IOB than is on board (60 g + 3 U active + sick: today
  **3.5 U**, subtract-last **3.9 U**)?
- **Q3.** If IOB should be subtracted last, should the result still be floored at
  0 U as it is today, or should a negative result be surfaced as "no bolus, and
  you have surplus insulin on board"?

**Premixed insulin**

- **Q4.** May a premixed dose contribute to IOB at all, or should premix patients
  be excluded from IOB-based bolus advice entirely?
- **Q5.** If it may contribute: the rapid percentage must come from the product
  label, entered per patient. Is a **declared percentage per product** the right
  unit of capture, or should it be captured per injection?
- **Q6.** Which action duration and decay shape apply to the rapid component of a
  premix — the same linear 4 h the app uses for rapid analogues, or something
  else? (The app currently uses `DIA_HOURS = 4`, linear.)
- **Q7.** Until a percentage is recorded, should a `mixed` dose (a) contribute
  nothing and be flagged on screen as uncounted — today's behaviour plus a
  warning — or (b) block the bolus calculator for that patient?

**Fallback parameters**

- **Q8.** When a patient has entered **no** ICR, ISF or target, may the app
  continue to produce an actionable dose from its defaults (10 g/U, ISF 50,
  70–180) with the current on-screen "app default" labelling, or must it refuse
  to recommend a dose until the patient's own values are entered? If it may
  continue, should any ceiling apply to a fully-defaulted dose?

**Meal timing**

- **Q9.** Are the current windows correct — breakfast 04:00–10:59, lunch
  11:00–15:59, snack 16:00–17:59, dinner 18:00–03:59 — given that 17:59 doses at
  the lunch ratio (5.0 U) and 18:00 at the dinner ratio (10.0 U) for the same
  50 g?
- **Q10.** Should a snack keep borrowing the **lunch** ratio, or does it need its
  own ratio field?

**Correction**

- **Q11.** Correction is gated at `glucose > targetHigh` but computed to
  `targetMid`, so the first correction is a step (180 → 0 U, 181 → 1.1 U). Should
  the gate move to `targetMid`, should the correction target move to `targetHigh`,
  or should the step be accepted as intended?

**Activity timing**

- **Q12.** Should a **planned** (not yet performed) session reduce the dose by the
  same amount as a **completed** one — today both give 0.75 for 45 min at high
  intensity — or should planned and completed be treated differently (different
  factor, different window, or no reduction until logged)?

**Alcohol**

- **Q13.** Alcohol currently halves the correction **and** multiplies the total by
  0.9, so the correction lands at 45 % of its sober value (8.5 U → 6.5 U). Should
  both effects remain, only one, or a single combined factor?

**Cross-cutting**

- **Q14.** Do any of Q1–Q13 change the meaning of the 20 U ceiling, or does it
  remain an app-level display limit independent of the arrangement chosen?

---

## What is blocked, and what is not

**Blocked on the answers above:** P7-002, P7-011 (also blocked on data capture),
P7-003 policy half, P7-004, P7-010, SPORT-1, ALC-1.

**Not blocked — no clinical value required:** P7-009's `localDoseCheck` half
(option (a) above) · the premix **capture** UI and schema once Q5 is answered ·
every nutrition, presentation, security and deployment item in
[REMEDIATION-PLAN.md](REMEDIATION-PLAN.md).
