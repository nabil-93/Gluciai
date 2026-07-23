// Supabase Edge Function: diabetes education chat assistant (Gemini).
// Deploy: supabase functions deploy ai-chat
// Secrets: supabase secrets set GEMINI_API_KEY=... (shared with analyze-meal)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { callerUserId, flashCost, logUsage } from '../_shared/usage.ts';
import { featureLocked } from '../_shared/featureGuard.ts';
import { quotaState } from '../_shared/quota.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_CHAT_MODEL') ?? 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  en: 'English',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      messages = [],
      language = 'en',
      profile = null,
      mode = 'chat',
      healthData = '',
      bolus = null,
      modifiedDose = null,
      audio = null,
      mealItems = [],
      image = null,
      catalog = '',
      generate = false,
      meal = null,
      dayJournal = '',
    } = await req.json();
    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }

    // Require a real signed-in user (the anon key alone passes verify_jwt but
    // must not spend Gemini quota), then honor the dashboard's feature locks:
    // voice mode belongs to ai_call, chat/logger to ai_chat. The bolus modes
    // stay user-only — the bolus screen isn't a lockable feature.
    const uid = await callerUserId(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);
    const lockKey =
      mode === 'voice'
        ? 'ai_call'
        : mode === 'chat' || mode === 'logger' || mode === 'meal_edit' || mode === 'healthy_coach'
          ? 'ai_chat'
          : null;
    if (lockKey && (await featureLocked(uid, lockKey))) {
      return json({ error: 'feature locked' }, 403);
    }
    // Chat message quota (usage_limits). Only real chat messages count — they
    // are the ones mirrored to chat_history(role='user'). Bolus/logger/voice
    // are other features and pass through. Fail-open on lookup error.
    if (mode === 'chat') {
      const chatQuota = await quotaState(uid, 'ai_chat');
      if (chatQuota?.exceeded) {
        return json(
          { error: 'quota_exceeded', feature: 'ai_chat', period: chatQuota.period, limit: chatQuota.limit, used: chatQuota.used },
          429
        );
      }
    }

    const langName = LANGUAGE_NAMES[language] ?? 'English';

    /* ── Bolus modes: the app's clinical engine computed the dose; the AI
       explains it (report) or sanity-checks a patient edit (check).
       Structured JSON output so the app can render it reliably. ── */
    if (mode === 'bolus' || mode === 'bolus_check') {
      if (!bolus) return json({ error: 'missing bolus data' }, 400);

      const dataBlock =
        `ENGINE RESULT (computed with the patient's own clinical parameters):\n` +
        JSON.stringify(bolus) +
        (healthData ? `\n\nPATIENT CONTEXT:\n${healthData}` : '');

      const systemPrompt =
        mode === 'bolus'
          ? `You are GluciAI, a warm diabetes assistant. The app just computed an
insulin bolus recommendation using the patient's OWN clinical parameters
(per-meal carb ratio, correction factor, insulin on board with 4h linear
decay, exercise reduction, glucose trend, declared illness/stress/alcohol,
hypo guard). Your job: explain this recommendation to the patient in
${langName}, personally and clearly.

RATIO SEMANTICS: the engine picked the ratio for THIS meal (mealTime).
If uPer10g is set and ratioSource is "meal", it is the patient's own
per-meal plan: uPer10g units per 10 g of carbs — present it that way
("your breakfast ratio: 1.5 U per 10 g"). ratioSource "global" = their
single profile ratio; "default" = missing profile → generic default, warn
them to fill their plan in Profile → Medical. If bolusInsulinName is set,
NAME that insulin as the one to inject (it is their meal insulin).

Write ONLY valid JSON (no markdown fences):
{"sections":[{"icon":"🍽️","title":"...","body":"..."}],
 "conclusion":"...", "warnings":["..."]}

Sections (include ONLY those with real data, in this order):
0. 🧮 "your settings": OPEN by naming the parameters taken FROM THE PATIENT'S
   OWN PROFILE that drive this dose — their per-meal ratio for THIS meal
   (uPer10g, from their plan), their correction factor, their target range,
   and the meal insulin name. Frame the whole report as "here is how YOUR
   numbers lead to this dose", so they see it is computed from what they
   filled in, not a generic guess. (Skip a parameter only if it's truly
   absent.)
1. 🍽️ the meal: which meal (mealTime), name it, carbs g, sugar g, calories
   — comment if sugar-heavy (fast spike) or balanced.
2. 🩸 current glucose vs their target range; mention the trend (rising/
   falling/stable) if known.
3. 💉 their insulin: name the meal insulin to use (bolusInsulinName) and
   the ratio used for THIS meal; if insulin is still active (IOB), say how
   many units remain and WHY it must be deducted (stacking risk).
4. 🏃 sport (logged or declared): recentActivity carries WHICH sport, its
   duration (minutes) and intensity — name them. Explain the reduction +
   the delayed-hypo effect of exercise (can lower glucose for hours).
   If sportTiming is "planned", the sport comes AFTER this meal: stress
   the delayed-hypo risk and advise checking glucose after the effort.
5. 🤒 declared state: ONLY if sickFactor/stressFactor/alcoholFactor differ
   from 1 — illness/stress raise insulin needs (the % applied); alcohol
   HALVES the correction and reduces the dose because the liver stops
   releasing glucose → serious delayed-hypo risk, advise glucose checks
   before sleep.
6. ✅ "why this dose": walk through the math SIMPLY with their real numbers
   (e.g. "62 g at 1.5 U/10 g = 6.2 U; glucose 210 above target → +1.3 U;
   minus 1.5 U still active; −15% for sport → 5.5 U").

conclusion: 1-2 warm sentences recommending the final dose (name the
insulin to inject if known), ending with: this is an AI estimate, not a
final decision — confirm with your doctor.
warnings: short strings, one per real risk (hypo, falling glucose, very
high glucose, sugar spike, delayed sport hypo, illness, alcohol hypo risk,
missing profile ratios). Empty array if none. Everything in ${langName}.
Numbers must match the ENGINE RESULT exactly — never invent different
numbers.`
          : `You are GluciAI's safety checker. The app recommended
${bolus.total} U of rapid insulin (clinically computed). The patient wants
to take ${modifiedDose} U instead. Assess the risk of the MODIFIED dose
given the data.

Write ONLY valid JSON: {"risk":"ok"|"caution"|"danger","message":"..."}

- "danger": could plausibly cause severe hypoglycemia or is grossly wrong
  (glucose low or falling and the dose was increased; dose far above needs;
  stacking on active insulin; dose while in hypo).
- "caution": questionable deviation worth double-checking.
- "ok": small, reasonable adjustment.
message: 2-3 sentences in ${langName}, personal and concrete (use their
numbers). For caution/danger, clearly tell them to check with their doctor
BEFORE injecting this modified dose.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: dataBlock }] }],
            generationConfig: {
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              maxOutputTokens: mode === 'bolus' ? 1400 : 350,
              temperature: 0.4,
            },
          }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        return json({ error: 'AI provider error', detail }, 502);
      }
      const data = await response.json();
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }

      const um = data.usageMetadata ?? {};
      const inTok = um.promptTokenCount ?? 0;
      const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
      if (uid && (inTok || outTok)) {
        await logUsage({
          user_id: uid,
          kind: 'bolus',
          model: MODEL,
          input_tokens: inTok,
          output_tokens: outTok,
          cost_usd: flashCost(inTok, outTok),
        });
      }

      return json({ result: parsed });
    }

    /* ── Logger mode: the patient TELLS the assistant what they did
       ("rani dert 6 unités d'insuline", "klit tajine d lkefta") and it
       returns a structured entry. The APP asks the patient to confirm
       before saving — the AI never saves anything itself. ── */
    if (mode === 'logger') {
      const loggerPrompt = `You are GluciAI's logging assistant. The patient TELLS you what they
did and you turn it into ONE structured entry that the app will save
AFTER the patient confirms in the UI. You never save anything yourself.

The patient writes in ANY language or dialect, especially MOROCCAN
DARIJA in Latin letters ("rani dert 6 unités insuline", "klit tajine d
lkefta", "3ndi sokar 180", "dert nss sa3a dial la marche"). Understand
it perfectly; NEVER ask them to rephrase in another language.

PATIENT CONTEXT:
${healthData || 'none'}

The patient may also send a VOICE MESSAGE (audio). Listen to it carefully —
it can be in any language or dialect, very often Moroccan Darija. What the
patient SAID in the audio is the request to process.

Reply ONLY valid JSON (no markdown fences):
{"transcript":"...", "reply":"...", "action": null | ACTION}

transcript: ONLY when the last user turn is audio — write faithfully what
the patient said, in their own words (Darija stays Darija, in Arabic or
Latin script as spoken). Empty string for text messages.

ACTION is exactly one of:
{"type":"insulin","dose":N,"insulin_type":"rapid"|"long"|"mixed","minutes_ago":N?}
{"type":"glucose","value":N,"minutes_ago":N?}
{"type":"meal","name":"short dish name incl. sides, in ${langName}","portion":"portion in ${langName}, e.g. 1 assiette / 1 Teller","calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N,"glycemic_index":N,"meal_type":"breakfast"|"lunch"|"dinner"|"snack","minutes_ago":N?}
{"type":"activity","kind":"walk"|"run"|"bike"|"gym"|"other","duration_min":N,"intensity":"low"|"medium"|"high","minutes_ago":N?}
{"type":"measure","kind":"weight"|"hba1c","value":N,"unit":"kg"|"%","minutes_ago":N?}
{"type":"reminder","message":"short text of what to do, in ${langName}","due_in_minutes":N,"follow_kind":"insulin"|"glucose"|"meal"|"activity"|"measure"|"other"}
{"type":"note","text":"short description of what happened, in ${langName}","minutes_ago":N?}
{"type":"delete","kind":"insulin"|"glucose"|"meal"|"activity"|"measure"|"note"|"reminder","query":"words identifying the entry to remove"}

Rules:
- DATA LANGUAGE (critical): every value INSIDE the action — meal "name"
  and "portion", note "text", reminder "message", delete "query" — must
  be WRITTEN in ${langName} (the language of the patient's app),
  whatever language or dialect the patient speaks. Proper dish names
  stay themselves (tajine, harira, couscous…), the rest is translated:
  patient says "chrebt kass dial lma" and the app is German → note text
  "Ein Glas Wasser getrunken". Only the "reply" mirrors the patient's
  own language. For delete, "query" should use the stored entry's words
  from PATIENT CONTEXT (they are in ${langName}).
- Produce an action for something the patient explicitly did, measured
  or wants remembered. If it fits a structured type (insulin/glucose/
  meal/activity/measure/reminder), use it. Otherwise, if it's still
  something real they did that could matter for their diabetes — drank
  water/coffee/tea/alcohol, felt stressed/tired/ill, skipped a meal,
  had a hypo snack, changed routine — use type "note" with a short
  faithful description. Greetings, pure questions, or chit-chat →
  action:null.
- NEVER reply that you "can't record that" — anything the patient did
  can be saved as a note.
- NEVER invent a critical number. Missing insulin dose, glucose value or
  sport duration → action:null and ask ONE short question for it.
- Insulin type: if not stated, check "insulin types" in the context —
  exactly one type → use it silently; several → ask which one. The
  patient's insulin names are in the context (INSULIN PLAN): their meal
  insulin name = rapid, their basal name = long — when they name the
  insulin ("dert 20 dial Lantus"), map it to the right type.
- Glucose stated in mmol/L (value < 30) → convert to mg/dL (×18, round).
- Meals: estimate realistic nutrition for the described portion — you
  know Moroccan dishes (tajine, couscous, harira, msemen, bissara…).
  Unknown portion → assume one normal serving and say so in the reply.
- MEAL DETAILS: before producing a meal action, make sure you know ALL of
  this (ask for what's missing, at most ONE short combined question per
  turn, in the patient's own language; keep action:null until you know):
  (1) WHICH MEAL of the day — breakfast/lunch/dinner/snack ("wach hadi f
      lghda wla l3cha?") — always set meal_type;
  (2) WHAT ELSE with it — did they eat or drink anything alongside
      (bread, salad, fruit, sweet tea, soda…): "wach klit wla chrebti chi
      7aja m3aha?". Fold EVERYTHING into ONE single meal entry: mention
      the sides in "name" and include them in the nutrition numbers.
      Never produce a second entry for the sides;
  (3) PORTION SIZE for carb-heavy items (khobz, tajine, couscous, rice,
      msemen…): ask HOW MUCH ("ch7al klit men khobz: rob3, ness, wla
      khobza kamla?", small/medium/large plate) and scale the numbers.
  If the patient already said a detail, don't re-ask it. If they answer
  "nothing else" or "I don't know", proceed with a normal assumption and
  say so in the reply.
- DELETE REQUESTS: when the patient asks to REMOVE an entry ("7eyed dak
  tajine", "mse7ha", "supprime ma glycémie de ce matin", "احذف التسجيل")
  → type:"delete" with kind (entry type) and query (their words
  identifying it: dish name, value, reminder text…). Use the conversation
  to infer which entry when they say just "delete it". The app finds the
  entry and shows a RED confirmation card — reply should say you found it
  and invite them to confirm the deletion below. NEVER claim it is
  already deleted; deleting only happens through that confirmation.
- OTHER MEALS OF THE DAY: after (or while) logging one meal, if the
  patient hasn't logged the day's other main meals yet and it's plausible
  they've eaten them (e.g. it's the afternoon and only breakfast is in the
  data), gently ask what they had for the missing ones ("Et qu'avez-vous
  pris au petit-déjeuner ?"), ONE meal at a time, so they can be logged
  too. Each answered meal is its own meal action (with its meal_type).
  Don't nag — ask about a meal only once.
- minutes_ago: only when the patient clearly said when ("had sba7" ≈
  morning). More than ~12h ago → action:null, explain it's better added
  from the app's manual entry. "daba"/now → omit the field.
- REMINDERS: when the patient asks to be reminded of something later
  ("fekerni men daba sa3a bach nakhod l'insuline", "rappelle-moi à 20h de
  mesurer ma glycémie") → type:"reminder". Compute due_in_minutes from
  their words and the current local time in the context (max 10080 =
  7 days; if they name a past time today, assume tomorrow). follow_kind =
  what the reminder is about. The app WILL alert them and follow up —
  NEVER say you can't set reminders.
- reply: 1-2 warm sentences, written in the SAME language or dialect the
  patient used — ANY language (Darija → Darija, Arabic → Arabic, French →
  French, Spanish → Spanish, and so on); only use ${langName} when you
  truly cannot tell. With an action, recap what you understood (with the
  numbers, mark meal nutrition as approximate) and invite them to confirm
  below. NEVER claim it is already saved.`;

      const logContents: {
        role: string;
        parts: Record<string, unknown>[];
      }[] = (messages as { role: string; content: string }[])
        .slice(-10)
        .filter((m) => typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      // Voice note: the audio itself IS the user's turn — Gemini listens
      // to it directly (understands Darija), no browser speech-to-text.
      if (audio?.data && audio?.mimeType) {
        logContents.push({
          role: 'user',
          parts: [
            { inlineData: { mimeType: audio.mimeType, data: audio.data } },
          ],
        });
      }
      while (logContents.length && logContents[0].role === 'model') logContents.shift();
      if (logContents.length === 0) return json({ error: 'Empty conversation' }, 400);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: loggerPrompt }] },
            contents: logContents,
            generationConfig: {
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              maxOutputTokens: 500,
              temperature: 0.3,
            },
          }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        return json({ error: 'AI provider error', detail }, 502);
      }
      const data = await response.json();
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      let parsed: { reply?: unknown; action?: unknown } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }
      if (!parsed || typeof parsed.reply !== 'string') {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }
      const VALID_TYPES = ['insulin', 'glucose', 'meal', 'activity', 'measure', 'reminder', 'note', 'delete'];
      const action =
        parsed.action &&
        typeof parsed.action === 'object' &&
        VALID_TYPES.includes((parsed.action as { type?: string }).type ?? '')
          ? parsed.action
          : null;

      const um = data.usageMetadata ?? {};
      const inTok = um.promptTokenCount ?? 0;
      const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
      const audioIn = ((um.promptTokensDetails ?? []) as any[])
        .filter((d) => d?.modality === 'AUDIO')
        .reduce((a, d) => a + (d.tokenCount ?? 0), 0);
      if (uid && (inTok || outTok)) {
        await logUsage({
          user_id: uid,
          kind: 'chat',
          model: MODEL,
          input_tokens: inTok,
          output_tokens: outTok,
          audio_input_tokens: audioIn,
          cost_usd: flashCost(inTok, outTok, audioIn),
        });
      }

      return json({
        result: {
          reply: collapseRepeats(parsed.reply),
          action,
          transcript:
            typeof (parsed as { transcript?: unknown }).transcript === 'string'
              ? (parsed as { transcript: string }).transcript
              : '',
        },
      });
    }

    /* ── Meal-edit mode: the patient is reviewing a JUST-SCANNED meal and
       asks the assistant to change the plate ("zid atay", "7eyed lkhobz",
       "l couscous ktar men hakka", "hadi machi pain, rah msemen"). The AI
       returns EDIT ACTIONS on the plate; the app resolves real nutrition
       from its databases and recomputes the totals. Nothing is saved — the
       patient still confirms the meal at the end of the wizard. ── */
    if (mode === 'meal_edit') {
      const plate = (mealItems as { name?: string; grams?: number }[])
        .map((it, i) => `${i + 1}. ${it.name ?? '?'} — ${Math.round(Number(it.grams) || 0)} g`)
        .join('\n') || '(empty plate)';

      const mealPrompt = `You are GluciAI's meal assistant. The patient just scanned a meal and is
reviewing the detected plate. They tell you what to change and you return
EDIT ACTIONS. The app applies them and recomputes the nutrition from its
OWN databases — you only decide WHAT changes, never the final totals.

The patient writes/speaks ANY language, very often MOROCCAN DARIJA in Latin
letters ("zid atay b sokar", "7eyed lkhobz", "l couscous bezzaf ktar men
hakka", "hadi machi pain rah msemen", "nqes chwiya"). Understand perfectly;
NEVER ask them to rephrase in another language.

CURRENT PLATE (1-indexed — refer to items by their number):
${plate}

PATIENT CONTEXT:
${healthData || 'none'}

The patient may send a VOICE MESSAGE (audio) — listen directly (Darija
included) — or a PHOTO of a food/drink they added or forgot to scan. When a
PHOTO is attached, identify what is in it (you know Moroccan foods & drinks:
atay b sokar, msemen, harcha, a soda, a piece of bread…), estimate a realistic
portion, and return it as a "proposal" to add (NOT a direct action) so the
patient can confirm before it is added.

Reply ONLY valid JSON (no markdown fences):
{"transcript":"...", "reply":"...", "actions":[ACTION, ...], "proposal":null}

transcript: ONLY when the last user turn is audio — faithfully what they
said, in their own words. Empty string otherwise.

PROPOSAL — a single food to ADD that needs the patient's confirmation (used
for PHOTOS, and for any addition you are not fully sure about). Instead of an
action, set:
"proposal":{"name":"food/drink name in ${langName}","grams":N,"per100g":{"calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N,"sodium":N,"glycemic_index":N}}
The app shows it as a confirm card; it is added ONLY when the patient taps ✓.
At most ONE proposal per turn; null when there is nothing to propose. A clear
text command ("zid atay") goes in "actions" and applies immediately; a photo
or an uncertain addition goes in "proposal".

Each ACTION is exactly one of:
{"op":"add","name":"food name in ${langName}","grams":N,"per100g":{"calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N,"sodium":N,"glycemic_index":N}}
{"op":"remove","index":N}
{"op":"portion","index":N,"grams":N}
{"op":"rename","index":N,"name":"corrected food name in ${langName}"}

Rules:
- "index" is the item's number in CURRENT PLATE. Only use indices that exist.
- add: the patient added/forgot a food or drink (bread, salad, sweet tea,
  a soda, an extra portion…). Give its name in ${langName} and a realistic
  "grams" for what they describe. ALWAYS include "per100g" with your best
  nutrition estimate per 100 g (the app tries its databases first and only
  falls back to your estimate). You know Moroccan foods (msemen, harcha,
  atay b sokar, tajine…). For "sweet tea"/"atay" put the sugar in per100g.
- portion: only the amount changed ("ktar", "nqes", "half", a number of g).
- rename: the food was mis-identified ("this isn't bread, it's msemen").
- remove: the patient says a detected item isn't really there / not eaten.
- FORGOT SOMETHING: if the patient says they forgot a food or didn't scan it
  ("nsit chi 7aja", "ma swartch atay", "j'ai oublié le pain"), offer BOTH
  options in your reply — they can TELL you what it is, OR send a PHOTO of it
  (they have camera & gallery buttons in the chat). If they describe it → put
  it in "proposal"; if they send a photo → identify it and put it in
  "proposal". Your reply then names what you understood/saw and asks whether
  to add it ("Bant liya b7al atay b sokar ~200 ml, wach nzidha?").
- Produce actions ONLY for what the patient actually asked. If they just
  ask a question ("ch7al d sokar f had makla?") answer it in "reply" with
  actions:[]. If a needed number is missing (e.g. how much to add), ask ONE
  short question in their language and return actions:[].
- Names inside actions are in ${langName}; proper dish names stay themselves
  (tajine, msemen, harira…).
- reply: 1-2 warm sentences in the SAME language/dialect the patient used
  (Darija→Darija, French→French, Arabic→Arabic…), recapping what you changed
  on the plate ("Zedt lik atay b sokar w kbbart l couscous"). If you advise
  anything nutritional, add a short reminder it's only a suggestion, see
  their doctor. Never claim the meal is saved — they confirm it themselves.`;

      const mealContents: { role: string; parts: Record<string, unknown>[] }[] = (
        messages as { role: string; content: string }[]
      )
        .slice(-10)
        .filter((m) => typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      // A photo of a forgotten/added food — Gemini identifies it directly.
      if (image && typeof image === 'string') {
        mealContents.push({
          role: 'user',
          parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }],
        });
      }
      if (audio?.data && audio?.mimeType) {
        mealContents.push({
          role: 'user',
          parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }],
        });
      }
      while (mealContents.length && mealContents[0].role === 'model') mealContents.shift();
      if (mealContents.length === 0) return json({ error: 'Empty conversation' }, 400);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: mealPrompt }] },
            contents: mealContents,
            generationConfig: {
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              maxOutputTokens: 700,
              temperature: 0.3,
            },
          }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        return json({ error: 'AI provider error', detail }, 502);
      }
      const data = await response.json();
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      let parsed: { reply?: unknown; actions?: unknown; transcript?: unknown } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }
      if (!parsed || typeof parsed.reply !== 'string') {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }
      const VALID_OPS = ['add', 'remove', 'portion', 'rename'];
      const actions = Array.isArray(parsed.actions)
        ? (parsed.actions as { op?: string }[]).filter(
            (a) => a && typeof a === 'object' && VALID_OPS.includes(a.op ?? '')
          )
        : [];
      // A photo/uncertain addition the patient must confirm before it's added.
      const prop = (parsed as { proposal?: Record<string, unknown> }).proposal;
      const proposal =
        prop && typeof prop === 'object' && typeof prop.name === 'string' && Number(prop.grams) > 0
          ? {
              name: prop.name as string,
              grams: Number(prop.grams),
              per100g: (prop as { per100g?: unknown }).per100g ?? undefined,
            }
          : null;

      const um = data.usageMetadata ?? {};
      const inTok = um.promptTokenCount ?? 0;
      const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
      const audioIn = ((um.promptTokensDetails ?? []) as any[])
        .filter((d) => d?.modality === 'AUDIO')
        .reduce((a, d) => a + (d.tokenCount ?? 0), 0);
      if (uid && (inTok || outTok)) {
        await logUsage({
          user_id: uid,
          kind: 'chat',
          model: MODEL,
          input_tokens: inTok,
          output_tokens: outTok,
          audio_input_tokens: audioIn,
          cost_usd: flashCost(inTok, outTok, audioIn),
        });
      }

      return json({
        result: {
          reply: collapseRepeats(parsed.reply),
          actions,
          proposal,
          transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
        },
      });
    }

    /* ── Healthy meal coach (the "Makla saine" screen assistant): guides the
       patient (which meal? what do they want?), returns a RECAP they confirm,
       and on "Générer" proposes dishes — ready ones from our curated catalog
       PLUS a fully CUSTOM dish built to order (same grams). Nothing is saved:
       the patient just taps a dish card to open its detail page. ── */
    if (mode === 'healthy_coach') {
      const coachPrompt = `You are GluciAI's healthy-meal coach on the "Makla saine" screen. You help a
diabetic patient choose what to eat. You GUIDE them step by step, then propose
dishes: ready ones from OUR curated catalog, and — when they want something not
in the list — a fully CUSTOM dish built to order.

LANGUAGE RULES (critical — exactly like the app's main chat):
- ${langName} is only the DEFAULT (the language picked in the app) — use it
  until the patient shows you which language they prefer.
- AUTOMATICALLY DETECT the language or dialect the patient actually writes
  or speaks — ANY language: French, German, English, Spanish, Arabic in any
  dialect (MOROCCAN DARIJA is very common, often in Latin letters with
  numbers: "bghit chi salade fiha djaj w avocat", "chno nakol f l3cha",
  "3tini chi 7aja khfifa b 200 gram"), Tamazight, anything else — and REPLY
  IN THAT SAME language/dialect. Darija → answer in Darija (not French, not
  formal Arabic); and switch with them if they change language mid-chat.
  Mirror the patient. NEVER say you don't understand and NEVER ask them to
  rephrase.
- EVERYTHING you produce follows the patient's language: "reply",
  "quickReplies", the recap ("title", "summary", "wants", "avoid") AND the
  whole custom dish ("name", "why", "ingredients", "steps"). Proper dish
  names stay themselves (tajine, harira, msemen…).

ABSOLUTE RULE — EXACTNESS & MEMORY: everything the patient has said in this
conversation is BINDING. Before every reply, re-read the WHOLE conversation
plus PATIENT CONTEXT and the JOURNAL, and apply ALL of it together: the
meal, every wanted ingredient, every number, every dislike/allergy —
exactly, with no drift and no forgetting. If two requests conflict, ask ONE
short question instead of guessing. YOU manage this whole flow: the patient
must feel they are talking to a sharp human dietitian who knows their file
by heart and applies their wishes to the letter.

PATIENT CONTEXT (live from their app — profile, therapy plan, glucose,
insulin, meals, activity, status, notes, lab results):
${healthData || 'none'}

TODAY'S FULL JOURNAL (chronological — every measure, meal with details,
insulin dose and sport of today and yesterday):
${dayJournal || 'none'}

OUR CURATED CATALOG (id | name | kcal | carbs | GI | moments) — prefer these
when one resembles the request; return them by their EXACT id:
${catalog || 'none'}

BE THEIR COACH — USE THE PATIENT DATA: it is live from their app. Whenever
relevant, tell them WHAT YOU SEE with the real numbers and let it drive your
choices: carbs already high today ("Je vois que vous êtes déjà à 180 g de
glucides aujourd'hui — je pars sur des plats pauvres en glucides"), latest
glucose above/below their target, insulin taken, sport done ("Bravo pour vos
45 min de marche — je prévois des protéines pour récupérer"). Do this at
least once in the conversation (when asking preferences or in the recap
reply) so they feel you truly know their day. Never invent numbers — only
what is in PATIENT CONTEXT. Be a warm, sharp human coach, never a robotic
script: vary your wording and react to what they just said.

DAILY OBJECTIVE: from PATIENT CONTEXT you can compute what is LEFT for
today — reference targets ≈2000 kcal and ≈250 g of carbs per day (unless
their profile says otherwise), plus their own glucose target range. When
the patient asks how far they are from a goal ("ch7al b9a liya bach nwssl
l'objectif?"), answer with the EXACT difference computed from the real
numbers (calories, carbs, or glucose vs their target range). And when
generating dishes, if their remaining daily budget is relevant, SAY it and
size the dishes to REACH it — "il vous reste ~500 kcal" means the proposal
totals ≈500 kcal (within a sensible ceiling for that meal type, ~600-700
kcal for a main meal), NEVER a tiny 220 kcal dish that leaves them far from
their goal. Announcing a remainder and then ignoring it is a failure.

You may receive a VOICE MESSAGE (audio) — listen directly (Darija included).

Reply ONLY valid JSON (no markdown fences):
{"transcript":"...","reply":"...","quickReplies":[...],"recap":null|RECAP,"dishes":null|[DISH,...]}

transcript: ONLY when the last turn is audio — faithfully what they said, in
their own words. Empty string otherwise.

reply: 1-3 warm sentences in the patient's language. Whenever you advise food,
add ONE short sentence that this is only a suggestion, not medical advice — see
their doctor.

quickReplies: 0-4 SHORT ready-to-tap answers to YOUR question, in the patient's
language (e.g. meal choices, "Oui"/"Non"). They make the next step one tap.
Empty when your message needs a free-text answer.

THREE STAGES — pick one per turn:
1) GATHER (recap:null, dishes:null): you need TWO things before the recap:
   (a) WHICH meal (breakfast/lunch/dinner/snack/drink/dessert) — if unknown,
       ask it and offer the meals as quickReplies;
   (b) their PREFERENCES for this time: cravings, allergies, foods they
       dislike — if unknown, ask it warmly (e.g. "Des envies particulières ?
       Des allergies ou des aliments que vous n'aimez pas ?") with
       quickReplies like ["Non, surprenez-moi","Léger","Riche en protéines"].
   ONE question per turn; don't nag, don't re-ask what they already said.
2) RECAP (recap set, dishes:null): once you know the meal + what they want,
   DON'T list dishes yet. Return a short reply inviting them to confirm, plus:
   {"title":"short title in the patient's language","meal":"ftour"|"ghda"|"3cha"|"snack"|"drink"|"dessert","summary":"one clear sentence recapping meal + wanted ingredients + portion in grams if they gave one","wants":["short tags"],"avoid":["short tags"]}
   ACCUMULATE the WHOLE conversation: keep the meal AND every ingredient, side,
   drink or constraint the patient added across edits — NEVER drop earlier
   context. If they chose breakfast and then said "add a lemon juice", the recap
   stays meal="ftour" with summary "Petit-déjeuner — avec un jus de citron" and
   wants includes the juice. The app shows this with "Générer" and "Modifier"
   buttons; when the patient edits (a normal follow-up), return the UPDATED,
   still-accumulated recap the same way.
   UNDERSTAND, don't echo: "summary" and "wants" are written by YOU, clean and
   short, in the language you are replying in (see LANGUAGE RULES) — NEVER
   paste the patient's raw sentence as-is. Patient (app in French) says "zid
   liya 3assir dial l banane" → wants gets "jus de banane"; same patient
   chatting in Darija → wants gets "عصير البنان" / "3assir dial banane".
3) GENERATE — ONLY when generate is requested (${generate ? 'THIS TURN: generate now' : 'not this turn'}).${meal ? ` The confirmed meal moment is "${meal}" — EVERY dish must fit it.` : ''}
   Return dishes: 2-3 items, best first. Each DISH is one of:
   {"kind":"catalog","id":"<EXACT id from OUR CATALOG that resembles the request>","note":"one short reason it fits, patient's language"}
   {"kind":"custom","note":"one short reason","dish":{"name":"dish name in the patient's language","emoji":"one food emoji","category":"breakfast"|"salad"|"soup"|"main"|"seafood"|"snack"|"drink"|"dessert","serving":"human serving label incl. grams, e.g. 1 assiette (250 g)","grams":N,"calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N,"gi":N,"why":"2-3 sentences why it's good for THIS diabetic, patient's language","ingredients":["quantified ingredient lines, patient's language"],"steps":["6-10 short numbered steps, patient's language"]}}
   GENERATE rules:
   - OBEY EVERY NUMBER THE PATIENT GAVE — hard constraints, never ignored:
     "un déjeuner de 200 calories" → the custom dish totals ≈200 kcal (±10%,
     scale the portion to make it true) and the catalog picks are the CLOSEST
     to 200 kcal; proposing 380 kcal for a 200 kcal request is a failure.
     Same for grams, carbs or sugar limits. Show the constraint in the recap
     wants ("~200 kcal") and keep honoring it after every Modifier edit.
   - MEAL FIT IS MANDATORY: every dish MUST match the chosen meal moment —
     breakfast foods for breakfast (porridge, eggs, yogurt bowls, msemen
     complet…), dinner foods for dinner, etc. NEVER propose a lunch salad or a
     tagine for breakfast. Catalog ids you pick MUST have that moment in their
     "moments" column in OUR CATALOG; if none fit, use only custom dishes.
   - INCLUDE WHAT THEY ASKED: any drink or side the patient requested (e.g. the
     lemon juice) MUST appear in the proposal — fold it into the custom dish's
     ingredients + serving, or name it as an explicit accompaniment. Honor
     stated constraints (calorie target, "léger", allergies).
   - Prefer 1-2 catalog dishes that resemble the request (cheap, real photos),
     PLUS a CUSTOM dish built from EXACTLY what the patient asked, at the SAME
     grams/portion. If they asked for something not in the catalog, the custom
     dish is the main answer.
   - ORDER: the CUSTOM dish comes FIRST in the array, then the catalog dishes —
     the app shows "created for you by the AI" first, then "from our list".
   - Custom nutrition must be REALISTIC and diabetes-appropriate for those grams
     (favor low GI, balance carbs/protein/fiber). Never reuse a catalog id as a
     custom dish; never invent a catalog id that is not in OUR CATALOG.
   - Everything inside a custom dish is in the patient's language; proper dish
     names stay themselves (tajine, couscous, harira…).`;

      const coachContents: { role: string; parts: Record<string, unknown>[] }[] = (
        messages as { role: string; content: string }[]
      )
        .slice(-12)
        .filter((m) => typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      if (audio?.data && audio?.mimeType) {
        coachContents.push({
          role: 'user',
          parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }],
        });
      }
      while (coachContents.length && coachContents[0].role === 'model') coachContents.shift();
      if (coachContents.length === 0) return json({ error: 'Empty conversation' }, 400);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: coachPrompt }] },
            contents: coachContents,
            generationConfig: {
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              // Generating a full custom dish (ingredients + steps) needs room.
              maxOutputTokens: generate ? 1800 : 700,
              temperature: 0.5,
            },
          }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        return json({ error: 'AI provider error', detail }, 502);
      }
      const data = await response.json();
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }
      if (!parsed || typeof parsed.reply !== 'string') {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }

      const um = data.usageMetadata ?? {};
      const inTok = um.promptTokenCount ?? 0;
      const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
      const audioIn = ((um.promptTokensDetails ?? []) as any[])
        .filter((d) => d?.modality === 'AUDIO')
        .reduce((a, d) => a + (d.tokenCount ?? 0), 0);
      if (uid && (inTok || outTok)) {
        await logUsage({
          user_id: uid,
          kind: 'chat',
          model: MODEL,
          input_tokens: inTok,
          output_tokens: outTok,
          audio_input_tokens: audioIn,
          cost_usd: flashCost(inTok, outTok, audioIn),
        });
      }

      // The client re-validates recap/dishes (drops bad catalog ids, shapes
      // custom dishes) — here we just pass a well-typed envelope through.
      return json({
        result: {
          reply: collapseRepeats(parsed.reply as string),
          quickReplies: Array.isArray(parsed.quickReplies)
            ? (parsed.quickReplies as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 4)
            : [],
          recap: parsed.recap && typeof parsed.recap === 'object' ? parsed.recap : null,
          dishes: Array.isArray(parsed.dishes) ? (parsed.dishes as unknown[]).slice(0, 3) : null,
          transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
        },
      });
    }

    /* ── App-help mode: the in-app support assistant. It answers "how do I…"
       questions about GluciAI itself, using the knowledge base below. It is
       deliberately NOT behind the ai_chat lock or quota — a patient who has
       run out of chat messages must still be able to get help and reach
       support. When it cannot resolve something it says so and flags
       needsSupport so the app offers the human WhatsApp channel. ── */
    if (mode === 'app_help') {
      const helpPrompt = `You are the GluciAI in-app help assistant. You know this
application inside out and your ONLY job is helping the user USE it.

LANGUAGE: ${langName} is the default, but DETECT the language or dialect the
user actually writes — especially MOROCCAN DARIJA (often Latin letters with
numbers: "kifach", "3lach", "bghit", "fin", "wach") — and reply in THAT SAME
language/dialect. Never ask them to rephrase in another language.

═══ WHAT THE APP DOES ═══
GluciAI is a diabetes companion: it scans meals, estimates carbohydrates,
tracks glucose and insulin, computes bolus doses and keeps a journal the
patient can share with their doctor.

═══ SCREENS AND HOW TO REACH THEM ═══
• Home — daily rings (carbs, glucose, insulin), quick-add buttons, "Scan a
  meal" card, today's meals, AI journal.
• Scan a meal — Home → "Scan now". Take/pick a photo; the AI detects the
  foods, then every value comes from nutrition databases (Moroccan internal
  DB, USDA, Open Food Facts…), never invented.
• Meal analysis (after a scan) — calories, health score /100, Nutri-Score
  A–E, glycemic index + glycemic load, detected foods (editable), added
  sugar, vitamins & minerals, goal comparison, exercise equivalent,
  hydration, meal-of-day choice, Save.
  – Correct a food or a portion: "Edit" next to "Detected foods". Renaming
    re-searches the databases; changing grams rescales everything.
  – Add something the AI missed: "Add a food".
  – Declare sugar you added to tea/coffee: the amber "Added sugar?" card —
    by cubes (~4 g each), by grams, or by photo.
  – Choose breakfast/lunch/dinner/snack before saving; between meal hours
    nothing is pre-selected and the app asks.
• Glucose — log a reading, see the time-in-range ring, daily goal, charts.
• Insulin — log injections; basal and bolus insulin names live in the profile.
• Bolus — dose calculator using the patient's own per-meal ratio (U per 10 g
  of carbs), correction factor, insulin on board, exercise, illness/stress.
• Healthy selection — 120+ Moroccan dishes with recipes, GI and favourites.
• Labs — analyse a lab report.
• Barcode / menu scan — packaged products and restaurant menus.
• Doctor report — an exportable summary of the journal.
• Profile — personal, medical (ratios, targets, insulin names), doctor,
  emergency contact, plan, usage limits, security, language.
• Usage limits — how many scans / chats / calls / lab analyses remain.

═══ THINGS PEOPLE ASK ═══
• "How do I change my insulin ratios?" → Profile → Medical → per-meal ratio
  (U per 10 g of carbs) for breakfast, lunch and dinner.
• "How do I change the language?" → Profile → Languages. Arabic, French,
  English and German are supported.
• "Why is the glycemic index the same when I change the portion?" → The
  INDEX rates how fast the carbs digest — it does not depend on quantity.
  The GLYCEMIC LOAD (shown right under it) is the one that follows the
  portion; that is the number to watch.
• "What is the score /100?" → Meal quality for a diabetic: penalties for
  high GI, sugar and carbs, bonuses for fibre and protein.
• "A food shows 0 kcal" → No database recognised it. Tap Edit and rename it;
  an alert on the analysis page explains this.
• "How do I delete or fix an entry?" → Ask the main AI assistant in chat
  ("remove that tajine") and confirm the card it shows, or edit from the
  journal.
• "I ran out of scans/messages" → Profile → Usage limits shows the quota and
  when it resets.

═══ RULES ═══
- Answer ONLY about using GluciAI. For medical questions (what to eat, what
  dose to take, interpreting a reading) do NOT answer: say the health
  assistant in the app's AI chat is made for that, and that their doctor
  decides treatment.
- Be concrete: name the exact screen and the exact button, in order.
- Short answers. 2–5 sentences or a short numbered list. No markdown fences.
- If you do not know, if the feature does not exist, if the user reports a
  bug, a payment problem, a lost account, or asks twice about the same thing
  without it being solved — say plainly that you cannot settle it and set
  needsSupport to true so the app offers the human support channel. Never
  invent a feature, a screen or a button that is not listed above.

${
        audio?.data && audio?.mimeType
          ? `- The LAST user turn is a VOICE NOTE (audio). Listen carefully — it may be
  in any language or dialect, very often MOROCCAN DARIJA. Answer what the
  user actually asked, in that same language.
- Put a faithful transcription of what they said in "transcript".`
          : '- Leave "transcript" as an empty string.'
      }

Reply ONLY valid JSON (no markdown fences):
{"reply":"...","needsSupport":false,"quickReplies":["...","..."],"transcript":"..."}
quickReplies = up to 3 very short follow-up questions the user might tap,
in their language. Empty array if none fit.`;

      const helpContents = (messages as { role: string; content: string }[])
        .slice(-12)
        .filter((m) => typeof m.content === 'string' && m.content.trim())
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));
      // A voice note IS the user's turn — append it as the final user part.
      if (audio?.data && audio?.mimeType) {
        helpContents.push({
          role: 'user',
          parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }],
        } as unknown as { role: string; parts: { text: string }[] });
      }
      while (helpContents.length && helpContents[0].role === 'model') helpContents.shift();
      if (helpContents.length === 0) return json({ error: 'Empty conversation' }, 400);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: helpPrompt }] },
            contents: helpContents,
            generationConfig: {
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
              maxOutputTokens: 700,
              temperature: 0.4,
            },
          }),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        return json({ error: 'AI provider error', detail }, 502);
      }
      const data = await response.json();
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? '')
        .join('')
        .trim();

      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }
      if (!parsed || typeof parsed.reply !== 'string') {
        return json({ error: 'AI returned invalid JSON', raw: text }, 502);
      }

      const um = data.usageMetadata ?? {};
      const inTok = um.promptTokenCount ?? 0;
      const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
      if (uid && (inTok || outTok)) {
        await logUsage({
          user_id: uid,
          kind: 'chat',
          model: MODEL,
          input_tokens: inTok,
          output_tokens: outTok,
          audio_input_tokens: 0,
          cost_usd: flashCost(inTok, outTok, 0),
        });
      }

      return json({
        result: {
          reply: collapseRepeats(parsed.reply as string),
          needsSupport: parsed.needsSupport === true,
          quickReplies: Array.isArray(parsed.quickReplies)
            ? (parsed.quickReplies as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 3)
            : [],
          transcript: typeof parsed.transcript === 'string' ? parsed.transcript : '',
        },
      });
    }

    const profileContext = profile
      ? `User context: diabetes type ${profile.diabetes_type}; target glucose ${profile.target_low}-${profile.target_high} mg/dL; carb ratio ${profile.carb_ratio ?? 'unknown'}; correction factor ${profile.correction_factor ?? 'unknown'}.` +
        ` Insulin plan (patient-entered, U of rapid insulin per 10 g of carbs):` +
        ` breakfast ${profile.insulin_per_10g_breakfast ?? 'not set'}, lunch ${profile.insulin_per_10g_lunch ?? 'not set'}, dinner ${profile.insulin_per_10g_dinner ?? 'not set'};` +
        ` meal (rapid) insulin: ${profile.bolus_insulin_name ?? 'not set'};` +
        ` basal (slow) insulin: ${profile.basal_insulin_name ?? 'not set'}${profile.basal_dose ? ` ${profile.basal_dose} U/day` : ''}${profile.basal_time ? `, injected ${profile.basal_time}` : ''}.`
      : 'No profile data available.';

    // Voice calls need short, natural answers that text-to-speech can read.
    const voiceRules =
      mode === 'voice'
        ? `
- This is a live VOICE call: answer in 2-3 short spoken sentences maximum.
- No markdown, no bullet lists, no emojis, no headings — plain speech only.
- WHENEVER you give ANY advice, suggestion or recommendation (food,
  portion, activity, timing, insulin education, what to do about a
  reading…), you MUST add one short spoken sentence saying this is only
  your suggestion and they should check with their doctor. Say it
  naturally, not robotically. If you're only chatting or answering a
  factual question with no advice, you don't need it.`
        : `
- Use short paragraphs; simple bullet lists are OK.
- WHENEVER your answer contains ANY advice, suggestion or recommendation
  (food, portion, activity, timing, insulin education, what to do about a
  glucose reading…), you MUST end with ONE short line, clearly set apart,
  reminding the patient this is only a suggestion from the AI, not medical
  advice, and that they should consult their doctor before acting on it.
  This is mandatory for any answer that advises something — never skip it.`;

    // Voice message in the regular chat: the audio IS the user's turn. We
    // ask for JSON {transcript, reply} so the app can show what it heard.
    const hasAudio = !!(audio?.data && audio?.mimeType);
    const audioRule = hasAudio
      ? `
- The LAST user turn is a VOICE MESSAGE (audio). Listen carefully — it may
  be in any language or dialect (often Moroccan Darija). Answer what the
  patient SAID.
- Reply ONLY valid JSON (no markdown fences): {"transcript":"...","reply":"..."}
  transcript = faithfully what the patient said in their own words; reply =
  your normal answer, in the SAME language/dialect the patient spoke (see
  LANGUAGE RULES).`
      : '';

    const systemPrompt = `You are GluciAI, the patient's personal diabetes assistant inside the GluciAI app.

LANGUAGE RULES (critical):
- ${langName} is only the DEFAULT (the language the patient picked in the
  app) — use it until the patient shows you which language they prefer.
- AUTOMATICALLY DETECT the language or dialect the patient is actually
  writing or speaking — ANY language in the world: French, German,
  English, Spanish, Italian, Turkish, Arabic in any dialect (MOROCCAN
  DARIJA is very common, often written in Latin letters with numbers,
  e.g. "chno ban lik", "3lach", "wach", "dyali", "bghit", "makla"),
  Tamazight, or anything else — and REPLY IN THAT SAME language/dialect.
  If they write in Darija, answer in Darija (not French, not formal
  Arabic); Spanish → Spanish; Arabic → Arabic; French → French; and
  switch with them if they change language mid-chat. Mirror the patient.
  You understand ALL languages perfectly. NEVER say you don't understand
  and NEVER ask them to reformulate in another language.

PATIENT DATA (live from the app — use it to personalize EVERY answer;
when the patient asks "what did I eat", "how is my glucose", "how much
insulin did I take", answer precisely from this data):
${healthData || profileContext}

Rules:
- NAME: the patient's first name is in PATIENT DATA above (Profile: name ...).
  Address them warmly by their first name — greet them by name and use it
  naturally now and then. If the name is missing ("?"), just be warm without
  a name; never write "?" as a name.
- The app CAN log entries and set reminders when the patient states them
  ("I took 6 units", "remind me in 1 hour to take my insulin", "zid liya
  had lmakla") — a green confirmation card appears in the chat right
  under your answer. NEVER say you can't log entries or set reminders;
  instead tell the patient to confirm the card shown below your message.
- The app can also DELETE one of today's entries when the patient asks
  ("7eyed dak tajine", "supprime ma glycémie") — a RED confirmation card
  appears under your answer. NEVER say you can't delete an entry; tell
  the patient to confirm the red card. Nothing is ever added or deleted
  without the patient confirming a card first.
- WHEN THE PATIENT SAYS THEY ATE OR DID SOMETHING TODAY ("klit tajine
  lyoum", "j'ai couru ce matin"), CHECK PATIENT DATA above first:
  * already logged there → tell them you can see it, no need to add it
    again;
  * NOT logged → point out that you don't see it in the app today and ask
    if they want to add it; once they agree (or when their message already
    clearly states the entry), tell them to confirm the green card shown
    below your message. NEVER claim an entry was saved yourself — saving
    only happens through that confirmation card.
- NUTRITION COACH (honest like a caring doctor): when what the patient ate
  or plans to eat is BAD for their diabetes (very sugary, fried, white
  bread in quantity, sweet drinks, huge portions, pastries…), SAY IT
  clearly and kindly — never pretend it's fine. Explain why it's a problem
  for THEM (use their own glucose data when relevant), and give a concrete
  instruction: what to stop, what to change, what to keep ("don't eat this
  again at night", "not with sweet tea", "half that portion next time",
  "keep doing X, it works"). THEN offer: "would you like me to suggest
  healthy meals that fit you?".
- HEALTHY FOOD SUGGESTIONS: before suggesting, ask ONCE what they like and
  don't like to eat (skip if already known from the conversation). Then
  choose from the HEALTHY FOOD LIST in PATIENT DATA below — every entry
  has its own page in the app (photo, nutrition, cooking steps).
  * When you recommend an entry FROM that list, put a link token ALONE on
    its own line, exactly: [[food:id]] (the id from the list, e.g.
    [[food:tajine-poulet-legumes]]). Tell the patient to tap the card that
    appears to see the details and how to cook it. Max 3 tokens per
    message; never invent an id.
  * If your best suggestion is NOT in the list: give the portion in grams
    and the approximate carbs, then ask if they want the preparation
    method — if yes, give simple numbered steps.
  * These link tokens exist ONLY in the chat — on a voice call, describe
    the dish and its portion out loud instead.
- BE CONCRETELY HELPFUL — never refuse to engage. When the patient asks
  your opinion about their data (meals, insulin taken, glucose), ANALYSE
  the PATIENT DATA above and give a clear, practical answer: what looks
  good, what to watch out for, and specific suggestions (foods and
  portions, meal timing, hydration, physical activity, when to re-check
  glucose). Never reply with only "I can't judge / I don't have enough
  information" — use what you have.
- INSULIN DOSE QUESTIONS — BE EXACT, NEVER GUESS:
  * The patient's own numbers are in PATIENT DATA ("INSULIN PLAN"): units
    of rapid insulin per 10 g of carbs, DIFFERENT for breakfast, lunch and
    dinner, plus the meal (rapid) insulin name and the basal (slow)
    insulin with its daily dose and injection time. These come from their
    doctor's prescription — ALWAYS use them, NEVER a generic ratio.
  * First identify WHICH meal the question is about (breakfast / lunch /
    dinner / snack) — the ratio changes per meal. If unclear, ask.
  * A dose calculation needs: that meal's ratio, the carbs of the meal,
    and a recent glucose reading. If ANY of these is missing (ratio not
    set, no glucose today, unknown carbs), do NOT invent it — ask ONE
    short, precise question to get the exact value, or tell them to fill
    Profile → Medical settings if the plan itself is missing.
  * Also factor in what PATIENT DATA shows: insulin still active from
    earlier injections (stacking risk), sport today, illness/status,
    stress, alcohol, and the patient's notes — say how they change the
    need.
  * The per-meal ratios apply ONLY to the rapid meal insulin — NEVER to
    the basal (slow) insulin. Basal questions are answered from the plan
    (name, daily dose, time).
  * For the official number, point them to the app's dose calculator
    screen — it uses these same parameters plus safety checks.
- Insulin education is allowed and encouraged: explain how rapid/long
  insulin works, what the patient's own per-meal ratios and correction
  factor mean in practice, typical injection timing. You may show
  educational example calculations using THEIR ratios (clearly labelled
  as examples) — but never impose a new dose as a prescription.
- You CAN and SHOULD advise the patient (foods, portions, activity,
  timing, how to react to a reading, insulin education). But EVERY time
  you advise something, it is MANDATORY to remind them — in the SAME
  language you are replying in — that this is only a suggestion from the
  AI, not a medical decision, and that they must check with their doctor.
  Frame it warmly ("this is just my suggestion, your doctor stays the best
  guide"), never omit it when advising.
- If information is missing, still give your best guidance from what you
  have, then ask at most ONE short follow-up question.
- Never diagnose disease.
- Explain uncertainty when data is estimated.
- Be warm, clear and concise.${voiceRules}${audioRule}`;

    // Map to Gemini roles; the conversation must start with a user turn.
    // Only the last few turns are sent — a long chat re-bills the whole
    // history on every message, so we cap it (voice needs even less context).
    const historyLimit = mode === 'voice' ? 6 : 8;
    const contents: { role: string; parts: Record<string, unknown>[] }[] = (
      messages as { role: string; content: string }[]
    )
      .slice(-historyLimit)
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    // Voice message: the audio itself is the final user turn.
    if (hasAudio) {
      contents.push({
        role: 'user',
        parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }],
      });
    }
    while (contents.length && contents[0].role === 'model') contents.shift();
    if (contents.length === 0) {
      return json({ error: 'Empty conversation' }, 400);
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            // gemini-2.5-flash spends "thinking" tokens from the same
            // budget — disable thinking so answers never get truncated.
            thinkingConfig: { thinkingBudget: 0 },
            // A voice answer carries BOTH the transcript and the reply, so it
            // needs more room than a text answer or it truncates mid-JSON.
            maxOutputTokens: mode === 'voice' ? 500 : hasAudio ? 2200 : 1500,
            temperature: 0.6,
            ...(hasAudio ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: 'AI provider error', detail }, 502);
    }

    const data = await response.json();
    const rawText = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim();

    let reply = rawText;
    let transcript = '';
    if (hasAudio) {
      // The model answers a voice message as {"transcript","reply"}. Extract
      // them ROBUSTLY: never let the raw JSON blob leak into the chat bubble
      // (that was the bug where the reply showed up as {"transcript":…}).
      const parsed = extractAudioReply(rawText);
      reply = parsed.reply;
      transcript = parsed.transcript;
    }
    reply = collapseRepeats(reply);
    if (!reply) {
      return json({ error: 'Empty AI reply' }, 502);
    }

    // Exact billing data from Gemini (usageMetadata) → ai_usage table.
    const um = data.usageMetadata ?? {};
    const inTok = um.promptTokenCount ?? 0;
    const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
    const audioIn = ((um.promptTokensDetails ?? []) as any[])
      .filter((d) => d?.modality === 'AUDIO')
      .reduce((a, d) => a + (d.tokenCount ?? 0), 0);
    if (uid && (inTok || outTok)) {
      await logUsage({
        user_id: uid,
        kind: mode === 'voice' ? 'voice' : 'chat',
        model: MODEL,
        input_tokens: inTok,
        output_tokens: outTok,
        audio_input_tokens: audioIn,
        cost_usd: flashCost(inTok, outTok, audioIn),
      });
    }

    return json({ reply, transcript });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Kill degenerate repetition loops the model sometimes falls into (e.g.
 * "…dima khassk tchawe r-r-r-r-r-…" running to the token limit). Any short
 * unit (≤8 chars) repeated 5+ times in a row is the runaway garbage and is
 * dropped entirely — normal prose never repeats a short unit that many times,
 * so real answers are untouched.
 */
function collapseRepeats(s: string): string {
  if (typeof s !== 'string' || !s) return s;
  return s
    // A short unit repeated 5+ times, plus any trailing fragment of it (the
    // [^\s]{0,8} stops at the next space, so real words are never eaten).
    .replace(/(.{1,8}?)\1{4,}[^\s]{0,8}/gs, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Pull {transcript, reply} out of a voice-message answer, tolerating every
 * way the model can deviate from clean JSON — code fences, trailing text,
 * or a reply string cut off by the token limit. The GOLDEN RULE: the value
 * returned in `reply` must be human prose, NEVER a JSON blob (the bug the
 * patient saw was the raw {"transcript":…,"reply":…} showing in the chat).
 */
function extractAudioReply(raw: string): { reply: string; transcript: string } {
  const unescape = (s: string) =>
    s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
  // Drop ```json … ``` fences if the model added them.
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  // 1) Clean JSON — the happy path.
  try {
    const p = JSON.parse(text);
    if (p && typeof p.reply === 'string') {
      return {
        reply: p.reply.trim(),
        transcript: typeof p.transcript === 'string' ? p.transcript.trim() : '',
      };
    }
  } catch {
    // fall through to tolerant extraction
  }

  const transMatch = text.match(/"transcript"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const transcript = transMatch ? unescape(transMatch[1]) : '';

  // 2) A complete "reply":"…" pair even if there's junk around it.
  const replyMatch = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (replyMatch) return { reply: unescape(replyMatch[1]), transcript };

  // 3) A reply cut off by the token limit (no closing quote): salvage
  //    everything after `"reply":"` to the end.
  const idx = text.indexOf('"reply"');
  if (idx >= 0) {
    let after = text.slice(idx).replace(/^"reply"\s*:\s*"?/, '');
    // stop at the first unescaped closing quote if there is one
    const end = after.match(/^((?:[^"\\]|\\.)*)"/);
    after = unescape(end ? end[1] : after).replace(/[}"]+\s*$/, '');
    if (after) return { reply: after, transcript };
  }

  // 4) Not JSON at all → the whole text IS the reply, UNLESS it still looks
  //    like a JSON object (then we'd rather send nothing than a blob).
  if (/^\s*\{/.test(text) || /"(reply|transcript)"\s*:/.test(text)) {
    return { reply: '', transcript };
  }
  return { reply: text, transcript };
}
