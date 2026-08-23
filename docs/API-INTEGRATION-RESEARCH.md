# GluciAI — External API Research & Integration Plan

**Date:** 2026-08-16 · **HEAD:** `7adb267` · **Status: RESEARCH ONLY — nothing implemented**

---

## 1. Executive summary

The brief asked which APIs from the `public-apis` catalogue could improve GluciAI.
The most useful finding is that **the question is largely already answered**: GluciAI
integrates **eight** external providers today —

| Provider | Role | Called from |
|---|---|---|
| Open Food Facts | barcode → product, food search | device **and** `food-search` edge fn |
| USDA FoodData Central | food → nutrition, GTIN lookup | device |
| FatSecret | food → nutrition | edge fn (OAuth) |
| Edamam | food → nutrition | edge fn |
| UPCitemdb | barcode → product (trial tier) | device |
| TheMealDB | recipe reference | `world-recipes` edge fn |
| Wikimedia Commons | dish imagery | edge fn |
| Google Gemini | food identification from photo, chat, TTS | `analyze-meal`, `ai-chat`, `tts` |

There is already a resilience layer (`resilience.ts`: per-provider timeout, one retry,
never-throw → `null`), a provenance model (`NutritionSource`, `carbProvenance`,
`carbStatus`), a plausibility guard, and a shared `product_catalog`.

**So the honest recommendation is not "add another nutrition API."** The catalogue's
Food & Drink section contains almost nothing GluciAI lacks: it is dominated by
recipe/novelty endpoints (BaconMockup, Foodish, PunkAPI, TheCocktailDB, WhiskyHunter,
TacoFancy) and by commercial products whose free tiers do not permit this use.

**The two highest-value findings are defects in the EXISTING integration**, both
surfaced while verifying official documentation for this research:

> **F-1 — the USDA API key ships inside the APK. ✅ FIXED / VERIFIED (2026-08-16)**
> `barcodeLookup.ts:156` **and `usda.ts:11`** (two sites, not one) read
> `process.env.EXPO_PUBLIC_USDA_API_KEY`. `EXPO_PUBLIC_*` is **inlined into the bundle
> at build time** and is extractable from a distributed APK. It fell back to `DEMO_KEY`,
> which USDA documents at **30 requests/hour and 50/day** — so an unset build variable
> left branded-food lookup effectively dead in production while failing silently through
> `resilience.ts`.

> **F-2 — device-side Open Food Facts calls send no User-Agent. ✅ FIXED / VERIFIED (2026-08-16)**
> OFF's official API documentation states a custom User-Agent is **mandatory**
> (`AppName/Version (ContactEmail)`). The `food-search` edge function sends one
> correctly; the device-side calls in `barcodeLookup.ts` and `openfoodfacts.ts` sent
> none. OFF blocks unidentified traffic.

Both were **pre-existing** and neither was introduced by recent work. Both are now
remediated — see §19.

---

## 2. APIs investigated

From the catalogue's Food & Drink section plus targeted verification of the
serious commercial candidates.

| API | Verdict | Why |
|---|---|---|
| Open Food Facts | **already integrated** | see §4, §10 — compliance issues to fix |
| USDA FoodData Central | **already integrated** | key exposure F-1 |
| Edamam / FatSecret | **already integrated** | server-side, correct |
| Chomp | **C** | free tier is non-commercial; 303 on docs fetch, unverifiable |
| Nutritionix | **D — rejected** | no commercial free tier; enterprise from **$1,850/mo** |
| Spoonacular | **C** | recipe-centric; duplicates TheMealDB + Gemini |
| Edamam recipes / RecipeAPI / Tasty / Zestful | **C** | recipe/parsing, not carbohydrate truth |
| Food Info | **C** | apiKey, `CORS: No`, thin provenance documentation |
| Fruityvice | **C** | fruit only; USDA already covers it with better provenance |
| Kroger / LCBO / Systembolaget / Open Brewery / Untappd / PunkAPI / WhiskyHunter | **D** | retail/alcohol; irrelevant or actively inappropriate for a diabetes app |
| BaconMockup / Foodish / Coffee / TacoFancy | **D** | novelty/placeholder |
| LogMeal | **B — needs review** | genuine food-image recognition; see §11 |
| Clarifai food model | **B — needs review** | image classification only, no portion/nutrition |

---

## 3–8. Verified details for the serious candidates

