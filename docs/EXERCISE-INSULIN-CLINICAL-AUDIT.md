# GluciAI — Exercise → Insulin Clinical Audit

**Date:** 2026-08-17 · **Scope:** research and audit only · **No code, test, formula or
coefficient was modified.**

**Verdict: (C) INSUFFICIENT EVIDENCE — CLINICIAN DECISION REQUIRED.**

---

## 0. First correction: the "5.1" is not a coefficient

The task described "a value around 5.1 in the current logic". **There is no 5.1
coefficient in GluciAI.** An exhaustive search of `src/` finds `5.1` only inside SVG
path data in unrelated UI files.

`5.1` was an **output dose** printed by the Phase-8 probe in an earlier session. Probing
the engine directly reproduces it exactly:

```
mealBolus 6.0 U   correction 0 U   iob 0 U   activityFactor 0.85   →  total 5.1 U
```

`6.0 × 0.85 = 5.1`. The correction was 0 because that probe passed `targetGlucose` and
`correctionFactor` under names the engine does not read, so it fell back to defaults
(`targetHigh` 180) and a glucose of 180 needed no correction. **5.1 U is therefore a
result, not a clinical constant, and there is nothing to trace to a source.** The real
coefficients are in §2.

---

## 1. What the application actually calculates

**Where exercise is entered.** `src/app/bolus.tsx` — the patient picks a **kind**
(`walk`, `run`, `bike`, `gym`, `other` — `ActivityKind`, `types/index.ts:393`), an
**intensity** (low / medium / high), a **duration**, and a **timing** (`done` /
`planned`).

**Where it is applied.** `src/services/bolusEngine.ts`, two independent paths:

**(a) Logged past sessions — lines 620-636**
```
window   = 6 h if intensity 'high', else 4 h
factor   = high 0.75 | medium 0.85 | low 0.92
activityFactor = the SMALLEST factor among sessions inside their window
```

**(b) Sport declared on the calculator — lines 642-657**
```
base      = high 0.25 | medium 0.15 | low 0.08
reduction = base × 0.6   if duration < 30 min
          = base × 1.3   if duration > 60 min
          = base         otherwise
reduction = min(reduction, 0.35)          ← hard cap: never more than −35 %
declared  = 1 − reduction
activityFactor = min(activityFactor, declared)
```

**How it reaches the dose — line 675**
```
raw = (mealBolus + correction − IOB)
      × activityFactor × trendFactor × sickFactor × stressFactor
      × statusFactor × alcoholFactor
```

### In plain language

The app reduces the **whole** bolus by a fixed percentage chosen from **intensity**,
nudged by **duration**. **The kind of exercise is never read.** `s.kind` is copied into
`recentActivity` for display only and multiplies nothing. **Timing (`done` / `planned`)
is captured, displayed, and also multiplies nothing** — already recorded as SPORT-1.

Measured on the real engine (identical inputs, only the named field changing):

| Variable | Values | activityFactor |
|---|---|---|
| **kind** | walk / run / bike / gym / other | **0.85 for all five — identical** |
| intensity | low / medium / high | 0.92 / 0.85 / 0.75 |
| duration | 15 / 30 / 45 / 60 / 90 min | 0.91 / 0.85 / 0.85 / 0.85 / 0.81 |
| timing | done / planned | 0.85 / 0.85 — **no effect** |

Calories, IOB-vs-exercise interaction, and current glucose do **not** enter the activity
factor (glucose enters elsewhere, via correction and the hypo guard).

---

## 2. Every coefficient, traced

| Exercise | Current value | Unit | Where defined | Where used | Source | Status |
|---|---|---|---|---|---|---|
| walk | *(none)* | — | — | — | — | **kind is ignored by the calculation** |
| run | *(none)* | — | — | — | — | **kind is ignored** |
| bike | *(none)* | — | — | — | — | **kind is ignored** |
| gym / resistance | *(none)* | — | — | — | — | **kind is ignored** |
| other | *(none)* | — | — | — | — | **kind is ignored** |
| Logged · low | 0.92 (−8 %) | multiplier | `bolusEngine.ts:627` | line 675 | **NOT DOCUMENTED** | heuristic |
| Logged · medium | 0.85 (−15 %) | multiplier | `bolusEngine.ts:627` | line 675 | **NOT DOCUMENTED** | heuristic |
| Logged · high | 0.75 (−25 %) | multiplier | `bolusEngine.ts:627` | line 675 | **NOT DOCUMENTED** | heuristic |
| Declared · low | 0.08 (−8 %) | reduction | `bolusEngine.ts:645` | line 675 | **NOT DOCUMENTED** | heuristic |
| Declared · medium | 0.15 (−15 %) | reduction | `bolusEngine.ts:645` | line 675 | **NOT DOCUMENTED** | heuristic |
| Declared · high | 0.25 (−25 %) | reduction | `bolusEngine.ts:645` | line 675 | **NOT DOCUMENTED** | heuristic |
| Duration < 30 min | × 0.6 | scaler | `bolusEngine.ts:648` | line 675 | **NOT DOCUMENTED** | heuristic |
| Duration > 60 min | × 1.3 | scaler | `bolusEngine.ts:649` | line 675 | **NOT DOCUMENTED** | heuristic |
| Max reduction | 0.35 (−35 %) | cap | `bolusEngine.ts:650` | line 675 | **NOT DOCUMENTED** | heuristic |
| Window (non-high) | 4 h | hours | `bolusEngine.ts:625` | line 626 | **NOT DOCUMENTED** | heuristic |
| Window (high) | 6 h | hours | `bolusEngine.ts:625` | line 626 | **NOT DOCUMENTED** | heuristic |

