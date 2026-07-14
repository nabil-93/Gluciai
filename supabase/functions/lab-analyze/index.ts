// Supabase Edge Function: lab (blood test) report analysis with Gemini.
//
// Four tasks, all called from the /labs screen:
//   extract — read a photographed lab report, return every biological value
//             with its reference range, status and category (JSON).
//   report  — patient-friendly full medical report from the values.
//   voice   — short SPOKEN doctor-style explanation (plain text for TTS).
//   value   — detailed explanation of ONE value the patient tapped.
//
// Deploy:  supabase functions deploy lab-analyze
// Secrets: GEMINI_API_KEY (shared with the other functions)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { callerUserId, flashCost, logUsage } from '../_shared/usage.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_CHAT_MODEL') ?? 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  en: 'English',
};

interface LabValue {
  label: string;
  value: string;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  status: 'ok' | 'warn' | 'danger';
  category: string;
}

/** "- Hémoglobine: 11.2 g/dL [norme: 13 – 17 g/dL]" lines for prompts. */
function fmtValues(vals: LabValue[]): string {
  return vals
    .map(
      (v) =>
        `- ${v.label}: ${v.value} ${v.unit} [ref: ${v.refMin ?? '?'} – ${v.refMax ?? '?'} ${v.unit}] (${v.status})`
    )
    .join('\n');
}