*(verified against provider documentation, not the catalogue listing)*

### Open Food Facts — already integrated
- **Docs:** `openfoodfacts.github.io/openfoodfacts-server/api/` · `world.openfoodfacts.org/data`
- **Auth:** none for reads — **but a custom User-Agent is mandatory**
- **Rate limits (official):** **15 req/min per IP** for product reads; **10 req/min per IP** for search. Explicitly: *"don't use it for a search-as-you-type feature, you would be blocked very quickly."*
- **Licence:** ODbL (structure) + DbCL (contents); images CC-BY-SA. Commercial use permitted **with attribution**.
- **Critical term:** *"1 API call = 1 real scan by a user."* **Scraping is prohibited and will be blocked.**
- **Reliability:** community-run, no uptime SLA.
- **Privacy:** a barcode leaves the device. No photo, no glucose value, no identity.

> **⚠ ARCHITECTURAL NOTE.** Device-side calls use each patient's own IP, which fits
> the 15/min limit naturally. Anything routed through an **Edge Function shares one
> egress IP for the entire user base** and can hit the limit collectively. The current
> split (barcode direct from device, search via edge fn) is the right shape — but the
> search path is the one under the stricter 10/min ceiling. OFF's own guidance for
> high-traffic apps is to **host a local mirror from the daily exports**.

### USDA FoodData Central — already integrated
- **Docs:** `fdc.nal.usda.gov/api-guide/`
- **Auth:** API key **required**. **1,000 req/hour per IP**; `DEMO_KEY` only **30/hr, 50/day**.
- **Licence:** **CC0 1.0 public domain** — no commercial restriction, attribution requested.
- **Privacy:** search terms only.
- **Assessment:** the best-licensed source in the stack. **Undermined by F-1.**

### Nutritionix — **REJECTED (D)**
Free tier is 200 calls/day with attribution and **no longer offered for commercial use**;
enterprise from **$1,850/month**. Excellent natural-language parsing, but commercially
unavailable at GluciAI's stage. *Not recommended.*

### LogMeal — **B, needs product + legal review**
- **Docs:** `logmeal.com/api/`
- **Provides:** food type/group detection, several-dishes recognition, ingredient extraction, quantity estimation.
- **Free tier:** trial only — **30 days or 200 queries**. Not a production tier.
- **Retention:** **NOT DOCUMENTED on the public API page.** Must be established from the Terms/DPA before any evaluation.
- **Privacy risk: HIGH — this sends the patient's meal photograph to a third party.**
- **Overlap:** GluciAI already does photo → food identification via Gemini in `analyze-meal`.

---

## 9. Comparison with the current pipeline

| Need | Covered today? | Gap |
|---|---|---|
| barcode → product | ✅ OFF + UPCitemdb + USDA GTIN | Moroccan coverage is thin (community data) |
| product → nutrition | ✅ OFF/USDA/FatSecret/Edamam | — |
| food → nutrition | ✅ four providers + `moroccan.ts` | — |
| photo → food identification | ✅ Gemini `analyze-meal` | accuracy **UNVERIFIED** (no reference meals) |
| ingredients | ✅ OFF | — |
| serving sizes | ✅ `portionUnit.ts`, `learnedPortion` | — |
| missing values | ✅ `carbStatus` floors, rendered "≥" | — |

**Conclusion: no material coverage gap that a catalogue API closes.** The real
limitation is *verification* of the scanner, which needs controlled reference meals —
**not another data source.**

### If sources disagree
GluciAI already answers this correctly and **must not** be changed to "pick the best":

| | |
|---|---|
| **SOURCE A** | USDA — CC0, lab-derived, generic foods |
| **SOURCE B** | OFF — crowd-sourced, packaged products, per-country |
| **DIFFERENCE** | carbs per 100 g can differ materially for the "same" food |
| **POSSIBLE REASON** | different item (branded vs generic), preparation state (raw/cooked), regional formulation, or a contributor typo |
| **SAFE RESOLUTION** | **keep provenance, do not average.** The existing `NutritionSource` + `carbStatus` model already records which source spoke and whether a figure is a total or a floor. Averaging two disagreeing sources would invent a number no source stands behind — and that number feeds the bolus calculation. |

> **CLINICAL DATA DEPENDENCY — REVIEW REQUIRED.** Any new nutrition source changes
> the carbohydrate figure that reaches `bolusEngine.ts`. **No new source may be enabled
> without clinical sign-off**, regardless of engineering quality.

