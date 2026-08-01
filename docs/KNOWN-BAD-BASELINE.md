# Known-bad baseline — characterization suite

> **A green golden baseline means behaviour is unchanged, not that behaviour is safe or correct.**

The tests under `tests/clinical/` and `tests/domain/` are *characterization*
tests. They record what the code does today, so that any later change shows up
as an explicit, reviewable diff instead of a silent one.

- `tests/clinical/` — `src/services/bolusEngine.ts` (Step 2)
- `tests/domain/` — `programEngine`, `reportStats`, nutrition calculation and
  scaling, `sanitizeAction`, `lib/num` (Step 3)

Several fixtures deliberately encode **defective** behaviour identified in the
audit. They are marked in the test source with:

```
KNOWN-BAD BASELINE — <finding id>
```

When a remediation unit fixes one of these, the corresponding test **must fail**.
That failure is the intended signal. The correct response is to update the
fixture *as part of the authorized remediation* and record the change here —
never to loosen the assertion so it keeps passing.

Conversely, during Step 2 no production code was changed. Where a planned
expectation disagreed with execution, the **test** was corrected after proving
why the engine behaves as it does.

---

## Clinical known-bad fixtures

| Test / fixture | Finding | Current behaviour | Why it is preserved | Owning RU |
|---|---|---|---|---|
| `ratioForMeal` — no ratio at all substitutes 10 g/U | **P7-003 / P13-003** | Missing ICR silently becomes 10 g/U and still yields an actionable dose; `ratioSource: 'default'` + the `noRatio` flag | **Step 13 kept the fallback VALUE and made its provenance impossible to miss** (the UI now names it in the missing-profile list). Whether an unstated ICR should BLOCK the dose is a clinical-policy call, still open | **RU-4** |
| `computeSmartBolus` — profile with no ratio returns a dose | **P7-003 / P13-003** | `total 5.0`, `ratioSource 'default'`, `correctionFactor 50` | Same cause, observed end-to-end. Unchanged by Step 13 except that the ISF half now reports `isfSource: 'fallback'` | **RU-4** |
| ~~Missing ISF substituted with 50~~ | **P7-003** | ~~`correction 3.5` from a value the patient never entered, invisible in the result~~ → **fallback still 50, now reported** as `isfSource: 'fallback'` + `defaultIsf`, and surfaced in the params card and the missing-profile list | ✅ **Provenance half remediated — Step 13.** The VALUE is deliberately unchanged (a different default would be a new clinical decision) | **RU-4** (value), closed for provenance |
| ~~Negative ISF accepted~~ | **P7-003** | ~~`-50` passed the `\|\| 50` guard; correction `-3.5` SUBTRACTED from the meal bolus (total 1.5 U instead of 5.0)~~ → **an ISF that is 0, negative, NaN or Infinity is unavailable** and takes the same explicit fallback path as a missing one | ✅ **REMEDIATED — Step 13.** A negative correction can no longer be produced | closed |
| BG 181 correction discontinuity | **P7-010** | 180 → 0 U; 181 → ~1.1 U | Correction is computed to target *mid* but gated on target *high*, producing a step | **RU-11** → RU-6 |
| `mixed` insulin excluded from IOB | **P7-011 / P11-006 / P13-002** | `computeIOB` keeps only `insulin_type === 'rapid'`; premixed doses contribute 0 | The type is offered in the logging UI, so the omission is reachable and invisible | **RU-11** → RU-4 |
| Activity factor scales the IOB deduction | **P7-002** | `(6 − 3) × 0.75 = 2.3`; subtracting IOB last would give 1.5 | The ordering raises the dose in exercise / falling / alcohol states | **RU-11** → RU-6 |
| ~~BG 0 treated as "no reading"~~ | **P7-006** | ~~`glucose > 0` collapsed 0 into null → full 5 U meal bolus, no hypo flag~~ → **0 is a value**: `glucoseState: 'value'`, the unchanged hypo guard fires, dose 0 | ✅ **REMEDIATED — Step 13.** The threshold did not move; the value now reaches it | closed |
| ~~Missing glucose raises no signal~~ | **P7-006** | ~~`flags` empty~~ → **`glucoseState: 'absent'` + the `noGlucose` flag**, and the params card says the dose was computed without glucose. The DOSE policy is unchanged | ✅ **REMEDIATED — Step 13** (reporting half). Whether a missing reading should block the dose stays a policy question | closed for reporting |
| ~~NaN `target_low` disables the hypo guard~~ | **P7-003** | ~~`??` does not catch NaN; every comparison false, so no hypo flag at BG 50~~ → **an unusable or inverted pair is unavailable**; the app's existing 70–180 applies, reported as `targetSource: 'fallback'`, and the guard fires | ✅ **REMEDIATED — Step 13.** No new threshold introduced | closed |
| Plausible poisoned carbs stay under the cap | **P7-001 / P6-001 / P2-003** | 10 g → 1.0 U vs 60 g → 6.0 U, both with **no flag about the carbohydrate** (the fixture's flag list now carries Step 13's `noGlucose`, which says nothing about the carb value) | Still not fixed: the 20 U clamp is not a barrier in the plausible range. Step 12 stopped an unverified catalogue row being dosed; a poisoned value that reaches the engine is still indistinguishable | **RU-1** + RU-2 |
| mmol/L-magnitude value read as mg/dL | **P7-005 / P9-013 / P11-004** | An **unlabelled** 5.6 is still read as 5.6 mg/dL → hypo, dose 0, because mg/dL is the app's documented default for an unlabelled reading | **Partially remediated — Step 13:** the unit is now part of the contract (`glucoseUnit`), an explicit `mmol/L` is converted (×18.0182) instead of misread, an unknown unit is `invalid` rather than assumed, and `computeTrend` normalizes per-reading. What remains is that a bare number still defaults to mg/dL — correct today, but it depends on every caller honouring that contract | **RU-4** |
| Meal-window discontinuity 17:59 / 18:00 | **P7-004** | 17:59 → `snack` (lunch ratio); 18:00 → `dinner` | Identical meal, different ratio, one minute apart | **RU-11** → RU-4 |
| `snack` borrows the lunch ratio | **P7-004** | 02:00 snack and 13:00 lunch use the same ratio | 16:00–17:59 and 00:00–03:59 have no ratio of their own | **RU-11** → RU-4 |
| Capped recommendation classified `ok` | **P7-009 / P12-001** | A 500 U raw dose clamped to 20 U, accepted unchanged, returns `{risk:'ok', reasons:[]}` | Nothing reports that the number is a ceiling, not a calculation | **RU-6** + RU-2 |
| Duplicate insulin logs both count | **P5-005** | Two identical doses → IOB doubles | **Unchanged and still correct in isolation** — split dosing is real, so `computeIOB` must count both rows. What Step 14 removed is the sync layer's ability to CREATE a duplicate row: identity is now the row's own uuid. This fixture is deliberately untouched | **RU-5** (cause closed), fixture kept |

---

## Non-clinical known-bad fixtures (Step 3)

> **Finding IDs in this section need reconciling against the delivered Part 8,
> 9 and 10 reports.** The defects themselves were each re-derived from the
> source during Step 3 and are demonstrated by a passing test; the `Pn-xxx`
> labels are a best-faith mapping and are the one thing here not independently
> verified. The clinical section above was written with the reports in hand.

### `programEngine` — `tests/domain/programEngine.golden.test.ts`

| Fixture | Finding | Current behaviour | Why it is preserved | Owning RU |
|---|---|---|---|---|
| Unknown activity level | **P8-002** | `ACTIVITY_FACTOR[x]` is undefined → the entire budget is NaN, with no fallback and no error | A typo'd or migrated enum value silently destroys the plan | **RU-4** |
| Negative weight accepted | **P8-001** | `?? 75` does not catch it and `!(-80)` is false, so no `missingBodyData` warning; protein target becomes **−128 g** | No validation at UI, DB or engine | **RU-4** |
| NaN body data defeats the calorie floor | **P8-003** | Every comparison against NaN is false, so the 1500/1200 kcal floor never engages; only the DB CHECK rejects it | A safety rail disappearing without a signal | **RU-4** |
| Absent body data yields a fabricated BMI | **P8-001** | `computeBMI` correctly returns null for absent input, but `programEngine.ts:185` calls it with the WHO-median placeholders → BMI 26.0 presented as fact | The loss of provenance happens at the call site, not in the helper | **RU-3** + RU-4 |
| Placeholder BMI suppresses `lowBmiLoss` | **P8-001** | An underweight patient with an incomplete profile is **not** warned when setting a weight-loss goal; the same patient measured **is** | A clinical guard evaluated against invented data | **RU-3** + RU-4 |
| `gender: 'other'` takes the male formula | **P8-001** | `gender === 'female' ? 'female' : 'male'` — 'other' and undefined both get the male BMR, a 166 kcal difference | A clinical branch the patient never chose | **RU-11** → RU-4 |

### `reportStats` — `tests/domain/reportStats.golden.test.ts`

