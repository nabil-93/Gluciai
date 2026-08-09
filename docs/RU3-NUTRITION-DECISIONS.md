# RU-3 — nutrition scientific decision package

**Status: awaiting specialist authorization. Nothing in this document has been
implemented.** No formula, threshold, weight or constant was changed to produce
it, and none may be changed until the checklist in §8 is signed.

This file exists so the scoring work can be authorized **without anyone guessing
a nutritional value**. Every number below was read from the running code and is
pinned by a fixture, so a reviewer can check any claim in one command:

```bash
npx vitest run tests/domain/nutritionScience.golden.test.ts
```

Supporting fixtures: `mealGrade.golden.test.ts`, `nutritionClaims.golden.test.ts`
(Step 22A), `nutrientCompleteness.golden.test.ts` (Step 22B),
`nutritionMicros.golden.test.ts`, `nutritionProvenance.golden.test.ts`.

**The scorer is unmodified.** `src/services/nutrition/mealScore.ts` has not been
touched since it was written; Steps 16, 17, 18, 22A, 22B and 22C changed only
what the screen *claims* about its output, never the output.

---

## 0. The model as it runs today

`src/services/nutrition/mealScore.ts:95-142`, evaluated **per plate** (not per
100 g), on the plate's aggregated totals:

```
score = 100
      − GI penalty        (22 if GI > 70, else 10 if GI > 55, else 0)
      − sugar penalty     (22 if sugar > 30 g, else 10 if sugar > 15 g)
      − carb penalty      (15 if carbs > 80 g, else 8 if carbs > 60 g)
      − fibre penalty     (6  if fibre < 2 g AND carbs > 30 g)
      − sodium penalty    (8  if sodium > 1000 mg)
      − energy penalty    (8  if calories > 800 kcal)
      + fibre bonus       (5  if fibre ≥ 6 g)
      + protein bonus     (5  if protein ≥ 20 g)
score = clamp(0 … 100)

label  = Excellent ≥ 85 · Good ≥ 70 · Moderate ≥ 50 · Poor < 50   (:145-151)
grade  = A ≥ 80 · B ≥ 65 · C ≥ 50 · D ≥ 35 · E < 35               (:55-59)
```

**Nothing else is examined.** Fat, saturated fat, glycemic load, vitamins,
minerals, hydration, calorie density, food groups, portion size in grams, the
patient's own weight, their carbohydrate ratio and their targets are all absent
from the function's inputs.

**The reachable range is [19, 100], not [0, 100].** All six penalties together
total 81 points, so no plate can score below 19; the bottom fifth of the scale
is unreachable, and an "E" (< 35) additionally requires the plate to miss the
protein bonus. Pinned: *"the clamp hides accumulated bonus, and the floor hides
accumulated harm"*.

---

## Phase 1 — every component, one by one

Legend for **Evidence**: **[P]** published nutrition guidance supports the
*direction and rough magnitude*; **[A]** application-defined (the direction is
defensible, the exact number is ours); **[U]** unsupported by anything in this
project.

### 1.1 Glycemic index — `−22 / −10 / bonus-words-only`

| | |
|---|---|
| **Why it exists** | The app is for diabetic patients; GI ranks how fast a carbohydrate is absorbed |
| **What it measures** | Postprandial glucose *velocity*, not the total glucose excursion |
| **Evidence** | **[P]** for the bands (≤ 55 / 56–69 / ≥ 70 is the standard classification). **[A]** for −22 and −10 — the *ratio* 22:10 is ours |
| **Should it remain?** | **Yes** — it is the most disease-relevant input the model has |
| **Defect** | The rule fires at `gi > 70`, so **GI 70 itself is charged the MODERATE penalty** while every other surface calls 70 "high". One number, two answers |
| **Second defect** | The `≤ 40` "low GI" case adds a *reason string* and **zero points**. A genuinely low-GI plate is rewarded with words only |

### 1.2 Sugar — `−22 / −10`

