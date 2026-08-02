# Meal scoring — first-principles redesign proposal

**Status: proposal. Nothing implemented. No formula, weight or threshold changed
to produce this document.**

Trigger: a meal of 736 kcal / 123 g carbohydrate / GI 41 / **GL 50 (high)**
scores **95/100 · Excellent · A**. That is arithmetically exact and clinically
misleading. This document asks whether the model can be repaired, and what a
defensible replacement looks like.

---

## 1. The decisive finding, before any redesign

I searched the literature for a validated instrument that scores **one meal**
for nutritional quality. There isn't one.

Every validated diet-quality index operates on the **habitual daily diet**, not
a plate:

- The **Global Diet Quality Score** is food-group based over 25 groups, scored
  out of 49, and validated against nutrient adequacy and NCD outcomes — from
  24-hour recall of a whole day's intake [1]. It predicts incident type 2
  diabetes across quintiles of *daily* intake [2].
- The **Diabetes Healthy Eating Index**, built specifically for this population,
  has 10 components, is expressed 0–100 %, and bands quality as **< 51 % low,
  51–80 % needs improvement, > 80 % high**. It is computed from a food-frequency
  questionnaire — again, habitual intake, not a meal [3].

**Consequence for this app:** the current score tries to make a *diet-quality*
judgement about a *single plate*. No published instrument does that, so no
amount of re-weighting will make the current architecture validated. This is the
root cause, not the −15 carbohydrate cap.

**What IS validated at meal level is the glycemic response.** A 2025 CGM study
of 514 adults across 2 451 days and 1.3 million glucose measurements found meal
**glycemic load** associated with postprandial glucose rises of up to **1.3
mg/dL per 10 GL units**, with larger and longer responses after lunch and dinner
than breakfast, and independent contributions from age, BMI and HbA1c [4].

So the evidence supports **one meal-level claim** (glycemic impact) and **one
day-level claim** (diet quality) — and the current model conflates them.

---

## 2. Audit of the current model, rule by rule

| Rule | Scientifically justified? | Verdict |
|---|---|---|
| GI bands ≤55 / 56–69 / ≥70 | **Yes** — standard classification | keep as an *input* |
| GI penalty sizes −22 / −10 | No — ratio is ours | heuristic |
| GI ≤ 40 "bonus" worth **0 points** | No | defect |
| Sugar −22 / −10 at 30 g / 15 g | Direction yes (WHO free sugars < 10 % E, ideally < 5 %); the per-meal grams are ours. Measured as **total** sugars, which is not what guidance limits | heuristic + wrong variable |
| Carbohydrate −15 / −8 at 80 g / 60 g | **No guideline defines a per-meal carbohydrate ceiling.** And the cap means 81 g and 300 g cost the same | **unsupported + capped** |
| Fibre +5 at ≥ 6 g / −6 below 2 g | Direction yes; absolute grams ignore meal size | heuristic |
| Protein +5 at ≥ 20 g | Not a diabetes guideline. Uncapped, unconditional, source-blind | heuristic |
| Sodium −8 above 1000 mg | Anchored (WHO < 2000 mg/day) | defensible |
| Energy −8 above 800 kcal | Same threshold for every patient, while the app computes a personalised goal | unsupported |
| **Fat, saturated fat** | **Not examined at all** | gap |
| **Glycemic load** | **Not in the score**, though it is the one meal-level validated predictor [4] | **the central omission** |

**Why the reviewed plate scores 95:** −15 (carbs, at the cap) +5 (fibre) +5
(protein) = net −5, and GI 41 falls in a dead zone (> 40 so no bonus, ≤ 55 so no
penalty). The two bonuses refund two-thirds of the only penalty charged, and the
GL of 50 — the number [4] says actually predicts the glucose rise — is invisible
to the calculation.

---

## 3. Design principles for the replacement

1. **Score at the level the evidence supports.** Meal → glycemic impact.
   Day → diet quality.
2. **Express thresholds as densities or shares of energy, not absolute grams.**
   Published guidance is given per day or per 1000 kcal; converting it to a
   per-meal density is a derivation, not an invention. Absolute per-meal grams
   are inventions.
3. **No bonus may cancel a hazard.** Fibre and protein must not refund a high
   glycemic load.
4. **Nothing unmeasured may be scored.** Fat quality is not in the data; the
   model must say "not assessed" rather than silently score 0.
5. **Every constant is either derived, cited, or labelled as a policy choice.**

---

## 4. Proposed architecture — two instruments, not one

### 4.1 Per meal: **Glycemic Impact** (replaces the current score)

Driven by glycemic load, the one meal-level quantity with published predictive
validity [4].

```
GL = GI_weighted × available carbohydrate / 100
```

**The honest problem with the bands.** The standard GL cut-offs (< 10 low,
10–20 medium, > 20 high) were derived for **single food servings**, not meals. A
normal main meal for a 2000 kcal/day diet at 45–50 % carbohydrate carries
roughly 75–85 g of carbohydrate; at a mid GI that is a GL of 40–45. Applying
per-serving bands to a plate would mark almost every ordinary meal "high".

**I will not invent meal-level GL bands.** Two defensible ways to get them, both
requiring sign-off:

| Option | Basis | What it needs |
|---|---|---|
| **(a) Relative to the patient** | GL expressed as a share of the patient's own daily carbohydrate allowance, which the app already holds (ratio, targets, programme) | a nutritionist to set what share one meal should represent |
| **(b) Absolute, derived from [4]** | Convert GL to an expected glucose rise: ~1.3 mg/dL per 10 GL units. A GL of 50 ≈ **6.5 mg/dL** of additional postprandial rise versus a GL of 0 | a clinician to set what rise is acceptable for this patient's targets |