| Fixture | Finding | Current behaviour | Why it is preserved | Owning RU |
|---|---|---|---|---|
| **Today has no `byDay` row** | **P9-001** | `byDay` steps `days` times from the floored `from`, covering Jan 8–14 for a 7-day window ending Jan 15. Today's readings, meals and doses pass `inWindow` and reach the headline totals, but `dayMap.get()` misses and they are dropped from the chart | The exported PDF shows a trend chart whose sums do not equal the totals printed beside it, and today is invisible to the doctor | **RU-4** |
| Future-dated reading counted | **P9-002** | `inWindow` tests only the lower bound; `computeIOB` explicitly rejects `t > now`, this builder does not | A wrong device clock or a replayed sync row enters the average | **RU-4** + RU-5 |
| `mixed` insulin in the total but neither breakdown | **P9-003** | `rapidU` + `longU` ≠ `totalInsulin` | Same root omission as the IOB gap; the type is offered in the logging UI | **RU-11** → RU-4 |
| One NaN reading poisons the summary | **P9-004** | avg / min / max / SD / CV all become NaN and render as "NaN", while the band percentages still report a confident figure and eA1c/GMI fall back to null — indistinguishable from "not enough data" | Bad data and absent data must not share a presentation | **RU-2** + RU-16 |
| "Per day" averages divide by days-with-data | **P9-005** | A patient who logged insulin on one day of seven sees that day's total as their daily average — a 7× overstatement, likewise for carbohydrate | The label says per day; the denominator says per logged day | **RU-6** |

### Nutrition calculation & scaling — `tests/domain/nutrition*.golden.test.ts`

| Fixture | Finding | Current behaviour | Why it is preserved | Owning RU |
|---|---|---|---|---|
| A zeroed plate earns positive badges | **P8-005** | An empty or wholly unidentified plate returns `low_glycemic_load` + `low_sugar` (+ `low_protein`) — absence of data shown as a good result, on the screen that also shows 0 kcal | Consistent with the micronutrient rule, which correctly contributes nothing | **RU-3** |
| Legacy rescale round-trip drifts | **P8-004** | Without `per100g_base`, 200 g → 7 g → 200 g turns 37 g of carbohydrate into 37.1 g; the drift is unbounded across repeated edits and feeds the bolus | Items persisted before `per100g_base` existed still take this path | **RU-16** → RU-2 |
| `aggregateItems([])` throws | **P8-006** | `[...bySource.entries()].sort()[0][0]` on an empty map raises a TypeError | Reachable when the resolver has filtered every food out | **RU-2** + RU-16 |

### `sanitizeAction` — `tests/domain/sanitizeAction.golden.test.ts`

| Fixture | Finding | Current behaviour | Why it is preserved | Owning RU |
|---|---|---|---|---|
| Out-of-character insulin dose | **P10-004** | The 100 U ceiling is absolute, not patient-relative: 60 U passes unflagged for someone whose largest recorded dose is 8 U. No access to profile or dose history | The confirmation card is the only remaining barrier | **RU-7** + RU-2 |
| mmol/L glucose discarded | **P10-005** | A spoken "5.6" falls below the 20 mg/dL floor and is rejected — the reading is lost, not converted or queried | Unit-blind range checking | **RU-4** |
| Carbohydrate unbounded above | **P10-006** | `carbs: 900` (and 1 000 000) accepted verbatim — the one field that drives an insulin dose has no ceiling, while the insulin branch does bound its dose | Asymmetric validation on the two ends of the same calculation | **RU-2** + RU-7 |
| Measures unbounded, unit a free string | **P10-007** | hba1c 800 % and weight 5000 kg accepted; `unit: 'lb'` stored without conversion and later read as kilograms — and weight feeds the BMR | Floor without ceiling, value without unit contract | **RU-2** + RU-4 |

### `lib/num` — `tests/domain/num.golden.test.ts`

| Fixture | Finding | Current behaviour | Why it is preserved | Owning RU |
|---|---|---|---|---|
| Thousands separator truncates | **P16-006** | Only the first comma is rewritten, so `"1,234.5"` → `"1.234.5"` → **1.234**. A four-digit entry silently becomes ~1 | Truncation, not rejection — the field looks accepted | **RU-4** / RU-12 |
| Arabic-Indic digits unparseable | **P16-006** | Arabic is a supported UI language, but `٥` and `١٢٫٥` parse to undefined and the field reads as empty | Display locale and parse locale are unrelated in this code | **RU-12** |
| Persian / Eastern Arabic digits unparseable | **P16-006** | Same for `۵`, `۰۱۲۳۴۵۶۷۸۹` | Same cause | **RU-12** |

---

## Fixtures that record **correct** behaviour

These are equally important — they are the regression net that a later fix must
not break:

- Linear IOB decay at 0 / 30 / 60 / 120 / 180 min (10.00 / 8.75 / 7.50 / 5.00 / 2.50 U)
- Doses older than DIA, and doses with future timestamps, excluded from IOB
- `long` insulin excluded from IOB
- Negative and NaN insulin doses dropped
- ICR conventions: `carb_ratio` is g/U, `insulin_per_10g_*` is U/10 g, converted correctly
- Negative / NaN / zero carbs floored to 0
- Infinity carbs stopped by the cap
- Hypo boundary strict: 69 blocks, 70 does not
- Total never negative; IOB never increases the dose
- Rounding to 0.1 U applied once
- `localDoseCheck` escalation: `hypoDose`, `fallingIncrease`, `overCap`, `muchHigher`, `stacking`, `muchLower`

Non-clinical (Step 3):

- Mifflin-St Jeor BMR, the five activity factors, and the 25/35/30/10 meal split
- Calorie and carbohydrate floors, and the macro refit that keeps the refitted
  total inside the floored budget
- `splitCarbs` conserves the daily total and respects the per-meal cap
- Consensus glucose bands at 54 / target-low / target-high / 250, summing to 100 %
- Sample SD and CV, and the refusal to report a spread from a single reading
- `rescaleItem` round-trips **exactly** when `per100g_base` is present — the
  regression net for the fix that P8-004 still needs backfilled
- Carb-weighted glycemic index, coverage ratio, and the estimated-GI flag
- `sanitizeAction` rejects every out-of-range dose, reading, duration and
  reminder window, and clamps backdating to 12 hours

---

## Data-integrity known-bad fixtures — Step 20 (P8-006, N-8)

### P8-006 — an empty plate crashed the aggregation

Recorded **before** Step 20 in `tests/domain/nutritionScaling.golden.test.ts`
(the fixture pre-dates this step and was written in Step 3):

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"an empty plate throws instead of returning an empty result"* | **P8-006** | `aggregateItems([])` reads `[...bySource.entries()].sort()[0][0]` on an empty map → **TypeError**; `detectionConfidence` / `nutritionConfidence` would also be `0/0 = NaN` | RU-2 + RU-16 |