| | |
|---|---|
| **Why it exists** | Free sugars raise glucose fastest and add energy without satiety |
| **What it measures** | Total sugars **from the label**, which includes intrinsic sugars (fruit, milk) — *not* free/added sugars, which is what guidance limits |
| **Evidence** | **[P]** for the direction and rough size (WHO limits free sugars to < 10 % of energy, ~50 g/day, with a conditional < 5 %, ~25 g). **[A]** for 30 g/15 g per meal |
| **Should it remain?** | **Yes**, with the caveat below |
| **Defect** | Because the figure is *total* sugars, **200 g of plain yoghurt or a large fruit salad is penalised like a dessert**. The app cannot distinguish them: no provider field for added sugar is read |

### 1.3 Carbohydrate — `−15 / −8`

| | |
|---|---|
| **Why it exists** | Carbohydrate quantity is the primary determinant of the postprandial excursion |
| **What it measures** | Grams on the plate |
| **Evidence** | **[A]** entirely. No guideline defines a per-meal carbohydrate ceiling — it depends on the patient's insulin regimen, ratio and targets |
| **Should it remain?** | **Question D3.** It is the rule most in tension with the rest of the app: the patient has an insulin-to-carb ratio in their profile, and **the score ignores it**. A 90 g plate is "bad" for everyone, including a patient who doses for it correctly |
| **Defect** | Penalising carbohydrate *per se* can push a patient toward under-eating carbohydrate rather than dosing for it |

### 1.4 Fibre — `+5 / −6`

| | |
|---|---|
| **Why it exists** | Fibre blunts the glucose rise and most patients under-consume it |
| **What it measures** | Grams per plate |
| **Evidence** | **[P]** for the direction (adequate intake commonly cited at 25–38 g/day, so 6 g is a reasonable per-meal share). **[A]** for +5 / −6 and for the `carbs > 30` condition on the penalty |
| **Should it remain?** | **Yes** — one of the two best-founded rules |

### 1.5 Protein — `+5`

| | |
|---|---|
| **Why it exists** | Satiety, muscle maintenance, and a lower glycemic impact per calorie |
| **What it measures** | Grams per plate |
| **Evidence** | **[A]**. The ~20 g/meal figure appears in the sports- and ageing-nutrition literature for muscle protein synthesis; it is **not** a diabetes guideline, and nothing caps it |
| **Should it remain?** | **Question D4.** It is unconditional and unbounded: **200 g of protein earns the same +5 as 20 g**, and a plate of processed meat earns it identically to fish or lentils. It also cannot be lost — there is no protein *penalty*, so the rule is a one-way ratchet |

### 1.6 Sodium — `−8`

| | |
|---|---|
| **Why it exists** | Blood-pressure risk, elevated in diabetes |
| **What it measures** | mg per plate |
| **Evidence** | **[P]** for the anchor (WHO: < 2000 mg/day, so 1000 mg in one meal is half a day). **[A]** for −8 |
| **Should it remain?** | **Yes** |
| **Defect** | **Sodium is the least-reported field in the whole pipeline.** When a source omits it the plate holds a placeholder 0 (labelled unknown since Step 22B) and the rule silently never fires — so a salty dish from a source without sodium data is scored as if unsalted |

### 1.7 Energy — `−8 above 800 kcal`

| | |
|---|---|
| **Why it exists** | Weight management |
| **What it measures** | Absolute kcal on the plate |
| **Evidence** | **[U]** as written. The threshold is the same for every patient, while the app *already computes* a personalised daily goal two functions away (Mifflin-St Jeor, `scan-result.tsx:151-171`) |
| **Should it remain?** | **Question D5** — keep, personalise, or drop |

### 1.8 Fat — **not scored at all**

The plate's fat can be 0 g or 200 g and **the score does not move**
(pinned: *"fat is never scored, in any amount"*).

| | |
|---|---|
| **Why excluded** | Never documented as a decision. The scorer was written for glucose response, and dietary fat has little acute effect on postprandial glucose |
| **Partial defence** | For a *glycemic* indicator this is arguable |
| **Consequence 1** | **A plate that is essentially fat scores 100/100 "Excellent · A".** 300 kcal, 33 g fat, 2 g protein, no carbohydrate: nothing trips a rule (worked in §5, D1) |
| **Consequence 2** | Two plates identical except 9 g vs 40 g of fat both score **95 → A** |
| **Consequence 3** | The label says **"Score santé" / "health score"**, and a health score that ignores fat is mis-named. This is the single strongest argument that the current model is not fit to carry that word |
| **Consequence 4** | It is why the letter can never be reconciled with a Nutri-Score, and why Step 16 had to rename it (NUTR-A1) |

