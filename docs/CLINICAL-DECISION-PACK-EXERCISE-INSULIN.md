# GluciAI — Clinical Decision Pack: Exercise & Insulin Dosing

**For review by a qualified diabetes clinician.**
**Date:** 2026-08-17 · **Status: BLOCKED — CLINICIAN DECISION REQUIRED**

Derived from [`EXERCISE-INSULIN-CLINICAL-AUDIT.md`](./EXERCISE-INSULIN-CLINICAL-AUDIT.md),
which carries the full source trace and reference detail. **No code, coefficient, test or
clinical behaviour was modified to produce this document.**

**How to use this pack.** Every question below has a `Clinician Answer` field set to
**PENDING**. Nothing here proposes a number. Where a published percentage exists it is
quoted with its population and context and is *not* converted into a GluciAI coefficient —
doing so is the specific error this pack exists to prevent.

---

## 1. What the application currently does

Documented as-is. Nothing in this section is a recommendation.

**Exercise types offered** (`types/index.ts:393`): `walk` · `run` · `bike` · `gym` ·
`other`.

**Current behaviour** (`bolusEngine.ts`):

- **Exercise KIND does not affect the arithmetic.** `s.kind` is carried into
  `recentActivity` for display and multiplies nothing.
- **Intensity** sets the factor — logged: `high 0.75 | medium 0.85 | low 0.92`
  (line 627); declared: reduction `high 0.25 | medium 0.15 | low 0.08` (line 645).
- **Duration** scales the declared reduction — `×0.6` under 30 min, `×1.3` over 60 min,
  capped at `0.35` (lines 648-650).
- **The activity factor multiplies the complete bolus expression** (line 675):
  `raw = (mealBolus + correction − IOB) × activityFactor × trendFactor × sickFactor × stressFactor × statusFactor × alcoholFactor`
- **IOB is inside the expression, before the activity multiplication.**
- **`planned` and `done` produce the same arithmetic.** `sportTiming` is captured and
  displayed only.
- **Logged-exercise windows:** 4 h (low/medium), 6 h (high) — line 625.

Measured on the engine, identical inputs, one field varying:

| Variable | Values | Resulting activityFactor |
|---|---|---|
| **kind** | walk / run / bike / gym / other | **0.85 for all five — identical** |
| intensity | low / medium / high | 0.92 / 0.85 / 0.75 |
| duration | 15 / 30 / 45 / 60 / 90 min | 0.91 / 0.85 / 0.85 / 0.85 / 0.81 |
| timing | done / planned | 0.85 / 0.85 — no effect |

---

## 2. Evidence boundaries

Read this before the questions. The three categories are kept strictly apart.

### SUPPORTED BY EVIDENCE

- **Aerobic and resistance exercise produce different acute glycaemic responses.**
  Yardley 2013: glucose fell **3.94 ± 2.67 mmol/L** during aerobic exercise vs
  **1.33 ± 1.78 mmol/L** during resistance exercise in the same subjects; resistance
  work showed more stable early post-exercise glycaemia (24 h TIR 70 % vs 56 %).
- **Brief high-intensity/anaerobic effort can raise glucose**, while moderate aerobic
  effort lowers it (mechanism: intramuscular glycogen + catecholamine-driven hepatic
  output).
- **Published bolus reductions exist, with contexts.** ADA/EASD 2021: **25–33 %**
  prandial reduction when activity is planned **< 2 h after a meal**; **~20 %** basal or
  bedtime long-acting reduction to blunt nocturnal hypoglycaemia after afternoon/evening
  exercise. Riddell 2017: **up to 75 %** pre-exercise bolus reduction for exercise up to
  ~2 h after a meal, explicitly framed as *"a starting point … individualised"*.

### INFERENCE (reasoned, not directly stated by a cited source)

- Because GluciAI applies one factor to all five kinds, a **resistance** session and an
  **aerobic** session receive the same reduction. Given Yardley 2013 this is *unlikely*
  to be correct for both. **The direction and size of any correction are not inferable.**