**No coefficient in this table carries a citation anywhere in the repository.** The
project's own prior audit already labelled them
*"HEURISTIC — NOT CLINICALLY VALIDATED"* (`FINAL-STRICT-ANDROID-IOS-GENERAL-AUDIT.md:842`).
No source was invented here to fill the gap.

---

## 3. What the authoritative literature says

### 3.1 Bolus reduction magnitudes

- **Riddell et al., *Lancet Diabetes & Endocrinology* 2017 — "Exercise management in
  type 1 diabetes: a consensus statement".** For exercise performed **up to ~2 h after a
  meal**, the pre-exercise bolus may be reduced **by up to 75 %**. The authors state the
  figures are **"a starting point … that can then be individualised"**.
- **ADA/EASD consensus on type 1 diabetes in adults (2021).** For activity planned
  **< 2 h after a meal**, a **25–33 %** prandial bolus reduction is generally
  recommended; to blunt nocturnal hypoglycaemia after afternoon/evening exercise, basal
  or bedtime long-acting insulin is typically reduced by **~20 %**.

**Consequence for GluciAI.** Its maximum reduction is **−35 %**, and its typical case is
**−15 %**. That sits *below* the ADA/EASD prandial band's upper end and far below the
consensus ceiling of −75 %. **Conservative in the direction of more insulin**, which for
an exercising patient is the hypoglycaemia-risk direction — but it is applied to a
different denominator (see §4.2), so this is **not** a finding of "under-dosing" and must
not be acted on without a clinician.

### 3.2 Exercise TYPE genuinely matters — the core finding

- **Yardley et al., *Diabetes Care* 2013 — "Resistance versus aerobic exercise: acute
  effects on glycemia in type 1 diabetes".** Aerobic exercise lowered glucose by
  **3.94 ± 2.67 mmol/L**; the same subjects doing resistance exercise fell only
  **1.33 ± 1.78 mmol/L**. Resistance training also showed **more stable early
  post-exercise glycaemia** and greater 24 h time-in-range (70 % vs 56 %).
- **Mechanism.** Aerobic work draws heavily on **blood** glucose; resistance work runs
  largely on **intramuscular glycogen**, and the catecholamine response raises hepatic
  glucose output — which is why **brief high-intensity/anaerobic effort can cause
  post-exercise HYPERglycaemia** while moderate aerobic effort causes hypoglycaemia.

**This is the crux.** GluciAI offers walk / run / bike / gym / other and applies the
**same** factor to all five. The literature says an aerobic session and a resistance
session are **different glycaemic events, sometimes in opposite directions**.

### 3.3 Fixed percentages are explicitly framed as starting points

Every source found frames reductions as individualised starting points, contingent on
intensity, duration, timing relative to insulin, **insulin on board**, starting glucose,
carbohydrate intake and fitness — never as a single fixed multiplier.

### 3.4 Sources deliberately excluded

No blog, forum, SEO article or AI-generated page was used as clinical authority.

---

## 4. Risks identified

### 4.1 Same factor for opposite physiologies — **the main clinical risk**
A patient selecting **gym / resistance** receives the identical reduction as one
selecting **run**. Per Yardley 2013 the resistance session may barely lower glucose (or
raise it), so the reduction may be **unnecessary insulin withdrawal → hyperglycaemia**;
for aerobic work at the same setting it may be **insufficient → hypoglycaemia**. One
control cannot be correct for both.

### 4.2 The activity factor also scales the IOB deduction — **P7-002, already open**
Because IOB sits *inside* the bracket, `activityFactor` multiplies it too. With 3 U
active on a 60 g meal, exercise 0.75 yields **2.3 U** where subtracting IOB last gives
**1.5 U** — i.e. **more** insulin precisely when exercise and stacked insulin coincide,
the highest-risk hypoglycaemia scenario. **This interacts with any coefficient change and
must be decided together with it.**

### 4.3 `planned` and `done` dose identically — **SPORT-1, already open**
Insulin already absorbed and glucose already spent differ completely from an intention.
The literature's reductions are explicitly *pre-*exercise.

### 4.4 Not considered at all
Starting glucose (in the activity factor), carbohydrate intake around exercise,
time-of-day / nocturnal risk, individual fitness and variability, basal insulin.

---

## 5. Decision tables

### Per exercise type