### 1.9 Saturated fat — **not scored, and not obtainable today**

| | |
|---|---|
| **Status** | The app holds **no saturated-fat figure anywhere** — verified across `src/` and `supabase/functions/` |
| **Upstream availability** | Open Food Facts publishes `saturated-fat_100g` and USDA FDC publishes nutrient 606/1258. **Both are available and neither is read** (`nutriments.ts:95-147`, `usda.ts:14-22`) |
| **Blocking work if adopted** | (1) read the field in both providers; (2) add a nullable column to `product_catalog` — a migration; (3) the **Moroccan internal dataset has no such data at all**, so it would be `unknown` for every Moroccan dish; (4) extend `NutrientKey`, the provenance map and the mirror columns (Step 22B) |
| **Decision consequence** | Under Step 22B's unknown-vs-zero rule, a score rule using saturated fat would be **unavailable for most Moroccan dishes**. Either the rule is optional, or the score becomes unavailable exactly where this app is used most |

### 1.10 Glycemic load — computed, displayed, **not scored**

GL is the figure that actually tracks the portion (`GI × carbs / 100`), it is
shown to the patient with standard buckets — and the score ignores it, using raw
GI and raw carbohydrate grams separately instead. **Question D6.**

### 1.11 Vitamins, minerals, hydration — **not scored**, correctly

They are category-density estimates that cannot distinguish spinach from iceberg
lettuce (Step 22C). Feeding an estimate of that precision into a displayed score
would manufacture confidence. **Recommendation: leave them out** — but it is
**Question D7** because the card sits on the same screen and a patient may
reasonably expect it to count.

---

## Phase 2 — the GluciAI Index

### 2.1 What each letter actually means today

`mealGrade(score)` is a re-cut of the same 0–100 number at 80/65/50/35. **The
letter carries no information the score does not already carry.**

| Letter | Score | What it means *mechanically* | What a patient will read it as |
|---|---|---|---|
| **A** | ≥ 80 | at most one moderate penalty was charged | "this meal is good for me" |
| **B** | 65–79 | one large or two moderate penalties | "acceptable" |
| **C** | 50–64 | two or three penalties | "borderline" |
| **D** | 35–49 | several penalties | "bad" |
| **E** | < 35 | nearly every penalty, and no protein bonus | "avoid" |

**No clinical or nutritional message was ever defined for these bands.** They
were chosen so the letters spread across plausible meals. That is the honest
answer to "what does an A mean": **an A is the absence of penalties, not a
demonstrated quality.**

### 2.2 Coherence with the Health Score — three contradictions

| # | Contradiction | Effect |
|---|---|---|
| **1** | Letter bands (80/65/50/35) and word bands (85/70/50) do not align | A score of **82 is grade "A" and the word "Bon"**, side by side on the same card |
| **2** | The barcode screen uses a **third** set (70/50) for its verdict sentence | The same product can read "A" on one screen and "okay" on another |
| **3** | The day badge reuses the **meal** words over `0.6 × time-in-range + 0.4 × mean meal score` | "Excellent" on the day badge is not the same claim as "Excellent" on a meal |

### 2.3 The structural objection

Because the score is **per plate**, the letter changes with portion size for the
same food: the pinned example scores **90 (A)** at one serving and **55 (C)** at
double. A letter that looks like a food grade but is really a serving grade is
the same category error that made Step 16 rename it away from "Nutri-Score" —
and renaming it did not fix the underlying confusion.

---

## Phase 3 — evidence classification, per rule