- GluciAI's maximum reduction (−35 %) sits below the ADA/EASD prandial band's top and far
  below the Riddell ceiling. **This is NOT a finding of under-dosing**: the percentages
  are applied to different denominators and in different contexts.

### NOT ESTABLISHED

- That `0.92 / 0.85 / 0.75` are clinically validated. **They are not** — no citation
  exists anywhere in this repository. The project's own earlier audit labels them
  *"HEURISTIC — NOT CLINICALLY VALIDATED"*.
- That `0.08 / 0.15 / 0.25`, the `×0.6` / `×1.3` duration scalers, the `0.35` cap, or the
  `4 h` / `6 h` windows have any documented source.
- That any published percentage may be lifted into GluciAI's expression, which multiplies
  a bracket that already has IOB subtracted inside it.
- **That "5.1" is a clinical constant.** It is not a coefficient at all — it is an output
  dose (`6.0 U × 0.85`) observed in an earlier probe. There is nothing to validate.
- Correct values for any of the above.

---

## 3. Clinician decision table

**Every `Clinician Answer` is PENDING. None has been pre-filled or guessed.**

| ID | Clinical Question | Current Behaviour | Evidence | Decision Required | Clinician Answer | Implementation Impact |
|---|---|---|---|---|---|---|
| **Q1** | Should the calculation distinguish aerobic / resistance / mixed / interval-HIIT? If yes, which clinically approved categories should the product use? | No modality concept exists; all five kinds behave identically | Yardley 2013 (different acute responses); Riddell 2017 (aerobic vs anaerobic handled differently) | Categories to use, or none | **PENDING** | Would add a modality input and a factor path; affects every exercise dose |
| **Q2** | Should walk, run and bike differ from each other? If yes, which variables should drive the difference (intensity, duration, timing, IOB, starting glucose, carbohydrate, individual variability)? | All three identical; only intensity/duration move the factor | All three are aerobic; no cited source separates them **by name** | Which variables, if any | **PENDING** | May require new inputs or leave kind informational |
| **Q3** | Should resistance/gym receive the same adjustment as aerobic? Options: **A** same · **B** different · **C** no automatic adjustment · **D** clinician-defined rule · **E** insufficient evidence | Same as aerobic | Yardley 2013: −1.33 vs −3.94 mmol/L; anaerobic effort can raise glucose | Select A–E | **PENDING** | Highest-impact question in this pack |
| **Q4** | **P7-002.** Should activity multiply the whole expression, or should IOB be subtracted after the adjustment? Options: **A** multiply entire expression (current) · **B** subtract IOB after activity · **C** another validated model | `(meal + correction − IOB) × activityFactor` | Not established by any cited source; the ordering is a modelling choice | Select A/B/C | **PENDING** | With 3 U active on a 60 g meal, exercise 0.75 gives **2.3 U** (A) vs **1.5 U** (B) |
| **Q5** | Should `planned` and `done` exercise dose differently? | Identical arithmetic | Published reductions are explicitly **pre**-exercise; completed exercise means glucose/insulin exposure has already happened | Yes / No, and how | **PENDING** | SPORT-1; would split the declared-sport path |
| **Q6** | Are the duration bands `<30` / `30–60` / `>60` min clinically appropriate? | `×0.6` under 30, `×1.3` over 60, cap 0.35 | No documented source for these bands or scalers | Confirm, replace, or remove | **PENDING** | Changes the declared-sport reduction |
| **Q7** | Are the post-exercise windows (4 h low/medium, 6 h high) appropriate? | 4 h / 6 h | Literature reports post-exercise insulin sensitivity persisting longer in some contexts (**exact durations NOT ESTABLISHED here**) | Confirm or specify | **PENDING** | Changes how long a logged session influences dosing |
| **Q8** | Should exercise adjustment depend on **starting glucose** (low / normal / high / rapidly changing)? | Starting glucose does not enter the activity factor (it enters correction and the hypo guard separately) | Consensus guidance conditions exercise decisions on starting glucose | Yes / No, and how | **PENDING** | Would couple the activity factor to the reading |
| **Q9** | Should carbohydrate before / during / after exercise be modelled? | Not modelled in the activity factor | ADA/EASD and Riddell treat carbohydrate as a primary lever alongside insulin | Yes / No, and which | **PENDING** | Possibly a new input and patient guidance |
| **Q10** | Should afternoon/evening exercise be treated differently for delayed/nocturnal hypoglycaemia? | Time of day is not considered | ADA/EASD: ~20 % basal/bedtime reduction after afternoon/evening exercise | Yes / No, and how | **PENDING** | Would touch basal guidance, not only the bolus factor |