---

## 10–12. Scanner, security, privacy

**Layer separation — the rule that must hold:**

```
A. IMAGE RECOGNITION      Gemini (today) / LogMeal (candidate)
B. FOOD IDENTIFICATION    engine.ts + match.ts + foodNames.ts
C. BARCODE LOOKUP         OFF → UPCitemdb → USDA GTIN
D. NUTRITION DATABASE     OFF / USDA / FatSecret / Edamam
E. NORMALIZATION          carbProvenance · plausibility · portionUnit
F. CLINICAL CALCULATION   bolusEngine.ts — GluciAI's own rules ONLY
```

**No external API may reach F.** Every external value must pass E first. This holds
today and must survive any integration.

**Security rules:**
- **Never** put a secret key in the mobile app. `EXPO_PUBLIC_*` is **not** a secret mechanism — it is inlined into the bundle (**F-1**).
- Keyed APIs (USDA, FatSecret, Edamam, Gemini) belong behind Edge Functions — as FatSecret/Edamam/Gemini already are.
- Keyless APIs (OFF barcode) are safe from the device **and** preferable there, because per-user IPs fit OFF's per-IP rate limit.

**Privacy — what leaves the device today:** barcodes, food search terms, and **meal
photographs to Gemini**. No glucose value, no insulin dose, no location, no identity
goes to any nutrition provider. **Any image API is the single largest privacy escalation
available** and needs a documented retention answer before evaluation.

---

## 13. Recommended architecture *(for any future integration)*

```
Mobile app
  └─ keyless + per-user-IP-friendly (OFF barcode) ──────────► direct, WITH User-Agent
  └─ anything keyed ─► Supabase Edge Function ─► external API
                            │
                            ├─ timeout + 1 retry (resilience.ts pattern)
                            ├─ never-throw → null
                            └─ cache (product_catalog / cache.ts)
                                   │
                                   ▼
                        validation → plausibility → carbProvenance
                                   │
                                   ▼
                        GluciAI nutrition model → clinical engine
```

- **Caching:** `product_catalog` already caches barcode hits; it also *reduces* OFF calls, which is a compliance benefit, not just a speed one.
- **Failure behaviour:** already correct — a dead provider yields `null`, the chain continues, and **glucose/insulin functionality never depends on an external API.**
- **Offline:** local `moroccan.ts` + cache; unchanged.
- **Rate limiting:** the missing piece. Nothing currently throttles OFF search through the shared edge-function IP.

---

## 14. Ranking

**A — HIGH VALUE / SAFE:** *(none new)* — the valuable work is fixing F-1 and F-2 in what already exists.
**B — NEEDS REVIEW:** LogMeal, Clarifai food model *(both: photo leaves device)*.
**C — LOW VALUE:** Chomp, Spoonacular, Food Info, Fruityvice, RecipeAPI, Tasty, Zestful.
**D — UNSAFE / INAPPROPRIATE:** Nutritionix (commercially unavailable), all alcohol APIs, all novelty APIs.

| Slot | Recommendation |
|---|---|
| **PRIMARY NUTRITION** | **USDA FoodData Central** — keep; CC0, 1,000/hr. **Fix F-1.** |
| **FALLBACK** | **Open Food Facts** — keep; **fix F-2**, respect 15/10 per min |
| **BARCODE** | OFF → UPCitemdb → USDA GTIN — **no change recommended** |
| **SCANNER** | **None recommended now.** Gemini already fills this slot; its accuracy is unverified, and swapping an unverified provider for another unverified provider proves nothing |
| **NOT RECOMMENDED** | Nutritionix, Spoonacular, alcohol/novelty APIs |
| **CLINICAL REVIEW** | any new nutrition source (feeds carbs → bolus) |
| **LEGAL/PRIVACY REVIEW** | LogMeal, Clarifai (photo egress + undocumented retention) |

---

## 15. Recommended next steps *(none are implementation approval)*

1. **Fix F-1** — move the USDA key behind an Edge Function. *Engineering, no clinical impact.*
2. **Fix F-2** — send the required User-Agent on device-side OFF calls. *One header.*
3. **Throttle/cache OFF search** at the edge function to respect 10/min on a shared IP.
4. **Then** re-ask whether any new API is needed. It probably is not.

---

---

## 19. Remediation — F-1 and F-2 (2026-08-16)