| Rule | Published guidance | Application logic only | Unsupported |
|---|---|---|---|
| GI bands ≤ 55 / 56–69 / ≥ 70 | ✅ standard classification | | |
| GI penalty **sizes** (22 / 10) | | ✅ | |
| GI rule fires at `> 70` not `≥ 70` | | | ❌ inconsistent with our own band |
| "Low GI" bonus worth **0 points** | | | ❌ a reward that rewards nothing |
| Sugar direction and rough magnitude | ✅ WHO free-sugar limits | | |
| Sugar thresholds 30 g / 15 g **per meal** | | ✅ | |
| Sugar measured as **total**, not free | | | ❌ penalises fruit and plain dairy |
| Carbohydrate penalty (any) | | | ❌ no guideline defines a per-meal ceiling; ignores the patient's own ratio |
| Fibre direction | ✅ 25–38 g/day adequate intake | | |
| Fibre thresholds 6 g / 2 g and ±5/6 | | ✅ | |
| Protein direction | ✅ satiety / low glycemic impact | | |
| Protein +5 unconditional, uncapped, source-blind | | | ❌ 200 g scores like 20 g |
| Sodium anchor (1000 mg ≈ half a WHO day) | ✅ | | |
| Sodium −8, and silent when the field is missing | | ✅ | ❌ (the silence) |
| Energy 800 kcal, identical for every patient | | | ❌ a personalised goal already exists in the app |
| **Fat: excluded** | | | ❌ for a metric labelled "health score" |
| **Saturated fat: excluded** | | ✅ (no data exists) | |
| Score is **per plate** | | ✅ deliberate | ❌ unstated on screen |
| Starts at 100 and subtracts | | ✅ | |
| Letter bands 80/65/50/35 | | ✅ | |
| Word bands 85/70/50 | | | ❌ contradicts the letter over 80–84 |
| Day badge blend 0.6 / 0.4 | | | ❌ arbitrary, and reuses the meal vocabulary |

---

## Phase 4 — every decision requiring specialist validation

Numbered so a reviewer can answer them individually. **None is answered here.**

| # | Question | Blocks |
|---|---|---|
| **D1** | Should **fat** influence the score? If yes, total fat, saturated fat, or both? | 22D |
| **D2** | Should **saturated fat** be added, accepting that it is unavailable for most Moroccan dishes and requires a migration? | 22D, and a data-model step |
| **D3** | Should **carbohydrate quantity** be penalised at all, given the patient has an insulin ratio? Or should the penalty be relative to *their* ratio/plan? | 22D |
| **D4** | Should **protein** always increase the score? Should it be capped, or conditioned on source? | 22D |
| **D5** | Should the **energy** penalty be personalised to the computed daily goal, kept fixed, or dropped? | 22D |
| **D6** | Should the score use **GL** instead of (or in addition to) raw GI + raw carbohydrate? | 22D |
| **D7** | Should **vitamins/minerals** and **hydration** influence the score? | 22D |
| **D8** | Should scoring be **per meal or per 100 g**? | 22D + every UI surface |
| **D9** | Should the two "low GI" and any other zero-point rules **carry points**, and should the `> 70` gate become `≥ 70`? | 22D |
| **D10** | Should the **word bands** be realigned to the letter bands (or the reverse), and should the barcode screen's third set be removed? | 22D |
| **D11** | Should sugar be measured as **free/added sugar** rather than total, accepting that no provider field for it is currently read? | 22D + provider work |
| **D12** | Should a **missing** nutrient (sodium especially) suppress the rule, suppress the score, or be treated as it is now? | 22D |
| **D13** | Should the **day badge** keep the 0.6/0.4 blend and the meal vocabulary? | 23 |
| **D14** | Should the screen state, in words, that the **/100 is the app's own heuristic**? (The letter says so since Step 16; the number does not) | 22D |
| **D15** | **NUTR-A12** — correct calcium to 1300 mg and potassium to 4700 mg? (Displayed percentages fall ~30 % / ~34 %) | 22D |
| ~~**D16**~~ | ~~**NUTR-A10** — replace the four burn divisors with a MET × weight model?~~ **RESOLVED — already implemented.** `src/services/nutrition/burn.ts` no longer uses the four fixed divisors: it computes `kcal/min = MET × BMR / 1440` from the patient's own Mifflin-St Jeor resting rate, so weight, age, height and sex all enter, and a `basis` field says which convention answered when height or sex is missing. The card and the PDF carry an estimate qualifier. **No decision is outstanding**; this row is kept struck-through rather than deleted so the question's history stays readable | — |
| **D17** | **NUTR-A6** — should the 1.45 activity factor be asked for rather than assumed? | 22D |
| **D18** | **NUTR-A5** — should a GL be shown at all when no index is known (today it assumes GI 55)? **STILL OPEN, but narrowed.** The *dishonesty* half is closed (S1-2): the load is still computed from `ASSUMED_GI`, and the value is unchanged, but the PDF no longer prints "Index glycémique : 0" beside it — it names the index unknown and marks the load as resting on an assumed index, and the sentence that quotes the load as its own evidence is gated on a real index. **What remains for the specialist is the original question: should the load be SHOWN at all in that case, or withheld?** Engineering will not decide it, because withholding a figure a patient currently sees is a clinical judgement | 22D |
| **D19** | **NUTR-B3** — should a weakly identified food contribute its nutrition in full? | 22D |
| **D20** | Should a plate with a **declared 0 kcal** be scored? (Today it is not — Step 22A) | 22D |

