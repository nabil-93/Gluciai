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
        : mode === 'chat' || mode === 'logger' || mode === 'meal_edit'
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
(carb ratio, correction factor, insulin on board with 4h linear decay,
recent exercise reduction, glucose trend, hypo guard). Your job: explain
this recommendation to the patient in ${langName}, personally and clearly.

Write ONLY valid JSON (no markdown fences):
{"sections":[{"icon":"🍽️","title":"...","body":"..."}],
 "conclusion":"...", "warnings":["..."]}

Sections (include ONLY those with real data, in this order):
1. 🍽️ the meal: name it, carbs g, sugar g, calories — comment if sugar-heavy
   (fast spike) or balanced.
2. 🩸 current glucose vs their target range; mention the trend (rising/
   falling/stable) if known.
3. 💉 their insulin: which type they use; if insulin is still active (IOB),
   say how many units remain and WHY it must be deducted (stacking risk).
4. 🏃 recent sport: name it and explain the reduction + the delayed-hypo
   effect of exercise (can lower glucose for hours).
5. ✅ "why this dose": walk through the math SIMPLY with their real numbers
   (e.g. "62 g ÷ ratio 10 = 6.2 U; glucose 210 above target → +1.3 U;
   minus 1.5 U still active; −15% for sport → 5.5 U").

conclusion: 1-2 warm sentences recommending the final dose, ending with:
this is an AI estimate, not a final decision — confirm with your doctor.
warnings: short strings, one per real risk (hypo, falling glucose, very
high glucose, sugar spike, delayed sport hypo, missing profile ratios).
Empty array if none. Everything in ${langName}. Numbers must match the
ENGINE RESULT exactly — never invent different numbers.`
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
  exactly one type → use it silently; several → ask which one.
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

    const profileContext = profile
      ? `User context: diabetes type ${profile.diabetes_type}; target glucose ${profile.target_low}-${profile.target_high} mg/dL; carb ratio ${profile.carb_ratio ?? 'unknown'}; correction factor ${profile.correction_factor ?? 'unknown'}.`
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
- Insulin education is allowed and encouraged: explain how rapid/long
  insulin works, what the patient's own carb ratio and correction factor
  mean in practice, typical injection timing. You may show educational
  example calculations using THEIR ratios (clearly labelled as examples)
  — but never impose a new dose as a prescription.
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
