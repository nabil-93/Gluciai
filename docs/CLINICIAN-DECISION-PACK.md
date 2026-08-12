# CLINICIAN DECISION PACK — GluciAI

**Prepared 2026-08-10, against `main @ 43da9f1` plus the remediation pass.**
Every number below was produced by running the application's own code, and each
is pinned by a test fixture that will fail deliberately when the behaviour
changes.

---

## How to use this document

There are **six** questions. Engineering has deliberately answered none of them,
and must not: each one changes either an injected insulin dose or a nutrition
claim shown to a patient.

**Ask D-1 first, on its own.** Every other GI/GL question assumes its answer is
yes. If it is no, the composite indicator falls with it and part of D-5
disappears — so answering D-5 first risks deciding something D-1 deletes.

Then **one session** for D-2 (all of it together — the parts interact), D-3,
D-4 and D-6.

For each question you will find: what the code does today, a worked example with
real numbers, what the alternative produces, the safety consequence, what
evidence exists, and the precise decision needed.

**Where the evidence line says EVIDENCE NOT FOUND, that is literal.** No
justification was invented to fill the gap.

---

# D-1 · Can a carbohydrate-weighted mean GI describe a mixed plate?

**Ask this one first.**

### Current behaviour
The engine computes a carbohydrate-weighted mean of the per-food glycemic
indices, substituting `ASSUMED_GI = 55` for any food with no published index,
and reports what share of the plate's carbohydrate the index actually covers
(`gi_carb_coverage`). The result is presented on screen and in the PDF as **this
meal's glycemic index**.

Most foods do not carry a measured index. The internal Moroccan table publishes
one for all 60 dishes, but USDA, Open Food Facts, FatSecret, Edamam and the AI
estimator return none — so `GI_BY_CATEGORY` supplies a category prior
(Rice 70, Bread 70, Pasta 50, Legumes 32, Vegetable 35, Fruit 45, Dairy 35,
Dessert 65…). It is flagged `glycemic_index_estimated`, so it is disclosed.

### Real example
400 g cooked lentils (GI 32, 80.4 g carbohydrate) + 200 g whole-grain bread
(GI 74, 82 g carbohydrate):

```
weighted mean GI = (32 × 80.4 + 74 × 82) / 162.4 = 53
GL               = 53 × 162.4 / 100            = 86
```

### Mathematical result
The weighting is arithmetically correct and verified independently
(`independentNutritionValidation`: a naive mean of the two indices would give 53
here by coincidence, so the fixture uses 100 g lentils + 300 g bread, where the
weighted mean is **68** and the naive mean **53**).

### Alternative
Present **per-food indices only**, with no plate-level number. The composite
survives as an internal sort key for menu ranking, invisible to the patient.

### Safety impact
Published GI values are measured on single foods, in isolation, in fasted
subjects, against a glucose reference. A mixed plate's fat, protein and fibre
change gastric emptying. If the composite is not a meaningful quantity, the app
is putting a number labelled "glycemic index" in front of a patient who may
plan a meal around it.

### Evidence
Mixed-meal GI is contested in the literature. The project's own
`SCORING-MODEL-PROPOSAL.md` §4.1 already records that the GL cut-offs
(<10 / 10–20 / >20) were derived for single food **servings**, not plates.
**EVIDENCE NOT FOUND** for applying either to a composite plate.

### Decision required
1. May a carbohydrate-weighted mean GI be presented as the plate's index — yes or no?
2. If yes: is there a coverage floor below which no plate-level GI may be claimed?
   (That floor is itself a new clinical number and needs its own answer.)
3. If yes: may `ASSUMED_GI = 55` stand in for an unknown food, or must an
   unindexed food suppress the plate-level number entirely?

### Files and fixtures
`nutrition/engine.ts` (weighted mean, `GI_BY_CATEGORY`),
`interpret/glycemic.ts` (`ASSUMED_GI`, `effectiveGi`, `glValue`).
Pinned by `glycemicHonesty` (11), `nutritionScience`, `independentNutritionValidation`.

---

# D-2 · The dosing arrangement (RU-11 Q1–Q14)

**The 14 questions interact. Answer them in one sitting, not piecemeal.**

## D-2a — IOB is scaled by every adjustment factor (Q1–Q3)

### Current behaviour
```
raw = (mealBolus + correction − IOB) × activity × trend × sick × stress × status × alcohol
```
The insulin **already in the patient** is multiplied by factors that describe
the **requirement**.

### Real examples — measured, not estimated

| Scenario | App | IOB-subtracted-last | Difference |
|---|---|---|---|
| 60 g · BG 120 · IOB 3 U · intense exercise (×0.75) | **2.3 U** | 1.5 U | **+0.8 U** |
| 60 g · BG 120 · IOB 3 U · illness (×1.15) | **3.5 U** | 3.9 U | −0.4 U |
| 60 g · BG 120 · IOB 3 U · stress (×1.10) | **3.3 U** | 3.6 U | −0.3 U |
| 60 g · BG 120 · IOB 3 U · exercise + illness | **2.6 U** | 2.2 U | +0.4 U |
| **BG 300 · 60 g · IOB 7.5 U · intense exercise** | **1.5 U** | **0 U** | **+1.5 U** |