**Total pending clinical decisions: 10.**

---

## 4. Product decisions (separate from clinical)

These do not require a clinician, but **P-1 depends on the answer to Q1/Q2/Q3.**

| ID | Product Question | Current Behaviour | Decision |
|---|---|---|---|
| **P-1** | Should "Which sport?" actually affect the calculation? | Asked; changes nothing | **PENDING** — follows Q1–Q3 |
| **P-2** | Should the UI ask for an exercise **category** (aerobic/resistance/mixed) instead of a named sport? | Named sports (walk/run/bike/gym/other) | **PENDING** |
| **P-3** | Should intensity be mandatory? | Has a default | **PENDING** |
| **P-4** | Should duration be mandatory? | Optional; 0 when absent | **PENDING** |
| **P-5** | Should planned/done be mandatory? | Defaults to `done` | **PENDING** |
| **P-6** | Should the app state that exercise adjustments are estimates? | The `activity` flag is raised; no explicit estimate caveat | **PENDING** |
| **P-7** | Should the app **decline** to adjust automatically when inputs are insufficient, rather than applying a default? | Always applies a factor once sport is declared | **PENDING** |

**Note on P-1/P-6.** The UI asks *"Which sport?" / "أي رياضة؟"* and the answer changes
nothing. That is not a false clinical claim, but a patient may reasonably infer it
matters. This is a **product** decision that follows the clinical one.

---

## 5. Clinical safety blockers

### SB-1 · P7-002 — the activity factor scales the IOB deduction

**Why it matters.** IOB sits *inside* the bracket, so every factor multiplies it. With
**3 U active on a 60 g meal**, exercise `0.75` yields **2.3 U**, where subtracting IOB
after the adjustment yields **1.5 U** — i.e. **more insulin precisely when exercise and
stacked insulin coincide**, the highest hypoglycaemia-risk combination. Factors above 1
move it the other way.
**Must be decided:** Q4.
**Must not be implemented without approval:** any change to the position of `− IOB`
relative to `× activityFactor` (`bolusEngine.ts:675`).

### SB-2 · SPORT-1 — planned and completed exercise dose identically

**Why it matters.** A session already completed and one merely intended are different
physiological situations: in the first, insulin has been absorbed and glucose already
spent. Published reductions are explicitly **pre**-exercise.
**Must be decided:** Q5.
**Must not be implemented without approval:** any use of `sportTiming` in arithmetic
(`bolusEngine.ts:652`).

### SB-3 · Exercise modality equivalence

**Why it matters.** Aerobic and resistance sessions receive the same reduction although
the cited evidence shows materially different — sometimes opposite — acute responses. A
gym session may receive an unnecessary reduction (→ hyperglycaemia); an aerobic session
at the same setting may receive too little (→ hypoglycaemia).
**Must be decided:** Q1, Q2, Q3.
**Must not be implemented without approval:** introducing any modality-dependent factor.

### SB-4 · Undocumented intensity coefficients

**Why it matters.** `0.92 / 0.85 / 0.75` and `0.08 / 0.15 / 0.25` directly scale an
insulin dose and **carry no citation anywhere in the repository**.
**Must be decided:** Q3 (magnitudes), and Q1/Q2 for context.
**Must not be implemented without approval:** any change to these six values.