---

## Phase 5 — options for each major decision

Presented as choices, **not recommendations to implement**. Every "would score"
figure below is arithmetic on the rules as written, not a change to them.

### D1 — fat

**Option A — leave fat out (status quo).**
*Advantages:* nothing moves; every stored `meal_score` stays comparable; honest
for a purely glycemic indicator; no migration.
*Disadvantages:* the worked case stands — **300 kcal, 33 g fat, 2 g protein, no
carbohydrate scores 100/100 "Excellent · A"**. The word "health" remains
unearned, and the app can be shown to praise a plate of fried food.

**Option B — penalise total fat above a per-meal threshold.**
*Advantages:* closes the worst case with data the app already holds for every
food; no migration, no provider work.
*Disadvantages:* total fat is a poor proxy for harm (olive oil and palm oil score
alike); it would move **every stored score** and therefore every letter and the
day badges; it makes the indicator less purely glycemic.

**Option C — penalise saturated fat only.**
*Advantages:* the nutritionally meaningful variable, and the one the official
front-of-pack schemes use.
*Disadvantages:* requires D2's whole data-model chain, and the value is
**unknown for most Moroccan dishes** — so either the rule is skipped for them
(inconsistent scoring) or their score becomes unavailable.

### D3 — carbohydrate

**Option A — keep the absolute 60/80 g penalties.**
*Advantages:* simple, portion-sensitive, no personal data needed.
*Disadvantages:* contradicts the app's own premise — a patient who doses
correctly for 90 g is told the meal is bad; may encourage carbohydrate
avoidance over correct dosing.

**Option B — score carbohydrate relative to the patient's own ratio/plan.**
*Advantages:* coherent with the bolus engine and the programme; the score would
finally mean "suitable **for you**".
*Disadvantages:* the score becomes patient-dependent, so two patients see
different letters for the same dish; it makes a nutrition display depend on
clinical parameters, which RU-11 governs; stored scores become non-comparable.

**Option C — drop the carbohydrate penalty, keep GI/GL.**
*Advantages:* removes the least-supported rule; GL already carries quantity.
*Disadvantages:* a very large carbohydrate load would lose its only direct flag.

### D4 — protein

**Option A — keep +5, unconditional and uncapped.** Simple; but 200 g of
processed meat earns the same as 20 g of lentils.
**Option B — cap the bonus and/or condition it on the food group.** More
faithful; needs a group→quality mapping the app does not have.
**Option C — remove the bonus.** Removes an unsupported ratchet; loses the
satiety signal, and would lower most Moroccan tagine/meat plates by 5.

### D6 — GI vs GL

**Option A — keep raw GI + raw carbohydrate (status quo).** No change; but the
two rules double-count quantity and ignore the figure the screen calls the one
that matters.
**Option B — replace both with GL bands (< 10 / 10–20 / > 20).** One published
metric instead of two ad-hoc ones, and it is portion-aware by construction;
however GL is only as good as the GI behind it, and today **that GI is assumed
to be 55 whenever none is known** (NUTR-A5/D18) — so B is only safe if D18 is
answered first.

### D8 — per meal vs per 100 g