The gap is exactly `IOB × (1 − factor)`. Factors below 1 (exercise, falling
glucose, alcohol) make the app dose **higher**; factors above 1 (illness,
stress) make it dose **lower**.

### Safety impact
The exercise direction is the dangerous one: it adds insulin in precisely the
state where hypoglycaemia risk is already elevated. The last row is a realistic
presentation — hyperglycaemia after exercise with insulin still on board — and
the two arrangements disagree by a unit and a half.

### Evidence
Standard pump-therapy calculators (Walsh; Scheiner) subtract IOB from the
adjusted requirement, i.e. last. **EVIDENCE NOT FOUND** for scaling IOB by an
activity or illness factor.

### Decision required
- Q1 Should IOB be subtracted **last**, outside the factors?
- Q2 Does the same answer apply to factors **above** 1 (illness, stress)?
- Q3 When IOB exceeds the requirement, should the result floor at 0 (today) or
  surface as "surplus insulin on board"?

## D-2b — Premixed insulin contributes nothing to IOB (Q4–Q7)

**Current.** `computeIOB` counts only `insulin_type === 'rapid'`. 12 U of premix
injected 30 minutes ago contributes **0 U**; the identical units logged as rapid
would leave **10.5 U** on board. Since `9d06008` the omission is disclosed on
screen (`mixedInsulinUncounted`); the dose is unchanged.

**Why it is not simply fixed.** The stored row carries one total dose and no
composition, so the rapid fraction is not recoverable from the data model.

**Decision required.** May premix contribute to IOB? At what declared rapid
percentage? Captured per product or per injection? Over what action duration
(today `DIA_HOURS = 4`, linear)?

**Safety impact.** The onboarding wizard tells premix users that their insulin
covers meals and offers them the calculator — so the patients most affected are
the ones being invited to use it.

## D-2c — The remaining questions

| Q | Question | Today's number |
|---|---|---|
| Q8 | May a dose be produced from fallback ICR 10 g/U, ISF 50, target 70–180 when the patient entered nothing? | Empty profile + 60 g → **6.0 U** |
| Q9 | Meal windows read device-local time; 17:59 uses lunch, 18:00 uses dinner | Same 50 g → **5.0 U** vs **10.0 U** |
| Q10 | Should a snack keep borrowing the lunch ratio? | It does |
| Q11 | (see D-4) | |
| Q12 | Should a **planned** session reduce the dose like a completed one? | Both ×0.75 |
| Q13 | Alcohol halves the correction **and** multiplies the total by 0.9 | 8.5 U sober → **6.5 U** |
| Q14 | Does any answer change the meaning of the 20 U ceiling? | `MAX_SAFE_BOLUS = 20`, **EVIDENCE NOT FOUND** |

### Files and fixtures
`services/bolusEngine.ts` almost exclusively. Pinned by `tests/clinical/` —
181 existing fixtures plus the 33 in `independentBolusValidation`, which record
both numbers for every divergence. **These are expected to fail when the answer
lands, and must be re-pinned deliberately, never deleted.**

---

# D-3 · Is there a glucose value beyond which a reading is not real?

### Current behaviour
Two guards exist, and neither is physiological:

- **Unit guard (P7-005).** A typed value outside 20–900 mg/dL is refused, so
  5.6 mmol/L cannot be stored as 5.6 mg/dL. *Since the remediation pass this is
  enforced on the bolus screen too — it previously covered only the log screen.*
- **Data integrity (P9-004).** Non-finite readings are excluded from report
  statistics.

There is **no physiological bound**. A finite 900 mg/dL is stored, charted,
averaged into the doctor's report, and usable as a correction input.

### Real example
```
BG 900 mg/dL, no carbohydrate, ISF 50, target 70–180
correction = (900 − 125) / 50 = 15.5 U   → the app recommends 15.5 U
```

### Safety impact
Both failure modes are harmful. Rejecting a genuine emergency reading is
dangerous; letting a typo drive a 15.5 U correction is dangerous. This is why
engineering has not chosen a bound.

### Evidence
The existing 20 / 900 bounds are the app's own, adopted from `aiLogger`'s spoken
-reading guard. **EVIDENCE NOT FOUND** for any physiological ceiling.

### Decision required
Is there such a value? At which boundary does it act — entry, storage, display
or engine? Does a failing reading still count in the doctor's report? Does it
still trigger the hypo guard? (Stored history is never rewritten — project rule.)

---

# D-4 · The correction discontinuity

### Current behaviour
The correction is **gated** at `glucose > targetHigh` but **computed** to
`targetMid`, so it cannot start small.

### Real example
```
target 70–180, ISF 50, mid 125
BG 180 → no correction        → 0 U
BG 181 → (181 − 125) / 50     → 1.1 U
```
One mg/dL of measurement noise moves the recommendation by 1.1 U. With a wider
target (80–200) the step is larger still, because mid sits further from high.