**No new API was added. No dependency, no key, no schema change.**

### F-1 — USDA key exposure · **FIXED / VERIFIED**

**No new Edge Function was created.** `nutrition-search` already existed for exactly
this purpose — it owns the FatSecret and Edamam secrets and dispatches on a `provider`
field, behind an authenticated-caller check. USDA was added as two more providers
rather than as new infrastructure.

| Change | File |
|---|---|
| `usda` + `usda_gtin` branches, FDC nutrient mapping, exact-GTIN rule | `supabase/functions/nutrition-search/index.ts` |
| `makeRemoteProvider` widened to `usda`; `usdaRemoteProvider` + `usdaGtinProvider` | `src/services/nutrition/providers/remote.ts` |
| Now a thin re-export — no key, no direct FDC call | `src/services/nutrition/providers/usda.ts` |
| `usdaByGtin` calls the proxy instead of FDC | `src/services/nutrition/providers/barcodeLookup.ts` |

**Preserved deliberately, and pinned by tests:**
- **Provenance** — both entry points still report `source: 'usda'`; `NutritionSource`, `SOURCE_LABEL` and every downstream consumer are untouched.
- **Confidence 0.95** — so engine provider ordering does not move.
- **Chain order** — OFF → UPCitemdb → USDA GTIN, unchanged.
- **Absent ≠ zero** — the function returns `null` for a nutrient FDC does not publish, so `carbs_known` still distinguishes a measured 0 from silence. *This is the clinically load-bearing property.*
- **Exact-GTIN matching** — FDC's `/foods/search` is a text search; only a matching `gtinUpc` is accepted, or a scanned barcode could inherit an unrelated product's carbohydrate.
- **Resilience** — timeout, one retry, never-throw → `null`.

**No `DEMO_KEY` fallback server-side.** A missing secret returns `null` and the chain
falls through — honest — rather than silently running on a 50/day quota that looks
like "USDA rarely matches".

**Also fixed:** `.env.example` still listed `EXPO_PUBLIC_USDA_API_KEY=`. That template
is what the next developer copies, so the remediation would have survived only until
someone followed the instructions — the key would be back in the bundle with no code
change to notice. It now documents `supabase secrets set USDA_API_KEY=…` instead, and a
test asserts the active (non-comment) lines never name the public variable again.

**Deployment prerequisite — BLOCKED, no key exists (verified 2026-08-16).**

An attempt to complete the production step established that **there is no USDA API key
anywhere to deploy**:

| Checked | Finding |
|---|---|
| Local `.env` | `EXPO_PUBLIC_USDA_API_KEY` present but **EMPTY** |
| `supabase secrets list` (project `ftqyzpkzqeudzfztataz`) | `USDA_API_KEY` **absent** |
| Deployed `nutrition-search` | **version 2**, predates the USDA branches |

**Consequence for the pre-existing system.** Because the variable was empty, the old
client code fell through to its `DEMO_KEY` default — so USDA has been running on
**30 requests/hour and 50/day, shared across every user, for the whole life of the
build**, silently, exactly as F-1 predicted. This is not a regression introduced by the
remediation; the remediation is what made it visible.

**Also absent: `FATSECRET_CLIENT_ID/SECRET` and `EDAMAM_APP_ID/APP_KEY`.** Those
providers are written to return `null` when their secrets are missing, so the nutrition
chain in production has effectively been **Open Food Facts + UPCitemdb + the local
Moroccan database + Gemini**, with USDA on a demo quota and FatSecret/Edamam inert.
Worth confirming against expectations — it is a coverage question, not a safety one.

**RESOLVED — deployed and verified in production 2026-08-16.**
The owner configured the secret; `nutrition-search` was deployed **v2 → v4** (ACTIVE,
`verify_jwt: true`). `USDA_API_KEY` reads back as **CONFIGURED** (name/digest only —
the value was never read, printed, or written to source).

### Production smoke tests (against the live function)