**Reachability, re-verified in Step 20:** four call sites —
`engine.ts:339` (the resolver's own return), `scan-result.tsx:416`, and
`program.ts:241,281`. The resolver filters unmatched foods out *before* this
call, so a plate whose every food was dropped reaches it with `[]` and crashes
the aggregation rather than returning an empty plate.

### N-8 — the forecast reads a carbohydrate without its provenance

`tests/domain/predictionProvenance.golden.test.ts` (6 fixtures, new in Step 20,
green against unmodified code — **nothing was changed**).

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"an unknown carbohydrate predicts exactly like a genuine 0 g"* | **N-8** | the meal term is `min(40, carbohydrates × 0.5)` and never consults `carbs_known`: an unknown plate and a glass of water both give **120 mg/dL, "stable"** on a flat baseline | RU-3 + RU-6 |
| *"a lower-bound plate under-predicts, silently"* | **N-8** | 20 g known out of a partly-unknown plate → 130, as if 20 g were the whole plate | RU-3 + RU-6 |
| *"nothing in the result reports how solid the meal term is"* | **N-8** | `GlucosePrediction` carries no provenance field | RU-3 |
| *"no source file imports the prediction module"* | **N-8 scope** | **`predictGlucose` has no caller anywhere in `src/`.** The defect cannot reach a patient today — which is why Step 20 recorded it instead of changing the arithmetic. If this fixture ever fails, the finding has become live | RU-3 |

### Moved in Step 20 — the empty plate returns an empty plate

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"an empty plate throws instead of returning an empty result"* → *"an empty plate returns an empty result instead of throwing"* | `TypeError` | a well-formed `NutritionResult`: zeros, `carbs_known: false`, confidences `0`, `source` **absent**, `items: []` | A crash is never the right answer to "no foods survived". The established Step 10 contract is applied rather than a new one invented: an empty plate knows **no** carbohydrate, so it is `unknown` — never a dosable 0 |

**No clinical value was invented**: `plateCarbStatus([])` already returned
`'unknown'`, `source` is optional in `NutritionResult` and is therefore omitted
rather than guessed, and every total was already `0` from the reduce's initial
value. Only the two crash/NaN sites changed.

## RU-11 clinical known-bad fixtures — the Step 19A re-audit

`tests/clinical/ru11Baseline.golden.test.ts` (30 fixtures) and
`tests/domain/cappedDose.golden.test.ts` (3). Written in Step 19B-1 and green
against **unmodified** dosing code: `computeIOB`, `computeSmartBolus`,
`localDoseCheck`, the factors, DIA, targets, ICR/ISF, meal windows, the cap and
the rounding are all untouched. Only the capped-dose PRESENTATION moved.

**None of these may be flipped without specialist clinical authorization.**

| Fixture group | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"multiplicative factors scale the IOB deduction"* (6) | **P7-002** 🔴 #6 | IOB is subtracted inside the bracket, so every factor multiplies it: the gap against "subtract IOB last" is exactly `iob × (1 − factor)`. Exercise 0.75 with 3 U active → **2.3 U** where subtracting last gives 1.5 U; with 6 U active the gap is 1.5 U. Factors **above** 1 move it the other way (sick 1.15 → 3.5 U vs 3.9 U). With no IOB the two agree exactly | **RU-11** → RU-6 |
| *"a premix-only patient dosing path"* (5) | **P7-011** 🔴 #5 | 12 U of `mixed` injected 30 min ago contributes **nothing**; the same units as `rapid` would be 10.5 U of active insulin. End to end the recommendation is the full 6 U meal bolus, `flags` is `['noGlucose']` — no flag, no field, nothing a screen could warn from. A mixed dose is dropped even beside a rapid one | RU-4 + **RU-11** |
| *"correction is a step, not a ramp"* (3) | **P7-010** | 180 → 0 U, 181 → **1.1 U**. The step follows the target range and ISF, not the excess: an 80–200 range makes it 1.2 U | **RU-11** → RU-6 |
| *"meal-window boundaries decide the ratio"* (3) | **P7-004** | 17:59 → `snack` → the **lunch** ratio → 5 U; 18:00 → `dinner` → **10 U**. One minute, twice the dose. An explicit `mealTime` from the screen overrides the clock — which is why this is medium, not high | **RU-11** → RU-4 |
| *"fallback parameters still produce a dose"* (3) | **P7-003** 🔴 #3 | `profile: null` still yields a full 6 U meal bolus and a 2.5 U correction from 10 g/U, ISF 50 and 70–180. Every source is reported (`default` / `fallback`, three flags) — nothing refuses to dose on them | **RU-11** (policy) |
| *"planned and completed sport are dosed identically"* (3) | **SPORT-1** *(new, Step 19A)* | `declaredSport.timing` is captured, carried out as `sportTiming` and displayed — and takes **no part in the arithmetic**. `done` and `planned` both give 0.75 and 4.5 U. Duration scales the reduction for both alike | **RU-11** |
| *"alcohol reduces the dose through two mechanisms"* (3) | **ALC-1** *(new, Step 19A)* | A declared intake **halves the correction** (2.5 → 1.25 U) **and** multiplies the assembled dose by **0.9**: 8.5 U sober → 6.5 U. One `alcohol` flag covers both, so no surface can separate them. Never clinically ratified | **RU-11** |
| *"the 20 U ceiling"* (4) | **P7-009** | 5000 g → clamped to exactly **20 U** with `capped`, `rawTotal` 500. Exactly 20 U is **not** flagged; 20.1 U is. The cap applies after rounding | RU-6 + RU-2 |

### Moved in Step 19B-1 — the capped dose says it is a ceiling (P7-009 presentation only)

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"the bolus screen never reads the capped flag"* | `bolus.tsx` mentioned neither `capped` nor `rawTotal`; the hero printed "20 U" exactly as it prints "6.3 U" | the screen reads the flag and shows a notice naming the app's maximum | A ceiling presented as a calculation is a number the patient cannot question |
| *"the dose hero has no way to say a number is a ceiling"* | `DoseHero` had no such prop | optional `cappedNotice`, rendered under the figure | — |
| *"no locale has any wording for a limited dose"* | no key | `bolus.cappedTitle` + `bolus.cappedBody` in fr/en/de/ar | — |

**The arithmetic did not move**: the four `ru11Baseline` cap fixtures (20 U, the
flag, `rawTotal` 500, the 20/20.1 boundary, 6.3 U rounding) are unchanged and
still green, and `localDoseCheck` is byte-for-byte identical — a capped dose
accepted unchanged is still classified `{risk:'ok', reasons:[]}`, which remains
**open** as the RU-2/RU-6 half of P7-009.

## Seeding, badges and save-truthfulness known-bad fixtures — NUTR-C2 / P8-005 / DATA-1

Recorded **before** Step 18 changed anything, across three files.

### NUTR-C2 — a seeded carbohydrate arrives unlabelled

`tests/domain/carbSeed.golden.test.ts`. The six fixtures in its first block pin
the VALUE rule closed in Step 10 (unknown seeds nothing, a genuine 0 g seeds
`"0"`, a legacy zero is indeterminate) and must survive a labelling step
untouched.

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"the precedence rule lives inline in the screen, untestable"* | **NUTR-C2** | `bolus.tsx` computes the seed as `handoff.carbs ? String(Math.round(Number(handoff.carbs))) : (mealSeed ?? '')` — the **unguarded route parameter wins over the provenance-checked meal seed**, and the rule sits in a screen no unit test can reach | **RU-3 + RU-6** |
| *"carbProvenance exposes no seed-origin helper"* | **NUTR-C2** | the module can say *whether* to seed, never *from where* | RU-3 |
| *"no locale has wording for where a seeded value came from"* | **NUTR-C2** | no `seedFromMeal` / `seedFromProgram` key in any of the four locales | RU-3 |
| *"the only thing the screen says about the seed is when it REFUSED to make one"* | **NUTR-C2** | Step 10's pill explains an *absent* seed; a value that WAS seeded says nothing at all | RU-3 |

The route parameter is sent by `program.tsx` twice (*"I ate it"* and *"my dose"*)
and carries an **AI-composed planned meal's** carbohydrate.

### P8-005 — positive badges on a plate with no data

`tests/domain/highlightsDisplay.golden.test.ts`.

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"a zeroed plate earns low sugar and low glycemic load"* | **P8-005** | zeros satisfy the "good" thresholds: `sugar <= 5` and a GL of `Low`. A plate nothing could be resolved for compliments itself | **RU-3** |
| *"the same is true of a plate with energy but nothing else"* | **P8-005** | the failure is not limited to a wholly empty plate | RU-3 |
| *"advice.ts exposes no display filter"* · *"LastMealCard renders whatever was stored"* | **P8-005** | `engine.ts` persists the badges into `NutritionResult.highlights` and the home card prints the first two — nothing filters between the builder and the patient | RU-3 |

### DATA-1 (UI half) — "not sent" and "refused" are the same row

`tests/domain/writeOutcome.golden.test.ts`, two fixtures added to the Step 14 file.

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"an offline save and a refused save are the same row to a screen"* | **DATA-1** | `rowIdentity` collapses `{state:'local'}` and `{state:'failed', reason}` into one `pending_sync: true`; the reason never leaves `data.ts`; the row carries no `sync_state` | **RU-5 → Step 18** |
| *"every save surface throws the outcome away"* | **DATA-1** | `bolus.tsx`, `scan-result.tsx`, `log-glucose.tsx`, `log-insulin.tsx` (and four more) `await save…()` and discard the return, then report success unconditionally | RU-5 |

Consequence, in the app's own words: a dose the server **refused** is announced
as *"Injection enregistrée dans ton journal"* — identical to a confirmed one —
while the doctor's dashboard does not have it.

## Nutrition provenance known-bad fixtures — NUTR-A2 / A3 / B3

`tests/domain/nutritionProvenance.golden.test.ts`. Recorded **before** Step 17
changed anything. The file answers "what KIND of number is this", not "is it
right": eight fixtures establish the taxonomy and stay green forever; five
record the claim.

**What the meal screen actually holds**

| Kind | Nutrients | Where it comes from |
|---|---|---|
| **Declared** | calories, carbs, sugar, protein, fat, fibre, sodium | the provider entry (`readNutriments`), the catalogue, or the AI's per-100 g fallback |
| **Calculated** | macro %, GI (carb-weighted), GL, meal score, burn minutes, goal remainder | arithmetic over declared values |
| **Estimated** | **vitamin A, vitamin C, iron, calcium, potassium, and the meal's water** | a category density × the grams on the plate. **No provider supplies any of them** |
| **Absent** | any nutrient the source never stated | carbohydrate says so (`carbs_known`); the other six print `0` |

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"the hydration line states the millilitres as fact"* | **NUTR-A3** | `waterFromMeal` = `"{{ml}} ml apportés par ce repas"` — a factual claim, in all four locales, about a number derived from `WATER_FRACTION[category] × grams` | **RU-3** |
| *"no locale has any estimate wording for the micronutrient card"* | **NUTR-A2** | no estimate/coverage/confidence key exists at all | RU-3 |
| *"the GI chip is the only place on the screen that qualifies its number"* | **A2 + A3** | the GI chip says *"estimé · Calculé sur X % des glucides"*; the vitamins and hydration cards — five filled bars, a ring, percentages — say nothing | RU-3 |
| *"the PDF prints the same estimates with no qualifier either"* | **A2 + A3** | the sharable meal PDF carries the five bars and `{{ml}} ml` with no qualifier, in a document a doctor may read | RU-3 |
| *"micros.ts exposes no provenance for the UI to show"* | **A2/A3/B3** | the module returns percentages only — no coverage, no clamp signal, no low-confidence signal, so no surface *could* have said it | RU-3 |

**Also recorded, and NOT fixed by Step 17** (each stays red):

- **NUTR-B1 remainder** — *"for the other six, a stated 0 and an absent value are
  indistinguishable"*: `readNutriments` returns `0` for an absent sugar, protein,
  fat, fibre or sodium with no `*_known` flag. Only carbohydrate carries its
  absence, because that is what a dose is computed from (Step 10). The one
  signal that an entry is nearly empty — `fieldsFound` 1 vs 7 — is computed and
  rendered nowhere (**NUTR-A7**).
- **NUTR-B3** — *"a barely-identified food still contributes its full category
  density"*: `estimateMicros` excludes only `nutrition_confidence === 0`, so a
  0.1-confidence food counts in full. Changing the threshold would move
  displayed values, so Step 17 makes the weakness visible instead.
- **NUTR-A2's clamp** — *"a plate delivering 300 % of a nutrient reads as exactly
  100 %"*: `Math.min(100, …)` turns a large share into an exact-looking match.
- **NUTR-B2** — NaN `portion_grams` propagates into both estimates (pinned in
  `nutritionMicros.golden.test.ts`, untouched).

## Nutrition presentation known-bad fixtures — NUTR-A1

`tests/domain/mealGrade.golden.test.ts`. Recorded **before** Step 16 changed
anything. The 20 fixtures in the file's first two blocks pin the NUMBER and the
LETTER (they must survive a naming step untouched); the five below pin the
CLAIM — **all five moved in Step 16**, tabulated
[there](#step-16--the-meal-grade-is-the-apps-own-nutr-a1).

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"three of the four locales call it Nutri-Score"* | **NUTR-A1** | `analysis.nutriScore` is the literal string `"Nutri-Score"` in fr, en and de. Arabic already said *"the nutritional assessment"* and claimed nothing | **RU-6** |
| *"no locale explains that the letter is the app's own"* | **NUTR-A1** | there is no note key at all — nothing on any surface says who computed the letter | RU-6 |
| *"the strip is painted with the official Nutri-Score palette"* | **NUTR-A1** | `NutriScoreBar.tsx` uses `#038141 · #85bb2f · #fecb02 · #ee8100 · #e63e11`, its own comment calling them *"the official Nutri-Score palette"*, on a frosted front-of-pack strip over the meal photo | RU-6 |
| *"the meal PDF prints the claim in hardcoded French, outside i18n"* | **NUTR-A1** | `scan-result.tsx` emits `Nutri-Score : <b>${grade}</b>` into the sharable meal PDF — a document a doctor may read — bypassing i18n, so it said "Nutri-Score" in all four languages | RU-6 |
| *"the AI assistant is told the app shows a Nutri-Score"* | **NUTR-A1** | `ai-chat`'s system prompt lists *"calories, health score /100, Nutri-Score"* among what a scan produces, so the assistant repeats the claim in conversation | RU-6 |

**What the number actually is** (pinned green, and unchanged by Step 16):
`nutriGrade(scoreMeal(plate totals))` — computed **per plate**, not per 100 g, so
the same food at twice the portion drops from B to C; **fat is never scored at
all** and saturated fat does not exist anywhere in the app's nutrition pipeline,
though it is the largest negative component of the real algorithm; the
**glycemic index**, which the official algorithm does not use, moves the letter
by three grades on its own; and one linear 0..100 ladder serves every food,
where the real metric has separate cut-offs for drinks, fats and general foods.

Official compliance is therefore not merely unproven — it is **impossible with
the data the app holds**. That is why Step 16 is a naming and presentation fix
and not an algorithm change.

## Security known-bad fixtures — Edge Function caller trust

`tests-security/functions/authBoundary.test.ts`. Recorded **before** Step 15
changed anything, against the local stack (loopback only, local-stack keys, no
provider secrets).

| Fixture | Finding | Behaviour recorded | Owning RU | Now |
|---|---|---|---|---|
| *"nutrition-search answers a bare-anon-key caller"* | **P3/P4** | `400` for a missing `query` — execution reached the function's own body handling with **no authentication at all**. The anon key ships in the published bundle | **RU-15** + RU-7 | ✅ moved by Step 15 |
| *"food-search answers a bare-anon-key caller"* | **P3/P4** | not `401` — the proxy runs and calls Open Food Facts under the project's User-Agent for anyone holding the public key | **RU-15** + RU-7 | ✅ moved by Step 15 |
| *"a config error is reachable with the public anon key alone"* | **P4-b** | `analyze-meal` answers an identical 500 (`missing GEMINI_API_KEY`) to a real patient JWT and to the bare anon key — the config guard runs before the `!uid` check | RU-14 / RU-15 | ✅ moved by Step 15 |
| *"input validation also precedes the feature-lock check"* | **P4-b** | a malformed body yields `400` before the lock is consulted | RU-14 / RU-15 | ✅ moved by Step 15 |
| `it.skip` — *"a locked feature is refused server-side"* | **SEC-1** | **not verifiable**: every function consulting `featureGuard` short-circuits on a missing provider secret first, so the lock was never reached on this stack | RU-15 | ✅ verified by Step 15 — skip removed |

Each of those five was **run green against the old code first** and is tabulated
before → after under [Step 15](#step-15--edge-function-caller-trust-p3p4-p4-b-sec-1).

### Still KNOWN-BAD after Step 15 — the rest of P4-b

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"%s answers the anon key and a real patient identically"* — `ai-chat`, `lab-analyze`, `tts`, `live-token` | **P4-b** | all four evaluate `if (!GEMINI_API_KEY)` — and, in ai-chat / lab-analyze, the body parse too — **before** `callerUserId`, so on a stack with no provider secret an unauthenticated caller and a real patient get the same 500. Step 15's remit was `analyze-meal` ordering only | RU-14 / RU-15 |

The consequence is the one Step 15 just closed for `analyze-meal`: configuration
disclosure plus a small unauthenticated work amplifier. **Not** an auth bypass —
where the key is set the guard does not fire and execution reaches the 401.

**SEC-2 is deliberately still open.** `featureLocked` returns `false` when the
`feature_access` lookup fails (`featureGuard.ts:37`), so during a database outage
a locked patient is unlocked. That is a product decision — a hiccup must not
block a paying user mid-flow — and reversing it decides who may use a feature
during an outage. Step 15 documented it and changed no runtime behaviour for it;
there is no fixture, because simulating the outage means breaking the local
stack's REST endpoint mid-suite.

## Fixtures changed by an authorized remediation

Every entry here is a fixture whose expectation MOVED, with the behaviour change
that moved it. Rule 5 of the plan: never silently.

### Step 18 — seed provenance, earned badges, truthful saves (NUTR-C2 label half, P8-005, DATA-1 UI half)

Ten fixtures moved across three files, each keeping its BEFORE state in the
comment above it. **No dose, no dose input, no nutrition arithmetic and no
stored value changed** — the fixtures that pin those are untouched and are the
proof.

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"the precedence rule lives inline in the screen, untestable"* → *"the programme route parameter still wins, and is labelled as planned"* | the rule sat in a `.tsx` initializer; the unguarded route parameter beat the provenance-checked meal seed, unnamed | the same rule in `carbSeed`, returning `origin: 'program' \| 'meal' \| 'none'` with the value | The precedence is unchanged — it is now visible, testable and labelled |
| *"carbProvenance exposes no seed-origin helper"* → *"the programme value is passed through untouched"* | — | `carbSeed('999')` → `'999'`, `'62.6'` → `'63'` | Step 18 labels the programme figure; **bounding it would change a dose input** and is not authorized |
| *"no locale has wording for where a seeded value came from"* → *"every locale can name both origins"* | no key | `bolus.seedFromMeal` (`{{food}}` + `{{time}}`) and `bolus.seedFromProgram`, four distinct sentences | A patient could not tell their own number from the app's |
| *"the only thing the screen says is when it REFUSED to seed"* → *"the screen uses the shared rule and prints the origin"* | Step 10's pill only | the pill **plus** the origin line under the field | — |
| *(new)* *"NO confirmation gate was introduced"* | — | asserts `carbsValue`/`carbsKnown` still flow straight to the engine and no `carbsConfirmed`-style state exists | Item 2 stays **open** by instruction; this fixture is what keeps it from creeping in |
| *"advice.ts exposes no display filter"* · *"LastMealCard renders whatever was stored"* → *"a zeroed plate keeps its honest signals and loses its compliments"* | `low_glycemic_load` + `low_sugar` printed beside 0 kcal | positives suppressed when the plate has no energy or an unknown carbohydrate; `low_protein` kept | Praise needs data behind it |
| *(new)* *"a plate WITH data keeps every badge it earned"* · *"the stored keys themselves are never rewritten"* | — | filter is pure; `NutritionResult.highlights` in the journal is untouched | No migration, no silent edit of history |
| *"an offline save and a refused save are the same row to a screen"* → *"a REFUSED write is now distinguishable"* | both `pending_sync: true`, reason dropped inside `data.ts` | `sync_state: 'local' \| 'failed'` beside the unchanged `pending_sync` | A dose the server refused was announced exactly like a confirmed one |
| *"every save surface throws the outcome away"* → *"the surfaces that claim persistence now read the outcome"* | `await saveInsulin(…)`, return discarded, `setSaved(true)` | `savedStateKey(row)` → one of three sentences | — |
| *(new)* *"`sync_state` is local-only — no push payload carries it"* | — | asserts `sync.ts` never mentions it | Every payload is an explicit field list; nothing new is sent, no column exists |

**Still KNOWN-BAD after Step 18** (unchanged, still red):

- **NUTR-C2 item 2 — the confirmation gate.** A seeded carbohydrate still
  reaches the engine with no acknowledgement. Deliberately not implemented: it
  would change what the engine receives when a patient does not confirm, which
  is a dose-input decision, not a presentation one.
- **The meal SCORE on an empty plate.** Observed during Step 18's Demo Mode run
  and recorded here rather than fixed: a wholly unidentified plate still scores
  **100/100 "Excellent"** with the tip *"Repas équilibré pour votre glycémie"*.
  Those come from `scoreMeal` / `quality.reasons`, not from the P8-005 badges,
  so they are outside the authorized scope — and they are the same class of
  error. Owning RU-3, with NUTR-A9 and the rest of the presentation batch.
- Everything Step 17 left open: the six zero-filled nutrients, `fieldsFound`
  (NUTR-A7), NUTR-B3's threshold, NUTR-B2, and the estimate's own validity.

### Step 17 — inferred nutrition says so (NUTR-A2, NUTR-A3, NUTR-B3 labelling)

All five moved fixtures live in `tests/domain/nutritionProvenance.golden.test.ts`,
in the block now titled *"FIXED IN STEP 17"*, each keeping its BEFORE state in
the comment above it. **Not one displayed number changed** — the eight taxonomy
fixtures in the same file and all 37 in `nutritionMicros.golden.test.ts` are
untouched, which is the proof.

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"the hydration line states the millilitres as fact"* → *"…is now explicitly an estimate, in all four locales"* | `"{{ml}} ml apportés par ce repas"` | `"≈ {{ml}} ml estimés pour ce repas"` (+ en/de/ar) | The millilitres come from `WATER_FRACTION[category] × grams`. The number is unchanged; the claim about it is not |
| *"no locale has any estimate wording for the micronutrient card"* → *"every locale carries the estimate vocabulary, and it is translated"* | no key existed | `estimatedFromCategories`, `estimateCoverage`, `estimateLowConfidence`, `atLeastPct` in fr/en/de/ar | Reuses the GI chip's vocabulary rather than inventing a second one |
| *"the GI chip is the only place on the screen that qualifies its number"* → *"both estimate cards on the screen now qualify their numbers"* | five filled bars + a ring, unqualified | each card carries *"Estimated from each food's category and weight — no measured values"*, plus coverage and low-confidence lines when they apply | An inferred number sitting beside declared macros in the same visual language reads as measured |
| *"the PDF prints the same estimates with no qualifier either"* → *"the PDF carries the same qualifier, and the capped ≥"* | bars and `{{ml}} ml` bare | same note line; the hydration row prints the estimate sentence | It is the document a doctor reads |
| *"micros.ts exposes no provenance for the UI to show"* → new `microProvenance` block (6 fixtures) | percentages only | `coverageRatio`, `unsureGrams`, per-nutrient `atLeast` | Nothing could have been said before, because nothing was reported |

**The clamp is now honest without moving:** a plate delivering 344 % of vitamin C
still shows a full bar and still computes `100`, but the figure reads **"≥ 100 %"**
— the same idiom a partially known carbohydrate uses. `microProvenance.atLeast`
is derived from the same rounding as `estimateMicros`, so a share that rounds to
exactly 100 is a match, not a floor (fixture: *"agrees with estimateMicros
exactly at the boundary"*).

### Step 16 — the meal grade is the app's own (NUTR-A1)

All five moved fixtures live in `tests/domain/mealGrade.golden.test.ts`, in the
block now titled *"FIXED IN STEP 16"*, and each keeps its BEFORE state in the
comment above it. **No fixture in the file's first two blocks moved** — that is
the point: 20 of the 27 pin the number, the letter and the four proofs of
non-compliance, and a presentation step must leave every one of them alone.

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"three of the four locales call it Nutri-Score"* → *"no locale calls the app grade a Nutri-Score, and the old key is gone"* | `analysis.nutriScore` = `"Nutri-Score"` in fr/en/de | `analysis.mealGrade` = *Indice GluciAI* / *GluciAI index* / *GluciAI-Index* / *مؤشر GluciAI*; `analysis.nutriScore` deleted in all four | The app's own name is the one claim it is entitled to make. Deleting the old key means nothing can render it again |
| *"no locale explains that the letter is the app's own"* → *"every locale says whose indicator this is, in its own words"* | no note key existed | `mealGradeSub` (in-strip) + `mealGradeNote` (under the strip and in the PDF), four distinct sentences | The letter A–E on a food photo reads as a front-of-pack mark unless something says otherwise |
| *"the strip is painted with the official Nutri-Score palette"* → *"the grade palette is the app's own, not the official mark"* + *"no source file carries the official palette any more"* | `#038141 · #85bb2f · #fecb02 · #ee8100 · #e63e11` inside `NutriScoreBar.tsx` | `GRADE_COLORS` in `mealScore.ts`: `#17A24A · #2FCB8E · #E0A93F · #F5763B · #B4441A` — the tiers the score ring and journal badge already use | The palette moved into the module that owns the score, so it is testable; the five official hexes now fail the suite wherever they appear |
| *"the meal PDF prints the claim in hardcoded French, outside i18n"* → *"the meal PDF names the app indicator through i18n, with the note beside it"* | `Nutri-Score : <b>${grade}</b>` — French in every language | `${t('analysis.mealGrade')} : <b>${grade}</b>` plus the note line | A document a doctor reads must not carry a regulated name the value has not earned — in a language the patient did not choose |
| *"the AI assistant is told the app shows a Nutri-Score"* → *"the AI assistant is told the letter is the app's, and told not to rename it"* | prompt listed *"health score /100, Nutri-Score A–E"* | prompt names the GluciAI index and states it is **NOT** a Nutri-Score and must never be called one | The assistant speaks to the patient; leaving the old wording would have re-introduced the claim in conversation |

The score, the A–E thresholds, the labels, the ring colours and every stored
`meal_score` are **unchanged** — no historical value was rewritten. What the
letter is called, what colour it is drawn in, and what the app says about it
are the only things that moved.

### Step 15 — Edge Function caller trust (P3/P4, P4-b, SEC-1)

All five moved fixtures live in `tests-security/functions/authBoundary.test.ts`
and each keeps its BEFORE state in the comment above it. No clinical fixture
moved; no unit/golden fixture moved (747 in 26 files, unchanged).

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"nutrition-search answers a bare-anon-key caller instead of refusing it"* → *"…refuses the bare anon key instead of answering it"* | `400 "query is required"` — the body was read with no authentication | `401 "unauthorized"` | The function gained the `callerUserId(req)` check the other six already used, evaluated **before** the body is read. The anon key is public by construction, and this function spends the project's FatSecret / Edamam credentials |
| *"food-search answers a bare-anon-key caller instead of refusing it"* → *"…refuses the bare anon key before reaching Open Food Facts"* | anything but `401` — the proxy ran and called OFF under the project's User-Agent | `401 "unauthorized"` | Same check, same position. Abuse was attributable to the project and could get the "Base mondiale" tab blocked for every patient |
| *"a config error is reachable with the public anon key alone"* → *"an unauthenticated caller gets 401, not a configuration error"* + *"a real patient and the public key are no longer indistinguishable"* | `anon.status === authed.status`, both `500 "not configured"` | `401`, and the two statuses now **differ** | `analyze-meal`'s caller check moved above the body parse and the `GEMINI_API_KEY` guard. The checks themselves are unchanged — only their order |
| *"input validation also precedes the feature-lock check"* → *"input validation no longer precedes authentication"* | `400` for a malformed body with no authentication | `401` | Same reorder. The 400 is still there for an authenticated, unlocked caller |
| `it.skip` *"a locked feature is refused server-side — needs provider secrets to verify"* | **skipped** — the lock was unreachable behind the config guard | four real assertions, **no skip** | The reorder above put the lock ahead of the config guard, so a locked patient's `403 "feature locked"` is observable on a secret-free local stack. See SEC-1 below |

**SEC-1, now verified rather than documented.** The replacement block asserts, on
the local stack with no provider secrets, no stub and no new infrastructure:

- a new patient starts locked (`feature_access.scanner = false`, migration 0013);
- a **locked** patient calling `analyze-meal` with a valid 1×1 PNG gets
  `403 "feature locked"` — before any provider work;
- an **unlocked** patient (service role sets `allowed = true`) passes the lock and
  reaches the request path — the `500 "not configured"` is now reachable *only* by
  an authenticated, unlocked caller;
- the bare anon key is `401` with the scanner both allowed and locked —
  authentication and authorization do not substitute for each other.

The database half was already proven in `rls/selfPromotion.test.ts` (a patient
cannot unlock themselves); this closes the server half.

Also added, not moved: an ordering proof for both proxies (an unparseable body
still answers `401`, so the gate precedes the parse), an authenticated-path
assertion for each (`nutrition-search` reaches its own `400`; `food-search` gets
past the gate — both with **zero** provider contact), and a preflight assertion
that `OPTIONS` stays unauthenticated as the browser requires.

### Step 14 — sync event identity (P5-005 / RC-4, DATA-1)

No clinical fixture moved. Two test **harnesses** were updated because the
production call changed shape, with every assertion preserved:

| File | Change | Why |
|---|---|---|
| `syncMealPush.golden.test.ts` | the Supabase double gained `upsert` beside `insert` | `pushRows` is now an idempotent upsert on the row's own key. The file still asserts WHAT is written (the Step 10 carbohydrate rule), unchanged |
| `syncIdentity.golden.test.ts` (new, 15) | the double now MODELS the primary key: `ON CONFLICT DO NOTHING` skips a row whose id is already stored | Without it, "the same event stays one event" would only be testing the double |
| `computeIOB.golden.test.ts` — *"two identical doses both count"* | **untouched** | Still correct: the engine must count two real injections. Step 14 removed the *cause* of a fake second row, not the counting |

New in Step 14: `syncIdentity.golden.test.ts` (15) and `writeOutcome.golden.test.ts`
(8). Both were written and run green against the OLD code first — recording the
±120 s collapse, the drift duplicate, and a refused write that was
indistinguishable from a successful one — then inverted in place with the old
behaviour kept in the comments.

### Step 13 — bolus input/parameter contract (P7-003, P7-005, P7-006)

All six moved fixtures live in `tests/clinical/computeSmartBolus.golden.test.ts`
and each keeps its BEFORE state in the comment above it.

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"a negative ISF is accepted and produces a negative correction"* | `correctionFactor -50`, `correction -3.5`, `total 1.5` | `correctionFactor 50`, `isfSource 'fallback'`, `correction 3.5`, `total 8.5` | An unusable ISF is not a clinical parameter; it takes the same explicit fallback path as a missing one. The fallback VALUE is unchanged |
| *"BG 0 is treated as no reading"* | `glucose null`, `total 5`, no hypo | `glucose 0`, `glucoseState 'value'`, `total 0`, `hypo` first | 0 is a reading. The hypo threshold itself did not move |
| *"a missing glucose value raises no signal"* | `flags []` | `flags ['noGlucose']`, `glucoseState 'absent'`, `total 5` | The dose policy is unchanged; the silence is not |
| *"a NaN target_low disables the hypo guard"* | `targetLow NaN`, `total 5`, no hypo | `targetLow 70`, `targetSource 'fallback'`, `total 0`, `hypo` | A safety control may not vanish. The app's existing 70–180 applies |
| *"an mmol/L-magnitude value is interpreted as mg/dL"* | one fixture | split in two: unlabelled 5.6 → unchanged (still mg/dL, still hypo); explicit `mmol/L` → 100.9 mg/dL, no hypo | The unit is now part of the contract; the default for an unlabelled value is unchanged |
| Two valid-input fixtures + the P7-001 KNOWN-BAD one | `flags []` | `flags ['noGlucose']` | Those fixtures supply no reading. **No dose changed** |

`ratioForMeal`'s two KNOWN-BAD fixtures (10 g/U substitution, snack ratio) and
every RU-11-owned fixture (P7-002, P7-004, P7-009, P7-010, P7-011) are
**untouched and still red-flagged**.

New in Step 13: `tests/clinical/bolusContract.golden.test.ts` — 33 fixtures,
written and run green **before** the change (recording the call-site `0 → null`
collapse, mixed-unit trend history, unknown-vs-zero carbohydrate, the unread
`noRatio` flag, inverted and non-finite targets, and a fallback ISF
indistinguishable from an entered 50), then inverted in place.

### Step 12 — catalogue trust boundary (P2-003, NUTR-B5)

| Fixture | Was | Is | Why |
|---|---|---|---|
| `carbProvenanceProviders.golden.test.ts` — *"reads a stored 0 as a known zero"* → now *"reads a stored 0 on a TRUSTED row as a known zero"* | A `product_catalog` row declaring `carbs: 0` came back `carbs_known: true` regardless of who wrote it | Same assertion, but the fixture row now states `source: 'openfoodfacts'` | The trust columns were not read at all before Step 12, so "bread, 0 g of carbohydrate" typed by any patient was equally dosable. A declared 0 is still a known zero — **on a row somebody authoritative stands behind**. The demoted case (an unverified `user` row declaring 0) is asserted in `catalogTrust.golden.test.ts` |
| `tests-security/rls/catalog.test.ts` — the `KNOWN-BAD BASELINE` block | Annotation said the exposure was unaddressed | **Assertions unchanged.** Annotation now records that the write is still possible (no policy, RPC or schema change) while the client no longer doses from such a row | Step 12 is a client-side trust decision; the database-level exposure is deliberately still open (see N-12…N-14 in the plan) |

New in Step 12: `tests/domain/catalogTrust.golden.test.ts` — 26 fixtures. It was
written **before** the change, pinning the two unsafe behaviours (an unverified
user row returned rank-1 with `carbs_known: true` and no provider consulted; a
memo with no lifetime), both of which are now inverted in place with the old
behaviour recorded in the comments.

---

## Determinism

`tests/setup.ts` pins `process.env.TZ = 'UTC'`. Three separate modules read
device-local time: `guessMealTime()` (meal ratio), `isoDay()` (calendar-day
bucketing in the report) and `slotOf()` (time-of-day slots). Without the pin
those fixtures would pass on one machine and fail on another. All time-dependent
fixtures are anchored to `NOW = 2026-01-15T12:00:00.000Z` and express
expectations in UTC.

That these modules read device-local time at all is finding **P7-004**; pinning
the timezone makes the behaviour reproducible, it does not change it.

`programEngine` additionally reads the **wall clock** — `ageFrom()` and the goal
projection both call `new Date()` — so those tests use `vi.useFakeTimers()` and
`vi.setSystemTime(FROZEN)`. `buildReportStats` takes `now` as a parameter and
needs no fake timers.

---

## Test-only stubs

Two modules in scope import React Native, AsyncStorage or Supabase at load time
while the functions under test touch none of them. They are stubbed with
`vi.mock` inside the test files:

| Test file | Stubbed | Reason |
|---|---|---|
| `nutritionScaling.golden.test.ts` | `@/i18n`, `nutrition/cache`, `nutrition/providers/remote` | `rescaleItem` / `aggregateItems` are pure; the module's other imports are not |
| `sanitizeAction.golden.test.ts` | `@/lib/supabase`, `@/services/geminiLive`, `@/store/useAppStore`, `@/services/data`, `@/services/reminders` | `sanitizeAction` is pure; `aiLogger.ts` is not |

The i18n stub echoes `key:params`, so the assertions characterize **what the
engine hands the translator**. The rendered string comes from the locale files
and is outside these units.

## Catalogue write-side fixtures moved in Step 20B (N-12, N-13)

`tests-security/rls/catalog.test.ts`, against a database rebuilt from zero.

| Fixture | Was | Is | Why |
|---|---|---|---|
| *"an unverified row can be updated by any signed-in user"* → *"a direct update cannot touch a row the caller did not contribute"* | the update succeeded and returned the rewritten row — recorded as *"shared editability, by design"* | RLS filters it: `data` comes back `[]` and the stored carbohydrate is unchanged | **N-12.** `using (not verified)` carried no ownership predicate, so any patient could rewrite any unverified row by hand |
| *(new)* *"a contributor may still correct their OWN row directly"* | — | succeeds | The rule is ownership, not a freeze |
| *(new)* *"another patient cannot rewrite that row either"* | — | `[]`, value intact | — |
| *(new)* *"a user-sourced call can no longer overwrite an authoritative value"* | `p_source='user'` replaced name and every macro | 12 g stays 12 g, 90 kcal stays 90 kcal, name intact, `source` still `openfoodfacts`, `scan_count` still bumped | **N-13.** The override branch is gone; fill-gaps-only applies to every caller |
| *(new)* *"a patient filling a genuine GAP is recorded, and downgrades the trust label"* | a filled gap left the row labelled `openfoodfacts` | `carbs` filled, `calories` untouched, `source` becomes `user` | The sharper half of N-13: the client's Step 12 read rule trusted a laundered row |
| *(new)* *"a caller cannot UPGRADE a row trust label"* | — | a `p_source='openfoodfacts'` bump on a `user` row leaves `source='user'`, still counts the scan | Closes the `bumpCatalogScan` laundering path |
| *(new)* *"the RPC still lets one patient contribute to another patient's row"* | — | A's value stands, B's gap-fill lands, counter = 2 | Community contribution is preserved — the reason N-12 and N-13 had to move together |
| *(new)* *"a verified row is still frozen against the RPC"* | (existing guarantee) | unchanged | No regression |

**Unchanged and still red:** the P2-003 KNOWN-BAD block in the same file — a
patient can still WRITE a carbohydrate other patients read, and no plausibility
bound exists at the database level. Step 20B narrowed *who may overwrite what*
and *what a row may claim about itself*; it did not make the catalogue
authoritative, and Step 12's client-side demotion is untouched.

New in Step 20B: `tests-security/rls/clinicalParams.test.ts` (9) — N-17 and N-7
constraint behaviour, including that a genuine zero and an implausible-but-
positive plate both remain storable.

## BOLUS-A1 — a carbohydrate in the URL (Step 21)

`tests/domain/bolusHandoff.golden.test.ts`, recorded **before** Step 21.

| Fixture | Finding | Behaviour recorded | Owning RU |
|---|---|---|---|
| *"the programme screen puts the carbohydrate in route params"* | **BOLUS-A1** | `program.tsx` navigates to `/bolus` with `params: { carbs, meal }` from two places — the "I ate it" confirmation (`carbs: String(Math.round(plannedMealResult(...).carbohydrates))`) and the "my dose" shortcut (`carbs: String(nextMeal.carbs)`) | **RU-4** |
| *"the bolus screen reads them out of the query string"* | **BOLUS-A1** | `useLocalSearchParams<{ carbs?: string; meal?: string }>()` | RU-4 |
| *"no in-memory hand-off exists for the bolus screen"* | **BOLUS-A1** | the Step 9 mechanism (`programDraft.ts`) was never extended to this route | RU-4 |

On web those values are browser history, the `Referer` of the next outbound
request, and any access log in between — and they are tamperable before the
engine reads them.

### Moved in Step 21

| Fixture | Was | Is | Why |
|---|---|---|---|
| all three above | carbohydrate and meal slot in the query string | a one-shot in-memory hand-off (`bolusHandoff.ts`), `/bolus` navigated to with **no params at all** | Same privacy principle and the same mechanism as Step 9. The VALUES and their string shapes are unchanged, so `carbSeed` and every `Number(x)` on the consuming side behave identically |

**Not persisted, deliberately** — no AsyncStorage, no zustand `persist`: a
carbohydrate written to disk would be a new copy of health data to protect, and
every persisted store here needs account scoping to stop a shared phone leaking
one account's data to the next. The module value dies with the JS context.

---

## Nutrition verdict & classification fixtures — Step 22A

`tests/domain/nutritionClaims.golden.test.ts` (33). Blocks 1–3 were recorded
**green against the pre-Step-22A tree** and are the proof that Step 22A moved no
arithmetic; blocks 5–6 are the remediation.

### Recorded BEFORE, still green — the arithmetic Step 22A must not move

| Fixture | Value pinned |
|---|---|
| the 480 kcal screenshot scores 95, "Excellent", grade A | `100 − 10 (GI 70 → the score's MODERATE band) + 5 (protein ≥ 20 g)` |
| its calories vs macros | `50×4 + 50×4 + 9×9 = 481` against 480 shown — consistent |
| an unidentified plate scores **100** | no data ⇒ no penalty ⇒ full marks. `aggregateItems([])` still stores `meal_score: 100` |
| a good plate 100, a bad plate 35 → grade D | the ranking itself is unchanged |
| the A–E boundaries 80 / 65 / 50 / 35 | unchanged (also pinned by the Step 16 fixtures) |

### KNOWN-BAD, unchanged — nutrition-policy calls for RU-3

| Fixture | Why it is not fixed here |
|---|---|
| *"the WORD boundaries are 85 / 70 / 50, so they disagree with the letter"* — a score of **80** is grade **A** and the word *"Bon"* | Reconciling them means moving one of two app thresholds: a nutrition-policy choice, not an engineering one |
| *"the barcode screen adds a THIRD set of boundaries (70 / 50)"* | Same reason |
| *"the score calls 70 MODERATE — its harsh band opens at 71"* while `giBand(70) === 'high'` | Aligning it changes a patient-facing number (95 → 83 on the screenshot plate) |
| *"the engine warns high GI from 66"* while `giBand(66) === 'medium'` | Moving it would REMOVE a safety warning. Warning earlier is the safe direction |
| *"the day badge reuses the word boundaries over a MEAN"* | The badge's own semantics are 22C/23 work |

### Changed by Step 22A — a verdict now needs evidence

| Before → after | Before | After | Why |
|---|---|---|---|
| *"nothing applies the evidence to the score, letter or tip"* → *"every surface that shows a verdict gates it"* | `advice.ts` exported no gate; `scan-result`, `LastMealCard`, `barcode`, `menu-scan` rendered `quality.score` unconditionally | `qualityEvidence` / `qualityClaimSupported`, consumed by all four plus the meal PDF and `dayScore` | A verdict computed from placeholder zeros is not a verdict |
| *"an unidentified plate scores 100/100 Excellent A balanced meal"* → *"— · Non évalué · no letter · the reason"* | the screen praised a plate it had failed to identify | an explicit not-rated state, never a manufactured low score | Absence of data is not evidence of quality |
| *"a 100 from an unidentified plate feeds the day average"* → *"unrated meals are excluded"* | two meals (60 real + 100 unidentified) → badge **80** | → **60**; a day of only unrated meals returns `null` and the badge hides | Same rule, one step further out |
| *"the badge filter and the verdict gate are two rules"* → *"…are ONE rule"* | `displayableHighlights` had the predicate inline | both call `qualityEvidence` | One rule decides what the screen may claim |
| *"the chip carries the GI boundaries inline"* → *"the chip delegates to `giBand`"* | `value <= 55` / `value <= 69` in `GlycemicBar.tsx`; the menu screen reddened from **66** | `giBand()` — low ≤ 55 · medium 56–69 · high ≥ 70, the standard already in use | One classification for the whole app; only the menu chip's 66–69 moved, and it moved INTO agreement |
| *"nothing says the letter and the score are the same number"* → *"the note says it, in four locales"* | `mealGradeNote` named the indicator only | *"…it is the letter form of the health score below, not an official Nutri-Score"* | The Step 16 claim is preserved and the relationship is now explicit |

**Not rewritten**: `scoreMeal`, `mealGrade`, `buildHighlights`, `aggregateItems`
and every stored `meal_score` / `highlights` row. The gate is a DISPLAY filter,
exactly like Step 18's — no migration, no edit of a patient's history.

---

## Nutrition completeness & provenance fixtures — Step 22B

`tests/domain/nutrientCompleteness.golden.test.ts` (30) plus three additions to
`tests/domain/syncMealPush.golden.test.ts` and one to
`tests/domain/nutritionScaling.golden.test.ts`. Every block was first recorded
**green against the pre-Step-22B tree**; the parity block is what proves no
valid plate's arithmetic moved.

### Recorded BEFORE, still green — what Step 22B must not move

| Fixture | Value pinned |
|---|---|
| a fully declared two-food plate | `300 kcal · 46 g carbs · 5 sugar · 10 protein · 6 fat · 7 fibre · 160 sodium · GI 61 · score 95` |
| a valid rescale to 150 g | `180 kcal · 40.5 g carbs · 12 protein · 450 sodium` |
| the micronutrient + hydration estimate for a valid plate | unchanged; `estimateMealWaterMl` = `0.92 × 200 = 184 ml` |
| a weakly identified food still contributes IN FULL | `nutrition_confidence: 0.2` scores identically to `0.95` |
| the Step 22A 480 kcal case | untouched — it lives in `nutritionClaims.golden.test.ts` and is re-verified in Demo Mode |

### Changed by Step 22B — silence is no longer a zero

| Before → after | Before | After | Why |
|---|---|---|---|
| *"an absent nutrient is indistinguishable from a declared 0"* → *"an ABSENT nutrient is now distinguishable"* | `readNutriments({protein: 0})` and `readNutriments({})` both gave `protein: 0` with nothing to tell them apart | the VALUES are identical; `per100g.known.protein` is `true` vs `false` | A provider declaring 0 and a provider saying nothing are different facts |
| *"only `carbs_known` survives the aggregation"* → *"…and now every other nutrient can too"* | a plate whose protein total was a FLOOR presented exactly like a complete one | `nutrients_known` on the result, as strict as `carbs_known`: one unknown food makes the sum a floor | The number is unchanged; the claim about it is not |
| *"NaN grams give NaN nutrition and a 100/100 score"* → *"…give an explicitly unknown item"* | `NaN` portion → NaN calories/macros/vitamins/hydration; `(NaN ?? 0) <= 0` is false so the plate read as SUPPORTED and `scoreMeal` awarded **100** | `isUsablePortion` at the boundary: placeholder zeros, `portion_valid: false`, every nutrient unknown — and `qualityEvidence` rejects a non-finite energy | Not a plausibility rule: no upper bound is invented, a 2 kg portion is as valid as ever |
| *"Infinity and −100 g take their own paths"* → *"…take the same path"* | `Infinity` gave infinite nutrition, `−100 g` gave negative macros, and the item kept `-100` as its weight | all three (`∞`, `< 0`, `0`) yield the same explicit unknown, `portion_grams: 0` | A negative weight must not survive to be re-multiplied by a later edit |
| *"`fieldsFound` is computed and read by nothing"* → *"the completeness it counted is now readable"* | seven fields counted per provider, consumed nowhere | `nutritionCompleteness` → `declared \| partial \| estimated \| unavailable` + the missing nutrients, on the screen and in the PDF | Deliberately NOT a percentage — seven fields are not seven equal facts |
| *"the offline push gates only the carbohydrate"* → *"…obeys the Step 22B rule"* | a floor protein landed in `meal_scans.protein`, a column the dashboard reads as a total | both writers go through `mirrorColumn`; a declared 0 still writes `0`, a legacy row is written exactly as before | A meal saved on a plane must say what one saved on wifi says |
| *"the carbohydrate floor is honest on ONE screen"* → *"…on every screen"* (NUTR-A9) | `≥ 62 g` on the analysis screen; `62 g` in the day total, the slot rows, the meal sheet, the home ring, the home timeline and the home card | one `carbDisplay` + `carbText` rule, imported by all five files | The signal existed since Step 10; it simply stopped travelling |

### KNOWN-BAD after Step 22B — still red, by instruction

| Fixture | Why it is not fixed here |
|---|---|
| *"OPEN FOR RU-3 — the arithmetic is deliberately unchanged"* — a 0.1-confidence food still contributes its full nutrition (**NUTR-B3**) | Any cut-off answering it (0.5? 0.7?) would be invented here. Step 22B labels the grams; it does not reweight them |
| *"OPEN FOR RU-3 — a DECLARED 0 kcal is still not a verdict"* | Step 22B *can* now tell a declared 0 kcal from an absent one, so the gate COULD let a diet drink through. Letting it would hand a glass of water "100/100 · Excellent" — the exact claim Step 22A withholds. Reversing that is nutrition policy |
| *"NUTR-A8 — the ratio is still taken against the typed carbohydrate"* | `sugarHeavy` divides the last SCANNED meal's sugar by the carbohydrate TYPED into the bolus screen; the two need not describe the same food. It is provenance, not a threshold — but the only place to fix it is inside `computeBolus`, which Step 22B may not touch. The flag drives one advice line and no arithmetic (pinned) |
| everything Step 22A left open | the 80–84 letter/word overlap, the barcode 70/50 bands, `scoreMeal`'s `gi > 70` gate, `warn:high_gi` at 66 |

---

## Scientific-audit fixtures — Step 22C

`tests/domain/nutritionScience.golden.test.ts` (37). This file pins **authority**,
not behaviour: for every displayed number it records whether the value is
REFERENCE, CALCULATED, ESTIMATED, HEURISTIC or POLICY, so that moving a constant
can never again be silent. **Step 22C changed no formula, weight, threshold or
constant** — the only production change was three captions, and the last three
fixtures are what prove they are on screen and in the PDF.

### Recorded as CORRECT — the parts that are what they claim

| Fixture | What it establishes |
|---|---|
| the GI bands are ≤ 55 / 56–69 / ≥ 70 | REFERENCE — the international classification |
| the GL buckets are < 10 / 10–20 / > 20 | REFERENCE — the standard cut-offs, correctly implemented |
| high GI + low GL is coherent | a 10 g-carbohydrate serving of a GI-72 food is a load of 7. Two questions, two answers, both right |
| energy is deliberately not forced to 4/4/9 | alcohol (7 kcal/g) and polyols (~2.4) legitimately break the identity; Step 11 recorded the decision and nothing downstream assumes otherwise |
| the AI is never handed `meal_score` | it cannot repeat a verdict it never receives |
| 480 kcal → 95 → A | mathematically exact: `100 − 10 (GI 70 in the score's ">55" band) + 5 (protein ≥ 20 g)`, and `95 ≥ 80` |

### KNOWN-BAD — unsupported assumptions, now pinned

| Fixture | Why it is not fixed here |
|---|---|
| *"fat is never scored, in any amount"* | a plate with 0 g and one with 200 g of fat score identically. Defensible for a glycemic indicator, not for something labelled a **health** score. Adding a fat rule is a nutrition-policy change → RU-3 |
| *"the scale is per PLATE, not per 100 g"* | twice the food is a different letter, so two meals are not comparable. Deliberate, but unstated on screen |
| *"the clamp hides accumulated bonus, and the floor hides accumulated harm"* | two plates that are not equally bad both read the same score once the scale saturates |
| *"an UNKNOWN index is silently assumed to be 55"* (**NUTR-A5**) | `glycemicLoad(carbs, 0)` invents a moderate index and returns a bucket that looks measured; `buildHighlights` can then award `low_glycemic_load` from data no source supplied |
| *"the LOAD spans carbohydrate the INDEX never covered"* | the index is averaged over the carbs that have one, then multiplied by all of them. Step 22C says so on screen and in the PDF; the arithmetic is unchanged |
| *"three different answers to «is 70 high?»"* | chip says high, score charges the moderate penalty, engine warns from 66 |
| *"the letter and the word still disagree over 80–84"* | an "A" the screen calls *"Bon"* |
| *"two of the five reference intakes are the PRE-2016 FDA values"* (**NUTR-A12**, new) | calcium 1000 mg and potassium 3500 mg were replaced by 1300 mg and 4700 mg. Both **overstate** coverage (~30 % and ~34 %). Correcting them moves a displayed percentage → RU-3 |
| *"the model cannot tell two foods in a group apart"* | spinach and iceberg lettuce are one food to the density table. Structural, and already labelled as an estimate since Step 17 |
| *"food water counts fully toward a DRINKING goal"* | the ring says *"of your water needs"* and is filled by water held in food |
| *"kcal ÷ {5, 12, 8.5, 9.5}, no patient metric at all"* (**NUTR-A10**) | four constants for one hypothetical 70 kg adult. Replacing them with MET × weight moves every minute shown → RU-3. Step 22C labels them instead |
| *"Mifflin-St Jeor, with an assumed activity factor"* (**NUTR-A6**) | the equation is validated; the 1.45 factor, the assumed age 30 and the flat 2000 kcal fallback are not measurements. Step 22C says which case the card is in |
| *"the remaining-macro split is a fixed 25 / 50 / 25"* | an app choice presented as the patient's allowance |
| *"the barcode screen keeps a THIRD set of verdict bands"* | 70 / 50, agreeing with neither the letter nor the word |
| *"the DAY badge reuses the meal words over a different quantity"* | `0.6 × TIR + 0.4 × mean meal score`, labelled with the meal vocabulary. The blend weights are an app choice |
| **NUTR-A11 (new)** — *"the doctor report prints a carbohydrate FLOOR as a total"* | `reportStats.ts` sums `result.carbohydrates` with no provenance check; `reportHtml.ts` prints the sum. Every patient screen learned this in Step 22B; the medical document did not. **→ Step 23** |
| *"nothing tells the patient the /100 is the app's own heuristic"* | the LETTER has said so since Step 16; the number has not. Wording change awaiting RU-3 |

### Changed by Step 22C — three claims the screen no longer makes

| Before → after | Before | After |
|---|---|---|
| burn minutes | four numbers, no qualifier | *"Rough guide for an adult of about 70 kg at moderate intensity — it does not take your weight, age or fitness into account"*, on screen **and** in the PDF |
| calorie goal | *"X % of **your** daily calories"* against an unexplained figure | says whether the goal came from the profile (Mifflin-St Jeor + assumed light activity) or is the flat 2 000 kcal default |
| glycemic load | a bucket beside an index covering only part of the plate | *"The load multiplies this index by the plate's whole carbohydrate, while the index covers only {{pct}} % of it"* when coverage < 100 % |

**Not rewritten:** `scoreMeal`, `mealGrade`, `glycemicLoad`, `giBand`,
`estimateMicros`, `estimateMealWaterMl`, `waterGoalMl`, `burnMinutes`,
`dailyCalorieGoal`, the DV table, the density tables, the water fractions and
the GI category table. Not one displayed number moved.

---

## RU-3 — the nutrition decision package

Every nutrition-policy question this baseline defers to "RU-3" is now written up,
numbered **D1–D20**, with options and worked cases, in
[docs/RU3-NUTRITION-DECISIONS.md](RU3-NUTRITION-DECISIONS.md). The figures it
quotes are pinned by the *RU-3 evidence* block of
`tests/domain/nutritionScience.golden.test.ts` — including the case that decides
D1: a plate of **300 kcal, 33 g fat, 2 g protein and no carbohydrate scores
100/100 · Excellent · A**, because fat is never examined.

**Nothing in that package is implemented.** The scorer has not been modified.

---

## Removed by decision — Step 22D, Phase 1: the A–E letter

`tests/domain/mealGrade.golden.test.ts` (20 fixtures) was **deleted, not
silently dropped.** This section is the record the implementation spec requires,
so that what it protected is not lost with it.

**Decision reference:** [SCORING-IDENTITY-DECISION.md](SCORING-IDENTITY-DECISION.md)
§5 and its challenge round; [SCORING-IMPLEMENTATION-SPEC.md](SCORING-IMPLEMENTATION-SPEC.md)
Phase 1.

**Why the letter went.** It was `mealGrade(score)` — the same 0–100 number
re-cut at 80/65/50/35. It carried no information the score does not carry, its
bands were never given a defined meaning, it contradicted the word bands
(85/70/50) over 80–84 (an "A" the screen called *"Bon"*), and being computed per
PLATE it looked like a grade for the food while being a grade for the serving.

**What those fixtures protected, and where that protection now lives:**

| The deleted fixture asserted | Where it lives now |
|---|---|
| the A–E boundaries 80 / 65 / 50 / 35 | nowhere — the function is deleted. The boundaries no longer exist to protect |
| the letter is a pure function of the score | nowhere — same reason |
| **the five badge hexes are NOT the official front-of-pack palette** | the constraint is preserved in prose in `mealScore.ts`'s header, and no palette remains to violate it |
| **NUTR-A1: this score is not a Nutri-Score** | `mealScore.ts` header, and `nutritionScience.golden.test.ts` now asserts that header text is present |
| every locale defines the grade label / sub / note, all four distinct | the four keys are deleted from all four locales |
| the screen and the PDF render the label, sub and note | both call sites are deleted |

**Two known-bad entries are CLOSED by this deletion**, not deferred:

- *"the WORD boundaries are 85 / 70 / 50, so they disagree with the letter"* —
  there is no letter left to disagree with. The word bands themselves are
  unchanged and remain open under RU-3 D10.
- the per-plate **food-grade illusion** — a letter that looked like a property of
  the food. The score still is per plate, and that remains open (D8), but it no
  longer wears a food-label costume.

**Still open, untouched by this phase:** the barcode screen's third band set
(70/50) and the doctor/admin panel's fourth (70/45) — both RU-3 D10, both
Phase 3.

**No formula changed.** `scoreMeal` was not modified: the same eight rules, the
same thresholds, the same weights, the same clamp. Every stored `meal_score`
keeps its value, and nothing was recomputed or migrated.