### Alternative
Ramp from `targetHigh` instead of stepping to `targetMid`, or apply a
dead-band.

### Safety impact
Glucometers carry ±15 % error. Two readings taken a minute apart can legitimately
straddle the gate and produce 0 U or 1.1 U.

### Evidence
**EVIDENCE NOT FOUND** for either arrangement as the correct one; both appear in
clinical practice.

### Decision required
Should the correction ramp, step, or keep a dead-band? If it ramps, from which
reference — `targetHigh` or `targetMid`?

---

# D-5 · The meal scoring model (RU-3 D1–D20)

### Current behaviour
`scoreMeal` starts at 100 and subtracts fixed penalties:

| Trigger | Penalty |
|---|---|
| GI > 70 / GI > 55 | −22 / −10 |
| sugar > 30 g / > 15 g | −22 / −10 |
| carbs > 80 g / > 60 g | −15 / −8 |
| fibre < 2 g with carbs > 30 g | −6 |
| sodium > 1000 mg | −8 |
| calories > 800 | −8 |
| fibre ≥ 6 g / protein ≥ 20 g | **+5 / +5** |

**Glycemic load does not enter the score. Fat does not enter the score.**

### Real examples — measured

| Plate | GL | Score | Letter | Word |
|---|---|---|---|---|
| 150 g carbohydrate, GI 32, fibre 20 g | **48 (high)** | **95** | **A** | **Excellent** |
| 400 g lentils + 200 g bread (USDA) | **86 (high)** | 77 | B | Good |
| **100 g olive oil** — 884 kcal, 100 g fat | 0 | **92** | **A** | **Excellent** |
| Meal declaring **2400 mg** sodium | 27.5 | 97 | A | Excellent |
| The identical meal declaring **no** sodium | 27.5 | **100** | A | Excellent |

### The four specific defects, each with a number

- **D6 — glycemic load, the one validated meal-level quantity, contributes
  nothing.** A plate at GL 48 scores 95.
- **D1/D2 — fat is not scored at all.** `scoreMeal` contains no `m.fat` term. A
  bowl of olive oil is graded A. Adding a saturated-fat term needs a field the
  app holds nowhere and a provider change; it would be unavailable for most
  Moroccan dishes.
- **D12 — an absent sodium reads as 0**, so a meal that declares 2400 mg scores
  *worse* than one that declares nothing.
- **D10 — four disagreeing band sets.** Word 85/70/50 · letter 80/65/50/35 ·
  barcode 70/50 · doctor panel 70/45. Every score in **80–84** is an "A" that is
  not "Excellent".

Also open: **D9** GI 70 is "high" on the chip and "moderate" to the score;
**D19** a 0.1-confidence food contributes its nutrition in full; **D15** the
calcium and potassium reference values are wrong by ~30 % / ~34 %; **D20** a
declared 0 kcal plate is not scored at all.

### Evidence
`SCORING-MODEL-PROPOSAL.md`'s decisive finding: **no validated per-meal
diet-quality index exists.** Every validated instrument operates on habitual
daily intake. Meal-level **glycemic load** is the exception — it is validated,
and it is the one input the score ignores.

### Decision required
D10 first (it unblocks the band unification), then D5 and "remove sodium's
weight", then the rest. For each: keep, change, or remove. **Do not invent
weights.**

---

# D-6 · Hypoglycaemia first aid in Arabic, German and English

**The code itself declares this a pre-release requirement.**
`src/app/emergency.tsx:151` carries
`TODO(medical-review): … must be double-checked by a clinician / native speaker
before store release`. It is the **only** TODO in the entire source tree.

### Current behaviour
Four "rule of 15" steps exist in all four locales and render correctly (Arabic
verified). French is the reference:

> *"Donnez 15 g de sucre rapide (3 morceaux de sucre, ½ verre de jus)."*

The Arabic, German and English versions are **unverified translations of medical
instructions**.

### Safety impact
These are the instructions a patient follows **during a hypoglycaemic episode**,
in their own language, when they are least able to detect an error.

### Decision required
1. A clinician confirms the four steps are correct.
2. A native speaker of each of ar / de / en confirms the translation is
   clinically accurate — not merely fluent.

### After approval
Correct any wrong string, remove the TODO, and add a fixture asserting all four
steps are non-empty in all four locales so a future edit cannot blank one.

---

## Summary sheet

| ID | Question | Blocks | Worst measured consequence |
|---|---|---|---|
| **D-1** | Mixed-meal GI validity | everything GI/GL | A number labelled "glycemic index" that may not be a quantity |
| **D-2** | Dosing arrangement, 14 questions | release | **+1.5 U** in the exercise + stacking case |
| **D-3** | Glucose plausibility bound | release | A typo drives a **15.5 U** correction |
| **D-4** | Correction discontinuity | release | 1 mg/dL moves the dose by **1.1 U** |
| **D-5** | Scoring model | patient claims | 100 g of oil graded **A · Excellent** |
| **D-6** | Hypo first aid, ar/de/en | release | Wrong emergency instructions |

**None of these is answered. None may be answered by engineering.**