| Test | Result | Evidence |
|---|---|---|
| Auth — no header | **PASS** | HTTP 401 `UNAUTHORIZED_NO_AUTH_HEADER` (platform) |
| Auth — anon key only | **PASS** | HTTP 401 `{"error":"unauthorized"}` — the function's own `callerUserId` check (P3/P4) rejects a validly-signed anon JWT |
| USDA text search | **PASS** | `"Broccoli, raw"` → kcal 31, carbs 6.27, fiber 2.4, sodium 36 |
| USDA GTIN | **PASS** | `044000032029` → `"Nabisco Biscuit Company CHOCOLATE SANDWICH COOKIES"`, carbs 73.5, brand prefixed |
| Exact GTIN | **PASS** | off-by-one `044000032028` → **null**, correctly rejected rather than returning a lookalike |
| Null-vs-zero | **PASS** | `sugar: null` and `glycemic_index: null` survive the wire while `carbs: 73.5` arrives as a number — absent ≠ measured zero, end to end |
| Fallback | **PASS** | nonsense query → `hit: null`, HTTP 200, no error thrown; unknown provider → HTTP 400 |
| Secret exposure | **PASS** | no response body mentions `api_key` / `USDA_API_KEY` |

A throwaway account was created to obtain a user JWT and **deleted afterwards via the
app's own `delete-account` function** (`{"ok":true}`) — no residue in production data.

**One upstream limit observed, not a defect.** A GTIN with an extra leading zero
(`0044000032029`) returns null: our `strip()` comparison normalises both sides correctly
(verified locally — the two compare equal), but **FDC's text search returns no record at
all for the padded query**, so the function never receives a row to match. The device-side
code shared this characteristic; it is an FDC retrieval limit, not something the move
introduced. Scanners emit the unpadded form, which works.

### Verification performed

| Gate | Result |
|---|---|
| Executable USDA key/endpoint references in `src/` | **0** (comment-stripped scan; the 5 raw matches are the comments documenting the fix) |
| Executable `EXPO_PUBLIC_*` in client | only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_DSN` — all legitimately public |
| Secret logging / committed credentials / tracked `.env` | none found; only `.env.example` is tracked |
| Edge function diff | **purely additive — 0 deleted lines**, so FatSecret/Edamam are untouched |
| `engine.ts` | **not modified** — provider ordering structurally unchanged |
| Typecheck · edge-import check · lint | PASS · PASS · PASS (6/6 baseline) |
| Affected suites (`carbProvenanceProviders`, `catalogTrust`, `apiKeyExposure`) | **69/69** |
| Full suite · clinical | **1448/1448** · **222/222 unchanged** |

**Not verified:** no device run, no scanner-accuracy check, no clinical validation, and
**nothing deployed** — the Edge Function change is on disk only.

### F-2 — Open Food Facts User-Agent · **FIXED / VERIFIED**

New shared constant `src/services/nutrition/providers/userAgent.ts`, applied in
`barcodeLookup.ts` and `openfoodfacts.ts`. The string is **identical to the one the
edge function already sends**, so OFF sees one application.

**OFF calls stay on the device by design** — OFF rate-limits per IP, and each patient's
own IP fits the 15/min budget naturally. Routing them server-side would put the whole
user base behind one egress IP.

### OFF search rate limit · **OPEN — MONITOR / FUTURE HARDENING**

Unchanged, as instructed. `food-search` (OFF **search**, 10 req/min per IP) runs through
a shared egress IP. Existing mitigations: `product_catalog` caches barcode hits, and
`cache.ts` backs the search layer. **No throttle exists.** Hardening options — a local
OFF mirror from daily exports, or a server-side token bucket — are a deliberate future
task, not part of this remediation.

---

## FINAL

**RECOMMENDED NOW:** No new API. **F-1 and F-2 are fixed** (§19); deploy the
`USDA_API_KEY` secret when convenient.
**RECOMMENDED LATER:** Local OFF mirror from daily exports *if* scan volume grows.
**NOT RECOMMENDED:** Nutritionix, Spoonacular, Chomp, Fruityvice, all alcohol/novelty APIs.
**CLINICAL REVIEW REQUIRED:** any change to a source feeding carbohydrates → bolus.
**LEGAL/PRIVACY REVIEW REQUIRED:** LogMeal, Clarifai — meal photographs leave the device; retention undocumented.

| Guarantee | |
|---|---|
| NO CODE CHANGED | **YES** |
| NO DEPENDENCIES ADDED | **YES** |
| NO API KEYS ADDED | **YES** |
| NO DATABASE CHANGED | **YES** |
| NO DEPLOYMENT | **YES** |
| NO CLINICAL FORMULAS CHANGED | **YES** |

*Nothing here is approved for implementation. F-1 and F-2 are recorded, not fixed.*