Option (b) has a large advantage: it lets the app show a **clinical unit** the
patient already understands (mg/dL) instead of an invented point score. The
caveat is that [4] studied adults **without diabetes**; the coefficient is
almost certainly larger in diabetes, so it must not be presented as this
patient's predicted rise without a specialist's adjustment.

### 4.2 Per day: **Diet quality** (new, replaces the per-meal quality claim)

This is where the validated instruments live. The **DHEI** structure is the
closest fit: components scored against targets, summed to 0–100 %, banded
**< 51 / 51–80 / > 80** [3]. Those bands are published, not ours.

Components the app can populate today, each with a **derived** target:

| Component | Target | Derivation |
|---|---|---|
| Fibre | **14 g per 1000 kcal** | the standard density recommendation; for a 2000 kcal day = 28 g |
| Free sugars | **< 10 % of energy**, ideal < 5 % | WHO |
| Sodium | **< 2000 mg/day** | WHO |
| Saturated fat | < 10 % of energy | **cannot be computed — no data** |
| Food-group variety | GDQS-style groups [1] | the app has a coarse category per food |

**Note the honest gap:** two of five components are unavailable today. Free
sugars are not read from any provider (only total sugars), and saturated fat
exists nowhere in the codebase. A day-level index missing both is not the DHEI
and must not be labelled as one.

---

## 5. Every constant, justified or flagged

| Constant | Status |
|---|---|
| GI bands 55 / 69 | **Published classification.** Keep |
| GL formula | **Published.** Keep |
| 1.3 mg/dL per 10 GL units | **Published** [4], but in a non-diabetic cohort — must be adjusted or dropped |
| Fibre 14 g/1000 kcal | **Published density.** Derivable to any meal size |
| Free sugars < 10 % E | **WHO.** Needs a provider field the app does not read |
| Sodium < 2000 mg/day | **WHO** |
| DHEI bands < 51 / 51–80 / > 80 | **Published** [3] |
| Meal-level GL bands | **DOES NOT EXIST in the literature.** Must be set by a specialist |
| Current −22 / −10 / −15 / −8 / +5 | **No published basis.** Delete, do not port |
| Protein ≥ 20 g bonus | **No diabetes basis.** Delete |
| Energy 800 kcal | **No basis.** Replace with a share of the patient's computed goal |

---

## 6. The reviewed plate under the proposal

736 kcal · 123 g carbohydrate · GI 41 · GL 50 · fibre 12 g · sugar 9 g ·
sodium 600 mg.

| Instrument | Result | Why |
|---|---|---|
| **Glycemic impact (meal)** | **GL 50 — high**, ≈ +6.5 mg/dL expected rise [4] | the number that matters, now the headline |
| Fibre | **12 g vs 10.3 g target** (14 g/1000 kcal × 0.736) — **met** | derived, portion-aware |
| Free sugars | not computable (total sugars 9 g is well under any threshold) | data gap, stated |
| Sodium | 600 mg of a 2000 mg day — **fine** | WHO |
| Saturated fat | **not assessed** | data gap, stated |
| **Overall word** | *"Charge glycémique élevée — bon apport en fibres"* | no composite number claiming more than this |

The plate stops being "Excellent". It becomes: **a high glycemic load with good
fibre** — which is what it actually is, and what a clinician would say.

---

## 7. What this costs

- Every stored `meal_score` becomes a different quantity. Per the rule held
  since Step 16, history is **never recomputed**: old meals keep their number
  and their old label, stamped with a model version.
- The menu-scan ranking and the day badge both consume the score; both need
  re-pointing at the new meal-level figure.
- The A–E letter, just restored, would map to the glycemic-impact bands rather
  than the composite. Its boundaries would have to be re-derived — or it becomes
  a direct rendering of the GL band (low/medium/high), which is published.

---

## 8. Decisions required before any code

1. **Meal-level GL bands** — the single blocking question. Option (a) relative
   to the patient's allowance, or (b) derived from an expected glucose rise.
2. **Whether to keep a 0–100 number at all**, given no per-meal instrument is
   validated, or to show the GL band and the component verdicts directly.
3. **Whether to build the day-level index** knowing two of its five components
   are missing data.
4. **Whether to add free sugars and saturated fat** to the pipeline — provider
   work plus a migration — which is what would make a real index possible.
5. Confirmation of every reference above against a current edition, and against
   guidance applicable in Morocco.

**I have not chosen any of these.** Points 1 and 2 in particular decide what the
patient sees on every screen, and neither is an engineering question.

---

### References

[1] [Development and Validation of a Novel Food-Based Global Diet Quality Score (GDQS)](https://consensus.app/papers/details/d006927f8c935364945ec27c9e176189/?utm_source=claude_code) (Bromage et al., 2021, 149 citations, The Journal of Nutrition)
[2] [Higher Global Diet Quality Score Is Inversely Associated with Risk of Type 2 Diabetes in US Women](https://consensus.app/papers/details/3affd33a0ffa5df38a1723efeafb05a9/?utm_source=claude_code) (Fung et al., 2021, 34 citations, The Journal of Nutrition)
[3] [Diet quality and therapeutic targets in patients with type 2 diabetes: evaluation of concordance between dietary indexes](https://consensus.app/papers/details/50469becbb14593690afa24e672a60cb/?utm_source=claude_code) (Antonio et al., 2017, 10 citations, Nutrition Journal)
[4] [Age, Sex, BMI, Meal Timing, and Glycemic Response to Meal Glycemic Load](https://consensus.app/papers/details/b63e4359ddf15387b9a406d528a4e4d4/?utm_source=claude_code) (Calvo-Malvar et al., 2025, 5 citations, JAMA Network Open)

WHO free-sugar, sodium and fibre-density figures are cited from memory of public
guidance and **must be verified against current editions** before implementation.