async function gemini(
  body: Record<string, unknown>
): Promise<{ text: string; usage: any } | { error: string }> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!r.ok) return { error: `AI provider error (${r.status}): ${await r.text()}` };
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim();
  return { text, usage: data.usageMetadata ?? {} };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      task = 'extract',
      image_base64 = null,
      values = [],
      value = null,
      patientName = '',
      patientContext = '',
      summary = '',
      reportDate = null,
      language = 'fr',
    } = await req.json();

    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }
    const langName = LANGUAGE_NAMES[language] ?? 'French';

    /* ─────────────────────────── EXTRACT ─────────────────────────── */
    if (task === 'extract') {
      if (!image_base64) return json({ error: 'image_base64 required' }, 400);

      const prompt = `You are a medical-biology expert assistant.
Analyze this photo of a laboratory (blood test) report and extract EVERY
numeric value present.

Return ONLY a valid JSON object, no markdown fences, with this exact shape:
{
  "values": [
    {
      "label": "test name in ${langName}, short (e.g. "Hémoglobine", "CRP")",
      "value": "numeric value as printed (string, e.g. "15.2")",
      "unit": "unit (e.g. "g/dL", "mg/L", "/mm³")",
      "refMin": number or null,
      "refMax": number or null,
      "status": "ok" | "warn" | "danger",
      "category": "group in ${langName} (e.g. blood count, kidney panel, liver panel, lipid panel, glycemia...)"
    }
  ],
  "summary": "one short sentence in ${langName} summarizing the report",
  "reportDate": "YYYY-MM-DD or null",
  "labName": "laboratory name or null"
}

Rules:
- status: "ok" when inside the reference range; "warn" when slightly out;
  "danger" when far out of range or flagged H/L/critical on the report.
- Use the reference ranges PRINTED on the report when visible; otherwise
  standard adult ranges, and set refMin/refMax to null when truly unknown.
- Glycemia, HbA1c and kidney values matter especially: this patient is
  diabetic.
- Extract ALL values, even the normal ones. If the photo contains no lab
  values, return {"values": [], "summary": "", "reportDate": null, "labName": null}.`;

      const res = await gemini({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: image_base64 } },
            ],
          },
        ],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          maxOutputTokens: 4000,
          temperature: 0.1,
        },
      });
      if ('error' in res) return json({ error: res.error }, 502);

      let parsed: any = null;
      try {
        parsed = JSON.parse(res.text);
      } catch {
        return json({ error: 'AI returned invalid JSON', raw: res.text }, 502);
      }
      const VALID = ['ok', 'warn', 'danger'];
      const clean: LabValue[] = (Array.isArray(parsed?.values) ? parsed.values : [])
        .filter((v: any) => v && typeof v.label === 'string' && v.label.trim())
        .map((v: any) => ({
          label: String(v.label).slice(0, 80),
          value: String(v.value ?? '').slice(0, 20),
          unit: String(v.unit ?? '').slice(0, 20),
          refMin: Number.isFinite(Number(v.refMin)) && v.refMin !== null ? Number(v.refMin) : null,
          refMax: Number.isFinite(Number(v.refMax)) && v.refMax !== null ? Number(v.refMax) : null,
          status: VALID.includes(v.status) ? v.status : 'ok',
          category: String(v.category ?? '').slice(0, 60) || 'Bilan',
        }));

      await logLab(req, res.usage);
      return json({
        result: {
          values: clean,
          summary: typeof parsed?.summary === 'string' ? parsed.summary : '',
          reportDate:
            typeof parsed?.reportDate === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(parsed.reportDate)
              ? parsed.reportDate
              : null,
          labName: typeof parsed?.labName === 'string' ? parsed.labName : null,
        },
      });
    }

    /* ─────────────────────────── REPORT ─────────────────────────── */
    if (task === 'report') {
      if (!Array.isArray(values) || !values.length)
        return json({ error: 'values required' }, 400);
      const vals = values as LabValue[];
      const danger = vals.filter((v) => v.status === 'danger');
      const warn = vals.filter((v) => v.status === 'warn');
      const ok = vals.filter((v) => v.status === 'ok');

      const prompt = `You are GlucoAI, a warm senior doctor explaining lab results to YOUR
DIABETIC PATIENT directly (address them with "you"; their name is
${patientName || 'unknown'}). Write in ${langName}.

PATIENT CONTEXT (from their diabetes app):
${patientContext || 'none'}

LAB REPORT ${reportDate ? `(dated ${reportDate})` : ''}:
${summary ? `Lab summary: ${summary}` : ''}
CRITICAL (${danger.length}):
${fmtValues(danger) || 'none'}
TO WATCH (${warn.length}):
${fmtValues(warn) || 'none'}
NORMAL (${ok.length}):
${fmtValues(ok) || 'none'}

Write a complete, structured, patient-friendly report with these sections
(use **bold** section titles exactly like shown, in ${langName}; simple
dashes for lists; NO tables, NO # headings):

**Résumé** — overall picture in 2-3 warm, honest sentences.
**Ce qui est bien** — the good values and what they mean for you.
**Ce qui doit être surveillé** — each warn/danger value: what it measures,
why yours is out of range, most likely causes, risks if ignored — simply
explained, no jargon.
**Lien avec votre diabète** — what these results mean specifically for
your diabetes management (glycemia, HbA1c, kidneys, lipids...).
**Conseils concrets** — practical, specific advice: food (what to eat MORE
and LESS, realistic portions), physical activity, hydration, sleep, and
what to KEEP doing and what to CHANGE.
**Prochaines étapes** — which values to recheck, when, and which points to
discuss with your doctor.

Section titles must be translated into ${langName}. End with ONE short
sentence reminding that this AI report never replaces their doctor.
Be precise with THEIR numbers, kind but honest.`;

      const res = await gemini({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 2200,
          temperature: 0.4,
        },
      });
      if ('error' in res) return json({ error: res.error }, 502);
      await logLab(req, res.usage);
      return json({ result: { report: res.text } });
    }

    /* ─────────────────────────── VOICE ─────────────────────────── */
    if (task === 'voice') {
      if (!Array.isArray(values) || !values.length)
        return json({ error: 'values required' }, 400);
      const vals = values as LabValue[];
      const abnormal = vals.filter((v) => v.status !== 'ok');

      const prompt = `You are GlucoAI, a warm caring doctor SPEAKING OUT LOUD to your diabetic
patient${patientName ? ` ${patientName}` : ''} about their lab results.
Write the exact words you would SAY, in ${langName} — this text goes
directly to text-to-speech.

PATIENT CONTEXT: ${patientContext || 'none'}
${summary ? `LAB SUMMARY: ${summary}` : ''}
ABNORMAL VALUES:
${fmtValues(abnormal) || 'none — everything is normal'}
NORMAL VALUES (count): ${vals.length - abnormal.length}

Rules for the spoken script:
- Plain flowing speech only: NO markdown, NO asterisks, NO lists, NO
  headings, NO emojis. Short natural sentences.
- Structure of the monologue: greet ${patientName ? 'them by first name' : 'them warmly'};
  say you've read their blood test; give the overall picture; explain each
  abnormal value very simply (what it is, what their number means); then
  give honest practical advice — what is good and they should KEEP doing,
  and what they must CHANGE (food, activity, habits), like "this is not
  great, change this" or "keep going like this, it's working";
  reassure without lying.
- Mention their diabetes where relevant.
- 150 to 220 words maximum — about 90 seconds of speech.
- End by saying they can now ask you any question by chat or by call, and
  one short reminder that their doctor has the final word.`;

      const res = await gemini({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 700,
          temperature: 0.5,
        },
      });
      if ('error' in res) return json({ error: res.error }, 502);
      await logLab(req, res.usage);
      return json({ result: { script: res.text } });
    }

    /* ─────────────────────────── VALUE ─────────────────────────── */
    if (task === 'value') {
      if (!value || typeof value !== 'object')
        return json({ error: 'value required' }, 400);
      const v = value as LabValue;

      const prompt = `You are GlucoAI, a doctor explaining ONE lab value to your diabetic
patient${patientName ? ` ${patientName}` : ''} (address them with "you").
Write in ${langName}.

**Value:** ${v.label}
**Result:** ${v.value} ${v.unit}
**Reference range:** ${v.refMin ?? '?'} – ${v.refMax ?? '?'} ${v.unit}
**Status:** ${v.status}
PATIENT CONTEXT: ${patientContext || 'none'}

Give a structured answer with these **bold** section titles translated to
${langName} (no # headings, no tables):

**What does this test measure?** — simple explanation of its role in the body.
**Your result** — why your number is ${v.status === 'ok' ? 'normal (reassure them)' : 'out of range, precise interpretation'}.
${v.status !== 'ok' ? `**Possible causes** — the most frequent ones, simply.
**Risks** — what can happen if it is not handled, honestly but calmly.` : ''}
**Advice** — concrete instructions: food, activity, habits, warning signs,
when to see the doctor. Tie it to their diabetes when relevant.

Short, warm, no jargon. End with one line: this is AI guidance, the doctor
decides.`;

      const res = await gemini({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 900,
          temperature: 0.4,
        },
      });
      if ('error' in res) return json({ error: res.error }, 502);
      await logLab(req, res.usage);
      return json({ result: { explanation: res.text } });
    }

    return json({ error: `unknown task: ${task}` }, 400);
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});

/** Best-effort ai_usage row for a lab call. */
async function logLab(req: Request, um: any) {
  try {
    const inTok = um.promptTokenCount ?? 0;
    const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
    const uid = await callerUserId(req);
    if (uid && (inTok || outTok)) {
      await logUsage({
        user_id: uid,
        kind: 'lab',
        model: MODEL,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: flashCost(inTok, outTok),
      });
    }
  } catch {
    // logging only
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