| Current behaviour | Evidence | Clinically justified? | Risk | Decision |
|---|---|---|---|---|
| **walk** — factor by intensity only | ADA/EASD: aerobic needs reduction | Direction plausible; magnitude undocumented | Hypo if too small | **CLINICIAN** |
| **run** — identical to walk | Aerobic, typically higher intensity | Intensity partly compensates; type ignored | Hypo | **CLINICIAN** |
| **bike** — identical | Aerobic | Same as above | Hypo | **CLINICIAN** |
| **gym / resistance** — identical to aerobic | Yardley 2013: −1.33 vs −3.94 mmol/L; can raise glucose | **Not supported** — treated as aerobic | **Hyper** (over-reduction) | **CLINICIAN — highest priority** |
| **other** — identical | none | Unknown by construction | Either | **CLINICIAN** |

### Per coefficient

| Coefficient | Meaning | Source | Valid context | Universal? |
|---|---|---|---|---|
| 0.92 / 0.85 / 0.75 | −8 / −15 / −25 % whole bolus | **NOT DOCUMENTED** | unknown | **No** |
| 0.08 / 0.15 / 0.25 | declared-sport reduction | **NOT DOCUMENTED** | unknown | **No** |
| ×0.6 <30 min, ×1.3 >60 min | duration scaling | **NOT DOCUMENTED** | unknown | **No** |
| cap 0.35 | max −35 % | **NOT DOCUMENTED** | vs consensus "up to −75 %" | **No** |
| 4 h / 6 h windows | post-exercise sensitivity | **NOT DOCUMENTED** | literature notes effects can persist ≥24 h | **No** |
| ~5.1 | **not a coefficient** — an output dose | n/a | n/a | n/a |

---

## 6. Recommendation — **(C) INSUFFICIENT EVIDENCE — CLINICIAN DECISION REQUIRED**

Not (A): the same factor is applied to aerobic and resistance exercise, which the
evidence contradicts. Not (B) either — "needs revision" would imply the correct
replacement is known, and it is not: the published percentages come from specific
populations, timings and insulin contexts, and lifting one into a different denominator
would be exactly the error this audit exists to prevent.

### What a future model should probably consider — requirements, not an implementation

1. **Exercise modality** — at minimum aerobic vs resistance vs mixed/interval.
2. **Intensity** and **3. duration** (already present).
3. **Timing** relative to the meal/bolus, and `planned` vs `done` (SPORT-1).
4. **Insulin on board** — and the P7-002 ordering question resolved *first*.
5. **Starting glucose**.
6. **Carbohydrate intake** around the session.
7. **Time of day** / nocturnal risk.
8. **Individual variability** — the literature's own framing.

### Questions only a diabetologist may answer

- **Q1.** Should modality change the factor? If yes, what values, for which population?
- **Q2.** Should resistance/anaerobic ever *reduce* the reduction, or apply none?
- **Q3.** Are −8/−15/−25 % with a −35 % cap acceptable, given ADA/EASD 25–33 % and the
  consensus ceiling of 75 %?
- **Q4.** **P7-002** — should the activity factor scale the IOB deduction? *(Answer this
  before any coefficient change; the two interact.)*
- **Q5.** **SPORT-1** — should `planned` and `done` differ?
- **Q6.** Are the 4 h / 6 h windows adequate against reports of ≥24 h sensitivity?
- **Q7.** Should the app decline to adjust when inputs are too uncertain, rather than
  applying a default?

### Must NOT change without approval

`bolusEngine.ts` lines 620-657 and the assembly at 675 — every value in §2, the
duration scalers, the −35 % cap, the 4 h/6 h windows, and the factor's position relative
to IOB.

### Product note (non-clinical, safe to consider now)

The UI asks *"Which sport?" / "أي رياضة؟"* and the answer changes nothing. That is not a
false clinical claim, but a patient may reasonably infer it matters. Whether to (a) state
that intensity and duration drive the adjustment, (b) make modality functional per Q1, or
(c) remove the selector, is a **product** decision that follows the clinical one.

---

## References

1. Riddell MC, Gallen IW, Smart CE, et al. **Exercise management in type 1 diabetes: a
   consensus statement.** *Lancet Diabetes Endocrinol* 2017.
   <https://www.thelancet.com/article/S2213-8587(17)30014-1/abstract>
2. Holt RIG, DeVries JH, Hess-Fischl A, et al. **The Management of Type 1 Diabetes in
   Adults. A Consensus Report by the ADA and EASD.** *Diabetes Care* 2021;44(11):2589.
   <https://diabetesjournals.org/care/article/44/11/2589/138492/>
3. Yardley JE, Kenny GP, Perkins BA, et al. **Resistance versus aerobic exercise: acute
   effects on glycemia in type 1 diabetes.** *Diabetes Care* 2013;36(3):537.
   <https://diabetesjournals.org/care/article/36/3/537/38023/>
4. EASD/ISPAD position statement on automated insulin delivery around physical activity
   and exercise in type 1 diabetes. *Diabetologia* 2024.
   <https://link.springer.com/article/10.1007/s00125-024-06308-z>

*Cited for the specific claims attributed to them above. Full-text of (1) was not
retrievable (HTTP 403); its figures are reported from the publisher abstract and
secondary summaries and should be confirmed against the paper before any clinical use.*