### SB-5 · Undocumented duration scaling

**Why it matters.** `×0.6` (<30 min), `×1.3` (>60 min) and the `0.35` cap change the
delivered dose with no documented basis. The cap also holds the model below the published
reduction ranges.
**Must be decided:** Q6.
**Must not be implemented without approval:** the bands, the scalers, or the cap.

### SB-6 · Undocumented 4 h / 6 h windows

**Why it matters.** They determine how long a logged session keeps reducing insulin.
Post-exercise sensitivity can persist longer in some contexts; the correct duration is
**NOT ESTABLISHED** here.
**Must be decided:** Q7.
**Must not be implemented without approval:** either window.

---

## 6. Clinical references

Only the sources already established in the audit. No weak sources added.

1. **Riddell MC, Gallen IW, Smart CE, et al.** Exercise management in type 1 diabetes: a
   consensus statement. *Lancet Diabetes Endocrinol* 2017.
   <https://www.thelancet.com/article/S2213-8587(17)30014-1/abstract>
2. **Holt RIG, DeVries JH, Hess-Fischl A, et al.** The Management of Type 1 Diabetes in
   Adults. A Consensus Report by the ADA and EASD. *Diabetes Care* 2021;44(11):2589.
   <https://diabetesjournals.org/care/article/44/11/2589/138492/>
3. **Yardley JE, Kenny GP, Perkins BA, et al.** Resistance versus aerobic exercise: acute
   effects on glycemia in type 1 diabetes. *Diabetes Care* 2013;36(3):537.
   <https://diabetesjournals.org/care/article/36/3/537/38023/>
4. **EASD/ISPAD** position statement on automated insulin delivery around physical
   activity and exercise in type 1 diabetes. *Diabetologia* 2024.
   <https://link.springer.com/article/10.1007/s00125-024-06308-z>

**Verification caveat.** The full text of (1) was not retrievable (HTTP 403). Its figures
are reported from the publisher abstract and secondary summaries and **must be confirmed
against the paper** before any clinical use. Anything not verifiable from these four
sources is marked **NOT ESTABLISHED** above.

---

## 7. CLINICAL GATE

**Status: BLOCKED — CLINICIAN DECISION REQUIRED**

Must be answered before **any** implementation of exercise-related insulin changes:

1. **Q4 (P7-002)** — activity × IOB ordering. *Answer first: it interacts with every
   other coefficient decision, so any value chosen before it may need revisiting.*
2. **Q3** — resistance vs aerobic (A/B/C/D/E).
3. **Q1** — modality categories, if any.
4. **Q2** — whether walk/run/bike should differ, and on which variables.
5. **Q5 (SPORT-1)** — planned vs completed.
6. **Q6** — duration bands and scalers.
7. **Q7** — 4 h / 6 h windows.
8. **Q8** — dependence on starting glucose.
9. **Q9** — carbohydrate around exercise.
10. **Q10** — time of day / nocturnal risk.

---

## 8. IMPLEMENTATION STATUS

```
EXERCISE INSULIN LOGIC : DO NOT MODIFY
REASON                 : clinical decisions pending (10 open questions, all PENDING)
```

**Frozen until approval** — `src/services/bolusEngine.ts`:

| Lines | What |
|---|---|
| 620-636 | logged-exercise window and intensity factors |
| 642-657 | declared-sport base, duration scaling, cap, `sportTiming` |
| 675 | assembly, including the position of `− IOB` relative to `× activityFactor` |

Also frozen: `ActivityKind` (`types/index.ts:393`) and the sport inputs in
`src/app/bolus.tsx`, insofar as any change would alter dosing.

**The next implementation prompt must be written only after clinician answers exist**, and
should quote the answered decision table rather than restating the questions.

---

*This pack makes the decisions explicit and reviewable. It deliberately does not guess
any of them.*