**Option A — per plate (status quo).** Rates the decision the patient actually
made; but the same food scores differently at different portions, and a letter
implies a food property.
**Option B — per 100 g.** Comparable between foods and portion-independent, as
every official front-of-pack scheme is; but it stops answering "was this meal a
good idea?", which is the question the analysis screen is asking, and it would
change every stored score.
**Option C — keep per plate, drop the letter.** The number stays a serving
judgement and the food-grade illusion disappears; costs the glanceable badge.

### D10 — band alignment

**Option A — align the words to the letters** (Excellent ≥ 80, Good ≥ 65,
Moderate ≥ 50, Poor < 50). One boundary set; "Excellent" becomes easier to earn.
**Option B — align the letters to the words** (A ≥ 85, B ≥ 70, C ≥ 50). Also one
set; every stored plate at 80–84 drops from A to B.
**Option C — show only one of the two.** Removes the contradiction outright.

---

## 6. Recommended future model — a proposal, not a decision

Offered so the specialist has something concrete to accept, amend or reject.

1. **Rename the concept before touching the arithmetic.** While fat is excluded,
   "Score santé / Health score" overstates what is measured. A name such as
   *"glycemic suitability"* would make every current rule defensible **as it
   stands** and is the cheapest honest fix available (D14).
2. **Fix the three internal inconsistencies first** — they need no nutrition
   science: the `> 70` vs `≥ 70` GI gate, the 80–84 letter/word overlap, and the
   barcode screen's third band set (D9, D10).
3. **Give the "low GI" case real points**, or delete it (D9).
4. **Prefer GL over raw GI + raw carbohydrate** (D6), but only after deciding
   what to do when no index is known (D18).
5. **Add total fat** as a mild penalty (D1 option B) rather than waiting for
   saturated fat, and keep saturated fat as a later refinement once the data
   model carries it (D2).
6. **Personalise the energy rule to the computed daily goal** (D5) — the goal
   already exists and is already displayed.
7. **Keep vitamins, minerals and hydration out** of the score (D7).
8. Whatever is decided, **the score must never be recomputed over stored meals**:
   a patient's history should keep the number it was shown, exactly as Steps 16,
   22A and 22B preserved it.

---

## 7. Is the current model suitable for production?

**As a "Health Score": no.** A metric that ignores fat entirely, awards
100/100 to a plate that is essentially fat, and carries the word "Excellent"
cannot be shipped under that name to patients.

**As a glycemic-suitability indicator, with honest labelling: close to yes.**
Its glucose-relevant rules (GI, sugar, fibre, sodium) are directionally
supported; Step 22A stopped it scoring plates with no data; Step 22B made its
inputs' provenance explicit; Step 22C labelled the surrounding estimates. The
remaining blockers for that reading are the three internal contradictions (§2.2)
and the name.

**The GluciAI Index A–E is the weaker half.** It adds no information, its bands
were never given a meaning, it contradicts the word bands over 80–84, and being
per-plate it looks like a food grade while being a serving grade. **It is the
component I would hold back from production first** — it can be removed without
touching a single formula.

---

## 8. What must be decided before Step 22D and Step 23

**Before Step 22D** (rounding, formatting, polish) — 22D must not round or
reformat numbers that are about to be redefined:

- **D1, D3, D4, D5, D6** — the five rules that would change the score itself.
- **D8** — per meal vs per 100 g. This is the largest: it changes every stored
  score's meaning.
- **D9, D10, D14** — the internal contradictions and the naming. These need no
  nutrition science and could be authorized immediately and separately.
- **D15, D16, D17, D18** — the four Step 22C findings that move a displayed
  number (DV constants, burn model, activity factor, assumed GI).
- **D20** — whether a declared 0 kcal plate may be scored.

**Before Step 23** (reporting):

- **D13** — the day badge's blend and vocabulary.
- **NUTR-A11**, already open and *not* an RU-3 question: the doctor report still
  prints a carbohydrate floor as a total. That is a provenance defect with a
  known fix, and it does not need a specialist — it needs Step 23.
- Whether the doctor report may carry the score and the letter at all while
  §7 stands.

