// Supabase Edge Function: diabetes education chat assistant (Gemini).
// Deploy: supabase functions deploy ai-chat
// Secrets: supabase secrets set GEMINI_API_KEY=... (shared with analyze-meal)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { callerUserId, flashCost, logUsage } from '../_shared/usage.ts';

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
    } = await req.json();
    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
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
          ? `You are GlucoAI, a warm diabetes assistant. The app just computed an
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
          : `You are GlucoAI's safety checker. The app recommended
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
      const uid = await callerUserId(req);
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
      const loggerPrompt = `You are GlucoAI's logging assistant. The patient TELLS you what they
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
{"type":"meal","name":"short dish name","portion":"e.g. 1 assiette","calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N,"glycemic_index":N,"meal_type":"breakfast"|"lunch"|"dinner"|"snack","minutes_ago":N?}
{"type":"activity","kind":"walk"|"run"|"bike"|"gym"|"other","duration_min":N,"intensity":"low"|"medium"|"high","minutes_ago":N?}
{"type":"measure","kind":"weight"|"hba1c","value":N,"unit":"kg"|"%","minutes_ago":N?}
{"type":"reminder","message":"short text of what to do, in ${langName}","due_in_minutes":N,"follow_kind":"insulin"|"glucose"|"meal"|"activity"|"measure"|"other"}
{"type":"note","text":"short description of what happened, in ${langName}","minutes_ago":N?}

Rules:
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
- MEAL MOMENT: for a meal, always set meal_type (breakfast/lunch/dinner/
  snack). If the patient said which meal ("f l3cha", "au petit-déjeuner",
  "ghda") use it. If NOT clear, keep action:null for now and ASK which
  meal it was ("C'était pour le petit-déjeuner, le déjeuner ou le dîner ?")
  — only produce the meal action once you know the moment.
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
  patient used (if they wrote/spoke in Darija, reply in Darija; Arabic →
  Arabic; French → French; otherwise use ${langName}). With an action,
  recap what you understood (with the numbers, mark meal nutrition as
  approximate) and invite them to confirm below. NEVER claim it is already
  saved.`;

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
      const VALID_TYPES = ['insulin', 'glucose', 'meal', 'activity', 'measure', 'reminder', 'note'];
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
      const uid = await callerUserId(req);
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
          reply: parsed.reply,
          action,
          transcript:
            typeof (parsed as { transcript?: unknown }).transcript === 'string'
              ? (parsed as { transcript: string }).transcript
              : '',
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

    const systemPrompt = `You are GlucoAI, the patient's personal diabetes assistant inside the GlucoAI app.

LANGUAGE RULES (critical):
- ${langName} is only the DEFAULT (the language the patient picked in the
  app) — use it until the patient shows you which language they prefer.
- AUTOMATICALLY DETECT the language or dialect the patient is actually
  writing or speaking — French, German, English, Arabic, or MOROCCAN DARIJA
  (often written in Latin letters with numbers, e.g. "chno ban lik", "3lach",
  "wach", "dyali", "bghit", "makla") — and REPLY IN THAT SAME language/
  dialect. If they write in Darija, answer in Darija; Arabic → Arabic;
  French → French; and switch with them if they change language mid-chat.
  Mirror the patient. You understand ALL of them perfectly. NEVER say you
  don't understand and NEVER ask them to reformulate in another language.

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
  ("I took 6 units", "remind me in 1 hour to take my insulin") — a green
  confirmation card appears in the chat right under your answer. NEVER
  say you can't log entries or set reminders; instead tell the patient
  to confirm the card shown below your message.
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
            maxOutputTokens: mode === 'voice' ? 500 : 1500,
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
      try {
        const parsed = JSON.parse(rawText);
        reply = typeof parsed.reply === 'string' ? parsed.reply : rawText;
        transcript = typeof parsed.transcript === 'string' ? parsed.transcript : '';
      } catch {
        reply = rawText; // model didn't wrap in JSON — use the text as-is
      }
    }
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
    const uid = await callerUserId(req);
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