**Not blocked by RU-3:** everything that does not touch a nutrition number —
NUTR-A11's fix, the Step 22D rounding work on values whose *definition* is
settled, and the release blockers tracked in RU-11.

---

## Decision checklist for the reviewing specialist

Answer, initial and date. An unanswered row keeps its rule frozen as it is.

| # | Decision | Answer | Initials |
|---|---|---|---|
| D1 | Fat in the score? A / B / C | | |
| D2 | Saturated fat, with the migration? Y / N | | |
| D3 | Carbohydrate penalty: absolute / ratio-relative / drop | | |
| D4 | Protein bonus: keep / cap / condition / remove | | |
| D5 | Energy penalty: fixed / personalised / drop | | |
| D6 | GI + carbs → GL? Y / N | | |
| D7 | Vitamins & hydration in the score? Y / N | | |
| D8 | Per meal or per 100 g? | | |
| D9 | Zero-point rules and the `> 70` gate | | |
| D10 | Band alignment: A / B / C | | |
| D11 | Free sugars instead of total? Y / N | | |
| D12 | Missing nutrient: suppress rule / suppress score / as-is | | |
| D13 | Day badge blend and wording | | |
| D14 | Rename the score, and say it is a heuristic? Y / N | | |
| D15 | Calcium 1300 mg / potassium 4700 mg? Y / N | | |
| D16 | MET × weight burn model? Y / N | | |
| D17 | Ask for the activity factor? Y / N | | |
| D18 | Show a GL when no index is known? Y / N | | |
| D19 | Low-confidence foods contribute in full? Y / N | | |
| D20 | Score a declared 0 kcal plate? Y / N | | |

**Reviewer note.** The published-guidance references above (WHO free-sugar and
sodium limits, fibre adequate intakes, the GI/GL classifications, Mifflin-St
Jeor, the FDA Daily Values) are cited as the *kind* of source each rule would
need. They have not been verified against a current edition, and the applicable
national guidance for Morocco has not been consulted. **That verification is
part of this review, not an input to it.**

---

## Decisions added by the deployed-UI review (external, post Step 22D Phase 2)

Six findings were raised against the live build. Three were fixed without any
formula change; two are answered here; one is new and needs a nutrition call.

### D21 — should a sugar-sweetened drink count as hydration? **(new, open)**

`WATER_FRACTION.Drink = 0.9` (micros.ts). A 330 ml soda is therefore credited
with **297 ml** toward the hydration ring — on the same screen where its 35 g of
sugar takes the score’s largest single penalty (−22). The app rewards and
penalises the same object, and says nothing about the tension.

Why this is not merely cosmetic for THIS population: sugar-sweetened beverages
are the one drink category diabetes guidance singles out to avoid, and at high
glucose osmotic diuresis means the net fluid benefit is not equal to the water
content. Counting a soda as ~90 % as hydrating as water is the kind of claim a
reviewer would reject outright.

**Options.** (a) leave it and label the limitation; (b) give sugary drinks their
own lower fraction; (c) exclude added-sugar beverages from the hydration figure
entirely; (d) drop the per-meal hydration ring and show only the daily goal.
Every one of (b)(c)(d) changes a displayed number — RU-3’s call, not
engineering’s.

**Second, separate defect in the same card (UI, not science):** the ring shows a
SINGLE meal against the DAILY goal, so it reads 10–20 % essentially always,
with the nag *"Pensez à boire plus d’eau !"* permanently attached. A per-meal
contribution displayed against a daily denominator is a framing error
independent of D21.

### D16 — burn minutes: **ANSWERED by the review, implemented**

The four unsourced divisors are replaced by `kcal/min = MET × 3.5 × kg / 200`
using the patient’s own weight, with Compendium MET values. Displayed minutes
change for every patient; see the ledger record. The card states which weight it
used, and says so explicitly when it fell back to 70 kg.

### D-GI/GL — the "idéal pour un diabétique" claim: **ANSWERED, implemented**

The GI-low copy asserted suitability for the whole MEAL while describing only
the INDEX, and rendered three lines above a load reading **Élevé**. Reworded to
describe speed only, plus a reconciliation line that fires when the bands
diverge. No band and no formula moved.
